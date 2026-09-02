/* docs/js/challenge_viz.js - "Visualize my solution": step-by-step replay of the learner's own code
 * (lead addendum 2, section 3).
 *
 * The pure helpers (layoutTree, levelOrderNodes, buildSteps, describe, fmtVal, emptyMessage) never touch the DOM
 * and are unit-tested in Node (backend/tests/js/trace.test.mjs). mount() wires the replay panel that docs/learning_algorithm.html
 * ships (#viz-panel and its controls) and is driven by challenge_mode.js, which runs the trace
 * (ChallengeRunner.trace), owns the input picker and the "Explain this step" tutor request.
 * Every piece of text reaches the DOM through textContent / createTextNode.
 */
(function (global) {
  'use strict';

  var H_SPACING = 34;          // px between in-order neighbours
  var V_SPACING = 44;          // px between depths
  var RADIUS = 15;
  var PAD = 20;
  var MIN_VIEW_WIDTH = 176;    // both SVGs share one viewBox width so a small pattern is not drawn larger than the main tree
  var EMPTY_VIEW_HEIGHT = 70;
  var STEP_INTERVAL_MS = 1500;
  var SPEEDS = [0.5, 1, 2];
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var NUMERIC_STRINGS = { Infinity: 1, '-Infinity': 1, NaN: 1, undefined: 1 };
  var NONE = '\u2014';               // em dash: "nothing yet" in the Values box

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function isNodeRef(v) { return !!v && typeof v === 'object' && !Array.isArray(v) && ('node' in v); }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
  function copy(obj) { var out = {}; Object.keys(obj).forEach(function (k) { out[k] = obj[k]; }); return out; }

  /* ---------- Values, argument descriptions, captions ---------- */

  function fmtVal(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    if (typeof v === 'string') return NUMERIC_STRINGS[v] ? v : JSON.stringify(v);
    if (isNodeRef(v)) return nodeDesc(v);
    try { return String(v); } catch (e) { return '?'; }
  }
  function nodeDesc(v) {
    var val = fmtVal(v.val);
    if (v.tree === 'main') return 'main node ' + val;
    if (v.tree === 'sub') return 'pattern node ' + val;
    return 'node ' + val;
  }
  /* "main node 2, pattern node 2, maxDifferences = 1" (names = the function's parameter names). */
  function argDesc(args, names) {
    return (Array.isArray(args) ? args : []).map(function (a, i) {
      if (isNodeRef(a)) return nodeDesc(a);
      if (a === null) return 'empty';
      var name = (names && typeof names[i] === 'string') ? names[i] : '';
      return (name ? name + ' = ' : '') + fmtVal(a);
    }).join(', ');
  }
  function signature(fn, args, names) { return fn + '(' + argDesc(args, names) + ')'; }
  function nodeRefs(args) {
    var out = [];
    (Array.isArray(args) ? args : []).forEach(function (a) {
      if (isNodeRef(a) && isInt(a.node) && (a.tree === 'main' || a.tree === 'sub')) out.push({ tree: a.tree, vid: a.node });
    });
    return out;
  }
  /* The main-tree node among the first two arguments (the node a compare/search call is "about"). */
  function mainRef(args) {
    for (var i = 0; i < Math.min(2, args.length); i++) {
      if (isNodeRef(args[i]) && args[i].tree === 'main' && isInt(args[i].node)) return args[i];
    }
    return null;
  }
  function subRef(args) {
    for (var i = 0; i < Math.min(2, args.length); i++) {
      if (isNodeRef(args[i]) && args[i].tree === 'sub' && isInt(args[i].node)) return args[i];
    }
    return null;
  }

  /* describe(event, ctx) -> deterministic caption. ctx: { frame: {fn, args, depth}, names, entry, hasBudget, returnType }.
     Nothing here is guessed from the code: the glosses only restate what the recorded value means for the
     nodes that were passed in. */
  function describe(ev, ctx) {
    ctx = ctx || {};
    var frame = ctx.frame || { fn: ev.fn, args: [], depth: 0 };
    var names = ctx.names || [];
    if (ev.k === 'call') {
      var depth = isInt(ev.depth) ? ev.depth : (isInt(frame.depth) ? frame.depth : 0);
      return 'Call ' + signature(ev.fn, ev.args || [], names) + ' at depth ' + depth + '.';
    }
    if (ev.k === 'throw') return ev.fn + ' threw an error here.';
    var value = ev.value;
    var text = ev.fn + ' returns ' + fmtVal(value) + '.';
    var isEntry = ev.fn === ctx.entry;
    var args = Array.isArray(frame.args) ? frame.args : [];
    var m = mainRef(args);
    var q = subRef(args);
    var mainVal = m ? fmtVal(m.val) : null;
    if (typeof value === 'boolean') {
      var a0 = args.length > 0 ? args[0] : undefined, a1 = args.length > 1 ? args[1] : undefined;
      var oneEmpty = ((a0 === null) !== (a1 === null)) && (isNodeRef(a0) || isNodeRef(a1));
      if (isEntry) {                                               // the search: empty conventions, else "at or below"
        if (a1 === null && value === true) return text + ' An empty pattern is always found.';
        if (a0 === null && value === false) return text + ' An empty subtree cannot contain the pattern.';
        if (m) return text + (value ? ' A match was found at or below main node ' + mainVal + '.' : ' No match was found at or below main node ' + mainVal + '.');
        return text;
      }
      // a compare helper: empty positions first, then the pair of nodes it compared
      if (a0 === null && a1 === null && value === true) return text + ' Both positions are empty, so they agree.';
      if (oneEmpty) return text + (value ? ' One side is empty and the other is not, yet this call accepted them.' : ' One side is empty and the other is not: a shape mismatch.');
      if (!m) return text;
      if (q && q.node !== 0) return text + ' The subtree at main node ' + mainVal + (value ? ' matches' : ' does not match') + ' the subtree at pattern node ' + fmtVal(q.val) + '.';
      return text + ' The candidate rooted at main node ' + mainVal + (value ? ' matches' : ' does not match') + ' the pattern.';
    }
    var numeric = (typeof value === 'number') ? value : (value === 'Infinity' ? Infinity : null);
    if (numeric !== null) {
      if (isEntry) {
        if (ctx.returnType === 'integer' && m && isFinite(numeric)) return text + ' ' + numeric + ' matching ' + plural(numeric, 'subtree') + ' found at or below main node ' + mainVal + '.';
        return text;
      }
      if (ctx.hasBudget) {
        if (numeric === Infinity) return text + ' Shape mismatch: this candidate can never match.';
        if (isFinite(numeric) && numeric >= 0 && /mismatch|differ|diff|count/i.test(ev.fn)) {
          return text + ' ' + numeric + ' value ' + plural(numeric, 'mismatch', 'mismatches') + ' counted so far in this candidate.';
        }
      }
    }
    return text;
  }

  function sameAnswer(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b);
    return a === b;
  }
  /* Appended to the caption of the last recorded event. */
  function finalGloss(trace, ctx, ev) {
    if (trace.truncated) return '';
    var exp = ctx.expected;
    var hasExp = exp !== undefined;
    if (trace.error || ev.k === 'throw') {
      return ' No final answer: your code stopped with an error' + (trace.error ? ' (' + trace.error + ')' : '') + '.' + (hasExp ? ' Expected ' + fmtVal(exp) + '.' : '');
    }
    var res = trace.result;
    var s = ' Final answer: ' + fmtVal(res) + '.';
    if (hasExp) s += ' Expected ' + fmtVal(exp) + ': your answer ' + (sameAnswer(res, exp) ? 'matches' : 'differs from') + ' the expected result.';
    return s;
  }

  function paramsByName(functions) {
    var m = {};
    (Array.isArray(functions) ? functions : []).forEach(function (f) {
      if (f && typeof f.name === 'string' && !(f.name in m)) m[f.name] = Array.isArray(f.params) ? f.params : [];
    });
    return m;
  }
  /* The function a call event belongs to: the index `f` the tracer records (the call's OWN function, even when
     several share a name: "(anonymous)" callbacks, a shadowed helper), else null. */
  function fnIndexOf(ev, functions) {
    return (isInt(ev.f) && ev.f >= 0 && ev.f < functions.length && functions[ev.f]) ? ev.f : null;
  }
  function paramsFor(ev, functions, byName) {
    var i = fnIndexOf(ev, functions);
    if (i !== null && Array.isArray(functions[i].params)) return functions[i].params;
    return byName[ev.fn] || [];                      // traces without `f`: the first function with that name
  }

  /* buildSteps(trace, ctx) -> one step per recorded event. ctx: { entry, hasBudget, returnType, expected }.
     Step k = the state after events 0..k-1 with event k in progress: a call opens its frame, a ret/throw
     shows its frame one last time (so the returning call stays the current frame) and pops it afterwards.
     step.fnIndex = the frame's index into trace.functions (null when the trace has none). */
  function buildSteps(trace, ctx) {
    ctx = ctx || {};
    trace = trace || {};
    var events = Array.isArray(trace.events) ? trace.events : [];
    var functions = Array.isArray(trace.functions) ? trace.functions : [];
    var byName = paramsByName(functions);
    var open = [];
    var byId = {};
    var visited = { main: {}, sub: {} };
    var marks = {};
    var lastReturned;
    var calls = 0;
    var budget;
    var steps = [];
    var lastIndex = events.length - 1;
    events.forEach(function (ev, k) {
      if (!ev || typeof ev !== 'object') return;
      var frame, names;
      if (ev.k === 'call') {
        calls++;
        var args = Array.isArray(ev.args) ? ev.args : [];
        names = paramsFor(ev, functions, byName);
        frame = { id: ev.id, fn: ev.fn, fnIndex: fnIndexOf(ev, functions), names: names, args: args, depth: isInt(ev.depth) ? ev.depth : open.length, sig: signature(ev.fn, args, names), refs: nodeRefs(args) };
        byId[ev.id] = frame;
        open.push(frame);
        frame.refs.forEach(function (r) { if (r.tree === 'main') delete marks[r.vid]; });   // a later call clears an old verdict
        if (k === 0 && ctx.hasBudget) budget = args.length > 2 ? args[2] : undefined;
      } else {
        frame = byId[ev.id] || { id: ev.id, fn: ev.fn, fnIndex: null, names: byName[ev.fn] || [], args: [], depth: Math.max(0, open.length - 1), sig: ev.fn + '()', refs: [] };
        names = frame.names;
        if (ev.k === 'ret') {
          lastReturned = ev.value;
          if (typeof ev.value === 'boolean') { var mr = mainRef(frame.args); if (mr) marks[mr.node] = ev.value; }
        }
        frame.refs.forEach(function (r) { visited[r.tree][r.vid] = true; });
      }
      var caption = describe(ev, { frame: frame, names: names, entry: ctx.entry, hasBudget: ctx.hasBudget, returnType: ctx.returnType });
      if (k === lastIndex) caption += finalGloss(trace, ctx, ev);
      var highlight = { main: [], sub: [] };
      frame.refs.forEach(function (r) { highlight[r.tree].push(r.vid); });
      steps.push({
        index: k, kind: ev.k, fn: frame.fn, fnIndex: frame.fnIndex, depth: frame.depth, caption: caption, call: frame.sig,
        stack: open.map(function (f) { return f.sig; }), calls: calls,
        returned: lastReturned, returnedText: (lastReturned === undefined) ? '—' : fmtVal(lastReturned),
        budget: budget, highlight: highlight, visited: { main: copy(visited.main), sub: copy(visited.sub) }, marks: copy(marks),
        error: ev.k === 'throw' ? (ev.error || '') : null
      });
      if (ev.k !== 'call') {
        var idx = open.lastIndexOf(frame);
        if (idx >= 0) open.splice(idx, 1);
      }
    });
    return steps;
  }

  /* The caption of a replay without steps: a timed-out run (the worker posts its events only at the end, so a
     timeout has none), a syntax / load failure, or a run that recorded no call. One message; no duplicate note. */
  function emptyMessage(trace) {
    trace = trace || {};
    if (trace.error_kind === 'timeout') {
      var m = /(\d+)\s*ms/.exec(trace.error || '');
      var secs = m ? parseInt(m[1], 10) / 1000 : 2;
      return 'Timed out after ' + secs + ' s: the run never finished, usually an infinite loop. See the test table.';
    }
    var why = trace.error ? trace.error : 'No function call was recorded.';
    return trace.ok ? why : 'The replay could not run: ' + why;
  }

  /* ---------- Tree layout and drawing ---------- */

  /* levelOrderNodes(arr) -> [{vid, val, index, parent, side}] for a level-order array (the LeetCode convention the
     worker's buildTree/buildTraceTree use), so the panel can draw a test input when the trace carries no nodes
     (a timed-out or failed run). vids are assigned in BFS order, exactly like buildTraceTree. */
  function levelOrderNodes(arr) {
    var out = [];
    if (!Array.isArray(arr) || arr.length === 0 || arr.length > 10000 || arr[0] === null || arr[0] === undefined) return out;
    out.push({ vid: 0, val: arr[0], index: 0, parent: null, side: null });
    var q = [0];
    var i = 1;
    while (q.length && i < arr.length) {
      var p = q.shift();
      if (i < arr.length) { var lv = arr[i], li = i; i++; if (lv !== null && lv !== undefined) { out.push({ vid: out.length, val: lv, index: li, parent: p, side: 'L' }); q.push(out.length - 1); } }
      if (i < arr.length) { var rv = arr[i], ri = i; i++; if (rv !== null && rv !== undefined) { out.push({ vid: out.length, val: rv, index: ri, parent: p, side: 'R' }); q.push(out.length - 1); } }
    }
    return out;
  }

  /* layoutTree(nodes) -> { root, nodes: [{vid, val, parent, side, x, y}], cols, rows, width, height }
     x = in-order rank, y = depth; width/height in px for the 34/44 spacing with PAD around. */
  function layoutTree(nodes) {
    var list = [], byVid = {};
    (Array.isArray(nodes) ? nodes : []).forEach(function (n) {
      if (!n || !isInt(n.vid) || byVid[n.vid]) return;
      var m = { vid: n.vid, val: n.val, parent: isInt(n.parent) ? n.parent : null, side: n.side === 'L' ? 'L' : (n.side === 'R' ? 'R' : null), left: null, right: null, x: 0, y: 0, placed: false };
      byVid[n.vid] = m;
      list.push(m);
    });
    var root = null;
    list.forEach(function (m) {
      var p = (m.parent !== null) ? byVid[m.parent] : null;
      if (!p || p === m) { if (!root) root = m; return; }
      if (m.side === 'R') { if (!p.right) p.right = m; else if (!p.left) p.left = m; }
      else { if (!p.left) p.left = m; else if (!p.right) p.right = m; }
    });
    var rank = 0, rows = 0;
    function walk(m, d) {
      if (!m || m.placed) return;
      m.placed = true;
      walk(m.left, d + 1);
      m.x = rank++;
      m.y = d;
      if (d + 1 > rows) rows = d + 1;
      walk(m.right, d + 1);
    }
    walk(root, 0);
    list.forEach(function (m) { if (!m.placed) walk(m, rows); });   // never expected: nodes not reachable from the root
    var cols = rank;
    return {
      root: root, nodes: list, cols: cols, rows: rows,
      width: cols ? (cols - 1) * H_SPACING + 2 * PAD : 0,
      height: rows ? (rows - 1) * V_SPACING + 2 * PAD : 0
    };
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, String(attrs[k])); });
    return e;
  }
  function clearEl(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  /* drawTree(svg, layout, {minWidth, tree}) -> { vid: circleElement }. Same markup as the Learn-mode SVGs
     (line.edge, circle.node r=15, text) so the page CSS applies. Empty tree -> a centred "(empty)". */
  function drawTree(svg, layout, opts) {
    opts = opts || {};
    var width = Math.max(layout.width, opts.minWidth || MIN_VIEW_WIDTH);
    var circles = {};
    clearEl(svg);
    if (!layout.root) {
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + EMPTY_VIEW_HEIGHT);
      var empty = svgEl('text', { x: width / 2, y: EMPTY_VIEW_HEIGHT / 2 + 4, 'text-anchor': 'middle', 'font-size': 12, 'class': 'viz-empty' });
      empty.appendChild(document.createTextNode('(empty)'));
      svg.appendChild(empty);
      return circles;
    }
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + layout.height);
    var offX = (width - layout.width) / 2 + PAD;
    var byVid = {};
    layout.nodes.forEach(function (m) { byVid[m.vid] = m; });
    var cx = function (m) { return offX + m.x * H_SPACING; };
    var cy = function (m) { return PAD + m.y * V_SPACING; };
    layout.nodes.forEach(function (m) {                       // edges first; the circles cover their ends
      var p = (m.parent !== null) ? byVid[m.parent] : null;
      if (p && p !== m) svg.appendChild(svgEl('line', { x1: cx(p), y1: cy(p), x2: cx(m), y2: cy(m), 'class': 'edge' }));
    });
    layout.nodes.forEach(function (m) {
      var c = svgEl('circle', { cx: cx(m), cy: cy(m), r: RADIUS, 'class': 'node', 'data-vid': m.vid, 'data-tree': opts.tree || '' });
      svg.appendChild(c);
      var t = svgEl('text', { x: cx(m), y: cy(m) + 4, 'text-anchor': 'middle', 'font-size': 12 });
      t.appendChild(document.createTextNode(fmtVal(m.val)));
      svg.appendChild(t);
      circles[m.vid] = c;
    });
    return circles;
  }

  /* Draws both trees at the same scale (shared viewBox width). */
  function drawTrees(mainSvg, subSvg, nodes) {
    var main = layoutTree(nodes && nodes.main);
    var sub = layoutTree(nodes && nodes.sub);
    var width = Math.max(main.width, sub.width, MIN_VIEW_WIDTH);
    return {
      main: mainSvg ? drawTree(mainSvg, main, { minWidth: width, tree: 'main' }) : {},
      sub: subSvg ? drawTree(subSvg, sub, { minWidth: width, tree: 'sub' }) : {},
      width: width
    };
  }

  /* ---------- The panel ---------- */

  /* mount({ panel, onStep }) -> player. Looks the controls up by the ids the page ships. */
  function mount(opts) {
    opts = opts || {};
    var byId = function (id) { return document.getElementById(id); };
    var panel = opts.panel || byId('viz-panel');
    if (!panel) return null;
    var els = {
      panel: panel, mainSvg: byId('viz-main-svg'), subSvg: byId('viz-sub-svg'), counter: byId('viz-step-counter'), caption: byId('viz-caption'),
      call: byId('viz-call'), stack: byId('viz-stack'), values: byId('viz-values'), reset: byId('viz-reset'), prev: byId('viz-prev'), play: byId('viz-play'),
      next: byId('viz-next'), end: byId('viz-end'), slider: byId('viz-slider'), progress: byId('viz-progress-bar') || panel.querySelector('.progress-bar'),
      note: byId('viz-note'), speedButtons: Array.prototype.slice.call(panel.querySelectorAll('.viz-speed [data-speed]'))
    };
    var st = { steps: [], index: 0, trace: null, ctx: null, circles: { main: {}, sub: {} }, timer: null, playing: false, speed: 1, notes: [], loaded: false };
    var onStep = (typeof opts.onStep === 'function') ? opts.onStep : function () {};
    var listeners = [];
    function on(el, type, fn) { if (!el) return; el.addEventListener(type, fn); listeners.push([el, type, fn]); }
    function setText(el, text) { if (el) el.textContent = text; }
    function total() { return st.steps.length; }
    function atEnd() { return st.index >= total() - 1; }

    function clearTimer() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }
    function setPlayButton(playing) {
      if (!els.play) return;
      els.play.classList.toggle('pause', playing);
      var icon = els.play.querySelector('i');
      if (icon) { icon.classList.toggle('fa-play', !playing); icon.classList.toggle('fa-pause', playing); }
      var label = els.play.querySelector('.visually-hidden');
      if (label) label.textContent = playing ? 'Pause' : 'Play';
      els.play.setAttribute('aria-pressed', playing ? 'true' : 'false');
    }
    function setSpeedButtons() {
      els.speedButtons.forEach(function (b) {
        var active = parseFloat(b.getAttribute('data-speed')) === st.speed;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    function focusPanel() {
      try { panel.focus({ preventScroll: true }); } catch (e) { try { panel.focus(); } catch (e2) { /* ignore */ } }
    }
    /* Disables a control without stranding keyboard focus: the browser drops focus to <body> when the focused
       element becomes disabled (Next at the last step, the slider while a trace loads), so focus moves to the
       panel first, where Left/Right/Home/End/Space keep working. */
    function setDisabled(el, flag) {
      if (!el) return;
      flag = !!flag;
      if (flag && !el.disabled && document.activeElement === el) focusPanel();
      el.disabled = flag;
    }
    function setControls() {
      var n = total();
      var none = !st.loaded || n === 0;
      setDisabled(els.reset, none || st.index === 0);
      setDisabled(els.prev, none || st.index === 0);
      setDisabled(els.next, none || atEnd());
      setDisabled(els.end, none || atEnd());
      setDisabled(els.play, none || n < 2);
      if (els.slider) {
        els.slider.max = String(Math.max(0, n - 1));
        els.slider.value = String(st.index);
        setDisabled(els.slider, none || n < 2);
      }
      if (els.progress) els.progress.style.width = (n > 1 ? Math.round(100 * st.index / (n - 1)) : (n === 1 ? 100 : 0)) + '%';
    }
    function applyNodeClasses(step) {
      ['main', 'sub'].forEach(function (t) {
        var circles = st.circles[t];
        var hl = {};
        if (step) step.highlight[t].forEach(function (vid) { hl[vid] = true; });
        Object.keys(circles).forEach(function (vid) {
          var cls = 'node';
          if (step && step.visited[t][vid]) cls += ' visited';
          if (step && t === 'main' && step.marks[vid] === true) cls += ' returned-true';
          if (step && t === 'main' && step.marks[vid] === false) cls += ' returned-false';
          if (hl[vid]) cls += ' current';
          circles[vid].setAttribute('class', cls);
        });
      });
    }
    function renderStack(step) {
      if (!els.stack) return;
      clearEl(els.stack);
      if (!step) return;
      step.stack.forEach(function (sig, i) {
        var li = document.createElement('li');
        li.textContent = sig;
        if (i === step.stack.length - 1) li.className = 'is-current';
        els.stack.appendChild(li);
      });
    }
    /* Without a step (loading, a timed-out or failed run) the rows stay in place with an em dash. */
    function renderValues(step) {
      if (!els.values) return;
      clearEl(els.values);
      var rows = step
        ? [['Returned', step.returnedText], ['Depth', String(step.depth)], ['Calls so far', String(step.calls)]]
        : [['Returned', NONE], ['Depth', NONE], ['Calls so far', NONE]];
      if (st.ctx && st.ctx.hasBudget) rows.push(['Budget', step ? fmtVal(step.budget) : NONE]);
      rows.forEach(function (r) {
        var dt = document.createElement('dt'); dt.textContent = r[0];
        var dd = document.createElement('dd'); dd.textContent = r[1];
        els.values.appendChild(dt);
        els.values.appendChild(dd);
      });
    }
    function renderNote() { setText(els.note, st.notes.join(' ')); }
    function renderStep() {
      var n = total();
      var step = n ? st.steps[st.index] : null;
      setText(els.counter, 'Step ' + (n ? st.index + 1 : 0) + ' / ' + n);
      if (step) {
        setText(els.caption, step.caption);
        setText(els.call, step.call);
      }
      renderStack(step);
      renderValues(step);
      applyNodeClasses(step);
      setControls();
      onStep(step, st.index, n);
    }
    function renderEmpty(message) {
      setText(els.counter, 'Step 0 / 0');
      setText(els.caption, message || '');
      setText(els.call, '');
      renderStack(null);
      renderValues(null);
      applyNodeClasses(null);
      setControls();
      onStep(null, 0, 0);
    }

    function goTo(i, keepPlaying) {
      var n = total();
      if (!st.loaded || n === 0) return;
      if (!isInt(i)) i = 0;
      if (i < 0) i = 0;
      if (i > n - 1) i = n - 1;
      if (!keepPlaying && st.playing) pause();
      st.index = i;
      renderStep();
    }
    function first() { goTo(0); }
    function last() { goTo(total() - 1); }
    function next() { goTo(st.index + 1); }
    function prev() { goTo(st.index - 1); }
    function tick() { if (!atEnd()) goTo(st.index + 1, true); else pause(); }
    function schedule() { clearTimer(); st.timer = setInterval(tick, STEP_INTERVAL_MS / st.speed); }
    function play() {
      if (!st.loaded || total() < 2) return;
      if (atEnd()) goTo(0);
      st.playing = true;
      setPlayButton(true);
      schedule();
    }
    function pause() {
      st.playing = false;
      clearTimer();
      setPlayButton(false);
    }
    function togglePlay() { if (st.playing) pause(); else play(); }
    function setSpeed(x) {
      x = parseFloat(x);
      if (SPEEDS.indexOf(x) < 0) return;
      st.speed = x;
      setSpeedButtons();
      if (st.playing) schedule();
    }

    /* load(trace, ctx): ctx = { entry, hasBudget, returnType, expected, notes: [] }. Renders step 0. */
    function load(trace, ctx) {
      pause();
      st.trace = trace || {};
      st.ctx = ctx || {};
      st.loaded = true;
      st.index = 0;
      st.circles = drawTrees(els.mainSvg, els.subSvg, st.trace.nodes);
      st.steps = buildSteps(st.trace, st.ctx);
      st.notes = (Array.isArray(st.ctx.notes) ? st.ctx.notes : []).slice();
      var events = Array.isArray(st.trace.events) ? st.trace.events : [];
      if (st.trace.truncated) st.notes.push('Trace truncated after ' + events.length + ' events.');
      if (st.trace.error && st.trace.ok && st.trace.error_kind !== 'timeout') {
        var at = -1;
        for (var i = 0; i < st.steps.length; i++) { if (st.steps[i].kind === 'throw') { at = i; break; } }
        st.notes.push('Your code threw' + (at >= 0 ? ' at step ' + (at + 1) : '') + ': ' + st.trace.error);
      }
      renderNote();
      if (!st.steps.length) {                  // timeout / syntax / load failure: one message, in the caption only
        renderEmpty(emptyMessage(st.trace));
        return 0;
      }
      renderStep();
      return st.steps.length;
    }
    function setLoading(message) {
      pause();
      st.loaded = false;
      st.steps = [];
      st.index = 0;
      st.notes = [];
      renderNote();
      renderEmpty(message || 'Tracing your code...');
    }
    function unload() {
      pause();
      st.loaded = false;
      st.steps = [];
      st.index = 0;
      st.trace = null;
      st.ctx = null;
      st.notes = [];
      st.circles = { main: {}, sub: {} };
      clearEl(els.mainSvg);
      clearEl(els.subSvg);
      renderNote();
      renderEmpty('');
    }
    function current() {
      if (!st.loaded || !st.steps.length) return null;
      return { step: st.steps[st.index], index: st.index, total: st.steps.length };
    }
    function destroy() {
      pause();
      listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
      listeners = [];
    }

    on(els.reset, 'click', first);
    on(els.prev, 'click', prev);
    on(els.next, 'click', next);
    on(els.end, 'click', last);
    on(els.play, 'click', togglePlay);
    on(els.slider, 'input', function () { goTo(parseInt(els.slider.value, 10)); });
    els.speedButtons.forEach(function (b) { on(b, 'click', function () { setSpeed(b.getAttribute('data-speed')); }); });
    on(panel, 'keydown', function (e) {
      if (!st.loaded) return;
      var tag = (e.target && e.target.tagName) ? String(e.target.tagName).toUpperCase() : '';
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;      // the picker and the slider keep their own arrow keys
      var key = e.key;
      if (key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (key === 'Home') { e.preventDefault(); first(); }
      else if (key === 'End') { e.preventDefault(); last(); }
      else if ((key === ' ' || key === 'Spacebar') && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); togglePlay(); }
    });
    setSpeedButtons();
    setPlayButton(false);
    setControls();

    return {
      load: load, setLoading: setLoading, unload: unload, goTo: goTo, first: first, last: last, next: next, prev: prev,
      play: play, pause: pause, togglePlay: togglePlay, setSpeed: setSpeed, current: current, destroy: destroy,
      steps: function () { return st.steps; }, isPlaying: function () { return st.playing; }, speed: function () { return st.speed; }, els: els
    };
  }

  var api = {
    H_SPACING: H_SPACING, V_SPACING: V_SPACING, RADIUS: RADIUS, PAD: PAD, MIN_VIEW_WIDTH: MIN_VIEW_WIDTH, STEP_INTERVAL_MS: STEP_INTERVAL_MS, SPEEDS: SPEEDS.slice(),
    fmtVal: fmtVal, argDesc: argDesc, signature: signature, describe: describe, buildSteps: buildSteps, emptyMessage: emptyMessage,
    layoutTree: layoutTree, levelOrderNodes: levelOrderNodes, drawTree: drawTree, drawTrees: drawTrees, mount: mount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.ChallengeViz = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
