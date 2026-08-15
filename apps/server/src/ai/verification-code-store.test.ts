import { afterEach, describe, expect, it, vi } from 'vitest';
import { VerificationCodeStore } from './verification-code-store';
import { FreeTokenGrantStore } from './free-token-grant-store';

afterEach(() => vi.useRealTimers());

describe('VerificationCodeStore', () => {
  it('issues a six-digit code that is consumed exactly once', () => {
    const store = new VerificationCodeStore();
    const code = store.create('openid-1');
    expect(code).toMatch(/^\d{6}$/);
    expect(store.consume(code)).toBe('openid-1');
    expect(store.consume(code)).toBeNull();
  });

  it('rejects expired codes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T00:00:00Z'));
    const store = new VerificationCodeStore();
    const code = store.create('openid-1');
    vi.setSystemTime(new Date('2026-08-15T00:05:01Z'));
    expect(store.consume(code)).toBeNull();
  });
});

describe('FreeTokenGrantStore', () => {
  it('grants and revokes a session by time window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T00:00:00Z'));
    const grants = new FreeTokenGrantStore();
    expect(grants.has('player-1')).toBe(false);
    grants.grant('player-1', 60 * 60 * 1000);
    expect(grants.has('player-1')).toBe(true);
    vi.setSystemTime(new Date('2026-08-15T01:00:01Z'));
    expect(grants.has('player-1')).toBe(false);
  });
});
