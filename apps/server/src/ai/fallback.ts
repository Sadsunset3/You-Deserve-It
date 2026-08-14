import { createHash } from 'node:crypto';
import type { Alignment, DebateRoundVerdict, JudgmentInput, PhilosophyJudgment, RoundDecisionInput, Seat, TrackDecisionInput, TrackVerdict } from '@ydi/contracts';

type LegacyVerdict = { winner: 'attack' | 'defense'; reason: string; coreArgument: string; fallback: true };

export function fallbackVerdict(input: { seed: string; alignment: Alignment; traitPolarity: number; attack: string; defense: string; conductorBias: number }): LegacyVerdict {
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

function summarizeMessages(input: RoundDecisionInput, seats: Seat[]) {
  const names = new Set(seats);
  const messages = input.messages.filter((message) => names.has(message.sender) && message.text.trim());
  return messages.length > 0
    ? messages.map((message) => `${input.players[message.sender].nickname}：${message.text.trim()}`).join('；')
    : '这一方没有留下实质发言。';
}

export function fallbackRoundVerdict(input: RoundDecisionInput): DebateRoundVerdict {
  const traitPolarity = input.target.traits.reduce((sum, trait) => sum + trait.polarity, 0);
  const attack = input.messages.filter((message) => message.sender === input.attacker).map((message) => message.text).join('\n');
  const defense = input.messages.filter((message) => message.sender === input.defender).map((message) => message.text).join('\n');
  const legacy = fallbackVerdict({
    seed: input.seed,
    alignment: input.target.alignment,
    traitPolarity,
    attack,
    defense,
    conductorBias: input.conductor.bias,
  });
  const winnerSeat = legacy.winner === 'attack' ? input.attacker : input.defender;
  const winnerName = input.players[winnerSeat].nickname;
  return {
    winnerSeat,
    conductorMessage: `行了，列车长替这场争论收个口。按“${input.conductor.rule}”这把尺子，${winnerName}这一轮更站得住，我判${winnerName}赢。`,
    debateSummary: summarizeMessages(input, [input.attacker, input.defender]),
    winningSummary: summarizeMessages(input, [winnerSeat]),
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
  const line = (text: string) => text.slice(0, 180);
  const trackNames = (seat: Seat) => input.tracks[seat].map((character) => character.name).join('、') || '无人留下姓名';
  const trackBackgrounds = (seat: Seat) => input.tracks[seat].map((character) => `${character.name}：${character.background}`).join('；') || '没有人物背景';
  const playerLines = (seat: Seat): [string, string] => {
    const roundArguments = input.rounds.map((round) => {
      const speech = round.messages.find((message) => message.sender === seat && message.text.trim())?.text.trim();
      return `第${round.round}轮“${(speech ?? '没有实质发言').slice(0, 36)}”`;
    });
    const roundResults = input.rounds.map((round) => round.verdict.winnerSeat === seat
      ? `第${round.round}轮胜在“${round.verdict.winningSummary.slice(0, 34)}”`
      : `第${round.round}轮未能说服列车长`);
    return [
      line(roundArguments.length > 0 ? `${input.players[seat].nickname}守着${seat.toUpperCase()}轨：${roundArguments.join('；')}，` : `${input.players[seat].nickname}守着${seat.toUpperCase()}轨，却没有留下完整辩词，`),
      line(roundResults.length > 0 ? `${roundResults.join('；')}。` : '没有一轮裁决可供这条轨道申辩。'),
    ];
  };
  return {
    title: '列车离席之后',
    stanzas: [
      { kind: 'opening', lines: ['三轮话音落进枕木之间，', '这一夜终于只剩一条轨道可以天亮。'] },
      { kind: 'player-a', lines: playerLines('a') },
      { kind: 'player-b', lines: playerLines('b') },
      { kind: 'tracks', lines: [line(`A轨留下${trackNames('a')}：${trackBackgrounds('a')}，`), line(`B轨留下${trackNames('b')}：${trackBackgrounds('b')}。`)] },
      { kind: 'verdict', lines: [line(`${input.conductor.name}依照“${input.conductor.rule}”拉下拉杆，`), line(`${input.verdict.survivor.toUpperCase()}轨幸存，${input.verdict.crushedSeat.toUpperCase()}轨被压过：${input.verdict.reason}`)] },
    ],
    fallback: true,
  };
}
