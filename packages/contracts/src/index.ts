import { z } from 'zod';

export const gameConfigSchema = z.object({
  games: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  selectionSeconds: z.number().int().min(20).max(120),
  traitSeconds: z.number().int().min(20).max(180),
  speechSeconds: z.number().int().min(30).max(180),
  disconnectSeconds: z.number().int().min(60).max(300),
});

export const nicknameSchema = z.string().trim().min(2).max(20);
export const roomCodeSchema = z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
export const apiKeySchema = z.string().trim().min(1).max(512);

export const createRoomSchema = z.object({ nickname: nicknameSchema, config: gameConfigSchema, apiKey: apiKeySchema });
export const joinRoomSchema = z.object({ nickname: nicknameSchema, roomCode: roomCodeSchema });
export const commandSchema = z.object({ commandId: z.string().uuid(), expectedVersion: z.number().int().positive() });
export const submitSpeechSchema = commandSchema.extend({ text: z.string().max(2000) });
export const selectCharactersSchema = commandSchema.extend({ characterIds: z.array(z.string()).length(2) });
export const attachTraitSchema = commandSchema.extend({ traitId: z.string(), targetId: z.string() });
export const targetSchema = commandSchema.extend({ targetId: z.string() });

export const phaseSchema = z.enum([
  'waiting',
  'selecting',
  'traits',
  'attack-input',
  'defense-input',
  'round-adjudicating',
  'round-result',
  'track-adjudicating',
  'judgment-generating',
  'judgment',
  'between-games',
  'match-end',
]);

export const roundVerdictSchema = z.object({
  winner: z.enum(['attack', 'defense']),
  reason: z.string().trim().min(1).max(800),
  winningArgument: z.string().trim().min(1).max(500),
  fallback: z.boolean(),
});

export const trackVerdictSchema = z.object({
  crushedSeat: z.enum(['a', 'b']),
  survivor: z.enum(['a', 'b']),
  reason: z.string().trim().min(1).max(1200),
  decisiveFactors: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
  fallback: z.boolean(),
}).refine((value) => value.crushedSeat !== value.survivor, {
  message: 'crushedSeat and survivor must differ',
});

export const philosophyJudgmentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(1600),
  playerA: z.string().trim().min(1).max(1200),
  playerB: z.string().trim().min(1).max(1200),
  conductorCritique: z.string().trim().min(1).max(1200),
  questions: z.tuple([
    z.string().trim().min(1).max(300),
    z.string().trim().min(1).max(300),
  ]),
  fallback: z.boolean(),
});

export type GameConfig = z.infer<typeof gameConfigSchema>;
export type Alignment = 'good' | 'evil';
export type Seat = 'a' | 'b';
export type Phase = z.infer<typeof phaseSchema>;

export type CharacterCard = { id: string; name: string; alignment: Alignment; background: string; portrait: string };
export type TraitCard = { id: string; text: string; tag: string; polarity: -2 | -1 | 0 | 1 | 2 };
export type Conductor = { id: string; name: string; persona: string; rule: string; bias: number };
export type Hand = { characters: CharacterCard[]; traits: TraitCard[] };
export type Verdict = { winner: 'attack' | 'defense'; reason: string; coreArgument: string; fallback: boolean };

export type RoundVerdict = z.infer<typeof roundVerdictSchema>;
export type TrackVerdict = z.infer<typeof trackVerdictSchema>;
export type PhilosophyJudgment = z.infer<typeof philosophyJudgmentSchema>;
export type SpeechRecord = {
  seat: Seat;
  role: 'attack' | 'defense';
  targetId: string;
  text: string;
  round: 1 | 2 | 3;
};
export type RoundRecord = {
  round: 1 | 2 | 3;
  attacker: Seat;
  defender: Seat;
  targetId: string;
  attack: SpeechRecord;
  defense: SpeechRecord;
  verdict: RoundVerdict;
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
  target: DecisionCharacter;
  attack: string;
  defense: string;
  priorRounds: RoundRecord[];
};
export type TrackDecisionInput = {
  seed: string;
  conductor: Conductor;
  tracks: Record<Seat, DecisionCharacter[]>;
  rounds: RoundRecord[];
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
  me: { playerId: string; nickname: string; seat: Seat; ready: boolean };
  opponent: { nickname: string; ready: boolean; connected: boolean } | null;
  opponentRemaining: { good: number; evil: number; traits: number } | null;
  traitReadiness: { mine: boolean; opponent: boolean };
  hand: Hand | null;
  selections: { mine: string[]; opponent: string[] };
  automaticCharacters: { mine: string | null; opponent: string | null };
  characters: PublicCharacter[];
  activeSpeaker: Seat | null;
  roundAttacker: Seat | null;
  currentTargetId: string | null;
  roundRecords: RoundRecord[];
  currentAttack: SpeechRecord | null;
  trackVerdict: TrackVerdict | null;
  judgment: PhilosophyJudgment | null;
  nextGameReady: Record<Seat, boolean>;
  attackText: string | null;
  verdict: Verdict | null;
  scores: Record<Seat, number>;
  finalResult: { survivor: Seat; reason: string; philosophy: string } | null;
};
