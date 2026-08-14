import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GameStage } from './GameStage';
import { makeRoom } from './test-fixtures';

afterEach(cleanup);

describe('single-screen game stage', () => {
  it('shows three characters on each rail and keeps commands in modal layers', () => {
    render(<GameStage room={makeRoom()} send={async () => {}} leave={() => {}} />);
    expect(within(screen.getByTestId('rail-a')).getAllByTestId('rail-character')).toHaveLength(3);
    expect(within(screen.getByTestId('rail-b')).getAllByTestId('rail-character')).toHaveLength(3);
    expect(screen.getByRole('button', { name: '投降并退出' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '你的攻击辩词' })).toBeInTheDocument();
  });

  it('keeps rail evidence compact and opens the complete character dossier on demand', () => {
    const room = makeRoom();
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
    render(<GameStage room={makeRoom()} send={async () => {}} leave={() => {}} />);

    fireEvent.click(within(screen.getByTestId('rail-a')).getByRole('button', { name: '查看消防员人物档案' }));
    const drawer = screen.getByRole('dialog', { name: '人物档案：消防员' });
    expect(within(drawer).getByText('暂无词条')).toBeInTheDocument();
    expect(within(drawer).getByText('暂无胜出辩词')).toBeInTheDocument();
  });
});
