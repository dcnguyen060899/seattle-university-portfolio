import { cx } from './system';

export type StatProps = {
  /** Pre-formatted. `"24"`, `"20,000"`, `"+0.13"`, `"1,325"`. */
  value: string;
  label: string;
  /**
   * One line of qualification under the label. Optional, and usually needed:
   * this portfolio's numbers are load-bearing and most of them carry a caveat
   * that is part of the signal.
   */
  note?: string;
  className?: string;
};

/**
 * A figure and its label, separated from its neighbours by a hairline rather
 * than by a card — rules and space instead of shadows.
 *
 * The value is the display face at 200, 32–48px, with tabular figures so a row
 * of stats aligns on the digit rather than drifting. The label is MONO, per
 * the type rule that mono owns every label and the display face owns every
 * figure; a 48px monospaced number reads as a terminal, not as a result.
 *
 * THE TRAP `note` CLOSES: a number with nowhere to put its caveat invites the
 * caveat to be dropped. The two that matter most here are that the BI-RADS
 * gain landed almost entirely on majority categories, and that the MLOps
 * stack is in flight rather than shipped. Both are honest limits, both are
 * part of what the page is arguing, and both are one line long — so the
 * primitive keeps a line for them.
 */
export function Stat({ value, label, note, className }: StatProps) {
  return (
    <div
      data-numeric
      className={cx('border-t border-[color:var(--edge)] pt-[20px] pb-[22px]', className)}
    >
      <strong className="block font-display text-stat font-[200]">
        {value}
      </strong>
      <span className="mt-[10px] block font-mono text-micro uppercase text-[color:var(--fg-muted)]">
        {label}
      </span>
      {note !== undefined && (
        <p className="mt-[8px] text-[0.8rem] leading-[1.5] text-[color:var(--fg-muted)]">
          {note}
        </p>
      )}
    </div>
  );
}
