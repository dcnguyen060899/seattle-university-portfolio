"""Vercel Python entry point. Serves the evaluation blueprint, and nothing else.

Vercel's Python runtime loads the top-level ``app`` from this file (see
https://vercel.com/docs/functions/runtimes/python/api-directory). ``vercel.json``
rewrites exactly two path patterns here — ``/evaluate-challenge`` and
``/evaluate-challenge/*`` — and Next.js owns every other request.

WHAT CHANGED AND WHY
--------------------
This module used to do ``from app import app``, which pulled in
``backend/src/app.py`` -> ``chatservice`` -> ``agent`` -> ``llm`` ->
``langchain_anthropic``: tens of megabytes of transitive dependencies that
existed for one 12-line route, ``POST /chat``.

``POST /chat`` is now RETIRED, not ported (Addendum B, ruling R-3). Only
``public/docs/index.html`` ever loaded ``js/chat.js``; that widget's markup and
script tag are gone, ``js/chat.js`` is deleted, and there is no ``/chat`` route
on any origin. The recruiter agent under ``app/api/agent/*`` is the one agent,
per the owner's decision #3. Retiring the endpoint also deletes the entire
cross-origin problem it created rather than managing it with a CORS shim.

``POST /classify-image`` went with it. Verified 2026-09-02 by grepping every
file under ``public/docs``: nothing calls it. ``index_image_classification.html``
embeds the HuggingFace Space directly in an ``<iframe>``
(``https://dnguyen44-garbage-classification.hf.space``) and never touches this
backend, so retiring the proxy breaks nothing and removes ``requests`` from the
bundle.

``GET /api-check`` went with it too: it called the model on every unauthenticated
GET, outside the rate limiter, and ``grep -rn api-check public/docs`` finds no
caller.

What is left is the evaluation blueprint, which ``public/docs/learning_algorithm.html``
genuinely depends on and which has a real pytest + node test suite. Its complete
third-party import surface — verified by reading every import statement in
``backend/src/evaluation/**`` — is ``flask``, ``flask_cors``, ``werkzeug`` (a
Flask dependency) and ``anthropic``. That is what the root ``requirements.txt``
installs, and nothing more.

ENVIRONMENT (Vercel project settings, Production *and* Preview)
---------------------------------------------------------------
    ANTHROPIC_API_KEY   required for the AI judge and tutor; absent => degraded
                        (deterministic, rule-based) mode, which is a supported
                        state, not an outage
    EVAL_MODEL / ANTHROPIC_MODEL, EVAL_EFFORT, EVAL_MAX_TOKENS, EVAL_TIMEOUT_S,
    EVAL_AI_DISABLED, EVAL_RATE_PER_MIN, ALLOWED_ORIGINS
                        optional; see backend/.env.example for defaults

CORS still matters after the DNS cutover: ``backend/src/evaluation/config.py``
keeps ``https://ucberkeley-ml-ai-capstone.com`` in DEFAULT_ORIGINS because that
is a DIFFERENT repository's live site calling this backend. Removing it breaks
that site's challenge mode.
"""

import sys
from pathlib import Path

_BACKEND_SRC = Path(__file__).resolve().parents[1] / "backend" / "src"
if str(_BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(_BACKEND_SRC))

from flask import Flask  # noqa: E402
from evaluation import init_evaluation  # noqa: E402

# static_folder=None is deliberate. Next.js serves every static asset out of
# public/; leaving Flask's static handler on would publish the same bytes at a
# second, uncached URL space that no route table knows about.
app = Flask(__name__, static_folder=None)

# Registers the /evaluate-challenge blueprint AND the single CORS() call.
init_evaluation(app)

__all__ = ["app"]
