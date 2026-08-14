import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePointerDrag, type DropTarget } from './use-pointer-drag';

type DragHarnessProps = {
  cancelKeys?: readonly unknown[];
  onDrop: (sourceId: string, target: DropTarget | null) => void;
};

function DragHarness({ cancelKeys, onDrop }: DragHarnessProps) {
  const { bindDragSource, cancelDrag, dragState } = usePointerDrag({
    onDrop,
    ...(cancelKeys === undefined ? {} : { cancelKeys }),
  });
  const [renderCount, setRenderCount] = useState(0);

  return (
    <>
      <button data-testid="source-a" {...bindDragSource('source-a')}>source a</button>
      <button data-testid="source-b" {...bindDragSource('source-b')}>source b</button>
      <button onClick={cancelDrag}>cancel</button>
      <button onClick={() => setRenderCount((count) => count + 1)}>rerender {renderCount}</button>
      <output data-testid="drag-state">{dragState ? JSON.stringify(dragState) : 'idle'}</output>
      <div data-drop-type="selection-slot" data-slot-index="0" data-testid="slot-0"><span data-testid="slot-child">slot</span></div>
      <div data-drop-type="hand" data-testid="hand">hand</div>
      <div data-drop-type="character" data-character-id="character-7" data-testid="character">character</div>
    </>
  );
}

type FrameCallback = (time: number) => void;

let frameCallbacks: FrameCallback[];
let requestFrame: ReturnType<typeof vi.spyOn>;
let cancelFrame: ReturnType<typeof vi.spyOn>;

function beginDrag(testId = 'source-a', pointerId = 11, clientX = 10, clientY = 20) {
  fireEvent.pointerDown(screen.getByTestId(testId), { pointerId, clientX, clientY });
}

function dragState() {
  return screen.getByTestId('drag-state').textContent;
}

function flushFrame() {
  const callback = frameCallbacks.shift();
  if (!callback) throw new Error('Expected a scheduled animation frame');
  act(() => callback(16));
}

beforeEach(() => {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn<(x: number, y: number) => Element | null>(),
  });
  frameCallbacks = [];
  requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
});

describe('usePointerDrag', () => {
  it.each([
    ['selection slot through its closest ancestor', 'slot-child', { type: 'selection-slot', index: 0 }],
    ['hand', 'hand', { type: 'hand' }],
    ['character with its identifier', 'character', { type: 'character', id: 'character-7' }],
  ] as const)('drops on a legal %s', (_name, targetId, expectedTarget) => {
    const onDrop = vi.fn();
    render(<DragHarness onDrop={onDrop} />);
    const target = screen.getByTestId(targetId);
    vi.mocked(document.elementFromPoint).mockReturnValue(target);

    beginDrag();
    fireEvent.pointerUp(window, { pointerId: 11, clientX: 71, clientY: 83 });

    expect(document.elementFromPoint).toHaveBeenCalledWith(71, 83);
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith('source-a', expectedTarget);
    expect(dragState()).toBe('idle');
  });

  it.each([
    ['selection slot without an index', { 'data-drop-type': 'selection-slot' }],
    ['selection slot with an invalid index', { 'data-drop-type': 'selection-slot', 'data-slot-index': '2' }],
    ['character without an id', { 'data-drop-type': 'character' }],
    ['character with an empty id', { 'data-drop-type': 'character', 'data-character-id': '' }],
    ['unknown semantic type', { 'data-drop-type': 'discard' }],
  ])('treats a malformed %s as no target', (_name, attributes) => {
    const onDrop = vi.fn();
    const malformed = document.createElement('div');
    for (const [name, value] of Object.entries(attributes)) malformed.setAttribute(name, value);
    document.body.append(malformed);
    vi.mocked(document.elementFromPoint).mockReturnValue(malformed);
    render(<DragHarness onDrop={onDrop} />);

    beginDrag();
    fireEvent.pointerUp(window, { pointerId: 11, clientX: 30, clientY: 40 });

    expect(onDrop).toHaveBeenCalledWith('source-a', null);
    malformed.remove();
  });

  it('reports an illegal release with no element as null', () => {
    const onDrop = vi.fn();
    render(<DragHarness onDrop={onDrop} />);
    vi.mocked(document.elementFromPoint).mockReturnValue(null);

    beginDrag();
    fireEvent.pointerUp(window, { pointerId: 11, clientX: 30, clientY: 40 });

    expect(onDrop).toHaveBeenCalledWith('source-a', null);
  });

  it('records the pointer and captures it when capture is available', () => {
    const onDrop = vi.fn();
    render(<DragHarness onDrop={onDrop} />);
    const source = screen.getByTestId('source-a');
    const setPointerCapture = vi.fn();
    Object.defineProperty(source, 'setPointerCapture', { configurable: true, value: setPointerCapture });

    beginDrag('source-a', 14, 12, 23);

    expect(setPointerCapture).toHaveBeenCalledWith(14);
    expect(dragState()).toBe(JSON.stringify({ sourceId: 'source-a', pointerId: 14, x: 12, y: 23 }));
  });

  it('does not crash when pointer capture is unavailable', () => {
    render(<DragHarness onDrop={vi.fn()} />);
    const source = screen.getByTestId('source-a');
    Object.defineProperty(source, 'setPointerCapture', { configurable: true, value: undefined });

    expect(() => beginDrag()).not.toThrow();
    expect(dragState()).not.toBe('idle');
  });

  it('ignores movement and release from a pointer that is not active', () => {
    const onDrop = vi.fn();
    render(<DragHarness onDrop={onDrop} />);
    vi.mocked(document.elementFromPoint).mockReturnValue(screen.getByTestId('hand'));
    beginDrag('source-a', 11, 10, 20);

    fireEvent.pointerMove(window, { pointerId: 99, clientX: 70, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 99, clientX: 70, clientY: 80 });

    expect(requestFrame).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    expect(dragState()).toBe(JSON.stringify({ sourceId: 'source-a', pointerId: 11, x: 10, y: 20 }));

    fireEvent.pointerUp(window, { pointerId: 11, clientX: 71, clientY: 81 });
    expect(onDrop).toHaveBeenCalledOnce();
  });

  it('coalesces pointer movement into one frame using the newest coordinates', () => {
    render(<DragHarness onDrop={vi.fn()} />);
    beginDrag('source-a', 11, 10, 20);

    fireEvent.pointerMove(window, { pointerId: 11, clientX: 30, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 50, clientY: 60 });

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(dragState()).toBe(JSON.stringify({ sourceId: 'source-a', pointerId: 11, x: 10, y: 20 }));

    flushFrame();
    expect(dragState()).toBe(JSON.stringify({ sourceId: 'source-a', pointerId: 11, x: 50, y: 60 }));
  });

  it.each([
    ['pointer cancellation', () => fireEvent.pointerCancel(window, { pointerId: 11 })],
    ['window blur', () => fireEvent.blur(window)],
    ['explicit cancellation', () => fireEvent.click(screen.getByRole('button', { name: 'cancel' }))],
  ] as const)('%s clears without dropping and cancels a pending frame', (_name, cancel) => {
    const onDrop = vi.fn();
    render(<DragHarness onDrop={onDrop} />);
    beginDrag();
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 30, clientY: 40 });

    cancel();

    expect(onDrop).not.toHaveBeenCalled();
    expect(dragState()).toBe('idle');
    expect(cancelFrame).toHaveBeenCalledOnce();
  });

  it('ignores pointercancel from a pointer that is not active', () => {
    render(<DragHarness onDrop={vi.fn()} />);
    beginDrag();

    fireEvent.pointerCancel(window, { pointerId: 99 });

    expect(dragState()).not.toBe('idle');
  });

  it('cancels when any cancel key changes but not on an unrelated rerender', () => {
    const onDrop = vi.fn();
    const { rerender } = render(<DragHarness cancelKeys={['selecting', 1]} onDrop={onDrop} />);
    beginDrag();

    fireEvent.click(screen.getByRole('button', { name: /rerender/ }));
    expect(dragState()).not.toBe('idle');

    rerender(<DragHarness cancelKeys={['selecting', 2]} onDrop={onDrop} />);
    expect(dragState()).toBe('idle');
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('starting another drag cancels the first and drops only the new source', () => {
    const onDrop = vi.fn();
    render(<DragHarness onDrop={onDrop} />);
    vi.mocked(document.elementFromPoint).mockReturnValue(screen.getByTestId('hand'));
    beginDrag('source-a', 11);
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 30, clientY: 40 });

    beginDrag('source-b', 22, 50, 60);
    fireEvent.pointerUp(window, { pointerId: 11, clientX: 70, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 22, clientX: 71, clientY: 81 });

    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith('source-b', { type: 'hand' });
  });

  it('cancels a pending frame when a drag is dropped', () => {
    const onDrop = vi.fn();
    render(<DragHarness onDrop={onDrop} />);
    vi.mocked(document.elementFromPoint).mockReturnValue(screen.getByTestId('hand'));
    beginDrag();
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 30, clientY: 40 });

    fireEvent.pointerUp(window, { pointerId: 11, clientX: 50, clientY: 60 });

    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledOnce();
    expect(dragState()).toBe('idle');
  });

  it('removes every global listener with the same callback when a drag ends', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    render(<DragHarness onDrop={vi.fn()} />);
    vi.mocked(document.elementFromPoint).mockReturnValue(null);

    beginDrag();
    fireEvent.pointerUp(window, { pointerId: 11, clientX: 10, clientY: 20 });

    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'blur'] as const) {
      const addedCallback = add.mock.calls.find(([eventType]) => eventType === type)?.[1];
      expect(addedCallback).toBeDefined();
      expect(remove).toHaveBeenCalledWith(type, addedCallback);
    }
  });

  it('cancels a pending frame and removes listeners on unmount without dropping', () => {
    const onDrop = vi.fn();
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<DragHarness onDrop={onDrop} />);
    beginDrag();
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 30, clientY: 40 });

    unmount();

    expect(onDrop).not.toHaveBeenCalled();
    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(remove.mock.calls.filter(([type]) => ['pointermove', 'pointerup', 'pointercancel', 'blur'].includes(String(type)))).toHaveLength(4);
  });

  it('does not react to global pointer events after explicit cancellation', () => {
    const onDrop = vi.fn();
    render(<DragHarness onDrop={onDrop} />);
    vi.mocked(document.elementFromPoint).mockReturnValue(screen.getByTestId('hand'));
    beginDrag();

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 30, clientY: 40 });
    fireEvent.pointerUp(window, { pointerId: 11, clientX: 50, clientY: 60 });

    expect(requestFrame).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    expect(dragState()).toBe('idle');
  });
});
