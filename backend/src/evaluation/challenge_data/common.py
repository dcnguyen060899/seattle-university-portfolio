"""Shared registry content: input generators (spec 2.2), tree helpers, the lesson's
``isSameTree`` and the generic misconception cards (spec 2.5)."""
from __future__ import annotations

import collections
from typing import Callable

from ..registry import MisconceptionCard, _Node, build_tree


# --------------------------------------------------------------------------- generators (2.2; exports write literal arrays)

def chain_left(n: int, val: Callable[[int], int]) -> tuple:
    """[v0, v1, None, v2, None, ...] - every node has only a left child."""
    return tuple([val(0)] + [x for i in range(1, n) for x in (val(i), None)])


def chain_right(n: int, val: Callable[[int], int]) -> tuple:
    """[v0, None, v1, None, v2, ...] - every node has only a right child."""
    return tuple([val(0)] + [x for i in range(1, n) for x in (None, val(i))])


def complete(n: int, val: Callable[[int], int]) -> tuple:
    """Complete binary tree with n nodes in heap order, no nulls."""
    return tuple(val(i) for i in range(n))


def perfect(depth: int, val: Callable[[int], int]) -> tuple:
    return complete(2 ** depth - 1, val)


# --------------------------------------------------------------------------- tree helpers (used to derive inputs)

def to_level_order(node) -> tuple:
    """Inverse of build_tree: level-order tuple with None markers, trailing Nones trimmed."""
    if node is None:
        return ()
    out: list = []
    q = collections.deque([node])
    while q:
        n = q.popleft()
        if n is None:
            out.append(None)
        else:
            out.append(n.val)
            q.append(n.left)
            q.append(n.right)
    while out and out[-1] is None:
        out.pop()
    return tuple(out)


def mirror(node):
    """A mirrored copy: left and right swapped at EVERY node."""
    if node is None:
        return None
    m = _Node(node.val)
    m.left = mirror(node.right)
    m.right = mirror(node.left)
    return m


def subtree_at(arr, heap_index: int):
    """The subtree rooted at ``heap_index`` of a complete tree given in heap order."""
    root = build_tree(arr)
    path = []
    i = heap_index
    while i > 0:
        path.append("left" if i % 2 == 1 else "right")
        i = (i - 1) // 2
    n = root
    while path:
        n = getattr(n, path.pop())
    return n


# --------------------------------------------------------------------------- the lesson's helper (Practice mode)

ISSAME_JS = """function isSameTree(p, q) {
  if (!p && !q) return true;
  if (!p || !q) return false;
  if (p.val !== q.val) return false;
  return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
}"""


def js(code: str) -> str:
    """Normalize a triple-quoted JS block: strip the surrounding blank lines only."""
    return code.strip("\n")


# --------------------------------------------------------------------------- generic cards (2.5)

MISSING_RETURN = MisconceptionCard(
    id="missing_return",
    title="A branch falls through without returning",
    symptom="Most tests report `actual: undefined`.",
    question="What does your function return on the last line when no earlier return fires?",
    why="The recursive expression is evaluated but its value is not returned; JavaScript returns undefined.",
    fix_direction="Put `return` in front of the combining expression.",
    uniform_rule="actual_undefined",
)

WRONG_RETURN_TYPE = MisconceptionCard(
    id="wrong_return_type",
    title="Returns true/false instead of a number",
    symptom="Most tests fail with a boolean actual value.",
    question="The problem asks how many. What type should the answer be?",
    why="The harness compares with ===, so true is not 1 and false is not 0.",
    fix_direction="Return 0 for no match and add 1 per matching node.",
    uniform_rule="actual_boolean",
)

NULL_DEREFERENCE = MisconceptionCard(
    id="null_dereference",
    title="Reading .val/.left/.right on an empty node",
    symptom='Some tests error with "Cannot read properties of null".',
    question="Which check must run before you touch node.val?",
    why="A null check is missing or comes after the property access, so the first empty child throws.",
    fix_direction="Handle the empty cases (both empty, exactly one empty) before reading any property.",
    error_pattern="Cannot read propert(y|ies) of (null|undefined)|null is not an object|undefined is not an object",
)

STACK_OVERFLOW = MisconceptionCard(
    id="stack_overflow",
    title="Recursion never reaches a base case",
    symptom='Tests error with "Maximum call stack size exceeded".',
    question="What input makes your recursion stop, and does every call get closer to it?",
    why="A base case is missing or the recursive call does not move toward it, so the calls never stop.",
    fix_direction="Return on empty nodes before recursing, and recurse on children, not on the same node.",
    error_pattern="Maximum call stack size exceeded|too much recursion",
)

UNDEFINED_IDENTIFIER = MisconceptionCard(
    id="undefined_identifier",
    title="A name is used that does not exist",
    symptom='Tests error with "X is not defined" or "X is not a function".',
    question="Which name does the error mention, and where is it defined in your code?",
    why="The submission calls a function or variable that is not declared in it; the harness runs only what you "
        "submitted, in strict mode, so undeclared names are errors.",
    fix_direction="Declare the helper (or variable) in your submission with the exact name you call.",
    error_pattern="is not defined|is not a function|Cannot access '.*' before initialization",
)


def generic_cards(return_type: str) -> tuple[MisconceptionCard, ...]:
    """The generic cards appended to every challenge; ``wrong_return_type`` only makes sense
    (and its uniform rule only fires) for integer-returning challenges."""
    cards = [MISSING_RETURN]
    if return_type == "integer":
        cards.append(WRONG_RETURN_TYPE)
    cards.extend([NULL_DEREFERENCE, STACK_OVERFLOW, UNDEFINED_IDENTIFIER])
    return tuple(cards)
