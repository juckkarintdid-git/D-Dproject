// DnD for friend · combat engine (phase 2)
// Grid combat on 5-ft squares. Code rolls every die and applies every rule; the DM only narrates.
// Rules from SRD 5.2.1 (CC-BY-4.0), simplified where noted.
import { computeSheet, mod, index, equipped } from "./rules.js";

// ---------- dice ----------
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
let RNG = Math.random;
export const setRng = (fn) => { RNG = fn; };
export const d = (n) => 1 + Math.floor(RNG() * n);
// roll("2d6+3") -> {total, rolls, mod, text}; crit doubles dice
export function roll(expr, opts = {}) {
  const e = String(expr).replace(/\s|−/g, (c) => (c === "−" ? "-" : ""));
  let total = 0; const rolls = []; let flat = 0;
  for (const part of e.match(/[+-]?[^+-]+/g) || []) {
    const sign = part.startsWith("-") ? -1 : 1;
    const p = part.replace(/^[+-]/, "");
    const m = p.match(/^(\d*)d(\d+)$/);
    if (m) {
      const n = (+m[1] || 1) * (opts.crit ? 2 : 1);
      for (let i = 0; i < n; i++) { const r = d(+m[2]); rolls.push(r); total += sign * r; }
    } else if (p) { flat += sign * +p; total += sign * +p; }
  }
  return { total: Math.max(opts.min ?? -999, total), rolls, mod: flat, text: e + (opts.crit ? " (crit)" : "") + " = " + (rolls.length ? "[" + rolls.join(",") + "]" + (flat ? (flat > 0 ? "+" : "") + flat : "") : flat) + " → " + total };
}
export function d20(adv = 0) {
  const a = d(20), b = d(20);
  const v = adv > 0 ? Math.max(a, b) : adv < 0 ? Math.min(a, b) : a;
  return { v, rolls: adv ? [a, b] : [a], adv };
}

// ---------- geometry ----------
export const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 5; // feet, diagonals = 5 ft
export const key = (x, y) => x + "," + y;
export function lineCells(a, b) {
  const cells = []; let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) { cells.push({ x: x0, y: y0 }); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  return cells;
}
export function hasLOS(state, a, b) {
  const cells = lineCells(a, b);
  for (let i = 1; i < cells.length - 1; i++) if (state.map.walls[key(cells[i].x, cells[i].y)]) return false;
  return true;
}
// cells covered by an area. origin = caster cell, point = aimed cell
export function areaCells(state, shape, size, origin, point) {
  const out = []; const r = size / 5;
  const W = state.map.w, H = state.map.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = { x, y }; let inside = false;
    if (shape === "sphere" || shape === "cylinder") inside = Math.max(Math.abs(x - point.x), Math.abs(y - point.y)) <= r - 0 && dist(c, point) <= size;
    else if (shape === "emanation") inside = dist(c, origin) <= size && !(x === origin.x && y === origin.y);
    else if (shape === "cube") {
      // cube starts adjacent to the caster toward the point
      const dx = Math.sign(point.x - origin.x), dy = Math.sign(point.y - origin.y);
      const x0 = dx >= 0 ? origin.x + (dx ? 1 : -Math.floor((r - 1) / 2)) : origin.x - r;
      const y0 = dy >= 0 ? origin.y + (dy ? 1 : -Math.floor((r - 1) / 2)) : origin.y - r;
      inside = x >= x0 && x < x0 + r && y >= y0 && y < y0 + r;
    } else if (shape === "cone") {
      const vx = point.x - origin.x, vy = point.y - origin.y, cx = x - origin.x, cy = y - origin.y;
      const len = Math.hypot(cx, cy), vl = Math.hypot(vx, vy) || 1;
      inside = len > 0 && dist(c, origin) <= size && (cx * vx + cy * vy) / (len * vl) >= 0.7;
    } else if (shape === "line") {
      const cells = lineCells(origin, { x: origin.x + Math.round((point.x - origin.x) * 100), y: origin.y + Math.round((point.y - origin.y) * 100) });
      inside = cells.slice(1, r + 1).some((q) => q.x === x && q.y === y);
    }
    if (inside && !state.map.walls[key(x, y)] && hasLOS(state, shape === "sphere" ? point : origin, c)) out.push(c);
  }
  return out;
}

// ---------- monster tiers ----------
export const TIERS = {
  normal: { th: "มอนปกติ", hp: 1, ac: 0, hit: 0, legendary: 0, phase2: false },
  subboss: { th: "Sub Boss", hp: 1.6, ac: 1, hit: 1, legendary: 0, phase2: false, menu: true },
  boss: { th: "Boss", hp: 2.5, ac: 2, hit: 2, legendary: 2, phase2: true, menu: true, legRes: 1 },
};
// 2024 encounter XP budget per character (low / moderate / high), levels 1-5
export const XP_BUDGET = { 1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100] };
export function encounterXP(monsters, data) {
  const mons = Object.fromEntries(data.monsters.map((m) => [m.id, m]));
  return monsters.reduce((s, e) => s + (mons[e.id] ? mons[e.id].xp * (e.tier === "boss" ? 3 : e.tier === "subboss" ? 2 : 1) * (e.count || 1) : 0), 0);
}
export function difficulty(xp, levels) {
  const sum = (i) => levels.reduce((s, l) => s + XP_BUDGET[Math.min(5, Math.max(1, l))][i], 0);
  return xp <= sum(0) ? "ง่าย" : xp <= sum(1) ? "ปานกลาง" : xp <= sum(2) ? "ยาก" : "อันตรายมาก";
}

// ---------- combatants ----------
const SIZE = { Tiny: 1, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 };
export function pcUnit(card, data, live = {}) {
  const sh = computeSheet(card, data);
  const I = index(data);
  const extra = sh.features.some((f) => f.name === "Extra Attack") ? 2 : 1;
  const slots = (sh.casting.find((c) => c.slots) || {}).slots || [];
  const st = card.state || {};
  return {
    id: "pc-" + card.id, side: "pc", kind: "pc", cardId: card.id, owner: card.owner || null, name: card.name, classId: card.classId,
    level: card.level, portrait: card.portrait || "", size: 1, x: 0, y: 0,
    maxHp: sh.hpMax, hp: live.hp ?? st.hp ?? sh.hpMax, tempHp: live.tempHp ?? st.tempHp ?? 0, ac: sh.ac, baseAc: sh.ac, speed: sh.speed,
    initMod: sh.init, mods: sh.mods, saves: Object.fromEntries(sh.saves.map((s) => [s.ab, s.bonus])), pb: sh.pb,
    passive: sh.passivePerception,
    attacks: sh.attacks.map((a) => ({ name: a.name, id: a.id, hit: a.hit, dmg: a.dmg, dtype: a.dtype, range: a.range ? (Array.isArray(a.range) ? a.range : String(a.range).split("/").map(Number)) : null,
      melee: !a.range || a.props.includes("Thrown"), thrown: a.props.includes("Thrown"), reach: a.props.includes("Reach") ? 10 : 5,
      finesse: a.props.includes("Finesse"), twoHanded: a.props.includes("Two-Handed"), ranged: !!a.range && !a.props.includes("Thrown"), light: a.props.includes("Light"), mastery: a.mastery, versatile: a.versatile })),
    extraAttacks: extra, sneak: sh.sneakAttack, casting: sh.casting.find((c) => c.slots) || null, mi: sh.casting.find((c) => c.source === "Magic Initiate") || null,
    cantrips: [...(card.cantrips || []), ...sh.speciesCantrips, ...((card.magicInitiate && card.magicInitiate.cantrips) || [])],
    spells: [...new Set([...sh.alwaysPrepared, ...(card.spells || []), ...((card.magicInitiate && card.magicInitiate.spell) ? [card.magicInitiate.spell] : [])])].filter((id) => I.spell[id] && I.spell[id].level > 0),
    slots, slotsUsed: [...(live.slotsUsed ?? st.slotsUsed ?? [])], miUsed: live.miUsed ?? false,
    resources: Object.fromEntries(Object.entries(sh.resources).map(([k, r]) => [k, { name: r.name, max: r.max, used: (live.resUsed ?? st.resUsed ?? {})[k] || 0 }])),
    features: sh.features.map((f) => f.name), feats: sh.feats.map((f) => f.id), fightingStyle: card.fightingStyle, huntersPrey: card.huntersPrey,
    subclassId: card.subclassId, masteries: card.masteries || [],
    conditions: [...(live.conditions ?? st.conditions ?? [])], deathSaves: { ...(live.deathSaves ?? st.deathSaves ?? { ok: 0, fail: 0 }) },
    armorWorn: !!equipped(card, data).armor,
    dead: live.dead ?? st.dead ?? false, stable: false, effects: [], conc: null, darkvision: sh.darkvision,
    hitDice: live.hitDice ?? card.level, hitDie: index(data).cls[card.classId].hitDie,
  };
}
export function monsterUnit(mon, tier = "normal", n = 1, partySize = 4) {
  const T = TIERS[tier] || TIERS.normal;
  const sizeWord = (mon.type || "").split(" ")[0];
  const scale = tier === "boss" ? Math.max(0.6, partySize / 4) : 1;
  const hp = Math.round(mon.hp * T.hp * scale);
  const acts = (mon.actions || []).filter((a) => a.type === "attack" || a.type === "save" || a.type === "multi");
  return {
    id: "m-" + mon.id + "-" + n + "-" + Math.floor(RNG() * 1e6).toString(36), side: "foe", kind: "monster", monId: mon.id, tier,
    name: mon.name + (tier === "boss" ? " (Boss)" : tier === "subboss" ? " (Sub Boss)" : n > 1 ? " " + n : ""),
    size: SIZE[sizeWord] || 1, x: 0, y: 0, maxHp: hp, hp, tempHp: 0, ac: mon.ac + T.ac, baseAc: mon.ac + T.ac, speed: mon.speed, fly: mon.fly || 0,
    initMod: mon.init, mods: Object.fromEntries(Object.entries(mon.abilities || {}).map(([k, v]) => [k, mod(v)])), saves: { ...(mon.saves || {}) },
    hitBonus: T.hit, actions: acts, traits: (mon.traits || []).map((t) => t.name), resist: mon.resistances || "", immune: mon.immunities || "", vuln: mon.vulnerabilities || "",
    recharge: {}, perDay: {}, legendary: T.legendary, legLeft: T.legendary, legRes: T.legRes || 0, phase2: T.phase2, enraged: false,
    conditions: [], effects: [], conc: null, dead: false, xp: mon.xp * (tier === "boss" ? 3 : tier === "subboss" ? 2 : 1), cr: mon.cr,
    profile: inferProfile(mon), packTactics: (mon.traits || []).some((t) => t.name === "Pack Tactics"),
  };
}
export function inferProfile(mon) {
  const acts = mon.actions || [];
  const ranged = acts.filter((a) => a.type === "attack" && (a.kind === "ranged")).reduce((m, a) => Math.max(m, a.avg || 0), 0);
  const melee = acts.filter((a) => a.type === "attack" && a.kind !== "ranged").reduce((m, a) => Math.max(m, a.avg || 0), 0);
  const int = (mon.abilities || {}).INT || 10;
  if ((mon.bonus || []).some((b) => /Disengage/.test(b.text))) return "skirmisher";
  if (ranged > melee) return "archer";
  if ((mon.traits || []).some((t) => t.name === "Pack Tactics")) return "pack";
  if (int <= 3 || /Undead|Ooze|Construct/.test(mon.type)) return "mindless";
  return "brute";
}

// ---------- state ----------
// JSON-safe copy for saving/syncing (indexes are re-attached with attachData)
export function serialize(state) { const { spellIndex, monIndex, ...rest } = state; return JSON.parse(JSON.stringify(rest)); }
export function attachData(state, data) { state.spellIndex = index(data).spell; state.monIndex = Object.fromEntries((data.monsters || []).map((m) => [m.id, m])); return state; }
export function newCombat(map, units, data) {
  const st = { round: 0, turn: -1, order: [], units: Object.fromEntries(units.map((u) => [u.id, u])), map, log: [], over: null, xpPool: 0, seq: 0 };
  if (data) { st.spellIndex = index(data).spell; st.monIndex = Object.fromEntries((data.monsters || []).map((m) => [m.id, m])); }
  return st;
}
export function log(state, text, extra = {}) { state.seq++; state.log.push({ n: state.seq, r: state.round, text, ...extra }); if (state.log.length > 300) state.log.shift(); return text; }
export const alive = (u) => u && !u.dead && u.hp > 0;
export const conscious = (u) => alive(u) && !hasCond(u, "Unconscious");
export const hasCond = (u, c) => u.conditions.includes(c);
export function addCond(u, c) { if (!u.conditions.includes(c)) u.conditions.push(c); }
export function delCond(u, c) { u.conditions = u.conditions.filter((x) => x !== c); }
export const current = (state) => state.units[state.order[state.turn]];
export const foesOf = (state, u) => Object.values(state.units).filter((o) => o.side !== u.side && alive(o));
export const alliesOf = (state, u) => Object.values(state.units).filter((o) => o.side === u.side && o.id !== u.id && alive(o));
export function occupied(state, x, y, except) {
  return Object.values(state.units).find((u) => u.id !== except && !u.dead && (u.hp > 0 || u.kind === "pc") && x >= u.x && x < u.x + u.size && y >= u.y && y < u.y + u.size);
}

export function rollInitiative(state) {
  for (const u of Object.values(state.units)) {
    const adv = u.feats && u.feats.includes("alert") ? 0 : 0;
    const r = d20(adv);
    u.init = r.v + u.initMod; u.initRoll = r.v;
  }
  state.order = Object.values(state.units).filter((u) => !u.dead).sort((a, b) => b.init - a.init || b.initMod - a.initMod || (a.side === "pc" ? -1 : 1)).map((u) => u.id);
  state.round = 1; state.turn = -1;
  log(state, "ทอย Initiative: " + state.order.map((id) => state.units[id].name + " " + state.units[id].init).join(" · "), { kind: "init" });
  return nextTurn(state);
}

// ---------- turns ----------
export function startTurn(state, u) {
  u.turn = { action: 1, bonus: 1, reaction: 1, move: effSpeed(u), moved: 0, attacksLeft: 0, sneakUsed: false, disengage: false, dashed: false, offhand: false };
  u.reactionUsed = false;
  if (hasCond(u, "Dodging")) delCond(u, "Dodging");
  // effects that end at start of own turn
  u.effects = u.effects.filter((e) => !(e.until === "startOfTurn" && e.src === u.id));
  for (const e of [...u.effects]) if (e.endRound && state.round >= e.endRound) { removeEffect(state, u, e); log(state, "ฤทธิ์ " + e.name + " ของ " + u.name + " หมดแล้ว"); }
  for (const o of Object.values(state.units)) o.effects = o.effects.filter((e) => !(e.until === "startOfSourceTurn" && e.src === u.id));
  if (u.kind === "monster") {
    for (const a of u.actions) if (a.recharge && u.recharge[a.name] === false) { const r = d(6); if (r >= a.recharge) { u.recharge[a.name] = true; log(state, u.name + " ชาร์จ " + a.name + " คืน (ทอย " + r + ")"); } }
    u.legLeft = u.legendary;
  }
  // spirit guardians etc: damage auras of enemies
  for (const o of Object.values(state.units)) for (const e of o.effects) if (e.aura && o.side !== u.side && alive(o) && dist(o, u) <= e.aura.size && alive(u)) {
    const save = savingThrow(u, e.aura.ab, e.aura.dc);
    const dmg = roll(e.aura.dmg).total;
    const amt = save.ok ? Math.floor(dmg / 2) : dmg;
    log(state, u.name + " โดน " + e.name + " ของ " + o.name + " เซฟ " + e.aura.ab + " " + save.total + " vs DC " + e.aura.dc + (save.ok ? " ผ่าน" : " ไม่ผ่าน") + " เสีย " + amt);
    damage(state, u, amt, e.aura.dtype, o);
  }
  if (u.kind === "pc" && u.hp <= 0 && !u.dead && !u.stable) {
    // death save
    const r = d(20);
    if (r === 20) { u.hp = 1; delCond(u, "Unconscious"); u.deathSaves = { ok: 0, fail: 0 }; log(state, u.name + " ทอย Death Save ได้ 20! ฟื้นขึ้นมามี HP 1", { kind: "death" }); }
    else if (r === 1) u.deathSaves.fail += 2;
    else if (r >= 10) u.deathSaves.ok++;
    else u.deathSaves.fail++;
    if (r !== 20) log(state, u.name + " ทอย Death Save ได้ " + r + " (ผ่าน " + u.deathSaves.ok + "/3 · พลาด " + u.deathSaves.fail + "/3)", { kind: "death" });
    if (u.deathSaves.fail >= 3) { u.dead = true; log(state, u.name + " เสียชีวิต…", { kind: "death" }); }
    else if (u.deathSaves.ok >= 3) { u.stable = true; log(state, u.name + " อาการคงที่ (หมดสติแต่ไม่ตาย)", { kind: "death" }); }
    u.turn.action = 0; u.turn.bonus = 0; u.turn.move = 0;
  }
  if (hasCond(u, "Paralyzed") || hasCond(u, "Incapacitated") || hasCond(u, "Unconscious") || hasCond(u, "Stunned")) { u.turn.action = 0; u.turn.bonus = 0; if (!hasCond(u, "Incapacitated")) u.turn.move = 0; }
  return u;
}
export function effSpeed(u) {
  let s = u.speed;
  if (hasCond(u, "Grappled") || hasCond(u, "Restrained") || hasCond(u, "Paralyzed") || hasCond(u, "Unconscious")) return 0;
  for (const e of u.effects) if (e.speed) s += e.speed;
  if (hasCond(u, "Prone")) s = Math.floor(s / 2);
  return Math.max(0, s);
}
export function endTurn(state) {
  const u = current(state);
  if (u) {
    // saves at end of turn against ongoing conditions
    for (const e of [...u.effects]) if (e.endSave && alive(u)) {
      const s = savingThrow(u, e.endSave.ab, e.endSave.dc);
      log(state, u.name + " เซฟ " + e.endSave.ab + " ต่อ " + e.name + ": " + s.total + " vs " + e.endSave.dc + (s.ok ? " หลุดแล้ว" : " ยังติด"));
      if (s.ok) removeEffect(state, u, e);
    }
    u.effects = u.effects.filter((e) => !(e.until === "endOfTurn" && e.src === u.id));
    for (const o of Object.values(state.units)) o.effects = o.effects.filter((e) => !(e.until === "endOfSourceTurn" && e.src === u.id));
  }
  return nextTurn(state);
}
// Lair actions: a boss's lair strikes at the start of every round (initiative 20), one hazard per boss
const LAIR = {
  "red-dragon-wyrmling": { name: "แมกมาปะทุจากพื้นรัง", n: 2, ab: "DEX", dc: 13, dmg: "2d6", dtype: "Fire" },
  "cultist-fanatic": { name: "เปลวไฟพุ่งจากแท่นบูชา", n: 2, ab: "DEX", dc: 13, dmg: "2d6", dtype: "Fire" },
  "goblin-boss": { name: "หินถล่มจากเพดานถ้ำ", n: 1, ab: "DEX", dc: 12, dmg: "1d10", dtype: "Bludgeoning" },
  "ghast": { name: "มือคนตายโผล่จากพื้นกระชากขา", n: 1, ab: "STR", dc: 12, dmg: "1d8", dtype: "Necrotic", cond: "Prone" },
  "bandit-captain": { name: "ลูกน้องบนกำแพงยิงธนูลงมา", n: 1, ab: "DEX", dc: 12, dmg: "1d8", dtype: "Piercing" },
};
export function lairActions(state) {
  for (const b of Object.values(state.units)) {
    if (b.tier !== "boss" || b.kind !== "monster" || b.hp <= 0) continue;
    const L = LAIR[b.monId] || { name: "พลังมืดของรังระเบิดออก", n: 1, ab: "DEX", dc: 12, dmg: "1d10", dtype: "Force" };
    const pcs = Object.values(state.units).filter((u) => u.side !== b.side && !u.dead && u.hp > 0);
    if (!pcs.length) return;
    const picks = [...pcs].sort(() => Math.random() - 0.5).slice(0, L.n);
    log(state, "🌋 Lair Action: " + L.name + "!", { kind: "lair" });
    for (const t of picks) {
      const s = savingThrow(t, L.ab, L.dc); const r = roll(L.dmg); const amt = s.ok ? Math.floor(r.total / 2) : r.total;
      log(state, t.name + " เซฟ " + L.ab + " " + s.total + " vs DC " + L.dc + (s.ok ? " ผ่าน (โดนครึ่งเดียว)" : " ไม่ผ่าน") + " · " + amt + " " + L.dtype, { kind: "check", who: t.name, label: L.ab + " save", roll: s.roll ? s.roll.v : s.total, total: s.total, dc: L.dc, ok: s.ok });
      if (amt > 0) damage(state, t, amt, L.dtype, b);
      if (!s.ok && L.cond && t.hp > 0) addCond(t, L.cond);
    }
  }
}
export function nextTurn(state) {
  if (checkOver(state)) return null;
  for (let guard = 0; guard < state.order.length * 2 + 2; guard++) {
    state.turn++;
    if (state.turn >= state.order.length) { state.turn = 0; state.round++; log(state, "— รอบที่ " + state.round + " —", { kind: "round" }); lairActions(state); if (checkOver(state)) return null; }
    const u = current(state);
    if (!u || u.dead || (u.kind === "monster" && u.hp <= 0)) continue;
    startTurn(state, u);
    if (checkOver(state)) return null;
    return u;
  }
  return null;
}
export function checkOver(state) {
  if (state.over) return state.over;
  const pcs = Object.values(state.units).filter((u) => u.side === "pc");
  const foes = Object.values(state.units).filter((u) => u.side === "foe");
  if (foes.length && foes.every((u) => !alive(u))) {
    state.over = "win";
    const xp = foes.reduce((s, u) => s + (u.xp || 0), 0);
    state.xpPool = xp;
    log(state, "ชนะ! ได้ EXP รวม " + xp, { kind: "over" });
  } else if (pcs.length && pcs.every((u) => u.dead || u.hp <= 0)) {
    state.over = "lose"; log(state, "ทุกคนล้มหมดแล้ว…", { kind: "over" });
  }
  return state.over;
}

// ---------- saves, damage, healing ----------
export function savingThrow(u, ab, dc, opts = {}) {
  let adv = 0;
  if (["STR", "DEX"].includes(ab) && (hasCond(u, "Paralyzed") || hasCond(u, "Unconscious") || hasCond(u, "Stunned"))) return { total: 0, ok: false, auto: true, ab, dc };
  if (ab === "DEX" && hasCond(u, "Restrained")) adv--;
  if (hasCond(u, "Dodging") && ab === "DEX") adv++;
  if (opts.adv) adv += opts.adv;
  const r = d20(Math.sign(adv));
  let bonus = u.saves[ab] ?? (u.mods ? u.mods[ab] || 0 : 0);
  for (const e of u.effects) if (e.saveDie) bonus += (e.saveDie > 0 ? 1 : -1) * roll("1d" + Math.abs(e.saveDie)).total;
  for (const e of u.effects) { if (e.saveFlat && e.saveFlat[ab]) bonus += e.saveFlat[ab]; if (e.oneShot === "save") { bonus += roll("1d4").total; e.oneShot = null; } }
  const total = r.v + bonus;
  let ok = total >= dc;
  if (!ok && u.legRes > 0 && opts.allowLegRes !== false && u.kind === "monster") { u.legRes--; ok = true; return { total, ok, legRes: true, ab, dc, roll: r }; }
  return { total, ok, ab, dc, roll: r };
}
const listHas = (txt, dtype) => new RegExp("\\b" + dtype + "\\b", "i").test(txt.split(";")[0]) || (/Nonmagical|Bludgeoning, Piercing, and Slashing/i.test(txt) && /Bludgeoning|Piercing|Slashing/.test(dtype));
export function damage(state, u, amount, dtype, src, opts = {}) {
  if (!alive(u) && !(u.kind === "pc" && u.hp <= 0 && !u.dead)) return 0;
  let amt = Math.max(0, Math.floor(amount));
  if (u.immune && dtype && listHas(u.immune, dtype)) { log(state, u.name + " ไม่รับดาเมจ " + dtype); return 0; }
  if (u.resist && dtype && listHas(u.resist, dtype)) amt = Math.floor(amt / 2);
  if (u.vuln && dtype && listHas(u.vuln, dtype)) amt *= 2;
  for (const e of u.effects) if (e.resistAll) amt = Math.floor(amt / 2);
  if (dtype && u.effects.some((e) => e.resist === dtype) && !(u.resist && listHas(u.resist, dtype))) amt = Math.floor(amt / 2);
  if (u.tempHp) { const t = Math.min(u.tempHp, amt); u.tempHp -= t; amt -= t; }
  if (u.kind === "pc" && u.hp <= 0) {
    // damage while down = failed death save(s)
    u.deathSaves.fail += opts.crit ? 2 : 1; u.stable = false;
    log(state, u.name + " โดนตีตอนหมดสติ: Death Save พลาด " + u.deathSaves.fail + "/3", { kind: "death" });
    if (u.deathSaves.fail >= 3) { u.dead = true; log(state, u.name + " เสียชีวิต…", { kind: "death" }); }
    return amt;
  }
  const before = u.hp;
  u.hp -= amt;
  if (hasCond(u, "Unconscious") && u.effects.some((e) => e.wakeOnDamage)) { delCond(u, "Unconscious"); u.effects = u.effects.filter((e) => !e.wakeOnDamage); log(state, u.name + " ตื่นเพราะโดนตี"); }
  if (u.conc && amt > 0 && u.hp > 0) {
    const dc = Math.min(30, Math.max(10, Math.floor(amt / 2)));
    const s = savingThrow(u, "CON", dc, { allowLegRes: false });
    if (!s.ok) { log(state, u.name + " เสียสมาธิ (CON " + s.total + " vs " + dc + ") " + u.conc.name + " หายไป"); endConc(state, u); }
  }
  if (u.hp <= 0) {
    if (u.kind === "pc") {
      if (-u.hp >= u.maxHp) { u.dead = true; u.hp = 0; log(state, u.name + " โดนดาเมจรุนแรงจนเสียชีวิตทันที", { kind: "death" }); }
      else { u.hp = 0; addCond(u, "Unconscious"); addCond(u, "Prone"); u.deathSaves = { ok: 0, fail: 0 }; u.stable = false; log(state, u.name + " ล้มลง หมดสติ!", { kind: "down" }); }
      if (u.conc) endConc(state, u);
    } else {
      u.hp = 0; u.dead = true; log(state, u.name + " ถูกโค่นแล้ว", { kind: "kill" });
      if (u.conc) endConc(state, u);
      // effects this unit maintained end
      for (const o of Object.values(state.units)) o.effects = o.effects.filter((e) => e.src !== u.id || e.keepOnDeath);
    }
  } else if (u.phase2 && !u.enraged && u.hp <= u.maxHp / 2 && before > u.maxHp / 2) {
    u.enraged = true; u.hitBonus += 2; u.speed += 10;
    for (const k of Object.keys(u.recharge)) u.recharge[k] = true;
    log(state, u.name + " เข้าสู่เฟส 2! โกรธจัด ตีแม่นขึ้นและเร็วขึ้น", { kind: "phase" });
  }
  checkOver(state);
  return amt;
}
export function heal(state, u, amount, src) {
  if (u.dead) return 0;
  const was = u.hp;
  u.hp = Math.min(u.maxHp, u.hp + Math.max(0, amount));
  if (was <= 0 && u.hp > 0) { delCond(u, "Unconscious"); u.deathSaves = { ok: 0, fail: 0 }; u.stable = false; log(state, u.name + " ฟื้นขึ้นมาแล้ว!"); }
  return u.hp - was;
}
export function endConc(state, u) {
  if (!u.conc) return;
  const id = u.conc.id;
  for (const o of Object.values(state.units)) for (const e of [...o.effects]) if (e.concId === id) removeEffect(state, o, e);
  u.conc = null;
}
export function removeEffect(state, u, e) {
  u.effects = u.effects.filter((x) => x !== e);
  if (e.cond && !u.effects.some((x) => x.cond === e.cond)) delCond(u, e.cond);
  if (e.ac) u.ac -= e.ac;
  if (e.maxHp) { u.maxHp -= e.maxHp; u.hp = Math.min(u.hp, u.maxHp); }
}
export function addEffect(state, u, e) {
  u.effects.push(e);
  if (e.cond) addCond(u, e.cond);
  if (e.ac) u.ac += e.ac;
  if (e.maxHp) { u.maxHp += e.maxHp; u.hp += e.maxHp; }
  return e;
}
function startConc(state, caster, name) {
  if (caster.conc) { log(state, caster.name + " เลิกสมาธิ " + caster.conc.name); endConc(state, caster); }
  caster.conc = { id: caster.id + ":" + (++state.seq), name };
  return caster.conc.id;
}

// ---------- attacks ----------
export function attackAdvantage(state, a, t, ranged) {
  let adv = 0; const why = [];
  if (hasCond(a, "Poisoned")) { adv--; why.push("ติดพิษ"); }
  if (hasCond(a, "Prone")) { adv--; why.push("ผู้ตีล้มอยู่"); }
  if (hasCond(a, "Restrained")) { adv--; why.push("ผู้ตีถูกพันธนาการ"); }
  if (hasCond(a, "Blinded")) { adv--; why.push("ผู้ตีมองไม่เห็น"); }
  if (hasCond(a, "Frightened")) { adv--; why.push("กลัว"); }
  if (hasCond(t, "Prone")) { if (dist(a, t) <= 5) { adv++; why.push("เป้าล้ม"); } else { adv--; why.push("เป้าล้มระยะไกล"); } }
  if (hasCond(t, "Restrained") || hasCond(t, "Paralyzed") || hasCond(t, "Unconscious") || hasCond(t, "Stunned") || hasCond(t, "Blinded")) { adv++; why.push("เป้าขยับไม่ได้"); }
  if (hasCond(t, "Dodging")) { adv--; why.push("เป้าหลบ"); }
  if (t.effects.some((e) => e.markedAdv)) { adv++; why.push("Guiding Bolt"); }
  if (a.effects.some((e) => e.helped)) { adv++; why.push("เพื่อนช่วย"); }
  if (a.effects.some((e) => e.name === "Sap")) { adv--; why.push("Sap"); }
  if (t.effects.some((e) => e.markedAdvBy === a.id)) { adv++; why.push("Vex"); }
  if (ranged && foesOf(state, a).some((f) => conscious(f) && dist(f, a) <= 5)) { adv--; why.push("ยิงตอนศัตรูประชิด"); }
  if (a.packTactics && alliesOf(state, a).some((o) => conscious(o) && dist(o, t) <= 5)) { adv++; why.push("Pack Tactics"); }
  return { adv: Math.sign(adv), why };
}
// one attack roll; atk = {name, hit, dmg, dtype, ranged, melee, extra, cond, spell}
export function resolveAttack(state, a, t, atk, opts = {}) {
  const ranged = !!(atk.ranged || opts.ranged);
  const { adv, why } = attackAdvantage(state, a, t, ranged);
  const r = d20(adv);
  let bonus = atk.hit + (a.hitBonus || 0);
  let blessTxt = "";
  for (const e of a.effects) if (e.attackDie) { const b = roll("1d" + Math.abs(e.attackDie)).total * Math.sign(e.attackDie); bonus += b; blessTxt += (b >= 0 ? " +" : " ") + b + " (" + e.name + ")"; }
  for (const e of a.effects) {
    if (e.atkFlat) { bonus += e.atkFlat; blessTxt += (e.atkFlat >= 0 ? " +" : " ") + e.atkFlat + " (ยา)"; }
    if (e.oneShot === "attack") { const b = roll("1d4").total; bonus += b; blessTxt += " +" + b + " (ยา d4)"; e.oneShot = null; }
  }
  const total = r.v + bonus;
  const autoCrit = (hasCond(t, "Paralyzed") || hasCond(t, "Unconscious")) && dist(a, t) <= 5;
  const critRange = a.subclassId === "champion" && !atk.spell ? 19 : 20;
  const crit = r.v >= critRange || (autoCrit && r.v !== 1 && total >= t.ac);
  let hit = r.v !== 1 && (r.v >= critRange || total >= t.ac);
  // Shield spell reaction: a wizard with Shield prepared and a slot auto-casts if it turns a hit into a miss
  if (hit && !crit && t.kind === "pc" && t.autoShield !== false && t.spells && t.spells.includes("shield") && !t.reactionUsed && total < t.ac + 5 && spendSlot(t, 1)) {
    t.reactionUsed = true; addEffect(state, t, { name: "Shield", ac: 5, until: "startOfTurn", src: t.id });
    log(state, t.name + " ร่าย Shield (Reaction) AC +5 จนถึงตาถัดไป"); hit = false;
  }
  t.effects.filter((e) => e.markedAdv || e.markedAdvBy === a.id).forEach((e) => removeEffect(state, t, e));
  a.effects.filter((e) => e.name === "Sap").forEach((e) => removeEffect(state, a, e));
  a.effects.filter((e) => e.helped).forEach((e) => removeEffect(state, a, e));
  const rollTxt = (r.rolls.length > 1 ? "[" + r.rolls.join(",") + "]" + (adv > 0 ? " ได้เปรียบ" : " เสียเปรียบ") : r.v) + (bonus >= 0 ? " +" : " ") + (atk.hit + (a.hitBonus || 0)) + blessTxt + " = " + total;
  let txt = a.name + " " + (atk.verb || "โจมตี") + " " + t.name + " ด้วย " + atk.name + ": 🎲 " + rollTxt + " vs AC " + t.ac;
  if (why.length) txt += " (" + why.join(", ") + ")";
  const ev = { kind: "attack", a: a.id, t: t.id, hit, crit, roll: r.v, total, adv };
  if (!hit) { log(state, txt + (r.v === 1 ? " · พลาดเต็มๆ (1)" : " · พลาด"), ev); grazeOnMiss(state, a, t, atk); return { hit: false }; }
  let dmgExpr = atk.dmg;
  let extra = [];
  if (atk.extra && (!atk.extra.ifAdv || adv > 0)) extra.push([atk.extra.dmg, atk.extra.dtype]);
  // rogue sneak attack: finesse/ranged weapon, once per turn, advantage or ally adjacent to target and no disadvantage
  if (a.sneak && !atk.spell && (atk.finesse || atk.ranged) && a.turn && !a.turn.sneakUsed && adv >= 0 &&
      (adv > 0 || alliesOf(state, a).some((o) => conscious(o) && dist(o, t) <= 5))) { extra.push([a.sneak, atk.dtype]); a.turn.sneakUsed = true; ev.sneak = true; }
  for (const e of t.effects) if (e.markBy === a.id && e.markDmg) extra.push([e.markDmg, e.markType || atk.dtype]);
  if (a.huntersPrey === "Colossus Slayer" && t.hp < t.maxHp && a.turn && !a.turn.colossus && !atk.spell) { extra.push(["1d8", atk.dtype]); a.turn.colossus = true; }
  const main = roll(dmgExpr, { crit, min: atk.spell ? 0 : 1 });
  let total2 = main.total;
  // Great Weapon Fighting: 1s and 2s on damage dice count as 3 (two-handed melee)
  if (a.fightingStyle === "great-weapon-fighting" && !atk.ranged && atk.twoHanded) total2 += main.rolls.reduce((s, x) => s + (x < 3 ? 3 - x : 0), 0);
  const parts = [main.text];
  for (const [ex, ty] of extra) { const rr = roll(ex, { crit }); total2 += rr.total; parts.push(rr.text + (ty && ty !== atk.dtype ? " " + ty : "")); }
  if (a.effects.some((e) => e.weaponBonus) && !atk.spell) total2 += 1;
  log(state, txt + (crit ? " · คริติคอล!" : " · โดน") + " ดาเมจ " + parts.join(" + ") + " = " + total2 + " " + (atk.dtype || ""), { ...ev, dmg: total2 });
  const dealt = damage(state, t, total2, atk.dtype, a, { crit });
  // on-hit riders
  if (alive(t) && atk.cond && !atk.condSave) { addCond(t, atk.cond); log(state, t.name + " ติดสภาพ " + atk.cond); }
  if (alive(t) && atk.mastery && !atk.spell) applyMastery(state, a, t, atk);
  for (const e of [...a.effects]) if (e.nextHit && alive(t) && !atk.spell) {
    const nh = e.nextHit; const s = savingThrow(t, nh.ab, nh.dc);
    log(state, t.name + " เซฟ " + nh.ab + " " + s.total + " vs " + nh.dc + (s.ok ? " หลุดได้" : " ถูกรัด! (" + nh.effect.cond + ")"));
    if (!s.ok) addEffect(state, t, { ...nh.effect, src: a.id, concId: e.concId, endSave: { ab: nh.ab, dc: nh.dc } });
    a.effects = a.effects.filter((x) => x !== e);
  }
  return { hit: true, crit, dmg: dealt };
}
function grazeOnMiss(state, a, t, atk) {
  if (atk.mastery === "Graze" && alive(t)) { const m = Math.max(a.mods.STR, atk.finesse ? a.mods.DEX : -9); if (m > 0) { log(state, "Graze: " + t.name + " เสีย " + m + " แม้ตีพลาด"); damage(state, t, m, atk.dtype, a); } }
}
function applyMastery(state, a, t, atk) {
  const m = atk.mastery;
  const dc = 8 + a.pb + Math.max(a.mods.STR, atk.finesse || atk.ranged ? a.mods.DEX : -9);
  if (m === "Sap") { addEffect(state, t, { name: "Sap", until: "startOfSourceTurn", src: a.id }); log(state, "Sap: " + t.name + " ตีครั้งถัดไปเสียเปรียบ"); }
  else if (m === "Slow") { if (!t.effects.some((e) => e.name === "Slow (mastery)")) { addEffect(state, t, { name: "Slow (mastery)", speed: -10, until: "startOfSourceTurn", src: a.id }); log(state, "Slow: " + t.name + " ความเร็ว −10 ฟุต"); } }
  else if (m === "Vex") { addEffect(state, t, { name: "Vex", markedAdvBy: a.id, until: "endOfSourceTurn", src: a.id }); a.vexTarget = t.id; log(state, "Vex: " + a.name + " ตี " + t.name + " ครั้งถัดไปได้เปรียบ"); }
  else if (m === "Topple") { const s = savingThrow(t, "CON", dc); log(state, "Topple: " + t.name + " เซฟ CON " + s.total + " vs " + dc + (s.ok ? " ยืนอยู่ได้" : " ล้มลง!")); if (!s.ok) addCond(t, "Prone"); }
  else if (m === "Push") { if (t.size <= 2) { push(state, a, t, 2); log(state, "Push: ดัน " + t.name + " ถอยไป 10 ฟุต"); } }
  else if (m === "Cleave" && a.turn && !a.turn.cleaved) {
    const other = foesOf(state, a).find((f) => f.id !== t.id && dist(f, t) <= 5 && dist(f, a) <= 5);
    if (other) { a.turn.cleaved = true; const dmgNoMod = atk.dmg.replace(/[+-]\d+$/, ""); log(state, "Cleave: ฟันต่อ " + other.name); resolveAttack(state, a, other, { ...atk, dmg: dmgNoMod, mastery: null }); }
  }
  // Nick handled as free off-hand attack in actions
}
export function push(state, a, t, cells) {
  const dx = Math.sign(t.x - a.x), dy = Math.sign(t.y - a.y);
  for (let i = 0; i < cells; i++) {
    const nx = t.x + dx, ny = t.y + dy;
    if (nx < 0 || ny < 0 || nx >= state.map.w || ny >= state.map.h || state.map.walls[key(nx, ny)] || occupied(state, nx, ny, t.id)) break;
    t.x = nx; t.y = ny;
  }
}

// PC weapon attack action (handles Extra Attack via attacksLeft)
export function weaponAttack(state, a, t, attackIdx, opts = {}) {
  const atk = a.attacks[attackIdx];
  if (!atk) return { error: "ไม่มีอาวุธนี้" };
  const range = dist(a, t);
  const canMelee = atk.melee && range <= atk.reach;
  const canRange = atk.range && range <= atk.range[1] && hasLOS(state, a, t);
  if (!canMelee && !canRange) return { error: "อยู่นอกระยะ" };
  if (!opts.free) {
    if (a.turn.attacksLeft <= 0) { if (!a.turn.action) return { error: "ใช้ Action ไปแล้ว" }; a.turn.action = 0; a.turn.attacksLeft = a.extraAttacks; }
    a.turn.attacksLeft--;
  }
  const ranged = !canMelee;
  const longRange = ranged && atk.range && range > atk.range[0];
  const res = resolveAttack(state, a, t, { ...atk, ranged, verb: ranged ? "ยิง" : "ฟัน" }, {});
  if (longRange) log(state, "(ยิงไกลเกินระยะปกติ: เสียเปรียบ)");
  return res;
}

// ---------- spells ----------
// t: atk | save | heal | buff | auto | util. scale: cantrip die count at lv5; up: extra per slot level above base
export const SPELLFX = {
  "fire-bolt": { t: "atk", range: 120, dmg: "1d10", type: "Fire", cantrip: true },
  "ray-of-frost": { t: "atk", range: 60, dmg: "1d8", type: "Cold", cantrip: true, onHit: { speed: -10, name: "Ray of Frost", until: "startOfSourceTurn" } },
  "chill-touch": { t: "atk", range: 5, melee: true, dmg: "1d10", type: "Necrotic", cantrip: true },
  "shocking-grasp": { t: "atk", range: 5, melee: true, dmg: "1d8", type: "Lightning", cantrip: true },
  "sacred-flame": { t: "save", range: 60, ab: "DEX", dmg: "1d8", type: "Radiant", cantrip: true, half: false },
  "acid-splash": { t: "save", range: 60, ab: "DEX", dmg: "1d6", type: "Acid", cantrip: true, area: ["sphere", 5], half: false },
  "poison-spray": { t: "atk", range: 30, dmg: "1d12", type: "Poison", cantrip: true },
  "magic-missile": { t: "auto", range: 120, darts: 3, dmg: "1d4+1", type: "Force", up: { darts: 1 } },
  "guiding-bolt": { t: "atk", range: 120, dmg: "4d6", type: "Radiant", up: { dmg: "1d6" }, onHit: { markedAdv: true, name: "Guiding Bolt", until: "startOfSourceTurn" } },
  "inflict-wounds": { t: "save", range: 5, ab: "CON", dmg: "2d10", type: "Necrotic", up: { dmg: "1d10" }, half: true },
  "chromatic-orb": { t: "atk", range: 90, dmg: "3d8", type: "Fire", up: { dmg: "1d8" } },
  "ice-knife": { t: "atk", range: 60, dmg: "1d10", type: "Piercing", burst: { ab: "DEX", dmg: "2d6", type: "Cold", size: 5 }, up: { burst: "1d6" } },
  "ray-of-sickness": { t: "atk", range: 60, dmg: "2d8", type: "Poison", up: { dmg: "1d8" }, onHitCond: "Poisoned" },
  "burning-hands": { t: "save", ab: "DEX", area: ["cone", 15], self: true, dmg: "3d6", type: "Fire", half: true, up: { dmg: "1d6" } },
  "thunderwave": { t: "save", ab: "CON", area: ["cube", 15], self: true, dmg: "2d8", type: "Thunder", half: true, up: { dmg: "1d8" }, pushFail: 2 },
  "shatter": { t: "save", ab: "CON", range: 60, area: ["sphere", 10], dmg: "3d8", type: "Thunder", half: true, up: { dmg: "1d8" } },
  "fireball": { t: "save", ab: "DEX", range: 150, area: ["sphere", 20], dmg: "8d6", type: "Fire", half: true, up: { dmg: "1d6" } },
  "lightning-bolt": { t: "save", ab: "DEX", area: ["line", 100], self: true, dmg: "8d6", type: "Lightning", half: true, up: { dmg: "1d6" } },
  "scorching-ray": { t: "atk", range: 120, rays: 3, dmg: "2d6", type: "Fire", up: { rays: 1 } },
  "cure-wounds": { t: "heal", range: 5, dmg: "2d8", up: { dmg: "2d8" }, addMod: true },
  "healing-word": { t: "heal", range: 60, dmg: "2d4", up: { dmg: "2d4" }, addMod: true, bonus: true },
  "mass-healing-word": { t: "heal", range: 60, dmg: "2d4", up: { dmg: "1d4" }, addMod: true, bonus: true, targets: 6 },
  "prayer-of-healing": { t: "heal", range: 30, dmg: "2d8", up: { dmg: "1d8" }, addMod: true, targets: 5, outOfCombat: true },
  "bless": { t: "buff", range: 30, targets: 3, conc: true, effect: { attackDie: 4, saveDie: 4, name: "Bless" }, up: { targets: 1 } },
  "bane": { t: "save", range: 30, ab: "CHA", targets: 3, conc: true, noDmg: true, effect: { attackDie: -4, saveDie: -4, name: "Bane" }, up: { targets: 1 } },
  "shield-of-faith": { t: "buff", range: 60, targets: 1, conc: true, bonus: true, effect: { ac: 2, name: "Shield of Faith" } },
  "aid": { t: "buff", range: 30, targets: 3, effect: { maxHp: 5, name: "Aid" }, up: { maxHp: 5 } },
  "false-life": { t: "temp", self: true, dmg: "2d4+4", up: { dmg: "5" } },
  "mage-armor": { t: "buff", range: 5, targets: 1, effect: { name: "Mage Armor", mageArmor: true } },
  "hunters-mark": { t: "mark", range: 90, bonus: true, conc: true, markDmg: "1d6", type: "Force" },
  "hold-person": { t: "save", range: 60, ab: "WIS", targets: 1, conc: true, noDmg: true, humanoid: true, effect: { cond: "Paralyzed", name: "Hold Person", endSaveSelf: true }, up: { targets: 1 } },
  "command": { t: "save", range: 60, ab: "WIS", targets: 1, noDmg: true, effect: { cond: "Prone", name: "Command: Grovel", loseTurn: true }, up: { targets: 1 } },
  "sleep": { t: "save", range: 60, ab: "WIS", area: ["sphere", 5], conc: true, noDmg: true, effect: { cond: "Unconscious", name: "Sleep", wakeOnDamage: true } },
  "color-spray": { t: "save", ab: "CON", area: ["cone", 15], self: true, noDmg: true, effect: { cond: "Blinded", name: "Color Spray", until: "startOfSourceTurn" } },
  "entangle": { t: "save", range: 90, ab: "STR", area: ["cube", 20], conc: true, noDmg: true, effect: { cond: "Restrained", name: "Entangle", endSaveSelf: "STR" } },
  "web": { t: "save", range: 60, ab: "DEX", area: ["cube", 20], conc: true, noDmg: true, effect: { cond: "Restrained", name: "Web", endSaveSelf: "STR" } },
  "ensnaring-strike": { t: "nexthit", bonus: true, conc: true, ab: "STR", effect: { cond: "Restrained", name: "Ensnaring Strike", endSaveSelf: "STR", dot: "1d6", dotType: "Piercing" } },
  "spiritual-weapon": { t: "summon", range: 60, bonus: true, conc: true, dmg: "1d8", type: "Force", up: { dmg: "1d8" } },
  "spirit-guardians": { t: "aura", conc: true, size: 15, ab: "WIS", dmg: "3d8", type: "Radiant", up: { dmg: "1d8" } },
  "misty-step": { t: "teleport", range: 30, bonus: true },
  "revivify": { t: "revive", range: 5, cost: 300 },
  "spare-the-dying": { t: "stabilize", range: 15, cantrip: true },
  "haste": { t: "buff", range: 30, targets: 1, conc: true, effect: { ac: 2, speed: 30, name: "Haste" } },
  "magic-weapon": { t: "buff", range: 5, targets: 1, bonus: true, effect: { weaponBonus: 1, name: "Magic Weapon" } },
  "resistance": { t: "buff", range: 5, targets: 1, conc: true, cantrip: true, effect: { saveDie: 4, name: "Resistance" } },
  "guidance": { t: "util", cantrip: true },
};
export function spellInfo(id, data) {
  const s = index(data).spell[id];
  const fx = SPELLFX[id];
  return { s, fx, mechanical: !!fx && fx.t !== "util" };
}
export function spendSlot(u, level) {
  if (!u.slots) return false;
  for (let l = level; l <= u.slots.length; l++) {
    const used = u.slotsUsed[l - 1] || 0;
    if (used < u.slots[l - 1]) { u.slotsUsed[l - 1] = used + 1; return l; }
  }
  return false;
}
export function slotsLeft(u, level) { return u.slots && u.slots[level - 1] ? u.slots[level - 1] - (u.slotsUsed[level - 1] || 0) : 0; }
function scaleExpr(base, extra, times) {
  if (!times || !extra) return base;
  const m = String(extra).match(/^(\d+)d(\d+)$/);
  const b = String(base).match(/^(\d+)d(\d+)(.*)$/);
  if (m && b && m[2] === b[2]) return (+b[1] + +m[1] * times) + "d" + b[2] + b[3];
  let out = base; for (let i = 0; i < times; i++) out += "+" + extra; return out;
}
function cantripDice(expr, level) { const n = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1; return expr.replace(/^1d/, n + "d"); }

// cast: opts = {slot, targets:[ids], point:{x,y}, useMI}
export function castSpell(state, a, spellId, opts = {}) {
  const sp = state.spellIndex ? state.spellIndex[spellId] : null;
  const fx = SPELLFX[spellId];
  const name = sp ? sp.name : spellId;
  const lvl = sp ? sp.level : 0;
  if (!fx || fx.t === "util") return { error: "เวทนี้ใช้แบบเล่าเรื่อง ให้ DM ตัดสิน" };
  const cost = fx.bonus ? "bonus" : (sp && /Reaction/.test(sp.time)) ? "reaction" : "action";
  if (cost === "action" && !a.turn.action) return { error: "ใช้ Action ไปแล้ว" };
  if (cost === "bonus" && !a.turn.bonus) return { error: "ใช้ Bonus Action ไปแล้ว" };
  // a spell scroll lets anyone read it once: fixed attack +5 / DC 13 / +3 modifier, no slot spent
  const scrollC = opts.scroll ? { ability: null, attack: 5, dc: 13 } : null;
  const ci = scrollC || (a.mi && a.mi.ability && opts.useMI ? a.mi : a.casting);
  if (!ci && !a.mi) return { error: "ร่ายเวทไม่ได้" };
  const caster = ci || a.mi;
  let slot = 0;
  if (scrollC) slot = lvl;
  else if (lvl > 0) {
    if (opts.useMI && !a.miUsed && a.mi) { a.miUsed = true; slot = lvl; }
    else { slot = spendSlot(a, Math.max(lvl, opts.slot || lvl)); if (!slot) return { error: "ช่องเวทเลเวล " + lvl + "+ หมดแล้ว" }; }
  }
  if (fx.t === "revive") {
    const t = state.units[(opts.targets || [])[0]];
    if (!t || !t.dead || t.kind !== "pc") { if (lvl && !scrollC) a.slotsUsed[slot - 1]--; return { error: "ใช้กับเพื่อนที่เพิ่งเสียชีวิต" }; }
  }
  if (cost === "action") a.turn.action = 0; else if (cost === "bonus") a.turn.bonus = 0;
  const up = lvl > 0 ? slot - lvl : 0;
  const mo = scrollC ? 3 : caster.ability ? a.mods[caster.ability] : 0;
  log(state, a.name + (scrollC ? " อ่านคัมภีร์ " : " ร่าย ") + name + (slot && !scrollC ? " (ช่องเลเวล " + slot + ")" : ""), { kind: "cast", a: a.id, spell: spellId });
  const targets = (opts.targets || []).map((id) => state.units[id]).filter(Boolean);
  const dmgExpr = (base) => { let e = fx.cantrip ? cantripDice(base, a.level) : base; if (fx.up && fx.up.dmg) e = scaleExpr(e, fx.up.dmg, up); return e; };
  const concId = fx.conc ? startConc(state, a, name) : null;
  const inRange = (t) => !fx.range || dist(a, t) <= fx.range;
  switch (fx.t) {
    case "atk": {
      const n = (fx.rays || 1) + (fx.up && fx.up.rays ? up : 0);
      for (let i = 0; i < n; i++) {
        const t = targets[i % Math.max(1, targets.length)];
        if (!t || !inRange(t) || !hasLOS(state, a, t)) { log(state, "ไม่มีเป้าในระยะ"); break; }
        const res = resolveAttack(state, a, t, { name, hit: caster.attack, dmg: dmgExpr(fx.dmg), dtype: fx.type, ranged: !fx.melee, spell: true, verb: "ร่ายใส่" });
        if (res.hit && fx.onHit && alive(t)) addEffect(state, t, { ...fx.onHit, src: a.id });
        if (res.hit && fx.onHitCond && alive(t)) { addEffect(state, t, { name, cond: fx.onHitCond, until: "startOfSourceTurn", src: a.id }); }
        if (fx.burst) {
          const bd = scaleExpr(fx.burst.dmg, fx.up && fx.up.burst, up);
          for (const o of Object.values(state.units)) if (alive(o) && dist(o, t) <= fx.burst.size) {
            const s = savingThrow(o, fx.burst.ab, caster.dc); const r = roll(bd).total;
            log(state, o.name + " เซฟ " + fx.burst.ab + " " + s.total + " vs " + caster.dc + (s.ok ? " ผ่าน" : " ไม่ผ่าน เสีย " + r));
            if (!s.ok) damage(state, o, r, fx.burst.type, a);
          }
        }
      }
      break;
    }
    case "auto": {
      const n = fx.darts + (fx.up && fx.up.darts ? up : 0);
      const ts = targets.filter(inRange);
      if (!ts.length) { log(state, "ไม่มีเป้าในระยะ"); break; }
      for (let i = 0; i < n; i++) { const t = ts[i % ts.length]; if (!alive(t)) continue; const r = roll(fx.dmg); log(state, "ลูกศรเวทที่ " + (i + 1) + " ใส่ " + t.name + ": " + r.text + " Force"); damage(state, t, r.total, fx.type, a); }
      break;
    }
    case "save": {
      let hits;
      if (fx.area) {
        const origin = { x: a.x, y: a.y };
        const point = opts.point || (targets[0] ? { x: targets[0].x, y: targets[0].y } : origin);
        if (!fx.self && fx.range && dist(a, point) > fx.range) { log(state, "จุดเป้าอยู่นอกระยะ"); break; }
        const cells = areaCells(state, fx.area[0], fx.area[1], origin, point);
        const set = new Set(cells.map((c) => key(c.x, c.y)));
        hits = Object.values(state.units).filter((o) => alive(o) && o.id !== a.id && set.has(key(o.x, o.y)));
      } else hits = targets.filter(inRange).slice(0, (fx.targets || 1) + (fx.up && fx.up.targets ? up : 0));
      if (!hits.length) { log(state, "ไม่โดนใครเลย"); break; }
      const dmgRoll = fx.noDmg ? null : roll(dmgExpr(fx.dmg));
      if (dmgRoll) log(state, "ดาเมจ " + dmgRoll.text + " " + fx.type);
      for (const t of hits) {
        if (fx.humanoid && t.kind === "monster" && !/Humanoid/.test((state.monIndex && state.monIndex[t.monId] && state.monIndex[t.monId].type) || "")) { log(state, t.name + " ไม่ใช่ Humanoid เวทไม่มีผล"); continue; }
        const s = savingThrow(t, fx.ab, caster.dc);
        log(state, t.name + " เซฟ " + fx.ab + " " + s.total + " vs DC " + caster.dc + (s.legRes ? " (ใช้ Legendary Resistance)" : "") + (s.ok ? " ผ่าน" : " ไม่ผ่าน"));
        if (dmgRoll) { const amt = s.ok ? (fx.half ? Math.floor(dmgRoll.total / 2) : 0) : dmgRoll.total; if (amt) damage(state, t, amt, fx.type, a); }
        if (!s.ok && alive(t)) {
          if (fx.pushFail) push(state, a, t, fx.pushFail);
          if (fx.effect) {
            const e = { ...fx.effect, src: a.id, concId };
            if (fx.effect.endSaveSelf) e.endSave = { ab: typeof fx.effect.endSaveSelf === "string" ? fx.effect.endSaveSelf : fx.ab, dc: caster.dc };
            if (fx.effect.loseTurn) { e.until = "endOfTurn"; e.src = t.id; addEffect(state, t, { name: "Command", cond: "Incapacitated", until: "endOfTurn", src: t.id }); }
            addEffect(state, t, e);
            if (fx.effect.cond) log(state, t.name + " ติดสภาพ " + fx.effect.cond);
          }
        }
      }
      break;
    }
    case "heal": {
      const n = (fx.targets || 1);
      for (const t of targets.filter(inRange).slice(0, n)) {
        if (t.side !== a.side || t.dead) continue;
        const r = roll(dmgExpr(fx.dmg) + (fx.addMod ? "+" + mo : ""));
        const got = heal(state, t, r.total, a);
        log(state, t.name + " ฟื้น HP " + r.text + " (ได้จริง " + got + ")", { kind: "heal" });
      }
      break;
    }
    case "temp": { const r = roll(scaleExpr(fx.dmg, fx.up && fx.up.dmg, up)); a.tempHp = Math.max(a.tempHp, r.total); log(state, a.name + " ได้ HP ชั่วคราว " + r.total); break; }
    case "buff": {
      const n = (fx.targets || 1) + (fx.up && fx.up.targets ? up : 0);
      for (const t of targets.filter(inRange).slice(0, n)) {
        const e = { ...fx.effect, src: a.id, concId };
        if (fx.up && fx.up.maxHp) e.maxHp = fx.effect.maxHp + fx.up.maxHp * up;
        if (e.mageArmor) { if (t.kind === "pc" && !t.armorWorn) { const nac = 13 + t.mods.DEX; if (nac > t.ac) { e.ac = nac - t.ac; } else { log(state, "AC เดิมดีกว่า Mage Armor"); continue; } } }
        addEffect(state, t, e); log(state, t.name + " ได้ " + fx.effect.name);
      }
      break;
    }
    case "mark": {
      const t = targets[0];
      if (!t || !inRange(t)) { log(state, "ไม่มีเป้าในระยะ"); break; }
      addEffect(state, t, { name: name, markBy: a.id, markDmg: fx.markDmg, markType: fx.type, src: a.id, concId, keepOnDeath: false });
      log(state, a.name + " ทำเครื่องหมายล่า " + t.name + " (+" + fx.markDmg + " ดาเมจเมื่อตีโดน)");
      break;
    }
    case "nexthit": {
      addEffect(state, a, { name, src: a.id, concId, nextHit: { ab: fx.ab, dc: caster.dc, effect: fx.effect } });
      log(state, a.name + " เตรียมเถาหนามไว้กับการตีครั้งถัดไป");
      break;
    }
    case "summon": {
      const t = targets[0];
      a.spiritualWeapon = { dmg: scaleExpr(fx.dmg, fx.up && fx.up.dmg, up), concId };
      if (t && dist(a, t) <= fx.range) resolveAttack(state, a, t, { name: "Spiritual Weapon", hit: caster.attack, dmg: a.spiritualWeapon.dmg + "+" + mo, dtype: "Force", spell: true, verb: "ฟาดอาวุธเวทใส่" });
      addEffect(state, a, { name: "Spiritual Weapon", src: a.id, concId, spiritual: true });
      break;
    }
    case "aura": addEffect(state, a, { name, src: a.id, concId, aura: { size: fx.size, ab: fx.ab, dc: caster.dc, dmg: dmgExpr(fx.dmg), dtype: fx.type } }); log(state, "วิญญาณผู้พิทักษ์วนรอบ " + a.name + " (15 ฟุต)"); break;
    case "teleport": {
      const p = opts.point;
      if (p && dist(a, p) <= fx.range && !state.map.walls[key(p.x, p.y)] && !occupied(state, p.x, p.y, a.id)) { a.x = p.x; a.y = p.y; log(state, a.name + " วาร์ปไป (" + p.x + "," + p.y + ")"); }
      else log(state, "วาร์ปไม่ได้: จุดไม่ว่างหรือไกลเกิน 30 ฟุต");
      break;
    }
    case "revive": { const t = targets[0]; t.dead = false; t.hp = 1; t.deathSaves = { ok: 0, fail: 0 }; delCond(t, "Unconscious"); log(state, t.name + " ฟื้นคืนชีพด้วย HP 1 (ใช้เพชร 300 GP)"); state.goldSpent = (state.goldSpent || 0) + fx.cost; break; }
    case "stabilize": { const t = targets[0]; if (t && t.hp <= 0 && !t.dead && dist(a, t) <= fx.range) { t.stable = true; log(state, t.name + " อาการคงที่แล้ว"); } else log(state, "ไม่มีเพื่อนที่ต้องห้ามเลือดในระยะ"); break; }
    default: log(state, "(ผลของเวทให้ DM เล่า)");
  }
  checkOver(state);
  return { ok: true, slot };
}
// bonus-action attack with an active Spiritual Weapon
export function spiritualAttack(state, a, t) {
  if (!a.spiritualWeapon || !a.effects.some((e) => e.spiritual)) return { error: "ไม่มี Spiritual Weapon" };
  if (!a.turn.bonus) return { error: "ใช้ Bonus Action ไปแล้ว" };
  if (dist(a, t) > 60) return { error: "ไกลเกิน 60 ฟุต" };
  a.turn.bonus = 0;
  const ci = a.casting;
  return resolveAttack(state, a, t, { name: "Spiritual Weapon", hit: ci.attack, dmg: a.spiritualWeapon.dmg + "+" + a.mods[ci.ability], dtype: "Force", spell: true, verb: "ฟาดอาวุธเวทใส่" });
}

// ---------- other actions ----------
export function doDash(state, u) { if (!u.turn.action) return { error: "ใช้ Action ไปแล้ว" }; u.turn.action = 0; u.turn.move += effSpeed(u); log(state, u.name + " วิ่ง (Dash)"); return { ok: true }; }
export function doDodge(state, u) { if (!u.turn.action) return { error: "ใช้ Action ไปแล้ว" }; u.turn.action = 0; addCond(u, "Dodging"); log(state, u.name + " ตั้งท่าหลบ (Dodge)"); return { ok: true }; }
export function doDisengage(state, u, bonus) { const k = bonus ? "bonus" : "action"; if (!u.turn[k]) return { error: "ใช้ไปแล้ว" }; u.turn[k] = 0; u.turn.disengage = true; log(state, u.name + " ถอยอย่างระวัง (Disengage)"); return { ok: true }; }
export function doHelp(state, u, ally) { if (!u.turn.action) return { error: "ใช้ Action ไปแล้ว" }; if (dist(u, ally) > 5) return { error: "ต้องอยู่ติดเพื่อน" }; u.turn.action = 0; addEffect(state, ally, { name: "Help", helped: true, until: "startOfSourceTurn", src: u.id }); log(state, u.name + " ช่วย " + ally.name + " (ตีครั้งถัดไปได้เปรียบ)"); return { ok: true }; }
export function secondWind(state, u) {
  const r = u.resources.secondWind; if (!r || r.used >= r.max) return { error: "Second Wind หมดแล้ว" }; if (!u.turn.bonus) return { error: "ใช้ Bonus Action ไปแล้ว" };
  r.used++; u.turn.bonus = 0; const h = roll("1d10+" + u.level); heal(state, u, h.total); log(state, u.name + " ใช้ Second Wind ฟื้น " + h.text, { kind: "heal" }); return { ok: true };
}
export function actionSurge(state, u) {
  const r = u.resources.actionSurge; if (!r || r.used >= r.max) return { error: "Action Surge หมดแล้ว" };
  r.used++; u.turn.action = 1; u.turn.attacksLeft = 0; log(state, u.name + " ใช้ Action Surge ได้ Action เพิ่ม!"); return { ok: true };
}
export function standUp(state, u) { if (!hasCond(u, "Prone")) return { error: "ไม่ได้ล้มอยู่" }; const cost = Math.floor(u.speed / 2); if (u.turn.move - u.turn.moved < cost) return { error: "ความเร็วไม่พอ" }; u.turn.moved += cost; delCond(u, "Prone"); log(state, u.name + " ลุกขึ้นยืน"); return { ok: true }; }
export function offhandAttack(state, u, t) {
  // two-weapon fighting: light weapon in each hand, bonus action (Nick mastery makes it part of the Attack action)
  const lights = u.attacks.map((a, i) => [a, i]).filter(([a]) => a.light && a.melee);
  if (lights.length < 2) return { error: "ต้องถืออาวุธ Light สองชิ้น" };
  const nick = lights.some(([a]) => a.mastery === "Nick");
  if (!nick && !u.turn.bonus) return { error: "ใช้ Bonus Action ไปแล้ว" };
  if (u.turn.offhand) return { error: "ตีมือรองไปแล้ว" };
  if (!nick) u.turn.bonus = 0;
  u.turn.offhand = true;
  const [a] = lights[1];
  const tw = u.fightingStyle === "two-weapon-fighting";
  const atk = { ...a, dmg: tw ? a.dmg : a.dmg.replace(/[+-]\d+$/, "") };
  return resolveAttack(state, u, t, { ...atk, verb: "ฟันมือรอง" });
}

// ---------- homebrew: Controlled Chaos Potion V2.1 (Fizz Bubblewick) ----------
// recipe -> [effect A (d6 1-3), effect B (d6 4-6)]; effects last 1 minute (10 rounds), no concentration, one at a time
export const CHAOS = {
  "001": { name: "Unstable Enhancement Serum", th: "เซรุ่มเสริมพลังไม่เสถียร", A: { atkFlat: 2, ac: -1, txt: "Attack +2, AC −1" }, B: { ac: 2, atkFlat: -1, txt: "AC +2, Attack −1" } },
  "002": { name: "Emergency Recovery Fluid", th: "น้ำยาฟื้นฟูฉุกเฉิน", A: { heal: "1d6+2", speed: -5, txt: "ฟื้น 1d6+2 HP, Speed −5 ft" }, B: { heal: "1d4+2", temp: 2, atkFlat: -1, txt: "ฟื้น 1d4+2 HP + Temp HP 2, Attack −1" } },
  "003": { name: "Hyperactive Mobility Tonic", th: "ยาเร่งการเคลื่อนไหว", A: { speed: 10, ac: -1, txt: "Speed +10 ft, AC −1" }, B: { saveFlat: { DEX: 2 }, speed: -5, txt: "DEX Save +2, Speed −5 ft" } },
  "004": { name: "Cognitive Instability Solution", th: "สารเพิ่มสมองไม่เสถียร", A: { oneShot: "check", ac: -1, txt: "+1d4 Ability Check ครั้งถัดไป, AC −1" }, B: { saveFlat: { WIS: 2 }, atkFlat: -1, txt: "WIS Save +2, Attack −1" } },
  "005": { name: "Emergency Survival Compound", th: "สารเอาตัวรอดฉุกเฉิน", A: { temp: 5, speed: -5, txt: "Temp HP 5, Speed −5 ft" }, B: { resist: "ELEMENT", atkFlat: -1, txt: "Resistance ELEMENT, Attack −1" } },
  "006": { name: "Tactical Fortune Extract", th: "สารสกัดโชคสนามรบ", A: { oneShot: "attack", ac: -1, txt: "+1d4 Attack ครั้งถัดไป, AC −1" }, B: { oneShot: "save", atkFlat: -1, txt: "+1d4 Saving Throw ครั้งถัดไป, Attack −1" } },
};
// item ids: chaos-001 … chaos-006, with chaos-005f / chaos-005c for the Fire / Cold survival compound
export function chaosRecipe(itemId) {
  const m = /^chaos-(\d{3})([fc])?$/.exec(itemId || ""); if (!m || !CHAOS[m[1]]) return null;
  return { id: m[1], element: m[2] === "c" ? "Cold" : m[2] === "f" ? "Fire" : null, ...CHAOS[m[1]] };
}
export function chaosItemName(itemId) {
  const r = chaosRecipe(itemId); if (!r) return itemId;
  return "ยาปรุง No." + r.id + " " + r.name + (r.element ? " (" + r.element + ")" : "");
}
// a = the one spending the Action (drinker or helper feeding within 5 ft), t = drinker. Does not touch inventory.
export function chaosPotion(state, a, t, itemId, opts = {}) {
  const r = chaosRecipe(itemId); if (!r) return { error: "ไม่รู้จักยานี้" };
  if (!opts.free) { if (!a.turn || !a.turn.action) return { error: "ใช้ Action ไปแล้ว" }; }
  if (a.id !== t.id && dist(a, t) > 5) return { error: "ป้อนยาได้เฉพาะเพื่อนที่ยืนติดกัน (5 ฟุต)" };
  if (t.dead) return { error: "เป้าหมายเสียชีวิตแล้ว" };
  if (!opts.free) a.turn.action = 0;
  const die = opts.die || d(6);
  const side = die <= 3 ? "A" : "B";
  const fx = { ...r[side] };
  const txt = fx.txt.replace("ELEMENT", r.element || "Fire");
  for (const e of [...t.effects]) if (e.potion) removeEffect(state, t, e);
  log(state, (a.id === t.id ? a.name + " ดื่ม " : a.name + " ป้อน ") + "ยาปรุง No." + r.id + " " + r.name + (a.id === t.id ? "" : " ให้ " + t.name) + " · 🎲 d6 = " + die + " → ผล " + side + ": " + txt, { kind: "potion" });
  if (fx.heal) { const h = roll(fx.heal); const got = heal(state, t, h.total, a); log(state, t.name + " ฟื้น " + h.text + " (ได้จริง " + got + ")", { kind: "heal" }); }
  if (fx.temp) t.tempHp = Math.max(t.tempHp || 0, fx.temp);
  const eff = { name: "ยาปรุง " + r.id + side, potion: r.id + side, src: t.id, endRound: (state.round || 1) + 10, txt };
  if (fx.ac) eff.ac = fx.ac;
  if (fx.atkFlat) eff.atkFlat = fx.atkFlat;
  if (fx.speed) eff.speed = fx.speed;
  if (fx.saveFlat) eff.saveFlat = fx.saveFlat;
  if (fx.oneShot) eff.oneShot = fx.oneShot;
  if (fx.resist) eff.resist = r.element || "Fire";
  addEffect(state, t, eff);
  if (fx.speed && t.turn) t.turn.move = Math.max(t.turn.moved, t.turn.move + fx.speed);
  return { ok: true, side, die, txt };
}

// ---------- movement ----------
// A* on the grid. Allies can be passed through, enemies block. Returns array of cells (excluding start) or null.
export function findPath(state, u, goal, opts = {}) {
  const W = state.map.w, H = state.map.h;
  const start = { x: u.x, y: u.y };
  const blocked = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    if (state.map.walls[key(x, y)]) return true;
    const o = occupied(state, x, y, u.id);
    return o && o.side !== u.side && alive(o);
  };
  const cost = (x, y) => (state.map.difficult && state.map.difficult[key(x, y)] ? 10 : 5);
  const open = [[0, start.x, start.y]], g = { [key(start.x, start.y)]: 0 }, from = {};
  const h = (x, y) => Math.max(Math.abs(x - goal.x), Math.abs(y - goal.y)) * 5;
  const maxCost = opts.maxCost ?? 9999;
  let best = null;
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [, x, y] = open.shift();
    const k = key(x, y);
    if ((opts.stopWithin != null && h(x, y) <= opts.stopWithin && (!opts.needLOS || hasLOS(state, { x, y }, goal))) || (x === goal.x && y === goal.y)) {
      if (!occupied(state, x, y, u.id) || (x === start.x && y === start.y)) { best = k; break; }
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (blocked(nx, ny) && !(nx === goal.x && ny === goal.y && opts.stopWithin == null)) continue;
      if (dx && dy && (state.map.walls[key(x + dx, y)] && state.map.walls[key(x, y + dy)])) continue; // no corner cutting through walls
      const ng = g[k] + cost(nx, ny);
      if (ng > maxCost) continue;
      const nk = key(nx, ny);
      if (g[nk] === undefined || ng < g[nk]) { g[nk] = ng; from[nk] = k; open.push([ng + h(nx, ny), nx, ny]); }
    }
  }
  if (!best) return null;
  const path = [];
  for (let k = best; k !== key(start.x, start.y); k = from[k]) { const [x, y] = k.split(",").map(Number); path.unshift({ x, y, g: g[k] }); }
  return path;
}
export function reachableCells(state, u) {
  const left = u.turn ? u.turn.move - u.turn.moved : effSpeed(u);
  const out = {};
  const W = state.map.w, H = state.map.h;
  const g = { [key(u.x, u.y)]: 0 }, q = [[u.x, u.y]];
  while (q.length) {
    const [x, y] = q.shift();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy; if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (state.map.walls[key(nx, ny)]) continue;
      if (dx && dy && state.map.walls[key(x + dx, y)] && state.map.walls[key(x, y + dy)]) continue;
      const o = occupied(state, nx, ny, u.id); if (o && o.side !== u.side && alive(o)) continue;
      const c = g[key(x, y)] + (state.map.difficult && state.map.difficult[key(nx, ny)] ? 10 : 5);
      if (c > left) continue;
      const k = key(nx, ny);
      if (g[k] === undefined || c < g[k]) { g[k] = c; q.push([nx, ny]); if (!o) out[k] = c; }
    }
  }
  return out;
}
// move along a path, provoking opportunity attacks when leaving an enemy's reach
export function moveAlong(state, u, path) {
  let moved = 0;
  for (const step of path) {
    if (!alive(u) || hasCond(u, "Unconscious")) break;
    const c = (state.map.difficult && state.map.difficult[key(step.x, step.y)]) ? 10 : 5;
    if (u.turn && u.turn.moved + c > u.turn.move) break;
    if (occupied(state, step.x, step.y, u.id) && step === path[path.length - 1]) break;
    if (!u.turn || !u.turn.disengage) {
      for (const f of foesOf(state, u)) {
        if (!conscious(f) || f.reactionUsed || hasCond(f, "Incapacitated")) continue;
        const reach = f.kind === "pc" ? Math.max(5, ...f.attacks.filter((a) => a.melee).map((a) => a.reach)) : Math.max(5, ...f.actions.filter((a) => a.type === "attack" && a.kind !== "ranged").map((a) => a.reach || 5));
        if (dist(f, u) <= reach && dist(f, step) > reach) {
          f.reactionUsed = true;
          log(state, f.name + " ฉวยโอกาสตี (Opportunity Attack) ตอน " + u.name + " ถอยออก");
          opportunityAttack(state, f, u);
          if (!alive(u)) break;
        }
      }
    }
    if (!alive(u)) break;
    u.x = step.x; u.y = step.y; moved += c;
    if (u.turn) u.turn.moved += c;
  }
  return moved;
}
function opportunityAttack(state, f, t) {
  if (f.kind === "pc") {
    const i = f.attacks.findIndex((a) => a.melee);
    if (i >= 0) resolveAttack(state, f, t, { ...f.attacks[i], ranged: false, verb: "ฉวยตี" });
  } else {
    const a = f.actions.find((x) => x.type === "attack" && x.kind !== "ranged");
    if (a) resolveAttack(state, f, t, monAtk(a, f));
  }
}
export function monAtk(a, u) { return { name: a.name, hit: a.hit, dmg: a.dmg || "1", dtype: a.dtype, extra: a.extra, cond: a.cond, ranged: a.kind === "ranged", melee: a.kind !== "ranged", reach: a.reach || 5, range: a.range }; }

// ---------- rests ----------
export function shortRestUnit(u, spendDice) {
  const out = []; let healed = 0;
  for (let i = 0; i < spendDice && u.hitDice > 0 && u.hp < u.maxHp; i++) { u.hitDice--; const r = d(u.hitDie) + u.mods.CON; healed += Math.max(1, r); u.hp = Math.min(u.maxHp, u.hp + Math.max(1, r)); }
  for (const r of Object.values(u.resources)) if (/short/.test(r.recharge || "") || r.name === "Second Wind" ) r.used = Math.max(0, r.used - (r.name === "Second Wind" ? 1 : r.used));
  if (u.resources.actionSurge) u.resources.actionSurge.used = 0;
  if (u.resources.channelDivinity) u.resources.channelDivinity.used = Math.max(0, u.resources.channelDivinity.used - 1);
  out.push(u.name + " พักสั้น ฟื้น " + healed + " HP");
  return out;
}
export function longRestUnit(u) {
  if (u.dead) return [u.name + " เสียชีวิตอยู่ ต้องไปชุบชีวิตที่วิหาร"];
  u.hp = u.maxHp; u.tempHp = 0; u.slotsUsed = []; u.miUsed = false; u.hitDice = Math.max(u.hitDice, u.level);
  for (const r of Object.values(u.resources)) r.used = 0;
  u.conditions = []; u.effects = []; u.conc = null; u.deathSaves = { ok: 0, fail: 0 };
  return [u.name + " พักยาว HP เต็ม ช่องเวทและความสามารถคืนครบ"];
}
// carry a PC unit's live state back into a card-friendly object
export function liveOf(u) {
  return { hp: u.hp, tempHp: u.tempHp, slotsUsed: u.slotsUsed, resUsed: Object.fromEntries(Object.entries(u.resources).map(([k, r]) => [k, r.used])),
    conditions: u.conditions.filter((c) => ["Poisoned"].includes(c)), deathSaves: u.deathSaves, dead: u.dead, miUsed: u.miUsed, hitDice: u.hitDice };
}
