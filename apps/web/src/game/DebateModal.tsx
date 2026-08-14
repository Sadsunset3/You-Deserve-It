import { useEffect, useMemo, useState } from 'react';
import type { RoomView } from '@ydi/contracts';

type Props = { room: RoomView; send(action: string, body?: object): Promise<void> };
const command = (room: RoomView) => ({ commandId: crypto.randomUUID(), expectedVersion: room.version });

export function DebateModal({ room, send }: Props) {
  const [targetId, setTargetId] = useState('');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const isAttacker = room.me.seat === room.roundAttacker;
  const isDefender = !isAttacker;
  const opponentIds = useMemo(() => [room.automaticCharacters.opponent, ...room.selections.opponent].filter((id): id is string => Boolean(id)), [room.automaticCharacters.opponent, room.selections.opponent]);
  const targets = opponentIds.map((id) => room.characters.find((card) => card.id === id)).filter((card): card is NonNullable<typeof card> => Boolean(card));

  useEffect(() => { setText(''); setTargetId(''); setPending(false); }, [room.phase, room.round, room.version]);

  const submit = async (action: 'attack' | 'defend') => {
    if (pending || !text.trim() || (action === 'attack' && !targetId)) return;
    setPending(true);
    try {
      await send(action, { ...command(room), ...(action === 'attack' ? { targetId } : {}), text: text.trim() });
    } catch {
      setPending(false);
    }
  };

  if (room.phase === 'attack-input') return (
    <section className="debate-modal" role="dialog" aria-modal="true" aria-labelledby="debate-title">
      <span className="modal-kicker">第 {room.round} 回合 · 攻方陈词</span>
      <h2 id="debate-title">{isAttacker ? '选择一个人，证明他不值得活' : '等待攻方提交'}</h2>
      {isAttacker ? <>
        <div className="modal-targets">{targets.map((card) => <button type="button" aria-label={`攻击目标：${card.name}`} aria-pressed={targetId === card.id} className={targetId === card.id ? 'selected' : ''} onClick={() => setTargetId(card.id)} key={card.id}><strong>{card.name}</strong><span>{card.background}</span></button>)}</div>
        <label className="modal-speech">你的攻击辩词<textarea aria-label="你的攻击辩词" maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} /></label>
        <button className="primary" disabled={pending || !targetId || !text.trim()} onClick={() => void submit('attack')}>{pending ? '正在提交…' : '提交攻击辩词'}</button>
      </> : <p className="modal-wait">对方正在挑选你轨道上的目标。守方只能等待，直到指控公开。</p>}
    </section>
  );

  if (room.phase === 'defense-input') return (
    <section className="debate-modal" role="dialog" aria-modal="true" aria-labelledby="debate-title">
      <span className="modal-kicker">第 {room.round} 回合 · 守方答辩</span>
      <h2 id="debate-title">{isDefender ? '推翻对方的判断' : '等待守方提交'}</h2>
      <blockquote>{room.currentAttack?.text || '攻方没有留下有效辩词。'}</blockquote>
      {isDefender ? <>
        <label className="modal-speech">你的防守辩词<textarea aria-label="你的防守辩词" maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} /></label>
        <button className="primary" disabled={pending || !text.trim()} onClick={() => void submit('defend')}>{pending ? '正在提交…' : '提交防守辩词'}</button>
      </> : <p className="modal-wait">指控已经送达。对方正在决定该如何为这个人辩护。</p>}
    </section>
  );

  if (room.phase === 'round-adjudicating') return <section className="debate-modal adjudicating" role="dialog" aria-modal="true"><span className="modal-kicker">AI 列车长</span><h2>正在裁决这一轮</h2><p>人物背景、词条与双方辩词正在被送上秤盘。</p></section>;

  const record = room.roundRecords.at(-1);
  return <section className="debate-modal round-result" role="dialog" aria-modal="true" aria-labelledby="round-result-title"><span className="modal-kicker">第 {room.round} 回合裁决</span><h2 id="round-result-title">{record?.verdict.winner === 'attack' ? '攻方胜出' : '守方胜出'}</h2><p>{record?.verdict.reason}</p><blockquote>{record?.verdict.winningArgument}</blockquote>{isAttacker && <button className="primary" onClick={() => void send('advance-round', command(room))}>{room.round === 3 ? '交给列车长最终裁决' : '进入下一回合'}</button>}{!isAttacker && <p className="modal-wait">等待攻方确认下一回合</p>}</section>;
}
