/* docs/js/challenge_mode.js - Challenge mode page logic (spec sections 8.3-8.10, addendum B1-B6, addendum 2).
 *
 * Loads data/challenges.json, drives the browser sandbox (ChallengeRunner), renders local and
 * AI results, the hint ladder, the reference-solution lock, the pipeline strip, the
 * selection-aware "Ask the tutor" box and the "Visualize my solution" replay panel (the trace
 * comes from ChallengeRunner.trace, the drawing/playback from ChallengeViz). Every piece of text
 * reaches the DOM through textContent / el(); nothing dynamic is ever assigned to innerHTML.
 *
 * Entry points: window.ChallengeMode.init() (on DOM ready) and window.ChallengeMode.enter()
 * (called by learning_algorithm.js when the learner switches to Challenge mode).
 */
(function () {
  'use strict';

  var CHALLENGES_URL = 'data/challenges.json';
  var SOLUTIONS_URL = 'data/challenge_solutions.json';
  var AI_REQUEST_TIMEOUT_MS = 90000;
  var TUTOR_REQUEST_TIMEOUT_MS = 60000;
  var HEALTH_TIMEOUT_MS = 5000;
  var COLD_START_NOTICE_MS = 5000;
  var TRACE_STEP_MS = 200;
  var DRAFT_DEBOUNCE_MS = 500;
  var POPOVER_HIDE_DELAY_MS = 150;
  var STORAGE_PREFIX = 'sua.challenge.v1.';
  var LAST_CHALLENGE_KEY = STORAGE_PREFIX + 'lastChallengeId';
  var TUTOR_BUDGET = 5;
  var MAX_HINTS = 3;
  var VIZ_MAX_NODES = 15;          // inputs with more nodes (root + subRoot) are not offered for replay
  var VIZ_MAX_EVENTS = 600;
  var VIZ_MIN_DEFAULT_NODES = 3;   // when no small test fails, the default replay input has at least this many nodes and no empty tree
  var VIZ_STALE_AT_TRACE = 'Showing the code from your last test run; run the tests again to replay your latest edits.';
  var VIZ_STALE_ON_EDIT = 'Your code changed since this replay. Run the tests again to replay the new code.';
  var VIZ_STEP_STRING_MAX = 300;   // server caps for step.caption / call / returned
  var VIZ_STACK_MAX = 12;
  var VIZ_STACK_ITEM_MAX = 200;
  var MAX_ISSUE_CHIPS = 8;
  var REMOTE_API_BASE = 'https://uc-berkeley-ml-ai-capstone-work-sample.onrender.com';

  var DIMS = ['correctness', 'edge_cases', 'key_concepts', 'efficiency', 'code_quality'];
  var DIM_LABELS = { correctness: 'Correctness', edge_cases: 'Edge cases', key_concepts: 'Key concepts', efficiency: 'Efficiency', code_quality: 'Code quality' };
  var EVIDENCE_DIMS = { correctness: true, edge_cases: true };
  var HINT_LEVELS = ['conceptual', 'targeted', 'near_explicit', 'extension'];
  var VERDICTS = ['PASS', 'PARTIAL', 'FAIL', 'ERROR', 'UNVERIFIED'];
  var VERDICT_BADGE = {
    PASS: ['All tests pass', 'verdict-pass'], PARTIAL: ['Almost there', 'verdict-partial'], FAIL: ['Keep going', 'verdict-fail'],
    ERROR: ["Didn't run", 'verdict-error'], UNVERIFIED: ['Unverified', 'verdict-partial']
  };
  var VERDICT_SPOKEN = { PASS: 'all tests pass', PARTIAL: 'almost there', FAIL: 'keep going', ERROR: "the code didn't run", UNVERIFIED: 'unverified' };
  var STAGES = ['static_checks', 'tests', 'retrieval', 'judge', 'postcheck'];
  var STAGE_LABELS = { validate: 'Validate', static_checks: 'Static checks', tests: 'Sandbox tests', retrieval: 'Context', judge: 'AI judge', postcheck: 'Consistency' };
  var STAGE_CLASSES = ['active', 'completed', 'failed', 'warning', 'skipped'];
  var TRACE_STATUS_CLASS = { ok: 'completed', skipped: 'skipped', degraded: 'failed', error: 'failed' };
  var STATUS_ORDER = { fail: 0, timeout: 1, error: 2, not_run: 3, pass: 4 };
  var STATUS_TEXT = { pass: '✓ Pass', fail: '✗ Fail', timeout: '⏱ Timed out', error: '⚠ Error', not_run: '– Not run' };
  var STATUS_CLASS = { pass: 'is-pass', fail: 'is-fail', timeout: 'is-timeout', error: 'is-error', not_run: 'is-notrun' };
  var ISSUE_CATEGORIES = ['correctness', 'edge_case', 'key_concept', 'performance', 'code_quality', 'syntax'];
  var SEVERITIES = ['high', 'medium', 'low'];
  var EVIDENCE_KINDS = ['test', 'line', 'static'];
  var SCORE_SOURCES = ['tests', 'judge', 'heuristic'];
  var HINT_SOURCES = ['judge', 'card', 'ladder', 'syntax'];
  var TUTOR_MODES = ['question', 'explain_problem', 'suggest_approach', 'complexity', 'explain_step'];
  var QUICK_LABELS = { explain_problem: 'Explain this problem', suggest_approach: 'Suggest an approach', complexity: 'Time & space complexity' };
  var NOT_RUN_DETAIL = 'Not run: click Get AI feedback for a review.';
  var UNREACHABLE_BANNER = 'The AI tutor is unreachable right now. Your test results above are still valid.';
  var TUTOR_EXHAUSTED_TITLE = 'Run tests or get new AI feedback to ask more.';

  var DEFAULT_STATE = {
    attempts: 0, bestScore: null, bestPassed: 0, totalTests: 0, hintsRevealed: 0, solved: false, solvedAtAttempt: null,
    solutionRevealed: false, gaveUp: false, gaveUpAtAttempt: null, aiReviews: 0, lastAttemptHash: null, lastAiCodeHash: null,
    draftCode: null, lastEvaluationAt: null, tutorRemaining: TUTOR_BUDGET, tutorResetAt: null
  };

  var S = {
    inited: false, data: null, challenges: [], byId: {}, tagLabels: {}, tagDimension: {},
    current: null, phase: 'idle', health: null, healthPending: false, loadError: false, loadPromise: null,
    storageOk: true, stateCache: {}, sessions: {}, solutions: null, solutionsPromise: null,
    pendingSelection: null, lastSelection: null, popoverTimer: null, draftTimer: null,
    replayToken: 0, aiAbort: null, defaultTutorPlaceholder: '',
    viz: { player: null, open: false, challengeId: null, testId: null, token: 0, trace: null, code: null, pending: false }
  };
  var dom = {};

  /* ---------- Small utilities ---------- */

  function $(id) { return document.getElementById(id); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function str(v, max) { return (typeof v === 'string') ? (max ? v.slice(0, max) : v) : ''; }
  function strList(v, maxItems, maxLen) {
    if (!Array.isArray(v)) return null;
    return v.filter(function (x) { return typeof x === 'string' && x.trim(); }).slice(0, maxItems || 50).map(function (x) { return maxLen ? x.slice(0, maxLen) : x; });
  }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
  function fmtMs(ms) {
    if (!isFinite(ms)) return '';
    if (ms < 1) return '<1 ms';
    if (ms < 1000) return Math.round(ms) + ' ms';
    return (ms / 1000).toFixed(1) + ' s';
  }
  function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function show(node) { if (node) node.classList.remove('hidden'); }
  function hide(node) { if (node) node.classList.add('hidden'); }
  function clear(node) { if (node) while (node.firstChild) node.removeChild(node.firstChild); }
  function nowIso() { try { return new Date().toISOString(); } catch (e) { return null; } }
  function lineCount(code) { return String(code || '').split('\n').length; }

  /* Safe element builder: allow-listed attributes only, text via text nodes. */
  var PROP_ALLOW = { 'class': 1, id: 1, title: 1, type: 1, role: 1, tabindex: 1, 'for': 1, scope: 1, disabled: 1, colspan: 1 };
  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = String(v);
        else if (k === 'disabled') node.disabled = true;
        else if (PROP_ALLOW[k] || k.indexOf('data-') === 0 || k.indexOf('aria-') === 0) node.setAttribute(k, String(v));
      });
    }
    appendChildren(node, children);
    return node;
  }
  function appendChildren(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) { children.forEach(function (c) { appendChildren(node, c); }); return; }
    if (typeof children === 'string' || typeof children === 'number') { node.appendChild(document.createTextNode(String(children))); return; }
    if (children && typeof children.nodeType === 'number') node.appendChild(children);
  }
  /* Backticked identifiers become <code>; everything else is plain text. */
  function renderInline(text) {
    var parts = String(text == null ? '' : text).split('`');
    return parts.map(function (p, i) { return (i % 2 === 1) ? el('code', null, p) : document.createTextNode(p); });
  }
  function apiBase() {
    try {
      var meta = document.querySelector('meta[name="eval-api-base"]');
      if (meta && typeof meta.content === 'string' && meta.content.trim()) return meta.content.trim().replace(/\/+$/, '');
      var h = window.location.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h === '') return '';
    } catch (e) { /* ignore */ }
    return REMOTE_API_BASE;
  }
  function announce(text) {
    if (!dom.announcer) return;
    dom.announcer.textContent = '';
    setTimeout(function () { dom.announcer.textContent = text; }, 30);
  }
  function fetchJson(url, opts, timeoutMs) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
    var init = { method: opts.method || 'GET', headers: { 'Accept': 'application/json' }, cache: 'no-store' };
    if (ctrl) init.signal = ctrl.signal;
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    var started = performance.now();
    return fetch(url, init).then(function (resp) {
      return resp.text().then(function (txt) {
        var json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
        return { ok: resp.ok, status: resp.status, json: json, headers: resp.headers, error: null, ms: performance.now() - started, aborted: false, ctrl: ctrl };
      });
    }).catch(function (err) {
      var aborted = !!(err && err.name === 'AbortError');
      return { ok: false, status: 0, json: null, headers: null, error: err, ms: performance.now() - started, aborted: aborted, ctrl: ctrl };
    }).then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  /* ---------- Persistence (every access in try/catch) ---------- */

  function sanitizeState(raw) {
    var st = {};
    Object.keys(DEFAULT_STATE).forEach(function (k) { st[k] = DEFAULT_STATE[k]; });
    if (!isObj(raw)) return st;
    ['attempts', 'bestPassed', 'totalTests', 'hintsRevealed', 'aiReviews'].forEach(function (k) { if (isInt(raw[k]) && raw[k] >= 0) st[k] = raw[k]; });
    if (st.hintsRevealed > MAX_HINTS) st.hintsRevealed = MAX_HINTS;
    ['bestScore', 'gaveUpAtAttempt', 'solvedAtAttempt'].forEach(function (k) { if (isInt(raw[k])) st[k] = raw[k]; });
    ['solved', 'solutionRevealed', 'gaveUp'].forEach(function (k) { if (typeof raw[k] === 'boolean') st[k] = raw[k]; });
    ['lastAttemptHash', 'lastAiCodeHash', 'draftCode', 'lastEvaluationAt', 'tutorResetAt'].forEach(function (k) { if (typeof raw[k] === 'string') st[k] = raw[k]; });
    if (isInt(raw.tutorRemaining)) st.tutorRemaining = Math.max(0, Math.min(TUTOR_BUDGET, raw.tutorRemaining));
    return st;
  }
  function readState(id) {
    if (S.stateCache[id]) return S.stateCache[id];
    var raw = null;
    try {
      var txt = window.localStorage.getItem(STORAGE_PREFIX + id);
      if (txt) raw = JSON.parse(txt);
    } catch (e) { S.storageOk = false; }
    S.stateCache[id] = sanitizeState(raw);
    return S.stateCache[id];
  }
  function writeState(id, patch) {
    var st = readState(id);
    Object.keys(patch || {}).forEach(function (k) { st[k] = patch[k]; });
    try { window.localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(st)); }
    catch (e) { S.storageOk = false; }
    return st;
  }
  function session(id) {
    if (!S.sessions[id]) {
      S.sessions[id] = { clientResults: null, localResult: null, aiResult: null, lastRender: null, previous: null, tutor: { thread: [], history: [], pending: false } };
    }
    return S.sessions[id];
  }
  function hintsUsed(st) { var out = []; for (var i = 1; i <= st.hintsRevealed; i++) out.push(i); return out; }

  /* ---------- Init / enter ---------- */

  var IDS = ['challenge-section', 'challenge-tabs', 'challenge-status-line', 'challenge-card', 'challenge-title', 'challenge-description', 'challenge-examples',
    'challenge-rules', 'challenge-rules-list', 'challenge-signature', 'load-starter-btn', 'load-practice-btn', 'challenge-editor', 'editor-ask-popover', 'editor-ask-btn',
    'challenge-inline-msg', 'run-tests-btn', 'submit-challenge-btn', 'eval-pipeline', 'eval-pipeline-time', 'eval-pipeline-detail', 'eval-trace-details', 'eval-trace-list',
    'eval-tutor', 'tutor-remaining', 'tutor-unavailable', 'tutor-quick', 'tutor-empty', 'tutor-thread', 'tutor-form', 'tutor-context', 'tutor-context-chip',
    'tutor-context-clear', 'tutor-input', 'tutor-stuck', 'tutor-send-btn', 'eval-announcer', 'challenge-feedback', 'eval-banner', 'eval-banner-text', 'retry-ai-btn',
    'eval-summary', 'eval-score-value', 'eval-verdict', 'eval-headline', 'eval-tests-summary', 'eval-progress-note', 'eval-rubric', 'eval-tests', 'eval-tests-body',
    'eval-issues', 'eval-issues-list', 'eval-strengths', 'eval-strengths-list', 'eval-guardrails', 'eval-guardrails-list', 'eval-hint', 'eval-hint-ladder-text',
    'eval-hint-earlier', 'eval-hint-earlier-list', 'eval-hint-tutor', 'eval-hint-tutor-text', 'eval-hint-question', 'reveal-hint-btn', 'eval-hint-counter',
    'eval-followup', 'eval-next', 'eval-next-list', 'eval-next-challenge-btn', 'solution-section', 'solution-lock', 'solution-lock-text', 'give-up-btn',
    'solution-details', 'solution-code', 'solution-notes', 'solution-stretch', 'load-solution-btn', 'code-editor',
    'visualize-btn', 'viz-panel', 'viz-input-select', 'viz-close', 'viz-explain-btn',
    'viz-explain-answer', 'viz-explain-answer-label', 'viz-explain-answer-text', 'viz-explain-answer-question', 'viz-explain-answer-foot'];
  var DOM_KEYS = {
    'challenge-section': 'section', 'challenge-tabs': 'tabs', 'challenge-status-line': 'statusLine', 'challenge-card': 'card', 'challenge-title': 'title',
    'challenge-description': 'description', 'challenge-examples': 'examples', 'challenge-rules': 'rules', 'challenge-rules-list': 'rulesList', 'challenge-signature': 'signature',
    'load-starter-btn': 'starterBtn', 'load-practice-btn': 'practiceBtn', 'challenge-editor': 'editor', 'editor-ask-popover': 'popover', 'editor-ask-btn': 'popoverBtn',
    'challenge-inline-msg': 'inlineMsg', 'run-tests-btn': 'runBtn', 'submit-challenge-btn': 'submitBtn', 'eval-pipeline': 'pipeline', 'eval-pipeline-time': 'pipelineTime',
    'eval-pipeline-detail': 'pipelineDetail', 'eval-trace-details': 'traceDetails', 'eval-trace-list': 'traceList', 'eval-tutor': 'tutor', 'tutor-remaining': 'tutorRemaining',
    'tutor-unavailable': 'tutorUnavailable', 'tutor-quick': 'tutorQuick', 'tutor-empty': 'tutorEmpty', 'tutor-thread': 'tutorThread', 'tutor-form': 'tutorForm',
    'tutor-context': 'tutorContext', 'tutor-context-chip': 'tutorChip', 'tutor-context-clear': 'tutorChipClear', 'tutor-input': 'tutorInput', 'tutor-stuck': 'tutorStuck',
    'tutor-send-btn': 'tutorSend', 'eval-announcer': 'announcer', 'challenge-feedback': 'feedback', 'eval-banner': 'banner', 'eval-banner-text': 'bannerText',
    'retry-ai-btn': 'retryBtn', 'eval-summary': 'summary', 'eval-score-value': 'scoreValue', 'eval-verdict': 'verdict', 'eval-headline': 'headline',
    'eval-tests-summary': 'testsSummary', 'eval-progress-note': 'progressNote', 'eval-rubric': 'rubric', 'eval-tests': 'testsPanel', 'eval-tests-body': 'testsBody',
    'eval-issues': 'issuesPanel', 'eval-issues-list': 'issuesList', 'eval-strengths': 'strengthsPanel', 'eval-strengths-list': 'strengthsList',
    'eval-guardrails': 'guardrailsPanel', 'eval-guardrails-list': 'guardrailsList', 'eval-hint': 'hintCard', 'eval-hint-ladder-text': 'hintLadderText',
    'eval-hint-earlier': 'hintEarlier', 'eval-hint-earlier-list': 'hintEarlierList', 'eval-hint-tutor': 'hintTutor', 'eval-hint-tutor-text': 'hintTutorText',
    'eval-hint-question': 'hintQuestion', 'reveal-hint-btn': 'revealBtn', 'eval-hint-counter': 'hintCounter', 'eval-followup': 'followup', 'eval-next': 'nextPanel',
    'eval-next-list': 'nextList', 'eval-next-challenge-btn': 'nextChallengeBtn', 'solution-section': 'solutionSection', 'solution-lock': 'solutionLock',
    'solution-lock-text': 'solutionLockText', 'give-up-btn': 'giveUpBtn', 'solution-details': 'solutionDetails', 'solution-code': 'solutionCode',
    'solution-notes': 'solutionNotes', 'solution-stretch': 'solutionStretch', 'load-solution-btn': 'loadSolutionBtn', 'code-editor': 'practiceEditor',
    'visualize-btn': 'vizBtn', 'viz-panel': 'vizPanel', 'viz-input-select': 'vizSelect', 'viz-close': 'vizClose', 'viz-explain-btn': 'vizExplain',
    'viz-explain-answer': 'vizAnswer', 'viz-explain-answer-label': 'vizAnswerLabel', 'viz-explain-answer-text': 'vizAnswerText',
    'viz-explain-answer-question': 'vizAnswerQuestion', 'viz-explain-answer-foot': 'vizAnswerFoot'
  };

  function init() {
    if (S.inited) return;
    S.inited = true;
    IDS.forEach(function (id) { dom[DOM_KEYS[id]] = $(id); });
    if (!dom.section || !dom.editor) return;
    dom.hintSource = dom.hintTutor ? dom.hintTutor.querySelector('.hint-source') : null;
    dom.quickButtons = dom.tutorQuick ? Array.prototype.slice.call(dom.tutorQuick.querySelectorAll('.tutor-quick-btn')) : [];
    S.defaultTutorPlaceholder = dom.tutorInput ? (dom.tutorInput.getAttribute('placeholder') || '') : '';

    // Tabs: click + roving tabindex with arrow keys
    tabButtons().forEach(function (btn) {
      btn.addEventListener('click', function () { selectChallenge(btn.getAttribute('data-challenge-id')); btn.focus(); });
    });
    if (dom.tabs) dom.tabs.addEventListener('keydown', onTabKeydown);

    dom.starterBtn.addEventListener('click', function () { loadStarter(false); });
    dom.practiceBtn.addEventListener('click', loadPractice);
    dom.runBtn.addEventListener('click', function () { runTests(); });
    dom.submitBtn.addEventListener('click', function () { getAiFeedback(); });
    if (dom.retryBtn) dom.retryBtn.addEventListener('click', function () { getAiFeedback(); });
    dom.revealBtn.addEventListener('click', revealNextHint);
    dom.giveUpBtn.addEventListener('click', giveUp);
    dom.loadSolutionBtn.addEventListener('click', loadSolutionIntoEditor);
    dom.solutionDetails.addEventListener('toggle', function () { if (dom.solutionDetails.open) revealSolution(); });
    dom.nextChallengeBtn.addEventListener('click', goToNextChallenge);

    // Editor: drafts, shortcuts, selection popover
    dom.editor.addEventListener('input', function () { scheduleDraftSave(); hidePopoverSoon(); syncVizStale(); });
    dom.editor.addEventListener('keydown', onEditorKeydown);
    ['select', 'mouseup', 'keyup'].forEach(function (evt) { dom.editor.addEventListener(evt, updatePopover); });
    dom.editor.addEventListener('blur', hidePopoverSoon);
    if (dom.popoverBtn) {
      dom.popoverBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep the textarea selection
      dom.popoverBtn.addEventListener('click', captureSelection);
    }

    // Tutor
    if (dom.tutorForm) dom.tutorForm.addEventListener('submit', function (e) { e.preventDefault(); sendTutorQuestion(); });
    if (dom.tutorInput) {
      dom.tutorInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) { e.preventDefault(); sendTutorQuestion(); }
      });
    }
    if (dom.tutorChipClear) dom.tutorChipClear.addEventListener('click', clearPendingSelection);
    dom.quickButtons.forEach(function (btn) {
      btn.addEventListener('click', function () { askTutor('', dom.tutorStuck && dom.tutorStuck.checked, btn.getAttribute('data-mode'), null); });
    });

    // Visualize my solution (addendum 2)
    if (dom.vizBtn) dom.vizBtn.addEventListener('click', openViz);
    if (dom.vizClose) dom.vizClose.addEventListener('click', function () { closeViz(true); });
    if (dom.vizPanel) {
      dom.vizPanel.addEventListener('keydown', function (e) {           // Escape closes the panel (the picker keeps
        if (e.key !== 'Escape' || !S.viz.open) return;                  // Escape for its own open dropdown)
        var tag = (e.target && e.target.tagName) ? String(e.target.tagName).toUpperCase() : '';
        if (tag === 'SELECT') return;
        e.preventDefault();
        closeViz(true);
      });
    }
    if (dom.vizSelect) dom.vizSelect.addEventListener('change', function () { if (S.viz.open) runViz(dom.vizSelect.value); });
    if (dom.vizExplain) dom.vizExplain.addEventListener('click', explainStep);
    setTutorAvailability();
    setBusy(true);
  }

  function enter() {
    init();
    if (!dom.section) return;
    try { dom.section.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
    loadChallenges().then(function (ok) {
      if (!ok) return;
      if (!S.current) {
        var last = null;
        try { last = window.localStorage.getItem(LAST_CHALLENGE_KEY); } catch (e) { S.storageOk = false; }
        selectChallenge((last && S.byId[last]) ? last : S.challenges[0].id);
      }
    });
    checkHealth();
  }

  function loadChallenges() {
    if (S.loadPromise) return S.loadPromise;
    S.loadPromise = fetch(CHALLENGES_URL, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      if (!isObj(data) || !Array.isArray(data.challenges) || data.challenges.length === 0) throw new Error('bad challenges.json');
      S.data = data;
      S.tagLabels = isObj(data.tag_labels) ? data.tag_labels : {};
      S.tagDimension = isObj(data.tag_dimension) ? data.tag_dimension : {};
      S.challenges = data.challenges.filter(function (c) { return isObj(c) && typeof c.id === 'string' && Array.isArray(c.tests) && typeof c.entry_function === 'string'; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      S.byId = {};
      S.challenges.forEach(function (c) { S.byId[c.id] = c; });
      tabButtons().forEach(function (btn) {
        var id = btn.getAttribute('data-challenge-id');
        if (!S.byId[id]) hide(btn);
        else {
          var name = btn.querySelector('.tab-name'), level = btn.querySelector('.tab-level');
          if (name) name.textContent = S.byId[id].title || id;
          if (level && S.byId[id].difficulty_label) level.textContent = S.byId[id].difficulty_label;
        }
      });
      if (S.challenges.length === 0) throw new Error('no usable challenges');
      S.loadError = false;
      setBusy(false);
      updateTabBadges();
      return true;
    }).catch(function (err) {
      S.loadError = true;
      S.loadPromise = null;
      if (dom.title) dom.title.textContent = "Couldn't load the challenge definitions. Reload the page.";
      if (dom.description) { clear(dom.description); dom.description.appendChild(el('p', null, 'The file data/challenges.json could not be loaded (' + (err && err.message ? err.message : 'unknown error') + ').')); }
      setBusy(true);
      return false;
    });
    return S.loadPromise;
  }

  function checkHealth() {
    if (S.healthPending) return;
    S.healthPending = true;
    setTutorAvailability();
    fetchJson(apiBase() + '/evaluate-challenge/health', {}, HEALTH_TIMEOUT_MS).then(function (r) {
      S.healthPending = false;
      S.health = (r.ok && isObj(r.json) && r.json.ok === true) ? r.json : null;
      applyHealth();
    });
  }
  function applyHealth() {
    var h = S.health;
    if (dom.submitBtn && S.phase !== 'requesting_ai') {
      dom.submitBtn.textContent = (h && h.ai_configured === false) ? 'Get feedback (AI tutor not configured)' : 'Get AI feedback';
    }
    // Addendum B1: the box is shown whenever the server answered the health check; without an AI judge it
    // carries the muted "not configured" note and disabled controls. Health failed/unreachable -> hidden.
    if (dom.tutor) { if (h) show(dom.tutor); else hide(dom.tutor); }
    setTutorAvailability();
  }

  /* ---------- Tabs / challenge selection / problem card ---------- */

  function tabButtons() {
    return dom.tabs ? Array.prototype.slice.call(dom.tabs.querySelectorAll('.challenge-tab')) : [];
  }
  function onTabKeydown(e) {
    var tabs = tabButtons().filter(function (b) { return !b.classList.contains('hidden'); });
    var idx = tabs.indexOf(document.activeElement);
    if (idx < 0 || tabs.length === 0) return;
    var next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    tabs[next].focus();
    selectChallenge(tabs[next].getAttribute('data-challenge-id'));
  }

  function selectChallenge(id) {
    var ch = S.byId[id];
    if (!ch) return;
    flushDraft();
    cancelPopover();
    S.pendingSelection = null;
    S.current = ch;
    tabButtons().forEach(function (btn) {
      var active = btn.getAttribute('data-challenge-id') === id;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.setAttribute('tabindex', active ? '0' : '-1');
    });
    if (dom.card) dom.card.setAttribute('aria-labelledby', 'tab-' + id);
    renderProblemCard(ch);
    var st = readState(id);
    dom.editor.value = (typeof st.draftCode === 'string') ? st.draftCode : (ch.starter_code || '');
    hide(dom.inlineMsg);
    S.replayToken++;
    closeViz();
    resetPipeline();
    hide(dom.pipeline);
    hide(dom.traceDetails);
    hideBanner();
    var sess = session(id);
    if (sess.lastRender) renderResults(sess.lastRender.result, { source: sess.lastRender.source });
    else { hide(dom.feedback); hide(dom.followup); hide(dom.hintTutor); }
    if (sess.lastBanner) showBanner(sess.lastBanner.text, sess.lastBanner.retry);
    renderHintCard();
    // The solution panel always belongs to the current challenge: empty it and collapse it on every switch.
    dom.solutionDetails.open = false;
    dom.solutionCode.textContent = '';
    clear(dom.solutionNotes);
    dom.solutionStretch.textContent = '';
    updateSolutionLock();
    updateStatusLine();
    updateTabBadges();
    renderTutorThread();
    updateTutorContext();
    setTutorAvailability();
    updateVizButton();
    try { window.localStorage.setItem(LAST_CHALLENGE_KEY, id); } catch (e) { S.storageOk = false; }
  }

  function renderProblemCard(ch) {
    if (!dom.title) return;
    dom.title.textContent = ch.title + (ch.difficulty_label ? ' (' + ch.difficulty_label + ')' : '');
    clear(dom.description);
    var paragraphs = String(ch.spec || ch.summary || '').split(/\n\s*\n|\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    if (ch.summary && paragraphs.length && paragraphs[0] !== ch.summary) dom.description.appendChild(el('p', { 'class': 'challenge-summary' }, el('strong', null, renderInline(ch.summary))));
    paragraphs.forEach(function (p) { dom.description.appendChild(el('p', null, renderInline(p))); });
    clear(dom.examples);
    (Array.isArray(ch.examples) ? ch.examples : []).forEach(function (ex, i) {
      if (!isObj(ex)) return;
      dom.examples.appendChild(el('div', { 'class': 'example' }, [
        el('h3', null, 'Example ' + (i + 1) + ':'),
        el('div', { 'class': 'example-content' }, [
          el('p', null, [el('strong', null, 'Input: '), str(ex.input)]),
          el('p', null, [el('strong', null, 'Output: '), str(ex.output)]),
          ex.explanation ? el('p', { 'class': 'example-explanation' }, renderInline(ex.explanation)) : null
        ])
      ]));
    });
    clear(dom.rulesList);
    (Array.isArray(ch.constraints) ? ch.constraints : []).forEach(function (c) { dom.rulesList.appendChild(el('li', null, renderInline(c))); });
    if (isObj(ch.target_complexity)) {
      dom.rulesList.appendChild(el('li', null, 'Target complexity: ' + str(ch.target_complexity.time) + ' time, ' + str(ch.target_complexity.space) + ' space.'));
    }
    (Array.isArray(ch.key_concepts) ? ch.key_concepts : []).forEach(function (k) { dom.rulesList.appendChild(el('li', null, [el('em', null, 'Key concept: '), renderInline(k)])); });
    dom.signature.textContent = str(ch.signature);
  }

  /* ---------- Editor helpers ---------- */

  function getCode() { return dom.editor ? dom.editor.value : ''; }
  function setCode(text) { dom.editor.value = text; flushDraft(); syncVizStale(); }
  function scheduleDraftSave() {
    if (S.draftTimer) clearTimeout(S.draftTimer);
    S.draftTimer = setTimeout(flushDraft, DRAFT_DEBOUNCE_MS);
  }
  function flushDraft() {
    if (S.draftTimer) { clearTimeout(S.draftTimer); S.draftTimer = null; }
    if (S.current) writeState(S.current.id, { draftCode: getCode() });
  }
  function editorDiffersFromStarter() {
    return !!S.current && getCode().replace(/\s+/g, '') !== String(S.current.starter_code || '').replace(/\s+/g, '');
  }
  function loadStarter(silent) {
    if (!S.current) return;
    if (!silent && getCode().trim() && editorDiffersFromStarter() && !window.confirm('Replace your code with the starter code?')) return;
    setCode(S.current.starter_code || '');
    hide(dom.inlineMsg);
    dom.editor.focus();
  }
  function starterBlocks(starter) {
    var lines = String(starter || '').split('\n');
    var blocks = [];
    var i = 0;
    while (i < lines.length) {
      var m = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i]);
      if (!m) { i++; continue; }
      var start = i;
      while (start > 0 && /^\s*\/\//.test(lines[start - 1])) start--;
      var depth = 0, seenOpen = false, j = i;
      for (; j < lines.length; j++) {
        var code = lines[j].replace(/\/\/.*$/, '');
        for (var k = 0; k < code.length; k++) { if (code[k] === '{') { depth++; seenOpen = true; } else if (code[k] === '}') depth--; }
        if (seenOpen && depth <= 0) break;
      }
      blocks.push({ name: m[1], text: lines.slice(start, j + 1).join('\n') });
      i = j + 1;
    }
    return blocks;
  }
  function definedNames(code) {
    var names = {}, m;
    var re1 = /\bfunction\s+([A-Za-z_$][\w$]*)/g;
    var re2 = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(|[A-Za-z_$][\w$]*\s*=>|function)/g;
    while ((m = re1.exec(code)) !== null) names[m[1]] = true;
    while ((m = re2.exec(code)) !== null) names[m[1]] = true;
    return names;
  }
  function loadPractice() {
    if (!S.current) return;
    var practice = dom.practiceEditor ? dom.practiceEditor.value : '';
    if (getCode().trim() && editorDiffersFromStarter() && !window.confirm('Replace your code with your Practice-mode code plus the starter stubs?')) return;
    var have = definedNames(practice);
    var missing = starterBlocks(S.current.starter_code).filter(function (b) { return !have[b.name]; }).map(function (b) { return b.text; });
    var out = practice.replace(/\s+$/, '');
    if (missing.length) out += (out ? '\n\n' : '') + missing.join('\n\n') + '\n';
    setCode(out);
    hide(dom.inlineMsg);
    dom.editor.focus();
  }
  function onEditorKeydown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) getAiFeedback(); else runTests();
    }
  }
  function selectEditorLine(a, b) {
    var lines = getCode().split('\n');
    if (!isInt(a) || a < 1 || a > lines.length) return false;
    if (!isInt(b) || b < a) b = a;
    if (b > lines.length) b = lines.length;
    var start = 0;
    for (var i = 0; i < a - 1; i++) start += lines[i].length + 1;
    var end = start;
    for (i = a - 1; i < b; i++) end += lines[i].length + (i < b - 1 ? 1 : 0);
    try {
      dom.editor.focus();
      dom.editor.setSelectionRange(start, end);
      var lh = parseFloat(window.getComputedStyle(dom.editor).lineHeight);
      if (!isFinite(lh)) lh = 18;
      dom.editor.scrollTop = Math.max(0, (a - 1) * lh - dom.editor.clientHeight / 2);
      dom.editor.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    } catch (e) { /* ignore */ }
    return true;
  }

  /* Selection popover (addendum B3) */
  function selectionLines(value, start, end) {
    var before = value.slice(0, start);
    var startLine = before.split('\n').length;
    var endLine = value.slice(0, end).split('\n').length;
    if (end > start && value[end - 1] === '\n') endLine -= 1;
    if (endLine < startLine) endLine = startLine;
    return { start_line: startLine, end_line: endLine };
  }
  function lineLabel(sel) { return sel.start_line === sel.end_line ? 'Ln ' + sel.start_line : 'Ln ' + sel.start_line + '-' + sel.end_line; }
  function updatePopover() {
    if (!dom.popover || !dom.popoverBtn) return;
    var start = dom.editor.selectionStart, end = dom.editor.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number' || start === end) { hidePopoverSoon(); return; }
    var value = dom.editor.value;
    var lines = selectionLines(value, start, end);
    S.lastSelection = { start_line: lines.start_line, end_line: lines.end_line, text: value.slice(start, end).slice(0, 2000) };
    dom.popoverBtn.textContent = 'Ask tutor about ' + lineLabel(lines);
    if (S.popoverTimer) { clearTimeout(S.popoverTimer); S.popoverTimer = null; }
    show(dom.popover);
  }
  function hidePopoverSoon() {
    if (S.popoverTimer) clearTimeout(S.popoverTimer);
    S.popoverTimer = setTimeout(function () { S.popoverTimer = null; hide(dom.popover); }, POPOVER_HIDE_DELAY_MS);
  }
  function cancelPopover() {
    if (S.popoverTimer) { clearTimeout(S.popoverTimer); S.popoverTimer = null; }
    hide(dom.popover);
    S.lastSelection = null;
  }
  function captureSelection() {
    var sel = S.lastSelection;
    if (!sel) {
      var start = dom.editor.selectionStart, end = dom.editor.selectionEnd;
      if (start === end) return;
      var lines = selectionLines(dom.editor.value, start, end);
      sel = { start_line: lines.start_line, end_line: lines.end_line, text: dom.editor.value.slice(start, end).slice(0, 2000) };
    }
    S.pendingSelection = sel;
    cancelPopover();
    updateTutorContext();
    if (dom.tutorInput && !dom.tutorInput.disabled) dom.tutorInput.focus();
  }
  function clearPendingSelection() {
    S.pendingSelection = null;
    updateTutorContext();
    if (dom.tutorInput) dom.tutorInput.focus();
  }
  function updateTutorContext() {
    if (!dom.tutorContext) return;
    var sel = S.pendingSelection;
    if (sel) {
      dom.tutorChip.textContent = lineLabel(sel);
      show(dom.tutorContext);
      var sess = S.current ? session(S.current.id) : null;
      var firstFail = sess && sess.localResult && sess.localResult.summary.first_failure ? sess.localResult.summary.first_failure.id : null;
      dom.tutorInput.setAttribute('placeholder', firstFail
        ? 'What does this do? Why does it fail ' + firstFail + '? Is this the right base case?'
        : 'What does this do? Is this the right base case?');
    } else {
      hide(dom.tutorContext);
      dom.tutorInput.setAttribute('placeholder', S.defaultTutorPlaceholder);
    }
  }

  /* ---------- Pipeline strip ---------- */

  function stageEl(stage) { return dom.pipeline ? dom.pipeline.querySelector('.pipeline-step-mini[data-stage="' + stage + '"]') : null; }
  function setStage(stage, status, detail) {
    var node = stageEl(stage);
    if (node) {
      STAGE_CLASSES.forEach(function (c) { node.classList.remove(c); });
      if (status && status !== 'idle') node.classList.add(status);
    }
    if (typeof detail === 'string' && dom.pipelineDetail) dom.pipelineDetail.textContent = detail;
  }
  function resetPipeline() {
    STAGES.forEach(function (s) { setStage(s, 'idle'); });
    if (dom.pipelineDetail) dom.pipelineDetail.textContent = '';
    if (dom.pipelineTime) dom.pipelineTime.textContent = '';
    if (dom.traceList) clear(dom.traceList);
  }
  function replayTrace(trace) {
    var token = ++S.replayToken;
    var step = reducedMotion() ? 0 : TRACE_STEP_MS;
    var stages = (trace || []).filter(function (t) { return STAGES.indexOf(t.stage) >= 0; });
    var i = 0;
    var next = function () {
      if (token !== S.replayToken) return;
      if (i >= stages.length) return;
      var t = stages[i++];
      if (t.stage === 'static_checks' || t.stage === 'tests') {
        // Browser-side stages already show what the local run found; only their server detail is replayed.
        setStage(t.stage, stageEl(t.stage) && stageEl(t.stage).classList.contains('warning') ? 'warning' : (TRACE_STATUS_CLASS[t.status] || 'completed'), t.detail);
        setTimeout(next, step);
        return;
      }
      setStage(t.stage, 'active', t.detail);
      setTimeout(function () {
        if (token !== S.replayToken) return;
        setStage(t.stage, TRACE_STATUS_CLASS[t.status] || 'completed');
        next();
      }, step);
    };
    next();
  }
  function renderTraceList(trace) {
    clear(dom.traceList);
    (trace || []).forEach(function (t) {
      var label = STAGE_LABELS[t.stage] || t.stage;
      var text = label + ': ' + t.status + (isInt(t.ms) ? ', ' + fmtMs(t.ms) : '') + (t.detail ? ' — ' + t.detail : '');
      dom.traceList.appendChild(el('li', null, text));
    });
    if (trace && trace.length) show(dom.traceDetails); else hide(dom.traceDetails);
  }

  /* ---------- Busy state, banners ---------- */

  function setBusy(busy) {
    var disabled = busy || S.loadError;
    [dom.runBtn, dom.submitBtn, dom.starterBtn, dom.practiceBtn, dom.giveUpBtn, dom.loadSolutionBtn].forEach(function (b) { if (b) b.disabled = disabled; });
    if (dom.submitBtn && !disabled) applyHealth();
    updateVizButton(busy);
  }
  function showBanner(text, withRetry) {
    if (!dom.banner) return;
    dom.bannerText.textContent = text;
    if (withRetry) show(dom.retryBtn); else hide(dom.retryBtn);
    show(dom.banner);
    if (S.current) session(S.current.id).lastBanner = { text: text, retry: !!withRetry };
  }
  function hideBanner() {
    hide(dom.banner);
    if (dom.bannerText) dom.bannerText.textContent = '';
    if (S.current) session(S.current.id).lastBanner = null;
  }
  function showInlineMsg(text, withLoadStarter) {
    clear(dom.inlineMsg);
    dom.inlineMsg.appendChild(document.createTextNode(text));
    if (withLoadStarter) {
      dom.inlineMsg.appendChild(document.createTextNode(' '));
      var b = el('button', { type: 'button', 'class': 'template-btn' }, 'Load starter');
      b.addEventListener('click', function () { loadStarter(true); });
      dom.inlineMsg.appendChild(b);
    }
    show(dom.inlineMsg);
  }

  /* ---------- Run tests (free loop) ---------- */

  function computeVerdict(cr, summary) {
    if (!cr) return 'UNVERIFIED';
    if (summary.compile_failed) return 'ERROR';
    if (summary.executed === 0) return 'UNVERIFIED';
    if (summary.errored === summary.executed) return 'ERROR';
    if (summary.passed === summary.total) return 'PASS';
    if (summary.passed === 0) return 'FAIL';
    return 'PARTIAL';
  }

  function runTests() {
    if (!S.current || S.phase === 'running_local' || S.phase === 'requesting_ai') return Promise.resolve(null);
    var ch = S.current;
    var code = getCode();
    if (!code.trim()) {
      showInlineMsg('Write your solution first, or load the starter code.', true);
      return Promise.resolve(null);
    }
    hide(dom.inlineMsg);
    flushDraft();
    S.phase = 'running_local';
    setBusy(true);
    S.replayToken++;
    resetPipeline();
    show(dom.pipeline);
    hide(dom.traceDetails);
    hideBanner();
    setStage('static_checks', 'active', 'Parsing your code in the sandbox...');
    var total = ch.tests.length;
    var done = 0;
    var t0 = performance.now();
    var hooks = {
      onCompiled: function (c) {
        if (S.current !== ch) return;
        if (c.ok && c.entry_found) {
          var n = c.defined_functions.length;
          setStage('static_checks', 'completed', 'Parsed, ' + n + ' ' + plural(n, 'function') + ' found');
          setStage('tests', 'active', 'Sandbox tests: 0/' + total + ' done');
        } else if (c.ok) {
          setStage('static_checks', 'warning', 'No function named ' + ch.entry_function + ' found');
          setStage('tests', 'skipped');
        } else {
          setStage('static_checks', 'failed', (c.error_kind === 'syntax' ? 'Syntax error: ' : 'Load error: ') + (c.error || 'unknown'));
          setStage('tests', 'skipped');
        }
      },
      onTest: function () {
        done++;
        if (S.current === ch) setStage('tests', 'active', 'Sandbox tests: ' + done + '/' + total + ' done');
      }
    };
    var runner = window.ChallengeRunner;
    var runP = runner ? runner.run(ch, code, hooks) : Promise.resolve(null);
    return runP.then(function (cr) {
      var wall = performance.now() - t0;
      return runner.attemptHash(code).then(function (hash) { return { cr: cr, hash: hash, wall: wall }; });
    }).then(function (r) {
      var cr = r.cr;
      var summary = runner.summarize(ch, cr);
      var verdict = computeVerdict(cr, summary);
      var sess = session(ch.id);
      var st = readState(ch.id);
      // Attempt accounting: only changed code counts
      var counted = false;
      if (r.hash && r.hash !== st.lastAttemptHash) {
        counted = true;
        var patch = { attempts: st.attempts + 1, lastAttemptHash: r.hash };
        if (st.tutorRemaining < TUTOR_BUDGET) { patch.tutorRemaining = TUTOR_BUDGET; patch.tutorResetAt = nowIso(); }
        st = writeState(ch.id, patch);
      }
      var patch2 = {};
      if (cr) {
        patch2.totalTests = summary.total;
        if (summary.passed > st.bestPassed || st.totalTests !== summary.total) patch2.bestPassed = Math.max(summary.passed, st.totalTests === summary.total ? st.bestPassed : 0);
        if (verdict === 'PASS' && !st.solved) { patch2.solved = true; patch2.solvedAtAttempt = st.attempts; }
      }
      st = writeState(ch.id, patch2);
      var det = deterministicFeedback(ch, cr);
      var localResult = { source: 'local', challenge: ch, code: code, clientResults: cr, summary: summary, verdict: verdict, deterministic: det, attemptHash: r.hash, counted: counted, wallMs: r.wall };
      sess.clientResults = cr;
      sess.localResult = localResult;
      sess.previous = { failed_test_ids: summary.failing_ids.slice(0, 20), hint_level: sess.previous ? sess.previous.hint_level : null };
      if (S.current === ch) {
        if (!cr) {
          setStage('static_checks', 'skipped');
          setStage('tests', 'skipped', "Your browser can't run the sandbox here; the AI can still review your code (unverified).");
        } else if (summary.compile_failed) {
          setStage('tests', 'skipped');
        } else {
          var extra = (summary.timed_out ? ', ' + summary.timed_out + ' timed out' : '') + (summary.errored ? ', ' + summary.errored + ' errored' : '') + (summary.not_run ? ', ' + summary.not_run + ' not run' : '');
          var detail = summary.passed + '/' + summary.total + ' passed' + extra + ', ' + fmtMs(cr.total_ms);
          setStage('tests', (summary.timed_out || summary.errored || summary.not_run) ? 'warning' : 'completed', detail + '. ' + NOT_RUN_DETAIL);
        }
        if (cr && summary.compile_failed && dom.pipelineDetail && dom.pipelineDetail.textContent) dom.pipelineDetail.textContent += '. ' + NOT_RUN_DETAIL;
        ['retrieval', 'judge', 'postcheck'].forEach(function (s) { setStage(s, 'skipped'); });
        if (dom.pipelineTime) dom.pipelineTime.textContent = cr ? fmtMs(cr.total_ms) : '';
        renderResults(localResult, { source: 'local' });
        if (!cr) announce("Your browser can't run the sandbox; tests were not run.");
        else if (summary.compile_failed) announce("Tests did not run: " + (det.headline || 'your code did not load.'));
        else announce('Tests finished: ' + summary.passed + ' of ' + summary.total + ' passed.' + (verdict === 'PASS' ? ' All ' + summary.total + ' tests pass.' : ''));
        renderHintCard();
        updateSolutionLock();
        updateStatusLine();
        updateTabBadges();
        updateTutorContext();
        setTutorAvailability();
        refreshViz(ch);
      }
      S.phase = 'local_done';
      setBusy(false);
      return localResult;
    }).catch(function (err) {
      S.phase = 'idle';
      setBusy(false);
      if (S.current === ch) {
        setStage('tests', 'failed', 'The sandbox failed: ' + (err && err.message ? err.message : String(err)));
        showInlineMsg('The sandbox could not run your code. Reload the page and try again.', false);
      }
      return null;
    });
  }

  /* ---------- Get AI feedback (guided loop) ---------- */

  function buildRequestBody(localResult, previous) {
    var ch = localResult.challenge;
    var st = readState(ch.id);
    var body = {
      challenge_id: ch.id,
      challenge_type: ch.id,
      code: localResult.code,
      attempt: Math.max(1, st.attempts),
      hints_used: hintsUsed(st),
      previous: null,
      learner_state: { gave_up: !!st.gaveUp, solution_revealed: !!st.solutionRevealed },
      client_results: localResult.clientResults
    };
    if (isObj(previous) && Array.isArray(previous.failed_test_ids)) {     // what failed on the previous run + the last AI hint level
      body.previous = { failed_test_ids: previous.failed_test_ids.slice(0, 20), hint_level: HINT_LEVELS.indexOf(previous.hint_level) >= 0 ? previous.hint_level : null };
    }
    return body;
  }

  function getAiFeedback() {
    if (!S.current || S.phase === 'running_local' || S.phase === 'requesting_ai') return Promise.resolve(null);
    var ch = S.current;
    var prior = session(ch.id).previous ? { failed_test_ids: session(ch.id).previous.failed_test_ids.slice(), hint_level: session(ch.id).previous.hint_level } : null;
    return runTests().then(function (localResult) {
      if (!localResult || S.current !== ch) return null;
      var sess = session(ch.id);
      var st = readState(ch.id);
      if (localResult.attemptHash && localResult.attemptHash === st.lastAiCodeHash && sess.aiResult) {
        renderResults(sess.aiResult, { source: 'ai' });
        showBanner("Your code hasn't changed since the last review; here is that review again.", false);
        ['retrieval', 'judge', 'postcheck'].forEach(function (s) { setStage(s, 'completed'); });
        setStage('postcheck', 'completed', 'Cached review shown; no request was sent.');
        show(dom.followup);
        return sess.aiResult;
      }
      S.phase = 'requesting_ai';
      setBusy(true);
      dom.submitBtn.textContent = 'Reviewing...';
      ['judge', 'postcheck'].forEach(function (s) { setStage(s, 'idle'); });     // server stages are pending now, not skipped
      setStage('retrieval', 'active', 'Sending your code and test results to the tutor...');
      var coldTimer = setTimeout(function () {
        if (S.phase === 'requesting_ai' && S.current === ch) setStage('retrieval', 'active', 'Waking the tutor server (free hosting sleeps when idle); this can take up to a minute.');
      }, COLD_START_NOTICE_MS);
      var body = buildRequestBody(localResult, prior);
      var t0 = performance.now();
      return fetchJson(apiBase() + '/evaluate-challenge', { method: 'POST', body: body }, AI_REQUEST_TIMEOUT_MS).then(function (r) {
        clearTimeout(coldTimer);
        var wall = performance.now() - t0;
        S.phase = (r.ok && isObj(r.json)) ? 'ai_done' : 'ai_failed';
        setBusy(false);
        if (S.current !== ch) { S.phase = 'idle'; return null; }
        if (!r.ok || !isObj(r.json)) {
          onAiFailure(r);
          return null;
        }
        var v = validateEvaluationResponse(r.json);
        var aiResult = {
          source: v.evaluation ? 'ai' : 'legacy', challenge: ch, code: localResult.code, clientResults: localResult.clientResults,
          summary: localResult.summary, verdict: localResult.verdict, deterministic: localResult.deterministic, attemptHash: localResult.attemptHash,
          server: v, evaluationRaw: isObj(r.json.evaluation) ? r.json.evaluation : null, wallMs: wall
        };
        sess.aiResult = aiResult;
        if (sess.previous && v.evaluation && v.evaluation.next_hint) sess.previous.hint_level = v.evaluation.next_hint.level;
        var patch = { aiReviews: st.aiReviews + 1, lastAiCodeHash: localResult.attemptHash, lastEvaluationAt: nowIso(), tutorRemaining: TUTOR_BUDGET, tutorResetAt: nowIso() };
        if (isInt(v.overall)) patch.bestScore = (st.bestScore === null) ? v.overall : Math.max(st.bestScore, v.overall);
        writeState(ch.id, patch);
        // Strip + trace
        var trace = v.pipeline.trace;
        if (trace.length) { replayTrace(trace); renderTraceList(trace); }
        else { ['retrieval', 'judge', 'postcheck'].forEach(function (s) { setStage(s, 'completed'); }); hide(dom.traceDetails); }
        var serverMs = trace.reduce(function (a, t) { return a + (isInt(t.ms) ? t.ms : 0); }, 0);
        if (dom.pipelineTime) dom.pipelineTime.textContent = fmtMs((localResult.clientResults ? localResult.clientResults.total_ms : 0) + wall) + (serverMs ? ' (server ' + fmtMs(serverMs) + ')' : '');
        renderResults(aiResult, { source: aiResult.source });
        // Banners
        var banners = [];
        var retry = false;
        if (aiResult.source === 'legacy') banners.push('Showing plain-text feedback from an older server version.');
        if (v.ai && v.ai.present && v.ai.degraded) {          // an old backend without an `ai` block is not "degraded", just legacy
          banners.push(v.ai.message || 'The AI tutor could not review this submission; showing rule-based feedback.');
          if (v.ai.reason !== 'not_configured' && v.ai.reason !== 'disabled') retry = true;
        }
        if (v.tests && v.tests.mode === 'no_tests' && localResult.clientResults) {
          banners.push('The server could not use your test results (' + (v.tests.evidence_note || 'unknown reason') + '); reload the page to sync challenge definitions.');
          setStage('tests', 'warning');
        }
        if (banners.length) showBanner(banners.join(' '), retry); else hideBanner();
        show(dom.followup);
        try { dom.summary.focus({ preventScroll: false }); } catch (e) { /* ignore */ }
        var spoken = v.verdict ? (VERDICT_SPOKEN[v.verdict] || v.verdict.toLowerCase()) : VERDICT_SPOKEN[localResult.verdict];
        announce('AI review ready' + (isInt(v.overall) ? ': score ' + v.overall : '') + ', ' + spoken + '.');
        updateStatusLine();
        updateTabBadges();
        setTutorAvailability();
        return aiResult;
      });
    });
  }

  function onAiFailure(r) {
    dom.submitBtn.textContent = 'Get AI feedback';
    applyHealth();
    var text = UNREACHABLE_BANNER;
    var stage = 'retrieval';
    if (r.status === 429) {
      var retryAfter = null;
      if (r.json && isInt(r.json.retry_after)) retryAfter = r.json.retry_after;
      else if (r.headers) { var h = parseInt(r.headers.get('Retry-After'), 10); if (isFinite(h)) retryAfter = h; }
      text = 'The tutor is busy; try again in ' + (retryAfter !== null ? retryAfter : 30) + 's.';
      stage = 'judge';
    } else if (r.status >= 400 && r.json && isObj(r.json.error) && typeof r.json.error.message === 'string') {
      text = 'The AI tutor could not review this submission (' + r.json.error.message + '). Your test results above are still valid.';
      if (r.status >= 500) stage = 'judge';
    } else if (r.aborted) {
      text = 'The AI tutor did not answer within 90 seconds. Your test results above are still valid.';
      stage = 'judge';
    }
    var reached = false;
    STAGES.forEach(function (s) {
      if (s === stage) { setStage(s, 'failed', text); reached = true; }
      else if (reached) setStage(s, 'skipped');
      else if (s === 'retrieval') setStage(s, 'completed');
    });
    showBanner(text, true);
    show(dom.followup);
    announce('The AI review failed. ' + text);
  }

  /* ---------- Response validation ---------- */

  function validateEvaluationResponse(data) {
    var out = { ok: false, request_id: '', evaluation: null, tests: null, retrieval: [], pipeline: { trace: [], guardrails: null }, ai: null, overall: null, verdict: null, response: '', invalid: [] };
    if (!isObj(data)) { out.invalid.push('body'); return out; }
    out.ok = data.ok === true;
    out.request_id = str(data.request_id, 40);
    out.response = str(data.response, 20000);
    out.overall = (isInt(data.overall) && data.overall >= 0 && data.overall <= 100) ? data.overall : null;
    if (data.overall !== undefined && out.overall === null) out.invalid.push('overall');
    out.verdict = VERDICTS.indexOf(data.verdict) >= 0 ? data.verdict : null;
    out.ai = coerceAi(data.ai);
    out.tests = coerceTests(data.tests);
    out.retrieval = coerceRetrieval(data.retrieval);
    out.pipeline = coercePipeline(data.pipeline);
    if (isObj(data.evaluation)) out.evaluation = coerceEvaluation(data.evaluation, out.invalid);
    else if (data.evaluation !== undefined && data.evaluation !== null) out.invalid.push('evaluation');
    return out;
  }
  function coerceAi(ai) {
    if (!isObj(ai)) return { present: false, enabled: false, degraded: true, reason: null, message: null, model: null, usage: null };
    return {
      present: true, enabled: ai.enabled === true, degraded: ai.degraded === true,
      reason: (typeof ai.reason === 'string') ? ai.reason.slice(0, 40) : null,
      message: (typeof ai.message === 'string') ? ai.message.slice(0, 300) : null,
      model: (typeof ai.model === 'string') ? ai.model.slice(0, 60) : null,
      usage: isObj(ai.usage) ? ai.usage : null
    };
  }
  function coerceTests(t) {
    if (!isObj(t)) return null;
    var out = { mode: (t.mode === 'no_tests') ? 'no_tests' : 'tests', evidence_note: str(t.evidence_note, 120), summary: null, failed: [] };
    if (isObj(t.summary)) {
      out.summary = {};
      ['total', 'passed', 'failed', 'errored', 'timed_out', 'not_run'].forEach(function (k) { out.summary[k] = isInt(t.summary[k]) ? t.summary[k] : 0; });
    }
    if (Array.isArray(t.failed)) out.failed = t.failed.filter(isObj).slice(0, 64);
    return out;
  }
  function coerceRetrieval(r) {
    if (!Array.isArray(r)) return [];
    return r.filter(function (x) { return isObj(x) && typeof x.card_id === 'string'; }).slice(0, 5).map(function (x) {
      return { card_id: x.card_id.slice(0, 60), title: str(x.title, 120), similarity: (typeof x.similarity === 'number' && isFinite(x.similarity)) ? x.similarity : null, matched_by: strList(x.matched_by, 20, 20) || [] };
    });
  }
  function coercePipeline(p) {
    var out = { trace: [], guardrails: null };
    if (!isObj(p)) return out;
    if (Array.isArray(p.trace)) {
      out.trace = p.trace.filter(function (t) { return isObj(t) && typeof t.stage === 'string' && STAGE_LABELS[t.stage]; }).map(function (t) {
        return { stage: t.stage, status: (['ok', 'skipped', 'degraded', 'error'].indexOf(t.status) >= 0) ? t.status : 'ok', ms: isInt(t.ms) ? t.ms : 0, detail: str(t.detail, 300) };
      });
    }
    if (isObj(p.guardrails)) {
      var g = p.guardrails;
      out.guardrails = {
        verdict_overridden: g.verdict_overridden === true,
        verdict_model: (typeof g.verdict_model === 'string') ? g.verdict_model.slice(0, 20) : null,
        scores_adjusted: Array.isArray(g.scores_adjusted) ? g.scores_adjusted.filter(function (a) { return isObj(a) && typeof a.dim === 'string'; }).slice(0, 10).map(function (a) {
          return { dim: a.dim.slice(0, 20), from: isInt(a.from) ? a.from : null, to: isInt(a.to) ? a.to : null, reason: str(a.reason, 80) };
        }) : [],
        issues_dropped: isInt(g.issues_dropped) ? g.issues_dropped : 0,
        hint_replaced: g.hint_replaced === true,
        hint_replaced_reason: str(g.hint_replaced_reason, 40),
        leaks_redacted: isInt(g.leaks_redacted) ? g.leaks_redacted : 0,
        flags: strList(g.flags, 5, 40) || []
      };
    }
    return out;
  }
  function coerceEvaluation(ev, invalid) {
    var out = {};
    out.verdict = VERDICTS.indexOf(ev.verdict) >= 0 ? ev.verdict : null;
    if (!out.verdict) invalid.push('evaluation.verdict');
    out.summary = (typeof ev.summary === 'string' && ev.summary.trim()) ? ev.summary.slice(0, 500) : null;
    if (!out.summary) invalid.push('evaluation.summary');
    out.progress_note = str(ev.progress_note, 300);
    out.scores = {};
    var scoresOk = isObj(ev.scores);
    DIMS.forEach(function (d) {
      var s = scoresOk ? ev.scores[d] : null;
      if (isObj(s) && isInt(s.score) && s.score >= 0 && s.score <= 100) {
        out.scores[d] = { score: s.score, justification: str(s.justification, 300), source: SCORE_SOURCES.indexOf(s.source) >= 0 ? s.source : (EVIDENCE_DIMS[d] ? 'tests' : 'judge') };
      } else { out.scores[d] = null; invalid.push('evaluation.scores.' + d); }
    });
    out.strengths = strList(ev.strengths, 3, 200);
    if (out.strengths === null) invalid.push('evaluation.strengths');
    if (Array.isArray(ev.issues)) {
      out.issues = ev.issues.filter(isObj).slice(0, 4).map(function (it) {
        return {
          title: str(it.title, 120) || 'Issue', category: ISSUE_CATEGORIES.indexOf(it.category) >= 0 ? it.category : 'correctness',
          severity: SEVERITIES.indexOf(it.severity) >= 0 ? it.severity : 'medium', explanation: str(it.explanation, 1200),
          evidence: Array.isArray(it.evidence) ? it.evidence.filter(function (e) { return isObj(e) && EVIDENCE_KINDS.indexOf(e.kind) >= 0 && typeof e.ref === 'string'; }).slice(0, 6).map(function (e) { return { kind: e.kind, ref: e.ref.slice(0, 40) }; }) : []
        };
      });
    } else { out.issues = null; invalid.push('evaluation.issues'); }
    out.misconception_tags = strList(ev.misconception_tags, 5, 60) || [];
    out.complexity = isObj(ev.complexity) ? { time: str(ev.complexity.time, 120), space: str(ev.complexity.space, 120), note: str(ev.complexity.note, 300) } : null;
    if (isObj(ev.next_hint) && typeof ev.next_hint.text === 'string' && ev.next_hint.text.trim() && HINT_LEVELS.indexOf(ev.next_hint.level) >= 0) {
      out.next_hint = { level: ev.next_hint.level, text: ev.next_hint.text.slice(0, 900), socratic_question: str(ev.next_hint.socratic_question, 300), source: HINT_SOURCES.indexOf(ev.next_hint.source) >= 0 ? ev.next_hint.source : 'judge' };
    } else { out.next_hint = null; invalid.push('evaluation.next_hint'); }
    out.what_to_try_next = strList(ev.what_to_try_next, 3, 300);
    if (out.what_to_try_next === null) invalid.push('evaluation.what_to_try_next');
    out.encouragement = str(ev.encouragement, 300);
    out.flags = strList(ev.flags, 5, 40) || [];
    return out;
  }

  /* ---------- Deterministic feedback (local mode and per-field fallback) ---------- */

  function tagLabel(tag) { return S.tagLabels[tag] || tag; }
  function fmtArgs(test, ch) {
    var args = Array.isArray(test.args) ? test.args : [];
    var names = Array.isArray(ch.param_names) ? ch.param_names : [];
    if (test.gen_desc) return test.gen_desc + (args.length === 3 ? ', ' + (names[2] || 'maxDifferences') + ' = ' + jsLit(args[2]) : '');
    return args.map(function (a, i) { return (names[i] || ('arg' + (i + 1))) + ' = ' + jsLit(a); }).join(', ');
  }
  function jsLit(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'number' && !isFinite(v)) return String(v);
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  function fmtActual(row) {
    if (row.status === 'timeout') return 'no result within ' + (window.ChallengeRunner ? window.ChallengeRunner.PER_TEST_TIMEOUT_MS : 2000) + ' ms';
    if (row.status === 'error') return 'Error: ' + (row.error || 'unknown error');
    if (row.status === 'not_run') return 'not run' + (row.error ? ' (' + row.error.replace(/^not run: /, '') + ')' : '');
    if (row.actual_type === 'undefined') return 'undefined';
    if (typeof row.actual === 'string') return JSON.stringify(row.actual);
    return jsLit(row.actual);
  }
  function evidenceScore(summary, dim) {
    var passed = 0, executed = 0;
    summary.rows.forEach(function (r) {
      if ((S.tagDimension[r.test.tag] || 'correctness') !== dim || r.status === 'not_run') return;
      executed++;
      if (r.status === 'pass') passed++;
    });
    return executed === 0 ? null : { score: Math.round(100 * passed / executed), passed: passed, executed: executed };
  }
  function entrySignature(ch) {
    var sig = str(ch.signature);
    var m = /^function\s+(.*?)\s*(?:->.*)?$/.exec(sig);
    return m ? m[1] : (ch.entry_function + '(' + (ch.param_names || []).join(', ') + ')');
  }

  function deterministicFeedback(ch, cr) {
    var runner = window.ChallengeRunner;
    var summary = runner.summarize(ch, cr);
    var det = { verdict: computeVerdict(cr, summary), summary: summary, headline: '', testsSummary: '', issues: [], strengths: [], nextSteps: [], question: null, cards: [], scores: {} };
    DIMS.forEach(function (d) {
      if (!EVIDENCE_DIMS[d]) return;
      var es = evidenceScore(summary, d);
      if (es) det.scores[d] = { score: es.score, justification: es.passed + ' of ' + es.executed + ' ' + (d === 'edge_cases' ? 'edge-case' : 'correctness') + ' tests pass.', source: 'tests', passed: es.passed, executed: es.executed };
    });
    if (!cr) {
      det.headline = "Your browser can't run the sandbox here; the AI can still review your code (unverified).";
      det.nextSteps = ['Get AI feedback to have your code reviewed without test results.'];
      return det;
    }
    var c = cr.compile;
    if (!c.ok) {
      if (c.error_kind === 'syntax') {
        det.headline = "Your code didn't parse.";
        det.issues.push({ title: 'Syntax error', explanation: c.error || 'The parser rejected the code.', severity: 'high', evidence: [{ kind: 'static', ref: 'S03' }], category: 'syntax' });
        det.nextSteps = ['Fix the syntax error first, then run the tests again.', 'Which line does the error message point to, and what does the parser expect there?'];
      } else {
        det.headline = 'Your code threw while loading.';
        det.issues.push({ title: 'Your code threw while loading: ' + (c.error || 'unknown error'), explanation: 'The sandbox runs your file once before the tests; that run threw.', severity: 'high', evidence: [{ kind: 'static', ref: 'S03' }], category: 'syntax' });
        det.nextSteps = ['Declare every name you use; the sandbox runs in strict mode.', 'Re-run the tests (Ctrl+Enter) after each change.'];
      }
      return det;
    }
    if (!c.entry_found) {
      det.headline = 'No function named ' + ch.entry_function + ' found.';
      det.issues.push({ title: 'No function named ' + ch.entry_function + ' found', explanation: 'Define ' + entrySignature(ch) + '; the tests call it by that exact name.', severity: 'high', evidence: [{ kind: 'static', ref: 'S01' }], category: 'syntax' });
      det.nextSteps = ['Keep the signature exactly as given: ' + entrySignature(ch) + '.', 'Re-run the tests (Ctrl+Enter) after each change.'];
      if (c.defined_functions.length) det.strengths.push('Found ' + c.defined_functions.length + ' ' + plural(c.defined_functions.length, 'function') + ' (' + c.defined_functions.slice(0, 4).join(', ') + '); the entry function is still missing.');
      return det;
    }
    det.testsSummary = summary.passed + ' of ' + summary.total + ' tests passed' + (summary.timed_out ? ', ' + summary.timed_out + ' timed out' : '') + (summary.errored ? ', ' + summary.errored + ' errored' : '') + (summary.not_run ? ', ' + summary.not_run + ' not run' : '');
    var cards = runner.localRetrieve(ch, cr);
    det.cards = cards;
    // Strengths: fully passing tag groups
    Object.keys(summary.by_tag).forEach(function (tag) {
      var g = summary.by_tag[tag];
      if (g.total > 0 && g.passed === g.total && det.strengths.length < 3) det.strengths.push('All ' + g.total + ' ' + tagLabel(tag) + ' ' + plural(g.total, 'test') + ' pass.');
    });
    if (det.strengths.length === 0 && summary.passed > 0) {
      var firstPass = summary.rows.filter(function (r) { return r.status === 'pass'; })[0];
      det.strengths.push(summary.passed + ' ' + plural(summary.passed, 'test') + ' pass, including ' + firstPass.id + ' (' + firstPass.test.name + ').');
    }
    if (det.strengths.length === 0 && c.defined_functions.length >= 2) det.strengths.push('You have the two-function structure in place; that is the right skeleton.');
    if (summary.passed === summary.total) {
      det.headline = 'All ' + summary.total + ' tests pass. Get AI feedback for a review of approach and code quality.';
      det.nextSteps = ['Get AI feedback for a review of approach and code quality.'];
      if (S.solutions && S.solutions[ch.id] && S.solutions[ch.id].stretch_goal) det.nextSteps.push('Stretch goal: ' + S.solutions[ch.id].stretch_goal);
      if (ch.next_challenge_id && S.byId[ch.next_challenge_id]) det.nextSteps.push('Move on to the ' + (S.byId[ch.next_challenge_id].difficulty_label || 'next') + ' challenge: ' + S.byId[ch.next_challenge_id].title + '.');
      return det;
    }
    var failing = summary.rows.filter(function (r) { return r.status === 'fail' || r.status === 'error' || r.status === 'timeout'; });
    var first = summary.first_failure;
    // Headline
    if (summary.errored > 0 && summary.errored === summary.executed) {
      det.headline = 'Every test threw an error: ' + (first.error || 'unknown error') + '.';
    } else if (summary.timed_out > 0) {
      det.headline = summary.timed_out + ' ' + plural(summary.timed_out, 'test') + ' never finished (usually an infinite loop); expand ' + summary.rows.filter(function (r) { return r.status === 'timeout'; })[0].id + ' to see the input.';
    } else {
      var tags = {};
      failing.forEach(function (r) { tags[r.test.tag] = (tags[r.test.tag] || 0) + 1; });
      var tagKeys = Object.keys(tags);
      var n = failing.length;
      det.headline = (tagKeys.length === 1
        ? n + ' ‘' + tagLabel(tagKeys[0]) + '’ ' + plural(n, 'test fails', 'tests fail')
        : n + ' of ' + summary.total + ' ' + plural(n, 'test fails', 'tests fail')) + '; expand the first one to see the input.';
    }
    // Issues
    // Every failing test came back undefined (spec 8.6 / QA 1: the starter passes cs-01 and returns undefined on the other 11).
    var allUndefined = failing.length > 0 && failing.every(function (r) { return r.status === 'fail' && r.actual_type === 'undefined'; });
    if (allUndefined) {
      var mr = cards.filter(function (k) { return k.card_id === 'missing_return'; })[0];
      det.issues.push({ title: "Your function doesn't return anything yet", explanation: (mr ? mr.card.symptom + ' ' : '') + 'Every executed test got undefined back.', severity: 'high', evidence: [{ kind: 'test', ref: first.id }], category: 'correctness' });
      det.question = mr ? mr.card.question : 'What does your function return on the last line when no earlier return fires?';
      det.nextSteps = ['Start with the base cases and make every branch return a value.', 'Re-run the tests (Ctrl+Enter) after each change.'];
      return det;
    }
    // Failing tests that resolve to the SAME misconception card become ONE issue (title and explanation once,
    // one evidence chip per test in catalog order); tests matching no card keep their own issue. Groups are
    // collected over every failing row before the max-4 cap so a card's chips are complete.
    var groups = [];
    var byCard = {};
    var timeoutGroup = null;
    failing.forEach(function (r) {
      var isCorrectness = S.tagDimension[r.test.tag] !== 'edge_cases';
      if (r.status === 'timeout') {
        if (!timeoutGroup) {
          timeoutGroup = { title: 'A test never finished (usually an infinite loop)', explanation: r.id + ' (' + r.test.name + ') produced no result within ' + (runner.PER_TEST_TIMEOUT_MS) + ' ms; the sandbox stopped it and continued.', severity: 'high', evidence: [], category: 'performance' };
          groups.push(timeoutGroup);
          if (!det.question) det.question = 'Which loop or call never stops for this input?';
        }
        timeoutGroup.evidence.push({ kind: 'test', ref: r.id });
        return;
      }
      var card = cards.filter(function (k) { return k.matched_by.indexOf(r.id) >= 0; })[0];
      if (card) {
        var g = byCard[card.card_id];
        if (!g) {
          g = { title: card.title, explanation: card.card.symptom, severity: null, evidence: [], category: null, correctness: false, error: null };
          byCard[card.card_id] = g;
          groups.push(g);
        }
        g.evidence.push({ kind: 'test', ref: r.id });
        if (isCorrectness) g.correctness = true;
        if (r.status === 'error') {
          g.severity = 'high';
          if (!g.error) g.error = 'Input ' + fmtArgs(r.test, ch) + ' threw: ' + (r.error || 'unknown error') + '.';
        }
        return;
      }
      if (r.status === 'error') {
        groups.push({ title: 'Error on ' + r.id, explanation: 'Input ' + fmtArgs(r.test, ch) + ' threw: ' + (r.error || 'unknown error') + '.', severity: 'high', evidence: [{ kind: 'test', ref: r.id }], category: 'edge_case' });
      } else {
        groups.push({ title: 'Wrong result on ' + r.id, explanation: 'Expected ' + jsLit(r.test.expected) + ', got ' + fmtActual(r) + ' for input ' + fmtArgs(r.test, ch) + '.', severity: null, evidence: [{ kind: 'test', ref: r.id }], category: isCorrectness ? 'correctness' : 'edge_case' });
      }
    });
    groups.slice(0, 4).forEach(function (g, i) {
      det.issues.push({
        title: g.title,
        explanation: g.explanation + (g.error ? ' ' + g.error : ''),
        severity: g.severity || (i === 0 ? 'high' : 'medium'),
        evidence: g.evidence.slice(0, MAX_ISSUE_CHIPS),
        category: g.category || (g.correctness ? 'correctness' : 'edge_case')
      });
    });
    if (!det.question && cards.length) det.question = cards[0].card.question;
    det.nextSteps = ['Expand ' + first.id + ' below and trace it by hand.', 'Re-run the tests (Ctrl+Enter) after each change.'];
    return det;
  }

  /* ---------- Rendering ---------- */

  function renderResults(result, opts) {
    var source = (opts && opts.source) || result.source || 'local';
    var sess = session(result.challenge.id);
    sess.lastRender = { result: result, source: source };
    show(dom.feedback);
    removeLegacyPre();
    var ev = (source === 'ai' && result.server) ? result.server.evaluation : null;
    renderSummary(result, source, ev);
    renderRubric(result, source, ev);
    renderTests(result);
    renderIssues(result, source, ev);
    renderStrengths(result, source, ev);
    renderGuardrails(result, source);
    renderNextSteps(result, source, ev);
    renderTutorHint(result, source, ev);
    if (source === 'legacy' && result.server && result.server.response) {
      var pre = el('pre', { 'class': 'legacy-feedback', 'data-legacy': '1' }, result.server.response);
      dom.feedback.appendChild(pre);
    }
    if (source !== 'local' || result.verdict === 'PASS' || result.deterministic.nextSteps.length) show(dom.followup);
    updateNextChallengeButton(result);
  }
  function removeLegacyPre() {
    var old = dom.feedback.querySelector('pre[data-legacy]');
    if (old) old.parentNode.removeChild(old);
  }

  function renderSummary(result, source, ev) {
    var det = result.deterministic;
    var overall = (source === 'ai' && result.server) ? result.server.overall : null;
    dom.summary.classList.toggle('is-local', source !== 'ai' || overall === null);
    dom.scoreValue.textContent = isInt(overall) ? String(overall) : '-';
    var verdict = result.verdict;
    if (source === 'ai' && result.server && result.server.verdict) verdict = result.server.verdict;
    var badge = VERDICT_BADGE[verdict] || VERDICT_BADGE.UNVERIFIED;
    dom.verdict.textContent = badge[0];
    dom.verdict.className = 'verdict-badge ' + badge[1];
    dom.headline.textContent = (ev && ev.summary) ? ev.summary : det.headline;
    dom.testsSummary.textContent = det.testsSummary;
    dom.progressNote.textContent = (ev && ev.progress_note) ? ev.progress_note : '';
  }

  function renderRubric(result, source, ev) {
    clear(dom.rubric);
    var det = result.deterministic;
    var degraded = source === 'ai' && result.server && result.server.ai && result.server.ai.degraded;
    DIMS.forEach(function (d) {
      var score = null, note = '', unassessed = false;
      var s = ev ? ev.scores[d] : null;
      if (s && isInt(s.score)) {
        score = s.score;
        note = s.justification || '';
        if (s.source === 'tests' && det.scores[d]) note = 'From ' + det.scores[d].passed + '/' + det.scores[d].executed + ' tests. ' + note;
        else if (s.source === 'heuristic') note = 'Rule-based. ' + note;
      } else if (EVIDENCE_DIMS[d] && det.scores[d]) {
        score = det.scores[d].score;
        note = 'From ' + det.scores[d].passed + '/' + det.scores[d].executed + ' tests.';
      } else {
        unassessed = true;
        note = EVIDENCE_DIMS[d] ? 'No tests ran' : (source === 'ai' ? (degraded ? 'Rule-based' : 'Not assessed') : 'Needs AI tutor');
      }
      var bar = el('div', { 'class': 'progress-bar' });
      bar.style.width = (score === null ? 0 : score) + '%';
      var meter = el('div', { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': score === null ? '0' : String(score), 'aria-label': DIM_LABELS[d] }, el('div', { 'class': 'progress-container mini' }, bar));
      dom.rubric.appendChild(el('li', { 'class': 'rubric-row' + (unassessed ? ' is-unassessed' : '') }, [
        el('span', null, DIM_LABELS[d]),
        meter,
        el('span', { 'class': 'rubric-score' }, score === null ? '–' : String(score)),
        el('span', { 'class': 'rubric-note' }, note)
      ]));
    });
  }

  function renderTests(result) {
    var ch = result.challenge;
    var summary = result.summary;
    clear(dom.testsBody);
    if (!result.clientResults) { hide(dom.testsPanel); return; }
    show(dom.testsPanel);
    var rows = summary.rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
      return (STATUS_ORDER[a.r.status] - STATUS_ORDER[b.r.status]) || (a.i - b.i);
    });
    rows.forEach(function (x) {
      var r = x.r;
      var detailId = 'test-detail-' + r.id;
      var btn = el('button', { type: 'button', 'class': 'template-btn test-details-btn', 'aria-expanded': 'false', 'aria-controls': detailId }, 'Details');
      var tr = el('tr', { 'class': 'test-row ' + (STATUS_CLASS[r.status] || ''), 'data-test-id': r.id }, [
        el('td', null, el('span', { 'class': 'test-status' }, STATUS_TEXT[r.status] || r.status)),
        el('td', null, [el('code', null, r.id), ' ', r.test.name]),
        el('td', null, el('span', { 'class': 'test-tag', 'data-tag': r.test.tag }, tagLabel(r.test.tag))),
        el('td', null, btn)
      ]);
      var io = el('div', { 'class': 'test-io' }, [
        el('span', null, 'Input'), el('span', null, fmtArgs(r.test, ch)),
        el('span', null, 'Expected'), el('span', null, jsLit(r.test.expected)),
        el('span', null, 'Actual'), el('span', null, fmtActual(r))
      ]);
      var detail = el('tr', { 'class': 'test-detail hidden', id: detailId }, el('td', { colspan: '4' }, [io, r.test.why ? el('p', { 'class': 'test-why' }, r.test.why) : null]));
      btn.addEventListener('click', function () { toggleTestDetail(r.id, null); });
      dom.testsBody.appendChild(tr);
      dom.testsBody.appendChild(detail);
    });
  }
  function toggleTestDetail(id, force) {
    var detail = $('test-detail-' + id);
    if (!detail) return false;
    var row = dom.testsBody.querySelector('.test-row[data-test-id="' + id + '"]');
    var btn = row ? row.querySelector('button') : null;
    var open = force === null || force === undefined ? detail.classList.contains('hidden') : !!force;
    if (open) show(detail); else hide(detail);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    return true;
  }
  function expandAndScroll(id) {
    if (!toggleTestDetail(id, true)) return;
    var row = dom.testsBody.querySelector('.test-row[data-test-id="' + id + '"]');
    if (row) { try { row.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' }); } catch (e) { /* ignore */ } }
  }
  function evidenceChip(ev, result) {
    var lc = lineCount(result.code);
    var failingSet = {};
    result.summary.failing_ids.forEach(function (id) { failingSet[id] = true; });
    var chip;
    if (ev.kind === 'test' && failingSet[ev.ref] && $('test-detail-' + ev.ref)) {
      chip = el('button', { type: 'button', 'class': 'evidence-chip', title: 'Show this test' }, ev.ref);
      chip.addEventListener('click', function () { expandAndScroll(ev.ref); });
      return chip;
    }
    if (ev.kind === 'line') {
      var m = /^(\d+)(?:-(\d+))?$/.exec(ev.ref);
      if (m) {
        var a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
        if (a >= 1 && a <= b && b <= lc) {
          chip = el('button', { type: 'button', 'class': 'evidence-chip', title: 'Select in the editor' }, 'line ' + ev.ref);
          chip.addEventListener('click', function () { selectEditorLine(a, b); });
          return chip;
        }
      }
      return el('span', { 'class': 'evidence-chip is-plain' }, 'line ' + ev.ref);
    }
    if (ev.kind === 'static') return el('span', { 'class': 'evidence-chip is-plain' }, 'check ' + ev.ref);
    return el('span', { 'class': 'evidence-chip is-plain' }, ev.ref);
  }

  function renderIssues(result, source, ev) {
    clear(dom.issuesList);
    var det = result.deterministic;
    var issues = (ev && ev.issues) ? ev.issues : det.issues;
    var verdict = (source === 'ai' && result.server && result.server.verdict) ? result.server.verdict : result.verdict;
    if (!issues.length) {
      var empty = verdict === 'PASS' ? 'Nothing blocking; the review is about approach and quality.' : (result.clientResults ? 'No specific issue was identified; expand the failing tests above.' : 'Run the tests to find out what is getting in the way.');
      dom.issuesList.appendChild(el('li', { 'class': 'issue-item is-empty' }, empty));
      return;
    }
    issues.slice(0, 4).forEach(function (it, i) {
      var li = el('li', { 'class': 'issue-item' }, [
        el('span', { 'class': 'issue-severity', 'data-severity': it.severity, title: it.severity + ' severity' }),
        el('span', { 'class': 'issue-title' }, it.title),
        it.explanation ? el('p', { 'class': 'issue-explanation' }, renderInline(it.explanation)) : null,
        (it.evidence || []).map(function (e) { return evidenceChip(e, result); })
      ]);
      if (i === 0 && !ev && det.question) li.appendChild(el('p', { 'class': 'issue-question' }, 'Ask yourself: ' + det.question));
      dom.issuesList.appendChild(li);
    });
  }

  function renderStrengths(result, source, ev) {
    clear(dom.strengthsList);
    var items = (ev && ev.strengths && ev.strengths.length) ? ev.strengths : result.deterministic.strengths;
    if (!items.length) { dom.strengthsList.appendChild(el('li', null, 'Nothing to show yet; a passing test will appear here.')); return; }
    items.slice(0, 3).forEach(function (s) { dom.strengthsList.appendChild(el('li', null, renderInline(s))); });
  }

  var ADJUST_REASONS = {
    'set from test evidence': 'from the test results', 'capped: core test failed': 'because a core test failed',
    'capped: fewer than half the tests pass': 'because fewer than half the tests pass', 'capped: timeout': 'because a test timed out',
    'floor: all tests pass': 'because all tests pass', 'capped: hardcoded tests': 'because the code hardcodes the tests',
    'capped: code did not run': 'because the code did not run', 'capped: unverified': 'because the tests were not run'
  };
  var HINT_REASONS = { leak: 'it quoted the reference solution', level: 'it was not at the allowed level', code: 'it contained code', empty: 'it was empty' };
  var FLAG_TEXT = {
    hardcoded_tests: 'The code matches the test inputs instead of implementing the algorithm; correctness was capped.',
    instructions_in_code: 'A comment addressed to the tutor was ignored.', off_topic_code: 'The code does not address this challenge.'
  };
  function renderGuardrails(result, source) {
    clear(dom.guardrailsList);
    var g = (source === 'ai' && result.server && result.server.pipeline) ? result.server.pipeline.guardrails : null;
    var lines = [];
    if (g) {
      g.scores_adjusted.forEach(function (a) {
        if (a.to === null) return;
        lines.push((DIM_LABELS[a.dim] || a.dim) + ' set to ' + a.to + ' ' + (ADJUST_REASONS[a.reason] || '(' + a.reason + ')') + (a.from !== null ? ' (the model said ' + a.from + ')' : '') + '.');
      });
      if (g.verdict_overridden) lines.push('Verdict set to ' + (result.server.verdict || result.verdict) + ' from the test results' + (g.verdict_model ? ' (the model said ' + g.verdict_model + ')' : '') + '.');
      if (g.issues_dropped > 0) lines.push(g.issues_dropped + ' ' + plural(g.issues_dropped, 'claim') + ' removed because ' + (g.issues_dropped > 1 ? 'they' : 'it') + " cited a passing test or a line that doesn't exist.");
      if (g.hint_replaced) lines.push('Hint replaced: ' + (HINT_REASONS[g.hint_replaced_reason] || g.hint_replaced_reason || 'it did not pass the checks') + '.');
      if (g.leaks_redacted > 0) lines.push(g.leaks_redacted + ' ' + plural(g.leaks_redacted, 'sentence') + ' withheld because ' + (g.leaks_redacted > 1 ? 'they' : 'it') + ' quoted the solution.');
      g.flags.forEach(function (f) { lines.push(FLAG_TEXT[f] || 'Flag: ' + f); });
    }
    if (!lines.length) { hide(dom.guardrailsPanel); return; }
    lines.forEach(function (t) { dom.guardrailsList.appendChild(el('li', null, t)); });
    show(dom.guardrailsPanel);
  }

  function renderNextSteps(result, source, ev) {
    clear(dom.nextList);
    var ch = result.challenge;
    var steps = (ev && ev.what_to_try_next && ev.what_to_try_next.length) ? ev.what_to_try_next.slice() : result.deterministic.nextSteps.slice();
    var verdict = (source === 'ai' && result.server && result.server.verdict) ? result.server.verdict : result.verdict;
    if (ev && verdict === 'PASS') {
      if (S.solutions && S.solutions[ch.id] && S.solutions[ch.id].stretch_goal) steps.push('Stretch goal: ' + S.solutions[ch.id].stretch_goal);
    }
    if (ev && ev.encouragement) steps.push(ev.encouragement);
    if (ev && ev.complexity && (ev.complexity.time || ev.complexity.space)) steps.push('Complexity as written: ' + (ev.complexity.time || '?') + ' time, ' + (ev.complexity.space || '?') + ' space' + (ev.complexity.note ? ' (' + ev.complexity.note + ')' : '') + '.');
    if (!steps.length) steps.push('Run the tests, then get AI feedback for a review.');
    steps.slice(0, 5).forEach(function (s) { dom.nextList.appendChild(el('li', null, renderInline(s))); });
    if (verdict === 'PASS' && canVisualize(session(ch.id))) {
      var chip = el('button', { type: 'button', 'class': 'evidence-chip viz-chip', title: 'Replays your code step by step on one test input' }, 'Watch your solution run');
      chip.addEventListener('click', openViz);
      dom.nextList.appendChild(el('li', null, ['See it in action: ', chip]));
    }
  }
  function updateNextChallengeButton(result) {
    var ch = result.challenge;
    var st = readState(ch.id);
    var next = ch.next_challenge_id ? S.byId[ch.next_challenge_id] : null;
    if (st.solved && next) {
      dom.nextChallengeBtn.textContent = 'Go to the ' + (next.difficulty_label || 'next') + ' challenge';
      show(dom.nextChallengeBtn);
    } else hide(dom.nextChallengeBtn);
  }
  function goToNextChallenge() {
    if (!S.current || !S.current.next_challenge_id || !S.byId[S.current.next_challenge_id]) return;
    var id = S.current.next_challenge_id;
    selectChallenge(id);
    var tab = $('tab-' + id);
    if (tab) tab.focus();
    try { dom.tabs.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
  }

  function renderTutorHint(result, source, ev) {
    if (!dom.hintTutor) return;
    if (source === 'ai' && ev && ev.next_hint) {
      dom.hintTutorText.textContent = ev.next_hint.text;
      dom.hintQuestion.textContent = ev.next_hint.socratic_question || '';
      if (dom.hintSource) dom.hintSource.textContent = 'From the tutor' + (ev.next_hint.source !== 'judge' ? ' (rule-based)' : '') + ' · ' + ev.next_hint.level.replace('_', ' ');
      show(dom.hintTutor);
    } else {
      hide(dom.hintTutor);
      dom.hintTutorText.textContent = '';
      dom.hintQuestion.textContent = '';
    }
  }

  /* ---------- Hint ladder, solution lock ---------- */

  function ladderHints(ch) {
    return (Array.isArray(ch.hints) ? ch.hints : []).filter(function (h) { return isObj(h) && isInt(h.level); }).sort(function (a, b) { return a.level - b.level; });
  }
  function renderHintCard() {
    var ch = S.current;
    if (!ch || !dom.hintCard) return;
    var st = readState(ch.id);
    var hints = ladderHints(ch);
    var maxRevealable = Math.min(MAX_HINTS, hints.length, st.attempts + 1);
    var revealed = Math.min(st.hintsRevealed, hints.length);
    clear(dom.hintLadderText);
    clear(dom.hintEarlierList);
    if (revealed === 0) {
      dom.hintLadderText.appendChild(document.createTextNode('Stuck? Run the tests first, then reveal a hint here.'));
      hide(dom.hintEarlier);
    } else {
      var top = hints[revealed - 1];
      dom.hintLadderText.appendChild(el('strong', null, 'Hint ' + top.level + (top.title ? ' (' + top.title + '): ' : ': ')));
      appendChildren(dom.hintLadderText, renderInline(top.text));
      if (revealed > 1) {
        hints.slice(0, revealed - 1).forEach(function (h) { dom.hintEarlierList.appendChild(el('li', null, [el('strong', null, 'Hint ' + h.level + (h.title ? ' (' + h.title + '): ' : ': ')), renderInline(h.text)])); });
        show(dom.hintEarlier);
      } else hide(dom.hintEarlier);
    }
    if (revealed >= MAX_HINTS || revealed >= hints.length) {
      dom.revealBtn.textContent = 'All hints revealed';
      dom.revealBtn.disabled = true;
      dom.revealBtn.removeAttribute('title');
    } else {
      dom.revealBtn.textContent = 'Reveal hint ' + (revealed + 1) + ' of ' + MAX_HINTS;
      var locked = revealed >= maxRevealable;
      dom.revealBtn.disabled = locked;
      if (locked) dom.revealBtn.setAttribute('title', 'Run the tests with a change first to unlock the next hint.');
      else dom.revealBtn.removeAttribute('title');
    }
    dom.hintCounter.textContent = 'Hints revealed: ' + revealed + '/' + MAX_HINTS + (revealed < MAX_HINTS && revealed >= maxRevealable ? ' · next hint unlocks after your next attempt' : '');
  }
  function revealNextHint() {
    var ch = S.current;
    if (!ch) return;
    var st = readState(ch.id);
    var hints = ladderHints(ch);
    var maxRevealable = Math.min(MAX_HINTS, hints.length, st.attempts + 1);
    if (st.hintsRevealed >= maxRevealable) { renderHintCard(); return; }
    st = writeState(ch.id, { hintsRevealed: st.hintsRevealed + 1 });
    renderHintCard();
    updateStatusLine();
    updateTabBadges();
    announce('Hint ' + st.hintsRevealed + ' of ' + MAX_HINTS + ' revealed.');
  }

  /* The lock below is a pedagogical nudge, not a security control: the solutions file is public. */
  function solutionUnlocked(st) { return !!(st.solved || st.attempts >= 4 || st.gaveUp); }
  function updateSolutionLock() {
    var ch = S.current;
    if (!ch || !dom.solutionLock) return;
    var st = readState(ch.id);
    if (solutionUnlocked(st)) {
      hide(dom.solutionLock);
      show(dom.solutionDetails);            // collapsed; opening it (the toggle listener) fetches and reveals
    } else {
      show(dom.solutionLock);
      hide(dom.solutionDetails);
      dom.solutionDetails.open = false;
      var remaining = Math.max(0, 4 - st.attempts);
      dom.solutionLockText.textContent = 'Reference solution unlocks when all tests pass or after 4 attempts (you’ve made ' + st.attempts + ').';
      if (st.attempts >= 2) show(dom.giveUpBtn); else hide(dom.giveUpBtn);
      if (remaining === 0) show(dom.giveUpBtn);
    }
  }
  function giveUp() {
    var ch = S.current;
    if (!ch) return;
    if (!window.confirm('Reveal the reference solution? This is recorded and the tutor will know.')) return;
    var st = readState(ch.id);
    writeState(ch.id, { gaveUp: true, gaveUpAtAttempt: st.attempts });
    updateSolutionLock();
    dom.solutionDetails.open = true;      // the (async) toggle event calls revealSolution()
    updateStatusLine();
    updateTabBadges();
  }
  function loadSolutions() {
    if (S.solutions) return Promise.resolve(S.solutions);
    if (S.solutionsPromise) return S.solutionsPromise;
    S.solutionsPromise = fetch(SOLUTIONS_URL, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      if (!isObj(data) || !isObj(data.solutions)) throw new Error('bad solutions file');
      S.solutions = data.solutions;
      return S.solutions;
    }).catch(function (err) { S.solutionsPromise = null; throw err; });
    return S.solutionsPromise;
  }
  function revealSolution() {
    var ch = S.current;
    if (!ch) return;
    var st = readState(ch.id);
    if (!solutionUnlocked(st)) { dom.solutionDetails.open = false; return; }
    var first = !st.solutionRevealed;
    writeState(ch.id, { solutionRevealed: true });
    updateStatusLine();
    updateTabBadges();
    if (first) announce('Reference solution revealed.');
    dom.solutionCode.textContent = 'Loading the reference solution...';
    loadSolutions().then(function (sols) {
      if (S.current !== ch) return;
      var sol = sols[ch.id];
      if (!isObj(sol)) throw new Error('no solution for ' + ch.id);
      dom.solutionCode.textContent = str(sol.reference_solution);
      clear(dom.solutionNotes);
      (Array.isArray(sol.solution_notes) ? sol.solution_notes : []).forEach(function (n) { dom.solutionNotes.appendChild(el('li', null, renderInline(n))); });
      dom.solutionStretch.textContent = sol.stretch_goal ? 'Stretch goal: ' + sol.stretch_goal : '';
      dom.loadSolutionBtn.disabled = false;
    }).catch(function () {
      if (S.current !== ch) return;
      dom.solutionCode.textContent = "Couldn't load the reference solution. Reload the page.";
      dom.loadSolutionBtn.disabled = true;
    });
  }
  function loadSolutionIntoEditor() {
    var ch = S.current;
    if (!ch || !S.solutions || !S.solutions[ch.id]) return;
    if (!window.confirm('Replace your code with the reference solution?')) return;
    setCode(str(S.solutions[ch.id].reference_solution));
    dom.editor.focus();
  }

  /* ---------- Status line, tab badges ---------- */

  function updateStatusLine() {
    var ch = S.current;
    if (!ch || !dom.statusLine) return;
    var st = readState(ch.id);
    var parts = [];
    if (st.solved) {
      parts.push('Solved on attempt ' + (st.solvedAtAttempt !== null ? st.solvedAtAttempt : st.attempts));
      if (st.bestScore !== null) parts.push('Best score ' + st.bestScore);
      parts.push('Hints: ' + st.hintsRevealed + '/' + MAX_HINTS);
      if (st.solutionRevealed) parts.push(st.gaveUp ? 'Viewed solution (gave up on attempt ' + st.gaveUpAtAttempt + ')' : 'Viewed solution');
    } else if (st.attempts === 0 && !st.gaveUp && !st.solutionRevealed) {
      parts.push('Not started yet.');
    } else {
      parts.push('Attempt ' + st.attempts);
      if (st.totalTests) parts.push('Best: ' + st.bestPassed + '/' + st.totalTests + ' tests');
      if (st.bestScore !== null) parts.push('Score ' + st.bestScore);
      parts.push('Hints: ' + st.hintsRevealed + '/' + MAX_HINTS);
      if (st.solutionRevealed || st.gaveUp) parts.push(st.gaveUp ? 'Viewed solution (gave up on attempt ' + st.gaveUpAtAttempt + ')' : 'Viewed solution');
      else if (solutionUnlocked(st)) parts.push('Solution unlocked');
      else { var more = 4 - st.attempts; parts.push('Solution locked (' + more + ' more ' + plural(more, 'attempt') + ')'); }
    }
    var text = parts.join(' · ');
    if (!S.storageOk) text += " (progress isn't being saved in this browser)";
    dom.statusLine.textContent = text;
  }
  function updateTabBadges() {
    tabButtons().forEach(function (btn) {
      var id = btn.getAttribute('data-challenge-id');
      var badge = btn.querySelector('.tab-status');
      if (!badge || !S.byId[id]) return;
      var st = readState(id);
      var status = 'new', text = '';
      if (st.solved) { status = 'solved'; text = st.solutionRevealed ? 'Solved (after viewing solution)' : 'Solved'; }
      else if (st.solutionRevealed || st.gaveUp) { status = 'revealed'; text = 'Solution viewed'; }
      else if (st.attempts > 0) { status = 'progress'; text = st.attempts + ' ' + plural(st.attempts, 'try', 'tries'); }
      if (status !== 'new' && st.hintsRevealed > 0) text += ' · Hints: ' + st.hintsRevealed + '/' + MAX_HINTS;
      badge.setAttribute('data-status', status);
      badge.textContent = text;
    });
  }

  /* ---------- Ask the tutor (addendum B1-B6) ---------- */

  function tutorVisible() { return !!S.health; }
  function tutorConfigured() { return !!(S.health && S.health.followup === true && S.health.ai_configured !== false); }
  function tutorRemaining() { return S.current ? readState(S.current.id).tutorRemaining : TUTOR_BUDGET; }
  function setTutorAvailability() {
    if (!dom.tutor) return;
    var remaining = tutorRemaining();
    var sess = S.current ? session(S.current.id) : null;
    var pending = !!(sess && sess.tutor.pending);
    var enabled = tutorVisible() && tutorConfigured() && !!S.current && remaining > 0 && !pending;
    var title = '';
    if (S.healthPending && !S.health) title = 'Checking the tutor server...';
    else if (!tutorConfigured()) title = 'AI tutor not configured on this server.';
    else if (remaining <= 0) title = TUTOR_EXHAUSTED_TITLE;
    dom.tutorRemaining.textContent = remaining + ' left';
    if (tutorConfigured()) show(dom.tutorRemaining); else hide(dom.tutorRemaining);   // no budget pill next to "not configured"
    if (S.health && !tutorConfigured()) show(dom.tutorUnavailable); else hide(dom.tutorUnavailable);
    [dom.tutorInput, dom.tutorStuck, dom.tutorSend].concat(dom.quickButtons).forEach(function (c) {
      if (!c) return;
      c.disabled = !enabled;
      if (title) c.setAttribute('title', title); else c.removeAttribute('title');
    });
    if (dom.popoverBtn) dom.popoverBtn.disabled = !(tutorVisible() && tutorConfigured());
    if (dom.vizExplain) {                     // "Explain this step": only when the tutor is available, needs a loaded step
      if (tutorVisible() && tutorConfigured()) show(dom.vizExplain); else hide(dom.vizExplain);
      var cur = (S.viz.open && S.viz.player) ? S.viz.player.current() : null;
      disableKeepingFocus(dom.vizExplain, !(enabled && cur && cur.step));
      var vt = title || (S.viz.pending ? 'Tracing your code...' : (!cur ? 'Replay a step first.' : 'Asks the AI tutor about this step (uses one tutor question)'));
      dom.vizExplain.setAttribute('title', vt);
    }
  }
  function renderTutorThread() {
    if (!dom.tutorThread) return;
    clear(dom.tutorThread);
    var sess = S.current ? session(S.current.id) : null;
    var thread = sess ? sess.tutor.thread : [];
    thread.forEach(function (t) {
      if (t.role === 'you') {
        var li = el('li', { 'class': 'tutor-turn you' }, t.text);
        if (t.selection) {
          li.appendChild(el('pre', { 'class': 'tutor-snippet' }, t.selection.text));
          li.appendChild(el('span', { 'class': 'tutor-snippet-lines' }, lineLabel(t.selection)));
        }
        dom.tutorThread.appendChild(li);
      } else if (t.role === 'tutor') {
        dom.tutorThread.appendChild(el('li', { 'class': 'tutor-turn tutor' }, [
          el('p', null, renderInline(t.text)),
          t.question ? el('p', { 'class': 'hint-question' }, t.question) : null,
          t.level ? el('span', { 'class': 'tutor-level' }, t.level.replace('_', ' ')) : null,
          t.redirected ? el('span', { 'class': 'tutor-redirected' }, '(redirected)') : null,
          t.degraded ? el('span', { 'class': 'tutor-redirected' }, '(rule-based answer)') : null
        ]));
      } else if (t.role === 'error') {
        dom.tutorThread.appendChild(el('li', { 'class': 'tutor-turn tutor tutor-error', role: 'alert' }, el('p', null, t.text)));
      }
    });
    if (sess && sess.tutor.pending) {
      dom.tutorThread.appendChild(el('li', { 'class': 'tutor-pending', 'aria-label': 'The tutor is thinking' }, [el('span', { 'class': 'dot' }), el('span', { 'class': 'dot' }), el('span', { 'class': 'dot' })]));
    }
    if (thread.length || (sess && sess.tutor.pending)) hide(dom.tutorEmpty); else show(dom.tutorEmpty);
    dom.tutorThread.scrollTop = dom.tutorThread.scrollHeight;
  }
  function sendTutorQuestion() {
    if (!dom.tutorInput || dom.tutorInput.disabled) return;
    askTutor(dom.tutorInput.value, dom.tutorStuck && dom.tutorStuck.checked, 'question', S.pendingSelection);
  }
  /* extra (optional): { step: {index, total, caption, call, stack, returned}, code, onStart, onDone } for mode
     explain_step, where the step, the selection and client_results all refer to the code of the traced run
     (addendum 2, section 3/4); onStart() fires when the request is sent, onDone(lastTurn, remaining) when the
     answer or the error turn has been added to the thread. */
  function buildTutorBody(mode, question, selection, extra) {
    var ch = S.current;
    var st = readState(ch.id);
    var sess = session(ch.id);
    var body = {
      challenge_id: ch.id,
      code: (extra && typeof extra.code === 'string') ? extra.code : getCode(),
      attempt: Math.max(1, st.attempts),
      hints_used: hintsUsed(st),
      mode: mode,
      client_results: sess.clientResults || null,
      evaluation: (sess.aiResult && sess.aiResult.evaluationRaw) ? sess.aiResult.evaluationRaw : null,
      history: sess.tutor.history.slice(-3),
      stuck: false
    };
    if (mode === 'question') body.question = question;
    if (selection) body.selection = { start_line: selection.start_line, end_line: selection.end_line, text: String(selection.text || '').slice(0, 2000) };
    if (extra && isObj(extra.step)) body.step = extra.step;
    return body;
  }
  function askTutor(question, stuck, mode, selection, extra) {
    mode = TUTOR_MODES.indexOf(mode) >= 0 ? mode : 'question';
    var ch = S.current;
    if (!ch || !tutorVisible() || !tutorConfigured()) return Promise.resolve(null);
    var sess = session(ch.id);
    if (sess.tutor.pending) return Promise.resolve(null);
    var st = readState(ch.id);
    if (st.tutorRemaining <= 0) { setTutorAvailability(); return Promise.resolve(null); }
    var youText;
    if (mode === 'question') {
      question = String(question || '').trim();
      if (question.length < 3) { pushTutorError('Ask a question of at least 3 characters.'); return Promise.resolve(null); }
      if (question.length > 500) question = question.slice(0, 500);
      youText = question;
    } else if (mode === 'explain_step') {
      if (!extra || !isObj(extra.step)) return Promise.resolve(null);
      question = '';
      youText = 'Explain step ' + extra.step.index + ' of ' + extra.step.total;
    } else {
      question = '';
      youText = QUICK_LABELS[mode] || mode;
    }
    flushDraft();
    dropTutorErrors(sess);
    sess.tutor.thread.push({ role: 'you', text: youText, selection: selection ? { start_line: selection.start_line, end_line: selection.end_line, text: String(selection.text || '').slice(0, 2000) } : null });
    sess.tutor.pending = true;
    if (extra && typeof extra.onStart === 'function') extra.onStart();
    var body = buildTutorBody(mode, question, selection, extra);
    body.stuck = !!stuck;
    if (mode === 'question') dom.tutorInput.value = '';
    S.pendingSelection = null;
    updateTutorContext();
    renderTutorThread();
    setTutorAvailability();
    return fetchJson(apiBase() + '/evaluate-challenge/tutor', { method: 'POST', body: body }, TUTOR_REQUEST_TIMEOUT_MS).then(function (r) {
      sess.tutor.pending = false;
      var j = r.json;
      if (r.ok && isObj(j) && j.ok === true && typeof j.answer === 'string' && j.answer.trim()) {
        var ans = {
          role: 'tutor', text: j.answer.slice(0, 900), level: HINT_LEVELS.indexOf(j.hint_level) >= 0 ? j.hint_level : '',
          question: str(j.socratic_question, 300), redirected: j.redirected === true, degraded: !!(isObj(j.ai) && j.ai.degraded === true)
        };
        sess.tutor.thread.push(ans);
        sess.tutor.history.push({ question: youText.slice(0, 600), answer: ans.text.slice(0, 600) });
        if (sess.tutor.history.length > 3) sess.tutor.history = sess.tutor.history.slice(-3);
        var cur = readState(ch.id);
        writeState(ch.id, { tutorRemaining: Math.max(0, cur.tutorRemaining - 1) });
        announce('The tutor answered.');
      } else {
        var msg = "The tutor didn't answer; try again.";
        if (r.status === 429) {
          var ra = (isObj(j) && isInt(j.retry_after)) ? j.retry_after : 30;
          msg = 'The tutor is busy; try again in ' + ra + 's.';
        } else if (isObj(j) && isObj(j.error) && typeof j.error.message === 'string') {
          msg = "The tutor didn't answer: " + j.error.message;
        } else if (r.aborted) {
          msg = 'The tutor took too long to answer; try again.';
        }
        sess.tutor.thread.push({ role: 'error', text: msg });
      }
      if (S.current === ch) {
        renderTutorThread();
        setTutorAvailability();
        if (mode === 'question' && dom.tutorInput && !dom.tutorInput.disabled) dom.tutorInput.focus();
        if (extra && typeof extra.onDone === 'function') extra.onDone(sess.tutor.thread[sess.tutor.thread.length - 1], readState(ch.id).tutorRemaining);
      }
      return j;
    });
  }
  function pushTutorError(text) {
    if (!S.current) return;
    var sess = session(S.current.id);
    dropTutorErrors(sess);
    sess.tutor.thread.push({ role: 'error', text: text });
    renderTutorThread();
  }
  function dropTutorErrors(sess) {
    sess.tutor.thread = sess.tutor.thread.filter(function (t) { return t.role !== 'error'; });
  }

  /* ---------- Visualize my solution (addendum 2, section 3) ---------- */

  function vizSupported() {
    return !!(window.ChallengeViz && typeof window.ChallengeViz.mount === 'function' && window.ChallengeRunner && typeof window.ChallengeRunner.trace === 'function' && dom.vizPanel);
  }
  /* Disables a panel control without dropping keyboard focus to <body>: focus moves to the panel first, where the
     replay shortcuts keep working (ChallengeViz does the same for the playback controls). */
  function disableKeepingFocus(node, flag) {
    if (!node) return;
    flag = !!flag;
    if (flag && !node.disabled && document.activeElement === node && dom.vizPanel) {
      try { dom.vizPanel.focus({ preventScroll: true }); } catch (e) { try { dom.vizPanel.focus(); } catch (e2) { /* ignore */ } }
    }
    node.disabled = flag;
  }
  /* The trees of a test input for a trace that carries no node metadata (the worker posts its nodes with the final
     message, so a timed-out run has none): built from the test args with the worker's level-order convention. */
  function nodesFromArgs(ch, test) {
    var nodes = { main: [], sub: [] };
    var slots = ['main', 'sub'];
    var args = Array.isArray(test.args) ? test.args : [];
    var k = 0;
    if (!window.ChallengeViz || typeof window.ChallengeViz.levelOrderNodes !== 'function') return nodes;
    (Array.isArray(ch.arg_types) ? ch.arg_types : []).forEach(function (ty, i) {
      if (ty !== 'tree') return;
      if (k < slots.length) nodes[slots[k]] = window.ChallengeViz.levelOrderNodes(args[i]);
      k++;
    });
    return nodes;
  }
  /* The latest local run compiled and defined the entry function. */
  function canVisualize(sess) {
    var lr = sess && sess.localResult;
    var c = lr && lr.clientResults ? lr.clientResults.compile : null;
    return !!(vizSupported() && c && c.ok === true && c.entry_found === true);
  }
  function updateVizButton(busy) {
    if (!dom.vizBtn) return;
    var sess = S.current ? session(S.current.id) : null;
    dom.vizBtn.disabled = !!busy || S.loadError || S.phase === 'running_local' || S.phase === 'requesting_ai' || !canVisualize(sess);
  }
  function nodeCount(arr) {
    return Array.isArray(arr) ? arr.filter(function (x) { return x !== null && x !== undefined; }).length : 0;
  }
  function testNodeCount(ch, t) {
    var n = 0;
    var args = Array.isArray(t.args) ? t.args : [];
    (Array.isArray(ch.arg_types) ? ch.arg_types : []).forEach(function (ty, i) { if (ty === 'tree') n += nodeCount(args[i]); });
    return n;
  }
  function vizTests(ch) {
    return (Array.isArray(ch.tests) ? ch.tests : []).filter(function (t) { return isObj(t) && typeof t.id === 'string' && testNodeCount(ch, t) <= VIZ_MAX_NODES; });
  }
  function vizTestById(ch, id) {
    return vizTests(ch).filter(function (t) { return t.id === id; })[0] || null;
  }
  function treesNonEmpty(ch, t) {
    var args = Array.isArray(t.args) ? t.args : [];
    return (Array.isArray(ch.arg_types) ? ch.arg_types : []).every(function (ty, i) { return ty !== 'tree' || nodeCount(args[i]) > 0; });
  }
  /* The default replay input when no small test fails: the first small test with at least VIZ_MIN_DEFAULT_NODES
     nodes and no empty tree, preferring one named after a page example (cs-04 / fz-03 / mr-03), so a passing
     solution is not replayed on the two-step "empty pattern" test. */
  function preferredVizTest(ch, tests) {
    var cands = tests.filter(function (t) { return testNodeCount(ch, t) >= VIZ_MIN_DEFAULT_NODES && treesNonEmpty(ch, t); });
    var example = cands.filter(function (t) { return /example/i.test(String(t.name || '')); })[0];
    return example || cands[0] || null;
  }
  /* Fills the picker; returns the default test id: keepId when still listed, else the first failing small test,
     else preferredVizTest(), else the first small test. */
  function fillVizPicker(ch, localResult, keepId) {
    if (!dom.vizSelect) return null;
    var status = {};
    if (localResult && localResult.summary) localResult.summary.rows.forEach(function (r) { status[r.id] = r.status; });
    var failing = function (id) { return status[id] === 'fail' || status[id] === 'error' || status[id] === 'timeout'; };
    clear(dom.vizSelect);
    var tests = vizTests(ch);
    var first = null, firstFailing = null;
    tests.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.id + ' \u00b7 ' + (t.name || '') + (failing(t.id) ? ' (failing)' : '');
      dom.vizSelect.appendChild(opt);
      if (!first) first = t.id;
      if (!firstFailing && failing(t.id)) firstFailing = t.id;
    });
    var preferred = firstFailing ? null : preferredVizTest(ch, tests);
    var chosen = (keepId && tests.some(function (t) { return t.id === keepId; })) ? keepId : (firstFailing || (preferred && preferred.id) || first);
    if (chosen) dom.vizSelect.value = chosen;
    dom.vizSelect.disabled = tests.length === 0;
    return chosen;
  }
  function ensurePlayer() {
    if (!S.viz.player && vizSupported()) S.viz.player = window.ChallengeViz.mount({ panel: dom.vizPanel, onStep: function () { setTutorAvailability(); } });
    return S.viz.player;
  }
  function openViz() {
    var ch = S.current;
    if (!ch || !dom.vizPanel) return;
    var sess = session(ch.id);
    if (!canVisualize(sess) || !ensurePlayer()) return;
    var def = fillVizPicker(ch, sess.localResult, S.viz.challengeId === ch.id ? S.viz.testId : null);
    S.viz.open = true;
    S.viz.challengeId = ch.id;
    show(dom.vizPanel);
    if (def) runViz(def);
    else { S.viz.player.setLoading('No small test input is available for this challenge.'); }
    try { dom.vizPanel.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
    try { dom.vizPanel.focus({ preventScroll: true }); } catch (e) { try { dom.vizPanel.focus(); } catch (e2) { /* ignore */ } }
  }
  /* closeViz(restoreFocus): hides the panel. Keyboard focus never silently drops to <body>: when the learner closed
     the panel themselves (Close button, Escape: restoreFocus === true) or focus was anywhere inside the panel
     (a tab switch, a run that no longer compiles), it returns to "Visualize my solution" when that button is
     enabled, else to "Run tests". Focus that was already elsewhere (the tab strip, the editor) is left alone. */
  function closeViz(restoreFocus) {
    if (!S.viz.open) return;
    var active = document.activeElement;
    var inside = !!(active && dom.vizPanel && dom.vizPanel.contains(active));
    S.viz.open = false;
    S.viz.token++;
    S.viz.pending = false;
    S.viz.trace = null;
    if (S.viz.player) S.viz.player.unload();
    renderExplainAnswer(null);
    dom.vizPanel.removeAttribute('aria-busy');
    hide(dom.vizPanel);
    setTutorAvailability();
    if (restoreFocus === true || inside) focusAfterViz();
  }
  function focusAfterViz() {
    var target = (dom.vizBtn && !dom.vizBtn.disabled) ? dom.vizBtn : dom.runBtn;
    if (!target) return;
    try { target.focus(); } catch (e) { /* ignore */ }
  }
  /* The editor no longer holds the replayed code: say so under the slider (cleared when the two match again or
     by the next trace, which computes its own stale note). */
  function syncVizStale() {
    if (!S.viz.open || !S.viz.player || typeof S.viz.code !== 'string' || S.viz.pending) return;
    S.viz.player.setStale(getCode() !== S.viz.code ? VIZ_STALE_ON_EDIT : '');
  }
  /* After a new local run: re-trace the same input on the new code, or close when the code no longer loads. */
  function refreshViz(ch) {
    updateVizButton();
    if (!S.viz.open) { S.viz.testId = null; return; }        // a closed panel reopens on the spec default after new code ran
    if (S.current !== ch) return;
    var sess = session(ch.id);
    if (!canVisualize(sess)) { closeViz(); return; }
    var id = fillVizPicker(ch, sess.localResult, S.viz.testId);
    if (id) runViz(id); else S.viz.player.setLoading('No small test input is available for this challenge.');
  }
  function runViz(testId) {
    var ch = S.current;
    var player = S.viz.player;
    if (!ch || !player || !S.viz.open) return Promise.resolve(null);
    var sess = session(ch.id);
    var lr = sess.localResult;
    var test = vizTestById(ch, testId);
    if (!lr || !test) return Promise.resolve(null);
    var token = ++S.viz.token;
    S.viz.testId = test.id;
    S.viz.code = lr.code;
    S.viz.pending = true;
    // The picker stays enabled while the trace runs (disabling the focused element drops keyboard focus to <body>);
    // a change during a trace simply starts a newer one and the token above discards the older result.
    if (dom.vizSelect) dom.vizSelect.value = test.id;
    dom.vizPanel.setAttribute('aria-busy', 'true');
    renderExplainAnswer(null);
    player.setLoading('Tracing your code on ' + test.id + '...');
    setTutorAvailability();
    return window.ChallengeRunner.trace(ch, lr.code, test.args, { max_events: VIZ_MAX_EVENTS }).then(function (tr) {
      if (token !== S.viz.token || !S.viz.open) return null;
      S.viz.pending = false;
      dom.vizPanel.removeAttribute('aria-busy');
      var stale = getCode() !== lr.code ? VIZ_STALE_AT_TRACE : '';
      if (!tr.nodes.main.length && !tr.nodes.sub.length) tr.nodes = nodesFromArgs(ch, test);   // a timed-out / failed run still shows its input
      S.viz.trace = tr;
      var n = player.load(tr, { entry: ch.entry_function, hasBudget: !!ch.has_budget_arg, returnType: ch.return_type, expected: test.expected, stale: stale });
      setTutorAvailability();
      announce(n ? 'Replay ready: ' + n + ' ' + plural(n, 'step') + ' on ' + test.id + '.' : 'The replay could not run' + (tr.error ? ': ' + tr.error : '.'));
      return tr;
    });
  }
  /* "Explain this step": the current step + the current function's line range go to the tutor (mode explain_step). */
  function explainStep() {
    var ch = S.current;
    var player = S.viz.player;
    if (!ch || !player || !S.viz.open) return;
    var cur = player.current();
    if (!cur || !cur.step) return;
    var step = cur.step;
    var code = (typeof S.viz.code === 'string') ? S.viz.code : getCode();
    var stepBody = {
      index: cur.index + 1, total: cur.total,
      caption: str(step.caption, VIZ_STEP_STRING_MAX), call: str(step.call, VIZ_STEP_STRING_MAX),
      stack: step.stack.slice(-VIZ_STACK_MAX).map(function (s) { return String(s).slice(0, VIZ_STACK_ITEM_MAX); }),
      returned: str(step.returnedText, VIZ_STEP_STRING_MAX)
    };
    var selection = null;
    var fns = (S.viz.trace && Array.isArray(S.viz.trace.functions)) ? S.viz.trace.functions : [];
    // The frame's OWN function (by the index the tracer recorded), not the first function with the same name:
    // "(anonymous)" callbacks and shadowed helpers would otherwise select the wrong lines.
    var fn = (isInt(step.fnIndex) && fns[step.fnIndex]) ? fns[step.fnIndex] : (fns.filter(function (f) { return f.name === step.fn; })[0] || null);
    if (fn) {
      var lines = code.split('\n');
      var a = fn.start_line, b = fn.end_line;
      if (isInt(a) && isInt(b) && a >= 1 && b >= a && b <= lines.length) selection = { start_line: a, end_line: b, text: lines.slice(a - 1, b).join('\n').slice(0, 2000) };
    }
    var where = { index: stepBody.index, total: stepBody.total };
    askTutor('', dom.tutorStuck && dom.tutorStuck.checked, 'explain_step', selection, {
      step: stepBody, code: code,
      onStart: function () { renderExplainAnswer('pending', where); },
      onDone: function (turn, remaining) {
        if (!S.viz.open) return;
        if (turn && turn.role === 'tutor') renderExplainAnswer('answer', { index: where.index, total: where.total, text: turn.text, question: turn.question, level: turn.level, degraded: turn.degraded, remaining: remaining });
        else renderExplainAnswer('error', { index: where.index, total: where.total, text: (turn && turn.text) || "The tutor didn't answer; try again." });
      }
    });
  }
  /* The "Explain this step" answer is mirrored under the caption: the tutor thread lives in the workbench above
     the panel and is off-screen while the learner watches the replay. kind: 'pending' | 'answer' | 'error' | null. */
  function renderExplainAnswer(kind, info) {
    var box = dom.vizAnswer;
    if (!box) return;
    if (!kind) {
      box.className = 'viz-explain-answer hidden';
      [dom.vizAnswerLabel, dom.vizAnswerText, dom.vizAnswerQuestion, dom.vizAnswerFoot].forEach(function (n) { clear(n); });
      return;
    }
    var where = 'step ' + info.index + ' of ' + info.total;
    box.className = 'viz-explain-answer' + (kind === 'pending' ? ' is-pending' : (kind === 'error' ? ' is-error' : ''));
    if (dom.vizAnswerLabel) dom.vizAnswerLabel.textContent = (kind === 'pending') ? 'Asking the tutor about ' + where + '\u2026' : 'Tutor on ' + where;
    if (dom.vizAnswerText) { clear(dom.vizAnswerText); if (kind !== 'pending') appendChildren(dom.vizAnswerText, renderInline(info.text)); }
    if (dom.vizAnswerQuestion) dom.vizAnswerQuestion.textContent = (kind === 'answer' && info.question) ? info.question : '';
    if (dom.vizAnswerFoot) {
      var foot = [];
      if (kind === 'answer') {
        if (info.level) foot.push(String(info.level).replace('_', ' '));
        if (info.degraded) foot.push('rule-based answer');
        if (isInt(info.remaining)) foot.push(info.remaining + ' tutor ' + plural(info.remaining, 'question') + ' left');
      }
      foot.push(kind === 'error' ? 'Not counted against your tutor questions.' : 'Also shown in Ask the tutor.');
      dom.vizAnswerFoot.textContent = foot.join(' \u00b7 ');
    }
    if (kind === 'pending') return;
    var active = document.activeElement;
    if (active === dom.vizPanel || active === dom.vizExplain) {          // keyboard users land on the answer, not on <body>
      try { box.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    try { box.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) { /* ignore */ }
  }

  /* ---------- Public API ---------- */

  window.ChallengeMode = {
    init: init, enter: enter, loadChallenges: loadChallenges, checkHealth: checkHealth, selectChallenge: selectChallenge, renderProblemCard: renderProblemCard,
    runTests: runTests, getAiFeedback: getAiFeedback, buildRequestBody: buildRequestBody, validateEvaluationResponse: validateEvaluationResponse,
    deterministicFeedback: deterministicFeedback, renderResults: renderResults, renderSummary: renderSummary, renderRubric: renderRubric, renderTests: renderTests,
    renderIssues: renderIssues, renderStrengths: renderStrengths, renderGuardrails: renderGuardrails, renderNextSteps: renderNextSteps, renderHintCard: renderHintCard,
    revealNextHint: revealNextHint, updateSolutionLock: updateSolutionLock, giveUp: giveUp, revealSolution: revealSolution, askTutor: askTutor, buildTutorBody: buildTutorBody,
    setStage: setStage, resetPipeline: resetPipeline, replayTrace: replayTrace, announce: announce, selectEditorLine: selectEditorLine, readState: readState, writeState: writeState,
    updateStatusLine: updateStatusLine, updateTabBadges: updateTabBadges, el: el, renderInline: renderInline, apiBase: apiBase, selectionLines: selectionLines,
    starterBlocks: starterBlocks, openViz: openViz, closeViz: closeViz, runViz: runViz, explainStep: explainStep, canVisualize: canVisualize, vizTests: vizTests, state: S
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
