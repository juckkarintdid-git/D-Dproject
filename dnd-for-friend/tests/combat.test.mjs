// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../engine/combat.js";
import * as AI from "../engine/ai.js";

const load = (f) => JSON.parse(readFileSync(new URL("../data/" + f, import.meta.url)));
const data = { classes: load("classes.json"), origins: load("origins.json"), equipment: load("equipment.json"), spells: load("spells.json"), monsters: load("monsters.json") };
const P = load("premades.json");
const M = Object.fromEntries(data.monsters.map((m) => [m.id, m]));
const pre = (cls, lv = 1) => ({ ...P.find((p) => p.classId === cls), level: lv, xp: 99999 });
const openMap = (w = 12, h = 10, walls = []) => ({ w, h, walls: Object.fromEntries(walls.map((k) => [k, 1])), difficult: {} });

test("dice and geometry", () => {
  C.setRng(C.makeRng(7));
  const r = C.roll("2d6+3"); assert.equal(r.rolls.length, 2); assert.equal(r.total, r.rolls[0] + r.rolls[1] + 3);
  assert.equal(C.roll("1d8", { crit: true }).rolls.length, 2);
  assert.equal(C.dist({ x: 0, y: 0 }, { x: 3, y: 2 }), 15);
  const st = { map: openMap(10, 10, ["5,0", "5,1", "5,2", "5,3", "5,4", "5,5", "5,6", "5,7", "5,8", "5,9"]) };
  assert.equal(C.hasLOS(st, { x: 0, y: 0 }, { x: 9, y: 0 }), false);
  assert.equal(C.hasLOS(st, { x: 0, y: 0 }, { x: 4, y: 4 }), true);
  const cone = C.areaCells({ map: openMap(20, 20) }, "cone", 15, { x: 5, y: 5 }, { x: 8, y: 5 });
  assert.ok(cone.some((c) => c.x === 8 && c.y === 5) && !cone.some((c) => c.x === 4));
  const ball = C.areaCells({ map: openMap(20, 20) }, "sphere", 20, { x: 0, y: 0 }, { x: 10, y: 10 });
  assert.equal(ball.length, 81);
});

test("pc and monster units", () => {
  const f = C.pcUnit(pre("fighter"), data);
  assert.equal(f.maxHp, 13); assert.equal(f.ac, 16); assert.ok(f.attacks.find((a) => a.id === "greatsword").twoHanded);
  const w5 = C.pcUnit(pre("wizard", 5), data);
  assert.deepEqual(w5.slots, [4, 3, 2]);
  const g = C.monsterUnit(M["goblin-warrior"]);
  assert.equal(g.hp, 10); assert.equal(g.profile, "skirmisher");
  const boss = C.monsterUnit(M["ogre"], "boss", 1, 4);
  assert.equal(boss.hp, 170); assert.equal(boss.ac, 13); assert.equal(boss.legendary, 2);
  assert.equal(C.monsterUnit(M["wolf"]).profile, "pack");
});

test("attack, damage, death saves", () => {
  C.setRng(C.makeRng(42));
  const f = C.pcUnit(pre("fighter"), data); f.x = 1; f.y = 1;
  const z = C.monsterUnit(M["zombie"]); z.x = 2; z.y = 1;
  const st = C.newCombat(openMap(), [f, z], data);
  C.startTurn(st, f);
  let hits = 0;
  for (let i = 0; i < 10 && C.alive(z); i++) { f.turn.action = 1; f.turn.attacksLeft = 0; const r = C.weaponAttack(st, f, z, f.attacks.findIndex((a) => a.id === "greatsword")); if (r.hit) hits++; }
  assert.ok(hits > 0); assert.ok(st.log.some((l) => /Greatsword/.test(l.text)));
  // pc goes down and rolls death saves
  C.damage(st, f, f.hp + 2, "Slashing", z);
  assert.equal(f.hp, 0); assert.ok(C.hasCond(f, "Unconscious"));
  for (let i = 0; i < 6 && !f.dead && !f.stable && f.hp === 0; i++) C.startTurn(st, f);
  assert.ok(f.dead || f.stable || f.hp > 0);
  // massive damage
  const r2 = C.pcUnit(pre("rogue"), data); const st2 = C.newCombat(openMap(), [r2], data);
  C.damage(st2, r2, r2.hp + r2.maxHp, "Fire"); assert.equal(r2.dead, true);
});

test("resistance, immunity, concentration", () => {
  C.setRng(C.makeRng(3));
  const sk = C.monsterUnit(M["skeleton"]);
  const st = C.newCombat(openMap(), [sk], data);
  sk.vuln = "Bludgeoning"; const hp = sk.hp; C.damage(st, sk, 4, "Bludgeoning"); assert.equal(sk.hp, hp - 8);
  const z = C.monsterUnit(M["zombie"]); st.units[z.id] = z; const zh = z.hp; C.damage(st, z, 5, "Poison"); assert.equal(z.hp, zh);
  const cl = C.pcUnit(pre("cleric", 3), data); st.units[cl.id] = cl; cl.x = 0; cl.y = 0; C.startTurn(st, cl);
  const res = C.castSpell(st, cl, "bless", { targets: [cl.id] });
  assert.ok(res.ok); assert.ok(cl.conc); assert.ok(cl.effects.some((e) => e.name === "Bless"));
  C.endConc(st, cl); assert.ok(!cl.effects.some((e) => e.name === "Bless"));
});

test("spells: fireball area, healing word, magic missile, slots", () => {
  C.setRng(C.makeRng(11));
  const w = C.pcUnit(pre("wizard", 5), data); w.x = 0; w.y = 0;
  const gobs = [0, 1, 2].map((i) => { const g = C.monsterUnit(M["goblin-warrior"], "normal", i + 1); g.x = 8 + (i % 2); g.y = 4 + i; return g; });
  const st = C.newCombat(openMap(20, 12), [w, ...gobs], data);
  C.startTurn(st, w);
  const before = gobs.map((g) => g.hp);
  const r = C.castSpell(st, w, "fireball", { point: { x: 8, y: 5 }, slot: 3 });
  assert.ok(r.ok, r.error); assert.equal(C.slotsLeft(w, 3), 1);
  assert.ok(gobs.some((g, i) => g.hp < before[i]));
  C.startTurn(st, w);
  const left = gobs.filter(C.alive);
  if (left.length) { const mm = C.castSpell(st, w, "magic-missile", { targets: left.map((g) => g.id) }); assert.ok(mm.ok); }
  const cl = C.pcUnit(pre("cleric"), data); cl.hp = 1; st.units[cl.id] = cl; C.startTurn(st, cl);
  C.castSpell(st, cl, "healing-word", { targets: [cl.id] });
  assert.ok(cl.hp > 1); assert.equal(cl.turn.bonus, 0); assert.equal(cl.turn.action, 1);
  assert.match(C.castSpell(st, cl, "guidance", {}).error || "", /DM/);
});

test("pathfinding around walls, opportunity attacks", () => {
  C.setRng(C.makeRng(5));
  const walls = []; for (let y = 0; y < 8; y++) walls.push("5," + y);
  const r = C.pcUnit(pre("rogue"), data); r.x = 1; r.y = 1;
  const st = C.newCombat(openMap(12, 10, walls), [r], data);
  const path = C.findPath(st, r, { x: 9, y: 1 });
  assert.ok(path && path.every((c) => !st.map.walls[c.x + "," + c.y]));
  assert.ok(path.some((c) => c.y >= 8));
  const g = C.monsterUnit(M["bandit"]); g.x = 2; g.y = 1; st.units[g.id] = g;
  C.startTurn(st, r);
  C.moveAlong(st, r, [{ x: 0, y: 1 }]);
  assert.ok(st.log.some((l) => /Opportunity/.test(l.text)));
});

test("monster AI: melee brute closes in, archer keeps range, breath hits a cluster", () => {
  C.setRng(C.makeRng(9));
  const f = C.pcUnit(pre("fighter"), data); f.x = 1; f.y = 1;
  const o = C.monsterUnit(M["ogre"]); o.x = 7; o.y = 1;
  let st = C.newCombat(openMap(), [f, o], data);
  C.startTurn(st, o);
  const plan = AI.runMonsterTurn(st, o);
  assert.equal(plan.kind, "melee"); assert.ok(C.dist(o, f) <= 5);

  const s = C.monsterUnit(M["skeleton"]); s.x = 9; s.y = 1;
  st = C.newCombat(openMap(), [f, s], data); f.x = 1;
  s.profile = "archer"; C.startTurn(st, s);
  const p2 = AI.runMonsterTurn(st, s);
  assert.equal(p2.kind, "ranged");

  const dr = C.monsterUnit(M["green-dragon-wyrmling"], "boss", 1, 3); dr.x = 1; dr.y = 5;
  const a = C.pcUnit(pre("wizard"), data), b = C.pcUnit(pre("rogue"), data);
  a.x = 3; a.y = 5; b.x = 3; b.y = 6; f.x = 4; f.y = 5;
  st = C.newCombat(openMap(), [f, a, b, dr], data);
  C.startTurn(st, dr);
  const menu = AI.buildMenu(st, dr);
  assert.ok(menu.length >= 2);
  assert.ok(menu.some((m) => m.kind === "save"), JSON.stringify(menu.map((m) => m.label)));
  const pick = menu.findIndex((m) => m.kind === "save");
  AI.executePlan(st, dr, menu[pick]);
  assert.equal(dr.recharge["Poison Breath"], false);
  assert.ok(AI.menuPrompt(st, dr, menu).includes("0."));
  f.x = 2; f.y = 5; f.hp = f.maxHp; f.dead = false; f.conditions = [];
  dr.legLeft = 2; assert.equal(AI.legendaryAction(st, dr), true);
});

test("full auto battle ends with a winner and XP", () => {
  for (let seed = 1; seed <= 15; seed++) {
    C.setRng(C.makeRng(seed));
    const party = ["fighter", "cleric", "rogue", "wizard"].map((c, i) => { const u = C.pcUnit(pre(c, 2), data); u.x = 1; u.y = 2 + i; return u; });
    const foes = [C.monsterUnit(M["goblin-warrior"], "normal", 1), C.monsterUnit(M["goblin-warrior"], "normal", 2), C.monsterUnit(M["goblin-boss"], "subboss", 1)];
    foes.forEach((g, i) => { g.x = 9; g.y = 2 + i * 2; });
    const st = C.newCombat(openMap(12, 10), [...party, ...foes], data);
    let u = C.rollInitiative(st);
    for (let t = 0; t < 400 && u && !st.over; t++) {
      if (u.side === "foe") AI.runMonsterTurn(st, u);
      else {
        // simple hero bot: walk to nearest foe and swing
        const tgt = C.foesOf(st, u).sort((x, y) => C.dist(u, x) - C.dist(u, y))[0];
        if (tgt && u.hp > 0) {
          const ai = u.attacks.findIndex((a) => a.ranged) >= 0 && u.classId !== "fighter" ? u.attacks.findIndex((a) => a.ranged) : u.attacks.findIndex((a) => a.melee);
          const atk = u.attacks[ai];
          if (atk && atk.melee && C.dist(u, tgt) > 5) { const p = C.findPath(st, u, tgt, { stopWithin: 5 }); if (p) C.moveAlong(st, u, p); }
          if (atk) C.weaponAttack(st, u, tgt, ai);
        }
      }
      u = st.over ? null : C.endTurn(st);
    }
    assert.ok(st.over, "seed " + seed + " did not finish");
    if (st.over === "win") assert.equal(st.xpPool, 50 + 50 + 400);
  }
});

test("encounter difficulty", () => {
  const xp = C.encounterXP([{ id: "goblin-warrior", count: 4 }, { id: "goblin-boss", tier: "subboss" }], data);
  assert.equal(xp, 600);
  assert.equal(C.difficulty(xp, [1, 1, 1, 1]), "อันตรายมาก");
  assert.equal(C.difficulty(xp, [2, 2, 2, 2]), "ปานกลาง");
});
