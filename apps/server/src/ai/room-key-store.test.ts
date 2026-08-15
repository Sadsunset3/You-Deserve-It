import { describe, expect, it } from 'vitest';
import { RoomAiKeyStore } from './room-key-store';

describe('RoomAiKeyStore', () => {
  it('isolates credentials by room and deletes them at the end of a match', () => {
    const keys = new RoomAiKeyStore();
    keys.set('ROOMA1', { provider: 'user', apiKey: 'key-a' });
    keys.set('ROOMB2', { provider: 'agnes' });

    expect(keys.get('ROOMA1')).toEqual({ provider: 'user', apiKey: 'key-a' });
    expect(keys.get('ROOMB2')).toEqual({ provider: 'agnes' });
    expect(keys.delete('ROOMA1')).toBe(true);
    expect(keys.get('ROOMA1')).toBeUndefined();
    expect(keys.get('ROOMB2')).toEqual({ provider: 'agnes' });
  });
});
