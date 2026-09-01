"""The committed docs/data files must equal the in-memory export (spec 10.1, test_export_sync.py)."""
import importlib.util
import json
import os

import pytest

from evaluation import registry

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "docs", "data")
EXPORT_SCRIPT = os.path.join(ROOT, "backend", "scripts", "export_challenges.py")
HINT = "run `python backend/scripts/export_challenges.py`"


def _load_export_module():
    spec = importlib.util.spec_from_file_location("export_challenges", EXPORT_SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _read(name):
    path = os.path.join(DATA_DIR, name)
    assert os.path.exists(path), f"{path} is missing; {HINT}"
    with open(path, encoding="utf-8") as fh:
        return fh.read()


@pytest.mark.parametrize("name, builder", [
    ("challenges.json", registry.export_public),
    ("challenge_solutions.json", registry.export_solutions),
])
def test_docs_json_matches_registry(name, builder):
    mod = _load_export_module()
    want = mod.serialize(builder())
    have = _read(name)
    assert have == want, f"docs/data/{name} is stale; {HINT}"
    assert json.loads(have) == builder()


def test_export_check_passes():
    mod = _load_export_module()
    assert mod.main(["--check"]) == 0


def test_export_check_fails_on_stale_file(tmp_path):
    mod = _load_export_module()
    assert mod.main(["--out-dir", str(tmp_path)]) == 0
    assert mod.main(["--check", "--out-dir", str(tmp_path)]) == 0
    stale = tmp_path / "challenges.json"
    stale.write_text(stale.read_text(encoding="utf-8").replace('"schema_version": 1', '"schema_version": 0'), encoding="utf-8")
    assert mod.main(["--check", "--out-dir", str(tmp_path)]) == 1


def test_public_file_has_no_private_content():
    data = json.loads(_read("challenges.json"))
    assert data["schema_version"] == 1 and data["registry_hash"] == registry.registry_hash()
    for ch in data["challenges"]:
        for key in ("reference_solution", "accepted_alternatives", "known_bad", "judge_notes", "fallback_hints",
                    "solution_notes", "stretch_goal"):
            assert key not in ch, (ch["id"], key)
        for card in ch["misconceptions"]:
            assert "why" not in card and "fix_direction" not in card
    sols = json.loads(_read("challenge_solutions.json"))
    assert sols["registry_hash"] == data["registry_hash"]
    assert set(sols["solutions"]) == {c["id"] for c in data["challenges"]}
