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
    expect(screen.getByTestId('conductor-verdict')).toHaveTextContent('甲方胜出');
  });
});
