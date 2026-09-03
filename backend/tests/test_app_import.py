"""``import app`` must succeed without a key, and must expose ONLY the evaluation surface.

Runs in a subprocess so nothing leaks into the pytest process and no ``.env`` can
be picked up from the developer's shell.

The negative assertions are the point of this file now. Addendum B ruling R-3
retires ``POST /chat`` (and with it ``GET /api-check``, ``POST /classify-image``
and Flask's ``GET /``); the recruiter agent under ``app/api/agent/*`` is the one
agent. If any of those four routes reappears, the stale ``base_qa`` corpus — with
its "Summer 2026", "660K+ users" and "90% accuracy" claims, all retracted by
Addendum A.4 and Addendum C.2 — comes back with it, at a URL nothing links to and
nobody watches. So the absence is asserted, not merely intended.
"""
import os
import subprocess
import sys

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")

SCRIPT = r"""
import app
rules = sorted(r.rule for r in app.app.url_map.iter_rules())

# The surface that survives.
assert "/evaluate-challenge" in rules and "/evaluate-challenge/health" in rules \
    and "/evaluate-challenge/tutor" in rules, rules
assert "evaluation" in app.app.extensions

# The surface retired by Addendum B, R-3. Static assets are Next.js's job, so
# Flask must not be serving a static folder either.
for gone in ("/", "/chat", "/api-check", "/classify-image"):
    assert gone not in rules, ("retired route is back: " + gone, rules)
assert app.app.static_folder is None, app.app.static_folder

# LangChain must not be reachable from the deployed import graph. api/index.py
# installs only flask, flask-cors and anthropic; if app.py ever imports the
# chatbot stack again, the Vercel function stops booting.
import sys as _sys
for banned in ("langchain", "langchain_anthropic", "langchain_community", "openai", "requests"):
    assert not any(m == banned or m.startswith(banned + ".") for m in _sys.modules), banned

c = app.app.test_client()
h = c.get("/evaluate-challenge/health").get_json()
assert h["ok"] and h["ai_configured"] is False
r = c.post("/evaluate-challenge", json={"code": "function fuzzySubtree() {}", "challenge_type": "fuzzySubtree"})
assert r.status_code == 200 and r.get_json()["response"].startswith("Score:")
r = c.post("/evaluate-challenge", json={"code": "x"}, headers={"Origin": "https://www.duyng-portfolio.com"})
assert r.headers.get("Access-Control-Allow-Origin") == "https://www.duyng-portfolio.com"
print("OK")
"""

# The Vercel entry point must present exactly the same surface as the local app.
# "It works locally" is only worth something if the two agree.
ENTRYPOINT_SCRIPT = r"""
import importlib.util, os
spec = importlib.util.spec_from_file_location("vercel_entry", os.path.join(ROOT, "api", "index.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
rules = sorted(r.rule for r in module.app.url_map.iter_rules())
assert "/evaluate-challenge" in rules and "/evaluate-challenge/health" in rules \
    and "/evaluate-challenge/tutor" in rules, rules
for gone in ("/", "/chat", "/api-check", "/classify-image"):
    assert gone not in rules, ("retired route is back in api/index.py: " + gone, rules)
assert module.app.static_folder is None
print("OK")
"""


def _run(script, cwd):
    env = {k: v for k, v in os.environ.items()
           if k not in ("ANTHROPIC_API_KEY", "EVAL_FAKE_JUDGE", "EVAL_AI_DISABLED")}
    env["ANTHROPIC_API_KEY"] = ""
    return subprocess.run([sys.executable, "-c", script], cwd=cwd, env=env,
                          capture_output=True, text=True, timeout=180)


def test_app_imports_without_key():
    proc = _run(SCRIPT, SRC)
    assert proc.returncode == 0, proc.stderr[-4000:]
    assert proc.stdout.strip().endswith("OK")


def test_vercel_entrypoint_matches():
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    script = "ROOT = %r\n%s" % (repo_root, ENTRYPOINT_SCRIPT)
    proc = _run(script, repo_root)
    assert proc.returncode == 0, proc.stderr[-4000:]
    assert proc.stdout.strip().endswith("OK")
