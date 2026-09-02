"""Post-checks (spec 7.1-7.7 / 10.1 test_postcheck.py)."""
import copy

import pytest

from conftest import make_client_results
from evaluation.evidence import build_evidence
from evaluation.postcheck import (code_guard_fails, compute_scores, derive_verdict, enforce_hint, expected_level,
                                  fallback_hint, filter_issues, leak_windows, leaks, overall_score, postprocess,
                                  redact, sanitize_evaluation, strip_server_fields)
from evaluation.retrieval import retrieve_cards


def _ev(challenge, code, actuals=None, **kw):
    return build_evidence(challenge, code, make_client_results(challenge, code, actuals, **kw))


def _judge_scores(**over):
    base = {"correctness": 62, "edge_cases": 90, "key_concepts": 100, "efficiency": 90, "code_quality": 90}
    base.update(over)
    return {d: {"score": v, "justification": f"j-{d}"} for d, v in base.items()}


# --------------------------------------------------------------------------- verdict

def test_verdict_from_evidence(fuzzy, old_reference, good_payload):
    ev = _ev(fuzzy, old_reference, {"fz-06": True})
    payload = copy.deepcopy(good_payload)
    payload["verdict"] = "PASS"
    evaluation, guardrails = postprocess(payload, ev, fuzzy, 1, retrieve_cards(fuzzy, ev), old_reference)
    assert evaluation["verdict"] == "PARTIAL" and guardrails["verdict_overridden"] is True and guardrails["verdict_model"] == "PASS"
    assert derive_verdict(build_evidence(fuzzy, old_reference, None)) == "UNVERIFIED"
    all_not_run = _ev(fuzzy, old_reference, omit=[t.id for t in fuzzy.tests])
    assert derive_verdict(all_not_run) == "UNVERIFIED"
    five = _ev(fuzzy, old_reference, omit=[t.id for t in fuzzy.tests[5:]])
    assert derive_verdict(five) == "PARTIAL"
    assert derive_verdict(_ev(fuzzy, old_reference, compile_ok=False, error_kind="syntax", compile_error="x")) == "ERROR"
    assert derive_verdict(_ev(fuzzy, old_reference)) == "PASS"
    assert derive_verdict(_ev(fuzzy, old_reference, {t.id: (not t.expected) for t in fuzzy.tests})) == "FAIL"
    all_error = _ev(fuzzy, old_reference, {t.id: ("error", "TypeError: x") for t in fuzzy.tests})
    assert derive_verdict(all_error) == "ERROR"


# --------------------------------------------------------------------------- scores

def test_scores_from_evidence_and_caps(fuzzy, old_reference):
    ev = _ev(fuzzy, old_reference, {"fz-06": True, "fz-15": True})           # 15/17; correctness 11/13, edge 4/4
    scores, adjusted = compute_scores(_judge_scores(), ev, "PARTIAL", [], fuzzy.rubric)
    assert scores["correctness"] == {"score": 85, "justification": "11 of 13 correctness tests pass (fz-06, fz-15 fail).", "source": "tests"}
    assert scores["edge_cases"]["score"] == 100 and scores["edge_cases"]["source"] == "tests"
    assert scores["key_concepts"]["score"] == 70 and scores["key_concepts"]["source"] == "judge"
    reasons = {a["dim"]: a for a in adjusted}
    assert reasons["correctness"] == {"dim": "correctness", "from": 62, "to": 85, "reason": "set from test evidence"}
    assert reasons["edge_cases"]["to"] == 100 and reasons["key_concepts"]["reason"] == "capped: core test failed"
    assert "efficiency" not in reasons and "code_quality" not in reasons

    low = _ev(fuzzy, old_reference, {t.id: (not t.expected) for t in fuzzy.tests[:12]})   # 5/17 pass
    scores, adjusted = compute_scores(_judge_scores(), low, "PARTIAL", [], fuzzy.rubric)
    assert all(scores[d]["score"] <= 60 for d in ("key_concepts", "efficiency", "code_quality"))
    assert {a["dim"]: a["reason"] for a in adjusted}["efficiency"] == "capped: fewer than half the tests pass"

    to = _ev(fuzzy, old_reference, {"fz-16": "timeout"})
    scores, adjusted = compute_scores(_judge_scores(), to, "PARTIAL", [], fuzzy.rubric)
    assert scores["efficiency"]["score"] == 20 and {a["dim"]: a["reason"] for a in adjusted}["efficiency"] == "capped: timeout"

    ok = _ev(fuzzy, old_reference)
    scores, adjusted = compute_scores(_judge_scores(key_concepts=40), ok, "PASS", [], fuzzy.rubric)
    assert scores["key_concepts"]["score"] == 70 and {a["dim"]: a["reason"] for a in adjusted}["key_concepts"] == "floor: all tests pass"
    assert scores["correctness"]["score"] == 100 and scores["edge_cases"]["justification"] == "All 4 edge-case tests pass."

    scores, adjusted = compute_scores(_judge_scores(), ok, "PASS", ["hardcoded_tests"], fuzzy.rubric)
    assert scores["correctness"]["score"] == 30 and scores["key_concepts"]["score"] == 30
    assert {a["dim"]: a["reason"] for a in adjusted}["correctness"] == "capped: hardcoded tests"

    err = _ev(fuzzy, old_reference, compile_ok=False, error_kind="syntax", compile_error="x")
    scores, adjusted = compute_scores(_judge_scores(), err, "ERROR", [], fuzzy.rubric)
    assert [scores[d]["score"] for d in ("correctness", "edge_cases", "key_concepts", "efficiency", "code_quality")] == [0, 0, 40, 30, 60]
    assert all(a["reason"] == "capped: code did not run" for a in adjusted)

    unv = build_evidence(fuzzy, old_reference, None)
    scores, adjusted = compute_scores(_judge_scores(correctness=90, edge_cases=10), unv, "UNVERIFIED", [], fuzzy.rubric)
    assert scores["correctness"]["score"] == 60 and scores["edge_cases"]["score"] == 10 and scores["key_concepts"]["score"] == 60
    assert scores["correctness"]["source"] == "judge"


def test_overall_arithmetic(fuzzy):
    scores = {"correctness": {"score": 85}, "edge_cases": {"score": 100}, "key_concepts": {"score": 55},
              "efficiency": {"score": 85}, "code_quality": {"score": 80}}
    # 0.45*85 + 0.15*100 + 0.20*55 + 0.05*85 + 0.15*80 = 38.25 + 15 + 11 + 4.25 + 12 = 80.5 -> 81 (half-up)
    assert overall_score(scores, fuzzy.rubric) == 81
    scores["code_quality"]["score"] = 70
    assert overall_score(scores, fuzzy.rubric) == 79


# --------------------------------------------------------------------------- issues

def test_issue_filter(fuzzy, old_reference):
    ev = _ev(fuzzy, old_reference, {"fz-06": True, "fz-15": True})
    ev["static"]["checks"][2]["status"] = "fail"                         # pretend S03 failed for the static-ref case
    issues = [
        {"title": "a", "category": "key_concept", "severity": "low", "explanation": "x", "evidence": [{"kind": "test", "ref": "fz-01"}, {"kind": "line", "ref": "3-4"}]},
        {"title": "b", "category": "correctness", "severity": "high", "explanation": "x", "evidence": [{"kind": "test", "ref": "fz-01"}]},
        {"title": "c", "category": "correctness", "severity": "medium", "explanation": "x", "evidence": [{"kind": "line", "ref": "99"}]},
        {"title": "d", "category": "syntax", "severity": "medium", "explanation": "x", "evidence": [{"kind": "static", "ref": "S03"}, {"kind": "static", "ref": "S04"}]},
        {"title": "e", "category": "correctness", "severity": "high", "explanation": "x", "evidence": [{"kind": "test", "ref": "fz-06"}]},
        {"title": "f", "category": "edge_case", "severity": "medium", "explanation": "x", "evidence": [{"kind": "line", "ref": "1"}]},
        {"title": "g", "category": "performance", "severity": "low", "explanation": "x", "evidence": [{"kind": "line", "ref": "0"}, {"kind": "line", "ref": "5-2"}]},
    ]
    kept, dropped = filter_issues(copy.deepcopy(issues), ev, "PARTIAL")
    assert [i["title"] for i in kept] == ["e", "d", "f", "a"] and dropped == 3
    assert kept[3]["evidence"] == [{"kind": "line", "ref": "3-4"}]
    assert kept[1]["evidence"] == [{"kind": "static", "ref": "S03"}]
    kept, dropped = filter_issues(copy.deepcopy(issues), ev, "PASS")
    assert [i["title"] for i in kept] == ["d", "a"] and dropped == 5
    kept, _ = filter_issues([dict(issues[0], evidence=[{"kind": "line", "ref": "1"}])] * 6, ev, "PARTIAL")
    assert len(kept) == 4


# --------------------------------------------------------------------------- leak guard

def test_leak_guard(fuzzy, old_reference, good_payload):
    ev = _ev(fuzzy, old_reference, {"fz-06": True, "fz-15": True})
    cards = retrieve_cards(fuzzy, ev)
    windows = leak_windows(fuzzy, old_reference)
    # 80 normalized chars of the reference helper body with no sentence terminator inside (the sentence splitter
    # of 7.4 is `(?<=[.!?])\s+`, so a `? 1 : 0` fragment would be cut in two)
    helper = "return here + countMismatches(p.left, q.left) + countMismatches(p.right, q.right);"
    assert leaks("Write this: " + helper, windows)
    own = "\n".join(old_reference.split("\n")[:3])
    assert not leaks("Your first lines are: " + own, windows)
    alt = "if (p.val !== q.val) budget -= 1; if (budget < 0) return -1; budget = remainingBudget(p.left, q.left, budget);"
    assert leaks("Try " + alt, windows)

    payload = copy.deepcopy(good_payload)
    payload["next_hint"]["text"] = "Use this helper: " + helper
    payload["summary"] = "Fifteen tests pass. Write " + helper + " there. Keep going."
    payload["strengths"].append("You could write " + helper)
    payload["what_to_try_next"].append("Copy " + alt)
    payload["issues"][0]["explanation"] = "Lines 24-25 copy the count. Compare with " + helper
    evaluation, guardrails = postprocess(payload, ev, fuzzy, 1, cards, old_reference)
    assert guardrails["hint_replaced"] and guardrails["hint_replaced_reason"] == "leak"
    assert evaluation["next_hint"]["source"] == "card" and evaluation["next_hint"]["level"] == "conceptual"
    assert evaluation["summary"] == "Fifteen tests pass. Keep going."
    assert len(evaluation["strengths"]) == 2 and len(evaluation["what_to_try_next"]) == 1
    assert evaluation["issues"][0]["explanation"] == "Lines 24-25 copy the count."
    assert guardrails["leaks_redacted"] == 2

    text, n = redact(helper, windows)
    assert text == "(part withheld: it quoted the solution)" and n == 1
    assert redact("", windows) == ("", 0)


# --------------------------------------------------------------------------- hint policy

def test_hint_level_and_code_guard(fuzzy, old_reference):
    assert [expected_level(a, "PARTIAL") for a in (1, 2, 3, 7)] == ["conceptual", "targeted", "near_explicit", "near_explicit"]
    assert expected_level(1, "PASS") == "extension"
    ev = _ev(fuzzy, old_reference, {"fz-06": True, "fz-15": True})
    cards = retrieve_cards(fuzzy, ev)
    windows = leak_windows(fuzzy, old_reference)

    h, reason = enforce_hint({"level": "targeted", "text": "Look at your function fuzzySameTree(p, q) on line 12.",
                              "socratic_question": "What does it return?"}, "targeted", fuzzy, ev, cards, windows)
    assert reason == "" and h["source"] == "judge" and h["text"].startswith("Look at your function")
    h, reason = enforce_hint({"level": "conceptual", "text": "Think:\n```js\nx = 1\n```", "socratic_question": "Why?"},
                             "conceptual", fuzzy, ev, cards, windows)
    assert reason == "code" and h["source"] == "card"
    h, reason = enforce_hint({"level": "conceptual", "text": "ok", "socratic_question": "q?"}, "targeted", fuzzy, ev, cards, windows)
    assert reason == "level" and h["level"] == "targeted"
    h, reason = enforce_hint({"level": "targeted", "text": "   ", "socratic_question": "q?"}, "targeted", fuzzy, ev, cards, windows)
    assert reason == "empty"
    two = "Steps:\n```js\nconst left = go(p.left, q.left);\nconst right = go(p.right, q.right);\n```"
    assert not code_guard_fails(two, "near_explicit")
    five = "```js\na\nb\nc\nd\ne\n```"
    assert code_guard_fails(five, "near_explicit") and code_guard_fails("function go(p, q) { return 1; }", "near_explicit")
    h, reason = enforce_hint({"level": "near_explicit", "text": two, "socratic_question": "no question mark"},
                             "near_explicit", fuzzy, ev, cards, windows)
    assert reason == "" and h["socratic_question"] == cards[0]["card"].question


def test_fallback_hint_uses_top_card(fuzzy, old_reference):
    ev = _ev(fuzzy, old_reference, {"fz-08": True, "fz-13": True})
    cards = retrieve_cards(fuzzy, ev)
    assert cards[0]["card_id"] == "structure_as_difference"
    fb = fallback_hint("conceptual", cards, fuzzy, ev)
    assert fb["source"] == "card" and fuzzy.card_by_id["structure_as_difference"].why in fb["text"]
    fb = fallback_hint("targeted", cards, fuzzy, ev)
    assert fb["text"].startswith("Look at fz-08 (shape mismatch is never fuzzed, even with budget 100 (page ex. 2)): expected false, your function returned true.")
    fb = fallback_hint("near_explicit", cards, fuzzy, ev)
    assert fb["text"].startswith(fuzzy.card_by_id["structure_as_difference"].fix_direction) and "Step by step:" in fb["text"]
    syn = _ev(fuzzy, old_reference, compile_ok=False, error_kind="syntax", compile_error="Unexpected token")
    fb = fallback_hint("conceptual", [], fuzzy, syn)
    assert fb["source"] == "syntax" and fb["text"].startswith("Your code did not run: syntax error: Unexpected token.")
    fb = fallback_hint("conceptual", [], fuzzy, ev)
    assert fb["source"] == "ladder" and fb["text"] == fuzzy.fallback_by_level["conceptual"].text
    fb = fallback_hint("extension", cards, fuzzy, ev)
    assert fb["source"] == "ladder" and fb["text"] == fuzzy.fallback_by_level["extension"].text
    # a ladder text already shown moves one level up
    fb = fallback_hint("near_explicit", [], fuzzy, ev, hints_used=[1, 2, 3])
    assert fb["text"] == fuzzy.hints[2].text                        # already at the top of the ladder
    fb = fallback_hint("near_explicit", cards, fuzzy, ev, hints_used=[3])
    assert "Step by step:" in fb["text"]


def test_unknown_tags_dropped(fuzzy, old_reference, good_payload):
    ev = _ev(fuzzy, old_reference, {"fz-06": True, "fz-15": True})
    payload = copy.deepcopy(good_payload)
    payload["misconception_tags"] = ["split_budget", "made_up", "split_budget", "none"]
    payload["flags"] = ["instructions_in_code", "bogus"]
    evaluation, guardrails = postprocess(payload, ev, fuzzy, 1, retrieve_cards(fuzzy, ev), old_reference)
    assert evaluation["misconception_tags"] == ["split_budget"] and evaluation["flags"] == ["instructions_in_code"]
    assert guardrails["flags"] == ["instructions_in_code"]
    assert evaluation["scores"]["key_concepts"]["source"] == "judge" and evaluation["next_hint"]["source"] == "judge"
    assert set(evaluation) == {"verdict", "summary", "progress_note", "scores", "strengths", "issues", "misconception_tags",
                               "complexity", "next_hint", "what_to_try_next", "encouragement", "flags"}


def test_postprocess_survives_garbage(fuzzy, old_reference):
    ev = _ev(fuzzy, old_reference, {"fz-06": True})
    evaluation, guardrails = postprocess({"verdict": 5, "scores": "no", "issues": "no", "next_hint": None}, ev, fuzzy, 3, [], old_reference)
    assert evaluation["verdict"] == "PARTIAL" and evaluation["next_hint"]["level"] == "near_explicit"
    assert guardrails["verdict_model"] == "UNKNOWN" and guardrails["hint_replaced_reason"] == "level"


# --------------------------------------------------------------------------- echoed evaluation (A2)

def test_sanitize_evaluation(fuzzy, old_reference, good_payload):
    ev = _ev(fuzzy, old_reference, {"fz-06": True, "fz-15": True})
    evaluation, _ = postprocess(copy.deepcopy(good_payload), ev, fuzzy, 1, retrieve_cards(fuzzy, ev), old_reference)
    clean = sanitize_evaluation(evaluation, fuzzy)
    assert clean is not None and "source" not in clean["next_hint"] and "source" not in clean["scores"]["correctness"]
    assert clean == strip_server_fields(evaluation)
    bad = copy.deepcopy(evaluation)
    bad["scores"]["correctness"]["score"] = "high"
    assert sanitize_evaluation(bad, fuzzy) is None
    bad = copy.deepcopy(evaluation)
    bad["next_hint"]["level"] = "ultra"
    assert sanitize_evaluation(bad, fuzzy) is None
    bad = copy.deepcopy(evaluation)
    bad["issues"][0]["evidence"] = [{"kind": "test", "ref": 5}]
    assert sanitize_evaluation(bad, fuzzy) is None
    assert sanitize_evaluation("nope", fuzzy) is None and sanitize_evaluation({}, fuzzy) is None
    long = copy.deepcopy(evaluation)
    long["summary"] = "x" * 2000
    long["misconception_tags"] = ["split_budget", "made_up", "none", "global_counter", "root_must_match"]
    clean = sanitize_evaluation(long, fuzzy)
    assert len(clean["summary"]) == 500 and clean["misconception_tags"] == ["split_budget", "none", "global_counter"]
