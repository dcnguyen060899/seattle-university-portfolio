#!/usr/bin/env node
/**
 * backend/scripts/verify_challenges.mjs - spec 2.7 (Node >= 20, no npm dependencies).
 *
 * Loads the private registry export (python backend/scripts/export_challenges.py --stdout --include-private),
 * loads docs/js/challenge_worker.js through createRequire (the real browser harness) and asserts, per challenge:
 *   - the reference solution and every accepted alternative pass every test;
 *   - every known-bad submission fails EXACTLY expected_failing_ids (set equality; error/timeout count as failing);
 *   - the starter code fails at least one test;
 *   - docs/data/challenges.json tests deep-equal the private tests (id, args, expected) and share tests_hash;
 *   - every test finishes under 100 ms;
 *   - the compile prefix is the worker's own "use strict" wrapper (strict-mode probe).
 * Exit 1 on any violation. The functions are also exported for backend/tests/js/challenges.test.mjs.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");
export const WORKER_PATH = path.join(REPO_ROOT, "docs", "js", "challenge_worker.js");
export const EXPORT_SCRIPT = path.join(HERE, "export_challenges.py");
export const PUBLIC_JSON = path.join(REPO_ROOT, "docs", "data", "challenges.json");
export const SOLUTIONS_JSON = path.join(REPO_ROOT, "docs", "data", "challenge_solutions.json");
export const MAX_TEST_MS = 100;

const require = createRequire(import.meta.url);
export const worker = require(WORKER_PATH);

let pythonCache = null;
export function pythonCommand() {
  if (pythonCache) return pythonCache;
  const candidates = [process.env.PYTHON, "python3", "python"].filter(Boolean);
  for (const cand of candidates) {
    try {
      execFileSync(cand, ["-c", "import sys; assert sys.version_info >= (3, 10)"], { stdio: "ignore" });
      pythonCache = cand;
      return cand;
    } catch (e) { /* try the next one */ }
  }
  throw new Error("no Python >= 3.10 found on PATH (set PYTHON=/path/to/python)");
}

export function loadPrivateExport() {
  const out = execFileSync(pythonCommand(), [EXPORT_SCRIPT, "--stdout", "--include-private"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
}

export function loadPublicExport() { return JSON.parse(readFileSync(PUBLIC_JSON, "utf8")); }
export function loadSolutionsExport() { return JSON.parse(readFileSync(SOLUTIONS_JSON, "utf8")); }

/* Same status rule as challenge_runner.js (3.2): error -> "error"; undefined -> "fail"; else Object.is. */
export function statusOf(result, expected) {
  if (result.error !== null) return "error";
  if (result.actual_type === "undefined") return "fail";
  return Object.is(result.actual, expected) ? "pass" : "fail";
}

function allWithError(challenge, error, kind) {
  return {
    compiled: { ok: false, error, error_kind: kind, entry_found: false },
    results: challenge.tests.map((t) => ({ id: t.id, expected: t.expected, actual: null, actual_type: "error", error, ms: 0, status: "error" })),
  };
}

/* Compile once (factory), run every test through the worker's runOne with a fresh instance per test. */
export function runSuite(code, challenge) {
  let factory;
  try {
    factory = worker.compileLearnerCode(code, challenge.entry_function);
  } catch (e) {
    return allWithError(challenge, "compile: " + String((e && e.message) || e), e instanceof SyntaxError ? "syntax" : "load");
  }
  try {
    if (typeof factory() !== "function") return allWithError(challenge, "entry function " + challenge.entry_function + " not defined", "load");
  } catch (e) {
    return allWithError(challenge, "load: " + String((e && e.message) || e), "load");
  }
  const results = challenge.tests.map((t) => {
    const r = worker.runOne(factory, { id: t.id, args: t.args }, challenge.arg_types);
    return { ...r, expected: t.expected, status: statusOf(r, t.expected) };
  });
  return { compiled: { ok: true, error: null, error_kind: null, entry_found: true }, results };
}

export function failingIds(suite) {
  return suite.results.filter((r) => r.status !== "pass").map((r) => r.id).sort();
}

export function sameSet(a, b) {
  const sa = new Set(a), sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

export function jaccard(a, b) {
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function describe(suite) {
  return suite.results.filter((r) => r.status !== "pass")
    .map((r) => `${r.id}(exp ${JSON.stringify(r.expected)}, got ${r.error ? "ERR " + r.error : JSON.stringify(r.actual)})`)
    .join(", ") || "none";
}

/* Returns { problems: string[], lines: string[] } for one challenge. */
export function verifyChallenge(ch, pubCh) {
  const problems = [];
  const lines = [];
  const slow = [];
  const noteSlow = (label, suite) => {
    for (const r of suite.results) if (r.ms >= MAX_TEST_MS) slow.push(`${label} ${r.id} took ${r.ms} ms`);
  };

  lines.push(`==== ${ch.id} (${ch.entry_function}, ${ch.tests.length} tests) ====`);

  const ref = runSuite(ch.reference_solution, ch);
  noteSlow("reference", ref);
  const refFails = failingIds(ref);
  lines.push(`reference: ${ch.tests.length - refFails.length}/${ch.tests.length} passed` + (refFails.length ? `  FAILS ${describe(ref)}` : ""));
  if (refFails.length) problems.push(`${ch.id}: reference fails ${refFails.join(",")}`);
  lines.push(`reference total ${ref.results.reduce((s, r) => s + r.ms, 0).toFixed(2)} ms`);

  (ch.accepted_alternatives || []).forEach((alt, i) => {
    const s = runSuite(alt, ch);
    noteSlow(`alternative ${i + 1}`, s);
    const f = failingIds(s);
    lines.push(`alternative ${i + 1}: ${ch.tests.length - f.length}/${ch.tests.length} passed` + (f.length ? `  FAILS ${describe(s)}` : ""));
    if (f.length) problems.push(`${ch.id}: accepted alternative ${i + 1} fails ${f.join(",")}`);
  });

  for (const kb of ch.known_bad || []) {
    const s = runSuite(kb.code, ch);
    noteSlow(`known-bad ${kb.id}`, s);
    const f = failingIds(s);
    const ok = sameSet(f, kb.expected_failing_ids);
    lines.push(`${ok ? "OK      " : "MISMATCH"} known-bad ${kb.id.padEnd(28)} (card ${kb.card_id}) fails: ${describe(s)}`);
    if (!ok) problems.push(`${ch.id}: known-bad ${kb.id} fails [${f.join(",")}] but expected [${[...kb.expected_failing_ids].sort().join(",")}]`);
  }

  const starter = runSuite(ch.starter_code, ch);
  const starterFails = failingIds(starter);
  lines.push(`starter fails ${starterFails.length}/${ch.tests.length}`);
  if (!starterFails.length) problems.push(`${ch.id}: starter code passes every test`);

  if (!pubCh) {
    problems.push(`${ch.id}: missing from docs/data/challenges.json`);
  } else {
    const strip = (tests) => tests.map((t) => ({ id: t.id, args: t.args, expected: t.expected }));
    if (JSON.stringify(strip(pubCh.tests)) !== JSON.stringify(strip(ch.tests))) problems.push(`${ch.id}: public tests differ from private tests (re-run the export)`);
    if (pubCh.tests_hash !== ch.tests_hash) problems.push(`${ch.id}: public tests_hash ${pubCh.tests_hash} != private ${ch.tests_hash}`);
    for (const key of ["reference_solution", "accepted_alternatives", "known_bad", "judge_notes", "fallback_hints", "solution_notes", "stretch_goal"]) {
      if (key in pubCh) problems.push(`${ch.id}: public export leaks ${key}`);
    }
    for (const card of pubCh.misconceptions || []) {
      if ("why" in card || "fix_direction" in card) problems.push(`${ch.id}: public card ${card.id} leaks why/fix_direction`);
    }
  }

  if (slow.length) problems.push(`${ch.id}: slow tests: ${slow.join("; ")}`);
  return { problems, lines };
}

/* Strict-mode probe: the worker's wrapper must make an implicit global a ReferenceError. */
export function verifyStrictWrapper() {
  const problems = [];
  if (!String(worker.compileLearnerCode).includes('"use strict"')) problems.push("compileLearnerCode does not prepend \"use strict\"");
  const factory = worker.compileLearnerCode("function probe() { implicitGlobal = 1; return implicitGlobal; }", "probe");
  const r = worker.runOne(factory, { id: "probe", args: [] }, []);
  if (!r.error || !/implicitGlobal is not defined/.test(r.error)) problems.push("strict mode is not enforced by the worker wrapper: " + JSON.stringify(r));
  return problems;
}

export function verifyAll(priv, pub) {
  const problems = [];
  const lines = [];
  const pubById = new Map((pub.challenges || []).map((c) => [c.id, c]));
  if (pub.registry_hash !== priv.registry_hash) problems.push(`docs/data/challenges.json registry_hash ${pub.registry_hash} != registry ${priv.registry_hash} (re-run the export)`);
  for (const ch of priv.challenges) {
    const r = verifyChallenge(ch, pubById.get(ch.id));
    problems.push(...r.problems);
    lines.push(...r.lines);
  }
  problems.push(...verifyStrictWrapper());
  return { problems, lines };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const priv = loadPrivateExport();
  const pub = loadPublicExport();
  const { problems, lines } = verifyAll(priv, pub);
  for (const l of lines) console.log(l);
  if (problems.length) {
    console.error("\nVERIFY FAILED:");
    for (const p of problems) console.error(" - " + p);
    process.exit(1);
  }
  console.log(`\nALL OK: ${priv.challenges.length} challenges, ${priv.challenges.reduce((s, c) => s + c.tests.length, 0)} tests, registry_hash ${priv.registry_hash}`);
}
