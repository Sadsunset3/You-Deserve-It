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
    const round: RoundDecisionInput = {
      seed: 'r', conductor, round: 1, attacker: 'a', defender: 'b', target: character,
      players: { a: { nickname: '甲' }, b: { nickname: '乙' } },
      messages: [
        { messageId: 'a', sequence: 1, sender: 'a', text: '攻击方只谈责任', sentAt: '2026-08-15T00:00:01.000Z' },
        { messageId: 'b', sequence: 2, sender: 'b', text: '防守方只谈救人', sentAt: '2026-08-15T00:00:02.000Z' },
      ],
      priorRounds: [],
    };
    const track: TrackDecisionInput = { seed: 't', conductor, tracks: { a: [character], b: [{ ...character, id: 'e', alignment: 'evil', name: '小偷', background: '偷钱' }] }, rounds: [] };
    const judgment: JudgmentInput = { ...track, players: { a: { nickname: '甲' }, b: { nickname: '乙' } }, verdict: fallbackTrackVerdict(track) };

    const roundVerdict = fallbackRoundVerdict(round);
    expect(roundVerdict).toEqual(fallbackRoundVerdict(round));
    expect(roundVerdict.conductorMessage).toContain('列车长');
    expect(roundVerdict.debateSummary).toContain('攻击方只谈责任');
    const winningText = roundVerdict.winnerSeat === 'a' ? '攻击方只谈责任' : '防守方只谈救人';
    const losingText = roundVerdict.winnerSeat === 'a' ? '防守方只谈救人' : '攻击方只谈责任';
    expect(roundVerdict.winningSummary).toContain(winningText);
    expect(roundVerdict.winningSummary).not.toContain(losingText);
    expect(fallbackTrackVerdict(track).decisiveFactors.length).toBeGreaterThan(0);
    expect(fallbackJudgment(judgment).questions).toHaveLength(2);
  });
});
