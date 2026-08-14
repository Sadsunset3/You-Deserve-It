import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CharacterCard, RoomView } from '@ydi/contracts';
import { App, RoomScreen } from './App';

const handCharacters: CharacterCard[] = [
  { id: 'c1', name: '消防员', alignment: 'good', background: '救过六个人', portrait: '/c1.svg' },
  { id: 'c2', name: '记者', alignment: 'good', background: '揭露过真相', portrait: '/c2.svg' },
  { id: 'c3', name: '医生', alignment: 'good', background: '守住急诊室', portrait: '/c3.svg' },
  { id: 'c4', name: '商人', alignment: 'evil', background: '制造过垄断', portrait: '/c4.svg' },
  { id: 'c5', name: '黑客', alignment: 'evil', background: '窃取过隐私', portrait: '/c5.svg' },
  { id: 'c6', name: '法官', alignment: 'evil', background: '收受过贿赂', portrait: '/c6.svg' },
];

function makeRoom(overrides: Partial<RoomView> = {}): RoomView {
  return {
    roomCode: 'ABC234',
    phase: 'selecting',
    version: 2,
    round: 1,
    game: 1,
    config: { games: 1, timingMode: 'timed', selectionSeconds: 180, traitSeconds: 180, debateMinutes: 5 },
    conductor: { id: 'conductor-1', name: '铁面列车长', persona: '冷静审视每一种选择。', rule: '事实优先。', bias: 0 },
    deadline: null,
    me: { playerId: 'p1', nickname: '甲方玩家', seat: 'a', ready: true, connected: true },
    opponent: { nickname: '乙方玩家', ready: true, connected: true },
    opponentRemaining: { good: 1, evil: 1, traits: 2 },
    traitReadiness: { mine: false, opponent: false },
    hand: { characters: handCharacters, traits: [] },
    selections: { mine: [], opponent: [] },
    automaticCharacters: { mine: null, opponent: null },
    characters: [],
    roundAttacker: null,
    currentTargetId: null,
    debateMessages: [],
    messageSequence: 0,
    roundVerdict: null,
    roundRecords: [],
    trackVerdict: null,
    judgment: null,
    nextGameReady: { a: false, b: false },
    scores: { a: 0, b: 0 },
    finalResult: null,
    ...overrides,
  };
}

function selectForSlot(characterName: string, slotIndex: 0 | 1) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(characterName) }));
  fireEvent.click(screen.getByTestId(`mine-slot-${slotIndex}`));
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'elementFromPoint');
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

describe('player web', () => {
  it('explains the premise and offers create and join actions', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '活该' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '创建审判室' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '加入审判室' })).toBeInTheDocument();
    expect(screen.queryByText('最终问题')).not.toBeInTheDocument();
  });

  it('offers only odd match lengths that cannot end in a tied score', () => {
    render(<App />);

    const games = screen.getByLabelText('比赛局数');
    expect(within(games).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['1', '3', '5']);
  });

  it('uses tripled phase defaults and integer debate minutes without disconnect grace', () => {
    render(<App />);

    const selection = screen.getByLabelText('选牌秒数');
    const traits = screen.getByLabelText('词条秒数');
    const debate = screen.getByLabelText('攻防聊天室分钟');

    expect(selection).toHaveValue(180);
    expect(traits).toHaveValue(180);
    expect(debate).toHaveValue('5');
    expect(within(debate).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['3', '4', '5', '6', '7', '8', '9', '10']);
    expect(screen.queryByLabelText('掉线判负秒数')).not.toBeInTheDocument();

    fireEvent.change(selection, { target: { value: '999' } });
    expect(selection).toHaveValue(540);
  });

  it('disables only selecting and trait durations when unlimited is chosen', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('不限时'));

    expect(screen.getByLabelText('选牌秒数')).toBeDisabled();
    expect(screen.getByLabelText('词条秒数')).toBeDisabled();
    expect(screen.getByLabelText('攻防聊天室分钟')).toBeEnabled();
  });

  it('requires a successful DeepSeek key test before creating a room', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url === '/api/ai/test-key') return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ error: 'stop after inspecting request' }), { status: 409, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.change(screen.getByLabelText('你的称呼'), { target: { value: '甲方玩家' } });
    const keyInput = screen.getByLabelText('DeepSeek Key');
    fireEvent.change(keyInput, { target: { value: 'sk-room-one' } });
    const create = screen.getAllByRole('button', { name: '创建审判室' }).at(-1)!;
    expect(create).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(await screen.findByText('连接成功，可以创建房间')).toBeVisible();
    expect(create).toBeEnabled();

    fireEvent.click(create);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/rooms', expect.objectContaining({ method: 'POST' })));
    const createCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/rooms');
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ nickname: '甲方玩家', apiKey: 'sk-room-one' });
    expect(sessionStorage.getItem('sk-room-one')).toBeNull();

    fireEvent.change(keyInput, { target: { value: 'sk-room-two' } });
    expect(create).toBeDisabled();
    expect(screen.queryByText('连接成功，可以创建房间')).not.toBeInTheDocument();
  });

  it('does not ask joining players for a DeepSeek key', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '加入审判室' }));
    expect(screen.queryByLabelText('DeepSeek Key')).not.toBeInTheDocument();
  });

  it('keeps the waiting screen valid without a conductor', () => {
    render(<RoomScreen room={makeRoom({ phase: 'waiting', conductor: null, hand: null, opponent: null })} send={async () => {}} />);

    expect(screen.getByText('等待另一位被告')).toBeInTheDocument();
    expect(screen.getByText('空位')).toBeInTheDocument();
  });

  it('shows both player names and marks the current player in the waiting room', () => {
    render(<RoomScreen room={makeRoom({ phase: 'waiting', conductor: null, hand: null })} send={async () => {}} />);

    expect(screen.getByText('甲方玩家')).toBeVisible();
    expect(screen.getByText('乙方玩家')).toBeVisible();
    expect(screen.getByText('你')).toBeVisible();
  });

});

describe('selecting train stage', () => {
  it('shows total progress, score, and categorized opponent resources', () => {
    render(<RoomScreen room={makeRoom({
      game: 2,
      round: 3,
      config: { games: 5, timingMode: 'timed', selectionSeconds: 180, traitSeconds: 180, debateMinutes: 5 },
      scores: { a: 1, b: 2 },
      opponentRemaining: { good: 3, evil: 1, traits: 4 },
    })} send={async () => {}} />);

    expect(screen.getByText('第 2/5 局')).toBeVisible();
    expect(screen.getByText('第 3/3 次攻防')).toBeVisible();
    expect(screen.getByText('比分 1:2')).toBeVisible();
    expect(screen.getByText('好人 3')).toBeVisible();
    expect(screen.getByText('恶人 1')).toBeVisible();
    expect(screen.getByText('词条 4')).toBeVisible();
  });

  it('marks the character hand as fully spread with independent horizontal overflow', () => {
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);

    expect(screen.getByTestId('selection-hand-target')).toHaveClass('spread-hand');
    expect(screen.getAllByTestId('hand-character')).toHaveLength(6);
  });

  it('locks an automatically dealt good character beside the two player slots', () => {
    const automatic = { id: 'auto-good', name: '警察', alignment: 'good' as const, background: '保护群众时身受重伤。', portrait: 'css://initial/auto-good', traits: [], arguments: [] };
    render(<RoomScreen room={makeRoom({ automaticCharacters: { mine: automatic.id, opponent: null }, characters: [automatic] })} send={async () => {}} />);

    expect(screen.getByTestId('automatic-character-mine')).toHaveTextContent('警察');
    expect(screen.getByTestId('mine-slot-0')).toHaveTextContent('空槽位');
    expect(screen.getByTestId('mine-slot-1')).toHaveTextContent('空槽位');
  });

  it('confirms surrender, ends the match, and exits the room', async () => {
    const send = vi.fn(async () => {});
    const leave = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RoomScreen room={makeRoom()} send={send} leave={leave} />);

    fireEvent.click(screen.getByRole('button', { name: '投降并退出' }));

    await waitFor(() => expect(send).toHaveBeenCalledWith('surrender', expect.objectContaining({ expectedVersion: 2 })));
    expect(leave).toHaveBeenCalledOnce();
  });

  it('uses the complete character name as the avatar', () => {
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);

    expect(within(screen.getAllByTestId('hand-character')[0]!).getByTestId('character-avatar')).toHaveTextContent('消防员');
  });

  it('announces the opening deal while character dossiers arrive', () => {
    vi.useFakeTimers();
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);

    expect(screen.getByRole('status')).toHaveTextContent('正在发放人物档案');
    act(() => vi.advanceTimersByTime(1300));
    expect(screen.queryByText('正在发放人物档案')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('renders the judgment stage, current conductor, one train, both rails, and both players', () => {
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);

    const stage = screen.getByRole('region', { name: '火车审判现场' });
    expect(within(stage).getByRole('heading', { name: '选择两名人物' })).toBeInTheDocument();
    expect(within(stage).getByText('第 1/3 次攻防')).toBeInTheDocument();
    expect(within(stage).getByRole('heading', { name: '铁面列车长' })).toBeInTheDocument();
    expect(within(stage).getByText('冷静审视每一种选择。')).toBeInTheDocument();
    expect(within(stage).getByText('事实优先。')).toBeInTheDocument();
    expect(within(stage).getAllByRole('img', { name: '列车' })).toHaveLength(1);
    expect(within(stage).getByRole('group', { name: '轨道 A' })).toBeInTheDocument();
    expect(within(stage).getByRole('group', { name: '轨道 B' })).toBeInTheDocument();
    expect(within(stage).getByText('甲方玩家')).toBeInTheDocument();
    expect(within(stage).getByText('乙方玩家')).toBeInTheDocument();
    expect(within(stage).getByRole('region', { name: '人物选择托盘' })).toBeInTheDocument();
  });

  it('fails clearly when selecting has no current conductor', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<RoomScreen room={makeRoom({ conductor: null })} send={async () => {}} />))
      .toThrow('选择阶段缺少列车长');
  });

  it('shows six available private hand cards and excludes a server-locked card', () => {
    const locked = { id: 'c7', name: '已锁人物', alignment: 'good' as const, background: '已经上场', portrait: '/c7.svg' };
    render(<RoomScreen room={makeRoom({
      hand: { characters: [...handCharacters, locked], traits: [] },
      selections: { mine: ['c7'], opponent: [] },
      characters: [{ ...locked, traits: [], arguments: [] }],
    })} send={async () => {}} />);

    expect(screen.getAllByTestId('hand-character')).toHaveLength(6);
    expect(within(screen.getByTestId('selection-hand-target')).queryByText('已锁人物')).not.toBeInTheDocument();
  });

  it('conceals two identical opponent cards until public selections are confirmed', () => {
    const secret = { id: 'op-secret', name: '对方秘密人物', alignment: 'evil' as const, background: '不能提前公开', portrait: '/secret.svg', traits: [], arguments: [] };
    render(<RoomScreen room={makeRoom({ characters: [secret] })} send={async () => {}} />);

    expect(screen.getAllByText('对方人物尚未公开')).toHaveLength(2);
    expect(screen.queryByText('对方秘密人物')).not.toBeInTheDocument();
  });

  it('reveals only confirmed opponent selections backed by public characters', () => {
    const publicCharacters = handCharacters.slice(0, 2).map((card) => ({ ...card, traits: [], arguments: [] }));
    render(<RoomScreen room={makeRoom({
      selections: { mine: [], opponent: ['c1', 'c2'] },
      characters: publicCharacters,
    })} send={async () => {}} />);

    const opponentRail = screen.getByRole('group', { name: '轨道 B' });
    expect(within(opponentRail).getByText('消防员')).toBeInTheDocument();
    expect(within(opponentRail).getByText('记者')).toBeInTheDocument();
    expect(within(opponentRail).queryByText('对方人物尚未公开')).not.toBeInTheDocument();
  });

  it('places a selected hand character with two clicks and exposes pressed state', () => {
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);
    const firefighter = screen.getByRole('button', { name: /消防员/ });

    fireEvent.click(firefighter);
    expect(firefighter).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('mine-slot-0'));

    expect(within(screen.getByTestId('mine-slot-0')).getByText('消防员')).toBeInTheDocument();
  });

  it('uses native buttons for keyboard-operable hand cards and rail slots', () => {
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);

    expect(screen.getByRole('button', { name: /消防员/ }).tagName).toBe('BUTTON');
    expect(screen.getByTestId('mine-slot-0').tagName).toBe('BUTTON');
    expect(screen.getByTestId('mine-slot-1').tagName).toBe('BUTTON');
  });

  it('does not auto-submit, then sends two distinct IDs in slot order on explicit lock', async () => {
    const send = vi.fn(async () => undefined);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000006');
    render(<RoomScreen room={makeRoom({ version: 7 })} send={send} />);

    selectForSlot('记者', 0);
    selectForSlot('消防员', 1);
    expect(send).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '锁定人物' }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send).toHaveBeenCalledWith('select', {
      commandId: '00000000-0000-4000-8000-000000000006',
      expectedVersion: 7,
      characterIds: ['c2', 'c1'],
    });
  });

  it('moves and swaps a selected slotted character, then explicitly returns it to hand', () => {
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);
    selectForSlot('消防员', 0);
    selectForSlot('记者', 1);

    fireEvent.click(screen.getByTestId('mine-slot-0'));
    expect(screen.getByTestId('mine-slot-0')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('mine-slot-1'));
    expect(within(screen.getByTestId('mine-slot-0')).getByText('记者')).toBeInTheDocument();
    expect(within(screen.getByTestId('mine-slot-1')).getByText('消防员')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mine-slot-1'));
    fireEvent.click(screen.getByRole('button', { name: '移回手牌' }));
    expect(within(screen.getByTestId('mine-slot-1')).getByText('空槽位')).toBeInTheDocument();
  });

  it('drops a hand or slotted character on a rail slot and removes it on the hand target', () => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn() });
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);
    const handCard = screen.getByRole('button', { name: /消防员/ });
    vi.mocked(document.elementFromPoint).mockReturnValue(screen.getByTestId('mine-slot-0'));

    fireEvent.pointerDown(handCard, { pointerId: 11, clientX: 10, clientY: 10 });
    expect(screen.getByTestId('selection-drag-layer')).toHaveTextContent('消防员');
    fireEvent.pointerUp(window, { pointerId: 11, clientX: 40, clientY: 40 });
    expect(within(screen.getByTestId('mine-slot-0')).getByText('消防员')).toBeInTheDocument();

    vi.mocked(document.elementFromPoint).mockReturnValue(screen.getByTestId('selection-hand-target'));
    fireEvent.pointerDown(screen.getByTestId('mine-slot-0'), { pointerId: 12, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window, { pointerId: 12, clientX: 80, clientY: 80 });
    expect(within(screen.getByTestId('mine-slot-0')).getByText('空槽位')).toBeInTheDocument();
  });

  it('removes the dragged card from its hand position and restores the original order after an invalid drop', () => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => null) });
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);
    const secondCard = screen.getAllByTestId('hand-character')[1]!;

    fireEvent.pointerDown(secondCard, { pointerId: 51, clientX: 120, clientY: 500 });

    expect(screen.getByTestId('selection-drag-layer')).toHaveTextContent('记者');
    expect(screen.getAllByTestId('hand-character')).toHaveLength(5);
    expect(within(screen.getByTestId('selection-hand-target')).queryByText('记者')).not.toBeInTheDocument();

    fireEvent.pointerUp(window, { pointerId: 51, clientX: 900, clientY: 100 });

    expect(screen.getAllByTestId('hand-character')).toHaveLength(6);
    expect(screen.getAllByTestId('hand-character')[1]).toHaveTextContent('记者');
  });

  it('slides the remaining hand cards forward when a dragged card leaves the row', () => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => null) });
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel, finished: new Promise<void>(() => undefined) }) as unknown as Animation);
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1; });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const siblings = this.parentElement
        ? Array.from(this.parentElement.querySelectorAll<HTMLElement>(':scope > [data-character-card-id]'))
        : [];
      const left = Math.max(0, siblings.indexOf(this)) * 200;
      return { x: left, y: 0, left, top: 0, right: left + 180, bottom: 240, width: 180, height: 240, toJSON: () => ({}) } as DOMRect;
    });
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);

    fireEvent.pointerDown(screen.getAllByTestId('hand-character')[1]!, { pointerId: 54, clientX: 120, clientY: 500 });

    expect(animate).toHaveBeenCalledWith(
      [{ transform: 'translate(200px, 0px)' }, { transform: 'translate(0px, 0px)' }],
      { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' },
    );

    fireEvent.pointerMove(window, { pointerId: 54, clientX: 180, clientY: 520 });
    expect(cancel).not.toHaveBeenCalled();

    animate.mockClear();
    fireEvent.pointerUp(window, { pointerId: 54, clientX: 900, clientY: 100 });
    expect(animate).toHaveBeenCalledWith(
      [{ transform: 'translate(24px, 0px)', opacity: 0 }, { transform: 'translate(0px, 0px)', opacity: 1 }],
      { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
  });

  it('updates hand order without animation when reduced motion is requested', () => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => null) });
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }) as unknown as Animation);
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const siblings = this.parentElement
        ? Array.from(this.parentElement.querySelectorAll<HTMLElement>(':scope > [data-character-card-id]'))
        : [];
      const left = Math.max(0, siblings.indexOf(this)) * 200;
      return { x: left, y: 0, left, top: 0, right: left + 180, bottom: 240, width: 180, height: 240, toJSON: () => ({}) } as DOMRect;
    });
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);

    fireEvent.pointerDown(screen.getAllByTestId('hand-character')[1]!, { pointerId: 55, clientX: 120, clientY: 500 });

    expect(screen.getAllByTestId('hand-character')).toHaveLength(5);
    expect(animate).not.toHaveBeenCalled();
  });

  it('restores an extracted hand card after pointer cancellation or window blur', () => {
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);

    fireEvent.pointerDown(screen.getAllByTestId('hand-character')[2]!, { pointerId: 52, clientX: 220, clientY: 500 });
    expect(screen.getAllByTestId('hand-character')).toHaveLength(5);
    fireEvent.pointerCancel(window, { pointerId: 52 });
    expect(screen.getAllByTestId('hand-character')[2]).toHaveTextContent('医生');

    fireEvent.pointerDown(screen.getAllByTestId('hand-character')[2]!, { pointerId: 53, clientX: 220, clientY: 500 });
    expect(screen.getAllByTestId('hand-character')).toHaveLength(5);
    fireEvent.blur(window);
    expect(screen.getAllByTestId('hand-character')[2]).toHaveTextContent('医生');
  });

  it('changes nothing after an illegal pointer drop', () => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => null) });
    render(<RoomScreen room={makeRoom()} send={async () => {}} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: /消防员/ }), { pointerId: 13, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { pointerId: 13, clientX: 90, clientY: 90 });

    expect(within(screen.getByTestId('mine-slot-0')).getByText('空槽位')).toBeInTheDocument();
    expect(within(screen.getByTestId('mine-slot-1')).getByText('空槽位')).toBeInTheDocument();
  });

  it('disables every selection boundary and prevents duplicate submits while pending', async () => {
    const pending = deferred();
    const send = vi.fn(() => pending.promise);
    render(<RoomScreen room={makeRoom()} send={send} />);
    selectForSlot('消防员', 0);
    selectForSlot('记者', 1);
    const lock = screen.getByRole('button', { name: '锁定人物' });

    fireEvent.click(lock);
    expect(lock).toBeDisabled();
    expect(screen.getAllByTestId('hand-character').every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByTestId('mine-slot-0')).toBeDisabled();
    expect(screen.getByTestId('mine-slot-1')).toBeDisabled();
    fireEvent.click(lock);
    expect(send).toHaveBeenCalledOnce();

    await act(async () => pending.resolve());
    expect(within(screen.getByTestId('mine-slot-0')).getByText('空槽位')).toBeInTheDocument();
    expect(within(screen.getByTestId('mine-slot-1')).getByText('空槽位')).toBeInTheDocument();
  });

  it('retains both slots and restores interaction when submission rejects', async () => {
    const send = vi.fn(async () => { throw new Error('版本冲突'); });
    render(<RoomScreen room={makeRoom()} send={send} />);
    selectForSlot('消防员', 0);
    selectForSlot('记者', 1);

    fireEvent.click(screen.getByRole('button', { name: '锁定人物' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '锁定人物' })).toBeEnabled());

    expect(within(screen.getByTestId('mine-slot-0')).getByText('消防员')).toBeInTheDocument();
    expect(within(screen.getByTestId('mine-slot-1')).getByText('记者')).toBeInTheDocument();
  });

  it('retains local slots across a same-phase version refresh', () => {
    const { rerender } = render(<RoomScreen room={makeRoom({ version: 2 })} send={async () => {}} />);
    selectForSlot('消防员', 0);
    selectForSlot('记者', 1);

    rerender(<RoomScreen room={makeRoom({ version: 3 })} send={async () => {}} />);

    expect(within(screen.getByTestId('mine-slot-0')).getByText('消防员')).toBeInTheDocument();
    expect(within(screen.getByTestId('mine-slot-1')).getByText('记者')).toBeInTheDocument();
  });

  it('clears old local slots when the server confirms selection in the same phase', () => {
    const { rerender } = render(<RoomScreen room={makeRoom()} send={async () => {}} />);
    selectForSlot('消防员', 0);
    selectForSlot('记者', 1);

    rerender(<RoomScreen room={makeRoom({ selections: { mine: ['c3', 'c4'], opponent: [] } })} send={async () => {}} />);
    rerender(<RoomScreen room={makeRoom({ version: 3, selections: { mine: [], opponent: [] } })} send={async () => {}} />);

    expect(within(screen.getByTestId('mine-slot-0')).getByText('空槽位')).toBeInTheDocument();
    expect(within(screen.getByTestId('mine-slot-1')).getByText('空槽位')).toBeInTheDocument();
  });

  it('clears local slots after server confirmation and cancels drag on phase change', () => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn() });
    const { rerender } = render(<RoomScreen room={makeRoom()} send={async () => {}} />);
    selectForSlot('消防员', 0);
    selectForSlot('记者', 1);
    fireEvent.pointerDown(screen.getByTestId('mine-slot-0'), { pointerId: 14, clientX: 10, clientY: 10 });
    expect(screen.getByTestId('selection-drag-layer')).toBeInTheDocument();

    rerender(<RoomScreen room={makeRoom({ phase: 'traits', selections: { mine: ['c1', 'c2'], opponent: [] } })} send={async () => {}} />);

    expect(screen.queryByTestId('selection-drag-layer')).not.toBeInTheDocument();
    fireEvent.pointerUp(window, { pointerId: 14, clientX: 50, clientY: 50 });
    expect(screen.queryByTestId('selection-drag-layer')).not.toBeInTheDocument();
  });
});

describe('trait placement drag', () => {
  const trait = { id: 'trait-1', text: '曾主动偿还所有欠款', tag: '信用', polarity: 1 as const };
  const traitRoom = () => makeRoom({
    phase: 'traits',
    hand: { characters: handCharacters, traits: [trait] },
    selections: { mine: ['c1', 'c2'], opponent: ['c3', 'c4'] },
    characters: handCharacters.slice(0, 4).map((card) => ({ ...card, traits: [], arguments: [] })),
  });

  it('keeps the trait action bar in document flow instead of covering trait cards', () => {
    render(<RoomScreen room={traitRoom()} send={async () => {}} />);

    expect(screen.getByTestId('trait-action-bar')).toHaveClass('in-flow-action-bar');
  });

  it('shows immediate progress and then waits visibly for the opponent', async () => {
    const request = deferred();
    const send = vi.fn((action: string) => action === 'traits-done' ? request.promise : Promise.resolve());
    const { rerender } = render(<RoomScreen room={traitRoom()} send={send} />);

    fireEvent.click(screen.getByRole('button', { name: '结束词条阶段' }));
    expect(screen.getByRole('button', { name: '正在确认…' })).toBeDisabled();
    request.resolve();
    await waitFor(() => expect(send).toHaveBeenCalledWith('traits-done', expect.objectContaining({ expectedVersion: 2 })));

    rerender(<RoomScreen room={makeRoom({ ...traitRoom(), traitReadiness: { mine: true, opponent: false } })} send={send} />);
    expect(screen.getByRole('button', { name: '等待对方结束词条阶段' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('你已结束词条阶段，等待对方确认');

    rerender(<RoomScreen room={makeRoom({ ...traitRoom(), traitReadiness: { mine: false, opponent: true } })} send={send} />);
    expect(screen.getByRole('button', { name: '确认并进入攻防' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('对方已结束词条阶段');
  });

  it('uses the same compact rail dossier and detail drawer during trait placement', () => {
    const room = traitRoom();
    room.characters = room.characters.map((character) => character.id === 'c1' ? {
      ...character,
      traits: [trait],
      arguments: [{ kind: 'defense' as const, text: '这段辩护应当只在详情中出现。' }],
    } : character);
    render(<RoomScreen room={room} send={async () => {}} />);

    const rail = screen.getByTestId('rail-a');
    expect(within(rail).getByText('词条 ×1')).toBeInTheDocument();
    expect(within(rail).queryByText(trait.text)).not.toBeInTheDocument();
    fireEvent.click(within(rail).getByRole('button', { name: '查看消防员人物档案' }));
    expect(within(screen.getByRole('dialog', { name: '人物档案：消防员' })).getByText(trait.text)).toBeInTheDocument();
  });

  it('shows a floating note and attaches it when dropped on a rail character', async () => {
    const send = vi.fn(async () => {});
    render(<RoomScreen room={traitRoom()} send={send} />);
    const target = document.querySelector('[data-character-id="c3"]');
    expect(target).not.toBeNull();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => target) });

    fireEvent.pointerDown(screen.getByTestId('trait-card'), { pointerId: 31, clientX: 20, clientY: 30 });
    expect(screen.getByTestId('trait-drag-layer')).toHaveTextContent(trait.text);
    expect(screen.getAllByText('贴到这里')).toHaveLength(4);
    fireEvent.pointerUp(window, { pointerId: 31, clientX: 80, clientY: 90 });

    await waitFor(() => expect(send).toHaveBeenCalledWith('trait', expect.objectContaining({ traitId: trait.id, targetId: 'c3' })));
    expect(screen.queryByTestId('trait-drag-layer')).not.toBeInTheDocument();
  });

  it('does not attach a trait when it is released outside a character', () => {
    const send = vi.fn(async () => {});
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => null) });
    render(<RoomScreen room={traitRoom()} send={send} />);

    fireEvent.pointerDown(screen.getByTestId('trait-card'), { pointerId: 32, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(window, { pointerId: 32, clientX: 80, clientY: 90 });

    expect(send).not.toHaveBeenCalled();
    expect(screen.queryByTestId('trait-drag-layer')).not.toBeInTheDocument();
  });
});
