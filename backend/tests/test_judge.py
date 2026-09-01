"""Model call shape and error mapping (spec 6.1, addendum A4/A6 / 10.1 test_judge.py)."""
import json
from types import SimpleNamespace

import anthropic
import pytest

from conftest import FakeAnthropicClient, make_message, sdk_error
from evaluation import config, judge as judge_mod
from evaluation.judge import USER_MESSAGES, AnthropicJudge, FakeJudge, build_default_judge, system_blocks
from evaluation.schema import TUTOR_SCHEMA, judge_schema


def _judge(client, **kw):
    return AnthropicJudge(client=client, model="claude-sonnet-5", effort="medium", max_tokens=16000, retry_delay=0.0, **kw)


def test_request_shape(fuzzy, good_payload):
    fc = FakeAnthropicClient(payload=good_payload)
    res = _judge(fc).evaluate(fuzzy, "<submission/>")
    assert res.ok and res.data == good_payload and res.model == "claude-sonnet-5" and res.anthropic_request_id == "req_test"
    assert res.usage == {"input_tokens": 1500, "output_tokens": 300, "cache_read_input_tokens": 1400, "cache_creation_input_tokens": 0}
    kw = fc.calls[0]
    assert kw["model"] == "claude-sonnet-5" and kw["max_tokens"] == 16000
    assert kw["thinking"] == {"type": "adaptive"}
    assert kw["output_config"]["effort"] == "medium" and kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["output_config"]["format"]["schema"] is judge_schema(fuzzy)
    assert not ({"temperature", "top_p", "top_k", "stop_sequences", "tools"} & set(kw))
    assert kw["messages"][-1]["role"] == "user"
    assert [b["cache_control"] for b in kw["system"]] == [{"type": "ephemeral", "ttl": "1h"}] * 2
    assert kw["messages"][0]["content"][0]["cache_control"] == {"type": "ephemeral"}
    assert kw["messages"][0]["content"][0]["text"] == "<submission/>"
    assert kw["system"] == system_blocks(fuzzy)


def test_tutor_call_shape(fuzzy):
    payload = {"answer": "a", "hint_level": "conceptual", "socratic_question": "q?", "redirected": False}
    fc = FakeAnthropicClient(payload=payload)
    messages = [{"role": "user", "content": [{"type": "text", "text": "sub", "cache_control": {"type": "ephemeral"}}]},
                {"role": "assistant", "content": "{}"}, {"role": "user", "content": "<tutor/>"}]
    res = _judge(fc).tutor(fuzzy, messages)
    assert res.ok and res.data == payload
    kw = fc.calls[0]
    assert kw["max_tokens"] == 4000 and kw["output_config"]["format"]["schema"] is TUTOR_SCHEMA
    assert kw["messages"] == messages and kw["messages"][-1]["role"] == "user"
    assert kw["thinking"] == {"type": "adaptive"} and kw["output_config"]["effort"] == "medium"


@pytest.mark.parametrize("err, reason, status, retried", [
    (lambda: sdk_error(anthropic.AuthenticationError, 401), "auth_error", 503, False),
    (lambda: sdk_error(anthropic.PermissionDeniedError, 403), "auth_error", 503, False),
    (lambda: sdk_error(anthropic.RateLimitError, 429, {"retry-after": "7"}), "rate_limited", 429, False),
    (lambda: sdk_error(anthropic.OverloadedError, 529), "upstream_unavailable", 503, True),
    (lambda: sdk_error(anthropic.InternalServerError, 500), "upstream_unavailable", 503, True),
    (lambda: sdk_error(anthropic.ServiceUnavailableError, 503), "upstream_unavailable", 503, True),
    (lambda: sdk_error(anthropic.BadRequestError, 400), "request_rejected", 502, False),
    (lambda: sdk_error(anthropic.NotFoundError, 404), "request_rejected", 502, False),
    (lambda: sdk_error(anthropic.UnprocessableEntityError, 422), "request_rejected", 502, False),
    (lambda: sdk_error(anthropic.RequestTooLargeError, 413), "request_rejected", 502, False),
    (lambda: sdk_error(anthropic.APIStatusError, 418), "request_rejected", 502, False),
    (lambda: sdk_error(anthropic.APIStatusError, 502), "upstream_unavailable", 503, True),
    (lambda: anthropic.APITimeoutError(request=sdk_error(anthropic.APIStatusError, 500).request), "timeout", 504, False),
    (lambda: anthropic.APIConnectionError(request=sdk_error(anthropic.APIStatusError, 500).request), "connection_error", 502, True),
    (lambda: RuntimeError("weird"), "unexpected", 500, False),
])
def test_error_mapping(fuzzy, err, reason, status, retried):
    fc = FakeAnthropicClient(payload={}, errors=[err(), err()])
    res = _judge(fc).evaluate(fuzzy, "s")
    assert res.ok is False and res.reason == reason and res.http_status == status
    assert res.user_message == USER_MESSAGES[reason]
    assert len(fc.calls) == (2 if retried else 1)
    assert "boom" not in (res.user_message or "") and "weird" not in (res.user_message or "")
    if reason == "rate_limited":
        assert res.retry_after == 7


def test_retry_after_defaults_to_30(fuzzy):
    fc = FakeAnthropicClient(payload={}, errors=[sdk_error(anthropic.RateLimitError, 429)])
    res = _judge(fc).evaluate(fuzzy, "s")
    assert res.retry_after == 30 and len(fc.calls) == 1


def test_fast_retry_succeeds_second_time(fuzzy, good_payload):
    fc = FakeAnthropicClient(payload=good_payload, errors=[sdk_error(anthropic.OverloadedError, 529)])
    res = _judge(fc).evaluate(fuzzy, "s")
    assert res.ok and len(fc.calls) == 2


def test_no_retry_when_first_failure_was_slow(fuzzy, good_payload):
    fc = FakeAnthropicClient(payload=good_payload, errors=[sdk_error(anthropic.OverloadedError, 529)])
    res = _judge(fc, fast_window_s=0.0).evaluate(fuzzy, "s")
    assert res.ok is False and res.reason == "upstream_unavailable" and len(fc.calls) == 1


@pytest.mark.parametrize("response, reason", [
    (make_message("{}", stop_reason="refusal"), "refusal"),
    (make_message("{", stop_reason="max_tokens"), "bad_output"),
    (make_message("", content=[SimpleNamespace(type="thinking", thinking="...")]), "bad_output"),
    (make_message("not json"), "bad_output"),
    (make_message("[1,2]"), "bad_output"),
])
def test_refusal_max_tokens_missing_text_bad_json(fuzzy, response, reason):
    fc = FakeAnthropicClient(response=response)
    res = _judge(fc).evaluate(fuzzy, "s")
    assert res.ok is False and res.reason == reason and res.user_message == USER_MESSAGES[reason]
    assert res.anthropic_request_id == "req_test"


def test_build_default_judge(monkeypatch):
    monkeypatch.setattr(config, "FAKE_JUDGE", False)
    monkeypatch.setattr(config, "AI_DISABLED", False)
    monkeypatch.setattr(config, "API_KEY", "")
    assert build_default_judge() is None
    monkeypatch.setattr(config, "FAKE_JUDGE", True)
    assert isinstance(build_default_judge(), FakeJudge) and build_default_judge().model == "fake-judge"
    monkeypatch.setattr(config, "FAKE_JUDGE", False)
    monkeypatch.setattr(config, "API_KEY", "sk-test")
    monkeypatch.setattr(config, "AI_DISABLED", True)
    assert build_default_judge() is None
    monkeypatch.setattr(config, "AI_DISABLED", False)
    j = build_default_judge()
    assert isinstance(j, AnthropicJudge) and j.model == config.MODEL and j.effort == "medium" and j.max_tokens == 16000
    assert j.client.max_retries == 0


def test_config_reload_from_env(monkeypatch):
    monkeypatch.setenv("EVAL_EFFORT", "bogus")
    monkeypatch.setenv("EVAL_MAX_TOKENS", "999999")
    monkeypatch.setenv("EVAL_MODEL", "claude-x")
    monkeypatch.setenv("ANTHROPIC_MODEL", "claude-y")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.example, https://b.example")
    config.reload()
    try:
        assert config.EFFORT == "medium" and config.MAX_TOKENS == 32000 and config.MODEL == "claude-x"
        assert config.ALLOWED_ORIGINS == ["https://a.example", "https://b.example"]
    finally:
        for v in ("EVAL_EFFORT", "EVAL_MAX_TOKENS", "EVAL_MODEL", "ANTHROPIC_MODEL", "ALLOWED_ORIGINS"):
            monkeypatch.delenv(v, raising=False)
        config.reload()
    assert config.MODEL == "claude-sonnet-5" and config.ALLOWED_ORIGINS == config.DEFAULT_ORIGINS


def test_fake_judge_is_schema_valid(fuzzy, old_reference):
    from conftest import make_client_results
    from evaluation.evidence import build_evidence
    from evaluation.retrieval import retrieve_cards
    ev = build_evidence(fuzzy, old_reference, make_client_results(fuzzy, old_reference, {"fz-06": True, "fz-15": True}))
    cards = retrieve_cards(fuzzy, ev)
    res = FakeJudge().evaluate(fuzzy, "s", ev=ev, cards=cards, level="targeted", attempt=2)
    assert res.ok and res.model == "fake-judge"
    d = res.data
    assert set(d) == set(judge_schema(fuzzy)["required"])
    assert d["verdict"] == "PARTIAL" and d["next_hint"]["level"] == "targeted"
    assert d["issues"][0]["evidence"][0] == {"kind": "test", "ref": "fz-06"}
    assert d["misconception_tags"] == ["split_budget"]
    json.dumps(d)
