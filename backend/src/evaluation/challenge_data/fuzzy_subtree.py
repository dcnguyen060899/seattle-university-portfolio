"""Challenge 2 (core): fuzzySubtree - spec section 2.4, verbatim (disambiguated spec, corrected reference)."""
from __future__ import annotations

from ..registry import (Challenge, Example, FallbackHint, Hint, KnownBad, MisconceptionCard,
                        RubricWeights, TestCase)
from .common import chain_left, complete, generic_cards, js, perfect

# --------------------------------------------------------------------------- Python reference (ground truth)


def _mismatches(p, q):
    if p is None and q is None:
        return 0
    if p is None or q is None:
        return float("inf")
    return (1 if p.val != q.val else 0) + _mismatches(p.left, q.left) + _mismatches(p.right, q.right)


def fuzzy_subtree_py(root, sub, max_differences=1):
    if sub is None:
        return True
    if root is None:
        return False
    if _mismatches(root, sub) <= max_differences:
        return True
    return fuzzy_subtree_py(root.left, sub, max_differences) or fuzzy_subtree_py(root.right, sub, max_differences)


# --------------------------------------------------------------------------- JavaScript

STARTER = js("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;

  // Does the candidate rooted HERE have the same shape as subRoot and
  // at most maxDifferences value mismatches (root position included)?
  // Your code here

  // Otherwise keep searching both children, exactly like isSubtree.
  // Your code here
}

// Helper. Design decision: what should it RETURN so that the mismatches
// found in the left child and in the right child are combined correctly?
// Cases to handle: both empty, exactly one empty, values differ.
function countMismatches(p, q) {
  // Your code here
}
""")

COUNT_MISMATCHES_JS = """// Returns the number of positions whose VALUES differ when p and q have
// exactly the same shape, or Infinity when the shapes differ.
function countMismatches(p, q) {
  if (!p && !q) return 0;
  if (!p || !q) return Infinity;
  const here = p.val !== q.val ? 1 : 0;
  return here + countMismatches(p.left, q.left) + countMismatches(p.right, q.right);
}"""

REFERENCE = js("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;
  // Each candidate gets a FRESH budget: count mismatches over the whole
  // candidate, then compare once against maxDifferences.
  if (countMismatches(root, subRoot) <= maxDifferences) return true;
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}

""" + COUNT_MISMATCHES_JS)

ALT_THREADED_BUDGET = js("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;
  if (remainingBudget(root, subRoot, maxDifferences) >= 0) return true;
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}
// Returns the budget left after matching p against q, or -1 if the match fails.
function remainingBudget(p, q, budget) {
  if (!p && !q) return budget;
  if (!p || !q) return -1;
  if (p.val !== q.val) budget -= 1;
  if (budget < 0) return -1;
  budget = remainingBudget(p.left, q.left, budget);   // left spends first...
  if (budget < 0) return -1;
  return remainingBudget(p.right, q.right, budget);   // ...right sees what is left
}
""")

# The page's former reference (docs/learning_algorithm.html #solution-code before the redesign), verbatim.
PAGE_OLD_REFERENCE = js("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;

  // Check if current trees fuzzy match
  if (fuzzySameTree(root, subRoot, maxDifferences)) return true;

  // Recursive search in left and right subtrees
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}

function fuzzySameTree(p, q, maxDifferences, differences = 0) {
  // Base cases
  if (!p && !q) return true;
  if (!p || !q) return false;

  // Value comparison - allow differences up to maxDifferences
  if (p.val !== q.val) {
    differences++;
    if (differences > maxDifferences) return false;
  }

  // Check both subtrees recursively, passing the current difference count
  return fuzzySameTree(p.left, q.left, maxDifferences, differences) &&
         fuzzySameTree(p.right, q.right, maxDifferences, differences);
}
""")


def _variant(search_body: str, helper: str = COUNT_MISMATCHES_JS) -> str:
    return js(search_body + "\n\n" + helper)


# --------------------------------------------------------------------------- known-bad submissions (verified failing sets)

KNOWN_BAD = (
    KnownBad("page_old_reference", "split_budget", PAGE_OLD_REFERENCE, ("fz-06", "fz-15")),
    KnownBad("global_counter", "global_counter", js("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  let diffs = 0;                                   // BUG: one counter shared by every candidate
  function same(p, q) {
    if (!p && !q) return true;
    if (!p || !q) return false;
    if (p.val !== q.val) { diffs++; if (diffs > maxDifferences) return false; }
    return same(p.left, q.left) && same(p.right, q.right);
  }
  function go(r) {
    if (!subRoot) return true;
    if (!r) return false;
    if (same(r, subRoot)) return true;
    return go(r.left) || go(r.right);
  }
  return go(root);
}
"""), ("fz-04", "fz-05", "fz-07", "fz-09", "fz-14", "fz-16")),
    KnownBad("structure_as_difference", "structure_as_difference", js("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;
  if (countMismatches(root, subRoot) <= maxDifferences) return true;
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}

function countMismatches(p, q) {
  if (!p && !q) return 0;
  if (!p || !q) return 1;                          // BUG: a shape mismatch is "just one difference"
  const here = p.val !== q.val ? 1 : 0;
  return here + countMismatches(p.left, q.left) + countMismatches(p.right, q.right);
}
"""), ("fz-08", "fz-13", "fz-15")),
    KnownBad("root_must_match", "root_must_match", _variant("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;
  if (root.val === subRoot.val && countMismatches(root, subRoot) <= maxDifferences) return true;   // BUG: root may not differ
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}"""), ("fz-05", "fz-09", "fz-10")),
    KnownBad("ignores_budget_hardcoded_1", "ignores_budget", _variant("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;
  if (countMismatches(root, subRoot) <= 1) return true;                // BUG: hard-coded 1 instead of maxDifferences
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}"""), ("fz-07", "fz-11", "fz-17")),
    KnownBad("off_by_one_strict_less", "off_by_one_threshold", _variant("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;
  if (countMismatches(root, subRoot) < maxDifferences) return true;    // BUG: < instead of <=
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}"""), ("fz-04", "fz-05", "fz-07", "fz-10", "fz-14", "fz-16")),
    KnownBad("missing_default_param", "missing_default_param", _variant("""
function fuzzySubtree(root, subRoot, maxDifferences) {                 // BUG: no default value
  if (!subRoot) return true;
  if (!root) return false;
  if (countMismatches(root, subRoot) <= maxDifferences) return true;
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}"""), ("fz-03", "fz-04", "fz-05", "fz-10", "fz-14", "fz-16")),
    KnownBad("no_budget_check", "no_budget_check", _variant("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;
  if (countMismatches(root, subRoot) !== Infinity) return true;         // BUG: the count is never compared to the budget
  return fuzzySubtree(root.left, subRoot, maxDifferences) ||
         fuzzySubtree(root.right, subRoot, maxDifferences);
}"""), ("fz-06", "fz-11", "fz-12", "fz-15", "fz-17")),
    KnownBad("no_recursive_search", "no_recursive_search", _variant("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return false;
  return countMismatches(root, subRoot) <= maxDifferences;             // BUG: never searches below the root
}"""), ("fz-03", "fz-04", "fz-05", "fz-07", "fz-09", "fz-14", "fz-16")),
    KnownBad("missing_return", "missing_return", _variant("""
function fuzzySubtree(root, subRoot, maxDifferences = 1) {
  if (!subRoot) return true;
  if (!root) return;                                                   // BUG: returns undefined
  if (countMismatches(root, subRoot) <= maxDifferences) return true;
  fuzzySubtree(root.left, subRoot, maxDifferences) ||                  // BUG: computed but not returned
  fuzzySubtree(root.right, subRoot, maxDifferences);
}"""), ("fz-02", "fz-03", "fz-04", "fz-05", "fz-06", "fz-07", "fz-08", "fz-09", "fz-11", "fz-12", "fz-13",
        "fz-14", "fz-15", "fz-16", "fz-17")),
    KnownBad("exact_only", "ignores_budget", _variant("""
function fuzzySubtree(root, subRoot) {                                 // BUG: maxDifferences is not accepted at all
  if (!subRoot) return true;
  if (!root) return false;
  if (countMismatches(root, subRoot) === 0) return true;               // BUG: only exact matches
  return fuzzySubtree(root.left, subRoot) || fuzzySubtree(root.right, subRoot);
}"""), ("fz-04", "fz-05", "fz-07", "fz-09", "fz-10", "fz-14", "fz-16")),
)

# --------------------------------------------------------------------------- tests

TESTS = (
    TestCase("fz-01", "base-case", "empty pattern is always found", ((1, 2), ()), True,
             "Convention shared with isSubtree."),
    TestCase("fz-02", "base-case", "empty main tree, non-empty pattern", ((), (1,)), False,
             "Nothing to search."),
    TestCase("fz-03", "values", "exact match, default budget (page ex. 1)", ((1, 2, 3, 4, 5), (2, 4, 5)), True,
             "0 differences; called with two arguments, so the default matters."),
    TestCase("fz-04", "budget", "one child value differs", ((1, 2, 3, 4, 5), (2, 4, 9)), True,
             "One mismatch (5 vs 9) with budget 1."),
    TestCase("fz-05", "budget", "candidate root may be the differing node", ((1, 2, 3, 4, 5), (7, 4, 5)), True,
             "The root position counts like any other."),
    TestCase("fz-06", "budget", "two differences on different branches exceed budget 1", ((1, 2, 3, 4, 5), (2, 8, 9)), False,
             "4 vs 8 and 5 vs 9 belong to the same candidate; a per-branch copy of the counter wrongly accepts this "
             "(the old reference's bug)."),
    TestCase("fz-07", "budget", "same two differences allowed with budget 2", ((1, 2, 3, 4, 5), (2, 8, 9), 2), True,
             "The parameter must actually be used."),
    TestCase("fz-08", "structure", "shape mismatch is never fuzzed, even with budget 100 (page ex. 2)",
             ((1, 2, 3, 4, 5, None, None, 6), (2, 4, 5), 100), False,
             "Node 6 breaks the shape; no budget absorbs shape."),
    TestCase("fz-09", "recursion", "budget is fresh for every candidate", ((1, 2, 3, 4, 5, 6, 7), (9, 6, 7), 2), True,
             "Earlier candidates spend mismatches; the candidate at node 3 must start from zero."),
    TestCase("fz-10", "values", "the whole tree can be the candidate", ((1, 2, 3), (9, 2, 3)), True,
             "The root of root is a candidate and its value may differ."),
    TestCase("fz-11", "budget", "budget 0 behaves exactly like isSubtree", ((1, 2, 3, 4, 5), (2, 4, 9), 0), False,
             "One mismatch is one too many at budget 0."),
    TestCase("fz-12", "budget", "two differences on one path (root + child) exceed budget 1", ((1, 2, 3), (9, 9, 3)), False,
             "Differences on the same path also add up."),
    TestCase("fz-13", "structure", "missing child is a shape mismatch", ((1, 2, 3, 4), (2, 4, 5)), False,
             "Candidate [2,4] has no right child."),
    TestCase("fz-14", "recursion", "match deep in the right spine", ((1, None, 2, None, 3, None, 4), (3, None, 5)), True,
             "Candidate at node 3 differs once (4 vs 5)."),
    TestCase("fz-15", "budget", "boundary: 7 mismatches with budget 6 (15-node candidate)",
             (perfect(4, lambda i: 1), perfect(3, lambda i: 2), 6), False,
             "Every one of the 7 positions differs; a per-path counter sees at most 3.",
             gen_desc="root = perfect tree of depth 4 (15 nodes), all values 1, subRoot = perfect tree of depth 3 (7 nodes), all values 2"),
    TestCase("fz-16", "performance", "100-deep left chain, 40-deep pattern with one changed value",
             (chain_left(100, lambda i: i), chain_left(40, lambda i: -1 if i == 20 else 60 + i)), True,
             "The candidate at chain node 60 differs exactly once.",
             gen_desc="root = left chain of 100 nodes, values 0..99, subRoot = left chain of 40 nodes, values 60..99 with the 21st value replaced by -1"),
    TestCase("fz-17", "performance", "100-node complete tree, 63-node pattern, budget 0 forces a full exact scan",
             (complete(100, lambda i: 0), perfect(6, lambda i: 5 if i == 62 else 0), 0), False,
             "Heap node 1 of the tree is a 63-node perfect tree that matches with budget 1 but not 0; every candidate is visited.",
             gen_desc="root = complete tree of 100 nodes, all values 0, subRoot = perfect tree of depth 6 (63 nodes), all 0 except the last leaf = 5"),
)

# --------------------------------------------------------------------------- hints

HINTS = (
    Hint(1, "Concept",
         "'At most maxDifferences values differ' is a property of the whole candidate subtree, not of a single node. "
         "Before writing code, decide: what single NUMBER describes how far a candidate is from `subRoot`?",
         0),
    Hint(2, "Structure",
         "Replace `isSameTree`'s boolean with a helper that RETURNS A NUMBER: how many positions differ in value, or "
         "`Infinity` if the shapes differ. Then `fuzzySubtree` compares that number with `maxDifferences` once per candidate. "
         "Why must the counts from the left child and the right child be ADDED, rather than each checked against the budget on its own?",
         1),
    Hint(3, "Almost there",
         "`countMismatches(p, q)`: both empty -> 0; exactly one empty -> `Infinity`; otherwise `(p.val !== q.val ? 1 : 0)` "
         "plus the count for the left children plus the count for the right children. In `fuzzySubtree`, compare "
         "`countMismatches(root, subRoot)` with `maxDifferences` using `<=`, and if that fails keep searching `root.left` "
         "and `root.right` exactly like `isSubtree`. (Alternative: thread the remaining budget through left then right, "
         "returning -1 on failure.)",
         2),
)

FALLBACK_HINTS = (
    FallbackHint("conceptual",
                 "Look at the first failing test's input and ask what your compare helper believes about the difference budget "
                 "as it walks the candidate. The spec says one budget covers the whole candidate, shapes must match exactly, and "
                 "every candidate starts fresh.",
                 "For the failing test, which candidate node should have matched (or not), and what does your helper return for it?"),
    FallbackHint("targeted",
                 "Trace the first failing test by hand, writing your helper's return value at each call. Compare what it "
                 "returned against the candidate's true mismatch count.",
                 "At which call does your helper's value stop agreeing with your hand count?"),
    FallbackHint("near_explicit", HINTS[2].text,
                 "After that change, what does your helper return for the candidate in the failing test?"),
    FallbackHint("extension",
                 "Your solution is correct. Two things to explore: an early exit that stops counting once the running total "
                 "exceeds maxDifferences, and an iterative version using an explicit stack of (p, q) pairs.",
                 "For n = 100 and m = 63, which input shape makes your solution do the most comparisons, and roughly how many is that?"),
)

# --------------------------------------------------------------------------- misconception cards

CARDS = (
    MisconceptionCard(
        id="split_budget", title="The budget is copied, not shared",
        symptom="fz-06 (and fz-15) return true when two differences sit on different branches of one candidate.",
        question="After the left subtree spends one difference, how does the right subtree find out?",
        why="A number passed by value into the left call and again into the right call becomes two independent copies; "
            "each side may spend the whole budget, so two differences slip through and nobody adds them up.",
        fix_direction="Make the helper return a number (mismatches so far, or Infinity for a shape mismatch) and add the "
                      "left and right results before comparing with maxDifferences.",
        signature_failing_ids=("fz-06", "fz-15")),
    MisconceptionCard(
        id="global_counter", title="One counter for the whole search",
        symptom="Tests that should match return false once an earlier candidate has spent the budget; fz-09 is the clearest.",
        question="When you move to the next candidate root, what should the used-difference count be?",
        why="A counter declared outside the compare helper keeps counting across candidates; a failed candidate leaves it "
            "spent, so a later candidate that should match is rejected.",
        fix_direction="Count inside the helper for one candidate at a time (return the count, or reset it before each candidate).",
        signature_failing_ids=("fz-04", "fz-05", "fz-07", "fz-09", "fz-14", "fz-16")),
    MisconceptionCard(
        id="structure_as_difference", title="Shape mismatch treated as a value difference",
        symptom="fz-08 and fz-13 return true: a missing or extra node was accepted as one difference.",
        question="Is a missing node a node whose value is different, or a different shape?",
        why="A null on one side and a node on the other is not a node with a different value; the spec says shapes must "
            "match exactly at any budget.",
        fix_direction="When exactly one of p and q is empty, reject the candidate outright (Infinity or false) instead of "
                      "counting a difference.",
        signature_failing_ids=("fz-08", "fz-13", "fz-15")),
    MisconceptionCard(
        id="root_must_match", title="Candidate root not allowed to differ",
        symptom="fz-05 and fz-10 return false: the candidate root's value differs and the candidate is rejected before the "
                "budget is considered.",
        question="Where in your code is the first value comparison, and does the budget apply to it?",
        why="The search compares values at the candidate root before delegating to the helper, so the root can never be "
            "the one allowed difference.",
        fix_direction="Let the helper compare the root position like every other position; remove any root.val === "
                      "subRoot.val check from the search.",
        signature_failing_ids=("fz-05", "fz-09", "fz-10")),
    MisconceptionCard(
        id="ignores_budget", title="maxDifferences is not actually used",
        symptom="fz-07 (budget 2) returns false and/or fz-11 (budget 0) returns true: the parameter has no effect.",
        question="If someone calls your function with maxDifferences = 0, which line makes the behaviour stricter?",
        why="The helper compares against a hard-coded 1 (or never reads the parameter), so budget 0 and budget 2 behave "
            "like budget 1.",
        fix_direction="Compare the mismatch count against maxDifferences, not against a literal.",
        signature_failing_ids=("fz-07", "fz-11", "fz-17")),
    MisconceptionCard(
        id="off_by_one_threshold", title="Strict less-than instead of at most",
        symptom="fz-04 and fz-05 (one difference, budget 1) return false while fz-09 (budget 2) passes.",
        question="With maxDifferences = 1 and exactly one mismatch, is 1 < 1?",
        why="The spec allows at most maxDifferences differences, so one difference with budget 1 must match; a strict < "
            "rejects the boundary case.",
        fix_direction="Compare with <= (or reject only when the count is greater than the budget).",
        signature_failing_ids=("fz-04", "fz-05", "fz-07", "fz-10", "fz-14", "fz-16")),
    MisconceptionCard(
        id="missing_default_param", title="maxDifferences has no default value",
        symptom="fz-03 (exact match, called with two arguments) returns false while fz-07 (explicit budget) passes.",
        question="What is the value of maxDifferences when the caller passes only two arguments?",
        why="The tests call fuzzySubtree(root, subRoot) with two arguments; without `= 1` in the signature maxDifferences "
            "is undefined and every comparison against it is false.",
        fix_direction="Keep the signature exactly as given: function fuzzySubtree(root, subRoot, maxDifferences = 1).",
        signature_failing_ids=("fz-03", "fz-04", "fz-05", "fz-10", "fz-14", "fz-16")),
    MisconceptionCard(
        id="no_budget_check", title="Differences counted but never compared to the limit",
        symptom="fz-06 and fz-12 return true: candidates with too many differences are accepted.",
        question="What happens on the line after you increment the counter?",
        why="The counter increments but nothing rejects the candidate when the count exceeds maxDifferences; only shape "
            "mismatches are rejected.",
        fix_direction="Compare the final mismatch count with maxDifferences before accepting a candidate.",
        signature_failing_ids=("fz-06", "fz-11", "fz-12", "fz-15", "fz-17")),
    MisconceptionCard(
        id="no_recursive_search", title="Only the root is tried as a candidate",
        symptom="fz-03, fz-04 and fz-14 return false: matches below the root are never found.",
        question="How many nodes of root could be the top of a match, and which of them does your code try?",
        why="The helper runs once at the top instead of at every node of root, so only the whole tree can match.",
        fix_direction="After the candidate check fails, call fuzzySubtree on root.left and root.right and combine with ||, "
                      "exactly like isSubtree.",
        signature_failing_ids=("fz-03", "fz-04", "fz-05", "fz-07", "fz-09", "fz-14", "fz-16")),
) + generic_cards("boolean")

# --------------------------------------------------------------------------- the challenge

CHALLENGE = Challenge(
    id="fuzzySubtree", order=2, title="Fuzzy Subtree", difficulty="core", difficulty_label="Core",
    summary="Find a subtree that matches subRoot's shape exactly and differs in at most maxDifferences values.",
    spec=(
        "Given the roots of two binary trees `root` and `subRoot`, and a non-negative integer `maxDifferences` (default `1`), "
        "return `true` if some *candidate* subtree of `root` matches `subRoot` fuzzily, and `false` otherwise. A candidate is a "
        "node of `root` together with all of its descendants. A candidate matches fuzzily when (1) it has **exactly the same "
        "shape** as `subRoot`: every position that holds a node in one tree holds a node in the other, so a missing or extra "
        "node is never allowed no matter how large the budget is; and (2) the number of positions whose values differ, counted "
        "over the **whole** candidate (the candidate's root position included, so the root is allowed to be one of the "
        "differing nodes), is **at most** `maxDifferences` (less than or equal). Each candidate is judged on its own with a "
        "fresh budget: mismatches found while examining one candidate never count against another. Conventions: an empty "
        "`subRoot` is always found (`true`); an empty `root` with a non-empty `subRoot` is `false`; `maxDifferences = 0` makes "
        "the function behave exactly like the lesson's `isSubtree`."
    ),
    examples=(
        Example("root = [1,2,3,4,5], subRoot = [2,4,9]", "true", "Candidate [2,4,5] differs at one position (5 vs 9)."),
        Example("root = [1,2,3,4,5], subRoot = [2,8,9]", "false",
                "Candidate [2,4,5] differs at two positions on different branches; with `maxDifferences = 2` the answer is `true`."),
        Example("root = [1,2,3,4,5], subRoot = [7,4,5]", "true", "The candidate's root is the one differing node."),
        Example("root = [1,2,3,4,5,null,null,6], subRoot = [2,4,5], maxDifferences = 100", "false",
                "Node 4 has an extra child; shape is never fuzzed."),
    ),
    constraints=("0 <= nodes in each tree <= 100", "-100 <= node values <= 100", "0 <= maxDifferences <= 100 (integer)"),
    signature="function fuzzySubtree(root, subRoot, maxDifferences = 1) -> boolean",
    entry_function="fuzzySubtree", param_names=("root", "subRoot", "maxDifferences"), arg_types=("tree", "tree", "int"),
    return_type="boolean", has_budget_arg=True,
    starter_code=STARTER, reference_solution=REFERENCE, reference_py=fuzzy_subtree_py,
    accepted_alternatives=(ALT_THREADED_BUDGET,),
    solution_notes=(
        "The helper answers *how many positions differ*, not *do these match*.",
        "Infinity encodes a shape mismatch so the <= test rejects it for any budget.",
        "The count restarts for every candidate because each countMismatches call starts from 0: no shared counter, no copied counter.",
    ),
    stretch_goal="Add an early exit: stop counting once the running total exceeds maxDifferences (the threaded-budget "
                 "alternative shows one way).",
    target_complexity=(("time", "O(n * m)"), ("space", "O(h)")),
    key_concepts=(
        "Search and compare are separated: every node of root is tried as a candidate.",
        "The difference budget covers the whole candidate (shared or added, never copied per branch) and is compared with maxDifferences using <=.",
        "Shape mismatch (empty on exactly one side) is rejected outright and never counted as a difference.",
        "The budget restarts for every candidate root.",
        "maxDifferences is a real parameter with default 1: 0 means exact match, larger values allow more differences.",
    ),
    tests=TESTS, hints=HINTS, fallback_hints=FALLBACK_HINTS, misconceptions=CARDS, known_bad=KNOWN_BAD,
    rubric=RubricWeights(0.45, 0.15, 0.20, 0.05, 0.15),
    judge_notes=(
        "Two correct designs: a helper that returns a mismatch COUNT (Infinity for shape mismatch) compared once per "
        "candidate, or a helper that THREADS the remaining budget left-then-right and returns -1 on failure. A mutable "
        "shared object ({count: 0}) reset per candidate is also correct. Do not restructure a working solution into the "
        "reference's shape. A helper that copies a running count into both recursive calls (the page's former reference) "
        "is the classic bug: it fails fz-06 and fz-15. Early exit once the count exceeds maxDifferences is an optimisation, "
        "not a requirement."
    ),
    next_challenge_id="mirrorSubtree",
)
