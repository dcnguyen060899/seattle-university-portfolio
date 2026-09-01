"""Card retrieval (spec 5.3 / 10.1 test_retrieval.py)."""
import pytest

from conftest import make_client_results
from evaluation.evidence import build_evidence
from evaluation.registry import CHALLENGES, BY_ID
from evaluation.retrieval import jaccard, retrieve_cards

# Known-bads whose card signature came from a sibling variant (see test_registry.SECONDARY_KNOWN_BAD).
# Only fuzzySubtree/exact_only ranks another card first (off_by_one_threshold at 6/7 vs ignores_budget at 1/9);
# countSubtrees/root_value_only still resolves to structure_ignored (6/7).
NOT_FIRST = {("fuzzySubtree", "exact_only"): "off_by_one_threshold"}

ERROR_MESSAGES = {
    "null_dereference": "TypeError: Cannot read properties of null (reading 'val')",
    "stack_overflow": "RangeError: Maximum call stack size exceeded",
    "undefined_identifier": "ReferenceError: isSameTree is not defined",
}


def _wrong(challenge, test):
    if challenge.return_type == "boolean":
        return not test.expected
    return test.expected + 1


def _synth(challenge, known_bad):
    card = challenge.card_by_id[known_bad.card_id]
    actuals = {}
    for tid in known_bad.expected_failing_ids:
        t = challenge.test_by_id[tid]
        if card.error_pattern:
            actuals[tid] = ("error", ERROR_MESSAGES[card.id])
        elif card.uniform_rule == "actual_undefined":
            actuals[tid] = "undefined"
        elif card.uniform_rule == "actual_boolean":
            actuals[tid] = bool(t.expected)
        else:
            actuals[tid] = _wrong(challenge, t)
    return make_client_results(challenge, known_bad.code, actuals)


@pytest.mark.parametrize("cid, kb_id", [(c.id, k.id) for c in CHALLENGES for k in c.known_bad])
def test_signature_matches(cid, kb_id):
    challenge = BY_ID[cid]
    kb = next(k for k in challenge.known_bad if k.id == kb_id)
    ev = build_evidence(challenge, kb.code, _synth(challenge, kb))
    cards = retrieve_cards(challenge, ev)
    assert cards, (cid, kb_id)
    ids = [c["card_id"] for c in cards]
    expected_first = NOT_FIRST.get((cid, kb_id), kb.card_id)
    assert ids[0] == expected_first, (cid, kb_id, ids)
    top = cards[0]
    assert set(top["matched_by"]) <= set(kb.expected_failing_ids)
    assert 0 < top["similarity"] <= 1.0
    assert len(cards) <= 3


def test_uniform_rules(count, fuzzy):
    ev = build_evidence(count, "x", make_client_results(count, "x", {t.id: "undefined" for t in count.tests}))
    cards = retrieve_cards(count, ev)
    assert [c["card_id"] for c in cards] == ["missing_return"] and cards[0]["similarity"] == 1.0
    assert set(cards[0]["matched_by"]) == {t.id for t in count.tests}
    ev = build_evidence(count, "x", make_client_results(count, "x", {t.id: bool(t.expected) for t in count.tests}))
    assert [c["card_id"] for c in retrieve_cards(count, ev)] == ["wrong_return_type"]
    # a boolean challenge has no wrong_return_type card: all-boolean-wrong just fails normally
    ev = build_evidence(fuzzy, "x", make_client_results(fuzzy, "x", {t.id: (not t.expected) for t in fuzzy.tests}))
    assert "wrong_return_type" not in [c["card_id"] for c in retrieve_cards(fuzzy, ev)]


def test_error_cards(count):
    four = {t.id: ("error", ERROR_MESSAGES["null_dereference"]) for t in count.tests[:4]}
    ev = build_evidence(count, "x", make_client_results(count, "x", four))
    cards = retrieve_cards(count, ev)
    assert cards[0]["card_id"] == "null_dereference" and set(cards[0]["matched_by"]) == set(four)
    ev = build_evidence(count, "x", make_client_results(count, "x", {"cs-03": ("error", ERROR_MESSAGES["stack_overflow"])}))
    assert retrieve_cards(count, ev)[0]["card_id"] == "stack_overflow"
    ev = build_evidence(count, "x", make_client_results(count, "x", {"cs-03": ("error", ERROR_MESSAGES["undefined_identifier"])}))
    assert retrieve_cards(count, ev)[0]["card_id"] == "undefined_identifier"


def test_error_card_covering_most_rows_is_returned_alone(count):
    actuals = {t.id: ("error", ERROR_MESSAGES["null_dereference"]) for t in count.tests[:10]}
    actuals["cs-11"] = 99                                       # one plain failure too
    ev = build_evidence(count, "x", make_client_results(count, "x", actuals))
    cards = retrieve_cards(count, ev)
    assert [c["card_id"] for c in cards] == ["null_dereference"]


def test_erroring_rows_do_not_feed_signature_cards(fuzzy):
    actuals = {"fz-06": ("error", "TypeError: Cannot read properties of null (reading 'val')"),
               "fz-15": ("error", "TypeError: Cannot read properties of null (reading 'val')")}
    ev = build_evidence(fuzzy, "x", make_client_results(fuzzy, "x", actuals))
    cards = retrieve_cards(fuzzy, ev)
    assert [c["card_id"] for c in cards] == ["null_dereference"]


def test_no_cards_on_pass_or_without_evidence(fuzzy, old_reference):
    ev = build_evidence(fuzzy, old_reference, make_client_results(fuzzy, old_reference))
    assert retrieve_cards(fuzzy, ev) == []
    assert retrieve_cards(fuzzy, build_evidence(fuzzy, old_reference, None)) == []
    ev = build_evidence(fuzzy, old_reference, make_client_results(fuzzy, old_reference, compile_ok=False, error_kind="syntax", compile_error="x"))
    assert retrieve_cards(fuzzy, ev) == []


def test_jaccard_and_similarity_reporting(fuzzy, old_reference):
    assert jaccard({"a"}, {"a"}) == 1.0 and jaccard(set(), set()) == 0.0 and jaccard({"a"}, {"b"}) == 0.0
    ev = build_evidence(fuzzy, old_reference, make_client_results(fuzzy, old_reference, {"fz-06": True, "fz-15": True}))
    cards = retrieve_cards(fuzzy, ev)
    assert cards[0]["card_id"] == "split_budget" and cards[0]["similarity"] == 1.0 and cards[0]["matched_by"] == ["fz-06", "fz-15"]
    assert cards[1]["card_id"] == "no_budget_check" and abs(cards[1]["similarity"] - 0.4) < 1e-9
