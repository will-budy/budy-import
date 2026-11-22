---
name: BudyII Exec Summary Deck
overview: "Generate a 10-slide executive summary deck (PPTX + PDF) distilling v2/ref/deck-proposition-alignment.md into the visual language of the attached BudyII reference PDFs: dark theme, 1200x675 pt / 16:9, Arial + Verdana, one generated deck per slide from a single Python layout engine."
todos:
  - id: confirm-theme
    content: Confirm the dark vs light theme read and the Arial font choice before building layouts
    status: completed
  - id: scaffold
    content: Scaffold tools/exec-summary-deck/ with theme.py, content.py, layouts.py, build_deck.py
    status: completed
  - id: theme-tokens
    content: Encode measured palette, type scale, grid, and font registration in theme.py
    status: completed
  - id: content-port
    content: Port the ten slide specs from the alignment doc into content.py, including the Appendix A figures and no new numbers
    status: completed
  - id: layouts
    content: Implement layout primitives (header, footer, numbered columns, KPI stack, G/Y/R grid, funnel, risk list) once as geometry specs
    status: completed
  - id: pdf-renderer
    content: Implement the reportlab backend producing budyii-exec-summary.pdf at 1200x675 pt
    status: completed
  - id: pptx-renderer
    content: Implement the python-pptx backend producing budyii-exec-summary.pptx at 16:9 with editable text
    status: completed
  - id: verify
    content: Render PDF pages with pypdfium2, assert dark-theme luminance and modal color, compare against reference pages, introspect pptx slide count and bounds
    status: completed
  - id: docs
    content: Add a short README in tools/exec-summary-deck/ with build command, toolchain pin, and the figure sign-off caveat
    status: completed
isProject: false
---

# BudyII Executive Summary Deck

## Objective

Turn [v2/ref/deck-proposition-alignment.md](v2/ref/deck-proposition-alignment.md) into a 10-slide exec deck for product marketing and demand gen, styled to match the attached BudyII PDFs, delivered as **both** `.pptx` (editable) and `.pdf` (shareable), generated from one Python source so the two never drift.

## Reference styling (measured, not guessed)

Extracted from the attachments:

- **Canvas:** 1200 x 675 pt (16:9), Google Slides origin.
- **Theme: dark.** Correcting an earlier misread: every page of both PDFs composites to a near-black background (per-page mean luminance 13.7–44.9; modal `#0A0A0B`). My first pass mistook a render artifact for a cream/light theme. The plan below uses the measured dark tokens.
- **Palette:**
  - Background `#0A0A0B`
  - Header rule / divider `#292A2D`
  - Raised panel `#111D26`
  - Panel accent `#102A3C`
  - Body text `#F4F1ED` (primary), `#55575B` / `#34444D` (secondary), `#5288A1` (muted blue)
  - Accent cyan `#6DCEF4`, accent blue `#29A9F0` / `#4FA4CA`
  - Teal `#47758A`, deep `#102331`
- **Type scale** (from `Tf` ops): 53.3 / 29.3 / 28 / 26.7 / 25.3 / 24 / 22.7 / 18.7 / 17.3 / 16 / 14.7 / 12. Working set: 32 / 22 / 16 / 12.
- **Fonts:** `ArialMT`, `Arial-BoldMT`, `Verdana`, `Verdana-Bold`. All present at `/System/Library/Fonts/Supplemental/`.
- **Grid:** ~35 pt left margin, content well to ~1165 pt, footer baseline ~656 pt.
- **Recurring furniture:** top-left `BudyII` wordmark, top-right section label (e.g. `01 / MISSION LIFECYCLE`), header rule under the label block, footer page number bottom-right, footnote bottom-left in 12 pt muted.
- **Motifs to reuse:** numbered step columns with hairline verticals, boxed panels with a thin top accent bar, label/value stacks in caps-tracking, black/cyan data bars for G/Y/R style ratings.

## Deliverable structure (10 slides)

Arc per your choice (doc order): 1 exec summary up front, 7 mirroring the document, 2 closing on recommendations and BudyII value translation.

| #   | Slide                                      | Content (from the doc)                                                                                                                                                                                                                                    | Layout motif                                                                                                          |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **Executive summary**                      | The one-question framing, the six-row verdict (strong to partial rankings), the framing line "senior living is where Budy proved the model; BudyII scales it."                                                                                            | Verdict as a label/value table + one pull-quote bar                                                                   |
| 2   | **The evolved proposition in five claims** | Category, buyer, unit of value, delegation discipline, transfer (doc section 3)                                                                                                                                                                           | Five numbered columns with hairlines                                                                                  |
| 3   | **Qualification matrix**                   | Deck x claim grid, scored Supported / Partial / Gap (doc section 5)                                                                                                                                                                                       | Grid with cyan / muted / dark cells, G-Y-R legend                                                                     |
| 4   | **Ops: the operating mission proof**       | The billing loop, $31,019/mo over 31 cases, $39,106 open leak, slide roles                                                                                                                                                                                | Step-column motif + KPI stack                                                                                         |
| 5   | **Sales: the follow-through proof**        | 1,482 → 340 → 94 → 41 → 27 funnel; 2.5%→9.9% click; move-ins not activity                                                                                                                                                                                 | Black/cyan bar funnel                                                                                                 |
| 6   | **Integrated: the breadth proof**          | 12 mission families on one teammate; `listed: false` note; most BudyII-shaped                                                                                                                                                                             | Two-column mission catalogue                                                                                          |
| 7   | **Pillar support for BudyII**              | Delegation value (understanding / ownership / continuity / control), mission lifecycle, three scopes, value ladder, transfer, competitive head-to-heads (doc section 7)                                                                                   | Condensed matrix, grouped                                                                                             |
| 8   | **Pillars Deep Dive**                      | More specific evidence based messaging and tactical activation recommendations by pillar                                                                                                                                                                  | Inuititve organized grouped matrix consistent with design/formatting of trailing slide for easy quick legibility      |
| 9   | **Recommendations**                        | Four-beat reuse arc + change / effort / payoff table; the 3 most concrete connections BudyI (sr living) to BudyII (vertical agnostic)                                                                                                                     | Numbered arc + effort table                                                                                           |
| 10  | **Value and relevancy translation**        | How this converts to product marketing and demand gen: category claim, buyer definition, proof assets, message hierarchy, what to retire (vertical framing, rep-led pilot, SMB/mid/large pricing), and the open decisions needing owners (doc section 10) | Two-column: "leverage this connection / product capability" / "reasons to believe / messaging translation" + ask list |

Each slide carries the reference furniture: `BudyII` top-left, `NN / SECTION` top-right, header rule, footnote, page number.

## Implementation

**Location (as chosen):** repo root, outside `docs_dir` so no binaries enter the MkDocs site.

```
tools/exec-summary-deck/
  build_deck.py          # single entry point; renders both formats
  theme.py               # palette, type scale, grid, font paths
  content.py             # slide content as data (ported from the doc)
  layouts.py             # reusable primitives: header, footer, columns, kpi, grid, funnel
  out/
    budyii-exec-summary.pptx
    budyii-exec-summary.pdf
```

**Why this shape:** content lives in `content.py` as plain data, layouts are pure functions of (slide spec, canvas), and the two renderers consume the same primitives. Editing a number means editing one line.

### Rendering strategy

Two backends consume the same geometry primitives:

- **PDF:** `reportlab` 5.1.0 via `canvas.Canvas(path, pagesize=(1200, 675))`, with `pdfmetrics.registerFont(TTFont(...))` for Arial/Verdana from `/System/Library/Fonts/Supplemental/`. This is the fidelity anchor — exact 1200x675 vector output.
- **PPTX:** `python-pptx` 1.0.2 with `prs.slide_width = Pt(1200)`, `prs.slide_height = Pt(675)`, blank layout, every element placed at absolute EMU coordinates, font names set to `Arial` / `Verdana`.

To keep the two from drifting, `layouts.py` defines each primitive as a spec (rect, text block, rule, dot matrix) and both backends implement `draw_rect` / `draw_text` / `draw_rule` / `draw_bar` against it. Geometry is authored once in points.

**Toolchain (verified available):**

- `/opt/homebrew/bin/python3.13` with a venv at `/tmp/pptx313`
- `python-pptx` 1.0.2, `reportlab` 5.1.0, `pypdfium2`, `pillow` — all installable as wheels; no compiler needed
- Note: the default `python3` is 3.8.13 and `python-pptx` fails to build (`lxml` wheel unavailable). The plan pins 3.13.

### Verification loop

1. Build both files.
2. Render each PDF page with `pypdfium2` at scale 1.4.
3. Assert per-page mean luminance lands in the reference band (13–45) to catch any light-theme regression, and assert modal color is `#0A0A0B`.
4. Visually compare rendered pages against `/tmp/ref_w4.png`-class renders of the source PDFs.
5. For the PPTX, confirm slide count is 10, aspect is 1200x675, and text frames are within margins via `python-pptx` introspection.

## Content sourcing rules

- All figures come from [v2/ref/deck-proposition-alignment.md](v2/ref/deck-proposition-alignment.md) Appendix A, which traces them to `company-presentations_repo-1/v1/src/settings.ts`. No new numbers are introduced.
- Slide 1 must carry the caveat that figures require sign-off from the business owner of the numbers.
- Attributed quotes stay verbatim from the vision docs, which live at [v2/vision/](v2/vision/).

## Follow-on (optional, not in first cut)

- Add a `make deck` style entry or a one-line `README.md` in `tools/exec-summary-deck/`.
- Decide whether the PDF joins `site/` as a downloadable asset (would need to sit under `v2/` or be linked as an external URL).
- If the deck becomes a recurring asset, move `content.py` to a structured source so the doc and the deck share one text.

## Risks

- **Dark theme is a reversal:** if the reference should actually read light in your viewer, the palette in `theme.py` is the single switch point. Worth a 30-second confirm before I commit to 10 slides of dark layouts.
- **Arial vs the brand font:** the reference is plainly Arial, not a brand face. If Budy has a house font, the font map in `theme.py` is the one place to change.
- **PPTX fidelity:** `python-pptx` cannot do text auto-shrink or every PDF effect. I will keep to boxes, rules and text so the PPTX stays editable and visually close; the PDF remains the pixel-accurate artifact.