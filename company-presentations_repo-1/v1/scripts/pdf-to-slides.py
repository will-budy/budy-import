#!/usr/bin/env python3
"""
Turns a Google Slides PDF into the slide pictures of this project.

Use it when you cannot read the Google deck directly (no Google Slides connector).
The person downloads the deck as a PDF: Google Slides > File > Download > PDF document.

  python3 scripts/pdf-to-slides.py <deck.pdf> <deck path> [--visible N] [--clean] [--out FOLDER]

<deck path> is the deck folder under src/decks, for example events/slif-nov-2026/sales or users/alex/pitch.

What it does:
  1. Finds the live phone slide: the page that has the text "[ iframe embed ]". That slide gets NO picture.
  2. Writes every other page as a PNG, 2000 pixels wide, named by its place in the deck
     (01.png, 02.png, 03.png, then 05.png: the live slide is 04, so there is no 04.png).
  3. Prints a table of every page, so you can compare it with the slides the person sees.
  4. Prints the "slides" list to put in the deck's deck.json (the live slide is { "live": true }).
  5. Lists old pictures that are no longer used. With --clean it deletes them (ask the person first).

Hidden slides: Google may or may not put hidden slides in the PDF. Ask the person how many slides are visible
and pass that number with --visible N. The script then uses only the first N pages. This works because the
hidden slides are old versions at the end of the deck. If a hidden slide sits in the middle, the table shows it:
tell the person and ask which pages are real.

It needs the PyMuPDF package (import name: fitz). If it is missing, the script prints the two commands to install it.
"""
import argparse
import os
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit(
        "PyMuPDF is not installed. Install it in its own folder, then run this script with that Python:\n"
        "  python3 -m venv ~/.cache/budy-pdf && ~/.cache/budy-pdf/bin/pip install pymupdf\n"
        "  ~/.cache/budy-pdf/bin/python scripts/pdf-to-slides.py <deck.pdf> <deck path>"
    )

WIDTH = 2000
HEIGHT = 1125
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def lines_of(page):
    return [line.strip() for line in page.get_text().splitlines() if line.strip()]


def is_live(lines):
    text = " ".join(lines).lower()
    return "iframe embed" in text or ("live demo" in text and "live app" in text)


def main():
    parser = argparse.ArgumentParser(description="Turn a Google Slides PDF into slide pictures.")
    parser.add_argument("pdf")
    parser.add_argument("deck", help="deck folder under src/decks, for example events/slif-nov-2026/sales")
    parser.add_argument("--visible", type=int, help="number of visible slides (use only the first N pages)")
    parser.add_argument("--clean", action="store_true", help="delete old pictures that the new set does not use")
    parser.add_argument("--out", help="folder for the pictures (default: src/decks/<deck>)")
    args = parser.parse_args()

    parts = args.deck.strip("/").split("/")
    if len(parts) != 3 or parts[0] not in ("events", "users"):
        sys.exit("The deck path must look like events/<event>/<deck> or users/<name>/<deck>, for example events/slif-nov-2026/sales.")
    out_dir = args.out or os.path.join(ROOT, "src", "decks", *parts)
    doc = fitz.open(args.pdf)
    total = len(doc)
    if args.visible is not None:
        if args.visible < 1 or args.visible > total:
            sys.exit(f"The PDF has {total} pages. --visible must be between 1 and {total}.")
        count = args.visible
    else:
        count = total
    print(f"The PDF has {total} pages. Using the first {count}.\n")

    pages = [(i + 1, lines_of(doc[i])) for i in range(count)]
    live = [n for n, lines in pages if is_live(lines)]
    if len(live) != 1:
        sys.exit(
            f"I found {len(live)} pages with the text \"[ iframe embed ]\" (pages {live}). I need exactly one: the live phone slide.\n"
            "Look at the table below and tell the person.\n"
            + "\n".join(f"  page {n}: {' | '.join(lines[:2])}" for n, lines in pages)
        )
    live_page = live[0]

    os.makedirs(out_dir, exist_ok=True)
    written = []
    print("Page  Picture   First lines of the page")
    for n, lines in pages:
        head = " | ".join(lines[:2])[:70]
        if n == live_page:
            print(f"{n:>4}  LIVE      {head}  (no picture: the live phone slide)")
            continue
        page = doc[n - 1]
        zoom = WIDTH / page.rect.width
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        if (pix.width, pix.height) != (WIDTH, HEIGHT):
            sys.exit(f"Page {n} came out {pix.width} x {pix.height} pixels. It must be {WIDTH} x {HEIGHT} (a 16:9 slide).")
        name = f"{n:02d}.png"
        pix.save(os.path.join(out_dir, name))
        written.append(name)
        print(f"{n:>4}  {name}    {head}")

    stale = sorted(f for f in os.listdir(out_dir) if f.lower().endswith(".png") and f not in written)
    if stale:
        if args.clean:
            for f in stale:
                os.remove(os.path.join(out_dir, f))
            print(f"\nDeleted old pictures: {', '.join(stale)}")
        else:
            print(f"\nOld pictures not used any more: {', '.join(stale)}. Ask the person, then run again with --clean.")

    print(f"\nPut these entries in the \"slides\" list of src/decks/{args.deck}/deck.json (write a good title for each alt text):")
    for n, lines in pages:
        if n == live_page:
            print('  { "live": true },')
        else:
            alt = (lines[1] if len(lines) > 1 and len(lines[0]) < 40 and lines[0].isupper() else lines[0] if lines else "Slide").replace('"', "'")
            print(f'  {{ "alt": "{alt[:60]}" }},')
    print(f"\nThe live phone slide is slide {live_page}. Then run: npm run check:slides")


if __name__ == "__main__":
    main()
