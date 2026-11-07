// DnD for friend · play UI: lobby, stage (world / town / grid board), action bar, side panel, TV mode, map editor
const THEMES = {
  cave: { floor: [86, 78, 66], floor2: [72, 65, 55], wall: [38, 34, 30], wallTop: [64, 58, 50], brush: [74, 98, 52], water: [40, 78, 104] },
  crypt: { floor: [92, 92, 98], floor2: [76, 76, 84], wall: [30, 30, 38], wallTop: [58, 58, 70], brush: [70, 84, 60], water: [44, 70, 80] },
  ruins: { floor: [118, 112, 84], floor2: [100, 96, 70], wall: [70, 56, 46], wallTop: [120, 96, 76], brush: [84, 116, 56], water: [48, 92, 118] },
  volcanic: { floor: [70, 52, 46], floor2: [58, 42, 38], wall: [28, 20, 20], wallTop: [70, 40, 32], brush: [96, 70, 40], water: [190, 72, 30] },
};
const EDIT_TOOLS = [["#", "กำแพง"], [".", "พื้น"], [",", "พุ่มไม้ (เดินช้า)"], ["~", "น้ำ/ลาวา (เดินช้า)"], ["T", "ต้นไม้"], ["D", "ประตู"], ["C", "หีบ"], ["?", "เบาะแส"], ["S", "จุดเริ่ม"], ["B", "จุดบอส"]];
const imgCache = new Map();
const bgCache = new Map();
function img(src) {
  if (!src) return null;
  let i = imgCache.get(src);
  if (!i) { i = new Image(); i.onload = () => drawStage(); i.src = src; imgCache.set(src, i); }
  return i.complete && i.naturalWidth ? i : null;
}
function bgImg(src) { return img(src); }
const hash = (x, y, s = 0) => { let n = x * 374761393 + y * 668265263 + s * 982451653; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };
const rgb = (c, k = 1, a = 1) => `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;
const myMember = () => P.party[P.myCardId] || null;
const locInfo = (id) => CAMP.world.locations.find((l) => l.id === id) || (CAMP.maps[id] ? { id, name: CAMP.maps[id].name, th: CAMP.maps[id].th } : { id, name: id, th: "" });

// ---------- fog of war: one bit string per map in each party doc ----------
function revealedBits(def) {
  const n = def.w * def.h; const out = new Uint8Array(n);
  for (const p of Object.values(P.party)) { const s = p.revealed && p.revealed[def.id]; if (s) for (let i = 0; i < Math.min(n, s.length); i++) if (s[i] === "1") out[i] = 1; }
  return out;
}
function bitsToStr(b) { let s = ""; for (const v of b) s += v ? "1" : "0"; return s; }
function currentVisible(def, grid) {
  const set = new Set();
  const st = P.scene.mode === "combat" ? combatState() : null;
  const from = st ? Object.values(st.units).filter((u) => u.side === "pc" && alive(u)) : Object.values(P.party).filter((p) => p.pos && !p.live.dead).map((p) => p.pos);
  for (const f of from) for (const k of visibleCells(grid, f, 8)) set.add(k);
  return set;
}

// ---------- lobby ----------
function viewPlay() {
  if (!P.cid) return viewLobby();
  if (!P.dom || P.dom.cid !== P.cid) buildPlayDom();
  setTimeout(renderPlay, 0);
  return P.dom.root;
}
function viewLobby() {
  if (S.store === "loading") return h("div", { class: "empty" }, "กำลังเชื่อมต่อ…");
  watchCampaigns();
  const list = S.campaigns || [];
  const nameIn = h("input", { type: "text", id: "camp-name", maxlength: 50, placeholder: "ชื่อห้อง เช่น ปาร์ตี้วันเสาร์", value: "" });
  return h("div", { class: "lobby" },
    h("div", { class: "shelf-head" },
      h("div", null, h("div", { class: "eyebrow" }, "แคมเปญ " + CAMP.name + " · " + CAMP.th), h("h2", null, "เลือกห้องเล่น หรือสร้างห้องใหม่")),
      h("div", { class: "row" }, nameIn, h("button", { class: "btn primary", onclick: async () => { const id = await createCampaign(nameIn.value.trim()); openCampaign(id); } }, "+ สร้างห้อง"))),
    h("p", { class: "small muted", style: "max-width:70ch;margin-top:0" }, NET.local
      ? "ตอนนี้เล่นแบบออฟไลน์ในเบราว์เซอร์นี้ (ทุกตัวละครคุมได้จากเครื่องนี้) DM จะเล่าเรื่องได้เมื่อเปิดผ่านลิงก์ claude.ai และล็อกอิน"
      : "เพื่อนที่เปิดลิงก์เดียวกันจะเห็นห้องเหล่านี้ เข้าห้อง เลือกการ์ดของตัวเอง แล้วเล่นด้วยกันได้ทันที คนสร้างห้องเป็น host (เครื่องที่ให้ DM และมอนสเตอร์คิด) ถ้า host ไม่อยู่ คนอื่นกด “เป็น host แทน” ได้"),
    h("div", { class: "cards" }, list.length ? list.map((c) => h("article", { class: "ccard camp" },
      h("div", { class: "portrait", "aria-hidden": "true" }, "⚔"),
      h("div", { style: "min-width:0" }, h("h3", null, c.name), h("div", { class: "small muted" }, "สร้างเมื่อ " + new Date(c.createdAt || Date.now()).toLocaleDateString("th-TH")),
        h("div", null, h("span", { class: "tag num" }, "จบดันเจี้ยน " + Object.keys(c.done || {}).length + "/5"), c.hostUid === myUid() && h("span", { class: "tag ok" }, "ห้องของฉัน"))),
      h("div", { class: "acts" }, h("button", { class: "btn primary", onclick: () => openCampaign(c.id) }, "เข้าห้อง"))))
      : h("div", { class: "empty" }, "ยังไม่มีห้อง ตั้งชื่อแล้วกด “สร้างห้อง” ได้เลย")));
}

// ---------- persistent play DOM (chat input keeps focus between syncs) ----------
function buildPlayDom() {
  const d = { cid: P.cid };
  d.head = h("div", { class: "play-head" });
  d.canvas = h("canvas", { class: "board", "aria-label": "กระดานเกม" });
  d.wrap = h("div", { class: "board-wrap" }, d.canvas);
  d.overlay = h("div", { class: "stage-ov" });
  d.ticker = h("div", { class: "ticker", "aria-live": "polite" });
  d.stageBox = h("div", { class: "stage-box" }, d.wrap, d.overlay, d.ticker);
  d.bar = h("div", { class: "actbar" });
  d.stage = h("section", { class: "stage" }, d.stageBox, d.bar);
  d.sideTabs = h("div", { class: "side-tabs", role: "tablist" });
  d.sideBody = h("div", { class: "side-body" });
  d.input = h("textarea", { id: "chat-in", rows: 2, placeholder: "บอก DM ว่าจะทำอะไร… (Enter ส่ง)", onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitChat(); } } });
  d.chatForm = h("div", { class: "chat-form" }, d.input, h("button", { class: "btn primary", onclick: submitChat }, "ส่ง"));
  d.side = h("aside", { class: "side" }, d.sideTabs, d.sideBody, d.chatForm);
  d.root = h("div", { class: "play" }, d.head, h("div", { class: "play-grid" }, d.stage, d.side));
  d.canvas.addEventListener("click", onBoardClick);
  d.canvas.addEventListener("mousemove", onBoardHover);
  d.canvas.addEventListener("mouseleave", () => { P.hover = null; drawStage(); });
  d.canvas.addEventListener("mousedown", (e) => { if (P.mapEdit) { P.painting = true; onBoardClick(e); } });
  window.addEventListener("mouseup", () => { P.painting = false; });
  P.dom = d;
}
function submitChat() {
  const t = P.dom.input.value; if (!t.trim()) return;
  P.dom.input.value = ""; sendChat(t);
}
let resizeT = null;
window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.view === "play" && P.cid) drawStage(); }, 120); });

function renderPlay() {
  if (S.view !== "play") return;
  if (!P.cid) { render(); return; }
  if (!P.dom || P.dom.cid !== P.cid || !P.dom.root.isConnected) { render(); return; }
  if (!P.meta || !P.scene) { P.dom.head.replaceChildren(h("div", { class: "muted" }, "กำลังโหลดห้อง…")); return; }
  document.body.classList.toggle("tv", P.tv);
  renderHead(); renderOverlay(); renderBar(); renderSide(); drawStage(); renderTicker();
}

function renderHead() {
  const sc = P.scene; const L = locInfo(sc.loc);
  const where = sc.mode === "world" ? "แผนที่โลก" : L.name + (L.th ? " · " + L.th : "");
  const hostP = Object.values(P.party).find((p) => p.uid === P.meta.hostUid);
  P.dom.head.replaceChildren(
    h("div", { style: "min-width:0" }, h("div", { class: "eyebrow" }, P.meta.name + " · " + ({ town: "หมู่บ้าน", explore: "สำรวจ", combat: "ต่อสู้", world: "เดินทาง" })[sc.mode]),
      h("h2", null, where)),
    h("div", { class: "row" },
      h("span", { class: "tag" + (isHost() ? " ok" : "") }, NET.local ? "ออฟไลน์" : isHost() ? "คุณเป็น host" : "host: " + (hostP ? hostP.card.name : "ไม่อยู่")),
      !isHost() && !NET.local && h("button", { class: "btn ghost small", onclick: async () => { await writeMeta({ hostUid: myUid() }); toast("คุณเป็น host แล้ว"); } }, "เป็น host แทน"),
      h("button", { class: "btn small", "aria-pressed": P.tts ? "true" : "false", onclick: () => { P.tts = !P.tts; try { localStorage.setItem("dnd4f-tts", P.tts ? "1" : "0"); } catch (e) {} if (!P.tts) try { speechSynthesis.cancel(); } catch (e) {} renderHead(); } }, P.tts ? "🔊 เสียง DM" : "🔈 เสียง DM"),
      h("button", { class: "btn small", onclick: toggleTV }, P.tv ? "ออกจากโหมดทีวี" : "📺 โหมดทีวี"),
      isHost() && sc.mode !== "combat" && sc.mode !== "town" && h("button", { class: "btn small", onclick: () => startEdit(sc.mode === "world" ? "world" : sc.loc) }, "ตั้งค่า Map"),
      h("button", { class: "btn ghost small", onclick: () => { closeCampaign(); P.dom = null; P.tv = false; document.body.classList.remove("tv"); render(); } }, "ออกจากห้อง")));
}
function toggleTV() {
  P.tv = !P.tv;
  try { if (P.tv && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); else if (!P.tv && document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  renderPlay();
}

// ---------- overlay panels over the stage (join, town, results, editor) ----------
function renderOverlay() {
  const ov = P.dom.overlay; const sc = P.scene;
  let content = null;
  if (P.mapEdit) content = editorPanel();
  else if (!myParty().length || P.forceJoin) content = joinPanel();
  else if (sc.mode === "town") content = townPanel();
  ov.hidden = !content;
  ov.replaceChildren(...(content ? [content] : []));
  P.dom.wrap.hidden = sc.mode === "town" && !P.mapEdit;
}
function joinPanel() {
  const ready = S.cards.filter((c) => !validate(c, D).length);
  const inUse = new Set(Object.keys(P.party));
  return h("div", { class: "panel ov-panel" },
    h("div", null, h("div", { class: "eyebrow" }, "เข้าร่วมทีม"), h("h2", null, "เลือกการ์ดของคุณ")),
    S.store === "loading" ? h("p", { class: "muted" }, "กำลังโหลดการ์ด…")
    : ready.length ? h("div", { class: "pick-grid" }, ready.map((c) => h("button", { class: "pick", disabled: inUse.has(c.id), onclick: () => joinWith(c) },
        h("div", { class: "row" }, portraitEl(c), h("div", { style: "min-width:0" }, h("b", null, c.name), h("div", { class: "small muted" }, classLine(c)), h("span", { class: "tag num" }, "Lv " + c.level))),
        inUse.has(c.id) && h("span", { class: "small muted" }, "อยู่ในทีมแล้ว"))))
    : h("p", null, "ยังไม่มีการ์ดที่พร้อมเล่น ไปที่แท็บ “การ์ดตัวละคร” แล้วสร้างหรือกด “ใช้ตัวนี้” ที่ตัวสำเร็จรูปก่อน"),
    NET.local && h("p", { class: "small muted" }, "โหมดออฟไลน์: เพิ่มได้หลายตัว แล้วสลับคุมจากแท็บทีม"),
    P.forceJoin && h("button", { class: "btn ghost", onclick: () => { P.forceJoin = false; renderPlay(); } }, "ปิด"),
    h("button", { class: "btn", onclick: () => go("shelf") }, "ไปที่การ์ดตัวละคร"));
}

// ---------- town ----------
function townPanel() {
  const T = CAMP.town; const place = P.townPlace;
  const me = myMember();
  const body = !place ? h("div", { class: "pick-grid" }, T.places.map((p) => h("button", { class: "pick place", onclick: () => { P.townPlace = p.id; renderOverlay(); } },
      h("span", { class: "nm" }, p.name), h("span", { class: "th" }, p.th), h("span", { class: "small muted" }, p.desc))))
    : place === "inn" ? innPanel() : place === "temple" ? templePanel() : place === "market" ? marketPanel() : boardPanel();
  return h("div", { class: "panel ov-panel town" },
    h("div", { class: "row", style: "justify-content:space-between" },
      h("div", null, h("div", { class: "eyebrow" }, "หมู่บ้าน"), h("h2", null, place ? T.places.find((p) => p.id === place).name : CAMP.world.locations[0].name)),
      h("div", { class: "row" }, place && h("button", { class: "btn", onclick: () => { P.townPlace = null; renderOverlay(); } }, "← กลับจัตุรัส"),
        h("button", { class: "btn", onclick: () => writeScene({ mode: "world" }) }, "🗺 ออกเดินทาง"))),
    !place && h("p", { style: "margin:0" }, T.intro),
    me && h("div", { class: "small muted" }, "คุณเล่นเป็น " + me.card.name + " · เงิน " + fmtGp(me.card.gp || 0)),
    body);
}
const fmtGp = (g) => (Math.round(g * 100) / 100) + " GP";
function innPanel() {
  const n = Object.values(P.party).length;
  return h("div", { class: "work" }, h("p", { style: "margin:0" }, "เตาผิงอุ่น ซุปร้อน Old Pell นั่งเล่านิทานมังกรอยู่มุมห้อง"),
    h("div", { class: "row" },
      h("button", { class: "btn primary", onclick: async () => {
        for (const p of Object.values(P.party)) if ((p.card.gp || 0) >= 1) await writeParty(p.cardId, { card: { ...P.party[p.cardId].card, gp: p.card.gp - 1 } });
        await restParty("long");
      } }, "พักค้างคืน (1 GP/คน · " + n + " คน)"),
      h("button", { class: "btn", onclick: () => requestDM({ event: "ทีมนั่งฟังข่าวลือในโรงเตี๊ยม The Copper Kettle คุยกับ Old Pell" }) }, "ฟังข่าวลือ (ให้ DM เล่า)")));
}
function templePanel() {
  const me = myMember();
  const dead = Object.values(P.party).filter((p) => p.live.dead || p.live.hp <= 0);
  const sick = Object.values(P.party).filter((p) => (p.live.conditions || []).length);
  const revive = async (p, payer) => {
    const cost = 100 * p.card.level;
    if ((payer.card.gp || 0) < cost) return toast("เงินไม่พอ ต้องใช้ " + cost + " GP");
    if (payer.cardId !== p.cardId) await writeParty(payer.cardId, { card: { ...payer.card, gp: payer.card.gp - cost } });
    const cur = P.party[p.cardId];
    const sh = computeSheet(cur.card, D);
    await writeParty(p.cardId, { card: payer.cardId === p.cardId ? { ...cur.card, gp: cur.card.gp - cost } : cur.card, live: { ...cur.live, dead: false, hp: sh.hpMax, deathSaves: { ok: 0, fail: 0 }, conditions: [] } });
    await say("system", "✨ Sister Maren ชุบชีวิต " + p.card.name + " (" + cost + " GP จาก " + payer.card.name + ")");
  };
  return h("div", { class: "work" }, h("p", { style: "margin:0" }, "แสงรุ่งอรุณลอดกระจกสี Sister Maren ยิ้มต้อนรับ"),
    dead.length ? dead.map((p) => h("div", { class: "row" }, h("b", null, p.card.name), h("span", { class: "small muted" }, "ค่าชุบ " + 100 * p.card.level + " GP"),
      h("button", { class: "btn primary", onclick: () => revive(p, p) }, "จ่ายเอง"),
      me && me.cardId !== p.cardId && h("button", { class: "btn", onclick: () => revive(p, me) }, "ฉัน (" + me.card.name + ") จ่ายให้")))
    : h("p", { class: "muted", style: "margin:0" }, "ทุกคนยังมีชีวิตอยู่"),
    sick.map((p) => h("div", { class: "row" }, h("span", null, p.card.name + ": " + p.live.conditions.join(", ")),
      h("button", { class: "btn", onclick: async () => { if ((p.card.gp || 0) < 10) return toast("เงินไม่พอ"); await writeParty(p.cardId, { card: { ...p.card, gp: p.card.gp - 10 }, live: { ...p.live, conditions: [] } }); toast("รักษาแล้ว"); } }, "รักษา 10 GP"))));
}
function marketPanel() {
  const me = myMember(); if (!me) return h("p", null, "เข้าร่วมทีมก่อน");
  const tab = P.shopTab || "weapons";
  const list = D.equipment[tab];
  const buy = async (it) => {
    const p = P.party[me.cardId];
    if ((p.card.gp || 0) + 1e-9 < it.cost) return toast("เงินไม่พอ");
    const inv = clone(p.card.inventory || []); const e = inv.find((x) => x.id === it.id);
    if (e) e.qty++; else inv.push({ id: it.id, qty: 1, equipped: false });
    await writeParty(me.cardId, { card: { ...p.card, gp: Math.round((p.card.gp - it.cost) * 100) / 100, inventory: inv } });
    toast("ซื้อ " + it.name + " แล้ว");
  };
  const sell = async (i) => {
    const p = P.party[me.cardId]; const inv = clone(p.card.inventory); const x = inv[i]; const it = IX.items[x.id];
    const price = Math.round(((it && it.cost) || 0) * 50) / 100;
    x.qty--; if (x.qty <= 0) inv.splice(i, 1);
    await writeParty(me.cardId, { card: { ...p.card, gp: Math.round(((p.card.gp || 0) + price) * 100) / 100, inventory: inv } });
    toast("ขาย " + (it ? it.name : x.id) + " ได้ " + price + " GP");
  };
  const equip = async (i) => {
    const p = P.party[me.cardId]; const inv = clone(p.card.inventory); const it = IX.items[inv[i].id]; const now = !inv[i].equipped;
    if (now) inv.forEach((y) => { const yi = IX.items[y.id]; if (yi && yi.kind === "armor" && (yi.cat === "shield") === (it.cat === "shield")) y.equipped = false; });
    inv[i].equipped = now;
    await writeParty(me.cardId, { card: { ...p.card, inventory: inv } });
  };
  return h("div", { class: "work" },
    h("div", { class: "chips" }, [["weapons", "อาวุธ"], ["armor", "เกราะ"], ["gear", "ของใช้/ยา"]].map(([k, l]) => h("button", { class: "chip", "aria-pressed": tab === k ? "true" : "false", onclick: () => { P.shopTab = k; renderOverlay(); } }, l))),
    h("div", { class: "tbl shop" }, h("table", null, h("tbody", null, list.map((it) => h("tr", null,
      h("td", null, it.name, h("div", { class: "small muted" }, it.dmg ? it.dmg + " " + it.dtype : it.ac ? (it.cat === "shield" ? "+2 AC" : "AC " + it.ac) : "")),
      h("td", { class: "num" }, it.cost >= 1 ? it.cost + " GP" : Math.round(it.cost * 10) >= 1 ? Math.round(it.cost * 10) + " SP" : Math.round(it.cost * 100) + " CP"),
      h("td", null, h("button", { class: "btn small", disabled: (me.card.gp || 0) + 1e-9 < it.cost, onclick: () => buy(it) }, "ซื้อ"))))))),
    h("h3", null, "ของของ " + me.card.name),
    h("div", { class: "tbl shop" }, h("table", null, h("tbody", null, (me.card.inventory || []).map((x, i) => { const it = IX.items[x.id] || { name: x.id, cost: 0 };
      return h("tr", null, h("td", null, it.name + (x.equipped ? " (สวมอยู่)" : "")), h("td", { class: "num" }, "×" + x.qty),
        h("td", null, h("div", { class: "row" }, it.kind === "armor" && h("button", { class: "btn small", onclick: () => equip(i) }, x.equipped ? "ถอด" : "สวม"),
          h("button", { class: "btn small ghost", onclick: () => sell(i) }, "ขาย " + Math.round((it.cost || 0) * 50) / 100 + " GP")))); })))));
}
function boardPanel() {
  return h("div", { class: "work" },
    h("ul", { class: "traits" }, CAMP.town.rumors.map((r) => h("li", null, r))),
    h("div", { class: "pick-grid" }, CAMP.world.locations.filter((l) => l.type !== "town").map((l) => h("div", { class: "pick" },
      h("span", { class: "nm" }, l.name), h("span", { class: "th" }, l.th), h("span", { class: "small muted" }, "เลเวลแนะนำ " + l.level + ((P.meta.done || {})[l.id] ? " · ✓ จบแล้ว" : "")),
      h("button", { class: "btn small", onclick: () => travelTo(l.id) }, "เดินทางไป")))));
}

// ---------- board drawing ----------
function stageGeometry() {
  const sc = P.scene;
  const wrapW = Math.max(280, P.dom.wrap.clientWidth || 800);
  if (P.mapEdit && P.mapEdit.id === "world" || (!P.mapEdit && sc.mode === "world")) { const w = Math.min(wrapW, 1100); return { kind: "world", w, h: Math.round(w * 0.62) }; }
  const def = P.mapEdit ? { ...mapDef(P.mapEdit.id), rows: P.mapEdit.rows } : mapDef(sc.loc);
  if (!def || !def.rows) return null;
  const W = def.rows[0].length, H = def.rows.length;
  const cell = Math.max(22, Math.min(52, Math.floor(wrapW / W)));
  return { kind: "grid", def, W, H, cell, w: cell * W, h: cell * H };
}
function drawStage() {
  if (!P.dom || !P.scene || S.view !== "play") return;
  if (P.scene.mode === "town" && !P.mapEdit) return;
  const g = stageGeometry(); if (!g) return;
  const cv = P.dom.canvas; const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(g.w * dpr) || cv.height !== Math.round(g.h * dpr)) { cv.width = Math.round(g.w * dpr); cv.height = Math.round(g.h * dpr); cv.style.width = g.w + "px"; cv.style.height = g.h + "px"; }
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  P.geo = g;
  if (g.kind === "world") drawWorld(ctx, g); else drawGrid(ctx, g);
}
function drawWorld(ctx, g) {
  const W = g.w, H = g.h;
  const bg = bgImg((P.maps.world || {}).bg);
  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  else {
    const grd = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7); grd.addColorStop(0, "#e8dcb8"); grd.addColorStop(1, "#bfa877");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    // terrain blobs: forest, hills, mountains
    for (let i = 0; i < 260; i++) {
      const x = hash(i, 1) * W, y = hash(i, 2) * H, r = 6 + hash(i, 3) * 16, t = hash(i, 4);
      if (y < H * 0.3 && t > 0.4) { ctx.fillStyle = "rgba(110,90,70,.55)"; ctx.beginPath(); ctx.moveTo(x - r, y + r * .6); ctx.lineTo(x, y - r); ctx.lineTo(x + r, y + r * .6); ctx.fill(); }
      else if (t < 0.45) { ctx.fillStyle = "rgba(70,110,60,.45)"; ctx.beginPath(); ctx.arc(x, y, r * .7, 0, 7); ctx.fill(); }
    }
    ctx.strokeStyle = "rgba(60,110,150,.55)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, H * 0.7);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H * 0.7 + Math.sin(x / 70) * 18 + Math.sin(x / 23) * 5); ctx.stroke();
    ctx.strokeStyle = "rgba(80,50,30,.35)"; ctx.lineWidth = 3; ctx.strokeRect(6, 6, W - 12, H - 12);
  }
  const pos = (l) => ({ x: l.x / 100 * W, y: l.y / 100 * H });
  const byId = Object.fromEntries(CAMP.world.locations.map((l) => [l.id, l]));
  ctx.setLineDash([7, 6]); ctx.strokeStyle = "rgba(90,60,30,.8)"; ctx.lineWidth = 2.5;
  for (const [a, b] of CAMP.world.roads) { const p = pos(byId[a]), q = pos(byId[b]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo((p.x + q.x) / 2 + 20, (p.y + q.y) / 2 - 15, q.x, q.y); ctx.stroke(); }
  ctx.setLineDash([]);
  for (const l of CAMP.world.locations) {
    const p = pos(l); const here = P.scene.loc === l.id || (P.scene.loc === "summit" && l.id === "spire"); const done = (P.meta.done || {})[l.id]; const sel = P.worldSel === l.id;
    ctx.beginPath(); ctx.arc(p.x, p.y, sel ? 15 : 12, 0, 7); ctx.fillStyle = l.type === "town" ? "#2a7564" : done ? "#6b6b6b" : "#a33b33"; ctx.fill();
    ctx.lineWidth = here ? 4 : 2; ctx.strokeStyle = here ? "#f4d27a" : "#2b1d10"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(l.type === "town" ? "⌂" : done ? "✓" : "!", p.x, p.y + 1);
    ctx.font = "600 13px 'IBM Plex Sans Thai', system-ui"; ctx.textBaseline = "top";
    const label = l.name; const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(30,20,10,.75)"; ctx.fillRect(p.x - tw / 2 - 5, p.y + 17, tw + 10, 34);
    ctx.fillStyle = "#fff"; ctx.fillText(label, p.x, p.y + 19); ctx.font = "11px 'IBM Plex Sans Thai', system-ui"; ctx.fillStyle = "#e8dcb8"; ctx.fillText(l.type === "town" ? "ปลอดภัย" : "Lv " + l.level, p.x, p.y + 35);
  }
}
function drawGrid(ctx, g) {
  const { def, W, H, cell: c } = g;
  const th = THEMES[def.theme] || THEMES.cave;
  const edit = !!P.mapEdit;
  const rows = edit ? P.mapEdit.rows : def.rows;
  const bg = bgImg(edit ? P.mapEdit.bg : def.bg);
  ctx.clearRect(0, 0, g.w, g.h);
  if (bg) ctx.drawImage(bg, 0, 0, g.w, g.h);
  const opened = P.meta.opened || {}, found = P.meta.found || {};
  let ci = 0, qi = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[y][x]; const px = x * c, py = y * c; const n = hash(x, y);
    const wall = ch === "#" || ch === " ";
    if (!bg) {
      ctx.fillStyle = wall ? rgb(th.wall, 0.9 + n * 0.2) : rgb(n > 0.5 ? th.floor : th.floor2, 0.92 + hash(y, x) * 0.16);
      ctx.fillRect(px, py, c, c);
      if (wall) { const below = y + 1 < H && rows[y + 1][x] !== "#" && rows[y + 1][x] !== " "; if (below) { ctx.fillStyle = rgb(th.wallTop); ctx.fillRect(px, py + c * 0.72, c, c * 0.28); } }
      else if (n > 0.86) { ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.beginPath(); ctx.arc(px + c * hash(x, y, 2), py + c * hash(x, y, 3), c * 0.08, 0, 7); ctx.fill(); }
      if (ch === ",") { ctx.strokeStyle = rgb(th.brush, 1.2); ctx.lineWidth = Math.max(1, c / 16); for (let i = 0; i < 4; i++) { const bx = px + c * (0.2 + 0.6 * hash(x, y, i)), by = py + c * (0.35 + 0.5 * hash(y, x, i)); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - c * .08, by - c * .22); ctx.moveTo(bx, by); ctx.lineTo(bx + c * .08, by - c * .22); ctx.stroke(); } }
      if (ch === "~") { ctx.fillStyle = rgb(th.water, 1, 0.85); ctx.fillRect(px, py, c, c); ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + c * .15, py + c * .5); ctx.quadraticCurveTo(px + c * .35, py + c * .35, px + c * .55, py + c * .5); ctx.quadraticCurveTo(px + c * .75, py + c * .65, px + c * .9, py + c * .5); ctx.stroke(); }
      if (ch === "T") { ctx.fillStyle = rgb(th.floor2); ctx.fillRect(px, py, c, c); ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.arc(px + c * .55, py + c * .6, c * .42, 0, 7); ctx.fill(); ctx.fillStyle = rgb([52, 92, 48], 0.9 + n * 0.3); ctx.beginPath(); ctx.arc(px + c / 2, py + c / 2, c * .42, 0, 7); ctx.fill(); }
      if (ch === "D") { ctx.fillStyle = "#6b4a2b"; ctx.fillRect(px + c * .1, py + c * .1, c * .8, c * .8); ctx.strokeStyle = "#3d2a17"; ctx.lineWidth = 1; ctx.strokeRect(px + c * .1, py + c * .1, c * .8, c * .8); ctx.beginPath(); ctx.moveTo(px + c / 2, py + c * .1); ctx.lineTo(px + c / 2, py + c * .9); ctx.stroke(); }
    }
    if (ch === "C") { const k = def.id + ":C" + ci++; if (!opened[k] || edit) { ctx.fillStyle = "#8a5a22"; ctx.fillRect(px + c * .2, py + c * .3, c * .6, c * .45); ctx.fillStyle = "#e3b341"; ctx.fillRect(px + c * .2, py + c * .45, c * .6, c * .08); ctx.fillRect(px + c * .46, py + c * .4, c * .08, c * .2); } }
    if (ch === "?") { const k = def.id + ":?" + qi++; if (!found[k] || edit) { ctx.fillStyle = "rgba(255,230,140,.9)"; ctx.font = `bold ${Math.round(c * .6)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("✦", px + c / 2, py + c / 2); } }
    if (edit && /[a-zSBE]/.test(ch)) { ctx.fillStyle = ch === "B" ? "rgba(214,179,102,.85)" : ch === "S" ? "rgba(92,191,166,.85)" : "rgba(231,131,120,.8)"; ctx.fillRect(px + 2, py + 2, c - 4, c - 4); ctx.fillStyle = "#111"; ctx.font = `bold ${Math.round(c * .5)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ch, px + c / 2, py + c / 2); }
    if (ch === "E" && !edit) { ctx.fillStyle = "rgba(92,191,166,.5)"; ctx.fillRect(px + 3, py + 3, c - 6, c - 6); ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(c * .45)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("⇧", px + c / 2, py + c / 2); }
  }
  ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * c + .5, 0); ctx.lineTo(x * c + .5, g.h); ctx.stroke(); }
  for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * c + .5); ctx.lineTo(g.w, y * c + .5); ctx.stroke(); }
  if (edit) { if (P.hover) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(P.hover.x * c + 1, P.hover.y * c + 1, c - 2, c - 2); } return; }

  const grid = gridOf(def);
  const st = P.scene.mode === "combat" ? combatState() : null;
  const vis = currentVisible(def, grid);
  // combat overlays: reachable cells, ranges, area preview
  const cur = st && current(st);
  const mine = cur && cur.side === "pc" && canControl(cur) && !st.over;
  if (mine && P.mode === "move" && cur.turn) {
    const reach = reachableCells(st, cur);
    ctx.fillStyle = "rgba(92,191,166,.22)";
    for (const k of Object.keys(reach)) { const [x, y] = k.split(",").map(Number); ctx.fillRect(x * c, y * c, c, c); }
  }
  if (mine && P.hover && P.mode === "spell" && P.spellSel) {
    const need = spellNeed(P.spellSel.id);
    if (need.area) {
      const cells = areaCells(st, need.area[0], need.area[1], { x: cur.x, y: cur.y }, P.hover);
      ctx.fillStyle = "rgba(230,120,60,.35)"; for (const q of cells) ctx.fillRect(q.x * c, q.y * c, c, c);
    }
  }
  // tokens
  const tokens = [];
  if (st) for (const u of Object.values(st.units)) { if (u.kind === "monster" && u.hp <= 0) continue; tokens.push({ u, x: u.x, y: u.y, size: u.size || 1 }); }
  else {
    for (const p of Object.values(P.party)) if (p.pos) tokens.push({ u: { id: "pc-" + p.cardId, side: "pc", name: p.card.name, portrait: p.card.portrait, hp: p.live.hp, maxHp: computeSheet(p.card, D).hpMax, dead: p.live.dead, conditions: [] }, x: p.pos.x, y: p.pos.y, size: 1 });
    for (const L of Object.keys(def.encounters || {})) {
      if ((P.meta.cleared || {})[clearedKey(def.id, L)]) continue;
      for (const s of encounterSpawns(def, L, Math.max(1, Object.keys(P.party).length))) if (vis.has(s.x + "," + s.y)) { const m = MON[s.id]; tokens.push({ u: { id: "s" + s.x + s.y, side: "foe", name: m.name, monId: m.id, tier: s.tier, hp: 1, maxHp: 1, conditions: [] }, x: s.x, y: s.y, size: ({ Large: 2, Huge: 3, Gargantuan: 4 })[(m.type || "").split(" ")[0]] || 1 }); }
    }
  }
  for (const t of tokens) drawToken(ctx, t, c, st, cur);
  // fog
  const bits = revealedBits(def);
  const art = !!bgImg(def.bg); // with painted map art, keep the unexplored area faintly visible so the map reads as a place
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = x + "," + y;
    if (vis.has(k)) continue;
    ctx.fillStyle = bits[y * W + x] ? "rgba(8,10,12,.5)" : art ? "rgba(6,7,9,.84)" : "rgba(6,7,9,.97)";
    ctx.fillRect(x * c, y * c, c, c);
  }
  if (P.hover) {
    ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 2; ctx.strokeRect(P.hover.x * c + 1, P.hover.y * c + 1, c - 2, c - 2);
    if (st && mine && P.mode === "move" && cur.turn) { const path = findPath(st, cur, P.hover, { maxCost: cur.turn.move - cur.turn.moved }); if (path && path.length) { ctx.strokeStyle = "rgba(244,210,122,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cur.x * c + c / 2, cur.y * c + c / 2); for (const s of path) ctx.lineTo(s.x * c + c / 2, s.y * c + c / 2); ctx.stroke(); } }
  }
}
function drawToken(ctx, t, c, st, cur) {
  const u = t.u; const s = t.size * c; const px = t.x * c, py = t.y * c; const r = s / 2 - Math.max(2, c * 0.08);
  const cx = px + s / 2, cy = py + s / 2;
  const isCur = cur && cur.id === u.id;
  const ring = u.side === "pc" ? "#5cbfa6" : u.tier === "boss" ? "#f4d27a" : u.tier === "subboss" ? "#e0a050" : "#e05a4f";
  ctx.save();
  if (u.dead || (u.side === "pc" && u.hp <= 0)) ctx.globalAlpha = 0.45;
  if (isCur) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 14; }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = u.side === "pc" ? "#1d3a33" : "#3b1d1a"; ctx.fill();
  ctx.shadowBlur = 0;
  const im = img(u.portrait || (u.monId && P.maps.tokens && P.maps.tokens[u.monId]) || "");
  if (im) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, 7); ctx.clip(); ctx.drawImage(im, cx - r, cy - r, r * 2, r * 2); ctx.restore(); }
  else { ctx.fillStyle = "#fff"; ctx.font = `600 ${Math.round(r * 0.8)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(initials(u.name.replace(/\(.*\)/, "")), cx, cy + 1); }
  ctx.lineWidth = isCur ? 3.5 : 2.5; ctx.strokeStyle = isCur ? "#fff" : ring; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  if (u.maxHp > 1 && (st || u.side === "pc")) {
    const pct = Math.max(0, Math.min(1, u.hp / u.maxHp)); const bw = s * 0.8;
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(cx - bw / 2, py + s - 6, bw, 5);
    ctx.fillStyle = pct > 0.5 ? "#5fcf7b" : pct > 0.25 ? "#e3b341" : "#e05a4f"; ctx.fillRect(cx - bw / 2, py + s - 6, bw * pct, 5);
  }
  if (u.conditions && u.conditions.length) { ctx.fillStyle = "#c58af9"; ctx.beginPath(); ctx.arc(px + s - 5, py + 5, 4, 0, 7); ctx.fill(); }
  if (u.effects && u.effects.some((e) => e.potion)) { ctx.font = `${Math.round(c * 0.38)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🧪", px + s - 6, py + s - 12); }
  if (u.conc) { ctx.fillStyle = "#7ab8ff"; ctx.beginPath(); ctx.arc(px + 5, py + 5, 4, 0, 7); ctx.fill(); }
  if (P.spellSel && P.spellSel.targets && P.spellSel.targets.includes(u.id)) { ctx.strokeStyle = "#f4d27a"; ctx.lineWidth = 3; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
}
function cellFromEvent(e) {
  const g = P.geo; if (!g || g.kind !== "grid") return null;
  const r = P.dom.canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / g.cell), y = Math.floor((e.clientY - r.top) / g.cell);
  return x >= 0 && y >= 0 && x < g.W && y < g.H ? { x, y } : null;
}
function onBoardHover(e) {
  if (P.geo && P.geo.kind === "world") return;
  const c = cellFromEvent(e);
  const same = c && P.hover && c.x === P.hover.x && c.y === P.hover.y;
  if (same) return;
  P.hover = c;
  if (P.mapEdit && P.painting && c) paintCell(c);
  drawStage();
}
function unitAt(st, x, y) { return Object.values(st.units).find((u) => !(u.kind === "monster" && u.hp <= 0) && x >= u.x && x < u.x + (u.size || 1) && y >= u.y && y < u.y + (u.size || 1)); }

function onBoardClick(e) {
  if (!P.scene) return;
  if (P.geo && P.geo.kind === "world") {
    if (P.mapEdit) return;
    const r = P.dom.canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const hit = CAMP.world.locations.find((l) => Math.hypot(l.x / 100 * P.geo.w - mx, l.y / 100 * P.geo.h - my) < 26);
    P.worldSel = hit ? hit.id : null; renderBar(); drawStage(); return;
  }
  const c = cellFromEvent(e); if (!c) return;
  if (P.mapEdit) { if (e.type === "click") return; paintCell(c); drawStage(); return; }
  if (P.scene.mode === "explore") return exploreClick(c);
  if (P.scene.mode === "combat") return combatClick(c);
}

// ---------- exploration ----------
async function exploreClick(c) {
  const me = myMember();
  if (!me) return toast("เลือกการ์ดเข้าร่วมทีมก่อน");
  if (me.live.dead) return toast(me.card.name + " เสียชีวิตอยู่ ต้องกลับไปชุบที่วิหาร");
  if (P.busy) return;
  const def = mapDef(P.scene.loc); const grid = gridOf(def);
  const ch = def.rows[c.y][c.x];
  const start = me.pos || freeStart(def);
  const ghost = { map: grid, units: {} };
  const self = { id: "me", side: "pc", x: start.x, y: start.y };
  let path;
  if (grid.walls[c.x + "," + c.y]) return;
  if (c.x === start.x && c.y === start.y) path = [];
  else path = findPath(ghost, self, c, {});
  if (!path) return toast("ไปตรงนั้นไม่ได้");
  const bits = revealedBits(def);
  const enc = Object.keys(def.encounters || {}).filter((L) => !(P.meta.cleared || {})[clearedKey(def.id, L)]).flatMap((L) => encounterSpawns(def, L, Math.max(1, Object.keys(P.party).length)));
  let end = { x: start.x, y: start.y }; let stopped = false;
  for (const step of path) {
    end = { x: step.x, y: step.y };
    for (const k of visibleCells(grid, end, 8)) { const [x, y] = k.split(",").map(Number); bits[y * grid.w + x] = 1; }
    if (enc.some((s) => dist(end, s) <= 40 && hasLOS({ map: grid }, end, s))) { stopped = true; break; }
  }
  if (!path.length) for (const k of visibleCells(grid, end, 8)) { const [x, y] = k.split(",").map(Number); bits[y * grid.w + x] = 1; }
  P.busy = true;
  try {
    await writeParty(me.cardId, { pos: end, revealed: { ...(me.revealed || {}), [def.id]: bitsToStr(bits) } });
    if (stopped) { toast("⚠️ เจอศัตรู!"); return; }
    if (end.x === c.x && end.y === c.y) await interact(def, c, ch);
  } finally { P.busy = false; }
}
async function interact(def, c, ch) {
  const me = myMember();
  if (ch === "C") {
    const i = cellsOf(def, "C").findIndex((q) => q.x === c.x && q.y === c.y); const k = def.id + ":C" + i;
    if ((P.meta.opened || {})[k]) return toast("หีบนี้ว่างแล้ว");
    const loot = (def.chests || [])[i] || { gp: 5, items: [] };
    await writeMeta({ opened: { ...(P.meta.opened || {}), [k]: true } });
    const p = P.party[me.cardId]; const inv = clone(p.card.inventory || []);
    for (const [id, q] of loot.items || []) { const e = inv.find((x) => x.id === id); if (e) e.qty += q; else inv.push({ id, qty: q, equipped: false }); }
    await writeParty(me.cardId, { card: { ...p.card, gp: (p.card.gp || 0) + (loot.gp || 0), inventory: inv } });
    await say("system", "🧰 " + me.card.name + " เปิดหีบ ได้ " + (loot.gp || 0) + " GP" + ((loot.items || []).length ? " · " + loot.items.map(([id, q]) => q + "× " + iname(id)).join(", ") : "") + (loot.note ? "\n📜 " + loot.note : ""));
    if (loot.note) requestDM({ event: me.card.name + " พบในหีบ: " + loot.note });
  } else if (ch === "?") {
    const i = cellsOf(def, "?").findIndex((q) => q.x === c.x && q.y === c.y); const k = def.id + ":?" + i;
    if ((P.meta.found || {})[k]) return;
    const clue = (def.clues || [])[i] || "ร่องรอยแปลก ๆ";
    await writeMeta({ found: { ...(P.meta.found || {}), [k]: true } });
    await say("system", "🔎 " + me.card.name + " พบเบาะแส: " + clue);
    requestDM({ event: me.card.name + " ตรวจดูและพบเบาะแส: " + clue });
  } else if (ch === "E" && def.next) {
    if (!(P.meta.done || {})[def.id] && Object.keys(def.encounters || {}).some((L) => def.encounters[L].boss && !(P.meta.cleared || {})[clearedKey(def.id, L)])) return toast("ทางขึ้นถูกผนึกไว้ ต้องชนะผู้คุมชั้นนี้ก่อน");
    await travelTo(def.next);
  }
}

// ---------- combat input ----------
function spellNeed(id) {
  const fx = SPELLFX[id]; if (!fx || fx.t === "util") return { kind: "narr" };
  if (["temp", "aura", "nexthit"].includes(fx.t)) return { kind: "self" };
  if (fx.t === "teleport") return { kind: "point", range: fx.range };
  if (fx.area) return { kind: fx.self ? "dir" : "point", range: fx.range || 0, area: fx.area };
  const n = fx.t === "atk" ? fx.rays || 1 : fx.t === "auto" ? fx.darts : fx.targets || 1;
  return { kind: "units", n, ally: ["heal", "buff", "revive", "stabilize"].includes(fx.t), range: fx.range || 5 };
}
async function combatClick(c) {
  const st = combatState(); if (!st || st.over) return;
  const u = current(st);
  if (!u || u.side !== "pc" || !canControl(u)) { const t = unitAt(st, c.x, c.y); if (t) { P.inspect = t.id; renderSide(); } return; }
  const t = unitAt(st, c.x, c.y);
  if (P.mode === "spell" && P.spellSel) {
    const need = spellNeed(P.spellSel.id);
    if (need.kind === "point" || need.kind === "dir") return castNow({ point: c });
    if (need.kind === "units") {
      if (!t) return;
      const sel = P.spellSel.targets = P.spellSel.targets || [];
      const i = sel.indexOf(t.id); if (i >= 0) sel.splice(i, 1); else sel.push(t.id);
      if (need.n <= 1 || sel.length >= need.n) return castNow({});
      renderBar(); drawStage(); return;
    }
    return;
  }
  if (P.mode === "chaos" && P.chaosSel) { if (t && t.side === "pc") { const id = P.chaosSel; P.mode = "move"; P.chaosSel = null; return useChaos(t.id, id); } return; }
  if (P.mode === "help") { if (t && t.side === "pc" && t.id !== u.id) { P.mode = "move"; return act((s, a) => doHelp(s, a, s.units[t.id])); } return; }
  if (P.mode === "offhand") { if (t && t.side === "foe") { P.mode = "move"; return act((s, a) => offhandAttack(s, a, s.units[t.id])); } return; }
  if (P.mode === "spiritual") { if (t && t.side === "foe") { P.mode = "move"; return act((s, a) => spiritualAttack(s, a, s.units[t.id])); } return; }
  if (t && t.side === "foe") {
    const idx = P.attackSel != null ? P.attackSel : bestWeapon(u, t);
    if (idx < 0) return toast("ไม่มีอาวุธที่ถึงเป้า");
    if (u.turn.attacksLeft <= 0 && !u.turn.action) return toast("ใช้ Action ไปแล้ว");
    const sel = P.attackSel;
    await act((s, a) => weaponAttack(s, a, s.units[t.id], idx));
    P.attackSel = sel; return;
  }
  if (t && t.id !== u.id) { P.inspect = t.id; renderSide(); return; }
  if (!t) {
    const reach = reachableCells(st, u);
    if (!(c.x + "," + c.y in reach)) return toast("เดินไม่ถึง (เหลือ " + (u.turn.move - u.turn.moved) + " ฟุต)");
    const path = findPath(st, u, c, { maxCost: u.turn.move - u.turn.moved });
    if (!path) return;
    await act((s, a) => { moveAlong(s, a, path); checkOver(s); });
  }
}
function bestWeapon(u, t) {
  const r = dist(u, t); let best = -1, bv = -1;
  u.attacks.forEach((a, i) => { const ok = (a.melee && r <= a.reach) || (a.range && r <= a.range[1]); if (!ok) return; const v = a.hit * 2 + (parseInt(a.dmg) || 1) * 3 + (a.melee && r <= a.reach ? 2 : 0); if (v > bv) { bv = v; best = i; } });
  return best;
}
async function castNow(extra) {
  const sel = P.spellSel; if (!sel) return;
  P.mode = "move";
  await act((s, a) => castSpell(s, a, sel.id, { slot: sel.slot, useMI: sel.useMI, targets: sel.targets || [], ...extra }));
}
function pickSpell(id, slot, useMI) {
  const need = spellNeed(id);
  if (need.kind === "narr") { toast("เวทนี้ใช้แบบเล่าเรื่อง: พิมพ์บอก DM ในช่องแชต"); return; }
  P.spellSel = { id, slot, useMI, targets: [] }; P.mode = "spell";
  if (need.kind === "self") { castNow({}); return; }
  renderBar(); drawStage();
}
async function drinkPotion() {
  const st = combatState(); const u = current(st); const p = P.party[u.cardId];
  const inv = clone(p.card.inventory || []); const e = inv.find((x) => x.id === "potion-healing" && x.qty > 0);
  if (!e) return toast("ไม่มี Potion of Healing");
  if (!u.turn.bonus) return toast("ใช้ Bonus Action ไปแล้ว");
  u.turn.bonus = 0; const r = roll("2d4+2"); heal(st, u, r.total); log(st, u.name + " ดื่ม Potion of Healing ฟื้น " + r.text, { kind: "heal" });
  e.qty--; if (!e.qty) inv.splice(inv.indexOf(e), 1);
  await commitCombat(st);
  await writeParty(u.cardId, { card: { ...p.card, inventory: inv } });
}

// ---------- homebrew: Controlled Chaos potions ----------
function chaosBar(u, T) {
  const p = P.party[u.cardId]; if (!p || !homebrewOn()) return [];
  const bottles = chaosBottles(p.card); if (!bottles.length) return [];
  const sel = h("select", { "aria-label": "เลือกยาปรุง" }, bottles.map((x) => h("option", { value: x.id, selected: P.chaosSel === x.id }, iname(x.id) + " ×" + x.qty)));
  return [h("span", { class: "row", style: "gap:6px" }, sel,
    h("button", { class: "btn small" + (P.mode === "chaos" ? " primary" : ""), disabled: !T.action, onclick: () => {
      if (P.mode === "chaos") { P.mode = "move"; P.chaosSel = null; } else { P.mode = "chaos"; P.chaosSel = sel.value; toast("แตะตัวเองเพื่อดื่ม หรือแตะเพื่อนที่ยืนติดเพื่อป้อน"); }
      renderBar(); } }, P.mode === "chaos" ? "ยกเลิกยาปรุง" : "🧪 ยาปรุง (Action)"))];
}
async function useChaos(targetId, itemId) {
  const st = combatState(); const u = current(st); const p = P.party[u.cardId];
  const inv = clone(p.card.inventory || []); const e = inv.find((x) => x.id === itemId && x.qty > 0);
  if (!e) return toast("ไม่มียาขวดนี้แล้ว");
  const res = chaosPotion(st, u, st.units[targetId], itemId);
  if (res.error) return toast(res.error);
  e.qty--; if (!e.qty) inv.splice(inv.indexOf(e), 1);
  await commitCombat(st);
  await writeParty(u.cardId, { card: { ...P.party[u.cardId].card, inventory: inv } });
  toast("🎲 d6 = " + res.die + " → ผล " + res.side + ": " + res.txt);
}
function brewBox(p) {
  const bottles = chaosBottles(p.card);
  const brewer = canBrew(p);
  if (!brewer && !bottles.length) return null;
  const inCombat = P.scene.mode === "combat";
  const left = p.live.brewsLeft ?? 2;
  const recipeSel = h("select", { "aria-label": "สูตรยา" }, CHAOS_IDS.map((id) => h("option", { value: id }, iname(id))));
  return h("div", { class: "brew" },
    brewer && h("div", { class: "row", style: "gap:6px" }, h("span", { class: "small" }, "⚗️ ปรุงยา (เหลือ " + left + "/2 ขวด)"), recipeSel,
      h("button", { class: "btn tiny", disabled: inCombat || left <= 0, onclick: async () => {
        const cur = P.party[p.cardId]; const inv = clone(cur.card.inventory || []); const id = recipeSel.value;
        const ex = inv.find((x) => x.id === id); if (ex) ex.qty++; else inv.push({ id, qty: 1, equipped: false });
        await writeParty(p.cardId, { card: { ...cur.card, inventory: inv }, live: { ...cur.live, brewsLeft: left - 1 } });
        await say("system", "⚗️ " + cur.card.name + " ปรุง " + iname(id) + " สำเร็จ (ผลจะสุ่ม A/B ตอนดื่ม)");
      } }, "ปรุง")),
    bottles.map((x) => h("div", { class: "row small", style: "gap:6px" }, "🧪 " + iname(x.id) + " ×" + x.qty,
      h("button", { class: "btn tiny ghost", title: "ดูผล", onclick: () => { const r = chaosRecipe(x.id); toast("ผล A: " + r.A.txt.replace("ELEMENT", r.element || "") + " · ผล B: " + r.B.txt.replace("ELEMENT", r.element || "")); } }, "ดูผล"),
      !inCombat && h("button", { class: "btn tiny", onclick: () => drinkChaosOutside(p.cardId, x.id) }, "ดื่มตอนนี้"))),
    brewer && h("div", { class: "small muted" }, "Homebrew: Controlled Chaos Potion V2.1 · ในการต่อสู้ใช้ปุ่ม 🧪 ยาปรุง (ดื่มเองหรือป้อนเพื่อนที่ยืนติด)"));
}
// outside combat only the instant parts matter: healing, temp HP, and the one-shot ability check bonus
async function drinkChaosOutside(cardId, itemId) {
  const p = P.party[cardId]; const r = chaosRecipe(itemId); if (!p || !r) return;
  const die = d(6); const side = die <= 3 ? "A" : "B"; const fx = r[side];
  const sh = computeSheet(p.card, D); const live = { ...p.live }; let extra = "";
  if (fx.heal) { const hh = roll(fx.heal); live.hp = Math.min(sh.hpMax, (live.hp ?? sh.hpMax) + hh.total); extra += " ฟื้น " + hh.text; }
  if (fx.temp) live.tempHp = Math.max(live.tempHp || 0, fx.temp);
  if (fx.oneShot === "check") live.checkBonus = true;
  const inv = clone(p.card.inventory); const e = inv.find((x) => x.id === itemId); e.qty--; if (!e.qty) inv.splice(inv.indexOf(e), 1);
  await writeParty(cardId, { card: { ...p.card, inventory: inv }, live });
  await say("system", "🧪 " + p.card.name + " ดื่ม " + iname(itemId) + " · 🎲 d6 = " + die + " → ผล " + side + ": " + fx.txt.replace("ELEMENT", r.element || "") + extra + (fx.oneShot === "check" ? " (ใช้กับการทอยทักษะครั้งถัดไป)" : ""));
  requestDM({ event: p.card.name + " ดื่มยาปรุง " + r.name + " ได้ผล " + side + " (" + fx.txt.replace("ELEMENT", r.element || "") + ")" });
}

// ---------- action bar ----------
function renderBar() {
  const bar = P.dom.bar; const sc = P.scene;
  const parts = [];
  if (P.mapEdit) { bar.replaceChildren(h("span", { class: "small muted" }, "โหมดตั้งค่า Map: คลิกหรือลากบนกระดานเพื่อวาด")); return; }
  if (sc.mode === "world") {
    const l = P.worldSel && locInfo(P.worldSel);
    parts.push(h("span", { class: "small" }, l ? l.name + " · " + l.th + (l.level ? " · Lv " + l.level : "") + ((P.meta.done || {})[l.id] ? " · ✓ จบแล้ว" : "") : "แตะหมุดบนแผนที่เพื่อเลือกที่หมาย"));
    if (l) parts.push(h("button", { class: "btn primary", onclick: () => { P.worldSel = null; travelTo(l.id); } }, "เดินทางไป " + l.name));
    if (sc.loc !== CAMP.town.id && CAMP.maps[sc.loc]) parts.push(h("button", { class: "btn", onclick: () => writeScene({ mode: "explore" }) }, "กลับเข้า " + locInfo(sc.loc).name));
  } else if (sc.mode === "explore") {
    const def = mapDef(sc.loc); const me = myMember();
    parts.push(h("span", { class: "small muted" }, me ? "แตะช่องบนกระดานเพื่อเดิน · แตะหีบ ✦ เพื่อสำรวจ" : "เข้าร่วมทีมก่อน"));
    if (sc.lastCombat && sc.lastCombat.result === "win" && P.dismissed !== sc.lastCombat.enc + sc.rev) parts.push(h("span", { class: "tag ok" }, "🏆 ชนะ " + sc.lastCombat.enc + " +" + sc.lastCombat.xp + " EXP"));
    parts.push(h("button", { class: "btn", onclick: () => restParty("short") }, "☕ พักสั้น"));
    if (def && def.next && (P.meta.done || {})[def.id]) parts.push(h("button", { class: "btn primary", onclick: () => travelTo(def.next) }, "ขึ้นไปต่อ: " + locInfo(def.next).name));
    parts.push(h("button", { class: "btn", onclick: () => writeScene({ mode: "world" }) }, "🗺 แผนที่โลก"));
  } else if (sc.mode === "combat") {
    const st = combatState(); if (!st) return bar.replaceChildren();
    const u = current(st);
    parts.push(h("div", { class: "init-strip" }, st.order.map((id) => st.units[id]).filter((x) => x && !(x.kind === "monster" && x.hp <= 0)).map((x) =>
      h("span", { class: "init-chip " + x.side + (u && x.id === u.id ? " now" : "") + (x.dead || x.hp <= 0 ? " down" : ""), title: x.name }, x.name.replace(/ \(.*\)/, "").split(" ")[0] + " " + x.init))));
    if (st.over) parts.push(h("b", null, st.over === "win" ? "🏆 ชนะ! กำลังสรุปผล…" : "💀 แพ้… กำลังสรุปผล"));
    else if (u && u.side === "pc" && canControl(u)) parts.push(...myTurnBar(st, u));
    else if (u) {
      parts.push(h("span", { class: "small" }, u.side === "foe" ? "ตาของ " + u.name + "…" : "รอ " + u.name + " เล่น"));
      if (isHost() && u.side === "pc") parts.push(h("button", { class: "btn ghost small", onclick: async () => { const s2 = combatState(); log(s2, u.name + " ข้ามตา"); finishTurn(s2); await commitCombat(s2); } }, "ข้ามตานี้"));
    }
  }
  bar.replaceChildren(...parts);
  bar.hidden = !parts.length;
}
function myTurnBar(st, u) {
  const T = u.turn || {}; const out = [];
  const pip = (on, l) => h("span", { class: "pip" + (on ? " on" : "") }, l);
  out.push(h("div", { class: "row turn-info" }, h("b", null, "ตาของ " + u.name), pip(T.action || T.attacksLeft > 0, "Action" + (T.attacksLeft > 0 ? " (ตีอีก " + T.attacksLeft + ")" : "")), pip(T.bonus, "Bonus"), pip(!u.reactionUsed, "Reaction"),
    h("span", { class: "pip on num" }, "เดิน " + Math.max(0, T.move - T.moved) + " ft"), h("span", { class: "num small" }, "HP " + u.hp + "/" + u.maxHp + (u.tempHp ? " +" + u.tempHp : "") + " · AC " + u.ac)));
  if (u.hp <= 0) { out.push(h("span", { class: "small" }, "หมดสติ: ทอย Death Save อัตโนมัติ"), h("button", { class: "btn primary", onclick: () => act((s) => finishTurn(s)) }, "จบตา")); return out; }
  out.push(h("div", { class: "row" }, h("span", { class: "eyebrow" }, "โจมตี"), u.attacks.map((a, i) => h("button", { class: "chip", "aria-pressed": P.attackSel === i && P.mode === "move" ? "true" : "false",
    onclick: () => { P.attackSel = P.attackSel === i ? null : i; P.mode = "move"; P.spellSel = null; renderBar(); drawStage(); } }, a.name + " " + fmt(a.hit) + " · " + a.dmg)),
    h("span", { class: "small muted" }, P.attackSel != null ? "แตะศัตรูเพื่อตี" : "แตะศัตรู = ตีด้วยอาวุธที่ดีที่สุด")));
  const spells = [...u.cantrips.map((id) => ({ id, lv: 0 })), ...u.spells.map((id) => ({ id, lv: (st.spellIndex[id] || {}).level || 1 }))].filter((s) => SPELLFX[s.id] && SPELLFX[s.id].t !== "util");
  if (spells.length) {
    const slotSel = h("select", { id: "slot-sel", "aria-label": "ช่องเวท" });
    const spSel = h("select", { id: "spell-sel", "aria-label": "เลือกเวท", onchange: () => fillSlots() }, h("option", { value: "" }, "เลือกเวท…"),
      spells.map((s) => h("option", { value: s.id, selected: P.spellSel && P.spellSel.id === s.id }, (st.spellIndex[s.id] || { name: s.id }).name + (s.lv ? " (Lv" + s.lv + ")" : " (cantrip)"))));
    const fillSlots = () => {
      const id = spSel.value; const lv = id ? (st.spellIndex[id] || {}).level || 0 : 0;
      const opts = [];
      if (lv > 0) {
        for (let l = lv; l <= (u.slots || []).length; l++) if (slotsLeft(u, l) > 0) opts.push(h("option", { value: "s" + l }, "ช่อง Lv" + l + " (เหลือ " + slotsLeft(u, l) + ")"));
        if (u.mi && !u.miUsed && lv === 1) opts.push(h("option", { value: "mi" }, "Magic Initiate (ฟรีวันละครั้ง)"));
        if (!opts.length) opts.push(h("option", { value: "" }, "ช่องเวทหมด"));
      } else opts.push(h("option", { value: "c" }, "ไม่ใช้ช่อง"));
      slotSel.replaceChildren(...opts);
    };
    fillSlots();
    out.push(h("div", { class: "row" }, h("span", { class: "eyebrow" }, "เวท"), spSel, slotSel,
      h("button", { class: "btn", onclick: () => { const id = spSel.value; if (!id) return toast("เลือกเวทก่อน"); const v = slotSel.value; if (v === "") return toast("ช่องเวทหมด"); pickSpell(id, v[0] === "s" ? +v.slice(1) : undefined, v === "mi"); } }, "ร่าย"),
      P.mode === "spell" && P.spellSel && spellHint(P.spellSel),
      P.mode === "spell" && P.spellSel && (P.spellSel.targets || []).length > 0 && h("button", { class: "btn primary", onclick: () => castNow({}) }, "ร่ายใส่ " + P.spellSel.targets.length + " เป้า"),
      P.mode === "spell" && h("button", { class: "btn ghost", onclick: () => { P.mode = "move"; P.spellSel = null; renderBar(); drawStage(); } }, "ยกเลิก")));
  }
  const res = u.resources || {};
  const hasPotion = ((P.party[u.cardId] || {}).card || { inventory: [] }).inventory.some((x) => x.id === "potion-healing" && x.qty > 0);
  out.push(h("div", { class: "row" },
    h("button", { class: "btn small", disabled: !T.action, onclick: () => act(doDash) }, "Dash"),
    h("button", { class: "btn small", disabled: !T.action, onclick: () => act(doDodge) }, "Dodge"),
    h("button", { class: "btn small", disabled: !T.action, onclick: () => act((s, a) => doDisengage(s, a)) }, "Disengage"),
    h("button", { class: "btn small" + (P.mode === "help" ? " primary" : ""), disabled: !T.action, onclick: () => { P.mode = P.mode === "help" ? "move" : "help"; renderBar(); toast("แตะเพื่อนที่ยืนติดคุณ"); } }, "Help"),
    res.secondWind && h("button", { class: "btn small", disabled: !T.bonus || res.secondWind.used >= res.secondWind.max, onclick: () => act(secondWind) }, "Second Wind"),
    res.actionSurge && h("button", { class: "btn small", disabled: res.actionSurge.used >= res.actionSurge.max, onclick: () => act(actionSurge) }, "Action Surge"),
    u.features.includes("Cunning Action") && h("button", { class: "btn small", disabled: !T.bonus, onclick: () => act((s, a) => doDisengage(s, a, true)) }, "Disengage (Bonus)"),
    u.attacks.filter((a) => a.light && a.melee).length >= 2 && h("button", { class: "btn small" + (P.mode === "offhand" ? " primary" : ""), onclick: () => { P.mode = P.mode === "offhand" ? "move" : "offhand"; renderBar(); toast("แตะศัตรูเพื่อตีมือรอง"); } }, "ตีมือรอง"),
    u.spiritualWeapon && u.effects.some((e) => e.spiritual) && h("button", { class: "btn small" + (P.mode === "spiritual" ? " primary" : ""), disabled: !T.bonus, onclick: () => { P.mode = P.mode === "spiritual" ? "move" : "spiritual"; renderBar(); } }, "Spiritual Weapon"),
    hasCond(u, "Prone") && h("button", { class: "btn small", onclick: () => act(standUp) }, "ลุกขึ้น"),
    hasPotion && h("button", { class: "btn small", disabled: !T.bonus, onclick: drinkPotion }, "🧪 ดื่มยา"),
    ...chaosBar(u, T),
    h("button", { class: "btn primary", onclick: () => { P.mode = "move"; P.attackSel = null; act((s) => finishTurn(s)); } }, "จบตา ⏎")));
  return out;
}
function spellHint(sel) {
  const need = spellNeed(sel.id);
  const t = need.kind === "units" ? (need.ally ? "แตะเพื่อน" : "แตะศัตรู") + (need.n > 1 ? " สูงสุด " + need.n + " เป้า" : "") : need.kind === "dir" ? "แตะทิศทางที่จะปล่อยเวท" : "แตะจุดที่จะร่าย";
  return h("span", { class: "small", style: "color:var(--gold)" }, t + (need.range ? " (ระยะ " + need.range + " ft)" : ""));
}
function renderTicker() {
  const st = P.scene.mode === "combat" ? combatState() : null;
  const lines = st ? st.log.slice(-3).map((l) => l.text) : [];
  P.dom.ticker.replaceChildren(...lines.map((t) => h("div", null, t)));
  P.dom.ticker.hidden = !lines.length;
}

// ---------- side panel ----------
function renderSide() {
  const tabs = [["dm", "DM"], ["party", "ทีม"], ["log", "บันทึก"]];
  P.dom.sideTabs.replaceChildren(...tabs.map(([k, l]) => h("button", { class: "tab", role: "tab", "aria-selected": P.panel === k ? "true" : "false", "aria-current": P.panel === k ? "true" : "false", onclick: () => { P.panel = k; renderSide(); } }, l)));
  P.dom.chatForm.hidden = P.panel !== "dm";
  const body = P.panel === "party" ? partyPanel() : P.panel === "log" ? logPanel() : chatPanel();
  const atBottom = P.dom.sideBody.scrollHeight - P.dom.sideBody.scrollTop - P.dom.sideBody.clientHeight < 60;
  P.dom.sideBody.replaceChildren(body);
  if (P.panel !== "party" && (atBottom || P.lastPanel !== P.panel)) P.dom.sideBody.scrollTop = P.dom.sideBody.scrollHeight;
  P.lastPanel = P.panel;
}
function chatPanel() {
  const lastDm = [...P.chat].reverse().find((m) => m.kind === "dm");
  return h("div", { class: "chat" }, P.chat.map((m) => h("div", { class: "msg " + m.kind + (m.dmEvent ? " event" : "") },
    m.kind !== "system" && h("div", { class: "who" }, m.kind === "dm" ? "DM" : m.who || "ผู้เล่น"),
    h("div", { class: "txt" }, m.text),
    m.kind === "dm" && m === lastDm && (m.options || []).length > 0 && h("div", { class: "chips" }, m.options.map((o) => h("button", { class: "chip", onclick: () => sendChat(o) }, o))),
    m.kind === "dm" && h("button", { class: "btn ghost tiny", "aria-label": "อ่านออกเสียง", onclick: () => speak(m.text) }, "🔊"))),
    !P.chat.length && h("div", { class: "muted small" }, "ยังไม่มีข้อความ"),
    NET.local && h("div", { class: "small muted" }, "DM (Claude) เล่าเรื่องได้เมื่อเปิดผ่านลิงก์ claude.ai"),
    dmRunning && h("div", { class: "small muted" }, "DM กำลังคิด…"));
}
function partyPanel() {
  const st = P.scene.mode === "combat" ? combatState() : null;
  const insp = st && P.inspect && st.units[P.inspect];
  return h("div", { class: "party" },
    insp && insp.side === "foe" && h("div", { class: "panel mon-card" }, h("div", { class: "row", style: "justify-content:space-between" }, h("b", null, insp.name), h("button", { class: "btn ghost tiny", onclick: () => { P.inspect = null; renderSide(); } }, "✕")),
      h("div", { class: "small num" }, "HP " + (insp.hp / insp.maxHp > 0.5 ? "ยังดี" : insp.hp / insp.maxHp > 0.25 ? "บาดเจ็บ" : "ใกล้ตาย") + " · AC " + insp.ac + " · Speed " + insp.speed + " ft · CR " + insp.cr),
      insp.conditions.length > 0 && h("div", { class: "small" }, "สภาพ: " + insp.conditions.join(", ")),
      h("div", { class: "small muted" }, (MON[insp.monId].actions || []).map((a) => a.name).join(" · "))),
    Object.values(P.party).map((p) => {
      const sh = computeSheet(p.card, D); const u = st && st.units["pc-" + p.cardId];
      const hp = u ? u.hp : p.live.hp; const mine = NET.local || p.uid === myUid();
      const online = NET.local || Date.now() - (p.seen || 0) < 150000;
      const canLv = sh.xpNext && p.card.xp >= sh.xpNext;
      return h("div", { class: "member" + (p.cardId === P.myCardId ? " me" : "") }, portraitEl(p.card),
        h("div", { style: "min-width:0;flex:1" },
          h("div", { class: "row", style: "gap:6px" }, h("b", null, p.card.name), h("span", { class: "dot" + (online ? " on" : ""), title: online ? "ออนไลน์" : "ไม่อยู่" }), p.uid === P.meta.hostUid && h("span", { class: "tag" }, "host")),
          h("div", { class: "small muted" }, classLine(p.card) + " · Lv " + p.card.level),
          h("div", { class: "hpbar" }, h("i", { style: "width:" + Math.max(0, Math.min(100, (hp / sh.hpMax) * 100)) + "%" })),
          h("div", { class: "small num" }, (p.live.dead || (u && u.dead) ? "💀 เสียชีวิต · " : "") + "HP " + hp + "/" + sh.hpMax + " · AC " + sh.ac + " · " + fmtGp(p.card.gp || 0) + " · " + p.card.xp + " EXP"),
          canLv && h("div", { class: "small", style: "color:var(--gold)" }, "EXP ครบ เลเวลอัปได้! ไปเลเวลอัปที่ชีตตัวละคร แล้วกด “อัปเดตการ์ด”"),
          mine && brewBox(p),
          mine && h("div", { class: "row", style: "gap:6px;margin-top:4px" },
            NET.local && p.cardId !== P.myCardId && h("button", { class: "btn tiny", onclick: () => { P.myCardId = p.cardId; renderPlay(); } }, "คุมตัวนี้"),
            h("button", { class: "btn tiny", disabled: P.scene.mode === "combat", onclick: () => refreshCardFromShelf(p.cardId) }, "อัปเดตการ์ดจากชั้นของฉัน"),
            h("button", { class: "btn tiny ghost", disabled: P.scene.mode === "combat", onclick: async () => { await dbx().doc("campaigns/" + P.cid + "/party/" + p.cardId).delete(); if (P.myCardId === p.cardId) P.myCardId = null; say("system", p.card.name + " ออกจากทีม"); } }, "ออกจากทีม"))));
    }),
    myParty().length > 0 && NET.local && h("button", { class: "btn small", onclick: () => { P.forceJoin = true; renderPlay(); } }, "+ เพิ่มตัวละคร"),
    isHost() && h("label", { class: "row small", style: "gap:6px" }, h("input", { type: "checkbox", checked: homebrewOn(), onchange: (e) => writeMeta({ homebrew: e.target.checked }) }), "อนุญาต Homebrew ในห้องนี้ (เช่น ระบบปรุงยาของ Fizz)"),
    !NET.local && myParty().length === 0 && h("p", { class: "small muted" }, "เลือกการ์ดบนกระดานเพื่อเข้าร่วม"));
}
function logPanel() {
  const st = P.scene.combat ? combatState() : null;
  const lines = st ? st.log.slice(-80) : [];
  return h("div", { class: "log" }, lines.length ? lines.map((l) => h("div", { class: "logl " + (l.kind || "") }, l.text)) : h("div", { class: "muted small" }, "บันทึกการต่อสู้จะขึ้นตรงนี้"));
}

// ---------- map editor (host) ----------
function startEdit(id) {
  if (id === "world") { P.mapEdit = { id: "world", bg: (P.maps.world || {}).bg || "" }; renderPlay(); return; }
  const def = mapDef(id); if (!def || !def.rows) return;
  P.mapEdit = { id, rows: def.rows.slice(), enc: clone(def.encounters || {}), bg: def.bg || "", tool: "#", letter: Object.keys(def.encounters || {})[0] || "a" };
  renderPlay();
}
function paintCell(c) {
  const m = P.mapEdit; if (!m || !m.rows) return;
  const t = m.tool === "enc" ? m.letter : m.tool;
  const row = m.rows[c.y]; if (row[c.x] === t) return;
  if (t === "S" || t === "B") m.rows = m.rows.map((r) => r.replaceAll(t, "."));
  const r2 = m.rows[c.y];
  m.rows[c.y] = r2.slice(0, c.x) + t + r2.slice(c.x + 1);
}
function editorPanel() {
  const m = P.mapEdit;
  const bgIn = h("input", { type: "file", accept: "image/*", hidden: true, id: "bg-in", onchange: (e) => loadBg(e.target.files[0]) });
  const common = h("div", { class: "row" }, h("label", { class: "btn small", for: "bg-in" }, "อัปโหลดรูปพื้นหลัง…"), bgIn,
    m.bg && h("button", { class: "btn small ghost", onclick: () => { m.bg = ""; renderPlay(); } }, "เอารูปออก"),
    h("label", { class: "btn small", for: "multi-in" }, "นำเข้ารูปหลายไฟล์…"),
    h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, id: "multi-in", onchange: (e) => importImages([...e.target.files]) }),
    h("span", { class: "small muted" }, "ใช้รูปแผนที่จาก Lost Atlas หรือรูปที่เจนเองได้ ระบบยืดรูปให้พอดีกระดาน"));
  const save = h("div", { class: "row" },
    h("button", { class: "btn primary", onclick: saveEdit }, "บันทึก Map"),
    h("button", { class: "btn", onclick: () => { P.mapEdit = null; renderPlay(); } }, "ยกเลิก"),
    h("button", { class: "btn ghost", onclick: async () => { await dbx().doc("campaigns/" + P.cid + "/maps/" + m.id).delete(); P.mapEdit = null; toast("คืนค่า Map เดิมแล้ว"); } }, "คืนค่าเริ่มต้น"));
  if (m.id === "world") return h("div", { class: "panel ov-panel editor" }, h("h3", null, "ตั้งค่าแผนที่โลก"), common, save);
  const letters = "abcdefgh".split("");
  const enc = m.enc[m.letter] || { th: "การต่อสู้ " + m.letter, monsters: [] };
  const monSel = h("select", { id: "mon-add", "aria-label": "มอนสเตอร์" }, D.monsters.map((x) => h("option", { value: x.id }, "CR " + x.crText + " · " + x.name)));
  const tierSel = h("select", { id: "tier-add", "aria-label": "ระดับ" }, [["normal", "ปกติ"], ["subboss", "Sub Boss"], ["boss", "Boss"]].map(([v, l]) => h("option", { value: v }, l)));
  const setEnc = (fn) => { const e = clone(enc); fn(e); m.enc[m.letter] = e; renderOverlay(); };
  const xp = encounterXP(enc.monsters.map(([id, tier]) => ({ id, tier })), D);
  const lv = Object.values(P.party).map((p) => p.card.level);
  return h("div", { class: "panel ov-panel editor" },
    h("div", { class: "row", style: "justify-content:space-between" }, h("h3", null, "ตั้งค่า Map: " + locInfo(m.id).name), save),
    h("div", { class: "chips" }, EDIT_TOOLS.map(([t, l]) => h("button", { class: "chip", "aria-pressed": m.tool === t ? "true" : "false", onclick: () => { m.tool = t; renderOverlay(); } }, (t === "." ? "·" : t) + " " + l)),
      h("button", { class: "chip", "aria-pressed": m.tool === "enc" ? "true" : "false", onclick: () => { m.tool = "enc"; renderOverlay(); } }, "จุดศัตรู " + m.letter)),
    common,
    h("div", { class: "row" }, h("span", { class: "eyebrow" }, "กลุ่มศัตรู"), letters.map((L) => h("button", { class: "chip", "aria-pressed": m.letter === L ? "true" : "false", onclick: () => { m.letter = L; m.tool = "enc"; renderOverlay(); } }, L + (m.enc[L] ? " ●" : "")))),
    h("div", { class: "row" }, h("label", { class: "fld", style: "flex:1;min-width:180px" }, "ชื่อการต่อสู้", h("input", { type: "text", value: enc.th, onchange: (e) => setEnc((x) => (x.th = e.target.value)) })),
      h("label", { class: "row small" }, h("input", { type: "checkbox", checked: !!enc.boss, onchange: (e) => setEnc((x) => (x.boss = e.target.checked)) }), "เป็นห้องบอส (ชนะแล้วจบดันเจี้ยน)")),
    h("div", { class: "tbl" }, h("table", null, h("tbody", null, enc.monsters.map(([id, tier, minP], i) => h("tr", null,
      h("td", null, (MON[id] || { name: id }).name), h("td", null, tier === "boss" ? "Boss" : tier === "subboss" ? "Sub Boss" : "ปกติ"),
      h("td", { class: "small muted" }, minP ? "มาเมื่อทีม ≥ " + minP + " คน" : "มาเสมอ"),
      h("td", null, h("button", { class: "btn tiny ghost", onclick: () => setEnc((x) => x.monsters.splice(i, 1)) }, "ลบ"))))))),
    h("div", { class: "row" }, monSel, tierSel, h("button", { class: "btn small", onclick: () => setEnc((x) => x.monsters.push([monSel.value, tierSel.value])) }, "+ เพิ่ม")),
    h("div", { class: "small muted" }, "ช่องที่วาดตัว " + m.letter + " บนกระดาน = ตำแหน่งเกิดของศัตรูตามลำดับ (บอสเกิดที่ช่อง B) · ความยาก: " + (lv.length ? difficulty(xp, lv) : "-") + " (" + xp + " XP)"));
}
async function loadBg(file) {
  if (!file) return;
  const im = new Image(); const url = URL.createObjectURL(file);
  im.onload = async () => {
    const max = 1600; const k = Math.min(1, max / Math.max(im.width, im.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
    cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
    const assets = await useAssets();
    if (assets) {
      try { const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.85)); const res = await assets.upload(blob); P.mapEdit.bg = res.url; renderPlay(); toast("อัปโหลดรูปแล้ว"); return; } catch (e) { /* fall back to inline */ }
    }
    let q = 0.75, data = cv.toDataURL("image/jpeg", q);
    while (data.length > 700000 && q > 0.35) { q -= 0.1; data = cv.toDataURL("image/jpeg", q); }
    P.mapEdit.bg = data; renderPlay();
  };
  im.onerror = () => toast("เปิดรูปนี้ไม่ได้");
  im.src = url;
}
// image files named like gen-images.html makes them: token-<monster id>.png, map-<map id>.png, map-world.png
function shrink(file, max, q) {
  return new Promise((ok, no) => {
    const im = new Image(); const url = URL.createObjectURL(file);
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const cv = document.createElement("canvas"); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); ok(cv); };
    im.onerror = no; im.src = url;
  });
}
async function importImages(list) {
  const tokens = { ...(P.maps.tokens || {}) }; let nTok = 0, nMap = 0; const skipped = [];
  const assets = await useAssets();
  for (const f of list) {
    const base = f.name.replace(/\.[a-z]+$/i, "").toLowerCase();
    try {
      if (base.startsWith("token-") && MON[base.slice(6)]) {
        const cv = await shrink(f, 160); tokens[base.slice(6)] = cv.toDataURL("image/jpeg", 0.85); nTok++;
      } else if (base.startsWith("map-") && (base.slice(4) === "world" || CAMP.maps[base.slice(4)])) {
        const id = base.slice(4); const cv = await shrink(f, 1600); let url = null;
        if (assets) { try { const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.85)); url = (await assets.upload(blob)).url; } catch (e) {} }
        if (!url) { let q = 0.75; url = cv.toDataURL("image/jpeg", q); while (url.length > 700000 && q > 0.35) { q -= 0.1; url = cv.toDataURL("image/jpeg", q); } }
        const cur = P.maps[id] || {};
        await dbx().doc("campaigns/" + P.cid + "/maps/" + id).set({ ...cur, bg: url });
        if (P.mapEdit && P.mapEdit.id === id) P.mapEdit.bg = url;
        nMap++;
      } else skipped.push(f.name);
    } catch (e) { skipped.push(f.name); }
  }
  if (nTok) await dbx().doc("campaigns/" + P.cid + "/maps/tokens").set(tokens);
  toast("นำเข้าแล้ว: โทเคน " + nTok + " · แผนที่ " + nMap + (skipped.length ? " · ข้าม " + skipped.length + " ไฟล์ (ชื่อไม่ตรง)" : ""));
  renderPlay();
}
async function saveEdit() {
  const m = P.mapEdit;
  const doc = m.id === "world" ? { bg: m.bg } : { rows: m.rows, encounters: m.enc, bg: m.bg };
  if (m.rows && !m.rows.some((r) => r.includes("S"))) return toast("ต้องมีจุดเริ่ม S อย่างน้อย 1 ช่อง");
  try { await dbx().doc("campaigns/" + P.cid + "/maps/" + m.id).set(doc); P.mapEdit = null; toast("บันทึก Map แล้ว"); renderPlay(); }
  catch (e) { toast(e && e.code === "quota_exceeded" ? "รูปใหญ่เกินไป ลองรูปที่เล็กลง" : "บันทึกไม่สำเร็จ"); }
}

// ---------- boot ----------
render();
initStore();
