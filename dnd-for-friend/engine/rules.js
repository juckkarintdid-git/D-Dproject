// DnD for friend · rules engine (character part, phase 1)
// Pure functions: the page owns all rules math, the AI DM never computes numbers.
// Rules from SRD 5.2.1 (CC-BY-4.0). Works in the browser and in Node (ES module).

export const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export const mod = (score) => Math.floor((score - 10) / 2);
export const profBonus = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
export const fmt = (n) => (n >= 0 ? "+" + n : String(n));

export function levelFromXP(xp, data) {
  const t = data.classes.xp;
  let lv = 1;
  for (let i = 0; i < t.length; i++) if (xp >= t[i]) lv = i + 1;
  return Math.min(lv, data.classes.maxLevel);
}
export const xpForLevel = (lv, data) => data.classes.xp[lv - 1];

// ---------- lookups ----------
export function index(data) {
  if (data._idx) return data._idx;
  const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const items = {};
  for (const w of data.equipment.weapons) items[w.id] = { ...w, kind: "weapon" };
  for (const a of data.equipment.armor) items[a.id] = { ...a, kind: "armor" };
  for (const g of data.equipment.gear) items[g.id] = { ...g, kind: "gear" };
  data._idx = {
    cls: by(data.classes.classes), species: by(data.origins.species), bg: by(data.origins.backgrounds),
    feat: by(data.origins.feats), spell: by(data.spells), items,
  };
  return data._idx;
}

// ---------- ability scores ----------
export function pointBuyCost(base, data) {
  let total = 0;
  for (const a of ABILITIES) {
    const c = data.origins.pointCost[String(base[a])];
    if (c === undefined) return null;
    total += c;
  }
  return total;
}

// Final scores = base + background bonus + ASI/feat increases up to current level
export function finalScores(card, data) {
  const s = { ...card.baseScores };
  for (const [a, v] of Object.entries(card.bgBonus || {})) s[a] += v;
  for (const pick of card.asi || []) {
    if (pick.lv > card.level) continue;
    for (const [a, v] of Object.entries(pick.inc || {})) s[a] += v;
  }
  for (const a of ABILITIES) s[a] = Math.min(20, s[a]);
  return s;
}

// ---------- proficiencies ----------
function featsOf(card, data) {
  const I = index(data);
  const ids = [];
  const bg = I.bg[card.backgroundId];
  if (bg) ids.push(bg.feat);
  if (card.humanFeat) ids.push(card.humanFeat);
  if (card.fightingStyle) ids.push(card.fightingStyle);
  for (const p of card.asi || []) if (p.lv <= card.level && p.feat) ids.push(p.feat);
  return ids;
}

export function skillProfs(card, data) {
  const I = index(data);
  const set = new Set(card.skills || []);
  const bg = I.bg[card.backgroundId];
  if (bg) bg.skills.forEach((s) => set.add(s));
  (card.speciesSkills || []).forEach((s) => set.add(s));
  (card.skilledPicks || []).forEach((s) => set.add(s));
  return set;
}

export function weaponProficient(item, card, data) {
  const c = index(data).cls[card.classId];
  const rules = [...c.weapons];
  if (card.classId === "cleric" && card.divineOrder === "Protector") rules.push("martial");
  for (const r of rules) {
    if (r === item.cat) return true;
    if (r.startsWith("martial:") && item.cat === "martial") {
      const need = r.split(":")[1].split("|");
      if (item.props.some((p) => need.includes(p))) return true;
    }
  }
  return false;
}

export function armorTraining(card, data) {
  const c = index(data).cls[card.classId];
  const t = new Set(c.armor);
  if (card.classId === "cleric" && card.divineOrder === "Protector") t.add("heavy");
  return t;
}

// ---------- spells ----------
export function castingInfo(card, data, scores, pb) {
  const c = index(data).cls[card.classId];
  const sc = c.spellcasting;
  const out = [];
  if (sc) {
    const m = mod(scores[sc.ability]);
    const lv = card.level;
    let cantrips = sc.cantrips[lv - 1];
    if (card.classId === "cleric" && card.divineOrder === "Thaumaturge") cantrips += 1;
    out.push({
      source: c.name, ability: sc.ability, list: sc.list, dc: 8 + m + pb, attack: m + pb,
      cantripsKnown: cantrips, preparedMax: sc.prepared[lv - 1], slots: sc.slots[lv - 1],
      maxSpellLevel: sc.slots[lv - 1].length,
      spellbookSize: sc.prepare === "spellbook" ? sc.spellbookStart + sc.spellbookPerLevel * (lv - 1) : 0,
    });
  }
  const mi = card.magicInitiate;
  if (mi && mi.ability) {
    const m = mod(scores[mi.ability]);
    out.push({ source: "Magic Initiate", ability: mi.ability, list: mi.list, dc: 8 + m + pb, attack: m + pb });
  }
  return out;
}

export function alwaysPrepared(card, data) {
  const I = index(data);
  const c = I.cls[card.classId];
  const ids = [...((c.spellcasting && c.spellcasting.alwaysPrepared) || [])];
  const sub = c.subclasses.find((s) => s.id === card.subclassId);
  if (sub && sub.alwaysPrepared && card.level >= 3)
    for (const [lv, list] of Object.entries(sub.alwaysPrepared)) if (card.level >= +lv) ids.push(...list);
  // species spells (cast once per long rest for free)
  const sp = I.species[card.speciesId];
  const opt = sp && sp.choice && sp.choice.options[card.speciesChoice];
  if (opt && opt.spells) for (const [lv, id] of Object.entries(opt.spells)) if (card.level >= +lv) ids.push(id);
  return [...new Set(ids)];
}

export function speciesCantrips(card, data) {
  const sp = index(data).species[card.speciesId];
  const opt = sp && sp.choice && sp.choice.options[card.speciesChoice];
  const ids = (opt && opt.cantrips) ? [...opt.cantrips] : [];
  if (card.speciesId === "tiefling") ids.push("thaumaturgy");
  return ids;
}

// ---------- equipment ----------
export function equipped(card, data) {
  const I = index(data);
  const inv = (card.inventory || []).map((x) => ({ ...x, item: I.items[x.id] })).filter((x) => x.item);
  const armor = inv.find((x) => x.equipped && x.item.kind === "armor" && x.item.cat !== "shield");
  const shield = inv.find((x) => x.equipped && x.item.cat === "shield");
  const weapons = inv.filter((x) => x.item.kind === "weapon");
  return { inv, armor: armor && armor.item, shield: shield && shield.item, weapons };
}

export function armorClass(card, data, scores) {
  const { armor, shield } = equipped(card, data);
  const dex = mod(scores.DEX);
  const train = armorTraining(card, data);
  const feats = featsOf(card, data);
  let ac = 10 + dex, notes = [];
  if (armor) {
    ac = armor.ac + (armor.dex ? (armor.dexMax !== undefined ? Math.min(dex, armor.dexMax) : dex) : 0);
    if (!train.has(armor.cat)) notes.push("ไม่ได้ฝึกใส่ " + armor.name + ": STR/DEX เสียเปรียบ ร่ายเวทไม่ได้");
    if (armor.str && scores.STR < armor.str) notes.push(armor.name + " ต้องการ STR " + armor.str + ": ความเร็ว −10 ฟุต");
    if (feats.includes("defense")) ac += 1;
  }
  if (shield) {
    if (train.has("shield")) ac += 2; else notes.push("ไม่ได้ฝึกใช้โล่: ไม่ได้ AC");
  }
  return { ac, notes };
}

export function attacks(card, data, scores, pb) {
  const { weapons } = equipped(card, data);
  const feats = featsOf(card, data);
  const S = mod(scores.STR), D = mod(scores.DEX);
  return weapons.map(({ item: w }) => {
    const finesse = w.props.includes("Finesse");
    const ranged = w.type === "ranged";
    const m = ranged ? D : finesse ? Math.max(S, D) : S;
    const prof = weaponProficient(w, card, data);
    let hit = m + (prof ? pb : 0) + (ranged && feats.includes("archery") ? 2 : 0);
    const dmg = w.dmg + (m ? (m > 0 ? "+" + m : String(m)) : "");
    const notes = [];
    if (w.props.includes("Heavy") && (ranged ? scores.DEX : scores.STR) < 13) notes.push("Heavy: ตีเสียเปรียบ");
    return {
      id: w.id, name: w.name, hit, dmg, dtype: w.dtype, prof, range: w.range || null,
      versatile: w.versatile ? w.versatile + (m ? fmt(m) : "") : null,
      mastery: (card.masteries || []).includes(w.id) ? w.mastery : null, props: w.props, notes,
    };
  });
}

// ---------- main sheet ----------
export function computeSheet(card, data) {
  const I = index(data);
  const c = I.cls[card.classId], sp = I.species[card.speciesId], bg = I.bg[card.backgroundId];
  if (!c || !sp || !bg) throw new Error("card missing class/species/background");
  const lv = card.level;
  const pb = profBonus(lv);
  const scores = finalScores(card, data);
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, mod(scores[a])]));
  const skillsP = skillProfs(card, data);
  const expertise = new Set(card.expertise || []);
  const skills = Object.entries(data.origins.skills).map(([name, s]) => {
    const p = skillsP.has(name), e = p && expertise.has(name);
    let bonus = mods[s.ab] + (e ? 2 * pb : p ? pb : 0);
    if (card.classId === "cleric" && card.divineOrder === "Thaumaturge" && (name === "Arcana" || name === "Religion"))
      bonus += Math.max(1, mods.WIS);
    return { name, ab: s.ab, th: s.th, prof: p, expertise: e, bonus };
  });
  const saves = ABILITIES.map((a) => ({ ab: a, prof: c.saves.includes(a), bonus: mods[a] + (c.saves.includes(a) ? pb : 0) }));
  // HP: level 1 = full die, later levels fixed average (die/2+1); CON applies to every level
  const fixed = c.hitDie / 2 + 1;
  let hpMax = c.hitDie + mods.CON;
  for (let l = 2; l <= lv; l++) hpMax += Math.max(1, ((card.hpRolls && card.hpRolls[l]) || fixed) + mods.CON);
  if (sp.hpPerLevel) hpMax += sp.hpPerLevel * lv;
  hpMax = Math.max(1, hpMax);
  const ac = armorClass(card, data, scores);
  const feats = featsOf(card, data);
  const opt = sp.choice && sp.choice.options[card.speciesChoice];
  let speed = (opt && opt.speed) || sp.speed;
  const { armor } = equipped(card, data);
  if (armor && armor.str && scores.STR < armor.str) speed -= 10;
  const init = mods.DEX + (feats.includes("alert") ? pb : 0);
  const perception = skills.find((s) => s.name === "Perception").bonus;
  const features = [
    ...c.features.filter((f) => f.lv <= lv),
    ...((c.subclasses.find((s) => s.id === card.subclassId) || { features: [] }).features.filter((f) => f.lv <= lv)),
  ];
  const resources = {};
  for (const [k, r] of Object.entries(c.resources || {})) {
    const n = r.byLevel[lv - 1];
    if (n) resources[k] = { name: r.name, max: n, recharge: r.recharge };
  }
  for (const t of sp.traits) {
    if (!t.uses || (t.minLevel && lv < t.minLevel)) continue;
    resources["sp:" + t.name] = { name: t.name, max: t.uses === "PB" ? pb : t.uses, recharge: t.recharge };
  }
  return {
    level: lv, pb, scores, mods, saves, skills, hpMax, ac: ac.ac, acNotes: ac.notes, speed, init,
    passivePerception: 10 + perception, darkvision: (opt && opt.darkvision) || sp.darkvision || 0,
    size: card.size || sp.size, features, feats: feats.map((id) => I.feat[id]).filter(Boolean),
    casting: castingInfo(card, data, scores, pb), alwaysPrepared: alwaysPrepared(card, data),
    speciesCantrips: speciesCantrips(card, data), attacks: attacks(card, data, scores, pb),
    weaponMastery: c.weaponMastery ? c.weaponMastery[lv - 1] : 0,
    sneakAttack: c.sneakAttack ? c.sneakAttack[lv - 1] : null, resources,
    xpNext: lv < data.classes.maxLevel ? data.classes.xp[lv] : null,
  };
}

// ---------- validation (used by the builder and when loading a friend's card) ----------
export function validate(card, data) {
  const I = index(data);
  const errs = [];
  const c = I.cls[card.classId], sp = I.species[card.speciesId], bg = I.bg[card.backgroundId];
  if (!card.name || !card.name.trim()) errs.push("ยังไม่ได้ตั้งชื่อ");
  if (!c) { errs.push("ยังไม่ได้เลือกคลาส"); return errs; }
  if (!sp) errs.push("ยังไม่ได้เลือกเผ่า");
  if (!bg) { errs.push("ยังไม่ได้เลือกพื้นเพ"); return errs; }
  if (!(card.level >= 1 && card.level <= data.classes.maxLevel)) errs.push("เลเวลต้องอยู่ระหว่าง 1–" + data.classes.maxLevel);
  if ((card.xp || 0) < xpForLevel(card.level, data)) errs.push("EXP ไม่พอสำหรับเลเวล " + card.level);
  // base scores
  const base = card.baseScores || {};
  if (card.abilityMethod === "standard") {
    const vals = ABILITIES.map((a) => base[a]).sort((x, y) => y - x);
    if (vals.join() !== data.origins.standardArray.join()) errs.push("Standard Array ต้องใช้ 15, 14, 13, 12, 10, 8 ครบทุกตัว");
  } else if (card.abilityMethod === "pointbuy") {
    const cost = pointBuyCost(base, data);
    if (cost === null) errs.push("Point Buy ใช้ได้เฉพาะค่า 8–15");
    else if (cost > data.origins.pointBudget) errs.push("Point Buy ใช้เกิน 27 แต้ม (" + cost + ")");
  } else if (card.abilityMethod === "roll") {
    if (ABILITIES.some((a) => !(base[a] >= 3 && base[a] <= 18))) errs.push("ค่าที่ทอยต้องอยู่ระหว่าง 3–18");
  } else errs.push("ยังไม่ได้เลือกวิธีกำหนดค่าสถานะ");
  // background bonus: +2/+1 or +1/+1/+1 on the background's three abilities
  const bb = card.bgBonus || {};
  const keys = Object.keys(bb);
  if (keys.some((k) => !bg.abilities.includes(k))) errs.push("โบนัสพื้นเพต้องอยู่ใน " + bg.abilities.join(", "));
  const vals = Object.values(bb).sort().join();
  if (!(vals === "1,2" || vals === "1,1,1")) errs.push("โบนัสพื้นเพต้องเป็น +2/+1 หรือ +1/+1/+1");
  // skills
  const picks = card.skills || [];
  if (picks.length !== c.skills.count) errs.push("เลือกทักษะคลาส " + c.skills.count + " อย่าง (ตอนนี้ " + picks.length + ")");
  if (picks.some((s) => !c.skills.from.includes(s))) errs.push("มีทักษะที่คลาสนี้เลือกไม่ได้");
  if (picks.some((s) => bg.skills.includes(s))) errs.push("ทักษะคลาสซ้ำกับทักษะจากพื้นเพ");
  if (sp && sp.skillChoice) {
    const n = (card.speciesSkills || []).length;
    if (n !== sp.skillChoice.count) errs.push("เลือกทักษะจากเผ่า " + sp.skillChoice.count + " อย่าง");
  }
  if (sp && sp.choice && !sp.choice.options[card.speciesChoice]) errs.push("ยังไม่ได้เลือก " + sp.choice.label);
  if (sp && sp.originFeat) {
    const f = I.feat[card.humanFeat];
    if (!f || f.cat !== "origin") errs.push("มนุษย์ต้องเลือก Origin Feat 1 อย่าง");
    if (f && !f.repeatable && f.id === bg.feat) errs.push("Origin Feat ซ้ำกับของพื้นเพ");
  }
  const allFeats = featsOf(card, data);
  if (allFeats.includes("skilled") && (card.skilledPicks || []).length !== 3 * allFeats.filter((x) => x === "skilled").length)
    errs.push("Skilled: เลือกทักษะเพิ่ม 3 อย่าง");
  // class choices by level
  const lv = card.level;
  const has = (name) => c.features.some((f) => f.name === name && f.lv <= lv);
  if (c.features.some((f) => f.choice === "fighting" && f.lv <= lv)) {
    const f = I.feat[card.fightingStyle];
    if (!f || f.cat !== "fighting") errs.push("เลือก Fighting Style");
  }
  if (card.classId === "rogue") {
    const ex = card.expertise || [];
    const prof = skillProfs(card, data);
    if (ex.length !== 2) errs.push("Expertise: เลือก 2 ทักษะ");
    if (ex.some((s) => !prof.has(s))) errs.push("Expertise ต้องเป็นทักษะที่ชำนาญแล้ว");
  }
  const wm = c.weaponMastery ? c.weaponMastery[lv - 1] : 0;
  if (wm) {
    const ms = card.masteries || [];
    if (ms.length !== wm) errs.push("Weapon Mastery: เลือกอาวุธ " + wm + " ชนิด (ตอนนี้ " + ms.length + ")");
    if (ms.some((id) => !I.items[id] || I.items[id].kind !== "weapon" || !weaponProficient(I.items[id], card, data))) errs.push("Weapon Mastery ต้องเป็นอาวุธที่ชำนาญ");
  }
  if (card.classId === "cleric" && !["Protector", "Thaumaturge"].includes(card.divineOrder)) errs.push("เลือก Divine Order");
  if (card.classId === "ranger" && lv >= 2 && (card.expertise || []).length !== 1) errs.push("Deft Explorer: เลือก Expertise 1 ทักษะ");
  if (card.classId === "wizard" && lv >= 2 && (card.expertise || []).length !== 1) errs.push("Scholar: เลือก Expertise 1 ทักษะ");
  if (lv >= 3 && !c.subclasses.some((s) => s.id === card.subclassId)) errs.push("เลเวล 3 ต้องเลือกสายย่อย");
  if (card.classId === "ranger" && lv >= 3 && !card.huntersPrey) errs.push("เลือก Hunter's Prey");
  if (has("Ability Score Improvement") && !(card.asi || []).some((p) => p.lv === 4)) errs.push("เลเวล 4: เลือกเพิ่มค่าสถานะหรือ Feat");
  for (const p of card.asi || []) {
    const n = Object.values(p.inc || {}).reduce((a, b) => a + b, 0);
    if (!p.feat && p.lv <= lv && n !== 2) errs.push("Ability Score Improvement ต้องเพิ่มรวม 2 แต้ม");
  }
  const fs = finalScores({ ...card, asi: [] }, data);
  for (const p of card.asi || []) for (const [a, v] of Object.entries(p.inc || {})) if (fs[a] + v > 20) errs.push(a + " เกิน 20");
  // spells
  const scores = finalScores(card, data);
  const pb = profBonus(lv);
  for (const ci of castingInfo(card, data, scores, pb)) {
    if (ci.source === "Magic Initiate") {
      const mi = card.magicInitiate;
      if ((mi.cantrips || []).length !== 2) errs.push("Magic Initiate: เลือก Cantrip 2 อย่าง");
      if (!mi.spell) errs.push("Magic Initiate: เลือกเวทเลเวล 1");
      continue;
    }
    const can = (card.cantrips || []);
    if (can.length !== ci.cantripsKnown) errs.push("เลือก Cantrip " + ci.cantripsKnown + " อย่าง (ตอนนี้ " + can.length + ")");
    const listOk = (id, maxLv) => { const s = I.spell[id]; return s && s.classes.includes(ci.list) && s.level <= maxLv; };
    if (can.some((id) => !listOk(id, 0))) errs.push("มี Cantrip ที่ไม่อยู่ในลิสต์ " + ci.list);
    const prep = card.spells || [];
    if (prep.length > ci.preparedMax) errs.push("เตรียมเวทได้ไม่เกิน " + ci.preparedMax);
    if (prep.some((id) => !listOk(id, ci.maxSpellLevel) || I.spell[id].level === 0)) errs.push("มีเวทที่เลเวลสูงเกินหรือไม่อยู่ในลิสต์");
    if (ci.spellbookSize) {
      const book = card.spellbook || [];
      if (book.length < ci.spellbookSize) errs.push("สมุดเวทต้องมี " + ci.spellbookSize + " เวท (ตอนนี้ " + book.length + ")");
      if (prep.some((id) => !book.includes(id))) errs.push("เวทที่เตรียมต้องอยู่ในสมุดเวท");
    }
  }
  if (bg.feat.startsWith("magic-initiate") && !(card.magicInitiate && card.magicInitiate.ability)) errs.push("Magic Initiate: เลือกค่าสถานะที่ใช้ร่าย");
  return [...new Set(errs)];
}

// ---------- card helpers ----------
export function newCard() {
  return {
    v: 1, id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: "", player: "", level: 1, xp: 0, classId: "", subclassId: "", speciesId: "", speciesChoice: "",
    backgroundId: "", bgBonus: {}, abilityMethod: "standard", baseScores: { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 },
    skills: [], speciesSkills: [], skilledPicks: [], expertise: [], humanFeat: "", fightingStyle: "", divineOrder: "",
    huntersPrey: "", masteries: [], cantrips: [], spells: [], spellbook: [], magicInitiate: null, asi: [], hpRolls: {},
    inventory: [], gp: 0, languages: ["Common"], alignment: "", appearance: "", backstory: "", portrait: "",
    state: { hp: null, tempHp: 0, slotsUsed: [], resUsed: {}, deathSaves: { ok: 0, fail: 0 }, conditions: [] },
  };
}

// Starting equipment from class + background package choices
export function startingInventory(card, data, classPkg, bgPkg) {
  const I = index(data);
  const c = I.cls[card.classId], bg = I.bg[card.backgroundId];
  const inv = [];
  let gp = 0;
  const add = (id, qty) => { const e = inv.find((x) => x.id === id); if (e) e.qty += qty; else inv.push({ id, qty, equipped: false }); };
  const cp = c.equip[classPkg] || c.equip.A;
  cp.items.forEach(([id, q]) => add(id, q)); gp += cp.gp;
  if (bgPkg === "A") { bg.equip.A.forEach(([id, q]) => add(id, q)); gp += bg.equip.Agp; } else gp += bg.equip.Bgp;
  // auto-equip best trained armor, shield, and keep weapons ready
  const train = armorTraining(card, data);
  const armors = inv.map((x) => I.items[x.id]).filter((it) => it && it.kind === "armor" && it.cat !== "shield" && train.has(it.cat));
  armors.sort((a, b) => b.ac - a.ac);
  if (armors[0]) inv.find((x) => x.id === armors[0].id).equipped = true;
  const sh = inv.find((x) => x.id === "shield");
  if (sh && train.has("shield")) sh.equipped = true;
  return { inventory: inv, gp };
}

// Level up: returns a new card with level+1 and records which choices are now needed
export function levelUpNeeds(card, data) {
  const c = index(data).cls[card.classId];
  const next = card.level + 1;
  const needs = [];
  if (next > data.classes.maxLevel) return needs;
  for (const f of c.features.filter((f) => f.lv === next)) {
    if (f.subclass) needs.push("subclass");
    if (f.choice === "asi") needs.push("asi");
    if (f.choice === "fighting") needs.push("fighting");
    if (f.choice === "expertise1" || f.choice === "scholar") needs.push("expertise");
  }
  if (card.classId === "ranger" && next === 3) needs.push("huntersPrey");
  if (c.weaponMastery && c.weaponMastery[next - 1] > c.weaponMastery[card.level - 1]) needs.push("mastery");
  if (c.spellcasting) needs.push("spells");
  return needs;
}

export function exportCard(card) {
  const { _sheet, ...rest } = card;
  return JSON.stringify({ format: "dnd-for-friend/card", ...rest }, null, 1);
}

export function importCard(text, data) {
  // accepts a raw card file or an AI answer with a ```json block / extra prose around it
  let src = String(text).trim();
  const fence = src.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) src = fence[1];
  const a = src.indexOf("{"), b = src.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("ไม่พบข้อมูลการ์ด");
  const obj = JSON.parse(src.slice(a, b + 1));
  if (obj.format !== "dnd-for-friend/card") throw new Error("ไม่ใช่การ์ดตัวละคร DnD for friend");
  delete obj.format;
  const card = { ...newCard(), ...obj };
  if (!obj.id) card.id = newCard().id;
  card.state = { ...newCard().state, ...(obj.state || {}) };
  for (const k of ["skills", "speciesSkills", "skilledPicks", "expertise", "masteries", "cantrips", "spells", "spellbook", "asi", "inventory", "languages"])
    if (!Array.isArray(card[k])) card[k] = [];
  const I = index(data);
  if (!card.inventory.length && I.cls[card.classId] && I.bg[card.backgroundId]) {
    const pick = card.equipPick || { cls: "A", bg: "A" };
    Object.assign(card, startingInventory(card, data, pick.cls, pick.bg));
  }
  return { card, errors: validate(card, data) };
}
