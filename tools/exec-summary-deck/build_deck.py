#!/usr/bin/env python3
"""Build the BudyII executive summary deck as PDF and PPTX.

    tools/exec-summary-deck/.venv/bin/python tools/exec-summary-deck/build_deck.py

Content lives in content.py; styling in theme.py; geometry in layouts.py.
"""

from __future__ import annotations

import sys

import content
import layouts
import render


def main(argv: list[str]) -> int:
    only = argv[1] if len(argv) > 1 else "both"
    total = len(content.SLIDES)
    if total > 10:
        print(f"refusing to build: {total} slides exceeds the 10-slide limit", file=sys.stderr)
        return 2

    pages = [layouts.build(s, i + 1, total) for i, s in enumerate(content.SLIDES)]
    os_paths = render.build_all(pages)
    for p in os_paths:
        print(p)
    print(f"{total} slides")
    return 0 if only else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
