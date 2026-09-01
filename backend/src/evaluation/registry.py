"""Challenge registry: the single source of truth for the evaluation backend and the page.

Spec section 2: data model (2.1), tree encoding (2.2), views, hashes and exports (2.7).
The content lives in ``evaluation.challenge_data``; importing this module loads it and
runs ``validate_registry()``.  Nothing here imports langchain, the chatbot or Flask.
"""
from __future__ import annotations

import collections
import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any, Callable

TAGS = ("base-case", "structure", "values", "budget", "recursion", "aggregate", "performance")
TAG_DIMENSION = {"base-case": "edge_cases", "structure": "edge_cases",
                 "values": "correctness", "budget": "correctness", "recursion": "correctness",
                 "aggregate": "correctness", "performance": "correctness"}
TAG_LABELS = {"base-case": "Base case", "structure": "Shape", "values": "Values", "budget": "Budget",
              "recursion": "Search", "aggregate": "Counting", "performance": "Performance"}
HINT_LEVELS = ("conceptual", "targeted", "near_explicit", "extension")

SCHEMA_VERSION = 1
HARNESS_VERSION = "1"
TREE_ENCODING = "level-order; null = missing child; children listed only for present nodes; trailing nulls omitted"
ARG_TYPES = ("tree", "int")
RETURN_TYPES = ("boolean", "integer")
UNIFORM_RULES = ("", "actual_undefined", "actual_boolean")
MAX_TREE_NODES = 100
MIN_VALUE, MAX_VALUE = -100, 100
MIN_INT_ARG, MAX_INT_ARG = 0, 100
ENTRY_NAME_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


# --------------------------------------------------------------------------- data model (2.1)

@dataclass(frozen=True)
class TestCase:
    id: str                       # "fz-06"; stable forever (feedback, chips, localStorage depend on it)
    tag: str                      # one of TAGS
    name: str                     # shown to learner and judge
    args: tuple                   # positional args; trees are level-order tuples with None; omit the 3rd arg to test the default
    expected: Any                 # bool | int (strict equality after canonicalization)
    why: str                      # one sentence shown in the expanded row and to the judge
    gen_desc: str = ""            # for large inputs: prose shown instead of the literal arrays, already formatted as
                                  # "root = <prose or literal>, subRoot = <prose or literal>"; consumers append ", maxDifferences = k"


@dataclass(frozen=True)
class Example:
    input: str                    # "root = [1,2,3,4,5], subRoot = [2,4,9]"
    output: str                   # "true"
    explanation: str


@dataclass(frozen=True)
class Hint:                       # static ladder shown by the page
    level: int                    # 1..3
    title: str
    text: str
    unlock_after_attempts: int    # 0, 1, 2


@dataclass(frozen=True)
class FallbackHint:               # judge/degraded fallback when NO card was retrieved; misconception-agnostic
    level: str                    # one of HINT_LEVELS
    text: str
    question: str


@dataclass(frozen=True)
class MisconceptionCard:
    id: str
    title: str
    symptom: str                  # what the learner sees (which tests, expected vs actual)     [public]
    question: str                 # Socratic question                                          [public]
    why: str                      # the mental-model error                                     [server only]
    fix_direction: str            # what must change, in words, no code                        [server only]
    signature_failing_ids: tuple[str, ...] = ()   # failing-set signature (from the known-bad matrix) [public]
    error_pattern: str = ""       # regex over runtime error messages (generic cards)          [public]
    uniform_rule: str = ""        # "" | "actual_undefined" | "actual_boolean"                 [public]


@dataclass(frozen=True)
class KnownBad:
    id: str
    card_id: str
    code: str                     # complete JS submission
    expected_failing_ids: tuple[str, ...]   # the Node verify script asserts SET EQUALITY


@dataclass(frozen=True)
class RubricWeights:
    correctness: float
    edge_cases: float
    key_concepts: float
    efficiency: float
    code_quality: float

    def as_dict(self) -> dict:
        return {"correctness": self.correctness, "edge_cases": self.edge_cases,
                "key_concepts": self.key_concepts, "efficiency": self.efficiency,
                "code_quality": self.code_quality}


@dataclass(frozen=True)
class Challenge:
    id: str                       # "countSubtrees" | "fuzzySubtree" | "mirrorSubtree" (fuzzySubtree is the legacy challenge_type)
    order: int
    title: str
    difficulty: str               # "warm-up" | "core" | "advanced"
    difficulty_label: str         # "Warm-up" | "Core" | "Advanced"
    summary: str                  # one sentence for the tab
    spec: str                     # plain text paragraph(s), backticks allowed (rendered by the safe splitter, 8.5)
    examples: tuple[Example, ...]
    constraints: tuple[str, ...]
    signature: str
    entry_function: str
    param_names: tuple[str, ...]
    arg_types: tuple[str, ...]    # "tree" | "int"; same length as param_names
    return_type: str              # "boolean" | "integer"
    has_budget_arg: bool
    starter_code: str
    reference_solution: str       # JS, judge-only + gated reveal
    reference_py: Callable        # Python port used by validate_registry() to assert every expected value
    accepted_alternatives: tuple[str, ...]   # JS; recognised by the judge, also run by the verify script
    solution_notes: tuple[str, ...]
    stretch_goal: str
    target_complexity: tuple[tuple[str, str], ...]   # (("time","O(n * m)"),("space","O(h)"))
    key_concepts: tuple[str, ...]
    tests: tuple[TestCase, ...]
    hints: tuple[Hint, ...]                 # exactly 3
    fallback_hints: tuple[FallbackHint, ...]  # exactly 4, one per HINT_LEVELS
    misconceptions: tuple[MisconceptionCard, ...]   # challenge cards + generic cards (from common.py)
    known_bad: tuple[KnownBad, ...]
    rubric: RubricWeights
    judge_notes: str              # server-only guidance for the judge (accepted alternatives, what not to flag)
    next_challenge_id: str | None
    harness_version: str = "1"

    # derived helpers
    @property
    def test_by_id(self) -> dict:
        return {t.id: t for t in self.tests}

    @property
    def card_by_id(self) -> dict:
        return {c.id: c for c in self.misconceptions}

    @property
    def misconception_ids(self) -> tuple[str, ...]:
        return tuple(c.id for c in self.misconceptions)

    @property
    def fallback_by_level(self) -> dict:
        return {f.level: f for f in self.fallback_hints}


# --------------------------------------------------------------------------- tree encoding (2.2)

class _Node:
    __slots__ = ("val", "left", "right")

    def __init__(self, v):
        self.val, self.left, self.right = v, None, None

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"_Node({self.val!r})"


def build_tree(arr):
    """LeetCode level-order -> tree. ``[]``, ``[None]`` and ``None`` give the empty tree."""
    if not arr or arr[0] is None:
        return None
    root = _Node(arr[0])
    q = collections.deque([root])
    i = 1
    while q and i < len(arr):
        n = q.popleft()
        if i < len(arr):
            v = arr[i]
            i += 1
            if v is not None:
                n.left = _Node(v)
                q.append(n.left)
        if i < len(arr):
            v = arr[i]
            i += 1
            if v is not None:
                n.right = _Node(v)
                q.append(n.right)
    return root


def build_args(arg_types, args):
    """Convert every "tree" positional argument with build_tree; other args pass through."""
    return [build_tree(a) if t == "tree" else a for t, a in zip(arg_types, args)]


def count_nodes(node) -> int:
    return 0 if node is None else 1 + count_nodes(node.left) + count_nodes(node.right)


def tree_values(node) -> list:
    if node is None:
        return []
    return [node.val] + tree_values(node.left) + tree_values(node.right)


# --------------------------------------------------------------------------- serialization, views, hashes (2.7)

def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _plain(obj):
    """Tuples -> lists recursively (views and exports are plain JSON)."""
    if isinstance(obj, (tuple, list)):
        return [_plain(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _plain(v) for k, v in obj.items()}
    return obj


def _sha16(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def test_view(t: TestCase) -> dict:
    return {"id": t.id, "tag": t.tag, "name": t.name, "args": _plain(t.args),
            "expected": t.expected, "why": t.why, "gen_desc": t.gen_desc}


def card_public_view(c: MisconceptionCard) -> dict:
    return {"id": c.id, "title": c.title, "symptom": c.symptom, "question": c.question,
            "signature_failing_ids": list(c.signature_failing_ids),
            "error_pattern": c.error_pattern, "uniform_rule": c.uniform_rule}


def card_private_view(c: MisconceptionCard) -> dict:
    d = card_public_view(c)
    d["why"] = c.why
    d["fix_direction"] = c.fix_direction
    return d


def tests_hash(c: Challenge) -> str:
    return _sha16(canonical_json([{"id": t.id, "args": _plain(t.args), "expected": t.expected} for t in c.tests]))


def public_view(c: Challenge) -> dict:
    """What the page receives (docs/data/challenges.json). No solutions, no server-only text."""
    return {
        "id": c.id, "order": c.order, "title": c.title, "difficulty": c.difficulty,
        "difficulty_label": c.difficulty_label, "summary": c.summary, "spec": c.spec,
        "examples": [{"input": e.input, "output": e.output, "explanation": e.explanation} for e in c.examples],
        "constraints": list(c.constraints), "signature": c.signature, "entry_function": c.entry_function,
        "param_names": list(c.param_names), "arg_types": list(c.arg_types), "return_type": c.return_type,
        "has_budget_arg": c.has_budget_arg, "starter_code": c.starter_code,
        "target_complexity": {k: v for k, v in c.target_complexity}, "key_concepts": list(c.key_concepts),
        "tests": [test_view(t) for t in c.tests], "tests_hash": tests_hash(c),
        "hints": [{"level": h.level, "title": h.title, "text": h.text, "unlock_after_attempts": h.unlock_after_attempts}
                  for h in c.hints],
        "misconceptions": [card_public_view(m) for m in c.misconceptions],
        "rubric": c.rubric.as_dict(), "next_challenge_id": c.next_challenge_id, "harness_version": c.harness_version,
    }


def solution_view(c: Challenge) -> dict:
    return {"reference_solution": c.reference_solution, "solution_notes": list(c.solution_notes),
            "stretch_goal": c.stretch_goal, "accepted_alternatives": list(c.accepted_alternatives)}


def private_view(c: Challenge) -> dict:
    """Everything except reference_py (judge pack, verify script, registry hash)."""
    d = public_view(c)
    d.update(solution_view(c))
    d["judge_notes"] = c.judge_notes
    d["fallback_hints"] = [{"level": f.level, "text": f.text, "question": f.question} for f in c.fallback_hints]
    d["misconceptions"] = [card_private_view(m) for m in c.misconceptions]
    d["known_bad"] = [{"id": k.id, "card_id": k.card_id, "code": k.code,
                       "expected_failing_ids": list(k.expected_failing_ids)} for k in c.known_bad]
    return d


def registry_hash() -> str:
    return _sha16(canonical_json([private_view(c) for c in CHALLENGES]))


def export_public() -> dict:
    return {"schema_version": SCHEMA_VERSION, "harness_version": HARNESS_VERSION, "registry_hash": registry_hash(),
            "tree_encoding": TREE_ENCODING, "tag_dimension": dict(TAG_DIMENSION), "tag_labels": dict(TAG_LABELS),
            "challenges": [public_view(c) for c in CHALLENGES]}


def export_solutions() -> dict:
    return {"registry_hash": registry_hash(), "solutions": {c.id: solution_view(c) for c in CHALLENGES}}


# --------------------------------------------------------------------------- lookup

CHALLENGES: tuple[Challenge, ...] = ()          # populated by evaluation.challenge_data (ordered by .order)
BY_ID: dict[str, Challenge] = {}
LEGACY_IDS = {"fuzzySubtree": "fuzzySubtree"}   # legacy challenge_type -> id (identity today; kept for future renames)


def resolve_challenge_id(challenge_id, challenge_type) -> str | None:
    """``challenge_id`` wins when present; otherwise the legacy ``challenge_type``; unknown -> None."""
    if isinstance(challenge_id, str) and challenge_id.strip():
        cid = challenge_id.strip()
        cid = LEGACY_IDS.get(cid, cid)
        return cid if cid in BY_ID else None
    if isinstance(challenge_type, str) and challenge_type.strip():
        ct = challenge_type.strip()
        cid = LEGACY_IDS.get(ct, ct)
        return cid if cid in BY_ID else None
    return None


# --------------------------------------------------------------------------- validation

def _check(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def _validate_tree_arg(where: str, arr) -> None:
    _check(isinstance(arr, (tuple, list)), f"{where}: tree args must be tuples, got {type(arr).__name__}")
    entries = [v for v in arr if v is not None]
    for v in entries:
        _check(isinstance(v, int) and not isinstance(v, bool), f"{where}: node values must be ints, got {v!r}")
        _check(MIN_VALUE <= v <= MAX_VALUE, f"{where}: node value {v} outside [{MIN_VALUE}, {MAX_VALUE}]")
    root = build_tree(arr)
    n = count_nodes(root)
    _check(n <= MAX_TREE_NODES, f"{where}: tree has {n} nodes (> {MAX_TREE_NODES})")
    _check(n == len(entries), f"{where}: level-order array has {len(entries)} values but only {n} become nodes")


def _validate_challenge(c: Challenge, all_ids: set) -> None:
    w = f"challenge {c.id!r}"
    _check(isinstance(c.id, str) and c.id, f"{w}: empty id")
    _check(c.harness_version == HARNESS_VERSION, f"{w}: harness_version must be {HARNESS_VERSION!r}")
    _check(isinstance(c.order, int) and c.order >= 1, f"{w}: order must be a positive int")
    _check(c.difficulty and c.difficulty_label, f"{w}: difficulty and difficulty_label are required")
    _check(bool(ENTRY_NAME_RE.match(c.entry_function)), f"{w}: bad entry_function {c.entry_function!r}")
    _check(len(c.arg_types) == len(c.param_names), f"{w}: arg_types and param_names differ in length")
    _check(all(t in ARG_TYPES for t in c.arg_types), f"{w}: arg_types must be in {ARG_TYPES}")
    _check(c.return_type in RETURN_TYPES, f"{w}: return_type must be in {RETURN_TYPES}")
    _check(c.has_budget_arg == (c.arg_types[-1:] == ("int",)),
           f"{w}: has_budget_arg must match a trailing 'int' argument")
    _check(len(c.examples) >= 1 and len(c.constraints) >= 1, f"{w}: examples and constraints are required")
    _check(c.summary and c.spec and c.signature and c.starter_code and c.reference_solution and c.judge_notes,
           f"{w}: summary, spec, signature, starter_code, reference_solution and judge_notes are required")
    _check(callable(c.reference_py), f"{w}: reference_py must be callable")
    _check(len(c.key_concepts) >= 1 and len(c.solution_notes) >= 1 and c.stretch_goal, f"{w}: notes are required")
    _check(dict(c.target_complexity).keys() >= {"time", "space"}, f"{w}: target_complexity needs time and space")
    _check(c.next_challenge_id is None or c.next_challenge_id in all_ids,
           f"{w}: next_challenge_id {c.next_challenge_id!r} does not exist")
    _check(c.next_challenge_id != c.id, f"{w}: next_challenge_id points at itself")

    # rubric
    total = sum(c.rubric.as_dict().values())
    _check(abs(total - 1.0) <= 1e-9, f"{w}: rubric weights sum to {total}, not 1.0")
    _check(all(v >= 0 for v in c.rubric.as_dict().values()), f"{w}: negative rubric weight")

    # tests
    _check(len(c.tests) >= 1, f"{w}: no tests")
    ids = [t.id for t in c.tests]
    _check(len(ids) == len(set(ids)), f"{w}: duplicate test ids")
    min_args = len(c.param_names) - (1 if c.has_budget_arg else 0)
    for t in c.tests:
        tw = f"{w} test {t.id}"
        _check(t.tag in TAGS, f"{tw}: tag {t.tag!r} not in TAGS")
        _check(t.name and t.why, f"{tw}: name and why are required")
        _check(isinstance(t.args, tuple), f"{tw}: args must be a tuple")
        _check(min_args <= len(t.args) <= len(c.param_names),
               f"{tw}: {len(t.args)} args, expected between {min_args} and {len(c.param_names)}")
        for i, a in enumerate(t.args):
            if c.arg_types[i] == "tree":
                _validate_tree_arg(f"{tw} arg {c.param_names[i]}", a)
            else:
                _check(isinstance(a, int) and not isinstance(a, bool), f"{tw}: arg {c.param_names[i]} must be an int")
                _check(MIN_INT_ARG <= a <= MAX_INT_ARG, f"{tw}: arg {c.param_names[i]} outside [{MIN_INT_ARG}, {MAX_INT_ARG}]")
        if c.return_type == "boolean":
            _check(isinstance(t.expected, bool), f"{tw}: expected must be a bool")
        else:
            _check(isinstance(t.expected, int) and not isinstance(t.expected, bool), f"{tw}: expected must be an int (not bool)")
        got = c.reference_py(*build_args(c.arg_types, t.args))
        _check(type(got) is type(t.expected) and got == t.expected,
               f"{tw}: reference_py returned {got!r}, expected {t.expected!r}")

    # hints
    _check(len(c.hints) == 3, f"{w}: exactly 3 hints required, got {len(c.hints)}")
    _check([h.level for h in c.hints] == [1, 2, 3], f"{w}: hint levels must be 1, 2, 3 in order")
    _check([h.unlock_after_attempts for h in c.hints] == [0, 1, 2], f"{w}: hint unlocks must be 0, 1, 2")
    _check(all(h.title and h.text for h in c.hints), f"{w}: hint title and text are required")
    _check(len(c.fallback_hints) == 4, f"{w}: exactly 4 fallback hints required")
    _check(tuple(f.level for f in c.fallback_hints) == HINT_LEVELS, f"{w}: fallback hints must cover {HINT_LEVELS} in order")
    _check(all(f.text and f.question for f in c.fallback_hints), f"{w}: fallback hint text and question are required")

    # cards
    card_ids = [m.id for m in c.misconceptions]
    _check(len(card_ids) == len(set(card_ids)), f"{w}: duplicate card ids")
    signatures = {}
    for m in c.misconceptions:
        mw = f"{w} card {m.id}"
        _check(bool(re.match(r"^[a-z][a-z0-9_]*$", m.id)), f"{mw}: id must be snake_case")
        _check(m.id != "none", f"{mw}: 'none' is reserved")
        _check(m.title and m.symptom and m.why and m.fix_direction, f"{mw}: title, symptom, why, fix_direction required")
        _check(m.question.rstrip().endswith("?"), f"{mw}: question must end with '?'")
        _check(m.uniform_rule in UNIFORM_RULES, f"{mw}: uniform_rule {m.uniform_rule!r} unknown")
        _check(m.uniform_rule != "actual_boolean" or c.return_type == "integer",
               f"{mw}: actual_boolean rule only applies to integer challenges")
        for tid in m.signature_failing_ids:
            _check(tid in ids, f"{mw}: signature id {tid!r} is not a test of this challenge")
        if m.error_pattern:
            re.compile(m.error_pattern)
        kinds = int(bool(m.signature_failing_ids)) + int(bool(m.error_pattern)) + int(bool(m.uniform_rule))
        _check(kinds == 1, f"{mw}: exactly one of signature_failing_ids, error_pattern, uniform_rule must be set")
        if m.signature_failing_ids:
            sig = frozenset(m.signature_failing_ids)
            _check(sig not in signatures, f"{mw}: same failing-set signature as card {signatures.get(sig)!r}")
            signatures[sig] = m.id

    # known-bad submissions
    kb_ids = [k.id for k in c.known_bad]
    _check(len(kb_ids) == len(set(kb_ids)), f"{w}: duplicate known_bad ids")
    for k in c.known_bad:
        kw = f"{w} known_bad {k.id}"
        _check(k.card_id in card_ids, f"{kw}: card_id {k.card_id!r} does not exist")
        _check(k.code.strip(), f"{kw}: empty code")
        _check(len(k.expected_failing_ids) >= 1, f"{kw}: must fail at least one test")
        _check(len(set(k.expected_failing_ids)) == len(k.expected_failing_ids), f"{kw}: duplicate expected ids")
        for tid in k.expected_failing_ids:
            _check(tid in ids, f"{kw}: expected id {tid!r} is not a test of this challenge")


def validate_registry(challenges=None) -> None:
    """Raise AssertionError on the first inconsistency (called at import; tests call it directly)."""
    challenges = CHALLENGES if challenges is None else tuple(challenges)
    _check(len(challenges) >= 1, "registry is empty")
    ids = [c.id for c in challenges]
    _check(len(ids) == len(set(ids)), f"duplicate challenge ids: {ids}")
    orders = [c.order for c in challenges]
    _check(orders == sorted(orders) and len(set(orders)) == len(orders), f"challenge orders must be unique and sorted: {orders}")
    entries = [c.entry_function for c in challenges]
    _check(len(entries) == len(set(entries)), f"duplicate entry functions: {entries}")
    all_test_ids = [t.id for c in challenges for t in c.tests]
    _check(len(all_test_ids) == len(set(all_test_ids)), "test ids must be unique across challenges")
    for c in challenges:
        _validate_challenge(c, set(ids))
    for legacy, target in LEGACY_IDS.items():
        _check(target in ids, f"LEGACY_IDS[{legacy!r}] -> {target!r} does not exist")


def _register(challenges) -> None:
    """Install the challenge tuple (called once by evaluation.challenge_data) and validate it."""
    global CHALLENGES, BY_ID
    CHALLENGES = tuple(sorted(challenges, key=lambda c: c.order))
    BY_ID = {c.id: c for c in CHALLENGES}
    validate_registry()


# Loading the content package populates CHALLENGES/BY_ID through _register() and validates.
# (Works in both import orders: registry first, or challenge_data first.)
from . import challenge_data as _challenge_data  # noqa: E402,F401
