'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { cx, staggerStyle } from './system';

/** Elements `<Reveal>` can render as. Kept small so nesting stays valid HTML. */
export type RevealTag =
  | 'div' | 'section' | 'article' | 'aside' | 'figure'
  | 'li' | 'p' | 'span' | 'hr' | 'tr';

export type RevealProps = {
  children?: ReactNode;
  /** Stagger position. Each step adds `--stagger` (60ms) of delay. */
  index?: number;
  /**
   * `rise` — the standard fade + 18px rise.
   * `none` — observe and add `.in`, but supply no motion of its own. Used by
   *          `<Rule>` and `<Threshold>`, which draw left→right instead.
   */
  motion?: 'rise' | 'none';
  as?: RevealTag;
  className?: string;
};

/**
 * Reveals its children when they enter the viewport.
 *
 * THE TRAP THIS CLOSES, twice over:
 *
 * 1. Content trapped at `opacity: 0`. A scroll-reveal that hides its content
 *    in CSS and reveals it in JS shows a recruiter a blank page whenever the
 *    script is blocked, deferred behind a slow network, or still hydrating.
 *    The hidden state in globals.css is therefore scoped to
 *    `@media (scripting: enabled)`, and this component only ever ADDS `.in`.
 *
 * 2. `prefers-reduced-motion` half-honoured. It is honoured three times on
 *    purpose: in CSS (so it holds before hydration and with JS off), here
 *    (so the observer is never even constructed), and through `motion-reduce:`
 *    on every hover transition in `Btn`, `Chip` and `Figure`. A vestibular
 *    trigger that only fires "sometimes" is worse than one that always fires.
 *
 * IntersectionObserver only — no scroll listener, so this stays off the main
 * thread and costs nothing while idle. Observation stops at first reveal.
 *
 * The stagger travels as the `--i` custom property, not as an inline
 * `transitionDelay`: globals.css owns the delay formula
 * (`calc(var(--i, 0) * var(--stagger))`) so there is exactly one of it.
 */
export function Reveal({
  children,
  index = 0,
  motion = 'rise',
  as = 'div',
  className,
}: RevealProps) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => { setNode(el); }, []);

  useEffect(() => {
    if (node === null) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Reveal immediately and build nothing. Also the correct fallback on any
    // engine without IntersectionObserver: visible beats animated.
    if (reduced || typeof IntersectionObserver === 'undefined') {
      node.classList.add('in');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    );

    observer.observe(node);
    return () => { observer.disconnect(); };
  }, [node]);

  const Tag = as as 'div';

  return (
    <Tag
      ref={ref}
      className={cx(motion === 'rise' && 'rv', className)}
      style={staggerStyle(index)}
    >
      {children}
    </Tag>
  );
}
