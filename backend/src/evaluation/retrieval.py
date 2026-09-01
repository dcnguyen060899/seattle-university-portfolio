"""Misconception-card retrieval (spec 5.3). Deterministic; ``challenge_runner.js localRetrieve`` mirrors it.

Rules, in order:
1. uniform rules (dominant single cause) return exactly one card;
2. error-pattern cards score +3 per erroring row they match (first matching card per row);
3. signature cards score +round_half_up(10 * jaccard(failed_ids, signature)) when the jaccard is > 0;
4. an error card covering >= 80% of the executed rows is returned alone;
then rank by score desc, registry order, keep ``k``.

``similarity`` is the jaccard for signature cards and 1.0 for uniform/error cards; ``matched_by`` is the
sorted list of failing ids in the signature (or the ids of the erroring/undefined rows the rule matched).
Rounding is half-up (``floor(x + 0.5)``) so that Python and ``Math.round`` agree on ties.
"""
from __future__ import annotations

import math
import re

from .registry import Challenge


def _round_half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)


def _entry(card, similarity: float, matched_by, score: float) -> dict:
    return {"card": card, "card_id": card.id, "title": card.title, "similarity": round(float(similarity), 4),
            "matched_by": sorted(matched_by), "score": score}


def retrieve_cards(challenge: Challenge, ev: dict, k: int = 3) -> list:
    s = ev["summary"]
    if ev["mode"] != "tests" or s["executed"] == 0:
        return []
    if s["passed"] == s["total"]:
        return []
    rows = ev["tests"]
    executed = s["executed"]
    failed_ids = {r["id"] for r in rows if r["status"] == "fail"}
    error_rows = [r for r in rows if r["status"] == "error"]
    cards = challenge.misconceptions
    by_id = challenge.card_by_id

    # 1. uniform rules
    undefined_rows = [r["id"] for r in rows if r["status"] == "fail" and r["actual_type"] == "undefined"]
    if "missing_return" in by_id and len(undefined_rows) >= 0.8 * executed:
        return [_entry(by_id["missing_return"], 1.0, undefined_rows, 100)]
    if challenge.return_type == "integer" and "wrong_return_type" in by_id:
        boolean_rows = [r["id"] for r in rows if r["status"] == "fail" and r["actual_type"] == "boolean"]
        if len(boolean_rows) >= 0.8 * executed:
            return [_entry(by_id["wrong_return_type"], 1.0, boolean_rows, 100)]

    scores: dict = {}
    error_matches: dict = {}
    # 2. error-pattern cards
    error_cards = [c for c in cards if c.error_pattern]
    for r in error_rows:
        msg = r["error"] or ""
        for c in error_cards:
            if re.search(c.error_pattern, msg):
                scores[c.id] = scores.get(c.id, 0) + 3
                error_matches.setdefault(c.id, []).append(r["id"])
                break
    # 3. signature cards
    sims: dict = {}
    for c in cards:
        if not c.signature_failing_ids:
            continue
        sim = jaccard(failed_ids, set(c.signature_failing_ids))
        if sim > 0:
            sims[c.id] = sim
            scores[c.id] = scores.get(c.id, 0) + _round_half_up(10 * sim)
    # 4. a single error card that explains (almost) everything
    for cid, ids in error_matches.items():
        if len(ids) >= 0.8 * executed:
            return [_entry(by_id[cid], 1.0, ids, scores[cid])]

    order = {c.id: i for i, c in enumerate(cards)}
    ranked = sorted((cid for cid, sc in scores.items() if sc > 0), key=lambda cid: (-scores[cid], order[cid]))
    out = []
    for cid in ranked[:k]:
        card = by_id[cid]
        if cid in error_matches and cid not in sims:
            out.append(_entry(card, 1.0, error_matches[cid], scores[cid]))
        else:
            matched = failed_ids & set(card.signature_failing_ids)
            out.append(_entry(card, sims.get(cid, 0.0), matched or error_matches.get(cid, []), scores[cid]))
    return out


def public_retrieval(cards: list) -> list:
    """The ``retrieval`` array of the HTTP response (4.3)."""
    return [{"card_id": c["card_id"], "title": c["title"], "similarity": c["similarity"], "matched_by": list(c["matched_by"])}
            for c in cards]
