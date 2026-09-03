/**
 * lib/agent/http.ts — the request/response plumbing every agent route shares.
 *
 * THE ONE RULE WORTH STATING TWICE: status codes are decided BEFORE the stream
 * opens. Once a byte has been sent the status is 200 and cannot change, so
 * every pre-stream failure (bad JSON, schema, payload size, rate limit, daily
 * ceiling) returns an ordinary JSON error envelope with its real status, and
 * every in-stream failure degrades to a pre-built brief inside a 200. The panel
 * is written to that split: it reads `res.status` for the first kind and the
 * `brief` event for the second, and never the other way round.
 *
 * There is deliberately no 502, 503 or 504 anywhere in this agent. A recruiter
 * is not an SRE, and an upstream failure that renders as a 503 is a broken page
 * no matter how correct the status code is.
 */

import { randomUUID } from 'node:crypto'

import type { ErrorCode, ErrorEnvelope } from './contracts'
import { MAX_BODY_BYTES } from './contracts'
import type { RunEvent } from './run'

export function newRequestId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12)
}

export function baseHeaders(requestId: string): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
    'X-Robots-Tag': 'noindex, nofollow',
  }
}

export function errorResponse(
  requestId: string,
  status: number,
  code: ErrorCode,
  message: string,
  options: { field?: string | null; retryAfter?: number | null } = {},
): Response {
  const body: ErrorEnvelope = {
    ok: false,
    request_id: requestId,
    error: { code, message, field: options.field ?? null },
    retry_after: options.retryAfter ?? null,
  }
  const headers: Record<string, string> = {
    ...baseHeaders(requestId),
    'Content-Type': 'application/json; charset=utf-8',
  }
  if (options.retryAfter) headers['Retry-After'] = String(options.retryAfter)
  return new Response(JSON.stringify(body), { status, headers })
}

export function wantsStream(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('text/event-stream')
}

export interface ReadBodyResult {
  ok: boolean
  value?: unknown
  response?: Response
}

/**
 * Read and parse the body, refusing anything oversized BEFORE a model call can
 * be made. The size check reads the declared length first and then the actual
 * bytes, because a `Content-Length` header is a claim and not a measurement.
 */
export async function readJsonBody(request: Request, requestId: string): Promise<ReadBodyResult> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return {
      ok: false,
      response: errorResponse(
        requestId,
        415,
        'unsupported_media_type',
        'Send application/json.',
      ),
    }
  }

  const declared = Number.parseInt(request.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, response: tooLarge(requestId) }
  }

  let text: string
  try {
    text = await request.text()
  } catch {
    return {
      ok: false,
      response: errorResponse(requestId, 400, 'invalid_json', 'The request body could not be read.'),
    }
  }

  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, response: tooLarge(requestId) }
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return {
      ok: false,
      response: errorResponse(requestId, 400, 'invalid_json', 'The request body is not valid JSON.'),
    }
  }
}

function tooLarge(requestId: string): Response {
  return errorResponse(
    requestId,
    413,
    'payload_too_large',
    'That is larger than any job description. Paste the requirements section.',
  )
}

/* ── Server-Sent Events ────────────────────────────────────────────────────── */

const encoder = new TextEncoder()

function frame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/**
 * Turn the run generator into an SSE body.
 *
 * A keepalive comment goes out every ten seconds while a model turn is in
 * flight, so no intermediate proxy times the connection out mid-run. Without
 * it, a p95 run on a mobile network is indistinguishable from a hang — and a
 * hang is what a recruiter reads as a broken site.
 */
export function sseResponse(
  requestId: string,
  events: AsyncGenerator<RunEvent, void>,
  signal: AbortSignal,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          /* the consumer went away; the loop below will notice */
        }
      }, 10_000)

      try {
        for await (const ev of events) {
          if (signal.aborted) break
          controller.enqueue(frame(ev.event, ev.data))
        }
      } catch (err) {
        // The generator guarantees a brief before it ends, so reaching here
        // means something outside it failed. Say so in a frame the panel can
        // render rather than tearing the connection down silently.
        controller.enqueue(
          frame('error', {
            code: 'internal_error',
            message: 'The run ended unexpectedly. Reload the page and try once more.',
          }),
        )
        void err
      } finally {
        clearInterval(keepalive)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      ...baseHeaders(requestId),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Tells a buffering proxy to pass bytes through as they arrive. Without
      // it the whole point of streaming progress is silently lost behind one.
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}

/**
 * The same generator, drained to the final envelope.
 *
 * This is what `curl` gets, what the contract tests exercise, and what a client
 * behind a proxy that strips SSE gets. ONE code path produces both answers, so
 * they cannot disagree.
 */
export async function jsonResponse(
  requestId: string,
  events: AsyncGenerator<RunEvent, void>,
): Promise<Response> {
  let payload: unknown = null
  for await (const ev of events) {
    if (ev.event === 'brief' || ev.event === 'answer') payload = ev.data
  }
  if (payload === null) {
    return errorResponse(
      requestId,
      500,
      'internal_error',
      'The run produced no result. This is a bug; please tell the site owner.',
    )
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...baseHeaders(requestId), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function methodNotAllowed(allowed: string): Response {
  const requestId = newRequestId()
  const response = errorResponse(
    requestId,
    405,
    'method_not_allowed',
    `Use ${allowed} on this endpoint.`,
  )
  response.headers.set('Allow', allowed)
  return response
}
