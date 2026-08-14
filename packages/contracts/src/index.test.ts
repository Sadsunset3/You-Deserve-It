import { describe, expect, it } from 'vitest';
import {
  createRoomSchema,
  gameConfigSchema,
  phaseSchema,
  philosophyJudgmentSchema,
  roundVerdictSchema,
  submitSpeechSchema,
  trackVerdictSchema,
  type Conductor,
  type RoomView,
} from './index';

const conductor: Conductor = {
  id: 'utility',
  name: '功利主义列车长',
  persona: '冷静而具体地计算每一个选择的公共后果。',
  rule: '优先保留未来能创造更多公共价值的人。',
  bias: 1,
};

const roomViewWithConductor: Pick<RoomView, 'conductor'> = { conductor };
const roomViewWithOpponentCounts: Pick<RoomView, 'opponentRemaining'> = { opponentRemaining: { good: 3, evil: 2, traits: 4 } };
const roomViewWithTraitReadiness: Pick<RoomView, 'traitReadiness'> = { traitReadiness: { mine: true, opponent: false } };

describe('shared contracts', () => {
  it('accepts the minimum legal room configuration', () => {
    expect(gameConfigSchema.parse({ games: 1, selectionSeconds: 20, traitSeconds: 20, speechSeconds: 30, disconnectSeconds: 60 }).games).toBe(1);
  });

  it('accepts only odd match lengths so finite hands never require a tiebreak game', () => {
    const base = { selectionSeconds: 20, traitSeconds: 20, speechSeconds: 30, disconnectSeconds: 60 };
    for (const games of [1, 3, 5]) expect(gameConfigSchema.parse({ ...base, games }).games).toBe(games);
    for (const games of [2, 4]) expect(() => gameConfigSchema.parse({ ...base, games })).toThrow();
  });

  it('rejects out-of-range timing and nickname values', () => {
    expect(() => createRoomSchema.parse({ nickname: 'A', config: { games: 6, selectionSeconds: 10, traitSeconds: 10, speechSeconds: 10, disconnectSeconds: 10 }, apiKey: 'test-key' })).toThrow();
  });

  it('requires a non-empty DeepSeek key when creating a room', () => {
    const config = { games: 1, selectionSeconds: 20, traitSeconds: 20, speechSeconds: 30, disconnectSeconds: 60 };
    expect(() => createRoomSchema.parse({ nickname: '甲方', config })).toThrow();
    expect(() => createRoomSchema.parse({ nickname: '甲方', config, apiKey: '   ' })).toThrow();
    expect(createRoomSchema.parse({ nickname: '甲方', config, apiKey: '  sk-room-key  ' }).apiKey).toBe('sk-room-key');
  });

  it('rejects debate speeches longer than 2000 unicode characters', () => {
    expect(() => submitSpeechSchema.parse({ commandId: crypto.randomUUID(), expectedVersion: 1, text: '判'.repeat(2001) })).toThrow();
  });

  it('exposes the active conductor including their persona', () => {
    expect(roomViewWithConductor.conductor?.persona).toBe('冷静而具体地计算每一个选择的公共后果。');
  });

  it('exposes only categorized opponent hand counts', () => {
    expect(roomViewWithOpponentCounts.opponentRemaining).toEqual({ good: 3, evil: 2, traits: 4 });
  });

  it('exposes player-relative trait confirmation state', () => {
    expect(roomViewWithTraitReadiness.traitReadiness).toEqual({ mine: true, opponent: false });
  });

  it('accepts only phases from the three-round authoritative state machine', () => {
    expect(phaseSchema.parse('round-adjudicating')).toBe('round-adjudicating');
    expect(phaseSchema.parse('judgment')).toBe('judgment');
    expect(() => phaseSchema.parse('attack-a')).toThrow();
  });

  it('validates round and track verdict seats instead of accepting arbitrary strings', () => {
    expect(roundVerdictSchema.parse({ winner: 'defense', reason: '事实成立', winningArgument: '他救过人', fallback: false }).winner).toBe('defense');
    expect(() => trackVerdictSchema.parse({ crushedSeat: 'c', survivor: 'a', reason: '判断', decisiveFactors: ['事实'], fallback: false })).toThrow();
  });

  it('requires a complete shared philosophical judgment', () => {
    const judgment = philosophyJudgmentSchema.parse({
      title: '最后的道岔',
      summary: '双方都在用有限事实交换生命。',
      playerA: '甲方相信功绩可以抵债。',
      playerB: '乙方相信未来可以赎罪。',
      conductorCritique: '列车长也只是把偏见包装成秩序。',
      questions: ['如果无人旁观，你还会如此选择吗？', '谁有资格为陌生人定价？'],
      fallback: false,
    });
    expect(judgment.questions).toHaveLength(2);
    expect(() => philosophyJudgmentSchema.parse({ ...judgment, questions: ['只有一个问题'] })).toThrow();
  });
});
