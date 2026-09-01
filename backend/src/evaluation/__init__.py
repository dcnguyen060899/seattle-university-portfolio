"""Evaluation package (AI evaluation backend v2).

``init_evaluation(app)`` registers the blueprint (``/evaluate-challenge``, ``/evaluate-challenge/health``,
``/evaluate-challenge/tutor``), installs the judge and the rate limiter, and configures CORS for the whole
app (spec 4.5): the evaluation routes are restricted to the allow-list, every other route keeps ``*``.

Importing the package stays lightweight (``evaluation.registry`` is used by the export script without
Flask); Flask, flask-cors and the SDK are imported inside ``init_evaluation``.
"""
from __future__ import annotations

__version__ = "2"

_UNSET = object()


def init_evaluation(app, judge=_UNSET, origins=None, rate_per_min=None, burst=None, cors=True):
    """Attach the evaluation service to a Flask app.

    ``judge``: omit to build the default (SDK judge, FakeJudge with EVAL_FAKE_JUDGE=1, or None = degraded);
    pass ``None`` explicitly for degraded mode or a judge-like object (``evaluate``/``tutor``/``model``).
    """
    from flask_cors import CORS

    from . import config
    from .judge import build_default_judge
    from .ratelimit import RateLimiter
    from .routes import bp

    if judge is _UNSET:
        judge = build_default_judge()
    allowed = list(origins) if origins else list(config.ALLOWED_ORIGINS)
    app.extensions["evaluation"] = {
        "judge": judge,
        "limiter": RateLimiter(rate_per_min or config.RATE_PER_MIN, burst or config.RATE_BURST),
        "origins": allowed,
    }
    app.register_blueprint(bp)
    if cors:
        CORS(app, resources={
            r"/evaluate-challenge.*": {"origins": allowed, "methods": ["GET", "POST", "OPTIONS"],
                                       "allow_headers": ["Content-Type"], "max_age": 600},
            r"/*": {"origins": "*"},        # keeps today's behaviour for /chat, /classify-image, /api-check
        })
    return app
