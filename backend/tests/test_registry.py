"""Registry tests (spec 10.1, test_registry.py)."""
import dataclasses
import json
import re

import pytest

from evaluation import registry
from evaluation.registry import (CHALLENGES, BY_ID, HINT_LEVELS, TAGS, build_tree, build_args, canonical_json,
                                 private_view, public_view, registry_hash, resolve_challenge_id, solution_view,
                                 validate_registry)

EXPECTED_COUNTS = {"countSubtrees": 12, "fuzzySubtree": 17, "mirrorSubtree": 12}

# Known-bads whose card signature was derived from a sibling variant (spec 2.3/2.4 map two variants to one card).
# Their failing set is NOT the card's signature, so nearest-signature retrieval may rank another card first:
#   countSubtrees/root_value_only -> structure_ignored (Jaccard 6/7, still the top card)
#   fuzzySubtree/exact_only       -> ignores_budget    (Jaccard 1/9; off_by_one_threshold ranks first at 6/7)
SECONDARY_KNOWN_BAD = {("countSubtrees", "root_value_only"), ("fuzzySubtree", "exact_only")}


def test_registry_validates():
    validate_registry()  # raises AssertionError on any inconsistency
    assert [c.id for c in CHALLENGES] == ["countSubtrees", "fuzzySubtree", "mirrorSubtree"]
    assert [c.order for c in CHALLENGES] == [1, 2, 3]
    assert {c.id: len(c.tests) for c in CHALLENGES} == EXPECTED_COUNTS
    assert sum(len(c.tests) for c in CHALLENGES) == 41
    for c in CHALLENGES:
        # reference_py matches every expected value (already inside validate; repeated here explicitly)
        for t in c.tests:
            got = c.reference_py(*build_args(c.arg_types, t.args))
            assert got == t.expected and type(got) is type(t.expected), (c.id, t.id)


def test_challenge_metadata():
    count, fuzzy, mirror = BY_ID["countSubtrees"], BY_ID["fuzzySubtree"], BY_ID["mirrorSubtree"]
    assert (count.difficulty, count.difficulty_label, count.return_type, count.has_budget_arg) == ("warm-up", "Warm-up", "integer", False)
    assert (fuzzy.difficulty, fuzzy.difficulty_label, fuzzy.return_type, fuzzy.has_budget_arg) == ("core", "Core", "boolean", True)
    assert (mirror.difficulty, mirror.difficulty_label, mirror.return_type, mirror.has_budget_arg) == ("advanced", "Advanced", "boolean", False)
    assert fuzzy.param_names == ("root", "subRoot", "maxDifferences") and fuzzy.arg_types == ("tree", "tree", "int")
    assert mirror.entry_function == "isMirrorSubtree" and mirror.param_names == ("root", "subRoot")
    assert count.next_challenge_id == "fuzzySubtree" and fuzzy.next_challenge_id == "mirrorSubtree" and mirror.next_challenge_id is None
    for c in CHALLENGES:
        assert c.rubric.as_dict() == {"correctness": 0.45, "edge_cases": 0.15, "key_concepts": 0.20, "efficiency": 0.05, "code_quality": 0.15}
        assert [h.level for h in c.hints] == [1, 2, 3]
        assert tuple(f.level for f in c.fallback_hints) == HINT_LEVELS
        assert all(t.tag in TAGS for t in c.tests)
        assert c.card_by_id["missing_return"].uniform_rule == "actual_undefined"
        assert "null_dereference" in c.card_by_id and "stack_overflow" in c.card_by_id and "undefined_identifier" in c.card_by_id
        assert c.misconception_ids == tuple(m.id for m in c.misconceptions)
    assert count.card_by_id["wrong_return_type"].uniform_rule == "actual_boolean"
    assert "wrong_return_type" not in fuzzy.card_by_id and "wrong_return_type" not in mirror.card_by_id


def test_tests_omit_budget_to_exercise_default():
    fuzzy = BY_ID["fuzzySubtree"]
    with_budget = {t.id: t.args[2] for t in fuzzy.tests if len(t.args) == 3}
    assert with_budget == {"fz-07": 2, "fz-08": 100, "fz-09": 2, "fz-11": 0, "fz-15": 6, "fz-17": 0}
    assert all(len(t.args) == 2 for t in BY_ID["countSubtrees"].tests + BY_ID["mirrorSubtree"].tests)


def test_page_old_reference_is_a_known_bad():
    fuzzy = BY_ID["fuzzySubtree"]
    kb = {k.id: k for k in fuzzy.known_bad}["page_old_reference"]
    assert kb.card_id == "split_budget"
    assert set(kb.expected_failing_ids) == {"fz-06", "fz-15"}
    assert "fuzzySameTree(p, q, maxDifferences, differences = 0)" in kb.code
    assert set(fuzzy.card_by_id["split_budget"].signature_failing_ids) == {"fz-06", "fz-15"}


def test_legacy_alias_and_precedence():
    assert resolve_challenge_id(None, "fuzzySubtree") == "fuzzySubtree"
    assert resolve_challenge_id("countSubtrees", "fuzzySubtree") == "countSubtrees"   # challenge_id wins
    assert resolve_challenge_id("mirrorSubtree", None) == "mirrorSubtree"
    assert resolve_challenge_id("nope", "fuzzySubtree") is None                        # challenge_id wins even when unknown
    assert resolve_challenge_id(None, "nope") is None
    assert resolve_challenge_id(None, None) is None
    assert resolve_challenge_id("", "fuzzySubtree") == "fuzzySubtree"
    assert resolve_challenge_id(42, "fuzzySubtree") == "fuzzySubtree"


PRIVATE_KEYS = {"reference_solution", "accepted_alternatives", "known_bad", "judge_notes", "fallback_hints",
                "solution_notes", "stretch_goal", "reference_py"}


def test_public_view_hides_private():
    for c in CHALLENGES:
        pub = public_view(c)
        assert not (PRIVATE_KEYS & set(pub)), PRIVATE_KEYS & set(pub)
        for card in pub["misconceptions"]:
            assert "why" not in card and "fix_direction" not in card
            assert set(card) == {"id", "title", "symptom", "question", "signature_failing_ids", "error_pattern", "uniform_rule"}
        assert set(pub["tests"][0]) == {"id", "tag", "name", "args", "expected", "why", "gen_desc"}
        assert pub["tests_hash"] == registry.tests_hash(c)
        assert pub["target_complexity"] == {"time": "O(n * m)", "space": "O(h)"}
        # trees are literal arrays
        assert isinstance(pub["tests"][0]["args"][0], list)
        # the public view is JSON-serialisable and never contains the reference solution text
        text = json.dumps(pub)
        assert c.reference_solution not in text
        # the private view has everything but reference_py
        priv = private_view(c)
        assert (PRIVATE_KEYS - {"reference_py"}) <= set(priv) and "reference_py" not in priv
        assert priv["misconceptions"][0]["why"] and priv["misconceptions"][0]["fix_direction"]
        assert set(solution_view(c)) == {"reference_solution", "solution_notes", "stretch_goal", "accepted_alternatives"}


def test_export_shapes():
    pub = registry.export_public()
    assert pub["schema_version"] == 1 and pub["harness_version"] == "1"
    assert re.fullmatch(r"[0-9a-f]{16}", pub["registry_hash"])
    assert set(pub["tag_dimension"]) == set(TAGS) == set(pub["tag_labels"])
    assert [c["id"] for c in pub["challenges"]] == ["countSubtrees", "fuzzySubtree", "mirrorSubtree"]
    sols = registry.export_solutions()
    assert sols["registry_hash"] == pub["registry_hash"]
    assert set(sols["solutions"]) == set(BY_ID)
    # no timestamps anywhere
    assert "generated" not in json.dumps(pub) and "generated" not in json.dumps(sols)


def test_hashes_stable():
    assert registry_hash() == registry_hash()
    for c in CHALLENGES:
        assert registry.tests_hash(c) == registry.tests_hash(c)
        assert re.fullmatch(r"[0-9a-f]{16}", registry.tests_hash(c))
    hashes = {registry.tests_hash(c) for c in CHALLENGES}
    assert len(hashes) == len(CHALLENGES)


def test_hashes_change_when_expected_changes(monkeypatch):
    before_registry, before_tests = registry_hash(), registry.tests_hash(BY_ID["fuzzySubtree"])
    fuzzy = BY_ID["fuzzySubtree"]
    t0 = fuzzy.tests[0]
    flipped = dataclasses.replace(t0, expected=not t0.expected)
    changed = dataclasses.replace(fuzzy, tests=(flipped,) + fuzzy.tests[1:])
    new_tuple = tuple(changed if c.id == fuzzy.id else c for c in CHALLENGES)
    monkeypatch.setattr(registry, "CHALLENGES", new_tuple)
    monkeypatch.setattr(registry, "BY_ID", {c.id: c for c in new_tuple})
    assert registry.tests_hash(changed) != before_tests
    assert registry_hash() != before_registry
    # the modified copy no longer validates (reference_py disagrees with the flipped expectation)
    with pytest.raises(AssertionError):
        validate_registry()


def _swap(modified):
    """The full registry tuple with one challenge replaced (cross-references stay valid)."""
    return tuple(modified if c.id == modified.id else c for c in CHALLENGES)


def test_validate_rejects_bad_content():
    count = BY_ID["countSubtrees"]

    def first_test(**changes):
        return (dataclasses.replace(count.tests[0], **changes),) + count.tests[1:]

    with pytest.raises(AssertionError, match="expected must be an int"):
        validate_registry(_swap(dataclasses.replace(count, tests=first_test(expected=True))))
    with pytest.raises(AssertionError, match="rubric weights"):
        validate_registry(_swap(dataclasses.replace(count, rubric=dataclasses.replace(count.rubric, correctness=0.5))))
    with pytest.raises(AssertionError, match="tag"):
        validate_registry(_swap(dataclasses.replace(count, tests=first_test(tag="nope"))))
    with pytest.raises(AssertionError, match="nodes"):
        validate_registry(_swap(dataclasses.replace(count, tests=first_test(args=(tuple([1] * 101), (1,))))))
    with pytest.raises(AssertionError, match="outside"):
        validate_registry(_swap(dataclasses.replace(count, tests=first_test(args=((101,), (1,))))))
    with pytest.raises(AssertionError, match="reference_py returned"):
        validate_registry(_swap(dataclasses.replace(count, tests=first_test(expected=5))))
    with pytest.raises(AssertionError, match="next_challenge_id"):
        validate_registry(_swap(dataclasses.replace(count, next_challenge_id="ghost")))
    with pytest.raises(AssertionError, match="exactly 3 hints"):
        validate_registry(_swap(dataclasses.replace(count, hints=count.hints[:2])))
    with pytest.raises(AssertionError, match="card_id"):
        validate_registry(_swap(dataclasses.replace(count, known_bad=(dataclasses.replace(count.known_bad[0], card_id="ghost"),))))
    with pytest.raises(AssertionError, match="duplicate challenge ids"):
        validate_registry(CHALLENGES + (dataclasses.replace(BY_ID["fuzzySubtree"], id="countSubtrees"),))


def test_build_tree_encoding():
    t = build_tree([1, 2, 3, 4, 5, None, None, 6])
    assert t.val == 1 and t.left.val == 2 and t.right.val == 3
    assert t.left.left.val == 4 and t.left.right.val == 5
    assert t.left.left.left.val == 6 and t.left.left.right is None     # nulls never get child slots
    assert t.right.left is None and t.right.right is None
    assert build_tree([]) is None and build_tree([None]) is None and build_tree(None) is None
    assert build_tree((1, None, 2)).right.val == 2 and build_tree((1, None, 2)).left is None
    # every large registry input has exactly the advertised size
    sizes = {t.id: registry.count_nodes(build_tree(t.args[0])) for c in CHALLENGES for t in c.tests}
    assert sizes["cs-11"] == 63 and sizes["cs-12"] == 100 and sizes["fz-16"] == 100 and sizes["fz-17"] == 100
    assert sizes["mr-11"] == 100 and sizes["mr-12"] == 100
    assert registry.count_nodes(build_tree(BY_ID["mirrorSubtree"].test_by_id["mr-11"].args[1])) == 20


def test_canonical_json():
    assert canonical_json({"b": [1, None, True], "a": "é"}) == '{"a":"é","b":[1,null,true]}'
    assert canonical_json((1, (2, None))) == "[1,[2,null]]"


def _jaccard(a, b):
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if a | b else 0.0


def test_known_bad_signatures_are_discriminating():
    """Every card has a distinct signature; each primary known-bad IS its card's signature and is strictly nearest
    (Jaccard) to that card; the two secondary variants are exactly the documented ones."""
    secondary = set()
    for c in CHALLENGES:
        sig_cards = [m for m in c.misconceptions if m.signature_failing_ids]
        sigs = [frozenset(m.signature_failing_ids) for m in sig_cards]
        assert len(sigs) == len(set(sigs)), f"{c.id}: duplicate signatures"
        for kb in c.known_bad:
            card = c.card_by_id[kb.card_id]
            if card.signature_failing_ids:
                own = _jaccard(kb.expected_failing_ids, card.signature_failing_ids)
                others = [_jaccard(kb.expected_failing_ids, m.signature_failing_ids) for m in sig_cards if m.id != card.id]
                if own == 1.0:
                    assert all(o < own for o in others), (c.id, kb.id, others)
                else:
                    secondary.add((c.id, kb.id))
            elif card.uniform_rule:
                # the uniform rules need >= 80% of the executed rows; known-bads relying on them must fail that many tests
                assert len(kb.expected_failing_ids) >= 0.8 * len(c.tests), (c.id, kb.id)
    assert secondary == SECONDARY_KNOWN_BAD
