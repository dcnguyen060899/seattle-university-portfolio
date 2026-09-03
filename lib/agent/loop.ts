/**
 * lib/agent/loop.ts — the tool-use loop. Written out because the TERMINATION
 * GUARANTEES are the point, not the plumbing.
 *
 * Termination is guaranteed by construction, three ways at once:
 *   1. at most MAX_TOOL_TURNS + 1 iterations, counted;
 *   2. the last iteration FORCES the emit tool via `tool_choice`;
 *   3. the whole run is inside an AbortController on a deadline that sits
 *      inside the platform's own function limit, so the function always
 *      finishes on its own terms rather than being killed mid-response.
 * There is no path that spins.
 *
 * FOUR THINGS THAT LOOK LIKE STYLE AND ARE NOT (spec-04 §9):
 *
 *   stop_reason is checked BEFORE response.content is read. A refusal is an
 *   HTTP 200 with empty or partial content; indexing into it looks like
 *   success and produces a brief with nothing in it.
 *
 *   Parallel tool_use blocks produce ONE user message with ALL tool_result
 *   blocks. Splitting them across messages silently teaches the model to stop
 *   calling tools in parallel, which shows up later as latency nobody can
 *   explain.
 *
 *   The repair turn is a tool_result with is_error: true and the MATCHING
 *   tool_use_id, never prose. An assistant turn holding a tool_use requires the
 *   next message to carry a matching tool_result, or the API rejects the whole
 *   request with "tool_use ids were found without tool_result blocks".
 *
 *   Nothing volatile enters the system blocks. They are built once, outside
 *   this file, from frozen data.
 */

import type Anthropic from '@anthropic-ai/sdk'

import { AgentFailure } from './client'
import type { ModelFn } from './client'
import type { AgentUsage, TraceStage } from './contracts'
import { accumulate, zeroUsage } from './cost'
import { assertToolsetIsSafe } from './schemas'
import { runLocalTool } from './tools'

export const MAX_TOOL_TURNS = 3
export const MAX_TOOL_CALLS = 6

export interface ToolCallTrace {
  name: string
  args_summary: string
  ms: number
}

export interface LoopInput {
  system: Anthropic.TextBlockParam[]
  userTurn: string
  tools: readonly Anthropic.Tool[]
  emitToolName: string
  forceMessage: string
  repairMessage: string
  maxTokens: number
  deadlineMs: number
  signal: AbortSignal
  modelFn: ModelFn
}

export interface LoopResult {
  /** The raw `tool_use.input` from the emit tool. Unvalidated: postcheck owns that. */
  emitted: unknown
  usage: AgentUsage
  toolCalls: ToolCallTrace[]
  turns: number
  modelMs: number
  repairAttempted: boolean
}

export type LoopEvent =
  | { type: 'stage'; stage: TraceStage }
  | { type: 'result'; result: LoopResult }

const isToolUse = (b: Anthropic.ContentBlock): b is Anthropic.ToolUseBlock => b.type === 'tool_use'

/**
 * Runs the loop, yielding a stage row after each model turn so the page can
 * show progress that is REAL. Progress rows that are real are better UX and are
 * also the deliverable: the disclosure panel renders exactly these.
 */
export async function* runLoop(input: LoopInput): AsyncGenerator<LoopEvent, void> {
  assertToolsetIsSafe(input.tools)

  const controller = new AbortController()
  const abort = () => controller.abort()
  const deadline = setTimeout(() => controller.abort(), input.deadlineMs)
  input.signal.addEventListener('abort', abort)

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: input.userTurn }]
  const usage = zeroUsage()
  const toolCalls: ToolCallTrace[] = []
  let turn = 0
  let modelMs = 0
  let repairAttempted = false
  let emitted: unknown = null

  try {
    while (turn < MAX_TOOL_TURNS + 1 && emitted === null) {
      const forceEmit = turn === MAX_TOOL_TURNS || toolCalls.length >= MAX_TOOL_CALLS
      const started = Date.now()

      let response: Anthropic.Message
      try {
        response = await input.modelFn({
          system: input.system,
          messages,
          tools: input.tools,
          toolChoice: forceEmit
            ? { type: 'tool', name: input.emitToolName, disable_parallel_tool_use: true }
            : { type: 'auto' },
          maxTokens: input.maxTokens,
          signal: controller.signal,
        })
      } catch (err) {
        // The deadline fired rather than the client going away: report it as a
        // timeout, which has its own sentence, rather than as an abort.
        if (controller.signal.aborted && !input.signal.aborted) {
          throw new AgentFailure('timeout', 'the run passed its deadline')
        }
        throw err
      }
      modelMs += Date.now() - started

      accumulate(usage, response.usage)

      // BEFORE content. A refusal is a 200 with nothing usable in it.
      if (response.stop_reason === 'refusal') {
        throw new AgentFailure('refusal', 'the model declined this request')
      }
      if (response.stop_reason === 'max_tokens') {
        throw new AgentFailure('bad_output', 'the response hit the token ceiling')
      }

      messages.push({ role: 'assistant', content: response.content })

      const uses = response.content.filter(isToolUse)
      const emit = uses.find((u) => u.name === input.emitToolName)

      if (emit) {
        if (isStructurallyEmpty(emit.input)) {
          if (repairAttempted) {
            throw new AgentFailure('bad_output', 'the emit tool produced nothing usable twice')
          }
          repairAttempted = true
          // A tool_result with is_error, matching the tool_use_id. Not prose.
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: emit.id,
                is_error: true,
                content: input.repairMessage,
              },
            ],
          })
          yield {
            type: 'stage',
            stage: {
              stage: 'generate',
              status: 'degraded',
              ms: Date.now() - started,
              detail: 'the first attempt did not fill the required fields; asked once more',
            },
          }
          turn += 1
          continue
        }
        emitted = emit.input
        yield {
          type: 'stage',
          stage: {
            stage: 'generate',
            status: 'ok',
            ms: Date.now() - started,
            detail: describeTurn(response, usage),
          },
        }
        break
      }

      if (uses.length === 0) {
        // Text with no tool call: the model answered in prose. There is no
        // free-text channel out of this system, so prose is not an answer — one
        // nudge, then the next iteration forces the emit tool.
        if (forceEmit) {
          throw new AgentFailure('bad_output', 'the model produced prose instead of calling the tool')
        }
        messages.push({ role: 'user', content: input.forceMessage })
        yield {
          type: 'stage',
          stage: {
            stage: 'generate',
            status: 'degraded',
            ms: Date.now() - started,
            detail: 'answered in prose rather than through the tool; asked again',
          },
        }
        turn += 1
        continue
      }

      // Execute ALL tool_use blocks and return ALL tool_results in ONE user
      // message. Splitting them trains the model out of parallel calls.
      const results: Anthropic.ToolResultBlockParam[] = []
      const thisTurn: ToolCallTrace[] = []
      for (const use of uses) {
        const callStarted = Date.now()
        const out = runLocalTool(use.name, use.input)
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: out.isError,
          content: out.text,
        })
        thisTurn.push({
          name: use.name,
          args_summary: out.summary,
          ms: Date.now() - callStarted,
        })
      }
      toolCalls.push(...thisTurn)
      messages.push({ role: 'user', content: results })

      yield {
        type: 'stage',
        stage: {
          stage: 'tools',
          status: 'ok',
          ms: Date.now() - started,
          detail: thisTurn.map((c) => `${c.name} (${c.args_summary})`).join(', '),
        },
      }
      turn += 1
    }
  } finally {
    clearTimeout(deadline)
    input.signal.removeEventListener('abort', abort)
  }

  if (emitted === null) {
    throw new AgentFailure('bad_output', 'the loop ended without the emit tool being called')
  }

  yield {
    type: 'result',
    result: { emitted, usage, toolCalls, turns: turn + 1, modelMs, repairAttempted },
  }
}

/** A tool call with no keys, or with every string empty, is not an answer. */
function isStructurallyEmpty(input: unknown): boolean {
  if (input === null || typeof input !== 'object') return true
  const values = Object.values(input as Record<string, unknown>)
  if (values.length === 0) return true
  return values.every((v) => v === '' || v === null || (Array.isArray(v) && v.length === 0))
}

function describeTurn(response: Anthropic.Message, usage: AgentUsage): string {
  const cached = usage.cache_read_input_tokens > 0 ? ', prompt prefix served from cache' : ''
  return `${response.model}, ${usage.input_tokens} in / ${usage.output_tokens} out${cached}`
}
