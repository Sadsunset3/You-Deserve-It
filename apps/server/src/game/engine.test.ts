import { describe, expect, it } from 'vitest';
import { createGame, selectCharacters, autoSelectCharacters, attachTrait, submitAttack, submitDefense, applyVerdict } from './engine';
import { catalog, dealHands } from '../content/catalog';

const makeGame = () => {
  const [a, b] = dealHands(catalog, () => 0.33);
  return createGame('room01', ['alice', 'bob'], { alice: a, bob: b }, catalog.conductors[0]!);
};

describe('game engine', () => {
  it('locks exactly two unused characters for a player', () => {
    const game = makeGame();
    const ids = game.hands.alice!.characters.slice(0, 2).map(({ id }) => id);
    const next = selectCharacters(game, 'alice', ids);
    expect(next.selections.alice).toEqual(ids);
    expect(next.version).toBe(2);
    expect(() => selectCharacters(next, 'alice', ids)).toThrow(/already selected/i);
  });

  it('deterministically fills missing selection on timeout', () => {
    const game = makeGame();
    expect(autoSelectCharacters(game, 'alice').selections.alice).toEqual(game.hands.alice!.characters.map(({ id }) => id).sort().slice(0, 2));
  });

  it('attaches a trait to either side and consumes it', () => {
    let game = makeGame();
    game = selectCharacters(game, 'alice', game.hands.alice!.characters.slice(0, 2).map(({ id }) => id));
    game = selectCharacters(game, 'bob', game.hands.bob!.characters.slice(0, 2).map(({ id }) => id));
    const trait = game.hands.alice!.traits[0]!;
    const target = game.selections.bob![0]!;
    game = attachTrait(game, 'alice', trait.id, target);
    expect(game.characterState[target]?.traitIds).toContain(trait.id);
    expect(game.usedTraitIds.alice).toContain(trait.id);
  });

  it('locks one attack and defense then stores only the winning argument', () => {
    let game = makeGame();
    game = selectCharacters(game, 'alice', game.hands.alice!.characters.slice(0, 2).map(({ id }) => id));
    game = selectCharacters(game, 'bob', game.hands.bob!.characters.slice(0, 2).map(({ id }) => id));
    game = submitAttack(game, 'alice', game.selections.bob![0]!, '他不值得活。');
    expect(() => submitAttack(game, 'alice', game.selections.bob![0]!, '再次攻击')).toThrow();
    game = submitDefense(game, 'bob', '一次错误不能定义一生。');
    game = applyVerdict(game, { winner: 'defense', reason: '防守更符合人格', coreArgument: '人可以被改变', fallback: false });
    expect(game.characterState[game.debate!.targetId]?.arguments).toEqual([{ kind: 'defense', text: '人可以被改变' }]);
  });
});
