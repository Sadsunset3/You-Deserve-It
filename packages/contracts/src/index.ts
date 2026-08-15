import { z } from 'zod';

export const gameConfigSchema = z.object({
  games: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  debateMinutes: z.union([
    z.literal(3), z.literal(4), z.literal(5), z.literal(6),
    z.literal(7), z.literal(8), z.literal(9), z.literal(10),
  ]),
}).strict();

export const nicknameSchema = z.string().trim().min(2).max(20);
export const roomCodeSchema = z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
export const apiKeySchema = z.string().trim().min(1).max(512);

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
  config: gameConfigSchema,
  apiKey: apiKeySchema.optional(),
  freeToken: z.literal(true).optional(),
}).strict().refine((value) => Boolean(value.apiKey) !== Boolean(value.freeToken), { message: '必须且只能提供 apiKey 或 freeToken 其中之一' });
export const joinRoomSchema = z.object({ nickname: nicknameSchema, roomCode: roomCodeSchema });
export const commandSchema = z.object({ commandId: z.string().uuid(), expectedVersion: z.number().int().positive() });
export const selectCharactersSchema = commandSchema.extend({ characterIds: z.array(z.string()).length(2) });
export const attachTraitSchema = commandSchema.extend({ traitId: z.string(), targetId: z.string() });
export const lockDebateTargetSchema = commandSchema.extend({ targetId: z.string().min(1) });
export const appendDebateMessageSchema = z.object({
  messageId: z.string().uuid(),
  text: z.string().trim().min(1).max(2000),
});

export const phaseSchema = z.enum([
  'waiting',
  'selecting',
  'traits',
  'target-selecting',
  'debate-chat',
  'round-adjudicating',
  'round-result',
  'track-adjudicating',
  'conductor-speech',
  'judgment-generating',
  'judgment',
  'between-games',
  'match-end',
]);

export const roundVerdictSchema = z.object({
  winnerSeat: z.enum(['a', 'b']),
  conductorMessage: z.string().trim().min(1).max(1200),
  debateSummary: z.string().trim().min(1).max(1600),
  winningSummary: z.string().trim().min(1).max(600),
  fallback: z.boolean(),
});

export const trackVerdictSchema = z.object({
  crushedSeat: z.enum(['a', 'b']),
  survivor: z.enum(['a', 'b']),
  reason: z.string().trim().min(1).max(1200),
  speech: z.string().trim().min(1).max(1200),
  decisiveFactors: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
  fallback: z.boolean(),
}).refine((value) => value.crushedSeat !== value.survivor, {
  message: 'crushedSeat and survivor must differ',
});

const poemLineSchema = z.string().trim().min(1).max(180);
const poemStanza = <T extends string>(kind: T) => z.object({
  kind: z.literal(kind),
  lines: z.tuple([poemLineSchema, poemLineSchema]),
}).strict();

export const philosophyJudgmentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  stanzas: z.tuple([
    poemStanza('opening'),
    poemStanza('player-a'),
    poemStanza('player-b'),
    poemStanza('tracks'),
    poemStanza('verdict'),
  ]),
  fallback: z.boolean(),
}).strict();

export type GameConfig = z.infer<typeof gameConfigSchema>;
export type Alignment = 'good' | 'evil';
export type Seat = 'a' | 'b';
export type Phase = z.infer<typeof phaseSchema>;

export type CharacterCard = { id: string; name: string; alignment: Alignment; background: string; portrait: string };
export type TraitCard = { id: string; text: string; tag: string; polarity: -2 | -1 | 0 | 1 | 2 };
export type Conductor = { id: string; name: string; persona: string; rule: string; bias: number };
export type Hand = { characters: CharacterCard[]; traits: TraitCard[] };
export type DebateRoundVerdict = z.infer<typeof roundVerdictSchema>;
export type TrackVerdict = z.infer<typeof trackVerdictSchema>;
export type PhilosophyJudgment = z.infer<typeof philosophyJudgmentSchema>;
export type DebateMessage = {
  messageId: string;
  sequence: number;
  sender: Seat;
  text: string;
  sentAt: string;
};
export type DebateRoundRecord = {
  round: 1 | 2 | 3;
  attacker: Seat;
  defender: Seat;
  targetId: string;
  messages: DebateMessage[];
  verdict: DebateRoundVerdict;
};

export type DecisionCharacter = CharacterCard & {
  traits: TraitCard[];
  arguments: Array<{ kind: 'attack' | 'defense'; text: string }>;
};
export type RoundDecisionInput = {
  seed: string;
  conductor: Conductor;
  round: 1 | 2 | 3;
  attacker: Seat;
  defender: Seat;
  players: Record<Seat, { nickname: string }>;
  target: DecisionCharacter;
  messages: DebateMessage[];
  priorRounds: DebateRoundRecord[];
};
export type TrackDecisionInput = {
  seed: string;
  conductor: Conductor;
  players: Record<Seat, { nickname: string }>;
  tracks: Record<Seat, DecisionCharacter[]>;
  rounds: DebateRoundRecord[];
};
export type JudgmentInput = TrackDecisionInput & {
  players: Record<Seat, { nickname: string }>;
  verdict: TrackVerdict;
};

export type PublicCharacter = DecisionCharacter;
export type RoomView = {
  roomCode: string;
  phase: Phase;
  version: number;
  round: number;
  game: number;
  config: GameConfig;
  conductor: Conductor | null;
  deadline: string | null;
  me: { playerId: string; nickname: string; seat: Seat; ready: boolean; connected: boolean };
  opponent: { nickname: string; ready: boolean; connected: boolean } | null;
  opponentRemaining: { good: number; evil: number; traits: number } | null;
  traitReadiness: { mine: boolean; opponent: boolean };
  hand: Hand | null;
  selections: { mine: string[]; opponent: string[] };
  automaticCharacters: { mine: string | null; opponent: string | null };
  characters: PublicCharacter[];
  roundAttacker: Seat | null;
  currentTargetId: string | null;
  debateMessages: DebateMessage[];
  messageSequence: number;
  roundVerdict: DebateRoundVerdict | null;
  roundResultReady: { mine: boolean; opponent: boolean };
  roundRecords: DebateRoundRecord[];
  trackVerdict: TrackVerdict | null;
  judgment: PhilosophyJudgment | null;
  nextGameReady: Record<Seat, boolean>;
  scores: Record<Seat, number>;
  finalResult: { survivor: Seat; reason: string; philosophy: string } | null;
};
