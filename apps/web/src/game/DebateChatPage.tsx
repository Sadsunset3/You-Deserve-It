import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicCharacter, RoomView } from '@ydi/contracts';
import { RoomPresence } from './RoomPresence';

type Props = { room: RoomView; send(action: string, body?: object): Promise<void> };

function ConductorAvatar({ name }: { name: string }) {
  return <span className="conductor-avatar" aria-label={`${name}头像`} role="img">车</span>;
}

function CharacterDossier({ character }: { character: PublicCharacter }) {
  return <article className="debate-dossier">
    <span className="dossier-status">本轮目标</span>
    <h2>{character.name}</h2>
    <p>{character.background}</p>
    <section><h3>人物词条</h3>{character.traits.length > 0 ? <ul>{character.traits.map((trait) => <li key={trait.id}>{trait.text}<small>{trait.tag}</small></li>)}</ul> : <p className="empty-copy">没有附加词条</p>}</section>
    <section><h3>累计胜出辩词</h3>{character.arguments.length > 0 ? <ol>{character.arguments.map((argument, index) => <li key={`${argument.kind}-${index}`}>{argument.text}</li>)}</ol> : <p className="empty-copy">还没有胜出辩词</p>}</section>
  </article>;
}

function remainingSeconds(deadline: string | null) {
  return deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)) : null;
}

export function DebateChatPage({ room, send }: Props) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [targetPending, setTargetPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [remaining, setRemaining] = useState(() => remainingSeconds(room.deadline));
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const isAttacker = room.me.seat === room.roundAttacker;
  const opponentIds = useMemo(() => [room.automaticCharacters.opponent, ...room.selections.opponent].filter((id): id is string => Boolean(id)), [room.automaticCharacters.opponent, room.selections.opponent]);
  const candidates = opponentIds.map((id) => room.characters.find((character) => character.id === id)).filter((character): character is PublicCharacter => Boolean(character));
  const target = room.currentTargetId ? room.characters.find((character) => character.id === room.currentTargetId) ?? null : null;
  const winnerSeat = room.roundVerdict?.winnerSeat ?? null;
  const winnerIsAttacker = winnerSeat !== null && winnerSeat === room.roundAttacker;
  const winnerName = winnerSeat ? (winnerSeat === room.me.seat ? room.me.nickname : room.opponent?.nickname ?? (winnerSeat === 'a' ? '甲方' : '乙方')) : '';
  const messages = useMemo(() => [...room.debateMessages].sort((a, b) => a.sequence - b.sequence), [room.debateMessages]);
  const phaseDisabled = room.phase !== 'debate-chat' || !room.me.connected || room.opponent?.connected === false;
  const composerDisabled = phaseDisabled || pending;

  useEffect(() => {
    setRemaining(remainingSeconds(room.deadline));
    const timer = window.setInterval(() => setRemaining(remainingSeconds(room.deadline)), 1000);
    return () => window.clearInterval(timer);
  }, [room.deadline]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    const nearBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 120;
    if (nearBottom) {
      const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      if (typeof transcript.scrollTo === 'function') transcript.scrollTo({ top: transcript.scrollHeight, behavior });
      else transcript.scrollTop = transcript.scrollHeight;
    }
  }, [messages.length, room.roundVerdict]);

  const lockTarget = async (characterId: string) => {
    if (targetPending) return;
    setTargetPending(characterId);
    try { await send('debate-target', { commandId: crypto.randomUUID(), expectedVersion: room.version, targetId: characterId }); }
    finally { setTargetPending(null); }
  };

  const sendMessage = async () => {
    const normalized = text.trim();
    if (composerDisabled || !normalized) return;
    setPending(true);
    try {
      await send('debate-messages', { messageId: crypto.randomUUID(), text: normalized });
      setText((current) => (current === normalized ? '' : current));
    } finally { setPending(false); }
  };

  const confirmRoundResult = async () => {
    if (room.phase !== 'round-result' || room.roundResultReady.mine || confirming) return;
    setConfirming(true);
    try { await send('round-result-done', { commandId: crypto.randomUUID(), expectedVersion: room.version }); }
    finally { setConfirming(false); }
  };

  const phaseText = room.phase === 'round-adjudicating' ? '列车长正在整理整轮交锋并裁决' : room.phase === 'round-result' ? (room.round === 3 ? '本轮已裁决，双方确认后进入最终压轨' : '本轮已裁决，双方确认后进入下一轮攻防') : '双方可自由发言，发言代表你自己和所在轨道';

  return <section className={`debate-chat-page phase-${room.phase}`} aria-label="攻防聊天室">
    <header className="debate-chat-header">
      <div><span>审判室 {room.roomCode}</span><strong className={`role-badge role-${isAttacker ? 'attacker' : 'defender'}`}>{isAttacker ? '你是进攻方' : '你是防守方'}</strong><span>第 {room.round}/3 轮攻防</span></div>
      <div className={`chat-countdown ${remaining !== null && remaining <= 10 ? 'is-urgent' : ''}`} aria-live="polite">{remaining === null ? '等待锁定目标' : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`}</div>
      <RoomPresence room={room}/>
    </header>

    {room.phase === 'target-selecting' ? <main className="target-selection-room">
      <section className="target-selection-copy"><span>第 {room.round} 轮攻防</span><h1>{isAttacker ? '锁定一个攻防目标' : '等待攻方锁定目标'}</h1><p>{isAttacker ? '目标锁定后才开始倒计时，选择不可撤销。' : '目标锁定后，你们会同时进入聊天室。'}</p></section>
      {isAttacker && <div className="target-dossiers">{candidates.map((character) => <button type="button" className="target-dossier-button" disabled={Boolean(targetPending)} aria-label={`将${character.name}设为攻防目标`} onClick={() => void lockTarget(character.id)} key={character.id}><span>{character.alignment === 'good' ? '好人' : '恶人'}</span><strong>{character.name}</strong><p>{character.background}</p><section className="target-card-traits"><h4>人物词条</h4>{character.traits.length > 0 ? <ul>{character.traits.map((trait) => <li key={trait.id}>{trait.text}<small>{trait.tag}</small></li>)}</ul> : <p className="empty-copy">没有附加词条</p>}</section><section className="target-card-arguments"><h4>累计胜出辩词</h4>{character.arguments.length > 0 ? <ol>{character.arguments.map((argument, index) => <li key={`${argument.kind}-${index}`}>{argument.text}</li>)}</ol> : <p className="empty-copy">还没有胜出辩词</p>}</section><small>{targetPending === character.id ? '正在锁定' : '设为攻防目标'}</small></button>)}</div>}
      <aside className="target-conductor"><ConductorAvatar name={room.conductor!.name}/><h2>{room.conductor!.name}</h2><p>{room.conductor!.persona}</p><strong>{room.conductor!.rule}</strong></aside>
    </main> : <main className="debate-chat-layout">
      {target ? <CharacterDossier character={target}/> : <aside className="debate-dossier"><h2>目标档案读取中</h2></aside>}
      <section className="debate-transcript-panel">
        <header><div><span>庭审逐字记录</span><strong>{phaseText}</strong></div><b>{messages.length} 条消息</b></header>
        <div className="debate-transcript" ref={transcriptRef} role="log" aria-live="polite">
          {messages.length === 0 && <p className="transcript-empty">聊天室已经开放，先说清楚你为什么该活。</p>}
          {messages.map((message) => {
            const mine = message.sender === room.me.seat;
            const nickname = mine ? room.me.nickname : room.opponent?.nickname ?? (message.sender === 'a' ? '甲方' : '乙方');
            const roleLabel = room.roundAttacker ? (message.sender === room.roundAttacker ? '进攻方' : '防守方') : (message.sender === 'a' ? '甲' : '乙');
            return <article className={`transcript-entry seat-${message.sender}`} data-testid="debate-message" key={`${message.sender}-${message.messageId}`}><div><span>{roleLabel}</span><strong>{nickname}</strong><time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div><p>{message.text}</p></article>;
          })}
          {room.roundVerdict && <article className="conductor-verdict-entry" data-testid="conductor-verdict">
            <div className="verdict-message"><ConductorAvatar name={room.conductor!.name}/><div><strong>{room.conductor!.name}的裁决</strong><p>{room.roundVerdict.conductorMessage}</p></div></div>
            <div className="verdict-outcome"><span className="verdict-winner">本轮胜方：{winnerName}（{winnerIsAttacker ? '进攻方' : '防守方'}）</span><p className="verdict-winning-argument"><small>总结辩词已记入目标人物档案</small>「{room.roundVerdict.winningSummary}」</p></div>
            {room.phase === 'round-result' && <div className="round-result-confirm" data-testid="round-result-confirm"><div className="confirm-status"><span className={room.roundResultReady.mine ? 'confirmed' : ''}>{room.roundResultReady.mine ? '你已确认 ✓' : '你未确认'}</span><span className={room.roundResultReady.opponent ? 'confirmed' : ''}>{room.roundResultReady.opponent ? '对方已确认 ✓' : '等待对方确认…'}</span></div><button type="button" className="primary" disabled={room.roundResultReady.mine || confirming} onClick={() => void confirmRoundResult()}>{room.roundResultReady.mine ? '已确认，等待对方' : confirming ? '正在确认…' : room.round === 3 ? '确认，进入最终压轨' : '确认，进入下一轮攻防'}</button></div>}
          </article>}
          {room.phase === 'round-adjudicating' && <p className="adjudicating-note" role="status">列车长正在整理双方观点和胜方辩词摘要</p>}
        </div>
        <div className="debate-composer">
          <p className="debate-guidance" role="note">目标人物的全部真实信息都在档案里：背景、词条、胜出辩词。请依据档案辩论，不要为人物虚构背景、外貌或经历，虚构的故事不会影响列车长的裁决。</p>
          <label htmlFor="debate-message-input">发送辩论消息</label>
          <textarea id="debate-message-input" aria-label="发送辩论消息" maxLength={2000} disabled={phaseDisabled} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }}/>
          <div><small>Enter 发送，Shift + Enter 换行</small><button className="primary" disabled={composerDisabled || !text.trim()} onClick={() => void sendMessage()}>{pending ? '正在发送' : '发送消息'}</button></div>
        </div>
      </section>
      <aside className="conductor-dossier"><ConductorAvatar name={room.conductor!.name}/><span>本轮列车长</span><h2>{room.conductor!.name}</h2><p>{room.conductor!.persona}</p><strong>{room.conductor!.rule}</strong></aside>
    </main>}
  </section>;
}
