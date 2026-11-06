// DnD for friend · play: campaigns, world, town, exploration, combat, DM, online sync (phases 2-5)
// Depends on app.js (h, S, D, IX, toast, render, go, saveCard...) and the engines (rules, combat, ai).
const CAMP = CAMPAIGN;
const MON = Object.fromEntries(D.monsters.map((m) => [m.id, m]));
const NET = { db: null, uid: null, user: null, sample: undefined, assets: undefined, local: false };
const P = { cid: null, meta: null, scene: null, party: {}, chat: [], unsub: [], myCardId: null, mode: "move", pending: null, hover: null,
  spellSel: null, attackSel: null, busy: false, tv: false, panel: "dm", tts: false, mapEdit: null, lastSpoken: null, anim: null, maps: {} };
try { P.tts = localStorage.getItem("dnd4f-tts") === "1"; } catch (e) {}
// homebrew Controlled Chaos potions show up as inventory items everywhere (market, party, DM)
const CHAOS_IDS = ["chaos-001", "chaos-002", "chaos-003", "chaos-004", "chaos-005f", "chaos-005c", "chaos-006"];
for (const id of CHAOS_IDS) IX.items[id] = { id, name: chaosItemName(id), kind: "gear", cost: 0, chaos: true };
const homebrewOn = () => !P.meta || P.meta.homebrew !== false;
const canBrew = (p) => !!p && (p.card.homebrew || []).includes("chaos-potions") && homebrewOn();
const chaosBottles = (card) => (card.inventory || []).filter((x) => chaosRecipe(x.id) && x.qty > 0);

// ---------- tiny local database (same shape as the db capability) for offline / signed-out play ----------
function localDB() {
  const KEY = "dnd4f-localdb";
  let data = {}; try { data = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  const subs = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };
  const snap = (path) => ({ id: path.split("/").pop(), exists: path in data, data: () => (path in data ? JSON.parse(JSON.stringify(data[path])) : undefined) });
  const emit = () => { save(); for (const s of [...subs]) s(); };
  const docRef = (path) => ({
    id: path.split("/").pop(),
    get: async () => snap(path),
    set: async (d) => { data[path] = JSON.parse(JSON.stringify(d)); emit(); },
    update: async (d) => { data[path] = { ...(data[path] || {}), ...JSON.parse(JSON.stringify(d)) }; emit(); },
    delete: async () => { delete data[path]; emit(); },
    onSnapshot(cb) { const f = () => cb(snap(path)); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
    collection: (p) => colRef(path + "/" + p),
  });
  const colRef = (path) => {
    const q = {
      doc: (id) => docRef(path + "/" + (id || Math.random().toString(36).slice(2, 12))),
      add: async (d) => { const r = docRef(path + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)); await r.set(d); return r; },
      orderBy: () => q, limit: () => q, where: () => q,
      get: async () => ({ docs: list() }),
      onSnapshot(cb) { const f = () => { const docs = list(); cb({ docs, size: docs.length, empty: !docs.length }); }; subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
    };
    const list = () => Object.keys(data).filter((k) => k.startsWith(path + "/") && k.slice(path.length + 1).indexOf("/") < 0).sort().map(snap);
    return q;
  };
  return { doc: docRef, collection: colRef };
}
let DBX = null;
function dbx() { if (!DBX) { DBX = NET.db || localDB(); NET.local = !NET.db; } return DBX; }
const myUid = () => NET.uid || "local";
async function useSample() {
  if (NET.sample !== undefined) return NET.sample;
  try { NET.sample = window.claude ? await window.claude.use("sample") : null; } catch (e) { NET.sample = null; }
  return NET.sample;
}
async function useAssets() {
  if (NET.assets !== undefined) return NET.assets;
  try { NET.assets = window.claude ? await window.claude.use("assets") : null; } catch (e) { NET.assets = null; }
  return NET.assets;
}

// ---------- campaign list ----------
let campUnsub = null;
function watchCampaigns() {
  if (campUnsub) return;
  campUnsub = dbx().collection("campaigns").onSnapshot((snap) => {
    S.campaigns = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    if (S.view === "play" && !P.cid) render();
  }, () => {});
}
async function createCampaign(name) {
  const id = "c" + Date.now().toString(36);
  const meta = { id, name: name || CAMP.name, preset: CAMP.id, owner: myUid(), hostUid: myUid(), createdAt: Date.now(), updated: Date.now(),
    cleared: {}, done: {}, opened: {}, found: {}, flags: {}, day: 1, dmBusy: false, log: [], homebrew: true };
  await dbx().doc("campaigns/" + id).set(meta);
  await dbx().doc("campaigns/" + id + "/scene/main").set({ rev: 1, mode: "town", loc: CAMP.start, combat: null, updated: Date.now() });
  await dbx().collection("campaigns/" + id + "/chat").add({ ts: Date.now(), kind: "dm", text: "ยินดีต้อนรับสู่ " + CAMP.name + " · " + CAMP.th + "\n\n" + CAMP.summary + "\n\n" + CAMP.town.intro, who: "DM" });
  return id;
}
function openCampaign(cid) {
  closeCampaign();
  P.cid = cid; P.party = {}; P.chat = []; P.meta = null; P.scene = null; P.maps = {};
  const base = "campaigns/" + cid;
  P.unsub.push(dbx().doc(base).onSnapshot((s) => { P.meta = s.exists ? s.data() : null; onSync(); }));
  P.unsub.push(dbx().doc(base + "/scene/main").onSnapshot((s) => { P.scene = s.exists ? s.data() : null; onSync("scene"); }));
  P.unsub.push(dbx().collection(base + "/party").onSnapshot((s) => { P.party = Object.fromEntries(s.docs.map((d) => [d.id, d.data()])); onSync("party"); }));
  P.unsub.push(dbx().collection(base + "/chat").orderBy("ts", "desc").limit(60).onSnapshot((s) => { P.chat = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.ts - b.ts); onSync("chat"); }));
  P.unsub.push(dbx().collection(base + "/maps").onSnapshot((s) => { P.maps = Object.fromEntries(s.docs.map((d) => [d.id, d.data()])); bgCache.clear(); onSync(); }));
  S.view = "play"; render();
}
function closeCampaign() { P.unsub.forEach((u) => { try { u(); } catch (e) {} }); P.unsub = []; P.cid = null; P.myCardId = null; }
const isHost = () => !!P.meta && (NET.local || P.meta.hostUid === myUid());
const myParty = () => Object.values(P.party).filter((p) => NET.local || p.uid === myUid());
function canControl(unit) {
  if (!unit) return false;
  if (NET.local) return true;
  const pd = P.party[unit.cardId];
  return (pd && pd.uid === myUid()) || (isHost() && pd && pd.uid && (Date.now() - (pd.seen || 0) > 120000));
}

// ---------- map data ----------
function mapDef(id) {
  const base = CAMP.maps[id];
  const ov = P.maps[id];
  if (!base && !ov) return null;
  return { ...(base || {}), ...(ov || {}), id };
}
function gridOf(def) {
  const walls = {}, difficult = {};
  def.rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === "#" || c === "T" || c === " ") walls[x + "," + y] = 1; if (c === "," || c === "~") difficult[x + "," + y] = 1; }));
  return { w: def.rows[0].length, h: def.rows.length, walls, difficult };
}
function cellsOf(def, ch) { const out = []; def.rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === ch) out.push({ x, y }); })); return out; }
function encounterSpawns(def, L, partySize) {
  const enc = def.encounters[L]; if (!enc) return [];
  const cells = [...(enc.boss ? cellsOf(def, "B") : []), ...cellsOf(def, L)];
  const out = [];
  enc.monsters.forEach(([id, tier = "normal", minParty = 0], i) => { if (partySize >= minParty && cells[i]) out.push({ id, tier, x: cells[i].x, y: cells[i].y, n: i + 1 }); });
  return out;
}
const clearedKey = (map, L) => map + ":" + L;
function visibleCells(grid, from, radius = 7) {
  const out = new Set();
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const x = from.x + dx, y = from.y + dy;
    if (x < 0 || y < 0 || x >= grid.w || y >= grid.h || dx * dx + dy * dy > radius * radius + 1) continue;
    if (hasLOS({ map: grid }, from, { x, y })) out.add(x + "," + y);
  }
  return out;
}

// ---------- writes ----------
async function writeScene(patch) {
  const next = { ...P.scene, ...patch, rev: (P.scene ? P.scene.rev || 0 : 0) + 1, updated: Date.now(), by: myUid() };
  P.scene = next; // optimistic
  await dbx().doc("campaigns/" + P.cid + "/scene/main").set(next);
}
async function writeParty(cardId, patch) {
  const cur = P.party[cardId] || {};
  const next = { ...cur, ...patch };
  P.party[cardId] = next;
  await dbx().doc("campaigns/" + P.cid + "/party/" + cardId).set(next);
}
async function writeMeta(patch) { P.meta = { ...P.meta, ...patch, updated: Date.now() }; await dbx().doc("campaigns/" + P.cid).update({ ...patch, updated: Date.now() }); }
async function say(kind, text, extra = {}) { await dbx().collection("campaigns/" + P.cid + "/chat").add({ ts: Date.now(), kind, text, who: extra.who || (kind === "dm" ? "DM" : ""), uid: myUid(), ...extra }); }

// ---------- join / sync cards ----------
async function joinWith(card) {
  const c = clone(card); delete c.premade; c.owner = myUid();
  const sh = computeSheet(c, D);
  const def = P.scene && mapDef(P.scene.loc);
  const start = def && def.rows ? freeStart(def) : { x: 1, y: 1 };
  await writeParty(c.id, { uid: myUid(), cardId: c.id, card: c, live: { hp: sh.hpMax, slotsUsed: [], resUsed: {}, conditions: [], deathSaves: { ok: 0, fail: 0 }, dead: false, hitDice: c.level, brewsLeft: 2 }, pos: start, revealed: {}, seen: Date.now() });
  P.myCardId = c.id; P.forceJoin = false;
  await say("system", c.name + " (" + classLine(c) + " Lv" + c.level + ") เข้าร่วมทีม");
  render();
}
function freeStart(def) {
  const s = cellsOf(def, "S")[0] || { x: 1, y: 1 };
  const taken = new Set(Object.values(P.party).map((p) => p.pos && p.pos.x + "," + p.pos.y));
  const grid = gridOf(def);
  for (let r = 0; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const k = (s.x + dx) + "," + (s.y + dy);
    if (!grid.walls[k] && !taken.has(k) && s.x + dx >= 0 && s.y + dy >= 0) return { x: s.x + dx, y: s.y + dy };
  }
  return s;
}
// rewards written into the campaign copy flow back to the player's own saved card
let syncedRev = {};
function syncMyCards() {
  for (const p of Object.values(P.party)) {
    if (p.uid !== myUid() && !NET.local) continue;
    const mine = S.cards.find((c) => c.id === p.cardId);
    if (!mine) continue;
    const sig = p.card.xp + "|" + p.card.gp + "|" + JSON.stringify(p.card.inventory);
    if (syncedRev[p.cardId] === sig) continue;
    syncedRev[p.cardId] = sig;
    if (mine.xp !== p.card.xp || mine.gp !== p.card.gp || JSON.stringify(mine.inventory) !== JSON.stringify(p.card.inventory))
      saveCard({ ...mine, xp: p.card.xp, gp: p.card.gp, inventory: p.card.inventory }).catch(() => {});
  }
}
async function refreshCardFromShelf(cardId) {
  const mine = S.cards.find((c) => c.id === cardId);
  const p = P.party[cardId];
  if (!mine || !p) return toast("ไม่พบการ์ดนี้ในการ์ดของคุณ");
  const card = { ...clone(mine), owner: p.uid, xp: Math.max(mine.xp, p.card.xp), gp: p.card.gp, inventory: p.card.inventory };
  const sh = computeSheet(card, D);
  const live = { ...p.live, hp: Math.min(sh.hpMax, (p.live.hp || 0) + Math.max(0, sh.hpMax - computeSheet(p.card, D).hpMax)), hitDice: card.level };
  await writeParty(cardId, { card, live });
  toast("อัปเดต " + card.name + " เป็นเลเวล " + card.level + " แล้ว");
}

// ---------- reaction to every sync ----------
let renderQueued = false;
function onSync(what) {
  if (what === "party") syncMyCards();
  if (!P.myCardId) { const mine = myParty()[0]; if (mine) P.myCardId = mine.cardId; }
  if (what === "chat" && P.tts) speakLatest();
  if (isHost()) hostTick(what);
  if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; if (S.view === "play") renderPlay(); }); }
}
// safety net: the host keeps the game moving even if a sync was missed
setInterval(() => { if (P.cid && P.scene && isHost()) hostTick(); }, 3000);
// heartbeat so the host knows who is online
setInterval(() => { if (P.cid && P.myCardId && P.party[P.myCardId] && !NET.local) dbx().doc("campaigns/" + P.cid + "/party/" + P.myCardId).update({ seen: Date.now() }).catch(() => {}); }, 60000);

// ---------- combat state helpers ----------
function combatState() { if (!P.scene || !P.scene.combat) return null; return attachData(clone(P.scene.combat), D); }
async function commitCombat(st) { await writeScene({ combat: serialize(st) }); }
function finishTurn(st) {
  const u = current(st);
  if (u && u.side === "pc") for (const b of Object.values(st.units)) if (b.legendary && alive(b) && b.legLeft > 0) legendaryAction(st, b);
  return endTurn(st);
}
async function act(fn) {
  const st = combatState(); if (!st) return;
  const u = current(st);
  const res = fn(st, u);
  if (res && res.error) { toast(res.error); return; }
  P.pending = null; P.attackSel = null; P.spellSel = null;
  await commitCombat(st);
}

// ---------- host: monster turns, encounters, combat end, DM ----------
let hostBusy = false;
function hostTick() {
  if (hostBusy || !P.scene) return;
  const sc = P.scene;
  if (sc.mode === "combat" && sc.combat) {
    const st = combatState();
    if (st.over && !sc.finalized) { hostBusy = true; finalizeCombat(st).finally(() => { hostBusy = false; setTimeout(hostTick, 50); }); return; }
    const u = current(st);
    if (!u || st.over) return;
    if (u.side === "foe") { hostBusy = true; setTimeout(() => monsterTurn().finally(() => { hostBusy = false; hostTick(); }), 650); return; }
    if (u.side === "pc" && (u.hp <= 0 || u.dead)) { hostBusy = true; setTimeout(async () => { const s2 = combatState(); if (current(s2) && current(s2).id === u.id) { finishTurn(s2); await commitCombat(s2); } hostBusy = false; hostTick(); }, 900); return; }
  } else if (sc.mode === "explore" && !P.arriving) checkEncounters();
  maybeDM();
}
async function monsterTurn() {
  const st = combatState(); const u = current(st);
  if (!u || u.side !== "foe") return;
  let pick;
  if (u.tier !== "normal") {
    const menu = buildMenu(st, u);
    const sample = await useSample();
    if (sample && menu.length > 1) {
      try {
        const ans = await sample.json(bossPrompt(st, u, menu), { modelTier: "quick" });
        if (ans && Number.isInteger(ans.pick) && menu[ans.pick]) { pick = ans.pick; if (ans.line) log(st, "🗣 " + u.name + ": “" + String(ans.line).slice(0, 160) + "”", { kind: "say" }); }
      } catch (e) { /* fall back to the best plan */ }
    }
  }
  const st2 = st; // same object
  runMonsterTurn(st2, u, pick);
  finishTurn(st2);
  await commitCombat(st2);
}
function bossPrompt(st, u, menu) {
  return "คุณคือ DM ของเกม D&D เลือกท่าให้ศัตรูตัวนี้ในตานี้ เลือกให้สนุกและสมกับนิสัยของมัน ไม่ต้องเลือกท่าที่ดีที่สุดเสมอ\n" +
    menuPrompt(st, u, menu) + "\nตอบเป็น JSON เท่านั้น: {\"pick\": <เลขตัวเลือก>, \"line\": \"คำพูดสั้น ๆ ของศัตรูเป็นภาษาไทย ไม่เกิน 15 คำ\"}";
}
function checkEncounters() {
  const sc = P.scene; const def = mapDef(sc.loc); if (!def || !def.encounters) return;
  const grid = gridOf(def);
  const members = Object.values(P.party).filter((p) => p.pos && !(p.live && p.live.dead));
  if (!members.length) return;
  for (const L of Object.keys(def.encounters)) {
    if (P.meta.cleared && P.meta.cleared[clearedKey(sc.loc, L)]) continue;
    const spawns = encounterSpawns(def, L, members.length);
    const seen = spawns.some((s) => members.some((p) => dist(p.pos, s) <= 40 && hasLOS({ map: grid }, p.pos, s)));
    if (seen) { hostBusy = true; startCombat(def, L).finally(() => { hostBusy = false; setTimeout(hostTick, 50); }); return; }
  }
}
async function startCombat(def, L) {
  const grid = gridOf(def);
  const members = Object.values(P.party).filter((p) => p.pos && !(p.live && p.live.dead));
  const units = members.map((p) => { const u = pcUnit({ ...p.card, owner: p.uid }, D, p.live); u.x = p.pos.x; u.y = p.pos.y; u.owner = p.uid; return u; });
  for (const s of encounterSpawns(def, L, members.length)) { const m = monsterUnit(MON[s.id], s.tier, s.n, members.length); m.x = s.x; m.y = s.y; units.push(m); }
  const st = newCombat(grid, units, D);
  st.encounter = L; st.mapId = def.id; st.boss = !!def.encounters[L].boss;
  log(st, "⚔️ " + def.encounters[L].th + "!", { kind: "start" });
  rollInitiative(st);
  await writeScene({ mode: "combat", combat: serialize(st), finalized: false });
  await say("system", "⚔️ เริ่มการต่อสู้: " + def.encounters[L].th + " · " + st.order.map((id) => st.units[id].name + " " + st.units[id].init).join(" · "));
}
async function finalizeCombat(st) {
  const def = mapDef(st.mapId);
  const pcs = Object.values(st.units).filter((u) => u.side === "pc");
  if (st.over === "win") {
    const share = Math.floor(st.xpPool / Math.max(1, pcs.length));
    const milestone = st.boss && def.milestone ? def.milestone : 0;
    for (const u of pcs) {
      const p = P.party[u.cardId]; if (!p) continue;
      const card = { ...p.card, xp: Math.max((p.card.xp || 0) + share, milestone) };
      await writeParty(u.cardId, { card, live: { ...p.live, ...liveOf(u) } });
    }
    const cleared = { ...(P.meta.cleared || {}), [clearedKey(st.mapId, st.encounter)]: true };
    const done = st.boss ? { ...(P.meta.done || {}), [st.mapId]: true } : P.meta.done || {};
    await writeMeta({ cleared, done });
    await writeScene({ mode: "explore", combat: null, finalized: true, lastCombat: { result: "win", xp: share, enc: def.encounters[st.encounter].th, boss: st.boss } });
    await say("system", "🏆 ชนะ " + def.encounters[st.encounter].th + " · ได้ EXP คนละ " + share + (milestone ? " (บอสดันเจี้ยน: EXP อย่างน้อย " + milestone + ")" : "") + pcs.filter((u) => u.dead).map((u) => " · " + u.name + " เสียชีวิต ต้องไปชุบที่วิหาร").join(""));
    requestDM({ event: "ชนะการต่อสู้กับ " + def.encounters[st.encounter].th + (st.boss ? " (บอสของสถานที่นี้)" + (def.final ? " นี่คือบอสสุดท้ายของแคมเปญ ให้บรรยายตอนจบ" : "") : "") });
  } else {
    for (const u of pcs) {
      const p = P.party[u.cardId]; if (!p) continue;
      const fee = Math.min(p.card.gp || 0, 50 * p.card.level);
      const sh = computeSheet(p.card, D);
      await writeParty(u.cardId, { card: { ...p.card, gp: (p.card.gp || 0) - fee }, live: { ...p.live, ...liveOf(u), hp: Math.max(1, Math.floor(sh.hpMax / 2)), dead: false, deathSaves: { ok: 0, fail: 0 } } });
    }
    await writeScene({ mode: "town", loc: CAMP.start, combat: null, finalized: true, lastCombat: { result: "lose" } });
    await say("system", "💀 ทีมพ่ายแพ้… ทุกคนตื่นขึ้นที่วิหารรุ่งอรุณ ใน Brindlemoor (เสียค่าชุบชีวิต 50 GP × เลเวล หรือเท่าที่มี)");
    requestDM({ event: "ทีมแพ้และถูกพากลับมาชุบชีวิตที่วิหาร" });
  }
}

// ---------- DM (Claude) ----------
function requestDM(extra) {
  if (isHost()) { P.dmQueue = (P.dmQueue || []).concat([extra]); maybeDM(); }
  else if (P.cid) say("system", "📜 " + extra.event, { dmEvent: true }).catch(() => {});
}
let dmRunning = false;
async function maybeDM() {
  if (!isHost() || dmRunning || !P.chat.length) return;
  const needPlayer = P.chat.some((m) => (m.kind === "player" || m.dmEvent) && !m.answered);
  if (!needPlayer && !(P.dmQueue && P.dmQueue.length)) return;
  const sample = await useSample();
  if (!sample) return;
  dmRunning = true;
  try {
    const events = P.dmQueue || []; P.dmQueue = [];
    const pendAll = P.chat.filter((m) => (m.kind === "player" || m.dmEvent) && !m.answered);
    for (const m of pendAll) { m.answered = true; dbx().doc("campaigns/" + P.cid + "/chat/" + m.id).update({ answered: true }).catch(() => {}); }
    const pending = pendAll.filter((m) => m.kind === "player");
    events.push(...pendAll.filter((m) => m.dmEvent).map((m) => ({ event: m.text.replace(/^📜 /, "") })));
    await runDM(sample, pending, events, 0);
  } catch (e) {
    await say("system", e && e.code === "rate_limited" ? "DM ตอบถี่เกินไป รอสักครู่แล้วพิมพ์ใหม่" : "DM ตอบไม่ได้ตอนนี้ (" + ((e && e.code) || "error") + ")");
  } finally { dmRunning = false; }
}
function partySummary() {
  return Object.values(P.party).map((p) => {
    const sh = computeSheet(p.card, D);
    const st = P.scene && P.scene.combat ? (P.scene.combat.units["pc-" + p.cardId] || {}) : {};
    const hp = st.hp ?? p.live.hp ?? sh.hpMax;
    return p.card.name + " (" + classLine(p.card) + " Lv" + p.card.level + ", HP " + hp + "/" + sh.hpMax + ", " + (p.card.gp || 0) + " GP" + (p.live.dead ? ", เสียชีวิต" : "") + ")";
  }).join("\n");
}
function dmContext() {
  const sc = P.scene; const loc = sc.loc;
  const isTown = loc === CAMP.town.id;
  const def = mapDef(loc);
  const lines = [];
  lines.push("แคมเปญ: " + CAMP.name + " · " + CAMP.summary);
  lines.push("โน้ต DM: " + CAMP.dmNotes);
  if (isTown) {
    lines.push("ตอนนี้อยู่: " + CAMP.town.intro + "\nสถานที่ในหมู่บ้าน: " + CAMP.town.places.map((p) => p.name + " (" + p.desc + ")").join("; ") + "\nNPC: " + CAMP.town.npcs + "\nข่าวลือ: " + CAMP.town.rumors.join(" / "));
  } else if (def) {
    const enc = Object.entries(def.encounters || {}).map(([L, e]) => L + "=" + e.th + (P.meta.cleared && P.meta.cleared[clearedKey(loc, L)] ? " (ชนะแล้ว)" : "")).join(", ");
    lines.push("ตอนนี้อยู่: " + def.name + " (" + def.th + ", เลเวลแนะนำ " + def.level + ")\nบรรยากาศ: " + def.intro + "\nความลับ DM: " + (def.dm || "") + "\nการต่อสู้ในแผนที่: " + enc);
  }
  lines.push("ดันเจี้ยนที่จบแล้ว: " + (Object.keys(P.meta.done || {}).join(", ") || "ยังไม่มี"));
  lines.push("สถานที่บนแผนที่โลก: " + CAMP.world.locations.map((l) => l.id + "=" + l.name + " (Lv " + l.level + ")").join(", "));
  lines.push("ทีม:\n" + partySummary());
  if (homebrewOn() && Object.values(P.party).some(canBrew)) lines.push("Homebrew ที่อนุญาต: ระบบปรุงยา Controlled Chaos V2.1 ของ " + Object.values(P.party).filter(canBrew).map((p) => p.card.name).join(", ") + " ปรุงได้ 2 ขวด/พักยาว สูตร 001–006 ดื่มแล้วทอย d6 ได้ผล A หรือ B (มีทั้งข้อดีและข้อเสีย) นาน 1 นาที หน้าเว็บคิดผลให้ คุณแค่เล่าฉากให้สนุกตามบุคลิกนักปรุงยาที่ไม่ยอมลองยากับตัวเอง");
  if (P.meta.flags && Object.keys(P.meta.flags).length) lines.push("ธงเนื้อเรื่อง: " + JSON.stringify(P.meta.flags));
  return lines.join("\n");
}
const DM_RULES = `คุณคือ Dungeon Master ของเกม D&D (กติกา SRD 5.2.1) ชื่อเกม DnD for friend เล่าเรื่องเป็นภาษาไทย สนุก กระชับ มีบรรยากาศ ใช้ศัพท์เกมภาษาอังกฤษได้ (HP, AC, Perception)
กฎ:
- หน้าเว็บคิดตัวเลขทั้งหมด คุณห้ามทอยเต๋าหรือแต่งผลทอยเอง ถ้าต้องตรวจทักษะ ให้ขอผ่าน "checks" แล้วรอผล
- ห้ามตัดสินใจแทนผู้เล่น จบแต่ละข้อความด้วยสถานการณ์ที่ให้ผู้เล่นเลือกต่อ
- การต่อสู้เริ่มเองเมื่อผู้เล่นเดินไปเห็นศัตรูบนแผนที่ คุณสั่งเริ่มได้ด้วย action startCombat เมื่อเรื่องดำเนินไปสู่การต่อสู้แน่นอน
- ให้รางวัลอย่างสมเหตุสมผล (เงินเล็กน้อย, potion-healing) ผ่าน action give
- ตอบไม่เกิน 120 คำ
ตอบเป็น JSON เท่านั้น ตามรูปแบบ:
{"say":"คำบรรยาย","checks":[{"who":"ชื่อตัวละคร","skill":"Perception","dc":12}],"action":null,"options":["ทางเลือกสั้น 1","ทางเลือกสั้น 2"]}
action เป็นได้: null | {"type":"startCombat","enc":"a"} | {"type":"travel","to":"<location id>"} | {"type":"give","who":"<ชื่อ หรือ all>","gp":10,"items":[["potion-healing",1]],"xp":0} | {"type":"rest","kind":"short"|"long"} | {"type":"flag","key":"ชื่อ","value":true}
skill ใช้ชื่อภาษาอังกฤษของ D&D หรือ STR/DEX/CON/INT/WIS/CHA สำหรับเซฟ`;
async function runDM(sample, playerMsgs, events, depth, checkResults) {
  const history = P.chat.slice(-14).map((m) => (m.kind === "dm" ? "DM: " : m.kind === "system" ? "[ระบบ] " : (m.who || "ผู้เล่น") + ": ") + m.text).join("\n");
  const now = [
    ...events.map((e) => "[เหตุการณ์] " + e.event),
    ...playerMsgs.map((m) => (m.who || "ผู้เล่น") + " ทำ/พูด: " + m.text),
    ...(checkResults ? ["[ผลการทอย] " + checkResults] : []),
  ].join("\n");
  const prompt = DM_RULES + "\n\n=== สถานการณ์ ===\n" + dmContext() + "\n\n=== บทสนทนาล่าสุด ===\n" + history + "\n\n=== ตอนนี้ ===\n" + (now || "ผู้เล่นรอให้ DM เล่าต่อ") + (depth ? "\n(นี่คือรอบเล่าผลทอย ห้ามขอ checks เพิ่ม)" : "");
  const ans = await sample.json(prompt, { modelTier: "default" });
  const text = String((ans && ans.say) || "").trim();
  if (text) await say("dm", text, { options: Array.isArray(ans.options) ? ans.options.slice(0, 4).map(String) : [] });
  if (ans && ans.action) await dmAction(ans.action);
  if (!depth && ans && Array.isArray(ans.checks) && ans.checks.length) {
    const results = ans.checks.slice(0, 4).map(rollCheck).filter(Boolean);
    if (results.length) {
      await say("system", "🎲 " + results.join("\n🎲 "));
      await runDM(sample, [], [], 1, results.join("; "));
    }
  }
}
function findMember(name) {
  const n = String(name || "").toLowerCase();
  return Object.values(P.party).find((p) => p.card.name.toLowerCase() === n) || Object.values(P.party).find((p) => p.card.name.toLowerCase().includes(n.split(" ")[0])) || null;
}
function rollCheck(c) {
  const p = findMember(c.who) || Object.values(P.party)[0]; if (!p) return null;
  const sh = computeSheet(p.card, D);
  const sk = sh.skills.find((s) => s.name.toLowerCase() === String(c.skill).toLowerCase());
  const ab = ABILITIES.includes(String(c.skill).toUpperCase()) ? String(c.skill).toUpperCase() : null;
  let bonus = sk ? sk.bonus : ab ? sh.saves.find((s) => s.ab === ab).bonus : 0;
  const r = d(20);
  let potion = 0;
  if (p.live.checkBonus && sk) { potion = d(4); bonus += potion; writeParty(p.cardId, { live: { ...p.live, checkBonus: false } }).catch(() => {}); }
  const total = r + bonus; const dc = +c.dc || 10;
  return p.card.name + " " + (sk ? sk.name : ab ? ab + " save" : c.skill) + ": " + r + (bonus >= 0 ? "+" : "") + bonus + " = " + total + " vs DC " + dc + (potion ? " (รวมยาปรุง +" + potion + ")" : "") + (total >= dc ? " ✅ สำเร็จ" : " ❌ ไม่สำเร็จ");
}
async function dmAction(a) {
  try {
    if (a.type === "startCombat" && P.scene.mode === "explore") { const def = mapDef(P.scene.loc); if (def && def.encounters && def.encounters[a.enc] && !(P.meta.cleared || {})[clearedKey(def.id, a.enc)]) await startCombat(def, a.enc); }
    else if (a.type === "travel" && CAMP.world.locations.some((l) => l.id === a.to)) await travelTo(a.to, true);
    else if (a.type === "give") {
      const who = a.who === "all" ? Object.values(P.party) : [findMember(a.who)].filter(Boolean);
      for (const p of who) {
        const inv = clone(p.card.inventory || []);
        for (const [id, q] of (a.items || []).slice(0, 4)) if (IX.items[id]) { const e = inv.find((x) => x.id === id); if (e) e.qty += Math.min(3, +q || 1); else inv.push({ id, qty: Math.min(3, +q || 1), equipped: false }); }
        await writeParty(p.cardId, { card: { ...p.card, gp: (p.card.gp || 0) + Math.min(500, Math.max(0, +a.gp || 0)), xp: (p.card.xp || 0) + Math.min(1000, Math.max(0, +a.xp || 0)), inventory: inv } });
      }
      if (who.length) await say("system", "🎁 " + who.map((p) => p.card.name).join(", ") + " ได้รับ" + (a.gp ? " " + a.gp + " GP" : "") + ((a.items || []).length ? " " + a.items.map(([id, q]) => q + "× " + iname(id)).join(", ") : "") + (a.xp ? " " + a.xp + " EXP" : ""));
    } else if (a.type === "rest") await restParty(a.kind === "long" ? "long" : "short", true);
    else if (a.type === "flag" && a.key) await writeMeta({ flags: { ...(P.meta.flags || {}), [String(a.key).slice(0, 40)]: a.value ?? true } });
  } catch (e) { /* ignore a malformed action */ }
}

// ---------- shared party actions ----------
async function travelTo(loc, quiet) {
  const isTown = loc === CAMP.town.id;
  const def = mapDef(loc);
  const L0 = CAMP.world.locations.find((l) => l.id === loc) || (CAMP.maps[loc] ? CAMP.maps[loc] : null);
  await say("system", "🧭 ทีมเดินทางไป " + (L0 ? L0.name + " · " + L0.th : loc));
  P.arriving = true;
  await writeScene({ mode: isTown ? "town" : "explore", loc, combat: null, lastCombat: null });
  if (!isTown && def) {
    let i = 0;
    const s = cellsOf(def, "S")[0] || { x: 1, y: 1 };
    const grid = gridOf(def);
    const spots = [];
    for (let r = 0; r < 4 && spots.length < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const k = (s.x + dx) + "," + (s.y + dy); if (!grid.walls[k] && !spots.some((p) => p.k === k)) spots.push({ x: s.x + dx, y: s.y + dy, k }); }
    for (const p of Object.values(P.party)) { const sp = spots[i++] || s; await writeParty(p.cardId, { pos: { x: sp.x, y: sp.y } }); }
  }
  P.arriving = false;
  const L = L0;
  if (!quiet) requestDM({ event: "ทีมเดินทางมาถึง " + (L ? L.name : loc) + (def && def.intro ? " · " + def.intro : isTown ? " · " + CAMP.town.intro : "") });
}
async function restParty(kind, quiet) {
  for (const p of Object.values(P.party)) {
    const u = pcUnit(p.card, D, p.live);
    if (kind === "long") longRestUnit(u); else shortRestUnit(u, u.hp < u.maxHp ? Math.ceil((u.maxHp - u.hp) / (u.hitDie / 2 + 1 + u.mods.CON || 1)) : 0);
    const patch = { live: { ...liveOf(u), dead: p.live.dead, brewsLeft: kind === "long" ? 2 : p.live.brewsLeft ?? 2, checkBonus: kind === "long" ? false : !!p.live.checkBonus } };
    if (kind === "long" && chaosBottles(p.card).length) patch.card = { ...p.card, inventory: p.card.inventory.filter((x) => !chaosRecipe(x.id)) };
    await writeParty(p.cardId, patch);
  }
  await say("system", kind === "long" ? "🌙 ทีมพักยาว: HP เต็ม ช่องเวทและความสามารถคืนครบ" + (Object.values(P.party).some(canBrew) ? " · นักปรุงยาปรุงได้อีก 2 ขวด (ขวดเก่าหมดฤทธิ์)" : "") : "☕ ทีมพักสั้น 1 ชั่วโมง: ใช้ Hit Dice ฟื้น HP และคืน Second Wind/Action Surge");
  if (!quiet) requestDM({ event: kind === "long" ? "ทีมพักค้างคืน" : "ทีมพักสั้น" });
}

// ---------- chat ----------
async function sendChat(text) {
  text = text.trim(); if (!text) return;
  const me = P.party[P.myCardId];
  await say("player", text, { who: me ? me.card.name : "ผู้เล่น" });
  if (!isHost() && !NET.local) {
    const host = Object.values(P.party).find((p) => p.uid === P.meta.hostUid);
    if (!host || Date.now() - (host.seen || 0) > 180000) toast("ตอนนี้ host ไม่ได้เปิดเกม DM จะตอบเมื่อ host กลับมา");
  }
}
function speakLatest() {
  const last = [...P.chat].reverse().find((m) => m.kind === "dm");
  if (!last || last.id === P.lastSpoken) return;
  if (P.lastSpoken == null) { P.lastSpoken = last.id; return; } // do not read history on open
  P.lastSpoken = last.id; speak(last.text);
}
function speak(text) {
  try {
    const synth = window.speechSynthesis; if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#>]/g, ""));
    const v = synth.getVoices().find((x) => /^th/i.test(x.lang));
    if (v) u.voice = v; u.lang = "th-TH"; u.rate = 1.02;
    synth.speak(u);
  } catch (e) {}
}
