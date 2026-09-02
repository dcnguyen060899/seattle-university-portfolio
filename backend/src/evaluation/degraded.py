"""Degraded feedback (spec 7.6): the evaluation object built from evidence and retrieved cards only.

Used when no judge is configured, when the model call failed, and for the deterministic parts of the
tutor's degraded answers.  The scores go through the same caps as the judge's (7.2) with
``source: "heuristic"`` for the judge-owned dimensions.  Issues are grouped per misconception card
(``group_test_issues``): one issue per card with one evidence chip per failing test, not one issue per test.
"""
from __future__ import annotations

from .evidence import first_failed_test
from .postcheck import MAX_ISSUES, compute_scores, derive_verdict, expected_level, fallback_hint
from .prompts import fmt_test_input, jsdump
from .registry import TAG_DIMENSION, TAG_LABELS, Challenge

ENCOURAGEMENT = {
    "PASS": "Every test passes; that is a complete solution.",
    "PARTIAL": "Part of the logic already works; the failing tests point at one specific idea to fix.",
    "FAIL": "The tests give you concrete inputs to trace; start with the first one.",
    "ERROR": "Getting the code to run is the first step; the error message tells you where to look.",
    "UNVERIFIED": "The tests could not run here; run them in the page to get concrete evidence.",
}
NOT_ANALYSED = "Not analysed (AI tutor unavailable)."


def _got(row: dict) -> str:
    if row["status"] == "timeout":
        return "no result (the test timed out)"
    if row["status"] == "error" or row.get("error"):
        return "an error: " + (row.get("error") or "unknown error")
    return jsdump(row["actual"])


def heuristic_scores(ev: dict, cards) -> dict:
    code = ev["code"]
    s04 = any(c["id"] == "S04" and c["status"] == "pass" for c in ev["static"]["checks"])
    has_comments = "//" in code
    longest = max((len(line) for line in code.split("\n")), default=0)
    key = max(30, 100 - 25 * len(cards))
    eff = 20 if ev["summary"]["timed_out"] else 75
    quality = 55 + 10 * int(s04) + 10 * int(has_comments) + 10 * int(longest <= 120)
    unverified = ev["mode"] != "tests" or ev["summary"]["executed"] == 0
    base = 0 if ev["static"]["compile_failed"] else (50 if unverified else 0)
    return {
        "correctness": {"score": base, "justification": "Tests did not run; the estimate is capped at 60." if unverified else ""},
        "edge_cases": {"score": base, "justification": "Tests did not run; the estimate is capped at 60." if unverified else ""},
        "key_concepts": {"score": key, "justification": f"{len(cards)} misconception card(s) retrieved from the failing tests."
                         if cards else "No misconception card matched the evidence."},
        "efficiency": {"score": eff, "justification": "Not analysed: AI tutor unavailable." + (" A test timed out." if ev["summary"]["timed_out"] else "")},
        "code_quality": {"score": quality, "justification": f"Heuristic: helper function {'present' if s04 else 'missing'}, "
                         f"comments {'present' if has_comments else 'absent'}, longest line {longest} chars."},
    }


def group_test_issues(challenge: Challenge, ev: dict, cards, max_issues: int = MAX_ISSUES) -> list:
    """One issue per misconception card (every failing test that resolves to it becomes an evidence chip, in
    catalog order) plus one "Wrong result on {id}" issue per failing test that matches no card.

    Groups are collected over ALL failing rows first, so a card's chip list is complete even when the
    ``max_issues`` cap drops later groups; issues are emitted in order of their first test in the catalog.
    """
    groups: dict = {}
    for row in ev["tests"]:
        if row["status"] not in ("fail", "error", "timeout"):
            continue
        card = next((c["card"] for c in cards if row["id"] in c["matched_by"]), None)
        key = ("card", card.id) if card is not None else ("test", row["id"])
        dim = "edge_case" if TAG_DIMENSION.get(row["tag"]) == "edge_cases" else "correctness"
        g = groups.get(key)
        if g is None:
            if card is not None:
                title, explanation = card.title, f"{card.symptom} {card.why}"
            else:
                tc = challenge.test_by_id[row["id"]]
                title = f"Wrong result on {row['id']}"
                explanation = (f"Expected {jsdump(row['expected'])} but your function returned {_got(row)} "
                               f"for input {fmt_test_input(challenge, tc)}.")
            groups[key] = {"title": title, "category": dim, "explanation": explanation, "refs": [row["id"]]}
        else:
            g["refs"].append(row["id"])
            if dim == "correctness":
                g["category"] = "correctness"          # a group that touches a correctness test is a correctness issue
    issues = []
    for g in list(groups.values())[:max_issues]:
        issues.append({"title": g["title"], "category": g["category"], "severity": "high" if not issues else "medium",
                       "explanation": g["explanation"], "evidence": [{"kind": "test", "ref": r} for r in g["refs"]]})
    return issues


def build(challenge: Challenge, ev: dict, cards, attempt: int, hints_used=()):
    """Return ``(evaluation, guardrails)`` built from evidence only."""
    verdict = derive_verdict(ev)
    level = expected_level(attempt, verdict)
    s = ev["summary"]
    first = first_failed_test(ev)
    compile_failed = ev["static"]["compile_failed"]

    if compile_failed:
        summary = f"Your code did not run: {ev['static']['syntax_detail'] or 'the harness could not load your code'}."
    elif ev["mode"] != "tests" or s["executed"] == 0:
        summary = "Tests were not run for this submission, so the result is unverified."
    elif s["passed"] == s["total"]:
        summary = f"All {s['total']} tests pass."
    else:
        summary = f"{s['passed']}/{s['total']} tests pass."
        if first:
            summary += f" {first['name']}: expected {jsdump(first['expected'])}, got {_got(first)}."

    scores, adjusted = compute_scores(heuristic_scores(ev, cards), ev, verdict, [], challenge.rubric, judge_source="heuristic")

    issues = []
    if compile_failed:
        failed_static = [c["id"] for c in ev["static"]["checks"] if c["status"] == "fail"]
        issues.append({"title": "Your code did not run", "category": "syntax", "severity": "high",
                       "explanation": summary + " Fix that first; the tests only run once the code loads.",
                       "evidence": [{"kind": "static", "ref": failed_static[0] if failed_static else "S03"}]})
    else:
        issues = group_test_issues(challenge, ev, cards)

    strengths = []
    for tag, agg in ev["by_tag"].items():
        if agg["executed"] and agg["passed"] == agg["total"]:
            strengths.append(f"All {agg['total']} {TAG_LABELS.get(tag, tag)} tests pass.")
        if len(strengths) >= 3:
            break
    if not strengths and any(c["id"] == "S04" and c["status"] == "pass" for c in ev["static"]["checks"]):
        strengths.append("You have the two-function structure in place; that is the right skeleton.")

    hint = fallback_hint(level, cards, challenge, ev, hints_used)
    if verdict == "PASS":
        what_next = [challenge.stretch_goal]
        if challenge.next_challenge_id:
            what_next.append(f"Move on to the {challenge.next_challenge_id} challenge and reuse your search skeleton.")
    elif verdict == "ERROR":
        what_next = ["Fix the reported error, then run the tests again (Ctrl+Enter)."]
    elif verdict == "UNVERIFIED":
        what_next = ["Run the tests in the page (Ctrl+Enter) to get concrete evidence."]
    else:
        what_next = [f"Expand {first['id']} below and trace it by hand." if first else "Expand the first failing test and trace it by hand.",
                     "Re-run the tests (Ctrl+Enter) after each change."]

    evaluation = {
        "verdict": verdict, "summary": summary[:500], "progress_note": "", "scores": scores, "strengths": strengths[:3],
        "issues": issues, "misconception_tags": [c["card_id"] for c in cards][:3],
        "complexity": {"time": "", "space": "", "note": NOT_ANALYSED},
        "next_hint": {"level": level, "text": hint["text"], "socratic_question": hint["question"], "source": hint["source"]},
        "what_to_try_next": [w[:200] for w in what_next][:3], "encouragement": ENCOURAGEMENT[verdict], "flags": [],
    }
    guardrails = {"verdict_overridden": False, "verdict_model": verdict, "scores_adjusted": adjusted, "issues_dropped": 0,
                  "hint_replaced": False, "hint_replaced_reason": "", "leaks_redacted": 0, "flags": []}
    return evaluation, guardrails
