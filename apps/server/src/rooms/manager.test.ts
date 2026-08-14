import { describe, expect, it } from 'vitest';
import type { PhilosophyJudgment, RoundVerdict, TrackVerdict } from '@ydi/contracts';
import { catalog } from '../content/catalog';
import { GameStore } from '../persistence/store';
import { RoomManager } from './manager';

const config = { games: 1, selectionSeconds: 20, traitSeconds: 20, speechSeconds: 30, disconnectSeconds: 60 };
const roundVerdict: RoundVerdict = { winner: 'defense', reason: '防守事实更完整', winningArgument: '他仍有不可替代的价值', fallback: false };
const trackVerdict: TrackVerdict = { crushedSeat: 'b', survivor: 'a', reason: '甲轨整体更值得保留', decisiveFactors: ['三轮论据'], fallback: false };
const judgment: PhilosophyJudgment = { title: '最后的道岔', summary: '生命被迫成为比较题。', playerA: '甲方把功绩当筹码。', playerB: '乙方把悔恨当赎金。', conductorCritique: '列车长把偏见包装成秩序。', questions: ['功绩能抵罪吗？', '谁有资格定价？'], fallback: false };

async function startRoom(rooms: RoomManager, games: 1 | 3 | 5 = 1) {
  const created = await rooms.create('p1', '甲方', { ...config, games });
  await rooms.join(created.roomCode, 'p2', '乙方');
  await rooms.ready(created.roomCode, 'p1');
  await rooms.ready(created.roomCode, 'p2');
  await rooms.start(created.roomCode, 'p1');
  return created.roomCode;
}

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

  it('stores both original speeches, accepts only the active roles, and appends only the winning argument', async () => {
    const store = new GameStore(':memory:');
    const rooms = new RoomManager(store, () => 0);
    const code = await startRoom(rooms);
    await prepareDebate(rooms, code);
    let room = rooms.get(code);
    const targetId = room.automaticCharacters.b!;

    await expect(rooms.submitAttack(code, 'p2', room.version, targetId, '越权攻击')).rejects.toThrow('attack unavailable');
    await rooms.submitAttack(code, 'p1', room.version, targetId, '他不值得活');
    room = rooms.get(code);
    await expect(rooms.submitDefense(code, 'p1', room.version, '越权防守')).rejects.toThrow('defense unavailable');
    await rooms.submitDefense(code, 'p2', room.version, '他救过更多人');
    room = rooms.get(code);
    expect(room.phase).toBe('round-adjudicating');
    await rooms.resolveRound(code, room.version, roundVerdict);

    room = rooms.get(code);
    expect(room.roundRecords[0]).toMatchObject({ attack: { text: '他不值得活' }, defense: { text: '他救过更多人' }, verdict: roundVerdict });
    expect(room.arguments[targetId]).toEqual([{ kind: 'defense', text: roundVerdict.winningArgument }]);
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
      const defenderId = room.roundAttacker === 'a' ? 'p2' : 'p1';
      const defenderSeat = room.roundAttacker === 'a' ? 'b' : 'a';
      await rooms.submitAttack(code, attackerId, room.version, room.automaticCharacters[defenderSeat]!, `攻击${round}`);
      room = rooms.get(code);
      await rooms.submitDefense(code, defenderId, room.version, `防守${round}`);
      room = rooms.get(code);
      await rooms.resolveRound(code, room.version, roundVerdict);
      room = rooms.get(code);
      await rooms.advanceAfterRound(code, room.version);
      room = rooms.get(code);
      expect(room.selections).toEqual(fixedSelections);
      expect(room.automaticCharacters).toEqual(fixedAutomaticCharacters);
      if (round < 3) expect(room.phase).toBe('attack-input');
    }

    expect(attackers).toEqual(['a', 'b', 'a']);
    expect(rooms.get(code)).toMatchObject({ phase: 'track-adjudicating', roundRecords: { length: 3 } });
    expect(rooms.get(code).roundRecords.flatMap((round) => [round.attack, round.defense])).toHaveLength(6);
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
    expect(rooms.get(code).phase).toBe('attack-input');
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
});
