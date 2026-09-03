/**
 * lib/agent/limits.ts — the numbers both ends of the wire have to agree on.
 *
 * Split out of `contracts.ts` for one reason: the panel needs these constants
 * in the BROWSER, and `contracts.ts` builds Zod schemas at module scope. A
 * client component importing the schema module drags a validation library into
 * the bundle to read four integers.
 *
 * The alternative — retyping the caps in the component — is the drift this
 * whole file set exists to prevent: a textarea that stops at one number while
 * the server rejects at another means a recruiter is told their paste was fine
 * and then told it was not. So: one module, no imports, no side effects,
 * imported by both.
 */

/** A pasted posting. Long enough for any requirements section, short enough to bound a call. */
export const MAX_JD_CHARS = 6_000

/** Below this a paste is not a job description and the button stays disabled. */
export const MIN_JD_CHARS = 40

export const MAX_QUESTION_CHARS = 400

/** Refused before the body is even parsed, so an oversized post costs nothing. */
export const MAX_BODY_BYTES = 32_000

export const MAX_HISTORY_TURNS = 3
export const MAX_HISTORY_CHARS = 600

/** The four role chips, in the order they render. */
export const ROLE_IDS = [
  'research-scientist',
  'data-scientist',
  'ml-engineer',
  'data-engineer',
] as const

export type AgentRoleId = (typeof ROLE_IDS)[number]

/** What a chip is called on screen. The corpus holds the same labels; these are
 *  the button text, and they are short because a chip row must not wrap. */
export const ROLE_CHIP_LABEL: Readonly<Record<AgentRoleId, string>> = Object.freeze({
  'research-scientist': 'Research Scientist',
  'data-scientist': 'Data Scientist',
  'ml-engineer': 'ML Engineer',
  'data-engineer': 'Data Engineer',
})
