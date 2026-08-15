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
    const rounds = ([1, 2, 3] as const).map((roundNumber) => ({
      round: roundNumber,
      attacker: roundNumber % 2 === 1 ? 'a' as const : 'b' as const,
      defender: roundNumber % 2 === 1 ? 'b' as const : 'a' as const,
      targetId: 'p',
      messages: [
        { messageId: `a-${roundNumber}`, sequence: 1, sender: 'a' as const, text: `甲方第${roundNumber}轮论点`, sentAt: `2026-08-15T00:00:0${roundNumber}.000Z` },
        { messageId: `b-${roundNumber}`, sequence: 2, sender: 'b' as const, text: `乙方第${roundNumber}轮论点`, sentAt: `2026-08-15T00:00:1${roundNumber}.000Z` },
      ],
      verdict: { winnerSeat: roundNumber === 2 ? 'b' as const : 'a' as const, conductorMessage: `第${roundNumber}轮裁决`, debateSummary: `第${roundNumber}轮双方摘要`, winningSummary: `第${roundNumber}轮胜方摘要`, fallback: false },
    }));
    const track: TrackDecisionInput = { seed: 't', conductor, players: { a: { nickname: '甲' }, b: { nickname: '乙' } }, tracks: { a: [character], b: [{ ...character, id: 'e', alignment: 'evil', name: '小偷', background: '偷钱' }] }, rounds };
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
    const poem = fallbackJudgment(judgment);
    expect(poem.stanzas).toHaveLength(5);
    expect(poem.stanzas.flatMap((stanza) => stanza.lines)).toHaveLength(10);
    expect(poem.stanzas[3]?.lines.join('')).toContain('消防员');
    expect(poem.stanzas[0]?.lines.join('')).toContain(judgment.players[judgment.verdict.crushedSeat].nickname);
    expect(poem.stanzas[0]?.lines.join('')).toContain('所在的轨道');
    expect(poem.stanzas.flatMap((stanza) => stanza.lines).join('')).not.toContain(`${judgment.verdict.crushedSeat.toUpperCase()}轨`);
    expect(poem.stanzas[1]?.lines.join('')).toContain('甲方第1轮论点');
    expect(poem.stanzas[1]?.lines.join('')).toContain('甲方第3轮论点');
    expect(poem.stanzas[2]?.lines.join('')).toContain('乙方第1轮论点');
    expect(poem.stanzas[2]?.lines.join('')).toContain('乙方第3轮论点');
  });
});
