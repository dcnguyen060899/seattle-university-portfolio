"""The tutor route (addendum A5/A2/A6): modes, selection handling, history caps, degraded answers, fake judge,
prompt assembly, post-checks and HTTP error mapping; ADDENDUM_VIS 4: mode explain_step and the step object."""
import copy
import json

import pytest

from conftest import FailingJudge, RecordingJudge, make_app, make_client_results
from evaluation.judge import FakeJudge
from evaluation.postcheck import LEAK_WINDOW, _norm, leak_windows, leaks, postprocess
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
    if over.get("mode") == "explain_step" and "step" not in over:
        body["step"] = _step()                                       # explain_step needs a step; tests override it explicitly
    body.update(over)
    return body


def _step(**over):
    """A replay step as challenge_mode.js sends it for the Core challenge (ADDENDUM_VIS 3, 'Explain this step')."""
    step = {"index": 3, "total": 27, "caption": "Call fuzzySameTree(main node 2, pattern node 2, maxDifferences = 1) at depth 1.",
            "call": "fuzzySameTree(main node 2, pattern node 2, maxDifferences = 1)",
            "stack": ["fuzzySubtree(main node 1, pattern node 2, maxDifferences = 1)",
                      "fuzzySameTree(main node 2, pattern node 2, maxDifferences = 1)"],
            "returned": "true"}
    step.update(over)
    return step


def _sel(old_reference, a=13, b=14):
    lines = old_reference.split("\n")
    return {"start_line": a, "end_line": b, "text": "\n".join(lines[a - 1:b])}


# --------------------------------------------------------------------------- fake judge: modes + selection

@pytest.mark.parametrize("mode", ["question", "explain_problem", "suggest_approach", "complexity", "explain_step"])
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


# --------------------------------------------------------------------------- explain_step (ADDENDUM_VIS 4)

def test_explain_step_with_fake_judge(fake_client, old_reference):
    r = fake_client.post(URL, json=_body(old_reference, mode="explain_step", selection=_sel(old_reference, 10, 18)))
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["ok"] is True and body["ai"]["model"] == "fake-judge" and body["ai"]["degraded"] is False
    assert body["answer"].startswith("Fake tutor (explain_step, hint level targeted).") and "Ln 10-18" in body["answer"]
    assert "Step 3 of 27: Call fuzzySameTree(main node 2, pattern node 2, maxDifferences = 1) at depth 1." in body["answer"]
    assert "Your code is inside fuzzySameTree(main node 2, pattern node 2, maxDifferences = 1)." in body["answer"]
    assert body["socratic_question"].endswith("?") and body["hint_level"] == "targeted" and body["response"] == body["answer"]
    # the fake judge echoes the step position for any mode that carries a step
    body = fake_client.post(URL, json=_body(old_reference, step=_step(index=12, total=40))).get_json()
    assert "Step 12 of 40:" in body["answer"] and "You asked: Why does my helper return true here?" in body["answer"]
    body = fake_client.post(URL, json=_body(old_reference, mode="explain_step", step=_step(index=27, caption="", call=""))).get_json()
    assert "Step 27 of 27." in body["answer"] and "Your code is inside" not in body["answer"]


def test_explain_step_prompt_assembly(old_reference):
    judge = RecordingJudge()
    client = make_app(judge=judge).test_client()
    step = _step(caption='Call f(<main node "2">) at depth 1.', stack=["a(<x>)", 'b("y")'], returned="Infinity")
    r = client.post(URL, json=_body(old_reference, mode="explain_step", step=step, selection=_sel(old_reference, 10, 10),
                                    question="ignored in this mode"))
    assert r.status_code == 200
    call = judge.tutor_calls[-1]
    turn = call["messages"][-1]["content"]
    lines = turn.split("\n")
    assert lines[0] == '<tutor mode="explain_step" hint_level="targeted" stuck="false" selection_lines="10">'
    assert lines[1].startswith("<selected_code>") and lines[1].endswith("</selected_code>")    # a one-line selection
    assert lines[2] == ('<step index="3" total="27">Call f([main node \'2\']) at depth 1. | '
                        "call: fuzzySameTree(main node 2, pattern node 2, maxDifferences = 1) | "
                        "stack: a([x]) > b('y') | returned: Infinity</step>")
    assert lines[3] == ("<learner_question>Explain what is happening at this step of the learner's OWN code in plain words: which "
                        "nodes are being compared, what this call will decide and why, and how it relates to the failing test if "
                        "there is one. Do not reveal the reference. At most 100 words, then one Socratic question.</learner_question>")
    assert "ignored in this mode" not in turn and turn.endswith("</rules></tutor>") and turn.count("<step ") == 1
    assert call["tutor"]["mode"] == "explain_step" and call["tutor"]["step"]["index"] == 3 and call["tutor"]["step"]["stack"] == step["stack"]
    # a step sent with another mode is included as context; no step -> no element; optional strings default to ""
    client.post(URL, json=_body(old_reference, step={"index": 0, "total": 1}))
    turn = judge.tutor_calls[-1]["messages"][-1]["content"]
    assert '<step index="0" total="1"> | call:  | stack:  | returned: </step>' in turn
    assert "<learner_question>Why does my helper return true here?</learner_question>" in turn
    client.post(URL, json=_body(old_reference))
    assert "<step" not in judge.tutor_calls[-1]["messages"][-1]["content"]
    # the shared submission prefix is unchanged by the mode (cache prefix identical to a question turn)
    subs = [c["messages"][0] for c in judge.tutor_calls]
    assert subs[0] == subs[-1]


@pytest.mark.parametrize("step, detail", [
    ("3/27", "must be an object"), ([3, 27], "must be an object"),
    ({"index": "3", "total": 27}, "integers"), ({"index": 3, "total": 27.0}, "integers"), ({"index": True, "total": 27}, "integers"),
    ({"index": 3}, "integers"), ({"total": 27}, "integers"),
    ({"index": -1, "total": 27}, "0 <= index <= total"), ({"index": 28, "total": 27}, "0 <= index <= total"),
    ({"index": 0, "total": 0}, "0 <= index <= total"), ({"index": 1, "total": 100_001}, "0 <= index <= total"),
    ({"index": 3, "total": 27, "caption": "x" * 301}, "step.caption"), ({"index": 3, "total": 27, "call": 5}, "step.call"),
    ({"index": 3, "total": 27, "returned": ["1"]}, "step.returned"),
    ({"index": 3, "total": 27, "stack": "a > b"}, "step.stack"), ({"index": 3, "total": 27, "stack": ["f()"] * 13}, "step.stack"),
    ({"index": 3, "total": 27, "stack": ["f()", "g" * 201]}, "step.stack"), ({"index": 3, "total": 27, "stack": [1]}, "step.stack"),
])
def test_invalid_step_400(fake_client, old_reference, step, detail):
    for mode in ("explain_step", "question"):                       # validated whenever present, whatever the mode
        r = fake_client.post(URL, json=_body(old_reference, mode=mode, step=step))
        assert r.status_code == 400, (mode, r.get_json())
        err = r.get_json()["error"]
        assert err["code"] == "invalid_request" and err["field"] == "step" and detail in err["message"], err


def test_step_limits_and_required(fake_client, old_reference):
    # at the caps: accepted
    step = _step(caption="c" * 300, call="k" * 300, returned="r" * 300, stack=["s" * 200] * 12, index=27, total=27)
    assert fake_client.post(URL, json=_body(old_reference, mode="explain_step", step=step)).status_code == 200
    assert fake_client.post(URL, json=_body(old_reference, mode="explain_step", step={"index": 0, "total": 1})).status_code == 200
    r = fake_client.post(URL, json=_body(old_reference, mode="explain_step", step={"index": 1, "total": 1, "caption": None, "stack": None}))
    assert r.status_code == 200 and "Step 1 of 1." in r.get_json()["answer"]
    # explain_step without a step -> 400 on the step field; other modes do not need one
    r = fake_client.post(URL, json=_body(old_reference, mode="explain_step", step=None))
    assert r.status_code == 400 and r.get_json()["error"]["field"] == "step" and "required" in r.get_json()["error"]["message"]
    body = _body(old_reference, mode="explain_step")
    del body["step"]
    assert fake_client.post(URL, json=body).status_code == 400
    for mode in ("question", "explain_problem", "suggest_approach", "complexity"):
        assert fake_client.post(URL, json=_body(old_reference, mode=mode, step=None)).status_code == 200, mode


def test_explain_step_degraded(client, old_reference):
    caption = "Call fuzzySameTree(main node 2, pattern node 2, maxDifferences = 1) at depth 1."
    r = client.post(URL, json=_body(old_reference, mode="explain_step", selection=_sel(old_reference, 10, 18)))
    body = r.get_json()
    assert r.status_code == 200 and body["ok"] is True and body["ai"]["degraded"] is True and body["ai"]["reason"] == "not_configured"
    assert body["answer"] == caption + " (AI tutor unavailable)" and body["response"] == body["answer"]
    assert body["socratic_question"] == "" and body["redirected"] is False and body["hint_level"] == "targeted"
    body = client.post(URL, json=_body(old_reference, mode="explain_step", step=_step(caption=""), attempt=1)).get_json()
    assert body["answer"] == "(AI tutor unavailable)" and body["hint_level"] == "conceptual"
    body = client.post(URL, json=_body(old_reference, mode="explain_step", step=_step(caption=" " + "c" * 298 + " "))).get_json()
    assert body["answer"] == "c" * 298 + " (AI tutor unavailable)"                # 300-char caption at the cap, whitespace trimmed
    # a passing learner: level extension, still just the caption
    cr = make_client_results(BY_ID["fuzzySubtree"], old_reference)
    body = client.post(URL, json=_body(old_reference, mode="explain_step", client_results=cr)).get_json()
    assert body["hint_level"] == "extension" and body["answer"].endswith(" (AI tutor unavailable)")


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
        step = _step(caption=f"Call {ch.entry_function}(main node 1, pattern node 1) at depth 0.", call=f"{ch.entry_function}(...)")
        r = fake_client.post(URL, json={"challenge_id": cid, "code": ch.starter_code, "mode": "explain_step", "step": step})
        assert r.status_code == 200 and "Step 3 of 27:" in r.get_json()["answer"], cid


# --------------------------------------------------------------------------- leak guard vs. punctuation / code (fix round 1)

def _ref_lines(src):
    return [ln.strip() for ln in src.splitlines() if ln.strip() and not ln.strip().startswith("//")]


def _pieces(lines, limit):
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


@pytest.mark.parametrize("variant", ["per_line", "pieces<30", "pieces<20", "backticks", "bullets"])
def test_answer_quoting_the_reference_with_punctuation_is_declined(old_reference, variant):
    fz = BY_ID["fuzzySubtree"]
    lines = _ref_lines(fz.reference_solution)
    text = {"per_line": " ".join(ln + "." for ln in lines),
            "pieces<30": " ".join(p + "." for p in _pieces(lines, 30)),
            "pieces<20": " ".join(p + "." for p in _pieces(lines, 20)),
            "backticks": " ".join("`" + ln + "`." for ln in lines),
            "bullets": "\n".join("- `" + ln + "`" for ln in lines)}[variant]
    judge = RecordingJudge(tutor_payload={"answer": ("Sure, here it is. " + text)[:900], "hint_level": "targeted",
                                          "socratic_question": "Does that help?", "redirected": False})
    client = make_app(judge=judge).test_client()
    body = client.post(URL, json=_body(old_reference)).get_json()
    assert body["answer"].startswith("I can't hand over the solution, but here is the next step: ")
    assert not leaks(body["answer"], leak_windows(fz, old_reference, "targeted"))
    for ln in lines:                                                   # no reference line of window size survives
        if len(_norm(ln)) >= LEAK_WINDOW and _norm(ln) not in _norm(fz.starter_code):
            assert _norm(ln) not in _norm(body["answer"]), ln
    assert body["response"] == body["answer"] and body["hint_level"] == "targeted"


def test_answer_code_guard(old_reference):
    """A whole function (even renamed so no leak window matches) or a fenced block the level forbids is declined; a
    quoted header of the learner's own code and a short snippet at near_explicit are kept; nothing is guarded on PASS."""
    fz = BY_ID["fuzzySubtree"]
    renamed = ("function fuzzy(a, b, k = 1) {\n  if (!b) return true;\n  if (!a) return false;\n"
               "  if (diff(a, b) <= k) return true;\n  return fuzzy(a.left, b, k) || fuzzy(a.right, b, k);\n}")
    header = "Your `function fuzzySameTree(p, q, maxDifferences, differences = 0) {` on line 13 copies the budget into both calls."
    two = "Two lines:\n```js\nconst left = go(p.left, q.left);\nconst right = go(p.right, q.right);\n```\nThen add them."
    judge = RecordingJudge(tutor_payload={"answer": "Here you go:\n```js\n" + renamed + "\n```", "hint_level": "targeted",
                                          "socratic_question": "See?", "redirected": False})
    client = make_app(judge=judge).test_client()
    decline = "I can't hand over the solution, but here is the next step: "
    assert client.post(URL, json=_body(old_reference)).get_json()["answer"].startswith(decline)          # fenced, targeted
    judge.tutor_payload["answer"] = "Write " + renamed + " and rerun."
    assert client.post(URL, json=_body(old_reference)).get_json()["answer"].startswith(decline)          # unfenced, targeted
    assert client.post(URL, json=_body(old_reference, attempt=3)).get_json()["answer"].startswith(decline)   # near_explicit
    judge.tutor_payload["answer"] = header
    body = client.post(URL, json=_body(old_reference)).get_json()
    assert body["answer"] == header                                                                  # own header quoted
    judge.tutor_payload["answer"] = two
    assert client.post(URL, json=_body(old_reference)).get_json()["answer"].startswith(decline)          # any fence at targeted
    assert client.post(URL, json=_body(old_reference, attempt=3)).get_json()["answer"] == two            # <= 3 lines at near_explicit
    # a passing submission (extension level): the code guard is off, the leak windows still apply
    passing = make_client_results(fz, old_reference)
    judge.tutor_payload["answer"] = "Here you go:\n```js\n" + renamed + "\n```"
    body = client.post(URL, json=_body(old_reference, client_results=passing)).get_json()
    assert body["hint_level"] == "targeted" and "function fuzzy(a, b, k = 1)" in body["answer"]   # lower level kept
    judge.tutor_payload["answer"] = "The reference does:\n```js\n" + fz.reference_solution + "\n```"
    assert client.post(URL, json=_body(old_reference, client_results=passing)).get_json()["answer"].startswith(decline)


def test_ladder_hint_text_is_not_a_leak_at_its_level(old_reference):
    """The ladder's own hint 2 (unlocked at attempt 2 / targeted) may be echoed by the tutor at that level but not
    at conceptual."""
    mirror = BY_ID["mirrorSubtree"]
    hint2 = next(h.text for h in mirror.hints if h.level == 2)
    judge = RecordingJudge(tutor_payload={"answer": hint2, "hint_level": "targeted", "socratic_question": "Why?", "redirected": False})
    client = make_app(judge=judge).test_client()
    code = mirror.starter_code
    cr = make_client_results(mirror, code, {t.id: "undefined" for t in mirror.tests})
    base = {"challenge_id": "mirrorSubtree", "code": code, "hints_used": [], "mode": "question", "question": "How?",
            "client_results": cr, "stuck": False}
    body = client.post(URL, json=dict(base, attempt=2)).get_json()
    assert body["answer"] == hint2 and body["hint_level"] == "targeted"
    body = client.post(URL, json=dict(base, attempt=1)).get_json()
    assert body["answer"].startswith("I can't hand over the solution") and body["hint_level"] == "conceptual"
