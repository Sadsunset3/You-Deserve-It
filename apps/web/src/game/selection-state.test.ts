import { describe, expect, it } from 'vitest';
import {
  placeCharacter,
  removeCharacter,
  selectedCharacterIds,
} from './selection-state';

describe('selection state', () => {
  it('fills an empty target slot with a new character', () => {
    expect(placeCharacter([null, null], 'a', 0)).toEqual(['a', null]);
  });

  it('moves an already selected character to an empty slot', () => {
    expect(placeCharacter(['a', null], 'a', 1)).toEqual([null, 'a']);
  });

  it('swaps an already selected character with the occupied target slot', () => {
    expect(placeCharacter(['a', 'b'], 'a', 1)).toEqual(['b', 'a']);
  });

  it('normalizes duplicate selected IDs by retaining the target slot', () => {
    expect(placeCharacter(['a', 'a'], 'a', 0)).toEqual(['a', null]);
  });

  it('replaces an occupied slot when placing an unslotted character', () => {
    const result = placeCharacter(['a', 'b'], 'c', 0);

    expect(result).toEqual(['c', 'b']);
    expect(new Set(result.filter((id): id is string => id !== null)).size).toBe(2);
  });

  it('removes only the matching character', () => {
    expect(removeCharacter(['a', 'b'], 'a')).toEqual([null, 'b']);
  });

  it('removes every duplicate residual of a character', () => {
    expect(removeCharacter(['a', 'a'], 'a')).toEqual([null, null]);
  });

  it('returns a safe equal tuple when removing an absent character', () => {
    const slots: [string | null, string | null] = ['a', 'b'];
    const result = removeCharacter(slots, 'c');

    expect(result).toEqual(slots);
    expect(result).not.toBe(slots);
  });

  it('returns selected character IDs in slot order', () => {
    expect(selectedCharacterIds(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('returns each selected ID once in first-slot order', () => {
    expect(selectedCharacterIds(['a', 'a'])).toEqual(['a']);
  });

  it('never mutates its input and always creates new results', () => {
    const slots: [string | null, string | null] = ['a', 'b'];

    const placed = placeCharacter(slots, 'a', 1);
    const removed = removeCharacter(slots, 'a');
    const selected = selectedCharacterIds(slots);

    expect(slots).toEqual(['a', 'b']);
    expect(placed).not.toBe(slots);
    expect(removed).not.toBe(slots);
    expect(selected).not.toBe(slots);
  });

  it('returns a fresh ordered array of selected IDs', () => {
    const slots: [string | null, string | null] = ['a', 'b'];
    const selected = selectedCharacterIds(slots);

    expect(selected).toEqual(['a', 'b']);
    expect(selected).not.toBe(slots);
  });
});
