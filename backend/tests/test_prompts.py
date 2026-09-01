"""Prompts and caching invariants (spec 6.2-6.5, addendum A5 / 10.1 test_prompts.py)."""
from conftest import make_client_results
from evaluation.evidence import build_evidence
from evaluation.judge import system_blocks
from evaluation.postcheck import expected_level
from evaluation.prompts import (JUDGE_CORE, build_submission_message, build_tutor_turn, esc, fmt_test_input, jsdump,
                                render_challenge_pack)
from evaluation.registry import CHALLENGES
from evaluation.retrieval import retrieve_cards


def test_system_blocks_deterministic():
    for c in CHALLENGES:
        a, b = system_blocks(c), system_blocks(c)
        assert a == b
        assert a[0]["text"] == JUDGE_CORE and a[0]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
        assert a[1]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
        assert render_challenge_pack(c) == render_challenge_pack(c)
        assert len(a[0]["text"]) + len(a[1]["text"]) >= 4500
        pack = a[1]["text"]
        assert pack.startswith(f'<challenge id="{c.id}"') and pack.endswith("</challenge>")
        assert f'<test_catalog count="{len(c.tests)}">' in pack
        assert c.reference_solution in pack and all(alt in pack for alt in c.accepted_alternatives)
        assert all(f'<card id="{m.id}"' in pack for m in c.misconceptions)
        assert "1 (Concept):" in pack and "3 (Almost there):" in pack
        assert 'weights="correctness=0.45 edge_cases=0.15 key_concepts=0.20 efficiency=0.05 code_quality=0.15"' in pack
    assert "{" not in JUDGE_CORE.split("<calibration_examples>")[0] or "attempt" in JUDGE_CORE   # constant text, no templating


def test_judge_core_verbatim_anchors():
    assert JUDGE_CORE.startswith('You are the AI tutor for the "Interactive Subtree Algorithm Learning" page')
    assert "# Evidence rules (non-negotiable)" in JUDGE_CORE and "<calibration_examples>" in JUDGE_CORE
    assert JUDGE_CORE.rstrip().endswith("</calibration_examples>")


def test_submission_escapes_and_truncates(fuzzy, old_reference):
    cr = make_client_results(fuzzy, old_reference, {"fz-06": True, "fz-15": True}, omit=("fz-17",))
    ev = build_evidence(fuzzy, old_reference, cr)
    row = next(r for r in ev["tests"] if r["id"] == "fz-06")
    row["actual"] = "<script>alert(1)</script>" + "x" * 5000
    row["error"] = 'boom "quoted" <tag>'
    cards = retrieve_cards(fuzzy, ev)
    level = expected_level(2, "PARTIAL")
    msg = build_submission_message(fuzzy, ev, cards, 2, [1], {"failed_test_ids": ["fz-06", "fz-15"], "hint_level": "conceptual"},
                                   {"gave_up": False, "solution_revealed": False}, level)
    assert "<script>" not in msg and "[script]" in msg
    attr = msg.split('actual="', 1)[1].split('"', 1)[0]
    assert len(attr) <= 200
    assert "error=\"boom 'quoted' [tag]\"" in msg
    assert 'Required next_hint.level: "targeted"' in msg and "only lines 1-27" in msg
    assert "not_run: fz-17" in msg and "passed: fz-01,fz-02" in msg
    assert '<previous_attempt failed="fz-06,fz-15" hint_level="conceptual"/>' in msg
    assert '<card id="split_budget" similarity="1.00" matched_by="fz-06,fz-15">' in msg
    assert msg.startswith('<submission challenge_id="fuzzySubtree" attempt="2" mode="tests" hints_used="1" gave_up="false" solution_revealed="false">')
    assert '<code lines="27">\n  1| function fuzzySubtree' in msg
    assert "S01 entry function defined: pass" in msg and "S06 mutates input nodes: pass" in msg
    assert 'input="root = [1,2,3,4,5], subRoot = [2,8,9]" expected="false"' in msg
    assert 'input="root = perfect tree of depth 4 (15 nodes), all values 1, subRoot = perfect tree of depth 3 (7 nodes), all values 2, maxDifferences = 6"' in msg


def test_submission_no_tests_and_byte_identical(fuzzy, old_reference):
    ev = build_evidence(fuzzy, old_reference, None)
    args = (fuzzy, ev, [], 1, [], None, {}, "conceptual")
    msg = build_submission_message(*args)
    assert msg == build_submission_message(*args)
    assert '<test_results mode="no_tests" note="">' in msg and "<retrieved_misconception_cards>\nnone\n" in msg
    assert 'hints_used="none"' in msg and "<previous_attempt" not in msg


def test_no_learner_data_in_system(fuzzy, old_reference):
    marker = "function fuzzySameTree(p, q, maxDifferences, differences = 0)"
    assert marker in old_reference
    for block in system_blocks(fuzzy):
        assert marker not in block["text"] and "differences = 0" not in block["text"]


def test_helpers():
    assert esc('<b a="1">') == "[b a='1']"
    assert jsdump(True) == "true" and jsdump(None) == "null" and jsdump("undefined") == "undefined"
    assert jsdump(float("inf")) == "Infinity" and jsdump("Infinity") == "Infinity" and jsdump(3) == "3"
    assert jsdump("abc") == '"abc"' and jsdump([1, None, 2]) == "[1,null,2]"
    fz = next(c for c in CHALLENGES if c.id == "fuzzySubtree")
    assert fmt_test_input(fz, fz.test_by_id["fz-07"]) == "root = [1,2,3,4,5], subRoot = [2,8,9], maxDifferences = 2"
    assert fmt_test_input(fz, fz.test_by_id["fz-03"]) == "root = [1,2,3,4,5], subRoot = [2,4,5]"
    assert fmt_test_input(fz, fz.test_by_id["fz-08"]) == "root = [1,2,3,4,5,null,null,6], subRoot = [2,4,5], maxDifferences = 100"
    cs = next(c for c in CHALLENGES if c.id == "countSubtrees")
    assert fmt_test_input(cs, cs.test_by_id["cs-11"]) == "root = perfect tree of depth 6 (63 nodes), all values 0, subRoot = [0,0,0]"


def test_tutor_turn():
    turn = build_tutor_turn("question", 'Why <b> "this"?', {"start_line": 13, "end_line": 14, "text": "if (a < b) {\n}"}, "targeted", False)
    assert turn.startswith('<tutor mode="question" hint_level="targeted" stuck="false" selection_lines="13-14">')
    assert "<selected_code>if (a [ b) {\n}</selected_code>" in turn
    assert "<learner_question>Why [b] 'this'?</learner_question>" in turn
    assert 'Do not raise the hint level above "targeted" unless stuck="true"' in turn
    assert turn.endswith("</rules></tutor>")
    single = build_tutor_turn("explain_problem", "", {"start_line": 3, "end_line": 3, "text": "x"}, "conceptual", True)
    assert 'selection_lines="3"' in single and 'stuck="true"' in single
    assert "<learner_question>Explain the problem in your own words" in single
    none = build_tutor_turn("complexity", "", None, "conceptual", False)
    assert "selection_lines" not in none and "<selected_code>" not in none
    assert "<learner_question>Derive the time and space complexity" in none
    approach = build_tutor_turn("suggest_approach", "ignored", None, "near_explicit", False)
    assert "<learner_question>Describe an approach at the allowed hint level" in approach and "ignored" not in approach
