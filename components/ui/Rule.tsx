import { Reveal } from './Reveal';
import { cx } from './system';

export type RuleProps = {
  className?: string;
  /** Stagger position, matching `<Reveal>`. Each step adds 60ms. */
  index?: number;
};

/**
 * A hairline divider that draws left→right when it enters the viewport.
 *
 * 1px of `--rule` at 32% opacity: the substitute for the drop shadows this
 * system forbids. Ground-resolved, so the same component is correct on paper
 * (crimson), on ink (crimson-lift, which stays visible against #14161A where
 * plain crimson at 2.34:1 would not) and on crimson (white).
 *
 * WHY THE OPACITY IS LEGAL HERE: this rule carries no unique information. The
 * records it separates are also separated by space and by type hierarchy, so
 * WCAG 1.4.11 does not apply and the measured 1.28:1 / 1.37:1 / 1.40:1 is a
 * decorative edge, not a failure.
 *
 * DO NOT copy that reasoning to `<Threshold>`. That line IS required to
 * understand the content, 1.4.11 does apply, and it is never faded.
 *
 * Stays a Server Component — the observer lives inside `<Reveal>`.
 */
export function Rule({ className, index }: RuleProps) {
  return (
    <Reveal as="hr" motion="none" index={index} className={cx('drawline', className)} />
  );
}
