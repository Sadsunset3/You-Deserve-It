import { useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterCard as CharacterCardData, PublicCharacter, RoomView } from '@ydi/contracts';
import { CharacterCard } from './CharacterCard';
import { RailLane } from './RailLane';
import { placeCharacter, removeCharacter, selectedCharacterIds, type SelectionSlots } from './selection-state';
import { usePointerDrag, type DropTarget } from './use-pointer-drag';
import { useHandReflow } from './use-hand-reflow';

type CharacterData = CharacterCardData | PublicCharacter;

function asSlots(ids: string[]): SelectionSlots {
  return [ids[0] ?? null, ids[1] ?? null];
}

export function SelectionTray({ room, send }: { room: RoomView; send(action: string, body?: object): Promise<void> }) {
  const handRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<SelectionSlots>([null, null]);
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dealing, setDealing] = useState(true);
  const confirmed = room.selections.mine.length > 0;
  const displayedSlots = confirmed ? asSlots(room.selections.mine) : slots;
  const selectedIds = selectedCharacterIds(displayedSlots);

  const allCharacters = useMemo<CharacterData[]>(() => {
    const byId = new Map<string, CharacterData>();
    for (const card of room.hand?.characters ?? []) byId.set(card.id, card);
    for (const card of room.characters) byId.set(card.id, card);
    return [...byId.values()];
  }, [room.hand, room.characters]);
  const byId = useMemo(() => new Map(allCharacters.map((card) => [card.id, card])), [allCharacters]);
  const lockedIds = useMemo(() => new Set([
    ...room.selections.mine,
    ...room.characters.map((card) => card.id),
  ]), [room.selections.mine, room.characters]);
  const availableHand = (room.hand?.characters ?? []).filter((card) => !lockedIds.has(card.id));

  const handleDrop = (sourceId: string, target: DropTarget | null) => {
    if (pending || confirmed || !byId.has(sourceId)) return;
    if (target?.type === 'selection-slot') {
      setSlots((current) => placeCharacter(current, sourceId, target.index));
      setActiveCharacterId(null);
    } else if (target?.type === 'hand') {
      setSlots((current) => removeCharacter(current, sourceId));
      setActiveCharacterId(null);
    }
  };
  const { bindDragSource, dragState } = usePointerDrag({ onDrop: handleDrop, cancelKeys: [room.phase] });
  const draggedHandId = dragState && availableHand.some((card) => card.id === dragState.sourceId)
    ? dragState.sourceId
    : null;
  const visibleHand = draggedHandId
    ? availableHand.filter((card) => card.id !== draggedHandId)
    : availableHand;
  useHandReflow(handRef, visibleHand.map((card) => card.id));

  useEffect(() => {
    if (!confirmed) return;
    setSlots([null, null]);
    setActiveCharacterId(null);
  }, [confirmed]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDealing(false), 1_250);
    return () => window.clearTimeout(timer);
  }, []);

  const chooseSlot = (index: 0 | 1) => {
    if (pending || confirmed) return;
    const characterId = displayedSlots[index];
    if (activeCharacterId) {
      setSlots((current) => placeCharacter(current, activeCharacterId, index));
      setActiveCharacterId(null);
    } else if (characterId) {
      setActiveCharacterId(characterId);
    }
  };

  const removeActive = () => {
    if (!activeCharacterId || pending || confirmed) return;
    setSlots((current) => removeCharacter(current, activeCharacterId));
    setActiveCharacterId(null);
  };

  const lockSelection = async () => {
    const characterIds = selectedCharacterIds(slots);
    if (pending || confirmed || characterIds.length !== 2) return;
    setPending(true);
    try {
      await send('select', {
        commandId: crypto.randomUUID(),
        expectedVersion: room.version,
        characterIds,
      });
      setSlots([null, null]);
      setActiveCharacterId(null);
    } finally {
      setPending(false);
    }
  };

  const opponentCharacters = room.selections.opponent
    .concat(room.automaticCharacters.opponent ? [room.automaticCharacters.opponent] : [])
    .map((id) => room.characters.find((card) => card.id === id))
    .filter((card): card is PublicCharacter => Boolean(card));
  const concealOpponent = room.selections.opponent.length === 0
    || opponentCharacters.length !== room.selections.opponent.length;
  const ownNickname = room.me.nickname;
  const opponentNickname = room.opponent?.nickname ?? '等待对手';

  const mineLane = (
    <RailLane
      seat={room.me.seat}
      nickname={ownNickname}
      isMine
      characters={allCharacters}
      automaticCharacterId={room.automaticCharacters.mine}
      concealedSlots={false}
      selectionSlots={displayedSlots}
      onSlotClick={chooseSlot}
      slotDragBindings={bindDragSource}
      activeCharacterId={activeCharacterId}
      disabled={pending || confirmed}
    />
  );
  const opponentSeat = room.me.seat === 'a' ? 'b' : 'a';
  const opponentLane = (
    <RailLane
      seat={opponentSeat}
      nickname={opponentNickname}
      isMine={false}
      characters={opponentCharacters}
      automaticCharacterId={room.automaticCharacters.opponent}
      concealedSlots={concealOpponent}
      selectionSlots={asSlots(room.selections.opponent)}
    />
  );

  const draggedCard = dragState ? byId.get(dragState.sourceId) : undefined;

  return (
    <section className="selection-tray" aria-label="人物选择托盘">
      <div className="rail-board">
        {room.me.seat === 'a' ? <>{mineLane}{opponentLane}</> : <>{opponentLane}{mineLane}</>}
      </div>
      <div className={`deal-status ${dealing ? 'visible' : ''}`} role="status" aria-live="polite">{dealing ? '正在发放人物档案' : ''}</div>
      <div ref={handRef} className={`hand spread-hand ${dealing ? 'dealing' : ''}`} data-drop-type="hand" data-testid="selection-hand-target">
        {visibleHand.map((card, index) => (
          <CharacterCard
            key={card.id}
            card={card}
            cardId={card.id}
            selected={activeCharacterId === card.id || selectedIds.includes(card.id)}
            dragBindings={bindDragSource(card.id)}
            onClick={() => setActiveCharacterId(card.id)}
            testId="hand-character"
            disabled={pending || confirmed}
            dealIndex={index}
          />
        ))}
      </div>
      <div className="selection-actions">
        <button type="button" onClick={removeActive} disabled={!activeCharacterId || pending || confirmed}>移回手牌</button>
        <button type="button" className="primary" onClick={() => { void lockSelection().catch(() => undefined); }} disabled={pending || confirmed || selectedIds.length !== 2}>锁定人物</button>
      </div>
      {dragState && draggedCard && (
        <div
          className="selection-drag-layer"
          data-testid="selection-drag-layer"
          aria-hidden="true"
          style={{ position: 'fixed', pointerEvents: 'none', left: dragState.x, top: dragState.y }}
        >
          <CharacterCard card={draggedCard} />
        </div>
      )}
    </section>
  );
}
