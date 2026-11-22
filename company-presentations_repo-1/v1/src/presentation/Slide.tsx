import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import './presentation.css';

/** Live slides are drawn on a 1280 x 720 stage (16:9, like the deck pictures) and scaled to fit the slide width and height. */
export const STAGE_W = 1280;
export const STAGE_H = 720;

/** A slide that is a picture. The picture keeps its own proportions. */
export function ImageSlide({ src, alt, group }: { src: string; alt: string; group?: string }) {
  return (
    <section className="slide" data-group={group}>
      <img className="slide-img" src={src} alt={alt} width={2000} height={1125} loading="lazy" decoding="async" />
    </section>
  );
}

/** A slide drawn in code. The children are placed on the 1280 x 720 stage. */
export function LiveSlide({ label, bg, children }: { label: string; bg: string; children: ReactNode }) {
  const box = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(Math.min(el.clientWidth / STAGE_W, el.clientHeight / STAGE_H) || 1);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <section className="slide" ref={box} aria-label={label} style={{ background: bg }}>
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties}>
        {children}
      </div>
    </section>
  );
}

const chevron = (up: boolean) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={up ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} />
  </svg>
);

/**
 * The page that holds the slides. The visitor cannot scroll it with the wheel, the trackpad or a swipe (see presentation.css).
 * Slides change with the round buttons on the right, a click on a picture slide, or the arrow keys, Page Up, Page Down and Space.
 * Down, Right, Page Down and Space go forward. Up, Left and Page Up go back.
 */
export function SlidePage({ children }: { children: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const at = useRef(0);

  const show = (n: number, smooth: boolean) => {
    const slides = list.current?.querySelectorAll(':scope > .slide');
    if (!slides || !slides.length) return;
    const next = Math.max(0, Math.min(slides.length - 1, n));
    // Build steps of one slide (same data-group) appear at once. Every other change scrolls.
    const group = (slides[at.current] as HTMLElement).dataset.group;
    const sameGroup = !!group && group === (slides[next] as HTMLElement).dataset.group;
    at.current = next;
    setIndex(next);
    slides[next].scrollIntoView({ block: 'center', behavior: smooth && !sameGroup ? 'smooth' : 'instant' });
  };

  useEffect(() => {
    setCount(list.current?.querySelectorAll(':scope > .slide').length ?? 0);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    show(0, false);
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
      const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
      if (!forward && !back) return;
      e.preventDefault();
      show(at.current + (forward ? 1 : -1), true);
    };
    const onResize = () => show(at.current, false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const step = (delta: number) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    show(at.current + delta, true);
  };

  // A click on a picture slide shows the next slide. The round buttons, the live phone slide and text the visitor selects are left alone.
  const onPageClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.slide-nav') || target.closest('[aria-label="Live demo"]')) return;
    if (window.getSelection()?.toString()) return;
    show(at.current + 1, true);
  };

  return (
    <main className="slide-page" onClick={onPageClick}>
      <div className="slides" ref={list}>
        {children}
      </div>
      <nav className="slide-nav" aria-label="Slide navigation">
        <button type="button" aria-label="Previous slide" disabled={index <= 0} onClick={step(-1)}>
          {chevron(true)}
        </button>
        <button type="button" aria-label="Next slide" disabled={index >= count - 1} onClick={step(1)}>
          {chevron(false)}
        </button>
      </nav>
    </main>
  );
}
