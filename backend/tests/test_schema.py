"""Output schemas (spec 6.6 / 10.1 test_schema.py)."""
from evaluation.registry import CHALLENGES, canonical_json
from evaluation.schema import TUTOR_SCHEMA, judge_schema

FORBIDDEN = {"minimum", "maximum", "minLength", "maxLength", "pattern", "minItems", "maxItems", "format"}


def _walk(node, path="$"):
    """Yield (path, node) for every schema object."""
    if isinstance(node, dict):
        yield path, node
        for k, v in node.items():
            yield from _walk(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk(v, f"{path}[{i}]")


def _check_schema(schema):
    for path, node in _walk(schema):
        assert not (FORBIDDEN & set(node)), (path, FORBIDDEN & set(node))
        if "type" in node:
            assert isinstance(node["type"], str), f"type arrays are not supported: {path}"
            if node["type"] == "object":
                assert node.get("additionalProperties") is False, f"{path} must set additionalProperties: false"
                assert "properties" in node and "required" in node, path
                assert set(node["required"]) == set(node["properties"]), path


def test_supported_keywords_only():
    _check_schema(TUTOR_SCHEMA)
    for c in CHALLENGES:
        s = judge_schema(c)
        _check_schema(s)
        enum = s["properties"]["misconception_tags"]["items"]["enum"]
        assert set(enum) == set(c.misconception_ids) | {"none"}
        assert s["properties"]["verdict"]["enum"] == ["PASS", "PARTIAL", "FAIL", "ERROR", "UNVERIFIED"]
        assert s["properties"]["next_hint"]["properties"]["level"]["enum"] == ["conceptual", "targeted", "near_explicit", "extension"]


def test_schema_memoized():
    for c in CHALLENGES:
        assert judge_schema(c) is judge_schema(c)
        assert canonical_json(judge_schema(c)) == canonical_json(judge_schema(c))
    assert judge_schema(CHALLENGES[0]) is not judge_schema(CHALLENGES[1])


def test_tutor_schema_shape():
    assert set(TUTOR_SCHEMA["properties"]) == {"answer", "hint_level", "socratic_question", "redirected"}
    assert TUTOR_SCHEMA["properties"]["redirected"]["type"] == "boolean"
