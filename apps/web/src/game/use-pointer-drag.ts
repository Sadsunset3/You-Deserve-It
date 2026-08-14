import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type DropTarget =
  | { type: 'selection-slot'; index: 0 | 1 }
  | { type: 'hand' }
  | { type: 'character'; id: string };

export type DragState = { sourceId: string; pointerId: number; x: number; y: number } | null;

type ActiveDrag = Exclude<DragState, null>;

type GlobalListeners = {
  pointermove: (event: PointerEvent) => void;
  pointerup: (event: PointerEvent) => void;
  pointercancel: (event: PointerEvent) => void;
  blur: () => void;
};

const semanticDropTargetSelector = [
  '[data-drop-type="selection-slot"]',
  '[data-drop-type="hand"]',
  '[data-drop-type="character"]',
].join(',');

function parseDropTarget(element: Element | null): DropTarget | null {
  const target = element?.closest<HTMLElement>(semanticDropTargetSelector);
  if (!target) return null;

  switch (target.dataset.dropType) {
    case 'selection-slot':
      if (target.dataset.slotIndex === '0') return { type: 'selection-slot', index: 0 };
      if (target.dataset.slotIndex === '1') return { type: 'selection-slot', index: 1 };
      return null;
    case 'hand':
      return { type: 'hand' };
    case 'character':
      return target.dataset.characterId
        ? { type: 'character', id: target.dataset.characterId }
        : null;
    default:
      return null;
  }
}

function cancelKeysMatch(previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined) {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  return previous.every((value, index) => Object.is(value, next[index]));
}

export function usePointerDrag(options: {
  onDrop(sourceId: string, target: DropTarget | null): void;
  cancelKeys?: readonly unknown[];
}): {
  dragState: DragState;
  bindDragSource(sourceId: string): { onPointerDown(event: ReactPointerEvent<HTMLElement>): void };
  cancelDrag(): void;
} {
  const [dragState, setDragState] = useState<DragState>(null);
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const latestCoordinatesRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const listenersRef = useRef<GlobalListeners | null>(null);
  const onDropRef = useRef(options.onDrop);
  const previousCancelKeysRef = useRef(options.cancelKeys);
  onDropRef.current = options.onDrop;

  const removeGlobalListeners = useCallback(() => {
    const listeners = listenersRef.current;
    if (!listeners) return;

    window.removeEventListener('pointermove', listeners.pointermove);
    window.removeEventListener('pointerup', listeners.pointerup);
    window.removeEventListener('pointercancel', listeners.pointercancel);
    window.removeEventListener('blur', listeners.blur);
    listenersRef.current = null;
  }, []);

  const clearDrag = useCallback((updateState: boolean) => {
    activeDragRef.current = null;
    latestCoordinatesRef.current = null;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    removeGlobalListeners();
    if (updateState) setDragState(null);
  }, [removeGlobalListeners]);

  const cancelDrag = useCallback(() => {
    clearDrag(true);
  }, [clearDrag]);

  const beginDrag = useCallback((sourceId: string, event: ReactPointerEvent<HTMLElement>) => {
    clearDrag(true);

    const activeDrag: ActiveDrag = {
      sourceId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    activeDragRef.current = activeDrag;
    setDragState(activeDrag);

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can be absent or reject an inactive pointer in older browsers.
      }
    }

    const listeners: GlobalListeners = {
      pointermove(pointerEvent) {
        const active = activeDragRef.current;
        if (!active || pointerEvent.pointerId !== active.pointerId) return;

        latestCoordinatesRef.current = { x: pointerEvent.clientX, y: pointerEvent.clientY };
        if (frameRef.current !== null) return;

        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null;
          const current = activeDragRef.current;
          const coordinates = latestCoordinatesRef.current;
          latestCoordinatesRef.current = null;
          if (!current || !coordinates) return;

          const next = { ...current, ...coordinates };
          activeDragRef.current = next;
          setDragState(next);
        });
      },
      pointerup(pointerEvent) {
        const active = activeDragRef.current;
        if (!active || pointerEvent.pointerId !== active.pointerId) return;

        const target = parseDropTarget(document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY));
        clearDrag(true);
        onDropRef.current(active.sourceId, target);
      },
      pointercancel(pointerEvent) {
        const active = activeDragRef.current;
        if (active && pointerEvent.pointerId === active.pointerId) clearDrag(true);
      },
      blur() {
        clearDrag(true);
      },
    };
    listenersRef.current = listeners;
    window.addEventListener('pointermove', listeners.pointermove);
    window.addEventListener('pointerup', listeners.pointerup);
    window.addEventListener('pointercancel', listeners.pointercancel);
    window.addEventListener('blur', listeners.blur);
  }, [clearDrag]);

  useEffect(() => {
    if (!cancelKeysMatch(previousCancelKeysRef.current, options.cancelKeys)) cancelDrag();
    previousCancelKeysRef.current = options.cancelKeys;
  });

  useEffect(() => () => clearDrag(false), [clearDrag]);

  return {
    dragState,
    bindDragSource: (sourceId) => ({
      onPointerDown: (event) => beginDrag(sourceId, event),
    }),
    cancelDrag,
  };
}
