/* docs/js/challenge_runner.js - main-thread side of the challenge sandbox (spec 3.2).
 *
 * Spawns docs/js/challenge_worker.js, arms the watchdogs, computes pass/fail on the main
 * thread from the challenge catalog's expected values, and returns the exact `client_results`
 * object of spec 4.2. Also hosts the pure helpers the page shares with the server:
 *   sha256Hex(str)       SHA-256 over the UTF-8 bytes of the exact string (crypto.subtle, JS fallback)
 *   attemptHash(str)     sha256Hex of the code with comments and all whitespace stripped
 *   localRetrieve(...)   misconception-card retrieval, identical rules to server 5.3
 *   summarize(...)       catalog-ordered rows + counts for rendering
 *   trace(...)           one traced run of the learner's code on one input (addendum 2, "Visualize my solution")
 *
 * Loadable in Node (module.exports) for the smoke tests; no DOM access at load time.
 */
(function (global) {
  'use strict';

  var PER_TEST_TIMEOUT_MS = 2000;
  var TOTAL_TIMEOUT_MS = 15000;
  var MAX_RESPAWNS = 2;
  var MAX_CODE_CHARS = 20000;
  var HARNESS_VERSION = '1';
  var WATCHDOG_SLACK_MS = 50;
  var TIMEOUT_ERROR = 'Timed out after ' + PER_TEST_TIMEOUT_MS + ' ms (infinite loop?)';
  var STATUSES = { pass: 1, fail: 1, error: 1, timeout: 1, not_run: 1 };

  var workerUrl = (function () {
    try {
      var s = typeof document !== 'undefined' ? document.currentScript : null;
      if (s && s.src && /challenge_runner\.js(\?.*)?$/.test(s.src)) {
        return s.src.replace(/challenge_runner\.js(\?.*)?$/, 'challenge_worker.js');
      }
    } catch (e) { /* ignore */ }
    return 'js/challenge_worker.js';
  })();

  function nowMs() {
    return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') ? performance.now() : Date.now();
  }
  function round3(x) { return Math.round(x * 1000) / 1000; }

  /* ---------- SHA-256 ---------- */

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return hex;
  }

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  /* Pure-JS SHA-256 (used when crypto.subtle is unavailable, e.g. plain http on a LAN address). */
  function sha256Fallback(bytes) {
    var len = bytes.length;
    var bitLenHi = Math.floor((len * 8) / 0x100000000);
    var bitLenLo = (len * 8) >>> 0;
    var padded = ((len + 9 + 63) >> 6) << 6;
    var m = new Uint8Array(padded);
    m.set(bytes);
    m[len] = 0x80;
    m[padded - 8] = (bitLenHi >>> 24) & 255; m[padded - 7] = (bitLenHi >>> 16) & 255;
    m[padded - 6] = (bitLenHi >>> 8) & 255; m[padded - 5] = bitLenHi & 255;
    m[padded - 4] = (bitLenLo >>> 24) & 255; m[padded - 3] = (bitLenLo >>> 16) & 255;
    m[padded - 2] = (bitLenLo >>> 8) & 255; m[padded - 1] = bitLenLo & 255;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    for (var off = 0; off < padded; off += 64) {
      for (var i = 0; i < 16; i++) {
        var j = off + i * 4;
        w[i] = ((m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3]) >>> 0;
      }
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) {
      out[i * 4] = (H[i] >>> 24) & 255; out[i * 4 + 1] = (H[i] >>> 16) & 255;
      out[i * 4 + 2] = (H[i] >>> 8) & 255; out[i * 4 + 3] = H[i] & 255;
    }
    return bytesToHex(out);
  }

  function sha256Hex(str) {
    var bytes = utf8Bytes(String(str == null ? '' : str));
    var subtle = null;
    try {
      var c = (typeof crypto !== 'undefined') ? crypto : (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
      if (c && c.subtle && typeof c.subtle.digest === 'function') subtle = c.subtle;
    } catch (e) { subtle = null; }
    if (subtle) {
      return Promise.resolve().then(function () { return subtle.digest('SHA-256', bytes); })
        .then(function (buf) { return bytesToHex(new Uint8Array(buf)); })
        .catch(function () { return sha256Fallback(bytes); });
    }
    return Promise.resolve(sha256Fallback(bytes));
  }

  /* Strips block/line comments (outside string literals) and every whitespace character. */
  function normalizeCode(code) {
    var s = String(code == null ? '' : code);
    var out = '';
    var i = 0, n = s.length;
    var quote = null;
    while (i < n) {
      var ch = s[i];
      if (quote) {
        if (ch === '\\' && i + 1 < n) { out += ch + s[i + 1]; i += 2; continue; }
        if (ch === quote) quote = null;
        out += ch; i++; continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i++; continue; }
      if (ch === '/' && s[i + 1] === '/') { var nl = s.indexOf('\n', i); if (nl < 0) break; i = nl; continue; }
      if (ch === '/' && s[i + 1] === '*') { var end = s.indexOf('*/', i + 2); if (end < 0) break; i = end + 2; continue; }
      out += ch; i++;
    }
    return out.replace(/\s+/g, '');
  }

  function attemptHash(code) { return sha256Hex(normalizeCode(code)); }

  /* ---------- Evidence helpers (shared rules with the server, spec 5.1 / 5.3) ---------- */

  function canon(v) {
    if (v === undefined) return 'undefined';
    if (typeof v === 'number' && !isFinite(v)) return String(v);
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  function recomputeStatus(row, expected) {
    var st = row.status;
    if (st === 'timeout' || st === 'not_run') return st;
    if (row.error !== null && row.error !== undefined) return 'error';
    if (st === 'error' || row.actual_type === 'error') return 'error';
    if (row.actual_type === 'undefined' || row.actual === 'undefined') return 'fail';
    return canon(row.actual) === canon(expected) ? 'pass' : 'fail';
  }

  function notRunRow(test, note) {
    return { id: test.id, status: 'not_run', actual: null, actual_type: 'not_run', error: note, ms: 0 };
  }

  function summarize(challenge, cr) {
    var tests = (challenge && challenge.tests) || [];
    var byId = {};
    var hasResults = !!(cr && Array.isArray(cr.tests));
    if (hasResults) {
      cr.tests.forEach(function (r) { if (r && typeof r.id === 'string') byId[r.id] = r; });   // last wins
    }
    var compileFailed = !cr || !cr.compile || cr.compile.ok !== true || cr.compile.entry_found !== true;
    var note = !cr ? 'not run: sandbox unavailable' : (compileFailed ? 'not run: code did not load' : 'not reported by the browser');
    var counts = { total: tests.length, passed: 0, failed: 0, errored: 0, timed_out: 0, not_run: 0 };
    var byTag = {};
    var rows = tests.map(function (t) {
      var r = byId[t.id];
      var row;
      if (!r || compileFailed) {
        row = notRunRow(t, note);
      } else {
        row = {
          id: t.id,
          status: r.status,
          actual: (r.actual === undefined) ? null : r.actual,
          actual_type: typeof r.actual_type === 'string' ? r.actual_type : String(r.actual_type),
          error: (typeof r.error === 'string') ? r.error : null,
          ms: (typeof r.ms === 'number' && isFinite(r.ms)) ? r.ms : 0
        };
        row.status = recomputeStatus(row, t.expected);
      }
      if (row.status === 'pass') counts.passed++;
      else if (row.status === 'fail') counts.failed++;
      else if (row.status === 'error') counts.errored++;
      else if (row.status === 'timeout') counts.timed_out++;
      else counts.not_run++;
      var tg = byTag[t.tag] || (byTag[t.tag] = { total: 0, passed: 0, failed: 0, executed: 0 });
      tg.total++;
      if (row.status !== 'not_run') tg.executed++;
      if (row.status === 'pass') tg.passed++;
      else if (row.status !== 'not_run') tg.failed++;
      return { test: t, id: t.id, status: row.status, actual: row.actual, actual_type: row.actual_type, error: row.error, ms: row.ms };
    });
    var executed = counts.total - counts.not_run;
    var failedIds = rows.filter(function (r) { return r.status === 'fail'; }).map(function (r) { return r.id; });
    var failingIds = rows.filter(function (r) { return r.status === 'fail' || r.status === 'error' || r.status === 'timeout'; }).map(function (r) { return r.id; });
    var first = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].status === 'fail' || rows[i].status === 'error' || rows[i].status === 'timeout') { first = rows[i]; break; }
    }
    return {
      total: counts.total, passed: counts.passed, failed: counts.failed, errored: counts.errored,
      timed_out: counts.timed_out, not_run: counts.not_run, executed: executed,
      failed_ids: failedIds, failing_ids: failingIds, first_failure: first, rows: rows, by_tag: byTag,
      compile_failed: compileFailed, sandbox_unavailable: !cr
    };
  }

  function jaccard(a, b) {
    var setA = {}, setB = {}, inter = 0, union = 0, k;
    a.forEach(function (x) { setA[x] = true; });
    b.forEach(function (x) { setB[x] = true; });
    for (k in setA) { union++; if (setB[k]) inter++; }
    for (k in setB) { if (!setA[k]) union++; }
    return union === 0 ? 0 : inter / union;
  }

  /* Half-up rounding (floor(x + 0.5)); the server's retrieval.py uses the same rule so ranks agree on ties. */
  function roundHalfUp(x) { return Math.floor(x + 0.5); }

  function localRetrieve(challenge, cr, k) {
    k = k || 3;
    var s = summarize(challenge, cr);
    if (s.compile_failed || s.executed === 0 || s.passed === s.total) return [];
    var cards = (challenge && challenge.misconceptions) || [];
    var executed = s.executed;
    var rows = s.rows;
    var fmt = function (sc) {
      return { card: sc.card, card_id: sc.card.id, title: sc.card.title, matched_by: sc.matched.slice(), similarity: Math.round(sc.sim * 100) / 100, score: sc.score };
    };
    var uniform = function (rule, cardId, pred) {
      var hits = rows.filter(function (r) { return r.status === 'fail' && pred(r); });
      if (hits.length >= 0.8 * executed) {
        var card = null;
        for (var i = 0; i < cards.length; i++) { if (cards[i].uniform_rule === rule || cards[i].id === cardId) { card = cards[i]; break; } }
        if (card) return [fmt({ card: card, matched: hits.map(function (r) { return r.id; }), sim: 1, score: 100 })];   // similarity 1.0 like the server
      }
      return null;
    };
    var u = uniform('actual_undefined', 'missing_return', function (r) { return r.actual_type === 'undefined'; });
    if (u) return u;
    if (challenge.return_type === 'integer') {
      u = uniform('actual_boolean', 'wrong_return_type', function (r) { return r.actual_type === 'boolean'; });
      if (u) return u;
    }
    var scored = cards.map(function (c, i) { return { card: c, index: i, score: 0, matched: [], sim: 0 }; });
    rows.filter(function (r) { return r.status === 'error'; }).forEach(function (row) {
      for (var i = 0; i < scored.length; i++) {
        var pat = scored[i].card.error_pattern;
        if (!pat) continue;
        var re;
        try { re = new RegExp(pat); } catch (e) { continue; }
        if (re.test(row.error || '')) { scored[i].score += 3; scored[i].matched.push(row.id); break; }
      }
    });
    scored.forEach(function (sc) {
      var sig = sc.card.signature_failing_ids;
      if (!Array.isArray(sig) || sig.length === 0) return;
      var sim = jaccard(s.failed_ids, sig);
      if (sim > 0) {
        sc.score += roundHalfUp(10 * sim);
        sc.sim = sim;
        sc.matched = s.failed_ids.filter(function (id) { return sig.indexOf(id) >= 0; }).sort();
      }
    });
    for (var i = 0; i < scored.length; i++) {
      var sc = scored[i];
      if (sc.card.error_pattern && sc.matched.length >= 0.8 * executed) {
        sc.sim = 1;                                  // error cards report similarity 1.0 like the server
        return [fmt(sc)];
      }
    }
    return scored.filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return (b.score - a.score) || (a.index - b.index); })
      .slice(0, k)
      .map(function (sc) { if (!sc.sim && sc.matched.length) sc.sim = 1; return fmt(sc); });
  }

  /* ---------- The run ---------- */

  function sanitizeActual(v) {
    if (v === null || v === undefined) return null;
    var t = typeof v;
    if (t === 'boolean' || (t === 'number' && isFinite(v))) return v;
    var s;
    try { s = String(v); } catch (e) { s = '[unprintable]'; }
    return s.slice(0, 100);
  }

  function run(challenge, code, hooks) {
    hooks = hooks || {};
    var call = function (name, a, b) {
      if (typeof hooks[name] === 'function') { try { hooks[name](a, b); } catch (e) { /* hooks never break the run */ } }
    };
    return new Promise(function (resolve) {
      var tests = (challenge && Array.isArray(challenge.tests)) ? challenge.tests : [];
      var testsHash = (challenge && challenge.tests_hash) || '';
      var argTypes = (challenge && challenge.arg_types) || [];
      var entry = (challenge && challenge.entry_function) || '';
      var rows = new Array(tests.length);
      var compile = null;
      var settled = false;
      var worker = null, watchdog = null, totalTimer = null, respawns = 0, nextIndex = 0, runSeq = 0, currentRunId = null;
      code = (typeof code === 'string') ? code : String(code == null ? '' : code);
      var hashP = sha256Hex(code);

      function clearTimers() {
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
        if (totalTimer) { clearTimeout(totalTimer); totalTimer = null; }
      }
      function terminateWorker() {
        if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; }
      }
      function markRemaining(note) {
        for (var i = 0; i < tests.length; i++) if (!rows[i]) rows[i] = notRunRow(tests[i], note);
      }
      function finish() {
        if (settled) return;
        settled = true;
        clearTimers();
        terminateWorker();
        if (!compile) compile = { ok: false, error: 'the sandbox produced no result', error_kind: 'load', entry_found: false, defined_functions: [] };
        markRemaining('not reported by the sandbox');
        var testRows = rows.slice();
        var totalMs = 0;
        testRows.forEach(function (r) { if (r.status !== 'not_run') totalMs += r.ms; });
        var deliver = function (hash) {
          var result = {
            harness_version: HARNESS_VERSION,
            tests_hash: testsHash,
            code_sha256: hash,
            compile: compile,
            tests: testRows,
            total_ms: round3(totalMs)
          };
          call('onDone', result);
          resolve(result);
        };
        hashP.then(deliver, function () { deliver(''); });
      }
      function makeRow(test, msg) {
        var error = (typeof msg.error === 'string') ? msg.error.slice(0, 200) : null;
        var actual = sanitizeActual(msg.actual);
        var actualType = (typeof msg.actual_type === 'string') ? msg.actual_type.slice(0, 16) : 'unknown';
        var ms = (typeof msg.ms === 'number' && isFinite(msg.ms)) ? Math.min(60000, Math.max(0, msg.ms)) : 0;
        var status;
        if (error !== null) status = 'error';
        else if (actualType === 'undefined') status = 'fail';
        else status = Object.is(actual, test.expected) ? 'pass' : 'fail';
        return { id: test.id, status: status, actual: error === null ? actual : null, actual_type: error === null ? actualType : 'error', error: error, ms: ms };
      }
      function normalizeCompiled(msg) {
        return {
          ok: msg.ok === true,
          error: (typeof msg.error === 'string') ? msg.error.slice(0, 200) : null,
          error_kind: (msg.error_kind === 'syntax' || msg.error_kind === 'load') ? msg.error_kind : null,
          entry_found: msg.entry_found === true,
          defined_functions: Array.isArray(msg.defined_functions) ? msg.defined_functions.filter(function (x) { return typeof x === 'string'; }).slice(0, 50) : []
        };
      }
      function armWatchdog() {
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(onWatchdog, PER_TEST_TIMEOUT_MS + WATCHDOG_SLACK_MS);
      }
      function onWatchdog() {
        if (settled) return;
        watchdog = null;
        terminateWorker();
        if (!compile) {
          compile = { ok: false, error: 'Your code did not finish loading (infinite loop at top level?)', error_kind: 'load', entry_found: false, defined_functions: [] };
          call('onCompiled', compile);
          markRemaining('not run: code did not finish loading');
          return finish();
        }
        var idx = nextIndex;
        if (idx < tests.length && !rows[idx]) {
          rows[idx] = { id: tests[idx].id, status: 'timeout', actual: null, actual_type: 'timeout', error: TIMEOUT_ERROR, ms: PER_TEST_TIMEOUT_MS };
          call('onTest', rows[idx], idx);
        }
        nextIndex = idx + 1;
        if (respawns < MAX_RESPAWNS && nextIndex < tests.length) {
          respawns += 1;
          spawn(nextIndex);
        } else {
          markRemaining('not run: runner stopped after repeated timeouts');
          finish();
        }
      }
      function onTotalDeadline() {
        if (settled) return;
        totalTimer = null;
        terminateWorker();
        markRemaining('not run: total time budget exceeded');
        finish();
      }
      function onWorkerError(ev, w) {
        if (settled || w !== worker) return;
        try { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); } catch (e) { /* ignore */ }
        terminateWorker();
        var msg = (ev && ev.message) ? String(ev.message).slice(0, 200) : 'the sandbox stopped unexpectedly';
        if (!compile) {
          compile = { ok: false, error: msg, error_kind: 'load', entry_found: false, defined_functions: [] };
          call('onCompiled', compile);
        } else {
          compile = { ok: false, error: msg, error_kind: 'load', entry_found: compile.entry_found, defined_functions: compile.defined_functions };
        }
        markRemaining('not run: sandbox error');
        finish();
      }
      function onMessage(msg, w, runId) {
        if (settled || w !== worker || !msg || msg.run_id !== runId) return;
        if (msg.type === 'compiled') {
          armWatchdog();
          if (!compile) {
            compile = normalizeCompiled(msg);
            call('onCompiled', compile);
          } else if (!(msg.ok === true && msg.entry_found === true)) {
            compile = normalizeCompiled(msg);     // a respawn could not reload the code
          }
        } else if (msg.type === 'result') {
          armWatchdog();
          var idx = msg.index;
          if (typeof idx === 'number' && idx >= 0 && idx < tests.length && !rows[idx] && tests[idx].id === msg.id) {
            rows[idx] = makeRow(tests[idx], msg);
            call('onTest', rows[idx], idx);
          }
          if (typeof idx === 'number') nextIndex = idx + 1;
        } else if (msg.type === 'done') {
          if (!compile || !compile.ok) markRemaining('not run: code did not compile');
          else if (!compile.entry_found) markRemaining('not run: entry function not found');
          finish();
        }
      }
      function spawn(startIndex) {
        var w;
        try {
          w = new Worker(workerUrl);
        } catch (e) {
          if (!compile && startIndex === 0) { settled = true; clearTimers(); resolve(null); return; }
          markRemaining('not run: the sandbox could not be restarted');
          finish();
          return;
        }
        worker = w;
        runSeq += 1;
        currentRunId = 'r-' + runSeq;
        nextIndex = startIndex;
        var myId = currentRunId;
        w.onmessage = function (ev) { onMessage(ev && ev.data, w, myId); };
        w.onerror = function (ev) { onWorkerError(ev, w); };
        w.onmessageerror = function (ev) { onWorkerError({ message: 'the sandbox sent an unreadable message' }, w); };
        armWatchdog();                                          // armed BEFORE postMessage
        if (!totalTimer) totalTimer = setTimeout(onTotalDeadline, TOTAL_TIMEOUT_MS);
        try {
          w.postMessage({
            type: 'run', run_id: myId, code: code, entry: entry, arg_types: argTypes.slice(),
            tests: tests.map(function (t) { return { id: t.id, args: t.args }; }),
            start_index: startIndex
          });
        } catch (e) {
          onWorkerError({ message: 'could not send the code to the sandbox' }, w);
        }
      }

      if (code.length > MAX_CODE_CHARS) {
        compile = { ok: false, error: 'code exceeds ' + MAX_CODE_CHARS + ' characters', error_kind: 'load', entry_found: false, defined_functions: [] };
        call('onCompiled', compile);
        markRemaining('not run: code was not loaded');
        return finish();
      }
      if (typeof Worker === 'undefined') { settled = true; return resolve(null); }
      spawn(0);
    });
  }

  /* ---------- Execution trace (addendum 2, section 2): a fresh worker, one traced run, the same 2 s watchdog ---------- */

  var TRACE_MAX_EVENTS = 600;
  var TRACE_MAX_EVENTS_CAP = 5000;
  var TRACE_ERROR_KINDS = { syntax: 1, instrument: 1, load: 1, runtime: 1, timeout: 1 };
  var TRACE_TIMEOUT_ERROR = 'Timed out after ' + PER_TEST_TIMEOUT_MS + ' ms';
  var traceSeq = 0;

  function isIntAtLeast(v, min) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= min; }
  function emptyTrace(error, kind) {
    return { ok: false, error: error, error_kind: kind, result: null, events: [], truncated: false, functions: [], nodes: { main: [], sub: [] }, ms: 0 };
  }
  /* JSON-safe primitives only (the worker's serialize() already produced them; this is belt and braces). */
  function tracePrimitive(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return null;
    var t = typeof v;
    if (t === 'boolean') return v;
    if (t === 'number') return isFinite(v) ? v : String(v);
    if (t === 'string') return v.slice(0, 40);
    try { return String(v).slice(0, 40); } catch (e) { return '[unprintable]'; }
  }
  /* A traced value: a primitive or the { node, tree, val } descriptor of a tree node. */
  function traceValue(v) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && ('node' in v || 'val' in v)) {
      var out = { node: isIntAtLeast(v.node, 0) ? v.node : null, val: tracePrimitive(v.val) };
      if (v.tree === 'main' || v.tree === 'sub') out.tree = v.tree;
      return out;
    }
    return tracePrimitive(v);
  }
  function normalizeTrace(msg) {
    var out = emptyTrace(null, null);
    out.ok = msg.ok === true;
    out.error = (typeof msg.error === 'string') ? msg.error.slice(0, 200) : null;
    out.error_kind = (typeof msg.error_kind === 'string' && TRACE_ERROR_KINDS[msg.error_kind]) ? msg.error_kind : null;
    out.result = (msg.result === undefined) ? null : traceValue(msg.result);
    out.truncated = msg.truncated === true;
    out.ms = (typeof msg.ms === 'number' && isFinite(msg.ms)) ? Math.max(0, msg.ms) : 0;
    (Array.isArray(msg.events) ? msg.events.slice(0, TRACE_MAX_EVENTS_CAP) : []).forEach(function (e) {
      if (!e || typeof e !== 'object' || !isIntAtLeast(e.id, 0)) return;
      var fn = (typeof e.fn === 'string') ? e.fn.slice(0, 80) : '?';
      if (e.k === 'call') {
        var call = { k: 'call', id: e.id, fn: fn, depth: isIntAtLeast(e.depth, 0) ? e.depth : 0, args: (Array.isArray(e.args) ? e.args.slice(0, 10) : []).map(traceValue) };
        if (isIntAtLeast(e.f, 0)) call.f = e.f;     // index into `functions`: the call's own function, even when names repeat
        out.events.push(call);
      } else if (e.k === 'ret') {
        out.events.push({ k: 'ret', id: e.id, fn: fn, value: traceValue(e.value) });
      } else if (e.k === 'throw') {
        out.events.push({ k: 'throw', id: e.id, fn: fn, error: (typeof e.error === 'string') ? e.error.slice(0, 200) : 'error' });
      }
    });
    (Array.isArray(msg.functions) ? msg.functions.slice(0, 200) : []).forEach(function (f) {
      if (!f || typeof f.name !== 'string' || !isIntAtLeast(f.start_line, 1) || !isIntAtLeast(f.end_line, f.start_line)) return;
      out.functions.push({
        name: f.name.slice(0, 80), start_line: f.start_line, end_line: f.end_line,
        params: (Array.isArray(f.params) ? f.params.slice(0, 10) : []).map(function (x) { return (typeof x === 'string') ? x.slice(0, 40) : null; })
      });
    });
    ['main', 'sub'].forEach(function (t) {
      var arr = (msg.nodes && Array.isArray(msg.nodes[t])) ? msg.nodes[t].slice(0, 10000) : [];
      arr.forEach(function (n) {
        if (!n || !isIntAtLeast(n.vid, 0)) return;
        out.nodes[t].push({ vid: n.vid, val: tracePrimitive(n.val), index: isIntAtLeast(n.index, 0) ? n.index : 0, parent: isIntAtLeast(n.parent, 0) ? n.parent : null, side: (n.side === 'L' || n.side === 'R') ? n.side : null });
      });
    });
    return out;
  }

  /* trace(challenge, code, args, opts) -> Promise<TraceResult>; never rejects.
     args are the test's raw args (level-order arrays for tree parameters). The worker posts the whole trace in
     one message at the end, so a watchdog timeout reports no events (error_kind "timeout"). */
  function trace(challenge, code, args, opts) {
    opts = opts || {};
    var maxEvents = isIntAtLeast(opts.max_events, 1) ? Math.min(opts.max_events, TRACE_MAX_EVENTS_CAP) : TRACE_MAX_EVENTS;
    return new Promise(function (resolve) {
      code = (typeof code === 'string') ? code : String(code == null ? '' : code);
      var entry = (challenge && typeof challenge.entry_function === 'string') ? challenge.entry_function : '';
      var argTypes = (challenge && Array.isArray(challenge.arg_types)) ? challenge.arg_types.slice() : [];
      if (code.length > MAX_CODE_CHARS) return resolve(emptyTrace('code exceeds ' + MAX_CODE_CHARS + ' characters', 'load'));
      if (typeof Worker === 'undefined') return resolve(emptyTrace('the sandbox is not available in this browser', 'load'));
      var worker = null, timer = null, settled = false;
      var runId = 't-' + (++traceSeq);
      function done(result) {
        if (settled) return;
        settled = true;
        if (timer) { clearTimeout(timer); timer = null; }
        if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; }
        resolve(result);
      }
      try {
        worker = new Worker(workerUrl);
      } catch (e) {
        return done(emptyTrace('the sandbox could not be started', 'load'));
      }
      worker.onmessage = function (ev) {
        var msg = ev && ev.data;
        if (!msg || msg.type !== 'trace' || msg.run_id !== runId) return;
        done(normalizeTrace(msg));
      };
      worker.onerror = function (ev) {
        try { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); } catch (e) { /* ignore */ }
        done(emptyTrace((ev && ev.message) ? String(ev.message).slice(0, 200) : 'the sandbox stopped unexpectedly', 'load'));
      };
      worker.onmessageerror = function () { done(emptyTrace('the sandbox sent an unreadable message', 'load')); };
      timer = setTimeout(function () { done(emptyTrace(TRACE_TIMEOUT_ERROR, 'timeout')); }, PER_TEST_TIMEOUT_MS + WATCHDOG_SLACK_MS);   // armed BEFORE postMessage
      try {
        worker.postMessage({ type: 'trace', run_id: runId, code: code, entry: entry, arg_types: argTypes, args: Array.isArray(args) ? args : [], max_events: maxEvents });
      } catch (e) {
        done(emptyTrace('could not send the code to the sandbox', 'load'));
      }
    });
  }

  var api = {
    PER_TEST_TIMEOUT_MS: PER_TEST_TIMEOUT_MS,
    TOTAL_TIMEOUT_MS: TOTAL_TIMEOUT_MS,
    MAX_RESPAWNS: MAX_RESPAWNS,
    MAX_CODE_CHARS: MAX_CODE_CHARS,
    HARNESS_VERSION: HARNESS_VERSION,
    TIMEOUT_ERROR: TIMEOUT_ERROR,
    workerUrl: workerUrl,
    run: run,
    trace: trace,
    normalizeTrace: normalizeTrace,
    TRACE_MAX_EVENTS: TRACE_MAX_EVENTS,
    TRACE_TIMEOUT_ERROR: TRACE_TIMEOUT_ERROR,
    sha256Hex: sha256Hex,
    sha256Fallback: function (str) { return sha256Fallback(utf8Bytes(String(str == null ? '' : str))); },
    attemptHash: attemptHash,
    normalizeCode: normalizeCode,
    localRetrieve: localRetrieve,
    summarize: summarize,
    jaccard: jaccard,
    roundHalfUp: roundHalfUp,
    STATUSES: Object.keys(STATUSES)
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.ChallengeRunner = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
