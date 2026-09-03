/**
 * lib/agent/client.ts — the model call, and the two locks around it.
 *
 * LOCK 1, STRUCTURAL: `getAnthropic()` THROWS while `AGENT_DEMO_MODE` is on.
 * The demo path therefore cannot make a network call even if a branch is
 * forgotten somewhere else. A boolean check that must be remembered at every
 * call site is a check that will eventually be missed; a constructor that
 * refuses cannot be.
 *
 * LOCK 2, PROCEDURAL: every route also checks the capability before it gets
 * here. Two independent mechanisms, either of which is sufficient.
 *
 * TYPED ERROR -> REASON CODE -> USER SENTENCE. One table, so the copy a
 * recruiter reads for a rate limit and the copy they read for an outage are
 * decided in the same place and neither is improvised at the call site. Nothing
 * here ever surfaces a provider error message to a user: those leak vendor
 * detail and mean nothing to the person reading them.
 */

import Anthropic from '@anthropic-ai/sdk'

import type { DegradedReason } from './contracts'
import { AGENT_DEMO_MODE, agentEnv, capabilities } from './env'

export class AgentUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentUnavailableError'
  }
}

/** A run that failed in a way the envelope has a word for. */
export class AgentFailure extends Error {
  readonly reason: DegradedReason
  constructor(reason: DegradedReason, message?: string) {
    super(message ?? reason)
    this.name = 'AgentFailure'
    this.reason = reason
  }
}

let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (AGENT_DEMO_MODE()) {
    throw new AgentUnavailableError(
      'Refusing to construct an Anthropic client while AGENT_DEMO_MODE is on. The demo path must ' +
        'never make a network call — see app/api/agent/brief/route.ts. Going live is an explicit ' +
        'AGENT_DEMO_MODE=0, verified with GET /api/agent/health returning mode "live".',
    )
  }
  if (!capabilities().agent) {
    throw new AgentUnavailableError('ANTHROPIC_API_KEY is not set.')
  }
  const env = agentEnv()
  client ??= new Anthropic({
    apiKey: env.apiKey,
    // The loop owns retries beyond this one: the SDK's single retry covers a
    // transient 429/5xx, and anything worse should degrade rather than queue a
    // recruiter behind an exponential backoff they cannot see.
    maxRetries: 1,
    timeout: env.briefDeadlineMs,
  })
  return client
}

/** Tests reset the memoised client when they change the environment. */
export function resetAnthropicClient(): void {
  client = null
}

/* ── the call ──────────────────────────────────────────────────────────────── */

export interface ModelCall {
  system: Anthropic.TextBlockParam[]
  messages: Anthropic.MessageParam[]
  tools: readonly Anthropic.Tool[]
  toolChoice: Anthropic.ToolChoice
  maxTokens: number
  signal: AbortSignal
}

export type ModelFn = (call: ModelCall) => Promise<Anthropic.Message>

/**
 * The real call.
 *
 * `thinking: adaptive` is stated explicitly rather than left to the default: it
 * is the current shape on this model family and writing it down is how the next
 * person reading this file learns that a fixed thinking budget is not a thing
 * here any more. `effort` is the cost lever; `medium` is the default because
 * calibration — the honest partial / no-evidence judgement — is where model
 * quality shows and this run is short.
 */
export const realModelCall: ModelFn = async (call) => {
  const env = agentEnv()
  const anthropic = getAnthropic()
  return anthropic.messages.create(
    {
      model: env.model,
      max_tokens: call.maxTokens,
      system: call.system,
      messages: call.messages,
      tools: call.tools as Anthropic.Tool[],
      tool_choice: call.toolChoice,
      thinking: { type: 'adaptive' },
      output_config: { effort: env.effort },
    },
    { signal: call.signal },
  )
}

/**
 * Which function actually runs.
 *
 * `AGENT_FAKE_MODEL=1` selects a deterministic in-process model that exercises
 * the ENTIRE live path — loop, tool execution, fact check, rendering — with no
 * key and no network. Without it the live path would only ever be exercised in
 * production, which is the one place nobody wants to find out about it.
 */
export async function resolveModelFn(): Promise<ModelFn> {
  if (agentEnv().fakeModel) {
    const { fakeModelCall } = await import('./fake')
    return fakeModelCall
  }
  return realModelCall
}

/* ── typed error → reason → sentence ───────────────────────────────────────── */

/**
 * The one place a provider failure becomes a word this system understands.
 *
 * `credit_balance_too_low` arrives as a 400 with a body code, not as its own
 * error class, so it is matched on the body rather than the status. It is the
 * one reason logged at `error` rather than `warn`: it means the prepaid balance
 * is out and the site is serving pre-built briefs until someone tops it up.
 */
export function classifyError(err: unknown): DegradedReason {
  if (err instanceof AgentFailure) return err.reason
  if (err instanceof AgentUnavailableError) return 'not_configured'

  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = String((err as { name: unknown }).name)
    if (name === 'AbortError' || name === 'APIUserAbortError') return 'aborted'
    if (name === 'TimeoutError') return 'timeout'
  }

  if (err instanceof Anthropic.APIUserAbortError) return 'aborted'
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'timeout'
  if (err instanceof Anthropic.APIConnectionError) return 'model_unavailable'
  if (err instanceof Anthropic.RateLimitError) return 'model_unavailable'
  if (err instanceof Anthropic.AuthenticationError) return 'not_configured'
  if (err instanceof Anthropic.PermissionDeniedError) return 'not_configured'
  if (err instanceof Anthropic.BadRequestError) {
    return looksLikeBudgetExhausted(err) ? 'budget_exhausted' : 'bad_output'
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0
    if (status >= 500) return 'model_unavailable'
    if (status === 429) return 'model_unavailable'
    return 'bad_output'
  }
  return 'internal_error'
}

function looksLikeBudgetExhausted(err: InstanceType<typeof Anthropic.APIError>): boolean {
  const blob = `${err.message} ${safeJson(err.error)}`.toLowerCase()
  return blob.includes('credit_balance_too_low') || blob.includes('credit balance')
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? '')
  } catch {
    return ''
  }
}

/**
 * The sentence a recruiter reads.
 *
 * Note what none of these say: "switched off", "unavailable", "error". A
 * recruiter is not an operator, and a page that tells a stranger the system is
 * broken has failed even when the fallback worked. Every one of these describes
 * what they GOT, and only then why.
 */
const REASON_MESSAGE: Readonly<Record<DegradedReason, string>> = Object.freeze({
  prebuilt:
    'This is the pre-built brief for this role. Paste the actual job description to run it live ' +
    'against your own requirements.',
  demo_mode:
    'This brief was assembled without calling the model. This deploy is not making model calls.',
  not_configured: 'This brief was assembled without calling the model.',
  model_unavailable:
    'The model service did not answer in time, so this brief was assembled without it.',
  timeout: 'The run passed its time limit, so this brief was assembled without the model.',
  budget_exhausted:
    'The live agent has reached its spending cap for now, so this brief was assembled without the model.',
  refusal: 'The model declined this request, so this brief was assembled without it.',
  bad_output:
    'The generated brief did not match the required shape twice in a row, so it was discarded and ' +
    'this one was assembled without the model.',
  factcheck_failed:
    "The generated brief could not be verified against this site's own record, so it was discarded. " +
    'This one was assembled without the model.',
  injection_blocked:
    'The pasted text contained instructions rather than requirements. They were read as data and not ' +
    'followed, and this brief was assembled without the model.',
  aborted: 'The request was cancelled before it finished.',
  internal_error:
    'Something went wrong on this side, so this brief was assembled without the model.',
})

export const messageForReason = (reason: DegradedReason): string => REASON_MESSAGE[reason]

/**
 * Which log level a degradation deserves. `budget_exhausted` pages the owner —
 * it means the prepaid balance is out and every recruiter from now on is
 * reading a pre-built brief. A healthy run (`reason === null`) is `info`.
 */
export function levelForReason(reason: DegradedReason | null): 'info' | 'warn' | 'error' {
  if (reason === null) return 'info'
  if (reason === 'budget_exhausted' || reason === 'internal_error') return 'error'
  if (reason === 'prebuilt' || reason === 'demo_mode' || reason === 'not_configured' || reason === 'aborted') {
    return 'info'
  }
  return 'warn'
}
