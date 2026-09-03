import type { NextConfig } from 'next'

/* ────────────────────────────────────────────────────────────────────────────
 * THE ONE THING TO KNOW BEFORE EDITING THIS FILE
 *
 * duyng-portfolio.com is served by GITHUB PAGES today, not by Vercel.
 * (Verified 2026-09-02: apex A records 185.199.108-111.153, `server: GitHub.com`,
 * Pages API source = {branch: "main", path: "/"}, build_type "legacy" = Jekyll.)
 * seattle-university-portfolio.vercel.app is a SECOND host serving the same repo.
 *
 * So the migration is a DNS cutover, and everything below is built and proven on
 * *.vercel.app before a single DNS record moves. See scratchpad RUNBOOK-cutover.md.
 *
 * Consequence for routing: Jekyll answers BOTH /docs/news.html AND /docs/news.
 * Next.js answers only the first. Every extensionless name in FROZEN_PAGES is a
 * live 200 today; dropping one breaks a URL that is on a résumé and on LinkedIn.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The frozen legacy pages under public/docs/.
 *
 * ⚠ THIS LIST IS A CONTRACT WITH GITHUB PAGES, NOT A CONVENIENCE.
 *
 * Generated from `git ls-files 'public/docs/*.html'`. scripts/verify-urls.sh
 * re-derives the same list from the git index at run time and probes every
 * entry, so a page added to public/docs without being added here fails
 * `npm run verify:urls` rather than 404ing quietly in production.
 *
 * The three pages deleted per Addendum B (index_portfolio, index_gpa_analysis,
 * index_independent_research) are NOT here — they are redirects() entries below.
 */
const FROZEN_PAGES = [
  'admin',
  'blog_econometrics_of_ai',
  'business_card_design',
  'business_card_print_ready_FedEx',
  'index',
  'index_ai_agent_project',
  'index_business_card',
  'index_certificate',
  'index_data5100_project',
  'index_image_classification',
  'index_mosaic_chatbot',
  'index_resume',
  'learning_algorithm',
  'news',
  'resume_content',
] as const

const isDev = process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // `next dev` blocks any request to /_next/* whose Origin header is not
  // allow-listed. Playwright drives 127.0.0.1, which is the dev server's own
  // address, so allow-listing it widens nothing. Dev-only: `next start` never
  // runs this check. (Same fix, same reason, as the reference repo.)
  allowedDevOrigins: ['127.0.0.1'],

  async redirects() {
    return [
      /* ── The old root ────────────────────────────────────────────────────
       * Root index.html was a 530-byte <meta refresh> to docs/index_portfolio.html.
       * "/" is a real page now. `/index` existed because Jekyll served clean URLs.
       * NOTE: `permanent: true` emits 308, NOT 301 — measured against next@16.3.4.
       * Do not write a verification assertion that hardcodes 301 for these. */
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/index', destination: '/', permanent: true },

      /* ── Addendum B, ruling R-4: the three deleted legacy pages ──────────
       * The owner said "delete outright". That is a decision about the CONTENT.
       * A résumé domain should not 404 on an inbound link, so the URLs stay
       * alive as redirects and the bytes are gone. */

      // index_portfolio.html is the page being replaced. 308.
      { source: '/docs/index_portfolio.html', destination: '/', permanent: true },
      { source: '/docs/index_portfolio', destination: '/', permanent: true },

      // R-4 specifies a literal 301 for the other two. `permanent: true` would
      // give 308, so these use `statusCode` explicitly. Measured: next@16.3.4
      // emits `HTTP/1.1 301 Moved Permanently` for exactly this shape.
      { source: '/docs/index_gpa_analysis.html', destination: '/', statusCode: 301 },
      { source: '/docs/index_gpa_analysis', destination: '/', statusCode: 301 },

      // A fragment in `destination` is passed through to Location verbatim.
      // Measured: Location: /#research.
      {
        source: '/docs/index_independent_research.html',
        destination: '/#research',
        statusCode: 301,
      },
      {
        source: '/docs/index_independent_research',
        destination: '/#research',
        statusCode: 301,
      },
    ]
  },

  async rewrites() {
    return {
      /**
       * beforeFiles — evaluated ahead of public/ and ahead of every Next route.
       */
      beforeFiles: [
        /* GitHub Pages served /docs -> 301 -> /docs/ -> docs/index.html (the
         * UC Berkeley capstone index, 22504 bytes).
         *
         * ⚠ DO NOT "FIX" THIS INTO A REDIRECT TO /docs/. Measured: with
         * trailingSlash:false Next 308s /docs/ -> /docs, so a /docs -> /docs/
         * redirect loops until curl gives up at 50 hops. A rewrite terminates:
         * /docs -> 200, /docs/ -> 308 -> /docs -> 200. One hop. */
        { source: '/docs', destination: '/docs/index.html' },

        /* 🔴 PRIVACY CONTROL, NOT A ROUTING TIDY-UP.
         *
         * public/docs/.claude/agent-memory/psb-polish/ holds three private
         * working files — MEMORY.md, user_career_thesis.md and
         * feedback_public_writing_no_fabrication.md. Jekyll silently excludes
         * dot-directories, so they are 404 on GitHub Pages today.
         *
         * NEXT.JS DOES NOT. Measured on next@16.3.4: a file at
         * public/docs/.claude/agent-memory/MEMORY.md is served at
         * /docs/.claude/agent-memory/MEMORY.md with 200 and its full contents.
         * A plain `git mv docs public/docs` therefore PUBLISHES them, on the
         * site whose entire purpose is controlling what a recruiter sees.
         *
         * This rewrite points at a path that matches no route and no file, which
         * produces a real 404 — measured. Belt and braces: .vercelignore also
         * keeps the directory out of the deployment entirely, and
         * scripts/verify-urls.sh asserts 404 for all three files.
         * The permanent fix is `git mv public/docs/.claude .claude`; until that
         * lands, do not remove this rule. */
        { source: '/docs/.claude/:path*', destination: '/__private_not_published__' },

        /* Dev only: the evaluation blueprint runs as a local Flask process
         * (`npm run dev:py`). In production vercel.json routes these two paths
         * to the Python function. public/docs/js/challenge_mode.js already
         * resolves its API base to '' (same origin) on localhost/127.0.0.1, so
         * the frozen page works against this proxy with no edit. */
        ...(isDev
          ? [
              {
                source: '/evaluate-challenge',
                destination: 'http://127.0.0.1:5328/evaluate-challenge',
              },
              {
                source: '/evaluate-challenge/:path*',
                destination: 'http://127.0.0.1:5328/evaluate-challenge/:path*',
              },
            ]
          : []),
      ],

      afterFiles: [],

      /**
       * fallback — runs after public/ and after every Next route, so a real file
       * or a real page always wins. This is the Jekyll clean-URL parity layer.
       * The alternation is an ALLOW-LIST: /docs/anything-else still 404s.
       * Measured: /docs/news -> 200 (body = news.html), /docs/nope -> 404.
       */
      fallback: [
        {
          source: `/docs/:page(${FROZEN_PAGES.join('|')})`,
          destination: '/docs/:page.html',
        },
      ],
    }
  },

  async headers() {
    return [
      /* ── noindex for the two pages deleted under R-4 ──────────────────────
       *
       * HONEST MEASUREMENT, next@16.3.4: a URL that matches a redirects() entry
       * NEVER receives its headers() headers. `curl -I /docs/index_gpa_analysis.html`
       * returns `301` + `location: /` and NO `x-robots-tag`. redirects() runs
       * first and short-circuits.
       *
       * These rules are therefore inert while the redirects above exist, and
       * they are kept deliberately: (a) a 301 already removes the source URL
       * from the index and consolidates it into the target, which is strictly
       * stronger than noindex — a crawler following a 301 never sees a body to
       * apply noindex to; (b) if either redirect is ever removed, the page must
       * not silently become indexable again. Do not delete these expecting the
       * de-indexing to hold on its own.
       *
       * Deliberately NOT added: a blanket `X-Robots-Tag: noarchive` on
       * /docs/:path*. `noarchive` suppresses the cached copy; it has nothing to
       * do with ranking, and the surviving legacy pages are linked from LinkedIn
       * and should stay indexable. Ranking is a canonical-tag and sitemap
       * question, not a header one. */
      {
        source: '/docs/index_gpa_analysis.html',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/docs/index_independent_research.html',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/docs/index_portfolio.html',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },

      // Nothing under /api is ever a search result.
      {
        source: '/api/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },

      // The private working files above are unreachable by two mechanisms; this
      // is the third, and the only one that survives someone deleting the other
      // two by hand.
      {
        source: '/docs/.claude/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ]
  },
}

export default nextConfig
