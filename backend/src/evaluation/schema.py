"""Structured-output schemas (spec 6.6; addendum A5 renames FOLLOWUP_SCHEMA to TUTOR_SCHEMA).

Only keywords supported by the API's structured outputs are used: no minimum/maximum/minLength/
maxLength/pattern/minItems/maxItems, no type arrays, ``additionalProperties: False`` on every object.
All bounds live in ``postcheck.py``.  ``judge_schema`` is memoized per misconception-id tuple so its
bytes never change within a process (the API caches compiled schemas).
"""
from __future__ import annotations

import functools

DIMS = ("correctness", "edge_cases", "key_concepts", "efficiency", "code_quality")
VERDICTS = ("PASS", "PARTIAL", "FAIL", "ERROR", "UNVERIFIED")
HINT_LEVELS = ("conceptual", "targeted", "near_explicit", "extension")
ISSUE_CATEGORIES = ("correctness", "edge_case", "key_concept", "performance", "code_quality", "syntax")
SEVERITIES = ("high", "medium", "low")
EVIDENCE_KINDS = ("test", "line", "static")
FLAGS = ("hardcoded_tests", "instructions_in_code", "off_topic_code")


def _dim() -> dict:
    return {"type": "object", "additionalProperties": False,
            "properties": {"score": {"type": "integer"}, "justification": {"type": "string"}},
            "required": ["score", "justification"]}


@functools.lru_cache(maxsize=8)
def _judge_schema(misconception_ids: tuple) -> dict:
    return {"type": "object", "additionalProperties": False,
            "properties": {
                "verdict": {"type": "string", "enum": list(VERDICTS)},
                "summary": {"type": "string"},
                "progress_note": {"type": "string"},
                "scores": {"type": "object", "additionalProperties": False,
                           "properties": {d: _dim() for d in DIMS}, "required": list(DIMS)},
                "strengths": {"type": "array", "items": {"type": "string"}},
                "issues": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                           "properties": {
                               "title": {"type": "string"},
                               "category": {"type": "string", "enum": list(ISSUE_CATEGORIES)},
                               "severity": {"type": "string", "enum": list(SEVERITIES)},
                               "explanation": {"type": "string"},
                               "evidence": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                                            "properties": {"kind": {"type": "string", "enum": list(EVIDENCE_KINDS)},
                                                           "ref": {"type": "string"}},
                                            "required": ["kind", "ref"]}}},
                           "required": ["title", "category", "severity", "explanation", "evidence"]}},
                "misconception_tags": {"type": "array", "items": {"type": "string", "enum": list(misconception_ids) + ["none"]}},
                "complexity": {"type": "object", "additionalProperties": False,
                               "properties": {"time": {"type": "string"}, "space": {"type": "string"}, "note": {"type": "string"}},
                               "required": ["time", "space", "note"]},
                "next_hint": {"type": "object", "additionalProperties": False,
                              "properties": {"level": {"type": "string", "enum": list(HINT_LEVELS)},
                                             "text": {"type": "string"}, "socratic_question": {"type": "string"}},
                              "required": ["level", "text", "socratic_question"]},
                "what_to_try_next": {"type": "array", "items": {"type": "string"}},
                "encouragement": {"type": "string"},
                "flags": {"type": "array", "items": {"type": "string", "enum": list(FLAGS)}}},
            "required": ["verdict", "summary", "progress_note", "scores", "strengths", "issues", "misconception_tags",
                         "complexity", "next_hint", "what_to_try_next", "encouragement", "flags"]}


def judge_schema(challenge) -> dict:
    return _judge_schema(tuple(challenge.misconception_ids))


TUTOR_SCHEMA = {"type": "object", "additionalProperties": False,
                "properties": {"answer": {"type": "string"},
                               "hint_level": {"type": "string", "enum": list(HINT_LEVELS)},
                               "socratic_question": {"type": "string"},
                               "redirected": {"type": "boolean"}},
                "required": ["answer", "hint_level", "socratic_question", "redirected"]}
