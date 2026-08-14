# Persistent Match Hands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each player's 1:1 good/evil character hand and trait hand persist across the configured match, while each game uses two freely chosen characters, optional traits, and exactly three debates on an unchanged rail.

**Architecture:** Deal the match hand once in `RoomManager.start`, retain existing used-card ID sets across games, and split “start match” from “reset current game” state. Add opponent remaining counts to the public contract rather than exposing hidden cards. Keep the selection and debate phases unchanged at the API boundary, but advance debates directly back to `attack-input` until the third verdict.

**Tech Stack:** TypeScript 6, Zod contracts, Vitest, React 19, CSS, pnpm workspace.

## Global Constraints

- Each player receives exactly `config.games` good characters, `config.games` evil characters, and `config.games * 2` traits.
- Room configuration accepts only 1, 3, or 5 games; even match lengths are rejected by the shared schema and unavailable in the UI.
- The two characters selected in a game may use any alignment combination.
- Unused traits carry into later games; used characters and traits cannot return.
- Each game has one selection phase, one optional trait phase, and exactly three debates on unchanged rails.
- The HUD must show game progress, debate progress, score, and only the opponent's remaining good/evil/trait counts.
- Hand cards stay full width and use horizontal overflow when the viewport is too narrow.

---

### Task 1: Variable-Size 1:1 Match Dealing

**Files:**
- Modify: `apps/server/src/content/catalog.ts`
- Test: `apps/server/src/content/catalog.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/index.test.ts`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Produces: `dealHands(value?: typeof catalog, random?: () => number, games?: number): [Hand, Hand]`
- Each returned hand contains `games` good cards, `games` evil cards, and `games * 2` traits.

- [ ] **Step 1: Write the failing deal-size test**

Add a table-driven test for `games` values 1, 3, and 5 and assert exact alignment counts, trait counts, and uniqueness within each hand.

Add a shared-contract test that accepts 1, 3, and 5 games and rejects 2 and 4. Replace the free-form game-count input with a select containing only 1, 3, and 5.

- [ ] **Step 2: Verify the new test fails**

Run `pnpm --filter @ydi/server test -- catalog.test.ts` and confirm the fixed 3/3/6 deal violates the 1- and 5-game expectations.

- [ ] **Step 3: Implement variable dealing**

Change `dealHands` so the per-alignment sample size is `games` and trait sample size is `games * 2`; retain secure randomness as the default and reject counts outside the catalog capacity.

- [ ] **Step 4: Verify catalog tests pass**

Run `pnpm --filter @ydi/server test -- catalog.test.ts` and confirm all catalog tests pass.

### Task 2: Persist Hands Across Games and Keep Rails Stable Across Debates

**Files:**
- Modify: `apps/server/src/rooms/manager.ts`
- Modify: `apps/server/src/rooms/types.ts`
- Test: `apps/server/src/rooms/manager.test.ts`

**Interfaces:**
- `Room.hands`, `Room.usedCharacters`, and `Room.usedTraits` become match-lifetime state.
- `startGame(room: Room)` resets only the current game's conductor, rails, traits, arguments, debates, verdict, judgment, and deadlines.
- `advanceAfterRound` returns to `attack-input` for rounds 2 and 3 without changing selections, automatic characters, character traits, or arguments.

- [ ] **Step 1: Write failing match-lifetime tests**

Assert a two-game room starts with two good, two evil, and four traits per player; consume two characters and one trait in game one; advance to game two; then assert hand IDs are unchanged, used IDs remain consumed, and the unused traits remain available.

- [ ] **Step 2: Write the failing stable-rail test**

Select characters and finish traits once, complete three attack/defense verdict cycles, and assert all three cycles target the same unchanged automatic and selected character IDs without returning to `selecting` or `traits` between rounds.

- [ ] **Step 3: Verify both tests fail for the current lifecycle**

Run `pnpm --filter @ydi/server test -- manager.test.ts`; expect failures showing hands are redealt/usage reset and round two returns to `selecting`.

- [ ] **Step 4: Separate match deal from per-game reset**

In `start`, call `dealHands(catalog, this.random, room.config.games)` once and initialize match-level used arrays once. Replace `dealGame` with a per-game reset that does not assign `hands`, `usedCharacters`, or `usedTraits`.

- [ ] **Step 5: Keep rails unchanged between debates**

For rounds one and two, increment `room.round`, alternate `roundAttacker`, clear only `currentTargetId/currentAttack/currentDefense`, set `phase = 'attack-input'`, and start the next speech deadline. Do not call automatic dealing or clear selections/traits.

- [ ] **Step 6: Reset the correct state at the next game**

When both players leave judgment, increment `game`, set `round = 1`, then reset selections, automatic characters, per-character traits/arguments, round records, verdict/judgment state, and randomly choose the first attacker and conductor. Retain hands and used ID arrays.

- [ ] **Step 7: Verify RoomManager tests pass**

Run `pnpm --filter @ydi/server test -- manager.test.ts` and confirm all lifecycle, timeout, surrender, and persistence tests pass.

### Task 3: Expose Safe Opponent Remaining Counts

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`
- Test: `apps/server/src/rooms/manager.test.ts`

**Interfaces:**
- Add `RoomView.opponentRemaining: { good: number; evil: number; traits: number } | null`.
- Counts are derived from the opponent hand minus opponent used IDs; no hidden names, IDs, backgrounds, or trait text are exposed.

- [ ] **Step 1: Write failing contract and room-view tests**

Assert the RoomView type fixture accepts `opponentRemaining`, then assert a fresh two-game room reports `{ good: 2, evil: 2, traits: 4 }` and reports decremented counts after character selection and trait use.

- [ ] **Step 2: Verify the tests fail because the field is missing**

Run `pnpm --filter @ydi/contracts test` and `pnpm --filter @ydi/server test -- manager.test.ts`.

- [ ] **Step 3: Add the public count field and server projection**

Extend `RoomView`; in `RoomManager.view`, count opponent cards whose IDs are not in `usedCharacters[opponentSeat]` or `usedTraits[opponentSeat]`. Return `null` while no opponent exists.

- [ ] **Step 4: Verify contract and server tests pass**

Run both targeted suites and confirm no private card content is added to the public count object.

### Task 4: HUD Resource Display and Fully Spread Hand

**Files:**
- Modify: `apps/web/src/game/GameStage.tsx`
- Modify: `apps/web/src/game/test-fixtures.ts`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- `GameStage` renders `第 {game}/{config.games} 局`, `第 {round}/3 次攻防`, the existing score, and opponent remaining counts.
- `.selection-tray > .hand` uses non-shrinking cards, normal positive gaps, and `overflow-x: auto`.

- [ ] **Step 1: Write failing HUD tests**

Render a RoomView with `game: 2`, `config.games: 5`, `round: 3`, score `1:2`, and opponent counts `good: 3`, `evil: 1`, `traits: 4`; assert all values are visible and labeled.

- [ ] **Step 2: Verify the HUD test fails**

Run `pnpm --filter @ydi/web test -- App.test.tsx` and confirm the total-game and opponent-count labels are absent.

- [ ] **Step 3: Implement HUD labels**

Add a compact opponent-resource group inside the HUD and preserve responsive wrapping at narrow widths.

- [ ] **Step 4: Add and verify the spread-hand CSS regression assertion**

Assert the hand container has horizontal overflow semantics and character cards retain a fixed `min-width`; update CSS to remove height-driven clipping and ensure cards never use shrinking or negative overlap.

- [ ] **Step 5: Run web tests**

Run `pnpm --filter @ydi/web test` and confirm the existing drag disappearance, FLIP reflow, drawer, and stage tests remain green.

### Task 5: Full Verification and Local Runtime

**Files:**
- Verify all modified workspace files.

**Interfaces:**
- Production server continues to serve the Vite bundle and WebSocket/API routes on port 3000.

- [ ] **Step 1: Run the full quality gate**

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`; all commands must exit zero.

- [ ] **Step 2: Restart only the project-owned port-3000 process tree**

Resolve the listener and its command line, stop the exact project process IDs, then start `pnpm start` with `PORT=3000` in the workspace.

- [ ] **Step 3: Verify the production build is live**

Request `http://127.0.0.1:3000/`, require HTTP 200, and confirm the returned HTML references the new production asset hash.

- [ ] **Step 4: Browser-check the visible behavior**

Create or join a room, confirm the expanded hand scrolls horizontally without card overlap, and confirm the HUD displays game/debate progress and opponent resource counts.
