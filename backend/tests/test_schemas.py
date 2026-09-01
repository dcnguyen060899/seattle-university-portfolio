"""Request validation (spec 4.2 / 10.1 test_schemas.py)."""
import hashlib
import json
import os

import pytest

from conftest import make_client_results
from evaluation.registry import BY_ID
from evaluation.routes import (clamp_attempt, clean_hints_used, clean_previous, parse_evaluate_request, RequestError)

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "sha.json")


@pytest.mark.parametrize("code, expected_code", [
    ("x" * 20001, "invalid_request"),
    ("a\n" * 600, "invalid_request"),          # 601 lines
    ("function f(){}\x00", "invalid_request"),
    ("   \n\t ", "empty_code"),
    (12, "invalid_request"),
])
def test_size_caps(client, code, expected_code):
    r = client.post("/evaluate-challenge", json={"challenge_id": "fuzzySubtree", "code": code})
    assert r.status_code == 400
    body = r.get_json()
    assert body["ok"] is False and body["error"]["code"] == expected_code and body["error"]["field"] == "code"
    assert body["response"].startswith("Error: ")
    assert len(body["request_id"]) == 12


def test_limits_are_inclusive(client):
    r = client.post("/evaluate-challenge", json={"challenge_id": "fuzzySubtree", "code": "x" * 20000})
    assert r.status_code == 200
    r = client.post("/evaluate-challenge", json={"challenge_id": "fuzzySubtree", "code": "a\n" * 599 + "a"})
    assert r.status_code == 200


def test_attempt_and_hints_clamped():
    assert clamp_attempt(999) == 50 and clamp_attempt(-3) == 1 and clamp_attempt("7") == 7
    assert clamp_attempt("junk") == 1 and clamp_attempt(None) == 1 and clamp_attempt(True) == 1 and clamp_attempt(2.9) == 2
    assert clean_hints_used([1, 1, 9]) == [1]
    assert clean_hints_used([3, "2", 1, 0, True, "x"]) == [1, 2, 3]
    assert clean_hints_used("12") == [] and clean_hints_used(None) == []


def test_previous_filtered():
    fz = BY_ID["fuzzySubtree"]
    p = clean_previous({"failed_test_ids": ["fz-06", "nope", "fz-06", 5, "fz-15"], "hint_level": "bogus"}, fz)
    assert p == {"failed_test_ids": ["fz-06", "fz-15"], "hint_level": None}
    assert clean_previous(["fz-06"], fz) is None and clean_previous(None, fz) is None
    p = clean_previous({"failed_test_ids": "fz-06", "hint_level": "targeted"}, fz)
    assert p == {"failed_test_ids": [], "hint_level": "targeted"}
    many = clean_previous({"failed_test_ids": [t.id for t in fz.tests] * 2}, fz)
    assert len(many["failed_test_ids"]) == 17


def test_parse_request_normalizes(old_reference):
    challenge, req = parse_evaluate_request({"challenge_type": "fuzzySubtree", "code": old_reference, "attempt": "3",
                                             "hints_used": [2, 1], "learner_state": {"gave_up": 1}, "extra": "ignored"})
    assert challenge.id == "fuzzySubtree" and req.attempt == 3 and req.hints_used == [1, 2]
    assert req.learner_state == {"gave_up": True, "solution_revealed": False}
    assert req.legacy is True and req.client_results is None and req.previous is None


def test_challenge_id_wins_and_unknown_rejected(old_reference):
    challenge, _ = parse_evaluate_request({"challenge_id": "countSubtrees", "challenge_type": "fuzzySubtree", "code": old_reference})
    assert challenge.id == "countSubtrees"
    with pytest.raises(RequestError) as e:
        parse_evaluate_request({"challenge_id": "nope", "code": old_reference})
    assert e.value.code == "unknown_challenge" and e.value.status == 400


@pytest.mark.parametrize("mutation, note", [
    ({"harness_version": "0"}, "stale_harness"),
    ({"tests_hash": "0000000000000000"}, "tests_hash_mismatch"),
    ({"code_sha256": "ab" * 32}, "stale_code_hash"),
    ({"tests": {"not": "a list"}}, "malformed"),
    ({"compile": {"ok": "yes"}}, "malformed"),
    ({"tests": [{"id": "fz-01", "status": "weird", "actual": True, "actual_type": "boolean", "error": None, "ms": 1}]}, "malformed"),
    ({"tests": [{"id": "fz-01", "status": "pass", "actual": "x" * 101, "actual_type": "string", "error": None, "ms": 1}]}, "malformed"),
    ({"tests": [{"id": "fz-01", "status": "pass", "actual": True, "actual_type": "boolean", "error": None, "ms": 99999}]}, "malformed"),
    ({"tests": [{"id": "fz-01", "status": "pass", "actual": True, "actual_type": "boolean", "error": "e" * 201, "ms": 1}]}, "malformed"),
])
def test_client_results_discarded(client, old_reference, mutation, note):
    cr = make_client_results(BY_ID["fuzzySubtree"], old_reference, {"fz-06": True, "fz-15": True})
    cr.update(mutation)
    r = client.post("/evaluate-challenge", json={"challenge_id": "fuzzySubtree", "code": old_reference, "client_results": cr})
    assert r.status_code == 200
    body = r.get_json()
    assert body["tests"]["mode"] == "no_tests" and body["tests"]["evidence_note"] == note
    assert body["verdict"] == "UNVERIFIED"
    assert any(s["stage"] == "tests" and s["status"] == "skipped" and note in s["detail"] for s in body["pipeline"]["trace"])


def test_valid_client_results_accepted(client, old_reference):
    cr = make_client_results(BY_ID["fuzzySubtree"], old_reference, {"fz-06": True, "fz-15": True})
    r = client.post("/evaluate-challenge", json={"challenge_id": "fuzzySubtree", "code": old_reference, "client_results": cr})
    body = r.get_json()
    assert body["tests"]["mode"] == "tests" and body["tests"]["evidence_note"] == ""
    assert body["verdict"] == "PARTIAL" and body["tests"]["summary"]["passed"] == 15


def test_code_sha256_cross_language():
    with open(FIXTURE, encoding="utf-8") as fh:
        d = json.load(fh)
    assert hashlib.sha256(d["input"].encode("utf-8")).hexdigest() == d["sha256"]
    assert d["input"] == "function f(){}\n// é\n"


def test_invalid_json_and_non_object(client):
    r = client.post("/evaluate-challenge", data="[1", content_type="application/json")
    assert r.status_code == 400 and r.get_json()["error"]["code"] == "invalid_json"
    r = client.post("/evaluate-challenge", data="[1, 2]", content_type="application/json")
    assert r.status_code == 400 and r.get_json()["error"]["code"] == "invalid_json"
