import { createHash } from 'node:crypto';
import type { Alignment, JudgmentInput, PhilosophyJudgment, RoundDecisionInput, RoundVerdict, TrackDecisionInput, TrackVerdict, Verdict } from '@ydi/contracts';

export function fallbackVerdict(input: { seed: string; alignment: Alignment; traitPolarity: number; attack: string; defense: string; conductorBias: number }): Verdict {
  const alignmentScore = input.alignment === 'good' ? 1 : -1;
  const evidence = alignmentScore + input.traitPolarity + input.conductorBias + (input.defense.trim().length - input.attack.trim().length) / 200;
  const tie = Number.parseInt(createHash('sha256').update(input.seed).digest('hex').slice(0, 4), 16) % 2;
  const winner = evidence === 0 ? (tie ? 'defense' : 'attack') : evidence > 0 ? 'defense' : 'attack';
  return { winner, reason: 'AI 暂时离席，列车按本局人格与已知事实完成了降级裁决。', coreArgument: winner === 'defense' ? '现有事实仍留下了被宽恕的空间。' : '现有事实不足以证明他值得被保留。', fallback: true };
}

function stableTie(seed: string) {
  return Number.parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16) % 2;
}

function characterScore(character: TrackDecisionInput['tracks']['a'][number], conductorBias: number) {
  const alignment = character.alignment === 'good' ? 3 : -3;
  const traits = character.traits.reduce((sum, trait) => sum + trait.polarity, 0);
  const argumentsScore = character.arguments.reduce((sum, item) => sum + Math.min(item.text.trim().length, 240) / 120, 0);
  return alignment + traits + argumentsScore + conductorBias * (character.alignment === 'good' ? 0.25 : -0.25);
}

export function fallbackRoundVerdict(input: RoundDecisionInput): RoundVerdict {
  const traitPolarity = input.target.traits.reduce((sum, trait) => sum + trait.polarity, 0);
  const legacy = fallbackVerdict({
    seed: input.seed,
    alignment: input.target.alignment,
    traitPolarity,
    attack: input.attack,
    defense: input.defense,
    conductorBias: input.conductor.bias,
  });
  return {
    winner: legacy.winner,
    reason: legacy.reason,
    winningArgument: legacy.winner === 'attack' ? (input.attack.trim() || legacy.coreArgument) : (input.defense.trim() || legacy.coreArgument),
    fallback: true,
  };
}

export function fallbackTrackVerdict(input: TrackDecisionInput): TrackVerdict {
  const score = (seat: 'a' | 'b') => input.tracks[seat].reduce((sum, character) => sum + characterScore(character, input.conductor.bias), 0);
  const a = score('a');
  const b = score('b');
  const survivor = a === b ? (stableTie(input.seed) ? 'a' : 'b') : a > b ? 'a' : 'b';
  const crushedSeat = survivor === 'a' ? 'b' : 'a';
  return {
    crushedSeat,
    survivor,
    reason: 'AI 暂时离席，列车按人物背景、词条、胜出论据与本局人格完成了降级压轨。',
    decisiveFactors: [`${survivor.toUpperCase()} 轨人物与论据的综合权重更高`, `列车长规则：${input.conductor.rule}`],
    fallback: true,
  };
}

export function fallbackJudgment(input: JudgmentInput): PhilosophyJudgment {
  const describe = (seat: 'a' | 'b') => `${input.players[seat].nickname}选择了${input.tracks[seat].map((character) => character.name).join('、')}，并在三轮中留下${input.rounds.filter((round) => round.attacker === seat || round.defender === seat).length}次辩护痕迹。`;
  return {
    title: '列车离席之后',
    summary: `六段辩词没有让生命变得可计算，只让${input.verdict.crushedSeat.toUpperCase()}轨成为了这次秩序的代价。`,
    playerA: `${describe('a')}功绩被当作筹码，过错也被当作方便的砝码。`,
    playerB: `${describe('b')}所谓原则，往往只在它不会压到自己时显得坚固。`,
    conductorCritique: `列车长以“${input.conductor.rule}”命名自己的偏见，再把${input.verdict.reason}称作判断。`,
    questions: ['如果轨道上的名字换成你爱的人，同一套原则还成立吗？', '当生命必须被比较时，谁赋予了比较者清白？'],
    fallback: true,
  };
}
