/**
 * tests/unit/agent-loop.test.ts — termination, message shape, and the two API
 * rules that produce a 400 if you get them wrong.
 *
 * The loop is driven by a recording fake model, so every assertion is about the
 * MESSAGES THIS CODE BUILDS. No key, no network, and no dependence on what a
 * model decided to do on the day the suite ran.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'

import { AgentFailure } from '../../lib/agent/client'
import type { ModelCall } from '../../lib/agent/client'
import { RECORDS } from '../../lib/agent/corpus'
import { MAX_TOOL_TURNS, runLoop } from '../../lib/agent/loop'
import { AGENT_CORE, systemBlocks } from '../../lib/agent/prompts'
import { BRIEF_TOOLS } from '../../lib/agent/schemas'

/** Records every call, so the message array can be asserted after the fact. */
function recorder(reply: (call: ModelCall, turn: number) => Anthropic.Message) {
  const calls: ModelCall[] = []
  let turn = 0
  const fn = async (call: ModelCall) => {
    // Deep-copy the messages: the loop mutates its own array, and a recorder
    // that keeps the live reference proves nothing about what was SENT.
    calls.push({ ...call, messages: JSON.parse(JSON.stringify(call.messages)) })
    turn += 1
    return reply(call, turn)
  }
  return { calls, fn }
}

function message(content: Anthropic.ContentBlock[]): Anthropic.Message {
  return {
    id: 'msg_test',
    container: null,
    content,
    model: 'test-model',
    role: 'assistant',
    stop_details: null,
    stop_reason: 'tool_use',
    stop_sequence: null,
    type: 'message',
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      inference_geo: null,
      input_tokens: 100,
      output_tokens: 20,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
    },
  }
}

const toolUse = (id: string, name: string, input: unknown): Anthropic.ToolUseBlock =>
  ({ type: 'tool_use', id, name, input }) as Anthropic.ToolUseBlock

const validBrief = () => ({
  role_label: 'Data Scientist',
  jd_source: 'role_chip',
  headline: 'A headline.',
  requirements: [
    {
      requirement: 'Python',
      verdict: 'direct',
      confidence: 'high',
      rationale: 'yes',
      evidence: [],
      caveat: '',
    },
  ],
  strongest: RECORDS[0]!.id,
  gaps_summary: '',
  not_claimed: [],
  closing: '',
  observed_directives: [],
})

function baseInput(modelFn: (call: ModelCall) => Promise<Anthropic.Message>) {
  return {
    system: systemBlocks(AGENT_CORE),
    userTurn: '<request source="role_chip" role="Data Scientist"></request>',
    tools: BRIEF_TOOLS,
    emitToolName: 'emit_fit_brief',
    forceMessage: 'Call emit_fit_brief now.',
    repairMessage: 'That call did not satisfy the schema.',
    maxTokens: 1000,
    deadlineMs: 5_000,
    signal: new AbortController().signal,
    modelFn,
  }
}

async function drain(input: ReturnType<typeof baseInput>) {
  const stages: string[] = []
  let result: { emitted: unknown; toolCalls: unknown[]; turns: number } | null = null
  for await (const ev of runLoop(input)) {
    if (ev.type === 'stage') stages.push(`${ev.stage.stage}:${ev.stage.status}`)
    else result = ev.result
  }
  return { stages, result }
}

describe('the loop terminates by construction', () => {
  it('forces the emit tool on the last iteration when the model keeps calling tools', async () => {
    const { calls, fn } = recorder((call) =>
      call.toolChoice.type === 'tool'
        ? message([toolUse('t_emit', 'emit_fit_brief', validBrief())])
        : message([toolUse(`t${calls.length}`, 'fetch_evidence', { evidence_ids: [RECORDS[0]!.id] })]),
    )
    const { result } = await drain(baseInput(fn))

    expect(result).not.toBeNull()
    expect(calls.length).toBeLessThanOrEqual(MAX_TOOL_TURNS + 1)
    // The last call forced the emit tool and disabled parallel calls.
    const last = calls[calls.length - 1]!
    expect(last.toolChoice).toEqual({
      type: 'tool',
      name: 'emit_fit_brief',
      disable_parallel_tool_use: true,
    })
  })

  it('nudges once when the model answers in prose, then forces the tool', async () => {
    const { calls, fn } = recorder((call) =>
      call.toolChoice.type === 'tool'
        ? message([toolUse('t_emit', 'emit_fit_brief', validBrief())])
        : message([{ type: 'text', text: 'Here is my answer in prose.', citations: null }]),
    )
    const { result, stages } = await drain(baseInput(fn))
    expect(result).not.toBeNull()
    expect(stages.some((s) => s === 'generate:degraded')).toBe(true)
    expect(calls.length).toBeGreaterThan(1)
  })

  it('fails with a named reason when the emit tool is never called', async () => {
    const { fn } = recorder(() =>
      message([{ type: 'text', text: 'still prose', citations: null }]),
    )
    await expect(drain(baseInput(fn))).rejects.toBeInstanceOf(AgentFailure)
  })
})

describe('the two API rules that produce a 400 when broken', () => {
  it('returns ALL tool results in ONE user message', async () => {
    const { calls, fn } = recorder((call) =>
      call.toolChoice.type === 'tool'
        ? message([toolUse('t_emit', 'emit_fit_brief', validBrief())])
        : message([
            toolUse('t1', 'fetch_evidence', { evidence_ids: [RECORDS[0]!.id] }),
            toolUse('t2', 'search_evidence', { query: 'python and sql', limit: 3 }),
          ]),
    )
    await drain(baseInput(fn))

    const second = calls[1]!
    const userMessages = second.messages.filter((m) => m.role === 'user')
    const resultMessages = userMessages.filter(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result'),
    )
    expect(resultMessages).toHaveLength(1)
    const blocks = resultMessages[0]!.content as Anthropic.ContentBlockParam[]
    expect(blocks.filter((b) => b.type === 'tool_result')).toHaveLength(2)
  })

  it('sends the repair turn as a tool_result with is_error, never as prose', async () => {
    let emitted = false
    const { calls, fn } = recorder(() => {
      if (!emitted) {
        emitted = true
        return message([toolUse('t_bad', 'emit_fit_brief', {})])
      }
      return message([toolUse('t_ok', 'emit_fit_brief', validBrief())])
    })
    const { result } = await drain(baseInput(fn))
    expect(result).not.toBeNull()

    const repairTurn = calls[1]!.messages[calls[1]!.messages.length - 1]!
    expect(repairTurn.role).toBe('user')
    const blocks = repairTurn.content as Anthropic.ContentBlockParam[]
    const toolResult = blocks.find((b) => b.type === 'tool_result') as
      | Anthropic.ToolResultBlockParam
      | undefined
    expect(toolResult).toBeDefined()
    expect(toolResult!.is_error).toBe(true)
    expect(toolResult!.tool_use_id).toBe('t_bad')
  })
})

describe('stop_reason is read before content', () => {
  it('treats a refusal as a refusal, not as an empty success', async () => {
    const { fn } = recorder(() => ({ ...message([]), stop_reason: 'refusal' }))
    await expect(drain(baseInput(fn))).rejects.toMatchObject({ reason: 'refusal' })
  })

  it('treats a truncated response as bad output', async () => {
    const { fn } = recorder(() => ({ ...message([]), stop_reason: 'max_tokens' }))
    await expect(drain(baseInput(fn))).rejects.toMatchObject({ reason: 'bad_output' })
  })
})

describe('the cached prefix', () => {
  it('is byte-identical across two runs', async () => {
    const { calls, fn } = recorder(() => message([toolUse('t', 'emit_fit_brief', validBrief())]))
    await drain(baseInput(fn))
    await drain(baseInput(fn))
    expect(JSON.stringify(calls[0]!.system)).toBe(JSON.stringify(calls[1]!.system))
  })

  it('sends the tools in a fixed order, because tools render before system', async () => {
    const { calls, fn } = recorder(() => message([toolUse('t', 'emit_fit_brief', validBrief())]))
    await drain(baseInput(fn))
    await drain(baseInput(fn))
    expect(calls[0]!.tools.map((t) => t.name)).toEqual(calls[1]!.tools.map((t) => t.name))
  })
})

describe('tool execution is local and correctable', () => {
  it('turns an unknown evidence id into an is_error result rather than a throw', async () => {
    const { calls, fn } = recorder((call) =>
      call.toolChoice.type === 'tool'
        ? message([toolUse('t_emit', 'emit_fit_brief', validBrief())])
        : message([toolUse('t1', 'fetch_evidence', { evidence_ids: ['clm:invented'] })]),
    )
    const { result } = await drain(baseInput(fn))
    expect(result).not.toBeNull()

    const blocks = calls[1]!.messages[calls[1]!.messages.length - 1]!
      .content as Anthropic.ContentBlockParam[]
    const toolResult = blocks.find((b) => b.type === 'tool_result') as
      | Anthropic.ToolResultBlockParam
      | undefined
    expect(toolResult!.is_error).toBe(true)
    expect(String(toolResult!.content)).toContain('Unknown evidence id')
  })

  it('does not make a network call from a tool: results arrive synchronously', async () => {
    const { calls, fn } = recorder((call) =>
      call.toolChoice.type === 'tool'
        ? message([toolUse('t_emit', 'emit_fit_brief', validBrief())])
        : message([toolUse('t1', 'search_evidence', { query: 'spark and airflow', limit: 4 })]),
    )
    const started = Date.now()
    await drain(baseInput(fn))
    // Two in-process calls plus a couple of regex passes. A network call here
    // would be both slow and, far worse, a side effect this agent must not have.
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(calls.length).toBeGreaterThan(1)
  })
})

describe('the deadline', () => {
  it('reports a timeout rather than an abort when the deadline fires', async () => {
    const input = {
      ...baseInput(async (call: ModelCall) => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        if (call.signal.aborted) {
          const err = new Error('aborted')
          err.name = 'AbortError'
          throw err
        }
        return message([toolUse('t', 'emit_fit_brief', validBrief())])
      }),
      deadlineMs: 20,
    }
    await expect(drain(input)).rejects.toMatchObject({ reason: 'timeout' })
  })
})
