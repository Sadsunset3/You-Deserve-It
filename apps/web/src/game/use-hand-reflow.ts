import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

const reflowOptions: KeyframeAnimationOptions = {
  duration: 220,
  easing: 'cubic-bezier(.16,1,.3,1)',
};

export function useHandReflow(
  containerRef: RefObject<HTMLElement | null>,
  orderedIds: readonly string[],
) {
  const previousRectsRef = useRef(new Map<string, DOMRect>());
  const animationsRef = useRef(new Set<Animation>());
  const measuredRef = useRef(false);
  const orderKey = orderedIds.join('\u0000');

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    for (const animation of animationsRef.current) animation.cancel();
    animationsRef.current.clear();

    const elements = Array.from(container.querySelectorAll<HTMLElement>(':scope > [data-character-card-id]'));
    const currentRects = new Map(elements.map((element) => [
      element.dataset.characterCardId ?? '',
      element.getBoundingClientRect(),
    ]));
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      previousRectsRef.current = currentRects;
      measuredRef.current = true;
      return;
    }

    for (const element of elements) {
      const id = element.dataset.characterCardId;
      if (!id) continue;
      const previous = previousRectsRef.current.get(id);
      const current = currentRects.get(id);
      if (!current) continue;
      if (!previous) {
        if (!measuredRef.current || typeof element.animate !== 'function') continue;
        element.classList.add('is-reflowing');
        const animation = element.animate(
          [{ transform: 'translate(24px, 0px)', opacity: 0 }, { transform: 'translate(0px, 0px)', opacity: 1 }],
          reflowOptions,
        );
        animationsRef.current.add(animation);
        const finish = () => {
          animationsRef.current.delete(animation);
          element.classList.remove('is-reflowing');
        };
        void animation.finished.then(finish, finish);
        continue;
      }
      const dx = previous.left - current.left;
      const dy = previous.top - current.top;
      if ((dx === 0 && dy === 0) || typeof element.animate !== 'function') continue;

      element.classList.add('is-reflowing');
      const animation = element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        reflowOptions,
      );
      animationsRef.current.add(animation);
      const finish = () => {
        animationsRef.current.delete(animation);
        element.classList.remove('is-reflowing');
      };
      void animation.finished.then(finish, finish);
    }

    previousRectsRef.current = currentRects;
    measuredRef.current = true;
  }, [containerRef, orderKey]);

  useEffect(() => () => {
    for (const animation of animationsRef.current) animation.cancel();
    animationsRef.current.clear();
  }, []);
}
