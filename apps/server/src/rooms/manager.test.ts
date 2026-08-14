import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DebateRoundVerdict, GameConfig, PhilosophyJudgment, TrackVerdict } from '@ydi/contracts';
import { catalog } from '../content/catalog';
import { GameStore } from '../persistence/store';
import { RoomManager } from './manager';
import { migrateRoomSnapshot } from './types';

const config = { games: 1, timingMode: 'timed', selectionSeconds: 180, traitSeconds: 180, debateMinutes: 5 } satisfies GameConfig;
const roundVerdict: DebateRoundVerdict = { winnerSeat: 'b', conductorMessage: '这轮乙方更站得住，我判乙方赢。', debateSummary: '甲方攻击人物过去，乙方强调人物仍有价值。', winningSummary: '他仍有不可替代的价值。', fallback: false };
const trackVerdict: TrackVerdict = { crushedSeat: 'b', survivor: 'a', reason: '甲轨整体更值得保留', decisiveFactors: ['三轮论据'], fallback: false };
const judgment: PhilosophyJudgment = { title: '最后的道岔', stanzas: [
  { kind: 'opening', lines: ['列车切开夜色，', '名字等待称量。'] },
  { kind: 'player-a', lines: ['甲方高举功绩，', '也藏起恐惧。'] },
  { kind: 'player-b', lines: ['乙方追问偿还，', '替自己的轨道呼吸。'] },
  { kind: 'tracks', lines: ['医生留在甲轨，', '小偷伏在乙轨。'] },
  { kind: 'verdict', lines: ['列车长拉下拉杆，', '乙轨被车轮带走。'] },
], fallback: false };

async function startRoom(rooms: RoomManager, games: 1 | 3 | 5 = 1, overrides: Partial<GameConfig> = {}) {
  const created = await rooms.create('p1', '甲方', { ...config, games, ...overrides });
  await rooms.join(created.roomCode, 'p2', '乙方');
  await rooms.ready(created.roomCode, 'p1');
  await rooms.ready(created.roomCode, 'p2');
  await rooms.start(created.roomCode, 'p1');
  return created.roomCode;
}

describe('room timing and snapshot migration', () => {
  afterEach(() => vi.useRealTimers());

  it('uses 180 seconds for the default timed selecting phase', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T00:00:00.000Z'));
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const code = await startRoom(rooms);
    expect(rooms.get(code).deadline).toBe('2026-08-15T00:03:00.000Z');
    store.close();
  });

  it('leaves selecting and trait placement without deadlines in unlimited mode', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const code = await startRoom(rooms, 1, { timingMode: 'unlimited' });
    expect(rooms.get(code).deadline).toBeNull();

    let room = rooms.get(code);
    await rooms.select(code, 'p1', room.version, room.hands.a!.characters.slice(0, 2).map(({ id }) => id));
    room = rooms.get(code);
    await rooms.select(code, 'p2', room.version, room.hands.b!.characters.slice(0, 2).map(({ id }) => id));
    expect(rooms.get(code)).toMatchObject({ phase: 'traits', deadline: null });
    store.close();
  });

  it('adds current timing defaults to an old waiting-room snapshot', () => {
    const migrated = migrateRoomSnapshot({
      phase: 'waiting', deadline: null,
      config: { games: 1, selectionSeconds: 60, traitSeconds: 60, speechSeconds: 90, disconnectSeconds: 120 },
    } as never);
    expect(migrated.config).toEqual({ games: 1, timingMode: 'timed', selectionSeconds: 60, traitSeconds: 60, debateMinutes: 5 });
  });

  it('ends an active legacy attack room and requires a new game', () => {
    const migrated = migrateRoomSnapshot({ phase: 'attack-input', deadline: '2026-08-15T00:01:00.000Z', config } as never);
    expect(migrated.phase).toBe('match-end');
    expect(migrated.deadline).toBeNull();
    expect(migrated.finalResult?.reason).toContain('重新开局');
  });

  it('ends a room whose persisted judgment uses the retired report shape', () => {
    const migrated = migrateRoomSnapshot({
      phase: 'judgment',
      deadline: null,
      config,
      judgment: { title: '旧审判', summary: '旧版总结', playerA: '甲', playerB: '乙', conductorCritique: '列车长', questions: ['一', '二'], fallback: false },
      trackVerdict: { crushedSeat: 'b', survivor: 'a', reason: '旧裁决', decisiveFactors: ['旧证据'], fallback: false },
    } as never);
    expect(migrated.phase).toBe('match-end');
    expect(migrated.judgment).toBeNull();
    expect(migrated.finalResult).toMatchObject({ survivor: 'a', philosophy: '旧版总结' });
  });
});

async function prepareDebate(rooms: RoomManager, code: string) {
  let room = rooms.get(code);
  await rooms.select(code, 'p1', room.version, room.hands.a!.characters.filter((card) => !room.usedCharacters.a.includes(card.id)).slice(0, 2).map((card) => card.id));
  room = rooms.get(code);
  await rooms.select(code, 'p2', room.version, room.hands.b!.characters.filter((card) => !room.usedCharacters.b.includes(card.id)).slice(0, 2).map((card) => card.id));
  room = rooms.get(code);
  await rooms.finishTraits(code, 'p1', room.version);
  room = rooms.get(code);
  await rooms.finishTraits(code, 'p2', room.version);
}

describe('authoritative three-round RoomManager', () => {
  it('randomizes the first attacker and deals one distinct automatic good character to each three-person rail', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0.8);
    const code = await startRoom(rooms);
    const room = rooms.get(code);

    expect(room.roundAttacker).toBe('b');
    expect(room.automaticCharacters.a).not.toBe(room.automaticCharacters.b);
    expect(catalog.characters.find((card) => card.id === room.automaticCharacters.a)?.alignment).toBe('good');
    expect(catalog.characters.find((card) => card.id === room.automaticCharacters.b)?.alignment).toBe('good');
    store.close();
  });

  it('locks the target for the attacker, orders concurrent messages, and appends only the winner summary', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const code = await startRoom(rooms);
    await prepareDebate(rooms, code);
    let room = rooms.get(code);
    const targetId = room.automaticCharacters.b!;

    const startedAt = new Date('2026-08-15T00:00:00.000Z');
    await expect(rooms.lockDebateTarget(code, 'p2', room.version, targetId, startedAt)).rejects.toThrow('target unavailable');
    await rooms.lockDebateTarget(code, 'p1', room.version, targetId, startedAt);
    expect(rooms.get(code).deadline).toBe('2026-08-15T00:05:00.000Z');

    const [attack, defense] = await Promise.all([
      rooms.appendDebateMessage(code, 'p1', 'attack-message', '他不值得活', new Date('2026-08-15T00:00:01.000Z')),
      rooms.appendDebateMessage(code, 'p2', 'defense-message', '他救过更多人', new Date('2026-08-15T00:00:01.000Z')),
    ]);
    expect(new Set([attack.sequence, defense.sequence]).size).toBe(2);
    const duplicate = await rooms.appendDebateMessage(code, 'p1', 'attack-message', '重复内容不会覆盖', new Date('2026-08-15T00:00:02.000Z'));
    expect(duplicate.text).toBe('他不值得活');
    expect(rooms.get(code).debateMessages).toHaveLength(2);

    const [event] = await rooms.tick(new Date('2026-08-15T00:05:00.000Z'));
    expect(event).toMatchObject({ type: 'round-adjudication', roomCode: code });
    await expect(rooms.appendDebateMessage(code, 'p1', 'late', '来迟了', new Date('2026-08-15T00:05:00.000Z'))).rejects.toThrow('chat unavailable');
    await rooms.resolveRound(code, event!.version, roundVerdict, new Date('2026-08-15T00:05:01.000Z'));

    room = rooms.get(code);
    expect(room.roundRecords[0]).toMatchObject({ messages: [{ text: '他不值得活' }, { text: '他救过更多人' }], verdict: roundVerdict });
    expect(room.arguments[targetId]).toEqual([{ kind: 'defense', text: roundVerdict.winningSummary }]);
    expect(rooms.getTrackDecisionInput(code).rounds[0]?.verdict.debateSummary).toBe(roundVerdict.debateSummary);
    store.close();
  });

  it('alternates attackers over exactly three rounds and then enters final track adjudication', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const code = await startRoom(rooms);
    const attackers: string[] = [];
    await prepareDebate(rooms, code);
    const fixedSelections = structuredClone(rooms.get(code).selections);
    const fixedAutomaticCharacters = structuredClone(rooms.get(code).automaticCharacters);

    for (let round = 1; round <= 3; round++) {
      let room = rooms.get(code);
      attackers.push(room.roundAttacker!);
      const attackerId = room.roundAttacker === 'a' ? 'p1' : 'p2';
      const defenderSeat = room.roundAttacker === 'a' ? 'b' : 'a';
      const startedAt = new Date(`2026-08-15T00:${String(round * 10).padStart(2, '0')}:00.000Z`);
      await rooms.lockDebateTarget(code, attackerId, room.version, room.automaticCharacters[defenderSeat]!, startedAt);
      await rooms.appendDebateMessage(code, 'p1', `a-${round}`, `甲方消息${round}`, new Date(startedAt.getTime() + 1000));
      await rooms.appendDebateMessage(code, 'p2', `b-${round}`, `乙方消息${round}`, new Date(startedAt.getTime() + 1000));
      const [event] = await rooms.tick(new Date(startedAt.getTime() + 300_000));
      await rooms.resolveRound(code, event!.version, roundVerdict, new Date(startedAt.getTime() + 301_000));
      const events = await rooms.tick(new Date(startedAt.getTime() + 306_000));
      room = rooms.get(code);
      expect(room.selections).toEqual(fixedSelections);
      expect(room.automaticCharacters).toEqual(fixedAutomaticCharacters);
      if (round < 3) expect(room.phase).toBe('target-selecting');
      else expect(events[0]).toMatchObject({ type: 'track-adjudication', roomCode: code });
    }

    expect(attackers).toEqual(['a', 'b', 'a']);
    expect(rooms.get(code)).toMatchObject({ phase: 'track-adjudicating', roundRecords: { length: 3 } });
    expect(rooms.get(code).roundRecords.flatMap((record) => record.messages)).toHaveLength(6);
    store.close();
  });

  it('deals one match hand and carries unused resources into later games', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const code = await startRoom(rooms, 3);
    let room = rooms.get(code);
    const initialHandIds = {
      aCharacters: room.hands.a!.characters.map(({ id }) => id),
      aTraits: room.hands.a!.traits.map(({ id }) => id),
      bCharacters: room.hands.b!.characters.map(({ id }) => id),
      bTraits: room.hands.b!.traits.map(({ id }) => id),
    };
    expect(room.hands.a!.characters.filter(({ alignment }) => alignment === 'good')).toHaveLength(3);
    expect(room.hands.a!.characters.filter(({ alignment }) => alignment === 'evil')).toHaveLength(3);
    expect(room.hands.a!.traits).toHaveLength(6);

    const aSelection = room.hands.a!.characters.slice(0, 2).map(({ id }) => id);
    await rooms.select(code, 'p1', room.version, aSelection);
    room = rooms.get(code);
    const bSelection = room.hands.b!.characters.slice(0, 2).map(({ id }) => id);
    await rooms.select(code, 'p2', room.version, bSelection);
    room = rooms.get(code);
    const usedTraitId = room.hands.a!.traits[0]!.id;
    await rooms.addTrait(code, 'p1', room.version, usedTraitId, room.automaticCharacters.a!);
    room = rooms.get(code);
    room.phase = 'track-adjudicating';
    await rooms.resolveTrack(code, room.version, trackVerdict);
    room = rooms.get(code);
    await rooms.saveJudgment(code, room.version, judgment);
    room = rooms.get(code);
    await rooms.readyNextGame(code, 'p1', room.version);
    room = rooms.get(code);
    await rooms.readyNextGame(code, 'p2', room.version);
    room = rooms.get(code);

    expect(room).toMatchObject({ game: 2, round: 1, phase: 'selecting' });
    expect(room.hands.a!.characters.map(({ id }) => id)).toEqual(initialHandIds.aCharacters);
    expect(room.hands.a!.traits.map(({ id }) => id)).toEqual(initialHandIds.aTraits);
    expect(room.hands.b!.characters.map(({ id }) => id)).toEqual(initialHandIds.bCharacters);
    expect(room.hands.b!.traits.map(({ id }) => id)).toEqual(initialHandIds.bTraits);
    expect(room.usedCharacters.a).toEqual(expect.arrayContaining(aSelection));
    expect(room.usedCharacters.b).toEqual(expect.arrayContaining(bSelection));
    expect(room.usedTraits.a).toContain(usedTraitId);
    expect(room.usedTraits.a).toHaveLength(1);
    store.close();
  });

  it('publishes only the opponent remaining good, evil, and trait counts', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const code = await startRoom(rooms, 3);
    expect(rooms.view(code, 'p1')).toMatchObject({ opponentRemaining: { good: 3, evil: 3, traits: 6 } });

    let room = rooms.get(code);
    await rooms.select(code, 'p1', room.version, [room.hands.a!.characters[0]!.id, room.hands.a!.characters[3]!.id]);
    room = rooms.get(code);
    await rooms.select(code, 'p2', room.version, [room.hands.b!.characters[0]!.id, room.hands.b!.characters[1]!.id]);
    room = rooms.get(code);
    await rooms.addTrait(code, 'p2', room.version, room.hands.b!.traits[0]!.id, room.automaticCharacters.b!);

    expect(rooms.view(code, 'p1')).toMatchObject({
      hand: { characters: { length: 4 }, traits: { length: 6 } },
      opponentRemaining: { good: 1, evil: 3, traits: 5 },
    });
    expect(Object.keys((rooms.view(code, 'p1') as unknown as { opponentRemaining: object }).opponentRemaining)).toEqual(['good', 'evil', 'traits']);
    store.close();
  });

  it('publishes each player trait confirmation state until both players advance', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const code = await startRoom(rooms);
    let room = rooms.get(code);
    await rooms.select(code, 'p1', room.version, room.hands.a!.characters.slice(0, 2).map(({ id }) => id));
    room = rooms.get(code);
    await rooms.select(code, 'p2', room.version, room.hands.b!.characters.slice(0, 2).map(({ id }) => id));
    room = rooms.get(code);
    await rooms.finishTraits(code, 'p1', room.version);

    expect(rooms.view(code, 'p1')).toMatchObject({ phase: 'traits', traitReadiness: { mine: true, opponent: false } });
    expect(rooms.view(code, 'p2')).toMatchObject({ phase: 'traits', traitReadiness: { mine: false, opponent: true } });
    room = rooms.get(code);
    await expect(rooms.addTrait(code, 'p1', room.version, room.hands.a!.traits[0]!.id, room.automaticCharacters.a!)).rejects.toThrow('traits unavailable');

    room = rooms.get(code);
    await rooms.finishTraits(code, 'p2', room.version);
    expect(rooms.get(code).phase).toBe('target-selecting');
    store.close();
  });

  it('scores the surviving track, shares judgment, and starts the next game only after both players are ready', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const code = await startRoom(rooms, 3);
    const room = rooms.get(code);
    room.phase = 'track-adjudicating';

    await rooms.resolveTrack(code, room.version, trackVerdict);
    let current = rooms.get(code);
    expect(current).toMatchObject({ phase: 'judgment-generating', scores: { a: 1, b: 0 } });
    await rooms.saveJudgment(code, current.version, judgment);
    current = rooms.get(code);
    expect(rooms.view(code, 'p1').judgment).toEqual(judgment);
    expect(current.finalResult?.philosophy).toBe(judgment.stanzas.flatMap((stanza) => stanza.lines).join('\n'));
    await rooms.readyNextGame(code, 'p1', current.version);
    current = rooms.get(code);
    expect(current.phase).toBe('judgment');
    await rooms.readyNextGame(code, 'p2', current.version);
    expect(rooms.get(code)).toMatchObject({ game: 2, round: 1, phase: 'selecting' });
    store.close();
  });

  it('awards the opponent and ends the whole match when a player surrenders', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const code = await startRoom(rooms);
    const room = rooms.get(code);
    await rooms.surrender(code, 'p1', room.version);
    expect(rooms.get(code)).toMatchObject({ phase: 'match-end', scores: { a: 0, b: 1 }, finalResult: { survivor: 'b' } });
    store.close();
  });

  it('only updates presence in waiting but immediately ends an active match on disconnect', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const waiting = await rooms.create('p1', '甲方', config);
    await rooms.join(waiting.roomCode, 'p2', '乙方');
    rooms.setConnected(waiting.roomCode, 'p2', false);
    expect(rooms.get(waiting.roomCode)).toMatchObject({ phase: 'waiting', players: [{ connected: true }, { connected: false }] });

    rooms.setConnected(waiting.roomCode, 'p2', true);
    await rooms.ready(waiting.roomCode, 'p1');
    await rooms.ready(waiting.roomCode, 'p2');
    await rooms.start(waiting.roomCode, 'p1');
    rooms.setConnected(waiting.roomCode, 'p2', false);
    expect(rooms.get(waiting.roomCode)).toMatchObject({ phase: 'match-end', scores: { a: 1, b: 0 }, finalResult: { survivor: 'a' } });
    rooms.setConnected(waiting.roomCode, 'p2', true);
    expect(rooms.get(waiting.roomCode).phase).toBe('match-end');
    store.close();
  });
});
