"""Evidence recomputation and static checks (spec 5.1, 5.2 / 10.1 test_evidence.py)."""
from conftest import make_client_results
from evaluation.evidence import build_evidence, check_client_results, recompute_status, static_checks
from evaluation.postcheck import derive_verdict


def test_recompute_from_expected(fuzzy, old_reference):
    cr = make_client_results(fuzzy, old_reference, {"fz-06": True, "fz-15": True, "fz-04": "undefined",
                                                   "fz-05": ("error", "TypeError: boom")}, omit=("fz-17",))
    for t in cr["tests"]:                       # a lying client: everything claims to pass
        t["status"] = "pass"
    ev = build_evidence(fuzzy, old_reference, cr)
    rows = {r["id"]: r for r in ev["tests"]}
    assert ev["mode"] == "tests" and ev["evidence_note"] == ""
    assert rows["fz-06"]["status"] == "fail" and rows["fz-15"]["status"] == "fail"
    assert rows["fz-04"]["status"] == "fail" and rows["fz-04"]["actual_type"] == "undefined"
    assert rows["fz-05"]["status"] == "error" and rows["fz-05"]["error"] == "TypeError: boom"
    assert rows["fz-17"]["status"] == "not_run" and rows["fz-17"]["error"] == "not reported by the browser"
    assert rows["fz-01"]["status"] == "pass"
    s = ev["summary"]
    assert (s["total"], s["passed"], s["failed"], s["errored"], s["not_run"], s["executed"]) == (17, 12, 3, 1, 1, 16)
    assert ev["by_tag"]["budget"]["total"] == 7 and ev["by_tag"]["budget"]["failed"] == 4
    assert [r["id"] for r in ev["tests"]] == [t.id for t in fuzzy.tests]          # catalog order


def test_strict_equality_rules():
    assert recompute_status("pass", 1, "number", None, True) == "fail"            # true != 1
    assert recompute_status("pass", "undefined", "undefined", None, False) == "fail"
    assert recompute_status("pass", 0, "number", None, 0) == "pass"
    assert recompute_status("fail", True, "boolean", None, True) == "pass"         # client status is not trusted
    assert recompute_status("pass", None, "null", "x", True) == "error"
    assert recompute_status("timeout", None, "timeout", "Timed out", True) == "timeout"
    assert recompute_status("not_run", None, "", None, True) == "not_run"


def test_compile_failed_forces_not_run(fuzzy, old_reference):
    cr = make_client_results(fuzzy, old_reference, compile_ok=False, error_kind="syntax", compile_error="Unexpected token }")
    ev = build_evidence(fuzzy, old_reference, cr)
    assert ev["static"]["compile_failed"] is True and "syntax error: Unexpected token }" == ev["static"]["syntax_detail"]
    assert all(r["status"] == "not_run" for r in ev["tests"]) and ev["summary"]["executed"] == 0
    assert derive_verdict(ev) == "ERROR"
    s03 = next(c for c in ev["static"]["checks"] if c["id"] == "S03")
    assert s03["status"] == "fail"


def test_entry_missing_forces_not_run(fuzzy, old_reference):
    cr = make_client_results(fuzzy, old_reference, entry_found=False)
    ev = build_evidence(fuzzy, old_reference, cr)
    assert ev["static"]["compile_failed"] is True and "no function named fuzzySubtree" in ev["static"]["syntax_detail"]
    assert all(r["status"] == "not_run" for r in ev["tests"])
    assert derive_verdict(ev) == "ERROR"


def test_unknown_ids_ignored_and_duplicates_last_wins(fuzzy, old_reference):
    cr = make_client_results(fuzzy, old_reference)
    cr["tests"].append({"id": "zz-99", "status": "pass", "actual": True, "actual_type": "boolean", "error": None, "ms": 0.1})
    cr["tests"].append({"id": "fz-01", "status": "pass", "actual": False, "actual_type": "boolean", "error": None, "ms": 0.1})
    norm, note = check_client_results(fuzzy, old_reference, cr)
    assert note == "" and "zz-99" not in norm["tests"] and norm["tests"]["fz-01"]["actual"] is False
    ev = build_evidence(fuzzy, old_reference, cr)
    assert next(r for r in ev["tests"] if r["id"] == "fz-01")["status"] == "fail"


def test_no_client_results_is_no_tests(fuzzy, old_reference):
    ev = build_evidence(fuzzy, old_reference, None)
    assert ev["mode"] == "no_tests" and ev["evidence_note"] == ""
    assert all(r["status"] == "not_run" for r in ev["tests"])
    assert derive_verdict(ev) == "UNVERIFIED"
    assert ev["numbered_code"].startswith("  1| function fuzzySubtree")
    assert ev["code_lines"] == old_reference.count("\n") + 1


def test_static_checks_on_comment_stripped_code(count):
    code = "function countSubtrees(root, subRoot) {\n  // countSubtrees( countSubtrees(\n  /* countSubtrees( */\n  return 0;\n}\n"
    checks = {c["id"]: c for c in static_checks(count, code, None)["checks"]}
    assert checks["S05"]["status"] == "info"                       # only the definition counts
    assert checks["S04"]["status"] == "info"                       # one function
    assert checks["S01"]["status"] == "pass"
    code2 = "function countSubtrees(root, subRoot) {\n  if (root.left === subRoot.left) return 1;\n  return countSubtrees(root.left, subRoot);\n}\nconst h = (a) => a;\n"
    checks2 = {c["id"]: c for c in static_checks(count, code2, None)["checks"]}
    assert checks2["S06"]["status"] == "pass"                      # `.left ===` is a comparison, not a mutation
    assert checks2["S05"]["status"] == "pass" and checks2["S04"]["status"] == "pass"
    code3 = "function countSubtrees(root, subRoot) {\n  root.val = 5;\n  return 0;\n}\n"
    checks3 = {c["id"]: c for c in static_checks(count, code3, None)["checks"]}
    assert checks3["S06"]["status"] == "info"
    assert [c["id"] for c in static_checks(count, code3, None)["checks"]] == ["S01", "S02", "S03", "S04", "S05", "S06"]
