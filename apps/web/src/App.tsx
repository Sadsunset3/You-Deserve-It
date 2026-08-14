import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { GameConfig, PublicCharacter, RoomView } from '@ydi/contracts';
import { api } from './api';
import { TrainStage } from './game/TrainStage';
import { CharacterCard } from './game/CharacterCard';
import { usePointerDrag, type DropTarget } from './game/use-pointer-drag';
import { GameStage } from './game/GameStage';
import { CharacterDetailDrawer } from './game/CharacterDetailDrawer';
import './styles.css';

const defaultConfig: GameConfig = { games: 1, selectionSeconds: 60, traitSeconds: 60, speechSeconds: 90, disconnectSeconds: 120 };
const phaseTitle: Record<string, string> = { waiting: '等待另一位被告', selecting: '选择两名人物', traits: '追加人物词条', 'attack-a': '甲方发起攻击', 'defense-b': '乙方提交防守', 'attack-b': '乙方发起攻击', 'defense-a': '甲方提交防守', 'match-end': '审判结束' };

export function App() {
  const [nickname, setNickname] = useState(''); const [code, setCode] = useState(''); const [mode, setMode] = useState<'create' | 'join'>('create'); const [config, setConfig] = useState(defaultConfig); const [room, setRoom] = useState<RoomView | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState(''); const [testedApiKey, setTestedApiKey] = useState<string | null>(null); const [testingApiKey, setTestingApiKey] = useState(false);
  useEffect(() => { const saved = sessionStorage.getItem('ydi_room'); if (saved) api.room(saved).then(setRoom).catch(() => sessionStorage.removeItem('ydi_room')); }, []);
  useEffect(() => { if (!room) return; let socket: ReturnType<typeof io>; api.session().then(({ playerId }) => { socket = io({ withCredentials: true }); socket.emit('room:subscribe', { roomCode: room.roomCode, playerId }); socket.on('room:state', setRoom); }); const poll = window.setInterval(() => api.room(room.roomCode).then(setRoom).catch(() => {}), 4000); return () => { socket?.disconnect(); clearInterval(poll); }; }, [room?.roomCode]);
  const normalizedApiKey = apiKey.trim();
  const apiKeyReady = normalizedApiKey.length > 0 && testedApiKey === normalizedApiKey;
  const changeApiKey = (value: string) => { setApiKey(value); setTestedApiKey(null); setError(''); };
  const testDeepSeekKey = async () => { if (!normalizedApiKey || testingApiKey) return; setTestingApiKey(true); setTestedApiKey(null); setError(''); try { await api.testDeepSeekKey(normalizedApiKey); setTestedApiKey(normalizedApiKey); } catch (cause) { setError(cause instanceof Error ? cause.message : 'DeepSeek Key 连接失败'); } finally { setTestingApiKey(false); } };
  const enter = async () => { if (mode === 'create' && !apiKeyReady) return; setBusy(true); setError(''); try { const result = mode === 'create' ? await api.create(nickname, config, normalizedApiKey) : await api.join(nickname, code.trim().toUpperCase()); sessionStorage.setItem('ydi_room', result.roomCode); setRoom(await api.room(result.roomCode)); } catch (cause) { setError(cause instanceof Error ? cause.message : '无法进入房间'); } finally { setBusy(false); } };
  if (room) return <RoomScreen room={room} send={async (action, body) => { setError(''); try { await api.action(room.roomCode, action, body); setRoom(await api.room(room.roomCode)); } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); throw cause; } }} leave={() => { sessionStorage.removeItem('ydi_room'); setRoom(null); }} error={error} />;
  return <HomeScreen nickname={nickname} setNickname={setNickname} code={code} setCode={setCode} mode={mode} setMode={setMode} config={config} setConfig={setConfig} apiKey={apiKey} setApiKey={changeApiKey} apiKeyReady={apiKeyReady} testingApiKey={testingApiKey} testDeepSeekKey={testDeepSeekKey} error={error} busy={busy} enter={enter}/>;
}

function HomeScreen({ nickname, setNickname, code, setCode, mode, setMode, config, setConfig, apiKey, setApiKey, apiKeyReady, testingApiKey, testDeepSeekKey, error, busy, enter }: {
  nickname: string; setNickname(value: string): void; code: string; setCode(value: string): void;
  mode: 'create' | 'join'; setMode(value: 'create' | 'join'): void; config: GameConfig; setConfig(value: GameConfig): void;
  apiKey: string; setApiKey(value: string): void; apiKeyReady: boolean; testingApiKey: boolean; testDeepSeekKey(): Promise<void>;
  error: string; busy: boolean; enter(): Promise<void>;
}) {
  const storySteps = [
    { title: '醒来', text: '你和朋友分别被绑在两条铁轨上。没有观众，也没有法官，只有一列正在逼近的火车。' },
    { title: '加码', text: '每回合，你们各自挑选人物放上自己的轨道。好人、恶人，以及无法被一个标签说清的人。' },
    { title: '篡改事实', text: '把词条贴到任何人物身上。一段经历就能改变一个人的分量，也能改变你接下来要说的话。' },
    { title: '开口辩护', text: '攻击对方，保护自己。每段辩词只能提交一次，而列车长会记住你为胜利采用的每一条标准。' },
    { title: '拉下拉杆', text: '三个回合后，AI 列车长综合人物、词条与辩词作出选择。一条轨道获救，另一条迎接列车。' },
    { title: '接受审判', text: '比赛结束后，系统重新审视你的整场辩护，指出压力之下真正左右你判断的价值观。' },
  ];

  return <main className="home">
    <header className="home-masthead">
      <a className="case-mark" href="#story" aria-label="活该首页"><strong>活该</strong><span>AI 道德辩论游戏</span></a>
      <div className="case-number"><span>事故卷宗</span><strong>YD-001</strong></div>
      <a className="enter-link" href="#entry">进入审判</a>
    </header>

    <section className="manifesto" id="story" aria-labelledby="story-title">
      <div className="story-copy">
        <div className="stamp">AI 列车长正在值班</div>
        <p className="case-status">现场记录 · 距离碰撞还有三个回合</p>
        <h1 id="story-title"><span>活</span><span>该</span></h1>
        <p className="story-opening">你醒来时，后脑贴着冰冷的铁轨。</p>
        <p className="lead">朋友在另一条轨道上。列车正在驶来，而拉杆掌握在一名价值观随机且偏执的 AI 列车长手中。</p>
      </div>
      <div className="story-scene" aria-hidden="true">
        <div className="approaching-train"><i>AI</i><b>审判<br/>列车</b><span>● ● ●</span></div>
        <div className="story-track track-one"><i/><i/><span/><span/><span/><span/><span/></div>
        <div className="story-track track-two"><i/><i/><span/><span/><span/><span/><span/></div>
        <div className="bound-player player-one">你</div>
        <div className="bound-player player-two">朋友</div>
        <p>拉杆只会救下一边</p>
      </div>
      <blockquote>你必须证明：为什么自己这一边的人，更值得活。</blockquote>
    </section>

    <section className="entry" id="entry" aria-label="进入游戏">
      <div className="entry-heading"><span>双人审判室</span><h2>坐上被告席</h2><p>邀请一位朋友。无需注册，房间码就是你们的车票。</p></div>
      <div className="mode-tabs"><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>创建审判室</button><button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>加入审判室</button></div>
      <label>你的称呼<input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} placeholder="例如：不愿透露姓名的甲方" /></label>
      {mode === 'join' ? <label>六位房间码<input className="code-input" value={code} onChange={(event) => setCode(event.target.value)} maxLength={6} placeholder="ABC234" /></label> : <><RuleForm value={config} onChange={setConfig}/><div className="api-key-check"><label>DeepSeek Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} maxLength={512} autoComplete="off" placeholder="sk-..." /></label><button type="button" disabled={testingApiKey || apiKey.trim().length === 0} onClick={() => void testDeepSeekKey()}>{testingApiKey ? '正在测试…' : '测试连接'}</button>{apiKeyReady && <p role="status">连接成功，可以创建房间</p>}<small>Key 仅保存在本房间的服务端内存中，整场结束后删除。</small></div></>} 
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary entry-submit" disabled={busy || nickname.trim().length < 2 || (mode === 'join' ? code.length !== 6 : !apiKeyReady)} onClick={() => void enter()}>{busy ? '正在打开审判室…' : mode === 'create' ? '创建审判室' : '加入这场审判'}</button>
      <p className="fineprint">辩词提交后不可修改，列车长不会替你保留体面。</p>
    </section>

    <article className="case-record" aria-labelledby="record-title">
      <header><span>事发经过</span><h2 id="record-title">在列车抵达之前，<br/>你有六件事要做。</h2><p>这不是一道选择题。你需要亲手构造事实，再为它辩护。</p></header>
      <ol>{storySteps.map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol>
    </article>

  </main>;
}

function RuleForm({ value, onChange }: { value: GameConfig; onChange(value: GameConfig): void }) { const field = (key: Exclude<keyof GameConfig, 'games'>, label: string, min: number, max: number) => <label>{label}<input type="number" min={min} max={max} value={value[key]} onChange={(e) => { const entered = Math.trunc(Number(e.target.value)); onChange({ ...value, [key]: Math.min(max, Math.max(min, Number.isFinite(entered) ? entered : min)) }); }}/></label>; return <div className="rules"><h2>本场规则</h2><label>比赛局数<select value={value.games} onChange={(event) => onChange({ ...value, games: Number(event.target.value) as GameConfig['games'] })}><option value={1}>1</option><option value={3}>3</option><option value={5}>5</option></select></label>{field('selectionSeconds', '选牌秒数', 20, 120)}{field('traitSeconds', '词条秒数', 20, 180)}{field('speechSeconds', '辩论秒数', 30, 180)}{field('disconnectSeconds', '掉线判负秒数', 60, 300)}</div>; }

export function RoomScreen({ room, send, leave, error = '' }: { room: RoomView; send(action: string, body?: object): Promise<void>; leave?(): void; error?: string }) {
  const [surrendering, setSurrendering] = useState(false); const remaining = useCountdown(room.deadline);
  const command = () => ({ commandId: crypto.randomUUID(), expectedVersion: room.version });
  const surrender = async () => { if (surrendering || !window.confirm('确认投降并退出吗？比赛会立即结束，对方直接获胜。')) return; setSurrendering(true); try { await send('surrender', command()); leave?.(); } finally { setSurrendering(false); } };
  if (room.phase !== 'waiting' && room.phase !== 'traits') return <GameStage room={room} send={send} leave={leave} error={error} />;
  const header = <><header className="case-header"><div><span>审判室</span><strong>{room.roomCode}</strong></div><h1>{phaseTitle[room.phase] ?? room.phase}</h1><div className="timer" aria-live="polite">{remaining === null ? '等待' : `${remaining}s`}</div></header><section className="status-strip"><span>第 {room.game}/{room.config.games} 局</span><span>第 {room.round}/3 次攻防</span><span>比分 {room.scores.a}:{room.scores.b}</span>{room.phase !== 'waiting' && room.opponentRemaining && <><span>对手好人 {room.opponentRemaining.good}</span><span>对手恶人 {room.opponentRemaining.evil}</span><span>对手词条 {room.opponentRemaining.traits}</span></>}<span>{room.opponent ? `${room.opponent.nickname} · ${room.opponent.connected ? '在线' : '掉线'}` : '等待对手'}</span>{room.phase !== 'waiting' && <button className="surrender-button" disabled={surrendering} onClick={() => void surrender().catch(() => undefined)}>{surrendering ? '正在投降…' : '投降并退出'}</button>}</section></>;
  if (room.phase === 'waiting') return <main className="game-shell waiting-shell">{header}{error && <p role="alert" className="error banner">{error}</p>}<Waiting room={room} send={send}/></main>;
  const controls = <TraitPlacement room={room} send={send} command={command}/>;
  return <main className="game-shell"><TrainStage room={room}>{header}{error && <p role="alert" className="error banner">{error}</p>}{controls}</TrainStage></main>;
}

function StageRails({ room, traitDropActive = false, onCharacterOpen }: { room: RoomView; traitDropActive?: boolean; onCharacterOpen(character: PublicCharacter, trigger: HTMLButtonElement): void }) {
  const byId = new Map(room.characters.map((card) => [card.id, card]));
  const opponentSeat = room.me.seat === 'a' ? 'b' : 'a';
  const lane = (seat: 'a' | 'b', nickname: string, ids: string[], automaticId: string | null, mine: boolean) => <section className={`rail-lane rail-${seat}`} data-testid={`rail-${seat}`}><header><span>{seat === 'a' ? '甲方' : '乙方'}</span><strong>{nickname}</strong>{mine && <small>你的轨道</small>}</header><div className="rail-person"><b>{mine ? '你' : '对手'}</b><span>躺在轨道上</span></div><div className="rail-slots">{[automaticId, ...ids].filter((id): id is string => Boolean(id)).map((id) => byId.get(id)).filter((card): card is PublicCharacter => Boolean(card)).map((card, index) => <div className={`rail-slot ${index === 0 ? 'automatic-slot' : ''} ${traitDropActive ? 'trait-drop-target' : ''}`} data-drop-type="character" data-character-id={card.id} key={card.id}>{index === 0 && <span className="automatic-label">系统抽取</span>}<CharacterCard card={card} summaryCounts ariaLabel={`查看${card.name}人物档案`} onClick={(event) => onCharacterOpen(card, event.currentTarget)}/>{traitDropActive && <span className="trait-drop-hint">贴到这里</span>}</div>)}</div></section>;
  const mineLane = lane(room.me.seat, room.me.nickname, room.selections.mine, room.automaticCharacters.mine, true);
  const opponentLane = lane(opponentSeat, room.opponent?.nickname ?? '等待对手', room.selections.opponent, room.automaticCharacters.opponent, false);
  return <div className="rail-board persistent-rails">{room.me.seat === 'a' ? <>{mineLane}{opponentLane}</> : <>{opponentLane}{mineLane}</>}</div>;
}

function TraitPlacement({ room, send, command }: { room: RoomView; send(action: string, body?: object): Promise<void>; command(): { commandId: string; expectedVersion: number } }) {
  const [pendingTraitId, setPendingTraitId] = useState<string | null>(null);
  const [finishingTraits, setFinishingTraits] = useState(false);
  const [detailCharacter, setDetailCharacter] = useState<PublicCharacter | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openCharacter = (character: PublicCharacter, trigger: HTMLButtonElement) => { detailTriggerRef.current = trigger; setDetailCharacter(character); };
  const closeCharacter = () => { setDetailCharacter(null); window.requestAnimationFrame(() => detailTriggerRef.current?.focus()); };
  const usedTraitIds = new Set(room.characters.flatMap((card) => card.traits.map((item) => item.id)));
  const availableTraits = (room.hand?.traits ?? []).filter((item) => !usedTraitIds.has(item.id));
  const byId = new Map(availableTraits.map((item) => [item.id, item]));
  const handleDrop = (traitId: string, dropTarget: DropTarget | null) => {
    if (pendingTraitId || dropTarget?.type !== 'character' || !byId.has(traitId)) return;
    setPendingTraitId(traitId);
    void send('trait', { ...command(), traitId, targetId: dropTarget.id })
      .catch(() => undefined)
      .finally(() => setPendingTraitId(null));
  };
  const { bindDragSource, dragState } = usePointerDrag({ onDrop: handleDrop, cancelKeys: [room.phase] });
  const draggedTrait = dragState ? byId.get(dragState.sourceId) : undefined;
  const readinessText = room.traitReadiness.mine
    ? '你已结束词条阶段，等待对方确认'
    : room.traitReadiness.opponent
      ? '对方已结束词条阶段，确认后立即进入攻防'
      : '';
  const finishLabel = room.traitReadiness.mine
    ? '等待对方结束词条阶段'
    : finishingTraits
      ? '正在确认…'
      : room.traitReadiness.opponent
        ? '确认并进入攻防'
        : '结束词条阶段';
  const finishTraits = async () => {
    if (finishingTraits || pendingTraitId || room.traitReadiness.mine) return;
    setFinishingTraits(true);
    try { await send('traits-done', command()); } finally { setFinishingTraits(false); }
  };

  return <>
    <StageRails room={room} traitDropActive={Boolean(dragState)} onCharacterOpen={openCharacter}/>
    <div className="stage-controls trait-placement">
      <section>
        <p className="instruction">拖动词条，贴到铁轨上的任意人物。可以不用，留到后面。</p>
        <div className="traits trait-hand">{availableTraits.map((item) => <button type="button" key={item.id} data-testid="trait-card" disabled={Boolean(pendingTraitId)} {...bindDragSource(item.id)}>{item.text}<small>{item.tag}</small><span className="drag-cue">拖到人物卡上</span></button>)}</div>
        {readinessText && <p className="trait-ready-status" role="status" aria-live="polite">{readinessText}</p>}
        <ActionBar summary={dragState ? '松手贴上词条' : pendingTraitId ? '正在贴上词条…' : readinessText || '拖动词条到人物'}><button className="primary" disabled={Boolean(pendingTraitId) || finishingTraits || room.traitReadiness.mine} onClick={() => void finishTraits().catch(() => undefined)}>{finishLabel}</button></ActionBar>
      </section>
    </div>
    {dragState && draggedTrait && <div className="trait-drag-layer" data-testid="trait-drag-layer" aria-hidden="true" style={{ position: 'fixed', pointerEvents: 'none', left: dragState.x, top: dragState.y }}><strong>{draggedTrait.text}</strong><small>{draggedTrait.tag}</small></div>}
    <CharacterDetailDrawer character={detailCharacter} onClose={closeCharacter}/>
  </>;
}

function Waiting({ room, send }: { room: RoomView; send(action: string, body?: object): Promise<void> }) {
  const opponentSeat = room.me.seat === 'a' ? 'b' : 'a';
  const seats = (['a', 'b'] as const).map((seat) => {
    const mine = seat === room.me.seat;
    const occupied = mine || seat === opponentSeat && Boolean(room.opponent);
    const nickname = mine ? room.me.nickname : room.opponent?.nickname ?? '空位';
    const ready = mine ? room.me.ready : room.opponent?.ready ?? false;
    return { seat, mine, occupied, nickname, ready };
  });

  return <section className="waiting" aria-label="审判室候场区">
    <div className="room-code">
      <span>把房间码交给另一个人</span>
      <strong>{room.roomCode}</strong>
      <button onClick={() => navigator.clipboard?.writeText(room.roomCode)}>复制房间码</button>
    </div>
    <div className="seats" aria-label="玩家席位">
      {seats.map((seat) => <article className={`waiting-seat ${seat.occupied ? 'occupied' : 'empty'}`} key={seat.seat}>
        <div className="seat-heading"><span>{seat.seat === 'a' ? '甲方' : '乙方'}</span>{seat.mine && <b>你</b>}</div>
        <strong className="seat-name">{seat.nickname}</strong>
        <span className="seat-status">{seat.occupied ? seat.ready ? '已准备' : '等待准备' : '等待加入'}</span>
      </article>)}
    </div>
    <div className="waiting-actions">
      <p>{room.opponent ? '双方到齐，确认后即可发车。' : '另一张被告席仍然空着。'}</p>
      <div><button onClick={() => send('ready')}>{room.me.ready ? '你已准备' : '确认准备'}</button>{room.me.seat === 'a' && <button className="primary" disabled={!room.me.ready || !room.opponent?.ready} onClick={() => send('start')}>开始第一局</button>}</div>
    </div>
  </section>;
}
function ActionBar({ summary, children }: { summary: string; children: React.ReactNode }) { return <div className="action-bar in-flow-action-bar" data-testid="trait-action-bar"><span>{summary}</span><div>{children}</div></div>; }
function useCountdown(deadline: string | null) { const calculate = () => deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)) : null; const [value, setValue] = useState(calculate); useEffect(() => { setValue(calculate()); const id = setInterval(() => setValue(calculate()), 1000); return () => clearInterval(id); }, [deadline]); return value; }
