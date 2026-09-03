/**
 * lib/agent/degraded.ts — a complete, schema-valid fit brief built with ZERO
 * model involvement.
 *
 * This is the most important file in the agent for the page's actual argument.
 * Four things run through it:
 *
 *   1. Every degraded run. No key, demo mode, rate limit, model outage, a brief
 *      the fact check refused to publish — every one of them produces a REAL
 *      brief rather than an error page. There is no state in which the page
 *      shows nothing, an error alone, or a broken layout.
 *   2. Every role chip. Clicking a chip renders one of these instantly, because
 *      a recruiter who has 90 seconds should not spend 7 to 22 of them watching
 *      progress rows for a role that has a pre-built answer. Pasting the actual
 *      posting is the live path, and the panel says so.
 *   3. `npm run build:canned`, which writes the four pre-built briefs.
 *   4. A fresh clone with no keys and no accounts, which must produce the whole
 *      page. That is the $0 property the page argues for, applied to itself.
 *
 * WHAT MAKES IT HONEST RATHER THAN A MOCK
 * ---------------------------------------
 * Every sentence in the output is either a verbatim corpus statement or one of
 * a handful of connective phrases written here, and the verdicts come from the
 * same retriever and the same coverage vocabulary the server uses to check the
 * MODEL's verdicts. Then the result goes through `factCheckBrief` exactly like
 * model output does. So the strip's claim — built from the same records, passed
 * the same checks — is literally true, and the provenance block on the canned
 * file records which of the two composers produced it. Nothing here says "the
 * model wrote this" when the model did not.
 */

import { GAPS, roleProfileById } from '../corpus/index'
import { analyseJd } from '../corpus/jd'
import { retrieve } from '../corpus/retrieve'
import type { Coverage, RequirementResult, RoleProfileId } from '../corpus/types'
import { artifactLabelFor, artifactUrlFor, recordById } from './corpus'
import type { AgentRoleId, Citation, FitBrief, Verdict } from './contracts'
import { ROLE_PROFILE_BY_ROLE } from './contracts'
import { factCheckBrief } from './postcheck'
import type { CheckedBrief } from './postcheck'
import { corpusMentions } from './retrieval'
import { framingNote, norm } from './postcheck'
import { looksLikeJobDescription } from './untrusted'

/** The corpus's coverage vocabulary → the brief's verdict vocabulary. */
const VERDICT_FOR_COVERAGE: Readonly<Record<Coverage, Verdict>> = Object.freeze({
  strong: 'direct',
  partial: 'adjacent',
  'coursework-only': 'partial',
  none: 'no_evidence',
})

/**
 * Everything this file cites goes through the agent's own view of the corpus,
 * so a claim that is not licensed for the agent surface can never be cited even
 * by this deterministic path. One gate, not two.
 */
const hitRecord = (id: string) => recordById(id)

/** A quote must survive the verbatim check, which needs 12 normalised characters. */
function quoteFor(record: { short: string; statement: string }): string {
  return norm(record.short).length >= 12 ? record.short : record.statement
}

/**
 * Up to two citations per requirement, drawn from the top of the ranking.
 *
 * Within the top four hits — and only within them — a record that carries a
 * PUBLIC artifact is preferred over one that does not. A recruiter can click a
 * link; they cannot click a record id. The window is capped at four so this
 * never reaches past strong evidence for weak evidence that happens to have a
 * URL: it breaks ties toward what a reader can check, and does nothing else.
 * Records with no public artifact are still cited, with their label and no
 * link, because the alternative is dropping true evidence for a cosmetic
 * reason.
 */
function citationsFor(result: RequirementResult, limit = 2): Citation[] {
  const window = result.hits
    .slice(0, 4)
    .map((hit) => hitRecord(hit.claim.id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))

  const linked = window.filter((r) => artifactUrlFor(r) !== '')
  const unlinked = window.filter((r) => artifactUrlFor(r) === '')

  return [...linked, ...unlinked].slice(0, limit).map((record) => ({
    evidence_id: record.id,
    quoted_claim: quoteFor(record),
    artifact_label: artifactLabelFor(record),
    artifact_url: artifactUrlFor(record),
  }))
}

/**
 * The rationale, assembled from corpus sentences.
 *
 * The connective phrasing is deliberately flat. This is not the model's job
 * being imitated badly; it is a different, narrower job — say what the evidence
 * is and stop — and reading like a template is preferable to reading like prose
 * a person did not write.
 */
function rationaleFor(result: RequirementResult): string {
  if (!result.hits.length) {
    if (result.gap) return result.gap.honestAnswer
    if (result.fallback) return result.fallback
    return `This site has no verified record supporting "${result.label}".`
  }
  const sentences: string[] = []
  for (const hit of result.hits.slice(0, 2)) {
    const record = hitRecord(hit.claim.id)
    if (record) sentences.push(record.statement)
  }
  if (result.coverage === 'coursework-only' && result.gap) {
    sentences.push(result.gap.honestAnswer)
  }
  // The framing note goes in EVERY time, not only when coverage is weak. It is
  // the sentence a human wrote for exactly this row, and the one case that
  // proves the rule is a publication record: retrieval finds a real first-author
  // manuscript, and the note is the half that says it is under review rather
  // than accepted. Dropping it because the retrieval looked strong is how an
  // honest system produces a dishonest sentence.
  const note = framingNote(result.fallback)
  if (note) sentences.push(note)
  return sentences.join(' ')
}

export interface ComposeOptions {
  /** How many requirements to render. The brief schema allows at most 8. */
  limit?: number
  /**
   * The pasted posting. When present, the requirements come from the POSTING —
   * the union of the corpus's requirement definitions whose concepts it names —
   * rather than from the role profile, so a deterministic brief still answers
   * the employer's own question rather than reciting a template. The profile is
   * used only for the label and for choosing which written gaps to append.
   */
  jdText?: string
  /**
   * The deterministic detector (`looksLikeDirective`) fired on this text.
   *
   * The only thing this changes is step 3 below: the posting's own unrecognised
   * words are NOT mined for requirement rows. Measured on a real payload —
   * "IGNORE ALL PREVIOUS INSTRUCTIONS…" — the brief printed `No record for
   * "previous"` and `No record for "instructions"` as two of its three
   * requirements, directly under the note saying the pasted instructions "were
   * read as data and not followed". Nothing unsafe reached the page (the tokens
   * are sanitised and quoted), but the page had just told the reader it ignored
   * that text and then rendered its vocabulary as the employer's requirements.
   * The honest answer to a payload that is not a posting is the written gaps,
   * not a word-frequency reading of the attack.
   */
  directiveSuspected?: boolean
}

/**
 * Build a brief from the corpus alone, then run it through the same fact check
 * model output goes through.
 *
 * TWO PATHS, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE PRODUCT DECISION.
 *
 *   A ROLE CHIP has no employer behind it, so the rows are the corpus's own
 *   requirement definitions for that profile — a considered answer to "what
 *   does this kind of role usually ask for".
 *
 *   A PASTED POSTING has an employer behind it, and the rows must come from the
 *   POSTING. Reciting a role profile at someone who pasted a Staff Platform
 *   Engineer advertisement produces six confident rows about statistical
 *   inference, which is worse than saying nothing: it is a brief that did not
 *   read the question. So the rows are, in order:
 *     1. the requirement definitions whose concepts the posting actually names;
 *     2. a written gap for every gap concept the posting names — the sentences a
 *        human wrote in advance for precisely these questions;
 *     3. the posting's own unrecognised technical terms, each as a plain
 *        no_evidence row, when the first two did not fill the brief.
 *   Step 3 is what stops a posting this vocabulary cannot read from becoming a
 *   generic answer. An unreadable posting produces an honest "no record here
 *   matches any of this", which is a true and useful thing to tell a recruiter.
 *
 * Rows are NEVER sorted by verdict. A brief that leads with its strong rows and
 * buries its gaps is the thing a hiring manager has learned to distrust.
 */
export function composeRawBrief(
  profileId: RoleProfileId,
  options: ComposeOptions = {},
): FitBrief {
  const profile = roleProfileById(profileId)
  const limit = Math.min(8, Math.max(3, options.limit ?? 6))
  const jdText = options.jdText?.trim() ? options.jdText : null

  const jd = jdText ? analyseJd(jdText) : null

  // NOTHING IN, NOTHING OUT. A paste with no concept the vocabulary knows and
  // none of the shapes a posting has is not a posting, and the correct answer is
  // to say so rather than to recite a role profile at whoever pasted it. This is
  // also what a hostile paste of pure filler gets: one row, no evidence, no
  // invented requirements.
  if (jdText && jd && jd.concepts.length === 0 && !looksLikeJobDescription(jdText)) {
    return {
      role_label: profile.label,
      jd_source: 'pasted_jd',
      headline: 'No job requirements were found in the pasted text.',
      requirements: [
        {
          requirement: 'No job requirements were found in the pasted text',
          verdict: 'no_evidence',
          confidence: 'high',
          rationale:
            'Nothing in what was pasted reads as a role: no responsibilities, no requirements, and no ' +
            'technology this site has a record for. Paste the requirements section of the posting, or ' +
            'pick one of the four roles above for a pre-built brief.',
          evidence: [],
          caveat: '',
        },
      ],
      strongest: '',
      gaps_summary: '',
      not_claimed: [],
      closing: 'Nothing was claimed here, because there was nothing to answer.',
      observed_directives: [],
    }
  }

  const result = jdText ? retrieve({ jdText }) : retrieve({ profileId })

  const matchedRows = result.requirements.slice(0, jdText ? 5 : limit)
  const requirements = matchedRows.map((r) => {
    // A framing note caps the verdict at adjacent — see the same rule, and the
    // same reasoning, in postcheck.ts. Both paths cap, because both paths are
    // read by the same recruiter.
    const verdict =
      r.fallback && VERDICT_FOR_COVERAGE[r.coverage] === 'direct'
        ? ('adjacent' as Verdict)
        : VERDICT_FOR_COVERAGE[r.coverage]
    const evidence = verdict === 'no_evidence' ? [] : citationsFor(r)
    return {
      requirement: r.label,
      verdict,
      confidence: (r.coverage === 'strong' ? 'high' : r.coverage === 'none' ? 'high' : 'medium') as
        | 'high'
        | 'medium'
        | 'low',
      rationale: rationaleFor(r),
      evidence,
      caveat: '',
    }
  })

  // THE ROWS THAT MAKE THE BRIEF WORTH READING.
  //
  // The role profiles were written against Duy's own evidence, so a brief built
  // only from them is a self-portrait: every requirement clears, and a hiring
  // manager stops reading. Real postings carry requirements this site cannot
  // support, and the corpus already holds them — fourteen `gap:` records, each
  // with a sentence a human wrote in advance for exactly this moment. Appending
  // them is not manufacturing a gap; it is refusing to omit one already written
  // down.
  const gapRows = jd
    ? gapRowsForPosting(jd.concepts, matchedRows)
    : gapRowsFor(profileId, matchedRows)
  for (const row of gapRows) {
    if (requirements.length >= 8) break
    requirements.push(row)
  }

  // The posting's own words, for the parts of it this site could not read at
  // all. Only reached when the brief is still thin, and each row says exactly
  // what it means: no record here matches this.
  if (jd && requirements.length < 4 && !options.directiveSuspected) {
    for (const row of unmatchedTermRows(jd.unmatchedTerms, requirements)) {
      if (requirements.length >= 8) break
      requirements.push(row)
    }
  }

  const weak = requirements.filter((r) => r.verdict === 'partial' || r.verdict === 'no_evidence')
  const strong = requirements.filter((r) => r.verdict === 'direct' || r.verdict === 'adjacent')

  const gapsSummary = weak.length
    ? `This site does not fully evidence ${weak
        .map((r) => r.requirement.replace(/^No record for /, '').toLowerCase())
        .slice(0, 3)
        .join('; ')}. Each row above says which half is missing.`
    : ''

  const subject = jdText ? 'posting' : `${profile.label} profile`

  const raw: FitBrief = {
    role_label: profile.label,
    jd_source: jdText ? 'pasted_jd' : 'role_chip',
    headline: headlineFor(subject, strong.length, weak.length),
    requirements,
    strongest: requirements.find((r) => r.evidence.length)?.evidence[0]?.evidence_id ?? '',
    gaps_summary: gapsSummary,
    not_claimed: notClaimedFor(matchedRows),
    // The closing has to be true of THIS brief. A brief with no citations in it
    // cannot say that every row links to its record — that sentence would be
    // the one false statement in an answer whose whole point is that it has
    // none.
    closing: requirements.some((r) => r.evidence.length)
      ? 'Every row above links to the record it came from, and the rows this site cannot support say so.'
      : 'Nothing above is claimed, and nothing is cited, because this site has no record of what this posting asks for.',
    observed_directives: [],
  }

  return raw
}

/** The same brief, through the same fact check model output goes through. */
export function composeDeterministicBrief(
  profileId: RoleProfileId,
  options: ComposeOptions = {},
): CheckedBrief {
  const raw = composeRawBrief(profileId, options)
  return factCheckBrief(raw, { roleLabel: raw.role_label, jdSource: raw.jd_source })
}

const SEVERITY_ORDER: Readonly<Record<string, number>> = Object.freeze({
  'hard-blocker': 0,
  'adjacent-experience': 1,
  trainable: 2,
})

/**
 * The gaps a posting for THIS role commonly names, that this site cannot
 * support — chosen by concept overlap with the profile, never by hand. Used on
 * the role-chip path, where there is no employer text to read.
 *
 * Two rules keep it honest rather than decorative:
 *   - a gap already attached to one of the profile rows is skipped, because it
 *     is already said there and saying it twice reads as padding;
 *   - `disclose: false` gaps never appear. There is exactly one, and it covers
 *     questions about a person's private circumstances, which the agent hands
 *     back to Duy rather than answering at all.
 *
 * When no gap intersects the profile's concepts, the fallback is the one that is
 * true of every role here: this site evidences no employment at a technology
 * company. Stating it is what earns the rest of the brief its credibility.
 */
function gapRowsFor(profileId: RoleProfileId, rows: readonly RequirementResult[]) {
  const profile = roleProfileById(profileId)
  const profileConcepts = new Set(profile.requirements.flatMap((r) => r.concepts))
  const alreadySaid = new Set(rows.map((r) => r.gap?.id).filter(Boolean) as string[])

  const candidates = GAPS.filter(
    (g) =>
      g.disclose &&
      !alreadySaid.has(g.id) &&
      g.concepts.length > 0 &&
      g.concepts.some((c) => profileConcepts.has(c)),
  ).sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) ||
      a.id.localeCompare(b.id),
  )

  const chosen = candidates.slice(0, 2)
  if (!chosen.length) {
    const universal = GAPS.find((g) => g.id === 'gap:industry-employment' && !alreadySaid.has(g.id))
    if (universal) chosen.push(universal)
  }

  return chosen.map(gapRow)
}

/**
 * Written gaps whose concepts the POSTING itself names.
 *
 * This is the row a recruiter for a platform role most needs: they asked about
 * Kubernetes, the corpus holds a gap record for Kubernetes with a sentence
 * already written, and the honest answer is that sentence. Sorted by severity so
 * a hard blocker is stated before a trainable one.
 */
function gapRowsForPosting(
  concepts: readonly string[],
  rows: readonly RequirementResult[],
) {
  const alreadySaid = new Set(rows.map((r) => r.gap?.id).filter(Boolean) as string[])
  const named = GAPS.filter(
    (g) =>
      g.disclose &&
      !alreadySaid.has(g.id) &&
      g.concepts.length > 0 &&
      g.concepts.some((c) => concepts.includes(c)),
  ).sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) ||
      a.id.localeCompare(b.id),
  )

  const chosen = named.slice(0, 3)
  // Employment at a technology company is true of every posting here, and it is
  // the gap a recruiter is most likely to be weighing. It goes last, not first.
  const universal = GAPS.find((g) => g.id === 'gap:industry-employment')
  if (universal && !alreadySaid.has(universal.id) && !chosen.includes(universal)) {
    chosen.push(universal)
  }

  return chosen.map(gapRow)
}

/**
 * Words a posting uses that describe a ROLE rather than a capability.
 *
 * "Staff Platform Engineer" is a title, not a requirement, and a row saying
 * "no record for engineer" is noise that makes the honest rows harder to read.
 */
const GENERIC_POSTING_WORDS: ReadonlySet<string> = new Set([
  'platform', 'engineer', 'engineers', 'engineering', 'scientist', 'scientists',
  'analyst', 'analysts', 'developer', 'developers', 'manager', 'managers',
  'senior', 'staff', 'principal', 'junior', 'lead', 'director',
  'requirements', 'responsibilities', 'qualifications', 'preferred', 'required',
  'candidate', 'candidates', 'applicants', 'position', 'positions', 'opening',
  'company', 'companies', 'business', 'customer', 'customers', 'stakeholders',
  'excellent', 'strong', 'proven', 'passionate', 'motivated', 'collaborative',
])

/**
 * The posting's own unrecognised technical terms, as plain no_evidence rows.
 *
 * The term is echoed back, and it is safe to echo: it has already been through
 * the sanitiser and then through the corpus's own normaliser, which keeps only
 * [a-z0-9+./#-]. Trailing punctuation is trimmed here, and a small stoplist
 * drops the words that describe the ROLE rather than a capability. What is left
 * is a token, quoted so a reader can see it is theirs and not ours.
 *
 * Two rows at most. This is a last resort for a posting the vocabulary could not
 * read, and a wall of one-word rows would be its own kind of noise.
 */
function unmatchedTermRows(
  terms: readonly string[],
  existing: ReadonlyArray<{ requirement: string }>,
) {
  const said = new Set(existing.map((r) => r.requirement.toLowerCase()))
  const out: ReturnType<typeof gapRow>[] = []
  const seen = new Set<string>()

  for (const raw of terms) {
    const term = raw.replace(/^[^a-z0-9]+|[^a-z0-9+#]+$/g, '')
    if (term.length < 4) continue
    if (GENERIC_POSTING_WORDS.has(term)) continue
    if (seen.has(term) || said.has(term)) continue
    // The alias table not knowing a word and this site not mentioning it are
    // different facts. Only the second licenses "nothing on this site mentions
    // it", and saying it about a word that appears in six records would be the
    // brief contradicting the page it sits on.
    if (corpusMentions(term) > 0) continue
    seen.add(term)
    out.push({
      requirement: `No record for "${term}"`,
      verdict: 'no_evidence' as const,
      confidence: 'high' as const,
      rationale: `Nothing on this site mentions "${term}". That is the whole answer: there is no evidence of it here, and the rows above are the nearest work this site does record.`,
      evidence: [],
      caveat: '',
    })
    if (out.length >= 2) break
  }
  return out
}

function gapRow(gap: (typeof GAPS)[number]) {
  return {
    requirement: gap.label,
    verdict: 'no_evidence' as const,
    confidence: 'high' as const,
    rationale: gap.honestAnswer,
    evidence: [],
    caveat: '',
  }
}

function headlineFor(subject: string, strong: number, weak: number): string {
  if (weak === 0) return `Every requirement in this ${subject} maps to work on this site.`
  if (strong === 0) return `This site does not evidence what this ${subject} asks for.`
  return `Part of this ${subject} maps to work on this site, and part of it does not.`
}

/**
 * Inferences a reader might reasonably but wrongly draw. Sourced from the
 * corpus's own gap labels rather than written here, so the list cannot say
 * something the corpus does not already say about itself.
 */
function notClaimedFor(rows: readonly RequirementResult[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const gap = row.gap
    if (!gap || seen.has(gap.id) || !gap.disclose) continue
    seen.add(gap.id)
    out.push(`Not claimed: ${gap.label.toLowerCase()}.`)
    if (out.length >= 4) break
  }
  if (!out.length) {
    const fallback = GAPS.find((g) => g.disclose && g.severity !== 'hard-blocker')
    if (fallback) out.push(`Not claimed: ${fallback.label.toLowerCase()}.`)
  }
  return out
}

/** The chip id → the corpus profile it renders. */
export function profileForRole(role: AgentRoleId): RoleProfileId {
  return ROLE_PROFILE_BY_ROLE[role] as RoleProfileId
}

/**
 * Pick the nearest role when a pasted posting has to fall back to a pre-built
 * brief. Uses the corpus's own profile matcher; when nothing wins cleanly the
 * data-scientist profile is the honest default, because it is the broadest of
 * the four and the least likely to overclaim in either direction.
 */
export function nearestRole(jdText: string | null, chosen: AgentRoleId | null): AgentRoleId {
  if (chosen) return chosen
  if (jdText) {
    const result = retrieve({ jdText })
    if (result.profile !== 'custom') {
      const found = (Object.keys(ROLE_PROFILE_BY_ROLE) as AgentRoleId[]).find(
        (r) => ROLE_PROFILE_BY_ROLE[r] === result.profile,
      )
      if (found) return found
    }
  }
  return 'data-scientist'
}
