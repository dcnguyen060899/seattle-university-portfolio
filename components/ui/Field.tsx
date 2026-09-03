import type { ReactNode } from 'react';
import { cx } from './system';

export type FieldProps = {
  /**
   * The id of the CONTROL this field labels. The caller must put the same id
   * on its `<input>`/`<textarea>`, together with
   * `aria-describedby={describedBy}` and `aria-invalid` when `error` is set —
   * see `fieldDescribedBy()` below.
   */
  id: string;
  label: string;
  /** Present ⇒ the field is invalid. The string is the message. */
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Builds the `aria-describedby` value for a control wrapped in `<Field>`.
 *
 * Exported because the association has to be set on the CONTROL, which the
 * caller owns, and hand-assembling the id list at every call site is exactly
 * how a hint or an error message ends up unannounced.
 */
export function fieldDescribedBy(
  id: string,
  opts: { hint?: boolean; error?: boolean },
): string | undefined {
  const ids = [opts.hint === true ? `${id}-hint` : null, opts.error === true ? `${id}-error` : null]
    .filter((v): v is string => v !== null);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/**
 * A labelled control and its failure state.
 *
 * THIS COMPONENT EXISTS TO MAKE THE NO-ERROR-HUE DECISION UNAVOIDABLE.
 *
 * The site has exactly one accent — docs/css/news.css already states the rule
 * the current site lives by: one accent, no second accent. A second red on a
 * one-hue brand cannot be distinguished from the first by a protanopic
 * reader, so colour is not permitted to carry failure state at all. There is
 * no `--fg-warn` and there is no error hue; `--fg-error` resolves to `--fg`
 * on every ground, which is full contrast and always legible (17.30:1 on
 * paper, 16.04:1 on ink, 7.75:1 on crimson).
 *
 * The state is carried by three non-colour cues that always travel together:
 *
 *   1. a doubled 2px `--fg-accent` rule under the control — the threshold
 *      rule, reused as a failure mark, and >= 3:1 on every ground,
 *   2. a mono `ERROR` prefix at `--text-micro`,
 *   3. `aria-invalid` on the control (caller) plus `role="status"` on the
 *      message (here).
 *
 * THE TRAP THIS CLOSES: someone reaching for a red error colour, measuring it
 * against nothing, and shipping a second unmeasured hue into a one-hue brand.
 * The red is already here. It is the rule.
 */
export function Field({ id, label, error, hint, children, className }: FieldProps) {
  const invalid = error !== undefined;

  return (
    <div className={cx('grid gap-[8px]', className)} data-invalid={invalid || undefined}>
      <label
        htmlFor={id}
        className="font-mono text-eyebrow uppercase text-[color:var(--fg-muted)]"
      >
        {label}
      </label>

      {/*
        Field owns the rule beneath the control; the caller owns the control.
        The doubled rule is drawn as a 0-blur box-shadow offset below the
        border rather than as a second element. That is the ONLY box-shadow in
        the system, and it is a line, not an elevation — the cleared
        --shadow-* namespace is about elevation. Written as an arbitrary
        property precisely so it survives that cleared namespace.
      */}
      <div
        className={cx(
          invalid
            ? 'border-b-2 border-[color:var(--fg-accent)] [box-shadow:0_3px_0_-1px_var(--fg-accent)]'
            : 'border-b border-[color:var(--edge)]',
        )}
      >
        {children}
      </div>

      {hint !== undefined && (
        <p id={`${id}-hint`} className="font-mono text-fine text-[color:var(--fg-muted)]">
          {hint}
        </p>
      )}

      {invalid && (
        <p
          id={`${id}-error`}
          role="status"
          className="text-[0.85rem] leading-[1.5] text-[color:var(--fg-error)]"
        >
          <span className="mr-[8px] font-mono text-micro uppercase text-[color:var(--fg-accent)]">
            Error
          </span>
          {error}
        </p>
      )}
    </div>
  );
}
