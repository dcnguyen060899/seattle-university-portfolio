/**
 * lib/agent/tools.ts — the two local tools.
 *
 * BOTH ARE PURE IN-PROCESS FUNCTIONS OVER THE FROZEN CORPUS. Neither makes a
 * network call, touches a filesystem, or writes anything. That is what makes
 * the injection argument in schemas.ts true rather than aspirational: there is
 * no side effect available to cause.
 *
 * Tool results are TEXT, not JSON objects, because the result is prose the
 * model reads. The `<verbatim>` elements inside are the strings `quoted_claim`
 * must copy, given their own elements so that "copy this" is structural.
 *
 * A bad id returns `is_error: true` with a sentence naming what to do instead.
 * That is a real self-correction path and the adversarial tests exercise it —
 * throwing would turn a recoverable mistake into a degraded run.
 */

import { renderFullRecord, recordById } from './corpus'
import { scoreQuery } from './retrieval'

export interface LocalToolResult {
  text: string
  isError: boolean
  /** One short phrase for the trace row and the log line. Never the query text. */
  summary: string
}

const MAX_FETCH_IDS = 8
const MAX_SEARCH_LIMIT = 8

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

export function runSearchEvidence(input: unknown): LocalToolResult {
  const record = (input ?? {}) as Record<string, unknown>
  const query = asString(record.query).trim()
  const rawLimit = typeof record.limit === 'number' ? record.limit : MAX_SEARCH_LIMIT
  const limit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.trunc(rawLimit)))

  if (query.length < 3) {
    return {
      isError: true,
      summary: 'empty query',
      text: 'search_evidence needs a query of at least 3 characters describing one requirement.',
    }
  }

  const ranked = scoreQuery(query, limit)
  if (!ranked.length) {
    return {
      isError: false,
      summary: `0 hits`,
      text:
        '<search_results count="0">\n' +
        'No record on this site cleared the relevance floor for that requirement. That is a result, ' +
        'not a failure: mark the requirement no_evidence, name the nearest thing without implying it ' +
        'counts, and cite nothing.\n' +
        '</search_results>',
    }
  }

  const lines = [`<search_results count="${ranked.length}">`]
  for (const item of ranked) {
    lines.push(
      `<hit id="${item.record.id}" score="${item.score}" via="${item.via}" strength="${item.record.evidenceStrength}" matched="${item.matched.join(', ')}">` +
        `${item.record.short}</hit>`,
    )
  }
  lines.push('Call fetch_evidence for anything you intend to cite.')
  lines.push('</search_results>')

  return { isError: false, summary: `${ranked.length} hits`, text: lines.join('\n') }
}

export function runFetchEvidence(input: unknown): LocalToolResult {
  const record = (input ?? {}) as Record<string, unknown>
  const ids = asIdArray(record.evidence_ids).slice(0, MAX_FETCH_IDS)

  if (!ids.length) {
    return {
      isError: true,
      summary: 'no ids',
      text: 'fetch_evidence needs between 1 and 8 evidence ids from <corpus_index>.',
    }
  }

  const found: string[] = []
  const missing: string[] = []
  for (const id of ids) {
    const rec = recordById(id)
    if (!rec) {
      missing.push(id)
      continue
    }
    found.push(renderFullRecord(rec))
  }

  if (!found.length) {
    return {
      isError: true,
      summary: `${missing.length} unknown`,
      text:
        `Unknown evidence id${missing.length > 1 ? 's' : ''} ${missing.map((m) => `"${m}"`).join(', ')}. ` +
        'Valid ids are listed in <corpus_index>. Do not invent one.',
    }
  }

  const lines = [...found]
  if (missing.length) {
    lines.push(
      `<unknown>${missing.map((m) => `"${m}"`).join(', ')} — not in <corpus_index>; do not cite them.</unknown>`,
    )
  }
  return {
    isError: false,
    summary: `${found.length} record${found.length === 1 ? '' : 's'}`,
    text: lines.join('\n'),
  }
}

/** Dispatch. An unknown tool name is an error result, never a throw. */
export function runLocalTool(name: string, input: unknown): LocalToolResult {
  switch (name) {
    case 'search_evidence':
      return runSearchEvidence(input)
    case 'fetch_evidence':
      return runFetchEvidence(input)
    default:
      return {
        isError: true,
        summary: `unknown tool ${name}`,
        text: `There is no tool called "${name}". The tools available to you are search_evidence, fetch_evidence and the emit tool for this run.`,
      }
  }
}
