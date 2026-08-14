import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AiGateway } from './ai/client';
import { RoomAiKeyStore } from './ai/room-key-store';

const config = { games: 1, timingMode: 'timed', selectionSeconds: 180, traitSeconds: 180, debateMinutes: 5 } as const;
const command = (index: number, expectedVersion: number) => ({ commandId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, expectedVersion });
const cookie = (response: { cookies: Array<{ name: string; value: string }> }) => response.cookies.map((item) => `${item.name}=${item.value}`).join('; ');

describe('HTTP app', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

  it('reports liveness and catalog readiness', async () => {
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012' }); apps.push(app);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ ok: true, catalog: true });
  });

  it('creates a player session and room without registration', async () => {
    const aiKeys = new RoomAiKeyStore();
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', aiKeys }); apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/rooms', payload: { nickname: '甲方', config, apiKey: 'room-secret' } });
    expect(response.statusCode).toBe(201); expect(response.cookies.some((cookie) => cookie.name === 'ydi_session')).toBe(true); expect(response.json().roomCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(aiKeys.get(response.json().roomCode)).toBe('room-secret');
    expect(JSON.stringify(app.rooms.get(response.json().roomCode))).not.toContain('room-secret');
  });

  it('tests a DeepSeek key before room creation without echoing it', async () => {
    const tested: string[] = [];
    const app = await buildApp({
      databasePath: ':memory:',
      sessionSecret: '12345678901234567890123456789012',
      testDeepSeekKey: async (apiKey) => { tested.push(apiKey); if (apiKey === 'bad-key') throw new Error('DeepSeek authentication failed'); return { ok: true }; },
    }); apps.push(app);

    const success = await app.inject({ method: 'POST', url: '/api/ai/test-key', payload: { apiKey: 'good-key' } });
    const failure = await app.inject({ method: 'POST', url: '/api/ai/test-key', payload: { apiKey: 'bad-key' } });
    expect(success.statusCode).toBe(200);
    expect(success.json()).toEqual({ ok: true });
    expect(failure.statusCode).toBe(409);
    expect(tested).toEqual(['good-key', 'bad-key']);
    expect(failure.body).not.toContain('bad-key');
  });

  it('serves the built web entry from an explicit production root', async () => {
    const webRoot = await mkdtemp(join(tmpdir(), 'ydi-web-')); await mkdir(join(webRoot, 'assets')); await writeFile(join(webRoot, 'index.html'), '<main id="root">game</main>'); await writeFile(join(webRoot, 'assets', 'app.js'), 'document.body.dataset.ready = "true";');
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', webRoot }); apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/' }); expect(response.statusCode).toBe(200); expect(response.body).toContain('id="root"');
    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(asset.headers['content-type']).toContain('javascript');
    expect(asset.body).toContain('dataset.ready');
  });

  it('returns room configuration validation errors as 400 when the production web root is enabled', async () => {
    const webRoot = await mkdtemp(join(tmpdir(), 'ydi-web-'));
    await writeFile(join(webRoot, 'index.html'), '<main id="root">game</main>');
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', webRoot }); apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        nickname: '甲方',
        apiKey: 'room-secret',
        config: { ...config, debateMinutes: 11 },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('聊天室时长必须是 3 到 10 分钟的整数');
  });

  it('accepts concurrent chat messages and adjudicates the frozen room after its deadline', async () => {
    let roundCalls = 0;
    const aiGateway: AiGateway = {
      decideRound: async () => { roundCalls++; return { winnerSeat: 'b', conductorMessage: '这轮乙方说得更实在，我判乙方赢。', debateSummary: '甲方质疑价值，乙方强调救人事实。', winningSummary: '他保护过无辜者。', fallback: false }; },
      decideTrack: async () => ({ crushedSeat: 'b', survivor: 'a', reason: '甲轨胜出', decisiveFactors: ['事实'], fallback: false }),
      judgeMatch: async () => ({ title: '审判', stanzas: [
        { kind: 'opening', lines: ['列车进入黑夜，', '两条轨道等待裁决。'] },
        { kind: 'player-a', lines: ['甲方留下辩词，', '为自己的轨道呼吸。'] },
        { kind: 'player-b', lines: ['乙方留下辩词，', '也为自己的轨道呼吸。'] },
        { kind: 'tracks', lines: ['人物留在甲轨，', '人物也留在乙轨。'] },
        { kind: 'verdict', lines: ['列车长拉下拉杆，', '一条轨道迎来车轮。'] },
      ], fallback: false }),
    };
    const usedKeys: string[] = [];
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', aiGatewayFactory: (apiKey) => { usedKeys.push(apiKey); return aiGateway; } }); apps.push(app);
    const created = await app.inject({ method: 'POST', url: '/api/rooms', payload: { nickname: '甲方', config, apiKey: 'round-room-key' } });
    const code = created.json().roomCode as string;
    const aCookie = cookie(created);
    const bSession = await app.inject({ method: 'GET', url: '/api/session' });
    const bCookie = cookie(bSession);
    await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { cookie: bCookie }, payload: { nickname: '乙方', roomCode: code } });
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/ready`, headers: { cookie: aCookie } });
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/ready`, headers: { cookie: bCookie } });
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/start`, headers: { cookie: aCookie } });
    let room = app.rooms.get(code);
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/select`, headers: { cookie: aCookie }, payload: { ...command(1, room.version), characterIds: room.hands.a!.characters.slice(0, 2).map((card) => card.id) } });
    room = app.rooms.get(code);
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/select`, headers: { cookie: bCookie }, payload: { ...command(2, room.version), characterIds: room.hands.b!.characters.slice(0, 2).map((card) => card.id) } });
    room = app.rooms.get(code);
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/traits-done`, headers: { cookie: aCookie }, payload: command(3, room.version) });
    room = app.rooms.get(code);
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/traits-done`, headers: { cookie: bCookie }, payload: command(4, room.version) });
    room = app.rooms.get(code);
    const attackerCookie = room.roundAttacker === 'a' ? aCookie : bCookie;
    const defenderSeat = room.roundAttacker === 'a' ? 'b' : 'a';
    const defenderCookie = room.roundAttacker === 'a' ? bCookie : aCookie;
    const rejected = await app.inject({ method: 'POST', url: `/api/rooms/${code}/debate-target`, headers: { cookie: defenderCookie }, payload: { ...command(5, room.version), targetId: room.automaticCharacters[defenderSeat] } });
    expect(rejected.statusCode).toBe(409);
    const locked = await app.inject({ method: 'POST', url: `/api/rooms/${code}/debate-target`, headers: { cookie: attackerCookie }, payload: { ...command(6, room.version), targetId: room.automaticCharacters[defenderSeat] } });
    expect(locked.statusCode).toBe(200);

    const firstId = '10000000-0000-4000-8000-000000000001';
    const secondId = '10000000-0000-4000-8000-000000000002';
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/rooms/${code}/debate-messages`, headers: { cookie: attackerCookie }, payload: { messageId: firstId, text: '他不值得活' } }),
      app.inject({ method: 'POST', url: `/api/rooms/${code}/debate-messages`, headers: { cookie: defenderCookie }, payload: { messageId: secondId, text: '他保护过无辜者' } }),
    ]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const duplicate = await app.inject({ method: 'POST', url: `/api/rooms/${code}/debate-messages`, headers: { cookie: attackerCookie }, payload: { messageId: firstId, text: '重复消息' } });
    expect(duplicate.json().message.text).toBe('他不值得活');
    app.rooms.get(code).deadline = new Date(Date.now() - 1).toISOString();
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(roundCalls).toBe(1);
    expect(usedKeys).toEqual(['round-room-key']);
    expect(app.rooms.get(code)).toMatchObject({ phase: 'round-result', roundRecords: { length: 1 } });
  });

  it('deletes the room key when surrender ends the match', async () => {
    const aiKeys = new RoomAiKeyStore();
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', aiKeys }); apps.push(app);
    const created = await app.inject({ method: 'POST', url: '/api/rooms', payload: { nickname: '甲方', config, apiKey: 'temporary-room-key' } });
    const code = created.json().roomCode as string;
    const aCookie = cookie(created);
    const bSession = await app.inject({ method: 'GET', url: '/api/session' });
    const bCookie = cookie(bSession);
    await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { cookie: bCookie }, payload: { nickname: '乙方', roomCode: code } });
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/ready`, headers: { cookie: aCookie } });
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/ready`, headers: { cookie: bCookie } });
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/start`, headers: { cookie: aCookie } });
    const room = app.rooms.get(code);
    const response = await app.inject({ method: 'POST', url: `/api/rooms/${code}/surrender`, headers: { cookie: aCookie }, payload: command(99, room.version) });

    expect(response.statusCode).toBe(200);
    expect(app.rooms.get(code).phase).toBe('match-end');
    expect(aiKeys.has(code)).toBe(false);
  });

  it('deletes the room key after both players finish the final configured game', async () => {
    const aiKeys = new RoomAiKeyStore();
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', aiKeys }); apps.push(app);
    const created = await app.inject({ method: 'POST', url: '/api/rooms', payload: { nickname: '甲方', config, apiKey: 'final-game-key' } });
    const code = created.json().roomCode as string;
    const aCookie = cookie(created);
    const bSession = await app.inject({ method: 'GET', url: '/api/session' });
    const bCookie = cookie(bSession);
    await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { cookie: bCookie }, payload: { nickname: '乙方', roomCode: code } });
    app.rooms.get(code).phase = 'judgment';

    let room = app.rooms.get(code);
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/ready-next-game`, headers: { cookie: aCookie }, payload: command(100, room.version) });
    room = app.rooms.get(code);
    await app.inject({ method: 'POST', url: `/api/rooms/${code}/ready-next-game`, headers: { cookie: bCookie }, payload: command(101, room.version) });

    expect(app.rooms.get(code).phase).toBe('match-end');
    expect(aiKeys.has(code)).toBe(false);
  });
});
