// Builds data/premades.json from the short specs below (inventory comes from the engine).
// Run: node tools/make_premades.mjs
import { readFileSync, writeFileSync } from "node:fs";
import * as R from "../engine/rules.js";

const load = (f) => JSON.parse(readFileSync(new URL("../data/" + f, import.meta.url)));
const data = { classes: load("classes.json"), origins: load("origins.json"), equipment: load("equipment.json"), spells: load("spells.json") };

const specs = [
  {
    id: "pre-fighter", name: "Brannoc Ironvow", classId: "fighter", speciesId: "dwarf", backgroundId: "soldier",
    baseScores: { STR: 15, DEX: 13, CON: 14, INT: 8, WIS: 12, CHA: 10 }, bgBonus: { STR: 2, CON: 1 },
    skills: ["Perception", "Survival"], fightingStyle: "great-weapon-fighting", masteries: ["greatsword", "flail", "javelin"],
    pkg: ["A", "B"], languages: ["Common", "Dwarvish", "Giant"], alignment: "Lawful Good",
    tagline: "โล่มนุษย์ของปาร์ตี้ ตีแรง ทนมาก",
    appearance: "คนแคระไหล่กว้าง เคราสีทองแดงถักเปีย มีแผลเป็นยาวที่แก้มซ้าย ใส่ชุดเกราะโซ่ แบกดาบสองมือ",
    backstory: "บรานน็อคเคยเป็นหัวหน้าหน่วยเฝ้าประตูเหมืองเหล็กแห่งภูเขาคาร์ก จนคืนหนึ่งมีบางอย่างขึ้นมาจากใต้ดินแล้วกวาดหน่วยของเขาจนเหลือเขาคนเดียว เขาสาบานกับค้อนของบรรพบุรุษว่าจะตามหาสิ่งนั้นให้เจอ และจะไม่ยอมให้เพื่อนร่วมทางคนไหนตายต่อหน้าเขาอีก เขาพูดน้อย กินเยอะ และเชื่อว่าปัญหาส่วนใหญ่แก้ได้ด้วยการยืนอยู่ข้างหน้าสุด",
    portraitPrompt: "Fantasy portrait of a stout dwarf warrior, braided copper beard, long scar on left cheek, chain mail armor, greatsword over shoulder, determined stern eyes, torch-lit mine gate background, painterly D&D character art, upper body, dramatic lighting",
  },
  {
    id: "pre-rogue", name: "Pip Quickfinger", classId: "rogue", speciesId: "halfling", backgroundId: "criminal",
    baseScores: { STR: 8, DEX: 15, CON: 14, INT: 12, WIS: 13, CHA: 10 }, bgBonus: { DEX: 2, INT: 1 },
    skills: ["Acrobatics", "Deception", "Investigation", "Perception"], expertise: ["Stealth", "Perception"],
    masteries: ["dagger", "shortsword"], pkg: ["A", "B"], languages: ["Common", "Halfling", "Thieves' Cant"], alignment: "Chaotic Good",
    tagline: "ตัวเล็ก หายตัวเก่ง แทงจุดตายแรง",
    appearance: "ฮาล์ฟลิงผมหยิกสีน้ำตาล ยิ้มกวน ๆ ตลอดเวลา สวมเสื้อคลุมหนังมีฮู้ด มีมีดสั้นซ่อนอยู่ทุกที่บนตัว",
    backstory: "พิปโตมาในตรอกท่าเรือเมืองซอลท์เมียร์ และเรียนรู้ว่ากุญแจทุกดอกมีจุดอ่อน เขาเคยทำงานให้แก๊งหน้ากากเทา จนถูกใส่ร้ายว่าขโมยมงกุฎของท่านเจ้าเมือง ตอนนี้เขามีค่าหัวติดอยู่ทั่วเมือง และกำลังหาหลักฐานว่าใครคือคนที่หักหลังเขาจริง ๆ ระหว่างนั้นก็รับงานผจญภัยไปพลาง เพราะเงินรางวัลดีกว่าล้วงกระเป๋าเยอะ",
    portraitPrompt: "Fantasy portrait of a cheerful halfling rogue, curly brown hair, mischievous grin, dark leather hooded cloak, twin daggers, harbor alley at night with lanterns, painterly D&D character art, upper body, moody blue and orange lighting",
  },
  {
    id: "pre-cleric", name: "Sister Elara Dawnmere", classId: "cleric", speciesId: "human", backgroundId: "acolyte",
    baseScores: { STR: 14, DEX: 8, CON: 13, INT: 10, WIS: 15, CHA: 12 }, bgBonus: { WIS: 2, CHA: 1 },
    skills: ["Medicine", "Persuasion"], speciesSkills: ["Perception"], humanFeat: "alert", divineOrder: "Protector",
    cantrips: ["guidance", "sacred-flame", "thaumaturgy"], spells: ["bless", "cure-wounds", "guiding-bolt", "shield-of-faith"],
    magicInitiate: { list: "Cleric", ability: "WIS", cantrips: ["light", "spare-the-dying"], spell: "healing-word" },
    pkg: ["A", "B"], languages: ["Common", "Elvish", "Halfling"], alignment: "Neutral Good",
    tagline: "ฮีลเลอร์สายแทงก์ ใส่เกราะหนัก ถือโล่",
    appearance: "หญิงสาวผมยาวสีเงินมัดรวบ ดวงตาสีอำพัน สวมเกราะทับชุดนักบวชสีขาวทอง มีสัญลักษณ์รูปตะวันห้อยคอ",
    backstory: "เอลาร่าถูกทิ้งไว้หน้าวิหารแห่งรุ่งอรุณตั้งแต่ยังเป็นทารก นักบวชเลี้ยงเธอมาเหมือนลูก เธอเรียนทั้งการรักษาและการถือโล่ เพราะวิหารตั้งอยู่ชายแดนที่มีพวกอันเดดออกมาทุกคืนเดือนมืด เมื่อแสงในหอคอยวิหารดับลงอย่างไม่มีสาเหตุ เธอได้ยินเสียงในความฝันบอกให้ออกเดินทางไปตามหาเปลวไฟดวงแรก เธอใจดีกับทุกคน ยกเว้นพวกที่ปลุกคนตาย",
    portraitPrompt: "Fantasy portrait of a young human female cleric, long silver hair tied back, amber eyes, white and gold vestments over chain shirt, round shield with sun emblem, holy light glowing from her hand, temple interior background, painterly D&D character art, upper body, warm golden lighting",
  },
  {
    id: "pre-ranger", name: "Faelan Windleaf", classId: "ranger", speciesId: "elf", speciesChoice: "Wood Elf", backgroundId: "soldier",
    baseScores: { STR: 12, DEX: 15, CON: 13, INT: 8, WIS: 14, CHA: 10 }, bgBonus: { DEX: 2, CON: 1 },
    skills: ["Stealth", "Survival", "Nature"], speciesSkills: ["Perception"], spells: ["cure-wounds", "ensnaring-strike"],
    masteries: ["longbow", "shortsword"], pkg: ["A", "B"], languages: ["Common", "Elvish", "Sylvan"], alignment: "Neutral Good",
    tagline: "นักธนูระยะไกล ตามรอยเก่ง ล่าเป้าหมายเดียว",
    appearance: "เอลฟ์ป่าผิวสีแทน ผมยาวสีเขียวเข้มถักใบไม้แห้ง สวมชุดหนังลายพราง ถือธนูยาวที่แกะสลักลายเถาวัลย์",
    backstory: "เฟลานเคยเป็นทหารพรานเฝ้าป่าเกรย์วูดให้กับราชินีเอลฟ์ จนกองทัพก็อบลินบุกเผาหมู่บ้านริมป่า เขาตามรอยพวกมันไปจนพบว่ามีคนสวมผ้าคลุมสีม่วงคอยสั่งการอยู่เบื้องหลัง ตั้งแต่นั้นเขาออกจากหน่วยมาล่าคนกลุ่มนั้นด้วยตัวเอง เขาเงียบ เชื่อใจคนยาก แต่ถ้าใครได้เป็นเพื่อนเขาแล้ว เขาจะยิงธนูให้จนลูกสุดท้าย",
    portraitPrompt: "Fantasy portrait of a male wood elf ranger, tan skin, long dark green hair braided with dry leaves, camouflaged leather armor, carved longbow with vine patterns, misty ancient forest background, painterly D&D character art, upper body, soft green dappled light",
  },
  {
    id: "pre-wizard", name: "Tibbly Cogsworth", classId: "wizard", speciesId: "gnome", speciesChoice: "Forest Gnome", backgroundId: "sage",
    baseScores: { STR: 8, DEX: 12, CON: 13, INT: 15, WIS: 14, CHA: 10 }, bgBonus: { INT: 2, CON: 1 },
    skills: ["Investigation", "Insight"], cantrips: ["fire-bolt", "mage-hand", "light"],
    spellbook: ["detect-magic", "feather-fall", "mage-armor", "magic-missile", "sleep", "thunderwave"],
    spells: ["mage-armor", "magic-missile", "sleep", "thunderwave"],
    magicInitiate: { list: "Wizard", ability: "INT", cantrips: ["ray-of-frost", "prestidigitation"], spell: "shield" },
    pkg: ["A", "B"], languages: ["Common", "Gnomish", "Draconic"], alignment: "Chaotic Good",
    tagline: "จอมเวทสายระเบิด คุมพื้นที่ ตัวบางมาก",
    appearance: "โนมตัวจิ๋ว ผมขาวฟูชี้ฟ้า สวมแว่นกลมหนาเตอะ เสื้อคลุมสีน้ำเงินเต็มไปด้วยรอยไหม้ กอดสมุดเวทเล่มใหญ่กว่าตัว",
    backstory: "ทิบบลีเป็นผู้ช่วยบรรณารักษ์ในหอสมุดหอคอยเวทแห่งเมืองหลวง จนวันหนึ่งเขาเปิดหนังสือต้องห้ามเล่มหนึ่งโดยไม่ได้ตั้งใจ หน้ากระดาษครึ่งเล่มหลุดปลิวหายไปทั่วแผ่นดิน อาจารย์ใหญ่ไม่ได้ไล่เขาออก แต่ให้เขาออกไปตามเก็บทุกหน้ากลับมา เขาตื่นเต้นกับทุกสิ่ง จดโน้ตไม่หยุด และมีนิสัยชอบลองเวทใหม่ในจังหวะที่ไม่ควรลองที่สุด",
    portraitPrompt: "Fantasy portrait of a tiny gnome wizard, fluffy white hair sticking up, thick round glasses, singed blue robe, hugging an oversized spellbook, small blue flame floating above his palm, cluttered magic library background, painterly D&D character art, upper body, whimsical warm candle lighting",
  },
];

const out = specs.map((s) => {
  const { pkg, ...rest } = s;
  const card = Object.assign(R.newCard(), rest, { abilityMethod: "standard", player: "", portrait: "" });
  Object.assign(card, R.startingInventory(card, data, pkg[0], pkg[1]));
  const errs = R.validate(card, data);
  if (errs.length) throw new Error(s.name + ": " + errs.join(" | "));
  return card;
});
writeFileSync(new URL("../data/premades.json", import.meta.url), JSON.stringify(out, null, 1));
console.log("wrote", out.length, "premades");
for (const c of out) { const sh = R.computeSheet(c, data); console.log(c.name, "HP", sh.hpMax, "AC", sh.ac, sh.acNotes.join(";"), "gp", c.gp); }
