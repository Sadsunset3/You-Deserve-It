import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JudgmentOverlay } from './JudgmentOverlay';
import { makeRoom } from './test-fixtures';

describe('dark shared judgment', () => {
  it('shows both player critiques, conductor critique and two questions', () => {
    render(<JudgmentOverlay room={makeRoom({ phase: 'judgment', trackVerdict: { crushedSeat: 'b', survivor: 'a', reason: '甲轨胜出', decisiveFactors: ['事实'], fallback: false }, judgment: { title: '最后的道岔', summary: '生命被变成比较题。', playerA: '甲方把功绩当筹码。', playerB: '乙方把悔恨当赎金。', conductorCritique: '列车长把偏见包装成秩序。', questions: ['功绩能抵罪吗？', '谁有资格定价？'], fallback: false } })} send={async () => {}} />);
    expect(screen.getByRole('heading', { name: '最后的道岔' })).toBeInTheDocument();
    expect(screen.getByText('甲方把功绩当筹码。')).toBeInTheDocument();
    expect(screen.getByText('乙方把悔恨当赎金。')).toBeInTheDocument();
    expect(screen.getByText('列车长把偏见包装成秩序。')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
