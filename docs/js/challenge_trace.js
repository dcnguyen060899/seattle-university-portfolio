/* docs/js/challenge_trace.js - execution tracer for "Visualize my solution" (lead addendum 2, section 2).
 *
 * Instruments learner JavaScript (acorn 8.14.0, vendored at js/vendor/acorn.js) so that every function
 * call, return and throw is recorded, then runs the entry function once on one test input and returns
 * the event list plus the node metadata the replay UI needs for layout.
 *
 * Works as a CommonJS module in Node (backend/tests/js/trace.test.mjs) and as a classic script inside the
 * challenge Web Worker (challenge_worker.js loads js/vendor/acorn.js then this file with importScripts
 * when it receives a `trace` message). Nothing here touches the DOM or the network.
 *
 *   instrument(code)        -> { code, functions: [{ name, start_line, end_line, params }] }   (throws SyntaxError)
 *                              every function gets an index (its position in `functions`) which the rewritten code
 *                              passes to __t.enter(name, index, [args]); the call event records it as `f`, so a call
 *                              maps back to ITS function even when names repeat ("(anonymous)" callbacks, shadowing)
 *   makeTracer(limits)      -> { enter, ret, throw, exit, events(), truncated(), calls() }
 *   buildTraceTree(arr, t)  -> { root, nodes: [{ vid, val, index, parent, side }] }
 *   runTrace(code, entry, argTypes, args, limits) -> { ok, error, error_kind, result, events, truncated, functions, nodes, ms }
 *   serialize(v)            -> JSON-safe value (tree node -> { node: vid, tree: "main"|"sub", val })
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./vendor/acorn.js"));
  else root.ChallengeTrace = factory(root.acorn);
})(typeof self !== "undefined" ? self : this, function (acorn) {
  "use strict";

  var FN_TYPES = { FunctionDeclaration: 1, FunctionExpression: 1, ArrowFunctionExpression: 1 };

  function paramNames(params) {
    return params.map(function (p) {
      if (p.type === "Identifier") return p.name;
      if (p.type === "AssignmentPattern" && p.left.type === "Identifier") return p.left.name;
      return null; // destructured / rest: not captured
    });
  }

  function fnName(node, parent) {
    if (node.id && node.id.name) return node.id.name;
    if (!parent) return "(anonymous)";
    if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") return parent.id.name;
    if ((parent.type === "Property" || parent.type === "MethodDefinition") && parent.key) {
      return parent.key.type === "Identifier" ? parent.key.name : String(parent.key.value);
    }
    if (parent.type === "AssignmentExpression" && parent.left.type === "Identifier") return parent.left.name;
    return "(anonymous)";
  }

  function jsStr(s) { return JSON.stringify(String(s)); }

  // Returns { code, functions:[{name,start_line,end_line,params}] } or throws (SyntaxError from acorn).
  function instrument(code) {
    var tokens = [];
    var ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: "script", locations: true, allowReturnOutsideFunction: false, onToken: tokens });
    var arrows = [];   // the "=>" tokens in source order
    for (var ti = 0; ti < tokens.length; ti++) if (tokens[ti].type && tokens[ti].type.label === "=>") arrows.push(tokens[ti]);
    var edits = []; // {pos, text, depth, kind}  kind: 'open' | 'close'
    var functions = [];

    function addEdit(pos, text, depth, kind) { edits.push({ pos: pos, text: text, depth: depth, kind: kind }); }

    // End offset of an arrow function's "=>". acorn (preserveParens off) reports the INNER expression's positions for
    // a parenthesized body, so "(v) => ({ val: v })" has body.start inside the learner's parentheses; the block that
    // replaces an expression body must therefore start right after the arrow token, never at body.start.
    function arrowEnd(node) {
      var from = node.params.length ? node.params[node.params.length - 1].end : node.start;
      for (var i = 0; i < arrows.length; i++) if (arrows[i].start >= from) return arrows[i].end;
      var k = code.indexOf("=>", from);       // never expected: acorn always tokenizes the arrow
      return k >= 0 ? k + 2 : node.body.start;
    }

    function visit(node, parent, fnDepth) {
      if (!node || typeof node.type !== "string") return;
      if (FN_TYPES[node.type] && !node.generator && !node.async) {
        var name = fnName(node, parent);
        var names = paramNames(node.params);
        var argList = "[" + names.map(function (n) { return n === null ? "undefined" : n; }).join(", ") + "]";
        var depth = fnDepth + 1;
        var index = functions.length;
        functions.push({ name: name, start_line: node.loc.start.line, end_line: node.loc.end.line, params: names });
        var open = "const __c = __t.enter(" + jsStr(name) + ", " + index + ", " + argList + "); try {";
        var close = "} catch (__e) { __t.throw(__c, __e); throw __e; } finally { __t.exit(__c); }";
        if (node.body.type === "BlockStatement") {
          addEdit(node.body.start + 1, " " + open + " ", depth, "open");
          addEdit(node.body.end - 1, " " + close + " ", depth, "close");
          // visit the body statements with this function as the current one
          visitChildren(node.body, node, depth);
        } else {
          // expression-bodied arrow: (x) => expr  ->  (x) => { ...; try { return __t.ret(__c, (expr)); } ... }
          // The learner's text between "=>" and the end of the arrow (parentheses included) is kept verbatim.
          addEdit(arrowEnd(node), " { " + open + " return __t.ret(__c, (", depth, "open");
          addEdit(node.end, ")); " + close + " }", depth, "close");
          visit(node.body, node, depth);
        }
        // params may contain default-value functions; visit them too (rare)
        node.params.forEach(function (p) { visit(p, node, depth); });
        return;
      }
      if (node.type === "ReturnStatement" && fnDepth > 0) {
        // Return edits sit at depth + 0.5: inside their own function's close edit, outside the edits of any function
        // nested in the argument ("return x => x + 1" ends the arrow and the return at the same offset).
        if (node.argument) {
          addEdit(node.argument.start, "__t.ret(__c, (", fnDepth + 0.5, "open");
          addEdit(node.argument.end, "))", fnDepth + 0.5, "close");
          visit(node.argument, node, fnDepth);
        } else {
          addEdit(node.start + 6, " __t.ret(__c, undefined)", fnDepth + 0.5, "open");
        }
        return;
      }
      visitChildren(node, parent, fnDepth);
    }

    function visitChildren(node, parent, fnDepth) {
      for (var key in node) {
        if (key === "loc" || key === "type" || key === "start" || key === "end") continue;
        var child = node[key];
        if (Array.isArray(child)) {
          for (var i = 0; i < child.length; i++) if (child[i] && typeof child[i].type === "string") visit(child[i], node, fnDepth);
        } else if (child && typeof child.type === "string") {
          visit(child, node, fnDepth);
        }
      }
    }

    visit(ast, null, 0);

    // Apply edits from the end of the source backwards so earlier offsets stay valid. Ties at one offset: apply the
    // OUTER (smaller depth) edit first so the inner edit's text lands before it in the output (a function's close,
    // then the return's "))", then a nested arrow's close); for equal depth apply 'close' before 'open'.
    edits.sort(function (a, b) {
      if (b.pos !== a.pos) return b.pos - a.pos;
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.kind === "close" ? -1 : 1;
    });
    var out = code;
    for (var i = 0; i < edits.length; i++) {
      var e = edits[i];
      out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
    }
    return { code: out, functions: functions };
  }

  function serialize(v) {
    if (v === undefined) return "undefined";
    if (v === null) return null;
    var t = typeof v;
    if (t === "boolean") return v;
    if (t === "number") return Number.isFinite(v) ? v : String(v);
    if (t === "string") return v.slice(0, 40);
    if (t === "object") {
      if (typeof v.__vid === "number") return { node: v.__vid, tree: v.__vtree, val: v.val };
      if ("val" in v) return { node: null, val: v.val };
    }
    try { return String(v).slice(0, 40); } catch (e) { return "[unprintable " + t + "]"; }
  }

  function makeTracer(limits) {
    var max = (limits && limits.max_events) || 600;
    var events = [];
    var truncated = false;
    var stack = [];
    var nextId = 0;
    var retDone = {};
    function push(ev) { if (events.length < max) events.push(ev); else truncated = true; }
    return {
      enter: function (name, index, args) {
        if (Array.isArray(index)) { args = index; index = null; }          // enter(name, [args]): code rewritten without indices
        var id = nextId++;
        var ev = { k: "call", id: id, fn: name };
        if (typeof index === "number" && isFinite(index) && index >= 0) ev.f = index;   // index into instrument().functions
        ev.depth = stack.length;
        ev.args = Array.prototype.map.call(args || [], serialize);
        push(ev);
        stack.push(id);
        return id;
      },
      ret: function (id, value) { retDone[id] = true; push({ k: "ret", id: id, fn: fnOf(id), value: serialize(value) }); return value; },
      throw: function (id, err) { retDone[id] = true; var m; try { m = String(err && err.message || err); } catch (e) { m = "error"; } push({ k: "throw", id: id, fn: fnOf(id), error: m.slice(0, 200) }); },
      exit: function (id) {
        if (!retDone[id]) { retDone[id] = true; push({ k: "ret", id: id, fn: fnOf(id), value: "undefined" }); }
        if (stack.length && stack[stack.length - 1] === id) stack.pop();
        else { var i = stack.lastIndexOf(id); if (i >= 0) stack.splice(i, 1); }
      },
      events: function () { return events; },
      truncated: function () { return truncated; },
      calls: function () { return nextId; },
    };
    function fnOf(id) {
      for (var i = events.length - 1; i >= 0; i--) if (events[i].k === "call" && events[i].id === id) return events[i].fn;
      return "?";
    }
  }

  // Level-order array -> tree with non-enumerable __vid/__vtree; also returns node metadata for layout.
  function buildTraceTree(arr, treeName) {
    var meta = [];
    if (!Array.isArray(arr) || arr.length === 0 || arr[0] === null || arr[0] === undefined) return { root: null, nodes: meta };
    var vid = 0;
    function mk(v, index, parent, side) {
      var n = { val: v, left: null, right: null };
      Object.defineProperty(n, "__vid", { value: vid, enumerable: false });
      Object.defineProperty(n, "__vtree", { value: treeName, enumerable: false });
      meta.push({ vid: vid, val: v, index: index, parent: parent, side: side });
      vid++;
      return n;
    }
    var root = mk(arr[0], 0, null, null);
    var q = [root];
    var i = 1;
    while (q.length && i < arr.length) {
      var n = q.shift();
      if (i < arr.length) { var lv = arr[i]; var li = i; i++; if (lv !== null && lv !== undefined) { n.left = mk(lv, li, n.__vid, "L"); q.push(n.left); } }
      if (i < arr.length) { var rv = arr[i]; var ri = i; i++; if (rv !== null && rv !== undefined) { n.right = mk(rv, ri, n.__vid, "R"); q.push(n.right); } }
    }
    return { root: root, nodes: meta };
  }

  function compileTraced(code, entry) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entry)) throw new Error("bad entry name");
    return new Function("__t", '"use strict";\n' + code + "\n;return (typeof " + entry + ' === "function") ? ' + entry + " : undefined;");
  }

  // Runs one traced execution. Never throws for learner errors.
  function runTrace(code, entry, argTypes, args, limits) {
    var out = { ok: false, error: null, error_kind: null, result: null, events: [], truncated: false, functions: [], nodes: { main: [], sub: [] }, ms: 0 };
    var inst;
    try { inst = instrument(code); } catch (e) {
      out.error = String(e && e.message || e).slice(0, 200);
      out.error_kind = e instanceof SyntaxError ? "syntax" : "instrument";
      return out;
    }
    out.functions = inst.functions;
    var tracer = makeTracer(limits);
    var callArgs = [];
    var treeSlots = ["main", "sub"];
    var treeIdx = 0;
    for (var i = 0; i < args.length; i++) {
      if (argTypes[i] === "tree") {
        var built = buildTraceTree(args[i], treeSlots[treeIdx] || ("tree" + treeIdx));
        out.nodes[treeSlots[treeIdx] || ("tree" + treeIdx)] = built.nodes;
        treeIdx++;
        callArgs.push(built.root);
      } else callArgs.push(args[i]);
    }
    var t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      var factory = compileTraced(inst.code, entry);
      var fn = factory(tracer);
      if (!fn) { out.error = "entry function " + entry + " not found"; out.error_kind = "load"; return out; }
      out.result = serialize(fn.apply(null, callArgs));
      out.ok = true;
    } catch (e) {
      out.ok = true; // partial trace is still useful
      out.error = String(e && e.message || e).slice(0, 200);
      out.error_kind = e instanceof SyntaxError ? "syntax" : "runtime";
      if (out.error_kind === "syntax") out.ok = false;
    }
    out.ms = Math.round(((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0) * 1000) / 1000;
    out.events = tracer.events();
    out.truncated = tracer.truncated();
    return out;
  }

  return { instrument: instrument, makeTracer: makeTracer, buildTraceTree: buildTraceTree, runTrace: runTrace, serialize: serialize };
});
