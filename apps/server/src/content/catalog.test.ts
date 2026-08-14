import { describe, expect, it } from 'vitest';
import { catalog, dealHands, pickConductor, validateCatalog } from './catalog';

describe('built-in catalog', () => {
  it('contains enough reviewed content for a match', () => {
    expect(validateCatalog(catalog)).toEqual({ good: 33, evil: 32, traits: 24, conductors: 25 });
    expect(catalog.characters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '警察', alignment: 'good', background: '在一次持刀袭击中保护群众，自己因此身受重伤。' }),
      expect.objectContaining({ name: '列车长的儿子', alignment: 'evil' }),
      expect.objectContaining({ name: '外星叛徒', alignment: 'good' }),
    ]));
    expect(new Set(catalog.characters.map((card) => `${card.alignment}:${card.name}`)).size).toBe(catalog.characters.length);
  });

  it('includes every added conductor persona with a complete DeepSeek rule', () => {
    const addedNames = [
      '功德银行行长', '恶人鉴赏家', '圣母列车长', '键盘侠', '成功学大师',
      '末日生存专家', '恋爱脑', '被裁员的程序员', '颜值即正义之神', '阴谋论大师',
      '报应管理员', '宇宙真人秀观众', '哲学系研究生', '预言崇拜者', '猫狗保护协会会长',
      '短视频算法成精', '厌童老人', '列车长他妈', 'HR 列车长', '甲方列车长',
    ];

    expect(catalog.conductors.map(({ name }) => name)).toEqual(expect.arrayContaining(addedNames));
    expect(new Set(catalog.conductors.map(({ id }) => id)).size).toBe(catalog.conductors.length);
    for (const conductor of catalog.conductors.filter(({ name }) => addedNames.includes(name))) {
      expect(conductor.persona.length).toBeGreaterThan(10);
      expect(conductor.rule.length).toBeGreaterThan(10);
    }
  });

  it('deals each player one good and one evil character per configured game with the same number of traits', () => {
    for (const games of [1, 3, 5]) {
      const [a, b] = dealHands(catalog, () => 0.42, games);
      for (const hand of [a, b]) {
        expect(hand.characters.filter((card) => card.alignment === 'good')).toHaveLength(games);
        expect(hand.characters.filter((card) => card.alignment === 'evil')).toHaveLength(games);
        expect(hand.traits).toHaveLength(games * 2);
        expect(new Set(hand.characters.map(({ id }) => id)).size).toBe(games * 2);
        expect(new Set(hand.traits.map(({ id }) => id)).size).toBe(games * 2);
      }
      expect(new Set([...a.characters, ...b.characters].map(({ id }) => id)).size).toBe(games * 4);
      expect(new Set([...a.traits, ...b.traits].map(({ id }) => id)).size).toBe(games * 4);
    }
  });

  it('picks a deterministic conductor using the injected random source', () => {
    expect(pickConductor(catalog, () => 0.12)).toEqual(catalog.conductors[3]);
  });

  it('rejects a catalog conductor without a persona', () => {
    const withoutPersona = {
      ...catalog,
      conductors: catalog.conductors.map((conductor, index) => index === 0
        ? Object.fromEntries(Object.entries(conductor).filter(([key]) => key !== 'persona'))
        : conductor),
    };

    expect(() => validateCatalog(withoutPersona as typeof catalog)).toThrow();
  });
});
