import { describe, expect, it } from 'vitest';
import { RoomAiKeyStore } from './room-key-store';

describe('RoomAiKeyStore', () => {
  it('isolates keys by room and deletes them at the end of a match', () => {
    const keys = new RoomAiKeyStore();
    keys.set('ROOMA1', 'key-a');
    keys.set('ROOMB2', 'key-b');

    expect(keys.get('ROOMA1')).toBe('key-a');
    expect(keys.get('ROOMB2')).toBe('key-b');
    expect(keys.delete('ROOMA1')).toBe(true);
    expect(keys.get('ROOMA1')).toBeUndefined();
    expect(keys.get('ROOMB2')).toBe('key-b');
  });
});
