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
 */
var IS_WORKER = typeof self !== "undefined" && typeof self.postMessage === "function";
var post = IS_WORKER ? self.postMessage.bind(self) : function () {};          // captured BEFORE learner code runs
var now = function () { return (typeof performance !== "undefined" && performance && typeof performance.now === "function") ? performance.now() : Date.now(); };
if (IS_WORKER) {                                                              // accident guard only
  try { self.fetch = undefined; } catch (e) { /* ignore */ }
  try { self.XMLHttpRequest = undefined; } catch (e) { /* ignore */ }
  try { self.WebSocket = undefined; } catch (e) { /* ignore */ }
  try { self.importScripts = undefined; } catch (e) { /* ignore */ }
}

var ENTRY_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
var ERROR_MAX = 200;

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

if (IS_WORKER) {
  self.onmessage = function (ev) {
    var msg = ev && ev.data;
    if (!msg || msg.type !== "run") return;
    handleRun(msg);
  };
}

if (typeof module !== "undefined") {
  module.exports = { buildTree: buildTree, compileLearnerCode: compileLearnerCode, runOne: runOne, serializeActual: serializeActual, definedFunctions: definedFunctions };
}
