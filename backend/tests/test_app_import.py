"""``import app`` must succeed without a key (spec 9.2 / 10.1 test_app_import.py).

Runs in a subprocess so the LangChain stack never loads into the pytest process and no ``.env`` can leak in.
"""
import os
import subprocess
import sys

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")

SCRIPT = r"""
import app, llm
rules = sorted(r.rule for r in app.app.url_map.iter_rules())
assert "/evaluate-challenge" in rules and "/evaluate-challenge/health" in rules and "/evaluate-challenge/tutor" in rules, rules
assert "/chat" in rules and "/api-check" in rules and "/classify-image" in rules and "/" in rules
assert "evaluation" in app.app.extensions
assert llm.llm.model_kwargs == {"thinking": {"type": "disabled"}}, llm.llm.model_kwargs
assert llm.llm.model == "claude-sonnet-5"
assert not hasattr(llm, "evaluation_memory")
import agent, chatservice
for name in ("EVALUATION_SYSTEM_MESSAGE", "evaluation_agent", "fix_format_variance_with_ai", "generate_evaluation_response"):
    assert not hasattr(agent, name), name
assert not hasattr(chatservice.ChatService, "get_evaluation_response")
c = app.app.test_client()
h = c.get("/evaluate-challenge/health").get_json()
assert h["ok"] and h["ai_configured"] is False
r = c.post("/evaluate-challenge", json={"code": "function fuzzySubtree() {}", "challenge_type": "fuzzySubtree"})
assert r.status_code == 200 and r.get_json()["response"].startswith("Score:")
r = c.post("/evaluate-challenge", json={"code": "x"}, headers={"Origin": "https://www.duyng-portfolio.com"})
assert r.headers.get("Access-Control-Allow-Origin") == "https://www.duyng-portfolio.com"
print("OK")
"""


def test_app_imports_without_key():
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "EVAL_FAKE_JUDGE", "EVAL_AI_DISABLED")}
    env["ANTHROPIC_API_KEY"] = ""
    proc = subprocess.run([sys.executable, "-c", SCRIPT], cwd=SRC, env=env, capture_output=True, text=True, timeout=180)
    assert proc.returncode == 0, proc.stderr[-4000:]
    assert proc.stdout.strip().endswith("OK")
