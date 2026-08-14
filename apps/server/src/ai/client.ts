import OpenAI from 'openai';
import type { DebateRoundVerdict, JudgmentInput, PhilosophyJudgment, RoundDecisionInput, TrackDecisionInput, TrackVerdict } from '@ydi/contracts';
import type { ZodType } from 'zod';
import { philosophyJudgmentSchema, roundVerdictSchema, trackVerdictSchema } from './schemas.js';
import { fallbackJudgment, fallbackRoundVerdict, fallbackTrackVerdict } from './fallback.js';
import { buildJudgmentMessages, buildRoundMessages, buildTrackMessages, type CompletionMessage } from './prompts.js';

type CompletionPayload = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & { thinking: { type: 'disabled' } };
type CompletionResponse = { choices: Array<{ message: { content: string | null } }> };
type Options = {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
  request?: (input: RoundDecisionInput) => Promise<unknown>;
  createCompletion?: (payload: CompletionPayload) => Promise<CompletionResponse>;
};

export type AiGateway = {
  decideRound(input: RoundDecisionInput): Promise<DebateRoundVerdict>;
  decideTrack(input: TrackDecisionInput): Promise<TrackVerdict>;
  judgeMatch(input: JudgmentInput): Promise<PhilosophyJudgment>;
};

export function resolveAiConfig(options: Options = {}) {
  return {
    apiKey: options.apiKey,
    baseURL: options.baseURL ?? process.env.DEEPSEEK_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.deepseek.com',
    model: options.model ?? process.env.DEEPSEEK_MODEL ?? process.env.OPENAI_MODEL ?? 'deepseek-v4-flash',
    timeoutMs: options.timeoutMs ?? Number(process.env.AI_TIMEOUT_MS ?? 30000),
  };
}

async function requestStructured<T>(schema: ZodType<T>, request: () => Promise<unknown>, fallback: () => T): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return schema.parse(await request());
    } catch {
      if (attempt === 2) return fallback();
    }
  }
  return fallback();
}

export function createAiGateway(options: Options = {}): AiGateway {
  const config = resolveAiConfig(options);
  const client = config.apiKey ? new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: config.timeoutMs }) : null;
  const createCompletion = options.createCompletion ?? (async (payload: CompletionPayload) => {
    if (!client) throw new Error('AI is not configured');
    return client.chat.completions.create(payload);
  });
  const complete = async (messages: CompletionMessage[]) => {
    const response = await createCompletion({
      model: config.model,
      response_format: { type: 'json_object' },
      messages,
      thinking: { type: 'disabled' },
    });
    return JSON.parse(response.choices[0]?.message.content ?? '{}') as unknown;
  };

  return {
    decideRound: (input) => requestStructured(roundVerdictSchema, () => options.request ? options.request(input) : complete(buildRoundMessages(input)), () => fallbackRoundVerdict(input)),
    decideTrack: (input) => requestStructured(trackVerdictSchema, () => complete(buildTrackMessages(input)), () => fallbackTrackVerdict(input)),
    judgeMatch: (input) => requestStructured(philosophyJudgmentSchema, () => complete(buildJudgmentMessages(input)), () => fallbackJudgment(input)),
  };
}

export async function testAiConnection(apiKey: string, options: Omit<Options, 'apiKey' | 'request'> = {}) {
  const config = resolveAiConfig({ ...options, apiKey });
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: config.timeoutMs });
  const createCompletion = options.createCompletion ?? ((payload: CompletionPayload) => client.chat.completions.create(payload));
  await createCompletion({
    model: config.model,
    messages: [{ role: 'user', content: 'Return an empty JSON object.' }],
    response_format: { type: 'json_object' },
    max_tokens: 1,
    thinking: { type: 'disabled' },
  });
  return { ok: true as const };
}
