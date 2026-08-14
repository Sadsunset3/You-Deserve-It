import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GameStage } from './GameStage';
import { makeRoom } from './test-fixtures';

afterEach(cleanup);

describe('single-screen game stage', () => {
  it('routes every debate phase to the full-screen chat without modal or rail controls', () => {
    render(<GameStage room={makeRoom()} send={async () => {}} leave={() => {}} />);
    expect(screen.getByRole('region', { name: '攻防聊天室' })).toBeInTheDocument();
    expect(screen.queryByTestId('rail-a')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('提交攻击辩词')).not.toBeInTheDocument();
    expect(screen.getByLabelText('房间在线状态')).toBeVisible();
  });

  it('keeps connection state visible during final judgment and match end', () => {
    render(<GameStage room={makeRoom({ phase: 'match-end', finalResult: { survivor: 'a', reason: '乙方掉线', philosophy: '连接已经断开。' } })} send={async () => {}} leave={() => {}} />);
    expect(screen.getByLabelText('房间在线状态')).toBeVisible();
    expect(screen.getByText('甲方 · 在线')).toBeVisible();
  });

  it('keeps rail evidence compact and opens the complete character dossier on demand', () => {
    const room = makeRoom({ phase: 'traits' });
    room.characters = room.characters.map((character) => character.id === 'a0' ? {
      ...character,
      traits: [{ id: 'trait-1', text: '曾经拒绝救助仇人', tag: '过往', polarity: -1 as const }],
      arguments: [{ kind: 'defense' as const, text: '他救下的十二个人证明行动比动机更重要。' }],
    } : character);
    render(<GameStage room={room} send={async () => {}} leave={() => {}} />);

    const rail = screen.getByTestId('rail-a');
    expect(within(rail).getByText('词条 ×1')).toBeInTheDocument();
    expect(within(rail).getByText('辩词 ×1')).toBeInTheDocument();
    expect(within(rail).queryByText('曾经拒绝救助仇人')).not.toBeInTheDocument();
    expect(within(rail).queryByText('他救下的十二个人证明行动比动机更重要。')).not.toBeInTheDocument();

    fireEvent.click(within(rail).getByRole('button', { name: '查看消防员人物档案' }));
    const drawer = screen.getByRole('dialog', { name: '人物档案：消防员' });
    expect(within(drawer).getByText('曾经拒绝救助仇人')).toBeInTheDocument();
    expect(within(drawer).getByText('他救下的十二个人证明行动比动机更重要。')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '人物档案：消防员' })).not.toBeInTheDocument();
  });

  it('shows explicit empty evidence states in the character dossier', () => {
    render(<GameStage room={makeRoom({ phase: 'traits' })} send={async () => {}} leave={() => {}} />);

    fireEvent.click(within(screen.getByTestId('rail-a')).getByRole('button', { name: '查看消防员人物档案' }));
    const drawer = screen.getByRole('dialog', { name: '人物档案：消防员' });
    expect(within(drawer).getByText('暂无词条')).toBeInTheDocument();
    expect(within(drawer).getByText('暂无胜出辩词')).toBeInTheDocument();
  });
});
