import { Reveal } from './Reveal';
import { cx } from './system';

export type ThresholdProps = {
  /**
   * The threshold itself, pre-formatted and including its metric name:
   * `"P@1 0.487"`, `"<200 ms"`, `"macro-F1 0.35"`.
   */
  value: string;
  /** What the value is a threshold OF. `"held-out majority-class floor"`. */
  label: string;
  /**
   * The figure that CLEARED the threshold, pre-formatted: `"0.585"`.
   * When present it is set ABOVE the rule in the display face, so the geometry
   * of the object states the claim: one number sits over the line, the floor
   * sits on it. Omit for a bare threshold with nothing above it.
   */
  clearedValue?: string;
  /**
   * What cleared it, and — where it is true and load-bearing — how alone it
   * was: `"Mammo-CLIP, fine-tuned — the only arm of 24 to clear it"`.
   */
  clearedLabel?: string;
  /**
   * One further line under the floor. Use it for the qualification a measured
   * result usually needs: `"0.513 frozen → 0.585 fine-tuned"`.
   */
  cleared?: string;
  index?: number;
  className?: string;
};

/**
 * THE SIGNATURE ELEMENT. A 2px accent rule with a measured value at its
 * terminus, marking a threshold in the content — and, when something cleared
 * that threshold, the clearing figure set above the line.
 *
 * WHY IT EXISTS: this portfolio's headline research result IS a threshold. A
 * held-out majority-class retrieval floor of P@1 = 0.487, and exactly one arm
 * of twenty-four cleared it, at 0.585. The device therefore encodes something
 * true about the content instead of decorating it, and it is where the site's
 * whole crimson budget is spent. It also reuses a pattern the current site
 * already has — the 2px accent rule above the news list in docs/css/news.css.
 *
 *     0.585                                        <- cleared, display face
 *     MAMMO-CLIP, FINE-TUNED — THE ONLY ARM OF 24
 *     ==========================================   <- the 2px rule, --fg-accent
 *     P@1 0.487   HELD-OUT MAJORITY-CLASS FLOOR    <- the threshold, mono
 *
 * THE TRAP THIS CLOSES — and it is the reason this is a component and not a
 * `<hr className="threshold-rule">` an author writes by hand: this line is a
 * graphical object REQUIRED to understand the content, so WCAG 1.4.11 applies
 * and it must hold 3:1 against its ground. At full opacity `--fg-accent`
 * measures paper 7.43:1, ink 5.68:1, crimson 7.75:1 — all clear. Adding
 * `opacity` to it, the way `<Rule>` legitimately does, breaks all three at
 * once. Fading it is the obvious visual "improvement" and it is the one edit
 * that turns the signature into an accessibility failure.
 *
 * DO NOT use it as a generic divider — `<Rule>` is the divider. If it appears
 * more than three times on a page it has stopped meaning "threshold" and
 * started meaning "line".
 *
 * ── WHY THIS FILE DOES NOT KNOW IT IS SOMETIMES ON A PHOTOGRAPH ───────────
 *
 * The hero's copy is set 500-weight and one micro step larger than the paper
 * bands, because 400-weight mono over a photograph paints only 3% of its ink
 * at the colour its token names (measured; the table is in
 * components/site/hero.module.css). It would be easy to read that as "the
 * threshold device needs a `tone` prop".
 *
 * It does not, and adding one would be the defect. The setting below is
 * correct on a flat ground and the flat ground is where this component lives
 * on most of the page; the band that has a photograph behind it retypes its
 * own descendants from `.inner` in hero.module.css, through two of
 * app/globals.css's own custom properties and one rule on `.font-mono`. That
 * keeps ONE scale with two registers instead of forking every primitive that
 * can land on the hero, and it means a component nobody has thought about yet
 * is already correct the day it is dropped into that band.
 */
export function Threshold({
  value,
  label,
  clearedValue,
  clearedLabel,
  cleared,
  index,
  className,
}: ThresholdProps) {
  return (
    <div data-numeric className={cx('mt-[clamp(28px,4vw,44px)]', className)}>
      {(clearedValue !== undefined || clearedLabel !== undefined) && (
        <Reveal index={index} className="mb-[10px]">
          {clearedValue !== undefined && (
            <strong className="block font-display text-stat font-[200] text-[color:var(--fg-accent-display)]">
              {clearedValue}
            </strong>
          )}
          {clearedLabel !== undefined && (
            <span className="mt-[8px] block font-mono text-micro uppercase text-[color:var(--fg-muted)]">
              {clearedLabel}
            </span>
          )}
        </Reveal>
      )}

      <Reveal as="hr" motion="none" index={index} className="threshold-rule" />

      <div className="mt-[10px] flex flex-wrap items-baseline gap-x-[14px] gap-y-[2px]">
        <span className="font-mono text-data text-[color:var(--fg-accent)]">
          {value}
        </span>
        <span className="font-mono text-fine uppercase tracking-[0.14em] text-[color:var(--fg-muted)]">
          {label}
        </span>
      </div>

      {cleared !== undefined && (
        <p className="mt-[6px] font-mono text-fine text-[color:var(--fg-muted)]">
          {cleared}
        </p>
      )}
    </div>
  );
}
