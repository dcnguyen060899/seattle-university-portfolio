/**
 * POST /api/agent/qa — one short question, one cited answer.
 *
 * The path is exact: `vercel.json` declares a function for
 * `app/api/agent/qa/route.ts`.
 *
 * The whole reason this endpoint is separate from the brief is the history
 * field. The page echoes previous answers back to the server, so history is
 * CLIENT-CONTROLLED text — and it is fenced as `<previous_turn>` data inside
 * the current user turn, never replayed as an `assistant` message. A forged
 * answer must be something the model reads and can disbelieve, not something it
 * believes it wrote. `tests/unit/agent-injection.test.ts` asserts that on the
 * constructed messages array, which is the only place the property is real.
 */

import { qaRequestSchema } from '../../../../lib/agent/contracts'
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
import { DailyCounter, clientKey, qaLimiter } from '../../../../lib/agent/ratelimit'
import { runQaEvents } from '../../../../lib/agent/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const dailyQa = new DailyCounter(agentEnv().dailyQaCeiling)

export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId()

  const body = await readJsonBody(request, requestId)
  if (!body.ok) return body.response as Response

  const parsed = qaRequestSchema.safeParse(body.value)
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
  const decision = qaLimiter.take(key)
  if (!decision.allowed) {
    return errorResponse(
      requestId,
      429,
      'rate_limited',
      `That is several questions in a short time. Try again in ${decision.retryAfter} seconds.`,
      { retryAfter: decision.retryAfter },
    )
  }

  if (!dailyQa.tryConsume()) {
    return errorResponse(
      requestId,
      429,
      'daily_ceiling',
      `Questions are capped at ${agentEnv().dailyQaCeiling} a day on this deploy so a stranger cannot run up a bill. ` +
        'The four pre-built role briefs are always available.',
      { retryAfter: 3600 },
    )
  }

  const events = runQaEvents({
    requestId,
    question: parsed.data.question,
    history: parsed.data.history ?? [],
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
