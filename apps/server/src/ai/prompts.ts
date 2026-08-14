import type OpenAI from 'openai';
import type { JudgmentInput, RoundDecisionInput, TrackDecisionInput } from '@ydi/contracts';

export type CompletionMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const roundSystem = '你是《活该》的AI列车长。必须忠实采用本局列车长的人设与规则，综合人物姓名、背景、词条、既有胜出论据和双方原始辩词裁决本回合。只返回JSON：winner为attack或defense，reason为理由，winningArgument为胜方可记录的原始核心论据，fallback固定false。';
const trackSystem = '你是《活该》的AI列车长。必须忠实采用本局列车长的人设与规则，综合两条轨道全部人物姓名、背景、词条、胜出论据以及三轮六段辩词，决定压死哪一边。只返回JSON：crushedSeat、survivor、reason、decisiveFactors、fallback固定false。';
const judgmentSystem = '你是《活该》的黑暗审判旁白。根据双方三轮攻防、目标选择和列车长决定，以反讽和哲学角度揭示自利、双重标准与生命定价。可以尖锐、恶趣味并引人深思；不得辱骂玩家、诊断精神疾病、宣称AI是绝对道德权威。只返回JSON：title、summary、playerA、playerB、conductorCritique、questions（恰好两个）、fallback固定false。';

function messages(system: string, input: unknown): CompletionMessage[] {
  return [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }];
}

export const buildRoundMessages = (input: RoundDecisionInput) => messages(roundSystem, input);
export const buildTrackMessages = (input: TrackDecisionInput) => messages(trackSystem, input);
export const buildJudgmentMessages = (input: JudgmentInput) => messages(judgmentSystem, input);
