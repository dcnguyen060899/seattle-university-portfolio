"""Challenge 1 (warm-up): countSubtrees - spec section 2.3, verbatim."""
from __future__ import annotations

from ..registry import (Challenge, Example, FallbackHint, Hint, KnownBad, MisconceptionCard,
                        RubricWeights, TestCase)
from .common import ISSAME_JS, chain_left, generic_cards, js, perfect

# --------------------------------------------------------------------------- Python reference (ground truth)


def _same(p, q):
    if p is None and q is None:
        return True
    if p is None or q is None:
        return False
    return p.val == q.val and _same(p.left, q.left) and _same(p.right, q.right)


def count_subtrees_py(root, sub):
    if root is None:
        return 0
    return (1 if _same(root, sub) else 0) + count_subtrees_py(root.left, sub) + count_subtrees_py(root.right, sub)


# --------------------------------------------------------------------------- JavaScript

STARTER = js("""
function countSubtrees(root, subRoot) {
  if (!root) return 0;

  // 1. Is the tree rooted HERE identical to subRoot?  (contributes 0 or 1)
  // 2. How many matches are inside root.left? Inside root.right?
  // Return the total as a NUMBER, not a boolean.
  // Your code here
}

// From the lesson - reuse it unchanged.
""" + ISSAME_JS)

REFERENCE = js("""
function countSubtrees(root, subRoot) {
  if (!root) return 0;
  // Count this node if the tree rooted here is identical to subRoot,
  // then ADD (not OR) the matches found inside both children.
  const here = isSameTree(root, subRoot) ? 1 : 0;
  return here + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot);
}

""" + ISSAME_JS)

ALT_EARLY_RETURN = js("""
function countSubtrees(root, subRoot) {
  if (!root) return 0;
  // A strict descendant of a matching node has fewer nodes than subRoot,
  // so once this node matches nothing below it can: return 1 right away.
  if (isSameTree(root, subRoot)) return 1;
  return countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot);
}

""" + ISSAME_JS)

# --------------------------------------------------------------------------- known-bad submissions (verified failing sets)

KNOWN_BAD = (
    KnownBad("or_instead_of_sum", "or_instead_of_sum", js("""
function countSubtrees(root, subRoot) {
  if (!root) return 0;
  if (isSameTree(root, subRoot)) return 1;
  return countSubtrees(root.left, subRoot) || countSubtrees(root.right, subRoot);   // BUG: OR caps the count at 1
}

""" + ISSAME_JS), ("cs-06", "cs-07", "cs-08", "cs-11")),
    KnownBad("returns_boolean", "wrong_return_type", js("""
function countSubtrees(root, subRoot) {
  if (!root) return false;                                    // BUG: booleans instead of a count
  if (isSameTree(root, subRoot)) return true;
  return countSubtrees(root.left, subRoot) || countSubtrees(root.right, subRoot);
}

""" + ISSAME_JS), ("cs-01", "cs-02", "cs-03", "cs-04", "cs-05", "cs-06", "cs-07", "cs-08", "cs-09", "cs-10", "cs-11", "cs-12")),
    KnownBad("structure_ignored", "structure_ignored", js("""
function countSubtrees(root, subRoot) {
  if (!root) return 0;
  const here = isSameTree(root, subRoot) ? 1 : 0;
  return here + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot);
}

function isSameTree(p, q) {
  if (!p && !q) return true;
  if (!p || !q) return true;                                  // BUG: treats any missing node as "matches"
  if (p.val !== q.val) return false;
  return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
}
"""), ("cs-02", "cs-05", "cs-07", "cs-08", "cs-09", "cs-11", "cs-12")),
    KnownBad("one_branch_forgotten", "one_branch_forgotten", js("""
function countSubtrees(root, subRoot) {
  if (!root) return 0;
  const here = isSameTree(root, subRoot) ? 1 : 0;
  return here + countSubtrees(root.left, subRoot);           // BUG: root.right is never searched
}

""" + ISSAME_JS), ("cs-06", "cs-07", "cs-08", "cs-10", "cs-11")),
    KnownBad("empty_pattern_counts_one", "empty_pattern_counts_one", js("""
function countSubtrees(root, subRoot) {
  if (!subRoot) return 1;                                     // BUG: copied the boolean convention from isSubtree
  if (!root) return 0;
  const here = isSameTree(root, subRoot) ? 1 : 0;
  return here + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot);
}

""" + ISSAME_JS), ("cs-02",)),
    KnownBad("root_value_only", "structure_ignored", js("""
function countSubtrees(root, subRoot) {
  if (!root) return 0;
  const here = subRoot && root.val === subRoot.val ? 1 : 0;   // BUG: never compares the children
  return here + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot);
}
"""), ("cs-05", "cs-07", "cs-08", "cs-09", "cs-11", "cs-12")),
    KnownBad("missing_return", "missing_return", js("""
function countSubtrees(root, subRoot) {
  if (!root) return 0;
  const here = isSameTree(root, subRoot) ? 1 : 0;
  here + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot);   // BUG: computed but not returned
}

""" + ISSAME_JS), ("cs-02", "cs-03", "cs-04", "cs-05", "cs-06", "cs-07", "cs-08", "cs-09", "cs-10", "cs-11", "cs-12")),
    KnownBad("null_deref", "null_dereference", js("""
function countSubtrees(root, subRoot) {
  const here = isSameTree(root, subRoot) ? 1 : 0;             // BUG: root is used before any null check
  if (!root.left && !root.right) return here;
  return here + countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot);
}

""" + ISSAME_JS), ("cs-01", "cs-05", "cs-06", "cs-12")),
    KnownBad("no_recursive_search", "no_recursive_search", js("""
function countSubtrees(root, subRoot) {
  if (!root) return 0;
  return isSameTree(root, subRoot) ? 1 : 0;                  // BUG: only the root is tried as a candidate
}

""" + ISSAME_JS), ("cs-04", "cs-06", "cs-07", "cs-08", "cs-10", "cs-11", "cs-12")),
)

# --------------------------------------------------------------------------- tests

TESTS = (
    TestCase("cs-01", "base-case", "empty main tree", ((), (1,)), 0,
             "Nothing to search."),
    TestCase("cs-02", "base-case", "empty pattern counts nothing", ((1, 2, 3), ()), 0,
             "No node is the top of an empty tree (unlike isSubtree)."),
    TestCase("cs-03", "values", "single node match", ((5,), (5,)), 1,
             "The whole tree is the one candidate."),
    TestCase("cs-04", "values", "page example 1", ((1, 2, 3, 4, 5), (2, 4, 5)), 1,
             "Only node 2 roots a [2,4,5] subtree."),
    TestCase("cs-05", "structure", "page example 2 (extra node 6)", ((1, 2, 3, 4, 5, None, None, 6), (2, 4, 5)), 0,
             "Node 4 has a child 6 that the pattern lacks."),
    TestCase("cs-06", "aggregate", "pattern appears twice (negative values)", ((-1, -2, -2, -3, None, -3, None), (-2, -3)), 2,
             "Both -2 nodes have exactly one child -3 on the left."),
    TestCase("cs-07", "structure", "only leaves match a leaf pattern", ((2, 2, 2), (2,)), 2,
             "The root's subtree is [2,2,2], not [2]."),
    TestCase("cs-08", "aggregate", "overlapping candidates (7 nodes, all 1s)", ((1, 1, 1, 1, 1, 1, 1), (1, 1, 1)), 2,
             "Both children of the root match; the root has 7 nodes."),
    TestCase("cs-09", "structure", "pattern larger than tree", ((1,), (1, 2)), 0,
             "A candidate cannot be smaller than the pattern."),
    TestCase("cs-10", "recursion", "match is in the right subtree only", ((1, 2, 3, None, None, 4, 5), (3, 4, 5)), 1,
             "Searching only the left child misses it."),
    TestCase("cs-11", "performance", "63-node perfect tree of zeros, 3-node pattern", (perfect(6, lambda i: 0), (0, 0, 0)), 16,
             "Every node at depth 4 (16 of them) roots a [0,0,0].",
             gen_desc="root = perfect tree of depth 6 (63 nodes), all values 0, subRoot = [0,0,0]"),
    TestCase("cs-12", "performance", "100-deep left chain, 2-node pattern", (chain_left(100, lambda i: 7), (7, 7)), 1,
             "Only the second-to-last node has exactly one left child and no right child.",
             gen_desc="root = left chain of 100 nodes, all values 7, subRoot = [7,7]"),
)

# --------------------------------------------------------------------------- hints

HINTS = (
    Hint(1, "Concept",
         "`isSubtree` asked *is there at least one match?* and combined the two recursive answers with `||`. "
         "You are now asked *how many?* Which arithmetic operation replaces `||` when you want a total instead of a yes/no?",
         0),
    Hint(2, "Structure",
         "At each node decide 0 or 1 for THIS node with `isSameTree(root, subRoot)`, then add the counts coming back "
         "from `root.left` and `root.right`. What must `countSubtrees(null, subRoot)` return so that the addition works out?",
         1),
    Hint(3, "Almost there",
         "Compute `const here = isSameTree(root, subRoot) ? 1 : 0;` and return `here` plus the count from the left child "
         "plus the count from the right child, with `if (!root) return 0;` as the only base case. `isSameTree` stays exactly "
         "as in the lesson; it already returns false when `subRoot` is empty, so the empty-pattern rule needs no special code.",
         2),
)

FALLBACK_HINTS = (
    FallbackHint("conceptual",
                 "Every node of root is a candidate; each candidate contributes 0 or 1; the answer is the total over all candidates.",
                 "For the first failing test, list the candidate nodes that should count, then check what your function does with each."),
    FallbackHint("targeted",
                 "Trace the first failing test by hand: write the 0/1 contribution of each node and the sum your code actually computes.",
                 "Where does your sum diverge from the hand count?"),
    FallbackHint("near_explicit", HINTS[2].text,
                 "After the change, what does countSubtrees return for the failing test?"),
    FallbackHint("extension",
                 "Your solution is correct. Two things to explore: can you stop descending once the remaining subtree has fewer "
                 "nodes than subRoot? And move on to the Fuzzy Subtree challenge and reuse your search skeleton.",
                 "What is the worst-case number of node comparisons for n = 100 and m = 3, and which input shape causes it?"),
)

# --------------------------------------------------------------------------- misconception cards

CARDS = (
    MisconceptionCard(
        id="or_instead_of_sum", title="OR instead of sum",
        symptom="Tests with more than one match return 1 (cs-06, cs-07, cs-08, cs-11).",
        question="If the pattern appears once on the left and once on the right, what does `1 || 1` evaluate to?",
        why="`left || right` stops at the first true and caps the count at 1; counting needs `+` and must visit both children.",
        fix_direction="Add the counts of both children to the 0/1 contribution of the current node.",
        signature_failing_ids=("cs-06", "cs-07", "cs-08", "cs-11")),
    MisconceptionCard(
        id="structure_ignored", title="Shape is not checked",
        symptom="Counts come out too high (cs-05, cs-07, cs-09): a node whose subtree has extra or missing children still counts.",
        question="In example 2, node 4 has a child 6 that the pattern lacks. Which line of isSameTree is supposed to notice that?",
        why="The comparison accepts a match when one side is empty and the other is not (or compares root values only), so shape is ignored.",
        fix_direction="Use the lesson's isSameTree unchanged: exactly one empty side means false.",
        signature_failing_ids=("cs-02", "cs-05", "cs-07", "cs-08", "cs-09", "cs-11", "cs-12")),
    MisconceptionCard(
        id="one_branch_forgotten", title="One child is never searched",
        symptom="cs-10 returns 0 (the match is only in the right subtree) and multi-match tests return 1.",
        question="You counted matches under root.left. Where do the matches under root.right go?",
        why="Only root.left (or only root.right) is searched, so matches on the other side are never counted.",
        fix_direction="Add the count from the other child.",
        signature_failing_ids=("cs-06", "cs-07", "cs-08", "cs-10", "cs-11")),
    MisconceptionCard(
        id="empty_pattern_counts_one", title="Copied isSubtree's empty-pattern rule",
        symptom="cs-02 returns 1 instead of 0.",
        question="How many nodes of root have an empty subtree?",
        why='isSubtree answers "is an empty pattern present?" with true; countSubtrees answers "how many nodes root a match?", '
            "and no node roots an empty tree.",
        fix_direction="Remove the special case; isSameTree(node, null) is already false.",
        signature_failing_ids=("cs-02",)),
    MisconceptionCard(
        id="no_recursive_search", title="Only the root is tried as a candidate",
        symptom="cs-04 and cs-10 return 0: matches below the root are never found.",
        question="How many nodes of root could be the top of a match, and which of them does your code try?",
        why="isSameTree runs once at the top instead of at every node of root.",
        fix_direction="Add countSubtrees(root.left, subRoot) + countSubtrees(root.right, subRoot) to the current node's 0/1.",
        signature_failing_ids=("cs-04", "cs-06", "cs-07", "cs-08", "cs-10", "cs-11", "cs-12")),
    MisconceptionCard(
        id="null_root_value", title="Empty main tree does not return 0",
        symptom="cs-01 fails: an empty root returns something other than 0.",
        question="What number of matches are there in an empty tree?",
        why="The base case for an empty root is missing or returns a boolean.",
        fix_direction="Return 0 (a number) when root is empty, before anything else.",
        signature_failing_ids=("cs-01",)),
) + generic_cards("integer")

# --------------------------------------------------------------------------- the challenge

CHALLENGE = Challenge(
    id="countSubtrees", order=1, title="Count Matching Subtrees", difficulty="warm-up", difficulty_label="Warm-up",
    summary="Count how many nodes of root are the top of a subtree identical to subRoot.",
    spec=(
        "Given the roots of two binary trees `root` and `subRoot`, return the number of nodes `n` in `root` such that "
        "the subtree rooted at `n` (that is, `n` together with all of its descendants) is identical to `subRoot` in both "
        "structure and node values. This is the counting version of the lesson: `isSubtree` asks \"is there at least one "
        "such node?\", `countSubtrees` asks \"how many?\". Return a number, never a boolean. Conventions: if `root` is empty "
        "the answer is `0`; if `subRoot` is empty the answer is also `0`, because no node of `root` is the top of an empty "
        "tree (this deliberately differs from `isSubtree`, which returns `true` for an empty pattern). The lesson's "
        "`isSameTree` can be reused unchanged: it already returns `false` whenever exactly one of its arguments is empty."
    ),
    examples=(
        Example("root = [1,2,3,4,5], subRoot = [2,4,5]", "1", "Only node 2 is the top of a [2,4,5] subtree."),
        Example("root = [1,2,2,3,null,3,null], subRoot = [2,3]", "2",
                "Both nodes with value 2 have exactly one child, 3, on the left."),
        Example("root = [2,2,2], subRoot = [2]", "2", "Only the two leaves; the root's subtree is [2,2,2], which is not [2]."),
        Example("root = [1,2,3,4,5,null,null,6], subRoot = [2,4,5]", "0", "The extra node 6 under 4 breaks the structure."),
    ),
    constraints=("0 <= nodes in each tree <= 100", "-100 <= node values <= 100", "the answer is an integer in [0, 100]"),
    signature="function countSubtrees(root, subRoot) -> number",
    entry_function="countSubtrees", param_names=("root", "subRoot"), arg_types=("tree", "tree"),
    return_type="integer", has_budget_arg=False,
    starter_code=STARTER, reference_solution=REFERENCE, reference_py=count_subtrees_py,
    accepted_alternatives=(ALT_EARLY_RETURN,),
    solution_notes=(
        "The recursion returns a number at every node: 0 or 1 for this node plus the two child counts.",
        "isSameTree is unchanged; it already answers false for an empty pattern, so countSubtrees(root, null) is 0 without a special case.",
        "OR would stop at the first match; + visits both children and keeps counting.",
    ),
    stretch_goal="Stop descending into a subtree that has fewer nodes than subRoot (count node sizes once up front).",
    target_complexity=(("time", "O(n * m)"), ("space", "O(h)")),
    key_concepts=(
        "Every node of root is tried as a candidate (recursive search).",
        "The candidate check reuses isSameTree (shape and values).",
        "Results are combined with + (0/1 for this node plus both children), not ||.",
        "Base case: an empty root contributes 0; an empty pattern counts 0 without special code.",
        "The function returns a number.",
    ),
    tests=TESTS, hints=HINTS, fallback_hints=FALLBACK_HINTS, misconceptions=CARDS, known_bad=KNOWN_BAD,
    rubric=RubricWeights(0.45, 0.15, 0.20, 0.05, 0.15),
    judge_notes=(
        "Early-returning 1 when the current node matches is CORRECT (a strict descendant of a matching node has fewer "
        "nodes than subRoot and can never match); never flag it. The empty-pattern rule (0) is deliberate and differs "
        "from isSubtree; do not call it a bug. An iterative traversal with an explicit stack is also acceptable."
    ),
    next_challenge_id="fuzzySubtree",
)
