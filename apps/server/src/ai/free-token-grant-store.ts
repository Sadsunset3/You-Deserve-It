export class FreeTokenGrantStore {
  private readonly grants = new Map<string, number>();

  /** Grants free-token usage to a player session until `ttlMs` from now. */
  grant(playerId: string, ttlMs: number) {
    this.grants.set(playerId, Date.now() + ttlMs);
  }

  /** Returns true while an unexpired grant exists for this player session. */
  has(playerId: string) {
    const expiresAt = this.grants.get(playerId);
    if (expiresAt === undefined) return false;
    if (expiresAt < Date.now()) {
      this.grants.delete(playerId);
      return false;
    }
    return true;
  }
}
