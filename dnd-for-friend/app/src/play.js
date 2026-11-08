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
  P.cid = cid; P.party = {}; P.partyLoaded = false; P.chat = []; P.meta = null; P.scene = null; P.maps = {}; lsSet("dnd-last-room", cid);
  const base = "campaigns/" + cid;
  P.unsub.push(dbx().doc(base).onSnapshot((s) => { P.meta = s.exists ? s.data() : null; onSync(); }));
  P.unsub.push(dbx().doc(base + "/scene/main").onSnapshot((s) => { P.scene = s.exists ? s.data() : null; onSync("scene"); }));
  P.unsub.push(dbx().collection(base + "/party").onSnapshot((s) => { P.party = Object.fromEntries(s.docs.map((d) => [d.id, d.data()])); P.partyLoaded = true; onSync("party"); }));
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
const unEntity = (t) => String(t == null ? "" : t).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
// chat lines said inside a village building carry that building's id, so the building shows its own conversation
async function say(kind, text, extra = {}) {
  const place = "place" in extra ? extra.place : (P.scene && P.scene.mode === "town" && P.townPlace) || null;
  await dbx().collection("campaigns/" + P.cid + "/chat").add({ ts: Date.now(), kind, text: unEntity(text), who: extra.who || (kind === "dm" ? "DM" : ""), uid: myUid(), ...extra, place });
}

// ---------- join / sync cards ----------
async function joinWith(card) {
  const c = clone(card); delete c.premade; c.owner = myUid();
  if (!c.portrait) c.portrait = premadePortrait(c);
  const sh = computeSheet(c, D);
  const def = P.scene && mapDef(P.scene.loc);
  const start = def && def.rows ? freeStart(def) : { x: 1, y: 1 };
  await writeParty(c.id, { uid: myUid(), cardId: c.id, card: c, live: { hp: sh.hpMax, slotsUsed: [], resUsed: {}, conditions: [], deathSaves: { ok: 0, fail: 0 }, dead: false, hitDice: c.level, brewsLeft: 2 }, pos: start, revealed: {}, seen: Date.now(), joined: Date.now() });
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
  if (what === "chat" && isHost()) {
    maybeRecap(false);
    const req = [...P.chat].reverse().find((m) => m.recapReq);
    if (req && P.recapReqCid === P.cid && req.ts > P.recapReqSeen) maybeRecap(true);
    P.recapReqCid = P.cid; P.recapReqSeen = req ? req.ts : 0;
  }
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
  if (res && res.error) { toast(res.error); return false; }
  P.pending = null; P.attackSel = null; P.spellSel = null; P.pop = null;
  await commitCombat(st);
  return true;
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
    maybeFlavor(st);
    if (!u || st.over) return;
    if (st.improv && !st.improv.done) { hostBusy = true; resolveImprov().finally(() => { hostBusy = false; setTimeout(hostTick, 50); }); return; }
    if (u.side === "foe" && u.tier === "normal" && moraleDue(st)) { hostBusy = true; runMorale().finally(() => { hostBusy = false; setTimeout(hostTick, 50); }); return; }
    if (u.side === "foe") { hostBusy = true; setTimeout(() => monsterTurn().finally(() => { hostBusy = false; hostTick(); }), 650); return; }
    if (u.side === "pc" && (u.hp <= 0 || u.dead)) { hostBusy = true; setTimeout(async () => { const s2 = combatState(); if (current(s2) && current(s2).id === u.id) { finishTurn(s2); await commitCombat(s2); } hostBusy = false; hostTick(); }, 900); return; }
  } else if (sc.mode === "explore" && !P.arriving) {
    const ex = exState();
    if (ex.turn && (sc.ex || {}).turn !== ex.turn) { hostBusy = true; writeScene({ ex: { group: ex.group, turn: ex.turn, moved: 0, acted: false } }).finally(() => { hostBusy = false; }); return; }
    checkEncounters();
  }
  if (sc.qvote && sc.mode === "town") { const s = questVoteStatus(); if (s && (s.all || s.no.length)) { hostBusy = true; settleQuestVote().finally(() => { hostBusy = false; }); return; } }
  if (sc.vote && sc.mode !== "combat") { const v = voteStatus(); if (v && v.all) { hostBusy = true; const loc = sc.vote.loc; const caravan = !!sc.vote.caravan; writeScene({ vote: null }).then(() => travelTo(loc, false, { caravan })).finally(() => { hostBusy = false; }); return; } }
  maybeDM();
}
async function monsterTurn() {
  const st = combatState(); if (!st) return; const u = current(st);
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
    await countKills(st);
    await writeScene({ mode: "explore", combat: null, finalized: true, ex: { ...(P.scene.ex || {}), moved: 0, acted: false }, lastCombat: { result: "win", xp: share, enc: def.encounters[st.encounter].th, boss: st.boss, final: !!(st.boss && def.final), ts: Date.now() } });
    await say("system", "🏆 ชนะ " + def.encounters[st.encounter].th + " · ได้ EXP คนละ " + share + (milestone ? " (บอสดันเจี้ยน: EXP อย่างน้อย " + milestone + ")" : "") + pcs.filter((u) => u.dead).map((u) => " · " + u.name + " เสียชีวิต ต้องไปชุบที่วิหาร").join(""));
    if ((st.captives || []).length) await writeMeta({ flags: { ...(P.meta.flags || {}), captives: st.captives.join(", ") } });
    await questCheck();
    requestDM({ event: "ชนะการต่อสู้กับ " + def.encounters[st.encounter].th + ((st.captives || []).length ? " · จับเชลยได้: " + st.captives.join(", ") + " (ผู้เล่นสอบสวนได้)" : "") + (st.boss ? " (บอสของสถานที่นี้)" + (def.final ? " นี่คือบอสสุดท้ายของแคมเปญ ให้บรรยายตอนจบ" : "") : "") });
  } else {
    // stay on the battlefield with a "defeated" screen; a player taps to be carried back to the temple
    await writeScene({ finalized: true, defeat: { ts: Date.now(), enc: def.encounters[st.encounter].th } });
    await say("system", "💀 ทีมพ่ายแพ้ใน " + def.encounters[st.encounter].th + "…");
  }
}
async function returnAfterDefeat() {
  const sc = P.scene; if (!sc || !sc.defeat || P.returning) return;
  P.returning = true;
  try {
    const st = sc.combat ? combatState() : null;
    const pcs = st ? Object.values(st.units).filter((u) => u.side === "pc") : Object.values(P.party).map((p) => ({ ...pcUnit(p.card, D, p.live), cardId: p.cardId }));
    for (const u of pcs) {
      const p = P.party[u.cardId]; if (!p) continue;
      const fee = Math.min(p.card.gp || 0, 50 * p.card.level);
      const sh = computeSheet(p.card, D);
      await writeParty(u.cardId, { card: { ...p.card, gp: (p.card.gp || 0) - fee }, live: { ...p.live, ...liveOf(u), hp: Math.max(1, Math.floor(sh.hpMax / 2)), dead: false, deathSaves: { ok: 0, fail: 0 } } });
    }
    await writeScene({ mode: "town", loc: CAMP.start, combat: null, finalized: true, defeat: null, lastCombat: { result: "lose", ts: Date.now() }, vote: null });
    for (const p of Object.values(P.party)) if (P.party[p.cardId].townPlace) await writeParty(p.cardId, { townPlace: null });
    await say("system", "💀 ทุกคนตื่นขึ้นที่วิหารรุ่งอรุณ ใน Brindlemoor (เสียค่าชุบชีวิต 50 GP × เลเวล หรือเท่าที่มี)");
    requestDM({ event: "ทีมแพ้และถูกพากลับมาชุบชีวิตที่วิหาร" });
  } finally { P.returning = false; }
}

// ---------- Claude as the table's judge: improvised actions, enemy morale, recaps, flavor lines ----------
// Claude only rules (what to roll, how hard, what happens); the page rolls the dice and applies capped effects.
const IMPROV_CONDS = { Prone: { cond: "Prone" }, Restrained: { cond: "Restrained", endSave: "STR" }, Blinded: { cond: "Blinded" }, Frightened: { cond: "Frightened", endSave: "WIS" }, Grappled: { cond: "Grappled", endSave: "STR" } };
const SKILL_AB = { Athletics: "STR", Acrobatics: "DEX", "Sleight of Hand": "DEX", Stealth: "DEX", Arcana: "INT", History: "INT", Investigation: "INT", Nature: "INT", Religion: "INT", "Animal Handling": "WIS", Insight: "WIS", Medicine: "WIS", Perception: "WIS", Survival: "WIS", Deception: "CHA", Intimidation: "CHA", Performance: "CHA", Persuasion: "CHA" };
function unitCheckBonus(u, skill) {
  if (u.kind === "pc") { const p = P.party[u.cardId]; const sh = p && safeSheet(p.card); const sk = sh && sh.skills.find((s) => s.name.toLowerCase() === String(skill).toLowerCase()); if (sk) return sk.bonus; }
  const ab = SKILL_AB[skill] || (ABILITIES.includes(String(skill).toUpperCase()) ? String(skill).toUpperCase() : "STR");
  return (u.mods && u.mods[ab]) || 0;
}
const improvCap = (a) => ((a.level || 1) <= 2 ? 2 : (a.level || 1) <= 4 ? 3 : 4);
const improvDC = (a) => 8 + (a.pb || 2) + Math.max((a.mods || {}).STR || 0, (a.mods || {}).DEX || 0);
// player side: spend the Action and leave a request in the combat state for the host
async function requestImprov(text, targetId) {
  text = String(text || "").trim().slice(0, 200); if (!text) return toast("พิมพ์ก่อนว่าจะทำอะไร");
  await act((s, a) => {
    if (!a.turn || !a.turn.action) return { error: "ใช้ Action ไปแล้วในตานี้" };
    a.turn.action = 0; a.turn.attacksLeft = 0;
    s.improv = { id: s.seq + 1, by: a.id, text, target: targetId || null };
    log(s, "💡 " + a.name + " ลอง: " + text, { kind: "improv" });
  });
}
function improvPrompt(st, a, t, text) {
  const all = Object.values(st.units).filter(alive).map((u) => u.name + (u.side === "foe" ? " (ศัตรู" : " (ทีม") + ", ห่าง " + dist(a, u) + " ft" + (u.conditions.length ? ", " + u.conditions.join("/") : "") + ")").join("; ");
  const def = mapDef(st.mapId);
  return "คุณคือ DM ของเกม D&D (SRD 5.2.1) ผู้เล่นทำท่าแหวกแนวระหว่างต่อสู้ โดยใช้ Action ของตานี้ ตัดสินให้ยุติธรรม สนุก และสมเหตุสมผลตามสถานการณ์\n" +
    "ห้ามแรงกว่าการโจมตีปกติของเลเวลนี้ (ดาเมจไม่เกิน " + improvCap(a) + " ลูกเต๋า) ถ้าทำไม่ได้จริง ๆ ให้ impossible เป็น true\n" +
    "ผู้เล่น: " + a.name + " Lv " + (a.level || 1) + "\nสถานที่: " + (def ? def.name + " · " + (def.intro || "") : "") +
    "\nเป้าที่เลือก: " + (t ? t.name + " ห่าง " + dist(a, t) + " ft" : "ไม่ได้เลือก") + "\nในสนาม: " + all + "\nผู้เล่นบอกว่า: \"" + text + "\"\n" +
    "ตอบเป็น JSON เท่านั้น:\n{\"impossible\":false,\"skill\":\"Athletics\",\"dc\":13,\"save\":null,\"adv\":0,\"success\":{\"dmg\":\"1d6\",\"dtype\":\"Bludgeoning\",\"cond\":\"Prone\",\"adv\":false,\"cover\":false,\"surrender\":false},\"fail\":{},\"sayOk\":\"ผลถ้าสำเร็จ ไม่เกิน 25 คำ\",\"sayFail\":\"ผลถ้าพลาด ไม่เกิน 25 คำ\"}\n" +
    "- ใช้ skill กับ dc (10-20) เมื่อผู้เล่นเป็นคนทอย หรือใส่ save เป็น STR/DEX/CON/WIS เมื่อให้เป้าทอยเซฟแทน\n- adv เป็น 1 เมื่อสถานการณ์เป็นใจ (ซ่อนในเงามืด ยืนบนที่สูง ศัตรูเผลอ) หรือ -1 เมื่อยากผิดปกติ\n" +
    "- cond เลือกได้: Prone, Restrained, Blinded, Frightened, Grappled หรือ null · adv:true ให้ผู้เล่นตีครั้งถัดไปได้เปรียบ · cover:true ให้ AC +2 จนถึงตาหน้า\n- surrender:true เฉพาะเมื่อขู่หรือเกลี้ยกล่อมให้ศัตรูที่เหลือ (ไม่ใช่บอส) ยอมแพ้สำเร็จ และศัตรูบาดเจ็บหรือเสียเปรียบแล้ว";
}
async function resolveImprov() {
  const st0 = combatState(); const req = st0 && st0.improv; if (!req || req.done) return;
  const a0 = st0.units[req.by]; if (!a0) return;
  let rule = null;
  const sample = await useSample();
  if (sample) { try { rule = await sample.json(improvPrompt(st0, a0, req.target && st0.units[req.target], req.text), { modelTier: "quick" }); } catch (e) { rule = null; } }
  if (!rule || typeof rule !== "object") rule = { skill: "Athletics", dc: 12, success: { adv: true }, sayOk: "ได้จังหวะดี ตีครั้งต่อไปได้เปรียบ", sayFail: "ไม่ได้ผลอย่างที่หวัง" };
  // re-read right before writing so nothing a player did meanwhile is lost
  const st = combatState(); if (!st || !st.improv || st.improv.id !== req.id || st.improv.done) return;
  st.improv = { ...st.improv, done: true };
  applyImprov(st, st.units[req.by], req.target ? st.units[req.target] : null, rule);
  checkOver(st);
  await commitCombat(st);
}
function applyImprov(st, a, t, rule) {
  if (!a) return;
  if (rule.impossible) { log(st, "🎭 " + String(rule.sayFail || rule.say || "ทำแบบนั้นไม่ได้ในสถานการณ์นี้").slice(0, 220), { kind: "say" }); return; }
  let ok;
  const save = rule.save && String(rule.save).toUpperCase();
  if (t && save && ABILITIES.includes(save)) {
    const dc = Math.max(8, Math.min(20, +rule.dc || improvDC(a)));
    const s = savingThrow(t, save, dc); ok = !s.ok;
    log(st, t.name + " เซฟ " + save + ": " + s.total + " vs DC " + dc + (s.ok ? " · ต้านได้" : " · ไม่รอด"), { kind: "check", who: t.name, label: save + " save", roll: s.roll ? s.roll.v : s.total, total: s.total, dc, ok: s.ok });
  } else {
    const skill = String(rule.skill || "Athletics"); const dc = Math.max(5, Math.min(25, +rule.dc || 12));
    const r = d20(rule.adv > 0 ? 1 : rule.adv < 0 ? -1 : 0); const bonus = unitCheckBonus(a, skill); const total = r.v + bonus;
    ok = r.v !== 1 && total >= dc;
    log(st, a.name + " ทอย " + skill + (rule.adv > 0 ? " (ได้เปรียบ)" : rule.adv < 0 ? " (เสียเปรียบ)" : "") + ": 🎲 " + r.v + (bonus >= 0 ? " +" : " ") + bonus + " = " + total + " vs DC " + dc + (ok ? " · สำเร็จ" : " · ไม่สำเร็จ"), { kind: "check", who: a.name, label: skill, roll: r.v, total, dc, ok });
  }
  const line = String((ok ? rule.sayOk : rule.sayFail) || rule.say || "").slice(0, 220);
  if (line) log(st, "🎭 " + line, { kind: "say" });
  applyImprovFx(st, a, t, (ok ? rule.success : rule.fail) || {});
}
function applyImprovFx(st, a, t, fx) {
  if (fx.dmg && t && alive(t)) {
    const m = String(fx.dmg).match(/^(\d+)d(\d+)/);
    if (m) { const r = roll(Math.min(improvCap(a), +m[1]) + "d" + Math.min(8, +m[2])); const dt = /^[A-Z][a-z]+$/.test(fx.dtype || "") ? fx.dtype : "Bludgeoning"; log(st, t.name + " โดน " + r.text + " " + dt, { kind: "improv" }); damage(st, t, r.total, dt, a); }
  }
  if (fx.cond && IMPROV_CONDS[fx.cond] && t && alive(t) && !(t.immune || "").includes(fx.cond)) {
    const c = IMPROV_CONDS[fx.cond];
    addEffect(st, t, { name: "ท่าพิเศษ: " + fx.cond, cond: c.cond, src: a.id, ...(c.endSave ? { endSave: { ab: c.endSave, dc: improvDC(a) } } : { until: "startOfSourceTurn" }) });
    log(st, t.name + " ติดสภาพ " + fx.cond, { kind: "improv" });
  }
  if (fx.adv) { addEffect(st, a, { name: "ได้เปรียบจากท่าพิเศษ", helped: true, src: a.id }); log(st, a.name + " ตีครั้งถัดไปได้เปรียบ", { kind: "improv" }); }
  if (fx.cover) { addEffect(st, a, { name: "กำบัง", ac: 2, until: "startOfTurn", src: a.id }); log(st, a.name + " ได้ที่กำบัง AC +2 จนถึงตาหน้า", { kind: "improv" }); }
  if (fx.surrender) applyMorale(st, "surrender", "");
}
// morale: once per fight, when half the enemies are down or their leader falls, Claude decides if the rest fight on
function moraleDue(st) {
  if (st.moraleDone) return false;
  const foes = Object.values(st.units).filter((u) => u.side === "foe"); const up = foes.filter(alive);
  if (foes.length < 2 || !up.length || up.some((u) => u.tier !== "normal")) return false;
  return up.length <= Math.floor(foes.length / 2) || foes.some((u) => u.tier !== "normal" && !alive(u));
}
function applyMorale(st, decision, line) {
  st.moraleDone = true;
  if (decision !== "flee" && decision !== "surrender") { if (line) log(st, "🗣 " + line, { kind: "say" }); return; }
  const up = Object.values(st.units).filter((u) => u.side === "foe" && alive(u) && u.tier === "normal");
  if (line) log(st, "🗣 " + line, { kind: "say" });
  for (const u of up) { u.hp = 0; u.left = decision; endConc(st, u); log(st, u.name + (decision === "flee" ? " หนีไปแล้ว!" : " ทิ้งอาวุธยอมแพ้"), { kind: "morale" }); }
  if (decision === "surrender") st.captives = [...(st.captives || []), ...up.map((u) => u.name)];
  checkOver(st);
}
async function runMorale() {
  const st0 = combatState(); if (!st0 || !moraleDue(st0)) return;
  const up = Object.values(st0.units).filter((u) => u.side === "foe" && alive(u));
  const pcs = Object.values(st0.units).filter((u) => u.side === "pc" && alive(u));
  let ans = null;
  const sample = await useSample();
  if (sample) { try { ans = await sample.json("คุณคือ DM ของเกม D&D ศัตรูฝ่ายนี้เสียพวกไปมากแล้ว ตัดสินว่าที่เหลือจะสู้ต่อ หนี หรือยอมแพ้ ตามนิสัยของมัน (สัตว์ป่ามักหนี ก็อบลินกับโจรอาจยอมแพ้ อันเดดและสิ่งที่ถูกบังคับสู้จนตาย)\nศัตรูที่เหลือ: " + up.map((u) => u.name + " HP " + u.hp + "/" + u.maxHp).join(", ") + "\nฝั่งผู้เล่น: " + pcs.map((u) => u.name + " HP " + u.hp + "/" + u.maxHp).join(", ") + "\nตอบ JSON เท่านั้น: {\"decision\":\"fight|flee|surrender\",\"line\":\"คำพูดหรือท่าทางของศัตรู ไม่เกิน 15 คำ\"}", { modelTier: "quick" }); } catch (e) { ans = null; } }
  if (!ans) { const lead = up[0]; const s = savingThrow(lead, "WIS", 10); ans = { decision: s.ok || /Skeleton|Zombie|Undead/i.test(lead.name) ? "fight" : "flee", line: "" }; }
  const st = combatState(); if (!st || st.moraleDone) return;
  applyMorale(st, String(ans.decision || "fight"), String(ans.line || "").slice(0, 120));
  await commitCombat(st);
}
// flavor: one short vivid line on a critical hit, a boss falling, or a hero going down (sent to chat, so it never races the board)
async function maybeFlavor(st) {
  if (P.flavorKey !== P.cid + st.mapId + st.encounter) { P.flavorKey = P.cid + st.mapId + st.encounter; P.flavorSeq = st.seq; return; }
  const fresh = st.log.filter((l) => l.n > (P.flavorSeq || 0)); P.flavorSeq = st.seq;
  const hit = fresh.filter((l) => (l.kind === "attack" && l.crit) || (l.kind === "kill" && /\((Sub )?Boss\)/.test(l.text)) || l.kind === "down").pop();
  if (!hit || Date.now() - (P.flavorAt || 0) < 12000) return;
  const sample = await useSample(); if (!sample) return;
  P.flavorAt = Date.now();
  try { const ans = await sample.json("คุณคือ DM ของเกม D&D เล่าจังหวะนี้ให้ตื่นเต้นเป็นภาษาไทย 1 ประโยค ไม่เกิน 20 คำ ห้ามเปลี่ยนผลที่เกิดขึ้น\nเหตุการณ์: " + hit.text + "\nตอบ JSON: {\"say\":\"...\"}", { modelTier: "quick" }); if (ans && ans.say) await say("dm", String(ans.say).slice(0, 160), { flavor: true }); } catch (e) {}
}
// recap: when the host opens a room after a break, Claude sums up "last time…"
async function maybeRecap(force) {
  if (!isHost() || P.recapBusy || !P.chat.length) return;
  if (!force) { if (P.recapChecked === P.cid) return; P.recapChecked = P.cid; const last = P.chat[P.chat.length - 1].ts; if (P.chat.length < 8 || Date.now() - last < 3 * 3600e3) return; }
  const sample = await useSample(); if (!sample) { if (force) toast("ต้องเปิดผ่านลิงก์ claude.ai DM ถึงจะสรุปได้"); return; }
  P.recapBusy = true;
  try {
    const hist = P.chat.slice(-40).map((m) => (m.kind === "dm" ? "DM: " : m.kind === "system" ? "[ระบบ] " : (m.who || "ผู้เล่น") + ": ") + m.text).join("\n");
    const ans = await sample.json("คุณคือ DM ของเกม D&D สรุปเรื่องที่ผ่านมาให้ผู้เล่นที่กลับมาเล่นต่อ ภาษาไทย 3-5 ประโยค เล่าเหมือนตอนต้นของซีรีส์ (ครั้งที่แล้ว…) บอกว่าตอนนี้ทีมอยู่ที่ไหนและเป้าหมายต่อไปคืออะไร\n" + dmContext() + "\n=== บันทึก ===\n" + hist + "\nตอบ JSON: {\"say\":\"...\"}", { modelTier: "default" });
    if (ans && ans.say) { await say("dm", "📖 ครั้งที่แล้ว… " + String(ans.say).slice(0, 900), { recap: true }); await writeMeta({ recapAt: Date.now() }); }
  } catch (e) { if (force) toast("สรุปเรื่องไม่สำเร็จ ลองใหม่อีกครั้ง"); } finally { P.recapBusy = false; }
}

// keeps the DM prompt short: older events live in one rolling summary instead of the full chat
async function updateStory(sample) {
  const hist = P.chat.slice(-30).map((m) => (m.kind === "dm" ? "DM: " : m.kind === "system" ? "[ระบบ] " : (m.who || "ผู้เล่น") + ": ") + m.text).join("\n");
  const ans = await sample.json("สรุปเรื่องราวของแคมเปญ D&D นี้ให้ DM จำไว้ใช้ต่อ ภาษาไทย ไม่เกิน 8 บรรทัด: เหตุการณ์สำคัญ NPC ที่เจอและท่าทีต่อทีม ของสำคัญ ภารกิจที่ค้าง\nสรุปเดิม: " + ((P.meta && P.meta.story) || "-") + "\nบันทึกล่าสุด:\n" + hist + "\nตอบ JSON: {\"story\":\"...\"}", { modelTier: "quick" });
  if (ans && ans.story) await writeMeta({ story: String(ans.story).slice(0, 1500) });
}
function askRecap() {
  if (isHost()) return maybeRecap(true);
  const me = myMember(); say("system", "📖 " + (me ? me.card.name : "ผู้เล่น") + " ขอสรุปเรื่องย่อ", { recapReq: true }).catch(() => {});
}

// ---------- DM (Claude) ----------
function requestDM(extra) {
  if (isHost()) { P.dmQueue = (P.dmQueue || []).concat([{ ...extra, place: "place" in extra ? extra.place : (P.scene && P.scene.mode === "town" && P.townPlace) || null }]); maybeDM(); }
  else if (P.cid) say("system", "📜 " + extra.event, { dmEvent: true, ...("place" in extra ? { place: extra.place } : {}) }).catch(() => {});
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
    events.push(...pendAll.filter((m) => m.dmEvent).map((m) => ({ event: m.text.replace(/^📜 /, ""), place: m.place || null })));
    const withPlace = [...pending, ...events].reverse().find((m) => m.place !== undefined);
    P.dmPlace = P.scene && P.scene.mode === "town" && withPlace ? withPlace.place || null : null;
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
    const inside = Object.values(P.party).filter((p) => p.townPlace).map((p) => { const sp = (typeof TOWN_SPOTS !== "undefined" ? TOWN_SPOTS : []).find((x) => x.id === p.townPlace); return p.card.name + " อยู่ใน " + ((CAMP.town.places.find((x) => x.id === p.townPlace) || {}).name || p.townPlace) + (sp ? " คุยกับ " + sp.who : ""); });
    if (inside.length) lines.push("ในอาคาร: " + inside.join("; ") + " · ตอบเป็นบทสนทนา ให้ NPC คนนั้นพูดเองในเครื่องหมาย “…” ตามนิสัยของเขา คำบรรยายสั้น ๆ");
    lines.push("ตอนนี้อยู่: " + CAMP.town.intro + "\nสถานที่ในหมู่บ้าน (id=ชื่อ): " + CAMP.town.places.map((p) => p.id + "=" + p.name + " (" + p.desc + ")").join("; ") + "\nNPC: " + CAMP.town.npcs + "\nข่าวลือ: " + CAMP.town.rumors.join(" / "));
  } else if (def) {
    const enc = Object.entries(def.encounters || {}).map(([L, e]) => L + "=" + e.th + (P.meta.cleared && P.meta.cleared[clearedKey(loc, L)] ? " (ชนะแล้ว)" : "")).join(", ");
    lines.push("ตอนนี้อยู่: " + def.name + " (" + def.th + ", เลเวลแนะนำ " + def.level + ")\nบรรยากาศ: " + def.intro + "\nความลับ DM: " + (def.dm || "") + "\nการต่อสู้ในแผนที่: " + enc);
  }
  lines.push("เวลาในเกม: " + clockText());
  if (P.meta.story) lines.push("เรื่องที่ผ่านมา (สรุป): " + P.meta.story);
  lines.push("ดันเจี้ยนที่จบแล้ว: " + (Object.keys(P.meta.done || {}).join(", ") || "ยังไม่มี"));
  lines.push("สถานที่บนแผนที่โลก: " + CAMP.world.locations.map((l) => l.id + "=" + l.name + " (Lv " + l.level + ")").join(", "));
  lines.push("ทีม:\n" + partySummary());
  if (homebrewOn() && Object.values(P.party).some(canBrew)) lines.push("Homebrew ที่อนุญาต: ระบบปรุงยา Controlled Chaos V2.1 ของ " + Object.values(P.party).filter(canBrew).map((p) => p.card.name).join(", ") + " ปรุงได้ 2 ขวด/พักยาว สูตร 001–006 ดื่มแล้วทอย d6 ได้ผล A หรือ B (มีทั้งข้อดีและข้อเสีย) นาน 1 นาที หน้าเว็บคิดผลให้ คุณแค่เล่าฉากให้สนุกตามบุคลิกนักปรุงยาที่ไม่ยอมลองยากับตัวเอง");
  const qc = questContext(); if (qc) lines.push(qc);
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
- คำพูดทุกประโยคต้องขึ้นต้นด้วยชื่อผู้พูดตามด้วยโคลอน แล้วตามด้วยเครื่องหมาย “…” เช่น Old Pell: “นั่งก่อนสิ” หรือ Wick: “ขอบคุณนะ” (หน้าเว็บใช้ชื่อนี้ขึ้นรูปและกล่องคำพูดของคนที่พูดจริง ห้ามสลับชื่อ) ถ้าตัวละครผู้เล่นพูดก็ใส่ชื่อเขา ห้ามใช้รหัส HTML เช่น &#39;
- ในหมู่บ้าน ถ้าเรื่องพาทีมย้ายไปอาคารอื่น ใช้ action place ไปยัง id อาคารนั้น ถ้าออกไปนอกอาคาร (จัตุรัส ริมลำธาร ป่าใกล้หมู่บ้าน) ใช้ place ที่ to เป็น null
- ผู้เล่นจ่ายเงิน (ค่าห้อง ค่าบริการ) ใช้ give ที่ gp ติดลบ เช่น "gp":-1
ตอบเป็น JSON เท่านั้น ตามรูปแบบ:
{"say":"คำบรรยาย","checks":[{"who":"ชื่อตัวละคร","skill":"Perception","dc":12,"adv":0}],"action":null,"options":["ทางเลือกสั้น 1","ทางเลือกสั้น 2"]}
การเข้าสังคม: เมื่อผู้เล่นต่อรอง หลอก ขู่ หรือเกลี้ยกล่อม NPC ให้ขอ check (Persuasion/Deception/Intimidation/Insight) ก่อน แล้วในรอบเล่าผลค่อยให้ผลจริง เช่น discount ที่ตลาด give ของ หรือ flag ความสัมพันธ์
ได้เปรียบ/เสียเปรียบ: ถ้าสถานการณ์เป็นใจ (มีเครื่องมือ ซ่อนในเงามืด ช่วยกันทำ) ใส่ "adv":1 ใน check ถ้ายากผิดปกติใส่ "adv":-1
ใส่หลาย action ได้ด้วย "actions":[...] (ไม่เกิน 3)
action เป็นได้: null | {"type":"discount","npc":"Bram","pct":15} (ส่วนลดตลาด 5-30% จนกว่าจะออกจากหมู่บ้าน) | {"type":"startCombat","enc":"a"} | {"type":"travel","to":"<location id>"} | {"type":"give","who":"<ชื่อ หรือ all>","gp":10,"items":[["potion-healing",1]],"xp":0} | {"type":"rest","kind":"short"|"long"} | {"type":"place","to":"<id อาคารในหมู่บ้าน หรือ null>"} | {"type":"flag","key":"ชื่อ","value":true} | {"type":"quest","op":"add","title":"ชื่อเควสสั้น","goal":"ต้องทำอะไร","giver":"ชื่อ NPC","loc":"<location id หรือ null>","gp":20} (เมื่อ NPC ขอความช่วยเหลือเรื่องเล็ก ๆ ที่ผู้เล่นตกลงรับ สูงสุดค้างไว้ 3 เควส) | {"type":"quest","op":"done","id":"<id เควสจาก DM>"} (เมื่อทีมทำเควสจาก DM สำเร็จในเรื่อง ระบบให้รางวัลเอง)
เควสหลักเป็นแค่คำแนะนำ ผู้เล่นไปที่ไหนก่อนก็ได้ ให้เล่าเรื่องตามลำดับที่ทีมเล่นจริง
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
  const acts = [].concat((ans && ans.action) || [], (ans && ans.actions) || []).slice(0, 3);
  for (const a of acts) if (a && a.type === "place") await dmAction(a); // move rooms first so the line lands where the party now is
  if (text) { await say("dm", text, { options: Array.isArray(ans.options) ? ans.options.slice(0, 4).map((o) => unEntity(o)) : [], place: P.dmPlace || null }); P.dmLines = (P.dmLines || 0) + 1; if (P.dmLines % 10 === 0) updateStory(sample).catch(() => {}); }
  for (const a of acts) if (a && a.type !== "place") await dmAction(a);
  if (!depth && ans && Array.isArray(ans.checks) && ans.checks.length) {
    const rolls = [];
    const results = ans.checks.slice(0, 4).map((c) => { const t = rollCheck(c); if (t) rolls.push(rollCheck.last); return t; }).filter(Boolean);
    if (results.length) {
      await say("system", "🎲 " + results.join("\n🎲 "), { rolls, place: P.dmPlace || null });
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
  const adv = +c.adv > 0 ? 1 : +c.adv < 0 ? -1 : 0;
  const r = adv ? (adv > 0 ? Math.max(d(20), d(20)) : Math.min(d(20), d(20))) : d(20);
  let potion = 0;
  if (p.live.checkBonus && sk) { potion = d(4); bonus += potion; writeParty(p.cardId, { live: { ...p.live, checkBonus: false } }).catch(() => {}); }
  const total = r + bonus; const dc = +c.dc || 10;
  rollCheck.last = { who: p.card.name, label: sk ? sk.name : ab ? ab + " save" : String(c.skill), roll: r, bonus, total, dc, ok: total >= dc };
  return p.card.name + " " + (sk ? sk.name : ab ? ab + " save" : c.skill) + (adv > 0 ? " (ได้เปรียบ)" : adv < 0 ? " (เสียเปรียบ)" : "") + ": " + r + (bonus >= 0 ? "+" : "") + bonus + " = " + total + " vs DC " + dc + (potion ? " (รวมยาปรุง +" + potion + ")" : "") + (total >= dc ? " ✅ สำเร็จ" : " ❌ ไม่สำเร็จ");
}
async function dmAction(a) {
  try {
    if (a.type === "startCombat" && P.scene.mode === "explore") { const def = mapDef(P.scene.loc); if (def && def.encounters && def.encounters[a.enc] && !(P.meta.cleared || {})[clearedKey(def.id, a.enc)]) await startCombat(def, a.enc); }
    else if (a.type === "travel" && CAMP.world.locations.some((l) => l.id === a.to)) await travelTo(a.to, true);
    else if (a.type === "place" && P.scene.mode === "town") { // the story moved the party to another building (or outside): everyone follows
      const to = a.to && CAMP.town.places.some((p) => p.id === a.to) ? a.to : null;
      if (!(to === "night" && !isNight())) { P.dmPlace = to; await writeScene({ gather: { place: to, ts: Date.now() } }); }
    }
    else if (a.type === "give") {
      const who = a.who === "all" ? Object.values(P.party) : [findMember(a.who)].filter(Boolean);
      for (const p of who) {
        const inv = clone(p.card.inventory || []);
        for (const [id, q] of (a.items || []).slice(0, 4)) if (IX.items[id]) { const e = inv.find((x) => x.id === id); if (e) e.qty += Math.min(3, +q || 1); else inv.push({ id, qty: Math.min(3, +q || 1), equipped: false }); }
        await writeParty(p.cardId, { card: { ...p.card, gp: Math.max(0, (p.card.gp || 0) + Math.min(500, Math.max(-500, Math.round(+a.gp || 0)))), xp: (p.card.xp || 0) + Math.min(1000, Math.max(0, +a.xp || 0)), inventory: inv } });
      }
      const gpN = Math.round(+a.gp || 0); const got = [gpN > 0 ? gpN + " GP" : "", ...(a.items || []).map(([id, q]) => q + "× " + iname(id)), +a.xp > 0 ? a.xp + " EXP" : ""].filter(Boolean);
      if (who.length && gpN < 0) await say("system", "💰 " + who.map((p) => p.card.name).join(", ") + " จ่าย " + (-gpN) + " GP", { place: P.dmPlace || null });
      if (who.length && got.length) await say("system", "🎁 " + who.map((p) => p.card.name).join(", ") + " ได้รับ " + got.join(", "), { place: P.dmPlace || null });
    } else if (a.type === "rest") await restParty(a.kind === "long" ? "long" : "short", true);
    else if (a.type === "discount" && P.scene.mode === "town") await writeMeta({ discount: { pct: Math.max(5, Math.min(30, Math.round(+a.pct || 10))), npc: String(a.npc || "Bram").slice(0, 30) } });
    else if (a.type === "quest") await dmQuest(a);
    else if (a.type === "flag" && a.key) await writeMeta({ flags: { ...(P.meta.flags || {}), [String(a.key).slice(0, 40)]: a.value ?? true } });
  } catch (e) { /* ignore a malformed action */ }
}

// ---------- traps: scattered fresh each time a party enters a dungeon; found by Passive Perception ----------
const TRAP_KINDS = [
  { k: "spike", th: "หลุมหนาม", ab: "DEX", dmg: "1d10", dtype: "Piercing" },
  { k: "dart", th: "ลูกดอกอาบยาพิษ", ab: "DEX", dmg: "1d6", dtype: "Poison", extra: "2d4" },
  { k: "rune", th: "อักขระไฟ", ab: "DEX", dmg: "2d6", dtype: "Fire" },
  { k: "net", th: "ตาข่ายร่วงจากเพดาน", ab: "DEX", dmg: "", dtype: "", stop: true },
  { k: "blade", th: "ใบมีดเหวี่ยงจากผนัง", ab: "DEX", dmg: "1d8", dtype: "Slashing", extra: "1d8" },
];
const mapLevel = (def) => parseInt(String((def && def.level) || "1"), 10) || 1;
function genTraps(def) {
  const lv = mapLevel(def); const grid = gridOf(def); const s = cellsOf(def, "S")[0] || { x: 1, y: 1 };
  const cells = [];
  def.rows.forEach((r, y) => [...r].forEach((ch, x) => { if ((ch === "." || ch === ",") && !grid.walls[x + "," + y] && Math.abs(x - s.x) + Math.abs(y - s.y) > 4) cells.push({ x, y }); }));
  const n = Math.min(cells.length, 2 + Math.floor(Math.random() * 2) + (lv >= 3 ? 1 : 0));
  const out = [];
  for (let i = 0; i < n && cells.length; i++) {
    const c = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
    if (out.some((t) => Math.abs(t.x - c.x) + Math.abs(t.y - c.y) < 4)) { i--; if (cells.length < 3) break; continue; }
    const K = TRAP_KINDS[Math.floor(Math.random() * TRAP_KINDS.length)];
    out.push({ x: c.x, y: c.y, k: K.k, dc: 10 + lv + Math.floor(Math.random() * 3), found: false, sprung: false });
  }
  return out;
}
const trapsHere = () => (P.scene && P.scene.trapLoc === P.scene.loc ? P.scene.traps || [] : []);
const trapKind = (t) => TRAP_KINDS.find((k) => k.k === t.k) || TRAP_KINDS[0];
function passiveOf(p) { const sh = safeSheet(p.card); return sh ? sh.passivePerception : 10; }
// someone with a sharp eye spots traps within 2 squares they can see
function spotTraps(traps, at, watchers, grid) {
  const best = watchers.map((p) => [p, passiveOf(p)]).sort((a, b) => b[1] - a[1])[0]; if (!best) return [];
  const seen = [];
  for (const t of traps) if (!t.found && !t.sprung && dist(at, t) <= 10 && hasLOS({ map: grid }, at, t) && best[1] >= t.dc) { t.found = true; seen.push([t, best[0]]); }
  return seen;
}
// stepping on a trap: DEX save (from the sheet), damage straight to HP, never below 1 outside a fight
async function springTrap(t, p) {
  const K = trapKind(t); const sh = safeSheet(p.card);
  const so = sh && sh.saves.find((x) => x.ab === K.ab); const sv = so ? so.bonus : 0;
  const r = d20(0); const total = r.v + sv; const ok = r.v !== 1 && total >= t.dc;
  let dmg = 0; if (K.dmg) { const d = roll(K.dmg + (K.extra && mapLevel(mapDef(P.scene.loc)) >= 3 ? "+" + K.extra : "")); dmg = ok ? Math.floor(d.total / 2) : d.total; }
  const hp0 = p.live.hp ?? (sh ? sh.hpMax : 1); const hp = Math.max(1, hp0 - dmg);
  t.sprung = true; t.found = true;
  await writeParty(p.cardId, { live: { ...p.live, hp } });
  await say("system", "🪤 " + p.card.name + " เหยียบ" + K.th + "! เซฟ " + K.ab + " " + total + " vs DC " + t.dc + (ok ? " · หลบได้บางส่วน" : " · ไม่ทัน") + (dmg ? " · โดน " + dmg + " " + K.dtype + " (HP " + hp + ")" : "") + (K.stop && !ok ? " · ติดตาข่าย เดินต่อไม่ได้ในตานี้" : "") + (hp0 - dmg < 1 ? " · ล้มลงแต่รอดหวุดหวิด" : ""),
    { rolls: [{ who: p.card.name, label: K.ab + " save · " + K.th, roll: r.v, bonus: sv, total, dc: t.dc, ok }] });
  return { stop: !!K.stop && !ok };
}
// disarm a trap you can see from an adjacent square: Sleight of Hand (thieves' tools) vs the trap DC
async function disarmTrap(t, p) {
  const sh = safeSheet(p.card); const sk = sh && sh.skills.find((s) => s.name === "Sleight of Hand"); const bonus = sk ? sk.bonus : 0;
  const r = d20(0); const total = r.v + bonus; const ok = total >= t.dc;
  await say("system", "🔧 " + p.card.name + " ลองปลด" + trapKind(t).th + " · Sleight of Hand " + total + " vs DC " + t.dc + (ok ? " · ปลดสำเร็จ" : " · พลาด!"), { rolls: [{ who: p.card.name, label: "ปลดกับดัก", roll: r.v, bonus, total, dc: t.dc, ok }] });
  if (ok) { t.sprung = true; return null; }
  return springTrap(t, p);
}

// ---------- in-game clock: hours pass with travel and rest; night is darker and riskier on the road ----------
const gameHour = () => (P.meta && P.meta.hour != null ? P.meta.hour : 8);
const isNight = () => { const h = gameHour(); return h >= 19 || h < 6; };
function clockText() { const h = gameHour(); return (isNight() ? "🌙 กลางคืน " : "☀️ กลางวัน ") + String(Math.floor(h)).padStart(2, "0") + ":00 · วันที่ " + ((P.meta && P.meta.day) || 1); }
async function passTime(hours) {
  let h = gameHour() + hours, day = (P.meta && P.meta.day) || 1;
  while (h >= 24) { h -= 24; day++; }
  await writeMeta({ hour: h, day });
}

// small table of road happenings: the code picks, the DM tells it (and may ask for a check)
// random things on the road: the journey screen shows the picture, the DM tells the scene
const TRAVEL_EVENTS = [
  { id: "merchant", icon: "🛒", title: "เกวียนติดหล่ม", sub: "พ่อค้าเร่ล้อติดโคลน ร้องขอให้ช่วยดัน", dm: "พ่อค้าเร่ถูกล้อเกวียนติดหล่ม ขอความช่วยเหลือ (ช่วยแล้วอาจได้ของเล็กน้อย เช่น potion-healing 1 ขวด)" },
  { id: "wolves", icon: "🐺", title: "รอยหมาป่า", sub: "รอยเท้าสด ๆ กับซากกวางกลางทาง", dm: "เจอรอยเท้าหมาป่าสด ๆ และซากกวาง ให้ทีมเช็ก Survival หรือ Perception" },
  { id: "rain", icon: "🌧", title: "พายุฝน", sub: "ฝนกระหน่ำจนทางลื่น จะหลบหรือฝ่าไป?", dm: "ฝนตกหนักจนทางลื่น ให้ทีมเลือกพักหลบฝนหรือฝ่าไป" },
  { id: "watcher", icon: "👁", title: "คนคลุมผ้าเทา", sub: "ใครบางคนเฝ้ามองอยู่บนเนิน แล้วหายไป", dm: "คนแปลกหน้าคลุมผ้าเทาเฝ้ามองทีมจากเนินแล้วหายไป (สายของลัทธิ Ashen Choir)" },
  { id: "shrine", icon: "🕯", title: "ศาลเจ้าริมทาง", sub: "ศาลเล็กของเทพีรุ่งอรุณ เทียนยังจุดอยู่", dm: "เจอศาลเจ้าเล็กริมทางของเทพีรุ่งอรุณ ใครสวดภาวนาได้กำลังใจ" },
  { id: "signpost", icon: "🪧", title: "ป้ายถูกหมุน", sub: "ป้ายบอกทางชี้ผิดทิศ ใครทำ?", dm: "ป้ายบอกทางถูกหมุนสลับ ให้เช็ก Survival ถ้าพลาดเสียเวลาเล็กน้อย" },
  { id: "bard", icon: "🎻", title: "นักดนตรีพเนจร", sub: "นักร้องเร่ขอเดินทางด้วย แลกกับเพลงและข่าวลือ", dm: "นักดนตรีพเนจรขอเดินทางร่วม ร้องเพลงที่แฝงข่าวลือเกี่ยวกับที่หมาย (ให้เบาะแสเล็ก ๆ)" },
  { id: "camp", icon: "🔥", title: "กองไฟทิ้งร้าง", sub: "เถ้ายังอุ่น มีรอยเท้าเล็ก ๆ วนรอบ", dm: "เจอกองไฟทิ้งร้าง เถ้ายังอุ่น มีรอยเท้าก็อบลิน ให้เช็ก Investigation ถ้าผ่านรู้ว่ามีกี่ตัวและไปทางไหน" },
];
const JOURNEY_MS = 5000, JOURNEY_EV_MS = 8000;

// ---------- shared party actions ----------
async function travelTo(loc, quiet, opts = {}) {
  const isTown = loc === CAMP.town.id;
  if (opts.caravan) { // everyone pays the caravan master; whoever is short rides along on a friend's coin
    let short = 0;
    for (const p of Object.values(P.party)) { const g = p.card.gp || 0; const pay = Math.min(g, CARAVAN_GP); short += CARAVAN_GP - pay; await writeParty(p.cardId, { card: { ...P.party[p.cardId].card, gp: g - pay } }); }
    await say("system", "🐴 จ่ายค่าคาราวานคนละ " + CARAVAN_GP + " GP" + (short ? " (Garrick ใจดี ลดให้ " + short + " GP ที่ขาด)" : ""));
  }
  const def = mapDef(loc);
  const L0 = CAMP.world.locations.find((l) => l.id === loc) || (CAMP.maps[loc] ? CAMP.maps[loc] : null);
  await say("system", "🧭 ทีมเดินทางไป " + (L0 ? L0.name + " · " + L0.th : loc) + (travelWarning(loc) ? "\n" + travelWarning(loc) : ""));
  const ev = !quiet && !isTown && Math.random() < (opts.caravan ? 1 / 6 : isNight() ? 1 / 2 : 1 / 3) ? TRAVEL_EVENTS[Math.floor(Math.random() * TRAVEL_EVENTS.length)] : null;
  P.arriving = true;
  await writeScene({ mode: isTown ? "town" : "explore", loc, combat: null, lastCombat: null, vote: null,
    journey: quiet ? null : { ts: Date.now(), to: loc, ev: ev ? ev.id : null, caravan: !!opts.caravan, night: isNight() }, ex: { group: !!(P.scene.ex || {}).group, turn: null, moved: 0, acted: false },
    ...(!isTown && def && def.rows ? { traps: genTraps(def), trapLoc: loc } : {}) });
  if (!quiet) await passTime(loc === "summit" ? 1 : opts.caravan ? 2 : 4);
  if (!isTown && P.meta.discount) await writeMeta({ discount: null });
  if (isTown) for (const p of Object.values(P.party)) if (p.townPlace || p.ready) await writeParty(p.cardId, { townPlace: null, ready: 0 });
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
  if (!quiet) requestDM({ event: "[" + clockText() + "] " + (ev ? "ระหว่างทางเกิดเหตุการณ์ (ระบบสุ่มได้): " + ev.dm + " · เล่าสั้น ๆ แล้ว " : "") + (opts.caravan ? "ทีมนั่งคาราวานของ Garrick มาถึง " : "ทีมเดินทางมาถึง ") + (L ? L.name : loc) + (def && def.intro ? " · " + def.intro : isTown ? " · " + CAMP.town.intro : "") });
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
  if (kind === "long") { const h = gameHour(); await writeMeta({ hour: 8, day: ((P.meta && P.meta.day) || 1) + (h >= 8 ? 1 : 0) }); } else await passTime(1);
  if (!quiet) requestDM({ event: (kind === "long" ? "ทีมพักค้างคืน ตื่นมาตอนเช้า" : "ทีมพักสั้น 1 ชั่วโมง") + " [" + clockText() + "]" });
}

// ---------- exploration turns: solo (each walks 30 ft) or group (the leader walks, everyone follows) ----------
const EX_FT = 30;
const isOnline = (p) => NET.local || p.uid === myUid() || Date.now() - (p.seen || 0) < 150000;
function exMembers() {
  return Object.values(P.party).filter((p) => p.pos && !(p.live && p.live.dead) && isOnline(p))
    .sort((a, b) => (a.joined || 0) - (b.joined || 0) || String(a.cardId).localeCompare(String(b.cardId)));
}
function exState() {
  const ex = (P.scene && P.scene.ex) || {}; const list = exMembers();
  const turn = list.some((p) => p.cardId === ex.turn) ? ex.turn : (list[0] || {}).cardId || null;
  const same = turn === ex.turn;
  return { group: !!ex.group, turn, moved: same ? ex.moved || 0 : 0, acted: same ? !!ex.acted : false, list };
}
async function exPass(fromCard) {
  const s = exState(); if (fromCard && s.turn !== fromCard) return;
  const i = s.list.findIndex((p) => p.cardId === s.turn); const next = s.list[(i + 1) % Math.max(1, s.list.length)];
  await writeScene({ ex: { group: s.group, turn: next ? next.cardId : null, moved: 0, acted: false } });
}
async function exSetGroup(on) {
  const s = exState(); if (s.group === on) return;
  await writeScene({ ex: { group: on, turn: s.turn, moved: 0, acted: false } });
  const me = P.party[P.myCardId];
  await say("system", (me ? me.card.name + " เปลี่ยนเป็น" : "เปลี่ยนเป็น") + (on ? "โหมดจับกลุ่ม: ทั้งทีมเดินไปด้วยกัน ผลัดกันนำทาง" : "โหมดแยกเดิน: ผลัดกันเดินคนละ 6 ช่อง"));
}

// ---------- travel needs everyone ready ----------
function voteStatus() {
  const v = P.scene && P.scene.vote; if (!v) return null;
  const list = Object.values(P.party).filter(isOnline);
  const ok = list.filter((p) => p.ready === v.id);
  return { v, list, ok, all: list.length > 0 && ok.length === list.length };
}
async function proposeTravel(loc, opts = {}) {
  const others = Object.values(P.party).filter((p) => isOnline(p) && !(NET.local || p.uid === myUid()));
  if (NET.local || !others.length) return travelTo(loc, false, opts);
  const id = Date.now(); const me = P.party[P.myCardId];
  await writeScene({ vote: { loc, id, by: me ? me.card.name : "", caravan: !!opts.caravan } });
  for (const p of myParty()) await writeParty(p.cardId, { ready: id });
  const L = locInfo(loc);
  await say("system", "🧭 " + (me ? me.card.name : "มีคน") + " ชวน" + (opts.caravan ? "นั่งคาราวาน (" + CARAVAN_GP + " GP/คน) " : "เดินทาง") + "ไป " + L.name + " · กด “พร้อม” เมื่อทุกคนพร้อม");
}
const CARAVAN_GP = 5;
async function setReady(on) { const v = P.scene.vote; if (!v) return; for (const p of myParty()) await writeParty(p.cardId, { ready: on ? v.id : 0 }); }

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
// voice: เปรมวดี (Microsoft Premwadee, Edge/Windows) by default; phones use their own Thai voice
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
function pickVoice() {
  const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  const th = vs.filter((v) => /^th/i.test(v.lang));
  const prem = th.find((v) => /Premwadee|เปรมวดี/i.test(v.name));
  if (!IS_MOBILE && prem) return prem;
  return th.find((v) => !/Premwadee|Niwat/i.test(v.name)) || prem || th[0] || null;
}
try { if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices(); } catch (e) {}
function speak(text) {
  try {
    const synth = window.speechSynthesis; if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#>]/g, ""));
    const v = pickVoice();
    if (v) u.voice = v; u.lang = "th-TH"; u.rate = 1.02;
    synth.speak(u);
  } catch (e) {}
}

// ---------- quests: main chapters (always on, never lock travel) + side jobs from the board + small DM quests ----------
// Everything lives in the room's meta, so the whole party sees the same quest book.
const QD = CAMP.quests || { main: [], side: [], maxSide: 3 };
const qState = () => (P.meta && P.meta.quests) || {};
const qLevelMin = (lv) => parseInt(String(lv || "").match(/\d+/) || [0], 10);
function partyMaxLevel() { return Math.max(1, ...Object.values(P.party).map((p) => p.card.level || 1)); }
function questDefs() { return [...QD.main.map((q) => ({ ...q, kind: "main" })), ...QD.side.map((q) => ({ ...q, kind: "side" })), ...(qState().custom || []).map((q) => ({ ...q, kind: "dm" }))]; }
function questDef(id) { return questDefs().find((q) => q.id === id) || null; }
function killTotal(mons) { const k = qState().kills || {}; return mons.reduce((a, m) => a + (k[m] || 0), 0); }
function questProg(q) {
  const g = q.goal || {}; const t = (qState().taken || {})[q.id] || {};
  let n = 0, of = 1;
  if (g.t === "boss") n = (P.meta.done || {})[g.map] ? 1 : 0;
  else if (g.t === "clear") n = (P.meta.cleared || {})[clearedKey(g.map, g.enc)] ? 1 : 0;
  else if (g.t === "kill") { of = g.n; n = killTotal(g.mon) - (t.base || 0); }
  else if (g.t === "chests") { of = g.n; n = Object.keys(P.meta.opened || {}).length - (t.base || 0); }
  else if (g.t === "dm") n = q.status === "done" ? 1 : 0;
  n = Math.max(0, Math.min(of, n));
  return { n, of, ok: n >= of };
}
// status: turned (rewarded) · ready (go hand it in) · active · offer (side job not yet taken) · gone (can't be done any more)
function questStatus(q) {
  const qs = qState();
  if ((qs.turned || {})[q.id]) return "turned";
  if (q.kind === "side" && !(qs.taken || {})[q.id]) return q.goal.t === "clear" && questProg(q).ok ? "gone" : "offer";
  if (q.kind === "dm" && q.status === "done") return "turned";
  return questProg(q).ok ? "ready" : "active";
}
function questsBy(status) { return questDefs().filter((q) => questStatus(q) === status); }
function nextMainQuest() { return QD.main.map((q) => ({ ...q, kind: "main" })).find((q) => !questProg(q).ok && questStatus(q) !== "turned") || null; }
function questGoalText(q) { const p = questProg(q); return q.goalTh + (p.of > 1 ? " (" + p.n + "/" + p.of + ")" : ""); }
function questsAt(loc) { const nm = nextMainQuest(); return questDefs().filter((q) => q.loc === loc && (q.kind === "main" ? !!nm && nm.id === q.id : questStatus(q) === "active")); }
async function writeQuests(patch) { await writeMeta({ quests: { ...qState(), ...patch } }); }
// taking a quest needs everyone online to agree (like travel); a solo player takes it at once
async function takeQuest(id) {
  const q = questDef(id); if (!q || questStatus(q) !== "offer") return;
  if (sideSlotsFull()) return toast("รับเควสรองได้ทีละ " + (QD.maxSide || 3) + " เควส ส่งเควสเก่าก่อนนะ");
  const others = Object.values(P.party).filter((p) => isOnline(p) && !(NET.local || p.uid === myUid()));
  if (NET.local || !others.length) return acceptQuest(id);
  const ts = Date.now(); const me = myMember();
  await writeScene({ qvote: { id, ts, by: me ? me.card.name : "" } });
  for (const p of myParty()) await writeParty(p.cardId, { qok: ts });
  await say("system", "📜 " + (me ? me.card.name : "มีคน") + " ชวนรับเควส “" + q.title + "” · ทุกคนกด “ยอมรับ” เพื่อรับงาน");
}
function sideSlotsFull() { const qs = qState(); return Object.keys(qs.taken || {}).filter((k) => !(qs.turned || {})[k]).length >= (QD.maxSide || 3); }
function questVoteStatus() {
  const v = P.scene && P.scene.qvote; if (!v) return null;
  const list = Object.values(P.party).filter(isOnline);
  return { v, q: questDef(v.id), list, ok: list.filter((p) => p.qok === v.ts), no: list.filter((p) => p.qok === -v.ts), all: list.length > 0 && list.every((p) => p.qok === v.ts) };
}
async function voteQuest(yes) { const v = P.scene.qvote; if (!v) return; for (const p of myParty()) await writeParty(p.cardId, { qok: yes ? v.ts : -v.ts }); }
async function settleQuestVote() {
  const s = questVoteStatus(); if (!s) return false;
  if (s.no.length) { await writeScene({ qvote: null }); await say("system", "📜 " + s.no.map((p) => p.card.name).join(", ") + " ไม่รับเควส “" + (s.q ? s.q.title : "") + "” · ยกเลิกแล้ว"); return true; }
  if (s.all) { await writeScene({ qvote: null }); await acceptQuest(s.v.id); return true; }
  return false;
}
const giverSpot = (q) => (typeof TOWN_SPOTS !== "undefined" ? TOWN_SPOTS : []).find((s) => s.who === (q && q.giver)) || null;
async function acceptQuest(id) {
  const q = questDef(id); if (!q || questStatus(q) !== "offer") return;
  const taken = qState().taken || {};
  if (sideSlotsFull()) return toast("รับเควสรองได้ทีละ " + (QD.maxSide || 3) + " เควส ส่งเควสเก่าก่อนนะ");
  const base = q.goal.t === "kill" ? killTotal(q.goal.mon) : q.goal.t === "chests" ? Object.keys(P.meta.opened || {}).length : 0;
  await writeQuests({ taken: { ...taken, [id]: { at: Date.now(), base } } });
  const sp = giverSpot(q);
  await say("system", "📜 ทีมรับเควส “" + q.title + "” จาก " + q.giver + " · " + q.goalTh, { place: sp ? sp.id : null });
  if (sp) { // walk the whole party to the quest giver, who explains the job
    await writeScene({ gather: { place: sp.id, ts: Date.now() } });
    requestDM({ event: "ทีมเพิ่งรับเควส “" + q.title + "” (" + q.goalTh + ") และเดินมาหา " + q.giver + " ให้ " + q.giver + " เล่ารายละเอียดงานเป็นคำพูดของตัวเอง สั้น ๆ พร้อมคำใบ้หนึ่งอย่าง", place: sp.id });
  }
}
async function dropQuest(id) {
  const taken = { ...(qState().taken || {}) }; delete taken[id];
  await writeQuests({ taken });
}
async function turnInQuest(id) {
  const q = questDef(id); if (!q || questStatus(q) !== "ready") return;
  if (P.scene.mode !== "town") return toast("กลับไปส่งเควสที่กระดานประกาศในหมู่บ้านนะ");
  await writeQuests({ turned: { ...(qState().turned || {}), [id]: Date.now() } });
  await giveQuestReward(q);
  requestDM({ event: "ทีมส่งเควส “" + q.title + "” ให้ " + q.giver + " และได้รับรางวัล ให้ " + q.giver + " พูดขอบคุณสั้น ๆ ตามนิสัย" + (q.kind === "main" && nextMainQuest() ? " แล้วบอกใบ้งานถัดไป: " + nextMainQuest().story : ""), place: P.townPlace || (giverSpot(q) || {}).id || null });
}
async function giveQuestReward(q) {
  const r = q.reward || {}; const members = Object.values(P.party);
  for (const p of members) {
    const inv = clone(p.card.inventory || []);
    for (const [iid, n] of r.items || []) { const e = inv.find((x) => x.id === iid); if (e) e.qty += n; else inv.push({ id: iid, qty: n, equipped: false }); }
    await writeParty(p.cardId, { card: { ...p.card, gp: (p.card.gp || 0) + (r.gp || 0), xp: (p.card.xp || 0) + (r.xp || 0), inventory: inv } });
  }
  await say("system", "🏅 ส่งเควส “" + q.title + "” ให้ " + q.giver + " สำเร็จ · ทุกคนได้" + (r.gp ? " " + r.gp + " GP" : "") + ((r.items || []).length ? " · " + r.items.map(([iid, n]) => n + "× " + iname(iid)).join(", ") : "") + (r.xp ? " · " + r.xp + " EXP" : ""));
}
// tell the table once when a quest becomes ready to hand in
async function questCheck() {
  if (!P.meta) return;
  const ann = { ...(qState().ann || {}) }; const fresh = questsBy("ready").filter((q) => !ann[q.id]);
  if (!fresh.length) return;
  for (const q of fresh) ann[q.id] = 1;
  await writeQuests({ ann });
  for (const q of fresh) await say("system", "📜 เควสสำเร็จ: “" + q.title + "” · กลับไปส่งที่กระดานประกาศในหมู่บ้านเพื่อรับรางวัล");
}
async function countKills(st) {
  const kills = { ...(qState().kills || {}) };
  for (const u of Object.values(st.units)) if (u.side === "foe" && u.monId && u.hp <= 0) kills[u.monId] = (kills[u.monId] || 0) + 1;
  await writeQuests({ kills });
}
function travelWarning(loc) {
  const L = CAMP.world.locations.find((l) => l.id === loc) || CAMP.maps[loc]; if (!L || !L.level) return "";
  const need = qLevelMin(L.level), have = partyMaxLevel();
  return need > have ? "⚠️ ที่นี่แนะนำเลเวล " + L.level + " แต่ทีมเลเวล " + have + " อาจอันตรายมาก (ไปได้ แต่ระวังนะ)" : "";
}
function questContext() {
  const lines = [];
  const nm = nextMainQuest(); if (nm) lines.push("เควสหลักถัดไป (แนะนำ ไม่บังคับ): " + nm.title + " · " + nm.story);
  const act = questDefs().filter((q) => ["active", "ready"].includes(questStatus(q)) && q.kind !== "main");
  if (act.length) lines.push("เควสที่รับไว้: " + act.map((q) => q.id + "=" + q.title + " (" + q.giver + ": " + questGoalText(q) + (questStatus(q) === "ready" ? ", สำเร็จแล้ว รอส่ง" : "") + ")").join("; "));
  const doneMain = QD.main.filter((q) => questProg({ ...q, kind: "main" }).ok).map((q) => q.title);
  if (doneMain.length) lines.push("บทหลักที่ทีมทำจบแล้ว (ตามลำดับที่เล่นจริง): " + doneMain.join(", "));
  return lines.join("\n");
}
async function dmQuest(a) {
  const custom = clone(qState().custom || []);
  if (a.op === "add" && a.title && custom.filter((q) => q.status !== "done").length < 3) {
    const id = "d" + Date.now().toString(36);
    custom.push({ id, title: String(a.title).slice(0, 40), goalTh: String(a.goal || a.title).slice(0, 80), giver: String(a.giver || "DM").slice(0, 30), loc: CAMP.world.locations.some((l) => l.id === a.loc) ? a.loc : null, goal: { t: "dm" }, status: "open", reward: { gp: Math.max(0, Math.min(100, Math.round(+a.gp || 0))), items: [] } });
    await writeQuests({ custom });
    await say("system", "📜 เควสใหม่จาก " + custom[custom.length - 1].giver + ": “" + custom[custom.length - 1].title + "” · " + custom[custom.length - 1].goalTh);
  } else if (a.op === "done") {
    const q = custom.find((x) => x.id === a.id || x.title === a.title); if (!q || q.status === "done") return;
    q.status = "done"; await writeQuests({ custom });
    await giveQuestReward({ ...q, kind: "dm" });
  }
}


// ---------- village services: inventory helpers, forge, stash, alchemist, night market, inn games ----------
const itemName = (x) => iname(x.id) + (x.plus ? " +" + x.plus : "");
function addItem(inv, id, qty = 1, plus = 0) {
  const e = inv.find((x) => x.id === id && (x.plus || 0) === (plus || 0) && !x.equipped);
  if (e) e.qty += qty; else inv.push({ id, qty, equipped: false, ...(plus ? { plus } : {}) });
  return inv;
}
function takeOne(inv, i) { const x = inv[i]; if (!x) return null; const one = { ...x, qty: 1 }; x.qty--; if (x.qty <= 0) inv.splice(i, 1); return one; }
const upgradeCost = (it) => (!it ? 0 : it.kind === "weapon" ? 100 : it.cat === "shield" ? 100 : it.cat === "heavy" ? 250 : 175);
const sellPrice = (x) => { const it = IX.items[x.id]; return Math.round(((it && it.cost) || 0) * 50) / 100 + (x.plus ? Math.round(upgradeCost(it) / 2) : 0); };
async function forgeUpgrade(cardId, i) {
  const p = P.party[cardId]; const inv = clone(p.card.inventory || []); const x = inv[i]; const it = x && IX.items[x.id];
  if (!it || !["weapon", "armor"].includes(it.kind) || x.plus) return;
  const cost = upgradeCost(it); if ((p.card.gp || 0) < cost) return toast("เงินไม่พอ ต้องใช้ " + cost + " GP");
  const was = !!x.equipped; const one = takeOne(inv, i); one.plus = 1; one.equipped = was;
  inv.splice(Math.min(i, inv.length), 0, one);
  await writeParty(cardId, { card: { ...p.card, gp: p.card.gp - cost, inventory: inv } });
  await say("system", "🔨 Hilda ตี " + it.name + " ของ " + p.card.name + " เป็น +1 (" + cost + " GP)");
  requestDM({ event: "Hilda ช่างตีเหล็กเพิ่งตี " + it.name + " ของ " + p.card.name + " เป็น +1 ให้ Hilda พูดอวดฝีมือสั้น ๆ" });
}
async function sellItem(cardId, i) {
  const p = P.party[cardId]; const inv = clone(p.card.inventory || []); const x = inv[i]; if (!x || x.equipped) return toast("ถอดออกก่อนถึงจะขายได้");
  const price = sellPrice(x); const name = itemName(x); takeOne(inv, i);
  await writeParty(cardId, { card: { ...p.card, gp: Math.round(((p.card.gp || 0) + price) * 100) / 100, inventory: inv } });
  toast("ขาย " + name + " ได้ " + price + " GP");
}
async function buyItem(cardId, id, cost, plus = 0) {
  const p = P.party[cardId]; if ((p.card.gp || 0) + 1e-9 < cost) return toast("เงินไม่พอ");
  const inv = addItem(clone(p.card.inventory || []), id, 1, plus);
  try { const b = invSlots({ ...p.card, inventory: inv }, D); if (b.over) toast("กระเป๋าเต็มแล้ว (" + b.used + "/" + b.cap + ") ของเกินจะทำให้เดินช้าลง 10 ft"); } catch (e) {}
  await writeParty(cardId, { card: { ...p.card, gp: Math.round((p.card.gp - cost) * 100) / 100, inventory: inv } });
  toast("ซื้อ " + iname(id) + (plus ? " +" + plus : "") + " แล้ว");
}
// party stash kept with the innkeeper: shared by everyone in the room
const stashOf = () => (P.meta && P.meta.stash) || [];
async function stashPut(cardId, i) {
  const p = P.party[cardId]; const inv = clone(p.card.inventory || []); if (!inv[i] || inv[i].equipped) return toast("ถอดออกก่อนถึงจะฝากได้");
  const one = takeOne(inv, i); const st = addItem(clone(stashOf()), one.id, 1, one.plus || 0);
  await writeParty(cardId, { card: { ...p.card, inventory: inv } }); await writeMeta({ stash: st });
  toast("ฝาก " + itemName(one) + " ไว้ในหีบแล้ว");
}
async function stashTake(cardId, j) {
  const st = clone(stashOf()); const one = takeOne(st, j); if (!one) return;
  const p = P.party[cardId]; const inv = addItem(clone(p.card.inventory || []), one.id, 1, one.plus || 0);
  await writeMeta({ stash: st }); await writeParty(cardId, { card: { ...p.card, inventory: inv } });
  toast(p.card.name + " หยิบ " + itemName(one) + " จากหีบ");
}
// night market: a few rare things, a different mix every night
function nightStock() {
  const pool = CAMP.nightStock || []; const day = (P.meta && P.meta.day) || 1; const out = [];
  for (let k = 0; out.length < Math.min(4, pool.length) && k < 40; k++) { const it = pool[(day * 7 + k * 5) % pool.length]; if (!out.includes(it)) out.push(it); }
  return out;
}
// what a consumable does: data "use" field, plus the plain healing potion
const useOf = (id) => { const it = IX.items[id]; return (it && it.use) || (id === "potion-healing" ? { heal: "2d4+2" } : null); };
// use a consumable outside combat (bag / services)
async function useItemOutside(cardId, i) {
  const p = P.party[cardId]; const inv = clone(p.card.inventory || []); const x = inv[i]; const it = x && IX.items[x.id]; const u = x && useOf(x.id);
  if (!u) return;
  const sh = safeSheet(p.card); const hpMax = sh ? sh.hpMax : 1; const hp = p.live.hp ?? hpMax; const live = { ...p.live };
  let msg = "";
  if (u.heal || (u.spell && ["cure-wounds", "healing-word"].includes(u.spell))) {
    const expr = u.heal || (u.spell === "cure-wounds" ? "2d8+3" : "2d4+3"); const r = roll(expr);
    live.hp = Math.min(hpMax, hp + r.total); msg = "ฟื้น " + r.text + " → HP " + live.hp + "/" + hpMax;
  } else if (u.cure) { live.conditions = (live.conditions || []).filter((c) => c !== u.cure); msg = "หาย " + u.cure; }
  else if (u.luck) { live.checkBonus = true; msg = "การทอยตรวจทักษะครั้งถัดไป +1d4"; }
  else return toast("ของชิ้นนี้ใช้ได้ตอนต่อสู้");
  takeOne(inv, i);
  await writeParty(cardId, { card: { ...p.card, inventory: inv }, live });
  await say("system", "🧪 " + p.card.name + " ใช้ " + it.name + " · " + msg);
}
// inn games: dice duel with Old Pell, arm wrestling with Big Tom (3 games per character per day)
function gamesLeft(p) { const g = p.live.games || {}; return g.day === ((P.meta && P.meta.day) || 1) ? Math.max(0, 3 - g.n) : 3; }
async function playInnGame(cardId, kind, bet) {
  const p = P.party[cardId]; if (!p) return;
  if (!gamesLeft(p)) return toast("วันนี้เล่นครบ 3 ตาแล้ว พรุ่งนี้ค่อยมาใหม่");
  if ((p.card.gp || 0) < bet) return toast("เงินไม่พอวางเดิมพัน");
  let me, them, line;
  if (kind === "dice") { const a = roll("2d6"), b = roll("2d6"); me = a.total; them = b.total; line = "🎲 " + p.card.name + " ทอย " + a.text + " · Old Pell ทอย " + b.text; }
  else { const sh = safeSheet(p.card); const ath = sh ? (sh.skills.find((x) => x.name === "Athletics") || { bonus: 0 }).bonus : 0; const a = d(20), b = d(20); me = a + ath; them = b + 5; line = "💪 " + p.card.name + " Athletics " + a + (ath >= 0 ? "+" : "") + ath + " = " + me + " · Big Tom " + b + "+5 = " + them; }
  const win = me > them, tie = me === them; const delta = tie ? 0 : win ? bet : -bet;
  const day = (P.meta && P.meta.day) || 1; const g = p.live.games && p.live.games.day === day ? p.live.games : { day, n: 0 };
  await writeParty(cardId, { card: { ...p.card, gp: (p.card.gp || 0) + delta }, live: { ...p.live, games: { day, n: g.n + 1 } } });
  await say("system", line + " → " + (tie ? "เสมอ คืนเดิมพัน" : win ? "ชนะ! ได้ " + bet + " GP" : "แพ้ เสีย " + bet + " GP"));
}
