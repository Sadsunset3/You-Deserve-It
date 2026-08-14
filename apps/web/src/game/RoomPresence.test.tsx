import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeRoom } from './test-fixtures';
import { RoomPresence } from './RoomPresence';

describe('RoomPresence', () => {
  it('shows both players and does not rely on color to describe a disconnect', () => {
    render(<RoomPresence room={makeRoom({ opponent: { nickname: '乙方', ready: true, connected: false } })} />);

    expect(screen.getByText('甲方 · 在线')).toBeInTheDocument();
    expect(screen.getByText('乙方 · 已掉线')).toBeInTheDocument();
  });

  it('shows an explicit empty-seat state before an opponent joins', () => {
    render(<RoomPresence room={makeRoom({ opponent: null })} />);
    expect(screen.getByText('等待对手')).toBeInTheDocument();
  });
});
