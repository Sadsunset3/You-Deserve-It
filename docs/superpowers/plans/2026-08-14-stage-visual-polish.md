# Stage Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant homepage verdict block, unify the waiting room with the cream dossier palette, fit the game stage inside one viewport, and expose rail-character details through an accessible right-side drawer.

**Architecture:** Keep room state and server contracts unchanged. Add a focused `CharacterDetailDrawer` presentation component, let `GameStage` own the selected public character, and use CSS grid sizing to keep the HUD, rails, hand, and controls inside `100dvh`.

**Tech Stack:** React, TypeScript, CSS, Vitest, Testing Library, Vite, pnpm.

## Global Constraints

- The page must not vertically scroll at 1280×720 or 1440×900.
- Rail cards show background summary plus `词条 ×N` and `辩词 ×N`; full content appears only in the drawer.
- The drawer opens by pointer, Enter, or Space and closes with its button, Escape, or backdrop.
- Hidden opponent characters remain non-interactive.
- Waiting and judgment surfaces use the homepage cream, black, and judgment-red palette rather than an all-black screen.
- This workspace is not a Git repository, so verification replaces commit steps.

---

### Task 1: Homepage and Waiting Room

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: existing `RoomView.me`, `RoomView.opponent`, and ready state.
- Produces: `.waiting-room`, `.waiting-seat`, `.seat-name`, and `.seat-status` markup for stable styling and accessible player-name rendering.

- [ ] **Step 1: Write failing homepage and waiting-room tests**

Add assertions that the homepage does not contain “最终问题”, and that a populated waiting room exposes both player names and their seat states:

```tsx
expect(screen.queryByText('最终问题')).not.toBeInTheDocument();
expect(screen.getByText('甲方玩家')).toBeVisible();
expect(screen.getByText('乙方玩家')).toBeVisible();
expect(screen.getByText('你')).toBeVisible();
```

- [ ] **Step 2: Verify the new tests fail**

Run: `pnpm --filter @ydi/web test -- App.test.tsx`

Expected: the homepage assertion fails while `.home-verdict` exists, and the waiting-seat labels are absent.

- [ ] **Step 3: Remove the homepage verdict footer and rebuild waiting-room markup**

Delete the `.home-verdict` footer from `Home`. Replace the one-line `Waiting` output with a structured room-code panel, two seat cards, and an in-flow action footer. Compute each seat nickname and whether it represents `room.me` so the current player gets a visible `你` marker.

- [ ] **Step 4: Replace obsolete homepage and waiting CSS**

Delete `.home-verdict` rules and its focus selector. Override the authoritative `.game-shell` background only for `.waiting-shell`, use the existing `--paper`, `--ink`, and `--red` tokens, and keep all waiting controls inside the viewport.

- [ ] **Step 5: Verify Task 1**

Run: `pnpm --filter @ydi/web test -- App.test.tsx`

Expected: all `App.test.tsx` tests pass.

---

### Task 2: Rail Card Summary and Character Detail Drawer

**Files:**
- Create: `apps/web/src/game/CharacterDetailDrawer.tsx`
- Create: `apps/web/src/game/CharacterDetailDrawer.test.tsx`
- Modify: `apps/web/src/game/CharacterCard.tsx`
- Modify: `apps/web/src/game/GameStage.tsx`
- Modify: `apps/web/src/game/GameStage.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `PublicCharacter` with `traits: TraitCard[]` and `arguments: Array<{ kind: 'attack' | 'defense'; text: string }>`.
- Produces: `CharacterDetailDrawer({ character, onClose }: { character: PublicCharacter | null; onClose(): void })`.
- Produces: `CharacterCard` optional prop `summaryCounts?: boolean`; when true, render `词条 ×N` and `辩词 ×N` without inline bodies.

- [ ] **Step 1: Write failing card and drawer tests**

Use a fixture containing one trait and one argument. Assert the rail card renders both count labels but not the full trait/argument text. Click the card and assert a dialog named “人物档案：消防员” contains the complete background, trait, and winning argument. Press Escape and assert the dialog closes.

```tsx
fireEvent.click(screen.getByRole('button', { name: /查看消防员人物档案/ }));
expect(screen.getByRole('dialog', { name: '人物档案：消防员' })).toBeInTheDocument();
fireEvent.keyDown(document, { key: 'Escape' });
expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
```

- [ ] **Step 2: Verify the drawer tests fail**

Run: `pnpm --filter @ydi/web test -- CharacterDetailDrawer.test.tsx GameStage.test.tsx`

Expected: the drawer module and rail-card buttons do not yet exist.

- [ ] **Step 3: Implement the focused drawer component**

Render a fixed backdrop and `<aside role="dialog" aria-modal="true">`. Store the close-button ref, focus it on open, register a document `keydown` listener for Escape, stop propagation inside the drawer, and call `onClose` from the backdrop and close button. Render explicit “暂无词条” and “暂无胜出辩词” empty states.

- [ ] **Step 4: Add the compact public-card summary mode**

When `summaryCounts` is true and the card is public, suppress individual trait text and render:

```tsx
<div className="character-counts">
  <span>词条 ×{card.traits.length}</span>
  <span>辩词 ×{card.arguments.length}</span>
</div>
```

Keep hand and selection cards unchanged.

- [ ] **Step 5: Connect rail-card selection to the drawer**

In `GameStage`, store `detailCharacter: PublicCharacter | null`. Pass `onClick={() => setDetailCharacter(card)}`, `summaryCounts`, and an accessible name through rail `CharacterCard`. Render `CharacterDetailDrawer` after the stage layers. Because concealed selection cards continue using their existing non-button branch, hidden opponents cannot open the drawer.

- [ ] **Step 6: Style the drawer and compact card summaries**

Use a translucent backdrop, a cream right-side sheet, black dossier borders, red count accents, viewport-safe scrolling, visible focus rings, and a short transform/opacity entrance animation disabled by `prefers-reduced-motion`.

- [ ] **Step 7: Verify Task 2**

Run: `pnpm --filter @ydi/web test -- CharacterDetailDrawer.test.tsx GameStage.test.tsx`

Expected: all targeted tests pass, including pointer open, Escape close, complete lists, and empty states.

---

### Task 3: Single-Screen Stage and Judgment Palette

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/game/JudgmentOverlay.test.tsx`

**Interfaces:**
- Consumes: existing `.train-stage`, `.game-hud`, `.selection-tray`, `.game-rails`, `.hand`, `.selection-actions`, and `.judgment-overlay` elements.
- Produces: responsive grid sizing only; no game-state or network changes.

- [ ] **Step 1: Add structural regression assertions**

Keep DOM-level tests focused on the elements CSS must lay out: selection tray, both rails, selection hand, and action buttons. Add a judgment assertion that the overlay still exposes both player columns and the conductor summary after the palette change.

- [ ] **Step 2: Reallocate the stage height**

Change `.train-stage` to a `100dvh` grid with `grid-template-rows: auto minmax(0, 1fr)`. Make `.selection-tray` fill the second row with `grid-template-rows: minmax(0, 1fr) auto auto`, remove the `6.5rem` top margin in the authoritative block, cap rail/card heights with `min()` and `clamp()`, and make `.hand` horizontally scroll within its own row.

- [ ] **Step 3: Keep controls and card names visible at 720px height**

Reduce HUD, conductor card, rail padding, character portrait, and hand-card vertical spacing under `@media (max-height: 760px)`. Give `.selection-actions` an in-flow position and keep its buttons above the viewport bottom.

- [ ] **Step 4: Recolor the judgment overlay**

Replace the black radial full-screen surface with the cream dossier background, black text and borders, red headings, and lightly tinted player/conductor panels while preserving modal hierarchy and scroll safety.

- [ ] **Step 5: Verify Task 3**

Run: `pnpm --filter @ydi/web test -- GameStage.test.tsx JudgmentOverlay.test.tsx`

Expected: all targeted tests pass.

---

### Task 4: Full Verification and Browser QA

**Files:**
- Modify only files requiring fixes discovered by verification.

**Interfaces:**
- Consumes: all UI changes from Tasks 1–3.
- Produces: a tested build and viewport evidence.

- [ ] **Step 1: Run all web checks**

Run:

```powershell
pnpm --filter @ydi/web test
pnpm --filter @ydi/web typecheck
pnpm --filter @ydi/web lint
pnpm --filter @ydi/web build
```

Expected: every command exits with code 0.

- [ ] **Step 2: Verify the running site at 1280×720**

Open the homepage, waiting room, selecting stage, and an active rail stage. Confirm `document.documentElement.scrollHeight <= window.innerHeight`, player names are visible, selection controls are not clipped, rail cards show counts, and the drawer opens and closes correctly.

- [ ] **Step 3: Verify at 1440×900**

Repeat the same checks and confirm the layout uses the extra height without introducing a vertical scrollbar.

- [ ] **Step 4: Run the complete repository verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: every workspace package exits with code 0.
