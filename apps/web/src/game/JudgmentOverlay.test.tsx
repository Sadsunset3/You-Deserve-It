import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JudgmentOverlay } from './JudgmentOverlay';
import { makeRoom } from './test-fixtures';

describe('dark shared judgment', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('renders the final judgment as ten ordered poem lines grouped by match evidence', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    render(<JudgmentOverlay room={makeRoom({ phase: 'judgment', trackVerdict: { crushedSeat: 'b', survivor: 'a', reason: '甲轨胜出', speech: '我看了两条轨，甲这边的人更站得住。', decisiveFactors: ['事实'], fallback: false }, judgment: { title: '最后的道岔', stanzas: [
      { kind: 'opening', lines: ['列车切开夜色，', '名字等待称量。'] },
      { kind: 'player-a', lines: ['甲方高举功绩，', '也藏起恐惧。'] },
      { kind: 'player-b', lines: ['乙方追问偿还，', '替自己的轨道呼吸。'] },
      { kind: 'tracks', lines: ['医生留在甲轨，', '小偷伏在乙轨。'] },
      { kind: 'verdict', lines: ['列车长拉下拉杆，', '乙轨被车轮带走。'] },
    ], fallback: false } })} send={async () => {}} />);
    expect(screen.getByRole('heading', { name: '最后的道岔' })).toBeInTheDocument();
    expect(screen.getByText('甲方高举功绩，')).toBeInTheDocument();
    expect(screen.getByText('乙方追问偿还，')).toBeInTheDocument();
    expect(screen.getByText('医生留在甲轨，')).toBeInTheDocument();
    expect(screen.getByText('列车长拉下拉杆，')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByRole('dialog')).toHaveClass('poem-judgment');
    expect(screen.getByRole('region', { name: '裁决诗播放区' })).toHaveAttribute('tabindex', '0');
  });

  it('shows the conductor speech page with the crushed player named, then fades to black near the deadline', async () => {
    const speech = '我看了两条轨，甲这边的人物更站得住，乙那边只能被压过去。';
    const trackVerdict = { crushedSeat: 'b' as const, survivor: 'a' as const, reason: '甲轨胜出', speech, decisiveFactors: ['事实'], fallback: false };
    const room = makeRoom({ phase: 'conductor-speech', deadline: new Date(Date.now() + 5_000).toISOString(), trackVerdict });
    const { rerender } = render(<JudgmentOverlay room={room} send={async () => {}} />);
    expect(screen.getByRole('dialog')).toHaveClass('conductor-speech');
    expect(screen.getByText('列车压过了乙方所在的轨道')).toBeInTheDocument();
    expect(screen.getByText(speech)).toBeInTheDocument();
    expect(screen.getByText(/列车长宣言/)).toBeInTheDocument();

    rerender(<JudgmentOverlay room={makeRoom({ phase: 'conductor-speech', deadline: new Date(Date.now() + 500).toISOString(), trackVerdict })} send={async () => {}} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveClass('fading'));
  });
});
