#!/usr/bin/env python3
"""Export the challenge registry to docs/data (spec 2.7).

usage: export_challenges.py [--out-dir docs/data] [--check] [--stdout [--include-private]]

  (default)                 write docs/data/challenges.json and docs/data/challenge_solutions.json
  --check                   exit 1 when a committed file differs from what would be written (Render build, CI)
  --stdout                  print the public export instead of writing files
  --stdout --include-private
                            print {"challenges": [private_view(c) ...]} for backend/scripts/verify_challenges.mjs;
                            never written to disk

Importing evaluation.registry runs validate_registry(); an inconsistent registry fails the export.
"""
from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "backend" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from evaluation import registry  # noqa: E402  (import validates the registry)

DEFAULT_OUT_DIR = ROOT / "docs" / "data"
FILES = (
    ("challenges.json", registry.export_public),
    ("challenge_solutions.json", registry.export_solutions),
)


def serialize(obj) -> str:
    """Canonical on-disk form: sorted keys, indent 1, UTF-8, trailing newline, no timestamps."""
    return json.dumps(obj, sort_keys=True, indent=1, ensure_ascii=False) + "\n"


def private_export() -> dict:
    return {"registry_hash": registry.registry_hash(), "harness_version": registry.HARNESS_VERSION,
            "challenges": [registry.private_view(c) for c in registry.CHALLENGES]}


def check(out_dir: Path) -> int:
    problems = []
    for name, fn in FILES:
        path = out_dir / name
        want = serialize(fn())
        if not path.exists():
            problems.append(f"{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path} is missing")
            continue
        have = path.read_text(encoding="utf-8")
        if have != want:
            changed = sum(1 for line in difflib.unified_diff(have.splitlines(), want.splitlines(), lineterm="", n=0)
                          if (line.startswith("+") or line.startswith("-")) and not line.startswith(("+++", "---")))
            problems.append(f"{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path} differs ({changed} changed lines)")
    if problems:
        print("; ".join(problems) + " -- run `python backend/scripts/export_challenges.py`", file=sys.stderr)
        return 1
    print(f"docs/data is up to date (registry_hash {registry.registry_hash()})")
    return 0


def write(out_dir: Path) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, fn in FILES:
        path = out_dir / name
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(serialize(fn()))
        print(f"wrote {path}")
    print(f"registry_hash {registry.registry_hash()}; challenges: "
          + ", ".join(f"{c.id} ({len(c.tests)} tests, tests_hash {registry.tests_hash(c)})" for c in registry.CHALLENGES))
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Export the challenge registry to docs/data.")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="target directory (default: docs/data)")
    parser.add_argument("--check", action="store_true", help="exit 1 when the committed files are stale")
    parser.add_argument("--stdout", action="store_true", help="print the export instead of writing files")
    parser.add_argument("--include-private", action="store_true",
                        help="with --stdout: print the private view (references, known-bad, judge notes)")
    args = parser.parse_args(argv)

    if args.include_private and not args.stdout:
        parser.error("--include-private requires --stdout (private content is never written to disk)")
    if args.stdout:
        payload = private_export() if args.include_private else registry.export_public()
        sys.stdout.write(serialize(payload))
        sys.stdout.flush()
        return 0
    out_dir = Path(args.out_dir)
    if not out_dir.is_absolute():
        out_dir = (Path.cwd() / out_dir).resolve()
    if args.check:
        return check(out_dir)
    return write(out_dir)


if __name__ == "__main__":
    sys.exit(main())
