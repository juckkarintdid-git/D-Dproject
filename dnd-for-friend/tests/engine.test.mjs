// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../engine/rules.js";

const load = (f) => JSON.parse(readFileSync(new URL("../data/" + f, import.meta.url)));
const data = { classes: load("classes.json"), origins: load("origins.json"), equipment: load("equipment.json"), spells: load("spells.json") };
const premades = load("premades.json");

function fighter() {
  const c = R.newCard();
  Object.assign(c, {
    name: "Test", classId: "fighter", speciesId: "dwarf", backgroundId: "soldier",
    abilityMethod: "standard", baseScores: { STR: 15, DEX: 13, CON: 14, INT: 8, WIS: 12, CHA: 10 },
    bgBonus: { STR: 2, CON: 1 }, skills: ["Perception", "Survival"], fightingStyle: "defense",
    masteries: ["greatsword", "flail", "javelin"],
  });
  Object.assign(c, R.startingInventory(c, data, "A", "B"));
  return c;
}

test("basic math", () => {
  assert.equal(R.mod(8), -1); assert.equal(R.mod(10), 0); assert.equal(R.mod(17), 3);
  assert.deepEqual([1, 4, 5, 9].map(R.profBonus), [2, 2, 3, 4]);
  assert.equal(R.levelFromXP(0, data), 1); assert.equal(R.levelFromXP(299, data), 1);
  assert.equal(R.levelFromXP(900, data), 3); assert.equal(R.levelFromXP(999999, data), 5);
});

test("point buy cost", () => {
  assert.equal(R.pointBuyCost({ STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 }, data), 0);
  assert.equal(R.pointBuyCost({ STR: 15, DEX: 15, CON: 15, INT: 8, WIS: 8, CHA: 8 }, data), 27);
  assert.equal(R.pointBuyCost({ STR: 16, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 }, data), null);
});

test("level 1 fighter: chain mail + Defense, dwarf HP", () => {
  const c = fighter();
  assert.deepEqual(R.validate(c, data), []);
  const s = R.computeSheet(c, data);
  assert.equal(s.scores.STR, 17); assert.equal(s.scores.CON, 15);
  assert.equal(s.ac, 17); // chain mail 16 + Defense 1
  assert.equal(s.hpMax, 10 + 2 + 1); // d10 + CON + dwarf toughness
  const gs = s.attacks.find((a) => a.id === "greatsword");
  assert.equal(gs.hit, 5); assert.equal(gs.dmg, "2d6+3"); assert.equal(gs.mastery, "Graze");
  assert.equal(s.saves.find((x) => x.ab === "STR").bonus, 5);
  assert.equal(s.resources.secondWind.max, 2);
});

test("fighter levels to 5 with fixed HP and ASI", () => {
  const c = fighter();
  c.level = 5; c.xp = 6500; c.subclassId = "champion"; c.masteries.push("longsword");
  c.asi = [{ lv: 4, inc: { STR: 2 } }];
  assert.deepEqual(R.validate(c, data), []);
  const s = R.computeSheet(c, data);
  assert.equal(s.scores.STR, 19); assert.equal(s.pb, 3);
  assert.equal(s.hpMax, 12 + 4 * (6 + 2) + 5); // 49
  assert.ok(s.features.some((f) => f.name === "Extra Attack"));
});

test("validation catches bad choices", () => {
  const c = fighter();
  c.baseScores.STR = 16; // breaks the standard array
  c.skills = ["Stealth"];
  c.bgBonus = { INT: 2, CON: 1 };
  c.fightingStyle = "";
  const e = R.validate(c, data).join("|");
  assert.match(e, /Standard Array/); assert.match(e, /ทักษะคลาส 2/); assert.match(e, /คลาสนี้เลือกไม่ได้/);
  assert.match(e, /โบนัสพื้นเพต้องอยู่ใน/); assert.match(e, /Fighting Style/);
});

test("ASI cannot push above 20", () => {
  const c = fighter();
  c.level = 4; c.xp = 2700; c.subclassId = "champion"; c.masteries.push("longsword");
  c.asi = [{ lv: 4, inc: { STR: 1, DEX: 1 } }];
  assert.deepEqual(R.validate(c, data), []);
  c.abilityMethod = "roll"; c.baseScores.STR = 18; c.asi = [{ lv: 4, inc: { STR: 2 } }];
  assert.match(R.validate(c, data).join("|"), /STR เกิน 20/);
  assert.equal(R.finalScores(c, data).STR, 20);
});

test("wizard spell numbers at level 1 and 5", () => {
  const p = premades.find((x) => x.classId === "wizard");
  const s1 = R.computeSheet({ ...p, level: 1 }, data);
  const ci = s1.casting[0];
  assert.deepEqual(ci.slots, [2]); assert.equal(ci.preparedMax, 4); assert.equal(ci.spellbookSize, 6); assert.equal(ci.cantripsKnown, 3);
  const s5 = R.computeSheet({ ...p, level: 5 }, data);
  assert.deepEqual(s5.casting[0].slots, [4, 3, 2]); assert.equal(s5.casting[0].preparedMax, 9); assert.equal(s5.casting[0].spellbookSize, 14);
  assert.equal(s5.casting[0].dc, 8 + s5.mods.INT + 3);
});

test("cleric: Life domain always-prepared and Thaumaturge cantrip", () => {
  const p = premades.find((x) => x.classId === "cleric");
  const c = { ...p, level: 5, subclassId: "life", divineOrder: "Thaumaturge" };
  const s = R.computeSheet(c, data);
  assert.ok(s.alwaysPrepared.includes("revivify")); assert.ok(s.alwaysPrepared.includes("bless"));
  assert.equal(s.casting[0].cantripsKnown, 5);
  assert.deepEqual(s.casting[0].slots, [4, 3, 2]);
});

test("rogue sneak attack and expertise", () => {
  const p = premades.find((x) => x.classId === "rogue");
  const s = R.computeSheet(p, data);
  assert.equal(s.sneakAttack, "1d6");
  const ex = s.skills.find((k) => k.expertise);
  assert.ok(ex); assert.equal(ex.bonus, s.mods[ex.ab] + 4);
  assert.equal(R.computeSheet({ ...p, level: 5, xp: 6500 }, data).sneakAttack, "3d6");
});

test("level-up needs", () => {
  const c = fighter();
  assert.deepEqual(R.levelUpNeeds(c, data), []);
  assert.deepEqual(R.levelUpNeeds({ ...c, level: 2 }, data), ["subclass"]);
  assert.deepEqual(R.levelUpNeeds({ ...c, level: 3 }, data), ["asi", "mastery"]);
  assert.deepEqual(R.levelUpNeeds({ ...c, level: 5 }, data), []);
  const r = { ...c, classId: "ranger" };
  assert.deepEqual(R.levelUpNeeds(r, data), ["expertise", "fighting", "spells"]);
});

test("all premades are valid at level 1", () => {
  assert.equal(premades.length, 5);
  for (const p of premades) assert.deepEqual(R.validate(p, data), [], p.name);
});

test("card export/import round trip", () => {
  const c = fighter();
  const { card, errors } = R.importCard(R.exportCard(c), data);
  assert.deepEqual(errors, []); assert.equal(card.name, "Test");
  assert.throws(() => R.importCard('{"x":1}', data));
});

test("every spell/item id referenced in data exists", () => {
  const I = R.index(data);
  for (const c of data.classes.classes) {
    for (const pkg of Object.values(c.equip)) for (const [id] of pkg.items) assert.ok(I.items[id], c.id + " item " + id);
    for (const sub of c.subclasses) for (const l of Object.values(sub.alwaysPrepared || {})) for (const id of l) assert.ok(I.spell[id], id);
    for (const id of (c.spellcasting && c.spellcasting.alwaysPrepared) || []) assert.ok(I.spell[id], id);
  }
  for (const b of data.origins.backgrounds) for (const [id] of b.equip.A) assert.ok(I.items[id], b.id + " " + id);
  for (const sp of data.origins.species) for (const o of Object.values((sp.choice && sp.choice.options) || {})) {
    for (const id of o.cantrips || []) assert.ok(I.spell[id], sp.id + " " + id);
    for (const id of Object.values(o.spells || {})) assert.ok(I.spell[id], sp.id + " " + id);
  }
});
