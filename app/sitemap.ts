import type { MetadataRoute } from 'next';
import { ARTIFACTS } from '@/lib/corpus';
import { SITE_ORIGIN } from '@/lib/seo';

/**
 * /sitemap.xml — the home page plus every legacy surface that still holds
 * content worth indexing.
 *
 * ── IT IS BUILT FROM THE ARTIFACT TABLE, NOT TYPED OUT ────────────────────
 *
 * `artifacts.json` already records, for each surviving page, the path that
 * must keep resolving (`legacyPath`) — and corpus check C12 fails the build if
 * any of those paths is missing from disk. Deriving the sitemap from the same
 * table means the file that promises a URL to a crawler and the file that
 * asserts the URL exists are the same file. A hand-written list would let a
 * deleted page stay in the sitemap indefinitely, which is the ordinary way a
 * sitemap starts lying.
 *
 * ── THE THREE PAGES THAT MUST NOT APPEAR (Addendum B, R-4) ────────────────
 *
 *   /docs/index_portfolio.html          308 → /
 *   /docs/index_gpa_analysis.html       301 → /
 *   /docs/index_independent_research.html  301 → /#research
 *
 * All three are redirects now: the files are deleted and the URLs are kept
 * alive so that inbound links from a résumé and from LinkedIn do not 404.
 * A redirect in a sitemap is a crawl error, and two of these pages were
 * retired because their CONTENT was wrong — publishing their addresses in a
 * machine-readable index is the last thing this rebuild should do.
 *
 * They are absent from `artifacts.json`, so the derivation below already
 * excludes them. `RETIRED` re-states them as a literal guard anyway, and the
 * filter runs over both: if one of these ever reappears in the artifact table,
 * this file drops it rather than advertising it.
 *
 * ── WHAT ELSE IS EXCLUDED, AND WHY ────────────────────────────────────────
 *
 * `EXCLUDED` holds the surviving pages that resolve but should not be indexed:
 * the maintenance panel, and the three business-card files, which are print
 * collateral rather than content. They stay reachable at their URLs — nothing
 * on a résumé domain gets a 404 — they are simply not advertised.
 *
 * PDFs are indexable and are listed. `lastModified` is omitted throughout:
 * these are static pages, and stamping every deploy as a content change is
 * noise a crawler learns to ignore.
 */

const RETIRED = [
  '/docs/index_portfolio.html',
  '/docs/index_gpa_analysis.html',
  '/docs/index_independent_research.html',
] as const;

const EXCLUDED = [
  '/docs/admin.html',
  '/docs/index_business_card.html',
  '/docs/business_card_design.html',
  '/docs/business_card_print_ready_FedEx.html',
] as const;

/** `public/docs/news.html` is served at `/docs/news.html`. */
const servedPath = (legacyPath: string): string => legacyPath.replace(/^public/, '');

export default function sitemap(): MetadataRoute.Sitemap {
  const legacy = ARTIFACTS.filter((artifact) => artifact.access === 'public')
    .map((artifact) => artifact.legacyPath)
    .filter((path): path is string => typeof path === 'string' && path.length > 0)
    .map(servedPath)
    .filter(
      (path) =>
        !RETIRED.includes(path as (typeof RETIRED)[number]) &&
        !EXCLUDED.includes(path as (typeof EXCLUDED)[number]),
    );

  // De-duplicated: two artifacts may legitimately describe one file.
  const paths = ['/', ...Array.from(new Set(legacy))];

  return paths.map((path) => ({
    url: new URL(path, `${SITE_ORIGIN}/`).toString(),
    changeFrequency: path === '/' ? ('monthly' as const) : ('yearly' as const),
    priority: path === '/' ? 1 : 0.5,
  }));
}
