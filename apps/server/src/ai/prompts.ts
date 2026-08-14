import type OpenAI from 'openai';
import type { JudgmentInput, RoundDecisionInput, TrackDecisionInput } from '@ydi/contracts';

export type CompletionMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const speakerRule = '发言者是躺在甲乙两条轨道上的真实玩家，正在替自己及自己所在轨道辩护；这些消息不是目标人物本人发言，目标人物只是本轮被攻击或维护的对象。';
const roundSystem = `你是《活该》的AI列车长。必须忠实采用本局列车长的人设与规则。${speakerRule}综合目标人物姓名、背景、词条、既有胜出辩词和按顺序排列的全部聊天消息裁决本回合。conductorMessage必须像当前列车长按其人设当面说出口的话，简短复述关键交锋、明确宣布胜方并说明理由，避免报告式和通用AI腔。debateSummary必须同时整理双方观点、直接交锋、主要分歧和决定胜负的节点。winningSummary只能总结胜方实际发送的消息，不得混入败方观点或编造新事实。只返回JSON：winnerSeat为a或b、conductorMessage、debateSummary、winningSummary、fallback固定false。`;
const trackSystem = `你是《活该》的AI列车长。必须忠实采用本局列车长的人设与规则。${speakerRule}综合两条轨道全部人物姓名、背景、词条、胜出辩词，以及三轮有序原始消息、debateSummary和winningSummary，决定压死哪一边。只返回JSON：crushedSeat、survivor、reason、decisiveFactors、fallback固定false。`;
const judgmentSystem = `你是《活该》的黑暗审判旁白。${speakerRule}根据双方三轮有序原始消息、每轮debateSummary与winningSummary、目标选择和列车长决定，以反讽和哲学角度揭示自利、双重标准与生命定价。可以尖锐、恶趣味并引人深思；不得辱骂玩家、诊断精神疾病、宣称AI是绝对道德权威。只返回JSON：title、summary、playerA、playerB、conductorCritique、questions（恰好两个）、fallback固定false。`;

function messages(system: string, input: unknown): CompletionMessage[] {
  return [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }];
}

export const buildRoundMessages = (input: RoundDecisionInput) => messages(roundSystem, input);
export const buildTrackMessages = (input: TrackDecisionInput) => messages(trackSystem, input);
export const buildJudgmentMessages = (input: JudgmentInput) => messages(judgmentSystem, input);
