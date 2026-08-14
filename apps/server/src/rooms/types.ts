import type {
  DebateMessage,
  DebateRoundRecord,
  DebateRoundVerdict,
  GameConfig,
  Hand,
  Phase,
  PhilosophyJudgment,
  Seat,
  TrackVerdict,
} from '@ydi/contracts';

export type RoomPlayer = { playerId: string; nickname: string; seat: Seat; ready: boolean; connected: boolean };

export type Room = {
  roomCode: string;
  hostId: string;
  config: GameConfig;
  players: RoomPlayer[];
  phase: Phase;
  version: number;
  round: 1 | 2 | 3;
  game: number;
  conductorId: string | null;
  hands: Partial<Record<Seat, Hand>>;
  selections: Record<Seat, string[]>;
  automaticCharacters: Record<Seat, string | null>;
  usedCharacters: Record<Seat, string[]>;
  usedTraits: Record<Seat, string[]>;
  traitsDone: Record<Seat, boolean>;
  characterTraits: Record<string, string[]>;
  arguments: Record<string, Array<{ kind: 'attack' | 'defense'; text: string }>>;
  roundAttacker: Seat | null;
  currentTargetId: string | null;
  debateMessages: DebateMessage[];
  messageSequence: number;
  roundVerdict: DebateRoundVerdict | null;
  roundRecords: DebateRoundRecord[];
  trackVerdict: TrackVerdict | null;
  judgment: PhilosophyJudgment | null;
  nextGameReady: Record<Seat, boolean>;
  deadline: string | null;
  scores: Record<Seat, number>;
  finalResult: { survivor: Seat; reason: string; philosophy: string } | null;
};

export function migrateRoomSnapshot(snapshot: Room): Room {
  const room = structuredClone(snapshot) as Room & Record<string, unknown>;
  const legacyConfig = room.config as GameConfig & { speechSeconds?: number; disconnectSeconds?: number; timingMode?: GameConfig['timingMode']; debateMinutes?: GameConfig['debateMinutes'] };
  room.config = {
    games: legacyConfig.games,
    timingMode: legacyConfig.timingMode ?? 'timed',
    selectionSeconds: legacyConfig.selectionSeconds,
    traitSeconds: legacyConfig.traitSeconds,
    debateMinutes: legacyConfig.debateMinutes ?? 5,
  };
  room.automaticCharacters ??= { a: null, b: null };
  room.roundAttacker ??= null;
  room.currentTargetId ??= null;
  room.debateMessages ??= [];
  room.messageSequence ??= 0;
  room.roundVerdict ??= null;
  room.roundRecords ??= [];
  room.trackVerdict ??= null;
  room.judgment ??= null;
  room.nextGameReady ??= { a: false, b: false };
  const legacy = new Set(['attack-a', 'attack-b', 'defense-a', 'defense-b', 'attack-input', 'defense-input', 'round-adjudicating', 'round-result', 'verdict', 'round-end', 'final-judgment', 'philosophy', 'game-end']);
  if (legacy.has(String(room.phase))) {
    room.phase = 'match-end';
    room.deadline = null;
    room.finalResult ??= { survivor: 'a', reason: '版本升级后本局已结束，请重新开局。', philosophy: '旧列车已驶离新的轨道。' };
  }
  return room;
}
