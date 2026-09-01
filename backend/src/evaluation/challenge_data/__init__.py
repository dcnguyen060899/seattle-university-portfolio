"""Challenge content (spec 2.3, 2.4, addendum A1). Importing this package installs the
challenges into ``evaluation.registry`` and runs ``validate_registry()``."""
from __future__ import annotations

from .count_subtrees import CHALLENGE as COUNT_SUBTREES
from .fuzzy_subtree import CHALLENGE as FUZZY_SUBTREE
from .mirror_subtree import CHALLENGE as MIRROR_SUBTREE

CHALLENGES = tuple(sorted((COUNT_SUBTREES, FUZZY_SUBTREE, MIRROR_SUBTREE), key=lambda c: c.order))

from .. import registry as _registry  # noqa: E402

_registry._register(CHALLENGES)

__all__ = ["CHALLENGES", "COUNT_SUBTREES", "FUZZY_SUBTREE", "MIRROR_SUBTREE"]
