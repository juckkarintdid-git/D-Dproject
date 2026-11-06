"""Parse SRD 5.2.1 spell descriptions into JSON.
Input: output of tools/extract_columns.py for pages 107-175 (headings marked '### ').
Usage: python3 -I tools/parse_spells.py srd-text/spells-cols.txt data/spells.json"""
import json, re, sys
from collections import Counter

CLASSES = {"Cleric", "Ranger", "Wizard"}
MAXLVL = 3
src, out = sys.argv[1], sys.argv[2]
raw = open(src, encoding="utf-8").read().split("\n")
# merge consecutive heading lines (multi-line names)
lines = []
for ln in raw:
    if ln.startswith("### ") and lines and lines[-1].startswith("### ") and lines[-1] != "### Spell Descriptions":
        lines[-1] += " " + ln[4:]
    else:
        lines.append(ln)
blocks, cur = [], None
for ln in lines:
    if ln.startswith("### "):
        cur = {"name": ln[4:].strip(), "body": []}
        blocks.append(cur)
    elif cur:
        cur["body"].append(ln.strip())
head = re.compile(r"^(?:Level ([1-9]) (\w+)|(\w+) Cantrip) \((.*)$")
FIELD = re.compile(r"^(Casting Time|Range|Components|Duration): ?(.*)$")
# lines before the "Level N ..." header belong to the previous block
for k in range(1, len(blocks)):
    body = blocks[k]["body"]
    for j in range(min(4, len(body))):
        if head.match(body[j]):
            if j:
                blocks[k - 1]["body"].extend(body[:j])
                blocks[k]["body"] = body[j:]
            break
spells, skipped = [], []
for b in blocks:
    body = [x for x in b["body"] if x]
    if not body:
        continue
    m = head.match(body[0])
    if not m:
        skipped.append(b["name"]); continue
    level = int(m.group(1)) if m.group(1) else 0
    school = m.group(2) or m.group(3)
    cls_txt, i = m.group(4), 1
    while ")" not in cls_txt:
        cls_txt += " " + body[i]; i += 1
    classes = [c.strip() for c in cls_txt.rstrip(")").split(",")]
    fields, last = {}, None
    while i < len(body):
        fm = FIELD.match(body[i])
        if fm:
            last = fm.group(1); fields[last] = fm.group(2); i += 1
        elif last and last != "Duration":
            fields[last] += " " + body[i]; i += 1
        elif last == "Duration" and fields["Duration"].endswith(("up to", "or")):
            fields[last] += " " + body[i]; i += 1
        else:
            break
    text = " ".join(body[i:])
    text = re.sub(r"(\w)- (\w)", r"\1\2", text)
    # split into paragraphs at bold lead-ins we know
    text = re.sub(r" (Using a Higher-Level Spell Slot\.|Cantrip Upgrade\.)", r"\n\1", text)
    if level <= MAXLVL:
        dur = fields.get("Duration", "")
        spells.append({
            "id": re.sub(r"[^a-z0-9]+", "-", b["name"].lower().replace("’", "")).strip("-"),
            "name": b["name"], "level": level, "school": school,
            "classes": classes,
            "time": fields.get("Casting Time", ""), "range": fields.get("Range", ""),
            "components": fields.get("Components", ""), "duration": dur,
            "concentration": dur.startswith("Concentration"),
            "ritual": "Ritual" in fields.get("Casting Time", ""),
            "text": text.split("\n"),
        })
PATCH = {"a-s": {"id": "acid-splash", "name": "Acid Splash"}, "chill-touch": {"time": "Action", "range": "Touch", "components": "V, S", "duration": "Instantaneous",
                         "text0": "Channeling the chill of the grave, make a melee spell attack against a target within reach. On a hit, the target takes 1d10 Necrotic damage, and it can’t regain Hit Points until the end of your next turn."}}
for sp in spells:
    for k, v in list(PATCH.get(sp["id"], {}).items()):
        if k == "text0":
            sp["text"][0] = v
        else:
            sp[k] = v
json.dump(spells, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(blocks), "blocks;", len(spells), "kept; skipped:", skipped)
print(Counter((c, s["level"]) for s in spells for c in s["classes"]))
