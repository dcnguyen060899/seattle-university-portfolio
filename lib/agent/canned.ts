/**
 * lib/agent/canned.ts — the four pre-built briefs, and what may be said about
 * them.
 *
 * They are STATIC IMPORTS, not a runtime `fs.readFile`. Three reasons, in
 * order: the bundler traces them into the deployed function so they cannot go
 * missing on a platform that prunes unreferenced files; they work unchanged in
 * a unit test with no filesystem; and a missing file becomes a build error
 * rather than a 500 in front of a recruiter.
 *
 * THE PROVENANCE FIELD IS NOT DECORATION. The run strip says something specific
 * about where a pre-built brief came from, and it must not say the model wrote
 * it when the model did not. `provenance.composer` is the field that decides
 * which sentence renders, and `scripts/build-canned.mjs` is the only thing that
 * writes it.
 */

import dataEngineer from '../../data/corpus/canned/data-engineer.json'
import dataScientist from '../../data/corpus/canned/data-scientist.json'
import mlEngineer from '../../data/corpus/canned/ml-engineer.json'
import researchScientist from '../../data/corpus/canned/research-scientist.json'
import type { AgentRoleId, Coverage, FitBrief, Guardrails } from './contracts'
import { ROLE_IDS } from './contracts'

export interface CannedProvenance {
  /**
   * `deterministic` — assembled from the evidence records by the site's own
   *   retriever, with no model involved at all.
   * `live-model`    — produced by the real agent, through the real tool loop and
   *   the real fact check, by `npm run build:canned -- --live`.
   */
  composer: 'deterministic' | 'live-model'
  model: string | null
  builtAt: string
  corpusVersion: string
  corpusSize: number
  /** How many statements the fact check dropped or repaired while building it. */
  guardrailTotal: number
}

export interface CannedBrief {
  role: AgentRoleId
  profile: string
  provenance: CannedProvenance
  brief: FitBrief
  coverage: Coverage
  guardrails: Guardrails
}

const BY_ROLE: Readonly<Record<AgentRoleId, CannedBrief>> = Object.freeze({
  'research-scientist': researchScientist as unknown as CannedBrief,
  'data-scientist': dataScientist as unknown as CannedBrief,
  'ml-engineer': mlEngineer as unknown as CannedBrief,
  'data-engineer': dataEngineer as unknown as CannedBrief,
})

export const CANNED_ROLES: readonly AgentRoleId[] = ROLE_IDS

export function cannedBrief(role: AgentRoleId): CannedBrief {
  const found = BY_ROLE[role]
  if (!found) {
    throw new Error(
      `No pre-built brief for role "${role}". Run \`npm run build:canned\` and commit the result.`,
    )
  }
  return found
}

export function isRoleId(value: string): value is AgentRoleId {
  return (ROLE_IDS as readonly string[]).includes(value)
}

/**
 * The sentence the run strip renders under a pre-built brief. It has to be true
 * of THIS file, which is why it reads the provenance rather than asserting a
 * fixed claim.
 */
export function provenanceSentence(p: CannedProvenance): string {
  if (p.composer === 'live-model') {
    return `Pre-built by the same agent against the same evidence records, and it passed the same checks.`
  }
  return `Pre-built directly from the same evidence records by this site's own retriever — no model wrote it — and it passed the same checks.`
}
