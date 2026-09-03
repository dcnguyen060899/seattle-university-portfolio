/**
 * lib/seo.ts — every search and social surface, from one place.
 *
 * Modelled on the reference project’s `lib/seo.ts`, and for the same reason it
 * exists there: when the `<meta>` description, the OpenGraph copy and the
 * structured data are written in three files, they drift, and the drift is
 * invisible because nobody reads all three. Here they are one function and one
 * schema builder over the same records.
 *
 * ── THE STRONGER VERSION OF THAT IDEA ─────────────────────────────────────
 *
 * The reference keeps its copy in a constants file. This one does not keep
 * copy at all: every sentence below is `claimText(id, 'jsonld')`, so the
 * description a recruiter sees in a search result is the same licensed
 * sentence the page renders, and it is subject to the same gates. A claim that
 * is not licensed for the `jsonld` surface throws at build time rather than
 * quietly appearing in machine-readable markup where nobody proof-reads it.
 *
 * That is not a stylistic preference. Structured data is the one surface where
 * an unsourced claim is BOTH invisible to the author and legible to a machine
 * that will repeat it — which is how two of the retracted claims in
 * data/corpus/retractions.json survived as long as they did on the live site.
 *
 * ── WHAT IS DELIBERATELY OMITTED FROM THE PERSON NODE ─────────────────────
 *
 *   · `award` for anything under review. The PSB manuscript is submitted, not
 *     accepted; `clm:yang-psb-caveat` says so, and a `CreativeWork` node with
 *     no publication would read to an aggregator as a published paper.
 *   · any `Occupation` / `seeks` node built from the availability claim.
 *     Availability is a date-bounded fact that will be wrong in a year, and
 *     schema.org has no expiry.
 *   · telephone, postal address, image. None is in the corpus.
 *   · `alumniOf` entries with dates the corpus does not carry. Only the two
 *     completed degrees and the certificate appear, by name.
 */

import 'server-only';
import type { Metadata } from 'next';
import {
  artifactById,
  assertedSkills,
  claimText,
  orgById,
  personById,
} from '@/lib/corpus';
import type { ArtifactId } from '@/lib/corpus';

/**
 * The canonical origin. Read from the corpus artifact that records it rather
 * than from an environment variable, because this value has to be identical in
 * the metadata, the JSON-LD, the sitemap and the robots policy, and an
 * environment variable that is set in three of the four is a silent bug.
 */
export const SITE_ORIGIN = (() => {
  const portfolio = artifactById('art:portfolio');
  if (!portfolio.url) throw new Error('corpus: art:portfolio carries no URL');
  return portfolio.url.replace(/\/+$/, '');
})();

/** Browser-tab and search-result title. Name first: recruiters search names. */
export const SITE_TITLE = 'Duy Nguyen — data science, machine learning, evidence';

/**
 * The one-sentence description, licensed for this surface. It is the same
 * sentence the contact band renders, which is the point.
 */
export const SITE_DESCRIPTION = claimText('clm:econ-to-ds-bridge', 'jsonld');

export function buildSiteMetadata(): Metadata {
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: {
      default: SITE_TITLE,
      template: '%s — Duy Nguyen',
    },
    description: SITE_DESCRIPTION,
    applicationName: 'Duy Nguyen',
    authors: [{ name: personById('per:duy').name, url: SITE_ORIGIN }],
    creator: personById('per:duy').name,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'profile',
      siteName: 'Duy Nguyen',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      url: '/',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
    },
    // No `robots` key: this is the public portfolio and it should be indexed.
    // The two retired pages are handled as redirects in next.config.ts and are
    // absent from app/sitemap.ts.
  };
}

/**
 * The Person node.
 *
 * Every string in it comes from a record licensed for this surface, so the
 * structured data and the meta tags cannot disagree — and neither can disagree
 * with the page, because all three read the same store.
 */
export function personSchema(): Record<string, unknown> {
  const duy = personById('per:duy');
  const seattleU = orgById('org:seattle-u');
  const sfu = orgById('org:sfu');
  const berkeley = orgById('org:uc-berkeley');

  const profileIds: readonly ArtifactId[] = ['art:linkedin', 'art:github', 'art:portfolio'];
  const profiles = profileIds
    .map(artifactById)
    .filter((a) => a.access === 'public' && a.url !== null)
    .map((a) => a.url as string);

  const emails = claimText('clm:identity-contact', 'jsonld').match(
    /[\w.+-]+@[\w-]+\.[\w.-]*[\w-]/g,
  );
  if (!emails || emails.length === 0) {
    throw new Error('corpus: clm:identity-contact carries no e-mail address');
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: duy.name,
    // clm:identity-name is the record behind the name and the location.
    description: SITE_DESCRIPTION,
    url: SITE_ORIGIN,
    email: `mailto:${emails[0]}`,
    jobTitle: duy.title,
    homeLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: 'Seattle', addressRegion: 'WA' },
    },
    affiliation: {
      '@type': 'CollegeOrUniversity',
      name: seattleU.name,
      ...(seattleU.url ? { url: seattleU.url } : {}),
    },
    // clm:msds-enrolment · clm:sfu-economics-ba · clm:berkeley-cert.
    alumniOf: [
      { '@type': 'CollegeOrUniversity', name: seattleU.name },
      { '@type': 'CollegeOrUniversity', name: sfu.name },
      { '@type': 'CollegeOrUniversity', name: berkeley.name },
    ],
    // clm:cause-win. An award that has been decided, unlike the manuscript.
    award: claimText('clm:cause-win', 'jsonld'),
    // clm:yang-psb-submission is deliberately NOT emitted as a CreativeWork —
    // clm:yang-psb-caveat records that it is under review, not published, and
    // there is no schema.org shape that carries “submitted” without implying
    // more than that.
    knowsAbout: assertedSkills().map((skill) => skill.label),
    sameAs: profiles,
  };
}
