import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebateChatPage } from './DebateChatPage';
import { characters, makeRoom } from './test-fixtures';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('DebateChatPage', () => {
  it('lets only the attacker lock one of the three opponent targets', async () => {
    const send = vi.fn(async () => undefined);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000700');
    const room = makeRoom({ phase: 'target-selecting', roundAttacker: 'a' });
    render(<DebateChatPage room={room} send={send} />);

    expect(screen.getAllByRole('button', { name: /设为攻防目标/ })).toHaveLength(3);
    expect(screen.getByText('保护群众时身受重伤。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '将警察设为攻防目标' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('debate-target', {
      commandId: '00000000-0000-4000-8000-000000000700',
      expectedVersion: room.version,
      targetId: 'b0',
    }));
  });

  it('shows the defender a waiting state before the attacker locks a target', () => {
    render(<DebateChatPage room={makeRoom({ phase: 'target-selecting', me: { playerId: 'p2', nickname: '乙方', seat: 'b', ready: true, connected: true }, roundAttacker: 'a' })} send={async () => undefined} />);

    expect(screen.getByText('等待攻方锁定目标')).toBeVisible();
    expect(screen.queryByRole('button', { name: /设为攻防目标/ })).not.toBeInTheDocument();
  });

  it('shows complete dossiers, orders the transcript, and sends without a room version', async () => {
    const send = vi.fn(async () => undefined);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000701');
    const target = { ...characters[3]!, traits: [{ id: 't1', text: '主动赔偿全部损失', tag: '补救', polarity: 1 as const }], arguments: [{ kind: 'defense' as const, text: '仍能保护更多无辜者。' }] };
    const room = makeRoom({
      phase: 'debate-chat', currentTargetId: target.id, characters: characters.map((item) => item.id === target.id ? target : item),
      deadline: new Date(Date.now() + 300_000).toISOString(),
      debateMessages: [
        { messageId: 'second', sequence: 2, sender: 'b', text: '乙方第二条', sentAt: '2026-08-15T00:00:02.000Z' },
        { messageId: 'first', sequence: 1, sender: 'a', text: '甲方第一条', sentAt: '2026-08-15T00:00:01.000Z' },
      ],
    });
    render(<DebateChatPage room={room} send={send} />);

    expect(screen.getByRole('heading', { name: '警察' })).toBeVisible();
    expect(screen.getByText('主动赔偿全部损失')).toBeVisible();
    expect(screen.getByText('仍能保护更多无辜者。')).toBeVisible();
    expect(screen.getByRole('heading', { name: '铁面列车长' })).toBeVisible();
    expect(screen.getByLabelText('铁面列车长头像')).toBeVisible();
    const messages = screen.getAllByTestId('debate-message');
    expect(messages[0]).toHaveTextContent('甲方第一条');
    expect(messages[1]).toHaveTextContent('乙方第二条');
    expect(within(messages[0]!).getByText('甲方')).toBeVisible();
    expect(within(messages[1]!).getByText('乙方')).toBeVisible();
    expect(within(messages[0]!).getByText('进攻方')).toBeVisible();
    expect(within(messages[1]!).getByText('防守方')).toBeVisible();
    expect(screen.getByText(/不要为人物虚构背景/)).toBeVisible();

    fireEvent.change(screen.getByLabelText('发送辩论消息'), { target: { value: '  我替自己所在的轨道辩护  ' } });
    fireEvent.keyDown(screen.getByLabelText('发送辩论消息'), { key: 'Enter', shiftKey: false });
    await waitFor(() => expect(send).toHaveBeenCalledWith('debate-messages', {
      messageId: '00000000-0000-4000-8000-000000000701',
      text: '我替自己所在的轨道辩护',
    }));
  });

  it('locks the composer during adjudication and posts the conductor verdict in the transcript', () => {
    const verdict = { winnerSeat: 'a' as const, conductorMessage: '得了，这轮甲方抓住了关键，我判甲方赢。', debateSummary: '双方围绕责任交锋。', winningSummary: '责任不能被功绩抵消。', fallback: false };
    const room = makeRoom({ phase: 'round-result', currentTargetId: 'b0', roundVerdict: verdict });
    render(<DebateChatPage room={room} send={async () => undefined} />);

    expect(screen.getByLabelText('发送辩论消息')).toBeDisabled();
    expect(screen.getByTestId('conductor-verdict')).toHaveTextContent(verdict.conductorMessage);
    expect(screen.getByTestId('conductor-verdict')).toHaveTextContent('本轮胜方：甲方（进攻方）');
    expect(screen.getByTestId('conductor-verdict')).toHaveTextContent(verdict.winningSummary);
    expect(screen.getByTestId('conductor-verdict')).toHaveTextContent('总结辩词已记入目标人物档案');
    expect(screen.getByRole('button', { name: '确认，进入下一轮攻防' })).toBeVisible();
  });

  it('sends round-result-done when the player confirms the verdict', async () => {
    const send = vi.fn(async () => undefined);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000703');
    const verdict = { winnerSeat: 'a' as const, conductorMessage: '我赞同甲方。', debateSummary: '总结', winningSummary: '责任不能被功绩抵消。', fallback: false };
    const room = makeRoom({ phase: 'round-result', currentTargetId: 'b0', roundVerdict: verdict });
    render(<DebateChatPage room={room} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: '确认，进入下一轮攻防' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('round-result-done', { commandId: '00000000-0000-4000-8000-000000000703', expectedVersion: room.version }));
  });

  it('reflects confirmation readiness and uses final-track wording on round three', () => {
    const verdict = { winnerSeat: 'b' as const, conductorMessage: '这轮乙方更站得住。', debateSummary: '总结', winningSummary: '他仍有价值。', fallback: false };
    const room = makeRoom({ phase: 'round-result', currentTargetId: 'b0', roundVerdict: verdict, roundResultReady: { mine: true, opponent: false } });
    const { unmount } = render(<DebateChatPage room={room} send={async () => undefined} />);
    expect(screen.getByText('你已确认 ✓')).toBeVisible();
    expect(screen.getByText('等待对方确认…')).toBeVisible();
    expect(screen.getByRole('button', { name: '已确认，等待对方' })).toBeDisabled();
    expect(screen.getByTestId('conductor-verdict')).toHaveTextContent('本轮胜方：乙方（防守方）');
    unmount();

    const third = makeRoom({ phase: 'round-result', round: 3, currentTargetId: 'b0', roundVerdict: verdict });
    render(<DebateChatPage room={third} send={async () => undefined} />);
    expect(screen.getByRole('button', { name: '确认，进入最终压轨' })).toBeVisible();
  });

  it('keeps focus in the composer after sending with Enter so typing can continue', async () => {
    const send = vi.fn(async () => undefined);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000702');
    render(<DebateChatPage room={makeRoom({ phase: 'debate-chat', currentTargetId: 'b0' })} send={send} />);
    const input = screen.getByLabelText('发送辩论消息') as HTMLTextAreaElement;
    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: '我继续替自己辩护' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    await waitFor(() => expect(input.value).toBe(''));
    expect(send).toHaveBeenCalledWith('debate-messages', { messageId: '00000000-0000-4000-8000-000000000702', text: '我继续替自己辩护' });
    expect(document.activeElement).toBe(input);
  });

  it('shows the candidate full dossier (traits and winning arguments) when the attacker locks a target', () => {
    const candidates = characters.map((item) => item.id === 'b0'
      ? { ...item, traits: [{ id: 'bt1', text: '从不临阵脱逃', tag: '责任', polarity: 1 as const }], arguments: [{ kind: 'defense' as const, text: '用自己的重伤换回整条街的平安。' }] }
      : item);
    const room = makeRoom({ phase: 'target-selecting', roundAttacker: 'a', characters: candidates });
    render(<DebateChatPage room={room} send={async () => undefined} />);

    const police = screen.getByRole('button', { name: '将警察设为攻防目标' });
    expect(within(police).getByText('从不临阵脱逃')).toBeVisible();
    expect(within(police).getByText('责任')).toBeVisible();
    expect(within(police).getByText('用自己的重伤换回整条街的平安。')).toBeVisible();
    expect(screen.getByText('你是进攻方')).toBeVisible();
  });

  it('shows the defender their role badge while waiting for the attacker to lock a target', () => {
    render(<DebateChatPage room={makeRoom({ phase: 'target-selecting', me: { playerId: 'p2', nickname: '乙方', seat: 'b', ready: true, connected: true }, roundAttacker: 'a' })} send={async () => undefined} />);

    expect(screen.getByText('你是防守方')).toBeVisible();
  });
});
