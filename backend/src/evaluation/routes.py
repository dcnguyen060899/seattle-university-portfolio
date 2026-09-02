"""Flask blueprint (spec 4, addendum A2/A5/A6; ADDENDUM_VIS 4 for the tutor's ``explain_step`` mode and the
``step`` object): health, evaluate, tutor; request validation (4.2); error envelope and rate limiting (4.5).
Registered by ``evaluation.init_evaluation(app)``.
"""
from __future__ import annotations

import secrets

from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

from . import config
from .evidence import MAX_CODE_CHARS, MAX_CODE_LINES, code_line_count
from .pipeline import EvalRequest, TutorRequest, run_evaluation, run_tutor
from .postcheck import sanitize_evaluation
from .prompts import TUTOR_MODES
from .ratelimit import client_key
from .registry import BY_ID, CHALLENGES, HINT_LEVELS, registry_hash, resolve_challenge_id, tests_hash

bp = Blueprint("evaluation", __name__)

MAX_BODY_BYTES = 96_000
MAX_ATTEMPT = 50
MAX_PREVIOUS_IDS = 20
MAX_HISTORY_TURNS = 3
MAX_HISTORY_CHARS = 600
MAX_SELECTION_CHARS = 2000
MIN_QUESTION, MAX_QUESTION = 3, 500
# replay step (ADDENDUM_VIS 4): caption/call/returned <= 300 chars, stack <= 12 frames of <= 200 chars
MAX_STEP_TEXT, MAX_STEP_STACK, MAX_STEP_FRAME_CHARS, MAX_STEP_TOTAL = 300, 12, 200, 100_000
STEP_TEXT_FIELDS = ("caption", "call", "returned")


class RequestError(Exception):
    def __init__(self, status: int, code: str, message: str, field: str | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.field = status, code, message, field


# --------------------------------------------------------------------------- envelope helpers

def _state() -> dict:
    return current_app.extensions["evaluation"]


def _request_id() -> str:
    rid = getattr(g, "eval_request_id", None)
    if not rid:
        rid = secrets.token_hex(6)
        g.eval_request_id = rid
    return rid


def error_response(status: int, code: str, message: str, field: str | None = None, retry_after: int | None = None, extra: dict | None = None):
    err = {"code": code, "message": message}
    if field:
        err["field"] = field
    body = {"ok": False, "request_id": _request_id(), "error": err, "response": f"Error: {message}"}
    if retry_after is not None:
        body["retry_after"] = int(retry_after)
    if extra:
        body.update(extra)
    resp = jsonify(body)
    resp.status_code = status
    if retry_after is not None:
        resp.headers["Retry-After"] = str(int(retry_after))
    return resp


@bp.before_request
def _before():
    request.max_content_length = MAX_BODY_BYTES
    g.eval_request_id = secrets.token_hex(6)


@bp.after_request
def _after(resp):
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Request-Id"] = _request_id()
    return resp


@bp.errorhandler(RequestEntityTooLarge)
def _too_large(_e):
    return error_response(413, "payload_too_large", f"request body exceeds {MAX_BODY_BYTES} bytes")


@bp.errorhandler(RequestError)
def _request_error(e: RequestError):
    return error_response(e.status, e.code, e.message, e.field)


def _rate_limit():
    limiter = _state()["limiter"]
    ok, retry_after = limiter.allow(client_key(request))
    if ok:
        return None
    return error_response(429, "rate_limited", f"Too many requests; try again in {retry_after} seconds.", retry_after=retry_after)


# --------------------------------------------------------------------------- validation (4.2)

def _json_body() -> dict:
    body = request.get_json(force=True, silent=True)
    if not isinstance(body, dict):
        raise RequestError(400, "invalid_json", "request body must be a JSON object")
    return body


def _challenge(body: dict):
    cid = resolve_challenge_id(body.get("challenge_id"), body.get("challenge_type"))
    if cid is None:
        raise RequestError(400, "unknown_challenge", "unknown challenge; send challenge_id (countSubtrees, fuzzySubtree, mirrorSubtree)",
                           "challenge_id")
    return BY_ID[cid]


def _code(body: dict) -> str:
    code = body.get("code")
    if not isinstance(code, str):
        raise RequestError(400, "invalid_request", "code must be a string", "code")
    if not code.strip():
        raise RequestError(400, "empty_code", "code is empty", "code")
    if len(code) > MAX_CODE_CHARS:
        raise RequestError(400, "invalid_request", f"code exceeds {MAX_CODE_CHARS} characters", "code")
    if code_line_count(code) > MAX_CODE_LINES:
        raise RequestError(400, "invalid_request", f"code exceeds {MAX_CODE_LINES} lines", "code")
    if "\x00" in code:
        raise RequestError(400, "invalid_request", "code contains a NUL byte", "code")
    return code


def clamp_attempt(v) -> int:
    if isinstance(v, bool):
        return 1
    try:
        n = int(float(str(v).strip())) if isinstance(v, str) else int(v)
    except (TypeError, ValueError):
        return 1
    return max(1, min(MAX_ATTEMPT, n))


def clean_hints_used(v) -> list:
    out = []
    if isinstance(v, list):
        for h in v:
            if isinstance(h, bool):
                continue
            if isinstance(h, str) and h.strip().isdigit():
                h = int(h.strip())
            if isinstance(h, int) and h in (1, 2, 3) and h not in out:
                out.append(h)
    return sorted(out)


def clean_previous(v, challenge):
    if not isinstance(v, dict):
        return None
    ids = v.get("failed_test_ids")
    catalog = challenge.test_by_id
    failed = []
    if isinstance(ids, list):
        for i in ids:
            if isinstance(i, str) and i in catalog and i not in failed:
                failed.append(i)
            if len(failed) >= MAX_PREVIOUS_IDS:
                break
    level = v.get("hint_level")
    return {"failed_test_ids": failed, "hint_level": level if level in HINT_LEVELS else None}


def clean_learner_state(v) -> dict:
    v = v if isinstance(v, dict) else {}
    return {"gave_up": bool(v.get("gave_up", False)), "solution_revealed": bool(v.get("solution_revealed", False))}


def parse_evaluate_request(body: dict):
    """Validate a 4.2 body; returns ``(challenge, EvalRequest)`` or raises RequestError."""
    challenge = _challenge(body)
    code = _code(body)
    req = EvalRequest(
        challenge_id=challenge.id, code=code, attempt=clamp_attempt(body.get("attempt", 1)),
        hints_used=clean_hints_used(body.get("hints_used")), previous=clean_previous(body.get("previous"), challenge),
        learner_state=clean_learner_state(body.get("learner_state")), client_results=body.get("client_results"),
        legacy="client_results" not in body,
    )
    return challenge, req


def _selection(v, code_lines: int):
    if v is None:
        return None
    if not isinstance(v, dict):
        raise RequestError(400, "invalid_request", "selection must be an object", "selection")
    a, b = v.get("start_line"), v.get("end_line")
    if isinstance(a, bool) or isinstance(b, bool) or not isinstance(a, int) or not isinstance(b, int):
        raise RequestError(400, "invalid_request", "selection.start_line and end_line must be integers", "selection")
    if not (1 <= a <= b <= code_lines):
        raise RequestError(400, "invalid_request", f"selection lines must satisfy 1 <= start_line <= end_line <= {code_lines}", "selection")
    text = v.get("text", "")
    if text is None:
        text = ""
    if not isinstance(text, str) or len(text) > MAX_SELECTION_CHARS:
        raise RequestError(400, "invalid_request", f"selection.text must be a string of at most {MAX_SELECTION_CHARS} characters", "selection")
    return {"start_line": a, "end_line": b, "text": text}


def _step(v):
    """Validate the optional replay ``step`` object; returns a cleaned dict or None, raises RequestError (field step)."""
    if v is None:
        return None
    if not isinstance(v, dict):
        raise RequestError(400, "invalid_request", "step must be an object", "step")
    idx, total = v.get("index"), v.get("total")
    if any(isinstance(x, bool) or not isinstance(x, int) for x in (idx, total)):
        raise RequestError(400, "invalid_request", "step.index and step.total must be integers", "step")
    if not (1 <= total <= MAX_STEP_TOTAL) or not (0 <= idx <= total):
        raise RequestError(400, "invalid_request", f"step must satisfy 0 <= index <= total and 1 <= total <= {MAX_STEP_TOTAL}", "step")
    out = {"index": idx, "total": total}
    for key in STEP_TEXT_FIELDS:
        text = v.get(key, "")
        if text is None:
            text = ""
        if not isinstance(text, str) or len(text) > MAX_STEP_TEXT:
            raise RequestError(400, "invalid_request", f"step.{key} must be a string of at most {MAX_STEP_TEXT} characters", "step")
        out[key] = text
    stack = v.get("stack", [])
    if stack is None:
        stack = []
    if (not isinstance(stack, list) or len(stack) > MAX_STEP_STACK
            or not all(isinstance(f, str) and len(f) <= MAX_STEP_FRAME_CHARS for f in stack)):
        raise RequestError(400, "invalid_request", f"step.stack must be a list of at most {MAX_STEP_STACK} strings of at most "
                           f"{MAX_STEP_FRAME_CHARS} characters", "step")
    out["stack"] = list(stack)
    return out


def _history(v) -> list:
    if not isinstance(v, list):
        return []
    turns = []
    for item in v:
        if isinstance(item, dict) and isinstance(item.get("question"), str) and isinstance(item.get("answer"), str):
            q, a = item["question"].strip()[:MAX_HISTORY_CHARS], item["answer"].strip()[:MAX_HISTORY_CHARS]
            if q and a:
                turns.append({"question": q, "answer": a})
    return turns[-MAX_HISTORY_TURNS:]


def parse_tutor_request(body: dict):
    """Validate an A5 body; returns ``(challenge, EvalRequest, TutorRequest)`` or raises RequestError."""
    challenge, req = parse_evaluate_request(body)
    mode = body.get("mode", "question")
    if mode not in TUTOR_MODES:
        raise RequestError(400, "invalid_request", "mode must be one of " + ", ".join(TUTOR_MODES), "mode")
    question = ""
    if mode == "question":
        q = body.get("question")
        if not isinstance(q, str) or not (MIN_QUESTION <= len(q.strip()) <= MAX_QUESTION):
            raise RequestError(400, "invalid_request", f"question must be {MIN_QUESTION} to {MAX_QUESTION} characters", "question")
        question = q.strip()
    step = _step(body.get("step"))
    if mode == "explain_step" and step is None:
        raise RequestError(400, "invalid_request", "step is required for mode explain_step", "step")
    tut = TutorRequest(
        mode=mode, question=question, selection=_selection(body.get("selection"), code_line_count(req.code)),
        evaluation=sanitize_evaluation(body.get("evaluation"), challenge) if body.get("evaluation") is not None else None,
        history=_history(body.get("history")), stuck=bool(body.get("stuck", False)), step=step,
    )
    return challenge, req, tut


# --------------------------------------------------------------------------- routes

@bp.route("/evaluate-challenge/health", methods=["GET"])
def health():
    judge = _state()["judge"]
    return jsonify({
        "ok": True, "version": config.VERSION, "request_id": _request_id(),
        "ai_configured": judge is not None, "ai_disabled": bool(config.AI_DISABLED),
        "model": getattr(judge, "model", None) if judge is not None else config.MODEL,
        "effort": config.EFFORT, "registry_hash": registry_hash(),
        "challenges": [{"id": c.id, "tests_hash": tests_hash(c)} for c in CHALLENGES],
        "followup": judge is not None,
    })


@bp.route("/evaluate-challenge", methods=["POST"])
def evaluate():
    limited = _rate_limit()
    if limited is not None:
        return limited
    challenge, req = parse_evaluate_request(_json_body())
    body = run_evaluation(challenge, req, _state()["judge"], request_id=_request_id(), client_ip=client_key(request))
    return jsonify(body)


@bp.route("/evaluate-challenge/tutor", methods=["POST"])
def tutor():
    limited = _rate_limit()
    if limited is not None:
        return limited
    challenge, req, tut = parse_tutor_request(_json_body())
    body, status, retry_after = run_tutor(challenge, req, tut, _state()["judge"], request_id=_request_id(), client_ip=client_key(request))
    resp = jsonify(body)
    resp.status_code = status
    if retry_after is not None:
        resp.headers["Retry-After"] = str(int(retry_after))
        body["retry_after"] = int(retry_after)
        resp.set_data(jsonify(body).get_data())
    return resp
