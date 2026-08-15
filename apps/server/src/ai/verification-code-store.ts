import { randomInt } from 'node:crypto';

const CODE_TTL_MS = 5 * 60 * 1000;

export class VerificationCodeStore {
  private readonly codes = new Map<string, { openid: string; expiresAt: number }>();

  /** Generates a new 6-digit code tied to a WeChat openid, valid for five minutes. */
  create(openid: string) {
    const code = String(randomInt(100000, 1000000));
    this.codes.set(code, { openid, expiresAt: Date.now() + CODE_TTL_MS });
    return code;
  }

  /** Consumes a code exactly once; returns the openid or null when missing/expired. */
  consume(code: string) {
    const entry = this.codes.get(code);
    if (!entry) return null;
    this.codes.delete(code);
    if (entry.expiresAt < Date.now()) return null;
    return entry.openid;
  }

  /** Used by tests and the scheduler to observe/clear stale entries. */
  get size() {
    return this.codes.size;
  }

  clear() {
    this.codes.clear();
  }
}
