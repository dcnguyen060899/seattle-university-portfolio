import type { ReactNode } from 'react';
import { cx, type BandTone } from './system';

export type BandProps = {
  children: ReactNode;
  /**
   * The ground this section paints. This is the SINGLE colour decision the
   * caller makes — text, muted text, the rule, the edge and the AA-safe
   * crimson all follow from it.
   *
   * BUDGET, per page: at most TWO `ink` bands and ONE `crimson` band. The
   * recruiter form is never on either (Addendum B R-7 puts the agent panel on
   * `paper` for exactly this reason). A third dark band means removing one,
   * not adding a ground.
   */
  tone?: BandTone;
  id?: string;
  /** Skip the 1088px page measure and run content edge to edge. */
  bleed?: boolean;
  /**
   * Constrain content to the 544px READING measure (~66ch) inside the page
   * measure. Use it for any band whose body runs past a couple of sentences —
   * the research bands, the coursework arc, the MAVTERRAS thesis.
   *
   * New vs the reference, which has one measure because its longest text is
   * four sentences. Research prose at 1088px is unreadable.
   */
  prose?: boolean;
  className?: string;
};

/**
 * A full-width section. Sets the ground, the vertical rhythm and the measure.
 *
 * THE TRAP THIS CLOSES: without a ground declaration, every nested component
 * inherits whatever `[data-ground]` happens to be above it — which on this
 * palette can silently resolve `--fg-accent` to #AA0000 over the #14161A ink
 * ground, 2.34:1, failing AA body, AA large AND the 1.4.11 non-text minimum
 * simultaneously. `<Band tone>` is how a section states its ground once, in
 * one place, so nothing under it has to guess.
 *
 * The rhythm is clamp(72px, 10vw, 140px), slightly tighter than the
 * reference's 80–150px: this page carries roughly twice its information
 * density, and 150px between bands at that density reads as padding rather
 * than as whitespace. One idea per band.
 */
export function Band({
  children,
  tone = 'paper',
  id,
  bleed = false,
  prose = false,
  className,
}: BandProps) {
  return (
    <section
      id={id}
      data-ground={tone}
      className={cx(
        'relative py-[var(--spacing-band)] bg-[var(--ground)] text-[color:var(--fg)]',
        className,
      )}
    >
      {bleed ? children : (
        <div className={cx('wrap', prose && 'prose-measure')}>{children}</div>
      )}
    </section>
  );
}
