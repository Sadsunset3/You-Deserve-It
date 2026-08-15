import type { PublicCharacter, RoomView } from '@ydi/contracts';

export const characters: PublicCharacter[] = [
  { id: 'a0', name: '消防员', alignment: 'good', background: '冲进火场救出十二个人。', portrait: '/a0.svg', traits: [], arguments: [] },
  { id: 'a1', name: '科学家', alignment: 'good', background: '研发低成本净水技术。', portrait: '/a1.svg', traits: [], arguments: [] },
  { id: 'a2', name: '小偷', alignment: 'evil', background: '偷走富豪一百万元。', portrait: '/a2.svg', traits: [], arguments: [] },
  { id: 'b0', name: '警察', alignment: 'good', background: '保护群众时身受重伤。', portrait: '/b0.svg', traits: [], arguments: [] },
  { id: 'b1', name: '医生', alignment: 'good', background: '救治过上千名患者。', portrait: '/b1.svg', traits: [], arguments: [] },
  { id: 'b2', name: '诈骗犯', alignment: 'evil', background: '骗走老人五百万元。', portrait: '/b2.svg', traits: [], arguments: [] },
];

export function makeRoom(overrides: Partial<RoomView> = {}): RoomView {
  return {
    roomCode: 'ABC234', phase: 'target-selecting', version: 7, round: 1, game: 1,
    config: { games: 3, debateMinutes: 5 },
    conductor: { id: 'c', name: '铁面列车长', persona: '从不相信借口。', rule: '事实优先。', bias: 0 }, deadline: null,
    me: { playerId: 'p1', nickname: '甲方', seat: 'a', ready: true, connected: true }, opponent: { nickname: '乙方', ready: true, connected: true },
    opponentRemaining: { good: 2, evil: 2, traits: 4 },
    traitReadiness: { mine: false, opponent: false },
    hand: { characters: [], traits: [] }, selections: { mine: ['a1', 'a2'], opponent: ['b1', 'b2'] }, automaticCharacters: { mine: 'a0', opponent: 'b0' },
    characters, roundAttacker: 'a', currentTargetId: null, debateMessages: [], messageSequence: 0, roundVerdict: null, roundResultReady: { mine: false, opponent: false }, roundRecords: [],
    trackVerdict: null, judgment: null, nextGameReady: { a: false, b: false },
    scores: { a: 0, b: 0 }, finalResult: null, ...overrides,
  };
}
