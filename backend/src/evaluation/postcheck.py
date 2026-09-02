"""Post-checks (spec 7.1-7.5, 7.7): verdict and scores from evidence, issue filter, leak guard, hint
policy, fallback hint (7.6), the post-process entry point, and the structural validator for an echoed
evaluation object (addendum A2).
"""
from __future__ import annotations

import math
import re

from .evidence import first_failed_test
from .prompts import jsdump
from .registry import HINT_LEVELS, TAG_DIMENSION, Challenge
from .schema import DIMS, EVIDENCE_KINDS, FLAGS, ISSUE_CATEGORIES, SEVERITIES, VERDICTS

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
HINT_LEVEL_FOR_ATTEMPT = {1: "conceptual", 2: "targeted"}          # 3+ -> near_explicit
JUDGE_DIMS = ("key_concepts", "efficiency", "code_quality")

CAP_ERROR = "capped: code did not run"
CAP_UNVERIFIED = "capped: unverified"
CAP_CORE = "capped: core test failed"
CAP_HALF = "capped: fewer than half the tests pass"
CAP_TIMEOUT = "capped: timeout"
FLOOR_PASS = "floor: all tests pass"
CAP_HARDCODED = "capped: hardcoded tests"
SET_FROM_TESTS = "set from test evidence"

# text caps (7.7)
CAP_SUMMARY, CAP_PROGRESS, CAP_ENCOURAGEMENT = 500, 300, 300
CAP_ISSUE_EXPLANATION, CAP_ISSUE_TITLE = 1200, 120
CAP_LIST_ITEM, CAP_COMPLEXITY = 200, 120
CAP_HINT_TEXT, CAP_QUESTION, CAP_JUSTIFICATION = 900, 300, 300
MAX_TAGS, MAX_LIST, MAX_ISSUES = 3, 3, 4


# --------------------------------------------------------------------------- 7.1 verdict

def derive_verdict(ev: dict) -> str:
    s = ev["summary"]
    if ev["mode"] == "no_tests":
        return "UNVERIFIED"
    if ev["static"]["compile_failed"]:
        return "ERROR"                       # checked before executed == 0: a failed compile forces every row not_run
    if s["executed"] == 0:
        return "UNVERIFIED"
    if s["errored"] == s["executed"]:
        return "ERROR"
    if s["passed"] == s["total"]:
        return "PASS"
    if s["passed"] == 0:
        return "FAIL"
    return "PARTIAL"


def expected_level(attempt: int, verdict: str) -> str:
    return "extension" if verdict == "PASS" else HINT_LEVEL_FOR_ATTEMPT.get(int(attempt), "near_explicit")


# --------------------------------------------------------------------------- 7.2 scores

def _to_int(v, default=0) -> int:
    try:
        if isinstance(v, bool):
            return int(v)
        return int(round(float(v)))
    except (TypeError, ValueError):
        return default


def _clamp(v: int) -> int:
    return max(0, min(100, v))


def _dim_rows(ev: dict, dim: str) -> list:
    return [r for r in ev["tests"] if TAG_DIMENSION.get(r["tag"]) == dim and r["status"] != "not_run"]


def evidence_score(ev: dict, dim: str):
    rows = _dim_rows(ev, dim)
    if not rows:
        return None
    passed = sum(1 for r in rows if r["status"] == "pass")
    return int(round(100 * passed / len(rows)))


def _tests_justification(ev: dict, dim: str, label: str) -> str:
    rows = _dim_rows(ev, dim)
    passed = [r for r in rows if r["status"] == "pass"]
    failed = [r["id"] for r in rows if r["status"] != "pass"]
    if not rows:
        return f"No {label} test ran."
    if not failed:
        return f"All {len(rows)} {label} tests pass."
    return f"{len(passed)} of {len(rows)} {label} tests pass ({', '.join(failed[:6])}{', ...' if len(failed) > 6 else ''} fail)."


def compute_scores(judge_scores: dict, ev: dict, verdict: str, flags, rubric, judge_source: str = "judge"):
    """Return ``(scores, adjusted)``; ``scores[dim] = {score, justification, source}``."""
    judge_scores = judge_scores if isinstance(judge_scores, dict) else {}
    raw, just = {}, {}
    for d in DIMS:
        entry = judge_scores.get(d) if isinstance(judge_scores.get(d), dict) else {}
        raw[d] = _clamp(_to_int(entry.get("score"), 0))
        just[d] = str(entry.get("justification") or "")[:CAP_JUSTIFICATION]
    cur = dict(raw)
    reasons: dict = {}
    source = {d: judge_source for d in DIMS}
    s = ev["summary"]
    executed = s["executed"]
    ratio = (s["passed"] / executed) if executed else 0.0
    tests_mode = ev["mode"] == "tests"

    for d, label in (("correctness", "correctness"), ("edge_cases", "edge-case")):
        if verdict == "ERROR":
            cur[d] = 0
            reasons[d] = CAP_ERROR
            source[d] = "tests" if tests_mode else judge_source
            just[d] = "The code did not run, so no test could pass."
        elif verdict == "UNVERIFIED" or not tests_mode:
            if cur[d] > 60:
                cur[d] = 60
                reasons[d] = CAP_UNVERIFIED
            if not just[d]:
                just[d] = "Tests did not run; the estimate is capped at 60."
        else:
            es = evidence_score(ev, d)
            if es is None:
                if cur[d] > 60:
                    cur[d] = 60
                    reasons[d] = CAP_UNVERIFIED
            else:
                cur[d] = es
                reasons[d] = SET_FROM_TESTS
                source[d] = "tests"
                just[d] = _tests_justification(ev, d, label)

    def cap(dim, limit, reason):
        if cur[dim] > limit:
            cur[dim] = limit
            reasons[dim] = reason

    if verdict == "ERROR":
        cap("key_concepts", 40, CAP_ERROR); cap("efficiency", 30, CAP_ERROR); cap("code_quality", 60, CAP_ERROR)
    if verdict == "UNVERIFIED":
        cap("key_concepts", 60, CAP_UNVERIFIED)
    core_failed = any(TAG_DIMENSION.get(r["tag"]) == "correctness" and r["status"] in ("fail", "error", "timeout") for r in ev["tests"])
    if core_failed:
        cap("key_concepts", 70, CAP_CORE)
    if ratio < 0.5:
        cap("key_concepts", 60, CAP_HALF); cap("efficiency", 60, CAP_HALF); cap("code_quality", 60, CAP_HALF)
    if s["timed_out"]:
        cap("efficiency", 20, CAP_TIMEOUT)
    if verdict == "PASS" and cur["key_concepts"] < 70:
        cur["key_concepts"] = 70
        reasons["key_concepts"] = FLOOR_PASS
    if "hardcoded_tests" in (flags or []):
        cap("correctness", 30, CAP_HARDCODED); cap("key_concepts", 30, CAP_HARDCODED)

    adjusted = [{"dim": d, "from": raw[d], "to": cur[d], "reason": reasons.get(d, SET_FROM_TESTS)}
                for d in DIMS if cur[d] != raw[d]]
    scores = {d: {"score": cur[d], "justification": just[d], "source": source[d]} for d in DIMS}
    return scores, adjusted


def overall_score(scores: dict, rubric) -> int:
    w = rubric.as_dict()
    total = sum(w[d] * scores[d]["score"] for d in DIMS)
    return max(0, min(100, int(math.floor(total + 0.5))))


# --------------------------------------------------------------------------- 7.3 issue filter

_LINE_REF = re.compile(r"(\d+)(?:-(\d+))?")


def _valid_line_ref(ref: str, code_lines: int) -> bool:
    m = _LINE_REF.fullmatch(ref)
    if not m:
        return False
    a = int(m.group(1)); b = int(m.group(2) or m.group(1))
    return 1 <= a <= b <= code_lines


def filter_issues(issues, ev: dict, verdict: str, max_issues: int = MAX_ISSUES):
    failed = {t["id"] for t in ev["tests"] if t["status"] in ("fail", "error", "timeout")}
    failed_static = {c["id"] for c in ev["static"]["checks"] if c["status"] == "fail"}
    issues = [i for i in (issues or []) if isinstance(i, dict)]
    kept = []
    for it in issues:
        valid = []
        for e in it.get("evidence") or []:
            if not isinstance(e, dict):
                continue
            k, ref = e.get("kind"), str(e.get("ref", "")).strip()
            if k == "test" and ref in failed:
                valid.append({"kind": "test", "ref": ref})
            elif k == "line" and _valid_line_ref(ref, ev["code_lines"]):
                valid.append({"kind": "line", "ref": ref})
            elif k == "static" and ref in failed_static:
                valid.append({"kind": "static", "ref": ref})
        if not valid:
            continue
        if verdict == "PASS" and it.get("category") in ("correctness", "edge_case"):
            continue
        kept.append({"title": str(it.get("title") or "")[:CAP_ISSUE_TITLE],
                     "category": it.get("category") if it.get("category") in ISSUE_CATEGORIES else "correctness",
                     "severity": it.get("severity") if it.get("severity") in SEVERITIES else "medium",
                     "explanation": str(it.get("explanation") or "")[:CAP_ISSUE_EXPLANATION],
                     "evidence": valid})
    kept.sort(key=lambda i: SEVERITY_ORDER.get(i["severity"], 3))
    dropped = len(issues) - len(kept[:max_issues])
    return kept[:max_issues], dropped


# --------------------------------------------------------------------------- 7.4 leak guard

# Normalization drops sentence punctuation and inline-markdown decoration (backticks, asterisks, quotes) before the
# windows are cut and before a text is checked, so a solution written one line per sentence, or in backticked pieces
# cut shorter than a window, normalizes to the same string as the reference and cannot slip between the windows.
_DECORATION = re.compile(r"[.!?,;:`*\"']")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
_FENCE_BLOCK = re.compile(r"```.*?(?:```|\Z)", re.S)
FENCED = re.compile(r"```")
FUNC_DEF = re.compile(r"\bfunction\s+\w+\s*\([^)]*\)\s*\{")              # a function header (7.5 hint guard)
FUNC_BODY = re.compile(r"\bfunction\s+\w+\s*\([^)]*\)\s*\{.*?\}", re.S)   # a header with a body (prose guard)
LEAK_WINDOW, LEAK_STEP = 40, 5          # 40-char windows every 5 chars: a single reference line is a leak on its own
GUARDED_LEVELS = ("conceptual", "targeted", "near_explicit")
LEVEL_RANK = {"conceptual": 1, "targeted": 2, "near_explicit": 3, "extension": 3}
WITHHELD = "(part withheld: it quoted the solution)"


def _norm(s) -> str:
    return re.sub(r"\s+", " ", _DECORATION.sub("", s or "")).strip().lower()


def sanctioned_texts(challenge: Challenge, level) -> list:
    """Curated texts the page or the fallback hint itself shows by ``level`` (so quoting them is not a leak there):
    ladder hints up to the level's rank (hint 1 at conceptual, 2 at targeted, 3 from near_explicit on), every
    card's ``why`` (the conceptual fallback) and, from targeted on, the cards' ``fix_direction`` (the targeted and
    near_explicit fallbacks).  Nothing is sanctioned when ``level`` is ``None``."""
    rank = LEVEL_RANK.get(level, 0)
    out = [h.text for h in challenge.hints if h.level <= rank]
    if rank >= 1:
        out += [c.why for c in challenge.card_by_id.values()]
    if rank >= 2:
        out += [c.fix_direction for c in challenge.card_by_id.values()]
    return out


def leak_windows(challenge: Challenge, learner_code: str, level: str | None = None,
                 window: int = LEAK_WINDOW, step: int = LEAK_STEP) -> set:
    """Windows of the normalized reference (and accepted alternatives) that are leaks in text shown at ``level``.

    Excluded: anything in the starter code, the signature, the learner's own code and, when ``level`` is given, the
    ``sanctioned_texts`` of that level (the ladder and the cards quote the reference's key expressions at their own
    levels by design; a judge hint that says what the page's own hint says is not a leak).
    """
    sources = [challenge.reference_solution, *challenge.accepted_alternatives]
    exclusions = "\n".join(_norm(x) for x in (challenge.starter_code, challenge.signature, learner_code,
                                                *sanctioned_texts(challenge, level)))
    out = set()
    for src in sources:
        r = _norm(src)
        wins = [r] if len(r) < window else [r[i:i + window] for i in range(0, len(r) - window + 1, step)]
        out.update(w for w in wins if w and w not in exclusions)
    return out


def leaks(text, windows: set) -> bool:
    t = _norm(text)
    return any(w in t for w in windows) if t else False


def _fence_guard_fails(block: str, level) -> bool:
    """The 7.5 fence rule for one fenced block: any fence at conceptual/targeted, > 3 code lines at near_explicit."""
    if level in ("conceptual", "targeted"):
        return True
    if level == "near_explicit":
        return len([ln for ln in block.splitlines() if ln.strip() and not ln.strip().startswith("```")]) > 3
    return False


def prose_code_guard_fails(text: str, level) -> bool:
    """Code guard for prose (summary, issue explanations, list items, tutor answers): a fenced block the level forbids
    or a function definition with a body.  A bare header such as "your `function go(p, q) {` on line 3" is a quote of
    the learner's own code, not a solution, and passes; nothing is guarded at ``extension`` (PASS unlocks the solution).
    """
    if level not in GUARDED_LEVELS or not text:
        return False
    return bool(FUNC_BODY.search(text)) or any(_fence_guard_fails(m.group(0), level) for m in _FENCE_BLOCK.finditer(text))


def _units(text: str) -> list:
    """``(start, end, is_fence)`` spans of ``text``: fenced blocks stay whole, the prose around them is split at
    sentence ends (``[.!?]`` + whitespace); whitespace-only pieces are skipped."""
    out = []

    def prose(a, b):
        seg, start = text[a:b], 0
        for m in _SENTENCE_END.finditer(seg):
            if seg[start:m.start()].strip():
                out.append((a + start, a + m.start(), False))
            start = m.end()
        if seg[start:].strip():
            out.append((a + start, b, False))

    pos = 0
    for m in _FENCE_BLOCK.finditer(text):
        prose(pos, m.start())
        out.append((m.start(), m.end(), True))
        pos = m.end()
    prose(pos, len(text))
    return out


def redact(text, windows: set, level=None):
    """Unit-level redaction; returns ``(text, redacted_count)`` and never blanks the field silently.

    Units are sentences and fenced blocks.  A unit is withheld when a leak window overlaps it in the normalized text
    of the WHOLE field (so a solution written one line per sentence is caught although no single sentence holds a
    whole window), and, when ``level`` is one of the guarded hint levels, when it is a fenced block that level
    forbids or part of a function definition with a body (``prose_code_guard_fails``).
    """
    text = text or ""
    units = _units(text)
    if not units:
        return "", 0
    pieces = [text[a:b].strip() for a, b, _ in units]
    spans, joined, pos = [], [], 0
    for n in (_norm(p) for p in pieces):
        if joined and n:
            pos += 1
        spans.append((pos, pos + len(n)))
        if n:
            joined.append(n)
            pos += len(n)
    t = " ".join(joined)
    drop = [False] * len(units)

    def mark(i, j, table):
        for k, (a, b) in enumerate(table):
            if a < j and i < b:
                drop[k] = True

    for w in windows:
        i = t.find(w)
        while i >= 0:
            mark(i, i + len(w), spans)
            i = t.find(w, i + 1)
    if level in GUARDED_LEVELS:
        raw = [(a, b) for a, b, _ in units]
        for a, b, is_fence in units:
            if is_fence and _fence_guard_fails(text[a:b], level):
                mark(a, b, raw)
        for m in FUNC_BODY.finditer(text):
            mark(m.start(), m.end(), raw)
    kept = [p for k, p in enumerate(pieces) if not drop[k]]
    return (" ".join(kept) if kept else WITHHELD), len(units) - len(kept)


# --------------------------------------------------------------------------- 7.5 / 7.6 hints

def code_guard_fails(text: str, level: str) -> bool:
    if level in ("conceptual", "targeted"):
        return bool(FENCED.search(text) or FUNC_DEF.search(text))
    if level == "near_explicit":
        blocks = re.findall(r"```.*?```", text, re.S)
        long_block = any(len([ln for ln in b.splitlines() if ln.strip() and not ln.strip().startswith("```")]) > 3 for b in blocks)
        return long_block or bool(FUNC_DEF.search(text))
    return False


def _bump_ladder(text: str, challenge: Challenge, hints_used, cards) -> str:
    """A fallback equal to a ladder hint already shown moves one ladder level up (max 3) or to the card text."""
    used = {int(h) for h in (hints_used or []) if str(h).isdigit()}
    for i, h in enumerate(challenge.hints):
        if text == h.text and h.level in used:
            nxt = challenge.hints[min(i + 1, len(challenge.hints) - 1)]
            if nxt.level not in used or nxt is h:
                if nxt is h and cards:
                    c = cards[0]["card"]
                    return f"{c.title}. {c.why} {c.fix_direction}"
                return nxt.text
            if cards:
                c = cards[0]["card"]
                return f"{c.title}. {c.why} {c.fix_direction}"
            return nxt.text
    return text


def fallback_hint(level: str, cards, challenge: Challenge, ev: dict, hints_used=()) -> dict:
    """Deterministic hint: syntax text, the top card at the requested level, or the ladder fallback."""
    if ev["static"]["compile_failed"]:
        detail = ev["static"]["syntax_detail"] or "the harness could not load your code"
        return {"source": "syntax",
                "text": f"Your code did not run: {detail}. Fix that first, then run the tests again.",
                "question": "Which line does the error message point to, and what does the parser expect there?"}
    if level == "extension" or not cards:
        fb = challenge.fallback_by_level[level]
        return {"source": "ladder", "text": _bump_ladder(fb.text, challenge, hints_used, cards)[:CAP_HINT_TEXT],
                "question": fb.question[:CAP_QUESTION]}
    c = cards[0]["card"]
    t = first_failed_test(ev)
    if level == "conceptual":
        text = f"{c.title}. {c.why}"
    elif level == "targeted":
        if t is None:
            text = f"{c.why} {c.fix_direction}"
        else:
            if t["status"] == "timeout":
                got = "no result within the time limit"
            elif t["status"] == "error" or t["error"]:
                got = "an error: " + (t["error"] or "unknown error")
            else:
                got = jsdump(t["actual"])
            text = (f"Look at {t['id']} ({t['name']}): expected {jsdump(t['expected'])}, your function returned {got}. "
                    f"{c.why} {c.fix_direction}")
    else:
        text = f"{c.fix_direction} Step by step: {challenge.hints[2].text}"
    return {"source": "card", "text": _bump_ladder(text, challenge, hints_used, cards)[:CAP_HINT_TEXT], "question": c.question[:CAP_QUESTION]}


def enforce_hint(hint, level: str, challenge: Challenge, ev: dict, cards, windows: set, hints_used=()):
    hint = hint if isinstance(hint, dict) else {}
    text = str(hint.get("text") or "").strip()
    q = str(hint.get("socratic_question") or "").strip()
    if hint.get("level") != level:
        reason = "level"
    elif not text:
        reason = "empty"
    elif leaks(text, windows) or leaks(q, windows):
        reason = "leak"
    elif code_guard_fails(text, level):
        reason = "code"
    else:
        reason = ""
    if reason:
        fb = fallback_hint(level, cards, challenge, ev, hints_used)
        return {"level": level, "text": fb["text"], "socratic_question": fb["question"], "source": fb["source"]}, reason
    if not q.endswith("?"):
        q = cards[0]["card"].question if cards else challenge.fallback_by_level[level].question
    return {"level": level, "text": text[:CAP_HINT_TEXT], "socratic_question": q[:CAP_QUESTION], "source": "judge"}, ""


# --------------------------------------------------------------------------- 7.7 entry point

def _str_list(items, cap: int, limit: int, windows=None, level=None) -> list:
    out = []
    for s in items or []:
        if not isinstance(s, str) or not s.strip():
            continue
        if windows is not None and (leaks(s, windows) or prose_code_guard_fails(s, level)):
            continue
        out.append(s.strip()[:cap])
        if len(out) >= limit:
            break
    return out


def postprocess(model_out: dict, ev: dict, challenge: Challenge, attempt: int, cards, learner_code: str,
                hints_used=(), judge_source: str = "judge"):
    """Turn the model's JSON into the evaluation object (4.3) + guardrails, using evidence as ground truth."""
    model_out = model_out if isinstance(model_out, dict) else {}
    verdict = derive_verdict(ev)
    level = expected_level(attempt, verdict)
    windows = leak_windows(challenge, learner_code, level)
    flags_in = [f for f in (model_out.get("flags") or []) if f in FLAGS]
    flags = list(dict.fromkeys(flags_in))
    scores, adjusted = compute_scores(model_out.get("scores"), ev, verdict, flags, challenge.rubric, judge_source)
    issues, dropped = filter_issues(model_out.get("issues"), ev, verdict)
    hint, hint_reason = enforce_hint(model_out.get("next_hint"), level, challenge, ev, cards, windows, hints_used)
    tags = [t for t in dict.fromkeys(model_out.get("misconception_tags") or []) if t in challenge.card_by_id][:MAX_TAGS]
    strengths = _str_list(model_out.get("strengths"), CAP_LIST_ITEM, MAX_LIST, windows, level)
    what_next = _str_list(model_out.get("what_to_try_next"), CAP_LIST_ITEM, MAX_LIST, windows, level)
    summary, n1 = redact(str(model_out.get("summary") or "")[:CAP_SUMMARY], windows, level)
    progress, n2 = redact(str(model_out.get("progress_note") or "")[:CAP_PROGRESS], windows, level)
    enc, n3 = redact(str(model_out.get("encouragement") or "")[:CAP_ENCOURAGEMENT], windows, level)
    total_redactions = n1 + n2 + n3
    for it in issues:
        it["explanation"], n = redact(it["explanation"], windows, level)
        total_redactions += n
    cx = model_out.get("complexity") if isinstance(model_out.get("complexity"), dict) else {}
    complexity = {k: str(cx.get(k) or "")[:CAP_COMPLEXITY] for k in ("time", "space", "note")}
    evaluation = {"verdict": verdict, "summary": summary, "progress_note": progress, "scores": scores,
                  "strengths": strengths, "issues": issues, "misconception_tags": tags, "complexity": complexity,
                  "next_hint": hint, "what_to_try_next": what_next, "encouragement": enc, "flags": flags}
    verdict_model = model_out.get("verdict") if model_out.get("verdict") in VERDICTS else "UNKNOWN"
    guardrails = {"verdict_overridden": verdict_model != verdict, "verdict_model": verdict_model,
                  "scores_adjusted": adjusted, "issues_dropped": dropped, "hint_replaced": bool(hint_reason),
                  "hint_replaced_reason": hint_reason, "leaks_redacted": total_redactions, "flags": flags}
    return evaluation, guardrails


# --------------------------------------------------------------------------- A2: echoed evaluation validation

def _cap_str(v, cap: int):
    return v[:cap] if isinstance(v, str) else None


def sanitize_evaluation(obj, challenge: Challenge):
    """Structural validation of a client-echoed evaluation (types, enums, caps as in 7.7).

    Returns a cleaned copy WITHOUT the server-only ``source`` fields (ready to be the assistant turn), or
    ``None`` when the object is malformed.
    """
    if not isinstance(obj, dict):
        return None
    out: dict = {}
    if obj.get("verdict") not in VERDICTS:
        return None
    out["verdict"] = obj["verdict"]
    for key, cap in (("summary", CAP_SUMMARY), ("progress_note", CAP_PROGRESS), ("encouragement", CAP_ENCOURAGEMENT)):
        v = _cap_str(obj.get(key, ""), cap)
        if v is None:
            return None
        out[key] = v
    scores = obj.get("scores")
    if not isinstance(scores, dict):
        return None
    out["scores"] = {}
    for d in DIMS:
        e = scores.get(d)
        if not isinstance(e, dict) or not isinstance(e.get("score"), (int, float)) or isinstance(e.get("score"), bool):
            return None
        j = _cap_str(e.get("justification", ""), CAP_JUSTIFICATION)
        if j is None:
            return None
        out["scores"][d] = {"score": _clamp(_to_int(e["score"])), "justification": j}
    for key in ("strengths", "what_to_try_next"):
        items = obj.get(key, [])
        if not isinstance(items, list) or not all(isinstance(s, str) for s in items):
            return None
        out[key] = [s[:CAP_LIST_ITEM] for s in items][:MAX_LIST]
    issues = obj.get("issues", [])
    if not isinstance(issues, list):
        return None
    out["issues"] = []
    for it in issues[:MAX_ISSUES]:
        if not isinstance(it, dict) or it.get("category") not in ISSUE_CATEGORIES or it.get("severity") not in SEVERITIES:
            return None
        title = _cap_str(it.get("title", ""), CAP_ISSUE_TITLE)
        expl = _cap_str(it.get("explanation", ""), CAP_ISSUE_EXPLANATION)
        ev_list = it.get("evidence", [])
        if title is None or expl is None or not isinstance(ev_list, list):
            return None
        evid = []
        for e in ev_list[:8]:
            if not isinstance(e, dict) or e.get("kind") not in EVIDENCE_KINDS or not isinstance(e.get("ref"), str):
                return None
            evid.append({"kind": e["kind"], "ref": e["ref"][:32]})
        out["issues"].append({"title": title, "category": it["category"], "severity": it["severity"],
                              "explanation": expl, "evidence": evid})
    tags = obj.get("misconception_tags", [])
    if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
        return None
    allowed = set(challenge.card_by_id) | {"none"}
    out["misconception_tags"] = [t for t in tags if t in allowed][:MAX_TAGS]
    cx = obj.get("complexity", {})
    if not isinstance(cx, dict):
        return None
    out["complexity"] = {}
    for k in ("time", "space", "note"):
        v = _cap_str(cx.get(k, ""), CAP_COMPLEXITY)
        if v is None:
            return None
        out["complexity"][k] = v
    hint = obj.get("next_hint")
    if not isinstance(hint, dict) or hint.get("level") not in HINT_LEVELS:
        return None
    text = _cap_str(hint.get("text", ""), CAP_HINT_TEXT)
    q = _cap_str(hint.get("socratic_question", ""), CAP_QUESTION)
    if text is None or q is None:
        return None
    out["next_hint"] = {"level": hint["level"], "text": text, "socratic_question": q}
    flags = obj.get("flags", [])
    if not isinstance(flags, list):
        return None
    out["flags"] = [f for f in flags if f in FLAGS]
    return out


def strip_server_fields(evaluation: dict) -> dict:
    """The evaluation minus ``scores[*].source`` and ``next_hint.source`` (the assistant turn in the tutor call)."""
    out = dict(evaluation)
    out["scores"] = {d: {k: v for k, v in e.items() if k != "source"} for d, e in evaluation.get("scores", {}).items()}
    out["next_hint"] = {k: v for k, v in evaluation.get("next_hint", {}).items() if k != "source"}
    return out
