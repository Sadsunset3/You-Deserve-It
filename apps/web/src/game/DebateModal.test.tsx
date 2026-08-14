import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DebateModal } from './DebateModal';
import { makeRoom } from './test-fixtures';

describe('role-aware debate modal', () => {
  afterEach(cleanup);
  it('lets only the attacker select one of the opposing three people', () => {
    render(<DebateModal room={makeRoom()} send={async () => {}} />);
    expect(screen.getAllByRole('button', { name: /攻击目标/ })).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: '你的攻击辩词' })).toBeInTheDocument();
  });

  it('shows a waiting dialog to the defender before the attack is submitted', () => {
    render(<DebateModal room={makeRoom({ me: { playerId: 'p2', nickname: '乙方', seat: 'b', ready: true }, activeSpeaker: 'a' })} send={async () => {}} />);
    expect(screen.getByText('等待攻方提交')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the submitted attack and defense input only to the defender', () => {
    render(<DebateModal room={makeRoom({ phase: 'defense-input', me: { playerId: 'p2', nickname: '乙方', seat: 'b', ready: true }, activeSpeaker: 'b', currentTargetId: 'b0', currentAttack: { seat: 'a', role: 'attack', targetId: 'b0', text: '他不值得活', round: 1 }, attackText: '他不值得活' })} send={async () => {}} />);
    expect(screen.getByText('他不值得活')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '你的防守辩词' })).toBeInTheDocument();
  });
});
