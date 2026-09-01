"""The tutor route (addendum A5/A2/A6): modes, selection handling, history caps, degraded answers, fake judge,
prompt assembly, post-checks and HTTP error mapping."""
import copy
import json

import pytest

from conftest import FailingJudge, RecordingJudge, make_app, make_client_results
from evaluation.judge import FakeJudge
from evaluation.postcheck import postprocess
from evaluation.prompts import build_submission_message
from evaluation.registry import BY_ID, canonical_json
from evaluation.retrieval import retrieve_cards
from evaluation.evidence import build_evidence

URL = "/evaluate-challenge/tutor"


def _body(old_reference, **over):
    fz = BY_ID["fuzzySubtree"]
    body = {"challenge_id": "fuzzySubtree", "code": old_reference, "attempt": 2, "hints_used": [1], "mode": "question",
            "question": "Why does my helper return true here?",
            "client_results": make_client_results(fz, old_reference, {"fz-06": True, "fz-15": True}), "stuck": False}
    body.update(over)
    return body


def _sel(old_reference, a=13, b=14):
    lines = old_reference.split("\n")
    return {"start_line": a, "end_line": b, "text": "\n".join(lines[a - 1:b])}


# --------------------------------------------------------------------------- fake judge: modes + selection

@pytest.mark.parametrize("mode", ["question", "explain_problem", "suggest_approach", "complexity"])
def test_modes_with_fake_judge(fake_client, old_reference, mode):
    r = fake_client.post(URL, json=_body(old_reference, mode=mode, selection=_sel(old_reference)))
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert set(body) == {"ok", "request_id", "answer", "hint_level", "socratic_question", "redirected", "ai", "response"}
    assert body["ok"] is True and body["response"] == body["answer"] and body["redirected"] is False
    assert body["ai"]["model"] == "fake-judge" and body["ai"]["degraded"] is False
    assert f"Fake tutor ({mode}" in body["answer"] and "Ln 13-14" in body["answer"]
    assert body["hint_level"] == "targeted" and len(body["answer"]) <= 900
    if mode in ("explain_problem", "complexity"):
        assert body["socratic_question"] == ""
    else:
        assert body["socratic_question"].endswith("?")
    assert r.headers["Cache-Control"] == "no-store"


def test_single_line_selection_and_no_selection(fake_client, old_reference):
    r = fake_client.post(URL, json=_body(old_reference, selection=_sel(old_reference, 2, 2)))
    assert "Ln 2" in r.get_json()["answer"] and "Ln 2-2" not in r.get_json()["answer"]
    r = fake_client.post(URL, json=_body(old_reference))
    assert r.status_code == 200 and "Ln " not in r.get_json()["answer"]


@pytest.mark.parametrize("selection", [
    "13-14", {"start_line": "13", "end_line": 14, "text": "x"}, {"start_line": 0, "end_line": 3, "text": "x"},
    {"start_line": 5, "end_line": 3, "text": "x"}, {"start_line": 1, "end_line": 999, "text": "x"},
    {"start_line": 1, "end_line": 2, "text": "x" * 2001}, {"start_line": True, "end_line": 2, "text": "x"},
])
def test_invalid_selection_400(fake_client, old_reference, selection):
    r = fake_client.post(URL, json=_body(old_reference, selection=selection))
    assert r.status_code == 400 and r.get_json()["error"]["field"] == "selection"


def test_question_validation(fake_client, old_reference):
    for q in ("", "hi", "x" * 501, None, 5):
        r = fake_client.post(URL, json=_body(old_reference, question=q))
        assert r.status_code == 400 and r.get_json()["error"]["field"] == "question", q
    r = fake_client.post(URL, json=_body(old_reference, mode="explain_problem", question=None))
    assert r.status_code == 200                                     # question ignored outside mode=question
    r = fake_client.post(URL, json=_body(old_reference, mode="bogus"))
    assert r.status_code == 400 and r.get_json()["error"]["field"] == "mode"
    r = fake_client.post(URL, json=_body(old_reference, code=""))
    assert r.status_code == 400 and r.get_json()["error"]["code"] == "empty_code"
    r = fake_client.post(URL, json=_body(old_reference, challenge_id="nope"))
    assert r.status_code == 400 and r.get_json()["error"]["code"] == "unknown_challenge"


# --------------------------------------------------------------------------- prompt assembly (recording judge)

def test_prompt_assembly_and_history_caps(old_reference, good_payload):
    fz = BY_ID["fuzzySubtree"]
    judge = RecordingJudge()
    client = make_app(judge=judge).test_client()
    cr = make_client_results(fz, old_reference, {"fz-06": True, "fz-15": True})
    # a real evaluation object, as the page would echo it
    ev = build_evidence(fz, old_reference, cr)
    evaluation, _ = postprocess(copy.deepcopy(good_payload), ev, fz, 2, retrieve_cards(fz, ev), old_reference)
    history = [{"question": f"q{i} " + "x" * 700, "answer": f"a{i} " + "y" * 700} for i in range(5)]
    r = client.post(URL, json=_body(old_reference, selection=_sel(old_reference), evaluation=evaluation, history=history, stuck=True,
                                    previous={"failed_test_ids": ["fz-06"], "hint_level": "conceptual"}))
    assert r.status_code == 200
    call = judge.tutor_calls[-1]
    msgs = call["messages"]
    # (1) byte-identical submission with the 5-minute breakpoint
    ev = build_evidence(fz, old_reference, cr)
    cards = retrieve_cards(fz, ev)
    expected_sub = build_submission_message(fz, ev, cards, 2, [1], {"failed_test_ids": ["fz-06"], "hint_level": "conceptual"},
                                            {"gave_up": False, "solution_revealed": False}, "targeted")
    assert msgs[0] == {"role": "user", "content": [{"type": "text", "text": expected_sub, "cache_control": {"type": "ephemeral"}}]}
    # (2) the sanitized evaluation as a completed assistant turn (no source fields)
    assert msgs[1]["role"] == "assistant"
    prior = json.loads(msgs[1]["content"])
    assert "source" not in prior["next_hint"] and "source" not in prior["scores"]["correctness"]
    assert msgs[1]["content"] == canonical_json(prior)
    # (3) only the last 3 history turns, each field cut to 600 chars, alternating roles
    hist = msgs[2:-1]
    assert [m["role"] for m in hist] == ["user", "assistant"] * 3
    assert hist[0]["content"].startswith("q2 ") and hist[-1]["content"].startswith("a4 ")
    assert all(len(m["content"]) == 600 for m in hist)
    # (4) the tutor turn
    last = msgs[-1]
    assert last["role"] == "user" and last["content"].startswith('<tutor mode="question" hint_level="targeted" stuck="true" selection_lines="13-14">')
    assert "<selected_code>" in last["content"] and "<learner_question>Why does my helper return true here?</learner_question>" in last["content"]
    assert 'Do not raise the hint level above "targeted"' in last["content"] and last["content"].endswith("</rules></tutor>")
    assert call["level"] == "targeted" and call["tutor"]["stuck"] is True


def test_malformed_evaluation_is_dropped(old_reference):
    judge = RecordingJudge()
    client = make_app(judge=judge).test_client()
    r = client.post(URL, json=_body(old_reference, evaluation={"verdict": "PASS", "scores": "nope"}))
    assert r.status_code == 200
    msgs = judge.tutor_calls[-1]["messages"]
    assert [m["role"] for m in msgs] == ["user", "user"]            # submission + tutor turn, no assistant turn
    r = client.post(URL, json=_body(old_reference, evaluation=None, history="nope"))
    assert r.status_code == 200 and [m["role"] for m in judge.tutor_calls[-1]["messages"]] == ["user", "user"]


def test_quick_modes_use_fixed_prompts(old_reference):
    judge = RecordingJudge()
    client = make_app(judge=judge).test_client()
    client.post(URL, json=_body(old_reference, mode="complexity", question="ignored text"))
    turn = judge.tutor_calls[-1]["messages"][-1]["content"]
    assert "<learner_question>Derive the time and space complexity of the learner's CURRENT code" in turn and "ignored text" not in turn
    assert turn.startswith('<tutor mode="complexity" hint_level="targeted" stuck="false">')


def test_no_client_results_uses_no_tests_submission(old_reference):
    judge = RecordingJudge()
    client = make_app(judge=judge).test_client()
    r = client.post(URL, json=_body(old_reference, client_results=None, attempt=1))
    assert r.status_code == 200 and r.get_json()["hint_level"] == "conceptual"
    sub = judge.tutor_calls[-1]["messages"][0]["content"][0]["text"]
    assert 'mode="no_tests"' in sub and 'Required next_hint.level: "conceptual"' in sub


# --------------------------------------------------------------------------- post-checks on the model answer

def test_hint_level_clamp(old_reference):
    judge = RecordingJudge(tutor_payload={"answer": "Look at line 24.", "hint_level": "near_explicit", "socratic_question": "Why?", "redirected": False})
    client = make_app(judge=judge).test_client()
    r = client.post(URL, json=_body(old_reference, attempt=1))
    assert r.get_json()["hint_level"] == "conceptual"
    r = client.post(URL, json=_body(old_reference, attempt=1, stuck=True))
    assert r.get_json()["hint_level"] == "targeted"
    r = client.post(URL, json=_body(old_reference, attempt=3, stuck=True))
    assert r.get_json()["hint_level"] == "near_explicit"
    judge.tutor_payload["hint_level"] = "conceptual"
    r = client.post(URL, json=_body(old_reference, attempt=3))
    assert r.get_json()["hint_level"] == "conceptual"              # lower than allowed is fine
    judge.tutor_payload["hint_level"] = "bogus"
    r = client.post(URL, json=_body(old_reference, attempt=2))
    assert r.get_json()["hint_level"] == "targeted"


def test_leak_guard_and_caps_on_answer(old_reference):
    fz = BY_ID["fuzzySubtree"]
    leak = "Here you go: " + fz.reference_solution
    judge = RecordingJudge(tutor_payload={"answer": leak, "hint_level": "targeted", "socratic_question": "q" * 400 + "?", "redirected": True})
    client = make_app(judge=judge).test_client()
    r = client.post(URL, json=_body(old_reference))
    body = r.get_json()
    assert body["answer"].startswith("I can't hand over the solution, but here is the next step: ")
    assert "countMismatches(p.left, q.left)" not in body["answer"] and len(body["answer"]) <= 900
    assert len(body["socratic_question"]) == 300 and body["redirected"] is True
    judge.tutor_payload = {"answer": "x" * 2000, "hint_level": "targeted", "socratic_question": "", "redirected": False}
    body = client.post(URL, json=_body(old_reference)).get_json()
    assert len(body["answer"]) == 900 and body["socratic_question"] == ""
    judge.tutor_payload = {"answer": "", "hint_level": "targeted", "socratic_question": "", "redirected": False}
    body = client.post(URL, json=_body(old_reference)).get_json()
    assert body["answer"].startswith("I can't hand over the solution")


# --------------------------------------------------------------------------- degraded (no judge)

def test_degraded_answers(client, old_reference):
    fz = BY_ID["fuzzySubtree"]
    r = client.post(URL, json=_body(old_reference))                         # attempt 2 -> targeted; degraded gives one level up
    body = r.get_json()
    assert r.status_code == 200 and body["ok"] is True and body["ai"]["degraded"] is True and body["ai"]["reason"] == "not_configured"
    assert body["hint_level"] == "near_explicit" and "Step by step:" in body["answer"]
    assert body["socratic_question"] == fz.card_by_id["split_budget"].question and body["response"] == body["answer"]
    body = client.post(URL, json=_body(old_reference, attempt=1)).get_json()
    assert body["hint_level"] == "targeted" and body["answer"].startswith("Look at fz-06")
    body = client.post(URL, json=_body(old_reference, attempt=5, mode="suggest_approach")).get_json()
    assert body["hint_level"] == "near_explicit"                           # capped
    body = client.post(URL, json=_body(old_reference, mode="explain_problem")).get_json()
    assert body["answer"].startswith(fz.summary) and fz.examples[0].explanation in body["answer"] and body["socratic_question"] == ""
    body = client.post(URL, json=_body(old_reference, mode="complexity")).get_json()
    assert body["answer"] == "Not analysed (AI tutor unavailable)." and body["socratic_question"] == ""
    # a passing learner keeps the extension hint
    cr = make_client_results(fz, old_reference)
    body = client.post(URL, json=_body(old_reference, client_results=cr, mode="suggest_approach")).get_json()
    assert body["hint_level"] == "extension" and body["answer"] == fz.fallback_by_level["extension"].text
    # no cards (legacy body): ladder text
    body = client.post(URL, json=_body(old_reference, client_results=None, attempt=1)).get_json()
    assert body["hint_level"] == "targeted" and body["answer"] == fz.fallback_by_level["targeted"].text


# --------------------------------------------------------------------------- judge failures -> HTTP codes

@pytest.mark.parametrize("reason, status", [("rate_limited", 429), ("auth_error", 503), ("upstream_unavailable", 503),
                                            ("request_rejected", 502), ("connection_error", 502), ("refusal", 502),
                                            ("bad_output", 502), ("timeout", 504), ("unexpected", 500)])
def test_judge_failure_maps_to_http(old_reference, reason, status):
    client = make_app(judge=FailingJudge(reason, retry_after=11 if reason == "rate_limited" else None)).test_client()
    r = client.post(URL, json=_body(old_reference))
    assert r.status_code == status
    body = r.get_json()
    assert body["ok"] is False and body["error"]["code"] == reason and body["response"].startswith("Error: ")
    assert body["ai"]["degraded"] is True and body["ai"]["reason"] == reason
    if reason == "rate_limited":
        assert r.headers["Retry-After"] == "11" and body["retry_after"] == 11
    else:
        assert "Retry-After" not in r.headers


def test_tutor_works_for_every_challenge(fake_client):
    for cid, ch in BY_ID.items():
        r = fake_client.post(URL, json={"challenge_id": cid, "code": ch.starter_code, "mode": "suggest_approach"})
        assert r.status_code == 200 and r.get_json()["hint_level"] == "conceptual", cid
