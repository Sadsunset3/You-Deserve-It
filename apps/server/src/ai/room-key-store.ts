export class RoomAiKeyStore {
  private readonly keys = new Map<string, string>();

  set(roomCode: string, apiKey: string) { this.keys.set(roomCode, apiKey); }
  get(roomCode: string) { return this.keys.get(roomCode); }
  has(roomCode: string) { return this.keys.has(roomCode); }
  delete(roomCode: string) { return this.keys.delete(roomCode); }
  codes() { return [...this.keys.keys()]; }
}
