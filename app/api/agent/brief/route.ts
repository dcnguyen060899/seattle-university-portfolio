/**
 * POST /api/agent/brief — the fit brief.
 *
 * The path is exact and load-bearing: `vercel.json` declares a function for
 * `app/api/agent/brief/route.ts` with its own duration and memory. Moving this
 * file silently drops that configuration.
 *
 * ORDER OF OPERATIONS, and every step of it is a refusal that happens BEFORE a
 * token can be spent:
 *
 *   1. method, content type, body size          413/415 with zero model calls
 *   2. JSON parse and schema                    400, with the offending field named
 *   3. per-IP token bucket                      429 + a correct Retry-After
 *   4. per-instance daily ceiling               429, and the pre-built briefs offered
 *   5. only now, the run
 *
 * Everything above the line returns a JSON error envelope with a real status.
 * Everything below it returns 200 and degrades, because once a byte of the
 * stream has gone out the status cannot change. A rate limit is never a dead
 * end: the response names the four pre-built briefs, which need no model at all.
 */

import { briefRequestSchema } from '../../../../lib/agent/contracts'
import { ROLE_IDS } from '../../../../lib/agent/contracts'
import { agentEnv } from '../../../../lib/agent/env'
import {
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  newRequestId,
  readJsonBody,
  sseResponse,
  wantsStream,
} from '../../../../lib/agent/http'
import { DailyCounter, briefLimiter, clientKey } from '../../../../lib/agent/ratelimit'
import { runBriefEvents } from '../../../../lib/agent/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Per instance, reset on the UTC date change. Not a fleet-wide ceiling and not
 * a spend control — the prepaid balance is the spend control. This stops one
 * warm instance running a bill up overnight, which is a different and smaller
 * job, and the runbook says so in those words.
 */
const dailyBriefs = new DailyCounter(agentEnv().dailyBriefCeiling)

const CANNED_LINKS = ROLE_IDS.map((r) => `/api/agent/brief/canned/${r}`).join(', ')

export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId()

  const body = await readJsonBody(request, requestId)
  if (!body.ok) return body.response as Response

  const parsed = briefRequestSchema.safeParse(body.value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return errorResponse(
      requestId,
      400,
      'invalid_request',
      issue?.message ?? 'The request did not match the expected shape.',
      { field: issue?.path?.[0] != null ? String(issue.path[0]) : null },
    )
  }

  const key = clientKey(request.headers)
  const decision = briefLimiter.take(key)
  if (!decision.allowed) {
    return errorResponse(
      requestId,
      429,
      'rate_limited',
      `You have run several briefs in the last few minutes. Try again in ${decision.retryAfter} seconds — ` +
        `or read the four pre-built role briefs, which need no model at all: ${CANNED_LINKS}`,
      { retryAfter: decision.retryAfter },
    )
  }

  if (!dailyBriefs.tryConsume()) {
    return errorResponse(
      requestId,
      429,
      'daily_ceiling',
      `The live agent is capped at ${agentEnv().dailyBriefCeiling} briefs a day so a stranger cannot run up a bill. ` +
        `The four pre-built role briefs are always available: ${CANNED_LINKS}`,
      { retryAfter: 3600 },
    )
  }

  const events = runBriefEvents({
    requestId,
    role: parsed.data.role ?? null,
    jd: parsed.data.jd ?? '',
    signal: request.signal,
    ip: key,
  })

  return wantsStream(request)
    ? sseResponse(requestId, events, request.signal)
    : jsonResponse(requestId, events)
}

export function GET(): Response {
  return methodNotAllowed('POST')
}
