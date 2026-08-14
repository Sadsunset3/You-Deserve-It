import { describe, expect, it } from 'vitest';
import { fallbackJudgment, fallbackRoundVerdict, fallbackTrackVerdict, fallbackVerdict } from './fallback';
import type { JudgmentInput, RoundDecisionInput, TrackDecisionInput } from '@ydi/contracts';

describe('fallback verdict', () => {
  it('is deterministic for the same evidence and seed', () => {
    const input = { seed: 'room-1', alignment: 'evil' as const, traitPolarity: -2, attack: '他伤害过别人', defense: '他已经悔改', conductorBias: -1 };
    expect(fallbackVerdict(input)).toEqual(fallbackVerdict(input));
    expect(fallbackVerdict(input).fallback).toBe(true);
  });

  it('returns deterministic non-empty results for all three adjudication stages', () => {
    const conductor = { id: 'c', name: '列车长', persona: '冷静', rule: '看事实', bias: 0 };
    const character = { id: 'p', name: '消防员', alignment: 'good' as const, background: '救过人', portrait: '/p.svg', traits: [], arguments: [] };
    const round: RoundDecisionInput = { seed: 'r', conductor, round: 1, attacker: 'a', defender: 'b', target: character, attack: '攻击', defense: '防守', priorRounds: [] };
    const track: TrackDecisionInput = { seed: 't', conductor, tracks: { a: [character], b: [{ ...character, id: 'e', alignment: 'evil', name: '小偷', background: '偷钱' }] }, rounds: [] };
    const judgment: JudgmentInput = { ...track, players: { a: { nickname: '甲' }, b: { nickname: '乙' } }, verdict: fallbackTrackVerdict(track) };

    expect(fallbackRoundVerdict(round)).toEqual(fallbackRoundVerdict(round));
    expect(fallbackTrackVerdict(track).decisiveFactors.length).toBeGreaterThan(0);
    expect(fallbackJudgment(judgment).questions).toHaveLength(2);
  });
});
