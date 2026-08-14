import type { RoomView } from '@ydi/contracts';

const command = (room: RoomView) => ({ commandId: crypto.randomUUID(), expectedVersion: room.version });

export function JudgmentOverlay({ room, send, leave }: { room: RoomView; send(action: string, body?: object): Promise<void>; leave?: (() => void) | undefined }) {
  if (room.phase === 'track-adjudicating') return <section className="judgment-overlay pending" role="dialog" aria-modal="true"><span>终局裁决</span><h2>列车长正在选择要压死的轨道</h2><p>六段辩词、所有人物、背景、词条和胜出论据已经送达。</p></section>;
  if (room.phase === 'judgment-generating') return <section className="judgment-overlay pending" role="dialog" aria-modal="true"><span>轨道已经选定</span><h2>{room.trackVerdict?.crushedSeat === room.me.seat ? '你的轨道将被压过' : '对方的轨道将被压过'}</h2><p>{room.trackVerdict?.reason}</p><strong>黑暗审判正在生成……</strong></section>;
  if (room.phase === 'match-end') return <section className="judgment-overlay match-end" role="dialog" aria-modal="true"><span>整场结束</span><h2>{room.finalResult?.survivor === room.me.seat ? '你活了下来' : '对方赢得了这场审判'}</h2><p>最终比分 {room.scores.a}:{room.scores.b}</p><p>{room.finalResult?.reason}</p><button className="primary" onClick={leave}>返回首页</button></section>;
  const judgment = room.judgment;
  return <section className="judgment-overlay" role="dialog" aria-modal="true" aria-labelledby="judgment-title"><span>列车离站后的审判</span><h2 id="judgment-title">{judgment?.title}</h2><p className="judgment-summary">{judgment?.summary}</p><div className="judgment-columns"><article><h3>甲方</h3><p>{judgment?.playerA}</p></article><article><h3>乙方</h3><p>{judgment?.playerB}</p></article></div><blockquote><strong>列车长也不无辜</strong>{judgment?.conductorCritique}</blockquote><ol>{judgment?.questions.map((question) => <li key={question}>{question}</li>)}</ol>{(['a', 'b'] as const).includes(room.me.seat) && <button className="primary" disabled={room.nextGameReady[room.me.seat]} onClick={() => void send('ready-next-game', command(room))}>{room.nextGameReady[room.me.seat] ? '等待对方准备' : '准备下一局'}</button>}</section>;
}
