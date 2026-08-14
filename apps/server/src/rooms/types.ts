import type {
  GameConfig,
  Hand,
  Phase,
  PhilosophyJudgment,
  RoundRecord,
  Seat,
  SpeechRecord,
  TrackVerdict,
} from '@ydi/contracts';

export type RoomPlayer = { playerId: string; nickname: string; seat: Seat; ready: boolean; connected: boolean; disconnectedAt?: string };

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
  currentAttack: SpeechRecord | null;
  currentDefense: SpeechRecord | null;
  roundRecords: RoundRecord[];
  trackVerdict: TrackVerdict | null;
  judgment: PhilosophyJudgment | null;
  nextGameReady: Record<Seat, boolean>;
  deadline: string | null;
  scores: Record<Seat, number>;
  finalResult: { survivor: Seat; reason: string; philosophy: string } | null;
};

export function migrateRoomSnapshot(snapshot: Room): Room {
  const room = structuredClone(snapshot) as Room & Record<string, unknown>;
  room.automaticCharacters ??= { a: null, b: null };
  room.roundAttacker ??= null;
  room.currentTargetId ??= null;
  room.currentAttack ??= null;
  room.currentDefense ??= null;
  room.roundRecords ??= [];
  room.trackVerdict ??= null;
  room.judgment ??= null;
  room.nextGameReady ??= { a: false, b: false };
  const legacy = new Set(['attack-a', 'attack-b', 'defense-a', 'defense-b', 'verdict', 'round-end', 'final-judgment', 'philosophy', 'game-end']);
  if (legacy.has(String(room.phase))) {
    room.phase = 'match-end';
    room.deadline = null;
    room.finalResult ??= { survivor: 'a', reason: '版本升级后本局已结束，请重新开局。', philosophy: '旧列车已驶离新的轨道。' };
  }
  return room;
}
