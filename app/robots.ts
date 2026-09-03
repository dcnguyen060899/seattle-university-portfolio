import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/seo';

/**
 * /robots.txt
 *
 * Everything is crawlable except the two subtrees that carry no public content:
 * the API routes, and the maintenance panel that survives under the legacy
 * tree. `next.config.ts` already sends `X-Robots-Tag: noindex` for those; this
 * states the same policy one layer earlier, so a crawler does not have to
 * fetch them to find out.
 *
 * ── WHAT IS NOT DISALLOWED, DELIBERATELY ──────────────────────────────────
 *
 * The three retired pages (`index_portfolio.html`, `index_gpa_analysis.html`,
 * `index_independent_research.html`) are NOT listed here. They are redirects
 * now, and a `Disallow` would stop a crawler from following the redirect — so
 * the inbound links on a résumé and on LinkedIn would keep pointing at a page
 * the crawler is forbidden to resolve, and their old content would keep its
 * ranking instead of being replaced by the destination. Redirect plus
 * `noindex` at the edge is the correct pair; robots is the wrong tool.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/docs/admin.html'],
    },
    sitemap: new URL('/sitemap.xml', `${SITE_ORIGIN}/`).toString(),
    host: SITE_ORIGIN,
  };
}
