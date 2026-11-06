// Builds Fizz Bubblewick (friend's character, converted to SRD 5.2.1 + the Controlled Chaos Potion homebrew).
// Run: node tools/make_fizz.mjs [portrait-data-url-file]  -> cards/fizz-bubblewick.dndcard.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { validate, computeSheet, startingInventory } from "../engine/rules.js";
const load = (f) => JSON.parse(readFileSync(new URL("../data/" + f, import.meta.url)));
const data = { classes: load("classes.json"), origins: load("origins.json"), equipment: load("equipment.json"), spells: load("spells.json") };
const portrait = process.argv[2] ? readFileSync(process.argv[2], "utf8").trim() : "";
const card = {
  v: 1, id: "fizz-bubblewick", name: "Fizz Bubblewick", player: "", level: 1, xp: 0,
  classId: "wizard", subclassId: "", speciesId: "gnome", speciesChoice: "Forest Gnome",
  backgroundId: "acolyte", bgBonus: { INT: 2, WIS: 1 }, abilityMethod: "pointbuy",
  baseScores: { STR: 8, DEX: 14, CON: 14, INT: 15, WIS: 12, CHA: 8 },
  skills: ["Arcana", "Medicine"], speciesSkills: [], skilledPicks: [], expertise: [], humanFeat: "", fightingStyle: "", divineOrder: "", huntersPrey: "", masteries: [],
  cantrips: ["mage-hand", "prestidigitation", "ray-of-frost"],
  spells: ["grease", "mage-armor", "magic-missile", "sleep"],
  spellbook: ["grease", "mage-armor", "magic-missile", "sleep", "detect-magic", "feather-fall"],
  magicInitiate: { list: "Cleric", ability: "INT", cantrips: ["guidance", "spare-the-dying"], spell: "cure-wounds" },
  asi: [], hpRolls: {}, inventory: [], gp: 0, languages: ["Common", "Gnomish", "Sylvan"], alignment: "Neutral Good",
  homebrew: ["chaos-potions"],
  appearance: "โนมป่าตัวเล็ก ผมขาวฟูยุ่ง แว่นกลมกับแว่นตาช่างทองเหลืองบนหัว เสื้อกาวน์เปื้อนสารเคมี สายคาดอกเต็มไปด้วยขวดยาหลากสี หัวเราะเสียงดังตลอด",
  backstory: "ฟิซซ์เคยเป็นนักวิจัยอันดับหนึ่งของสถาบันเภสัชศาสตร์บับเบิลตัน แต่ถูกไล่ออกหลังทดลองยากับคณบดี อาการปวดหลังหาย แต่หนวดงอกสามเส้น เขาออกเดินทางเพื่อหาสูตรยาที่สมบูรณ์แบบ รักเพื่อนมาก แต่ไม่ยอมทดลองยากับตัวเอง (ความลับ: เคยร่างโปร่งใสสามวันเพราะยาตัวเอง) พูดเร็ว ชอบจดผลทดลอง ประโยคประจำตัว: “โอกาสรอด 87% ครับ! ...ตัวเลขนี้ยังไม่ได้ผ่านการตรวจสอบนะ”",
  portrait,
  state: { hp: null, tempHp: 0, slotsUsed: [], resUsed: {}, deathSaves: { ok: 0, fail: 0 }, conditions: [] },
  tagline: "นักปรุงยาสายซัพพอร์ต · Homebrew: ระบบปรุงยา Controlled Chaos",
  portraitPrompt: "Fantasy portrait of a cheerful forest gnome alchemist, wild white hair, round glasses and brass goggles, stained lab coat, bandolier of glowing colorful potion vials, holding up a bubbling purple flask, laughing",
};
const pkg = startingInventory(card, data, "A", "B");
card.inventory = pkg.inventory; card.gp = pkg.gp;
const errs = validate(card, data);
const sh = computeSheet(card, data);
console.log("errors:", errs.length ? errs : "none", "| HP", sh.hpMax, "AC", sh.ac, "INT", sh.scores.INT, "speed", sh.speed);
mkdirSync(new URL("../cards/", import.meta.url), { recursive: true });
writeFileSync(new URL("../cards/fizz-bubblewick.dndcard.json", import.meta.url), JSON.stringify(card, null, 1));
