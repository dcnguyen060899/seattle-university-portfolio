// node --test backend/tests/js/   (Node >= 20, no npm deps)
// Worker contract (spec 3.1) through the CommonJS exports, plus the message protocol via a simulated worker scope.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(HERE, "..", "..", "..", "docs", "js", "challenge_worker.js");
const require = createRequire(import.meta.url);
const { buildTree, compileLearnerCode, runOne, serializeActual, definedFunctions } = require(WORKER_PATH);

const RESULT_KEYS = ["id", "actual", "actual_type", "error", "ms"];
const run = (code, entry, args = [], argTypes = []) => runOne(compileLearnerCode(code, entry), { id: "t", args }, argTypes);

test("buildTree follows the LeetCode level-order convention", () => {
  const t = buildTree([1, 2, 3, 4, 5, null, null, 6]);
  assert.equal(t.val, 1);
  assert.equal(t.left.val, 2);
  assert.equal(t.right.val, 3);
  assert.equal(t.left.left.val, 4);
  assert.equal(t.left.right.val, 5);
  assert.equal(t.left.left.left.val, 6, "6 is the left child of 4 (nulls never get child slots)");
  assert.equal(t.left.left.right, null);
  assert.equal(t.right.left, null);
  assert.equal(t.right.right, null);
  assert.deepEqual(Object.keys(t), ["val", "left", "right"]);
});

test("buildTree: [] and [null] are the empty tree; right-only child; oversized input throws", () => {
  assert.equal(buildTree([]), null);
  assert.equal(buildTree([null]), null);
  assert.equal(buildTree(null), null);
  assert.equal(buildTree(undefined), null);
  const r = buildTree([1, null, 2]);
  assert.equal(r.left, null);
  assert.equal(r.right.val, 2);
  assert.throws(() => buildTree(new Array(10001).fill(1)), /too large/);
});

test("result objects have exactly id, actual, actual_type, error, ms", () => {
  const r = run("function f(a, b) { return a.val + b; }", "f", [[7], 3], ["tree", "int"]);
  assert.deepEqual(Object.keys(r).sort(), [...RESULT_KEYS].sort());
  assert.equal(r.actual, 10);
  assert.equal(r.actual_type, "number");
  assert.equal(r.error, null);
  assert.equal(typeof r.ms, "number");
  assert.ok(r.ms >= 0);
});

test("a throwing function yields error text and a null actual", () => {
  const r = run("function f() { throw new Error('boom'); }", "f");
  assert.equal(r.error, "boom");
  assert.equal(r.actual, null);
  assert.equal(r.actual_type, "error");
});

test("a null dereference reports the engine message", () => {
  const r = run("function f(root) { return root.val; }", "f", [[]], ["tree"]);
  assert.match(r.error, /Cannot read propert(y|ies) of null/);
  assert.equal(r.actual_type, "error");
});

test("infinite recursion yields a Maximum call stack error", () => {
  const r = run("function f(n) { return f(n); }", "f", [1]);
  assert.match(r.error, /Maximum call stack/);
});

test("error text is truncated to 200 characters", () => {
  const r = run("function f() { throw new Error('x'.repeat(500)); }", "f");
  assert.equal(r.error.length, 200);
});

test("undefined return -> actual \"undefined\", actual_type \"undefined\"", () => {
  const r = run("function f() { }", "f");
  assert.equal(r.actual, "undefined");
  assert.equal(r.actual_type, "undefined");
  assert.equal(r.error, null);
});

test("strict mode turns an implicit global into a ReferenceError", () => {
  const r = run("function f() { leaked = 1; return leaked; }", "f");
  assert.match(r.error, /leaked is not defined/);
});

test("a function returning a function -> actual_type \"function\", no throw", () => {
  const r = run("function f() { return function inner() {}; }", "f");
  assert.equal(r.error, null);
  assert.equal(r.actual_type, "function");
  assert.equal(typeof r.actual, "string");
});

test("a hostile toString -> \"[unprintable object]\"", () => {
  const r = run("function f() { return { toString() { throw new Error('nope'); } }; }", "f");
  assert.equal(r.error, null);
  assert.equal(r.actual, "[unprintable object]");
  assert.equal(r.actual_type, "object");
});

test("serializeActual never returns non-cloneable values", () => {
  assert.deepEqual(serializeActual(undefined), { actual: "undefined", actual_type: "undefined" });
  assert.deepEqual(serializeActual(null), { actual: null, actual_type: "null" });
  assert.deepEqual(serializeActual(true), { actual: true, actual_type: "boolean" });
  assert.deepEqual(serializeActual(3), { actual: 3, actual_type: "number" });
  assert.deepEqual(serializeActual(Infinity), { actual: "Infinity", actual_type: "number" });
  assert.deepEqual(serializeActual(NaN), { actual: "NaN", actual_type: "number" });
  assert.deepEqual(serializeActual("x".repeat(300)).actual.length, 100);
  assert.deepEqual(serializeActual(10n), { actual: "10n", actual_type: "bigint" });
  assert.deepEqual(serializeActual(Symbol("s")).actual_type, "symbol");
  assert.deepEqual(serializeActual([1, 2]), { actual: "1,2", actual_type: "object" });
  for (const v of [undefined, null, true, 1, "s", 2n, Symbol("q"), () => {}, { toString() { throw new Error("x"); } }]) {
    assert.doesNotThrow(() => structuredClone(serializeActual(v)));
  }
});

test("module-level state does not leak between two runOne calls (fresh factory per call)", () => {
  const factory = compileLearnerCode("let counter = 0; function f() { counter++; return counter; }", "f");
  const a = runOne(factory, { id: "a", args: [] }, []);
  const b = runOne(factory, { id: "b", args: [] }, []);
  assert.equal(a.actual, 1);
  assert.equal(b.actual, 1);
});

test("trees are rebuilt for every test, so mutation cannot leak", () => {
  const factory = compileLearnerCode("function f(root) { const v = root.val; root.val = 99; return v; }", "f");
  const a = runOne(factory, { id: "a", args: [[5]] }, ["tree"]);
  const b = runOne(factory, { id: "b", args: [[5]] }, ["tree"]);
  assert.equal(a.actual, 5);
  assert.equal(b.actual, 5);
});

test("exactly len(args) arguments are passed, so default parameters are exercised", () => {
  const code = "function f(a, b, c = 1) { return arguments.length * 10 + c; }";
  assert.equal(run(code, "f", [[1], [2]], ["tree", "tree", "int"]).actual, 21);
  assert.equal(run(code, "f", [[1], [2], 5], ["tree", "tree", "int"]).actual, 35);
});

test("compileLearnerCode rejects a bad entry name and reports SyntaxError for broken code", () => {
  assert.throws(() => compileLearnerCode("function f(){}", "bad name"), /bad entry name/);
  assert.throws(() => compileLearnerCode("function f( {", "f"), SyntaxError);
  const factory = compileLearnerCode("function g() {}", "f");
  assert.equal(factory(), undefined);
});

test("definedFunctions lists declarations and arrow/const functions (informational)", () => {
  const names = definedFunctions("function a() {}\nconst b = (x) => x;\nlet c = function () {};\nvar d = y => y;\nconst e = 5;");
  assert.deepEqual(names, ["a", "b", "c", "d"]);
});

// ---------------------------------------------------------------------------
// Message protocol: load the worker file in a fresh context with a fake `self`.
function makeWorkerScope() {
  const posted = [];
  const self = {
    postMessage(m) { posted.push(structuredClone(m)); },   // structuredClone throws on non-cloneable values, like the real thing
    fetch() { return "should be removed"; },
    onmessage: null,
  };
  const ctx = vm.createContext({ self, console, Date, Number, Array, Error, SyntaxError, RegExp, String, Object, Math, Function });
  vm.runInContext(readFileSync(WORKER_PATH, "utf8"), ctx, { filename: "challenge_worker.js" });
  return { posted, self, send: (data) => self.onmessage({ data }) };
}

const FUZZY = "function fuzzySubtree(root, subRoot, maxDifferences = 1) {\n  if (!subRoot) return true;\n  if (!root) return false;\n  if (countMismatches(root, subRoot) <= maxDifferences) return true;\n  return fuzzySubtree(root.left, subRoot, maxDifferences) || fuzzySubtree(root.right, subRoot, maxDifferences);\n}\nfunction countMismatches(p, q) {\n  if (!p && !q) return 0;\n  if (!p || !q) return Infinity;\n  return (p.val !== q.val ? 1 : 0) + countMismatches(p.left, q.left) + countMismatches(p.right, q.right);\n}";
const TESTS = [
  { id: "fz-01", args: [[1, 2], []] },
  { id: "fz-06", args: [[1, 2, 3, 4, 5], [2, 8, 9]] },
  { id: "fz-07", args: [[1, 2, 3, 4, 5], [2, 8, 9], 2] },
];
const runMsg = (over = {}) => ({ type: "run", run_id: "r-3", code: FUZZY, entry: "fuzzySubtree", arg_types: ["tree", "tree", "int"], tests: TESTS, start_index: 0, ...over });

test("worker scope: the network accident guard is applied and onmessage is installed", () => {
  const w = makeWorkerScope();
  assert.equal(w.self.fetch, undefined);
  assert.equal(typeof w.self.onmessage, "function");
});

test("worker protocol: compiled -> result per test (in order, with index) -> done", () => {
  const w = makeWorkerScope();
  w.send(runMsg());
  assert.deepEqual(w.posted.map((m) => m.type), ["compiled", "result", "result", "result", "done"]);
  const compiled = w.posted[0];
  assert.deepEqual(compiled, { type: "compiled", run_id: "r-3", ok: true, error: null, error_kind: null, entry_found: true, defined_functions: ["fuzzySubtree", "countMismatches"] });
  const results = w.posted.slice(1, 4);
  assert.deepEqual(results.map((r) => [r.index, r.id, r.actual, r.actual_type, r.error]), [[0, "fz-01", true, "boolean", null], [1, "fz-06", false, "boolean", null], [2, "fz-07", true, "boolean", null]]);
  for (const r of results) {
    assert.deepEqual(Object.keys(r).sort(), ["actual", "actual_type", "error", "id", "index", "ms", "run_id", "type"]);
    assert.equal(r.run_id, "r-3");
  }
  const done = w.posted[4];
  assert.equal(done.run_id, "r-3");
  assert.equal(typeof done.total_ms, "number");
});

test("worker protocol: start_index resumes after a killed test", () => {
  const w = makeWorkerScope();
  w.send(runMsg({ start_index: 2 }));
  assert.deepEqual(w.posted.map((m) => m.type), ["compiled", "result", "done"]);
  assert.equal(w.posted[1].index, 2);
  assert.equal(w.posted[1].id, "fz-07");
});

test("worker protocol: syntax error -> compiled(ok=false, error_kind=syntax) then done, no tests", () => {
  const w = makeWorkerScope();
  w.send(runMsg({ code: "function fuzzySubtree( {" }));
  assert.deepEqual(w.posted.map((m) => m.type), ["compiled", "done"]);
  assert.equal(w.posted[0].ok, false);
  assert.equal(w.posted[0].error_kind, "syntax");
  assert.equal(typeof w.posted[0].error, "string");
  assert.equal(w.posted[0].entry_found, false);
});

test("worker protocol: top-level exception -> error_kind=load", () => {
  const w = makeWorkerScope();
  w.send(runMsg({ code: "undeclaredThing = 1;\n" + FUZZY }));
  assert.deepEqual(w.posted.map((m) => m.type), ["compiled", "done"]);
  assert.equal(w.posted[0].ok, false);
  assert.equal(w.posted[0].error_kind, "load");
  assert.match(w.posted[0].error, /undeclaredThing is not defined/);
});

test("worker protocol: entry missing -> ok=true, entry_found=false, then done", () => {
  const w = makeWorkerScope();
  w.send(runMsg({ code: "function somethingElse() { return 1; }" }));
  assert.deepEqual(w.posted.map((m) => m.type), ["compiled", "done"]);
  assert.equal(w.posted[0].ok, true);
  assert.equal(w.posted[0].entry_found, false);
  assert.deepEqual(w.posted[0].defined_functions, ["somethingElse"]);
});

test("worker protocol: a throwing test still posts a result and the run continues", () => {
  const w = makeWorkerScope();
  w.send(runMsg({ code: "function fuzzySubtree(root, subRoot) { return subRoot.val; }" }));   // fz-01 has an empty subRoot -> TypeError
  assert.deepEqual(w.posted.map((m) => m.type), ["compiled", "result", "result", "result", "done"]);
  const [first, second, third] = w.posted.slice(1, 4);
  assert.equal(first.id, "fz-01");
  assert.match(first.error, /Cannot read propert(y|ies) of null/);
  assert.equal(first.actual, null);
  assert.equal(first.actual_type, "error");
  assert.deepEqual([second.actual, second.actual_type, second.error], [2, "number", null]);
  assert.deepEqual([third.actual, third.actual_type, third.error], [2, "number", null]);
});

test("worker protocol: messages other than run are ignored", () => {
  const w = makeWorkerScope();
  w.send({ type: "ping" });
  w.send(null);
  assert.deepEqual(w.posted, []);
});

// ---------------------------------------------------------------------------
// Learner-code isolation (security review, worker finding): a scope that models a classic worker more closely.
// `self` IS the global object (so `self.x = ...` from learner code creates a global, as in a real worker) and
// `new Function` is the context's own, so learner code is compiled against THIS global. (makeWorkerScope above
// passes the host's Function in, which compiles learner code against the host global and would hide the bug.)
function makeGlobalWorkerScope() {
  const posted = [];
  const sandbox = { postMessage(m) { posted.push(structuredClone(m)); }, fetch() { return "should be removed"; }, onmessage: null, console };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(WORKER_PATH, "utf8"), sandbox, { filename: "challenge_worker.js" });
  return { posted, self: sandbox, send: (data) => sandbox.onmessage({ data }) };
}

test("worker scope: the captured references and the helpers are private (typeof post === \"undefined\" in learner code)", () => {
  const w = makeGlobalWorkerScope();
  assert.equal(w.self.fetch, undefined);
  const probe = "function fuzzySubtree() { return [typeof post, typeof importScriptsRef, typeof now, typeof traceLib, typeof IS_WORKER, typeof buildTree, typeof handleRun].join(','); }";
  w.send(runMsg({ code: probe, tests: [{ id: "p", args: [[1], [1]] }] }));
  assert.deepEqual(w.posted.map((m) => m.type), ["compiled", "result", "done"]);
  assert.equal(w.posted[1].actual, "undefined,undefined,undefined,undefined,undefined,undefined,undefined");
  for (const name of ["post", "importScriptsRef", "now", "traceLib", "IS_WORKER", "buildTree", "handleRun", "ENTRY_RE"]) {
    assert.equal(name in w.self, false, name + " must not be a worker global");
  }
});

test("worker scope: learner code cannot clobber the worker's post; the run still reports compiled/result/done", () => {
  // a global `post` created by learner code (self is the worker global) no longer replaces the reference the worker
  // reports with: previously this stalled the run (nothing was posted) and the page said the code did not finish loading
  let w = makeGlobalWorkerScope();
  w.send(runMsg({ code: "self.post = function () {};\nself.postMessage = function () {};\n" + FUZZY }));
  assert.deepEqual(w.posted.map((m) => m.type), ["compiled", "result", "result", "result", "done"]);
  assert.equal(w.posted[0].ok, true);
  assert.deepEqual(w.posted.slice(1, 4).map((r) => r.actual), [true, false, true]);
  assert.equal(w.posted[4].run_id, "r-3");
  // a bare assignment has no binding to hit: a strict-mode ReferenceError at load -> compiled(load) then done
  // (a number is assigned on purpose: node's vm lets strict code create a global from a function value, browsers do not)
  w = makeGlobalWorkerScope();
  w.send(runMsg({ code: "post = 1;\n" + FUZZY }));
  assert.deepEqual(w.posted.map((m) => m.type), ["compiled", "done"]);
  assert.equal(w.posted[0].error_kind, "load");
  assert.match(w.posted[0].error, /post is not defined/);
  // inside the entry function: that test's error, the other tests still run and done is posted
  w = makeGlobalWorkerScope();
  w.send(runMsg({ code: "function fuzzySubtree(root, subRoot) { post = 1; return true; }" }));
  assert.deepEqual(w.posted.map((m) => m.type), ["compiled", "result", "result", "result", "done"]);
  for (const r of w.posted.slice(1, 4)) assert.match(r.error, /post is not defined/);
});
