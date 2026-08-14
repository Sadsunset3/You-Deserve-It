import { useEffect, useRef } from 'react';
import type { PublicCharacter } from '@ydi/contracts';

export function CharacterDetailDrawer({ character, onClose }: { character: PublicCharacter | null; onClose(): void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!character) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [character, onClose]);

  if (!character) return null;

  return <div className="character-drawer-backdrop" onMouseDown={onClose}>
    <aside
      className="character-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="character-drawer-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header>
        <div><span>完整人物档案</span><h2 id="character-drawer-title">人物档案：{character.name}</h2></div>
        <button ref={closeButtonRef} type="button" aria-label="关闭人物档案" onClick={onClose}>×</button>
      </header>
      <div className="drawer-identity">
        <strong className={character.alignment}>{character.name}</strong>
        <span>{character.alignment === 'good' ? '好人阵营' : '恶人阵营'}</span>
      </div>
      <section><h3>背景记录</h3><p>{character.background}</p></section>
      <section><h3>追加词条 <small>×{character.traits.length}</small></h3>{character.traits.length ? <ul>{character.traits.map((trait) => <li key={trait.id}><span>{trait.tag}</span>{trait.text}</li>)}</ul> : <p className="drawer-empty">暂无词条</p>}</section>
      <section><h3>胜出辩词 <small>×{character.arguments.length}</small></h3>{character.arguments.length ? <ol>{character.arguments.map((argument, index) => <li key={`${argument.kind}-${index}`}><span>{argument.kind === 'attack' ? '攻击' : '防守'}</span>{argument.text}</li>)}</ol> : <p className="drawer-empty">暂无胜出辩词</p>}</section>
    </aside>
  </div>;
}
