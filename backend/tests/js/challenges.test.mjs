// node --test backend/tests/js/   (Node >= 20, no npm deps)
// Everything in spec 2.7's verify list, through the real docs/js/challenge_worker.js exports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  REPO_ROOT, MAX_TEST_MS, worker, loadPrivateExport, loadPublicExport, loadSolutionsExport,
  runSuite, failingIds, sameSet, jaccard, verifyStrictWrapper,
} from "../../scripts/verify_challenges.mjs";

const priv = loadPrivateExport();
const pub = loadPublicExport();
const sols = loadSolutionsExport();
const pubById = new Map(pub.challenges.map((c) => [c.id, c]));

// Known-bads whose card signature was derived from a sibling variant (spec 2.3/2.4 map two variants to one card):
// their failing set is not the card's signature, so nearest-signature retrieval may rank another card first.
const SECONDARY_KNOWN_BAD = { countSubtrees: ["root_value_only"], fuzzySubtree: ["exact_only"] };

test("private export lists the three challenges in order", () => {
  assert.deepEqual(priv.challenges.map((c) => c.id), ["countSubtrees", "fuzzySubtree", "mirrorSubtree"]);
  assert.deepEqual(priv.challenges.map((c) => c.order), [1, 2, 3]);
  assert.deepEqual(priv.challenges.map((c) => c.tests.length), [12, 17, 12]);
  assert.equal(pub.registry_hash, priv.registry_hash);
  assert.equal(sols.registry_hash, priv.registry_hash);
  assert.equal(pub.schema_version, 1);
  assert.equal(pub.harness_version, "1");
});

for (const ch of priv.challenges) {
  test(`${ch.id}: reference solution passes all ${ch.tests.length} tests`, () => {
    const s = runSuite(ch.reference_solution, ch);
    assert.equal(s.compiled.ok, true);
    assert.deepEqual(failingIds(s), []);
    assert.equal(sols.solutions[ch.id].reference_solution, ch.reference_solution);
  });

  ch.accepted_alternatives.forEach((alt, i) => {
    test(`${ch.id}: accepted alternative ${i + 1} passes all tests`, () => {
      assert.deepEqual(failingIds(runSuite(alt, ch)), []);
      assert.equal(sols.solutions[ch.id].accepted_alternatives[i], alt);
    });
  });

  for (const kb of ch.known_bad) {
    test(`${ch.id}: known-bad ${kb.id} fails exactly [${[...kb.expected_failing_ids].sort().join(", ")}]`, () => {
      const s = runSuite(kb.code, ch);
      const f = failingIds(s);
      assert.ok(sameSet(f, kb.expected_failing_ids), `failing set ${JSON.stringify(f)} != expected ${JSON.stringify([...kb.expected_failing_ids].sort())}`);
      assert.ok(ch.misconceptions.some((m) => m.id === kb.card_id), `card ${kb.card_id} exists`);
    });
  }

  test(`${ch.id}: starter code compiles, defines the entry and fails at least one test`, () => {
    const s = runSuite(ch.starter_code, ch);
    assert.equal(s.compiled.ok, true);
    assert.equal(s.compiled.entry_found, true);
    assert.ok(failingIds(s).length >= 1);
  });

  test(`${ch.id}: public tests deep-equal private tests and share tests_hash`, () => {
    const pc = pubById.get(ch.id);
    assert.ok(pc, "present in docs/data/challenges.json");
    const strip = (tests) => tests.map((t) => ({ id: t.id, args: t.args, expected: t.expected }));
    assert.deepEqual(strip(pc.tests), strip(ch.tests));
    assert.equal(pc.tests_hash, ch.tests_hash);
    assert.equal(pc.entry_function, ch.entry_function);
    assert.deepEqual(pc.arg_types, ch.arg_types);
    for (const key of ["reference_solution", "accepted_alternatives", "known_bad", "judge_notes", "fallback_hints"]) assert.ok(!(key in pc), `public export must not carry ${key}`);
    for (const card of pc.misconceptions) assert.ok(!("why" in card) && !("fix_direction" in card), `card ${card.id} leaks`);
  });

  test(`${ch.id}: every test finishes under ${MAX_TEST_MS} ms (reference, alternatives, known-bad, starter)`, () => {
    const codes = [ch.reference_solution, ch.starter_code, ...ch.accepted_alternatives, ...ch.known_bad.map((k) => k.code)];
    for (const code of codes) {
      for (const r of runSuite(code, ch).results) assert.ok(r.ms < MAX_TEST_MS, `${r.id} took ${r.ms} ms`);
    }
  });

  test(`${ch.id}: card signatures are distinct and each known-bad is nearest to its own card`, () => {
    const sigCards = ch.misconceptions.filter((m) => m.signature_failing_ids.length);
    const seen = new Set();
    for (const m of sigCards) {
      const key = [...m.signature_failing_ids].sort().join(",");
      assert.ok(!seen.has(key), `duplicate signature ${key}`);
      seen.add(key);
      for (const id of m.signature_failing_ids) assert.ok(ch.tests.some((t) => t.id === id), `${m.id}: ${id} exists`);
    }
    const secondary = [];
    for (const kb of ch.known_bad) {
      const card = ch.misconceptions.find((m) => m.id === kb.card_id);
      const observed = failingIds(runSuite(kb.code, ch));
      if (card.signature_failing_ids.length) {
        const own = jaccard(observed, card.signature_failing_ids);
        if (own === 1) {
          for (const other of sigCards) if (other.id !== card.id) assert.ok(jaccard(observed, other.signature_failing_ids) < own, `${kb.id}: ${other.id} ties or beats ${card.id}`);
        } else {
          secondary.push(kb.id);   // a variant mapped to a card whose signature came from a sibling variant
        }
      } else if (card.uniform_rule === "actual_undefined") {
        const rows = runSuite(kb.code, ch).results;
        const n = rows.filter((r) => r.status === "fail" && r.actual_type === "undefined").length;
        assert.ok(n >= 0.8 * rows.length, `${kb.id}: only ${n}/${rows.length} rows are undefined`);
      } else if (card.uniform_rule === "actual_boolean") {
        const rows = runSuite(kb.code, ch).results;
        const n = rows.filter((r) => r.status === "fail" && r.actual_type === "boolean").length;
        assert.ok(n >= 0.8 * rows.length, `${kb.id}: only ${n}/${rows.length} rows are boolean`);
      } else if (card.error_pattern) {
        const rows = runSuite(kb.code, ch).results;
        const re = new RegExp(card.error_pattern);
        const failing = rows.filter((r) => r.status !== "pass");
        assert.ok(failing.length >= 1 && failing.every((r) => r.status === "error" && re.test(r.error)), `${kb.id}: every failing row must be an error matching ${card.error_pattern}`);
      }
    }
    assert.deepEqual(secondary, SECONDARY_KNOWN_BAD[ch.id] || [], "secondary variants are exactly the documented ones");
  });
}

test("fuzzySubtree: the page's former reference is a known-bad that fails exactly fz-06 and fz-15", () => {
  const fuzzy = priv.challenges.find((c) => c.id === "fuzzySubtree");
  const kb = fuzzy.known_bad.find((k) => k.id === "page_old_reference");
  assert.ok(kb);
  assert.equal(kb.card_id, "split_budget");
  assert.ok(kb.code.includes("function fuzzySameTree(p, q, maxDifferences, differences = 0)"));
  assert.deepEqual(failingIds(runSuite(kb.code, fuzzy)), ["fz-06", "fz-15"]);
});

test("mirrorSubtree: mr-11 pattern is the mirror image of the 20-node subtree at heap index 5", () => {
  const mirror = priv.challenges.find((c) => c.id === "mirrorSubtree");
  const t = mirror.tests.find((x) => x.id === "mr-11");
  const count = (n) => (n ? 1 + count(n.left) + count(n.right) : 0);
  assert.equal(count(worker.buildTree(t.args[0])), 100);
  assert.equal(count(worker.buildTree(t.args[1])), 20);
  assert.equal(t.args[1][0], 5);
  assert.deepEqual(t.args[1].slice(0, 3), [5, 12, 11]);
});

test("worker wrapper enforces strict mode", () => {
  assert.deepEqual(verifyStrictWrapper(), []);
});

test("writes the cross-language SHA-256 fixture (tests/fixtures/sha.json)", () => {
  const input = "function f(){}\n// é\n";
  const sha256 = createHash("sha256").update(input, "utf8").digest("hex");
  assert.equal(sha256.length, 64);
  const dir = path.join(REPO_ROOT, "backend", "tests", "fixtures");
  mkdirSync(dir, { recursive: true });
  const payload = {
    note: "SHA-256 over the UTF-8 bytes of `input`, computed by Node (backend/tests/js/challenges.test.mjs); test_schemas.py must reproduce `sha256` from `input`.",
    input,
    sha256,
  };
  writeFileSync(path.join(dir, "sha.json"), JSON.stringify(payload, null, 1) + "\n", "utf8");
});
