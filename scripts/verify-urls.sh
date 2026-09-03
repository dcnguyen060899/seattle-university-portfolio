#!/usr/bin/env bash
#
# scripts/verify-urls.sh — assert that no legacy URL broke.
#
#   BASE=https://<preview>.vercel.app                ./scripts/verify-urls.sh   # before DNS
#   BASE=https://seattle-university-portfolio.vercel.app ./scripts/verify-urls.sh
#   BASE=https://duyng-portfolio.com                 ./scripts/verify-urls.sh   # after DNS
#   BASE=http://127.0.0.1:3000                       ./scripts/verify-urls.sh   # against `next start`
#
# Exit 0 = every assertion held. Exit 1 = at least one URL regressed; each is printed.
#
# ─────────────────────────────────────────────────────────────────────────────
# WHY THIS EXISTS, AND WHY IT READS THE GIT INDEX INSTEAD OF A HARDCODED LIST
#
# duyng-portfolio.com is on a résumé and on LinkedIn, and it is served TODAY by
# GitHub Pages, not by Vercel (verified 2026-09-02: apex A records
# 185.199.108-111.153, `server: GitHub.com`, Pages API source
# {branch:"main", path:"/"}). The migration is therefore a DNS cutover: this
# script proves the new host answers every old URL BEFORE a record moves, and
# proves it again afterwards.
#
# The expected byte sizes are read from the files on disk at run time, so the
# list cannot drift from what is actually committed. A file added to public/docs
# is automatically probed; a file deleted from it stops being probed. What it
# CANNOT do is notice that a frozen file's bytes changed — that is the
# legacy-guard job in .github/workflows/ci.yml, which is diff-based.
#
# NEXT.JS public/ SEMANTICS, MEASURED (next@16.3.4, not assumed):
#   - public/docs/news.html is served at /docs/news.html. The EXTENSION IS
#     REQUIRED; /docs/news 404s with no configuration.
#   - Jekyll served BOTH forms, so every extensionless name is a live 200 today.
#     next.config.ts restores them with a `fallback` rewrite whose alternation is
#     an allow-list, which is why section 2 below probes every one of them.
#   - /docs -> 200 via a beforeFiles rewrite to /docs/index.html; /docs/ -> 308
#     -> /docs (Next's trailingSlash normaliser). A /docs -> /docs/ REDIRECT
#     loops forever; do not "fix" the rewrite into one.
#   - `permanent: true` emits 308, NOT 301. Section 3 asserts the exact code the
#     config actually produces, per rule.
#   - Dot-directories under public/ ARE SERVED. Jekyll hid them. Section 5.
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

BASE="${BASE:?set BASE, e.g. BASE=https://duyng-portfolio.com $0}"
BASE="${BASE%/}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ ! -d public/docs ]; then
  echo "FATAL: public/docs does not exist. Run this from the repo root, after the" >&2
  echo "       \`git mv docs public/docs\` migration step." >&2
  exit 1
fi

fail=0
checks=0

# Portable stat. macOS and BSD use -f %z; GNU coreutils uses -c %s.
filesize() { stat -f %z "$1" 2>/dev/null || stat -c %s "$1" 2>/dev/null; }

# Accept-Encoding: identity so %{size_download} is the real byte count and not a
# compressed length. Without it a CDN that negotiates br/gzip would make every
# size assertion meaningless.
CURL=(curl -sS --max-time 30 -H 'Accept-Encoding: identity')

report() { # report <ok|FAIL|SKIP> <path> <detail>
  checks=$((checks + 1))
  case "$1" in
    ok)   printf 'ok   %-58s %s\n' "$2" "$3" ;;
    SKIP) printf 'SKIP %-58s %s\n' "$2" "$3" ;;
    *)    printf 'FAIL %-58s %s\n' "$2" "$3"; fail=1 ;;
  esac
}

# Is BASE a plain local `next start`? `next start` does NOT implement
# vercel.json, so the two /evaluate-challenge rewrites into the Python function
# simply do not exist there — section 6 below is unexercisable, not broken. This
# is the ONLY assertion in the file that depends on the Vercel rewrite layer, so
# it is the only one allowed to skip, it may only skip against a loopback host,
# and it skips loudly. Point PY_BASE at a running Flask (`npm run dev:py`) to
# assert it locally anyway. Against any deployed origin it stays a hard FAIL.
is_local_base() {
  case "$BASE" in
    http://localhost:* | http://127.0.0.1:* | http://[::1]:*) return 0 ;;
    *) return 1 ;;
  esac
}

probe() { # probe <path> <expected-code> [expected-bytes]
  local path="$1" want="$2" bytes="${3:-}" out code size
  out=$("${CURL[@]}" -o /dev/null -w '%{http_code} %{size_download}' "$BASE$path") || {
    report FAIL "$path" 'curl failed'
    return
  }
  code=${out%% *}
  size=${out##* }
  if [ "$code" != "$want" ]; then
    report FAIL "$path" "got $code, want $want"
    return
  fi
  if [ -n "$bytes" ] && [ "$size" != "$bytes" ]; then
    report FAIL "$path" "$size bytes, want $bytes"
    return
  fi
  report ok "$path" "$code${bytes:+ $size B}"
}

redirect() { # redirect <path> <expected-code> <expected-location>
  local path="$1" want="$2" wantloc="$3" out code loc
  out=$("${CURL[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "$BASE$path") || {
    report FAIL "$path" 'curl failed'
    return
  }
  code=${out%% *}
  loc=${out#* }
  if [ "$code" = "$want" ] && [ "$loc" = "$wantloc" ]; then
    report ok "$path" "$code -> $loc"
  else
    report FAIL "$path" "got '$code $loc', want '$want $wantloc'"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# THE EDIT ALLOWLIST — Addendum B, ruling R-4.
#
# public/docs is NOT byte-frozen; it is maintained under an explicit allowlist,
# and these are the ONLY files on it. Everything else under public/docs is
# size-asserted below against its committed bytes.
#
#   index.html         chatbot widget markup + the js/chat.js <script> tag were
#                      stripped (R-3 retires /chat; chat.js is deleted, and
#                      leaving the tag gives every visitor a console 404).
#   js/mcp-tools.js    the stale `seeking` / `startDate` availability block. It
#                      named a 2026 internship season; availability is Summer
#                      2027 (Addendum A.4 / B.1 #3), and the old season string is
#                      on the R-19 hard-fail retraction list, so it is not
#                      repeated here.
#   resume_content.html generated from the corpus (R-6) by `npm run gen:resume`,
#                      which another territory owns. Its size changes whenever a
#                      claim changes; asserting a byte count here would fail the
#                      harness on the first corpus edit, forever.
#
# These three still MUST return 200 — they are exempt from the SIZE assertion,
# not from existing. Adding a fourth entry here is a decision about the frozen
# legacy site and needs a ruling, not a commit.
# ─────────────────────────────────────────────────────────────────────────────
size_exempt() {
  case "$1" in
    public/docs/index.html | public/docs/js/mcp-tools.js | public/docs/resume_content.html) return 0 ;;
    *) return 1 ;;
  esac
}

echo
echo "verify-urls  BASE=$BASE"
echo "             $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

# ── 1. every frozen legacy file, byte-for-byte, straight out of the git index ─
echo "── 1. frozen legacy files (public/docs) ──────────────────────────────────"
while IFS= read -r f; do
  case "$f" in
    # Private working files. Asserted 404 in section 5, not 200 here.
    public/docs/.claude/*) continue ;;
  esac
  [ -f "$f" ] || continue
  if size_exempt "$f"; then
    probe "/${f#public/}" 200
  else
    probe "/${f#public/}" 200 "$(filesize "$f")"
  fi
done < <(git ls-files public/docs)

# ── 2. extensionless variants (GitHub Pages / Jekyll clean-URL parity) ───────
echo
echo "── 2. extensionless page names (Jekyll parity) ───────────────────────────"
echo "     Every one of these is a live 200 on GitHub Pages today. Next.js"
echo "     answers them only through the FROZEN_PAGES allow-list in next.config.ts."
while IFS= read -r f; do
  n=$(basename "$f" .html)
  probe "/docs/$n" 200
done < <(git ls-files 'public/docs/*.html')

# ── 3. the redirects ────────────────────────────────────────────────────────
echo
echo "── 3. redirects for deleted content (Addendum B, R-4) ────────────────────"
echo "     The owner said 'delete outright'. That is about the CONTENT. A résumé"
echo "     domain must not 404 on an inbound link, so the URLs stay alive."
# The page being replaced. `permanent: true` -> 308.
redirect /index.html                                308 "$BASE/"
redirect /index                                     308 "$BASE/"
redirect /docs/index_portfolio.html                 308 "$BASE/"
redirect /docs/index_portfolio                      308 "$BASE/"
# R-4 specifies a literal 301 for these two; next.config.ts uses `statusCode: 301`.
redirect /docs/index_gpa_analysis.html              301 "$BASE/"
redirect /docs/index_gpa_analysis                   301 "$BASE/"
redirect /docs/index_independent_research.html      301 "$BASE/#research"
redirect /docs/index_independent_research           301 "$BASE/#research"

# ── 4. the /docs directory index ────────────────────────────────────────────
echo
echo "── 4. /docs and /docs/ ───────────────────────────────────────────────────"
# public/docs/index.html is on the R-4 allowlist (the chatbot widget was
# stripped), so this asserts reachability, not a byte count.
probe /docs 200
redirect /docs/ 308 "$BASE/docs"

# ── 5. things that MUST NOT be reachable ────────────────────────────────────
echo
echo "── 5. must NOT be reachable ──────────────────────────────────────────────"
echo "     5a. private working files. Jekyll hides dot-directories; NEXT.JS DOES"
echo "         NOT (measured). Two independent guards keep them 404: a"
echo "         next.config.ts rewrite and a /public/docs/.claude line in"
echo "         .vercelignore. If either is removed these turn 200."
while IFS= read -r f; do
  probe "/${f#public/}" 404
done < <(git ls-files 'public/docs/.claude/*')

echo "     5b. retired API surface (Addendum B, R-3). /chat is not ported; it is"
echo "         gone, along with the stale base_qa corpus behind it."
probe /chat 404
probe /classify-image 404
probe /api-check 404
probe /docs/js/chat.js 404

echo "     5c. repository source. GitHub Pages published the WHOLE repo; the new"
echo "         host serves public/ only. Ending that is a security improvement,"
echo "         not a regression — but it has to actually be true."
for p in /backend/src/app.py \
         /backend/src/evaluation/judge.py \
         /second-brain/ARCHITECTURE.html \
         /api/index.py \
         /requirements.txt \
         /vercel.json \
         /package.json \
         /images/roc_nn.png \
         /CNAME; do
  probe "$p" 404
done

# ── 6. the live API surface ─────────────────────────────────────────────────
echo
echo "── 6. surviving Python surface (/evaluate-challenge, still Flask) ────────"
echo "     public/docs/learning_algorithm.html depends on this and it has a real"
echo "     pytest + node suite. It was never a candidate for porting."
PY_BASE="${PY_BASE:-$BASE}"
PY_BASE="${PY_BASE%/}"
health=$("${CURL[@]}" "$PY_BASE/evaluate-challenge/health" 2>/dev/null)
if printf '%s' "$health" | grep -q '"version": *"2"'; then
  report ok /evaluate-challenge/health "version 2${PY_BASE:+ @ $PY_BASE}"
elif [ "$PY_BASE" = "$BASE" ] && is_local_base; then
  # `next start` has no vercel.json rewrite layer, so this route cannot exist
  # here. Skipped, never silently: run `npm run dev:py` and re-run with
  # PY_BASE=http://127.0.0.1:5328 to assert it, or use a preview deploy.
  report SKIP /evaluate-challenge/health 'no vercel.json rewrite layer under `next start` — set PY_BASE to assert'
else
  report FAIL /evaluate-challenge/health "unexpected body: $(printf '%s' "$health" | head -c 160)"
fi

# ── 7. the new surfaces ─────────────────────────────────────────────────────
echo
echo "── 7. the new site ───────────────────────────────────────────────────────"
root=$("${CURL[@]}" -o /dev/null -w '%{http_code} %{size_download}' "$BASE/")
root_code=${root%% *}
root_size=${root##* }
if [ "$root_code" = 200 ] && [ "$root_size" -gt 2000 ]; then
  report ok / "200 $root_size B"
else
  # The old root was a 530-byte <meta refresh> to docs/index_portfolio.html. If
  # "/" is still ~530 bytes, the Next app is not the thing answering.
  report FAIL / "got '$root_code $root_size B' — expected the Next homepage, not the 530-byte meta-refresh"
fi

# R-13: a production deploy that forgets AGENT_DEMO_MODE=0 serves canned briefs
# forever while announcing it. This is the assertion that catches it. Advisory
# unless EXPECT_LIVE_AGENT=1, because the endpoint does not exist during the
# early migration steps and a preview deploy is legitimately in demo mode.
agent_health=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/agent/health")
if [ "$agent_health" = 200 ]; then
  mode=$("${CURL[@]}" "$BASE/api/agent/health" | tr -d ' \n' | sed -n 's/.*"mode":"\([a-z]*\)".*/\1/p')
  if [ "${EXPECT_LIVE_AGENT:-0}" = 1 ] && [ "$mode" != live ]; then
    report FAIL /api/agent/health "mode=$mode, want live (AGENT_DEMO_MODE=0 was never set on this deploy)"
  else
    report ok /api/agent/health "mode=${mode:-unknown}"
  fi
elif [ "${EXPECT_LIVE_AGENT:-0}" = 1 ]; then
  report FAIL /api/agent/health "got $agent_health, want 200"
else
  printf 'skip %-58s %s\n' /api/agent/health "not deployed yet ($agent_health)"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "PASS — $checks assertions held against $BASE"
else
  echo "FAIL — at least one URL regressed against $BASE (see above); $checks assertions run"
fi
exit $fail
