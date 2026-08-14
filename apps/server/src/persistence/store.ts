import Database from 'better-sqlite3';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { roomsTable } from './schema.js';

export class GameStore {
  private readonly db: Database.Database;
  private readonly orm: BetterSQLite3Database;
  private readonly queues = new Map<string, Promise<unknown>>();
  constructor(path: string) {
    this.db = new Database(path);
    this.orm = drizzle(this.db);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, snapshot TEXT NOT NULL, expires_at TEXT, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS commands (room_code TEXT NOT NULL, command_id TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(room_code, command_id)); CREATE TABLE IF NOT EXISTS ai_events (id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT NOT NULL, purpose TEXT NOT NULL, status TEXT NOT NULL, latency_ms INTEGER NOT NULL, created_at TEXT NOT NULL);`);
  }
  saveRoom(code: string, snapshot: unknown, expiresAt: string | null) { this.orm.insert(roomsTable).values({ code, snapshot: JSON.stringify(snapshot), expiresAt, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: roomsTable.code, set: { snapshot: JSON.stringify(snapshot), expiresAt, updatedAt: new Date().toISOString() } }).run(); }
  loadRoom<T>(code: string): T | null { const row = this.orm.select({ snapshot: roomsTable.snapshot }).from(roomsTable).where(eq(roomsTable.code, code)).get(); return row ? JSON.parse(row.snapshot) as T : null; }
  loadActive<T>(): T[] { return this.orm.select({ snapshot: roomsTable.snapshot }).from(roomsTable).where(or(isNull(roomsTable.expiresAt), gt(roomsTable.expiresAt, new Date().toISOString()))).all().map((row) => JSON.parse(row.snapshot) as T); }
  cleanup(now = new Date()) { return this.orm.delete(roomsTable).where(and(lt(roomsTable.expiresAt, now.toISOString()))).run().changes; }
  hasCommand(roomCode: string, commandId: string) { return Boolean(this.db.prepare('SELECT 1 FROM commands WHERE room_code = ? AND command_id = ?').get(roomCode, commandId)); }
  saveCommand(roomCode: string, commandId: string, result: unknown = { ok: true }) { this.db.prepare('INSERT OR IGNORE INTO commands(room_code, command_id, result) VALUES(?,?,?)').run(roomCode, commandId, JSON.stringify(result)); }
  async runExclusive<T>(key: string, work: () => Promise<T> | T): Promise<T> { const previous = this.queues.get(key) ?? Promise.resolve(); let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); this.queues.set(key, previous.then(() => gate)); await previous; try { return await work(); } finally { release(); if (this.queues.get(key) === gate) this.queues.delete(key); } }
  close() { this.db.close(); }
}
