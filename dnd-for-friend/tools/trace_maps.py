# Grids traced over the real map art in app/assets/map-<id>.webp (from the free "3k maps" bundle).
# Each map: floor spans per row (everything else is wall '#'), then point overrides.
# Run: python3 tools/trace_maps.py  -> rewrites rows + bg in data/campaign.json
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent

def build(w, h, spans, pts, fill=None):
    g = [["#"] * w for _ in range(h)]
    for y, rs in spans.items():
        for a, b in rs:
            for x in range(a, b + 1): g[y][x] = "."
    for (x, y), ch in (fill or {}).items(): g[y][x] = ch
    for ch, cells in pts.items():
        for x, y in cells:
            assert ch == "D" or g[y][x] != "#", (ch, x, y)
            g[y][x] = ch
    return ["".join(r) for r in g]

def area(x0, y0, x1, y1, ch):
    return {(x, y): ch for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}

MAPS = {}
# Thornback Hollow: one big cave, wolves near the mouth, goblins on the fur beds, chief in the east alcove.
MAPS["hollow"] = build(26, 16, {
    1: [(10, 15)], 2: [(9, 16), (17, 19)], 3: [(8, 20)], 4: [(8, 20)], 5: [(8, 21)], 6: [(8, 21)],
    7: [(7, 21)], 8: [(7, 23)], 9: [(7, 24)], 10: [(6, 24)], 11: [(6, 24)], 12: [(6, 23)],
    13: [(7, 11), (15, 22)], 14: [(7, 10)],
}, {
    "S": [(8, 13)], "a": [(13, 8), (12, 9)], "b": [(10, 2), (12, 2), (11, 3)], "c": [(16, 3), (17, 3), (18, 4)],
    "B": [(22, 10)], "e": [(21, 9), (23, 9), (21, 11), (22, 12)], "C": [(9, 6), (24, 10)], "?": [(15, 12)],
}, {**area(10, 6, 11, 7, ","), **area(17, 2, 19, 3, ",")})
# Gravewatch Crypt (art rotated): apse on the west, long hall with stairs, side vaults north/south, burning altars east.
MAPS["crypt"] = build(26, 16, {
    1: [(3, 7), (9, 15), (21, 24)], 2: [(3, 7), (9, 15), (17, 19), (21, 24)], 3: [(3, 7), (9, 15), (17, 19), (21, 24)],
    4: [(3, 6), (10, 25)], 5: [(3, 6), (10, 25)], 6: [(0, 25)], 7: [(0, 25)], 8: [(0, 25)], 9: [(0, 25)],
    10: [(3, 6), (10, 25)], 11: [(3, 6), (10, 25)], 12: [(3, 8), (9, 15), (17, 20), (22, 24)],
    13: [(3, 8), (9, 15), (17, 20), (22, 24)], 14: [(3, 8), (9, 15), (22, 24)],
}, {
    "S": [(1, 7)], "D": [(8, 3), (16, 3)], "a": [(10, 2), (12, 2), (11, 3)], "b": [(18, 2), (18, 3)],
    "c": [(11, 12), (13, 12), (12, 13)], "B": [(24, 8)], "e": [(23, 6), (22, 7), (22, 9), (23, 10)],
    "C": [(23, 1), (23, 14)], "?": [(4, 2), (15, 8)],
}, {**area(6, 6, 10, 9, ","), **area(20, 6, 22, 9, ",")})
# Redcliff Tower: ruined keep. Enter from the south gap, bandits in the courtyard, captain in the north gatehouse.
MAPS["tower"] = build(26, 16, {
    0: [(0, 2), (23, 25)], 1: [(0, 1), (24, 25)], 2: [(0, 1), (6, 9), (12, 13), (15, 19), (24, 25)],
    3: [(0, 2), (6, 19), (23, 25)], 4: [(0, 2), (5, 19), (23, 25)], 5: [(0, 2), (5, 20), (23, 25)],
    6: [(0, 2), (5, 20), (23, 25)], 7: [(0, 2), (5, 20), (23, 25)], 8: [(0, 2), (5, 20), (23, 25)],
    9: [(0, 2), (5, 20), (23, 25)], 10: [(0, 1), (5, 19), (24, 25)], 11: [(0, 1), (5, 19), (25, 25)],
    12: [(0, 1), (11, 12), (25, 25)], 13: [(0, 1), (12, 13), (25, 25)], 14: [(0, 25)], 15: [(0, 25)],
}, {
    "S": [(12, 15)], "a": [(8, 9), (10, 10), (16, 9), (17, 10)], "b": [(6, 4), (18, 4)], "c": [(9, 6), (15, 6), (12, 7)],
    "B": [(12, 3)], "e": [(9, 3), (15, 3), (10, 4), (14, 4)], "C": [(7, 2), (18, 2)], "?": [(1, 7)],
}, {**area(11, 8, 18, 11, ","), **area(18, 8, 19, 9, "T")})
# Ashen Spire lower halls: cracked volcanic ground; lava rifts block, the ritual circle (top left) leads up.
MAPS["spire"] = build(26, 16, {y: [(0, 25)] for y in range(16)}, {
    "S": [(3, 14)], "a": [(5, 10), (7, 11), (4, 12), (8, 9)], "b": [(18, 13), (20, 12), (21, 14)],
    "c": [(19, 3), (21, 4), (22, 2)], "d": [(14, 6)], "C": [(23, 13), (11, 5)], "?": [(1, 9)], "E": [(7, 1)],
}, {
    **area(0, 0, 0, 7, "#"), **area(0, 12, 0, 15, "#"), **area(1, 0, 3, 1, "#"),
    **area(7, 3, 9, 5, "#"), **area(10, 3, 14, 3, "#"), **area(4, 5, 6, 6, "#"),
    **area(11, 7, 12, 9, "#"), **area(9, 8, 10, 10, "#"), **area(12, 10, 15, 11, "#"),
    **area(17, 6, 18, 9, "#"), **area(19, 7, 20, 8, "#"), **area(16, 13, 17, 14, "#"),
    **area(10, 11, 11, 12, "~"), **area(12, 12, 13, 15, "~"), **area(14, 13, 15, 13, "~"),
    **area(6, 9, 6, 10, "~"), **area(14, 4, 16, 4, "~"), **area(17, 2, 17, 5, "~"),
})
# Ashen Spire summit: the lava caldera. Rim is solid ground, the molten basin is slow going.
MAPS["summit"] = build(24, 12, {y: [(0, 23)] for y in range(12)}, {
    "S": [(2, 9)], "B": [(13, 6)], "e": [(9, 5), (17, 5), (11, 8), (16, 8)],
}, {
    **{(x, y): "~" for y in range(3, 11) for x in range(6, 21)
       if ((x - 13.2) / 6.6) ** 2 + ((y - 6.5) / 3.9) ** 2 <= 1 and not (((x - 13.2) / 5.2) ** 2 + ((y - 6.4) / 2.9) ** 2 <= 1)},
})

camp = json.loads((ROOT / "data/campaign.json").read_text())
for mid, rows in MAPS.items():
    m = camp["maps"][mid]
    m["rows"] = rows; m["w"] = len(rows[0]); m["h"] = len(rows); m["bg"] = "assets/map-" + mid + ".webp"
    print(mid); print("\n".join(rows))
(ROOT / "data/campaign.json").write_text(json.dumps(camp, ensure_ascii=False, indent=1))
