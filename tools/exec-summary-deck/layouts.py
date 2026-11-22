"""Layout engine: turns a slide spec into backend-neutral drawing primitives.

Geometry is authored once, in points, in a top-down coordinate space
(0,0 = top-left, y grows downwards, like PowerPoint). Each backend converts to
its own convention. Text is wrapped here using the same font metrics the PDF
backend uses, so the PPTX backend places identical lines.

Primitive shapes
    ("rect",  x, y, w, h, fill, stroke, stroke_w)
    ("line",  x1, y1, x2, y2, color, width)
    ("text",  x, y, text, font_key, size, color, tracking)
Where y for text is the top of the line box.
"""

from __future__ import annotations

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import theme as T

# --- font registration (shared metrics for both backends) ------------------

_registered = False


def _ensure_fonts() -> None:
    global _registered
    if _registered:
        return
    for key, (_name, path) in T.FONTS.items():
        pdfmetrics.registerFont(TTFont(f"budy-{key}", path))
    _registered = True


def width(text: str, font_key: str, size: float, tracking: float = 0.0) -> float:
    _ensure_fonts()
    w = pdfmetrics.stringWidth(text, f"budy-{font_key}", size)
    if tracking:
        w += tracking * max(len(text) - 1, 0)
    return w


def wrap(text: str, font_key: str, size: float, max_w: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if width(trial, font_key, size) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


# --- primitive builders ---------------------------------------------------

class Page:
    """Collects primitives for one slide."""

    def __init__(self, page_no: int, total: int) -> None:
        self.page_no = page_no
        self.total = total
        self.ops: list[tuple] = []

    # shapes ---------------------------------------------------------------
    def rect(self, x, y, w, h, fill=None, stroke=None, stroke_w=0.6):
        self.ops.append(("rect", x, y, w, h, fill, stroke, stroke_w))

    def line(self, x1, y1, x2, y2, color=T.RULE, w=0.6):
        self.ops.append(("line", x1, y1, x2, y2, color, w))

    # text ----------------------------------------------------------------
    def text(self, x, y, s, font_key="regular", size=T.FS_BODY, color=T.TEXT, tracking=0.0):
        self.ops.append(("text", x, y, s, font_key, size, color, tracking))
        return size * 1.28

    def para(self, x, y, s, max_w, font_key="regular", size=T.FS_BODY, color=T.TEXT, leading=1.42):
        for line in wrap(s, font_key, size, max_w):
            self.text(x, y, line, font_key, size, color)
            y += size * leading
        return y

    def caps(self, x, y, s, color=T.ACCENT, size=T.FS_SECTION, tracking=T.TRACK, font_key="bold"):
        self.text(x, y, s.upper(), font_key, size, color, tracking)
        return size

    # composite helpers ---------------------------------------------------
    def rule(self, y, x0=T.MARGIN_L, x1=T.PAGE_W - T.MARGIN_R, color=T.RULE):
        self.line(x0, y, x1, y, color, 0.6)

    def panel(self, x, y, w, h, fill=T.PANEL, accent=None):
        self.rect(x, y, w, h, fill)
        if accent:
            self.rect(x, y, w, 2.0, accent)


# --- page furniture -------------------------------------------------------

def furniture(p: Page, section: str, footnote: str | None = None) -> None:
    p.text(T.MARGIN_L, 12, "BudyII", "verdana-bold", 12.5, T.TEXT)
    label = section
    tw = width(label.upper(), "bold", T.FS_SECTION, T.TRACK)
    p.caps(T.PAGE_W - T.MARGIN_R - tw, 14, label)
    p.rule(T.HEADER_RULE_Y)

    p.rule(T.FOOTER_Y - 12, color=T.RULE_SOFT)
    if footnote:
        p.text(T.MARGIN_L, T.FOOTER_Y, footnote, "regular", T.FS_TINY, T.TEXT_FAINT)
    p.text(T.PAGE_W - T.MARGIN_R - 40, T.FOOTER_Y, f"{p.page_no:02d}", "bold", T.FS_SMALL, T.TEXT_MUTED)


def head(p: Page, title: str, lead: str | None) -> float:
    """Draw the title block. Returns the y where body content may start."""
    y = T.BODY_TOP
    y += p.text(T.MARGIN_L, y, title, "bold", T.FS_TITLE, T.TEXT) + 8
    if lead:
        y = p.para(T.MARGIN_L, y, lead, T.CONTENT_W * 0.78, "regular", T.FS_LEAD, T.TEXT_DIM)
        y += 6
    p.rule(y + 4, color=T.RULE_SOFT)
    return y + 26


# =========================================================================
#  Slide layouts.  Each returns a Page.
# =========================================================================

def verdict(p: Page, s: dict) -> None:
    y = head(p, s["title"], s["lead"])

    label_w = 640.0
    chip_w = 150.0
    row_h = 34.0
    for i, (label, position, rating) in enumerate(s["rows"]):
        ry = y + i * row_h
        style = T.RATING[rating]
        if i % 2 == 0:
            p.rect(T.MARGIN_L, ry, T.CONTENT_W, row_h, "#0D0E10")
        p.text(T.MARGIN_L + 12, ry + 10, label, "regular", T.FS_BODY, T.TEXT)
        # position chip
        cx = T.MARGIN_L + label_w
        p.rect(cx, ry + 8, chip_w, 18, style["fill"])
        p.rect(cx, ry + 8, 2.5, 18, style["bar"])
        p.text(cx + 12, ry + 11.5, position, "bold", T.FS_SMALL, style["text"])

    y += len(s["rows"]) * row_h + 22

    # pull quote
    p.rect(T.MARGIN_L, y, T.CONTENT_W, 62, T.PANEL)
    p.rect(T.MARGIN_L, y, 3.0, 62, T.ACCENT)
    p.caps(T.MARGIN_L + 20, y + 12, "The framing line", T.ACCENT, 9.0)
    p.para(T.MARGIN_L + 20, y + 28, s["quote"], T.CONTENT_W - 44, "italic", 16.5, T.TEXT)


def columns(p: Page, s: dict) -> None:
    y = head(p, s["title"], s["lead"])
    n = len(s["columns"])
    gap = 16.0
    col_w = (T.CONTENT_W - gap * (n - 1)) / n
    for i, (num, label, body) in enumerate(s["columns"]):
        x = T.MARGIN_L + i * (col_w + gap)
        p.rect(x, y, col_w - 6, 236, T.PANEL)
        p.rect(x, y, col_w - 6, 2.0, T.ACCENT if i == 0 else T.ACCENT_DEEP)
        p.text(x + 14, y + 14, num, "bold", 22, T.ACCENT_DEEP)
        p.text(x + 14, y + 46, label, "bold", 14, T.TEXT)
        p.line(x + 14, y + 68, x + col_w - 22, y + 68, T.RULE)
        p.para(x + 14, y + 82, body, col_w - 34, "regular", 10.5, T.TEXT_DIM, 1.5)

    if s.get("test_rows"):
        ty = y + 262
        p.caps(T.MARGIN_L, ty, "how each claim is tested", T.TEXT_MUTED, 9.0)
        ty += 18
        headers = s["test_headers"]
        p.text(T.MARGIN_L, ty, headers[0], "bold", T.FS_SMALL, T.TEXT_MUTED)
        p.text(T.MARGIN_L + 180, ty, headers[1], "bold", T.FS_SMALL, T.TEXT_MUTED)
        p.text(T.MARGIN_L + 760, ty, headers[2], "bold", T.FS_SMALL, T.TEXT_MUTED)
        ty += 17
        p.line(T.MARGIN_L, ty, T.PAGE_W - T.MARGIN_R, ty, T.RULE)
        ty += 7
        for claim, test, result in s["test_rows"]:
            p.text(T.MARGIN_L, ty, claim, "bold", 10, T.TEXT)
            p.text(T.MARGIN_L + 180, ty, test, "regular", 9.5, T.TEXT_DIM)
            p.text(T.MARGIN_L + 760, ty, result, "regular", 9.5, T.ACCENT_SOFT)
            ty += 20


def matrix(p: Page, s: dict) -> None:
    y = head(p, s["title"], s["lead"])
    claim_w = 520.0
    rest = T.CONTENT_W - claim_w
    deck_w = rest / 3

    # header
    p.text(T.MARGIN_L, y, s["col_headers"][0], "bold", T.FS_SMALL, T.TEXT_MUTED)
    for j, name in enumerate(s["col_headers"][1:]):
        cx = T.MARGIN_L + claim_w + j * deck_w
        p.text(cx + 10, y - 3, name, "bold", 13, T.TEXT)
        p.text(cx + 10, y + 14, s["col_sub"][j + 1], "regular", 9, T.TEXT_MUTED)
    y += 34
    p.line(T.MARGIN_L, y, T.PAGE_W - T.MARGIN_R, y, T.RULE)
    y += 6

    row_h = 44.0
    for i, row in enumerate(s["rows"]):
        ry = y + i * row_h
        p.text(T.MARGIN_L, ry + 14, row[0], "regular", 11, T.TEXT)
        for j, rating in enumerate(row[1:]):
            style = T.RATING[rating]
            cx = T.MARGIN_L + claim_w + j * deck_w
            p.rect(cx + 8, ry + 6, deck_w - 22, row_h - 14, style["fill"])
            p.rect(cx + 8, ry + 6, 2.5, row_h - 14, style["bar"])
            p.text(cx + 18, ry + 15, rating.capitalize(), "bold", 9.5, style["text"])
        p.line(T.MARGIN_L, ry + row_h - 4, T.PAGE_W - T.MARGIN_R, ry + row_h - 4, T.RULE_SOFT)

    y += len(s["rows"]) * row_h + 8

    # legend
    lx = T.MARGIN_L
    for key, name in s["legend"]:
        style = T.RATING[key]
        p.rect(lx, y + 2, 10, 10, style["fill"])
        p.rect(lx, y + 2, 2.5, 10, style["bar"])
        p.text(lx + 16, y, name, "regular", 9, T.TEXT_MUTED)
        lx += 16 + width(name, "regular", 9) + 26

    p.para(T.MARGIN_L, y + 26, s["note"], T.CONTENT_W * 0.72, "italic", 10, T.TEXT_MUTED)
    _role_box(p, s.get("role"))


def _role_box(p: Page, role: str | None, y: float | None = None, x: float | None = None,
              w: float = 340.0, h: float = 92.0) -> None:
    if not role:
        return
    x = x if x is not None else T.PAGE_W - T.MARGIN_R - w
    y = y if y is not None else T.FOOTER_Y - 18 - h
    p.rect(x, y, w, h, T.PANEL_ACCENT)
    p.caps(x + 16, y + 11, "Relevance to BudyII", T.ACCENT, 8.5)
    p.para(x + 16, y + 28, role, w - 32, "regular", 9.5, T.TEXT_DIM, 1.45)


def steps(p: Page, s: dict) -> None:
    y = head(p, s["title"], s["lead"])
    n = len(s["steps"])
    gap = 14.0
    col_w = (T.CONTENT_W - gap * (n - 1)) / n
    for i, (num, label, body) in enumerate(s["steps"]):
        x = T.MARGIN_L + i * (col_w + gap)
        p.text(x, y, num, "bold", 15, T.ACCENT)
        p.text(x, y + 24, label, "bold", 12.5, T.TEXT)
        p.para(x, y + 44, body, col_w - 12, "regular", 9.5, T.TEXT_MUTED, 1.45)
        if i < n - 1:
            p.line(x + col_w - gap / 2, y, x + col_w - gap / 2, y + 84, T.RULE)

    y += 104
    p.caps(T.MARGIN_L, y, "measured results", T.ACCENT, 9.0)
    y += 18
    kw = (T.CONTENT_W - 3 * 12) / 4
    for i, (big, what, detail) in enumerate(s["kpis"]):
        x = T.MARGIN_L + i * (kw + 12)
        p.rect(x, y, kw, 86, T.PANEL)
        p.rect(x, y, kw, 2.0, T.ACCENT if i < 3 else T.ACCENT_DEEP)
        p.text(x + 14, y + 12, big, "bold", T.FS_KPI, T.TEXT)
        p.text(x + 14, y + 46, what, "regular", 9, T.TEXT_DIM)
        p.text(x + 14, y + 60, detail, "regular", 8.5, T.TEXT_MUTED)

    y += 100
    p.text(T.MARGIN_L, y, s["caption"], "italic", 10, T.TEXT_MUTED)
    _role_box(p, s.get("role"))


def funnel(p: Page, s: dict) -> None:
    y = head(p, s["title"], s["lead"])
    left_w = T.CONTENT_W * 0.62

    right_x = T.MARGIN_L + left_w + 36
    right_w = T.PAGE_W - T.MARGIN_R - right_x

    label_w = 122.0
    bx = T.MARGIN_L + label_w
    # bars must never reach under the right-hand column
    bar_max = right_x - bx - 20

    max_v = float(s["funnel"][0][1].replace(",", ""))
    bar_h = 30.0
    gap = 9.0
    for i, (label, value) in enumerate(s["funnel"]):
        v = float(value.replace(",", ""))
        w = max(min(bar_max * (v / max_v), bar_max), 78.0)
        by = y + i * (bar_h + gap)
        p.caps(T.MARGIN_L, by + 9, label, T.TEXT_MUTED, 8.5)
        p.rect(bx, by, w, bar_h, T.PANEL_ACCENT)
        p.rect(bx, by, 2.5, bar_h, T.ACCENT if i == len(s["funnel"]) - 1 else T.ACCENT_DEEP)
        p.text(bx + 14, by + 6, value, "bold", 15, T.TEXT)

    ry = y
    p.caps(right_x, ry, "marketing lift", T.ACCENT, 9.0)
    ry += 20
    for label, before, after, mult in s["lift"]:
        p.rect(right_x, ry, right_w, 54, T.PANEL)
        p.text(right_x + 14, ry + 9, label, "bold", 10.5, T.TEXT)
        p.text(right_x + 14, ry + 27, f"{before}  to  {after}", "regular", 11, T.TEXT_DIM)
        p.text(right_x + right_w - 58, ry + 14, mult, "bold", 20, T.ACCENT)
        ry += 62

    ry += 6
    for big, what in s["aside"]:
        p.text(right_x, ry, big, "bold", 17, T.TEXT)
        p.para(right_x + 58, ry + 3, what, right_w - 62, "regular", 9.5, T.TEXT_MUTED)
        ry += 44

    # role box below the funnel, full width, clear of both columns
    role_y = y + len(s["funnel"]) * (bar_h + gap) + 14
    _role_box(p, s.get("role"), y=role_y, x=T.MARGIN_L, w=T.CONTENT_W, h=78)


def catalogue(p: Page, s: dict) -> None:
    y = head(p, s["title"], s["lead"])
    left_w = T.CONTENT_W * 0.68
    half = (left_w - 24) / 2
    groups = s["groups"]
    for i, (name, items) in enumerate(groups):
        col = i % 2
        row = i // 2
        gx = T.MARGIN_L + col * (half + 24)
        gy = y + row * 92
        p.text(gx, gy, name, "bold", 11, T.ACCENT_SOFT)
        p.line(gx, gy + 17, gx + half - 8, gy + 17, T.RULE_SOFT)
        iy = gy + 25
        for item in items:
            p.rect(gx, iy + 4, 3, 3, T.ACCENT_DEEP)
            p.text(gx + 11, iy, item, "regular", 9.5, T.TEXT_DIM)
            iy += 16

    ax = T.MARGIN_L + left_w + 24
    aw = T.PAGE_W - T.MARGIN_R - ax
    for i, (big, what) in enumerate(s["aside"]):
        ay = y + i * 74
        p.rect(ax, ay, aw, 62, T.PANEL)
        p.rect(ax, ay, aw, 2.0, T.ACCENT if i == 0 else T.ACCENT_DEEP)
        p.text(ax + 14, ay + 12, big, "bold", 18, T.TEXT)
        p.para(ax + 14, ay + 38, what, aw - 28, "regular", 9, T.MUTED if False else T.TEXT_MUTED)

    p.para(T.MARGIN_L, y + 3 * 92 + 4, s["note"], left_w * 0.92, "italic", 10, T.TEXT_MUTED)

    if s.get("behaviours"):
        by = y + 296
        p.caps(T.MARGIN_L, by, s["behaviours_title"], T.TEXT_MUTED, 9.0)
        by += 20
        bw = (left_w - 16) / 2
        for i, (label, example) in enumerate(s["behaviours"]):
            bx = T.MARGIN_L + (i % 2) * (bw + 16)
            ry = by + (i // 2) * 34
            p.rect(bx, ry, bw, 28, "#0D0E10")
            p.rect(bx, ry, 2.5, 28, T.ACCENT_DEEP)
            p.text(bx + 12, ry + 5, label, "bold", 9.5, T.TEXT)
            p.text(bx + 12, ry + 17, example, "regular", 8.5, T.TEXT_MUTED)


def _table(p: Page, s: dict, row_h: float, body_size: float, head_y: float) -> float:
    cols = s["col_w"]
    xs, acc = [], T.MARGIN_L
    for frac in cols:
        xs.append(acc)
        acc += T.CONTENT_W * frac
    for header, x, frac in zip(s["col_headers"], xs, cols):
        p.text(x, head_y, header, "bold", T.FS_SMALL, T.TEXT_MUTED)
        del frac
    y = head_y + 20
    p.line(T.MARGIN_L, y, T.PAGE_W - T.MARGIN_R, y, T.RULE)
    y += 6
    for i, row in enumerate(s["rows"]):
        if i % 2 == 0:
            p.rect(T.MARGIN_L, y - 6, T.CONTENT_W, row_h, "#0D0E10")
        cells = list(row)
        for j, cell in enumerate(cells):
            x = xs[j]
            w = T.CONTENT_W * cols[j] - 14
            is_last = j == len(cells) - 1
            if is_last and cell.lower() in ("strong", "partial", "gap", "weak"):
                style = {"strong": T.ACCENT, "partial": T.ACCENT_DEEP, "gap": T.TEXT_MUTED,
                         "weak": T.BAD}[cell.lower()]
                p.rect(x, y + 2, 8, 8, style)
                p.text(x + 14, y, cell, "bold", body_size - 0.5, style)
            elif j == 0:
                p.para(x, y, cell, w, "bold", body_size, T.TEXT, 1.35)
            else:
                p.para(x, y, cell, w, "regular", body_size - 0.8, T.TEXT_DIM, 1.35)
        y += row_h
        p.line(T.MARGIN_L, y - 6, T.PAGE_W - T.MARGIN_R, y - 6, T.RULE_SOFT)
    return y


def pillars(p: Page, s: dict) -> None:
    y = head(p, s["title"], s["lead"])
    _table(p, s, row_h=58.0, body_size=10.0, head_y=y)


def pillars_deep(p: Page, s: dict) -> None:
    y = head(p, s["title"], s["lead"])
    _table(p, s, row_h=64.0, body_size=9.5, head_y=y)


def connections(p: Page, s: dict) -> None:
    y = head(p, s["title"], s["lead"])
    card_h = 74.0
    for i, (num, title, evidence, becomes) in enumerate(s["connections"]):
        cy = y + i * (card_h + 10)
        p.rect(T.MARGIN_L, cy, T.CONTENT_W, card_h, T.PANEL)
        p.rect(T.MARGIN_L, cy, 3.0, card_h, T.ACCENT)
        p.text(T.MARGIN_L + 18, cy + 14, num, "bold", 17, T.ACCENT)
        p.text(T.MARGIN_L + 52, cy + 13, title, "bold", 13, T.TEXT)
        p.para(T.MARGIN_L + 52, cy + 33, evidence, T.CONTENT_W - 80, "regular", 9.5, T.TEXT_DIM, 1.35)
        bw = width(becomes, "italic", 9.5)
        p.text(T.MARGIN_L + T.CONTENT_W - bw - 18, cy + 33, becomes, "italic", 9.5, T.ACCENT_SOFT)

    y += 3 * (card_h + 10) + 10
    cols = [0.52, 0.12, 0.36]
    xs, acc = [], T.MARGIN_L
    for frac in cols:
        xs.append(acc)
        acc += T.CONTENT_W * frac
    for header, x in zip(s["effort_headers"], xs):
        p.text(x, y, header, "bold", T.FS_SMALL, T.TEXT_MUTED)
    y += 18
    p.line(T.MARGIN_L, y, T.PAGE_W - T.MARGIN_R, y, T.RULE)
    y += 6
    for change, effort, payoff in s["effort"]:
        p.text(xs[0], y, change, "regular", 9.5, T.TEXT)
        eff_color = T.ACCENT if effort == "Low" else T.ACCENT_DEEP
        p.text(xs[1], y, effort, "bold", 9.5, eff_color)
        p.text(xs[2], y, payoff, "regular", 9.5, T.TEXT_MUTED)
        y += 19


def translation(p: Page, s: dict) -> None:
    y = head(p, s["title"], s["lead"])
    gap = 28.0
    col_w = (T.CONTENT_W - gap) / 2

    def block(x, title, items, accent):
        p.caps(x, y, title, accent, 9.5)
        p.line(x, y + 17, x + col_w - 6, y + 17, T.RULE)
        iy = y + 28
        for label, body in items:
            p.text(x, iy, label, "bold", 10.5, T.TEXT)
            iy += 15
            iy = p.para(x, iy, body, col_w - 12, "regular", 9.5, T.TEXT_DIM, 1.4) + 9
        return iy

    left_end = block(T.MARGIN_L, s["left_title"], s["left"], T.ACCENT)
    right_end = block(T.MARGIN_L + col_w + gap, s["right_title"], s["right"], T.ACCENT_DEEP)

    base = max(left_end, right_end) + 10
    p.caps(T.MARGIN_L, base, s.get("flow_title", ""), T.TEXT_MUTED, 9.0)
    fy = base + 20
    flow = s.get("flow", [])
    if flow:
        hw = (T.CONTENT_W - 18 * (len(flow) - 1)) / len(flow)
        for i, (stage, message) in enumerate(flow):
            fx = T.MARGIN_L + i * (hw + 18)
            p.rect(fx, fy, hw, 52, T.PANEL)
            p.rect(fx, fy, hw, 2.0, T.ACCENT if i == 0 else T.ACCENT_DEEP)
            p.caps(fx + 12, fy + 9, stage, T.ACCENT_SOFT, 8.0)
            p.para(fx + 12, fy + 24, message, hw - 24, "regular", 9, T.TEXT_DIM, 1.35)
            if i < len(flow) - 1:
                p.text(fx + hw + 3, fy + 20, ">", "bold", 11, T.ACCENT_DEEP)
        fy += 62

    ay = fy + 4
    p.rect(T.MARGIN_L, ay, T.CONTENT_W, T.FOOTER_Y - 26 - ay, T.PANEL)
    p.rect(T.MARGIN_L, ay, T.CONTENT_W, 2.0, T.ACCENT)
    p.caps(T.MARGIN_L + 18, ay + 12, s["asks_title"], T.ACCENT, 9.5)
    ax2 = T.MARGIN_L + 18
    aw = (T.CONTENT_W - 60) / 2
    for i, ask in enumerate(s["asks"]):
        cx = ax2 + (i % 2) * (aw + 12)
        cy = ay + 34 + (i // 2) * 30
        p.rect(cx, cy + 3, 4, 4, T.ACCENT_DEEP)
        p.para(cx + 12, cy - 1, ask, aw - 16, "regular", 9.5, T.TEXT_DIM, 1.35)


LAYOUTS = {
    "verdict": verdict,
    "columns": columns,
    "matrix": matrix,
    "steps": steps,
    "funnel": funnel,
    "catalogue": catalogue,
    "pillars": pillars,
    "pillars_deep": pillars_deep,
    "connections": connections,
    "translation": translation,
}


def build(slide: dict, page_no: int, total: int) -> Page:
    p = Page(page_no, total)
    furniture(p, slide["section"], slide.get("footnote"))
    LAYOUTS[slide["kind"]](p, slide)
    return p
