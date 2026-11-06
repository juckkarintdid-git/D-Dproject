// Builds character-template.md: a prompt friends paste into their own AI to design a level 1 character.
// Every option list comes from data/ so the AI can only pick things the game supports.
// Run: node tools/make_template.mjs
import { readFileSync, writeFileSync } from "node:fs";

const load = (f) => JSON.parse(readFileSync(new URL("../data/" + f, import.meta.url)));
const C = load("classes.json"), O = load("origins.json"), E = load("equipment.json"), SP = load("spells.json");
const L = [];
const p = (...s) => L.push(...s);

p("# DnD for friend · Character Template",
  "",
  "> วิธีใช้: คัดลอกข้อความทั้งหมดนี้ไปวางในแชต AI ของคุณ (ChatGPT, Gemini, Claude ฯลฯ) แล้วคุยกับมันจนได้การ์ด จากนั้นคัดลอกโค้ด JSON ที่ได้ ไปกด “วางการ์ดจาก AI” ในหน้าเกม",
  "",
  "## Instructions for the AI",
  "",
  "You are a character-creation helper for a Dungeons & Dragons game called “DnD for friend”. The game uses the SRD 5.2.1 rules (2024 rules) but only the options listed below. Talk with the player in Thai.",
  "",
  "1. Ask the player, one short question at a time: what kind of hero they want to play (front-line, sneaky, healer, archer, magic), then species, class, background, then personality, appearance and backstory. Suggest options that fit their idea and explain choices in simple Thai.",
  "2. Only use the ids listed in this document. Never invent species, classes, feats, spells or weapons.",
  "3. Build a level 1 character that follows every rule in “Rules”. Double-check the counts before you answer.",
  "4. When the player is happy, output the final card as ONE JSON code block in exactly the format of “Card format”, then a short English image prompt for the portrait (also inside the card as portraitPrompt). Nothing else is needed: the game computes HP, AC, attacks and spell DCs itself.",
  "5. If the player asks for something outside these options, say it is not in the game yet and offer the closest option.",
  "",
  "## Rules (level 1)",
  "",
  "- Ability scores: `abilityMethod` is `\"standard\"` (use exactly 15, 14, 13, 12, 10, 8 once each) or `\"pointbuy\"` (each score 8–15, total cost ≤ 27; cost: " +
    Object.entries(O.pointCost).map(([k, v]) => k + "=" + v).join(", ") + "). Put the highest scores in the class’s main abilities.",
  "- Background bonus `bgBonus`: either +2 to one and +1 to another, or +1 to all three, only among that background’s three abilities.",
  "- `skills`: exactly the class’s skill count, chosen from the class list, and NOT a skill the background already gives.",
  "- Species with a skill choice fill `speciesSkills` (Elf: 1 of Insight/Perception/Survival; Human: any 1 skill not already taken).",
  "- Human also picks `humanFeat` (an origin feat, not the same as the background’s feat). If it is `skilled`, fill `skilledPicks` with 3 more skills.",
  "- Backgrounds Acolyte and Sage give Magic Initiate: fill `magicInitiate` with `list` (Cleric or Wizard), `ability` (INT, WIS or CHA), 2 `cantrips` and 1 level-1 `spell` from that list.",
  "- Fighter: `fightingStyle` (one fighting feat id) and 3 `masteries` (weapon ids). Rogue: 2 `masteries`, 2 `expertise` skills the character is proficient in. Ranger: 2 `masteries`. Cleric: `divineOrder` = \"Protector\" or \"Thaumaturge\".",
  "- Spells: Cleric 3 cantrips (4 if Thaumaturge) + up to 4 prepared level-1 spells. Wizard 3 cantrips + `spellbook` of exactly 6 level-1 wizard spells + up to 4 of those in `spells`. Ranger 0 cantrips + up to 2 level-1 ranger spells (Hunter’s Mark is free and not counted). Fighter and Rogue: leave spell lists empty.",
  "- Equipment: choose the class package and background package in `equipPick` (letters below). Leave `inventory` empty; the game fills it.",
  "- Languages: Common + 2 standard languages.",
  "");

p("## Species (`speciesId`, `speciesChoice`)", "");
for (const s of O.species) {
  p("- `" + s.id + "` " + s.name + " · " + s.size + ", speed " + s.speed + " ft. Traits: " + s.traits.map((t) => t.name).join(", ") + ".");
  if (s.choice) p("  - `speciesChoice` (" + s.choice.label + "): " + Object.entries(s.choice.options).map(([k, o]) => "`" + k + "`" + (typeof o === "string" ? " (" + o + ")" : "")).join(", "));
}
p("", "## Classes (`classId`)", "");
for (const c of C.classes) {
  p("### `" + c.id + "` " + c.name + " · " + c.role,
    "- Hit die d" + c.hitDie + ", main abilities " + c.primary.join("/") + ", saves " + c.saves.join("/") + ". Recommended standard array: " + Object.entries(c.standardArray).map(([k, v]) => k + " " + v).join(", ") + ".",
    "- Skills: choose " + c.skills.count + " from " + c.skills.from.join(", ") + ".",
    "- Level 1 features: " + c.features.filter((f) => f.lv === 1).map((f) => f.name).join(", ") + ".",
    "- Equipment packages (`equipPick.cls`): " + Object.entries(c.equip).map(([k, v]) => k + " = " + (v.items.length ? v.items.map(([id, q]) => (q > 1 ? q + "× " : "") + id).join(", ") + " + " + v.gp + " GP" : v.gp + " GP only")).join(" · "));
  if (c.spellcasting) {
    const sc = c.spellcasting;
    const can = SP.filter((s) => s.level === 0 && s.classes.includes(sc.list)).map((s) => s.id);
    const one = SP.filter((s) => s.level === 1 && s.classes.includes(sc.list)).map((s) => s.id);
    if (can.length) p("- Cantrip ids: " + can.join(", "));
    p("- Level 1 spell ids: " + one.join(", "));
  }
  p("");
}
p("## Backgrounds (`backgroundId`)", "");
for (const b of O.backgrounds) {
  p("- `" + b.id + "` " + b.name + " · abilities " + b.abilities.join("/") + " · skills " + b.skills.join(", ") + " · feat `" + b.feat + "` · tool " + b.tool +
    ". Packages (`equipPick.bg`): A = " + b.equip.A.map(([id, q]) => (q > 1 ? q + "× " : "") + id).join(", ") + " + " + b.equip.Agp + " GP · B = " + b.equip.Bgp + " GP only");
}
p("", "## Feats", "",
  "- Origin feats (for Human `humanFeat`): " + O.feats.filter((f) => f.cat === "origin").map((f) => "`" + f.id + "`").join(", "),
  "- Fighting styles (Fighter `fightingStyle`): " + O.feats.filter((f) => f.cat === "fighting").map((f) => "`" + f.id + "`").join(", "),
  "", "## Weapons (ids for `masteries`)", "",
  "- Simple: " + E.weapons.filter((w) => w.cat === "simple").map((w) => w.id + " (" + w.mastery + ")").join(", "),
  "- Martial: " + E.weapons.filter((w) => w.cat === "martial").map((w) => w.id + " (" + w.mastery + (w.props.some((x) => x === "Finesse" || x === "Light") ? ", rogue ok" : "") + ")").join(", "),
  "- Fighter and Ranger can master any weapon. Rogue: simple weapons and martial weapons marked “rogue ok”. Pick weapons the character actually carries.",
  "", "## Skills", "", Object.entries(O.skills).map(([k, v]) => k + " (" + v.ab + ")").join(", "),
  "", "## Languages", "", O.languages.standard.join(", "),
  "", "## Card format", "",
  "Output exactly this shape (example values shown; replace them):",
  "",
  "```json",
  JSON.stringify({
    format: "dnd-for-friend/card", v: 1, name: "Character name", player: "Player name", level: 1, xp: 0,
    speciesId: "elf", speciesChoice: "Wood Elf", classId: "ranger", subclassId: "", backgroundId: "soldier",
    abilityMethod: "standard", baseScores: { STR: 12, DEX: 15, CON: 13, INT: 8, WIS: 14, CHA: 10 }, bgBonus: { DEX: 2, CON: 1 },
    skills: ["Stealth", "Survival", "Nature"], speciesSkills: ["Perception"], skilledPicks: [], expertise: [],
    humanFeat: "", fightingStyle: "", divineOrder: "", huntersPrey: "", masteries: ["longbow", "shortsword"],
    cantrips: [], spells: ["cure-wounds", "ensnaring-strike"], spellbook: [], magicInitiate: null, asi: [],
    equipPick: { cls: "A", bg: "B" }, inventory: [], gp: 0,
    languages: ["Common", "Elvish", "Sylvan"], alignment: "Neutral Good",
    appearance: "รูปร่างหน้าตาเป็นภาษาไทย", backstory: "ประวัติเป็นภาษาไทย 1–2 ย่อหน้า", tagline: "จุดเด่นสั้น ๆ 1 บรรทัด",
    portraitPrompt: "Fantasy portrait of ..., painterly D&D character art, upper body",
  }, null, 1),
  "```",
  "",
  "For Magic Initiate use: `\"magicInitiate\": {\"list\": \"Wizard\", \"ability\": \"INT\", \"cantrips\": [\"ray-of-frost\", \"prestidigitation\"], \"spell\": \"shield\"}`.",
  "",
  "---",
  "This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.");

const md = L.join("\n") + "\n";
writeFileSync(new URL("../character-template.md", import.meta.url), md);
console.log("character-template.md", md.length, "chars");
