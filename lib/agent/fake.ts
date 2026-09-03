/**
 * lib/agent/fake.ts — a deterministic stand-in for the model.
 *
 * Selected by `AGENT_FAKE_MODEL=1`, refused outright in a production deploy
 * (see env.ts). It is the analogue of the Python evaluation package's
 * `FakeJudge`, and it exists for one reason: without it, the LIVE path — the
 * tool loop, parallel tool results, the repair turn, the fact check, the
 * envelope, the stream — would only ever execute in production, against a real
 * key, in front of a real recruiter.
 *
 * It is not a mock of the transport. It is a model that always behaves: it
 * calls a tool on its first turn, then emits a schema-valid brief assembled
 * from the same corpus the real model would have been given. Everything
 * downstream of `messages.create` runs for real.
 *
 * It reports a plausible token usage because the telemetry path has to be
 * exercised too. That number is only ever produced under an explicit test-only
 * environment variable, and it never reaches a deployed page.
 */

import type Anthropic from '@anthropic-ai/sdk'

import { ROLE_PROFILES } from '../corpus/index'
import type { RoleProfileId } from '../corpus/types'
import type { ModelCall, ModelFn } from './client'
import { composeRawBrief } from './degraded'
import { artifactLabelFor, artifactUrlFor, recordById } from './corpus'
import { norm } from './postcheck'

let counter = 0

/** Deterministic ids, so a recorded transcript diffs cleanly between runs. */
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}_fake_${counter}`
}

/** Tests that assert on ids reset the counter first. */
export function resetFakeModel(): void {
  counter = 0
}

const ROLE_LABEL = /<request source="([a-z_]+)" role="([^"]*)">/
const RECORD_ID = /<evidence id="([^"]+)"/g
const FENCED_JD = /<untrusted source="job-description">\n([\s\S]*?)\n<\/untrusted>/

/**
 * The fenced posting, read back out of the constructed turn.
 *
 * A well-behaved model reads the posting and answers it; a stand-in that ignores
 * it would make every test of the live path a test of the role-profile path, and
 * the one case that matters most — a paste with no role in it — would never be
 * exercised. So the stand-in reads the fence, exactly like the thing it stands
 * in for. It reads it as DATA: the text goes to the composer as a query string
 * and nothing in it is ever executed or obeyed.
 */
function fencedJd(text: string): string | undefined {
  const match = FENCED_JD.exec(text)
  return match?.[1]?.trim() || undefined
}

function profileFromTurn(text: string): RoleProfileId {
  const match = ROLE_LABEL.exec(text)
  const label = match?.[2] ?? ''
  const found = ROLE_PROFILES.find((p) => p.label.toLowerCase() === label.toLowerCase())
  return (found ?? ROLE_PROFILES[0]!).id
}

function shortlistIds(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(RECORD_ID)) {
    const id = m[1]
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

function firstUserText(messages: readonly Anthropic.MessageParam[]): string {
  const first = messages[0]
  if (!first) return ''
  if (typeof first.content === 'string') return first.content
  return first.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
}

function usage(input: number, output: number, cached: number): Anthropic.Usage {
  return {
    cache_creation: null,
    cache_creation_input_tokens: cached === 0 ? 4200 : 0,
    cache_read_input_tokens: cached,
    inference_geo: null,
    input_tokens: input,
    output_tokens: output,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
  }
}

function message(content: Anthropic.ContentBlock[], u: Anthropic.Usage): Anthropic.Message {
  return {
    id: nextId('msg'),
    container: null,
    content,
    model: 'fake-deterministic',
    role: 'assistant',
    stop_details: null,
    stop_reason: 'tool_use',
    stop_sequence: null,
    type: 'message',
    usage: u,
  }
}

/**
 * Turn 1 calls `fetch_evidence` on two shortlist ids — so the parallel
 * tool-result path, the trace row and the tool-call telemetry all run. Turn 2
 * emits the brief.
 *
 * The emitted brief is the deterministic composition, with one deliberate
 * difference: the QUOTES are taken from the records the fake "fetched", which
 * is what a well-behaved model would do, so the verbatim check in postcheck is
 * doing real work rather than trivially passing.
 */
export const fakeModelCall: ModelFn = async (call: ModelCall) => {
  const turnText = firstUserText(call.messages)
  const alreadyFetched = call.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result'),
  )
  const forced = call.toolChoice.type === 'tool'
  const emitName = call.tools[call.tools.length - 1]?.name ?? 'emit_fit_brief'

  if (!alreadyFetched && !forced) {
    const ids = shortlistIds(turnText).slice(0, 2)
    if (ids.length) {
      return message(
        [
          {
            type: 'tool_use',
            id: nextId('toolu'),
            name: 'fetch_evidence',
            input: { evidence_ids: ids },
          } as Anthropic.ToolUseBlock,
        ],
        usage(8600, 180, 0),
      )
    }
  }

  if (emitName === 'emit_answer') {
    const id = shortlistIds(turnText)[0]
    const record = id ? recordById(id) : undefined
    const answer = record
      ? {
          answer: record.statement,
          citations: [
            {
              evidence_id: record.id,
              quoted_claim: norm(record.short).length >= 12 ? record.short : record.statement,
              artifact_label: artifactLabelFor(record),
              artifact_url: artifactUrlFor(record),
            },
          ],
          confidence: 'medium',
          refused_reason: '',
          observed_directives: [],
        }
      : {
          answer:
            'That is not something this site has a record for. dnguyen44@seattleu.edu is the fastest way to ask Duy directly.',
          citations: [],
          confidence: 'low',
          refused_reason: 'not_in_corpus',
          observed_directives: [],
        }
    return message(
      [
        {
          type: 'tool_use',
          id: nextId('toolu'),
          name: 'emit_answer',
          input: answer,
        } as Anthropic.ToolUseBlock,
      ],
      usage(1200, 320, 4200),
    )
  }

  const brief = composeRawBrief(profileFromTurn(turnText), { jdText: fencedJd(turnText) })
  return message(
    [
      {
        type: 'tool_use',
        id: nextId('toolu'),
        name: 'emit_fit_brief',
        input: brief,
      } as Anthropic.ToolUseBlock,
    ],
    usage(2400, 1300, 4200),
  )
}
