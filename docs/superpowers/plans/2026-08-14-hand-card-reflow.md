# Hand Card Reflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove a dragged character from its original hand position and animate the remaining cards forward, restoring the original order when a drag is cancelled.

**Architecture:** `SelectionTray` derives a visible-hand list that excludes only the active hand drag. A focused `useHandReflow` hook measures stable card IDs before and after list changes and performs dependency-free FLIP animations using transforms and opacity.

**Tech Stack:** React, TypeScript, CSS, Vitest, Testing Library, Vite, pnpm.

## Global Constraints

- Do not add a runtime animation dependency.
- Preserve the server-provided hand order as the canonical order.
- Animate only `transform` and `opacity` for 220ms with `cubic-bezier(.16,1,.3,1)`.
- Invalid drops, pointer cancellation, window blur, and phase changes restore the card at its original index.
- `prefers-reduced-motion: reduce` updates layout without animation.
- This workspace has no Git repository, so verification replaces commit steps.

---

### Task 1: Dragged Card Extraction and Order Restoration

**Files:**
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/game/SelectionTray.tsx`
- Modify: `apps/web/src/game/CharacterCard.tsx`

**Interfaces:**
- Consumes: `dragState.sourceId` from `usePointerDrag` and canonical `availableHand` order.
- Produces: `visibleHand`, equal to `availableHand` except that an actively dragged hand character is omitted.
- Produces: `CharacterCard` prop `cardId?: string`, rendered as `data-character-card-id`.

- [ ] **Step 1: Add failing interaction tests**

Extend the existing selecting-stage tests with literal hand order assertions:

```tsx
fireEvent.pointerDown(screen.getAllByTestId('hand-character')[1]!, {
  pointerId: 51,
  clientX: 120,
  clientY: 500,
});

expect(screen.getByTestId('selection-drag-layer')).toHaveTextContent('记者');
expect(screen.getAllByTestId('hand-character').map((card) => card.textContent)).not.toContain(expect.stringContaining('记者'));

fireEvent.pointerUp(window, { pointerId: 51, clientX: 900, clientY: 100 });
expect(screen.getAllByTestId('hand-character')[1]).toHaveTextContent('记者');
```

Add separate assertions for `pointercancel` and `window.blur`, confirming that the six original names return in their original order.

- [ ] **Step 2: Run the targeted tests and verify RED**

Run: `pnpm --filter @ydi/web test -- App.test.tsx`

Expected: the dragged card remains present in `hand-character`, so the extraction assertion fails.

- [ ] **Step 3: Expose a stable card ID and derive the visible hand**

Add `cardId?: string` to `CharacterCardProps`, render it as `data-character-card-id`, and pass `card.id` from `SelectionTray`. Compute:

```tsx
const draggedHandId = dragState && availableHand.some((card) => card.id === dragState.sourceId)
  ? dragState.sourceId
  : null;
const visibleHand = draggedHandId
  ? availableHand.filter((card) => card.id !== draggedHandId)
  : availableHand;
```

Render `visibleHand` while continuing to resolve the floating card from `byId`.

- [ ] **Step 4: Run the targeted tests and verify GREEN**

Run: `pnpm --filter @ydi/web test -- App.test.tsx`

Expected: the source disappears during drag and returns at index 1 after invalid drop, cancel, or blur.

---

### Task 2: FLIP Reflow Animation

**Files:**
- Create: `apps/web/src/game/use-hand-reflow.ts`
- Create: `apps/web/src/game/use-hand-reflow.test.tsx`
- Modify: `apps/web/src/game/SelectionTray.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `useHandReflow(containerRef: RefObject<HTMLElement | null>, orderedIds: readonly string[]): void`.
- Requires: children with `data-character-card-id` matching `orderedIds`.
- Produces: temporary Web Animations API transforms for cards that changed position and a fade/translate entrance for a restored card.

- [ ] **Step 1: Add a failing Hook behavior test**

Stub `getBoundingClientRect`, `matchMedia`, and `HTMLElement.prototype.animate`. Render IDs `a,b,c`, rerender `a,c`, and assert card `c` receives:

```tsx
expect(animate).toHaveBeenCalledWith(
  [
    { transform: 'translate(200px, 0px)' },
    { transform: 'translate(0px, 0px)' },
  ],
  { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' },
);
```

Rerender `a,b,c` and assert the restored `b` receives an opacity/translate entrance. In a separate reduced-motion case, assert `animate` is not called.

- [ ] **Step 2: Run the Hook test and verify RED**

Run: `pnpm --filter @ydi/web test -- use-hand-reflow.test.tsx`

Expected: the Hook module is absent or the animation spy has no calls.

- [ ] **Step 3: Implement the Hook with cleanup**

Use `useLayoutEffect` and two refs: previous rectangles keyed by ID and active animations. On each ordered-ID change:

1. Cancel animations created by the previous update.
2. Read all current child rectangles in one batch.
3. For IDs present in both snapshots, calculate `dx` and `dy`; call `element.animate` only when either is non-zero.
4. For newly inserted IDs after the initial render, animate from `{ transform: 'translate(24px, 0)', opacity: 0 }` to zero transform and full opacity.
5. Save current rectangles for the next update.
6. Cancel active animations during unmount.

Skip animation entirely when `window.matchMedia('(prefers-reduced-motion: reduce)').matches` is true, while still refreshing stored rectangles.

- [ ] **Step 4: Connect the Hook and style active animation layers**

Attach `handRef` to the hand container, pass `visibleHand.map((card) => card.id)` to `useHandReflow`, and add:

```css
.hand [data-character-card-id] { transform-origin: center; }
.hand [data-character-card-id].is-reflowing { will-change: transform, opacity; }
```

The Hook adds and removes `is-reflowing` around each animation lifecycle.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run: `pnpm --filter @ydi/web test -- App.test.tsx use-hand-reflow.test.tsx`

Expected: extraction, restoration, FLIP displacement, insertion, cleanup, and reduced-motion tests all pass.

---

### Task 3: Full Verification and Browser QA

**Files:**
- Modify only files requiring corrections discovered during verification.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: verified local build at `http://127.0.0.1:3000/`.

- [ ] **Step 1: Run complete checks**

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: every command exits with code 0.

- [ ] **Step 2: Restart the scoped local server if the production asset hash changes**

Resolve only the process listening on port 3000, stop its project-owned parent chain, then start `pnpm start` hidden with `PORT=3000`. Verify the generated JavaScript asset responds with HTTP 200 and JavaScript content type.

- [ ] **Step 3: Verify in a 1280×720 browser viewport**

Drag the first and a middle hand card. Confirm the source has no stationary duplicate, remaining cards slide forward, the floating card follows the pointer, a valid slot drop keeps the gap closed, and an invalid drop restores the card at its original index. Reset the temporary viewport after testing.
