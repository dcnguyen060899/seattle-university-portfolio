"""Challenge 3 (advanced): isMirrorSubtree - addendum A1, ported from scratchpad/challenge-check/challenges.js."""
from __future__ import annotations

from ..registry import (Challenge, Example, FallbackHint, Hint, KnownBad, MisconceptionCard,
                        RubricWeights, TestCase)
from .common import (ISSAME_JS, chain_left, chain_right, complete, generic_cards, js, mirror, subtree_at,
                     to_level_order)

# --------------------------------------------------------------------------- Python reference (ground truth)


def _same(p, q):
    if p is None and q is None:
        return True
    if p is None or q is None:
        return False
    return p.val == q.val and _same(p.left, q.left) and _same(p.right, q.right)


def _mirror_eq(p, q):
    """True when p is exactly the mirror image of q (sides crossed at EVERY level)."""
    if p is None and q is None:
        return True
    if p is None or q is None:
        return False
    return p.val == q.val and _mirror_eq(p.left, q.right) and _mirror_eq(p.right, q.left)


def mirror_subtree_py(root, sub):
    if sub is None:
        return True
    if root is None:
        return False
    if _same(root, sub) or _mirror_eq(root, sub):
        return True
    return mirror_subtree_py(root.left, sub) or mirror_subtree_py(root.right, sub)


# --------------------------------------------------------------------------- derived inputs (mr-11)

BIG = complete(100, lambda i: i)                                  # values 0..99 in heap order
MIRRORED_SUB20 = to_level_order(mirror(subtree_at(BIG, 5)))       # 20-node irregular subtree at heap index 5, mirrored

# --------------------------------------------------------------------------- JavaScript

STARTER = js("""
function isMirrorSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;

  // 1. Does the candidate rooted HERE equal subRoot, OR equal the MIRROR image
  //    of subRoot (left and right swapped at EVERY node)?
  // 2. Otherwise keep searching root.left and root.right, exactly like isSubtree.
  // Your code here
}

// From the lesson - reuse it unchanged for the plain (un-mirrored) comparison.
""" + ISSAME_JS + """

// Helper for the mirrored comparison. Same base cases as isSameTree (both empty,
// exactly one empty, values differ), but cross the sides in the recursive calls:
// p.left against q.right and p.right against q.left.
function isMirrorTree(p, q) {
  // Your code here
}
""")

IS_MIRROR_TREE_JS = """// True when p is exactly the mirror image of q: values equal at the root,
// p.left mirrors q.right and p.right mirrors q.left, all the way down.
function isMirrorTree(p, q) {
  if (!p && !q) return true;
  if (!p || !q) return false;
  if (p.val !== q.val) return false;
  return isMirrorTree(p.left, q.right) && isMirrorTree(p.right, q.left);
}"""

REFERENCE = js("""
function isMirrorSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  // A candidate matches if it equals subRoot OR equals the mirror image of subRoot.
  if (isSameTree(root, subRoot) || isMirrorTree(root, subRoot)) return true;
  return isMirrorSubtree(root.left, subRoot) || isMirrorSubtree(root.right, subRoot);
}

""" + ISSAME_JS + "\n\n" + IS_MIRROR_TREE_JS)

ALT_MIRROR_COPY = js("""
function isMirrorSubtree(root, subRoot) {
  // Build the mirror image of subRoot once, then the problem is two ordinary isSubtree searches.
  return isSubtree(root, subRoot) || isSubtree(root, mirrorOf(subRoot));
}

function mirrorOf(node) {
  if (!node) return null;
  return { val: node.val, left: mirrorOf(node.right), right: mirrorOf(node.left) };
}

function isSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  if (isSameTree(root, subRoot)) return true;
  return isSubtree(root.left, subRoot) || isSubtree(root.right, subRoot);
}

""" + ISSAME_JS)

# --------------------------------------------------------------------------- known-bad submissions (verified failing sets)

KNOWN_BAD = (
    KnownBad("root_only_swap", "root_only_swap", js("""
function isMirrorSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  if (isSameTree(root, subRoot) || isMirrorTree(root, subRoot)) return true;
  return isMirrorSubtree(root.left, subRoot) || isMirrorSubtree(root.right, subRoot);
}

""" + ISSAME_JS + """

function isMirrorTree(p, q) {
  if (!p && !q) return true;
  if (!p || !q) return false;
  if (p.val !== q.val) return false;
  return isSameTree(p.left, q.right) && isSameTree(p.right, q.left);   // BUG: swaps only at the top
}
"""), ("mr-06", "mr-07", "mr-09", "mr-11", "mr-12")),
    KnownBad("flip_equivalent_per_node", "flip_equivalent_per_node", js("""
function isMirrorSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  if (flex(root, subRoot)) return true;
  return isMirrorSubtree(root.left, subRoot) || isMirrorSubtree(root.right, subRoot);
}

function flex(p, q) {                                        // BUG: chooses same/mirror independently at each node
  if (!p && !q) return true;
  if (!p || !q) return false;
  if (p.val !== q.val) return false;
  return (flex(p.left, q.left) && flex(p.right, q.right)) || (flex(p.left, q.right) && flex(p.right, q.left));
}
"""), ("mr-07", "mr-08")),
    KnownBad("forgot_plain_match", "forgot_plain_match", js("""
function isMirrorSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  if (isMirrorTree(root, subRoot)) return true;              // BUG: never checks the un-mirrored case
  return isMirrorSubtree(root.left, subRoot) || isMirrorSubtree(root.right, subRoot);
}

""" + IS_MIRROR_TREE_JS), ("mr-03",)),
    KnownBad("forgot_mirror_match", "forgot_mirror_match", js("""
function isMirrorSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  if (isSameTree(root, subRoot)) return true;                // BUG: mirror helper never written / not crossed
  return isMirrorSubtree(root.left, subRoot) || isMirrorSubtree(root.right, subRoot);
}

""" + ISSAME_JS), ("mr-04", "mr-06", "mr-09", "mr-11", "mr-12")),
    KnownBad("mirrors_root_not_pattern", "mirrors_root_not_pattern", js("""
function isMirrorSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  return isSameTree(root, subRoot) || isMirrorTree(root, subRoot);   // BUG: never searches deeper
}

""" + ISSAME_JS + "\n\n" + IS_MIRROR_TREE_JS), ("mr-03", "mr-04", "mr-09", "mr-11", "mr-12")),
    KnownBad("missing_return", "missing_return", js("""
function isMirrorSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return;                                         // BUG: returns undefined
  if (isSameTree(root, subRoot) || isMirrorTree(root, subRoot)) return true;
  isMirrorSubtree(root.left, subRoot) || isMirrorSubtree(root.right, subRoot);   // BUG: computed but not returned
}

""" + ISSAME_JS + "\n\n" + IS_MIRROR_TREE_JS), ("mr-02", "mr-03", "mr-04", "mr-05", "mr-07", "mr-08", "mr-09", "mr-10", "mr-11", "mr-12")),
    KnownBad("null_deref", "null_dereference", js("""
function isMirrorSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (isSameTree(root, subRoot) || isMirrorTree(root, subRoot)) return true;
  return isMirrorSubtree(root.left, subRoot) || isMirrorSubtree(root.right, subRoot);   // BUG: root may be null here
}

""" + ISSAME_JS + "\n\n" + IS_MIRROR_TREE_JS), ("mr-02", "mr-05", "mr-07", "mr-08", "mr-09", "mr-10", "mr-11")),
)

# --------------------------------------------------------------------------- tests

TESTS = (
    TestCase("mr-01", "base-case", "empty pattern is always found", ((1, 2, 3), ()), True,
             "Convention shared with isSubtree."),
    TestCase("mr-02", "base-case", "empty main tree", ((), (1,)), False,
             "Nothing to search."),
    TestCase("mr-03", "values", "plain (un-mirrored) match", ((1, 2, 3, 4, 5), (2, 4, 5)), True,
             "Node 2 roots exactly [2,4,5]; no mirroring is needed."),
    TestCase("mr-04", "values", "mirrored match", ((1, 2, 3, 4, 5), (2, 5, 4)), True,
             "Node 2 roots [2,4,5], which is the mirror image of [2,5,4]."),
    TestCase("mr-05", "values", "neither match nor mirror (negative values)", ((-1, -2, -3, -4, -5), (-2, -4, -6)), False,
             "Node -2 roots [-2,-4,-5]; neither it nor its mirror image contains a -6."),
    TestCase("mr-06", "structure", "mirror must apply at EVERY level",
             ((1, 3, 2, 5, None, None, 4), (1, 2, 3, 4, None, None, 5)), True,
             "The whole tree is the mirror image of subRoot: sides are swapped at the root AND below both children."),
    TestCase("mr-07", "structure", "swapping only the top children is not a mirror",
             ((1, 3, 2, None, 5, 4, None), (1, 2, 3, 4, None, None, 5)), False,
             "Only the root's children are swapped; the grandchildren keep their sides, so it is not a reflection."),
    TestCase("mr-08", "structure", "flip-equivalent (swapped at some nodes) is NOT a mirror",
             ((1, 2, 3, None, 4, 5, None), (1, 2, 3, 4, None, None, 5)), False,
             "Sides are swapped below node 2 and node 3 but not at the root; a mirror swaps at every node."),
    TestCase("mr-09", "recursion", "mirror found deep in the right subtree",
             ((0, 9, 1, None, None, 3, 2, 5, None, None, 4), (1, 2, 3, 4, None, None, 5)), True,
             "The root's right child roots the mirror image of subRoot; searching only the left side misses it."),
    TestCase("mr-10", "structure", "mirror with an extra node is still a shape mismatch",
             ((1, 2, 3, 4, 5, None, None, 6), (2, 5, 4)), False,
             "Node 2 roots [2,4,5] plus a child 6 under 4; the extra node breaks both the plain and the mirrored comparison."),
    TestCase("mr-11", "performance", "100-node tree, mirrored 20-node irregular pattern inside", (BIG, MIRRORED_SUB20), True,
             "The 20-node subtree at heap index 5 is the mirror image of subRoot; every candidate above it is tried first.",
             gen_desc="root = complete tree of 100 nodes, values 0..99 in heap order, subRoot = mirror image of the 20-node "
                      "subtree rooted at heap index 5 (values 5, 12, 11, 26, 25, 24, 23, ...)"),
    TestCase("mr-12", "performance", "100-deep LEFT chain vs 30-deep RIGHT chain",
             (chain_left(100, lambda i: i), chain_right(30, lambda i: 70 + i)), True,
             "The left chain from node 70 down to 99 is the mirror image of the right chain 70..99.",
             gen_desc="root = left chain of 100 nodes, values 0..99, subRoot = right chain of 30 nodes, values 70..99"),
)

# --------------------------------------------------------------------------- hints

HINTS = (
    Hint(1, "Concept",
         "A mirror image swaps left and right at EVERY node, not only at the top. `isSameTree` compares `p.left` with "
         "`q.left`; if `q` were reflected, what would `p.left` have to be compared with, and what about the grandchildren?",
         0),
    Hint(2, "Structure",
         "Write `isMirrorTree(p, q)` with the same three base cases as `isSameTree` (both empty, exactly one empty, values "
         "differ) but cross the recursive calls: `p.left` against `q.right` and `p.right` against `q.left`. A candidate then "
         "matches when `isSameTree(root, subRoot) || isMirrorTree(root, subRoot)`. Why must the crossing happen inside the "
         "recursion rather than once at the top?",
         1),
    Hint(3, "Almost there",
         "`isMirrorTree(p, q)`: both empty -> `true`; exactly one empty -> `false`; `p.val !== q.val` -> `false`; otherwise "
         "`isMirrorTree(p.left, q.right) && isMirrorTree(p.right, q.left)`. In `isMirrorSubtree`, return `true` when "
         "`isSameTree(root, subRoot) || isMirrorTree(root, subRoot)`, and otherwise return "
         "`isMirrorSubtree(root.left, subRoot) || isMirrorSubtree(root.right, subRoot)`. (Alternative: build a mirrored copy "
         "of subRoot once and run the lesson's isSubtree twice.)",
         2),
)

FALLBACK_HINTS = (
    FallbackHint("conceptual",
                 "A candidate matches when it equals subRoot as-is OR equals subRoot reflected: left and right swapped at "
                 "every node on the way down. For the first failing test, decide which of the two comparisons should have "
                 "succeeded, then check whether your code performs it at every level.",
                 "In the failing test, which candidate node should match, and is it the plain comparison or the mirrored "
                 "one that should succeed there?"),
    FallbackHint("targeted",
                 "Trace the first failing test by hand: at the candidate that should match, write down which child you "
                 "compare with which at every level, and compare that with a reflection that swaps sides at every node.",
                 "At which level does your comparison stop swapping sides, or swap when it should not?"),
    FallbackHint("near_explicit", HINTS[2].text,
                 "After that change, which comparison (plain or mirrored) makes the failing test's candidate match?"),
    FallbackHint("extension",
                 "Your solution is correct. Two things to explore: build the mirror image of subRoot once and reuse the "
                 "lesson's isSubtree, and stop the search early when a candidate has fewer nodes than subRoot.",
                 "Both comparisons walk the same candidate; for n = 100 and m = 20, what is the worst-case number of node "
                 "visits, and could one traversal answer both questions?"),
)

# --------------------------------------------------------------------------- misconception cards

CARDS = (
    MisconceptionCard(
        id="root_only_swap", title="Sides swapped only at the top",
        symptom="mr-06 and mr-09 return false (a full mirror image is rejected) while mr-07 returns true (a top-only swap is accepted).",
        question="After you compare root.left with subRoot.right, what should the children of those two nodes be compared with?",
        why="The helper crosses p.left with q.right once and then hands the children to isSameTree, so below the first "
            "level the comparison goes back to same-side; a real mirror image is swapped at every node.",
        fix_direction="Make the mirror helper call itself (not isSameTree) on the crossed children so the swap continues all the way down.",
        signature_failing_ids=("mr-06", "mr-07", "mr-09", "mr-11", "mr-12")),
    MisconceptionCard(
        id="flip_equivalent_per_node", title="Same-or-mirror chosen at each node",
        symptom="mr-07 and mr-08 return true: trees that are swapped at only some nodes are accepted.",
        question="If your helper may swap at node 2 but not at node 3, is the result still one reflection of the whole tree?",
        why="Deciding independently at every node whether to compare same-side or crossed accepts flip-equivalent trees; "
            "a mirror image is one reflection applied to the whole tree, not a choice per node.",
        fix_direction="Keep two separate helpers: isSameTree never crosses and the mirror helper always crosses; combine "
                      "them once, at the candidate root, with ||.",
        signature_failing_ids=("mr-07", "mr-08")),
    MisconceptionCard(
        id="forgot_plain_match", title="Only the mirrored comparison is made",
        symptom="mr-03 returns false: an exact, un-mirrored copy of subRoot is not accepted.",
        question="For the candidate [2,4,5] and subRoot [2,4,5], which of your two comparisons should say yes?",
        why="The candidate is compared only against the mirror image of subRoot; the problem accepts either the plain copy or the mirror.",
        fix_direction="Accept the candidate when isSameTree(candidate, subRoot) OR the mirror helper succeeds.",
        signature_failing_ids=("mr-03",)),
    MisconceptionCard(
        id="forgot_mirror_match", title="Only the plain comparison is made",
        symptom="mr-04, mr-06 and mr-09 return false: a candidate that equals the mirror image of subRoot is rejected.",
        question="For subRoot [2,5,4], which candidate in root = [1,2,3,4,5] should match, and what does isSameTree say about it?",
        why="Only isSameTree is called, so a candidate whose left and right are swapped relative to subRoot never matches; "
            "the mirror helper is missing or is never reached.",
        fix_direction="Add a mirror helper that compares p.left with q.right and p.right with q.left at every level, and "
                      "accept the candidate when either comparison succeeds.",
        signature_failing_ids=("mr-04", "mr-06", "mr-09", "mr-11", "mr-12")),
    MisconceptionCard(
        id="mirrors_root_not_pattern", title="Only the root is tried as a candidate",
        symptom="mr-03, mr-04 and mr-09 return false: matches below the root are never found.",
        question="How many nodes of root could be the top of a match, and which of them does your code try?",
        why="The two comparisons run once at the top of root instead of at every node, so only the whole tree can match subRoot or its mirror.",
        fix_direction="After both comparisons fail at the current node, call isMirrorSubtree on root.left and root.right "
                      "and combine with ||, exactly like isSubtree.",
        signature_failing_ids=("mr-03", "mr-04", "mr-09", "mr-11", "mr-12")),
) + generic_cards("boolean")

# --------------------------------------------------------------------------- the challenge

CHALLENGE = Challenge(
    id="mirrorSubtree", order=3, title="Mirror Subtree", difficulty="advanced", difficulty_label="Advanced",
    summary="Find a subtree of root that equals subRoot or the mirror image of subRoot (left and right swapped at every node).",
    spec=(
        "Given the roots of two binary trees `root` and `subRoot`, return `true` if some *candidate* subtree of `root` is "
        "identical to `subRoot` OR identical to the *mirror image* of `subRoot`, and `false` otherwise. A candidate is a node "
        "of `root` together with all of its descendants. The mirror image of a tree is the tree with its left and right "
        "children swapped at EVERY node, recursively, all the way down to the leaves; values are unchanged. Identical means "
        "the same shape and the same values position by position, exactly as in the lesson's `isSameTree`. A tree that is "
        "swapped at only some nodes (a \"flip-equivalent\" tree) is NOT a mirror image and must not match. Conventions: an "
        "empty `subRoot` is always found (`true`); an empty `root` with a non-empty `subRoot` is `false`."
    ),
    examples=(
        Example("root = [1,2,3,4,5], subRoot = [2,4,5]", "true", "Node 2 roots exactly [2,4,5]; a plain match needs no mirroring."),
        Example("root = [1,2,3,4,5], subRoot = [2,5,4]", "true",
                "Node 2 roots [2,4,5], which is the mirror image of [2,5,4] (its children swapped)."),
        Example("root = [1,3,2,null,5,4,null], subRoot = [1,2,3,4,null,null,5]", "false",
                "Only the root's children are swapped; the mirror image of subRoot is [1,3,2,5,null,null,4], swapped at every level."),
        Example("root = [1,2,3,4,5,null,null,6], subRoot = [2,5,4]", "false",
                "Node 2 roots [2,4,5] with an extra node 6 under 4; the shape differs from both subRoot and its mirror."),
    ),
    constraints=("0 <= nodes in each tree <= 100", "-100 <= node values <= 100", "the answer is a boolean: true or false"),
    signature="function isMirrorSubtree(root, subRoot) -> boolean",
    entry_function="isMirrorSubtree", param_names=("root", "subRoot"), arg_types=("tree", "tree"),
    return_type="boolean", has_budget_arg=False,
    starter_code=STARTER, reference_solution=REFERENCE, reference_py=mirror_subtree_py,
    accepted_alternatives=(ALT_MIRROR_COPY,),
    solution_notes=(
        "isMirrorTree has the same three base cases as isSameTree; only the recursive calls cross sides (p.left with q.right, p.right with q.left).",
        "Because the crossing happens inside the recursion, the swap applies at every level automatically; a flip-equivalent tree fails.",
        "Building mirror(subRoot) once and running the lesson's isSubtree twice is an equally correct design.",
    ),
    stretch_goal="Compute the mirror image of subRoot once and answer with two calls of the lesson's isSubtree; then "
                 "compare the number of node visits with the two-helper design.",
    target_complexity=(("time", "O(n * m)"), ("space", "O(h)")),
    key_concepts=(
        "Every node of root is tried as a candidate (recursive search), exactly like isSubtree.",
        "A candidate matches when it equals subRoot OR equals the mirror image of subRoot.",
        "The mirror comparison crosses sides at every level: p.left against q.right and p.right against q.left, recursively.",
        "Base cases are the same as isSameTree: both empty is true, exactly one empty is false, differing values is false.",
        "Swapping at only some nodes (flip-equivalence) is not a mirror; the reflection is all-or-nothing.",
    ),
    tests=TESTS, hints=HINTS, fallback_hints=FALLBACK_HINTS, misconceptions=CARDS, known_bad=KNOWN_BAD,
    rubric=RubricWeights(0.45, 0.15, 0.20, 0.05, 0.15),
    judge_notes=(
        "The expected shape is a helper isMirror(p, q) that compares p.left with q.right and p.right with q.left at every "
        "level, with the same base cases as isSameTree (both empty true, exactly one empty false, values differ false), "
        "combined at the candidate root as isSameTree(root, subRoot) || isMirror(root, subRoot). Building a mirrored copy "
        "of subRoot once and then running the lesson's isSubtree twice (once with subRoot, once with the copy) is ALSO "
        "correct; do not restructure it into the two-helper shape. Reusing isSameTree unchanged for the plain comparison "
        "is expected, not a weakness. Choosing same-or-swapped independently at each node (flip-equivalence) is the "
        "classic bug: it accepts mr-07 and mr-08. Crossing only at the top and then calling isSameTree fails mr-06."
    ),
    next_challenge_id=None,
)
