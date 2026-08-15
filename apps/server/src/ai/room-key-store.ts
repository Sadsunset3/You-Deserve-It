export type RoomAiCredential =
  | { provider: 'user'; apiKey: string }
  | { provider: 'agnes' };

export class RoomAiKeyStore {
  private readonly keys = new Map<string, RoomAiCredential>();

  set(roomCode: string, credential: RoomAiCredential) { this.keys.set(roomCode, credential); }
  get(roomCode: string) { return this.keys.get(roomCode); }
  has(roomCode: string) { return this.keys.has(roomCode); }
  delete(roomCode: string) { return this.keys.delete(roomCode); }
  codes() { return [...this.keys.keys()]; }
}
