/**
 * lib/corpus/hero-asset.ts — the only doorway between the hero photograph's
 * provenance record and anything that renders.
 *
 * ── WHY A PICTURE NEEDS AN ACCESSOR AT ALL ─────────────────────────────────
 *
 * `lib/corpus/index.ts` exists because copy must never hold a literal. This
 * file exists for the same reason one level up: a photograph is itself a claim.
 * It asserts what a place looks like, and — on a page that also carries Seattle
 * University's wordmark — it quietly asserts something about a relationship.
 * Both assertions are unsourced until the owner says where the image came from.
 *
 * So the rule this module implements is narrow and absolute:
 *
 *   WHILE PROVENANCE IS UNRESOLVED, THE IMAGE MAY BE SEEN AND NOTHING MAY BE
 *   SAID ABOUT IT.
 *
 * Decoration asserts nothing, so decoration is allowed. `heroAltText()` returns
 * the empty string (a decorative image, correctly, to a screen reader),
 * `heroCaption()` returns null, and `heroMayAssertDepiction()` returns false so
 * no surface can describe the frame. The description in the corpus record is
 * the owner's, of a file nobody here has opened; letting it leak into alt text
 * would be inventing a caption out of a guess, which is the exact failure this
 * whole corpus is built against.
 *
 * ── AND WHY IT THROWS ──────────────────────────────────────────────────────
 *
 * Same discipline as `claimValue()`: an accessor that returns empty on a broken
 * record turns a rights obligation into a silently missing line. If provenance
 * resolves to a state that owes the page a credit and the credit text is
 * missing, this throws at build time. `verify-corpus.mjs` check C15 catches the
 * same thing over the committed corpus and over the emitted HTML — two
 * enforcement points, one source of truth, the same shape as
 * `forbiddenMatchers()`.
 *
 * ── THE ABSENT-PHOTO CONTRACT ──────────────────────────────────────────────
 *
 * The master lives at `public/brand/hero-source.png`, and it is not in the
 * repository. Every function here answers correctly with nothing on disk, and
 * the honest answers happen to be the conservative ones: no caption, empty alt,
 * no assertion. A caller that renders the photograph must independently handle
 * its absence — this module reports the POLICY, never whether the bytes exist.
 */

import { ARTIFACTS, claimById } from './index'

import type { ArtifactId, ClaimId, SourceId } from './types'

/* ── the shape of the provenance block ─────────────────────────────────────
   Mirrors data/corpus/schemas/misc.schema.json $defs.artifact.provenance, the
   way types.ts mirrors the rest of the corpus. `Artifact` in types.ts does not
   carry this field, so the record is widened where it is read rather than by
   editing a type that every other consumer shares.                          */

/**
 * `pending-owner` the origin has NOT been stated. Decoration only.
 * `verified`      origin and rights recorded, with a date.
 * `blocked`       the answer came back and the image cannot ship.
 */
export type ProvenanceStatus = 'pending-owner' | 'verified' | 'blocked'

export type ImageOrigin =
  | 'unknown'
  | 'owner-photograph'
  | 'institutional-asset'
  | 'licensed-stock'
  | 'ai-generated'
  | 'ai-generated-composite'
  | 'third-party'

/**
 * `none`        decorative background; the page owes no line.
 * `attribution` a credit the licence requires.
 * `disclosure`  the image is synthetic or a render and the page must say so.
 * `pending`     the question is open, so the page says nothing at all.
 */
export type CaptionRule = 'pending' | 'none' | 'attribution' | 'disclosure'

export interface ImageProvenance {
  status: ProvenanceStatus
  origin: ImageOrigin
  depicts: string
  rightsBasis: string | null
  /** Three-valued on purpose: `null` is "not yet known", not "no credit owed". */
  attributionRequired: boolean | null
  captionRule: CaptionRule
  captionText: string | null
  endorsement: 'none' | 'permitted-use' | 'claimed'
  affiliationBasis: ClaimId
  affiliationStatement: string
  assetDir: string | null
  sourcePaths: string[]
  sources: SourceId[]
  verifiedOn: string | null
  verificationPath: string
  openQuestions: string[]
  /** Does the frame render a third party's name, wordmark or banner? */
  containsThirdPartyMarks: boolean
  /**
   * The record's own verdict, kept alongside `captionRule` rather than derived
   * from it, so C15 can check the two against each other instead of trusting
   * them to agree.
   */
  disclosureRequired: boolean
  /**
   * The chain of title BEHIND the image — a different question from the image's
   * own origin, and for this composite the honest answer is `'unstated'`.
   * Internal (Addendum F, R-26): nothing reads it onto the page.
   */
  sourceImagesProvenance: string
  note?: string | null
}

interface ArtifactWithProvenance {
  id: ArtifactId
  title: string
  url: string | null
  access: string
  provenance?: ImageProvenance | null
}

export const HERO_ARTIFACT_ID = 'art:hero-photo' as const

/* ── reads ─────────────────────────────────────────────────────────────────── */

function heroRecord(): ArtifactWithProvenance {
  const found = (ARTIFACTS as readonly unknown[]).find(
    (a) => (a as ArtifactWithProvenance).id === HERO_ARTIFACT_ID
  ) as ArtifactWithProvenance | undefined
  if (!found) {
    throw new Error(
      `corpus: ${HERO_ARTIFACT_ID} is missing from data/corpus/artifacts.json. ` +
        'The hero photograph may not render without a provenance record.'
    )
  }
  return found
}

/** The raw record. Prefer the derived helpers below — they encode the policy. */
export function heroProvenance(): ImageProvenance {
  const record = heroRecord()
  if (!record.provenance) {
    throw new Error(
      `corpus: ${HERO_ARTIFACT_ID} carries no provenance block. An image this site ` +
        'publishes must state where it came from before anything renders it.'
    )
  }
  return record.provenance
}

/** True only when the owner has answered and the answer is recorded with a date. */
export function heroProvenanceResolved(): boolean {
  return heroProvenance().status === 'verified'
}

/**
 * May the image be painted at all? False only once the answer has come back
 * "no" — at which point `verify-corpus.mjs` C15 also fails the build while the
 * files are still on disk, so this is the second of two doors, not the only one.
 */
export function heroMayRender(): boolean {
  return heroProvenance().status !== 'blocked'
}

/** May a surface state what the photograph shows? Only once provenance resolves. */
export function heroMayAssertDepiction(): boolean {
  return heroProvenanceResolved()
}

/**
 * Alt text for the hero image. Always the empty string, and that is the
 * CORRECT value rather than a placeholder or an omission.
 *
 * `alt=""` is how a decorative image is announced to a screen reader — it tells
 * assistive technology to skip an element that carries no information the copy
 * does not already carry. The hero image is exactly that: background art behind
 * a band whose every meaningful figure is text.
 *
 * It stayed empty when provenance resolved, and the reason CHANGED rather than
 * persisted. While the record was open, empty alt was the conservative answer —
 * nothing may be said about a file nobody has opened. Now that the origin is
 * recorded, the reason is a ruling: the disclosure this image owes is a VISIBLE
 * page element (Addendum F, R-22), never an attribute only a machine reads.
 * Moving the sentence into `alt` would hide it from every sighted visitor and
 * announce it only to the readers who cannot see the image being disclosed —
 * precisely inverted. `heroCaption()` is where the line lives.
 *
 * A caller must still pass this to an `alt` attribute; an image with no `alt`
 * at all fails axe, and an empty `alt` passes it.
 */
export function heroAltText(): string {
  heroProvenance() // throws if the record is missing — an image with no record renders nothing
  return ''
}

export interface HeroCaption {
  /** The exact line to render, verbatim from the corpus. */
  text: string
  /** `attribution` = a credit the licence obliges. `disclosure` = the image is synthetic. */
  kind: 'attribution' | 'disclosure'
}

/**
 * The caption the page owes for this image, or null when it owes none.
 *
 * Null in three distinct situations, all of them correct:
 *   - provenance is unresolved      → the page says nothing about the image
 *   - the answer requires no line   → an ordinary decorative background
 *   - the image cannot ship at all  → nothing to caption
 *
 * Throws when the record obliges a caption and does not carry its text. That is
 * an unshippable state, and failing the build is the cheap outcome; the
 * expensive one is a licence breach on a live page.
 */
export function heroCaption(): HeroCaption | null {
  const provenance = heroProvenance()
  if (provenance.status !== 'verified') return null
  if (provenance.captionRule === 'none' || provenance.captionRule === 'pending') return null

  if (!provenance.captionText) {
    throw new Error(
      `corpus: ${HERO_ARTIFACT_ID} has captionRule "${provenance.captionRule}" and no captionText. ` +
        'The line is written by a human, in advance, in data/corpus/artifacts.json — never assembled here.'
    )
  }
  return { text: provenance.captionText, kind: provenance.captionRule }
}

/**
 * The credit line, and ONLY when provenance is resolved and actually requires
 * one. This is the function a caption component calls; `heroCaption()` is the
 * superset that also carries a synthetic-image disclosure.
 */
export function heroAttributionLine(): string | null {
  const provenance = heroProvenance()
  if (provenance.status !== 'verified') return null
  if (provenance.attributionRequired !== true) return null

  const caption = heroCaption()
  if (!caption) {
    throw new Error(
      `corpus: ${HERO_ARTIFACT_ID} requires attribution but its captionRule is ` +
        `"${provenance.captionRule}", which renders nothing. A required credit must reach the page.`
    )
  }
  return caption.text
}

/**
 * What the relationship to Seattle University actually is, in one sentence.
 *
 * The hero already pairs the university's wordmark with the owner's name;
 * adding a campus photograph strengthens the implication that the university is
 * behind the page. It is not. This sentence is the corpus's standing answer, and
 * it is grounded in a claim (`affiliationBasis`) rather than in prose, so the
 * agent cannot upgrade "student" into anything warmer: the record it would have
 * to cite says student.
 */
export function heroAffiliationDisclaimer(): string {
  const provenance = heroProvenance()
  if (provenance.endorsement !== 'none') {
    // A non-'none' value is a real permission and must be described by whatever
    // document granted it, not by this default sentence.
    throw new Error(
      `corpus: ${HERO_ARTIFACT_ID} records endorsement "${provenance.endorsement}". ` +
        'The standing "no endorsement" sentence no longer applies — render the granted terms instead.'
    )
  }
  // Throws if the claim id is a typo, so the sentence can never outlive its basis.
  claimById(provenance.affiliationBasis)
  return provenance.affiliationStatement
}

/** The questions the owner has to answer. Empty once provenance is resolved. */
export function heroOpenQuestions(): readonly string[] {
  return Object.freeze([...heroProvenance().openQuestions])
}

export interface HeroAssetPolicy {
  status: ProvenanceStatus
  /** False once the answer is "this cannot be used". */
  mayRender: boolean
  /** False while pending: no surface may state what the frame shows. */
  mayAssertDepiction: boolean
  /** `alt` for the image element. `''` is a decorative image, not a missing value. */
  altText: string
  /** The line the page owes, or null. */
  caption: HeroCaption | null
  /** The standing affiliation sentence, when the image sits beside an institutional mark. */
  affiliationDisclaimer: string
  /** Public URL prefix for the generated renditions, e.g. `/brand/hero`. */
  assetBase: string | null
  /** Where the master is expected to be dropped, repo-relative. */
  sourcePaths: readonly string[]
}

/**
 * Everything a renderer needs, in one call, so a component cannot pick up the
 * image and forget the sentence that goes with it.
 */
export function heroAssetPolicy(): HeroAssetPolicy {
  const provenance = heroProvenance()
  return {
    status: provenance.status,
    mayRender: heroMayRender(),
    mayAssertDepiction: heroMayAssertDepiction(),
    altText: heroAltText(),
    caption: heroCaption(),
    affiliationDisclaimer: heroAffiliationDisclaimer(),
    assetBase: provenance.assetDir ? provenance.assetDir.replace(/^public/, '') : null,
    sourcePaths: Object.freeze([...provenance.sourcePaths]),
  }
}
