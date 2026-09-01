"""The judge (spec 6.1 with addendum A4; FakeJudge per A6).

``AnthropicJudge`` wraps ``anthropic.Anthropic().messages.create`` with structured output, adaptive
thinking, the three cache breakpoints and the typed error mapping.  ``FakeJudge`` (``EVAL_FAKE_JUDGE=1``)
returns deterministic, schema-valid output built from the evidence so the whole AI path can be exercised
without a key.  Nothing from an SDK exception's text reaches the client.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field

import anthropic

from . import config
from .evidence import first_failed_test
from .postcheck import derive_verdict, fallback_hint
from .prompts import JUDGE_CORE, render_challenge_pack
from .schema import TUTOR_SCHEMA, judge_schema

logger = logging.getLogger("evaluation.judge")

CACHE_1H = {"type": "ephemeral", "ttl": "1h"}
CACHE_5M = {"type": "ephemeral"}
TUTOR_MAX_TOKENS = 4000

USER_MESSAGES = {
    "not_configured": "The AI tutor is not configured on this server yet; here is what the tests found.",
    "disabled": "The AI tutor is switched off on this server; here is what the tests found.",
    "auth_error": "The AI tutor is not configured correctly on the server (authentication failed). Your test results and hints still work.",
    "rate_limited": "The AI tutor is busy right now. Try again in a minute.",
    "upstream_unavailable": "The AI tutor's model service is temporarily unavailable.",
    "request_rejected": "The AI tutor request was rejected by the model service. This is a server-side configuration problem.",
    "timeout": "The AI tutor took too long to answer. Your test results are still shown.",
    "connection_error": "Could not reach the AI tutor service.",
    "refusal": "The AI tutor declined to review this submission.",
    "bad_output": "The AI tutor returned an unusable answer; showing rule-based feedback instead.",
    "unexpected": "Unexpected error in the AI tutor.",
}

HTTP_STATUS = {
    "rate_limited": 429, "auth_error": 503, "upstream_unavailable": 503,
    "request_rejected": 502, "connection_error": 502, "refusal": 502, "bad_output": 502,
    "timeout": 504, "unexpected": 500, "not_configured": 503, "disabled": 503,
}

EMPTY_USAGE = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}


@dataclass
class JudgeResult:
    ok: bool
    data: dict | None = None
    reason: str | None = None
    http_status: int | None = None
    user_message: str | None = None
    anthropic_request_id: str | None = None
    model: str | None = None
    usage: dict = field(default_factory=lambda: dict(EMPTY_USAGE))
    stop_reason: str | None = None
    ms: int = 0
    retry_after: int | None = None


def system_blocks(challenge) -> list:
    """Byte-stable across requests: block A (judge core) and block B (challenge pack), both 1-hour cached."""
    return [
        {"type": "text", "text": JUDGE_CORE, "cache_control": dict(CACHE_1H)},
        {"type": "text", "text": render_challenge_pack(challenge), "cache_control": dict(CACHE_1H)},
    ]


def submission_message(submission: str) -> dict:
    return {"role": "user", "content": [{"type": "text", "text": submission, "cache_control": dict(CACHE_5M)}]}


def _retry_after(e) -> int:
    try:
        raw = e.response.headers.get("retry-after")
        value = int(float(raw))
        return max(1, min(300, value))
    except Exception:  # noqa: BLE001 - header missing or unparsable
        return 30


class AnthropicJudge:
    def __init__(self, client, model: str, effort: str, max_tokens: int, retry_delay: float = 1.0, fast_window_s: float = 10.0):
        self.client = client
        self.model = model
        self.effort = effort
        self.max_tokens = max_tokens
        self.retry_delay = retry_delay
        self.fast_window_s = fast_window_s

    # -- protocol -----------------------------------------------------------------------------
    def evaluate(self, challenge, submission: str, **_) -> JudgeResult:
        return self.create(system=system_blocks(challenge), messages=[submission_message(submission)],
                           schema=judge_schema(challenge))

    def tutor(self, challenge, messages: list, **_) -> JudgeResult:
        return self.create(system=system_blocks(challenge), messages=messages, schema=TUTOR_SCHEMA,
                           max_tokens=TUTOR_MAX_TOKENS)

    # -- the call (6.1) -----------------------------------------------------------------------
    def create(self, *, system, messages, schema, max_tokens=None) -> JudgeResult:
        kwargs = dict(
            model=self.model, max_tokens=max_tokens or self.max_tokens, system=system, messages=messages,
            thinking={"type": "adaptive"},
            output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": schema}},
            # NO temperature/top_p/top_k, NO assistant prefill as the last message, NO budget_tokens.
        )
        t0 = time.perf_counter()
        msg = None
        for attempt in (1, 2):
            try:
                msg = self.client.messages.create(**kwargs)
                break
            except (anthropic.OverloadedError, anthropic.ServiceUnavailableError, anthropic.InternalServerError) as e:
                if attempt == 1 and time.perf_counter() - t0 < self.fast_window_s:
                    time.sleep(self.retry_delay)
                    continue
                return self._fail("upstream_unavailable", e, t0)
            except anthropic.APITimeoutError as e:                      # before APIConnectionError (subclass)
                return self._fail("timeout", e, t0)
            except anthropic.APIConnectionError as e:
                if attempt == 1 and time.perf_counter() - t0 < self.fast_window_s:
                    time.sleep(self.retry_delay)
                    continue
                return self._fail("connection_error", e, t0)
            except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
                return self._fail("auth_error", e, t0)
            except anthropic.RateLimitError as e:
                return self._fail("rate_limited", e, t0, retry_after=_retry_after(e))
            except (anthropic.BadRequestError, anthropic.NotFoundError, anthropic.UnprocessableEntityError,
                    anthropic.RequestTooLargeError) as e:
                return self._fail("request_rejected", e, t0)
            except anthropic.APIStatusError as e:
                status = getattr(e, "status_code", 0) or 0
                return self._fail("upstream_unavailable" if status >= 500 else "request_rejected", e, t0)
            except Exception as e:  # noqa: BLE001
                logger.exception("judge unexpected")
                return self._fail("unexpected", e, t0)
        if msg is None:  # pragma: no cover - defensive; the loop always returns or breaks
            return self._fail("unexpected", None, t0)
        usage_obj = getattr(msg, "usage", None)
        usage = {k: (getattr(usage_obj, k, 0) or 0) for k in EMPTY_USAGE}
        rid = getattr(msg, "_request_id", None)
        stop = getattr(msg, "stop_reason", None)
        model = getattr(msg, "model", None) or self.model
        if stop == "refusal":
            return self._fail("refusal", None, t0, rid=rid, usage=usage, stop=stop, model=model)
        if stop == "max_tokens":
            return self._fail("bad_output", None, t0, rid=rid, usage=usage, stop=stop, model=model)
        text = next((getattr(b, "text", None) for b in (getattr(msg, "content", None) or []) if getattr(b, "type", "") == "text"), None)
        if text is None:
            return self._fail("bad_output", None, t0, rid=rid, usage=usage, stop=stop, model=model)
        try:
            data = json.loads(text)
        except ValueError as e:
            return self._fail("bad_output", e, t0, rid=rid, usage=usage, stop=stop, model=model)
        if not isinstance(data, dict):
            return self._fail("bad_output", None, t0, rid=rid, usage=usage, stop=stop, model=model)
        return JudgeResult(ok=True, data=data, anthropic_request_id=rid, model=model, usage=usage, stop_reason=stop,
                           ms=int((time.perf_counter() - t0) * 1000))

    def _fail(self, reason: str, e, t0: float, *, retry_after=None, rid=None, usage=None, stop=None, model=None) -> JudgeResult:
        status = getattr(e, "status_code", None) if e is not None else None
        rid = rid or (getattr(e, "request_id", None) if e is not None else None)
        logger.warning("judge_failed reason=%s status=%s type=%s anthropic_request_id=%s", reason, status,
                       type(e).__name__ if e is not None else "-", rid)
        return JudgeResult(ok=False, reason=reason, http_status=HTTP_STATUS[reason], user_message=USER_MESSAGES[reason],
                           anthropic_request_id=rid, model=model or self.model, usage=usage or dict(EMPTY_USAGE),
                           stop_reason=stop, ms=int((time.perf_counter() - t0) * 1000), retry_after=retry_after)


# --------------------------------------------------------------------------- A6 fake judge

class FakeJudge:
    """Deterministic, schema-valid output built from the evidence. Test-only (EVAL_FAKE_JUDGE=1)."""

    model = "fake-judge"

    def evaluate(self, challenge, submission: str, *, ev, cards, level, attempt=1, hints_used=(), **_) -> JudgeResult:
        s = ev["summary"]
        verdict = derive_verdict(ev)
        first = first_failed_test(ev)
        top = cards[0]["card"] if cards else None
        hint = fallback_hint(level, cards, challenge, ev, hints_used)
        if verdict == "PASS":
            scores = {"correctness": 100, "edge_cases": 100, "key_concepts": 90, "efficiency": 85, "code_quality": 85}
            issues = []
            strengths = [f"All {s['total']} tests pass, so the search and the compare logic agree with the catalog.",
                         "The entry function and its helper are both defined (static checks S01 and S04)."]
            what_next = [challenge.stretch_goal]
            if challenge.next_challenge_id:
                what_next.append(f"Move on to the next challenge ({challenge.next_challenge_id}).")
            tags = ["none"]
            summary = f"All {s['total']} tests pass. Fake judge: the remaining work is efficiency and clarity."
            enc = "Every test passes; that is a complete solution."
        elif verdict == "ERROR":
            scores = {"correctness": 0, "edge_cases": 0, "key_concepts": 30, "efficiency": 20, "code_quality": 50}
            failed_static = [c["id"] for c in ev["static"]["checks"] if c["status"] == "fail"]
            ref = failed_static[0] if failed_static else "S03"
            issues = [{"title": "Code did not run", "category": "syntax", "severity": "high",
                       "explanation": f"Fake judge: {ev['static']['syntax_detail'] or 'the harness could not run the code'}.",
                       "evidence": [{"kind": "static", "ref": ref}, {"kind": "line", "ref": "1"}]}]
            strengths = []
            what_next = ["Fix the error the harness reported, then run the tests again."]
            tags = ["none"]
            summary = "Fake judge: your code did not run."
            enc = "Getting the code to run is the first step."
        elif verdict == "UNVERIFIED":
            scores = {"correctness": 50, "edge_cases": 50, "key_concepts": 60, "efficiency": 70, "code_quality": 70}
            issues = []
            strengths = ["The submission defines the entry function (static check S01)."]
            what_next = ["Run the tests in the page so the review can use real evidence."]
            tags = ["none"]
            summary = "Fake judge: no tests ran, so this review is unverified."
            enc = "Run the tests to turn this into concrete feedback."
        else:
            executed = max(1, s["executed"])
            corr = int(round(100 * s["passed"] / executed))
            scores = {"correctness": corr, "edge_cases": corr, "key_concepts": 60, "efficiency": 75, "code_quality": 70}
            fid = first["id"] if first else ""
            title = top.title if top else f"Wrong result on {fid}"
            expl = (f"Fake judge: {fid} expected {first['expected']!s} but your code returned {first['actual']!s}."
                    if first else "Fake judge: a test failed.")
            if top:
                expl += f" {top.why}"
            issues = [{"title": title, "category": "correctness", "severity": "high", "explanation": expl,
                       "evidence": [{"kind": "test", "ref": fid}, {"kind": "line", "ref": "1"}]}]
            strengths = [f"{s['passed']} of {s['total']} tests pass, so part of the logic is already right."]
            what_next = [f"Expand {fid} below and trace it by hand.", "Re-run the tests after each change."]
            tags = [top.id] if top else ["none"]
            summary = f"Fake judge: {s['passed']} of {s['total']} tests pass; {fid} fails first."
            enc = "Part of the logic already works; the failing test points at one specific idea."
        data = {
            "verdict": verdict, "summary": summary, "progress_note": "",
            "scores": {d: {"score": v, "justification": f"Fake judge heuristic for {d}."} for d, v in scores.items()},
            "strengths": strengths, "issues": issues, "misconception_tags": tags,
            "complexity": {"time": "O(n * m)", "space": "O(h)", "note": "Fake judge: not analysed."},
            "next_hint": {"level": level, "text": hint["text"], "socratic_question": hint["question"]},
            "what_to_try_next": what_next, "encouragement": enc, "flags": [],
        }
        return JudgeResult(ok=True, data=data, model=self.model, usage=dict(EMPTY_USAGE), stop_reason="end_turn", ms=0,
                           anthropic_request_id="fake")

    def tutor(self, challenge, messages: list, *, ev, cards, level, tutor, **_) -> JudgeResult:
        mode = tutor.get("mode", "question")
        sel = tutor.get("selection")
        parts = [f"Fake tutor ({mode}, hint level {level})."]
        if sel:
            a, b = sel["start_line"], sel["end_line"]
            rng = f"Ln {a}-{b}" if a != b else f"Ln {a}"
            snippet = (sel.get("text") or "").strip().splitlines()[0][:80] if (sel.get("text") or "").strip() else ""
            parts.append(f"You highlighted {rng}" + (f": `{snippet}`." if snippet else "."))
        if mode == "question":
            parts.append(f"You asked: {tutor.get('question', '')[:160]}")
        if mode == "explain_problem":
            parts.append(challenge.summary)
        if mode == "complexity":
            parts.append("Your current code looks O(n * m) time and O(h) space against the same target.")
        if mode == "suggest_approach":
            parts.append(challenge.fallback_by_level[level if level != "extension" else "conceptual"].text)
        if cards:
            parts.append(cards[0]["card"].symptom)
        if mode in ("explain_problem", "complexity"):
            q = ""
        else:
            q = cards[0]["card"].question if cards else challenge.fallback_by_level[level].question
        data = {"answer": " ".join(parts)[:900], "hint_level": level, "socratic_question": q, "redirected": False}
        return JudgeResult(ok=True, data=data, model=self.model, usage=dict(EMPTY_USAGE), stop_reason="end_turn", ms=0,
                           anthropic_request_id="fake")


# --------------------------------------------------------------------------- builder

def build_default_judge():
    """FakeJudge when EVAL_FAKE_JUDGE=1; None (degraded) when disabled or no key; else the SDK judge."""
    if config.FAKE_JUDGE:
        return FakeJudge()
    if config.AI_DISABLED or not config.API_KEY:
        return None
    client = anthropic.Anthropic(api_key=config.API_KEY, timeout=config.TIMEOUT_S, max_retries=0)
    return AnthropicJudge(client=client, model=config.MODEL, effort=config.EFFORT, max_tokens=config.MAX_TOKENS)


def degraded_reason() -> str:
    return "disabled" if config.AI_DISABLED else "not_configured"
