/**
 * GET /api/agent/health — the liveness probe, and the cutover assertion.
 *
 * RULING R-13 IS THE REASON THIS ENDPOINT EXISTS IN THIS SHAPE. `AGENT_DEMO_MODE`
 * defaults ON and wins over a present key. That is correct — a live call must
 * not be able to fail unattended — but it means a production deploy that sets
 * the key and forgets `AGENT_DEMO_MODE=0` serves pre-built briefs forever while
 * announcing it to every recruiter who visits. Nothing else in the stack
 * detects that state: a key-presence check reports the agent live while it is
 * canned.
 *
 * So this endpoint reports `mode: "live" | "demo"` from the SAME module the
 * routes compute their behaviour from, and the cutover checklist asserts
 * `mode === "live"` as a numbered step before the DNS change is announced.
 *
 * IT MAKES NO MODEL CALL, DELIBERATELY. The endpoint it replaces called the
 * model on every hit, which let an uptime monitor spend money on a five-minute
 * cadence. That is a real cost bug in the code this replaces, and not repeating
 * it is worth a sentence.
 *
 * IT NEVER RETURNS A KEY, A PREFIX OF ONE, OR ITS LENGTH. `ai_configured` is
 * presence, and nothing more.
 */

import { CANNED_ROLES, cannedBrief } from '../../../../lib/agent/canned'
import { CORPUS_SIZE, CORPUS_VERSION } from '../../../../lib/agent/corpus'
import { agentEnv, agentMode, aiConfigured, AGENT_DEMO_MODE } from '../../../../lib/agent/env'
import { baseHeaders, methodNotAllowed, newRequestId } from '../../../../lib/agent/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

export function GET(): Response {
  const requestId = newRequestId()
  const env = agentEnv()

  const canned = CANNED_ROLES.map((role) => {
    try {
      const file = cannedBrief(role)
      return {
        role,
        composer: file.provenance.composer,
        built_at: file.provenance.builtAt,
        /** A pre-built brief written against a different corpus is STALE, and
         *  the routes compose a fresh one rather than serve it. Reported here so
         *  the state is visible before a recruiter finds it. */
        stale: file.provenance.corpusVersion !== CORPUS_VERSION,
      }
    } catch {
      return { role, composer: null, built_at: null, stale: true }
    }
  })

  const body = {
    ok: true,
    request_id: requestId,
    version: '1',
    /** THE FIELD THE CUTOVER CHECKLIST ASSERTS ON. */
    mode: agentMode(),
    demo_mode: AGENT_DEMO_MODE(),
    ai_configured: aiConfigured(),
    /** True only under the test-only stand-in, which env.ts refuses in production. */
    fake_model: env.fakeModel,
    model: env.model,
    effort: env.effort,
    region: env.region,
    corpus_version: CORPUS_VERSION,
    corpus_size: CORPUS_SIZE,
    canned_roles: canned,
    limits: {
      brief_per_min: 1,
      brief_burst: 3,
      qa_per_min: 3,
      qa_burst: 6,
      daily_brief_ceiling: env.dailyBriefCeiling,
      daily_qa_ceiling: env.dailyQaCeiling,
      max_jd_chars: 6000,
      brief_deadline_ms: env.briefDeadlineMs,
      qa_deadline_ms: env.qaDeadlineMs,
    },
    note:
      agentMode() === 'demo'
        ? 'Serving pre-built briefs. Going live is an explicit AGENT_DEMO_MODE=0 plus a key; ' +
          'the rate limiter is not a spend control and the prepaid balance is.'
        : 'Calling the model. The prepaid balance with auto-reload off is the real spend control.',
  }

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { ...baseHeaders(requestId), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function POST(): Response {
  return methodNotAllowed('GET')
}
