/**
 * lib/agent/contracts.ts — the wire contract, defined ONCE.
 *
 * Imported by the route (which parses with it) and by the panel (which
 * pre-flights with it and renders from its types). One definition, no drift:
 * the character cap the textarea enforces and the character cap the server
 * rejects on are the same constant, so a recruiter can never be told their
 * paste was fine and then have it rejected.
 *
 * NOTHING HERE READS THE ENVIRONMENT OR TOUCHES NODE. This module is bundled
 * into the browser, so it must stay pure — no `lib/agent/env`, no `node:*`, no
 * corpus import. `lib/agent/corpus.ts` is where the corpus-derived enums live.
 */

import { z } from 'zod'

import {
  MAX_BODY_BYTES,
  MAX_HISTORY_CHARS,
  MAX_HISTORY_TURNS,
  MAX_JD_CHARS,
  MAX_QUESTION_CHARS,
  MIN_JD_CHARS,
  ROLE_IDS,
} from './limits'
import type { AgentRoleId } from './limits'

/* ── request side ──────────────────────────────────────────────────────────── */

export {
  MAX_BODY_BYTES,
  MAX_HISTORY_CHARS,
  MAX_HISTORY_TURNS,
  MAX_JD_CHARS,
  MAX_QUESTION_CHARS,
  MIN_JD_CHARS,
  ROLE_IDS,
}
export type { AgentRoleId }

/** The corpus's own profile ids, in the same order. The chip is the public name. */
export const ROLE_PROFILE_BY_ROLE: Readonly<Record<AgentRoleId, string>> = Object.freeze({
  'research-scientist': 'rp:research-scientist',
  'data-scientist': 'rp:data-scientist',
  'ml-engineer': 'rp:ml-engineer',
  'data-engineer': 'rp:data-engineer',
})

export const briefRequestSchema = z
  .object({
    role: z.enum(ROLE_IDS).nullish(),
    jd: z
      .string()
      .max(MAX_JD_CHARS, `Job description is capped at ${MAX_JD_CHARS} characters.`)
      .default(''),
    /** Echoed into the response and the log line. Client-generated, never trusted. */
    clientRunId: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .optional(),
  })
  .refine((v) => v.role != null || v.jd.trim().length >= MIN_JD_CHARS, {
    message: `Pick a role or paste at least ${MIN_JD_CHARS} characters of the job description.`,
    path: ['jd'],
  })

export const qaTurnSchema = z.object({
  question: z.string().trim().min(1).max(MAX_HISTORY_CHARS),
  answer: z.string().trim().min(1).max(MAX_HISTORY_CHARS),
})

export const qaRequestSchema = z.object({
  question: z.string().trim().min(3).max(MAX_QUESTION_CHARS),
  history: z.array(qaTurnSchema).max(MAX_HISTORY_TURNS).default([]),
  clientRunId: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
})

export type BriefRequest = z.infer<typeof briefRequestSchema>
export type QaRequest = z.infer<typeof qaRequestSchema>
export type QaTurn = z.infer<typeof qaTurnSchema>

/* ── the brief ─────────────────────────────────────────────────────────────── */

export const VERDICTS = ['direct', 'adjacent', 'partial', 'no_evidence'] as const
export type Verdict = (typeof VERDICTS)[number]

/**
 * The strength ordering the fact check enforces. The server may move a verdict
 * DOWN this list and may never move it up (spec-04 §4.6, §9.10).
 */
export const VERDICT_RANK: Readonly<Record<Verdict, number>> = Object.freeze({
  direct: 3,
  adjacent: 2,
  partial: 1,
  no_evidence: 0,
})

export const citationSchema = z.object({
  evidence_id: z.string(),
  quoted_claim: z.string(),
  artifact_label: z.string(),
  /** "" means the record has no public artifact. Never a constructed URL. */
  artifact_url: z.string(),
})

export const requirementSchema = z.object({
  requirement: z.string(),
  verdict: z.enum(VERDICTS),
  confidence: z.enum(['high', 'medium', 'low']),
  rationale: z.string(),
  evidence: z.array(citationSchema).max(3),
  caveat: z.string(),
})

export const fitBriefSchema = z.object({
  role_label: z.string(),
  jd_source: z.enum(['role_chip', 'pasted_jd']),
  headline: z.string(),
  requirements: z.array(requirementSchema).min(1).max(8),
  strongest: z.string(),
  gaps_summary: z.string(),
  not_claimed: z.array(z.string()).max(4),
  closing: z.string(),
  observed_directives: z.array(z.string()).max(3),
})

export const agentAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(citationSchema).max(3),
  confidence: z.enum(['high', 'medium', 'low']),
  refused_reason: z.enum(['', 'off_topic', 'not_in_corpus', 'personal']),
  observed_directives: z.array(z.string()).max(3),
})

export type Citation = z.infer<typeof citationSchema>
export type BriefRequirement = z.infer<typeof requirementSchema>
export type FitBrief = z.infer<typeof fitBriefSchema>
export type AgentAnswer = z.infer<typeof agentAnswerSchema>

/* ── what the server computes, and the model never supplies ────────────────── */

/**
 * Coverage is NOT in any tool schema (spec-04 §4.6.3, §9.9). It is derived from
 * the post-checked verdicts, so a model cannot report a coverage that disagrees
 * with its own verdicts because it never reports one at all.
 */
export const coverageSchema = z.object({
  direct: z.number().int(),
  adjacent: z.number().int(),
  partial: z.number().int(),
  no_evidence: z.number().int(),
})

export const guardrailsSchema = z.object({
  citations_dropped: z.number().int(),
  claims_redacted: z.number().int(),
  numbers_rejected: z.array(z.string()),
  urls_rejected: z.array(z.string()),
  verdicts_downgraded: z.array(
    z.object({
      index: z.number().int(),
      from: z.string(),
      to: z.string(),
      reason: z.string(),
    }),
  ),
  caveats_restored: z.array(z.string()),
  overclaim_flagged: z.boolean(),
  injection_suspected: z.boolean(),
  retractions_blocked: z.array(z.string()),
})

export const STAGES = ['validate', 'retrieve', 'generate', 'tools', 'factcheck', 'render'] as const
export type StageName = (typeof STAGES)[number]

export const traceStageSchema = z.object({
  stage: z.enum(STAGES),
  status: z.enum(['ok', 'skipped', 'degraded', 'error']),
  ms: z.number().int(),
  /** Plain English. This is what the disclosure panel renders — no raw JSON. */
  detail: z.string(),
})

export const usageSchema = z.object({
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  cache_read_input_tokens: z.number().int(),
  cache_creation_input_tokens: z.number().int(),
})

export const telemetrySchema = z.object({
  model: z.string().nullable(),
  runtime: z.literal('nodejs'),
  region: z.string(),
  mode: z.enum(['live', 'demo']),
  corpus_version: z.string(),
  corpus_size: z.number().int(),
  retrieved: z.number().int(),
  surfaced: z.number().int(),
  ranking: z
    .array(
      z.object({
        evidence_id: z.string(),
        score: z.number(),
        matched: z.array(z.string()),
        via: z.string(),
      }),
    )
    .max(24),
  tool_calls: z.array(
    z.object({ name: z.string(), args_summary: z.string(), ms: z.number().int() }),
  ),
  usage: usageSchema,
  cost_usd: z.number(),
  ms: z.number().int(),
})

export const DEGRADED_REASONS = [
  /**
   * Served pre-built ON PURPOSE, not because anything failed. Clicking a role
   * chip takes this path: a recruiter with ninety seconds should not spend
   * twenty of them watching progress rows for a role that already has an
   * answer. It is a distinct reason from every other member of this list
   * precisely so the run strip cannot describe a deliberate choice as a fault.
   */
  'prebuilt',
  'demo_mode',
  'not_configured',
  'model_unavailable',
  'timeout',
  'budget_exhausted',
  'refusal',
  'bad_output',
  'factcheck_failed',
  'injection_blocked',
  'aborted',
  'internal_error',
] as const
export type DegradedReason = (typeof DEGRADED_REASONS)[number]

export const briefEnvelopeSchema = z.object({
  ok: z.literal(true),
  request_id: z.string(),
  degraded: z.boolean(),
  reason: z.enum(DEGRADED_REASONS).nullable(),
  message: z.string().nullable(),
  brief: fitBriefSchema,
  coverage: coverageSchema,
  guardrails: guardrailsSchema,
  trace: z.array(traceStageSchema),
  telemetry: telemetrySchema,
})

export const answerEnvelopeSchema = z.object({
  ok: z.literal(true),
  request_id: z.string(),
  degraded: z.boolean(),
  reason: z.enum(DEGRADED_REASONS).nullable(),
  message: z.string().nullable(),
  answer: agentAnswerSchema,
  guardrails: guardrailsSchema,
  trace: z.array(traceStageSchema),
  telemetry: telemetrySchema,
})

export type Coverage = z.infer<typeof coverageSchema>
export type Guardrails = z.infer<typeof guardrailsSchema>
export type TraceStage = z.infer<typeof traceStageSchema>
export type Telemetry = z.infer<typeof telemetrySchema>
export type AgentUsage = z.infer<typeof usageSchema>
export type BriefEnvelope = z.infer<typeof briefEnvelopeSchema>
export type AnswerEnvelope = z.infer<typeof answerEnvelopeSchema>

/* ── errors, and the SSE frames ────────────────────────────────────────────── */

export const ERROR_CODES = [
  'invalid_json',
  'invalid_request',
  'payload_too_large',
  'unsupported_media_type',
  'method_not_allowed',
  'rate_limited',
  'daily_ceiling',
  'not_found',
  'internal_error',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export interface ErrorEnvelope {
  ok: false
  request_id: string
  error: { code: ErrorCode; message: string; field: string | null }
  retry_after: number | null
}

export interface MetaEvent {
  request_id: string
  runtime: 'nodejs'
  region: string
  model: string | null
  corpus_version: string
  corpus_size: number
  mode: 'live' | 'demo'
}

export type BriefStreamEvent =
  | { event: 'meta'; data: MetaEvent }
  | { event: 'stage'; data: TraceStage }
  | { event: 'brief'; data: BriefEnvelope }
  | { event: 'answer'; data: AnswerEnvelope }
  | { event: 'error'; data: { code: string; message: string; retry_after?: number } }
  | { event: 'done'; data: { ms: number; cost_usd: number } }

/** Every string field's cap, enforced in ONE place (postcheck), never in the schema. */
export const CAPS = Object.freeze({
  role_label: 80,
  headline: 180,
  requirement: 160,
  rationale: 320,
  caveat: 200,
  gaps_summary: 320,
  not_claimed_item: 120,
  closing: 240,
  observed_directive: 120,
  quoted_claim: 240,
  artifact_label: 60,
  answer: 700,
})

/** The marker a field carries when every unit in it was withheld. Never "". */
export const WITHHELD = '(withheld: could not be verified against this site)'
