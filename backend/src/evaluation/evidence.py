"""Evidence: client-result validation (spec 4.2 rule 6, 5.1), static checks (5.2), evidence object.

The server never trusts client ``status``/``expected``; every row is recomputed against the
registry's expected value.  ``build_evidence`` is the single entry point used by the pipeline.
"""
from __future__ import annotations

import hashlib
import json
import re

from .registry import TAGS, Challenge, tests_hash

STATUS = ("pass", "fail", "error", "timeout", "not_run")
MAX_CODE_CHARS = 20000
MAX_CODE_LINES = 600
MAX_CLIENT_TESTS = 64
NOT_REPORTED = "not reported by the browser"

_COMMENT_RE = re.compile(r"/\*.*?\*/|//[^\n]*", re.S)
_MUTATION_RE = re.compile(r"(?<![=!<>])\.(val|left|right)\s*=(?!=)")
_FUNCTION_RE = re.compile(r"\bfunction\b")
_ARROW_RE = re.compile(r"=>")


# --------------------------------------------------------------------------- helpers

def code_sha256(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def code_line_count(code: str) -> int:
    return len(code.split("\n"))


def numbered_code(code: str) -> str:
    return "\n".join(f"{i:>3}| {line}" for i, line in enumerate(code.split("\n"), 1))


def strip_comments(code: str) -> str:
    return _COMMENT_RE.sub(" ", code)


def canon(v) -> str:
    """Strict canonical form: ``true != 1``, ``"undefined" != false``."""
    return json.dumps(v, sort_keys=True, separators=(",", ":"))


def recompute_status(client_status, actual, actual_type, error, expected) -> str:
    if client_status in ("timeout", "not_run"):
        return client_status
    if error is not None or client_status == "error" or actual_type == "error":
        return "error"
    if actual_type == "undefined" or actual == "undefined":
        return "fail"
    return "pass" if canon(actual) == canon(expected) else "fail"


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# --------------------------------------------------------------------------- client results (4.2 rule 6)

def check_client_results(challenge: Challenge, code: str, cr):
    """Return ``(normalized_client_results, "")`` or ``(None, evidence_note)``.

    ``evidence_note`` is one of ``stale_harness``, ``tests_hash_mismatch``, ``stale_code_hash``,
    ``malformed``; ``cr is None`` (legacy client) gives ``(None, "")``.
    """
    if cr is None:
        return None, ""
    if not isinstance(cr, dict):
        return None, "malformed"
    if cr.get("harness_version") != challenge.harness_version:
        return None, "stale_harness"
    if cr.get("tests_hash") != tests_hash(challenge):
        return None, "tests_hash_mismatch"
    if cr.get("code_sha256") != code_sha256(code):
        return None, "stale_code_hash"
    comp = cr.get("compile")
    if not isinstance(comp, dict) or not isinstance(comp.get("ok"), bool):
        return None, "malformed"
    error = comp.get("error")
    if error is not None and not isinstance(error, str):
        return None, "malformed"
    error_kind = comp.get("error_kind")
    if error_kind not in (None, "syntax", "load"):
        return None, "malformed"
    entry_found = comp.get("entry_found", True)
    if not isinstance(entry_found, bool):
        return None, "malformed"
    defined = comp.get("defined_functions", [])
    if not isinstance(defined, list) or not all(isinstance(d, str) for d in defined):
        defined = []
    tests = cr.get("tests")
    if tests is None:
        tests = []
    if not isinstance(tests, list) or len(tests) > MAX_CLIENT_TESTS:
        return None, "malformed"
    catalog = challenge.test_by_id
    rows: dict = {}
    for t in tests:
        if not isinstance(t, dict):
            return None, "malformed"
        tid = t.get("id")
        if not isinstance(tid, str):
            return None, "malformed"
        status = t.get("status")
        if status not in STATUS:
            return None, "malformed"
        actual = t.get("actual")
        if not (actual is None or isinstance(actual, bool) or _is_number(actual)
                or (isinstance(actual, str) and len(actual) <= 100)):
            return None, "malformed"
        actual_type = t.get("actual_type")
        if actual_type is None:
            actual_type = ""
        if not isinstance(actual_type, str) or len(actual_type) > 16:
            return None, "malformed"
        err = t.get("error")
        if err is not None and not (isinstance(err, str) and len(err) <= 200):
            return None, "malformed"
        ms = t.get("ms", 0)
        if not _is_number(ms) or not (0 <= ms <= 60000):
            return None, "malformed"
        if tid not in catalog:
            continue                                            # unknown ids are ignored (5.1)
        rows[tid] = {"id": tid, "status": status, "actual": actual, "actual_type": actual_type,
                     "error": err, "ms": float(ms)}             # duplicates: last wins
    normalized = {
        "harness_version": cr["harness_version"], "tests_hash": cr["tests_hash"], "code_sha256": cr["code_sha256"],
        "compile": {"ok": comp["ok"], "error": (error or None) and error[:200], "error_kind": error_kind,
                    "entry_found": entry_found, "defined_functions": [d[:64] for d in defined][:32]},
        "tests": rows,
    }
    return normalized, ""


# --------------------------------------------------------------------------- static checks (5.2)

def _entry_defined_by_regex(code: str, entry: str) -> bool:
    stripped = strip_comments(code)
    e = re.escape(entry)
    return bool(re.search(rf"\bfunction\s+{e}\s*\(", stripped) or re.search(rf"\b{e}\s*=\s*(?:function\b|\(|[A-Za-z_$])", stripped))


def static_checks(challenge: Challenge, code: str, cr) -> dict:
    """``cr`` is the normalized client results (or None). Returns checks + compile_failed + syntax_detail."""
    stripped = strip_comments(code)
    checks = []
    compile_failed = False
    syntax_detail = ""
    entry = challenge.entry_function

    if cr is not None:
        comp = cr["compile"]
        if comp["ok"]:
            checks.append({"id": "S03", "name": "compiles", "status": "pass", "detail": ""})
        else:
            kind = comp.get("error_kind") or "load"
            msg = (comp.get("error") or "unknown error")[:200]
            checks.append({"id": "S03", "name": "compiles", "status": "fail", "detail": f"{kind} error: {msg}"})
            compile_failed = True
            syntax_detail = f"{kind} error: {msg}"
        if comp["ok"] and comp.get("entry_found", True):
            checks.insert(0, {"id": "S01", "name": "entry function defined", "status": "pass", "detail": ""})
        else:
            checks.insert(0, {"id": "S01", "name": "entry function defined",
                              "status": "fail" if comp["ok"] else "unknown",
                              "detail": f"no function named {entry}" if comp["ok"] else "code did not compile"})
            if comp["ok"]:
                compile_failed = True
                syntax_detail = syntax_detail or f"no function named {entry} was found"
    else:
        found = _entry_defined_by_regex(code, entry)
        checks.append({"id": "S01", "name": "entry function defined", "status": "pass" if found else "fail",
                       "detail": "" if found else f"no function named {entry} (server regex; tests did not run)"})
        checks.append({"id": "S03", "name": "compiles", "status": "unknown", "detail": "no browser results"})

    n_lines = code_line_count(code)
    checks.insert(1, {"id": "S02", "name": "size limit", "status": "pass", "detail": f"{len(code)} chars, {n_lines} lines"})

    n_fn = len(_FUNCTION_RE.findall(stripped)) + len(_ARROW_RE.findall(stripped))
    checks.append({"id": "S04", "name": "helper function present", "status": "pass" if n_fn >= 2 else "info",
                   "detail": f"{n_fn} function(s) found"})
    n_calls = len(re.findall(rf"\b{re.escape(entry)}\s*\(", stripped))
    checks.append({"id": "S05", "name": "recursion present", "status": "pass" if n_calls >= 2 else "info",
                   "detail": f"{entry} appears {n_calls} time(s)"})
    mutates = bool(_MUTATION_RE.search(stripped))
    checks.append({"id": "S06", "name": "mutates input nodes", "status": "info" if mutates else "pass",
                   "detail": "assignment to .val/.left/.right found" if mutates else ""})
    order = {"S01": 0, "S02": 1, "S03": 2, "S04": 3, "S05": 4, "S06": 5}
    checks.sort(key=lambda c: order[c["id"]])
    return {"checks": checks, "compile_failed": compile_failed, "syntax_detail": syntax_detail}


# --------------------------------------------------------------------------- evidence rows (5.1)

def evidence_rows(challenge: Challenge, cr, compile_failed: bool) -> list:
    rows = []
    client = cr["tests"] if cr is not None else {}
    for t in challenge.tests:
        base = {"id": t.id, "tag": t.tag, "name": t.name, "expected": t.expected}
        r = client.get(t.id)
        if cr is None or compile_failed or r is None:
            rows.append({**base, "status": "not_run", "actual": None, "actual_type": "not_run", "error": NOT_REPORTED, "ms": 0.0})
            continue
        status = recompute_status(r["status"], r["actual"], r["actual_type"], r["error"], t.expected)
        rows.append({**base, "status": status, "actual": r["actual"], "actual_type": r["actual_type"],
                     "error": r["error"], "ms": r["ms"]})
    return rows


def summarize(rows: list) -> tuple:
    total = len(rows)
    counts = {s: 0 for s in STATUS}
    for r in rows:
        counts[r["status"]] += 1
    summary = {"total": total, "passed": counts["pass"], "failed": counts["fail"], "errored": counts["error"],
               "timed_out": counts["timeout"], "not_run": counts["not_run"], "executed": total - counts["not_run"]}
    by_tag = {}
    for tag in TAGS:
        tagged = [r for r in rows if r["tag"] == tag]
        if not tagged:
            continue
        by_tag[tag] = {"total": len(tagged), "passed": sum(1 for r in tagged if r["status"] == "pass"),
                       "failed": sum(1 for r in tagged if r["status"] in ("fail", "error", "timeout")),
                       "executed": sum(1 for r in tagged if r["status"] != "not_run")}
    return summary, by_tag


def build_evidence(challenge: Challenge, code: str, client_results) -> dict:
    """Validate the raw client_results, run the static checks and recompute every test row."""
    cr, note = check_client_results(challenge, code, client_results)
    static = static_checks(challenge, code, cr)
    rows = evidence_rows(challenge, cr, static["compile_failed"])
    summary, by_tag = summarize(rows)
    return {
        "mode": "tests" if cr is not None else "no_tests",
        "evidence_note": note,
        "static": static,
        "tests": rows,
        "summary": summary,
        "by_tag": by_tag,
        "code": code,
        "code_lines": code_line_count(code),
        "numbered_code": numbered_code(code),
        "code_sha256": code_sha256(code),
        "defined_functions": list(cr["compile"]["defined_functions"]) if cr is not None else [],
    }


def first_failed_test(ev: dict):
    for r in ev["tests"]:
        if r["status"] in ("fail", "error", "timeout"):
            return r
    return None


def failing_ids(ev: dict) -> set:
    return {r["id"] for r in ev["tests"] if r["status"] in ("fail", "error", "timeout")}
