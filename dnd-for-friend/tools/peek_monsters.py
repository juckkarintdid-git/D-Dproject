# Prints the key lines of SRD stat blocks so monster data can be checked by hand.
# Usage: python3 -I tools/peek_monsters.py srd-text/raw.txt "Goblin Warrior" "Ogre" ...
import re, sys

lines = open(sys.argv[1], encoding="utf-8").read().split("\n")
start = next(i for i, l in enumerate(lines) if l.strip() == "Monsters A–Z" and i > 40000)
KEY = re.compile(r"^(AC |HP |Speed |CR |Str |Dex |Con |Int |Wis |Cha |Skills |Senses |Immunities|Resistances|Vulnerabilities|Saving)|Attack Roll:|Saving Throw:|Recharge|\(\d+/Day|Multiattack|^[A-Z][^.]{2,40}\. ")
for name in sys.argv[2:]:
    hits = [i for i in range(start, len(lines)) if lines[i].strip() == name and any(lines[j].startswith("AC ") for j in range(i + 1, min(i + 4, len(lines))))]
    if not hits:
        print("##", name, "NOT FOUND"); continue
    i = hits[0]
    # block ends at the next stat-block header
    j = i + 1
    while j < len(lines) and j < i + 140:
        if j > i + 5 and lines[j].startswith("AC ") and lines[j - 1].strip() and not lines[j - 1].startswith("AC"):
            # next header line is the line before AC
            j -= 1
            break
        j += 1
    print("##", name)
    for k in range(i + 1, j):
        l = lines[k]
        if KEY.search(l):
            nxt = lines[k + 1] if k + 1 < j else ""
            print("  ", l.strip(), "|", nxt.strip()[:90] if ("Attack Roll" in l or "Saving Throw" in l) else "")
