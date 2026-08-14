import { afterEach, describe, expect, it } from 'vitest';
import { GameStore } from './store';

describe('GameStore', () => {
  const stores: GameStore[] = [];
  afterEach(() => stores.splice(0).forEach((store) => store.close()));

  it('persists and restores a room snapshot', () => {
    const store = new GameStore(':memory:'); stores.push(store);
    store.saveRoom('ABC234', { phase: 'waiting', version: 1 }, null);
    expect(store.loadRoom('ABC234')).toEqual({ phase: 'waiting', version: 1 });
  });

  it('serializes room commands in submission order', async () => {
    const store = new GameStore(':memory:'); stores.push(store); const values: number[] = [];
    await Promise.all([store.runExclusive('A', async () => { await new Promise((r) => setTimeout(r, 5)); values.push(1); }), store.runExclusive('A', async () => { values.push(2); })]);
    expect(values).toEqual([1, 2]);
  });

  it('records command ids for idempotent retries', () => {
    const store = new GameStore(':memory:'); stores.push(store);
    expect(store.hasCommand('A', 'cmd-1')).toBe(false); store.saveCommand('A', 'cmd-1'); store.saveCommand('A', 'cmd-1'); expect(store.hasCommand('A', 'cmd-1')).toBe(true);
  });
});
