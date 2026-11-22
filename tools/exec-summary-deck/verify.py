"""Verify the built deck. Run after build_deck.py.

    tools/exec-summary-deck/.venv/bin/python tools/exec-summary-deck/verify.py

Checks, in order:
  1. the PDF has 10 pages at 1200x675 pt
  2. every page is dark-theme (mean luminance in the reference band, modal #0A0A0B)
  3. no drawn rectangle or line falls outside the canvas
  4. no two text runs collide, and no text runs past the right margin
  5. the PPTX has 10 slides at 16:9 with no shape outside the canvas

Exits non-zero on the first failure so it can gate a commit.
"""

from __future__ import annotations

import collections
import statistics
import sys

import pypdfium2 as pypdf
from pptx import Presentation

import content
import layouts
import theme as T

OUT_PDF = f"{T.OUT_DIR}/{T.BASENAME}.pdf"
OUT_PPTX = f"{T.OUT_DIR}/{T.BASENAME}.pptx"

LUM_MIN, LUM_MAX = 12.0, 46.0   # reference PDFs measured 13.7 - 44.9
DARK = "#0A0A0B"

failures: list[str] = []


def check(ok: bool, msg: str) -> None:
    if not ok:
        failures.append(msg)


def check_pdf() -> None:
    pdf = pypdf.PdfDocument(OUT_PDF)
    check(len(pdf) == 10, f"pdf pages: expected 10, got {len(pdf)}")
    for i in range(len(pdf)):
        w, h = pdf[i].get_size()
        check(abs(w - T.PAGE_W) < 0.5 and abs(h - T.PAGE_H) < 0.5,
              f"page {i + 1} size: expected 1200x675, got {w}x{h}")

        rgb = pdf[i].render(scale=1.0).to_pil().convert("RGB")
        mean = statistics.mean(rgb.convert("L").getdata())
        modal = "#%02X%02X%02X" % collections.Counter(rgb.getdata()).most_common(1)[0][0]
        check(LUM_MIN <= mean <= LUM_MAX, f"page {i + 1} luminance {mean:.1f} outside {LUM_MIN}-{LUM_MAX}")
        check(modal == DARK, f"page {i + 1} modal colour {modal}, expected {DARK}")


def check_geometry() -> None:
    for i, spec in enumerate(content.SLIDES):
        page = layouts.build(spec, i + 1, len(content.SLIDES))
        texts = []
        bars = []
        for op in page.ops:
            if op[0] == "rect":
                _, x, y, w, h, fill = op[:6]
                check(x >= -0.5 and y >= -0.5 and x + w <= T.PAGE_W + 0.5 and y + h <= T.PAGE_H + 0.5,
                      f"slide {i + 1} rect outside canvas: {op[:5]}")
                if fill in (T.PANEL_ACCENT, T.PANEL):
                    bars.append((x, y, x + w, y + h))
            elif op[0] == "line":
                _, x1, y1, x2, y2 = op[:5]
                for x, y in ((x1, y1), (x2, y2)):
                    check(-0.5 <= x <= T.PAGE_W + 0.5 and -0.5 <= y <= T.PAGE_H + 0.5,
                          f"slide {i + 1} line endpoint outside canvas: {op[:5]}")
            elif op[0] == "text":
                _, x, y, s, fk, size, _col, tr = op
                w = layouts.width(s, fk, size, tr)
                texts.append((x, y, x + w, y + size * 1.15, s))
                check(x + w <= T.PAGE_W - T.MARGIN_R + 2,
                      f"slide {i + 1} text past right margin: {s[:50]!r}")

        # a text run must not sit on top of a *different* panel's body text
        for a in range(len(texts)):
            for b in range(a + 1, len(texts)):
                A, B = texts[a], texts[b]
                overlap_x = min(A[2], B[2]) - max(A[0], B[0])
                overlap_y = min(A[3], B[3]) - max(A[1], B[1])
                check(not (overlap_x > 3 and overlap_y > 2),
                      f"slide {i + 1} text collision: {A[4][:30]!r} / {B[4][:30]!r}")

        # panels must not swallow label text that starts to their left
        for bx in bars:
            for t in texts:
                if t[0] < bx[0] - 1 and t[2] > bx[0] + 1 and t[1] < bx[3] and t[3] > bx[1]:
                    # only a problem if the text is a label for a bar (same row band)
                    if t[0] >= T.MARGIN_L and t[3] - t[1] < 16:
                        check(False, f"slide {i + 1} label runs under a bar: {t[4][:40]!r}")


def check_pptx() -> None:
    prs = Presentation(OUT_PPTX)
    check(len(prs.slides) == 10, f"pptx slides: expected 10, got {len(prs.slides)}")
    check(abs(prs.slide_width / 12700 - T.PAGE_W) < 1, "pptx width is not 1200 pt")
    check(abs(prs.slide_height / 12700 - T.PAGE_H) < 1, "pptx height is not 675 pt")
    for i, slide in enumerate(prs.slides):
        for shape in slide.shapes:
            l, t = shape.left / 12700, shape.top / 12700
            w, h = shape.width / 12700, shape.height / 12700
            check(l >= -1 and t >= -1 and l + w <= T.PAGE_W + 1 and t + h <= T.PAGE_H + 1,
                  f"pptx slide {i + 1} shape outside canvas")


def main() -> int:
    check_pdf()
    check_geometry()
    check_pptx()
    if failures:
        print(f"{len(failures)} failure(s):")
        for f in failures[:40]:
            print("  -", f)
        return 1
    print("all checks passed: 10 slides, dark theme, no collisions, no overflow")
    return 0


if __name__ == "__main__":
    sys.exit(main())
