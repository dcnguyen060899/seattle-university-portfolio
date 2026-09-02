"""Pipeline orchestration, trace, legacy text, telemetry (spec 7.8-7.10 / 10.1 test_pipeline.py); degraded issue
grouping per misconception card (one issue per card, one evidence chip per failing test)."""
import logging
import re

from conftest import FailingJudge, RecordingJudge, make_client_results
from evaluation.degraded import group_test_issues
from evaluation.evidence import build_evidence
from evaluation.judge import FakeJudge
from evaluation.pipeline import STAGES, TRACE_STATUSES, EvalRequest, render_legacy_text, run_evaluation
from evaluation.prompts import fmt_test_input
from evaluation.retrieval import retrieve_cards

HEADERS = ["Score:", "Correctness:", "Key Concepts:", "Edge Cases:", "Code Quality:", "Suggestions for Improvement:"]


def _req(challenge, code, actuals=None, attempt=2, **kw):
    cr = make_client_results(challenge, code, actuals, **kw) if actuals is not None or kw else None
    return EvalRequest(challenge_id=challenge.id, code=code, attempt=attempt, hints_used=[1], client_results=cr)


def _trace(result):
    return {s["stage"]: s for s in result["pipeline"]["trace"]}


def test_degraded_without_judge(fuzzy, old_reference):
    r = run_evaluation(fuzzy, _req(fuzzy, old_reference, {"fz-06": True, "fz-15": True}), None, request_id="abc123abc123")
    assert r["ok"] and r["verdict"] == "PARTIAL" and r["ai"] == {
        "enabled": False, "degraded": True, "reason": "not_configured", "model": None, "usage": None,
        "message": "The AI tutor is not configured on this server yet; here is what the tests found."}
    t = _trace(r)
    assert t["judge"]["status"] == "skipped" and "ANTHROPIC_API_KEY not configured" in t["judge"]["detail"]
    assert t["tests"]["detail"].startswith("15/17 pass") and t["retrieval"]["detail"].startswith("cards: split_budget (1.00)")
    ev = r["evaluation"]
    assert ev["next_hint"]["source"] == "card" and ev["next_hint"]["level"] == "targeted"
    assert ev["next_hint"]["text"].startswith("Look at fz-06")
    assert ev["misconception_tags"][0] == "split_budget" and ev["issues"][0]["title"] == "The budget is copied, not shared"
    assert ev["scores"]["correctness"] == {"score": 85, "justification": "11 of 13 correctness tests pass (fz-06, fz-15 fail).", "source": "tests"}
    assert ev["scores"]["key_concepts"]["source"] == "heuristic" and ev["complexity"]["note"] == "Not analysed (AI tutor unavailable)."
    assert r["tests"]["failed"][0]["id"] == "fz-06" and r["tests"]["failed"][0]["input"] == "root = [1,2,3,4,5], subRoot = [2,8,9]"
    assert r["retrieval"][0] == {"card_id": "split_budget", "title": "The budget is copied, not shared", "similarity": 1.0, "matched_by": ["fz-06", "fz-15"]}
    assert r["solution_unlocked"] is False and r["request_id"] == "abc123abc123"
    assert r["pipeline"]["guardrails"]["verdict_model"] == "PARTIAL" and r["pipeline"]["guardrails"]["hint_replaced"] is False


def test_degraded_pass_and_unverified(fuzzy, old_reference):
    r = run_evaluation(fuzzy, _req(fuzzy, old_reference, {}), None)
    assert r["verdict"] == "PASS" and r["evaluation"]["next_hint"]["level"] == "extension" and r["solution_unlocked"] is True
    assert _trace(r)["retrieval"]["status"] == "skipped" and r["evaluation"]["what_to_try_next"][0] == fuzzy.stretch_goal
    r = run_evaluation(fuzzy, _req(fuzzy, old_reference, attempt=4), None)
    assert r["verdict"] == "UNVERIFIED" and r["solution_unlocked"] is True
    assert _trace(r)["tests"] == {"stage": "tests", "status": "skipped", "ms": 0, "detail": "no evidence: legacy client"}
    assert r["evaluation"]["scores"]["correctness"]["score"] <= 60


def test_degraded_syntax_error(fuzzy, old_reference):
    r = run_evaluation(fuzzy, _req(fuzzy, old_reference, compile_ok=False, error_kind="syntax", compile_error="Unexpected token"), None)
    assert r["verdict"] == "ERROR" and r["overall"] < 40
    t = _trace(r)
    assert t["static_checks"]["status"] == "error" and "Unexpected token" in t["static_checks"]["detail"]
    assert t["tests"]["status"] == "skipped"
    assert r["evaluation"]["next_hint"]["source"] == "syntax" and r["evaluation"]["issues"][0]["evidence"] == [{"kind": "static", "ref": "S03"}]


def test_degraded_on_judge_failure_keeps_tests(fuzzy, old_reference):
    r = run_evaluation(fuzzy, _req(fuzzy, old_reference, {"fz-06": True, "fz-15": True}), FailingJudge("timeout"))
    assert r["ai"]["enabled"] is True and r["ai"]["degraded"] is True and r["ai"]["reason"] == "timeout"
    assert r["ai"]["message"] == "The AI tutor took too long to answer. Your test results are still shown."
    t = _trace(r)
    assert t["judge"]["status"] == "degraded" and t["judge"]["detail"].startswith("timeout:")
    assert r["tests"]["summary"]["passed"] == 15 and r["verdict"] == "PARTIAL" and r["evaluation"]["next_hint"]["source"] == "card"


def test_fake_judge_full_path(fuzzy, old_reference):
    judge = FakeJudge()
    r = run_evaluation(fuzzy, _req(fuzzy, old_reference, {"fz-06": True, "fz-15": True}), judge)
    assert r["ai"]["degraded"] is False and r["ai"]["model"] == "fake-judge"
    t = _trace(r)
    assert t["judge"]["status"] == "ok" and t["judge"]["detail"].startswith("fake-judge effort=")
    assert r["evaluation"]["next_hint"]["source"] == "judge" and r["evaluation"]["issues"][0]["evidence"][0]["ref"] == "fz-06"
    assert r["pipeline"]["guardrails"]["scores_adjusted"][0]["dim"] == "correctness"
    r = run_evaluation(fuzzy, _req(fuzzy, old_reference, {}), judge)
    assert r["verdict"] == "PASS" and r["overall"] >= 90 and r["evaluation"]["next_hint"]["level"] == "extension"


def test_judge_output_goes_through_postprocess(fuzzy, old_reference, good_payload):
    judge = RecordingJudge(eval_payload=good_payload)
    r = run_evaluation(fuzzy, _req(fuzzy, old_reference, {"fz-06": True, "fz-15": True}, attempt=1), judge)
    assert judge.submissions and judge.submissions[0].startswith('<submission challenge_id="fuzzySubtree" attempt="1"')
    assert r["overall"] == 81 and r["evaluation"]["scores"]["correctness"]["score"] == 85
    assert r["evaluation"]["scores"]["key_concepts"]["score"] == 55 and r["evaluation"]["next_hint"]["source"] == "judge"
    assert r["pipeline"]["guardrails"]["scores_adjusted"][:2] == [
        {"dim": "correctness", "from": 70, "to": 85, "reason": "set from test evidence"},
        {"dim": "edge_cases", "from": 95, "to": 100, "reason": "set from test evidence"}]
    assert "correctness 85 and edge cases 100 set from tests" in _trace(r)["postcheck"]["detail"]


def test_legacy_response_format(fuzzy, old_reference):
    for judge in (None, FakeJudge()):
        for actuals in (None, {"fz-06": True, "fz-15": True}, {}):
            r = run_evaluation(fuzzy, _req(fuzzy, old_reference, actuals), judge)
            text = r["response"]
            lines = text.split("\n")
            assert re.fullmatch(r"Score: \d+/100", lines[0]) and lines[0] == f"Score: {r['overall']}/100"
            positions = [text.index(h) for h in HEADERS]
            assert positions == sorted(positions)
            assert re.search(r"\n1\. .+\n2\. .+\n3\. .+$", text) and "**" not in text
            if actuals is None:
                assert "Tests: not run (client did not send results)" in text
            elif actuals:
                assert "Tests: 15/17 passed; first failure fz-06: expected false, got true." in text
            else:
                assert "Tests: 17/17 passed." in text
    text = render_legacy_text(r["evaluation"], r["tests"], 77)
    assert text.startswith("Score: 77/100\n\nCorrectness: ")


def test_trace_shape(fuzzy, old_reference):
    for judge in (None, FakeJudge(), FailingJudge("rate_limited")):
        r = run_evaluation(fuzzy, _req(fuzzy, old_reference, {"fz-06": True}), judge)
        trace = r["pipeline"]["trace"]
        assert [s["stage"] for s in trace] == list(STAGES)
        for s in trace:
            assert s["status"] in TRACE_STATUSES and isinstance(s["ms"], int) and s["ms"] >= 0
            assert isinstance(s["detail"], str) and s["detail"]
            assert set(s) == {"stage", "status", "ms", "detail"}
        assert set(r["pipeline"]["guardrails"]) == {"verdict_overridden", "verdict_model", "scores_adjusted", "issues_dropped",
                                                    "hint_replaced", "hint_replaced_reason", "leaks_redacted", "flags"}


def test_telemetry_line_has_no_code_or_model_text(fuzzy, old_reference, caplog):
    caplog.set_level(logging.INFO, logger="evaluation")
    r = run_evaluation(fuzzy, _req(fuzzy, old_reference, {"fz-06": True, "fz-15": True}), FakeJudge(), request_id="deadbeef0000", client_ip="203.0.113.9")
    line = next(rec.getMessage() for rec in caplog.records if rec.getMessage().startswith("evaluation request_id=deadbeef0000"))
    for key in ("route=evaluate", "challenge=fuzzySubtree", "attempt=2", "mode=tests", "tests=15/17", "verdict=PARTIAL",
                "retrieval=split_budget", "judge=ok", "model=fake-judge", "ip=203.0.113.9", "cache_read=0", "hint_replaced=-"):
        assert key in line
    assert "fuzzySameTree" not in line and r["evaluation"]["summary"] not in line


# --------------------------------------------------------------------------- degraded issues grouped per card

def _or_bug(count):
    kb = next(k for k in count.known_bad if k.id == "or_instead_of_sum")
    assert kb.expected_failing_ids == ("cs-06", "cs-07", "cs-08", "cs-11")
    return kb.code, {tid: 1 for tid in kb.expected_failing_ids}          # `left || right` caps every count at 1


def test_degraded_issues_group_tests_of_one_card(count):
    code, actuals = _or_bug(count)
    card = count.card_by_id["or_instead_of_sum"]
    for judge in (None, FailingJudge("timeout")):
        r = run_evaluation(count, _req(count, code, actuals), judge)
        assert r["verdict"] == "PARTIAL" and r["retrieval"][0]["card_id"] == "or_instead_of_sum"
        issues = r["evaluation"]["issues"]
        assert len(issues) == 1, [i["title"] for i in issues]
        assert issues[0] == {"title": "OR instead of sum", "category": "correctness", "severity": "high",
                             "explanation": f"{card.symptom} {card.why}",
                             "evidence": [{"kind": "test", "ref": t} for t in ("cs-06", "cs-07", "cs-08", "cs-11")]}
        # the legacy text still leads Key Concepts with that explanation, once (card.why also appears in the targeted hint)
        text = r["response"]
        assert text.count(f"{card.symptom} {card.why}") == 1 and f"Key Concepts: {card.symptom} {card.why} {card.question}" in text
        assert "Tests: 8/12 passed; first failure cs-06: expected 2, got 1." in text


def test_degraded_issues_keep_uncarded_tests_and_cap(fuzzy, old_reference):
    # fz-01 matches no retrieved card -> its own "Wrong result" issue; fz-06 and fz-15 share the split_budget card
    r = run_evaluation(fuzzy, _req(fuzzy, old_reference, {"fz-01": False, "fz-06": True, "fz-15": True}), None)
    issues = r["evaluation"]["issues"]
    assert [i["title"] for i in issues] == ["Wrong result on fz-01", "The budget is copied, not shared"]
    assert issues[0]["severity"] == "high" and issues[0]["category"] == "edge_case"
    assert issues[0]["explanation"] == f"Expected true but your function returned false for input {fmt_test_input(fuzzy, fuzzy.test_by_id['fz-01'])}."
    assert "root = [1,2], subRoot = []" in issues[0]["explanation"]
    assert issues[0]["evidence"] == [{"kind": "test", "ref": "fz-01"}]
    assert issues[1]["severity"] == "medium" and issues[1]["category"] == "correctness"
    assert issues[1]["evidence"] == [{"kind": "test", "ref": "fz-06"}, {"kind": "test", "ref": "fz-15"}]
    # no cards: one issue per failing test in catalog order, capped at 4
    failing = ["fz-01", "fz-02", "fz-03", "fz-04", "fz-05", "fz-06"]
    ev = build_evidence(fuzzy, old_reference, make_client_results(fuzzy, old_reference, {t: "undefined" for t in failing}))
    issues = group_test_issues(fuzzy, ev, [])
    assert [i["title"] for i in issues] == [f"Wrong result on {t}" for t in failing[:4]]
    assert all(len(i["evidence"]) == 1 for i in issues) and [i["severity"] for i in issues] == ["high", "medium", "medium", "medium"]
    assert "returned undefined for input" in issues[0]["explanation"]
    # a card group keeps every chip even when its later tests fall beyond the 4-issue cap
    card_entry = {"card": fuzzy.card_by_id["split_budget"], "card_id": "split_budget", "matched_by": ["fz-04", "fz-15"]}
    failing = ["fz-01", "fz-02", "fz-03", "fz-04", "fz-05", "fz-06", "fz-15"]
    ev = build_evidence(fuzzy, old_reference, make_client_results(fuzzy, old_reference, {t: "undefined" for t in failing}))
    issues = group_test_issues(fuzzy, ev, [card_entry])
    assert [i["title"] for i in issues] == ["Wrong result on fz-01", "Wrong result on fz-02", "Wrong result on fz-03",
                                            "The budget is copied, not shared"]
    assert issues[3]["evidence"] == [{"kind": "test", "ref": "fz-04"}, {"kind": "test", "ref": "fz-15"}]
    assert issues[3]["category"] == "correctness"
    # a group made only of edge tests is an edge_case issue; errors and timeouts group like failures
    ev = build_evidence(fuzzy, old_reference, make_client_results(fuzzy, old_reference, {"fz-01": ("error", "boom"), "fz-02": "timeout"}))
    cards = retrieve_cards(fuzzy, ev)
    entry = {"card": fuzzy.card_by_id["null_dereference"], "card_id": "null_dereference", "matched_by": ["fz-01", "fz-02"]}
    issues = group_test_issues(fuzzy, ev, [entry] + cards)
    assert len(issues) == 1 and issues[0]["category"] == "edge_case" and [e["ref"] for e in issues[0]["evidence"]] == ["fz-01", "fz-02"]


def test_all_challenges_run_degraded(count, mirror):
    for ch in (count, mirror):
        kb = ch.known_bad[0]
        actuals = {tid: (not ch.test_by_id[tid].expected) if ch.return_type == "boolean" else ch.test_by_id[tid].expected + 1
                   for tid in kb.expected_failing_ids}
        r = run_evaluation(ch, _req(ch, kb.code, actuals), None)
        assert r["ok"] and r["verdict"] == "PARTIAL" and r["retrieval"][0]["card_id"] == kb.card_id
        assert r["challenge_id"] == ch.id
