"""Local-development Flask app: the /evaluate-challenge blueprint, and nothing else.

This module is what you run with `npm run dev:py` and what `backend/tests/` boots.
On Vercel the entry point is `api/index.py`, which builds an equivalent app; the
two are kept deliberately identical in surface so that "works locally" means
something.

WHAT WAS REMOVED, AND WHY (Addendum B, ruling R-3)
--------------------------------------------------
`GET /`               served ../../docs/index_portfolio.html. That directory moved
                      to public/docs, that page is deleted, and Next.js owns "/".
`POST /chat`          RETIRED, not ported. It routed over a ~1,400-line `base_qa`
                      dict and a LangChain ReAct agent. Its only remaining caller
                      was the chatbot widget in public/docs/index.html, whose
                      markup and <script src="js/chat.js"> are now gone and whose
                      js/chat.js is deleted. Retiring it removes the entire
                      cross-origin/preflight problem instead of managing it.
                      It also removes a corpus that was factually stale: `base_qa`
                      advertised a 2026 internship season (availability is Summer
                      2027 — Addendum A.4), a MOSAIC user count and an accuracy
                      figure that are both retracted third-party statistics
                      (Addendum C.2), and a percentage grade where the résumé says
                      GPA 4.0. None of those strings is repeated here; see
                      data/corpus/retractions.json.
`GET /api-check`      called the model on every unauthenticated GET, outside the
                      rate limiter. `grep -rn api-check public/docs` finds no
                      caller. An unmetered spend path with no user.
`POST /classify-image` a proxy to dnguyen44-garbage-classification.hf.space.
                      Verified 2026-09-02: nothing under public/docs calls it.
                      public/docs/index_image_classification.html embeds that
                      Space directly in an <iframe>, so the proxy had no user
                      either. Removing it drops `requests` from the dependency
                      chain.

static_folder is None, not '../../docs': that path no longer exists (the legacy
site is public/docs now) and Next.js serves every static asset. Leaving Flask's
static handler on would publish the same bytes at a second URL space that no
route table knows about.
"""

try:  # pragma: no cover - local convenience only
    from dotenv import load_dotenv

    # backend/.env, when it exists. Absent in CI and on Vercel, where the
    # environment is supplied directly.
    #
    # ⚠ ORDER IS LOAD-BEARING. evaluation/config.py reads os.environ at IMPORT
    # time, so this call has to happen before `from evaluation import ...`
    # below or a local backend/.env is read too late to have any effect.
    load_dotenv()
except ImportError:  # python-dotenv is a dev convenience, not a runtime need
    pass

from flask import Flask  # noqa: E402

from evaluation import init_evaluation  # noqa: E402

app = Flask(__name__, static_folder=None)

# Registers the /evaluate-challenge routes AND the single CORS() configuration
# (see backend/src/evaluation/__init__.py).
init_evaluation(app)


if __name__ == "__main__":
    app.run(debug=True, port=5328)
