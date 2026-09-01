"""Environment-derived settings (spec 9.1; addendum A2 removes the signing secret, A6 adds the fake judge).

Values are read from ``os.environ`` at import time; ``reload()`` re-reads them (tests, the export script).
Nothing here imports Flask, the SDK or the chatbot modules.
"""
from __future__ import annotations

import os

VERSION = "2"
DEFAULT_MODEL = "claude-sonnet-5"
EFFORT_LEVELS = ("low", "medium", "high", "xhigh", "max")
MIN_MAX_TOKENS, MAX_MAX_TOKENS = 1024, 32000
RATE_BURST = 5

DEFAULT_ORIGINS = [
    "https://duyng-portfolio.com", "https://www.duyng-portfolio.com",
    "http://duyng-portfolio.com", "http://www.duyng-portfolio.com",
    "https://ucberkeley-ml-ai-capstone.com", "https://www.ucberkeley-ml-ai-capstone.com",
    "http://ucberkeley-ml-ai-capstone.com",
    "https://dcnguyen060899.github.io",
    "http://localhost:8000", "http://127.0.0.1:8000",
    "http://localhost:5000", "http://127.0.0.1:5000",
    "http://localhost:5500", "http://127.0.0.1:5500",
]

API_KEY = ""
MODEL = DEFAULT_MODEL
EFFORT = "medium"
MAX_TOKENS = 16000
TIMEOUT_S = 40.0
AI_DISABLED = False
RATE_PER_MIN = 10
ALLOWED_ORIGINS = list(DEFAULT_ORIGINS)
FAKE_JUDGE = False


def _bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int, lo: int, hi: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(float(raw.strip()))
    except ValueError:
        return default
    return max(lo, min(hi, value))


def _float(name: str, default: float, lo: float, hi: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw.strip())
    except ValueError:
        return default
    return max(lo, min(hi, value))


def reload() -> None:
    """Re-read every setting from the environment (called at import)."""
    global API_KEY, MODEL, EFFORT, MAX_TOKENS, TIMEOUT_S, AI_DISABLED, RATE_PER_MIN, ALLOWED_ORIGINS, FAKE_JUDGE
    API_KEY = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    MODEL = (os.getenv("EVAL_MODEL") or os.getenv("ANTHROPIC_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    effort = (os.getenv("EVAL_EFFORT") or "medium").strip().lower()
    EFFORT = effort if effort in EFFORT_LEVELS else "medium"
    MAX_TOKENS = _int("EVAL_MAX_TOKENS", 16000, MIN_MAX_TOKENS, MAX_MAX_TOKENS)
    TIMEOUT_S = _float("EVAL_TIMEOUT_S", 40.0, 1.0, 600.0)
    AI_DISABLED = _bool("EVAL_AI_DISABLED")
    RATE_PER_MIN = _int("EVAL_RATE_PER_MIN", 10, 1, 10000)
    raw_origins = os.getenv("ALLOWED_ORIGINS")
    if raw_origins and raw_origins.strip():
        ALLOWED_ORIGINS = [o.strip() for o in raw_origins.split(",") if o.strip()]
    else:
        ALLOWED_ORIGINS = list(DEFAULT_ORIGINS)
    FAKE_JUDGE = _bool("EVAL_FAKE_JUDGE")


reload()
