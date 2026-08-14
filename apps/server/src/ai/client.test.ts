import { afterEach, describe, expect, it } from 'vitest';
import { createAiGateway, testAiConnection } from './client';
import { resolveAiConfig } from './client';
import type { JudgmentInput, RoundDecisionInput, TrackDecisionInput } from '@ydi/contracts';
import { roundVerdictSchema } from './schemas';
import { buildRoundMessages } from './prompts';

const conductor = { id: 'strict', name: '铁面老周', persona: '从不相信事出有因', rule: '主动伤害不可原谅', bias: -2 };
const target = {
  id: 'doctor', name: '急诊医生', alignment: 'good' as const, background: '在灾难中救下多人', portrait: '/doctor.svg',
  traits: [{ id: 'repair', text: '主动为错误赔偿', tag: '补救', polarity: 1 as const }],
  arguments: [{ kind: 'defense' as const, text: '照顾患病家人十年' }],
};
const roundInput: RoundDecisionInput = {
  seed: 'room-7', conductor, round: 1, attacker: 'a', defender: 'b', target,
  players: { a: { nickname: '甲方' }, b: { nickname: '乙方' } },
  messages: [
    { messageId: '1', sequence: 1, sender: 'a', text: '这条轨道上的我不能接受他拿补救抵罪', sentAt: '2026-08-15T00:00:01.000Z' },
    { messageId: '2', sequence: 2, sender: 'b', text: '我所在的轨道认为补救证明他仍有价值', sentAt: '2026-08-15T00:00:02.000Z' },
  ],
  priorRounds: [],
};
const trackInput: TrackDecisionInput = { seed: 'room-7-final', conductor, tracks: { a: [target], b: [{ ...target, id: 'thief', name: '小偷', alignment: 'evil', background: '偷走一百万元' }] }, rounds: [] };
const judgmentInput: JudgmentInput = { ...trackInput, players: { a: { nickname: '甲方' }, b: { nickname: '乙方' } }, verdict: { crushedSeat: 'b', survivor: 'a', reason: '甲方更值得保留', decisiveFactors: ['救人'], fallback: false } };

describe('AI gateway', () => {
  const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it('uses the official DeepSeek OpenAI-compatible defaults', () => {
    expect(resolveAiConfig({ apiKey: 'test-key' })).toMatchObject({ baseURL: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'test-key' });
  });

  it('never falls back to a process-wide API key', () => {
    process.env.DEEPSEEK_API_KEY = 'server-secret';
    process.env.OPENAI_API_KEY = 'other-secret';
    expect(resolveAiConfig().apiKey).toBeUndefined();
  });

  it('tests the supplied room key against the configured DeepSeek model', async () => {
    let capturedPayload: unknown;
    await expect(testAiConnection('room-key', {
      createCompletion: async (payload) => {
        capturedPayload = payload;
        return { choices: [{ message: { content: 'OK' } }] };
      },
    })).resolves.toEqual({ ok: true });
    expect(capturedPayload).toMatchObject({ model: 'deepseek-v4-flash', max_tokens: 1 });
  });
  it('falls back after three failed attempts', async () => {
    let attempts = 0;
    const gateway = createAiGateway({ apiKey: 'x', baseURL: 'https://invalid.local', model: 'test', timeoutMs: 10, request: async () => { attempts++; throw new Error('offline'); } });
    const verdict = await gateway.decideRound(roundInput);
    expect(attempts).toBe(3); expect(verdict.fallback).toBe(true);
  });

  it('validates one structured result containing the verdict and both summaries', () => {
    expect(roundVerdictSchema.parse({
      winnerSeat: 'a',
      conductorMessage: '行了，我听明白了。这轮甲方说得更站得住脚，我判甲方赢。',
      debateSummary: '甲方反对拿补救抵罪，乙方强调补救带来的未来价值。',
      winningSummary: '补救不能直接抵消既有责任。',
      fallback: false,
    }).winnerSeat).toBe('a');
  });

  it('states that players defend themselves and are not speaking as the target character', () => {
    const built = buildRoundMessages(roundInput);
    expect(built[0]?.content).toContain('真实玩家');
    expect(built[0]?.content).toContain('不是目标人物本人发言');
    expect(built[0]?.content).toContain('debateSummary');
    expect(built[0]?.content).toContain('winningSummary');
    expect(JSON.stringify(built[1])).toContain('这条轨道上的我');
  });

  it('serializes the visible conductor and complete character context in the completion payload', async () => {
    let capturedPayload: unknown;
    const gateway = createAiGateway({
      createCompletion: async (payload) => {
        capturedPayload = payload;
        return { choices: [{ message: { content: '{"winnerSeat":"b","conductorMessage":"这轮乙方说得更实在，我判乙方赢。","debateSummary":"甲方强调责任，乙方强调补救。","winningSummary":"补救说明仍有可保留的价值。","fallback":false}' } }] };
      },
    });

    await gateway.decideRound(roundInput);

    expect(capturedPayload).toMatchObject({
      model: 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
    });
    const serializedPayload = JSON.stringify(capturedPayload);
    expect(serializedPayload).toContain('必须忠实采用本局列车长的人设与规则');
    expect(serializedPayload).toContain('铁面老周');
    expect(serializedPayload).toContain('从不相信事出有因');
    expect(serializedPayload).toContain('主动伤害不可原谅');
    expect(serializedPayload).toContain('急诊医生');
    expect(serializedPayload).toContain('在灾难中救下多人');
    expect(serializedPayload).toContain('主动为错误赔偿');
    expect(serializedPayload).toContain('照顾患病家人十年');
    expect(serializedPayload).toContain('不是目标人物本人发言');
  });

  it('uses independent schemas for final track and philosophical judgment decisions', async () => {
    const responses = [
      '{"crushedSeat":"b","survivor":"a","reason":"甲方更值得保留","decisiveFactors":["救人"],"fallback":false}',
      '{"title":"最后的道岔","summary":"双方都在交换生命","playerA":"甲方把功绩当筹码","playerB":"乙方把悔恨当赎金","conductorCritique":"列车长也在包装偏见","questions":["功绩能抵罪吗？","谁能为生命定价？"],"fallback":false}',
    ];
    const payloads: unknown[] = [];
    const gateway = createAiGateway({ createCompletion: async (payload) => ({ choices: [{ message: { content: responses[payloads.push(payload) - 1]! } }] }) });

    expect((await gateway.decideTrack(trackInput)).survivor).toBe('a');
    expect((await gateway.judgeMatch(judgmentInput)).questions).toHaveLength(2);
    expect(JSON.stringify(payloads[0])).toContain('偷走一百万元');
    expect(JSON.stringify(payloads[1])).toContain('不得辱骂玩家');
  });
});
