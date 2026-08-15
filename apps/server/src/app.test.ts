import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AiGateway } from './ai/client';
import { RoomAiKeyStore } from './ai/room-key-store';
import { VerificationCodeStore } from './ai/verification-code-store';
import { decryptWechatMessage, encryptWechatMessage, wechatMsgSignature, xmlField } from './wechat/wechat';

const AES_KEY = '1o1U9cHtJs0s838MKDgqN8vQcbN6CIce4ThdGWOfaWn';
const AES_APP_ID = 'wx-test-app';

const config = { games: 1, debateMinutes: 5 } as const;
const command = (index: number, expectedVersion: number) => ({ commandId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, expectedVersion });
const cookie = (response: { cookies: Array<{ name: string; value: string }> }) => response.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
const wechatSignature = (token: string, timestamp: string, nonce: string) => createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');
const wechatXml = (content: string) => `<xml><ToUserName><![CDATA[gh_x]]></ToUserName><FromUserName><![CDATA[openid-1]]></FromUserName><CreateTime>1700000000</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${content}]]></Content></xml>`;
const stubGateway = (): AiGateway => ({
  decideRound: async () => ({ winnerSeat: 'b', conductorMessage: '这轮乙方说得更实在，我判乙方赢。', debateSummary: '甲方质疑价值，乙方强调救人事实。', winningSummary: '他保护过无辜者。', fallback: false }),
  decideTrack: async () => ({ crushedSeat: 'b', survivor: 'a', reason: '甲轨胜出', speech: '我看了两条轨，甲这边的人更站得住，乙那边只能被压过去。', decisiveFactors: ['事实'], fallback: false }),
  judgeMatch: async () => ({ title: '审判', stanzas: [
    { kind: 'opening', lines: ['列车进入黑夜，', '两条轨道等待裁决。'] },
    { kind: 'player-a', lines: ['甲方留下辩词，', '为自己的轨道呼吸。'] },
    { kind: 'player-b', lines: ['乙方留下辩词，', '也为自己的轨道呼吸。'] },
    { kind: 'tracks', lines: ['人物留在甲轨，', '人物也留在乙轨。'] },
    { kind: 'verdict', lines: ['列车长拉下拉杆，', '一条轨道迎来车轮。'] },
  ], fallback: false }),
});

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
    expect(aiKeys.get(response.json().roomCode)).toEqual({ provider: 'user', apiKey: 'room-secret' });
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
      decideTrack: async () => ({ crushedSeat: 'b', survivor: 'a', reason: '甲轨胜出', speech: '我看了两条轨，甲这边的人更站得住，乙那边只能被压过去。', decisiveFactors: ['事实'], fallback: false }),
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

  it('answers the WeChat server verification with the echostr', async () => {
    const wechatToken = 'test-wechat-token';
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', wechatToken }); apps.push(app);
    const timestamp = '1700000000';
    const nonce = 'nonce-1';
    const signature = wechatSignature(wechatToken, timestamp, nonce);

    const response = await app.inject({ method: 'GET', url: `/api/wechat/event?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=hello` });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('hello');
  });

  it('rejects WeChat event requests with an invalid signature', async () => {
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', wechatToken: 'test-wechat-token' }); apps.push(app);

    const get = await app.inject({ method: 'GET', url: '/api/wechat/event?signature=bad&timestamp=1&nonce=2&echostr=hi' });
    const post = await app.inject({ method: 'POST', url: '/api/wechat/event?signature=bad&timestamp=1&nonce=2', headers: { 'content-type': 'text/xml' }, payload: '<xml/>' });

    expect(get.statusCode).toBe(401);
    expect(post.statusCode).toBe(401);
  });

  it('verifies the WeChat URL in encrypted mode by decrypting the echostr', async () => {
    const wechatToken = 'test-wechat-token';
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', wechatToken, wechatEncodingAesKey: AES_KEY, wechatAppId: AES_APP_ID }); apps.push(app);
    const timestamp = '1700000000';
    const nonce = 'nonce-1';
    const echostr = 'hello-encrypted';
    const encrypted = encryptWechatMessage(echostr, AES_KEY, AES_APP_ID);
    const signature = wechatMsgSignature(wechatToken, timestamp, nonce, encrypted);

    const response = await app.inject({ method: 'GET', url: `/api/wechat/event?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(encrypted)}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(echostr);
  });

  it('accepts an encrypted WeChat message and replies with an encrypted verification code', async () => {
    const wechatToken = 'test-wechat-token';
    const verificationCodes = new VerificationCodeStore();
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', wechatToken, wechatEncodingAesKey: AES_KEY, wechatAppId: AES_APP_ID, verificationCodes }); apps.push(app);
    const timestamp = '1700000000';
    const nonce = 'nonce-1';
    const innerXml = '<xml><ToUserName><![CDATA[gh_x]]></ToUserName><FromUserName><![CDATA[openid-1]]></FromUserName><CreateTime>1700000000</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[验证码]]></Content></xml>';
    const encrypted = encryptWechatMessage(innerXml, AES_KEY, AES_APP_ID);
    const signature = wechatMsgSignature(wechatToken, timestamp, nonce, encrypted);

    const event = await app.inject({
      method: 'POST',
      url: `/api/wechat/event?msg_signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`,
      headers: { 'content-type': 'text/xml' },
      payload: `<xml><ToUserName><![CDATA[gh_x]]></ToUserName><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`,
    });

    expect(event.statusCode).toBe(200);
    const replyXml = decryptWechatMessage(xmlField(event.body, 'Encrypt'), AES_KEY, AES_APP_ID);
    expect(replyXml.match(/在线网站验证码为：(\d{6})/)?.[1]).toMatch(/^\d{6}$/);
    expect(verificationCodes.size).toBe(1);
  });

  it('pushes a verification code via template message when the menu button is clicked', async () => {
    const sentBodies: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/cgi-bin/token')) return new Response(JSON.stringify({ access_token: 'token-1', expires_in: 7200 }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/message/template/send')) {
        sentBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error('unexpected ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const verificationCodes = new VerificationCodeStore();
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', wechatToken: 'test-wechat-token', wechatAppId: 'wx-test', wechatAppSecret: 'secret-test', wechatTemplateId: 'tmpl-1', verificationCodes }); apps.push(app);
    const timestamp = '1700000000';
    const nonce = 'nonce-1';
    const signature = wechatSignature('test-wechat-token', timestamp, nonce);
    const clickXml = '<xml><ToUserName><![CDATA[gh_x]]></ToUserName><FromUserName><![CDATA[openid-1]]></FromUserName><CreateTime>1700000000</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[CLICK]]></Event><EventKey><![CDATA[LOGIN]]></EventKey></xml>';

    const response = await app.inject({ method: 'POST', url: `/api/wechat/event?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`, headers: { 'content-type': 'text/xml' }, payload: clickXml });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('success');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(verificationCodes.size).toBe(1);
    expect(sentBodies[0]).toMatchObject({ touser: 'openid-1', template_id: 'tmpl-1' });
  });

  it('pushes a verification code via template message when a new user subscribes', async () => {
    const sentBodies: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/cgi-bin/token')) return new Response(JSON.stringify({ access_token: 'token-1', expires_in: 7200 }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/message/template/send')) {
        sentBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error('unexpected ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const verificationCodes = new VerificationCodeStore();
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', wechatToken: 'test-wechat-token', wechatAppId: 'wx-test', wechatAppSecret: 'secret-test', wechatTemplateId: 'tmpl-1', verificationCodes }); apps.push(app);
    const timestamp = '1700000000';
    const nonce = 'nonce-1';
    const signature = wechatSignature('test-wechat-token', timestamp, nonce);
    const subscribeXml = '<xml><ToUserName><![CDATA[gh_x]]></ToUserName><FromUserName><![CDATA[openid-2]]></FromUserName><CreateTime>1700000000</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[subscribe]]></Event></xml>';

    const response = await app.inject({ method: 'POST', url: `/api/wechat/event?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`, headers: { 'content-type': 'text/xml' }, payload: subscribeXml });
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(verificationCodes.size).toBe(1);
    expect(sentBodies[0]).toMatchObject({ touser: 'openid-2', template_id: 'tmpl-1' });
  });

  it('issues a free token after a WeChat verification code and creates an agnes-backed room', async () => {
    const wechatToken = 'test-wechat-token';
    const aiKeys = new RoomAiKeyStore();
    const verificationCodes = new VerificationCodeStore();
    const app = await buildApp({
      databasePath: ':memory:',
      sessionSecret: '12345678901234567890123456789012',
      wechatToken,
      aiKeys,
      verificationCodes,
      agnesGatewayFactory: () => stubGateway(),
    }); apps.push(app);
    const timestamp = '1700000000';
    const nonce = 'nonce-1';
    const signature = wechatSignature(wechatToken, timestamp, nonce);
    const eventUrl = `/api/wechat/event?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`;

    const unrelated = await app.inject({ method: 'POST', url: eventUrl, headers: { 'content-type': 'text/xml' }, payload: wechatXml('随便聊聊') });
    expect(unrelated.statusCode).toBe(200);
    expect(unrelated.body).toBe('success');
    expect(verificationCodes.size).toBe(0);

    const event = await app.inject({ method: 'POST', url: eventUrl, headers: { 'content-type': 'text/xml' }, payload: wechatXml('验证码') });
    expect(event.statusCode).toBe(200);
    const code = event.body.match(/在线网站验证码为：(\d{6})/)?.[1];
    expect(code).toMatch(/^\d{6}$/);
    expect(verificationCodes.size).toBe(1);

    const verify = await app.inject({ method: 'POST', url: '/api/ai/free-token', payload: { code } });
    expect(verify.statusCode).toBe(200);
    const verifyCookie = cookie(verify);
    const reuse = await app.inject({ method: 'POST', url: '/api/ai/free-token', payload: { code } });
    expect(reuse.statusCode).toBe(400);

    const created = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: verifyCookie }, payload: { nickname: '甲方', config, freeToken: true } });
    expect(created.statusCode).toBe(201);
    expect(aiKeys.get(created.json().roomCode as string)).toEqual({ provider: 'agnes' });
  });

  it('rejects free-token rooms without a grant, invalid codes, and missing credentials', async () => {
    const app = await buildApp({ databasePath: ':memory:', sessionSecret: '12345678901234567890123456789012', wechatToken: 'test-wechat-token' }); apps.push(app);

    const noGrant = await app.inject({ method: 'POST', url: '/api/rooms', payload: { nickname: '甲方', config, freeToken: true } });
    expect(noGrant.statusCode).toBe(403);

    const noCredential = await app.inject({ method: 'POST', url: '/api/rooms', payload: { nickname: '甲方', config } });
    expect(noCredential.statusCode).toBe(400);

    const invalidCode = await app.inject({ method: 'POST', url: '/api/ai/free-token', payload: { code: '123456' } });
    expect(invalidCode.statusCode).toBe(400);

    const shortCode = await app.inject({ method: 'POST', url: '/api/ai/free-token', payload: { code: '123' } });
    expect(shortCode.statusCode).toBe(400);
  });
});
