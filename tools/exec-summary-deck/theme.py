"""Theme tokens for the BudyII executive summary deck.

Every value here was measured from the reference PDFs:

    attachments/.../BudyII-workflows_competition_WO-11.11.26.pdf
    attachments/.../BudyII-strategy_positioning_WO-11.6.26.pdf

The page background was read straight out of a page content stream as
``0.039215688 0.039215688 0.043137256 rg`` -> #0A0A0B, so the deck is a dark
theme. The type scale comes from the ``Tf`` operators in the same streams.

Change the palette here and every slide follows.
"""

from __future__ import annotations

import os

# --- canvas ---------------------------------------------------------------

PAGE_W = 1200.0
PAGE_H = 675.0

MARGIN_L = 35.0
MARGIN_R = 35.0
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

HEADER_Y = 20.0          # baseline of the "BudyII" wordmark and section label
HEADER_RULE_Y = 49.0     # hairline under the header block
BODY_TOP = 78.0          # first safe body baseline
FOOTER_Y = 656.0         # footer rule / footnote baseline

# --- palette (hex, measured) ----------------------------------------------

BG = "#0A0A0B"
RULE = "#292A2D"
RULE_SOFT = "#1B1C1F"
PANEL = "#111D26"
PANEL_ACCENT = "#102A3C"
PANEL_DEEP = "#102331"

TEXT = "#F4F1ED"
TEXT_DIM = "#B9B7B3"
TEXT_MUTED = "#6F7C85"
TEXT_FAINT = "#55575B"

ACCENT = "#6DCEF4"        # cyan, primary accent
ACCENT_BLUE = "#29A9F0"
ACCENT_SOFT = "#4FA4CA"
ACCENT_DEEP = "#47758A"
ACCENT_TEAL = "#2E6F8A"

WARN = "#C98C5A"
BAD = "#8A5A5A"

# rating cells for the qualification matrix
RATING = {
    "supported": {"fill": "#17384A", "bar": ACCENT, "text": TEXT},
    "partial": {"fill": "#1B2A33", "bar": ACCENT_DEEP, "text": TEXT},
    "gap": {"fill": "#151719", "bar": "#3A3E44", "text": TEXT_MUTED},
    "contradicts": {"fill": "#2A1E1E", "bar": BAD, "text": "#C6A9A9"},
}

# --- type scale (measured working set) ------------------------------------

FS_TITLE = 30.0
FS_SECTION = 11.0
FS_LEAD = 18.0
FS_H = 13.0
FS_BODY = 11.5
FS_SMALL = 10.0
FS_TINY = 8.5
FS_KPI = 26.0
FS_NUM = 15.0

TRACK = 1.5  # letter spacing for caps labels

# --- fonts ----------------------------------------------------------------

FONT_DIR = "/System/Library/Fonts/Supplemental"

FONTS = {
    "regular": ("Arial", os.path.join(FONT_DIR, "Arial.ttf")),
    "bold": ("Arial", os.path.join(FONT_DIR, "Arial Bold.ttf")),
    "italic": ("Arial", os.path.join(FONT_DIR, "Arial Italic.ttf")),
    "bolditalic": ("Arial", os.path.join(FONT_DIR, "Arial Bold Italic.ttf")),
    "verdana": ("Verdana", os.path.join(FONT_DIR, "Verdana.ttf")),
    "verdana-bold": ("Verdana", os.path.join(FONT_DIR, "Verdana Bold.ttf")),
}

# --- output ---------------------------------------------------------------

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
BASENAME = "budyii-exec-summary"
