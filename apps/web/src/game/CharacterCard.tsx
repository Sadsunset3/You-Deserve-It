import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import type { CharacterCard as CharacterCardData, PublicCharacter } from '@ydi/contracts';

type CharacterData = CharacterCardData | PublicCharacter;

type CharacterCardProps = {
  card: CharacterData;
  selected?: boolean;
  concealed?: boolean;
  dragBindings?: Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerDown'>;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  testId?: string;
  disabled?: boolean;
  dealIndex?: number;
  summaryCounts?: boolean;
  ariaLabel?: string;
  cardId?: string;
};

function CardContent({ card, summaryCounts }: { card: CharacterData; summaryCounts: boolean }) {
  return (
    <>
      <div className={`portrait ${card.alignment}`}>
        <span data-testid="character-avatar">{card.name}</span>
      </div>
      <span className="alignment">{card.alignment === 'good' ? '好人档案' : '恶人档案'}</span>
      <p>{card.background}</p>
      {'traits' in card && (summaryCounts ? <div className="character-counts"><span>词条 ×{card.traits.length}</span><span>辩词 ×{card.arguments.length}</span></div> : card.traits.map((item) => <small key={item.id}>{item.text}</small>))}
    </>
  );
}

export function CharacterCard({
  card,
  selected = false,
  concealed = false,
  dragBindings,
  onClick,
  testId,
  disabled = false,
  dealIndex,
  summaryCounts = false,
  ariaLabel,
  cardId,
}: CharacterCardProps) {
  if (concealed) {
    return <article className="character concealed"><strong>对方人物尚未公开</strong></article>;
  }

  const className = `character ${selected ? 'selected' : ''} ${dealIndex === undefined ? '' : 'deal-card'}`;
  const dealStyle = dealIndex === undefined ? undefined : { '--deal-index': dealIndex } as CSSProperties;
  if (onClick || dragBindings) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={selected}
        aria-label={ariaLabel}
        data-character-card-id={cardId}
        data-testid={testId}
        style={dealStyle}
        disabled={disabled}
        onClick={onClick}
        {...dragBindings}
      >
        <CardContent card={card} summaryCounts={summaryCounts} />
      </button>
    );
  }

  return <article className={className} data-testid={testId} data-character-card-id={cardId} style={dealStyle}><CardContent card={card} summaryCounts={summaryCounts} /></article>;
}
