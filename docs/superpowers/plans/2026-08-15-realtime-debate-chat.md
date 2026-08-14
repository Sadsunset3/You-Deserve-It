# Realtime Debate Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single attack/defense modal flow with a server-authoritative realtime debate room, configurable timing, immediate disconnect loss, persona-driven conductor verdict messages, and persisted per-round summaries.

**Architecture:** `RoomManager` remains the authoritative state machine and persistence boundary. Chat messages use an append-only idempotent command that is independent of the room version, while target selection and phase changes remain versioned. A server tick atomically closes expired chats and emits typed adjudication work for the AI gateway; Socket.IO broadcasts player-specific views after every accepted message and transition.

**Tech Stack:** TypeScript 6, React, Vite, Fastify, Socket.IO, Zod, OpenAI-compatible DeepSeek API, Vitest, Testing Library, SQLite/Drizzle.

## Global Constraints

- Room creation supports `timed` and `unlimited`; unlimited applies only to selecting and trait placement.
- Timed defaults are 180 seconds for selecting and 180 seconds for traits.
- Debate duration is always enforced, defaults to 5 minutes, and accepts only integer minutes from 3 through 10.
- A target must be locked before the debate clock starts.
- Both players may send any number of messages during the debate; each non-empty message is at most 2000 characters.
- Player messages represent the real players defending themselves and their track, never speech spoken by the target character.
- Every round persists both a complete two-sided `debateSummary` and a winner-only `winningSummary`.
- Only `winningSummary` is attached to the target character as a winning argument.
- After a round expires, no more messages are accepted; the conductor posts one persona-consistent conversational verdict message and the server advances automatically.
- Every in-room page displays both players' connection state.
- Waiting-room disconnects only change presence. From `selecting` onward, losing the last room socket immediately ends the match and awards the opponent the win; the old match cannot resume.
- Preserve command idempotency for versioned commands and add message-id idempotency for chat appends.
- DeepSeek failure must return a deterministic complete fallback and must not stall a room.
- Existing unrelated working-tree files and changes must not be removed or overwritten.

---

## File Structure

- `packages/contracts/src/index.ts`: timing configuration, new phases, chat/message schemas, round verdicts, AI inputs, and `RoomView`.
- `apps/server/src/rooms/types.ts`: persisted chat fields and migration from old room snapshots.
- `apps/server/src/rooms/manager.ts`: target locking, chat append ordering, deadline ticks, summary persistence, automatic round progression, and disconnect loss.
- `apps/server/src/ai/schemas.ts`: re-export/validation boundary for the new round verdict.
- `apps/server/src/ai/prompts.ts`: explicit player-speech semantics and round/track/judgment prompt builders.
- `apps/server/src/ai/fallback.ts`: deterministic conversational verdict and both round summaries.
- `apps/server/src/ai/client.ts`: typed AI gateway using the new round input/output.
- `apps/server/src/app.ts`: target/message routes, tick-to-AI orchestration, Socket.IO broadcasts, and immediate disconnect handling.
- `apps/web/src/App.tsx`: room creation timing controls, socket lifecycle, warning copy, and shared presence placement for waiting/trait pages.
- `apps/web/src/api.ts`: unchanged generic sender transport, verified against new action names.
- `apps/web/src/game/RoomPresence.tsx`: shared own/opponent connection indicator.
- `apps/web/src/game/DebateChatPage.tsx`: target selection, character/conductor panels, message stream, countdown, input, and conductor verdict bubble.
- `apps/web/src/game/GameStage.tsx`: routes debate phases to the full-screen chat page and removes the modal flow.
- `apps/web/src/game/DebateModal.tsx`: delete after replacement.
- `apps/web/src/styles.css`: timing controls, presence chips, and responsive full-screen chat layout; remove modal-only rules.

---

### Task 1: Replace the Public Timing and Debate Contracts

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`

**Interfaces:**
- Produces: `TimingMode`, `DebateMessage`, `DebateRoundVerdict`, `DebateRoundRecord`, `RoundDecisionInput`, `appendDebateMessageSchema`, `lockDebateTargetSchema`, and the updated `GameConfig` / `RoomView`.
- Consumes: no new interfaces.

- [ ] **Step 1: Write failing contract tests for configuration and messages**

Add exact tests that accept the confirmed range and reject removed/invalid fields:

```ts
const timed = gameConfigSchema.parse({
  games: 1,
  timingMode: 'timed',
  selectionSeconds: 180,
  traitSeconds: 180,
  debateMinutes: 5,
});
expect(timed.debateMinutes).toBe(5);
for (const debateMinutes of [3, 4, 5, 6, 7, 8, 9, 10]) {
  expect(gameConfigSchema.parse({ ...timed, debateMinutes }).debateMinutes).toBe(debateMinutes);
}
for (const debateMinutes of [2, 4.5, 11]) {
  expect(() => gameConfigSchema.parse({ ...timed, debateMinutes })).toThrow();
}
expect(() => gameConfigSchema.parse({ ...timed, disconnectSeconds: 120 })).toThrow();

expect(appendDebateMessageSchema.parse({
  messageId: crypto.randomUUID(),
  text: '这条轨道上的人不该被一笔勾销',
}).text).toContain('不该');
expect(() => appendDebateMessageSchema.parse({ messageId: crypto.randomUUID(), text: ' '.repeat(4) })).toThrow();
expect(() => appendDebateMessageSchema.parse({ messageId: crypto.randomUUID(), text: '甲'.repeat(2001) })).toThrow();
```

- [ ] **Step 2: Run the contract tests and verify the expected failure**

Run: `pnpm --filter @ydi/contracts test`

Expected: FAIL because `timingMode`, `debateMinutes`, and `appendDebateMessageSchema` are not defined and `disconnectSeconds` is still accepted.

- [ ] **Step 3: Implement the new Zod schemas and exported types**

Replace the relevant declarations with these exact shapes:

```ts
export const debateMinutesSchema = z.union([
  z.literal(3), z.literal(4), z.literal(5), z.literal(6),
  z.literal(7), z.literal(8), z.literal(9), z.literal(10),
]);

export const gameConfigSchema = z.object({
  games: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  timingMode: z.enum(['timed', 'unlimited']),
  selectionSeconds: z.number().int().min(20).max(540),
  traitSeconds: z.number().int().min(20).max(540),
  debateMinutes: debateMinutesSchema,
}).strict();

export const lockDebateTargetSchema = commandSchema.extend({ targetId: z.string().min(1) });
export const appendDebateMessageSchema = z.object({
  messageId: z.string().uuid(),
  text: z.string().trim().min(1).max(2000),
});

export type DebateMessage = {
  messageId: string;
  sequence: number;
  sender: Seat;
  text: string;
  sentAt: string;
};

export type DebateRoundVerdict = {
  winnerSeat: Seat;
  conductorMessage: string;
  debateSummary: string;
  winningSummary: string;
  fallback: boolean;
};
```

Change phases to `target-selecting`, `debate-chat`, `round-adjudicating`, and `round-result`; remove `attack-input` and `defense-input`. Replace `SpeechRecord`, the old `RoundVerdict`, and the old `RoundRecord` with `DebateRoundRecord`. Make `RoundDecisionInput` contain `players`, `messages`, `target`, `attacker`, `defender`, and `priorRounds`. Make `RoomView.me` include `connected`, and expose `debateMessages`, `messageSequence`, and `roundVerdict` without `currentAttack`, `attackText`, `activeSpeaker`, or the legacy verdict.

- [ ] **Step 4: Run contract tests and typecheck**

Run: `pnpm --filter @ydi/contracts test && pnpm --filter @ydi/contracts typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the contract checkpoint**

```bash
git add packages/contracts/src/index.ts packages/contracts/src/index.test.ts
git commit -m "feat: define realtime debate contracts"
```

---

### Task 2: Implement Persona-Driven Round Adjudication and Summaries

**Files:**
- Modify: `apps/server/src/ai/schemas.ts`
- Modify: `apps/server/src/ai/prompts.ts`
- Modify: `apps/server/src/ai/fallback.ts`
- Modify: `apps/server/src/ai/client.ts`
- Modify: `apps/server/src/ai/client.test.ts`
- Modify: `apps/server/src/ai/fallback.test.ts`

**Interfaces:**
- Consumes: `RoundDecisionInput` and `DebateRoundVerdict` from Task 1.
- Produces: `AiGateway.decideRound(input: RoundDecisionInput): Promise<DebateRoundVerdict>` plus compatible track and judgment inputs containing round summaries.

- [ ] **Step 1: Write failing prompt and response tests**

Create a round input with messages from both seats and assert all four output fields validate. Inspect the built system prompt and serialized user payload:

```ts
const built = buildRoundMessages(roundInput);
expect(built[0]?.content).toContain('真实玩家');
expect(built[0]?.content).toContain('不是目标人物本人发言');
expect(built[0]?.content).toContain('debateSummary');
expect(built[0]?.content).toContain('winningSummary');
expect(JSON.stringify(built[1])).toContain('这条轨道上的我');

expect(roundVerdictSchema.parse({
  winnerSeat: 'a',
  conductorMessage: '行了，我听明白了。这轮甲方讲得更站得住脚，我判甲方赢。',
  debateSummary: '甲方主张责任不能抹去贡献，乙方反驳贡献不能抵罪。',
  winningSummary: '责任不能抹去仍可挽回的公共价值。',
  fallback: false,
}).winnerSeat).toBe('a');
```

Update the mocked completion test so all four fields come from one request.

- [ ] **Step 2: Run focused AI tests and verify failure**

Run: `pnpm --filter @ydi/server test -- client.test.ts fallback.test.ts`

Expected: FAIL because the old schema still expects `winner`, `reason`, and `winningArgument`.

- [ ] **Step 3: Implement the schema and explicit prompt semantics**

Make `roundVerdictSchema` validate non-empty bounded values for `winnerSeat`, `conductorMessage`, `debateSummary`, `winningSummary`, and `fallback`. Replace the round system prompt with instructions that explicitly state:

```text
发言者是躺在甲乙两条轨道上的真实玩家，正在替自己及自己所在轨道辩护。
这些消息不是目标人物本人说的话；目标人物只是本轮被攻击或维护的对象。
conductorMessage 要像当前列车长按其人设当面说出口的话，简短复述交锋、明确宣布胜方并给理由。
debateSummary 要同时整理双方观点、直接交锋、主要分歧和胜负节点。
winningSummary 只能总结胜方实际发出的消息，不得混入败方观点或编造新事实。
```

Update track and judgment prompts to explicitly consume every round's `debateSummary`, `winningSummary`, and ordered original messages, with the same speaker-attribution warning.

- [ ] **Step 4: Implement deterministic complete fallbacks**

Change `fallbackRoundVerdict(input)` to select a winner deterministically from the existing seeded scoring inputs and return all required strings. Build `debateSummary` from both players' non-empty messages and `winningSummary` only from messages whose `sender` equals `winnerSeat`. If the winner sent no non-empty message, use a short explicit summary stating that the winning side supplied no substantive argument rather than copying the loser.

- [ ] **Step 5: Run focused AI tests**

Run: `pnpm --filter @ydi/server test -- client.test.ts fallback.test.ts`

Expected: PASS, including valid JSON, three invalid responses, missing key, and deterministic fallback coverage.

- [ ] **Step 6: Commit the AI checkpoint**

```bash
git add apps/server/src/ai/schemas.ts apps/server/src/ai/prompts.ts apps/server/src/ai/fallback.ts apps/server/src/ai/client.ts apps/server/src/ai/client.test.ts apps/server/src/ai/fallback.test.ts
git commit -m "feat: adjudicate realtime debate rounds"
```

---

### Task 3: Migrate Persisted Rooms and Implement Timed/Unlimited Phase Entry

**Files:**
- Modify: `apps/server/src/rooms/types.ts`
- Modify: `apps/server/src/rooms/manager.ts`
- Modify: `apps/server/src/rooms/manager.test.ts`
- Modify: `apps/server/src/persistence/store.test.ts`

**Interfaces:**
- Consumes: Task 1 contract types.
- Produces: persisted `Room.debateMessages`, `Room.messageSequence`, `Room.roundVerdict`, and timing-aware phase deadlines.

- [ ] **Step 1: Write failing timing and migration tests**

Add fake-clock tests for both timing modes:

```ts
expect(timedRoom.deadline).toBe(new Date(now.getTime() + 180_000).toISOString());
expect(unlimitedRoom.deadline).toBeNull();

const migrated = migrateRoomSnapshot(oldWaitingRoom);
expect(migrated.config.timingMode).toBe('timed');
expect(migrated.config.debateMinutes).toBe(5);
expect('disconnectSeconds' in migrated.config).toBe(false);

const ended = migrateRoomSnapshot({ ...oldRoom, phase: 'attack-input' } as never);
expect(ended.phase).toBe('match-end');
expect(ended.finalResult?.reason).toContain('重新开局');
```

- [ ] **Step 2: Run manager and store tests and verify failure**

Run: `pnpm --filter @ydi/server test -- manager.test.ts store.test.ts`

Expected: FAIL because persisted rooms and deadline helpers still depend on `speechSeconds` and `disconnectSeconds`.

- [ ] **Step 3: Update the persisted room shape and migration**

Define these current-round fields in `Room`:

```ts
currentTargetId: string | null;
debateMessages: DebateMessage[];
messageSequence: number;
roundVerdict: DebateRoundVerdict | null;
roundRecords: DebateRoundRecord[];
```

Remove `currentAttack`, `currentDefense`, and `disconnectedAt`. In `migrateRoomSnapshot`, map old waiting-room config to `timingMode: 'timed'` and `debateMinutes: 5`, preserve compatible selection/trait seconds, omit `disconnectSeconds`, initialize chat fields, and end any active legacy attack/defense room with the confirmed restart message.

- [ ] **Step 4: Centralize timing-aware deadlines**

Add helpers with exact behavior:

```ts
private phaseDeadline(room: Room, seconds: number, now = new Date()) {
  return room.config.timingMode === 'unlimited'
    ? null
    : new Date(now.getTime() + seconds * 1000).toISOString();
}

private debateDeadline(room: Room, now = new Date()) {
  return new Date(now.getTime() + room.config.debateMinutes * 60_000).toISOString();
}
```

Use `phaseDeadline` only for `selecting` and `traits`. After both players finish traits, enter `target-selecting` with `deadline = null`, cleared messages, sequence zero, and no target.

- [ ] **Step 5: Run focused server tests**

Run: `pnpm --filter @ydi/server test -- manager.test.ts store.test.ts`

Expected: PASS for migration and time-mode tests; chat behavior tests are added in Task 4.

- [ ] **Step 6: Commit the persistence/timing checkpoint**

```bash
git add apps/server/src/rooms/types.ts apps/server/src/rooms/manager.ts apps/server/src/rooms/manager.test.ts apps/server/src/persistence/store.test.ts
git commit -m "feat: migrate rooms to configurable debate timing"
```

---

### Task 4: Add Target Locking, Concurrent Chat Append, and Automatic Round Ticks

**Files:**
- Modify: `apps/server/src/rooms/manager.ts`
- Modify: `apps/server/src/rooms/manager.test.ts`

**Interfaces:**
- Consumes: `DebateMessage`, `DebateRoundVerdict`, and timing helpers from Tasks 1–3.
- Produces:
  - `lockDebateTarget(code, playerId, version, targetId, now?): Promise<Room>`
  - `appendDebateMessage(code, playerId, messageId, text, now?): Promise<DebateMessage>`
  - `tick(now?): Promise<RoomTickEvent[]>`
  - `resolveRound(code, version, verdict, now?): Promise<Room>`
  - `advanceAfterRound(code, version, now?): Promise<RoomTickEvent | null>`

- [ ] **Step 1: Write failing target, concurrency, and timeout tests**

Cover all of the following with fixed time and deterministic random:

```ts
await expect(rooms.lockDebateTarget(code, defenderId, version, targetId, now)).rejects.toThrow('target unavailable');
await rooms.lockDebateTarget(code, attackerId, version, targetId, now);
expect(rooms.get(code).phase).toBe('debate-chat');
expect(rooms.get(code).deadline).toBe(new Date(now.getTime() + 5 * 60_000).toISOString());

const [a, b] = await Promise.all([
  rooms.appendDebateMessage(code, playerA, idA, '我不是在替目标人物说话', now),
  rooms.appendDebateMessage(code, playerB, idB, '我反对你的轨道价值排序', now),
]);
expect(new Set([a.sequence, b.sequence]).size).toBe(2);

const duplicate = await rooms.appendDebateMessage(code, playerA, idA, 'ignored duplicate text', now);
expect(duplicate.messageId).toBe(idA);
expect(rooms.get(code).debateMessages).toHaveLength(2);

const events = await rooms.tick(new Date(now.getTime() + 5 * 60_000));
expect(events).toEqual([expect.objectContaining({ type: 'round-adjudication', roomCode: code })]);
await expect(rooms.appendDebateMessage(code, playerA, crypto.randomUUID(), 'too late', now)).rejects.toThrow('chat unavailable');
```

- [ ] **Step 2: Run the focused manager tests and verify failure**

Run: `pnpm --filter @ydi/server test -- manager.test.ts`

Expected: FAIL because the target/chat/tick methods do not exist.

- [ ] **Step 3: Implement target locking and append-only messages**

`lockDebateTarget` validates the current attacker and one of the defender's three visible characters, resets the current message collection, enters `debate-chat`, and uses `debateDeadline` regardless of timing mode.

`appendDebateMessage` runs inside the manager's existing serialized mutation boundary but does not compare room version. First return an existing message with the same `(sender, messageId)`; otherwise reject when not in `debate-chat`, when server time is at or after the deadline, or when text is invalid. Increment `messageSequence`, append the normalized message, persist, and return it.

- [ ] **Step 4: Implement typed tick events and round resolution**

Use this event union:

```ts
export type RoomTickEvent =
  | { type: 'round-adjudication'; roomCode: string; version: number; input: RoundDecisionInput }
  | { type: 'track-adjudication'; roomCode: string; version: number; input: TrackDecisionInput };
```

When a chat expires, atomically set `round-adjudicating`, clear the deadline, increment/persist the room version, and return a round event containing the frozen ordered messages. `resolveRound` writes `DebateRoundRecord`, attaches `{ kind: attackerWon ? 'attack' : 'defense', text: verdict.winningSummary }` to the target, stores `roundVerdict`, enters `round-result`, and sets a five-second server deadline. A `round-result` tick alternates the attacker and enters `target-selecting` for rounds 1–2; after round 3 it enters `track-adjudicating` and emits the track event.

The same `tick` method retains the existing timed selection and trait expiry behavior: it auto-selects valid remaining cards when a timed selection expires, completes unfinished trait placement when a timed trait phase expires, skips both phases when their deadline is `null`, and persists every transition before returning.

- [ ] **Step 5: Add summary propagation assertions**

Assert `getTrackDecisionInput` and `getJudgmentInput` include all ordered original messages, `debateSummary`, and `winningSummary` from each completed round. Assert only `winningSummary`, never `debateSummary`, appears in the target's accumulated arguments.

- [ ] **Step 6: Run manager tests**

Run: `pnpm --filter @ydi/server test -- manager.test.ts`

Expected: PASS, including simultaneous appends, duplicate IDs, exact-deadline rejection, three-round alternation, automatic progression, and summary propagation.

- [ ] **Step 7: Commit the room state-machine checkpoint**

```bash
git add apps/server/src/rooms/manager.ts apps/server/src/rooms/manager.test.ts
git commit -m "feat: add authoritative realtime debate state machine"
```

---

### Task 5: Wire HTTP, Socket Broadcasts, AI Tick Processing, and Immediate Disconnect Loss

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`
- Modify: `apps/server/src/rooms/manager.test.ts`

**Interfaces:**
- Consumes: Task 4 manager methods and Task 2 `AiGateway`.
- Produces: `POST /api/rooms/:code/debate-target`, `POST /api/rooms/:code/debate-messages`, automatic adjudication processing, and immediate match termination on the last active socket disconnect.

- [ ] **Step 1: Write failing HTTP and disconnect tests**

Add real two-session request tests that:

- reject target locking by the defender with 409;
- accept target locking by the attacker and expose `debate-chat` to both views;
- accept near-simultaneous messages from both sessions without `expectedVersion`;
- return the existing message for a duplicate `(sender, messageId)`;
- reject messages after the manager clock closes the chat;
- verify a waiting-room disconnect only changes `connected`;
- verify a post-start last-socket disconnect immediately sets `match-end`, awards the connected opponent, clears the deadline, and does not restore the match on resubscribe.

- [ ] **Step 2: Run the focused app tests and verify failure**

Run: `pnpm --filter @ydi/server test -- app.test.ts manager.test.ts`

Expected: FAIL because the new routes and immediate disconnect transition are absent.

- [ ] **Step 3: Replace attack/defend/advance routes**

Delete `/attack`, `/defend`, and `/advance-round`. Add:

```ts
app.post('/api/rooms/:code/debate-target', async (request) => {
  const code = (request.params as { code: string }).code;
  const body = lockDebateTargetSchema.parse(request.body);
  await once(code, body.commandId, () =>
    rooms.lockDebateTarget(code, identity(request), body.expectedVersion, body.targetId));
  broadcast(code);
  return { ok: true };
});

app.post('/api/rooms/:code/debate-messages', async (request) => {
  const code = (request.params as { code: string }).code;
  const body = appendDebateMessageSchema.parse(request.body);
  const message = await rooms.appendDebateMessage(code, identity(request), body.messageId, body.text);
  broadcast(code);
  return { message };
});
```

- [ ] **Step 4: Process tick events without duplicate AI calls**

Extract `processTickEvent(event)` in `app.ts`. For a round event, call `gatewayFor(code).decideRound(event.input)`, conditionally `resolveRound` using `event.version`, then broadcast. For a track event, call `decideTrack`, conditionally `resolveTrack`, broadcast `judgment-generating`, call `judgeMatch`, save the judgment, and broadcast again. The scheduler calls `rooms.tick()` once per second and processes the returned events; a phase is claimed before its event is returned, so overlapping scheduler runs cannot claim it twice.

- [ ] **Step 5: End an active match from the disconnect callback**

Replace grace-period tracking with `setConnected(code, playerId, connected)`. When `connected` becomes false and no other socket for that player remains, `RoomManager` immediately ends any phase other than `waiting` or `match-end`, increments the opponent score, clears the deadline, and writes a direct disconnect-loss result. A later `connected: true` update may change presence but must never leave `match-end`.

- [ ] **Step 6: Run server integration tests**

Run: `pnpm --filter @ydi/server test -- app.test.ts manager.test.ts`

Expected: PASS with no lingering timers or duplicate AI invocations.

- [ ] **Step 7: Commit the transport/orchestration checkpoint**

```bash
git add apps/server/src/app.ts apps/server/src/app.test.ts apps/server/src/rooms/manager.ts apps/server/src/rooms/manager.test.ts
git commit -m "feat: broadcast debate chat and enforce disconnect losses"
```

---

### Task 6: Update Room Creation, Defaults, Warnings, and Shared Presence

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Create: `apps/web/src/game/RoomPresence.tsx`
- Create: `apps/web/src/game/RoomPresence.test.tsx`
- Modify: `apps/web/src/game/test-fixtures.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: updated `GameConfig` and `RoomView` from Task 1.
- Produces: `RoomPresence({ room }: { room: RoomView })` and the confirmed creation form defaults.

- [ ] **Step 1: Write failing form and presence tests**

Assert the creation form initially shows 180 seconds for selection, 180 for traits, and 5 minutes for debate. Assert the debate select contains exactly `3` through `10`. Toggle “不限时” and assert selection/trait numeric inputs are disabled while debate duration remains enabled. Assert no element labeled “掉线判负秒数” exists.

For `RoomPresence`, render connected and disconnected opponent fixtures and assert both own and opponent status text is visible:

```tsx
expect(screen.getByText('甲方 · 在线')).toBeInTheDocument();
expect(screen.getByText('乙方 · 已掉线')).toBeInTheDocument();
```

- [ ] **Step 2: Run web tests and verify failure**

Run: `pnpm --filter @ydi/web test -- App.test.tsx RoomPresence.test.tsx`

Expected: FAIL because the old defaults and disconnect-seconds field remain and `RoomPresence` does not exist.

- [ ] **Step 3: Implement the creation controls**

Use this default:

```ts
const defaultConfig: GameConfig = {
  games: 1,
  timingMode: 'timed',
  selectionSeconds: 180,
  traitSeconds: 180,
  debateMinutes: 5,
};
```

Render an accessible timed/unlimited choice, retain numeric selection/trait fields with maximum 540 seconds, and render debate duration as a select of integer minutes 3–10. Remove all disconnect-seconds state, labels, and copy. Add visible waiting-room and in-room warning copy: “比赛开始后刷新、关闭页面或断开连接会立即判负，原局无法恢复。”

- [ ] **Step 4: Implement and place `RoomPresence` on non-stage room pages**

The component reads `room.me.connected` and `room.opponent?.connected`, uses text plus a colored dot rather than color alone, and renders “等待对手” when the second seat is empty. Place it in waiting and trait layouts; Task 8 places it in the main game stage and judgment flows.

- [ ] **Step 5: Run focused web tests**

Run: `pnpm --filter @ydi/web test -- App.test.tsx RoomPresence.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the room-form/presence checkpoint**

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/game/RoomPresence.tsx apps/web/src/game/RoomPresence.test.tsx apps/web/src/game/test-fixtures.ts apps/web/src/styles.css
git commit -m "feat: configure room timing and show presence"
```

---

### Task 7: Build the Full-Screen Realtime Debate Chat Page

**Files:**
- Create: `apps/web/src/game/DebateChatPage.tsx`
- Create: `apps/web/src/game/DebateChatPage.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `RoomView`, `PublicCharacter`, `RoomPresence`, and `send(action, body)`.
- Produces: `DebateChatPage({ room, send }: { room: RoomView; send(action: string, body?: object): Promise<void> })`.

- [ ] **Step 1: Write failing target-selection tests**

For the attacker in `target-selecting`, assert three opponent target buttons show each character's name and background, and clicking one calls:

```ts
expect(send).toHaveBeenCalledWith('debate-target', {
  commandId: expect.any(String),
  expectedVersion: room.version,
  targetId: 'opponent-character-id',
});
```

For the defender, assert the page shows a waiting message and no target button is actionable.

- [ ] **Step 2: Write failing chat and conductor-message tests**

Render `debate-chat` with messages from both seats and assert:

- target name, background, all traits, and all accumulated winning arguments are visible;
- conductor name, persona, rule, and avatar label are visible;
- messages render by `sequence`, not array order;
- own and opponent nicknames are attached to the correct bubbles;
- submitting trimmed text calls `send('debate-messages', { messageId, text })` without `expectedVersion`;
- the composer disables in `round-adjudicating` and `round-result`;
- `round-result` renders one conductor bubble using `room.roundVerdict.conductorMessage` and announces the winner.

- [ ] **Step 3: Run the new component tests and verify failure**

Run: `pnpm --filter @ydi/web test -- DebateChatPage.test.tsx`

Expected: FAIL because the component is missing.

- [ ] **Step 4: Implement the component behavior**

Use semantic sections for target, transcript, and conductor. Derive the target from `room.currentTargetId`. Sort a copied message array with `(a, b) => a.sequence - b.sequence`. Generate one `messageId` per send attempt, preserve unsent text after failures, clear it only after success, and prevent duplicate submissions while a request is pending. Use Enter to send and Shift+Enter for a newline, with visible helper text.

Render a name-based conductor avatar component with `aria-label={`${room.conductor.name}头像`}` so the verdict bubble and profile use the same identity without adding image assets. Keep the last-message auto-scroll scoped to the transcript container and do not force scroll when the user is reading older messages.

- [ ] **Step 5: Implement responsive chat styles**

At desktop widths use a three-column grid: target profile, transcript/composer, conductor profile. At 900px and below stack the two profiles above the transcript, keep the composer visible, and allow the page itself to scroll. Remove modal overlay behavior from all new classes. Respect `prefers-reduced-motion` for message arrival and auto-scroll.

- [ ] **Step 6: Run component tests and typecheck**

Run: `pnpm --filter @ydi/web test -- DebateChatPage.test.tsx && pnpm --filter @ydi/web typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the chat-page checkpoint**

```bash
git add apps/web/src/game/DebateChatPage.tsx apps/web/src/game/DebateChatPage.test.tsx apps/web/src/styles.css
git commit -m "feat: add full-screen debate chat"
```

---

### Task 8: Integrate the Chat Page, Remove the Modal, and Cover the Complete UI Flow

**Files:**
- Modify: `apps/web/src/game/GameStage.tsx`
- Modify: `apps/web/src/game/GameStage.test.tsx`
- Modify: `apps/web/src/game/JudgmentOverlay.tsx`
- Modify: `apps/web/src/game/JudgmentOverlay.test.tsx`
- Delete: `apps/web/src/game/DebateModal.tsx`
- Delete: `apps/web/src/game/DebateModal.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `DebateChatPage` and `RoomPresence` from Tasks 6–7.
- Produces: complete phase routing with no modal attack/defense UI.

- [ ] **Step 1: Write failing integration tests**

Assert `GameStage` renders `DebateChatPage` for `target-selecting`, `debate-chat`, `round-adjudicating`, and `round-result`, and does not render rail-board controls underneath it. Assert selecting, track adjudication, judgment, between-games, and match-end each visibly render `RoomPresence`. Assert no “提交攻击辩词”, “提交防守辩词”, or modal `role="dialog"` remains in an attack round.

- [ ] **Step 2: Run stage and judgment tests and verify failure**

Run: `pnpm --filter @ydi/web test -- GameStage.test.tsx JudgmentOverlay.test.tsx`

Expected: FAIL because `GameStage` still imports `DebateModal` and stage/judgment headers do not share presence.

- [ ] **Step 3: Route debate phases to the full-screen page**

Update `phaseTitles`, render `DebateChatPage` as the only stage content for the four debate phases, and render existing rails/selection/judgment content for all other phases. Add `RoomPresence` to the persistent room header so online status remains visible through selection, final adjudication, judgment, and match end.

- [ ] **Step 4: Delete the old modal implementation and styles**

Delete both `DebateModal` files. Remove `.debate-modal`, `.modal-targets`, `.modal-speech`, `.modal-wait`, and other modal-only CSS selectors. Retain shared judgment selectors and verify no import or text references the removed attack/defense actions.

- [ ] **Step 5: Run the complete web test suite**

Run: `pnpm --filter @ydi/web test`

Expected: PASS with no React `act` warnings and no stale fake timers.

- [ ] **Step 6: Commit the integrated UI checkpoint**

```bash
git add apps/web/src/game/GameStage.tsx apps/web/src/game/GameStage.test.tsx apps/web/src/game/JudgmentOverlay.tsx apps/web/src/game/JudgmentOverlay.test.tsx apps/web/src/game/DebateModal.tsx apps/web/src/game/DebateModal.test.tsx apps/web/src/styles.css
git commit -m "refactor: replace debate modal with chat page"
```

---

### Task 9: Verify End-to-End Behavior and Remove Stale Contracts

**Files:**
- Modify only files required by failures found in this task.
- Verify: `packages/contracts/src/**`, `apps/server/src/**`, `apps/web/src/**`.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a green repository with no stale attack/defense or disconnect-grace behavior.

- [ ] **Step 1: Scan for stale behavior and names**

Run:

```powershell
rg -n --glob '!node_modules/**' --glob '!dist/**' 'disconnectSeconds|掉线判负秒数|speechSeconds|attack-input|defense-input|submitAttack|submitDefense|DebateModal|advance-round|currentAttack|currentDefense|winningArgument' packages apps
```

Expected: no runtime references. Migration tests may contain quoted legacy phase names only when asserting safe upgrade behavior.

- [ ] **Step 2: Run all automated verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 3: Run focused acceptance tests once more**

Run:

```powershell
pnpm --filter @ydi/contracts test
pnpm --filter @ydi/server test -- manager.test.ts app.test.ts client.test.ts fallback.test.ts store.test.ts
pnpm --filter @ydi/web test -- App.test.tsx RoomPresence.test.tsx DebateChatPage.test.tsx GameStage.test.tsx JudgmentOverlay.test.tsx
```

Expected: all focused suites pass and collectively prove configurable timing, concurrent chat, AI summaries, immediate disconnect loss, presence, and the full-screen page.

- [ ] **Step 4: Review the final diff for scope and accidental data exposure**

Run: `git diff --check HEAD~8..HEAD && git status --short`

Expected: no whitespace errors, no `.env` or API key staged, and only feature-related files changed in the task commits. Existing unrelated untracked files may remain and must not be added.

If verification exposes a defect, return to the task that owns that behavior, add a regression test there, fix it, rerun that task's verification command, and use that task's exact file list for the correction commit. Do not create an empty verification commit.
