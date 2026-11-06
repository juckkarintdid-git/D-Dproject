// DnD for friend · monster AI (phase 2)
// Normal monsters: code picks target + action + path. Sub Boss / Boss: code builds a menu of concrete plans,
// Claude (DM) picks one by number and narrates; code executes it. Without Claude the best-scored plan runs.
import {
  dist, key, hasLOS, areaCells, alive, conscious, hasCond, foesOf, alliesOf, findPath, moveAlong, resolveAttack,
  savingThrow, damage, roll, log, monAtk, addEffect, effSpeed, occupied, checkOver, delCond,
} from "./combat.js";

const pHit = (hit, ac) => Math.min(0.95, Math.max(0.05, (21 - (ac - hit)) / 20));
const isCaster = (u) => u.kind === "pc" && !!u.casting;

export function targetScore(state, u, t) {
  if (!alive(t)) return -1e9;
  let s = 100 - (dist(u, t) / 5) * 4 + (1 - t.hp / t.maxHp) * 30 - t.ac * 1.5;
  if (t.conc) s += 15;
  if (isCaster(t)) s += 8;
  if (t.hp <= 0) s -= u.profile === "mindless" ? 20 : 200; // smart monsters ignore downed heroes
  if (u.profile === "pack" && alliesOf(state, u).some((o) => dist(o, t) <= 5)) s += 15;
  if (u.taunted === t.id) s += 40;
  return s;
}
function usable(u, a) {
  if (a.recharge && u.recharge[a.name] === false) return false;
  if (a.perDay && (u.perDay[a.name] || 0) >= a.perDay) return false;
  return true;
}
function bestAttack(u, t, mode) {
  let best = null;
  for (const a of u.actions) {
    if (a.type !== "attack" || !usable(u, a)) continue;
    if (mode === "melee" && a.kind === "ranged") continue;
    if (mode === "ranged" && a.kind === "melee") continue;
    const ev = pHit(a.hit + (u.hitBonus || 0), t.ac) * (a.avg || 1);
    if (!best || ev > best.ev) best = { a, ev };
  }
  return best;
}
function multiCount(u) { const m = u.actions.find((a) => a.type === "multi"); return m ? m.count : 1; }

// candidate plans for one monster this turn
export function candidatePlans(state, u) {
  const plans = [];
  const foes = foesOf(state, u).filter((f) => f.hp > 0 || u.profile === "mindless");
  if (!foes.length) return plans;
  const speed = effSpeed(u);
  const n = multiCount(u);
  for (const t of foes) {
    const ts = targetScore(state, u, t);
    // melee
    const mel = bestAttack(u, t, "melee");
    if (mel) {
      const reach = mel.a.reach || 5;
      let path = dist(u, t) <= reach ? [] : findPath(state, u, t, { stopWithin: reach, maxCost: 999 });
      if (path) {
        const within = path.filter((c) => c.g <= speed);
        const reaches = path.length === 0 || (within.length === path.length);
        const dashPath = path.filter((c) => c.g <= speed * 2);
        if (reaches) plans.push({ kind: "melee", target: t.id, path: within, attack: mel.a.name, count: n, ev: mel.ev * n, score: ts + mel.ev * n * 3, label: "บุกตี " + t.name + " ด้วย " + mel.a.name + (n > 1 ? " ×" + n : "") });
        else plans.push({ kind: "dash", target: t.id, path: dashPath.length ? dashPath : within, ev: 0, score: ts - 30, label: "วิ่งเข้าหา " + t.name });
      }
    }
    // ranged
    const rng = bestAttack(u, t, "ranged");
    if (rng && rng.a.range) {
      const far = rng.a.range[1];
      let path = [];
      const d0 = dist(u, t);
      const adjacentFoe = foes.some((f) => conscious(f) && dist(f, u) <= 5);
      if (d0 > far || !hasLOS(state, u, t)) path = findPath(state, u, t, { stopWithin: Math.min(rng.a.range[0], far), needLOS: true, maxCost: 999 }) || null;
      else if (adjacentFoe && u.profile !== "brute") path = retreatPath(state, u, speed, t, rng.a.range[0]);
      if (path) {
        const within = path.filter((c) => c.g <= speed);
        const end = within.length ? within[within.length - 1] : { x: u.x, y: u.y };
        if (dist(end, t) <= far && hasLOS(state, end, t))
          plans.push({ kind: "ranged", target: t.id, path: within, attack: rng.a.name, count: n, ev: rng.ev * n, score: ts + rng.ev * n * 3 + (u.profile === "archer" ? 25 : 0) - (dist(end, t) > rng.a.range[0] ? 15 : 0), label: "ยิง " + t.name + " ด้วย " + rng.a.name + (n > 1 ? " ×" + n : "") });
      }
    }
  }
  // area / save actions (breath weapons etc.)
  for (const a of u.actions) {
    if (a.type !== "save" || !usable(u, a)) continue;
    const pick = bestArea(state, u, a);
    if (pick && pick.hitFoes > 0) plans.push({ kind: "save", action: a.name, point: pick.point, path: [], ev: pick.ev, score: 60 + pick.ev * 3 + pick.hitFoes * 10 - pick.hitAllies * 25, label: a.name + " ใส่ " + pick.names.join(", ") });
  }
  // morale: flee when badly hurt (normal smart monsters only)
  if (u.tier === "normal" && u.profile !== "mindless" && u.hp <= u.maxHp * 0.25 && u.hp > 0) {
    const path = retreatPath(state, u, speed * 2, foes[0], 40);
    if (path && path.length) plans.push({ kind: "flee", path, ev: 0, score: 40 + (1 - u.hp / u.maxHp) * 40 + (u.profile === "skirmisher" ? 20 : 0), label: "หนีเอาตัวรอด" });
  }
  plans.sort((a, b) => b.score - a.score);
  return plans;
}
function retreatPath(state, u, budget, from, want) {
  let best = null;
  for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) {
    const x = u.x + dx, y = u.y + dy;
    if (x < 0 || y < 0 || x >= state.map.w || y >= state.map.h || state.map.walls[key(x, y)] || occupied(state, x, y, u.id)) continue;
    const c = { x, y };
    const near = Math.min(...foesOf(state, u).filter(conscious).map((f) => dist(f, c)));
    if (near < 10) continue;
    const p = findPath(state, u, c, { maxCost: budget });
    if (!p) continue;
    const sc = Math.min(near, want) * 2 - (p.length ? p[p.length - 1].g : 0) / 5 + (from && hasLOS(state, c, from) ? 10 : 0);
    if (!best || sc > best.sc) best = { p, sc };
  }
  return best ? best.p : null;
}
function bestArea(state, u, a) {
  if (!a.area) {
    // single-target save (e.g. gaze) within range
    const r = a.range || 30;
    const t = foesOf(state, u).filter((f) => f.hp > 0 && dist(u, f) <= r && hasLOS(state, u, f)).sort((x, y) => targetScore(state, u, y) - targetScore(state, u, x))[0];
    return t ? { point: { x: t.x, y: t.y }, hitFoes: 1, hitAllies: 0, ev: (a.avg || 5) * 0.6, names: [t.name], single: t.id } : null;
  }
  let best = null;
  const candidates = foesOf(state, u).filter((f) => f.hp > 0).map((f) => ({ x: f.x, y: f.y }));
  for (const p of candidates) {
    if (a.area.shape !== "emanation" && dist(u, p) > Math.max(a.area.size, 60) && !["cone", "line"].includes(a.area.shape)) continue;
    const cells = areaCells(state, a.area.shape, a.area.size, { x: u.x, y: u.y }, p);
    const set = new Set(cells.map((c) => key(c.x, c.y)));
    const hits = Object.values(state.units).filter((o) => alive(o) && o.id !== u.id && set.has(key(o.x, o.y)));
    const hf = hits.filter((o) => o.side !== u.side), ha = hits.filter((o) => o.side === u.side);
    const ev = hf.length * (a.avg || 5) * 0.75;
    if (!best || ev - ha.length * 10 > best.ev - best.hitAllies * 10) best = { point: p, hitFoes: hf.length, hitAllies: ha.length, ev, names: hf.map((o) => o.name) };
  }
  return best;
}

// generic boss moves made by code (used in the boss menu)
function bossExtras(state, u) {
  const out = [];
  if (u.tier === "boss" && !u.roared) {
    const foes = foesOf(state, u).filter((f) => conscious(f) && dist(f, u) <= 30);
    if (foes.length >= 2) out.push({ kind: "roar", path: [], ev: foes.length * 3, score: 55 + foes.length * 8, label: "คำรามข่มขวัญ (เซฟ WIS ไม่ผ่านติด Frightened 1 รอบ) ใส่ " + foes.length + " คน" });
  }
  const allies = alliesOf(state, u).filter((o) => o.kind === "monster");
  if (allies.length && !u.rallied) out.push({ kind: "rally", path: [], ev: allies.length * 2, score: 35 + allies.length * 6, label: "สั่งลูกน้องรุม (ลูกน้องตีครั้งถัดไปได้เปรียบ)" });
  return out;
}
export function buildMenu(state, u, max = 4) {
  const plans = [...candidatePlans(state, u), ...bossExtras(state, u)].sort((a, b) => b.score - a.score);
  const menu = []; const seen = new Set();
  for (const p of plans) {
    const sig = p.kind + ":" + (p.target || p.action || "");
    if (seen.has(sig)) continue;
    seen.add(sig); menu.push(p);
    if (menu.length >= max) break;
  }
  // make sure the menu offers a different target if possible
  return menu;
}

// execute a plan
export function executePlan(state, u, plan) {
  if (!plan) { log(state, u.name + " ยืนนิ่ง"); return; }
  if (plan.kind === "dash" || plan.kind === "flee") { u.turn.move = effSpeed(u) * 2; u.turn.action = 0; }
  if (plan.path && plan.path.length) moveAlong(state, u, plan.path);
  if (!alive(u)) return;
  if (plan.kind === "flee") { log(state, u.name + " ถอยหนี!"); return; }
  if (plan.kind === "dash") { log(state, u.name + " วิ่งเข้าหา " + (state.units[plan.target] || {}).name); return; }
  if (plan.kind === "roar") {
    u.roared = true; u.turn.action = 0;
    const dc = 10 + Math.max(2, Math.floor((u.cr || 1) / 4) + 2);
    log(state, u.name + " คำรามสนั่น!");
    for (const f of foesOf(state, u).filter((f) => conscious(f) && dist(f, u) <= 30)) {
      const s = savingThrow(f, "WIS", dc);
      log(state, f.name + " เซฟ WIS " + s.total + " vs " + dc + (s.ok ? " ใจแข็ง" : " กลัว! (Frightened)"));
      if (!s.ok) addEffect(state, f, { name: "Frightened", cond: "Frightened", until: "startOfSourceTurn", src: u.id });
    }
    return;
  }
  if (plan.kind === "rally") {
    u.rallied = true; u.turn.action = 0;
    for (const o of alliesOf(state, u).filter((o) => o.kind === "monster")) addEffect(state, o, { name: "Rally", helped: true, until: "startOfSourceTurn", src: u.id });
    log(state, u.name + " ตะโกนสั่งลูกน้องรุมโจมตี!");
    return;
  }
  if (plan.kind === "save") return doSaveAction(state, u, u.actions.find((a) => a.name === plan.action), plan.point);
  if (plan.kind === "melee" || plan.kind === "ranged") {
    u.turn.action = 0;
    let t = state.units[plan.target];
    const a = u.actions.find((x) => x.name === plan.attack);
    for (let i = 0; i < (plan.count || 1); i++) {
      if (!alive(u)) break;
      if (!t || !alive(t) || (t.hp <= 0 && u.profile !== "mindless")) {
        // retarget within reach/range
        t = foesOf(state, u).filter((f) => f.hp > 0 && (plan.kind === "melee" ? dist(u, f) <= (a.reach || 5) : dist(u, f) <= (a.range ? a.range[1] : 5) && hasLOS(state, u, f)))
          .sort((x, y) => targetScore(state, u, y) - targetScore(state, u, x))[0];
        if (!t) break;
      }
      const inReach = plan.kind === "melee" ? dist(u, t) <= (a.reach || 5) : dist(u, t) <= (a.range ? a.range[1] : 5);
      if (!inReach) { log(state, u.name + " เอื้อมไม่ถึง " + t.name); break; }
      resolveAttack(state, u, t, monAtk(a, u));
      if (state.over) break;
    }
    // skirmishers slip away after attacking (Nimble Escape etc.)
    if (u.profile === "skirmisher" && alive(u) && u.turn.bonus) {
      u.turn.bonus = 0; u.turn.disengage = true;
      const left = u.turn.move - u.turn.moved;
      const p = retreatPath(state, u, left, null, 20);
      if (p && p.length) { moveAlong(state, u, p); log(state, u.name + " ปลีกตัวถอยออกไป"); }
    }
  }
}
export function doSaveAction(state, u, a, point) {
  u.turn.action = 0;
  if (a.recharge) u.recharge[a.name] = false;
  if (a.perDay) u.perDay[a.name] = (u.perDay[a.name] || 0) + 1;
  let hits;
  if (a.area) {
    const cells = areaCells(state, a.area.shape, a.area.size, { x: u.x, y: u.y }, point);
    const set = new Set(cells.map((c) => key(c.x, c.y)));
    hits = Object.values(state.units).filter((o) => alive(o) && o.id !== u.id && set.has(key(o.x, o.y)));
  } else hits = Object.values(state.units).filter((o) => alive(o) && o.x === point.x && o.y === point.y);
  const r = a.dmg ? roll(a.dmg) : null;
  log(state, u.name + " ใช้ " + a.name + (r ? " ดาเมจ " + r.text + " " + (a.dtype || "") : ""), { kind: "special", a: u.id });
  for (const t of hits) {
    const s = savingThrow(t, a.ab, a.dc);
    log(state, t.name + " เซฟ " + a.ab + " " + s.total + " vs DC " + a.dc + (s.ok ? " ผ่าน" : " ไม่ผ่าน"));
    if (r) { const amt = s.ok ? (a.half ? Math.floor(r.total / 2) : 0) : r.total; if (amt) damage(state, t, amt, a.dtype, u); }
    if (!s.ok && a.cond && alive(t)) { addEffect(state, t, { name: a.name, cond: a.cond, until: "startOfSourceTurn", src: u.id, endSave: { ab: a.ab, dc: a.dc } }); log(state, t.name + " ติดสภาพ " + a.cond); }
  }
  checkOver(state);
}

// a whole monster turn. pick = index into buildMenu() (from Claude) or undefined for the best plan
export function runMonsterTurn(state, u, pick) {
  if (!alive(u) || !u.turn) return null;
  if (hasCond(u, "Frightened") && Math.random() < 0) delCond(u, "Frightened");
  if (!u.turn.action && !u.turn.move) { log(state, u.name + " ขยับไม่ได้ในตานี้"); return null; }
  if (hasCond(u, "Prone") && u.turn.move >= u.speed / 2) { delCond(u, "Prone"); u.turn.moved += Math.floor(u.speed / 2); log(state, u.name + " ลุกขึ้นยืน"); }
  const menu = u.tier !== "normal" ? buildMenu(state, u) : candidatePlans(state, u);
  const plan = menu[pick != null && menu[pick] ? pick : 0];
  executePlan(state, u, plan);
  return plan;
}
// legendary action after another creature's turn: a single best attack in reach (boss only)
export function legendaryAction(state, u) {
  if (!alive(u) || u.legLeft <= 0 || state.over || hasCond(u, "Incapacitated") || hasCond(u, "Paralyzed")) return false;
  let best = null;
  for (const t of foesOf(state, u).filter((f) => f.hp > 0)) {
    for (const a of u.actions.filter((x) => x.type === "attack")) {
      const ok = a.kind !== "ranged" ? dist(u, t) <= (a.reach || 5) : a.range && dist(u, t) <= a.range[1] && hasLOS(state, u, t);
      if (!ok) continue;
      const ev = pHit(a.hit + u.hitBonus, t.ac) * (a.avg || 1) + targetScore(state, u, t) / 50;
      if (!best || ev > best.ev) best = { a, t, ev };
    }
  }
  if (!best) return false;
  u.legLeft--;
  log(state, u.name + " ใช้ Legendary Action!", { kind: "legendary" });
  resolveAttack(state, u, best.t, monAtk(best.a, u));
  return true;
}
// compact text for Claude to pick a boss move
export function menuPrompt(state, u, menu) {
  const hp = Math.round((u.hp / u.maxHp) * 100);
  const foes = foesOf(state, u).map((f) => f.name + " HP " + f.hp + "/" + f.maxHp + " ห่าง " + dist(u, f) + "ft").join("; ");
  return u.name + " (" + (u.tier === "boss" ? "Boss" : "Sub Boss") + ", HP " + hp + "%" + (u.enraged ? ", เฟส 2" : "") + ")\nศัตรู: " + foes + "\nตัวเลือก:\n" + menu.map((p, i) => i + ". " + p.label).join("\n");
}
