# BudyII executive summary deck

A 10-slide executive summary of [v2/ref/deck-proposition-alignment.md](../../v2/ref/deck-proposition-alignment.md),
rendered to both PDF (shareable, pixel-accurate) and PPTX (editable).

## Build

```bash
tools/exec-summary-deck/.venv/bin/python tools/exec-summary-deck/build_deck.py
tools/exec-summary-deck/.venv/bin/python tools/exec-summary-deck/verify.py
```

Output lands in `out/`:

- `budyii-exec-summary.pdf`
- `budyii-exec-summary.pptx`

The `out/` directory is git-ignored. Both files regenerate from source, so never
hand-edit them: change the source and rebuild.

## First-time setup

The system `python3` is 3.8 and `python-pptx` cannot install there (`lxml` has no
wheel). Use Homebrew Python 3.13:

```bash
/opt/homebrew/bin/python3.13 -m venv tools/exec-summary-deck/.venv
tools/exec-summary-deck/.venv/bin/pip install --only-binary=:all: python-pptx reportlab pypdfium2 pillow
```

## Files

| File | Role |
| --- | --- |
| `theme.py` | Palette, type scale, grid, font paths. Measured from the reference PDFs. |
| `content.py` | All slide text as data. Edit here to change what a slide says. |
| `layouts.py` | Geometry primitives and one layout function per slide kind. |
| `render.py` | PDF backend (reportlab) and PPTX backend (python-pptx). |
| `build_deck.py` | Entry point; renders both formats. |
| `verify.py` | Gates: 10 slides, dark theme, no collisions, no overflow. |

## Styling provenance

Tokens were measured from the two reference PDFs in
`~/.cursor/projects/.../attachments/`:

- Page size 1200 x 675 pt (16:9), Google Slides origin.
- Dark theme. The page background reads `0.039 0.039 0.043 rg` in the PDF content
  stream, i.e. `#0A0A0B`. Every page of both files lands in the same band
  (mean luminance 13.7-44.9), which is what `verify.py` asserts.
- Arial and Verdana, loaded from `/System/Library/Fonts/Supplemental`.
- Palette: `#0A0A0B` background, `#111D26` panels, `#F4F1ED` body text,
  `#6DCEF4` accent cyan, `#47758A` muted accent.

## Content rules

- Every figure traces to the alignment doc's Appendix A, which traces to
  `company-presentations_repo-1/v1/src/settings.ts`. Do not add numbers here.
- All figures need sign-off from the business owner of the numbers before
  external use. Slide 1 carries that caveat and it should stay.
- Slide order: 1 executive summary, 7 mirroring the doc, then 2 closing on
  recommendations and BudyII value translation. Ten slides is a hard cap;
  `build_deck.py` refuses to build more.
