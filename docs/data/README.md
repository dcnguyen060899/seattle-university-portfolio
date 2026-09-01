<!--
localStorage state schema used by docs/js/challenge_mode.js (spec 8.6/8.8 + addendum B4).
Documented here because this directory is the page's data contract. Every storage access is
wrapped in try/catch; when storage throws, the same object lives in memory only and the status
line appends "(progress isn't being saved in this browser)".

Key "sua.challenge.v1.<challengeId>"   (one entry per challenge id from challenges.json)
{
  "attempts": 3,                  // integer >= 0; counted runs of CHANGED code (attemptHash differs from lastAttemptHash)
  "bestScore": 81,                // integer 0..100 or null; best AI `overall` so far
  "bestPassed": 15,               // integer >= 0; most tests passed in one local run
  "totalTests": 17,               // integer; catalog size at the time of the best run
  "hintsRevealed": 2,             // integer 0..3; ladder hints revealed (hints_used = [1..hintsRevealed])
  "solved": false,                // boolean; every test passed in a local run
  "solutionRevealed": false,      // boolean; the reference solution was opened
  "gaveUp": false,                // boolean; "I give up" confirmed
  "gaveUpAtAttempt": null,        // integer or null
  "aiReviews": 1,                 // integer >= 0; completed AI reviews
  "lastAttemptHash": "a1b2...",   // sha256 hex of the normalized code of the last counted attempt, or null
  "lastAiCodeHash": "a1b2...",    // sha256 hex of the normalized code of the last AI review, or null
  "draftCode": "...",             // string; editor contents (saved on input, 500 ms debounce)
  "lastEvaluationAt": "2026-09-01T18:02:11Z",   // ISO-8601 or null
  "tutorRemaining": 5,            // integer 0..5 (addendum B4): tutor questions left; initial 5, -1 per answered
                                  // question (errors refund), reset to 5 when a new AI review completes
  "tutorResetAt": "2026-09-01T18:02:11Z"        // ISO-8601 or null; when tutorRemaining was last reset to 5
}
Key "sua.challenge.v1.lastChallengeId" -> the challenge id selected last (string)
-->

# docs/data - generated challenge definitions

**Generated files. Do not edit by hand.** The single source of truth is the Python registry in
`backend/src/evaluation/registry.py` + `backend/src/evaluation/challenge_data/`. Regenerate with

```
python backend/scripts/export_challenges.py            # writes both files
python backend/scripts/export_challenges.py --check    # exit 1 when the committed files are stale (Render build, CI)
node backend/scripts/verify_challenges.mjs             # runs references, alternatives and known-bad submissions
                                                       # through docs/js/challenge_worker.js
```

`backend/tests/test_export_sync.py` fails when these files differ from the in-memory export.

## Files

- `challenges.json` - everything the page needs (spec 2.7): `schema_version`, `harness_version`, `registry_hash`,
  `tree_encoding`, `tag_dimension`, `tag_labels`, and one entry per challenge with the spec text, examples,
  constraints, signature, `entry_function`, `param_names`, `arg_types`, `return_type`, `has_budget_arg`,
  `starter_code`, `target_complexity`, `key_concepts`, the full test catalog (`id`, `tag`, `name`, `args`,
  `expected`, `why`, `gen_desc`), `tests_hash`, the static hint ladder, the public part of the misconception
  cards (`id`, `title`, `symptom`, `question`, `signature_failing_ids`, `error_pattern`, `uniform_rule`), the
  rubric weights and `next_challenge_id`. It never contains reference solutions, accepted alternatives,
  known-bad submissions, judge notes, fallback hints or a card's `why`/`fix_direction`.
- `challenge_solutions.json` - `{"registry_hash", "solutions": {"<id>": {"reference_solution",
  "solution_notes", "stretch_goal", "accepted_alternatives"}}}`; fetched by the page only when the learner
  reveals the solution (a UX gate, not security).

Serialization is `json.dumps(obj, sort_keys=True, indent=1, ensure_ascii=False) + "\n"` with no timestamps,
so the files only change when the registry changes.

## Conventions the consumers rely on

- **Tree encoding**: level-order arrays, LeetCode convention. `arr[0]` is the root, `null` marks a missing
  child, child slots are consumed only for non-null nodes, trailing nulls may be omitted, `[]`/`[null]` is the
  empty tree. Nodes handed to learner code are plain `{val, left, right}`. `buildTree` in
  `docs/js/challenge_worker.js` and `build_tree` in `registry.py` are the same algorithm.
- **`args`** are positional; trees are arrays, `maxDifferences` is an integer. The harness passes exactly
  `args.length` arguments, so a test that omits the third argument exercises the JavaScript default parameter.
- **`gen_desc`** (large inputs only) is a complete prose rendering of the tree arguments, already formatted as
  `root = <prose or literal>, subRoot = <prose or literal>`. Consumers print `gen_desc` when it is non-empty
  instead of `root = [...], subRoot = [...]`, then append `, maxDifferences = k` when a third argument is present.
- **`tests_hash`** = first 16 hex chars of sha256 over the canonical JSON (`sort_keys`, `(",", ":")`
  separators) of `[{"id", "args", "expected"}, ...]`; the page echoes it in `client_results` and the server
  discards results whose hash does not match its own catalog. **`registry_hash`** = same digest over the
  private views of all challenges; `/evaluate-challenge/health` reports it.
- **Pass/fail** is strict: `expected` is a JSON boolean or integer; `true` never equals `1`.
- **Card kinds**: exactly one of `signature_failing_ids` (Jaccard retrieval over failing test ids),
  `error_pattern` (regex over runtime error messages) or `uniform_rule` (`actual_undefined` on every challenge;
  `actual_boolean` only on integer-returning challenges) is set per card.
- **Ids are stable forever**: test ids (`cs-01..12`, `fz-01..17`, `mr-01..12`), card ids and challenge ids are
  referenced by feedback, evidence chips and localStorage.
