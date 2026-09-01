"""HTTP contracts (spec 4 / 10.1 test_routes.py; A2 removes the signature tests)."""
import json
import re

from conftest import FailingJudge, make_app, make_client_results
from evaluation.judge import FakeJudge
from evaluation.registry import CHALLENGES, registry_hash, tests_hash

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
    assert body["challenges"] == [{"id": c.id, "tests_hash": tests_hash(c)} for c in CHALLENGES]
    assert body["followup"] is False and re.fullmatch(r"[0-9a-f]{12}", body["request_id"])
    assert r.headers["Cache-Control"] == "no-store"
    fake = fake_client.get("/evaluate-challenge/health").get_json()
    assert fake["ai_configured"] is True and fake["followup"] is True and fake["model"] == "fake-judge"


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
