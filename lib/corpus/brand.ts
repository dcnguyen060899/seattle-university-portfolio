/**
 * lib/corpus/brand.ts — the only doorway between the personal mark's
 * provenance record and anything that renders it.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM hero-asset.ts ─────────────────────
 *
 * `hero-asset.ts` opens with the rule that a photograph is itself a claim. A
 * brand mark is a claim of a different kind, and the difference is what earns
 * this second file rather than a `variant` parameter on the first.
 *
 * A photograph asserts what a place looks like. A LOCKUP asserts authorship —
 * "this is mine" — and, in this particular lockup, it asserts a quality of the
 * work underneath it, because the tagline reads PROVABLE AI. Those are two
 * separate unsourced statements riding on one PNG, and they fail in two
 * separate ways:
 *
 *   1. RIGHTS. Nobody has yet said who drew this. If it was commissioned, or
 *      generated, or assembled in a logo-maker from a licensed typeface, the
 *      answer changes what this site may do with it — and animating a traced
 *      copy of it is a modification, which is the use most licences bound.
 *   2. THE TAGLINE. "PROVABLE AI" is a positioning line. It sits roughly one
 *      scroll above a band promising that every limit is quoted from a record
 *      rather than paraphrased around it, on a page that has already retracted
 *      a claimed proof (`ret:duy-integral-theorem`). A reader who takes the
 *      word literally is being promised something stronger than this page
 *      delivers.
 *
 * So the rule this module implements is the same shape as the hero's, with one
 * clause added:
 *
 *   WHILE PROVENANCE IS UNRESOLVED, THE MARK MAY BE SEEN AND NOTHING MAY BE
 *   SAID ABOUT IT — AND THE TAGLINE IS NEVER PROSE, RESOLVED OR NOT.
 *
 * The second half is not conditional on the provenance answer because it is
 * not a provenance question. A logotype is allowed to be a slogan; a sentence
 * is not allowed to be an unsourced capability claim. Keeping the words inside
 * the artwork is what holds those apart, and it is the reason this file exports
 * no tagline string. There is deliberately no `markTagline()` to import: a
 * function that hands a caller the characters `PROVABLE AI` is a function that
 * eventually renders them as a heading, and no gate in this repository would
 * notice — C8 checks numbers, C9 checks retracted phrases, and this is neither.
 * Absence of an export is a weak control, so it is stated here rather than left
 * to be inferred from an empty API.
 *
 * ── WHY THIS MODULE MAY RENDER A MARK C15 IS STILL WARNING ABOUT ───────────
 *
 * `art:su-mark` is also `pending-owner`, and `components/ui/Mark.tsx` refuses
 * to render it at all. That is not the precedent for this file, and the reason
 * they differ is worth being explicit about, because "the other pending record
 * renders nothing" is an easy and wrong inference to draw.
 *
 * The Seattle University lockup is SOMEBODY ELSE'S registered trademark, and
 * the published rules say a personal web page needs written permission. The
 * risk of showing it is borne by a third party, so the conservative default is
 * to show nothing.
 *
 * This lockup, on every answer anyone expects, is the owner's own. The risk of
 * showing it is his, he put the file in the repository himself, and nothing
 * about displaying your own name is a rights question. What is open is
 * narrower: whether he authored it, and what a licence behind it might say. So
 * the conservative default here is the hero's, not the seal's — render it,
 * assert nothing about it. `markMayRender()` returns false only for `blocked`,
 * which is the answer coming back "no".
 *
 * ── AND WHY IT THROWS ──────────────────────────────────────────────────────
 *
 * Same discipline as `claimValue()` and `heroCaption()`: an accessor that
 * returns empty on a broken record turns a rights obligation into a silently
 * missing line. `verify-corpus.mjs` C15 catches the same thing over the
 * committed corpus — two enforcement points, one source of truth.
 *
 * ── THE ABSENT-MARK CONTRACT ───────────────────────────────────────────────
 *
 * The master is `public/brand/logo-source.png` and it may not be in the
 * repository. Every function here answers correctly with nothing on disk, and
 * the honest answers are the conservative ones: no caption, empty alt, no
 * assertion. A caller that renders the mark must independently handle its
 * absence — ABSENT MEANS NO INTRO AT ALL, not a broken one. This module reports
 * the POLICY, never whether the bytes exist.
 *
 * ── WHAT IS NOT IN HERE, ON PURPOSE ────────────────────────────────────────
 *
 * No colours, no geometry, no viewBox. Those are measured in the artifact
 * record's `note` (cream `#F2DBBC`, crimson `#8D131B`, ink box x 155-1884,
 * y 221-528 of 2046x769) so a renderer can read them once and hard-code them
 * beside the path data they belong to. Publishing them from here would imply
 * the corpus owns the design, and it does not — it owns the question of whose
 * design it is.
 */

import { ARTIFACTS, claimById } from './index'

import type { CaptionRule, ImageProvenance, ProvenanceStatus } from './hero-asset'

import type { ArtifactId } from './types'

/* The provenance block's shape is defined once, in `hero-asset.ts`, and reused
   here rather than restated. It mirrors data/corpus/schemas/misc.schema.json
   $defs.artifact.provenance, which is a single schema serving every artifact
   that carries the block — so two local copies of the interface could drift
   apart while both still compiled, and only one of them would be checked
   against the JSON that actually ships. */
export type { CaptionRule, ImageProvenance, ProvenanceStatus }

interface ArtifactWithProvenance {
  id: ArtifactId
  title: string
  url: string | null
  access: string
  provenance?: ImageProvenance | null
}

export const MARK_ARTIFACT_ID = 'art:personal-mark' as const

/* ── reads ─────────────────────────────────────────────────────────────────── */

function markRecord(): ArtifactWithProvenance {
  const found = (ARTIFACTS as readonly unknown[]).find(
    (a) => (a as ArtifactWithProvenance).id === MARK_ARTIFACT_ID
  ) as ArtifactWithProvenance | undefined
  if (!found) {
    throw new Error(
      `corpus: ${MARK_ARTIFACT_ID} is missing from data/corpus/artifacts.json. ` +
        'The personal mark may not render without a provenance record.'
    )
  }
  return found
}

/** The raw record. Prefer the derived helpers below — they encode the policy. */
export function markProvenance(): ImageProvenance {
  const record = markRecord()
  if (!record.provenance) {
    throw new Error(
      `corpus: ${MARK_ARTIFACT_ID} carries no provenance block. A mark this site ` +
        'reproduces must state where it came from before anything renders it.'
    )
  }
  return record.provenance
}

/** True only when the owner has answered and the answer is recorded with a date. */
export function markProvenanceResolved(): boolean {
  return markProvenance().status === 'verified'
}

/**
 * May the mark be painted at all?
 *
 * False only once the answer has come back "no" — at which point C15 also fails
 * the build while the files are still on disk, so this is the second of two
 * doors rather than the only one. `pending-owner` renders: see the header on
 * why this differs from `components/ui/Mark.tsx`.
 */
export function markMayRender(): boolean {
  return markProvenance().status !== 'blocked'
}

/**
 * May a surface state where the mark came from, who drew it, or what tool made
 * it? Only once provenance resolves. Until then the honest answer to "did Duy
 * design this?" is that the corpus does not know, and a surface that guesses is
 * doing the exact thing this corpus exists to prevent.
 */
export function markMayAssertOrigin(): boolean {
  return markProvenanceResolved()
}

/**
 * May any surface set the tagline as prose — a heading, a sentence, a meta
 * description, an answer to "what does Provable AI mean"?
 *
 * ALWAYS FALSE, and it is a constant rather than a lookup on purpose: there is
 * no field in the corpus that could flip it, because no provenance answer makes
 * an unsourced capability claim sayable. If the owner decides the line should be
 * assertable, that is a new CLAIM record with sources behind it and this
 * function is deleted, not toggled.
 *
 * The mark itself is unaffected. A logotype may say whatever a logotype says;
 * this only governs the words escaping the artwork.
 */
export function markMayAssertTagline(): false {
  return false
}

/**
 * Alt text for the mark. Always the empty string, and that is the CORRECT value
 * rather than a placeholder or an omission — for two reasons that happen to
 * agree.
 *
 * The first is the hero's: `alt=""` is how a decorative image is announced to a
 * screen reader, and the intro is decoration. The owner's name is already an
 * `<h1>` on the page underneath, so a screen reader that announced the lockup
 * would read the name twice and the second time without its heading role.
 *
 * The second is this file's own: a non-empty alt would have to contain the
 * words "PROVABLE AI", and that is precisely the tagline escaping the artwork
 * and entering the accessibility tree as a sentence — announced, in a screen
 * reader's flat prose, to the readers least able to see that it is a logotype
 * and not a statement. `markMayAssertTagline()` is false; alt text is a place
 * that rule has to hold.
 *
 * A caller must still pass this to an `alt` attribute (or mark the element
 * `aria-hidden`); an image with no `alt` at all fails axe, an empty one passes.
 */
export function markAltText(): string {
  markProvenance() // throws if the record is missing — a mark with no record renders nothing
  return ''
}

export interface MarkCaption {
  /** The exact line to render, verbatim from the corpus. */
  text: string
  /** `attribution` = a credit the licence obliges. `disclosure` = the mark is synthetic. */
  kind: 'attribution' | 'disclosure'
}

/**
 * The caption the page owes for this mark, or null when it owes none.
 *
 * Null in three distinct situations, all of them correct:
 *   - provenance is unresolved      → the page says nothing about the mark
 *   - the answer requires no line   → the ordinary case for your own logo
 *   - the mark cannot ship at all   → nothing to caption
 *
 * NOT ALWAYS NULL, and that is the point of having the function before the
 * answer arrives. If `openQuestions[0]` comes back "I generated it with an AI
 * tool", this page owes a disclosure line by exactly the argument
 * `art:hero-photo` already made and won, and the machinery to render it is
 * already wired.
 *
 * Throws when the record obliges a caption and does not carry its text. That is
 * an unshippable state, and failing the build is the cheap outcome.
 */
export function markCaption(): MarkCaption | null {
  const provenance = markProvenance()
  if (provenance.status !== 'verified') return null
  if (provenance.captionRule === 'none' || provenance.captionRule === 'pending') return null

  if (!provenance.captionText) {
    throw new Error(
      `corpus: ${MARK_ARTIFACT_ID} has captionRule "${provenance.captionRule}" and no captionText. ` +
        'The line is written by a human, in advance, in data/corpus/artifacts.json — never assembled here.'
    )
  }
  return { text: provenance.captionText, kind: provenance.captionRule }
}

/**
 * The credit line, and ONLY when provenance is resolved and actually requires
 * one. If a designer holds copyright and the licence asks for a credit, this is
 * the function that puts it on the page.
 */
export function markAttributionLine(): string | null {
  const provenance = markProvenance()
  if (provenance.status !== 'verified') return null
  if (provenance.attributionRequired !== true) return null

  const caption = markCaption()
  if (!caption) {
    throw new Error(
      `corpus: ${MARK_ARTIFACT_ID} requires attribution but its captionRule is ` +
        `"${provenance.captionRule}", which renders nothing. A required credit must reach the page.`
    )
  }
  return caption.text
}

/**
 * The standing sentence about Seattle University, for any surface that puts
 * this mark and the university's affiliation in one viewport.
 *
 * THIS IS THE FUNCTION THE SECOND MARK MADE NECESSARY. The nav carries the
 * affiliation and the intro carries this lockup; a reader who sees a name, a
 * tagline and a university in the same frame can reasonably read the whole
 * thing as an institutional programme. It is not one. The sentence is grounded
 * in a claim rather than in prose, so no agent can upgrade "student" into
 * anything warmer: the record it would have to cite says student.
 */
export function markAffiliationDisclaimer(): string {
  const provenance = markProvenance()
  if (provenance.endorsement !== 'none') {
    // A non-'none' value is a real permission and must be described by whatever
    // document granted it, not by this default sentence.
    throw new Error(
      `corpus: ${MARK_ARTIFACT_ID} records endorsement "${provenance.endorsement}". ` +
        'The standing "no endorsement" sentence no longer applies — render the granted terms instead.'
    )
  }
  // Throws if the claim id is a typo, so the sentence can never outlive its basis.
  claimById(provenance.affiliationBasis)
  return provenance.affiliationStatement
}

/** The questions the owner has to answer. Empty once provenance is resolved. */
export function markOpenQuestions(): readonly string[] {
  return Object.freeze([...markProvenance().openQuestions])
}

export interface MarkAssetPolicy {
  status: ProvenanceStatus
  /** False once the answer is "this cannot be used". */
  mayRender: boolean
  /** False while pending: no surface may state who made the mark or with what. */
  mayAssertOrigin: boolean
  /** Always false. The tagline is artwork, never a sentence. */
  mayAssertTagline: false
  /** `alt` for the element. `''` is a decorative image, not a missing value. */
  altText: string
  /** The line the page owes, or null. */
  caption: MarkCaption | null
  /** The standing affiliation sentence, for surfaces carrying both marks. */
  affiliationDisclaimer: string
  /** Public URL prefix for any generated renditions, e.g. `/brand/intro`. */
  assetBase: string | null
  /** Every path the master may legitimately arrive at, repo-relative. */
  sourcePaths: readonly string[]
}

/**
 * Everything a renderer needs, in one call, so a component cannot pick up the
 * mark and leave behind the rules that travel with it.
 */
export function markAssetPolicy(): MarkAssetPolicy {
  const provenance = markProvenance()
  return {
    status: provenance.status,
    mayRender: markMayRender(),
    mayAssertOrigin: markMayAssertOrigin(),
    mayAssertTagline: markMayAssertTagline(),
    altText: markAltText(),
    caption: markCaption(),
    affiliationDisclaimer: markAffiliationDisclaimer(),
    assetBase: provenance.assetDir ? provenance.assetDir.replace(/^public/, '') : null,
    sourcePaths: Object.freeze([...provenance.sourcePaths]),
  }
}
