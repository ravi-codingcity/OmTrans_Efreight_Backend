#!/usr/bin/env python3
"""
High-fidelity HBL / MBL PDF generator.

Instead of converting a DOCX (which needs MS Word / LibreOffice and never matches
exactly), this overlays the populated shipment values directly onto the ORIGINAL
template PDF (HBL/MBL Format Sample.pdf). Every border, table line, font, margin
and the header/footer come from the real template untouched — only the data text
is drawn on top. The result is pixel-faithful to the provided sample.

Usage:
    python pdfOverlay.py <template.pdf> <output.pdf>
JSON payload (flat, already field-mapped by Node) is read from STDIN.

Requires: PyMuPDF (pip install PyMuPDF)
"""
import sys
import json
import fitz  # PyMuPDF

HELV = "helv"
BLACK = (0, 0, 0)
_FONT = fitz.Font(HELV)

# Field value rectangles (x0, y0, x1, y1) in PDF points, top-left origin.
# Derived from the actual template grid lines. HBL has a Booking box; MBL does
# not, so its number cell is taller.
COMMON = {
    "date":             (467, 39.5, 588, 51),
    "shipper":          (10, 103, 331, 166),
    "consignee":        (10, 180, 331, 237),
    "notify":           (338, 180, 587, 237),
    "placeOfReceipt":   (10, 252.5, 176, 265),
    "preCarriage":      (181, 253, 332, 265),
    "finalDestination": (338, 254, 587, 318),
    "vessel":           (10, 280.5, 176, 292),
    "pol":              (181, 280, 332, 292),
    "pod":              (10, 306.5, 176, 319),
    "placeOfDelivery":  (181, 307, 332, 319),
}
REGIONS = {
    "hbl": dict(COMMON, **{
        "number":  (338, 101, 587, 131),
        "booking": (338, 147, 587, 167),
    }),
    "mbl": dict(COMMON, **{
        "number":  (338, 101, 587, 166),
    }),
}

# Cargo table geometry (shared by HBL & MBL).
COL = {
    "seal": (8, 92),
    "qty":  (96, 176),
    "desc": (179, 420),
    "gwt":  (424, 498),
    "cbm":  (501, 586),
}
BODY_TOP = 347.0
BODY_BOTTOM = 425.0


def wrap_lines(text, width, size):
    """Greedy word-wrap a (possibly multi-line) string to the given width."""
    out = []
    for para in str(text).split("\n"):
        if para == "":
            out.append("")
            continue
        cur = ""
        for word in para.split(" "):
            trial = (cur + " " + word).strip()
            if not cur or _FONT.text_length(trial, size) <= width:
                cur = trial
            else:
                out.append(cur)
                cur = word
        out.append(cur)
    return out


def fit_size(text, rect, max_size, min_size):
    """Largest font size (max..min) at which `text` fits inside `rect`."""
    w = rect[2] - rect[0]
    h = rect[3] - rect[1]
    size = max_size
    while size > min_size:
        lines = wrap_lines(text, w, size)
        if len(lines) * size * 1.18 <= h:
            return size
        size -= 0.5
    return min_size


def draw(page, rect, text, max_size=8.5, min_size=6.0, align=0, leading=1.18):
    """Draw wrapped text into rect, auto-shrinking to fit. Top-aligned."""
    if text is None or str(text).strip() == "":
        return
    text = str(text)
    r = fitz.Rect(rect)
    size = fit_size(text, rect, max_size, min_size)
    lines = wrap_lines(text, r.width, size)
    y = r.y0 + size  # baseline of first line
    for ln in lines:
        if y > r.y1 + 1:
            break
        if ln != "":
            page.insert_text((r.x0, y), ln, fontsize=size, fontname=HELV, color=BLACK)
        y += size * leading


def draw_table(page, containers, totals, marks):
    """Lay out container rows + totals inside the cargo table body."""
    rows = containers if containers else [{}]
    n = len(rows) + (1 if totals else 0)
    avail = BODY_BOTTOM - BODY_TOP
    row_h = max(14.0, min(24.0, avail / max(n, 1)))

    for i, c in enumerate(rows):
        y0 = BODY_TOP + i * row_h
        y1 = y0 + row_h
        draw(page, (COL["seal"][0], y0, COL["seal"][1], y1), c.get("seal", ""), 8, 6)
        qty = c.get("qty", "")
        if i == 0 and marks:
            qty = (str(qty) + "\n" + str(marks)).strip("\n")
        draw(page, (COL["qty"][0], y0, COL["qty"][1], y1), qty, 8, 6)
        draw(page, (COL["gwt"][0], y0, COL["gwt"][1], y1), c.get("gwt", ""), 8, 6)
        draw(page, (COL["cbm"][0], y0, COL["cbm"][1], y1), c.get("cbm", ""), 8, 6)

    if totals:
        ty0 = BODY_BOTTOM - row_h
        if totals.get("qty"):
            draw(page, (COL["qty"][0], ty0, COL["qty"][1], BODY_BOTTOM),
                 "Total Quantity (PKG): %s" % totals["qty"], 8, 6)
        if totals.get("gwt"):
            draw(page, (COL["gwt"][0], ty0, COL["gwt"][1], BODY_BOTTOM),
                 "Gross Weight (G. WT): %s" % totals["gwt"], 8, 6)


def main():
    template_path, out_path = sys.argv[1], sys.argv[2]
    payload = json.load(sys.stdin)
    template = payload.get("template", "hbl")
    fields = payload.get("fields", {})
    regions = REGIONS.get(template, REGIONS["hbl"])

    doc = fitz.open(template_path)
    page = doc[0]

    # Header/box fields.
    for key, rect in regions.items():
        val = fields.get(key, "")
        # Address-style boxes can hold more text — allow a slightly larger start.
        max_size = 9 if key in ("number",) else 8.5
        draw(page, rect, val, max_size=max_size, min_size=6.0)

    # Description column (multi-line, spans the body height).
    draw(page, (COL["desc"][0], BODY_TOP, COL["desc"][1], BODY_BOTTOM),
         fields.get("description", ""), 8.5, 6.0)

    # Cargo rows + totals.
    draw_table(page, payload.get("containers", []), payload.get("totals"), fields.get("marks", ""))

    doc.save(out_path, garbage=4, deflate=True)
    doc.close()
    print("OK")


if __name__ == "__main__":
    main()
