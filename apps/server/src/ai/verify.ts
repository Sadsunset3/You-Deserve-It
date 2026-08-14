import { createAiGateway, resolveAiConfig } from './client.js';

const apiKey = process.argv[2]?.trim();
if (!apiKey) throw new Error('Pass a DeepSeek Key as the first argument');
const config = resolveAiConfig({ apiKey });

const startedAt = Date.now();
const verdict = await createAiGateway({ apiKey }).decideRound({
  seed: 'deepseek-live-verification',
  conductor: { id: 'moral', name: '极端道德主义列车长', persona: '我会紧盯一个人跨过的底线，同时检验补救行为是否真实。', rule: '对严重的道德污点零容忍，但承认真实补救行为。', bias: -2 },
  round: 1,
  attacker: 'a',
  defender: 'b',
  target: { id: 'repentant-fraud', name: '悔过的骗子', alignment: 'evil', background: '一个曾经犯错、如今试图弥补的人。', portrait: 'css://verify', traits: [{ id: 'repent', text: '悔过', tag: '补救', polarity: 1 }], arguments: [] },
  attack: '该人物曾经欺骗无辜者，造成了实际损失。',
  defense: '该人物后来主动赔偿，并协助避免了更大的损失。',
  priorRounds: [],
});

const summary = { model: config.model, elapsedMs: Date.now() - startedAt, winner: verdict.winner, fallback: verdict.fallback };
console.log(JSON.stringify(summary));
if (verdict.fallback) throw new Error('DeepSeek request failed and the gateway used its local fallback');
