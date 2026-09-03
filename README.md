# duyng-portfolio

**Duy Nguyen — M.S. Data Science, Seattle University.**
Portfolio site plus a recruiter fit agent, on Next.js 16 (App Router) with a small
surviving Flask function.

Live: [duyng-portfolio.com](https://duyng-portfolio.com) ·
[github.com/dcnguyen060899](https://github.com/dcnguyen060899) ·
[linkedin.com/in/duwe-ng](https://www.linkedin.com/in/duwe-ng/)

---

## The one thing to know before you touch anything

**`duyng-portfolio.com` is served by GitHub Pages, not by Vercel.**

Verified 2026-09-02:

```
$ dig +short duyng-portfolio.com A
185.199.110.153  185.199.111.153  185.199.108.153  185.199.109.153   # GitHub Pages anycast

$ curl -sSI https://duyng-portfolio.com/ | head -2
HTTP/2 200
server: GitHub.com
```

Pages publishes from `main`, path `/`, with a legacy (Jekyll) build.
`seattle-university-portfolio.vercel.app` is a **second host serving the same
repository**, and it is where the Flask backend runs.

Two consequences, and they shape everything else in this repo:

1. **Nothing you push to Vercel changes the live domain until the DNS A records
   move.** That is a gift, not a problem: the whole Next.js app is built, deployed
   and verified on `*.vercel.app` while the live domain sits untouched.
2. **The migration is a DNS cutover.** It has an ordering, a TLS-issuance gap and
   a rollback that is *not* five minutes. All of that is written down; do not
   improvise it.

---

## Repository layout

```
app/            Next.js App Router — the new homepage and the agent routes
components/     ui/ primitives + site/ sections
lib/            corpus access, agent, env
data/corpus/    ⭐ THE ONLY SOURCE OF TRUTH FOR NUMBERS. Committed JSON.
tests/          unit (vitest) and e2e (playwright + axe)
scripts/        check-env, verify-urls, corpus and generator scripts
public/
  brand/        Seattle University marks (see public/brand/README.md)
  favicon.ico   16,408 B — the seattleu_2.ico lineage, unchanged
  docs/         ⭐ THE FROZEN LEGACY SITE. Served verbatim at /docs/...
api/index.py    the Vercel Python function: /evaluate-challenge only
backend/        Python source + pytest suite + node tests
```

### `public/docs/` vs `docs/`

Two directories want the name `docs`, and confusing them is a live-site incident.

| directory | what it is | served? |
|---|---|---|
| `public/docs/**` | the **legacy site** — 15 HTML pages, css, js, images, both PDFs | **yes**, verbatim at `/docs/...` |
| `docs/**` | engineering documents only. Excluded from the build. | **never** |

`.vercelignore` excludes `/docs` **with a leading slash**. That anchor is
load-bearing: `.vercelignore` uses `.gitignore` syntax, in which an unanchored
`docs` matches a directory of that name at any depth — including `public/docs`.
An unanchored pattern would deploy green and 404 the résumé. There is a CI check
for exactly this.

### `public/docs/` is not byte-frozen — it is maintained under an edit allowlist

Every file under `public/docs/` is a URL that is on a résumé or on LinkedIn.
Exactly three files may be edited:

| file | why |
|---|---|
| `index.html` | the chatbot widget markup and its `js/chat.js` script tag were stripped — `chat.js` is deleted, and a tag pointing at a deleted file is a console 404 for every visitor |
| `js/mcp-tools.js` | the stale availability block. Availability is Summer 2027 |
| `resume_content.html` | generated from the corpus by `npm run gen:resume` |

Everything else is size-asserted by `scripts/verify-urls.sh` and diff-guarded by
`.github/workflows/ci.yml`. Adding a fourth file to that list is a decision about
the archive, not a commit.

---

## Getting started

**Prerequisites:** Node 20.9+ (CI uses 22.x), Python 3.12 (`.python-version`;
the backend CI job uses 3.11). No API key is required for anything.

```bash
npm install
npm run dev              # Next on :3000 — the whole site, including /docs/* from public/
npm run dev:py           # Flask on :5328 — the /evaluate-challenge blueprint only
```

In development `next.config.ts` proxies `/evaluate-challenge*` to `127.0.0.1:5328`,
so `http://localhost:3000/docs/learning_algorithm.html` works end to end against
the local Flask process. (`public/docs/js/challenge_mode.js` already resolves its
API base to the same origin on `localhost`/`127.0.0.1`, so the frozen page needs
no edit.) In production `vercel.json` routes those two paths to the Python
function instead.

### It runs with no keys, no accounts and $0

`AGENT_DEMO_MODE` **defaults ON and wins over a present API key**, and the
evaluation backend degrades to a deterministic rule-based path without
`ANTHROPIC_API_KEY`. A fresh clone serves the full site. `npm run check:env`
prints exactly which capability is live and which is seeded, so nobody deploys
believing a capability is live when it is serving a fixture.

**Going live is an explicit `AGENT_DEMO_MODE=0`.** This matters more here than in
the project it was ported from: that demo is driven by its owner in front of an
investor, where a failed live call is the worse outcome. This agent serves
strangers, unattended, on a job-hunt site — a production deploy that sets the key
and forgets the flag serves canned briefs forever *while announcing that it is
doing so*. `check:env` reports the flag on its own line, before the table, and
`scripts/verify-urls.sh` asserts `GET /api/agent/health` returns `mode: "live"`
when run with `EXPECT_LIVE_AGENT=1`.

---

## Scripts

| command | what it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run dev:py` | the Flask evaluation blueprint on :5328 |
| `npm run lint` | ESLint 9 flat config + typescript-eslint |
| `npm run typecheck` | `tsc --noEmit`, strict, `noUncheckedIndexedAccess` |
| `npm test` | Vitest (unit) |
| `npm run test:e2e` | Playwright + `@axe-core/playwright` |
| `npm run check:env` | the capability table — LIVE vs SEEDED, per capability |
| **`npm run verify`** | **`check:env && lint && typecheck && test`** — the gate |
| `npm run verify:urls` | probe every preserved legacy URL against a real host |
| `npm run verify:corpus` | the corpus build gate |
| `npm run corpus:refresh:fischer` | re-query the lab database and re-snapshot |
| `npm run gen:resume` | regenerate `public/docs/resume_content.html` from the corpus |
| `npm run build:canned` | rebuild the pre-built role briefs for the degraded path |

### `npm run verify:urls`

```bash
BASE=https://<preview>.vercel.app       npm run verify:urls   # before DNS
BASE=https://duyng-portfolio.com        npm run verify:urls   # after DNS
BASE=http://127.0.0.1:3000              npm run verify:urls   # against `next start`
```

It reads the git index, so the expected list cannot drift from what is committed.
It asserts, for a real host:

- every frozen file under `public/docs/` — status **and exact byte count**;
- every **extensionless** page name. Jekyll answers both `/docs/news.html` and
  `/docs/news`; Next.js answers only the first. Measured on `next@16.3.4`: a
  control build 404s `/docs/news`. The extensionless forms are restored by a
  `fallback` rewrite whose alternation is an allow-list;
- every redirect, with its **exact** status code — `permanent: true` emits **308,
  not 301**, and the two pages that ruling R-4 specifies as 301 use `statusCode`
  explicitly;
- everything that must **not** be reachable: the three private working files
  under `public/docs/.claude/`, the retired `/chat`, `/classify-image` and
  `/api-check`, and the repository source that GitHub Pages used to publish.

At the time of writing it runs **155 assertions**; 154 pass against a local
`next start` with the Flask blueprint up, and the one failure is `/`, which is
the homepage another workstream is still building.

---

## Routing decisions worth knowing before you edit `next.config.ts`

All measured against `next@16.3.4`, not reasoned about:

- **`public/docs/x.html` serves at `/docs/x.html`. The extension is required.**
  There is no clean-URL behaviour; `/docs/x` 404s without a rewrite.
- **`/docs` → `/docs/` must be a rewrite, never a redirect.** With
  `trailingSlash: false` Next 308s `/docs/` → `/docs`, so a `/docs` → `/docs/`
  redirect loops until curl gives up at 50 hops. The `beforeFiles` rewrite to
  `/docs/index.html` terminates in one hop.
- **`redirects()` beats an existing `public/` file**, and it also **short-circuits
  `headers()`** — a URL that matches a redirect never receives its
  `X-Robots-Tag`. The `noindex` rules on the deleted pages are therefore inert
  while the redirects exist. They are kept anyway, so that removing a redirect
  cannot silently make a deleted page indexable again. A 301 is the stronger
  signal regardless: a crawler following it never sees a body to apply `noindex` to.
- **Next.js serves dot-directories out of `public/`.** Jekyll silently hides them,
  which is the only reason `public/docs/.claude/agent-memory/` is 404 on the live
  site today. A plain `git mv docs public/docs` would **publish** three private
  working files. There are three guards: a `next.config.ts` rewrite to a
  non-existent path (measured: real 404), a `/public/docs/.claude` line in
  `.vercelignore`, and an assertion in `verify-urls.sh`. **The real fix is
  `git mv public/docs/.claude .claude`; until that lands, do not remove any of
  the three.**

---

## The Python surface

One blueprint survives: `/evaluate-challenge`, `/evaluate-challenge/health` and
`/evaluate-challenge/tutor`. `public/docs/learning_algorithm.html` depends on it,
and it has 227 pytest tests, 125 node tests and a hash-verified challenge
registry. Porting it to TypeScript would be weeks of work for zero user-visible
gain, so it stays Python.

**Retired, not ported:**

| route | why |
|---|---|
| `POST /chat` | duplicated the recruiter agent (the owner's decision is *one* agent), dragged the LangChain stack into the function bundle for 12 lines of routing, and its `base_qa` corpus was factually stale. Its only caller was a widget on one page, now removed. |
| `POST /classify-image` | verified: nothing under `public/docs` calls it. `index_image_classification.html` embeds the HuggingFace Space directly in an `<iframe>`. |
| `GET /api-check` | called the model on every unauthenticated GET, outside the rate limiter, with no caller anywhere in the tree. |
| `GET /` (Flask) | Next.js owns `/`. |

Retiring `/chat` also deletes the entire cross-origin problem it created, rather
than managing it with a CORS shim for one dead widget.

`api/index.py` builds its own `Flask(static_folder=None)` and mounts only the
blueprint. Root `requirements.txt` is three lines — `flask`, `flask-cors`,
`anthropic` — derived by reading every import in `backend/src/evaluation/**`, and
a CI job installs *only* that file in a clean interpreter and boots the function,
so an added import fails there instead of 500ing in production.

CORS still matters after the cutover: `backend/src/evaluation/config.py` keeps
`https://ucberkeley-ml-ai-capstone.com` in `DEFAULT_ORIGINS` because that is a
**different repository's** live site calling this backend.

### Environment variables (evaluation backend)

All of them live in `backend/.env.example` with their defaults.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (empty) | Enables the AI judge and the tutor. Empty → degraded mode: tests, cards and fallback hints still work |
| `ANTHROPIC_MODEL` / `EVAL_MODEL` | `claude-sonnet-5` | Model id; `EVAL_MODEL` overrides for the judge and tutor only |
| `EVAL_EFFORT` | `medium` | `low`, `medium`, `high`, `xhigh` or `max` |
| `EVAL_MAX_TOKENS` | `16000` | Clamped to 1024..32000 |
| `EVAL_TIMEOUT_S` | `40` | SDK request timeout; the judge does one fast retry on overload |
| `EVAL_AI_DISABLED` | `0` | `1` forces degraded mode even with a key |
| `EVAL_RATE_PER_MIN` | `10` | Per-IP token bucket (burst 5); raise it for local Playwright runs |
| `EVAL_FAKE_JUDGE` | `0` | **Test only.** `1` swaps in the deterministic `FakeJudge` |
| `ALLOWED_ORIGINS` | portfolio + localhost | Comma-separated CORS allow-list for `/evaluate-challenge*` |

### Running the backend tests

No network and no key: `conftest.py` forces `ANTHROPIC_API_KEY` empty.

```bash
python -m pytest backend/tests -q                    # registry, evidence, retrieval, prompts, judge, post-checks, routes, tutor
node --test 'backend/tests/js/*.test.mjs'            # 125: worker contract, execution tracer, every reference/known-bad
python backend/scripts/export_challenges.py --check  # public/docs/data/*.json is in sync with the registry
node backend/scripts/verify_challenges.mjs           # references pass, each known-bad fails exactly its expected set
```

Quote the glob: on Node 22, `node --test backend/tests/js/` treats the directory
as a file. `.github/workflows/backend-tests.yml` runs exactly this set.

To drive the page end to end without a key:

```bash
ANTHROPIC_API_KEY= EVAL_FAKE_JUDGE=1 EVAL_RATE_PER_MIN=600 npm run dev:py
# then `npm run dev` and open http://localhost:3000/docs/learning_algorithm.html
```

### Adding a challenge

The Python registry is the single source of truth; the page renders from the
exported JSON.

1. Create `backend/src/evaluation/challenge_data/<name>.py` with
   `CHALLENGE = Challenge(...)` (copy `mirror_subtree.py`).
2. Import it in `challenge_data/__init__.py` and point the previous challenge's
   `next_challenge_id` at it. Importing the registry runs `validate_registry()`.
3. `python backend/scripts/export_challenges.py` regenerates
   `public/docs/data/challenges.json` and `challenge_solutions.json`; commit both
   (CI runs `--check`).
4. `node backend/scripts/verify_challenges.mjs` proves the reference and
   alternatives pass and each known-bad fails exactly its set.
5. Add a `button.challenge-tab` with `data-challenge-id="<id>"` inside
   `#challenge-tabs` in `public/docs/learning_algorithm.html`.

> ⚠ `public/docs/data/*.json` and `public/docs/js/challenge_*.js` are part of the
> frozen legacy site and are **not** on the R-4 edit allowlist, so regenerating
> the challenge JSON will trip the `legacy-guard` CI job. That is deliberate, not
> a bug: adding a challenge changes bytes at URLs that are live today, and it
> should take a conscious decision to widen the allowlist rather than a commit
> that slides through.

---

## Truth discipline

The page's argument is that every claim on it is checkable. That only works if it
is applied to the page itself.

- **One source of truth for numbers: `data/corpus/*.json`, read through
  `lib/corpus/`.** There is no `lib/facts.ts` and no `content/facts.ts`. ESLint
  bans the contested figures as literals in `app/`, `components/` and `lib/`, and
  points at the accessor instead.
- **A retraction list is enforced, not documented.** Strings that were wrong —
  misattributed third-party statistics, a stale internship season, superseded
  database figures — are banned as literals by ESLint and by a post-build scan
  over the emitted HTML and over the extracted text of `Resume.pdf`.
- **Live figures carry a verification path.** The Fischer lab work is ongoing, so
  its numbers move. `npm run corpus:refresh:fischer` re-queries the source
  database read-only and writes a dated snapshot; a stale snapshot *warns* rather
  than failing, because the database lives outside this repository and CI cannot
  reach it.
- **R² is variance explained, never "predictive accuracy."** The research band
  flags a macro-vs-weighted mislabel in someone else's work; making the same
  class of error about its own number would be disqualifying.

---

## Deployment

Vercel, project root = repository root. `vercel.json` pins
`"framework": "nextjs"` — that pin is what stops Vercel from detecting a Python
framework preset off the root `requirements.txt` and letting Flask own `/`. The
symptom of that failure is unmistakable: `GET /` returns a ~207-byte Flask 404
body instead of the homepage. **Check it on a preview deployment before touching
DNS.**

`vercel.json` also carries per-function limits: 60 s / 1024 MB for
`api/index.py` and `app/api/agent/brief`, 30 s for `app/api/agent/qa`, plus an
`excludeFiles` glob that keeps the corpus, the tests, the frozen legacy site and
the retired Python modules out of the Python function bundle.

**The DNS cutover has its own runbook.** Read it before doing any of it. The
ordering is not obvious, the TLS-issuance gap is real, and the rollback is not a
five-minute operation: re-adding a custom domain to GitHub Pages triggers fresh
certificate provisioning, which GitHub documents as taking up to 24 hours.

---

## License

MIT — see `LICENSE`.
