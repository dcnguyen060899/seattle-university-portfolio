/**
 * Seattle University portfolio — UI primitives.
 *
 * Server Components except `<Reveal>` and `<Chip>`, which need the client for
 * an IntersectionObserver and a click handler respectively.
 *
 * THE RULE THAT GOVERNS ALL OF THEM: a caller declares a GROUND, never a
 * colour. `<Band tone="paper" | "ink" | "crimson">` sets it, and everything
 * nested inside reads `--fg`, `--fg-muted`, `--fg-accent`,
 * `--fg-accent-display`, `--fg-pressed`, `--rule`, `--edge`, `--focus-ring`,
 * `--fg-error`, `--ground`, `--ground-sunk` and `--surface-pressed` from it.
 *
 * That is why the 2.34:1 crimson-on-ink trap is not reachable from this API,
 * and `scripts/check-ground-tokens.mjs` fails the build if a component reaches
 * around it. The allowlist in that script is EMPTY, on purpose.
 */

export { Band } from './Band';
export type { BandProps } from './Band';

export { Btn } from './Btn';
export type { BtnProps } from './Btn';

export { Chip } from './Chip';
export type { ChipProps } from './Chip';

export { Entry } from './Entry';
export type { EntryProps } from './Entry';

export { Eyebrow } from './Eyebrow';
export type { EyebrowProps } from './Eyebrow';

export { Field, fieldDescribedBy } from './Field';
export type { FieldProps } from './Field';

export { Figure } from './Figure';
export type { FigureProps } from './Figure';

export { Mark } from './Mark';
export type { MarkProps } from './Mark';

export { Reveal } from './Reveal';
export type { RevealProps, RevealTag } from './Reveal';

export { Rule } from './Rule';
export type { RuleProps } from './Rule';

export { Stat } from './Stat';
export type { StatProps } from './Stat';

export { Threshold } from './Threshold';
export type { ThresholdProps } from './Threshold';

export { cx, groundFor, staggerStyle } from './system';
export type { BandTone, Ground, SurfaceTone } from './system';
