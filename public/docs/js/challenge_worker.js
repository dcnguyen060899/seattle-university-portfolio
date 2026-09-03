/* docs/js/challenge_worker.js - browser sandbox for learner code (spec 3.1).
 *
 * Runs as a Web Worker spawned by challenge_runner.js; also loadable as a CommonJS module
 * (Node) by backend/scripts/verify_challenges.mjs and the node tests. It is an accident
 * guard, not a security boundary: it only guarantees that reporting uses references
 * captured before learner code runs, and that hangs can be killed from the main thread.
 *
 * main -> worker:  { type: "run", run_id, code, entry, arg_types, tests: [{id, args}], start_index }
 * worker -> main:  { type: "compiled", run_id, ok, error, error_kind, entry_found, defined_functions }
 *                  { type: "result", run_id, index, id, actual, actual_type, error, ms }  (per test)
 *                  { type: "done", run_id, total_ms }
 *
 * Execution replay (lead addendum 2, section 2): one traced run of the entry function on one input.
 * main -> worker:  { type: "trace", run_id, code, entry, arg_types, args, max_events }
 * worker -> main:  { type: "trace", run_id, ok, error, error_kind, result, events, truncated, functions, nodes, ms }
 * The tracer (js/challenge_trace.js + js/vendor/acorn.js) is loaded lazily with the importScripts reference
 * captured below, only when the first trace message arrives; a run message never loads it.
 *
 * The whole file is one IIFE: learner code is compiled with `new Function` and therefore only sees the worker's
 * global scope, so the captured references (post, importScriptsRef, now, traceLib) and the helpers are private
 * bindings it can neither read nor reassign (a top-level `var` would have been a property of the worker global).
 * Only self.onmessage (browser) and module.exports (Node) are exposed.
 */
(function () {
const IS_WORKER = typeof self !== "undefined" && typeof self.postMessage === "function";
const post = IS_WORKER ? self.postMessage.bind(self) : function () {};        // captured BEFORE learner code runs
const importScriptsRef = (IS_WORKER && typeof self.importScripts === "function") ? self.importScripts.bind(self) : null;   // captured BEFORE the guard below nulls it
const now = function () { return (typeof performance !== "undefined" && performance && typeof performance.now === "function") ? performance.now() : Date.now(); };
if (IS_WORKER) {                                                              // accident guard only
  try { self.fetch = undefined; } catch (e) { /* ignore */ }
  try { self.XMLHttpRequest = undefined; } catch (e) { /* ignore */ }
  try { self.WebSocket = undefined; } catch (e) { /* ignore */ }
  try { self.importScripts = undefined; } catch (e) { /* ignore */ }
}

const ENTRY_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ERROR_MAX = 200;

/* Level-order array -> tree (LeetCode convention, spec 2.2). Nodes are plain {val, left, right}. */
function buildTree(levelOrder) {
  if (!Array.isArray(levelOrder) || levelOrder.length === 0 || levelOrder[0] === null || levelOrder[0] === undefined) return null;
  if (levelOrder.length > 10000) throw new Error("tree input too large");
  var mk = function (v) { return { val: v, left: null, right: null }; };
  var root = mk(levelOrder[0]);
  var queue = [root];
  var i = 1;
  while (queue.length && i < levelOrder.length) {
    var node = queue.shift();
    if (i < levelOrder.length) { var l = levelOrder[i++]; if (l !== null && l !== undefined) { node.left = mk(l); queue.push(node.left); } }
    if (i < levelOrder.length) { var r = levelOrder[i++]; if (r !== null && r !== undefined) { node.right = mk(r); queue.push(node.right); } }
  }
  return root;
}

/* Factory: each call yields a FRESH function instance (fresh closure / module-level state). */
function compileLearnerCode(code, entry) {
  if (!ENTRY_RE.test(entry)) throw new Error("bad entry name");
  return new Function('"use strict";\n' + code + '\n;return (typeof ' + entry + ' === "function") ? ' + entry + ' : undefined;');
}

/* Never throws, never returns non-cloneable values. */
function serializeActual(v) {
  if (v === undefined) return { actual: "undefined", actual_type: "undefined" };
  if (v === null) return { actual: null, actual_type: "null" };
  var t = typeof v;
  if (t === "boolean") return { actual: v, actual_type: t };
  if (t === "number") return { actual: Number.isFinite(v) ? v : String(v), actual_type: t };
  if (t === "string") return { actual: v.slice(0, 100), actual_type: t };
  if (t === "bigint") return { actual: String(v) + "n", actual_type: t };
  var s;
  try { s = String(v).slice(0, 100); } catch (e) { s = "[unprintable " + t + "]"; }
  return { actual: s, actual_type: t };
}

function errorText(e) {
  var m;
  try { m = String((e && e.message) || e); } catch (_) { m = "unknown error"; }
  return m.slice(0, ERROR_MAX);
}

/* Runs one test against a fresh function instance with fresh trees. */
function runOne(factory, test, argTypes) {
  var args = test.args.map(function (a, i) { return argTypes[i] === "tree" ? buildTree(a) : a; });
  var actual, error = null;
  var t0 = now();
  try {
    var fn = factory();
    if (!fn) throw new Error("entry function not found");
    actual = fn.apply(null, args);
  } catch (e) {
    error = errorText(e);
  }
  var ms = Math.round((now() - t0) * 1000) / 1000;
  var ser = serializeActual(error === null ? actual : undefined);
  return { id: test.id, actual: error === null ? ser.actual : null, actual_type: error === null ? ser.actual_type : "error", error: error, ms: ms };
}

/* Informational only: names that look like function definitions in the source. */
function definedFunctions(code) {
  var names = [];
  var seen = {};
  var add = function (n) { if (n && !seen[n] && names.length < 50) { seen[n] = true; names.push(n); } };
  var m;
  var decl = /\bfunction\s+([A-Za-z_$][\w$]*)/g;
  while ((m = decl.exec(code)) !== null) add(m[1]);
  var expr = /\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\(|[A-Za-z_$][\w$]*\s*=>|function)/g;
  while ((m = expr.exec(code)) !== null) add(m[2]);
  return names;
}

function handleRun(msg) {
  var runId = typeof msg.run_id === "string" ? msg.run_id : String(msg.run_id);
  var code = typeof msg.code === "string" ? msg.code : "";
  var entry = typeof msg.entry === "string" ? msg.entry : "";
  var argTypes = Array.isArray(msg.arg_types) ? msg.arg_types : [];
  var tests = Array.isArray(msg.tests) ? msg.tests : [];
  var start = Number(msg.start_index);
  if (!Number.isInteger(start) || start < 0) start = 0;
  var tAll = now();

  var compiled = { type: "compiled", run_id: runId, ok: true, error: null, error_kind: null, entry_found: false, defined_functions: definedFunctions(code) };
  var factory = null;
  try {
    factory = compileLearnerCode(code, entry);
  } catch (e) {
    compiled.ok = false;
    compiled.error = errorText(e);
    compiled.error_kind = (e instanceof SyntaxError) ? "syntax" : "load";
  }
  if (compiled.ok) {
    try {
      compiled.entry_found = typeof factory() === "function";     // runs top-level code once
    } catch (e) {
      compiled.ok = false;
      compiled.error = errorText(e);
      compiled.error_kind = "load";
    }
  }
  post(compiled);

  if (compiled.ok && compiled.entry_found) {
    for (var i = start; i < tests.length; i++) {
      var t = tests[i] || {};
      var r = runOne(factory, { id: t.id, args: Array.isArray(t.args) ? t.args : [] }, argTypes);   // fresh instance per test
      post({ type: "result", run_id: runId, index: i, id: r.id, actual: r.actual, actual_type: r.actual_type, error: r.error, ms: r.ms });
    }
  }
  post({ type: "done", run_id: runId, total_ms: Math.round((now() - tAll) * 1000) / 1000 });
}

/* ---------- Execution trace (lazy: acorn + challenge_trace.js are loaded on the first trace message) ---------- */

const TRACE_MAX_EVENTS_DEFAULT = 600;
const TRACE_MAX_EVENTS_CAP = 5000;
let traceLib = null;

/* Resolves the tracer library: the CommonJS require in Node, importScripts (relative to this worker's URL)
   in the browser. Throws when neither is available (offline / blocked vendor file). */
function loadTraceLib() {
  if (traceLib) return traceLib;
  var lib = null;
  if (!IS_WORKER && typeof module !== "undefined" && typeof require === "function") {
    lib = require("./challenge_trace.js");
  } else {
    if (typeof self !== "undefined" && self.ChallengeTrace) lib = self.ChallengeTrace;
    else {
      if (!importScriptsRef) throw new Error("visualizer unavailable offline");
      var base = "";
      try { base = (self.location && typeof self.location.href === "string") ? self.location.href : ""; } catch (e) { base = ""; }
      var url = function (rel) { try { return (base && typeof URL === "function") ? new URL(rel, base).href : rel; } catch (e) { return rel; } };
      importScriptsRef(url("vendor/acorn.js"), url("challenge_trace.js"));
      lib = (typeof self !== "undefined" && self.ChallengeTrace) ? self.ChallengeTrace : (typeof ChallengeTrace !== "undefined" ? ChallengeTrace : null);
    }
  }
  if (!lib || typeof lib.runTrace !== "function") throw new Error("visualizer unavailable offline");
  traceLib = lib;
  return traceLib;
}

/* Builds the trace response for one message without posting it (pure apart from the lazy load). */
function traceOnce(msg) {
  var runId = typeof msg.run_id === "string" ? msg.run_id : String(msg.run_id);
  var code = typeof msg.code === "string" ? msg.code : "";
  var entry = typeof msg.entry === "string" ? msg.entry : "";
  var argTypes = Array.isArray(msg.arg_types) ? msg.arg_types : [];
  var args = Array.isArray(msg.args) ? msg.args : [];
  var maxEvents = Number(msg.max_events);
  if (!Number.isInteger(maxEvents) || maxEvents < 1) maxEvents = TRACE_MAX_EVENTS_DEFAULT;
  if (maxEvents > TRACE_MAX_EVENTS_CAP) maxEvents = TRACE_MAX_EVENTS_CAP;
  var out = { type: "trace", run_id: runId, ok: false, error: null, error_kind: null, result: null, events: [], truncated: false, functions: [], nodes: { main: [], sub: [] }, ms: 0 };
  var lib;
  try {
    lib = loadTraceLib();
  } catch (e) {
    out.error = "visualizer unavailable offline";
    out.error_kind = "load";
    return out;
  }
  if (!ENTRY_RE.test(entry)) {
    out.error = "bad entry name";
    out.error_kind = "load";
    return out;
  }
  var r;
  try {
    r = lib.runTrace(code, entry, argTypes, args, { max_events: maxEvents });
  } catch (e) {
    out.error = errorText(e);
    out.error_kind = "instrument";
    return out;
  }
  out.ok = r.ok === true;
  out.error = (typeof r.error === "string") ? r.error.slice(0, ERROR_MAX) : null;
  out.error_kind = (typeof r.error_kind === "string") ? r.error_kind : null;
  out.result = (r.result === undefined) ? null : r.result;
  out.events = Array.isArray(r.events) ? r.events : [];
  out.truncated = r.truncated === true;
  out.functions = Array.isArray(r.functions) ? r.functions : [];
  out.nodes = (r.nodes && typeof r.nodes === "object") ? { main: Array.isArray(r.nodes.main) ? r.nodes.main : [], sub: Array.isArray(r.nodes.sub) ? r.nodes.sub : [] } : { main: [], sub: [] };
  out.ms = (typeof r.ms === "number" && Number.isFinite(r.ms)) ? r.ms : 0;
  return out;
}

function handleTrace(msg) {
  var out = traceOnce(msg);
  try {
    post(out);
  } catch (e) {                      // a value the structured clone rejects: report instead of dying silently
    post({ type: "trace", run_id: out.run_id, ok: false, error: "the trace could not be sent: " + errorText(e), error_kind: "load", result: null, events: [], truncated: false, functions: [], nodes: { main: [], sub: [] }, ms: 0 });
  }
}

if (IS_WORKER) {
  self.onmessage = function (ev) {
    var msg = ev && ev.data;
    if (!msg) return;
    if (msg.type === "run") handleRun(msg);
    else if (msg.type === "trace") handleTrace(msg);
  };
}

if (typeof module !== "undefined") {
  module.exports = { buildTree: buildTree, compileLearnerCode: compileLearnerCode, runOne: runOne, serializeActual: serializeActual, definedFunctions: definedFunctions, traceOnce: traceOnce, handleTrace: handleTrace, loadTraceLib: loadTraceLib };
}
})();
