import type { ButtonHTMLAttributes } from 'react';
import type { CharacterCard as CharacterCardData, PublicCharacter } from '@ydi/contracts';
import { CharacterCard } from './CharacterCard';
import type { SelectionSlots } from './selection-state';

type CharacterData = CharacterCardData | PublicCharacter;
type DragBindings = Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerDown'>;

export function RailLane({
  seat,
  nickname,
  isMine,
  characters,
  automaticCharacterId,
  concealedSlots,
  selectionSlots,
  onSlotClick,
  slotDragBindings,
  activeCharacterId,
  disabled = false,
}: {
  seat: 'a' | 'b';
  nickname: string;
  isMine: boolean;
  characters: CharacterData[];
  automaticCharacterId?: string | null;
  concealedSlots: boolean;
  selectionSlots?: SelectionSlots;
  onSlotClick?: (index: 0 | 1) => void;
  slotDragBindings?: (characterId: string) => DragBindings;
  activeCharacterId?: string | null;
  disabled?: boolean;
}) {
  const byId = new Map(characters.map((card) => [card.id, card]));
  const automaticCharacter = automaticCharacterId ? byId.get(automaticCharacterId) : undefined;
  const slots: SelectionSlots = selectionSlots ?? [characters[0]?.id ?? null, characters[1]?.id ?? null];

  return (
    <section className={`rail-lane rail-${seat}`} role="group" aria-label={`轨道 ${seat.toUpperCase()}`}>
      <header><span>{seat === 'a' ? '甲方' : '乙方'}</span><strong>{nickname}</strong>{isMine && <small>你的轨道</small>}</header>
      <div className="rail-slots">
        <div className="rail-slot automatic-slot" data-testid={`automatic-character-${isMine ? 'mine' : 'opponent'}`}>
          <span className="automatic-label">系统抽取</span>
          {automaticCharacter ? <CharacterCard card={automaticCharacter} /> : <span>等待抽取好人</span>}
        </div>
        {([0, 1] as const).map((index) => {
          const characterId = slots[index];
          const card = characterId ? byId.get(characterId) : undefined;
          if (!isMine) {
            return (
              <div className="rail-slot" key={index}>
                {concealedSlots || !card
                  ? <article className="character concealed"><strong>对方人物尚未公开</strong></article>
                  : <CharacterCard card={card} />}
              </div>
            );
          }

          return (
            <button
              type="button"
              className="rail-slot"
              data-testid={`mine-slot-${index}`}
              data-drop-type="selection-slot"
              data-slot-index={index}
              aria-pressed={Boolean(characterId && activeCharacterId === characterId)}
              disabled={disabled}
              onClick={() => onSlotClick?.(index)}
              {...(characterId && slotDragBindings ? slotDragBindings(characterId) : {})}
              key={index}
            >
              {card ? <CharacterCard card={card} /> : <span>空槽位</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
