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
  const crushedName = input.players[crushedSeat].nickname;
  const survivorName = input.players[survivor].nickname;
  return {
    crushedSeat,
    survivor,
    reason: 'AI 暂时离席，列车按人物背景、词条、胜出论据与本局人格完成了降级压轨。',
    speech: `行了，我把两条轨道的人都看了一遍。按“${input.conductor.rule}”这把尺子，${survivorName}这边更值得留；${crushedName}那边，只能说这列火车替你们选了。别问我对不对，我只负责拉杆。`,
    decisiveFactors: [`${survivor.toUpperCase()} 轨人物与论据的综合权重更高`, `列车长规则：${input.conductor.rule}`],
    fallback: true,
  };
}

export function fallbackJudgment(input: JudgmentInput): PhilosophyJudgment {
  const line = (text: string) => text.slice(0, 180);
  const name = (seat: Seat) => input.players[seat].nickname;
  const allCharacters = [...input.tracks.a, ...input.tracks.b];
  const targetName = (id: string) => allCharacters.find((character) => character.id === id)?.name ?? '';
  const playerLines = (side: Seat): [string, string] => {
    const rounds = input.rounds.map((round) => {
      const words = round.messages.filter((message) => message.sender === side && message.text.trim()).map((message) => message.text.trim().slice(0, 30)).join('；');
      const target = round.targetId ? targetName(round.targetId) : '';
      return `第${round.round}轮针对${target || '目标'}：“${words || '没有留下实质发言'}”`;
    });
    return [
      line(`${name(side)}：${rounds.join('；')}。`),
      line('为了活下来，他把道德标准调到了最顺手的档位。'),
    ];
  };
  const debatedNames = [...new Set(input.rounds.map((round) => (round.targetId ? targetName(round.targetId) : '')).filter(Boolean))].join('、');
  return {
    title: '列车离席之后',
    stanzas: [
      { kind: 'opening', lines: [line(`列车压过了${name(input.verdict.crushedSeat)}所在的轨道。`), line(`${name(input.verdict.survivor)}活了下来，但说不上为什么。`)] },
      { kind: 'player-a', lines: playerLines('a') },
      { kind: 'player-b', lines: playerLines('b') },
      { kind: 'tracks', lines: [line(`被推上辩论席的目标：${debatedNames || '无人'}。`), line('没人替剩下的人物开口，不是他们无罪，是辩护无利可图。')] },
      { kind: 'verdict', lines: [line(`${input.conductor.name}依照“${input.conductor.rule}”落槌。`), line('他活了下来，原则没有。')] },
    ],
    fallback: true,
  };
}
