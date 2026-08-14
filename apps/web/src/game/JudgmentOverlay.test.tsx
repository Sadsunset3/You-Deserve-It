import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JudgmentOverlay } from './JudgmentOverlay';
import { makeRoom } from './test-fixtures';

describe('dark shared judgment', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders the final judgment as ten ordered poem lines grouped by match evidence', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    render(<JudgmentOverlay room={makeRoom({ phase: 'judgment', trackVerdict: { crushedSeat: 'b', survivor: 'a', reason: '甲轨胜出', decisiveFactors: ['事实'], fallback: false }, judgment: { title: '最后的道岔', stanzas: [
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
});
