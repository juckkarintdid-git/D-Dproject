"""Extract SRD PDF pages as text, left column then right column.
Lines set in the 12pt heading font are prefixed with '### ' (spell/feature names).
Usage: python3 -I tools/extract_columns.py SRD.pdf FIRST LAST OUT.txt"""
import sys, pdfplumber
ITALIC_SHIFT = float(sys.argv[5]) if len(sys.argv) > 5 else 21.7
pdf, a, b, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]

def is_head(w):
    return w["size"] >= 11.9 and "SemiBold" in w["fontname"]

def lines_of(words):
    words = sorted(words, key=lambda w: (w["bottom"], w["x0"]))
    rows, cur = [], []
    for w in words:
        if cur and abs(w["bottom"] - cur[0]["bottom"]) > 2:
            rows.append(cur); cur = []
        cur.append(w)
    if cur:
        rows.append(cur)
    res = []
    for ws in rows:
        ws = sorted(ws, key=lambda w: w["x0"])
        hs = [w for w in ws if is_head(w)]
        bs = [w for w in ws if not is_head(w)]
        if hs:
            res.append("### " + " ".join(w["text"] for w in hs))
        if bs:
            res.append(" ".join(w["text"] for w in bs))
    return res

with pdfplumber.open(pdf) as doc, open(out, "w", encoding="utf-8") as f:
    for n in range(a, b + 1):
        p = doc.pages[n - 1]
        w, h = p.width, p.height
        words = p.extract_words(extra_attrs=["size", "fontname"], keep_blank_chars=False)
        # this PDF reports inline Cambria italic glyphs ~21.7pt too high; such words
        # collide with a regular line, so shift only the colliding ones
        ital = [x for x in words if "Cambria" in x["fontname"] and "Italic" in x["fontname"]]
        reg = [x for x in words if x not in ital]
        for x in ital:
            if any(abs(r["top"] - x["top"]) < 3 and r["x0"] < x["x1"] and r["x1"] > x["x0"] for r in reg):
                x["top"] += ITALIC_SHIFT; x["bottom"] += ITALIC_SHIFT
        words = [x for x in words if x["top"] < 740]  # drop footer (page number, title at ~747)
        left = [x for x in words if x["x0"] < w / 2 - 5]
        right = [x for x in words if x["x0"] >= w / 2 - 5]
        for col in (left, right):
            f.write("\n".join(lines_of(col)) + "\n")
