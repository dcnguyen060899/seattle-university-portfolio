"""Vercel entry point for the Flask backend.

Vercel's Python runtime looks for a WSGI application named ``app`` in this
module and routes every request to it (see ``vercel.json``, which rewrites all
paths to ``/api/index``).  The real application lives in ``backend/src/app.py``;
this file only puts that directory on ``sys.path`` and re-exports ``app``.

Environment variables (set them in the Vercel project settings):
    ANTHROPIC_API_KEY   required for the AI judge, tutor and chatbot
    ANTHROPIC_MODEL     optional, defaults to claude-sonnet-5 in code
    EVAL_*              optional evaluation settings, see backend/.env.example
"""

import sys
from pathlib import Path

_BACKEND_SRC = Path(__file__).resolve().parents[1] / "backend" / "src"
if str(_BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(_BACKEND_SRC))

from app import app  # noqa: E402  (Flask WSGI application)

__all__ = ["app"]
