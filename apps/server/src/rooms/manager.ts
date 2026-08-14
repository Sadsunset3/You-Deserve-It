import { randomInt } from 'node:crypto';
import { customAlphabet } from 'nanoid';
import type {
  GameConfig,
  JudgmentInput,
  PublicCharacter,
  RoomView,
  RoundDecisionInput,
  RoundVerdict,
  Seat,
  SpeechRecord,
  TrackDecisionInput,
  TrackVerdict,
  PhilosophyJudgment,
} from '@ydi/contracts';
import { fallbackRoundVerdict } from '../ai/fallback.js';
import { catalog, dealHands, pickConductor } from '../content/catalog.js';
import type { GameStore } from '../persistence/store.js';
import { migrateRoomSnapshot, type Room } from './types.js';

const makeRoomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const secureRandom = () => randomInt(0, 1_000_000) / 1_000_000;
const otherSeat = (seat: Seat): Seat => seat === 'a' ? 'b' : 'a';

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly store: GameStore, private readonly random: () => number = secureRandom) {
    for (const snapshot of store.loadActive<Room>()) {
      const room = migrateRoomSnapshot(snapshot);
      this.rooms.set(room.roomCode, room);
      this.persist(room);
    }
  }

  async create(playerId: string, nickname: string, config: GameConfig) {
    const room: Room = {
      roomCode: makeRoomCode(), hostId: playerId, config,
      players: [{ playerId, nickname, seat: 'a', ready: false, connected: true }],
      phase: 'waiting', version: 1, round: 1, game: 1, conductorId: null, hands: {},
      selections: { a: [], b: [] }, automaticCharacters: { a: null, b: null },
      usedCharacters: { a: [], b: [] }, usedTraits: { a: [], b: [] }, traitsDone: { a: false, b: false },
      characterTraits: {}, arguments: {}, roundAttacker: null, currentTargetId: null,
      debateMessages: [], messageSequence: 0, roundVerdict: null,
      roundRecords: [], trackVerdict: null, judgment: null, nextGameReady: { a: false, b: false }, deadline: null,
      scores: { a: 0, b: 0 }, finalResult: null,
    };
    return this.persist(room);
  }

  async join(code: string, playerId: string, nickname: string) {
    return this.mutate(code, (room) => {
      if (room.players.length >= 2 && !room.players.some((player) => player.playerId === playerId)) throw new Error('room is full');
      if (!room.players.some((player) => player.playerId === playerId)) room.players.push({ playerId, nickname, seat: 'b', ready: false, connected: true });
    });
  }

  async ready(code: string, playerId: string) {
    return this.mutate(code, (room) => { this.player(room, playerId).ready = true; });
  }

  async start(code: string, playerId: string) {
    return this.mutate(code, (room) => {
      if (room.hostId !== playerId) throw new Error('only host can start');
      if (room.phase !== 'waiting') throw new Error('room already started');
      if (room.players.length !== 2 || room.players.some((player) => !player.ready)) throw new Error('both players must be ready');
      const [a, b] = dealHands(catalog, this.random, room.config.games);
      room.hands = { a, b };
      room.usedCharacters = { a: [], b: [] };
      room.usedTraits = { a: [], b: [] };
      this.startGame(room);
    });
  }

  async select(code: string, playerId: string, version: number, ids: string[]) {
    return this.command(code, playerId, version, (room, seat) => {
      if (room.phase !== 'selecting' || ids.length !== 2 || new Set(ids).size !== 2) throw new Error('invalid selection');
      const available = room.hands[seat]?.characters.filter((card) => !room.usedCharacters[seat].includes(card.id)).map((card) => card.id) ?? [];
      if (ids.some((id) => !available.includes(id))) throw new Error('invalid selection');
      room.selections[seat] = ids;
      room.usedCharacters[seat].push(...ids);
      if (room.selections.a.length === 2 && room.selections.b.length === 2) {
        room.phase = 'traits';
        room.deadline = this.phaseDeadline(room, room.config.traitSeconds);
      }
    });
  }

  async addTrait(code: string, playerId: string, version: number, traitId: string, targetId: string) {
    return this.command(code, playerId, version, (room, seat) => {
      if (room.phase !== 'traits' || room.traitsDone[seat]) throw new Error('traits unavailable');
      if (!room.hands[seat]?.traits.some((trait) => trait.id === traitId) || room.usedTraits[seat].includes(traitId)) throw new Error('trait unavailable');
      if (![...room.selections.a, ...room.selections.b, ...Object.values(room.automaticCharacters)].includes(targetId)) throw new Error('invalid target');
      room.usedTraits[seat].push(traitId);
      (room.characterTraits[targetId] ??= []).push(traitId);
    });
  }

  async finishTraits(code: string, playerId: string, version: number) {
    return this.command(code, playerId, version, (room, seat) => {
      if (room.phase !== 'traits') throw new Error('traits unavailable');
      room.traitsDone[seat] = true;
      if (room.traitsDone.a && room.traitsDone.b) {
        room.phase = 'target-selecting';
        room.deadline = null;
      }
    });
  }

  async submitAttack(code: string, playerId: string, version: number, targetId: string, text: string) {
    return this.command(code, playerId, version, (room, seat) => {
      if (room.phase !== 'attack-input' || seat !== room.roundAttacker || text.length > 2000) throw new Error('attack unavailable');
      const defender = otherSeat(seat);
      if (![room.automaticCharacters[defender], ...room.selections[defender]].includes(targetId)) throw new Error('invalid target');
      room.currentTargetId = targetId;
      room.currentAttack = this.speech(room, seat, 'attack', targetId, text);
      room.currentDefense = null;
      room.phase = 'defense-input';
      room.deadline = this.deadline(room.config.speechSeconds);
    });
  }

  async submitDefense(code: string, playerId: string, version: number, text: string) {
    return this.command(code, playerId, version, (room, seat) => {
      if (room.phase !== 'defense-input' || seat !== otherSeat(room.roundAttacker!) || text.length > 2000 || !room.currentTargetId) throw new Error('defense unavailable');
      room.currentDefense = this.speech(room, seat, 'defense', room.currentTargetId, text);
      room.phase = 'round-adjudicating';
      room.deadline = null;
    });
  }

  async resolveRound(code: string, version: number, verdict: RoundVerdict) {
    return this.mutateVersion(code, version, (room) => {
      if (room.phase !== 'round-adjudicating' || !room.currentAttack || !room.currentDefense || !room.currentTargetId || !room.roundAttacker) throw new Error('round verdict unavailable');
      room.roundRecords.push({ round: room.round, attacker: room.roundAttacker, defender: otherSeat(room.roundAttacker), targetId: room.currentTargetId, attack: room.currentAttack, defense: room.currentDefense, verdict });
      (room.arguments[room.currentTargetId] ??= []).push({ kind: verdict.winner, text: verdict.winningArgument });
      room.phase = 'round-result';
      room.deadline = null;
    });
  }

  async advanceAfterRound(code: string, version: number) {
    return this.mutateVersion(code, version, (room) => {
      if (room.phase !== 'round-result') throw new Error('round advance unavailable');
      if (room.round === 3) {
        room.phase = 'track-adjudicating';
        room.deadline = null;
        return;
      }
      room.round = (room.round + 1) as 2 | 3;
      room.roundAttacker = otherSeat(room.roundAttacker!);
      room.currentTargetId = null;
      room.currentAttack = null;
      room.currentDefense = null;
      room.phase = 'attack-input';
      room.deadline = this.deadline(room.config.speechSeconds);
    });
  }

  async resolveTrack(code: string, version: number, verdict: TrackVerdict) {
    return this.mutateVersion(code, version, (room) => {
      if (room.phase !== 'track-adjudicating') throw new Error('track verdict unavailable');
      room.trackVerdict = verdict;
      room.scores[verdict.survivor]++;
      room.finalResult = { survivor: verdict.survivor, reason: verdict.reason, philosophy: '' };
      room.phase = 'judgment-generating';
    });
  }

  async saveJudgment(code: string, version: number, judgment: PhilosophyJudgment) {
    return this.mutateVersion(code, version, (room) => {
      if (room.phase !== 'judgment-generating') throw new Error('judgment unavailable');
      room.judgment = judgment;
      if (room.finalResult) room.finalResult.philosophy = judgment.summary;
      room.phase = 'judgment';
    });
  }

  async readyNextGame(code: string, playerId: string, version: number) {
    return this.command(code, playerId, version, (room, seat) => {
      if (room.phase !== 'judgment' && room.phase !== 'between-games') throw new Error('next game unavailable');
      room.nextGameReady[seat] = true;
      room.phase = 'judgment';
      if (!room.nextGameReady.a || !room.nextGameReady.b) return;
      if (room.game >= room.config.games) {
        room.phase = 'match-end';
        room.deadline = null;
        return;
      }
      room.game++;
      room.round = 1;
      this.startGame(room);
    });
  }

  getRoundDecisionInput(code: string): RoundDecisionInput {
    const room = this.require(code);
    if (!room.currentAttack || !room.currentDefense || !room.currentTargetId || !room.roundAttacker) throw new Error('round context unavailable');
    return { seed: `${code}-${room.game}-${room.round}`, conductor: this.requireConductor(room)!, round: room.round, attacker: room.roundAttacker, defender: otherSeat(room.roundAttacker), target: this.publicCharacter(room, room.currentTargetId), attack: room.currentAttack.text, defense: room.currentDefense.text, priorRounds: room.roundRecords };
  }

  getTrackDecisionInput(code: string): TrackDecisionInput {
    const room = this.require(code);
    return { seed: `${code}-${room.game}-track`, conductor: this.requireConductor(room)!, tracks: { a: this.track(room, 'a'), b: this.track(room, 'b') }, rounds: room.roundRecords };
  }

  getJudgmentInput(code: string): JudgmentInput {
    const room = this.require(code);
    if (!room.trackVerdict) throw new Error('track verdict unavailable');
    const track = this.getTrackDecisionInput(code);
    return { ...track, players: { a: { nickname: this.playerAt(room, 'a').nickname }, b: { nickname: this.playerAt(room, 'b').nickname } }, verdict: room.trackVerdict };
  }

  async surrender(code: string, playerId: string, version: number) {
    return this.command(code, playerId, version, (room, seat) => {
      if (room.phase === 'waiting' || room.phase === 'match-end') throw new Error('surrender unavailable');
      const survivor = otherSeat(seat);
      room.scores[survivor]++;
      room.phase = 'match-end';
      room.deadline = null;
      room.finalResult = { survivor, reason: `${this.player(room, playerId).nickname}投降，对方直接获胜。`, philosophy: '有人在列车抵达前选择离开。' };
    });
  }

  async advanceExpired(now = new Date()) {
    for (const current of [...this.rooms.values()]) {
      const disconnected = current.players.find((player) => !player.connected && player.disconnectedAt && now.getTime() - new Date(player.disconnectedAt).getTime() >= current.config.disconnectSeconds * 1000);
      if (disconnected && current.players.length === 2 && current.phase !== 'match-end') {
        await this.mutate(current.roomCode, (room) => {
          const survivor = otherSeat(disconnected.seat);
          room.scores[survivor]++;
          room.phase = 'match-end'; room.deadline = null;
          room.finalResult = { survivor, reason: `${disconnected.nickname}掉线超过约定时间，比赛判负。`, philosophy: '列车只等到了一个没有回来的人。' };
        });
        continue;
      }
      if (!current.deadline || new Date(current.deadline) > now) continue;
      await this.mutate(current.roomCode, (room) => this.expire(room, now));
    }
  }

  setConnected(code: string, playerId: string, connected: boolean, now = new Date()) {
    const room = this.require(code);
    const player = room.players.find((item) => item.playerId === playerId);
    if (!player) return;
    player.connected = connected;
    if (connected) delete player.disconnectedAt; else player.disconnectedAt = now.toISOString();
    room.version++;
    this.persist(room);
  }

  view(code: string, playerId: string): RoomView {
    const room = this.require(code);
    const me = this.player(room, playerId);
    const opponent = room.players.find((player) => player.playerId !== playerId);
    const opponentSeat = otherSeat(me.seat);
    const opponentHand = room.hands[opponentSeat];
    const opponentRemaining = opponent && opponentHand ? {
      good: opponentHand.characters.filter((card) => card.alignment === 'good' && !room.usedCharacters[opponentSeat].includes(card.id)).length,
      evil: opponentHand.characters.filter((card) => card.alignment === 'evil' && !room.usedCharacters[opponentSeat].includes(card.id)).length,
      traits: opponentHand.traits.filter((card) => !room.usedTraits[opponentSeat].includes(card.id)).length,
    } : null;
    const ownHand = room.hands[me.seat];
    const remainingHand = ownHand ? {
      characters: ownHand.characters.filter((card) => !room.usedCharacters[me.seat].includes(card.id)),
      traits: ownHand.traits.filter((card) => !room.usedTraits[me.seat].includes(card.id)),
    } : null;
    const publicIds = new Set([...room.selections.a, ...room.selections.b, ...Object.values(room.automaticCharacters).filter((id): id is string => Boolean(id))]);
    const characters = [...publicIds].map((id) => this.publicCharacter(room, id));
    const lastVerdict = room.roundRecords.at(-1)?.verdict ?? null;
    return {
      roomCode: code, phase: room.phase, version: room.version, round: room.round, game: room.game, config: room.config,
      conductor: this.requireConductor(room), deadline: room.deadline,
      me: { playerId: me.playerId, nickname: me.nickname, seat: me.seat, ready: me.ready },
      opponent: opponent ? { nickname: opponent.nickname, ready: opponent.ready, connected: opponent.connected } : null,
      opponentRemaining,
      traitReadiness: { mine: room.traitsDone[me.seat], opponent: room.traitsDone[opponentSeat] },
      hand: remainingHand,
      selections: { mine: room.selections[me.seat], opponent: room.selections[opponentSeat] },
      automaticCharacters: { mine: room.automaticCharacters[me.seat], opponent: room.automaticCharacters[opponentSeat] },
      characters,
      activeSpeaker: room.phase === 'attack-input' ? room.roundAttacker : room.phase === 'defense-input' ? otherSeat(room.roundAttacker!) : null,
      roundAttacker: room.roundAttacker, currentTargetId: room.currentTargetId, roundRecords: room.roundRecords,
      currentAttack: room.currentAttack, trackVerdict: room.trackVerdict, judgment: room.judgment, nextGameReady: room.nextGameReady,
      attackText: room.currentAttack?.text ?? null,
      verdict: lastVerdict ? { winner: lastVerdict.winner, reason: lastVerdict.reason, coreArgument: lastVerdict.winningArgument, fallback: lastVerdict.fallback } : null,
      scores: room.scores, finalResult: room.finalResult,
    };
  }

  get(code: string) { return this.require(code); }

  private startGame(room: Room) {
    room.conductorId = pickConductor(catalog, this.random).id;
    room.characterTraits = {}; room.arguments = {};
    room.roundRecords = []; room.trackVerdict = null; room.judgment = null; room.finalResult = null; room.nextGameReady = { a: false, b: false };
    room.roundAttacker = this.random() < 0.5 ? 'a' : 'b';
    room.selections = { a: [], b: [] }; room.traitsDone = { a: false, b: false };
    room.currentTargetId = null; room.debateMessages = []; room.messageSequence = 0; room.roundVerdict = null;
    this.dealAutomaticCharacters(room);
    room.phase = 'selecting';
    room.deadline = this.phaseDeadline(room, room.config.selectionSeconds);
  }

  private dealAutomaticCharacters(room: Room) {
    const excluded = new Set([...Object.values(room.hands).flatMap((hand) => hand?.characters.map((card) => card.id) ?? []), ...room.usedCharacters.a, ...room.usedCharacters.b]);
    const pool = catalog.characters.filter((card) => card.alignment === 'good' && !excluded.has(card.id));
    if (pool.length < 2) throw new Error('not enough automatic good characters');
    const take = () => pool.splice(Math.min(pool.length - 1, Math.floor(this.random() * pool.length)), 1)[0]!.id;
    room.automaticCharacters = { a: take(), b: take() };
    room.usedCharacters.a.push(room.automaticCharacters.a!); room.usedCharacters.b.push(room.automaticCharacters.b!);
  }

  private expire(room: Room, now: Date) {
    if (room.phase === 'selecting') {
      for (const seat of ['a', 'b'] as const) if (room.selections[seat].length === 0) {
        const ids = room.hands[seat]!.characters.filter((card) => !room.usedCharacters[seat].includes(card.id)).slice(0, 2).map((card) => card.id);
        room.selections[seat] = ids; room.usedCharacters[seat].push(...ids);
      }
      room.phase = 'traits'; room.deadline = this.phaseDeadline(room, room.config.traitSeconds, now); return;
    }
    if (room.phase === 'traits') { room.traitsDone = { a: true, b: true }; room.phase = 'attack-input'; room.deadline = new Date(now.getTime() + room.config.speechSeconds * 1000).toISOString(); return; }
    if (room.phase === 'attack-input') {
      const attacker = room.roundAttacker!; const defender = otherSeat(attacker); const target = room.automaticCharacters[defender] ?? room.selections[defender][0]!;
      room.currentTargetId = target; room.currentAttack = this.speech(room, attacker, 'attack', target, ''); room.phase = 'defense-input'; room.deadline = new Date(now.getTime() + room.config.speechSeconds * 1000).toISOString(); return;
    }
    if (room.phase === 'defense-input') {
      const defender = otherSeat(room.roundAttacker!); room.currentDefense = this.speech(room, defender, 'defense', room.currentTargetId!, '');
      const verdict = fallbackRoundVerdict(this.roundInput(room));
      room.roundRecords.push({ round: room.round, attacker: room.roundAttacker!, defender, targetId: room.currentTargetId!, attack: room.currentAttack!, defense: room.currentDefense, verdict });
      (room.arguments[room.currentTargetId!] ??= []).push({ kind: verdict.winner, text: verdict.winningArgument });
      room.phase = 'round-result'; room.deadline = null;
    }
  }

  private roundInput(room: Room): RoundDecisionInput {
    return { seed: `${room.roomCode}-${room.game}-${room.round}-timeout`, conductor: this.requireConductor(room)!, round: room.round, attacker: room.roundAttacker!, defender: otherSeat(room.roundAttacker!), target: this.publicCharacter(room, room.currentTargetId!), attack: room.currentAttack?.text ?? '', defense: room.currentDefense?.text ?? '', priorRounds: room.roundRecords };
  }

  private track(room: Room, seat: Seat) { return [...new Set(room.usedCharacters[seat])].map((id) => this.publicCharacter(room, id)); }
  private publicCharacter(room: Room, id: string): PublicCharacter {
    const card = this.findCharacter(id);
    return { ...card, traits: (room.characterTraits[id] ?? []).map((traitId) => this.findTrait(traitId)), arguments: room.arguments[id] ?? [] };
  }
  private speech(room: Room, seat: Seat, role: 'attack' | 'defense', targetId: string, text: string): SpeechRecord { return { seat, role, targetId, text, round: room.round }; }
  private deadline(seconds: number) { return new Date(Date.now() + seconds * 1000).toISOString(); }
  private phaseDeadline(room: Room, seconds: number, now = new Date()) {
    return room.config.timingMode === 'unlimited' ? null : new Date(now.getTime() + seconds * 1000).toISOString();
  }
  private player(room: Room, playerId: string) { const player = room.players.find((item) => item.playerId === playerId); if (!player) throw new Error('not in room'); return player; }
  private playerAt(room: Room, seat: Seat) { const player = room.players.find((item) => item.seat === seat); if (!player) throw new Error('player missing'); return player; }
  private findCharacter(id: string) { const card = catalog.characters.find((item) => item.id === id); if (!card) throw new Error(`character is missing: ${id}`); return card; }
  private findTrait(id: string) { const trait = catalog.traits.find((item) => item.id === id); if (!trait) throw new Error(`trait is missing: ${id}`); return trait; }
  private requireConductor(room: Room) { if (!room.conductorId) return null; const conductor = catalog.conductors.find((item) => item.id === room.conductorId); if (!conductor) throw new Error(`conductor is missing: ${room.conductorId}`); return conductor; }
  private require(code: string) { const room = this.rooms.get(code); if (!room) throw new Error('room not found'); return room; }
  private persist(room: Room) { this.rooms.set(room.roomCode, room); this.store.saveRoom(room.roomCode, room, room.phase === 'match-end' ? new Date(Date.now() + 86_400_000).toISOString() : null); return room; }
  private async command(code: string, playerId: string, version: number, action: (room: Room, seat: Seat) => void) { return this.mutateVersion(code, version, (room) => action(room, this.player(room, playerId).seat)); }
  private async mutateVersion(code: string, version: number, action: (room: Room) => void) { return this.mutate(code, (room) => { if (room.version !== version) throw new Error('state version conflict'); action(room); }); }
  private async mutate(code: string, action: (room: Room) => void) { return this.store.runExclusive(code, () => { const room = structuredClone(this.require(code)); action(room); room.version++; return this.persist(room); }); }
}

export type { Room, RoomPlayer } from './types.js';
