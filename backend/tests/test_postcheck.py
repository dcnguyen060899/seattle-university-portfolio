"""Post-checks (spec 7.1-7.7 / 10.1 test_postcheck.py)."""
import copy

import pytest

from conftest import make_client_results
from evaluation.evidence import build_evidence
from evaluation.postcheck import (LEAK_WINDOW, _norm, code_guard_fails, compute_scores, derive_verdict, enforce_hint,
                                  expected_level, fallback_hint, filter_issues, leak_windows, leaks, overall_score,
                                  postprocess, prose_code_guard_fails, redact, sanitize_evaluation, strip_server_fields)
from evaluation.registry import BY_ID
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


# --------------------------------------------------------------------------- leak guard vs. punctuation (fix round 1)

def _code_lines(src):
    return [ln.strip() for ln in src.splitlines() if ln.strip() and not ln.strip().startswith("//")]


def _pieces(lines, limit):
    """Cut every line at spaces into pieces shorter than ``limit`` characters."""
    out = []
    for ln in lines:
        cur = ""
        for tok in ln.split(" "):
            if cur and len(cur) + 1 + len(tok) >= limit:
                out.append(cur)
                cur = tok
            else:
                cur = (cur + " " + tok).strip()
        if cur:
            out.append(cur)
    return out


def _long_reference_lines(challenge, src):
    return [ln for ln in _code_lines(src) if len(_norm(ln)) >= LEAK_WINDOW and _norm(ln) not in _norm(challenge.starter_code)]


@pytest.mark.parametrize("cid", ["countSubtrees", "fuzzySubtree", "mirrorSubtree"])
def test_leak_guard_survives_sentence_punctuation(cid):
    """The reference written one line per sentence, in pieces shorter than a window, in backticks, bullets or a
    numbered list leaks as a whole and its lines are withheld one by one (no single sentence holds a window)."""
    ch = BY_ID[cid]
    windows = leak_windows(ch, ch.starter_code, "conceptual")
    for src in (ch.reference_solution, *ch.accepted_alternatives):
        lines = _code_lines(src)
        variants = {
            "per_line": " ".join(ln + "." for ln in lines),
            "pieces<30": " ".join(p + "." for p in _pieces(lines, 30)),
            "pieces<20": " ".join(p + "." for p in _pieces(lines, 20)),
            "backticks": " ".join("`" + ln + "`." for ln in lines),
            "bullets": "\n".join("- `" + ln + "`" for ln in lines),
            "numbered": "\n".join(f"{i + 1}. {ln}" for i, ln in enumerate(lines)),
            "quoted": " ".join('"' + ln + '"' for ln in lines),
        }
        for name, text in variants.items():
            assert leaks(text, windows), (cid, name)
            kept, n = redact(text, windows)
            assert n >= 1 and not leaks(kept, windows), (cid, name)
            for ln in _long_reference_lines(ch, src):
                assert _norm(ln) not in _norm(kept), (cid, name, ln)
    # a sentence shorter than a window still leaks when it is a piece of a longer quoted run
    kept, n = redact("Then write: return here +. countMismatches(p.left, q.left) +. countMismatches(p.right, q.right).", windows) \
        if cid == "fuzzySubtree" else ("", 0)
    if cid == "fuzzySubtree":
        assert n == 3 and kept == "(part withheld: it quoted the solution)"
    # prose that only names identifiers is untouched, whatever the punctuation
    prose = "Compare `root` with `subRoot` first. Then, if that fails, search `root.left`; finally search `root.right`!"
    assert not leaks(prose, windows) and redact(prose, windows) == (prose, 0)


def test_leak_guard_per_line_through_postprocess(fuzzy, old_reference, good_payload):
    ev = _ev(fuzzy, old_reference, {"fz-06": True, "fz-15": True})
    cards = retrieve_cards(fuzzy, ev)
    per_line = " ".join(ln + "." for ln in _code_lines(fuzzy.reference_solution))
    payload = copy.deepcopy(good_payload)
    payload["summary"] = ("Fifteen tests pass. " + per_line)[:500]
    payload["issues"][0]["explanation"] = "Lines 24-25 copy the count. " + per_line
    payload["what_to_try_next"] = ["Write " + per_line[:190]]
    payload["strengths"] = ["Your search is fine. " + " ".join(p + "." for p in _pieces(_code_lines(fuzzy.reference_solution), 30))[:170]]
    payload["next_hint"]["text"] = " ".join(p + "." for p in _pieces(_code_lines(fuzzy.reference_solution), 25))[:400]
    evaluation, guardrails = postprocess(payload, ev, fuzzy, 1, cards, old_reference)
    windows = leak_windows(fuzzy, old_reference, "conceptual")
    for text in (evaluation["summary"], evaluation["issues"][0]["explanation"], evaluation["progress_note"],
                 evaluation["encouragement"], *evaluation["strengths"], *evaluation["what_to_try_next"]):
        assert not leaks(text, windows)
        for ln in _long_reference_lines(fuzzy, fuzzy.reference_solution):
            assert _norm(ln) not in _norm(text)
    assert evaluation["summary"].startswith("Fifteen tests pass.") and "countMismatches(root, subRoot)" not in evaluation["summary"]
    assert evaluation["issues"][0]["explanation"].startswith("Lines 24-25 copy the count.")
    assert evaluation["what_to_try_next"] == [] and evaluation["strengths"] == []
    assert guardrails["hint_replaced"] and guardrails["hint_replaced_reason"] == "leak"
    assert guardrails["leaks_redacted"] >= 10


def test_prose_code_guard(fuzzy, old_reference, good_payload):
    """A whole function (fenced or not, even renamed so no window matches) is withheld from prose at guarded levels;
    a quoted header of the learner's own code and short snippets at near_explicit pass; nothing is guarded on PASS."""
    renamed = ("function fuzzy(a, b, k = 1) {\n  if (!b) return true;\n  if (!a) return false;\n"
               "  if (diff(a, b) <= k) return true;\n  return fuzzy(a.left, b, k) || fuzzy(a.right, b, k);\n}")
    fenced = "Try this:\n```js\n" + renamed + "\n```\nThen rerun fz-06."
    header = "Your `function fuzzySameTree(p, q, maxDifferences, differences = 0) {` on line 13 copies the budget."
    two = "Steps:\n```js\nconst left = go(p.left, q.left);\nconst right = go(p.right, q.right);\n```\nThen combine them."
    assert prose_code_guard_fails(renamed, "conceptual") and prose_code_guard_fails(fenced, "targeted")
    assert prose_code_guard_fails(fenced, "near_explicit") and prose_code_guard_fails(renamed, "near_explicit")
    assert not prose_code_guard_fails(fenced, "extension") and not prose_code_guard_fails(renamed, None)
    assert not prose_code_guard_fails(header, "conceptual") and not prose_code_guard_fails(two, "near_explicit")
    assert prose_code_guard_fails(two, "targeted")

    ev = _ev(fuzzy, old_reference, {"fz-06": True, "fz-15": True})
    cards = retrieve_cards(fuzzy, ev)
    windows = leak_windows(fuzzy, old_reference, "conceptual")
    assert not leaks(renamed, windows)                                  # windows alone would let the rename through
    assert redact(fenced, windows, "conceptual") == ("Try this: Then rerun fz-06.", 1)
    # an unfenced function is one sentence unit together with the prose around it (no terminator + space inside it)
    assert redact("Here it is. " + renamed + " Done. That is all.", windows, "targeted") == ("Here it is. That is all.", 1)
    assert redact("Here: " + renamed + " That is all.", windows, "targeted") == ("(part withheld: it quoted the solution)", 1)
    assert redact(header, windows, "conceptual") == (header, 0)
    assert redact(two, windows, "near_explicit") == (two.replace("Steps:\n", "Steps: ").replace("\n```\nThen", "\n``` Then"), 0)
    assert redact(fenced, windows, "extension")[1] == 0 and redact(fenced, windows)[1] == 0
    assert redact(fenced, windows, "near_explicit") == ("Try this: Then rerun fz-06.", 1)  # 5 code lines > 3

    payload = copy.deepcopy(good_payload)
    payload["summary"] = fenced
    payload["issues"][0]["explanation"] = "Lines 24-25 copy the count. " + renamed + " Done. That fixes fz-06."
    payload["encouragement"] = header
    payload["what_to_try_next"] = [renamed[:200], "Trace fz-06 by hand."]
    evaluation, guardrails = postprocess(payload, ev, fuzzy, 1, cards, old_reference)
    assert evaluation["summary"] == "Try this: Then rerun fz-06."
    assert evaluation["issues"][0]["explanation"] == "Lines 24-25 copy the count. That fixes fz-06."
    assert evaluation["encouragement"] == header and evaluation["what_to_try_next"] == ["Trace fz-06 by hand."]
    assert guardrails["leaks_redacted"] == 2 and not guardrails["hint_replaced"]
    # on PASS (extension) the prose keeps its code unless it quotes the reference
    ev_pass = _ev(fuzzy, old_reference)
    evaluation, guardrails = postprocess(payload, ev_pass, fuzzy, 1, retrieve_cards(fuzzy, ev_pass), old_reference)
    assert evaluation["verdict"] == "PASS" and "function fuzzy(a, b, k = 1)" in evaluation["summary"]
    assert guardrails["leaks_redacted"] == 0


def test_ladder_hints_are_not_leaks_at_their_level():
    """The ladder quotes the reference's key expressions at its own levels; the windows exclude what the page has
    unlocked by the current level and nothing more."""
    for cid in ("countSubtrees", "fuzzySubtree", "mirrorSubtree"):
        ch = BY_ID[cid]
        for level, unlocked in (("conceptual", 1), ("targeted", 2), ("near_explicit", 3), ("extension", 3)):
            windows = leak_windows(ch, ch.starter_code, level)
            for h in ch.hints:
                if h.level <= unlocked:
                    assert not leaks(h.text, windows), (cid, level, h.level)
            fb = ch.fallback_by_level[level]                       # the fallback used AT this level
            assert not leaks(fb.text, windows) and not leaks(fb.question, windows), (cid, level)
            for card in ch.card_by_id.values():
                assert not leaks(card.why, windows) and not leaks(card.question, windows), (cid, level, card.id)
                if unlocked >= 2:                                      # fix_direction feeds the targeted/near_explicit fallbacks
                    assert not leaks(card.fix_direction, windows), (cid, level, card.id)
    # a card's fix_direction that spells out a reference expression is still a leak at conceptual
    count = BY_ID["countSubtrees"]
    fix = count.card_by_id["no_recursive_search"].fix_direction
    assert leaks(fix, leak_windows(count, count.starter_code, "conceptual")) and leaks(fix, leak_windows(count, count.starter_code))
    assert not leaks(fix, leak_windows(count, count.starter_code, "targeted"))
    mirror = BY_ID["mirrorSubtree"]
    hint2 = next(h.text for h in mirror.hints if h.level == 2)
    assert leaks(hint2, leak_windows(mirror, mirror.starter_code, "conceptual"))      # hint 2 is still a leak at level 1
    assert leaks(hint2, leak_windows(mirror, mirror.starter_code))                    # and with no level at all
    assert not leaks(hint2, leak_windows(mirror, mirror.starter_code, "targeted"))
    assert not leaks(hint2, leak_windows(mirror, mirror.starter_code, "near_explicit"))
    # the reference itself is still a leak at every level
    for level in ("conceptual", "targeted", "near_explicit", "extension"):
        assert leaks(mirror.reference_solution, leak_windows(mirror, mirror.starter_code, level))
