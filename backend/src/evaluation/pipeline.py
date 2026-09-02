"""Orchestration (spec 7.7-7.10, addendum A5/A6): run_evaluation, run_tutor, pipeline_trace, legacy text,
telemetry.  No HTTP here; ``routes.py`` maps the results to responses.
"""
from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field

from . import config, degraded
from .evidence import build_evidence, first_failed_test
from .judge import EMPTY_USAGE, USER_MESSAGES, JudgeResult, degraded_reason, submission_message
from .postcheck import (derive_verdict, expected_level, fallback_hint, leak_windows, leaks, overall_score,
                        postprocess, prose_code_guard_fails, strip_server_fields)
from .prompts import build_submission_message, build_tutor_turn, fmt_test_input, jsdump
from .registry import HINT_LEVELS, Challenge, canonical_json
from .retrieval import public_retrieval, retrieve_cards

logger = logging.getLogger("evaluation")

STAGES = ("validate", "static_checks", "tests", "retrieval", "judge", "postcheck")
TRACE_STATUSES = ("ok", "skipped", "degraded", "error")
DECLINE_PREFIX = "I can't hand over the solution, but here is the next step: "
STEP_UNAVAILABLE = "(AI tutor unavailable)"       # degraded explain_step answer = the step caption + this suffix
CAP_ANSWER, CAP_TUTOR_QUESTION = 900, 300


@dataclass
class EvalRequest:
    challenge_id: str
    code: str
    attempt: int = 1
    hints_used: list = field(default_factory=list)
    previous: dict | None = None
    learner_state: dict = field(default_factory=lambda: {"gave_up": False, "solution_revealed": False})
    client_results: object = None            # raw, validated by build_evidence
    legacy: bool = False


@dataclass
class TutorRequest:
    mode: str = "question"
    question: str = ""
    selection: dict | None = None
    evaluation: dict | None = None           # already sanitized (server-only fields stripped)
    history: list = field(default_factory=list)
    stuck: bool = False
    step: dict | None = None                 # validated replay step (ADDENDUM_VIS 4); required for mode explain_step

    def as_dict(self) -> dict:
        return {"mode": self.mode, "question": self.question, "selection": self.selection, "stuck": self.stuck,
                "step": self.step}


def _ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


def _stage(name: str, status: str, ms: int, detail: str) -> dict:
    return {"stage": name, "status": status, "ms": int(ms), "detail": detail}


# --------------------------------------------------------------------------- response pieces

def tests_block(challenge: Challenge, ev: dict) -> dict:
    failed = []
    for r in ev["tests"]:
        if r["status"] in ("fail", "error", "timeout"):
            failed.append({"id": r["id"], "name": r["name"], "tag": r["tag"],
                           "input": fmt_test_input(challenge, challenge.test_by_id[r["id"]]),
                           "expected": r["expected"], "actual": r["actual"], "status": r["status"], "error": r["error"]})
    return {"mode": ev["mode"], "evidence_note": ev["evidence_note"], "summary": dict(ev["summary"]),
            "by_tag": {k: dict(v) for k, v in ev["by_tag"].items()}, "failed": failed}


def render_legacy_text(evaluation: dict, tests: dict, overall: int) -> str:
    s = tests["summary"]
    sc = evaluation["scores"]
    if tests["mode"] == "tests":
        line = f"Tests: {s['passed']}/{s['total']} passed"
        if tests["failed"]:
            f0 = tests["failed"][0]
            got = ("an error: " + f0["error"]) if f0["error"] and f0["status"] != "fail" else jsdump(f0["actual"])
            line += f"; first failure {f0['id']}: expected {jsdump(f0['expected'])}, got {got}"
    else:
        line = "Tests: not run (client did not send results)"
    issues = evaluation["issues"]
    key = (issues[0]["explanation"] if issues else sc["key_concepts"]["justification"]).strip()
    q = evaluation["next_hint"]["socratic_question"]
    nxt = evaluation["what_to_try_next"]
    return (f"Score: {overall}/100\n\n"
            f"Correctness: {line}. {sc['correctness']['justification']}\n\n"
            f"Key Concepts: {key} {q}".rstrip() + "\n\n"
            f"Edge Cases: {sc['edge_cases']['justification']}\n\n"
            f"Code Quality: {sc['code_quality']['justification']}\n\n"
            "Suggestions for Improvement:\n"
            f"1. {evaluation['next_hint']['text']}\n"
            f"2. {nxt[0] if len(nxt) > 0 else evaluation['encouragement']}\n"
            f"3. {nxt[1] if len(nxt) > 1 else 'Re-run the tests after each change.'}")


def ai_block(judge, jr: JudgeResult | None) -> dict:
    if judge is None:
        reason = degraded_reason()
        return {"enabled": False, "degraded": True, "reason": reason, "message": USER_MESSAGES[reason],
                "model": None, "usage": None}
    if jr is None or not jr.ok:
        reason = jr.reason if jr else "unexpected"
        return {"enabled": True, "degraded": True, "reason": reason, "message": USER_MESSAGES.get(reason, USER_MESSAGES["unexpected"]),
                "model": (jr.model if jr else None) or getattr(judge, "model", None), "usage": (jr.usage if jr else None) or dict(EMPTY_USAGE)}
    return {"enabled": True, "degraded": False, "reason": None, "message": None, "model": jr.model or getattr(judge, "model", None),
            "usage": dict(jr.usage or EMPTY_USAGE)}


def _static_detail(ev: dict) -> str:
    st = ev["static"]
    checks = {c["id"]: c for c in st["checks"]}
    if st["compile_failed"]:
        return st["syntax_detail"] or "code did not compile"
    parts = []
    if ev["mode"] == "tests":
        parts.append("compiled")
        parts.append("entry found")
    else:
        parts.append("no browser results")
        parts.append("entry found" if checks["S01"]["status"] == "pass" else f"entry function {checks['S01']['detail'] or 'not found'}")
    n = checks["S04"]["detail"].split(" ")[0]
    parts.append(f"{n} functions")
    parts.append("recursion present" if checks["S05"]["status"] == "pass" else "no recursion detected")
    if checks["S06"]["status"] == "info":
        parts.append("mutates input nodes")
    return "; ".join(parts)


def _postcheck_detail(verdict: str, guardrails: dict, degraded_mode: bool) -> str:
    parts = []
    if degraded_mode:
        parts.append(f"rule-based feedback; verdict {verdict} from evidence")
    else:
        vm = guardrails["verdict_model"]
        parts.append(f"verdict {verdict} ({'judge agreed' if not guardrails['verdict_overridden'] else 'judge said ' + vm})")
    from_tests = [a for a in guardrails["scores_adjusted"] if a["reason"] == "set from test evidence"]
    if from_tests:
        parts.append(" and ".join(f"{a['dim'].replace('_', ' ')} {a['to']}" for a in from_tests) + " set from tests")
    for a in guardrails["scores_adjusted"]:
        if a["reason"] != "set from test evidence":
            parts.append(f"{a['dim']} {a['from']} -> {a['to']} ({a['reason']})")
    parts.append(f"{guardrails['issues_dropped']} issues dropped")
    parts.append("hint kept" if not guardrails["hint_replaced"] else f"hint replaced ({guardrails['hint_replaced_reason']})")
    if guardrails["leaks_redacted"]:
        parts.append(f"{guardrails['leaks_redacted']} leaking sentence(s) redacted")
    return "; ".join(parts)


# --------------------------------------------------------------------------- evaluation

def run_evaluation(challenge: Challenge, req: EvalRequest, judge, *, request_id: str = "", client_ip: str = "-") -> dict:
    t_all = time.perf_counter()
    trace = []
    t = time.perf_counter()
    hints = ",".join(str(h) for h in req.hints_used) or "none"
    trace.append(_stage("validate", "ok", _ms(t), f"{challenge.id}, attempt {req.attempt}, hints used: {hints}"))

    t = time.perf_counter()
    ev = build_evidence(challenge, req.code, req.client_results)
    static_ms = _ms(t)
    trace.append(_stage("static_checks", "error" if ev["static"]["compile_failed"] else "ok", static_ms, _static_detail(ev)))
    s = ev["summary"]
    if ev["mode"] == "tests" and ev["static"]["compile_failed"]:
        trace.append(_stage("tests", "skipped", 0, "no tests: the code did not load in the browser"))
    elif ev["mode"] == "tests":
        trace.append(_stage("tests", "ok", 0, f"{s['passed']}/{s['total']} pass (browser harness v{challenge.harness_version}, "
                                            "recomputed from server expected values)"))
    else:
        trace.append(_stage("tests", "skipped", 0, "no evidence: legacy client" if not ev["evidence_note"] else f"no evidence: {ev['evidence_note']}"))

    t = time.perf_counter()
    cards = retrieve_cards(challenge, ev)
    if cards:
        trace.append(_stage("retrieval", "ok", _ms(t), "cards: " + ", ".join(f"{c['card_id']} ({c['similarity']:.2f})" for c in cards)))
    elif ev["mode"] != "tests" or s["executed"] == 0:
        trace.append(_stage("retrieval", "skipped", _ms(t), "no cards: no test evidence"))
    elif s["passed"] == s["total"]:
        trace.append(_stage("retrieval", "skipped", _ms(t), "no cards: all tests pass"))
    else:
        trace.append(_stage("retrieval", "ok", _ms(t), "no cards matched the failing set"))

    verdict = derive_verdict(ev)
    level = expected_level(req.attempt, verdict)
    jr: JudgeResult | None = None
    submission = None
    if judge is None:
        reason = degraded_reason()
        trace.append(_stage("judge", "skipped", 0, "EVAL_AI_DISABLED=1" if reason == "disabled" else "ANTHROPIC_API_KEY not configured"))
    else:
        submission = build_submission_message(challenge, ev, cards, req.attempt, req.hints_used, req.previous, req.learner_state, level)
        jr = judge.evaluate(challenge, submission, ev=ev, cards=cards, level=level, attempt=req.attempt, hints_used=req.hints_used)
        if jr.ok:
            u = jr.usage or EMPTY_USAGE
            trace.append(_stage("judge", "ok", jr.ms, f"{jr.model} effort={getattr(judge, 'effort', '-')} in={u.get('input_tokens', 0)} "
                                                       f"out={u.get('output_tokens', 0)} cache_read={u.get('cache_read_input_tokens', 0)} "
                                                       f"cache_write={u.get('cache_creation_input_tokens', 0)} stop={jr.stop_reason}"))
        else:
            trace.append(_stage("judge", "degraded", jr.ms, f"{jr.reason}: {jr.user_message}"))

    t = time.perf_counter()
    degraded_mode = jr is None or not jr.ok
    if degraded_mode:
        evaluation, guardrails = degraded.build(challenge, ev, cards, req.attempt, req.hints_used)
    else:
        evaluation, guardrails = postprocess(jr.data, ev, challenge, req.attempt, cards, req.code, req.hints_used)
    overall = overall_score(evaluation["scores"], challenge.rubric)
    trace.append(_stage("postcheck", "ok", _ms(t), _postcheck_detail(verdict, guardrails, degraded_mode)))

    tests = tests_block(challenge, ev)
    ai = ai_block(judge, jr)
    total_ms = _ms(t_all)
    response = {
        "ok": True, "request_id": request_id, "challenge_id": challenge.id, "attempt": req.attempt,
        "evaluation_id": str(uuid.uuid4()), "verdict": verdict, "overall": overall, "evaluation": evaluation,
        "tests": tests, "retrieval": public_retrieval(cards),
        "pipeline": {"trace": trace, "guardrails": guardrails}, "ai": ai,
        "solution_unlocked": verdict == "PASS" or req.attempt >= 4,
        "response": render_legacy_text(evaluation, tests, overall),
    }
    u = (jr.usage if jr else None) or {}
    logger.info(
        "evaluation request_id=%s route=evaluate challenge=%s attempt=%s hints=%s code_sha=%s mode=%s tests=%s/%s verdict=%s "
        "verdict_model=%s overall=%s adjusted=%s issues_dropped=%s hint_replaced=%s leaks=%s retrieval=%s judge=%s judge_ms=%s "
        "anthropic_request_id=%s model=%s in=%s out=%s cache_read=%s cache_write=%s stop=%s degraded=%s total_ms=%s ip=%s",
        request_id, challenge.id, req.attempt, hints, ev["code_sha256"][:12], ev["mode"], s["passed"], s["total"], verdict,
        guardrails["verdict_model"], overall, ",".join(a["dim"] for a in guardrails["scores_adjusted"]) or "-",
        guardrails["issues_dropped"], guardrails["hint_replaced_reason"] or "-", guardrails["leaks_redacted"],
        ",".join(c["card_id"] for c in cards) or "-",
        "skipped" if judge is None else ("ok" if jr and jr.ok else "failed"), jr.ms if jr else 0,
        (jr.anthropic_request_id if jr else None) or "-", ai["model"] or "-",
        u.get("input_tokens", 0), u.get("output_tokens", 0), u.get("cache_read_input_tokens", 0), u.get("cache_creation_input_tokens", 0),
        (jr.stop_reason if jr else None) or "-", ai["reason"] or "-", total_ms, client_ip)
    return response


# --------------------------------------------------------------------------- tutor (A5)

def raise_level(level: str, verdict: str) -> str:
    """One level up, capped at near_explicit unless the verdict is PASS (extension stays extension)."""
    if level == "extension":
        return "extension"
    idx = HINT_LEVELS.index(level)
    cap = HINT_LEVELS.index("extension") if verdict == "PASS" else HINT_LEVELS.index("near_explicit")
    return HINT_LEVELS[min(idx + 1, cap)]


def _degraded_tutor(challenge: Challenge, tut: TutorRequest, ev: dict, cards, base_level: str) -> dict:
    if tut.mode == "explain_problem":
        ex = challenge.examples[0]
        answer = f"{challenge.summary} Example: {ex.input} -> {ex.output}. {ex.explanation}"
        return {"answer": answer[:CAP_ANSWER], "hint_level": base_level, "socratic_question": "", "redirected": False}
    if tut.mode == "complexity":
        return {"answer": "Not analysed (AI tutor unavailable).", "hint_level": base_level, "socratic_question": "", "redirected": False}
    if tut.mode == "explain_step":
        caption = str((tut.step or {}).get("caption") or "").strip()
        answer = (caption + " " + STEP_UNAVAILABLE).strip()
        return {"answer": answer[:CAP_ANSWER], "hint_level": base_level, "socratic_question": "", "redirected": False}
    level = raise_level(base_level, derive_verdict(ev))
    fb = fallback_hint(level, cards, challenge, ev)
    return {"answer": fb["text"][:CAP_ANSWER], "hint_level": level, "socratic_question": fb["question"][:CAP_TUTOR_QUESTION], "redirected": False}


def run_tutor(challenge: Challenge, req: EvalRequest, tut: TutorRequest, judge, *, request_id: str = "", client_ip: str = "-"):
    """Return ``(body, http_status, retry_after)``; a failed judge call maps to the 4.4 HTTP codes."""
    t_all = time.perf_counter()
    ev = build_evidence(challenge, req.code, req.client_results)
    cards = retrieve_cards(challenge, ev)
    verdict = derive_verdict(ev)
    base_level = expected_level(req.attempt, verdict)
    max_level = raise_level(base_level, verdict) if tut.stuck else base_level
    jr: JudgeResult | None = None
    replaced = False

    if judge is None:
        out = _degraded_tutor(challenge, tut, ev, cards, base_level)
    else:
        submission = build_submission_message(challenge, ev, cards, req.attempt, req.hints_used, req.previous, req.learner_state, base_level)
        # user (submission) -> [assistant: the structurally validated evaluation echo] -> user (tutor turn). Prior
        # exchanges ride inside the tutor turn as escaped <previous_turn> data: history[].answer is learner text
        # and must never become an assistant turn the model believes it wrote.
        messages = [submission_message(submission)]
        if tut.evaluation:
            messages.append({"role": "assistant", "content": canonical_json(strip_server_fields(tut.evaluation))})
        messages.append({"role": "user", "content": build_tutor_turn(tut.mode, tut.question, tut.selection, base_level, tut.stuck,
                                                                     step=tut.step, history=tut.history)})
        jr = judge.tutor(challenge, messages, ev=ev, cards=cards, level=base_level, tutor=tut.as_dict(), attempt=req.attempt)
        if not jr.ok:
            logger.info("evaluation request_id=%s route=tutor challenge=%s attempt=%s mode=%s judge=failed reason=%s judge_ms=%s "
                        "anthropic_request_id=%s total_ms=%s ip=%s", request_id, challenge.id, req.attempt, tut.mode, jr.reason,
                        jr.ms, jr.anthropic_request_id or "-", _ms(t_all), client_ip)
            body = {"ok": False, "request_id": request_id, "error": {"code": jr.reason, "message": jr.user_message},
                    "response": f"Error: {jr.user_message}", "ai": ai_block(judge, jr)}
            return body, jr.http_status or 500, jr.retry_after
        data = jr.data if isinstance(jr.data, dict) else {}
        answer = str(data.get("answer") or "").strip()
        q = str(data.get("socratic_question") or "").strip()
        hl = data.get("hint_level")
        windows = leak_windows(challenge, req.code, max_level)
        # 7.4 leak guard + the prose code guard (a fenced block the level forbids, or a whole function) -> decline
        if not answer or leaks(answer, windows) or prose_code_guard_fails(answer, max_level):
            fb = fallback_hint(max_level, cards, challenge, ev)
            answer = DECLINE_PREFIX + fb["text"]
            replaced = True
        if q and leaks(q, windows):
            fb = fallback_hint(max_level, cards, challenge, ev)
            q = fb["question"]
        if hl not in HINT_LEVELS or HINT_LEVELS.index(hl) > HINT_LEVELS.index(max_level):
            hl = max_level
        out = {"answer": answer[:CAP_ANSWER], "hint_level": hl, "socratic_question": q[:CAP_TUTOR_QUESTION],
               "redirected": bool(data.get("redirected", False))}

    body = {"ok": True, "request_id": request_id, **out, "ai": ai_block(judge, jr), "response": out["answer"]}
    u = (jr.usage if jr else None) or {}
    logger.info("evaluation request_id=%s route=tutor challenge=%s attempt=%s mode=%s selection=%s step=%s stuck=%s level=%s "
                "answer_replaced=%s judge=%s judge_ms=%s anthropic_request_id=%s model=%s in=%s out=%s cache_read=%s "
                "cache_write=%s degraded=%s total_ms=%s ip=%s",
                request_id, challenge.id, req.attempt, tut.mode,
                f"{tut.selection['start_line']}-{tut.selection['end_line']}" if tut.selection else "-",
                f"{tut.step['index']}/{tut.step['total']}" if tut.step else "-", tut.stuck,
                out["hint_level"], replaced, "skipped" if judge is None else "ok", jr.ms if jr else 0,
                (jr.anthropic_request_id if jr else None) or "-", body["ai"]["model"] or "-",
                u.get("input_tokens", 0), u.get("output_tokens", 0), u.get("cache_read_input_tokens", 0),
                u.get("cache_creation_input_tokens", 0), body["ai"]["reason"] or "-", _ms(t_all), client_ip)
    return body, 200, None
