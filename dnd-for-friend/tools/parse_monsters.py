"""Parse srd-text/monsters-cols.txt (from extract_columns.py) into data/monsters.json.
Keeps CR <= MAXCR. Attacks and save effects are structured where the text is regular;
everything keeps its full text so the DM and the UI can show it.
Usage: python3 -I tools/parse_monsters.py srd-text/monsters-cols.txt data/monsters.json"""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
MAXCR = 8
text = open(src, encoding="utf-8").read()
# merge "### A" + "### B" heading runs (long names split over lines)
raw_blocks = re.split(r"\n(?=### )", text)
blocks = []
for b in raw_blocks:
    if not b.startswith("### "):
        continue
    lines = b.split("\n")
    name = lines[0][4:].strip()
    body = lines[1:]
    blocks.append([name, body])
# a heading with no AC line is a group title or a split name: join with the next if next lacks a type line
merged = []
for name, body in blocks:
    if merged and not merged[-1][1]:
        merged[-1] = [name, body]  # empty heading = group title (e.g. "Goblins"), drop it
    else:
        merged.append([name, body])

SECTIONS = ["Traits", "Actions", "Bonus Actions", "Reactions", "Legendary Actions"]
ABMAP = {"STR": "STR", "DEX": "DEX", "CON": "CON", "INT": "INT", "WIS": "WIS", "CHA": "CHA"}
def num(s):
    return int(s.replace("−", "-").replace("–", "-"))
def cr_val(s):
    return {"0": 0, "1/8": 0.125, "1/4": 0.25, "1/2": 0.5}.get(s, None) if "/" in s or s == "0" else float(s)

def entries(lines):
    """Split section lines into 'Name. text' entries."""
    out, cur = [], None
    for l in lines:
        m = re.match(r"^([A-Z][A-Za-z’'()\-–/ ,0-9]{1,60}?)\. (.*)$", l)
        if m and (cur is None or cur["text"].rstrip().endswith((".", ".)", ".”"))):
            if cur: out.append(cur)
            cur = {"name": m.group(1).strip(), "text": m.group(2)}
        elif cur:
            t = cur["text"]
            cur["text"] = (t[:-1] if t.endswith("-") else t + " ") + l
        else:
            cur = {"name": "", "text": l}
    if cur: out.append(cur)
    for e in out:
        e["text"] = re.sub(r"\s+", " ", e["text"]).strip()
    return out

DMG = r"(\d+) \((\d+d\d+(?: ?[+−–-] ?\d+)?)\) (\w+) damage"
def structure(e):
    t = e["text"] = e["text"].replace("Hit :", "Hit:")
    m = re.match(r"(Melee or Ranged|Melee|Ranged) Attack Roll: ([+−-]\d+), (?:reach (\d+) ft\.)?(?: or )?(?:range (\d+)(?:/(\d+))? ft\.)?", t)
    if m:
        kind = {"Melee": "melee", "Ranged": "ranged", "Melee or Ranged": "both"}[m.group(1)]
        d = re.search(r"Hit: " + DMG, t)
        a = {"type": "attack", "kind": kind, "hit": num(m.group(2)), "reach": int(m.group(3) or 5)}
        if m.group(4): a["range"] = [int(m.group(4)), int(m.group(5) or m.group(4))]
        if d: a["dmg"] = d.group(2).replace(" ", "").replace("−", "-").replace("–", "-"); a["avg"] = int(d.group(1)); a["dtype"] = d.group(3)
        else:
            d2 = re.search(r"Hit: (\d+) (\w+) damage", t)
            if d2: a["dmg"] = d2.group(1); a["avg"] = int(d2.group(1)); a["dtype"] = d2.group(2)
        extra = re.search(r"plus " + DMG, t)
        if extra:
            a["extra"] = {"dmg": extra.group(2).replace(" ", "").replace("−", "-").replace("–", "-"), "dtype": extra.group(3)}
            if re.search(r"plus " + DMG + r" if the attack roll had Advantage", t): a["extra"]["ifAdv"] = True
        cond = re.search(r"has the (\w+) condition", t)
        if cond: a["cond"] = cond.group(1)
        return a
    m = re.search(r"(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)", t)
    if m:
        a = {"type": "save", "ab": m.group(1)[:3].upper(), "dc": int(m.group(2))}
        area = re.search(r"(\d+)-foot(?:-radius)? (Cone|Line|Sphere|Cube|Emanation|Cylinder)", t)
        if area: a["area"] = {"shape": area.group(2).lower(), "size": int(area.group(1))}
        tgt = re.search(r"one creature[^.]*?within (\d+) feet", t)
        if tgt and not area: a["range"] = int(tgt.group(1))
        f = re.search(r"Failure: " + DMG, t)
        if f: a["dmg"] = f.group(2).replace(" ", "").replace("−", "-").replace("–", "-"); a["avg"] = int(f.group(1)); a["dtype"] = f.group(3)
        a["half"] = "Success: Half damage" in t
        cond = re.search(r"(?:has|have) the (\w+) condition", t)
        if cond: a["cond"] = cond.group(1)
        return a
    m = re.match(r"The [\w ]+? makes (\w+) (?:(\w+) )?attacks", t)
    if e["name"] == "Multiattack":
        words = {"two": 2, "three": 3, "four": 4}
        n = re.search(r"makes (two|three|four)", t)
        return {"type": "multi", "count": words.get(n.group(1), 2) if n else 2}
    return None

mons = []
for name, body in merged:
    if not any(l.startswith("AC ") for l in body[:6]):
        continue
    m = {"id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"), "name": name}
    m["type"] = body[0].strip()
    sec, buf, info = None, {}, []
    for l in body[1:]:
        s = l.strip()
        if s in SECTIONS:
            sec = s; buf[sec] = []; continue
        if s.startswith("MOD SAVE"):
            continue
        if sec: buf[sec].append(s)
        else: info.append(s)
    joined = "\n".join(info)
    g = lambda pat: (re.search(pat, joined) or [None, None])[1]
    m["ac"] = int(g(r"AC (\d+)") or 10)
    hp = re.search(r"HP (\d+) \(([^)]+)\)", joined)
    if not hp:
        continue
    m["hp"] = int(hp.group(1)); m["hpDice"] = hp.group(2).replace(" ", "").replace("−", "-").replace("–", "-")
    sp = g(r"Speed ([^\n]+)") or "30 ft."
    m["speed"] = int((re.match(r"(\d+)", sp) or [0, 30])[1])
    for k in ("Fly", "Swim", "Climb", "Burrow"):
        v = re.search(k + r" (\d+) ft", sp)
        if v: m[k.lower()] = int(v.group(1))
    ab = {}
    for mm in re.finditer(r"([SDCIWC] ?[a-zA-Z]{2,3}) (\d+) ([+−-]\d+) ([+−-]\d+)", joined):
        k = mm.group(1).replace(" ", "").upper()[:3]
        if k in ABMAP: ab[k] = int(mm.group(2)); ab.setdefault("_saves", {})[k] = num(mm.group(4))
    saves = ab.pop("_saves", {})
    m["abilities"] = ab
    m["saves"] = saves
    for key, pat in (("skills", r"Skills ([^\n]+)"), ("senses", r"Senses ([^\n]+)"), ("languages", r"Languages ([^\n]+)"),
                     ("immunities", r"Immunities ([^\n]+)"), ("resistances", r"Resistances ([^\n]+)"), ("vulnerabilities", r"Vulnerabilities ([^\n]+)")):
        v = g(pat)
        if v: m[key] = v.strip()
    cr = re.search(r"CR ([\d/]+) \((?:XP )?([\d,]+)(?: XP)?", joined)
    if not cr:
        continue
    m["cr"] = cr_val(cr.group(1)); m["crText"] = cr.group(1); m["xp"] = int(cr.group(2).replace(",", ""))
    if m["cr"] is None or m["cr"] > MAXCR:
        continue
    init = re.search(r"Initiative ([+−-]\d+)", joined)
    m["init"] = num(init.group(1)) if init else (ab.get("DEX", 10) - 10) // 2
    for s in SECTIONS:
        if s in buf:
            key = {"Traits": "traits", "Actions": "actions", "Bonus Actions": "bonus", "Reactions": "reactions", "Legendary Actions": "legendary"}[s]
            es = entries(buf[s])
            for e in es:
                st = structure(e)
                if st: e.update(st)
                rc = re.search(r"\(Recharge (\d)(?:–6)?\)", e["name"])
                if rc: e["recharge"] = int(rc.group(1)); e["name"] = e["name"].split(" (")[0]
                pd = re.search(r"\((\d)/Day\)", e["name"])
                if pd: e["perDay"] = int(pd.group(1)); e["name"] = e["name"].split(" (")[0]
            m[key] = es
    mons.append(m)

mons.sort(key=lambda x: (x["cr"], x["name"]))
json.dump(mons, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(mons), "monsters CR <=", MAXCR)
bad = [x["name"] for x in mons if not any(a.get("type") in ("attack", "save") for a in x.get("actions", []))]
print("no structured action:", len(bad), bad[:40])
