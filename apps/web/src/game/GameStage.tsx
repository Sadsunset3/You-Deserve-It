import { useRef, useState } from 'react';
import type { PublicCharacter, RoomView, Seat } from '@ydi/contracts';
import { CharacterCard } from './CharacterCard';
import { CharacterDetailDrawer } from './CharacterDetailDrawer';
import { DebateChatPage } from './DebateChatPage';
import { JudgmentOverlay } from './JudgmentOverlay';
import { RoomPresence } from './RoomPresence';
import { SelectionTray } from './SelectionTray';
import { TrainStage } from './TrainStage';

const phaseTitles: Record<RoomView['phase'], string> = { waiting: '等待另一位被告', selecting: '选择两名人物', traits: '追加人物词条', 'target-selecting': '攻方选择目标', 'debate-chat': '实时攻防辩论', 'round-adjudicating': '列车长裁决中', 'round-result': '回合裁决', 'track-adjudicating': '最终压轨', 'judgment-generating': '审判生成中', judgment: '黑暗审判', 'between-games': '等待下一局', 'match-end': '整场结束' };
const command = (room: RoomView) => ({ commandId: crypto.randomUUID(), expectedVersion: room.version });

function Rails({ room, onCharacterOpen }: { room: RoomView; onCharacterOpen(character: PublicCharacter, trigger: HTMLButtonElement): void }) {
  const byId = new Map(room.characters.map((card) => [card.id, card]));
  const opponentSeat: Seat = room.me.seat === 'a' ? 'b' : 'a';
  const lane = (seat: Seat, nickname: string, ids: string[], automatic: string | null, mine: boolean) => <section className={`rail-lane rail-${seat}`} data-testid={`rail-${seat}`} aria-label={`轨道 ${seat.toUpperCase()}`}><header><span>{seat === 'a' ? '甲方' : '乙方'}</span><strong>{nickname}</strong>{mine && <small>你的轨道</small>}</header><div className="rail-slots">{[automatic, ...ids].map((id, index) => {
    const character = id ? byId.get(id) : undefined;
    return id ? <div className={`rail-slot ${index === 0 ? 'automatic-slot' : ''}`} data-testid="rail-character" key={id}>{index === 0 && <span className="automatic-label">系统抽取好人</span>}{character ? <CharacterCard card={character} summaryCounts ariaLabel={`查看${character.name}人物档案`} onClick={(event) => onCharacterOpen(character, event.currentTarget)} /> : <span>人物档案读取中</span>}</div> : null;
  })}</div></section>;
  const mine = lane(room.me.seat, room.me.nickname, room.selections.mine, room.automaticCharacters.mine, true);
  const opponent = lane(opponentSeat, room.opponent?.nickname ?? '等待对手', room.selections.opponent, room.automaticCharacters.opponent, false);
  return <div className="rail-board game-rails">{room.me.seat === 'a' ? <>{mine}{opponent}</> : <>{opponent}{mine}</>}</div>;
}

function TraitControls({ room, send }: { room: RoomView; send(action: string, body?: object): Promise<void> }) {
  const [pending, setPending] = useState(false);
  return <section className="compact-traits"><p>将词条拖到任意人物卡上；也可以保留词条。</p><div className="traits">{room.hand?.traits.map((trait) => <span key={trait.id}>{trait.text}</span>)}</div><button className="primary" disabled={pending} onClick={() => { setPending(true); void send('traits-done', command(room)).catch(() => setPending(false)); }}>{pending ? '正在确认…' : '结束词条阶段'}</button></section>;
}

export function GameStage({ room, send, leave, error = '' }: { room: RoomView; send(action: string, body?: object): Promise<void>; leave?: (() => void) | undefined; error?: string | undefined }) {
  const [surrendering, setSurrendering] = useState(false);
  const [detailCharacter, setDetailCharacter] = useState<PublicCharacter | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openCharacter = (character: PublicCharacter, trigger: HTMLButtonElement) => { detailTriggerRef.current = trigger; setDetailCharacter(character); };
  const closeCharacter = () => { setDetailCharacter(null); window.requestAnimationFrame(() => detailTriggerRef.current?.focus()); };
  const surrender = async () => { if (surrendering || !window.confirm('确认投降并退出吗？对方将直接获胜。')) return; setSurrendering(true); try { await send('surrender', command(room)); leave?.(); } finally { setSurrendering(false); } };
  const debating = ['target-selecting', 'debate-chat', 'round-adjudicating', 'round-result'].includes(room.phase);
  if (debating) return <DebateChatPage room={room} send={send} />;
  const judging = ['track-adjudicating', 'judgment-generating', 'judgment', 'between-games', 'match-end'].includes(room.phase);
  return <main className={`game-shell phase-${room.phase}`}><TrainStage room={room}><header className="game-hud"><div><span>审判室</span><strong>{room.roomCode}</strong></div><h1>{phaseTitles[room.phase]}</h1><div className="hud-score"><span>第 {room.game}/{room.config.games} 局</span><span>第 {room.round}/3 次攻防</span><strong>比分 {room.scores.a}:{room.scores.b}</strong></div>{room.opponentRemaining && <div className="opponent-resources" aria-label="对手剩余手牌"><span>好人 {room.opponentRemaining.good}</span><span>恶人 {room.opponentRemaining.evil}</span><span>词条 {room.opponentRemaining.traits}</span></div>}<RoomPresence room={room} /><button className="surrender-button" disabled={surrendering} onClick={() => void surrender()}>{surrendering ? '正在投降…' : '投降并退出'}</button></header>{error && <p role="alert" className="error banner">{error}</p>}{room.phase === 'selecting' ? <SelectionTray room={room} send={send} /> : <><Rails room={room} onCharacterOpen={openCharacter} />{room.phase === 'traits' && <TraitControls room={room} send={send} />}</>}{judging && <JudgmentOverlay room={room} send={send} leave={leave} />}</TrainStage><CharacterDetailDrawer character={detailCharacter} onClose={closeCharacter} /></main>;
}
