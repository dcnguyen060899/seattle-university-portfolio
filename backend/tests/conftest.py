"""pytest configuration: make ``backend/src`` importable (registry part) and provide the app/judge fixtures
(spec 10.1).  No network, no key: ANTHROPIC_API_KEY is forced empty and EVAL_FAKE_JUDGE cleared before the
evaluation package reads its settings."""
import json
import os
import sys
from types import SimpleNamespace

import httpx
import pytest

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
if SRC not in sys.path:
    sys.path.insert(0, SRC)

os.environ["ANTHROPIC_API_KEY"] = ""
for _var in ("EVAL_FAKE_JUDGE", "EVAL_AI_DISABLED", "EVAL_MODEL", "ANTHROPIC_MODEL", "EVAL_EFFORT", "EVAL_MAX_TOKENS",
             "EVAL_RATE_PER_MIN", "ALLOWED_ORIGINS"):
    os.environ.pop(_var, None)

from evaluation import config as _config  # noqa: E402
_config.reload()

from evaluation import init_evaluation  # noqa: E402
from evaluation.config import DEFAULT_ORIGINS  # noqa: E402
from evaluation.evidence import code_sha256  # noqa: E402
from evaluation.judge import FakeJudge, JudgeResult, HTTP_STATUS, USER_MESSAGES  # noqa: E402
from evaluation.registry import BY_ID, tests_hash  # noqa: E402

API_URL = "https://api.anthropic.com/v1/messages"


# --------------------------------------------------------------------------- SDK fakes

def make_message(text, model="claude-sonnet-5", stop_reason="end_turn", content=None):
    return SimpleNamespace(
        content=content if content is not None else [SimpleNamespace(type="text", text=text)],
        stop_reason=stop_reason, model=model,
        usage=SimpleNamespace(input_tokens=1500, output_tokens=300, cache_read_input_tokens=1400, cache_creation_input_tokens=0),
        _request_id="req_test")


def sdk_error(cls, status, headers=None, message="boom"):
    req = httpx.Request("POST", API_URL)
    resp = httpx.Response(status, request=req, headers=headers or {})
    return cls(message, response=resp, body=None)


class FakeAnthropicClient:
    """``messages.create(**kwargs)`` records kwargs and returns a canned message or raises queued errors."""

    def __init__(self, payload=None, errors=(), response=None):
        self.calls = []
        self.errors = list(errors)
        self.payload = payload
        self.response = response
        self.messages = SimpleNamespace(create=self.create)

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.errors:
            raise self.errors.pop(0)
        if self.response is not None:
            return self.response
        return make_message(json.dumps(self.payload), model=kwargs["model"])


class FailingJudge:
    """A judge whose calls always fail with the given reason (for HTTP mapping and degraded tests)."""

    model = "failing-judge"
    effort = "medium"

    def __init__(self, reason="timeout", retry_after=None):
        self.reason, self.retry_after = reason, retry_after

    def _fail(self):
        return JudgeResult(ok=False, reason=self.reason, http_status=HTTP_STATUS[self.reason],
                           user_message=USER_MESSAGES[self.reason], model=self.model, retry_after=self.retry_after, ms=5)

    def evaluate(self, challenge, submission, **kw):
        return self._fail()

    def tutor(self, challenge, messages, **kw):
        return self._fail()


class RecordingJudge(FakeJudge):
    """FakeJudge that records what it was called with and can return a custom tutor/evaluate payload."""

    effort = "medium"

    def __init__(self, tutor_payload=None, eval_payload=None):
        self.submissions = []
        self.tutor_calls = []
        self.tutor_payload = tutor_payload
        self.eval_payload = eval_payload

    def evaluate(self, challenge, submission, **kw):
        self.submissions.append(submission)
        if self.eval_payload is not None:
            return JudgeResult(ok=True, data=json.loads(json.dumps(self.eval_payload)), model=self.model, ms=1)
        return super().evaluate(challenge, submission, **kw)

    def tutor(self, challenge, messages, **kw):
        self.tutor_calls.append({"messages": messages, **kw})
        if self.tutor_payload is not None:
            return JudgeResult(ok=True, data=dict(self.tutor_payload), model=self.model, ms=1)
        return super().tutor(challenge, messages, **kw)


# --------------------------------------------------------------------------- evidence builder

def make_client_results(challenge, code, actuals=None, *, compile_ok=True, entry_found=True, error_kind=None,
                        compile_error=None, omit=(), harness_version=None, tests_hash_value=None, code_sha=None):
    """Fabricate ``client_results`` with correct hashes.

    ``actuals`` maps test id -> actual value, ``("error", message)``, ``"timeout"``, or ``"undefined"``;
    tests not listed pass (actual = expected).  ``omit`` lists ids to leave out (-> not_run).
    """
    actuals = actuals or {}
    tests = []
    for t in challenge.tests:
        if t.id in omit:
            continue
        a = actuals.get(t.id, t.expected)
        if isinstance(a, tuple) and a and a[0] == "error":
            tests.append({"id": t.id, "status": "error", "actual": None, "actual_type": "error", "error": a[1], "ms": 0.1})
        elif a == "timeout":
            tests.append({"id": t.id, "status": "timeout", "actual": None, "actual_type": "timeout",
                          "error": "Timed out after 2000 ms (infinite loop?)", "ms": 2000})
        elif a == "undefined":
            tests.append({"id": t.id, "status": "fail", "actual": "undefined", "actual_type": "undefined", "error": None, "ms": 0.1})
        else:
            if isinstance(a, bool):
                typ = "boolean"
            elif isinstance(a, (int, float)):
                typ = "number"
            elif a is None:
                typ = "null"
            else:
                typ = "string"
            tests.append({"id": t.id, "status": "pass" if a == t.expected and type(a) is type(t.expected) else "fail",
                          "actual": a, "actual_type": typ, "error": None, "ms": 0.1})
    return {"harness_version": harness_version or challenge.harness_version,
            "tests_hash": tests_hash_value or tests_hash(challenge),
            "code_sha256": code_sha or code_sha256(code),
            "compile": {"ok": compile_ok, "error": compile_error, "error_kind": error_kind, "entry_found": entry_found,
                        "defined_functions": [challenge.entry_function]},
            "tests": tests, "total_ms": 3.0}


# --------------------------------------------------------------------------- fixtures

@pytest.fixture
def fuzzy():
    return BY_ID["fuzzySubtree"]


@pytest.fixture
def count():
    return BY_ID["countSubtrees"]


@pytest.fixture
def mirror():
    return BY_ID["mirrorSubtree"]


@pytest.fixture
def old_reference(fuzzy):
    """The page's former reference: fails exactly fz-06 and fz-15 (card split_budget)."""
    return next(k for k in fuzzy.known_bad if k.id == "page_old_reference").code


@pytest.fixture
def evidence():
    return make_client_results


@pytest.fixture
def good_payload():
    """A valid judge JSON for fuzzySubtree, attempt 1 (adapted from calibration example 1; lines exist in old_reference)."""
    return {
        "verdict": "PARTIAL",
        "summary": "Your search is right and 15 of 17 tests pass; fz-06 and fz-15 show the budget is not shared across the candidate.",
        "progress_note": "",
        "scores": {"correctness": {"score": 70, "justification": "15/17 tests pass; fz-06 and fz-15 fail on the core budget rule."},
                   "edge_cases": {"score": 95, "justification": "fz-01, fz-02, fz-08 and fz-13 all pass with explicit null checks on lines 2-3."},
                   "key_concepts": {"score": 55, "justification": "Search/compare separation is present; the shared-budget concept is missing (fz-06)."},
                   "efficiency": {"score": 85, "justification": "Each candidate is compared once; O(n*m) time, recursion depth O(h)."},
                   "code_quality": {"score": 80, "justification": "Two focused functions with clear names."}},
        "strengths": ["fuzzySubtree on lines 1-9 tries every node as a candidate, which is why fz-03, fz-10 and fz-14 pass.",
                      "Shape mismatches return false before any value comparison (line 15), which fz-08 and fz-13 check."],
        "issues": [{"title": "Difference budget is copied into each branch", "category": "key_concept", "severity": "high",
                    "explanation": "On lines 24-25 the updated differences count is passed separately into the left call and the right call, so in fz-06 both sides spend one difference and both return true.",
                    "evidence": [{"kind": "test", "ref": "fz-06"}, {"kind": "line", "ref": "24-25"}]}],
        "misconception_tags": ["split_budget"],
        "complexity": {"time": "O(n*m)", "space": "O(h)", "note": ""},
        "next_hint": {"level": "conceptual",
                      "text": "The spec says one budget covers the whole candidate: root, left subtree and right subtree together. In fz-06 the candidate rooted at 2 has one difference on the left and one on the right.",
                      "socratic_question": "How many copies of your differences variable exist while one candidate is being compared?"},
        "what_to_try_next": ["Trace fz-06 by hand and write the value of differences at each call of fuzzySameTree."],
        "encouragement": "You have the structure of the algorithm right; one shared piece of state is all that separates this from a full pass.",
        "flags": [],
    }


def make_app(judge=None, per_min=None, burst=None, origins=None):
    from flask import Flask, jsonify
    app = Flask("evaluation-test")
    app.config["TESTING"] = True

    @app.route("/chat", methods=["POST"])
    def _chat():
        return jsonify({"response": "hi"})

    init_evaluation(app, judge=judge, origins=origins or DEFAULT_ORIGINS, rate_per_min=per_min, burst=burst)
    return app


@pytest.fixture
def app():
    return make_app(judge=None)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def fake_client():
    return make_app(judge=FakeJudge()).test_client()
