// node --test backend/tests/js/   (Node >= 20, no npm deps)
// Execution tracer for "Visualize my solution" (lead addendum 2, sections 2 and 5):
//   - docs/js/challenge_trace.js (instrument / makeTracer / buildTraceTree / runTrace) through the worker's own
//     trace path (challenge_worker.js traceOnce -> loadTraceLib -> runTrace, the same compile wrapper the browser uses);
//   - every reference solution and accepted alternative of the three challenges on 3 small tests each;
//   - the worker's `trace` message protocol in a simulated worker scope (importScripts captured before the guard);
//   - the DOM-free replay helpers of docs/js/challenge_viz.js (layoutTree, buildSteps, describe) and
//     ChallengeRunner.normalizeTrace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadPrivateExport, worker } from "../../scripts/verify_challenges.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS_DIR = path.resolve(HERE, "..", "..", "..", "public", "docs", "js");
const WORKER_PATH = path.join(JS_DIR, "challenge_worker.js");
const require = createRequire(import.meta.url);
const T = require(path.join(JS_DIR, "challenge_trace.js"));
const V = require(path.join(JS_DIR, "challenge_viz.js"));
const R = require(path.join(JS_DIR, "challenge_runner.js"));
const acorn = require(path.join(JS_DIR, "vendor", "acorn.js"));

const priv = loadPrivateExport();
const byId = new Map(priv.challenges.map((c) => [c.id, c]));
const MAX_NODES = 15;

// ---------------------------------------------------------------------------
// Fixtures (the lead's prototype cases, ported verbatim)

const isSameTree = `
function isSameTree(p, q) {
  if (!p && !q) return true;
  if (!p || !q) return false;
  if (p.val !== q.val) return false;
  return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
}`;

const countRef = `
function countSubtrees(root, subRoot) {
  if (!root) return 0;
  const here = isSameTree(root, subRoot) ? 1 : 0;
  return here + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot);
}` + isSameTree;

const fuzzyRef = `
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;
  if (countMismatches(root, subRoot) <= maxDifferences) return true;
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}
function countMismatches(p, q) {
  if (!p && !q) return 0;
  if (!p || !q) return Infinity;
  const here = p.val !== q.val ? 1 : 0;
  return here + countMismatches(p.left, q.left) + countMismatches(p.right, q.right);
}`;

// The page's former reference: the difference counter is copied into each branch (fails fz-06 and fz-15).
const fuzzyBuggy = `function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;
  if (fuzzySameTree(root, subRoot, maxDifferences)) return true;
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}
function fuzzySameTree(p, q, maxDifferences, differences = 0) {
  if (!p && !q) return true;
  if (!p || !q) return false;
  if (p.val !== q.val) {
    differences++;
    if (differences > maxDifferences) return false;
  }
  return fuzzySameTree(p.left, q.left, maxDifferences, differences) &&
         fuzzySameTree(p.right, q.right, maxDifferences, differences);
}`;

const mirrorRef = `
function isMirrorSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  if (isSameTree(root, subRoot) || isMirror(root, subRoot)) return true;
  return isMirrorSubtree(root.left, subRoot) || isMirrorSubtree(root.right, subRoot);
}
const isMirror = (p, q) => {
  if (!p && !q) return true;
  if (!p || !q) return false;
  return p.val === q.val && isMirror(p.left, q.right) && isMirror(p.right, q.left);
};` + isSameTree;

const arrowExpr = `
const double = x => x * 2;
function isMirrorSubtree(root, subRoot) {
  const helper = (a) => { const inner = (b) => { return b + 1; }; return inner(a); };
  return helper(double(1)) === 3;
}`;

const thrower = `function fuzzySubtree(root, subRoot, maxDifferences = 1) { return root.left.left.val; }`;

const FZ_TYPES = ["tree", "tree", "int"];
const FZ06 = [[1, 2, 3, 4, 5], [2, 8, 9], 1];

// ---------------------------------------------------------------------------
// Helpers

/* Every call has exactly one closing event, closes are well nested, and a call's depth = open frames. */
function checkEvents(name, res) {
  const calls = res.events.filter((e) => e.k === "call");
  const closes = res.events.filter((e) => e.k === "ret" || e.k === "throw");
  const open = new Set(calls.map((c) => c.id));
  for (const c of closes) {
    assert.ok(open.has(c.id), `${name}: close without call ${JSON.stringify(c)}`);
    open.delete(c.id);
  }
  assert.equal(open.size, 0, `${name}: unclosed calls ${[...open]}`);
  const stack = [];
  for (const e of res.events) {
    if (e.k === "call") {
      assert.equal(e.depth, stack.length, `${name}: depth mismatch at ${JSON.stringify(e)}`);
      assert.ok(Array.isArray(e.args), `${name}: call args is an array`);
      assert.equal(typeof e.fn, "string");
      stack.push(e.id);
    } else {
      assert.equal(stack[stack.length - 1], e.id, `${name}: out-of-order close ${JSON.stringify(e)}`);
      stack.pop();
    }
  }
  return { calls: calls.length };
}

/* Through the worker's compile path (challenge_worker.js traceOnce). */
function traceVia(code, entry, argTypes, args, maxEvents = 600) {
  return worker.traceOnce({ type: "trace", run_id: "t-1", code, entry, arg_types: argTypes, args, max_events: maxEvents });
}

function runOk(name, code, entry, types, args, expected) {
  const res = traceVia(code, entry, types, args);
  assert.equal(res.type, "trace");
  assert.equal(res.run_id, "t-1");
  assert.ok(res.ok, `${name}: not ok: ${res.error} (${res.error_kind})`);
  assert.equal(res.error, null);
  assert.equal(res.error_kind, null);
  assert.ok(res.events.length > 0, `${name}: no events`);
  checkEvents(name, res);
  if (expected !== undefined) assert.deepEqual(res.result, expected, `${name}: wrong result`);
  assert.equal(res.truncated, false);
  return res;
}

function nodeCount(arr) { return Array.isArray(arr) ? arr.filter((x) => x !== null && x !== undefined).length : 0; }
function totalNodes(ch, t) { return ch.arg_types.reduce((n, ty, i) => n + (ty === "tree" ? nodeCount(t.args[i]) : 0), 0); }
function smallTests(ch, n) {
  return ch.tests.filter((t) => totalNodes(ch, t) <= MAX_NODES && nodeCount(t.args[0]) > 0 && nodeCount(t.args[1]) > 0).slice(0, n);
}

// ---------------------------------------------------------------------------
// The vendored parser and the load path

test("acorn 8.14.0 is vendored verbatim with its MIT license, and the worker loads the tracer through it", () => {
  assert.equal(acorn.version, "8.14.0");
  assert.equal(typeof acorn.parse, "function");
  const lic = readFileSync(path.join(JS_DIR, "vendor", "LICENSE-acorn"), "utf8");
  assert.match(lic, /MIT License/);
  assert.match(lic, /Permission is hereby granted/);
  assert.equal(worker.loadTraceLib(), T, "the worker requires docs/js/challenge_trace.js in Node");
  for (const k of ["instrument", "makeTracer", "buildTraceTree", "runTrace", "serialize"]) assert.equal(typeof T[k], "function", k);
});

test("instrument: wraps every function body, attributes returns to the right function, reports line ranges", () => {
  const inst = T.instrument(fuzzyRef);
  assert.deepEqual(inst.functions.map((f) => [f.name, f.start_line, f.end_line, f.params]), [
    ["fuzzySubtree", 2, 8, ["root", "subRoot", "maxDifferences"]],
    ["countMismatches", 9, 14, ["p", "q"]],
  ]);
  assert.match(inst.code, /__sua_tracer__\.enter\("fuzzySubtree", 0, \[root, subRoot, maxDifferences\]\)/, "enter(name, index, [args]): the index is the function's position in `functions`");
  assert.match(inst.code, /__sua_tracer__\.enter\("countMismatches", 1, \[p, q\]\)/);
  assert.equal((inst.code.match(/__sua_tracer__\.ret\(__sua_call__, \(/g) || []).length, 7, "seven return statements (4 + 3)");
  assert.equal((inst.code.match(/finally \{ __sua_tracer__\.exit\(__sua_call__\); \}/g) || []).length, 2);
  // destructured / rest parameters are recorded as undefined; generators and async functions are left alone
  const other = T.instrument("function f({a}, ...r) { return 1; }\nfunction* g() { yield 1; }\nasync function h() { return 2; }");
  assert.deepEqual(other.functions.map((f) => f.name), ["f"]);
  assert.match(other.code, /__sua_tracer__\.enter\("f", 0, \[undefined, undefined\]\)/);
  assert.match(other.code, /function\* g\(\) \{ yield 1; \}/);
  assert.throws(() => T.instrument("function f( {"), SyntaxError);
});

test("instrument: an expression-bodied arrow keeps a parenthesized body, and edits that end at one offset nest correctly (fix round 1, finding 1)", () => {
  // acorn (preserveParens off) reports the INNER expression for "(v) => ({ ... })": the block must open right after "=>"
  const objArrow = T.instrument("const mk = (v) => ({ val: v });");
  assert.match(objArrow.code, /^const mk = \(v\) => \{ const __sua_call__ = __sua_tracer__\.enter\("mk", 0, \[v\]\); try \{ return __sua_tracer__\.ret\(__sua_call__, \( \(\{ val: v \}\)\)\); \} catch/);
  const cases = [
    ["object literal", "const mk = (v, l, r) => ({ val: v, left: l, right: r });\nfunction f(a) { return mk(a, null, null).val; }", 7],
    ["boolean expression on several lines", "const isSame = (p, q) => (\n  (!p && !q) || (!!p && !!q && p === q)\n);\nfunction f(a) { return isSame(a, a) ? 1 : 0; }", 1],
    ["arithmetic", "const add = (a, b) => (a + b);\nfunction f(a) { return add(a, 1); }", 8],
    ["sequence expression", "const pick = (a, b) => (a, b);\nfunction f(a) { return pick(0, a); }", 7],
    ["not wrapped (control)", "const same = (p, q) => (p === null) || (p === q);\nfunction f(a) { return same(a, a) ? 1 : 0; }", 1],
    ["return whose argument is an arrow ending at the same offset", "function f(a) { return x => x + 1 }\nfunction g(a) { return f(a)(a); }", 8],
    ["parenthesized arrow returned", "function f(a) { return (x => x + a); }\nfunction g(a) { return f(a)(1); }", 8],
    ["curried arrows", "const c = x => y => x + y;\nfunction f(a) { return c(a)(1); }", 8],
    ["function close and return close at one offset", "function f(a){return a}", 7],
    ["arrow in a default parameter", "const d = (k = x => x) => k(2);\nfunction f(a) { return d() + a; }", 9],
  ];
  for (const [name, code, expected] of cases) {
    const entry = code.includes("function g") ? "g" : "f";
    const r = traceVia(code, entry, ["int"], [7]);
    assert.ok(r.ok, `${name}: ${r.error} (${r.error_kind})`);
    assert.equal(r.error, null, name);
    assert.equal(r.result, expected, name);
    assert.deepEqual(worker.runOne(worker.compileLearnerCode(code, entry), { id: "x", args: [7] }, ["int"]).actual, expected, `${name}: untraced`);
    checkEvents(name, r);
  }
  // the Advanced-tier solution from the finding: passes every test untraced and traces to the same answers
  const mirrorArrow = "const mk = (v, l, r) => ({ val: v, left: l, right: r });\n" +
    "function mirrorOf(n) { if (!n) return null; return mk(n.val, mirrorOf(n.right), mirrorOf(n.left)); }\n" +
    "function isSame(p, q) { if (!p && !q) return true; if (!p || !q) return false; return p.val === q.val && isSame(p.left, q.left) && isSame(p.right, q.right); }\n" +
    "function isSub(root, subRoot) { if (!subRoot) return true; if (!root) return false; if (isSame(root, subRoot)) return true; return isSub(root.left, subRoot) || isSub(root.right, subRoot); }\n" +
    "function isMirrorSubtree(root, subRoot) { return isSub(root, subRoot) || isSub(root, mirrorOf(subRoot)); }";
  const mirror = byId.get("mirrorSubtree");
  let arrowCalls = 0;
  for (const t of mirror.tests.filter((x) => totalNodes(mirror, x) <= MAX_NODES)) {
    const r = runOk(`mirror arrow ${t.id}`, mirrorArrow, "isMirrorSubtree", mirror.arg_types, t.args, t.expected);
    arrowCalls += r.events.filter((e) => e.k === "call" && e.fn === "mk").length;   // only reached when the plain search fails
  }
  assert.ok(arrowCalls > 0, "the arrow helper is traced on the tests that need the mirrored copy");
});

test("instrument/tracer: every function has an index, call events carry it, and the replay uses the frame's own names and lines (fix round 1, finding 2)", () => {
  const twoAnon = `function countSubtrees(root, subRoot) {
  if (!root) return 0;
  const here = isSameTree(root, subRoot) ? 1 : 0;
  const kids = [root.left, root.right].map(function (k) { return countSubtrees(k, subRoot); });
  return kids.reduce(function (a, b) {
    return a + b;
  }, here);
}
function isSameTree(p, q) {
  if (!p && !q) return true;
  if (!p || !q) return false;
  if (p.val !== q.val) return false;
  return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
}`;
  const inst = T.instrument(twoAnon);
  assert.deepEqual(inst.functions.map((f) => [f.name, f.start_line, f.end_line, f.params]),
    [["countSubtrees", 1, 8, ["root", "subRoot"]], ["(anonymous)", 4, 4, ["k"]], ["(anonymous)", 5, 7, ["a", "b"]], ["isSameTree", 9, 14, ["p", "q"]]]);
  assert.match(inst.code, /__sua_tracer__\.enter\("\(anonymous\)", 1, \[k\]\)/);
  assert.match(inst.code, /__sua_tracer__\.enter\("\(anonymous\)", 2, \[a, b\]\)/);
  const cs = byId.get("countSubtrees");
  const t = cs.tests.find((x) => x.id === "cs-06");
  const r = runOk("two anonymous callbacks cs-06", twoAnon, "countSubtrees", cs.arg_types, t.args, t.expected);
  const calls = r.events.filter((e) => e.k === "call");
  assert.ok(calls.every((e) => Number.isInteger(e.f) && r.functions[e.f].name === e.fn), "every call carries f, the index of a function with its name");
  assert.ok(calls.some((e) => e.f === 1) && calls.some((e) => e.f === 2), "both anonymous callbacks ran");
  const n = R.normalizeTrace(r);
  assert.deepEqual(n.events.filter((e) => e.k === "call").map((e) => e.f), calls.map((e) => e.f), "normalizeTrace keeps f");
  assert.deepEqual(n.events, r.events);
  const steps = V.buildSteps(n, { entry: "countSubtrees", hasBudget: false, returnType: "integer", expected: t.expected });
  const reduceCall = steps.find((s) => s.kind === "call" && s.fn === "(anonymous)" && s.fnIndex === 2);
  assert.ok(reduceCall, "a step for the reduce callback");
  assert.match(reduceCall.call, /^\(anonymous\)\(a = -?\d+, b = -?\d+\)$/, "the reduce callback's OWN parameter names, not the map callback's");
  assert.match(reduceCall.caption, /^Call \(anonymous\)\(a = -?\d+, b = -?\d+\) at depth \d+\.$/);
  const mapCall = steps.find((s) => s.kind === "call" && s.fn === "(anonymous)" && s.fnIndex === 1);
  assert.match(mapCall.call, /^\(anonymous\)\((main node -?\d+|empty)\)$/);
  const reduceRet = steps.find((s) => s.kind === "ret" && s.fnIndex === 2);
  assert.ok(reduceRet, "ret steps carry the frame's index too");
  assert.deepEqual([n.functions[reduceCall.fnIndex].start_line, n.functions[reduceCall.fnIndex].end_line], [5, 7], "explain-step selection = Ln 5-7");
  // a shadowed helper: the inner isSameTree (Ln 3-8) is the one that runs, not the dead top-level one (Ln 1)
  const shadow = `function isSameTree(p, q) { return false; }
function countSubtrees(root, subRoot) {
  function isSameTree(p, q) {
    if (!p && !q) return true;
    if (!p || !q) return false;
    if (p.val !== q.val) return false;
    return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
  }
  if (!root) return 0;
  return (isSameTree(root, subRoot) ? 1 : 0) + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot);
}`;
  const r2 = runOk("shadowed helper cs-06", shadow, "countSubtrees", cs.arg_types, t.args, t.expected);
  const s2 = V.buildSteps(r2, { entry: "countSubtrees", returnType: "integer" });
  const inner = s2.find((s) => s.fn === "isSameTree");
  assert.deepEqual([r2.functions[inner.fnIndex].start_line, r2.functions[inner.fnIndex].end_line], [3, 8]);
  assert.ok(s2.filter((s) => s.fn === "isSameTree").every((s) => s.fnIndex === 2), "no frame maps to the dead outer isSameTree");
  // traces without f (an older shape) fall back to the first function with that name
  const legacy = { events: [{ k: "call", id: 0, fn: "h", depth: 0, args: [1, 2] }, { k: "ret", id: 0, fn: "h", value: 3 }], functions: [{ name: "h", start_line: 1, end_line: 1, params: ["x", "y"] }] };
  const ls = V.buildSteps(legacy, { entry: "h" });
  assert.equal(ls[0].call, "h(x = 1, y = 2)");
  assert.equal(ls[0].fnIndex, null);
  assert.equal(ls[1].fnIndex, null);
  // the tracer still accepts the older enter(name, [args]) form and then records no f
  const tr = T.makeTracer({});
  const id = tr.enter("z", [4]);
  tr.ret(id, 1);
  tr.exit(id);
  assert.deepEqual(tr.events(), [{ k: "call", id: 0, fn: "z", depth: 0, args: [4] }, { k: "ret", id: 0, fn: "z", value: 1 }]);
  const tr2 = T.makeTracer({});
  tr2.enter("z", 3, [4]);
  assert.deepEqual(tr2.events()[0], { k: "call", id: 0, fn: "z", f: 3, depth: 0, args: [4] });
});

test("ChallengeViz.levelOrderNodes matches the worker's node metadata; emptyMessage gives one timeout message (fix round 1, finding 5)", () => {
  for (const arr of [[1, 2, 3, 4, 5], [2, 8, 9], [1, null, 2, null, 3], [1], [], [null], [1, null, null, 5], [3, 4, 5, 1, 2, null, null, 0]]) {
    assert.deepEqual(V.levelOrderNodes(arr), T.buildTraceTree(arr, "main").nodes, JSON.stringify(arr));
  }
  assert.deepEqual(V.levelOrderNodes(null), []);
  assert.deepEqual(V.levelOrderNodes("nope"), []);
  assert.equal(V.emptyMessage({ ok: false, error: R.TRACE_TIMEOUT_ERROR, error_kind: "timeout" }), "Timed out after 2 s: the run never finished, usually an infinite loop. See the test table.");
  assert.equal(V.emptyMessage({ ok: false, error: "Unexpected token", error_kind: "syntax" }), "The replay could not run: Unexpected token");
  assert.equal(V.emptyMessage({ ok: false, error: "visualizer unavailable offline", error_kind: "load" }), "The replay could not run: visualizer unavailable offline");
  assert.equal(V.emptyMessage({ ok: true, error: null, events: [] }), "No function call was recorded.");
});

// ---------------------------------------------------------------------------
// The prototype's cases (ALL TRACE PROTOTYPE CHECKS), through the worker path

test("prototype: count reference on cs-04 and cs-08", () => {
  runOk("count cs-04", countRef, "countSubtrees", ["tree", "tree"], [[1, 2, 3, 4, 5], [2, 4, 5]], 1);
  runOk("count cs-08", countRef, "countSubtrees", ["tree", "tree"], [[1, 1, 1, 1, 1, 1, 1], [1, 1, 1]], 2);
});

test("prototype: fuzzy reference on fz-06 records the entry call with main/sub node args first", () => {
  const r = runOk("fuzzy fz-06 ref", fuzzyRef, "fuzzySubtree", FZ_TYPES, FZ06, false);
  const first = r.events[0];
  assert.equal(first.k, "call");
  assert.equal(first.fn, "fuzzySubtree");
  assert.equal(first.depth, 0);
  assert.deepEqual(first.args, [{ node: 0, tree: "main", val: 1 }, { node: 0, tree: "sub", val: 2 }, 1]);
  assert.deepEqual(r.nodes.sub, [
    { vid: 0, val: 2, index: 0, parent: null, side: null },
    { vid: 1, val: 8, index: 1, parent: 0, side: "L" },
    { vid: 2, val: 9, index: 2, parent: 0, side: "R" },
  ]);
  assert.deepEqual(r.nodes.main.map((n) => [n.vid, n.val, n.index, n.parent, n.side]), [[0, 1, 0, null, null], [1, 2, 1, 0, "L"], [2, 3, 2, 0, "R"], [3, 4, 3, 1, "L"], [4, 5, 4, 1, "R"]]);
  const inf = r.events.find((e) => e.k === "ret" && e.value === "Infinity");
  assert.ok(inf, "a shape mismatch is serialized as the string Infinity");
  assert.equal(r.events[r.events.length - 1].k, "ret");
  assert.equal(r.events[r.events.length - 1].fn, "fuzzySubtree");
  assert.equal(typeof r.ms, "number");
});

test("prototype: the page's old buggy fuzzy reference returns true on fz-06 (default param captured)", () => {
  const r = runOk("fuzzy fz-06 buggy", fuzzyBuggy, "fuzzySubtree", FZ_TYPES, FZ06, true);
  const helper = r.events.find((e) => e.k === "call" && e.fn === "fuzzySameTree");
  assert.deepEqual(helper.args, [{ node: 0, tree: "main", val: 1 }, { node: 0, tree: "sub", val: 2 }, 1, 0], "the default parameter value is recorded");
  runOk("fuzzy fz-04 default param", fuzzyRef, "fuzzySubtree", ["tree", "tree"], [[1, 2, 3, 4, 5], [2, 4, 9]], true);
});

test("prototype: mirror reference with an arrow-function helper", () => {
  const r = runOk("mirror mr-04", mirrorRef, "isMirrorSubtree", ["tree", "tree"], [[1, 2, 3, 4, 5], [2, 5, 4]], true);
  assert.ok(r.events.some((e) => e.k === "call" && e.fn === "isMirror"), "const isMirror = (p, q) => {...} is named after its variable");
});

test("prototype: expression-bodied arrow and a return inside a nested arrow are attributed to the inner function", () => {
  const a = runOk("arrow expr + nested", arrowExpr, "isMirrorSubtree", ["tree", "tree"], [[1], [1]], true);
  assert.ok(a.events.some((e) => e.k === "call" && e.fn === "double"), "arrow expression body traced");
  assert.ok(a.events.some((e) => e.k === "call" && e.fn === "inner"), "nested arrow traced");
  const inner = a.events.filter((e) => e.fn === "inner");
  assert.deepEqual(inner.map((e) => e.k), ["call", "ret"]);
  assert.equal(inner[1].value, 3);
  const dbl = a.events.filter((e) => e.fn === "double");
  assert.deepEqual(dbl.map((e) => e.k), ["call", "ret"]);
  assert.equal(dbl[1].value, 2);
  assert.deepEqual(a.functions.map((f) => f.name), ["double", "isMirrorSubtree", "helper", "inner"]);
});

test("prototype: a throwing function yields ok:true, error text, a throw event and a partial trace", () => {
  const th = traceVia(thrower, "fuzzySubtree", FZ_TYPES, [[1], [1], 1]);
  assert.equal(th.ok, true);
  assert.equal(th.error_kind, "runtime");
  assert.match(th.error, /Cannot read propert(y|ies) of null/);
  assert.deepEqual(th.events.map((e) => e.k), ["call", "throw"]);
  assert.equal(th.events[1].fn, "fuzzySubtree");
  assert.match(th.events[1].error, /Cannot read propert(y|ies) of null/);
  assert.equal(th.result, null);
  checkEvents("thrower", th);
});

test("prototype: a syntax error -> ok:false, error_kind syntax; a missing entry -> load", () => {
  const syn = traceVia("function f( {", "f", [], []);
  assert.equal(syn.ok, false);
  assert.equal(syn.error_kind, "syntax");
  assert.equal(typeof syn.error, "string");
  assert.deepEqual(syn.events, []);
  const missing = traceVia("function g() { return 1; }", "f", [], []);
  assert.equal(missing.ok, false);
  assert.equal(missing.error_kind, "load");
  assert.match(missing.error, /entry function f not found/);
  const bad = traceVia("function f() {}", "not a name", [], []);
  assert.equal(bad.error_kind, "load");
  assert.equal(bad.error, "bad entry name");
});

test("prototype: the 600-event cap sets truncated and the run still completes", () => {
  const chain = [];
  for (let i = 0; i < 100; i++) { chain.push(i); if (i < 99) chain.push(null); }
  const cap = traceVia(fuzzyRef, "fuzzySubtree", FZ_TYPES, [chain, [500], 0], 600);
  assert.equal(cap.ok, true);
  assert.equal(cap.truncated, true);
  assert.equal(cap.events.length, 600);
  assert.equal(cap.result, false, "further calls still execute after the cap");
  const small = traceVia(fuzzyRef, "fuzzySubtree", FZ_TYPES, FZ06, 10);
  assert.equal(small.events.length, 10);
  assert.equal(small.truncated, true);
  const huge = traceVia(fuzzyRef, "fuzzySubtree", FZ_TYPES, FZ06, 999999);
  assert.equal(huge.truncated, false, "max_events is capped, not rejected");
});

test("prototype: a function that falls through returns undefined (ret event with value \"undefined\")", () => {
  const noret = traceVia("function f(a){ if (a) { return 1 } }", "f", ["int"], [0]);
  assert.deepEqual(noret.events.map((e) => e.k), ["call", "ret"]);
  assert.equal(noret.events[1].value, "undefined");
  assert.equal(noret.result, "undefined");
});

test("serialize: JSON-safe values only", () => {
  assert.equal(T.serialize(undefined), "undefined");
  assert.equal(T.serialize(null), null);
  assert.equal(T.serialize(true), true);
  assert.equal(T.serialize(3), 3);
  assert.equal(T.serialize(Infinity), "Infinity");
  assert.equal(T.serialize(-Infinity), "-Infinity");
  assert.equal(T.serialize(NaN), "NaN");
  assert.equal(T.serialize("x".repeat(100)).length, 40);
  assert.deepEqual(T.serialize({ val: 7, left: null, right: null }), { node: null, val: 7 });
  const built = T.buildTraceTree([1, 2], "main");
  assert.deepEqual(T.serialize(built.root.left), { node: 1, tree: "main", val: 2 });
  assert.deepEqual(Object.keys(built.root), ["val", "left", "right"], "__vid and __vtree are not enumerable");
  assert.equal(T.serialize({ toString() { throw new Error("nope"); } }), "[unprintable object]");
  assert.equal(T.serialize(() => 1).length <= 40, true);
});

// ---------------------------------------------------------------------------
// Every reference and accepted alternative of the three challenges, on 3 small tests each

for (const ch of priv.challenges) {
  const codes = [["reference", ch.reference_solution], ...ch.accepted_alternatives.map((alt, i) => [`alternative ${i + 1}`, alt])];
  const tests = smallTests(ch, 3);
  assert.equal(tests.length, 3, `${ch.id}: three small tests with both trees non-empty`);
  for (const [label, code] of codes) {
    for (const t of tests) {
      test(`${ch.id} ${label} on ${t.id}: traced result = expected = untraced result, well-formed events`, () => {
        const r = runOk(`${ch.id} ${label} ${t.id}`, code, ch.entry_function, ch.arg_types, t.args, t.expected);
        const first = r.events[0];
        assert.equal(first.k, "call");
        assert.equal(first.fn, ch.entry_function);
        assert.equal(first.depth, 0);
        assert.deepEqual([first.args[0].tree, first.args[0].node], ["main", 0]);
        assert.deepEqual([first.args[1].tree, first.args[1].node], ["sub", 0]);
        const last = r.events[r.events.length - 1];
        assert.equal(last.k, "ret");
        assert.equal(last.fn, ch.entry_function);
        assert.deepEqual(last.value, t.expected);
        const untraced = worker.runOne(worker.compileLearnerCode(code, ch.entry_function), { id: t.id, args: t.args }, ch.arg_types);
        assert.equal(untraced.error, null);
        assert.deepEqual(untraced.actual, r.result, "untraced and traced results agree");
        assert.ok(r.functions.some((f) => f.name === ch.entry_function && f.start_line === 1), "the entry function starts on line 1");
        assert.equal(r.nodes.main.length, nodeCount(t.args[0]));
        assert.equal(r.nodes.sub.length, nodeCount(t.args[1]));
        assert.ok(r.ms < 100, `traced run took ${r.ms} ms`);
      });
    }
  }
}

test("fuzzySubtree: the known-bad page_old_reference traces to true on fz-06 while the reference traces to false", () => {
  const fuzzy = byId.get("fuzzySubtree");
  const kb = fuzzy.known_bad.find((k) => k.id === "page_old_reference");
  const t = fuzzy.tests.find((x) => x.id === "fz-06");
  assert.equal(runOk("old ref fz-06", kb.code, "fuzzySubtree", fuzzy.arg_types, t.args).result, true);
  assert.equal(runOk("ref fz-06", fuzzy.reference_solution, "fuzzySubtree", fuzzy.arg_types, t.args).result, false);
});

// ---------------------------------------------------------------------------
// Worker protocol: the `trace` message in a simulated worker scope

function makeTraceWorkerScope({ withImport = true, failImport = false } = {}) {
  const posted = [];
  const loaded = [];
  const sandbox = {
    console, performance, URL,                                // URL: the worker resolves the vendor paths against its own location
    location: { href: "http://localhost:5055/js/challenge_worker.js" },
    postMessage(m) { posted.push(structuredClone(m)); },     // structuredClone throws on non-cloneable values, like the real thing
    fetch() { return "should be removed"; },
    onmessage: null,
  };
  sandbox.self = sandbox;                                     // in a worker, self IS the global scope
  if (withImport) {
    sandbox.importScripts = function (...urls) {              // resolves like a real worker: relative to the worker's URL
      for (const u of urls) {
        loaded.push(u);
        if (failImport) throw new Error("NetworkError: importScripts failed");
        const rel = u.replace("http://localhost:5055/js/", "");
        vm.runInContext(readFileSync(path.join(JS_DIR, rel), "utf8"), ctx, { filename: rel });
      }
    };
  }
  const ctx = vm.createContext(sandbox);
  vm.runInContext(readFileSync(WORKER_PATH, "utf8"), ctx, { filename: "challenge_worker.js" });
  return { posted, loaded, sandbox, send: (data) => sandbox.onmessage({ data }) };
}

const traceMsg = (over = {}) => ({ type: "trace", run_id: "t-7", code: fuzzyRef, entry: "fuzzySubtree", arg_types: FZ_TYPES, args: FZ06, max_events: 600, ...over });

test("worker protocol: a trace message loads vendor/acorn.js then challenge_trace.js lazily and posts one trace reply", () => {
  const w = makeTraceWorkerScope();
  assert.equal(w.sandbox.importScripts, undefined, "the accident guard still nulls self.importScripts");
  assert.equal(w.sandbox.fetch, undefined);
  assert.deepEqual(w.loaded, [], "nothing is loaded before the first trace message");
  w.send(traceMsg());
  assert.deepEqual(w.loaded, ["http://localhost:5055/js/vendor/acorn.js", "http://localhost:5055/js/challenge_trace.js"]);
  assert.equal(w.posted.length, 1);
  const m = w.posted[0];
  assert.deepEqual(Object.keys(m).sort(), ["error", "error_kind", "events", "functions", "ms", "nodes", "ok", "result", "run_id", "truncated", "type"]);
  assert.equal(m.type, "trace");
  assert.equal(m.run_id, "t-7");
  assert.equal(m.ok, true);
  assert.equal(m.error, null);
  assert.equal(m.result, false);
  assert.ok(m.events.length > 10);
  assert.equal(m.truncated, false);
  assert.deepEqual(m.functions.map((f) => f.name), ["fuzzySubtree", "countMismatches"]);
  assert.equal(m.nodes.main.length, 5);
  assert.equal(m.nodes.sub.length, 3);
  checkEvents("worker scope", m);
  // a second trace reuses the loaded library; a run message still works in the same scope
  w.send(traceMsg({ run_id: "t-8", args: [[1, 2, 3, 4, 5], [2, 8, 9], 2] }));
  assert.equal(w.loaded.length, 2, "loaded once");
  assert.equal(w.posted[1].run_id, "t-8");
  assert.equal(w.posted[1].result, true);
  w.send({ type: "run", run_id: "r-1", code: fuzzyRef, entry: "fuzzySubtree", arg_types: FZ_TYPES, tests: [{ id: "fz-06", args: FZ06 }], start_index: 0 });
  assert.deepEqual(w.posted.slice(2).map((x) => x.type), ["compiled", "result", "done"]);
  assert.equal(w.posted[3].actual, false);
});

test("worker protocol: without importScripts (or when it fails) the reply is 'visualizer unavailable offline' / load", () => {
  for (const opts of [{ withImport: false }, { withImport: true, failImport: true }]) {
    const w = makeTraceWorkerScope(opts);
    w.send(traceMsg());
    assert.equal(w.posted.length, 1);
    assert.equal(w.posted[0].ok, false);
    assert.equal(w.posted[0].error, "visualizer unavailable offline");
    assert.equal(w.posted[0].error_kind, "load");
    assert.deepEqual(w.posted[0].events, []);
  }
});

test("worker protocol: syntax error, learner throw and unknown messages", () => {
  const w = makeTraceWorkerScope();
  w.send(traceMsg({ code: "function fuzzySubtree( {" }));
  assert.equal(w.posted[0].ok, false);
  assert.equal(w.posted[0].error_kind, "syntax");
  w.send(traceMsg({ code: thrower, args: [[1], [1], 1] }));
  assert.equal(w.posted[1].ok, true);
  assert.equal(w.posted[1].error_kind, "runtime");
  assert.deepEqual(w.posted[1].events.map((e) => e.k), ["call", "throw"]);
  w.send({ type: "ping" });
  w.send(null);
  assert.equal(w.posted.length, 2);
});

// ---------------------------------------------------------------------------
// ChallengeRunner.normalizeTrace (main-thread side)

test("ChallengeRunner.normalizeTrace keeps the addendum shape and drops malformed entries", () => {
  const raw = traceVia(fuzzyRef, "fuzzySubtree", FZ_TYPES, FZ06);
  const n = R.normalizeTrace(raw);
  assert.deepEqual(n.events, raw.events);
  assert.deepEqual(n.functions, raw.functions);
  assert.deepEqual(n.nodes, raw.nodes);
  assert.equal(n.ok, true);
  assert.equal(n.result, false);
  const junk = R.normalizeTrace({
    ok: true, error: "x".repeat(500), error_kind: "weird", result: Infinity, truncated: "yes", ms: -3,
    events: [null, { k: "call", id: -1 }, { k: "call", id: 0, fn: "f", depth: 0, args: [undefined, { node: 2, tree: "nope", val: 9 }] }, { k: "ret", id: 0, value: NaN }, { k: "bogus", id: 0 }],
    functions: [{ name: "f", start_line: 0, end_line: 1 }, { name: "g", start_line: 2, end_line: 1 }, { name: "h", start_line: 1, end_line: 3, params: ["a", 5] }],
    nodes: { main: [{ vid: 0, val: 1, index: 0, parent: null, side: "X" }, { vid: "1" }], sub: "no" },
  });
  assert.equal(junk.error.length, 200);
  assert.equal(junk.error_kind, null);
  assert.equal(junk.result, "Infinity");
  assert.equal(junk.truncated, false);
  assert.equal(junk.ms, 0);
  assert.deepEqual(junk.events, [{ k: "call", id: 0, fn: "f", depth: 0, args: ["undefined", { node: 2, val: 9 }] }, { k: "ret", id: 0, fn: "?", value: "NaN" }]);
  assert.deepEqual(junk.functions, [{ name: "h", start_line: 1, end_line: 3, params: ["a", null] }]);
  assert.deepEqual(junk.nodes, { main: [{ vid: 0, val: 1, index: 0, parent: null, side: null }], sub: [] });
  assert.equal(R.TRACE_MAX_EVENTS, 600);
  assert.equal(R.TRACE_TIMEOUT_ERROR, "Timed out after 2000 ms");
});

// ---------------------------------------------------------------------------
// ChallengeViz: layout, steps and captions (DOM-free)

test("ChallengeViz.layoutTree: x = in-order rank, y = depth, 34/44 px spacing", () => {
  const r = traceVia(fuzzyRef, "fuzzySubtree", FZ_TYPES, FZ06);
  const L = V.layoutTree(r.nodes.main);
  const pos = Object.fromEntries(L.nodes.map((n) => [n.val, [n.x, n.y]]));
  assert.deepEqual(pos, { 4: [0, 2], 2: [1, 1], 5: [2, 2], 1: [3, 0], 3: [4, 1] });
  assert.equal(L.cols, 5);
  assert.equal(L.rows, 3);
  assert.equal(L.width, 4 * 34 + 2 * V.PAD);
  assert.equal(L.height, 2 * 44 + 2 * V.PAD);
  assert.equal(L.root.vid, 0);
  const S = V.layoutTree(r.nodes.sub);
  assert.deepEqual(Object.fromEntries(S.nodes.map((n) => [n.val, [n.x, n.y]])), { 8: [0, 1], 2: [1, 0], 9: [2, 1] });
  const E = V.layoutTree([]);
  assert.equal(E.root, null);
  assert.equal(E.width, 0);
  const chain = V.layoutTree([{ vid: 0, val: 1, index: 0, parent: null, side: null }, { vid: 1, val: 2, index: 2, parent: 0, side: "R" }, { vid: 2, val: 3, index: 6, parent: 1, side: "R" }]);
  assert.deepEqual(chain.nodes.map((n) => [n.x, n.y]), [[0, 0], [1, 1], [2, 2]]);
});

test("ChallengeViz.buildSteps: one step per event, current frame, stack, highlights, values and the final gloss (reference, fz-06)", () => {
  const fuzzy = byId.get("fuzzySubtree");
  const t = fuzzy.tests.find((x) => x.id === "fz-06");
  const r = traceVia(fuzzy.reference_solution, "fuzzySubtree", fuzzy.arg_types, t.args);
  const ctx = { entry: "fuzzySubtree", hasBudget: true, returnType: "boolean", expected: t.expected };
  const steps = V.buildSteps(r, ctx);
  assert.equal(steps.length, r.events.length);
  const s0 = steps[0];
  assert.equal(s0.caption, "Call fuzzySubtree(main node 1, pattern node 2, maxDifferences = 1) at depth 0.");
  assert.equal(s0.call, "fuzzySubtree(main node 1, pattern node 2, maxDifferences = 1)");
  assert.deepEqual(s0.stack, [s0.call]);
  assert.deepEqual(s0.highlight, { main: [0], sub: [0] });
  assert.equal(s0.returnedText, "—");
  assert.equal(s0.depth, 0);
  assert.equal(s0.calls, 1);
  assert.equal(s0.budget, 1);
  assert.deepEqual(s0.visited, { main: {}, sub: {} });
  const s1 = steps[1];
  assert.equal(s1.caption, "Call countMismatches(main node 1, pattern node 2) at depth 1.");
  assert.equal(s1.stack.length, 2);
  assert.equal(s1.depth, 1);
  // the first countMismatches that hits a shape mismatch returns Infinity with the shape gloss
  const inf = steps.find((s) => s.kind === "ret" && /returns Infinity/.test(s.caption));
  assert.ok(inf);
  assert.match(inf.caption, /^countMismatches returns Infinity\. Shape mismatch: this candidate can never match\.$/);
  assert.equal(inf.stack[inf.stack.length - 1], inf.call, "a returning call is still the innermost frame on its own step");
  assert.equal(inf.returnedText, "Infinity");
  const mm = steps.find((s) => s.kind === "ret" && /counted so far/.test(s.caption));
  assert.ok(mm, "finite mismatch counts get the mismatch gloss");
  // a helper returning true for main node 2 vs pattern root 2 would mark it; here every candidate fails and the
  // entry's boolean returns carry the search gloss
  const entryRet = steps.filter((s) => s.kind === "ret" && s.fn === "fuzzySubtree" && /main node/.test(s.call));
  assert.ok(entryRet.length >= 3);
  assert.ok(entryRet.every((s) => /No match was found at or below main node \d+\./.test(s.caption)), entryRet.map((s) => s.caption).join("\n"));
  const emptyRet = steps.find((s) => s.kind === "ret" && s.fn === "fuzzySubtree" && /^fuzzySubtree\(empty/.test(s.call));
  assert.equal(emptyRet.caption, "fuzzySubtree returns false. An empty subtree cannot contain the pattern.");
  const searchOnNode2 = entryRet.find((s) => /main node 2\b/.test(s.caption));
  assert.equal(searchOnNode2.marks[1], false, "a boolean return marks the main node it was about (vid 1 = value 2)");
  assert.ok(searchOnNode2.visited.main[3] && searchOnNode2.visited.main[4], "closed calls leave their nodes visited");
  const last = steps[steps.length - 1];
  assert.equal(last.kind, "ret");
  assert.equal(last.fn, "fuzzySubtree");
  assert.match(last.caption, /fuzzySubtree returns false\. No match was found at or below main node 1\. Final answer: false\. Expected false: your answer matches the expected result\.$/);
  assert.equal(last.marks[0], false);
  assert.equal(last.calls, r.events.filter((e) => e.k === "call").length);
  assert.deepEqual(last.stack, [s0.call]);
});

test("ChallengeViz.buildSteps: the old buggy reference on fz-06 ends with an answer that differs from the expected result", () => {
  const fuzzy = byId.get("fuzzySubtree");
  const t = fuzzy.tests.find((x) => x.id === "fz-06");
  const kb = fuzzy.known_bad.find((k) => k.id === "page_old_reference");
  const r = traceVia(kb.code, "fuzzySubtree", fuzzy.arg_types, t.args);
  const steps = V.buildSteps(r, { entry: "fuzzySubtree", hasBudget: true, returnType: "boolean", expected: false });
  const last = steps[steps.length - 1];
  assert.match(last.caption, /Final answer: true\. Expected false: your answer differs from the expected result\.$/);
  assert.match(last.caption, /^fuzzySubtree returns true\. A match was found at or below main node 1\./);
  // the helper accepting the candidate at main node 2 (a boolean helper return -> candidate gloss + returned-true mark)
  const accept = steps.find((s) => s.kind === "ret" && s.fn === "fuzzySameTree" && /main node 2\b/.test(s.call) && /pattern node 2\b/.test(s.call) && /returns true/.test(s.caption));
  assert.ok(accept, "fuzzySameTree(main node 2, pattern node 2, ...) returns true");
  assert.match(accept.caption, /The candidate rooted at main node 2 matches the pattern\.$/);
  assert.equal(accept.marks[1], true);
  // deeper helper calls talk about the subtree pair they compare
  const deep = steps.find((s) => s.kind === "ret" && s.fn === "fuzzySameTree" && /pattern node 8/.test(s.call));
  assert.match(deep.caption, /The subtree at main node \d+ (matches|does not match) the subtree at pattern node 8\./);
  // a later call on a marked node clears the mark
  const idx = steps.indexOf(accept);
  const later = steps.slice(idx + 1).find((s) => s.kind === "call" && s.highlight.main.indexOf(1) >= 0);
  if (later) assert.equal(later.marks[1], undefined);
});

test("ChallengeViz.buildSteps: count challenge glosses, a throwing run, a truncated run and an empty pattern", () => {
  const cs = byId.get("countSubtrees");
  const t = cs.tests.find((x) => x.id === "cs-04");
  const r = traceVia(cs.reference_solution, "countSubtrees", cs.arg_types, t.args);
  const steps = V.buildSteps(r, { entry: "countSubtrees", hasBudget: false, returnType: "integer", expected: t.expected });
  const last = steps[steps.length - 1];
  assert.match(last.caption, /^countSubtrees returns 1\. 1 matching subtree found at or below main node 1\. Final answer: 1\. Expected 1: your answer matches the expected result\.$/);
  const zero = steps.find((s) => s.kind === "ret" && s.fn === "countSubtrees" && /returns 0/.test(s.caption) && /main node/.test(s.caption));
  assert.match(zero.caption, /0 matching subtrees found at or below main node/);
  const same = steps.find((s) => s.kind === "ret" && s.fn === "isSameTree" && /returns true/.test(s.caption) && /main node/.test(s.call));
  assert.match(same.caption, / matches /);
  const emptyPair = steps.find((s) => s.kind === "ret" && s.fn === "isSameTree" && /^isSameTree\(empty, empty\)/.test(s.call));
  assert.equal(emptyPair.caption, "isSameTree returns true. Both positions are empty, so they agree.");
  assert.ok(steps.every((s) => s.budget === undefined), "no budget row for countSubtrees");
  // throw
  const th = traceVia(thrower, "fuzzySubtree", FZ_TYPES, [[1], [1], 1]);
  const ts = V.buildSteps(th, { entry: "fuzzySubtree", hasBudget: true, returnType: "boolean", expected: true });
  assert.equal(ts.length, 2);
  assert.match(ts[1].caption, /^fuzzySubtree threw an error here\. No final answer: your code stopped with an error \(.*null.*\)\. Expected true\.$/);
  assert.match(ts[1].error, /null/);
  // truncated: no final gloss
  const chain = [];
  for (let i = 0; i < 100; i++) { chain.push(i); if (i < 99) chain.push(null); }
  const cap = traceVia(fuzzyRef, "fuzzySubtree", FZ_TYPES, [chain, [500], 0], 600);
  const cs2 = V.buildSteps(cap, { entry: "fuzzySubtree", hasBudget: true, returnType: "boolean", expected: false });
  assert.equal(cs2.length, 600);
  assert.doesNotMatch(cs2[599].caption, /Final answer/);
  // empty pattern: "empty" in the call description
  const e = traceVia(fuzzyRef, "fuzzySubtree", FZ_TYPES, [[1, 2], [], 1]);
  const es = V.buildSteps(e, { entry: "fuzzySubtree", hasBudget: true, returnType: "boolean", expected: true });
  assert.equal(es[0].caption, "Call fuzzySubtree(main node 1, empty, maxDifferences = 1) at depth 0.");
  assert.equal(es[1].caption, "fuzzySubtree returns true. An empty pattern is always found. Final answer: true. Expected true: your answer matches the expected result.");
  const both = V.describe({ k: "ret", fn: "isSameTree", value: true }, { frame: { fn: "isSameTree", args: [null, null] }, entry: "countSubtrees" });
  assert.equal(both, "isSameTree returns true. Both positions are empty, so they agree.");
  const one = V.describe({ k: "ret", fn: "isSameTree", value: false }, { frame: { fn: "isSameTree", args: [{ node: 3, tree: "main", val: 4 }, null] }, entry: "countSubtrees" });
  assert.equal(one, "isSameTree returns false. One side is empty and the other is not: a shape mismatch.");
  const accepted = V.describe({ k: "ret", fn: "isSameTree", value: true }, { frame: { fn: "isSameTree", args: [{ node: 3, tree: "main", val: 4 }, null] }, entry: "countSubtrees" });
  assert.equal(accepted, "isSameTree returns true. One side is empty and the other is not, yet this call accepted them.");
  const oneEmpty = V.describe({ k: "ret", fn: "isSameTree", value: false }, { frame: { fn: "isSameTree", args: [null, { node: 1, tree: "sub", val: 4 }] }, entry: "countSubtrees" });
  assert.equal(oneEmpty, "isSameTree returns false. One side is empty and the other is not: a shape mismatch.");
});

test("ChallengeViz.fmtVal / argDesc / describe", () => {
  assert.equal(V.fmtVal(undefined), "undefined");
  assert.equal(V.fmtVal(null), "null");
  assert.equal(V.fmtVal("Infinity"), "Infinity");
  assert.equal(V.fmtVal("abc"), '"abc"');
  assert.equal(V.fmtVal({ node: 3, tree: "sub", val: -7 }), "pattern node -7");
  assert.equal(V.fmtVal({ node: null, val: 4 }), "node 4");
  assert.equal(V.argDesc([{ node: 0, tree: "main", val: 1 }, null, 2, "x"], ["root", "subRoot", "k", "s"]), 'main node 1, empty, k = 2, s = "x"');
  assert.equal(V.argDesc([true], []), "true");
  assert.equal(V.describe({ k: "call", fn: "f", depth: 2, args: [1] }, { names: ["n"] }), "Call f(n = 1) at depth 2.");
  assert.equal(V.describe({ k: "throw", fn: "f" }, {}), "f threw an error here.");
  assert.equal(V.describe({ k: "ret", fn: "helper", value: -1 }, { frame: { fn: "helper", args: [{ node: 0, tree: "main", val: 1 }, { node: 0, tree: "sub", val: 1 }] }, hasBudget: true }), "helper returns -1.", "negative numbers get no mismatch gloss");
  assert.equal(V.describe({ k: "ret", fn: "remainingBudget", value: 0 }, { frame: { fn: "remainingBudget", args: [{ node: 0, tree: "main", val: 1 }, { node: 0, tree: "sub", val: 1 }] }, hasBudget: true }), "remainingBudget returns 0.", "a budget helper is not described as a mismatch count");
  assert.equal(V.describe({ k: "ret", fn: "isSameTree", value: false }, { frame: { fn: "isSameTree", args: [null, { node: 0, tree: "sub", val: 1 }] } }), "isSameTree returns false. One side is empty and the other is not: a shape mismatch.");
  assert.equal(V.describe({ k: "ret", fn: "isSameTree", value: false }, { frame: { fn: "isSameTree", args: [null, null] } }), "isSameTree returns false.", "two empty positions returning false: nothing to add");
  assert.equal(V.describe({ k: "ret", fn: "fuzzySubtree", value: false }, { frame: { fn: "fuzzySubtree", args: [{ node: 0, tree: "main", val: 1 }, null, 1] }, entry: "fuzzySubtree" }), "fuzzySubtree returns false. No match was found at or below main node 1.", "an empty pattern rejected: only the value is restated, never the convention");
  assert.equal(V.describe({ k: "ret", fn: "fuzzySubtree", value: false }, { frame: { fn: "fuzzySubtree", args: [null, null, 1] }, entry: "fuzzySubtree" }), "fuzzySubtree returns false. An empty subtree cannot contain the pattern.");
});

// ---------------------------------------------------------------------------
// Polish round: tracer robustness (identifier collisions, top-level calls, generator/async boundaries),
// absent int arguments in captions / the Budget row, and the truncated-trace note

const CS_TYPES = ["tree", "tree"];
function cs06() { const cs = byId.get("countSubtrees"); return [cs, cs.tests.find((x) => x.id === "cs-06")]; }
function untracedResult(code, entry, types, args) {
  const u = worker.runOne(worker.compileLearnerCode(code, entry), { id: "x", args }, types);
  assert.equal(u.error, null, `untraced run failed: ${u.error}`);
  return u.actual;
}

test("polish: learner identifiers __t / __c / __e do not collide with the injected tracer names", () => {
  const [cs, t] = cs06();
  const cases = [
    ["helper named __t", `function __t(p, q) { if (!p && !q) return true; if (!p || !q) return false; if (p.val !== q.val) return false; return __t(p.left, q.left) && __t(p.right, q.right); }
function countSubtrees(root, subRoot) { if (!root) return 0; return (__t(root, subRoot) ? 1 : 0) + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot); }`],
    ["parameter named __t", `function isSameTree(__t, q) { if (!__t && !q) return true; if (!__t || !q) return false; if (__t.val !== q.val) return false; return isSameTree(__t.left, q.left) && isSameTree(__t.right, q.right); }
function countSubtrees(root, subRoot) { if (!root) return 0; return (isSameTree(root, subRoot) ? 1 : 0) + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot); }`],
    ["local let __c", `function countSubtrees(root, subRoot) { if (!root) return 0; let __c = isSameTree(root, subRoot) ? 1 : 0; return __c + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot); }` + isSameTree],
    ["__t, __c and __e together, catch parameter __e", `function __t(p, q) { let __c = 0; try { if (!p && !q) return true; if (!p || !q) return false; __c = p.val !== q.val ? 1 : 0; } catch (__e) { return false; } return __c === 0 && __t(p.left, q.left) && __t(p.right, q.right); }
function countSubtrees(root, subRoot) { const __c = root ? (__t(root, subRoot) ? 1 : 0) : 0; if (!root) return __c; return __c + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot); }`],
  ];
  for (const [name, code] of cases) {
    const r = runOk(name, code, "countSubtrees", cs.arg_types, t.args, t.expected);
    assert.equal(r.error, null, name);
    assert.equal(untracedResult(code, "countSubtrees", cs.arg_types, t.args), r.result, `${name}: untraced and traced agree`);
    const inst = T.instrument(code);
    assert.match(inst.code, /__sua_tracer__\.enter\(/, name);
    assert.doesNotMatch(inst.code, /\b__t\.enter\(|const __c = __t\b/, `${name}: the old names are not injected`);
  }
  // The finding's divergence probe: `typeof __t` is "undefined" in the traced run too, exactly like the untraced one.
  const probe = `function countSubtrees(root, subRoot) { if (typeof __t === "object" || typeof __c === "number") { return 42; } return 0; }`;
  const r = runOk("probe", probe, "countSubtrees", cs.arg_types, t.args);
  assert.equal(r.result, 0);
  assert.equal(untracedResult(probe, "countSubtrees", cs.arg_types, t.args), 0);
});

test("polish: the replay starts with the harness call even when the learner's script calls the entry function at top level", () => {
  const [cs, t] = cs06();
  const plain = runOk("plain", countRef, "countSubtrees", cs.arg_types, t.args, t.expected);
  const selfTest = countRef + `\ncountSubtrees({ val: 1, left: null, right: null }, { val: 1, left: null, right: null });\nisSameTree(null, null);`;
  const r = runOk("top-level self-test", selfTest, "countSubtrees", cs.arg_types, t.args, t.expected);
  assert.deepEqual(r.events[0], plain.events[0], "first event = the harness call on the chosen input (main/sub node args, id 0)");
  assert.deepEqual(r.events[0].args, [{ node: 0, tree: "main", val: -1 }, { node: 0, tree: "sub", val: -2 }]);
  assert.equal(r.events.length, plain.events.length, "the learner's own top-level calls are not part of the replay");
  assert.deepEqual(r.events.map((e) => [e.k, e.id, e.fn]), plain.events.map((e) => [e.k, e.id, e.fn]));
  assert.equal(untracedResult(selfTest, "countSubtrees", cs.arg_types, t.args), t.expected);
  // a top-level statement that throws still surfaces as a runtime error (the entry never ran); the events recorded
  // before the throw are kept, since nothing was reset
  const boom = countRef + `\nisSameTree(null, null).x.y;`;
  const b = traceVia(boom, "countSubtrees", cs.arg_types, t.args);
  assert.equal(b.ok, true);
  assert.equal(b.error_kind, "runtime");
  assert.match(b.error, /Cannot read propert(y|ies) of undefined/);
  assert.equal(b.result, null);
  assert.deepEqual(b.events.map((e) => [e.k, e.fn]), [["call", "isSameTree"], ["ret", "isSameTree"]], "the events of the top-level call that preceded the throw are kept");
  // makeTracer().reset() forgets everything, including ids
  const tr = T.makeTracer({ max_events: 2 });
  const id = tr.enter("a", 0, [1]);
  tr.enter("b", 1, [2]);
  tr.enter("c", 2, [3]);
  assert.equal(tr.truncated(), true);
  tr.reset();
  assert.deepEqual(tr.events(), []);
  assert.equal(tr.truncated(), false);
  assert.equal(tr.calls(), 0);
  assert.equal(tr.enter("d", 3, [4]), 0, "ids restart at 0");
  assert.equal(id, 0);
});

test("polish: generator and async functions are boundaries: their returns stay theirs, nested ordinary functions are still traced", () => {
  const [cs, t] = cs06();
  const gen = `function countSubtrees(root, subRoot) {
  function* nodes(n) { if (!n) return; yield n; yield* nodes(n.left); yield* nodes(n.right); }
  let k = 0; for (const n of nodes(root)) if (isSameTree(n, subRoot)) k++;
  return k;
}` + isSameTree;
  const r = runOk("nested generator", gen, "countSubtrees", cs.arg_types, t.args, t.expected);
  const calls = r.events.filter((e) => e.k === "call" && e.fn === "countSubtrees").length;
  const rets = r.events.filter((e) => e.k === "ret" && e.fn === "countSubtrees").length;
  assert.deepEqual([calls, rets], [1, 1], "the generator's returns are not attributed to countSubtrees");
  assert.deepEqual(r.functions.map((f) => f.name), ["countSubtrees", "isSameTree"], "the generator itself is not instrumented");
  assert.equal(untracedResult(gen, "countSubtrees", cs.arg_types, t.args), r.result);
  const instGen = T.instrument(gen);
  assert.match(instGen.code, /function\* nodes\(n\) \{ if \(!n\) return; yield n;/, "the generator body is untouched");
  // an async function nested in an instrumented function: same rule
  const asyncNested = `function countSubtrees(root, subRoot) { async function later(x) { return x; } later(1); if (!root) return 0; return (isSameTree(root, subRoot) ? 1 : 0) + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot); }` + isSameTree;
  const a = runOk("nested async", asyncNested, "countSubtrees", cs.arg_types, t.args, t.expected);
  assert.equal(a.events.filter((e) => e.fn === "countSubtrees" && e.k === "call").length, a.events.filter((e) => e.fn === "countSubtrees" && e.k === "ret").length);
  assert.match(T.instrument(asyncNested).code, /async function later\(x\) \{ return x; \}/);
  // an ordinary function inside a generator IS instrumented, while the generator's own `return -1` is left alone
  const inner = `function f(a) { function* g() { const inner = (x) => { return x + 1; }; yield inner(a); return -1; } let s = 0; for (const v of g()) s += v; return s; }`;
  const i = traceVia(inner, "f", ["int"], [7]);
  assert.equal(i.ok, true);
  assert.equal(i.result, 8);
  assert.deepEqual(i.events.map((e) => [e.k, e.fn]), [["call", "f"], ["call", "inner"], ["ret", "inner"], ["ret", "f"]]);
  assert.deepEqual(i.functions.map((f) => f.name), ["f", "inner"]);
  const instInner = T.instrument(inner);
  assert.match(instInner.code, /return -1; \}/, "the generator's return is not rewritten");
  assert.match(instInner.code, /return __sua_tracer__\.ret\(__sua_call__, \(x \+ 1\)\)/, "the arrow nested in the generator is");
  checkEvents("inner in generator", i);
  // generator methods and async arrows are boundaries too
  const methods = T.instrument(`class A { *gen() { return 1; } async run() { return 2; } plain() { return 3; } }\nconst later = async () => { return 4; };`);
  assert.deepEqual(methods.functions.map((f) => f.name), ["plain"]);
  assert.match(methods.code, /\*gen\(\) \{ return 1; \}/);
  assert.match(methods.code, /async run\(\) \{ return 2; \}/);
  assert.match(methods.code, /async \(\) => \{ return 4; \}/);
});

test("polish: a named int parameter the call did not pass reads 'not passed (default applies)' and the Budget row says default", () => {
  const fuzzy = byId.get("fuzzySubtree");
  const t2 = fuzzy.tests.find((x) => x.args.length === 2 && nodeCount(x.args[0]) > 0 && nodeCount(x.args[1]) > 0);   // fz-03
  const t3 = fuzzy.tests.find((x) => x.args.length === 3 && x.args[2] === 2 && totalNodes(fuzzy, x) <= MAX_NODES);   // fz-07
  assert.ok(t2 && t3);
  const ctx = { entry: "fuzzySubtree", hasBudget: true, returnType: "boolean" };
  const noDefault = `function fuzzySubtree(root, subRoot, maxDifferences) {
  if (maxDifferences === undefined) maxDifferences = 1;
  if (!subRoot) return true;
  if (!root) return false;
  if (countMismatches(root, subRoot) <= maxDifferences) return true;
  return fuzzySubtree(root.left, subRoot, maxDifferences) || fuzzySubtree(root.right, subRoot, maxDifferences);
}
function countMismatches(p, q) { if (!p && !q) return 0; if (!p || !q) return Infinity; return (p.val !== q.val ? 1 : 0) + countMismatches(p.left, q.left) + countMismatches(p.right, q.right); }`;
  const r2 = runOk("no-default signature, 2 args", noDefault, "fuzzySubtree", fuzzy.arg_types, t2.args, t2.expected);
  const s2 = V.buildSteps(R.normalizeTrace(r2), { ...ctx, expected: t2.expected });
  assert.equal(s2[0].caption, "Call fuzzySubtree(main node 1, pattern node 2, maxDifferences not passed (default applies)) at depth 0.");
  assert.equal(s2[0].call, "fuzzySubtree(main node 1, pattern node 2, maxDifferences not passed (default applies))");
  assert.equal(s2[0].budget, "undefined", "the recorded value stays available");
  assert.ok(s2.every((s) => s.budgetText === "default"), "Budget row: default");
  assert.doesNotMatch(s2.map((s) => s.caption).join("\n"), /= undefined/);
  // the same code with three arguments shows the value
  const r3 = runOk("no-default signature, 3 args", noDefault, "fuzzySubtree", fuzzy.arg_types, t3.args, t3.expected);
  const s3 = V.buildSteps(R.normalizeTrace(r3), { ...ctx, expected: t3.expected });
  assert.match(s3[0].caption, /maxDifferences = 2\) at depth 0\.$/);
  assert.ok(s3.every((s) => s.budgetText === "2" && s.budget === 2));
  // a signature default is captured after it applied: the value shows
  const ref = V.buildSteps(traceVia(fuzzyRef, "fuzzySubtree", fuzzy.arg_types, t2.args), ctx);
  assert.match(ref[0].caption, /maxDifferences = 1\) at depth 0\.$/);
  assert.equal(ref[0].budgetText, "1");
  // a two-parameter signature ignores the third argument: nothing to name in the caption, Budget = default
  const twoParams = `function fuzzySubtree(root, subRoot) { if (!subRoot) return true; if (!root) return false; return countMismatches(root, subRoot) <= 1 || fuzzySubtree(root.left, subRoot) || fuzzySubtree(root.right, subRoot); }
function countMismatches(p, q) { if (!p && !q) return 0; if (!p || !q) return Infinity; return (p.val !== q.val ? 1 : 0) + countMismatches(p.left, q.left) + countMismatches(p.right, q.right); }`;
  const sTwo = V.buildSteps(traceVia(twoParams, "fuzzySubtree", fuzzy.arg_types, t3.args), ctx);
  assert.equal(sTwo[0].call, "fuzzySubtree(main node 1, pattern node 2)");
  assert.equal(sTwo[0].budget, undefined);
  assert.equal(sTwo[0].budgetText, "default");
  // no Budget text at all without has_budget_arg
  const [cs, t] = cs06();
  assert.ok(V.buildSteps(traceVia(countRef, "countSubtrees", cs.arg_types, t.args), { entry: "countSubtrees" }).every((s) => s.budgetText === undefined && s.budget === undefined));
  // argDesc: the raw string "undefined" and a real undefined both count as absent; without a name the value shows
  assert.equal(V.argDesc([1, "undefined", undefined], ["a", "b", "c"]), "a = 1, b not passed (default applies), c not passed (default applies)");
  assert.equal(V.argDesc(["undefined"], []), "undefined");
  assert.equal(V.describe({ k: "call", fn: "h", depth: 1, args: [{ node: 0, tree: "main", val: 1 }, "undefined"] }, { names: ["p", "depth"] }), "Call h(main node 1, depth not passed (default applies)) at depth 1.");
});

test("polish: a truncated trace's note says where it was cut and how the run ended (traceNotes)", () => {
  const chain = [];
  for (let i = 0; i < 100; i++) { chain.push(i); if (i < 99) chain.push(null); }
  const cap = traceVia(fuzzyRef, "fuzzySubtree", FZ_TYPES, [chain, [500], 0], 600);
  assert.equal(cap.truncated, true);
  assert.equal(cap.result, false);
  const ctx = { entry: "fuzzySubtree", hasBudget: true, returnType: "boolean", expected: false };
  const steps = V.buildSteps(cap, ctx);
  assert.deepEqual(V.traceNotes(cap, ctx, steps), ["Trace cut at 600 events; the run finished with final answer false. Expected false: your answer matches the expected result."]);
  assert.deepEqual(V.traceNotes(cap, { entry: "fuzzySubtree", expected: true }, steps), ["Trace cut at 600 events; the run finished with final answer false. Expected true: your answer differs from the expected result."]);
  assert.deepEqual(V.traceNotes(cap, { entry: "fuzzySubtree" }, steps), ["Trace cut at 600 events; the run finished with final answer false."]);
  assert.doesNotMatch(steps[599].caption, /Final answer/, "the last recorded step is mid-run: no final gloss in the caption");
  // the count challenge from the finding: 800 events, the run finishes with 0 (expected 2)
  const [cs, t] = cs06();
  const loop = "function countSubtrees(root, subRoot) {\n  let n = 0;\n  for (let i = 0; i < 400; i++) n += h(i);\n  return n;\n}\nfunction h(i) { return 0; }\n";
  const lp = traceVia(loop, "countSubtrees", cs.arg_types, t.args, 600);
  assert.deepEqual(V.traceNotes(lp, { entry: "countSubtrees", expected: t.expected }, V.buildSteps(lp, {})), ["Trace cut at 600 events; the run finished with final answer 0. Expected 2: your answer differs from the expected result."]);
  // truncated and then an error (unbounded recursion): the cut note, then the throw note
  const inf = traceVia("function countSubtrees(root, subRoot) { return countSubtrees(root, subRoot) + 1; }", "countSubtrees", cs.arg_types, t.args, 600);
  assert.equal(inf.ok, true);
  assert.equal(inf.truncated, true);
  assert.match(inf.error, /call stack|recursion/i);
  const infNotes = V.traceNotes(inf, { expected: t.expected }, V.buildSteps(inf, {}));
  assert.equal(infNotes.length, 2);
  assert.equal(infNotes[0], "Trace cut at 600 events; the run then stopped with an error.");
  assert.match(infNotes[1], /^Your code threw: /);
  // a throw within the recorded events names its step; a clean run and a timeout have no notes
  const th = traceVia(thrower, "fuzzySubtree", FZ_TYPES, [[1], [1], 1]);
  const thNotes = V.traceNotes(th, { expected: true }, V.buildSteps(th, { entry: "fuzzySubtree" }));
  assert.equal(thNotes.length, 1);
  assert.match(thNotes[0], /^Your code threw at step 2: Cannot read propert(y|ies) of null/);
  const clean = traceVia(fuzzyRef, "fuzzySubtree", FZ_TYPES, FZ06);
  assert.deepEqual(V.traceNotes(clean, { expected: false }, V.buildSteps(clean, {})), []);
  assert.deepEqual(V.traceNotes({ ok: false, error: R.TRACE_TIMEOUT_ERROR, error_kind: "timeout", events: [], truncated: false }, {}, []), []);
  assert.deepEqual(V.traceNotes(null, null, null), []);
});
