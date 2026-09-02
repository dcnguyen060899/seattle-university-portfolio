"""HTTP contracts (spec 4 / 10.1 test_routes.py; A2 removes the signature tests; ADDENDUM_VIS 4 explain_step)."""
import json
import re

import pytest

from conftest import FailingJudge, RecordingJudge, make_app, make_client_results
from evaluation.judge import FakeJudge
from evaluation.routes import clamp_attempt, clean_hints_used
from evaluation.registry import CHALLENGES, registry_hash
from evaluation.registry import tests_hash as _tests_hash   # aliased: a module-level `tests_hash` would be collected

TOP_LEVEL = {"ok", "request_id", "challenge_id", "attempt", "evaluation_id", "verdict", "overall", "evaluation", "tests",
             "retrieval", "pipeline", "ai", "solution_unlocked", "response"}
EVALUATION_KEYS = {"verdict", "summary", "progress_note", "scores", "strengths", "issues", "misconception_tags", "complexity",
                   "next_hint", "what_to_try_next", "encouragement", "flags"}


def test_legacy_body_still_works(client, old_reference):
    r = client.post("/evaluate-challenge", json={"code": old_reference, "challenge_type": "fuzzySubtree"})
    assert r.status_code == 200
    body = r.get_json()
    assert body["response"].startswith("Score:") and body["verdict"] == "UNVERIFIED" and body["ai"]["degraded"] is True
    assert body["ai"]["reason"] == "not_configured" and body["challenge_id"] == "fuzzySubtree" and body["attempt"] == 1
    assert r.headers["Cache-Control"] == "no-store" and re.fullmatch(r"[0-9a-f]{12}", body["request_id"])


def test_new_body_full_response(client, old_reference):
    cr = make_client_results(CHALLENGES[1], old_reference, {"fz-06": True, "fz-15": True})
    r = client.post("/evaluate-challenge", json={
        "challenge_id": "fuzzySubtree", "challenge_type": "fuzzySubtree", "code": old_reference, "attempt": 2, "hints_used": [1],
        "previous": {"failed_test_ids": ["fz-06", "fz-15"], "hint_level": "conceptual"},
        "learner_state": {"gave_up": False, "solution_revealed": False}, "client_results": cr})
    assert r.status_code == 200
    body = r.get_json()
    assert set(body) == TOP_LEVEL and set(body["evaluation"]) == EVALUATION_KEYS
    assert body["verdict"] == "PARTIAL" and body["verdict"] == body["evaluation"]["verdict"] and 0 <= body["overall"] <= 100
    assert set(body["tests"]) == {"mode", "evidence_note", "summary", "by_tag", "failed"}
    assert set(body["pipeline"]) == {"trace", "guardrails"} and [s["stage"] for s in body["pipeline"]["trace"]][-1] == "postcheck"
    assert set(body["ai"]) == {"enabled", "degraded", "reason", "message", "model", "usage"}
    for dim in ("correctness", "edge_cases", "key_concepts", "efficiency", "code_quality"):
        assert set(body["evaluation"]["scores"][dim]) == {"score", "justification", "source"}
    assert set(body["evaluation"]["next_hint"]) == {"level", "text", "socratic_question", "source"}
    assert re.fullmatch(r"[0-9a-f-]{36}", body["evaluation_id"])
    json.dumps(body)


def test_413_json(client):
    r = client.post("/evaluate-challenge", data=json.dumps({"challenge_id": "fuzzySubtree", "code": "x" * 100_000}), content_type="application/json")
    assert r.status_code == 413
    body = r.get_json()
    assert body["ok"] is False and body["error"]["code"] == "payload_too_large" and body["response"].startswith("Error:")
    assert r.headers["Content-Type"].startswith("application/json")


def test_unknown_challenge_400(client):
    r = client.post("/evaluate-challenge", json={"challenge_id": "nope", "code": "function f() {}"})
    assert r.status_code == 400 and r.get_json()["error"]["code"] == "unknown_challenge"
    r = client.post("/evaluate-challenge", json={"code": "function f() {}"})
    assert r.status_code == 400 and r.get_json()["error"]["code"] == "unknown_challenge"


def test_health(client, fake_client):
    r = client.get("/evaluate-challenge/health")
    assert r.status_code == 200
    body = r.get_json()
    assert body["ok"] is True and body["version"] == "2" and body["ai_configured"] is False and body["ai_disabled"] is False
    assert body["model"] == "claude-sonnet-5" and body["effort"] == "medium" and body["registry_hash"] == registry_hash()
    assert body["challenges"] == [{"id": c.id, "tests_hash": _tests_hash(c)} for c in CHALLENGES]
    assert body["followup"] is False and re.fullmatch(r"[0-9a-f]{12}", body["request_id"])
    assert r.headers["Cache-Control"] == "no-store"
    fake = fake_client.get("/evaluate-challenge/health").get_json()
    assert fake["ai_configured"] is True and fake["followup"] is True and fake["model"] == "fake-judge"
    # the explain_step addition does not change the health contract
    assert set(body) == set(fake) == {"ok", "version", "request_id", "ai_configured", "ai_disabled", "model", "effort",
                                      "registry_hash", "challenges", "followup"}


def test_rate_limit_429_with_retry_after(old_reference):
    client = make_app(judge=None, per_min=5, burst=5).test_client()
    codes = [client.post("/evaluate-challenge", json={"challenge_id": "fuzzySubtree", "code": old_reference},
                         headers={"X-Forwarded-For": "10.0.0.1, 203.0.113.7"}).status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]
    r = client.post("/evaluate-challenge", json={"challenge_id": "fuzzySubtree", "code": old_reference},
                    headers={"X-Forwarded-For": "10.0.0.1, 203.0.113.7"})
    assert r.status_code == 429 and r.headers["Retry-After"].isdigit()
    body = r.get_json()
    assert body["error"]["code"] == "rate_limited" and body["retry_after"] == int(r.headers["Retry-After"]) and body["response"].startswith("Error:")
    # a different last X-Forwarded-For entry is a different bucket
    r = client.post("/evaluate-challenge", json={"challenge_id": "fuzzySubtree", "code": old_reference},
                    headers={"X-Forwarded-For": "10.0.0.1, 198.51.100.2"})
    assert r.status_code == 200
    # the tutor route shares the bucket
    r = client.post("/evaluate-challenge/tutor", json={"challenge_id": "fuzzySubtree", "code": old_reference, "mode": "explain_problem"},
                    headers={"X-Forwarded-For": "203.0.113.7"})
    assert r.status_code == 429
    # health is never rate limited
    assert client.get("/evaluate-challenge/health", headers={"X-Forwarded-For": "203.0.113.7"}).status_code == 200


def test_cors(client, old_reference):
    body = {"challenge_id": "fuzzySubtree", "code": old_reference}
    r = client.post("/evaluate-challenge", json=body, headers={"Origin": "https://www.duyng-portfolio.com"})
    assert r.headers.get("Access-Control-Allow-Origin") == "https://www.duyng-portfolio.com"
    r = client.post("/evaluate-challenge", json=body, headers={"Origin": "https://evil.example"})
    assert r.headers.get("Access-Control-Allow-Origin") is None
    r = client.get("/evaluate-challenge/health", headers={"Origin": "https://evil.example"})
    assert r.headers.get("Access-Control-Allow-Origin") is None
    r = client.options("/evaluate-challenge", headers={"Origin": "http://localhost:5500", "Access-Control-Request-Method": "POST",
                                                      "Access-Control-Request-Headers": "Content-Type"})
    assert r.headers.get("Access-Control-Allow-Origin") == "http://localhost:5500" and r.headers.get("Access-Control-Max-Age") == "600"
    r = client.post("/chat", json={"message": "hi"}, headers={"Origin": "https://evil.example"})
    assert r.headers.get("Access-Control-Allow-Origin")          # any origin still allowed on /chat


def test_judge_failure_on_evaluate_is_still_200(old_reference):
    client = make_app(judge=FailingJudge("rate_limited", retry_after=9)).test_client()
    r = client.post("/evaluate-challenge", json={"challenge_id": "fuzzySubtree", "code": old_reference})
    assert r.status_code == 200
    body = r.get_json()
    assert body["ai"]["reason"] == "rate_limited" and body["ai"]["degraded"] is True and body["evaluation"]["next_hint"]["source"] in ("ladder", "card")


def test_fake_judge_route(fake_client, old_reference):
    cr = make_client_results(CHALLENGES[1], old_reference, {"fz-06": True, "fz-15": True})
    r = fake_client.post("/evaluate-challenge", json={"challenge_id": "fuzzySubtree", "code": old_reference, "client_results": cr, "attempt": 1})
    body = r.get_json()
    assert r.status_code == 200 and body["ai"]["model"] == "fake-judge" and body["ai"]["degraded"] is False
    assert body["evaluation"]["next_hint"]["level"] == "conceptual" and body["evaluation"]["next_hint"]["source"] == "judge"


def test_every_challenge_accepts_its_starter(client):
    for c in CHALLENGES:
        cr = make_client_results(c, c.starter_code, {t.id: "undefined" for t in c.tests})
        r = client.post("/evaluate-challenge", json={"challenge_id": c.id, "code": c.starter_code, "client_results": cr})
        body = r.get_json()
        assert r.status_code == 200 and body["verdict"] == "FAIL" and body["retrieval"][0]["card_id"] == "missing_return"
        assert body["evaluation"]["next_hint"]["source"] == "card"


def test_grouped_degraded_issues_over_http(client, count):
    """Several failing tests that resolve to one card render ONE issue with one chip per test (was N identical issues)."""
    kb = next(k for k in count.known_bad if k.id == "or_instead_of_sum")
    cr = make_client_results(count, kb.code, {tid: 1 for tid in kb.expected_failing_ids})
    r = client.post("/evaluate-challenge", json={"challenge_id": "countSubtrees", "code": kb.code, "client_results": cr, "attempt": 2})
    body = r.get_json()
    assert r.status_code == 200 and body["verdict"] == "PARTIAL" and body["ai"]["degraded"] is True
    issues = body["evaluation"]["issues"]
    assert [i["title"] for i in issues] == ["OR instead of sum"]
    assert [e["ref"] for e in issues[0]["evidence"]] == ["cs-06", "cs-07", "cs-08", "cs-11"]
    assert all(e["kind"] == "test" for e in issues[0]["evidence"]) and body["response"].count("OR instead of sum") <= 1
    # the grouped evaluation survives the tutor's structural validation when the page echoes it back
    judge = RecordingJudge()
    tut = make_app(judge=judge).test_client()
    r = tut.post("/evaluate-challenge/tutor", json={"challenge_id": "countSubtrees", "code": kb.code, "client_results": cr, "attempt": 2,
                                                   "mode": "suggest_approach", "evaluation": body["evaluation"]})
    assert r.status_code == 200
    prior = json.loads(judge.tutor_calls[-1]["messages"][1]["content"])
    assert [e["ref"] for e in prior["issues"][0]["evidence"]] == ["cs-06", "cs-07", "cs-08", "cs-11"]


def test_tutor_explain_step_over_http(fake_client, client, old_reference):
    step = {"index": 5, "total": 21, "caption": "fuzzySameTree returns true.", "call": "fuzzySameTree(main node 4, pattern node 8, maxDifferences = 1)",
            "stack": ["fuzzySubtree(main node 1, pattern node 2, maxDifferences = 1)"], "returned": "true"}
    body = {"challenge_id": "fuzzySubtree", "code": old_reference, "mode": "explain_step", "step": step}
    r = fake_client.post("/evaluate-challenge/tutor", json=body)
    assert r.status_code == 200 and re.fullmatch(r"[0-9a-f]{12}", r.headers["X-Request-Id"]) and r.headers["Cache-Control"] == "no-store"
    out = r.get_json()
    assert set(out) == {"ok", "request_id", "answer", "hint_level", "socratic_question", "redirected", "ai", "response"}
    assert "Step 5 of 21: fuzzySameTree returns true." in out["answer"] and out["ai"]["model"] == "fake-judge"
    r = client.post("/evaluate-challenge/tutor", json=body)                       # degraded server
    assert r.status_code == 200 and r.get_json()["answer"] == "fuzzySameTree returns true. (AI tutor unavailable)"
    r = fake_client.post("/evaluate-challenge/tutor", json=dict(body, step=dict(step, total="21")))
    assert r.status_code == 400 and r.get_json()["error"]["field"] == "step" and r.get_json()["response"].startswith("Error: ")


# --------------------------------------------------------------------------- validation never answers with an HTML 500

BASE_BODY = {"challenge_id": "fuzzySubtree", "code": "function fuzzySubtree() {}"}
CHUNKED = {"wsgi.input_terminated": True, "HTTP_TRANSFER_ENCODING": "chunked"}   # what a WSGI server sets for a chunked body


def test_numeric_junk_is_clamped_not_500(client):
    """attempt / hints_used coercion never raises (was OverflowError on inf, ValueError on a 5000-digit string)."""
    assert clamp_attempt("inf") == 1 and clamp_attempt("-inf") == 1 and clamp_attempt("nan") == 1 and clamp_attempt("1e999") == 1
    assert clamp_attempt(float("inf")) == 1 and clamp_attempt(float("-inf")) == 1 and clamp_attempt(float("nan")) == 1
    assert clamp_attempt("1" * 5000) == 1 and clamp_attempt(1e300) == 50 and clamp_attempt(10 ** 5000) == 50 and clamp_attempt(-(10 ** 5000)) == 1
    assert clamp_attempt("3") == 3 and clamp_attempt(" 7 ") == 7 and clamp_attempt("2.9") == 2 and clamp_attempt(2.9) == 2 and clamp_attempt(0) == 1
    assert clamp_attempt(True) == 1 and clamp_attempt(None) == 1 and clamp_attempt([2]) == 1 and clamp_attempt("") == 1 and clamp_attempt("junk") == 1
    assert clean_hints_used(["9" * 5000, "\u00b2", "1", 2, "3", 99, True, "1", " 2 ", 2.0, None, "", "1.0"]) == [1, 2, 3]
    assert clean_hints_used("123") == [] and clean_hints_used(None) == []
    for attempt in ("inf", "-inf", "nan", "1" * 5000, "1e999", "junk", None, [1]):
        r = client.post("/evaluate-challenge", json=dict(BASE_BODY, attempt=attempt))
        assert r.status_code == 200 and r.get_json()["attempt"] == 1, attempt
    for raw in ("Infinity", "-Infinity", "NaN", "1e999", "9" * 4000):          # what json.loads turns into inf/nan/huge
        r = client.post("/evaluate-challenge", data='{"attempt": %s, "challenge_id": "fuzzySubtree", "code": "function fuzzySubtree() {}"}' % raw,
                        content_type="application/json")
        assert r.status_code == 200 and r.get_json()["attempt"] == (50 if raw.startswith("9") else 1), raw
    r = client.post("/evaluate-challenge", json=dict(BASE_BODY, hints_used=["9" * 5000, "\u00b2", "3", 1]))
    assert r.status_code == 200 and r.get_json()["pipeline"]["trace"][0]["detail"] == "fuzzySubtree, attempt 1, hints used: 1,3"
    r = client.post("/evaluate-challenge/tutor", json=dict(BASE_BODY, mode="explain_problem", attempt="inf", hints_used=["9" * 5000]))
    assert r.status_code == 200 and r.get_json()["ok"] is True


@pytest.mark.parametrize("url", ["/evaluate-challenge", "/evaluate-challenge/tutor"])
def test_deeply_nested_json_gets_the_envelope(client, url):
    """json.loads raises RecursionError (not ValueError) on deep nesting: 400 invalid_json, never an HTML 500."""
    for data in ("[" * 50_000, '{"a":' * 15_000 + "1" + "}" * 15_000, "[" * 40_000 + "]" * 40_000):   # all under the 96 KB cap
        r = client.post(url, data=data, content_type="application/json")
        assert r.status_code == 400, (len(data), r.status_code)
        body = r.get_json()
        assert body["ok"] is False and body["error"]["code"] == "invalid_json" and body["response"].startswith("Error:")
        assert r.headers["Content-Type"].startswith("application/json") and re.fullmatch(r"[0-9a-f]{12}", body["request_id"])
    # a 100000-deep body is above the body cap: the 413 envelope, with a Content-Length and chunked alike
    r = client.post(url, data="[" * 100_000, content_type="application/json")
    assert r.status_code == 413 and r.get_json()["error"]["code"] == "payload_too_large"
    r = client.post(url, data="[" * 100_000, content_type="application/json", environ_overrides=CHUNKED)
    assert r.status_code == 413 and r.get_json()["error"]["code"] == "payload_too_large"


def test_chunked_body_over_the_cap_is_413(client):
    """Werkzeug only cuts a chunked body (no Content-Length) at max_content_length: a cut body must be the 413
    envelope, not 400 (unparsable remainder) and not 200 (JSON that completes inside the first 96 KB plus junk)."""
    big = json.dumps(dict(BASE_BODY, pad="p" * 150_000))
    for url in ("/evaluate-challenge", "/evaluate-challenge/tutor"):
        r = client.post(url, data=big, content_type="application/json", environ_overrides=CHUNKED)
        assert r.status_code == 413, url
        body = r.get_json()
        assert body["ok"] is False and body["error"]["code"] == "payload_too_large" and body["response"].startswith("Error:")
        assert body["error"]["message"] == "request body exceeds 96000 bytes" and r.headers["Content-Type"].startswith("application/json")
    junk = json.dumps(BASE_BODY) + " " * 100_000 + "}}}garbage"
    r = client.post("/evaluate-challenge", data=junk, content_type="application/json", environ_overrides=CHUNKED)
    assert r.status_code == 413 and r.get_json()["error"]["code"] == "payload_too_large"
    # a chunked body under the cap is still accepted
    r = client.post("/evaluate-challenge", data=json.dumps(BASE_BODY), content_type="application/json", environ_overrides=CHUNKED)
    assert r.status_code == 200 and r.get_json()["verdict"] == "UNVERIFIED"
    r = client.post("/evaluate-challenge", data=json.dumps(dict(BASE_BODY, pad="p" * 90_000)), content_type="application/json",
                    environ_overrides=CHUNKED)
    assert r.status_code == 200


@pytest.mark.parametrize("url, extra", [("/evaluate-challenge", {}), ("/evaluate-challenge/tutor", {"mode": "explain_problem"})])
def test_json_content_type_required(client, url, extra):
    """text/plain and form bodies are CORS 'simple' requests (sent cross-site without a preflight): they get the 400
    envelope and never an evaluation; application/json with a charset parameter is fine."""
    payload = json.dumps(dict(BASE_BODY, **extra))
    for ctype in ("text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x",
                  "text/json", "application/octet-stream", None):
        kwargs = {"content_type": ctype} if ctype else {}
        r = client.post(url, data=payload, headers={"Origin": "https://evil.example"}, **kwargs)
        assert r.status_code == 400, (ctype, r.get_json())
        body = r.get_json()
        assert body["ok"] is False and body["error"] == {"code": "invalid_request", "message": "Content-Type must be application/json",
                                                         "field": "content-type"}
        assert body["response"] == "Error: Content-Type must be application/json" and "verdict" not in body
        assert r.headers.get("Access-Control-Allow-Origin") is None and r.headers["Cache-Control"] == "no-store"
    for ctype in ("application/json", "application/json;charset=utf-8", "application/json; charset=UTF-8"):
        r = client.post(url, data=payload, content_type=ctype)
        assert r.status_code == 200 and r.get_json()["ok"] is True, (ctype, r.get_json())
    # a JSON content type with a form body is still just invalid JSON
    r = client.post(url, data="challenge_id=fuzzySubtree&code=x", content_type="application/json")
    assert r.status_code == 400 and r.get_json()["error"]["code"] == "invalid_json"
