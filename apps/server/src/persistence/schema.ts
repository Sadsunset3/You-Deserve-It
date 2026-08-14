import { integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';

export const roomsTable = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  snapshot: text('snapshot').notNull(),
  expiresAt: text('expires_at'),
  updatedAt: text('updated_at').notNull(),
});

export const commandsTable = sqliteTable('commands', {
  roomCode: text('room_code').notNull(),
  commandId: text('command_id').notNull(),
  result: text('result').notNull(),
}, (table) => [primaryKey({ columns: [table.roomCode, table.commandId] })]);

export const aiEventsTable = sqliteTable('ai_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomCode: text('room_code').notNull(),
  purpose: text('purpose').notNull(),
  status: text('status').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  createdAt: text('created_at').notNull(),
});
