import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { PhilosophyJudgment, RoomView } from '@ydi/contracts';

gsap.registerPlugin(useGSAP);

const command = (room: RoomView) => ({ commandId: crypto.randomUUID(), expectedVersion: room.version });
const stanzaLabels: Record<PhilosophyJudgment['stanzas'][number]['kind'], string> = {
  opening: '开场',
  'player-a': '甲方证词',
  'player-b': '乙方证词',
  tracks: '轨上众生',
  verdict: '落槌',
};
const seatNickname = (room: RoomView, seat: 'a' | 'b') => (seat === room.me.seat ? room.me.nickname : room.opponent?.nickname ?? '对方');
const speechSecondsLeft = (deadline: string | null) => (deadline ? Math.max(0, (new Date(deadline).getTime() - Date.now()) / 1000) : null);

function ConductorSpeech({ room }: { room: RoomView }) {
  const [remaining, setRemaining] = useState(() => speechSecondsLeft(room.deadline));
  useEffect(() => {
    setRemaining(speechSecondsLeft(room.deadline));
    const timer = window.setInterval(() => setRemaining(speechSecondsLeft(room.deadline)), 200);
    return () => window.clearInterval(timer);
  }, [room.deadline]);
  const fading = remaining !== null && remaining <= 1.5;
  const verdict = room.trackVerdict;
  const crushedNickname = verdict ? seatNickname(room, verdict.crushedSeat) : '';
  const conductor = room.conductor;
  return (
    <section className={`judgment-overlay conductor-speech ${fading ? 'fading' : ''}`} role="dialog" aria-modal="true" aria-labelledby="speech-title">
      <span className="speech-eyebrow">列车长宣言 · 拉杆已落下</span>
      <h2 id="speech-title">列车压过了{crushedNickname}所在的轨道</h2>
      <div className="conductor-speech-head">
        <span className="conductor-seal" aria-hidden="true">车</span>
        <div>
          <strong>{conductor?.name ?? '列车长'}</strong>
          <p>{conductor?.persona}</p>
          <em>判尺：{conductor?.rule}</em>
        </div>
      </div>
      <blockquote className="speech-body">{verdict?.speech}</blockquote>
      <p className="speech-lead-in">本局终审即将开始……</p>
    </section>
  );
}

function PoemJudgment({ room, send }: { room: RoomView; send(action: string, body?: object): Promise<void> }) {
  const root = useRef<HTMLElement>(null);
  const judgment = room.judgment!;
  const trackVerdict = room.trackVerdict;
  const nicknameOf = (seat: 'a' | 'b') => seatNickname(room, seat);
  const crushedNickname = trackVerdict ? nicknameOf(trackVerdict.crushedSeat) : '';
  const survivorNickname = trackVerdict ? nicknameOf(trackVerdict.survivor) : '';

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add({
      reduceMotion: '(prefers-reduced-motion: reduce)',
      animateMotion: '(prefers-reduced-motion: no-preference)',
    }, (context) => {
      const reduceMotion = Boolean(context.conditions?.reduceMotion);
      const lines = gsap.utils.toArray<HTMLElement>('.poem-line');
      const scroller = root.current?.querySelector<HTMLElement>('.poem-scroll');
      if (reduceMotion) {
        gsap.set(['.poem-kicker', '.poem-title', ...lines, '.poem-action'], { autoAlpha: 1, y: 0, clearProps: 'filter' });
        return;
      }

      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      timeline
        .from('.poem-kicker', { autoAlpha: 0, y: -12, duration: 0.45 })
        .from('.poem-title', { autoAlpha: 0, y: -24, duration: 0.8 }, '<0.12');
      lines.forEach((poemLine) => {
        timeline.from(poemLine, { autoAlpha: 0, y: -38, filter: 'blur(7px)', duration: 0.72 }, '>-0.12');
        if (scroller) {
          timeline.to(scroller, {
            scrollTop: () => Math.max(0, poemLine.offsetTop - scroller.clientHeight * 0.62),
            duration: 0.52,
            ease: 'power2.inOut',
          }, '<');
        }
      });
      timeline.from('.poem-action', { autoAlpha: 0, y: 18, duration: 0.55 }, '>-0.05');
      if (scroller) {
        const stopAutoScroll = () => timeline.getTweensOf(scroller).forEach((tween) => tween.kill());
        const stopAutoScrollFromKeyboard = (event: KeyboardEvent) => {
          if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) stopAutoScroll();
        };
        scroller.addEventListener('wheel', stopAutoScroll, { passive: true });
        scroller.addEventListener('touchstart', stopAutoScroll, { passive: true });
        scroller.addEventListener('pointerdown', stopAutoScroll, { passive: true });
        scroller.addEventListener('keydown', stopAutoScrollFromKeyboard);
        return () => {
          scroller.removeEventListener('wheel', stopAutoScroll);
          scroller.removeEventListener('touchstart', stopAutoScroll);
          scroller.removeEventListener('pointerdown', stopAutoScroll);
          scroller.removeEventListener('keydown', stopAutoScrollFromKeyboard);
        };
      }
    }, root);
    return () => media.revert();
  }, { scope: root, dependencies: [judgment.title], revertOnUpdate: true });

  return (
    <section ref={root} className="judgment-overlay poem-judgment" role="dialog" aria-modal="true" aria-labelledby="judgment-title">
      <div className="poem-rail poem-rail-left" aria-hidden="true" />
      <div className="poem-scroll" role="region" aria-label="裁决诗播放区" tabIndex={0}>
        <header className="poem-heading">
          <span className="poem-kicker">本局终审 · 列车压过了{crushedNickname}所在的轨道</span>
          <h2 className="poem-title" id="judgment-title">{judgment.title}</h2>
        </header>
        <ol className="poem-lines" aria-label="本局裁决诗">
          {judgment.stanzas.flatMap((stanza) => stanza.lines.map((line, lineIndex) => (
            <li className={`poem-line poem-line-${stanza.kind}`} key={`${stanza.kind}-${lineIndex}`}>
              {lineIndex === 0 && <span aria-hidden="true">{stanzaLabels[stanza.kind]}</span>}
              <p>{line}</p>
            </li>
          )))}
        </ol>
        <footer className="poem-action">
          <span>{survivorNickname} 的轨道驶向下一站</span>
          <button className="primary" disabled={room.nextGameReady[room.me.seat]} onClick={() => void send('ready-next-game', command(room))}>
            {room.nextGameReady[room.me.seat] ? '等待对方准备' : '读完了，准备下一局'}
          </button>
        </footer>
      </div>
      <div className="poem-rail poem-rail-right" aria-hidden="true" />
    </section>
  );
}

export function JudgmentOverlay({ room, send, leave }: { room: RoomView; send(action: string, body?: object): Promise<void>; leave?: (() => void) | undefined }) {
  if (room.phase === 'track-adjudicating') return <section className="judgment-overlay pending" role="dialog" aria-modal="true"><span>终局裁决</span><h2>列车长正在选择要压死的轨道</h2><p>三轮辩词、所有人物、背景、词条和胜出论据已经送达。</p></section>;
  if (room.phase === 'conductor-speech') return <ConductorSpeech room={room} />;
  if (room.phase === 'judgment-generating') return <section className="judgment-overlay pending" role="dialog" aria-modal="true"><span>轨道已经选定</span><h2>{room.trackVerdict?.crushedSeat === room.me.seat ? '你的轨道将被压过' : '对方的轨道将被压过'}</h2><p>{room.trackVerdict?.reason}</p><strong>终局诗正在落笔……</strong></section>;
  if (room.phase === 'match-end') return <section className="judgment-overlay match-end" role="dialog" aria-modal="true"><span>整场结束</span><h2>{room.finalResult?.survivor === room.me.seat ? '你活了下来' : '对方赢得了这场审判'}</h2><p>最终比分 {room.scores.a}:{room.scores.b}</p><p>{room.finalResult?.reason}</p><button className="primary" onClick={leave}>返回首页</button></section>;
  if (!room.judgment) return null;
  return <PoemJudgment room={room} send={send} />;
}
