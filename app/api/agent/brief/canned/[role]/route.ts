/**
 * GET /api/agent/brief/canned/[role] — the pre-built brief, instantly.
 *
 * THE ZERO-LATENCY PATH, AND WHY IT IS THE DEFAULT FOR A CHIP.
 *
 * A live run takes seven seconds at the median and twenty-two at the tail,
 * and the page's own promise to a recruiter is "the most efficient time
 * accessing this profile". Spending twenty of a recruiter's ninety seconds
 * watching progress rows for one of four roles that already has an answer is
 * the wrong trade. So the four role chips render this, in one round trip, with
 * no model call and no cost; pasting the actual job description is the live
 * path, and the panel says which one the reader is looking at.
 *
 * It is not a lie and the strip does not have to hedge: these files are built
 * from the same evidence records, through the same fact check, by
 * `npm run build:canned`, and each carries a provenance record saying which
 * composer produced it.
 *
 * A stale file — one built against a different corpus — is NOT served. It is
 * recomposed from the current records on the spot. The alternative is a brief
 * that quietly disagrees with the page it sits on, which is the one failure
 * this whole system exists to prevent.
 */

import { cannedBrief, isRoleId, provenanceSentence } from '../../../../../../lib/agent/canned'
import type { BriefEnvelope } from '../../../../../../lib/agent/contracts'
import { CORPUS_SIZE, CORPUS_VERSION } from '../../../../../../lib/agent/corpus'
import { zeroUsage } from '../../../../../../lib/agent/cost'
import { composeDeterministicBrief, profileForRole } from '../../../../../../lib/agent/degraded'
import { messageForReason } from '../../../../../../lib/agent/client'
import { agentEnv, agentMode } from '../../../../../../lib/agent/env'
import { baseHeaders, errorResponse, methodNotAllowed, newRequestId } from '../../../../../../lib/agent/http'
import type { RoleProfileId } from '../../../../../../lib/corpus/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

export async function GET(
  _request: Request,
  context: { params: Promise<{ role: string }> },
): Promise<Response> {
  const requestId = newRequestId()
  const { role } = await context.params

  if (!isRoleId(role)) {
    return errorResponse(
      requestId,
      404,
      'not_found',
      'There is no pre-built brief for that role.',
      { field: 'role' },
    )
  }

  const started = Date.now()
  let envelope: BriefEnvelope

  try {
    const file = cannedBrief(role)
    if (file.provenance.corpusVersion !== CORPUS_VERSION) throw new Error('stale')
    envelope = {
      ok: true,
      request_id: requestId,
      degraded: true,
      reason: 'prebuilt',
      message: `${messageForReason('prebuilt')} ${provenanceSentence(file.provenance)}`,
      brief: file.brief,
      coverage: file.coverage,
      guardrails: file.guardrails,
      trace: [
        {
          stage: 'retrieve',
          status: 'ok',
          ms: 0,
          detail: `pre-built against ${file.provenance.corpusSize} evidence records`,
        },
        {
          stage: 'generate',
          status: 'skipped',
          ms: 0,
          detail:
            file.provenance.composer === 'live-model'
              ? `built by the agent on ${file.provenance.builtAt.slice(0, 10)} and stored`
              : `assembled from the records by this site's own retriever on ${file.provenance.builtAt.slice(0, 10)}`,
        },
        {
          stage: 'factcheck',
          status: 'ok',
          ms: 0,
          detail: `${file.provenance.guardrailTotal} statements changed by the check when it was built`,
        },
        {
          stage: 'render',
          status: 'ok',
          ms: Math.max(0, Date.now() - started),
          detail: `${file.brief.requirements.length} requirements`,
        },
      ],
      telemetry: {
        model: null,
        runtime: 'nodejs',
        region: agentEnv().region,
        mode: agentMode(),
        corpus_version: CORPUS_VERSION,
        corpus_size: CORPUS_SIZE,
        retrieved: CORPUS_SIZE,
        surfaced: 0,
        ranking: [],
        tool_calls: [],
        usage: zeroUsage(),
        cost_usd: 0,
        ms: Math.max(0, Date.now() - started),
      },
    }
  } catch {
    const composed = composeDeterministicBrief(profileForRole(role) as RoleProfileId)
    envelope = {
      ok: true,
      request_id: requestId,
      degraded: true,
      reason: 'prebuilt',
      message:
        `${messageForReason('prebuilt')} Composed just now, directly from the same evidence records ` +
        "by this site's own retriever — no model wrote it — and it passed the same checks.",
      brief: composed.brief,
      coverage: composed.coverage,
      guardrails: composed.guardrails,
      trace: [
        {
          stage: 'retrieve',
          status: 'ok',
          ms: 0,
          detail: `${CORPUS_SIZE} evidence records ranked`,
        },
        {
          stage: 'generate',
          status: 'skipped',
          ms: 0,
          detail: "assembled from the records by this site's own retriever; no model call",
        },
        { stage: 'factcheck', status: 'ok', ms: 0, detail: composed.detail },
        {
          stage: 'render',
          status: 'ok',
          ms: Math.max(0, Date.now() - started),
          detail: `${composed.brief.requirements.length} requirements`,
        },
      ],
      telemetry: {
        model: null,
        runtime: 'nodejs',
        region: agentEnv().region,
        mode: agentMode(),
        corpus_version: CORPUS_VERSION,
        corpus_size: CORPUS_SIZE,
        retrieved: CORPUS_SIZE,
        surfaced: 0,
        ranking: [],
        tool_calls: [],
        usage: zeroUsage(),
        cost_usd: 0,
        ms: Math.max(0, Date.now() - started),
      },
    }
  }

  return new Response(JSON.stringify(envelope), {
    status: 200,
    headers: { ...baseHeaders(requestId), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function POST(): Response {
  return methodNotAllowed('GET')
}
