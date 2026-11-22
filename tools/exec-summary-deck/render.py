"""Render a built Page to PDF via reportlab, and to PPTX via python-pptx.

Both backends consume the same primitive list from layouts.Page, so the geometry
is authored once. PDF is the fidelity anchor; PPTX keeps editable text.
"""

from __future__ import annotations

import os

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR
from pptx.util import Emu, Pt
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

import layouts
import theme as T


def _rgb(hexstr: str) -> tuple[float, float, float]:
    h = hexstr.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


# =========================================================================
#  PDF backend
# =========================================================================

def pdf_document(pages: list[layouts.Page], path: str) -> str:
    layouts._ensure_fonts()
    c = canvas.Canvas(path, pagesize=(T.PAGE_W, T.PAGE_H))
    c.setTitle("BudyII executive summary: demo deck proposition alignment")
    c.setAuthor("Budy")
    c.setSubject("How the Sales, Ops and Integrated decks support the BudyII proposition")

    for p in pages:
        c.setFillColorRGB(*_rgb(T.BG))
        c.rect(0, 0, T.PAGE_W, T.PAGE_H, stroke=0, fill=1)

        for op in p.ops:
            kind = op[0]
            if kind == "rect":
                _, x, y, w, h, fill, stroke, sw = op
                if fill:
                    c.setFillColorRGB(*_rgb(fill))
                    c.rect(x, T.PAGE_H - y - h, w, h, stroke=0, fill=1)
                if stroke:
                    c.setStrokeColorRGB(*_rgb(stroke))
                    c.setLineWidth(sw)
                    c.rect(x, T.PAGE_H - y - h, w, h, stroke=1, fill=0)
            elif kind == "line":
                _, x1, y1, x2, y2, color, lw = op
                c.setStrokeColorRGB(*_rgb(color))
                c.setLineWidth(lw)
                c.line(x1, T.PAGE_H - y1, x2, T.PAGE_H - y2)
            elif kind == "text":
                _, x, y, s, font_key, size, color, tracking = op
                c.setFillColorRGB(*_rgb(color))
                font = f"budy-{font_key}"
                if tracking:
                    to = c.beginText()
                    to.setFont(font, size)
                    to.setCharSpace(tracking)
                    to.setTextOrigin(x, T.PAGE_H - y - size * 0.92)
                    to.textOut(s)
                    c.drawText(to)
                else:
                    c.setFont(font, size)
                    c.drawString(x, T.PAGE_H - y - size * 0.92, s)
        c.showPage()

    c.save()
    return path


# =========================================================================
#  PPTX backend
# =========================================================================

def _emu(pt: float) -> Emu:
    return Emu(int(round(pt * 12700)))


def pptx_document(pages: list[layouts.Page], path: str) -> str:
    prs = Presentation()
    prs.slide_width = _emu(T.PAGE_W)
    prs.slide_height = _emu(T.PAGE_H)
    blank = prs.slide_layouts[6]

    for page in pages:
        slide = prs.slides.add_slide(blank)

        bg = slide.background
        bg.fill.solid()
        bg.fill.fore_color.rgb = RGBColor.from_string(T.BG.lstrip("#"))

        for op in page.ops:
            kind = op[0]
            if kind == "rect":
                _, x, y, w, h, fill, stroke, sw = op
                shp = slide.shapes.add_shape(1, _emu(x), _emu(y), _emu(w), _emu(h))
                shp.shadow.inherit = False
                if fill:
                    shp.fill.solid()
                    shp.fill.fore_color.rgb = RGBColor.from_string(fill.lstrip("#"))
                else:
                    shp.fill.background()
                if stroke:
                    shp.line.color.rgb = RGBColor.from_string(stroke.lstrip("#"))
                    shp.line.width = Pt(sw)
                else:
                    shp.line.fill.background()
            elif kind == "line":
                _, x1, y1, x2, y2, color, lw = op
                cxn = slide.shapes.add_connector(1, _emu(x1), _emu(y1), _emu(x2), _emu(y2))
                cxn.line.color.rgb = RGBColor.from_string(color.lstrip("#"))
                cxn.line.width = Pt(lw)
            elif kind == "text":
                _, x, y, s, font_key, size, color, tracking = op
                face, _path = T.FONTS[font_key]
                # generous box; empty autofit, no wrap surprises
                box_w = layouts.width(s, font_key, size, tracking) + 24
                box_h = size * 1.7
                tb = slide.shapes.add_textbox(_emu(x - 4), _emu(y - 2), _emu(box_w), _emu(box_h))
                tf = tb.text_frame
                tf.word_wrap = False
                tf.margin_left = 0
                tf.margin_right = 0
                tf.margin_top = 0
                tf.margin_bottom = 0
                tf.vertical_anchor = MSO_ANCHOR.TOP
                para = tf.paragraphs[0]
                run = para.add_run()
                run.text = s
                f = run.font
                f.name = face
                f.size = Pt(size)
                f.bold = "bold" in font_key
                f.italic = "italic" in font_key
                f.color.rgb = RGBColor.from_string(color.lstrip("#"))
                if tracking:
                    run.font._rPr.set("spc", str(int(tracking * 100)))

    prs.save(path)
    return path


def build_all(pages: list[layouts.Page]) -> tuple[str, str]:
    os.makedirs(T.OUT_DIR, exist_ok=True)
    pdf_path = os.path.join(T.OUT_DIR, f"{T.BASENAME}.pdf")
    pptx_path = os.path.join(T.OUT_DIR, f"{T.BASENAME}.pptx")
    return pdf_document(pages, pdf_path), pptx_document(pages, pptx_path)
