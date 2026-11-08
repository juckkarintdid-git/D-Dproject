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
// ---------- home: welcome art, continue, my hero, rooms ----------
const agoTh = (ts) => { const m = Math.round((Date.now() - (ts || 0)) / 60000); return m < 2 ? "เมื่อสักครู่" : m < 60 ? m + " นาทีที่แล้ว" : m < 1440 ? Math.round(m / 60) + " ชม.ที่แล้ว" : Math.round(m / 1440) + " วันที่แล้ว"; };
// who is online in each room (party docs refresh "seen" every minute while someone plays)
function watchRoomOnline(list) {
  S.online = S.online || {}; S.onlineWatch = S.onlineWatch || {};
  for (const c of list.slice(0, 8)) {
    if (S.onlineWatch[c.id]) continue;
    S.onlineWatch[c.id] = dbx().collection("campaigns/" + c.id + "/party").onSnapshot((snap) => {
      const docs = snap.docs.map((d) => d.data());
      const on = docs.filter((d) => Date.now() - (d.seen || 0) < 180000).map((d) => d.card && d.card.name).filter(Boolean);
      const key = on.join("|") + "/" + docs.length;
      if ((S.online[c.id] || {}).key === key) return;
      S.online[c.id] = { key, on, n: docs.length, faces: docs.slice(0, 4).map((d) => d.card || {}) };
      if (S.view === "play" && !P.cid) render();
    }, () => {});
  }
}
function viewLobby() {
  if (S.store === "loading") return h("div", { class: "empty" }, "กำลังเชื่อมต่อ…");
  watchCampaigns();
  const list = S.campaigns || [];
  watchRoomOnline(list);
  const last = list.find((c) => c.id === lsGet("dnd-last-room")) || list[0];
  const hero = mainCard();
  const nameIn = h("input", { type: "text", id: "camp-name", maxlength: 50, placeholder: "ชื่อห้อง เช่น ปาร์ตี้วันเสาร์", value: "" });
  const create = async () => { const id = await createCampaign(nameIn.value.trim()); openCampaign(id); };
  const ready = S.cards.filter((c) => !validate(c, D).length);
  const summary = String(CAMP.summary || "").split(/(?<=[.!?…])\s|\n/)[0];
  return h("div", { class: "home" },
    h("section", { class: "home-hero", "aria-label": "ยินดีต้อนรับ" },
      h("div", { class: "home-hero-in" },
        h("div", { class: "eyebrow" }, "ยินดีต้อนรับสู่"),
        h("h1", null, CAMP.name),
        h("div", { class: "home-th" }, CAMP.th),
        h("p", null, summary),
        h("div", { class: "row" },
          last ? h("button", { class: "btn primary big", onclick: () => openCampaign(last.id) }, "▶ เล่นต่อ · " + last.name)
               : h("button", { class: "btn primary big", onclick: create }, "▶ เริ่มเล่น (สร้างห้องแรก)"),
          h("button", { class: "btn ghost-light", onclick: () => go("info") }, "วิธีเล่น")))),
    h("div", { class: "home-grid" },
      h("section", { class: "panel home-me", "aria-label": "ตัวที่จะใช้เล่น" },
        h("div", { class: "eyebrow" }, "ตัวที่จะใช้เล่น"),
        hero ? h("div", { class: "row home-hero-card" }, portraitEl(hero, true), h("div", { style: "min-width:0" }, h("h3", null, hero.name), h("div", { class: "small muted" }, classLine(hero)), h("span", { class: "tag num" }, "Lv " + hero.level)))
             : h("p", { class: "muted" }, "ยังไม่ได้เลือกตัวละคร เลือกตัวสำเร็จรูปด้านล่าง หรือสร้างเองในหน้าตัวละคร"),
        h("div", { class: "row" },
          h("button", { class: "btn small", "aria-expanded": S.pickMain ? "true" : "false", onclick: () => { S.pickMain = !S.pickMain; render(); } }, hero ? "เปลี่ยนตัว" : "เลือกตัว"),
          h("button", { class: "btn ghost small", onclick: () => go("shelf") }, "ไปหน้าตัวละคร")),
        (S.pickMain || !hero) && h("div", { class: "home-pick" },
          ready.map((c) => h("button", { class: "pick", "aria-pressed": hero && hero.id === c.id ? "true" : "false", onclick: () => { setMainCard(c.id); S.pickMain = false; render(); } },
            h("div", { class: "row" }, portraitEl(c), h("div", { style: "min-width:0" }, h("b", null, c.name), h("div", { class: "small muted" }, classLine(c) + " · Lv " + c.level))))),
          h("div", { class: "small muted", style: "margin-top:4px" }, "หรือหยิบตัวสำเร็จรูป"),
          PREMADES.filter((p) => !S.cards.some((c) => c.name === p.name)).map((p) => h("button", { class: "pick", onclick: () => { S.pickMain = false; adoptPremade(p, true); } },
            h("div", { class: "row" }, portraitEl(p), h("div", { style: "min-width:0" }, h("b", null, p.name), h("div", { class: "small muted" }, classLine(p)))))))),
      h("section", { class: "home-rooms", "aria-label": "ห้องเล่น" },
        h("div", { class: "shelf-head" }, h("div", null, h("div", { class: "eyebrow" }, "ห้องเล่น"), h("h2", null, "เข้าห้องเพื่อน หรือสร้างห้องใหม่")),
          h("div", { class: "row" }, nameIn, h("button", { class: "btn primary", onclick: create }, "+ สร้างห้อง"))),
        h("p", { class: "small muted", style: "margin:0 0 10px" }, NET.local ? "ตอนนี้เล่นแบบออฟไลน์ในเบราว์เซอร์นี้ (คุมทุกตัวจากเครื่องนี้) DM เล่าเรื่องได้เมื่อเปิดผ่านลิงก์ claude.ai" : "เพื่อนที่เปิดลิงก์เดียวกัน (สิทธิ์แก้ไขได้) จะเห็นห้องเหล่านี้ เข้าห้องแล้วจะเข้าทีมด้วยตัวที่เลือกไว้ทันที"),
        list.length ? h("div", { class: "room-list" }, list.map((c) => { const o = (S.online || {})[c.id] || { on: [], n: 0, faces: [] };
          return h("article", { class: "room" },
            h("div", { class: "room-faces", "aria-hidden": "true" }, o.faces.length ? o.faces.map((f) => portraitEl(f)) : h("div", { class: "portrait" }, "⚔")),
            h("div", { style: "min-width:0" }, h("h3", null, c.name),
              h("div", { class: "small muted" }, "เล่นล่าสุด " + agoTh(c.updated || c.createdAt) + " · จบดันเจียน " + Object.keys(c.done || {}).length + "/5"),
              h("div", null, o.on.length ? h("span", { class: "tag ok" }, "● ออนไลน์ " + o.on.length + " คน: " + o.on.join(", ")) : h("span", { class: "tag" }, "ในทีม " + o.n + " คน"),
                c.hostUid === myUid() && h("span", { class: "tag" }, "ห้องของฉัน"))),
            h("button", { class: "btn" + (last && last.id === c.id ? " primary" : ""), onclick: () => openCampaign(c.id) }, "เข้าห้อง")); }))
        : h("div", { class: "empty" }, "ยังไม่มีห้อง ตั้งชื่อแล้วกด “สร้างห้อง” ได้เลย"))));
}

// ---------- icons (inline SVG, stroke follows the text color) ----------
const SVG = {
  sword: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14.5 3.5 20.5 3.5 20.5 9.5 9 21 3 15Z"/><path d="M6 12 12 18M4 20l2-2"/></svg>',
  spell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>',
  potion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M9 2h6M10 2v6L5 17a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V2"/><path d="M7.5 14h9"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Z"/></svg>',
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="14" cy="4" r="2"/><path d="M8 21l3-6 3 2v5M6 11l3-3h5l3 4M11 15l2-6"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  end: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h12M13 6l6 6-6 6"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4ZM20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7Z"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2Z"/><path d="M9 4v14M15 6v14"/></svg>',
  voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M17 8a5 5 0 0 1 0 8"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 1.7V14M12 18h.01"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="M13 7l4 4"/></svg>',
  door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M14 3H6v18h8"/><path d="M11 12h10M18 9l3 3-3 3"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h5v-5h5v-5h6"/><path d="M15 4h5v5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H7M11 6l-6 6 6 6"/></svg>',
};
function fill(el, ...kids) { el.replaceChildren(...kids.flat(9).filter((k) => k != null && k !== false && k !== "")); }
function svg(name) { const s = document.createElement("span"); s.className = "svg"; s.setAttribute("aria-hidden", "true"); s.innerHTML = SVG[name] || ""; return s; }
const pct = (a, b) => Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100));
const shortName = (n) => String(n || "").replace(/ \(.*\)/, "");
const canControlCard = (p) => !!p && (NET.local || p.uid === myUid());
function face(src, name, cls) { src = src || premadePortrait({ name: String(name || "") }); return h("span", { class: cls, style: src ? "background-image:url(" + JSON.stringify(src) + ")" : null }, src ? "" : initials(shortName(name))); }
// built-in art ships in assets/; a host can still override a monster token from the map editor
const monImg = (id) => (id ? (P.maps.tokens && P.maps.tokens[id]) || "assets/token-" + id + ".webp" : "");
const unitImg = (u) => u.portrait || (u.side === "pc" ? premadePortrait({ name: u.name }) : monImg(u.monId)) || "";

// ---------- persistent game screen: canvas + HUD layers (typed text survives re-renders) ----------
function buildPlayDom() {
  const d = { cid: P.cid };
  const L = (cls) => h("div", { class: cls });
  d.canvas = h("canvas", { class: "g-scene", "aria-label": "กระดานเกม" });
  d.party = L("g-party"); d.plate = L("g-plate"); d.hint = L("g-hint"); d.menu = L("g-menu");
  d.ticker = h("div", { class: "g-ticker", "aria-live": "polite" });
  d.vote = L("g-vote"); d.spots = L("g-spots"); d.room = L("g-room"); d.tools = L("g-tools"); d.combat = L("g-combat");
  d.panel = L("g-panelwrap"); d.coach = L("g-coach");
  d.say = h("input", { type: "text", maxlength: 300, placeholder: "หรือพิมพ์เองว่าจะทำอะไร…", "aria-label": "บอก DM", onkeydown: (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); submitSay(); } } });
  d.sayForm = h("div", { class: "g-say" }, d.say, h("button", { class: "btn primary", onclick: submitSay }, "ส่ง"));
  d.improvIn = h("input", { type: "text", maxlength: 200, placeholder: "เช่น เตะโต๊ะใส่ก็อบลิน / ห้อยโคมระย้าแล้วกระโดดลง", "aria-label": "ท่าพิเศษที่อยากทำ", onkeydown: (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); sendImprov(); } } });
  d.improvSel = h("select", { "aria-label": "เป้าหมาย" });
  d.cap = L("g-capbox");
  d.caption = h("div", { class: "g-cap" }, d.cap, d.sayForm);
  d.hud = h("div", { class: "g-hud" }, d.spots, d.party, d.plate, d.hint, d.vote, d.menu, d.ticker, d.tools, d.caption, d.combat, d.room, d.panel, d.coach);
  d.fx = L("g-fx");
  d.sideTabs = h("div", { class: "side-tabs", role: "tablist" });
  d.sideBody = h("div", { class: "side-body" });
  d.input = h("textarea", { id: "chat-in", rows: 2, placeholder: "บอก DM ว่าจะทำอะไร… (Enter ส่ง)", onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitChat(); } } });
  d.chatForm = h("div", { class: "chat-form" }, d.input, h("button", { class: "btn primary", onclick: submitChat }, "ส่ง"));
  d.drawer = h("aside", { class: "g-drawer", hidden: true, "aria-label": "เรื่องเล่าและทีม" },
    h("div", { class: "g-drawer-head" }, d.sideTabs, h("button", { class: "g-ic", "aria-label": "ปิด", onclick: () => toggleDrawer(false) }, svg("x"))), d.sideBody, d.chatForm);
  d.stage = h("section", { class: "gs", "aria-label": "จอเกม" }, d.canvas, h("div", { class: "g-vignette" }), d.hud, d.fx, d.drawer);
  d.root = h("div", { class: "play" }, d.stage);
  d.canvas.addEventListener("pointerdown", onPointerDown);
  d.canvas.addEventListener("pointermove", onPointerMove);
  d.canvas.addEventListener("pointerleave", () => { if (!ptr) { P.hover = null; P.hoverPath = null; } });
  P.dom = d;
}
function submitChat() { const t = P.dom.input.value; if (!t.trim()) return; P.dom.input.value = ""; sendChat(t); }
function submitSay() { const t = P.dom.say.value; if (!t.trim()) return; P.dom.say.value = ""; sendChat(t); }
function toggleDrawer(on, tab) {
  if (tab) P.panel = tab;
  P.drawer = on == null ? !P.drawer : on;
  P.dom.drawer.hidden = !P.drawer;
  if (P.drawer) renderSide();
  renderMenu();
}
function leaveRoom() { closeCampaign(); P.dom = null; P.tv = false; P.drawer = false; P.coach = false; P.townPlace = null; document.body.classList.remove("tv", "ingame"); render(); }
let resizeT = null;
window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.view === "play" && P.cid && P.dom) renderPlay(); }, 120); });

// pointer: tap = click, drag = pan the camera, drag in the map editor = paint
let ptr = null;
function onPointerDown(e) {
  ptr = { x: e.clientX, y: e.clientY, pan: { ...(P.pan || { x: 0, y: 0 }) }, drag: false };
  if (P.mapEdit && P.mapEdit.rows) { const c = cellFromEvent(e); if (c) { paintCell(c); drawStage(); } }
}
function onPointerMove(e) {
  if (ptr && P.mapEdit) { const c = cellFromEvent(e); P.hover = c; if (c && P.mapEdit.rows) paintCell(c); drawStage(); return; }
  if (ptr && !ptr.drag && P.geo && P.geo.kind === "grid" && Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) > 9) ptr.drag = true;
  if (ptr && ptr.drag) { P.pan = { x: ptr.pan.x + e.clientX - ptr.x, y: ptr.pan.y + e.clientY - ptr.y }; return; }
  if (e.pointerType === "mouse") onBoardHover(e);
}
window.addEventListener("pointerup", (e) => {
  const p = ptr; ptr = null;
  if (!p || !P.dom || P.mapEdit || p.drag || e.target !== P.dom.canvas) return;
  onBoardClick(e);
});

// ---------- render: every sync re-fills the HUD layers ----------
function renderBar() { renderPlay(); }
function renderOverlay() { renderPlay(); }
function renderPlay() {
  if (S.view !== "play") return;
  if (!P.cid) { render(); return; }
  if (!P.dom || P.dom.cid !== P.cid || !P.dom.root.isConnected) { render(); return; }
  document.body.classList.add("ingame");
  if (!P.meta || !P.scene) { fill(P.dom.hint, h("span", { class: "g-txt" }, "กำลังโหลดห้อง…")); return; }
  document.body.classList.toggle("tv", P.tv);
  const sc = P.scene;
  if (P.lastLoc !== sc.loc + sc.mode) { if (sc.mode !== "town") P.townPlace = null; P.pan = null; P.lastLoc = sc.loc + sc.mode; }
  if (NET.local && sc.mode === "explore") { const t = exState().turn; if (t && P.party[t]) P.myCardId = t; }
  if (P.mode !== "move") P.pop = null;
  P.dom.stage.dataset.mode = P.mapEdit ? "edit" : sc.mode;
  watchFx();
  prepFrame();
  renderParty(); renderPlate(); renderHint(); renderVote(); renderMenu(); renderSpots(); renderRoom();
  renderTools(); renderCaption(); renderCombat(); renderPanel(); renderTicker(); renderCoach();
  if (P.drawer) renderSide();
  drawStage();
}

function renderParty() {
  const sc = P.scene; const st = sc.mode === "combat" ? combatState() : null; const cur = st && current(st);
  const ex = sc.mode === "explore" ? exState() : null;
  const box = P.dom.party; box.hidden = !!P.mapEdit;
  fill(box, ...Object.values(P.party).map((p) => {
    const u = st && st.units["pc-" + p.cardId]; const sh = safeSheet(p.card) || { hpMax: 1 };
    const hp = u ? u.hp : p.live.hp ?? sh.hpMax; const max = u ? u.maxHp : sh.hpMax;
    const now = (cur && cur.id === "pc-" + p.cardId) || (ex && ex.turn === p.cardId);
    const dead = p.live.dead || (u && u.dead);
    return h("button", { class: "g-pc" + (now ? " now" : "") + (p.cardId === P.myCardId ? " me" : "") + (dead ? " dead" : "") + (isOnline(p) ? "" : " away"), title: p.card.name + (isOnline(p) ? "" : " (ไม่อยู่)"), onclick: () => toggleDrawer(true, "party") },
      face(p.card.portrait, p.card.name, "g-face"),
      h("span", { class: "g-pcinfo" }, h("b", null, p.card.name.split(" ")[0]), h("span", { class: "g-bar" }, h("i", { style: "width:" + pct(hp, max) + "%" }))),
      ex && ex.group && now && h("em", { class: "g-lead" }, "นำ"));
  }));
}
function renderPlate() {
  const sc = P.scene; const pl = P.dom.plate;
  pl.hidden = !!P.mapEdit || (sc.mode === "town" && !!P.townPlace);
  if (sc.mode === "combat") {
    const st = combatState(); const cur = st && current(st);
    pl.className = "g-plate g-order";
    fill(pl, ...(st ? st.order.map((id) => st.units[id]).filter((x) => x && !(x.kind === "monster" && x.hp <= 0)) : []).map((x) =>
      h("span", { class: "g-o " + x.side + (cur && x.id === cur.id ? " now" : "") + (x.dead || x.hp <= 0 ? " down" : ""), title: x.name, style: unitImg(x) ? "background-image:url(" + JSON.stringify(unitImg(x)) + ")" : null },
        unitImg(x) ? "" : initials(shortName(x.name)), h("em", null, x.init))));
    return;
  }
  pl.className = "g-plate";
  const L = sc.mode === "world" ? { name: CAMP.name, th: "แผนที่โลก · " + CAMP.th } : locInfo(sc.loc);
  const lv = sc.mode === "explore" && L.level ? " · Lv " + L.level : "";
  fill(pl, h("div", { class: "g-loc" }, L.name), h("div", { class: "g-th" }, (L.th || "") + lv + (P.meta ? " · " + clockText() : "")));
}
function renderHint() {
  const sc = P.scene; const hn = P.dom.hint;
  let mode = "", cls = "", txt = ""; const extra = [];
  if (P.mapEdit) { mode = "ตั้งค่า Map"; cls = "town"; txt = "คลิกหรือลากบนกระดานเพื่อวาด"; }
  else if (!myParty().length) { mode = "เข้าร่วม"; cls = "town"; txt = "เลือกการ์ดของคุณก่อนเริ่มเล่น"; }
  else if (sc.mode === "town") { mode = "หมู่บ้าน"; cls = "town"; txt = P.townPlace ? "คุยกับ NPC หรือใช้บริการ แล้วกดกลับจัตุรัส" : "แตะอาคารที่มีแสงเพื่อเข้าไป · รับงานที่กระดานประกาศ"; }
  else if (sc.mode === "world") { mode = "เดินทาง"; cls = "town"; txt = "แตะหมุดบนแผนที่เพื่อเลือกที่หมาย"; }
  else if (sc.mode === "explore") {
    const ex = exState(); const hd = P.party[ex.turn]; const mine = canControlCard(hd);
    mode = ex.group ? "สำรวจ · จับกลุ่ม" : "สำรวจ · แยกเดิน";
    const left = Math.max(0, Math.floor((EX_FT - ex.moved) / 5));
    txt = !hd ? "แตะพื้นเพื่อเดิน" : ex.group ? (mine ? hd.card.name + " นำทาง: แตะจุดหมายไม่เกิน 6 ช่อง ทั้งทีมเดินตาม" : hd.card.name + " กำลังนำทาง…")
      : mine ? "ตาของ " + hd.card.name + ": เดินได้อีก " + left + " ช่อง · แตะ ✦ หรือหีบเพื่อค้น" + (ex.acted ? " (ค้นไปแล้ว)" : "") : "ตาของ " + hd.card.name + " · รอสักครู่";
    extra.push(h("span", { class: "g-seg", role: "group", "aria-label": "รูปแบบการสำรวจ" },
      h("button", { "aria-pressed": ex.group ? "false" : "true", onclick: () => exSetGroup(false) }, "แยกเดิน"),
      h("button", { "aria-pressed": ex.group ? "true" : "false", onclick: () => exSetGroup(true) }, "จับกลุ่ม")));
  } else if (sc.mode === "combat") {
    const st = combatState(); const u = st && current(st);
    mode = "ต่อสู้ · รอบ " + ((st && st.round) || 1); cls = "fight";
    txt = !st ? "" : st.over ? (st.over === "win" ? "ชนะแล้ว! กำลังสรุปผล…" : "แพ้… กำลังสรุปผล") : u && u.side === "pc" && canControl(u) ? "ตาของคุณ (" + u.name + ")" : u ? "ตาของ " + shortName(u.name) + "…" : "";
  }
  fill(hn, h("span", { class: "g-mode " + cls }, mode), h("span", { class: "g-txt" }, txt), ...extra);
}
function renderVote() {
  const v = P.scene.mode !== "combat" && !P.mapEdit && voteStatus(); const box = P.dom.vote;
  box.hidden = !v; if (!v) return;
  const L = locInfo(v.v.loc); const meReady = myParty().length > 0 && myParty().every((p) => p.ready === v.v.id);
  fill(box, 
    h("div", { class: "g-vote-t" }, h("b", null, "🧭 " + (v.v.by || "ทีม") + " ชวนไป " + L.name), h("small", null, (L.th ? L.th + " · " : "") + "พร้อมแล้ว " + v.ok.length + "/" + v.list.length + " คน")),
    h("span", { class: "g-vote-faces" }, v.list.map((p) => h("span", { class: "g-vf" + (p.ready === v.v.id ? " ok" : ""), title: p.card.name + (p.ready === v.v.id ? " พร้อม" : " ยังไม่พร้อม") }, face(p.card.portrait, p.card.name, "g-face sm")))),
    v.all ? h("small", null, "ทุกคนพร้อม กำลังออกเดินทาง…") : h("button", { class: "btn" + (meReady ? "" : " primary"), onclick: () => setReady(!meReady) }, meReady ? "ยังไม่พร้อม" : "พร้อม ✓"),
    h("button", { class: "btn ghost", onclick: () => writeScene({ vote: null }) }, "ยกเลิก"));
}
function renderMenu() {
  const sc = P.scene; if (!sc) return;
  const b = (k, label, fn, pressed) => h("button", { class: "g-ic", "aria-label": label, title: label, "aria-pressed": pressed == null ? null : pressed ? "true" : "false", onclick: fn }, svg(k));
  fill(P.dom.menu, 
    b("book", "เรื่องเล่า ทีม และบันทึก", () => toggleDrawer(), !!P.drawer),
    b("voice", "เสียง DM", () => { P.tts = !P.tts; try { localStorage.setItem("dnd4f-tts", P.tts ? "1" : "0"); } catch (e) {} if (!P.tts) try { speechSynthesis.cancel(); } catch (e) {} renderMenu(); }, !!P.tts),
    b("tv", P.tv ? "ออกจากโหมดทีวี" : "โหมดทีวี (เต็มจอ)", toggleTV, !!P.tv),
    isHost() && sc.mode !== "combat" && sc.mode !== "town" && !P.mapEdit && b("edit", "ตั้งค่า Map", () => startEdit(sc.mode === "world" ? "world" : sc.loc)),
    b("help", "วิธีเล่นหน้านี้", () => { P.coach = !P.coach; renderCoach(); renderMenu(); }, !!P.coach),
    b("door", "ออกจากห้อง", leaveRoom));
}
function toggleTV() {
  P.tv = !P.tv;
  try { if (P.tv && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); else if (!P.tv && document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  renderPlay();
}

// ---------- town: painted village with lit buildings, rooms with the NPC ----------
const TOWN_IMG = "assets/town-brindlemoor.webp";
const TOWN_SPOTS = [
  { id: "inn", x: 75, y: 25.5, npc: "pell", who: "Old Pell", line: "นั่งก่อนสิ ซุปยังร้อน… อยากฟังเรื่องมังกรใต้หอเถ้าถ่านไหมล่ะ?" },
  { id: "temple", x: 15, y: 34, npc: "maren", who: "Sister Maren", line: "แสงรุ่งอรุณคุ้มครองเจ้า ใครบาดเจ็บหรือจากไป พาเขามาที่นี่" },
  { id: "market", x: 79, y: 45.8, npc: "bram", who: "Bram", line: "ของดีราคาถูก… ก็ไม่ถูกขนาดนั้นหรอก จะเอาอะไรว่ามา" },
  { id: "board", x: 58, y: 55.9, npc: "oswin", who: "Mayor Oswin Hale", line: "ก็อบลินจากโพรงหนามดำลักพาตัวชาวบ้านไปแล้วสามคน ช่วยพวกเราด้วยเถิด" },
];
// where the village image sits on the stage: cover on wide screens, keep every building visible on phones
function townXform() {
  const W = Math.max(200, P.dom.stage.clientWidth), H = Math.max(200, P.dom.stage.clientHeight); const iw = 1600, ih = 1067;
  const cover = Math.max(W / iw, H / ih); const k = Math.min(cover, W / (iw * 0.8));
  const w = iw * k, hh = ih * k;
  const ox = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, W / 2 - 0.47 * w));
  const oy = hh <= H ? (H - hh) * 0.32 : (H - hh) / 2;
  return { ox, oy, w, h: hh, cover, W, H };
}
async function enterPlace(id) {
  P.townPlace = id; renderPlay();
  for (const p of NET.local ? [myMember()].filter(Boolean) : myParty()) writeParty(p.cardId, { townPlace: id }).catch(() => {});
}
async function leavePlace() {
  P.townPlace = null; renderPlay();
  for (const p of NET.local ? [myMember()].filter(Boolean) : myParty()) writeParty(p.cardId, { townPlace: null }).catch(() => {});
}
function renderSpots() {
  const show = P.scene.mode === "town" && !P.mapEdit && myParty().length > 0 && !P.townPlace;
  const box = P.dom.spots; box.hidden = !show; if (!show) return;
  const T = townXform();
  fill(box, ...TOWN_SPOTS.map((s) => {
    const pl = CAMP.town.places.find((p) => p.id === s.id) || { name: s.id, th: "" };
    const here = Object.values(P.party).filter((p) => p.townPlace === s.id);
    const x = Math.round(T.ox + (s.x / 100) * T.w), y = Math.round(T.oy + (s.y / 100) * T.h);
    const shift = x < 74 ? 74 - x : x > T.W - 74 ? T.W - 74 - x : 0; // keep the name label on screen near the edges
    return h("button", { class: "g-spot", style: "left:" + x + "px;top:" + y + "px;--shift:" + shift + "px", onclick: () => enterPlace(s.id) },
      here.length > 0 && h("span", { class: "g-spot-who", title: here.map((p) => p.card.name).join(", ") + " อยู่ข้างใน" }, here.map((p) => face(p.card.portrait, p.card.name, "g-face sm"))),
      h("span", { class: "g-lbl" }, h("b", null, pl.name), h("span", null, pl.th)), h("span", { class: "g-pin" }));
  }));
}
function renderRoom() {
  const id = P.scene.mode === "town" && !P.mapEdit && myParty().length ? P.townPlace : null;
  const box = P.dom.room; box.hidden = !id;
  if (!id) { fill(box, ); box.dataset.id = ""; return; }
  const s = TOWN_SPOTS.find((x) => x.id === id); const pl = CAMP.town.places.find((p) => p.id === id);
  const old = box.querySelector(".g-room-body"); const top = old ? old.scrollTop : 0;
  const fresh = box.dataset.id !== id; box.dataset.id = id;
  const body = id === "inn" ? innPanel() : id === "temple" ? templePanel() : id === "market" ? marketPanel() : boardPanel();
  const mine = new Set(myParty().map((p) => p.cardId));
  const others = Object.values(P.party).filter((p) => p.townPlace === id && !mine.has(p.cardId));
  const me = myMember();
  box.style.backgroundImage = "url(assets/room-" + id + ".webp)";
  fill(box, 
    h("div", { class: "g-npc" }, h("div", { class: "g-portrait" + (fresh ? " enter" : ""), role: "img", "aria-label": "ภาพ " + s.who, style: "background-image:url(assets/npc-" + s.npc + ".webp)" })),
    h("div", { class: "g-room-side" },
      h("div", { class: "row" }, h("span", { class: "g-mode town" }, pl.th), others.length > 0 && h("span", { class: "g-here" }, others.map((p) => face(p.card.portrait, p.card.name, "g-face sm")), others.map((p) => p.card.name.split(" ")[0]).join(", ") + " อยู่ที่นี่ด้วย")),
      h("h2", null, pl.name),
      h("div", { class: "g-speech" }, h("span", { class: "g-who" }, s.who), h("p", null, s.line)),
      me && h("div", { class: "small muted" }, "คุณเล่นเป็น " + me.card.name + " · เงิน " + fmtGp(me.card.gp || 0)),
      h("div", { class: "g-room-body" }, body),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: leavePlace }, "← กลับจัตุรัส"))));
  const nb = box.querySelector(".g-room-body"); if (nb && !fresh) nb.scrollTop = top;
}

// ---------- bottom right tools, DM caption, centered panels ----------
const tb = (icon, label, fn, gold) => h("button", { class: "g-tool" + (gold ? " gold" : ""), onclick: fn }, svg(icon), h("span", null, label));
function renderTools() {
  const sc = P.scene; const out = [];
  if (!P.mapEdit && myParty().length) {
    if (sc.mode === "town" && !P.townPlace) out.push(tb("map", "แผนที่โลก", () => writeScene({ mode: "world" })));
    else if (sc.mode === "world") {
      const l = P.worldSel && locInfo(P.worldSel);
      if (l) out.push(h("div", { class: "g-card" }, h("b", null, l.name), h("small", null, (l.th || "") + (l.level ? " · Lv " + l.level : "") + ((P.meta.done || {})[l.id] ? " · ✓ จบแล้ว" : "")),
        h("button", { class: "btn primary", onclick: () => { P.worldSel = null; if (l.id === sc.loc) writeScene({ mode: l.type === "town" ? "town" : "explore" }); else proposeTravel(l.id); } }, l.id === sc.loc ? "กลับเข้าไป" : "เดินทางไปที่นี่")));
      if (sc.loc === CAMP.town.id) out.push(tb("back", "กลับหมู่บ้าน", () => writeScene({ mode: "town" })));
      else if (CAMP.maps[sc.loc]) out.push(tb("back", "กลับเข้า " + locInfo(sc.loc).name, () => writeScene({ mode: "explore" })));
    } else if (sc.mode === "explore") {
      const ex = exState(); const hd = P.party[ex.turn]; const def = mapDef(sc.loc);
      if (sc.lastCombat && sc.lastCombat.result === "win") out.push(h("span", { class: "g-won" }, "🏆 ชนะ " + sc.lastCombat.enc + " +" + sc.lastCombat.xp + " EXP"));
      if (hd && canControlCard(hd)) out.push(tb("next", ex.group ? "ให้คนถัดไปนำ" : "ส่งตาต่อ", () => exPass(ex.turn), true));
      else if (hd && isHost() && !isOnline(hd)) out.push(tb("next", "ข้ามตา " + hd.card.name.split(" ")[0], () => exPass(ex.turn)));
      out.push(tb("coffee", "พักสั้น", () => restParty("short")));
      if (def && def.next && (P.meta.done || {})[def.id]) out.push(tb("up", "ขึ้นไปต่อ", () => travelTo(def.next), true));
      out.push(tb("map", "แผนที่โลก", () => writeScene({ mode: "world" })));
    }
  }
  fill(P.dom.tools, ...out); P.dom.tools.hidden = !out.length;
}
const firstLine = (t) => { const s = String(t || "").split("\n")[0]; return s.length > 150 ? s.slice(0, 148) + "…" : s; };
function renderCaption() {
  const sc = P.scene;
  const show = !P.mapEdit && myParty().length > 0 && sc.mode !== "combat" && !(sc.mode === "town" && P.townPlace);
  P.dom.caption.hidden = !show; if (!show) return;
  const lastDm = [...P.chat].reverse().find((m) => m.kind === "dm");
  const after = P.chat.slice(lastDm ? P.chat.lastIndexOf(lastDm) + 1 : 0).filter((m) => m.kind !== "dm" && m.ts > Date.now() - 300000).slice(-2);
  const fallback = sc.mode === "town" ? CAMP.town.intro : sc.mode === "world" ? "เลือกที่หมายบนแผนที่ แล้วชวนเพื่อนออกเดินทาง ทุกคนต้องกด “พร้อม” ก่อน" : ((mapDef(sc.loc) || {}).intro || "");
  const text = lastDm ? lastDm.text : fallback;
  const min = !!P.capMin;
  P.dom.caption.classList.toggle("min", min);
  fill(P.dom.cap, 
    after.length > 0 && h("div", { class: "g-recent" }, after.map((m) => h("div", { class: m.kind }, (m.kind === "player" ? (m.who || "") + ": " : "") + firstLine(m.text)))),
    h("div", { class: "g-speech" }, h("span", { class: "g-who" }, "DM"),
      h("span", { class: "g-sp-tools" },
        lastDm && h("button", { class: "g-mini", "aria-label": "อ่านออกเสียง", title: "อ่านออกเสียง", onclick: () => speak(lastDm.text) }, svg("voice")),
        h("button", { class: "g-mini", "aria-label": min ? "ขยายคำบรรยาย" : "ย่อคำบรรยาย", title: min ? "ขยาย" : "ย่อ", onclick: () => { P.capMin = !P.capMin; renderCaption(); } }, min ? "▲" : "▼")),
      h("p", null, min ? firstLine(text) : text),
      dmRunning && h("small", { class: "g-think" }, "DM กำลังคิด…")),
    !min && lastDm && (lastDm.options || []).length > 0 && h("div", { class: "g-choices" }, lastDm.options.map((o) => h("button", { class: "g-choice", onclick: () => sendChat(o) }, o))));
  P.dom.sayForm.hidden = min;
}
function renderPanel() {
  let content = null;
  if (P.mapEdit) content = editorPanel();
  else if (!myParty().length && !P.forceJoin && P.partyLoaded && P.autoJoin !== P.cid && mainCard() && !P.party[mainCard().id]) { P.autoJoin = P.cid; joinWith(mainCard()); content = h("div", { class: "panel ov-panel" }, "กำลังเข้าทีมด้วย " + mainCard().name + "…"); }
  else if (!myParty().length || P.forceJoin) content = joinPanel();
  const box = P.dom.panel; box.hidden = !content; box.classList.toggle("edit", !!P.mapEdit);
  fill(box, ...(content ? [content] : []));
}
function renderTicker() {
  const st = P.scene.mode === "combat" && !P.mapEdit ? combatState() : null;
  const lines = st ? st.log.slice(-3) : [];
  fill(P.dom.ticker, ...lines.map((l) => h("div", { class: l.kind || "" }, l.text)));
  P.dom.ticker.hidden = !lines.length;
}
const MARKS = {
  town: [[2, 15, "ทีมของคุณ: รูปและหลอด HP แตะเพื่อดูรายละเอียดทีม"], [64, 11, "เมนู: เรื่องเล่าย้อนหลัง เสียง DM โหมดทีวี วิธีเล่น ออกจากห้อง"], [30, 30, "อาคารที่มีแสง = เข้าไปได้ หน้าเพื่อนบนป้าย = เพื่อนอยู่ข้างในตอนนี้"], [28, 60, "DM เล่าเรื่องตรงนี้ แตะตัวเลือก หรือพิมพ์เองก็ได้"], [66, 70, "รับงานที่กระดานประกาศ หรือเปิดแผนที่โลกเพื่อชวนเพื่อนออกเดินทาง"]],
  world: [[30, 14, "แตะหมุดเพื่อเลือกที่หมาย"], [60, 62, "กด “เดินทางไปที่นี่” แล้วรอเพื่อนกด “พร้อม” ครบทุกคน"]],
  explore: [[24, 14, "ป้ายโหมด: บอกว่าตาใคร เดินได้อีกกี่ช่อง และสลับ แยกเดิน / จับกลุ่ม ได้"], [6, 38, "แตะพื้นเพื่อเดิน ช่องสีเขียว = เดินถึงในตานี้ ลากจอเพื่อเลื่อนดูแผนที่"], [60, 52, "ส่งตาต่อ พักสั้น ขึ้นชั้นต่อไป และแผนที่โลก"], [24, 66, "DM เล่าเรื่อง แตะตัวเลือกที่มีป้ายทักษะ เกมจะทอยเต๋าให้"]],
  combat: [[34, 15, "ลำดับตา: รูปที่ขยายใหญ่ = ตานั้น"], [2, 54, "ตัวคุณ: HP ช่องเวท และ Action / Bonus / ระยะเดินที่เหลือ"], [34, 62, "เลือกท่า แล้วกระดานจะเรืองแสงที่เป้าที่ใช้ได้ กด 1-6 บนคีย์บอร์ดก็ได้"], [64, 24, "บันทึกการทอยล่าสุด"]],
};
function renderCoach() {
  const box = P.dom.coach; const list = P.coach && !P.mapEdit && P.scene ? MARKS[P.scene.mode] || [] : [];
  box.hidden = !list.length; if (!list.length) return;
  fill(box, ...list.map(([x, y, t], i) => h("div", { class: "g-mark", style: "left:" + x + "%;top:" + y + "%" }, h("i", null, i + 1), h("span", null, t))),
    h("button", { class: "btn primary g-coach-x", onclick: () => { P.coach = false; renderCoach(); renderMenu(); } }, "เข้าใจแล้ว"));
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
    : h("p", null, "ยังไม่มีการ์ดที่พร้อมเล่น ไปที่หน้า “ตัวละคร” แล้วสร้างหรือกด “ใช้ตัวนี้” ที่ตัวสำเร็จรูปก่อน"),
    NET.local && h("p", { class: "small muted" }, "โหมดออฟไลน์: เพิ่มได้หลายตัว แล้วสลับคุมจากแท็บทีม"),
    P.forceJoin && h("button", { class: "btn ghost", onclick: () => { P.forceJoin = false; renderPlay(); } }, "ปิด"),
    h("button", { class: "btn", onclick: () => go("shelf") }, "ไปหน้าตัวละคร"));
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
  const disc = (P.meta && P.meta.discount) || null;
  const price = (it) => (disc ? Math.round(it.cost * (100 - disc.pct)) / 100 : it.cost);
  const buy = async (it0) => {
    const p = P.party[me.cardId]; const it = { ...it0, cost: price(it0) };
    if ((p.card.gp || 0) + 1e-9 < it.cost) return toast("เงินไม่พอ");
    { const trial = { ...p.card, inventory: [...(p.card.inventory || []), { id: it.id, qty: 1, equipped: false }] }; try { const b = invSlots(trial, D); if (b.over) toast("กระเป๋าเต็มแล้ว (" + b.used + "/" + b.cap + ") ของเกินจะทำให้เดินช้าลง 10 ft"); } catch (e) {} }
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
    h("div", { class: "row g-haggle" }, disc ? h("span", { class: "tag ok" }, "🤝 " + disc.npc + " ลดให้ " + disc.pct + "% จนกว่าจะออกจากหมู่บ้าน")
      : h("button", { class: "btn small", onclick: () => { sendChat("ขอต่อราคากับ Bram หน่อย ลดให้ได้ไหม"); toast("ส่งคำขอต่อราคาแล้ว DM จะให้ทอยเกลี้ยกล่อม"); } }, "🤝 ต่อราคากับ Bram")),
    h("div", { class: "chips" }, [["weapons", "อาวุธ"], ["armor", "เกราะ"], ["gear", "ของใช้/ยา"]].map(([k, l]) => h("button", { class: "chip", "aria-pressed": tab === k ? "true" : "false", onclick: () => { P.shopTab = k; renderOverlay(); } }, l))),
    h("div", { class: "tbl shop" }, h("table", null, h("tbody", null, list.map((it) => h("tr", null,
      h("td", null, it.name, h("div", { class: "small muted" }, it.dmg ? it.dmg + " " + it.dtype : it.ac ? (it.cat === "shield" ? "+2 AC" : "AC " + it.ac) : "")),
      h("td", { class: "num" }, (() => { const c = price(it); return (c >= 1 ? c + " GP" : Math.round(c * 10) >= 1 ? Math.round(c * 10) + " SP" : Math.round(c * 100) + " CP") + (disc && c !== it.cost ? " ↓" : ""); })()),
      h("td", null, h("button", { class: "btn small", disabled: (me.card.gp || 0) + 1e-9 < price(it), onclick: () => buy(it) }, "ซื้อ"))))))),
    h("h3", null, "ของของ " + me.card.name), bagMeter(me.card),
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
      h("button", { class: "btn small", onclick: () => proposeTravel(l.id) }, "ชวนทีมไปที่นี่")))));
}

// ---------- stage: town art, world map, or the grid board under a camera that follows the action ----------
// a/b = HUD space at the start/end of the axis the map may scroll under (so tokens never hide behind the caption or hotbar)
const fitAxis = (o, view, size, a = 0, b = 0) => (size + a + b <= view ? a + (view - a - b - size) / 2 : Math.min(a, Math.max(view - b - size, o)));
function camFocus(def) {
  const sc = P.scene;
  if (sc.mode === "combat") { const st = combatState(); const u = st && current(st); if (u) return { x: u.x + ((u.size || 1) - 1) / 2, y: u.y + ((u.size || 1) - 1) / 2 }; }
  const ex = exState(); const hd = P.party[ex.turn] || myMember();
  return (hd && hd.pos) || cellsOf(def, "S")[0] || { x: def.rows[0].length / 2, y: def.rows.length / 2 };
}
function stageGeometry() {
  const sc = P.scene; const W = Math.max(200, P.dom.stage.clientWidth), H = Math.max(200, P.dom.stage.clientHeight);
  if (P.mapEdit ? P.mapEdit.id === "world" : sc.mode === "world") { const top = 64, bottom = Math.max(120, Math.min(210, H * 0.27)); const ah = Math.max(160, H - top - bottom); let ww = W, wh = W * 9 / 16; if (wh > ah) { wh = ah; ww = ah * 16 / 9; } return { kind: "world", w: W, h: H, x0: (W - ww) / 2, y0: top + (ah - wh) / 2, ww, wh }; }
  if (!P.mapEdit && sc.mode === "town") return { kind: "town", w: W, h: H };
  const def = P.mapEdit ? { ...mapDef(P.mapEdit.id), rows: P.mapEdit.rows } : mapDef(sc.loc);
  if (!def || !def.rows) return null;
  const MW = def.rows[0].length, MH = def.rows.length;
  let cell, ox, oy;
  if (P.mapEdit) {
    const aw = W > 900 ? W - 430 : W; cell = Math.min(aw / MW, (H - 70) / MH);
    ox = (aw - MW * cell) / 2; oy = 60 + (H - 70 - MH * cell) / 2;
  } else {
    cell = Math.max(W / MW, H / MH, W < 700 ? 38 : 0);
    const f = camFocus(def); const fk = f.x + "," + f.y;
    if (P.focusKey !== fk) { P.focusKey = fk; P.pan = null; }
    const top = W < 700 ? 110 : 100;
    const capH = P.dom.caption && !P.dom.caption.hidden ? P.dom.caption.offsetHeight + 16 : 0;
    const bot = sc.mode === "combat" ? (W < 700 ? 150 : 104) : Math.max(capH, 60);
    const bx = W / 2 - (f.x + 0.5) * cell, by = top + (H - top - bot) / 2 - (f.y + 0.5) * cell;
    const pan = P.pan || { x: 0, y: 0 };
    ox = fitAxis(bx + pan.x, W, MW * cell); oy = fitAxis(by + pan.y, H, MH * cell, Math.min(top, 60), bot);
    if (P.pan) P.pan = { x: ox - bx, y: oy - by };
  }
  return { kind: "grid", def, W: MW, H: MH, cell, ox, oy, w: W, h: H, mw: MW * cell, mh: MH * cell };
}
let rafOn = false;
function kick() { if (!rafOn) { rafOn = true; requestAnimationFrame((t) => { rafOn = false; if (P.dom && P.dom.root.isConnected && S.view === "play" && P.scene && !document.hidden) drawStage(t); }); } }
document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
function drawStage(t) {
  if (!P.dom || !P.scene || S.view !== "play") return;
  const g = stageGeometry(); if (!g) return;
  const cv = P.dom.canvas; const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(g.w * dpr) || cv.height !== Math.round(g.h * dpr)) { cv.width = Math.round(g.w * dpr); cv.height = Math.round(g.h * dpr); }
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (g.kind === "grid") {
    const key = (P.mapEdit ? "e" : "g") + g.def.id + ":" + Math.round(g.cell);
    if (!P.cam || P.cam.key !== key || P.mapEdit || (ptr && ptr.drag)) P.cam = { key, ox: g.ox, oy: g.oy };
    else { P.cam.ox += (g.ox - P.cam.ox) * 0.16; P.cam.oy += (g.oy - P.cam.oy) * 0.16; if (Math.abs(g.ox - P.cam.ox) < 0.4) P.cam.ox = g.ox; if (Math.abs(g.oy - P.cam.oy) < 0.4) P.cam.oy = g.oy; }
    g.ox = P.cam.ox; g.oy = P.cam.oy;
  }
  P.geo = g;
  const now = t || performance.now();
  if (g.kind === "world") drawWorld(ctx, g); else if (g.kind === "town") drawTown(ctx, g, now); else drawGrid(ctx, g, now);
  if (g.kind !== "grid" && !P.mapEdit && typeof isNight === "function" && isNight()) { ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = "rgba(70,90,150,1)"; ctx.fillRect(0, 0, g.w, g.h); ctx.restore(); }
  kick();
}
let smoke = [];
function drawTown(ctx, g, t) {
  const W = g.w, H = g.h; const T = townXform();
  ctx.fillStyle = "#0b0805"; ctx.fillRect(0, 0, W, H);
  const im = img(TOWN_IMG);
  if (im) {
    if (T.w < W - 1 || T.h < H - 1) { const w = 1600 * T.cover, hh = 1067 * T.cover; ctx.globalAlpha = 0.3; ctx.drawImage(im, (W - w) / 2, (H - hh) / 2, w, hh); ctx.globalAlpha = 1; ctx.fillStyle = "rgba(11,8,5,.5)"; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(im, T.ox, T.oy, T.w, T.h);
  }
  const gr = ctx.createLinearGradient(0, 0, W, H); gr.addColorStop(0, "rgba(255,150,70,.16)"); gr.addColorStop(0.6, "rgba(40,30,60,.1)"); gr.addColorStop(1, "rgba(10,10,30,.35)");
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  // chimney smoke over the inn, fireflies over the square (positions are fractions of the image)
  if (smoke.length < 30 && Math.random() < 0.3) smoke.push({ u: 0.66, v: 0.196, r: 0.002, a: 0.35 });
  for (const s of smoke) { s.v -= 0.0005; s.u += 0.0002; s.r += 0.00006; s.a -= 0.003; ctx.fillStyle = "rgba(220,210,200," + Math.max(0, s.a) + ")"; ctx.beginPath(); ctx.arc(T.ox + s.u * T.w, T.oy + s.v * T.h, s.r * T.w, 0, 7); ctx.fill(); }
  smoke = smoke.filter((s) => s.a > 0);
  for (let i = 0; i < 18; i++) { const a = t / 1000 + i; ctx.fillStyle = "rgba(255,220,120," + (0.35 + 0.4 * Math.sin(a * 2)) + ")"; ctx.beginPath(); ctx.arc(T.ox + T.w * hash(i, 9) + Math.sin(a) * 10, T.oy + T.h * hash(i, 7) + Math.cos(a * 1.3) * 6, 1.8, 0, 7); ctx.fill(); }
}

// heavy per-sync work for the board (field of view, reach, tokens), so animation frames stay cheap
const inRange = (a, u, t) => !!a && ((a.melee && dist(u, t) <= a.reach) || (a.range && dist(u, t) <= a.range[1]));
function prepFrame() {
  const sc = P.scene; P.frame = null;
  if (P.mapEdit || (sc.mode !== "explore" && sc.mode !== "combat")) return;
  const def = mapDef(sc.loc); if (!def || !def.rows) return;
  const grid = gridOf(def); const st = sc.mode === "combat" ? combatState() : null;
  const vis = currentVisible(def, grid); const bits = revealedBits(def);
  const cur = st && current(st); const mine = !!(cur && cur.side === "pc" && canControl(cur) && !st.over);
  let reach = null, holder = null, exLeft = 0; const targets = new Set();
  if (st) {
    if (mine && P.mode === "move" && cur.turn) {
      reach = reachableCells(st, cur);
      if (cur.turn.action || cur.turn.attacksLeft > 0) for (const f of Object.values(st.units)) if (f.side === "foe" && alive(f) && (P.attackSel != null ? inRange(cur.attacks[P.attackSel], cur, f) : cur.attacks.some((a) => inRange(a, cur, f)))) targets.add(f.id);
    }
    if (mine && (P.mode === "offhand" || P.mode === "spiritual")) for (const f of Object.values(st.units)) if (f.side === "foe" && alive(f)) targets.add(f.id);
    if (mine && P.mode === "spell" && P.spellSel) { const need = spellNeed(P.spellSel.id); if (need.kind === "units") for (const f of Object.values(st.units)) if (alive(f) && (need.ally ? f.side === "pc" : f.side === "foe") && dist(cur, f) <= (need.range || 5)) targets.add(f.id); }
    if (mine && (P.mode === "help" || P.mode === "chaos")) for (const f of Object.values(st.units)) if (f.side === "pc" && alive(f) && (P.mode === "chaos" ? dist(cur, f) <= 5 : f.id !== cur.id && dist(cur, f) <= 5)) targets.add(f.id);
  } else {
    const ex = exState(); holder = P.party[ex.turn] || null;
    if (holder && canControlCard(holder) && holder.pos) { exLeft = EX_FT - ex.moved; reach = exLeft > 0 ? reachableCells({ map: grid, units: {} }, { id: "me", side: "pc", x: holder.pos.x, y: holder.pos.y, turn: { move: EX_FT, moved: ex.moved } }) : {}; }
  }
  const tokens = [];
  if (st) for (const u of Object.values(st.units)) { if (u.kind === "monster" && u.hp <= 0) continue; tokens.push({ u, x: u.x, y: u.y, size: u.size || 1 }); }
  else {
    for (const p of Object.values(P.party)) if (p.pos) tokens.push({ u: { id: "pc-" + p.cardId, side: "pc", name: p.card.name, portrait: p.card.portrait, hp: p.live.hp, maxHp: (safeSheet(p.card) || { hpMax: 1 }).hpMax, dead: p.live.dead, conditions: [] }, x: p.pos.x, y: p.pos.y, size: 1, lead: holder && holder.cardId === p.cardId });
    for (const L of Object.keys(def.encounters || {})) {
      if ((P.meta.cleared || {})[clearedKey(def.id, L)]) continue;
      for (const s of encounterSpawns(def, L, Math.max(1, Object.keys(P.party).length))) if (vis.has(s.x + "," + s.y)) { const m = MON[s.id]; tokens.push({ u: { id: "s" + s.x + "_" + s.y, side: "foe", name: m.name, monId: m.id, tier: s.tier, hp: 1, maxHp: 1, conditions: [] }, x: s.x, y: s.y, size: ({ Large: 2, Huge: 3, Gargantuan: 4 })[(m.type || "").split(" ")[0]] || 1 }); }
    }
  }
  P.frame = { def, grid, st, vis, bits, cur, mine, reach, targets, holder, exLeft, tokens };
}
function drawGrid(ctx, g, t) {
  const { def, W, H, cell: c } = g;
  const th = THEMES[def.theme] || THEMES.cave;
  const edit = !!P.mapEdit;
  const rows = edit ? P.mapEdit.rows : def.rows;
  const bg = bgImg(edit ? P.mapEdit.bg : def.bg);
  ctx.fillStyle = "#0b0805"; ctx.fillRect(0, 0, g.w, g.h);
  ctx.save(); ctx.translate(Math.round(g.ox), Math.round(g.oy));
  if (bg) ctx.drawImage(bg, 0, 0, g.mw, g.mh);
  const opened = P.meta.opened || {}, found = P.meta.found || {};
  const glowA = 0.6 + 0.4 * Math.sin(t / 300);
  let ci = 0, qi = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[y][x]; const px = x * c, py = y * c; const n = hash(x, y);
    const wall = ch === "#" || ch === " ";
    if (!bg) {
      ctx.fillStyle = wall ? rgb(th.wall, 0.9 + n * 0.2) : rgb(n > 0.5 ? th.floor : th.floor2, 0.92 + hash(y, x) * 0.16);
      ctx.fillRect(px, py, c + 0.5, c + 0.5);
      if (wall) { const below = y + 1 < H && rows[y + 1][x] !== "#" && rows[y + 1][x] !== " "; if (below) { ctx.fillStyle = rgb(th.wallTop); ctx.fillRect(px, py + c * 0.72, c, c * 0.28); } }
      if (ch === ",") { ctx.strokeStyle = rgb(th.brush, 1.2); ctx.lineWidth = Math.max(1, c / 16); for (let i = 0; i < 4; i++) { const bx = px + c * (0.2 + 0.6 * hash(x, y, i)), by = py + c * (0.35 + 0.5 * hash(y, x, i)); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - c * 0.08, by - c * 0.22); ctx.moveTo(bx, by); ctx.lineTo(bx + c * 0.08, by - c * 0.22); ctx.stroke(); } }
      if (ch === "~") { ctx.fillStyle = rgb(th.water, 1, 0.85); ctx.fillRect(px, py, c, c); }
      if (ch === "T") { ctx.fillStyle = "#2f4a26"; ctx.beginPath(); ctx.arc(px + c / 2, py + c / 2, c * 0.42, 0, 7); ctx.fill(); }
      if (ch === "D") { ctx.fillStyle = "#6b4a2b"; ctx.fillRect(px + c * 0.1, py + c * 0.1, c * 0.8, c * 0.8); }
    }
    if (ch === "C") { const k = def.id + ":C" + ci++; const chest = img("assets/obj-chest.webp"); if ((!opened[k] || edit) && chest) ctx.drawImage(chest, px + c * 0.06, py + c * 0.06, c * 0.88, c * 0.88); else if (!opened[k] || edit) { ctx.fillStyle = "#8a5a22"; ctx.fillRect(px + c * 0.2, py + c * 0.3, c * 0.6, c * 0.45); ctx.fillStyle = "#e3b341"; ctx.fillRect(px + c * 0.2, py + c * 0.45, c * 0.6, c * 0.08); ctx.fillRect(px + c * 0.46, py + c * 0.4, c * 0.08, c * 0.2); } }
    if (ch === "?") { const k = def.id + ":?" + qi++; if (!found[k] || edit) { ctx.fillStyle = "rgba(255,230,140," + (edit ? 0.9 : glowA) + ")"; ctx.font = "bold " + Math.round(c * 0.6) + "px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("✦", px + c / 2, py + c / 2); } }
    if (edit && /[a-zSBE]/.test(ch)) { ctx.fillStyle = ch === "B" ? "rgba(214,179,102,.85)" : ch === "S" ? "rgba(92,191,166,.85)" : "rgba(231,131,120,.8)"; ctx.fillRect(px + 2, py + 2, c - 4, c - 4); ctx.fillStyle = "#111"; ctx.font = "bold " + Math.round(c * 0.5) + "px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ch, px + c / 2, py + c / 2); }
    if (edit && bg && (wall || ch === "T")) { ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(px, py, c, c); }
    if (!edit) for (const tr of trapsHere()) if (tr.x === x && tr.y === y && (tr.found || tr.sprung)) {
      ctx.save(); ctx.globalAlpha = tr.sprung ? 0.35 : 0.85 + 0.15 * glowA;
      ctx.fillStyle = tr.sprung ? "rgba(60,40,30,.6)" : "rgba(200,50,40,.35)"; ctx.fillRect(px + 2, py + 2, c - 4, c - 4);
      ctx.strokeStyle = tr.sprung ? "#6b5a4a" : "#ff6a4a"; ctx.lineWidth = Math.max(1.5, c / 18); ctx.strokeRect(px + 3, py + 3, c - 6, c - 6);
      ctx.font = Math.round(c * 0.5) + "px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(tr.sprung ? "✕" : "⚠", px + c / 2, py + c / 2 + 1); ctx.restore();
    }
    if (ch === "E" && !edit) { ctx.fillStyle = "rgba(99,176,156," + (0.3 + 0.25 * glowA) + ")"; ctx.fillRect(px + 3, py + 3, c - 6, c - 6); ctx.fillStyle = "#fff"; ctx.font = "bold " + Math.round(c * 0.45) + "px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("⇧", px + c / 2, py + c / 2); }
  }
  ctx.strokeStyle = "rgba(0,0,0,.2)"; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * c + 0.5, 0); ctx.lineTo(x * c + 0.5, g.mh); ctx.stroke(); }
  for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * c + 0.5); ctx.lineTo(g.mw, y * c + 0.5); ctx.stroke(); }
  if (edit) { if (P.hover) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(P.hover.x * c + 1, P.hover.y * c + 1, c - 2, c - 2); } ctx.restore(); return; }
  const F = P.frame; if (!F || F.def.id !== def.id) { ctx.restore(); return; }
  if (F.reach) { ctx.fillStyle = "rgba(99,176,156,.22)"; for (const k of Object.keys(F.reach)) { const [x, y] = k.split(",").map(Number); ctx.fillRect(x * c, y * c, c, c); } }
  if (F.mine && P.hover && P.mode === "spell" && P.spellSel) {
    const need = spellNeed(P.spellSel.id);
    if (need.area) { const cells = areaCells(F.st, need.area[0], need.area[1], { x: F.cur.x, y: F.cur.y }, P.hover); ctx.fillStyle = "rgba(230,120,60,.35)"; for (const q of cells) ctx.fillRect(q.x * c, q.y * c, c, c); }
  }
  const pulse = 0.5 + 0.5 * Math.sin(t / 220);
  for (const tk of F.tokens) drawToken(ctx, tk, c, F.st, F.cur, F.targets.has(tk.u.id) ? "#ff5a3c" : tk.lead ? "#e9b44c" : null, pulse);
  // fog: unexplored stays dark, explored-but-unseen is dimmed; painted art still shows through faintly
  const art = !!bg;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (F.vis.has(x + "," + y)) continue;
    ctx.fillStyle = F.bits[y * W + x] ? "rgba(8,10,12,.5)" : art ? "rgba(6,7,9,.84)" : "rgba(6,7,9,.97)";
    ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5);
  }
  const hp = P.hoverPath;
  if (hp && hp.steps.length) {
    ctx.lineWidth = 3; ctx.lineCap = "round"; let prev = hp.from;
    for (const s of hp.steps) { ctx.strokeStyle = s.ok ? "rgba(244,210,122,.95)" : "rgba(200,190,170,.45)"; ctx.setLineDash(s.ok ? [] : [4, 5]); ctx.beginPath(); ctx.moveTo(prev.x * c + c / 2, prev.y * c + c / 2); ctx.lineTo(s.x * c + c / 2, s.y * c + c / 2); ctx.stroke(); prev = s; }
    ctx.setLineDash([]);
    const last = [...hp.steps].reverse().find((s) => s.ok); if (last) { ctx.fillStyle = "rgba(244,210,122,.95)"; ctx.beginPath(); ctx.arc(last.x * c + c / 2, last.y * c + c / 2, c * 0.14, 0, 7); ctx.fill(); }
  }
  if (P.hover) { ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 2; ctx.strokeRect(P.hover.x * c + 1, P.hover.y * c + 1, c - 2, c - 2); }
  ctx.restore();
}
function drawWorld(ctx, g) {
  ctx.fillStyle = "#0b0805"; ctx.fillRect(0, 0, g.w, g.h);
  ctx.save(); ctx.translate(g.x0, g.y0);
  const W = g.ww, H = g.wh;
  const bg = bgImg((P.maps.world || {}).bg || "assets/map-world.webp");
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
  if (!bg) for (const [a, b] of CAMP.world.roads) { const p = pos(byId[a]), q = pos(byId[b]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo((p.x + q.x) / 2 + 20, (p.y + q.y) / 2 - 15, q.x, q.y); ctx.stroke(); }
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
  ctx.restore();
}
function drawToken(ctx, t, c, st, cur, glow, pulse) {
  const u = t.u; const s = t.size * c; const px = t.x * c, py = t.y * c; const r = s / 2 - Math.max(2, c * 0.08);
  const cx = px + s / 2, cy = py + s / 2;
  const isCur = cur && cur.id === u.id;
  const ring = u.side === "pc" ? "#5cbfa6" : u.tier === "boss" ? "#f4d27a" : u.tier === "subboss" ? "#e0a050" : "#e05a4f";
  ctx.save();
  if (u.dead || (u.side === "pc" && u.hp <= 0)) ctx.globalAlpha = 0.45;
  if (isCur) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 14; }
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12 + 12 * (pulse || 0); }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = u.side === "pc" ? "#1d3a33" : "#3b1d1a"; ctx.fill();
  ctx.shadowBlur = 0;
  const im = img(unitImg(u));
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
  const x = Math.floor((e.clientX - r.left - Math.round(g.ox)) / g.cell), y = Math.floor((e.clientY - r.top - Math.round(g.oy)) / g.cell);
  return x >= 0 && y >= 0 && x < g.W && y < g.H ? { x, y } : null;
}
const stepCost = (grid, s) => (grid.difficult && grid.difficult[s.x + "," + s.y] ? 10 : 5);
function onBoardHover(e) {
  if (!P.geo || P.geo.kind !== "grid") return;
  const c = cellFromEvent(e);
  if (c && P.hover && c.x === P.hover.x && c.y === P.hover.y) return;
  P.hover = c; P.hoverPath = null;
  const F = P.frame;
  if (!c || !F || P.mapEdit) return;
  if (F.st && F.mine && P.mode === "move" && F.cur.turn && !unitAt(F.st, c.x, c.y)) {
    const p = findPath(F.st, F.cur, c, { maxCost: F.cur.turn.move - F.cur.turn.moved });
    if (p && p.length) P.hoverPath = { from: F.cur, steps: p.map((s) => ({ x: s.x, y: s.y, ok: true })) };
  } else if (!F.st && F.reach && F.holder && F.holder.pos && !F.grid.walls[c.x + "," + c.y]) {
    const p = findPath({ map: F.grid, units: {} }, { id: "me", side: "pc", x: F.holder.pos.x, y: F.holder.pos.y }, c, {});
    if (p && p.length) { let used = 0; P.hoverPath = { from: F.holder.pos, steps: p.map((s) => { used += stepCost(F.grid, s); return { x: s.x, y: s.y, ok: used <= F.exLeft }; }) }; }
  }
}
function unitAt(st, x, y) { return Object.values(st.units).find((u) => !(u.kind === "monster" && u.hp <= 0) && x >= u.x && x < u.x + (u.size || 1) && y >= u.y && y < u.y + (u.size || 1)); }

function onBoardClick(e) {
  if (!P.scene || !P.geo) return;
  const g = P.geo;
  if (g.kind === "world") {
    if (P.mapEdit) return;
    const r = P.dom.canvas.getBoundingClientRect(); const mx = e.clientX - r.left - g.x0, my = e.clientY - r.top - g.y0;
    const hit = CAMP.world.locations.find((l) => Math.hypot((l.x / 100) * g.ww - mx, (l.y / 100) * g.wh - my) < 28);
    P.worldSel = hit ? hit.id : null; renderPlay(); return;
  }
  if (g.kind !== "grid") return;
  const c = cellFromEvent(e); if (!c) return;
  P.hoverPath = null;
  if (P.scene.mode === "explore") return exploreClick(c);
  if (P.scene.mode === "combat") { const before = P.inspect; const r = combatClick(c); if (P.inspect && P.inspect !== before) toggleDrawer(true, "party"); return r; }
}

// ---------- exploration: take turns (solo: 30 ft each) or move as a group behind the leader ----------
function formation(grid, c, n) {
  const out = []; const seen = new Set([c.x + "," + c.y]); const q = [c];
  while (q.length && out.length < n) {
    const p = q.shift();
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = p.x + dx, y = p.y + dy, k = x + "," + y;
      if (x < 0 || y < 0 || x >= grid.w || y >= grid.h || seen.has(k) || grid.walls[k]) continue;
      seen.add(k); q.push({ x, y }); if (out.length < n) out.push({ x, y });
    }
  }
  return out;
}
async function exploreClick(c) {
  let me = myMember();
  if (!me) return toast("เลือกการ์ดเข้าร่วมทีมก่อน");
  const ex = exState();
  if (NET.local && ex.turn && P.party[ex.turn]) { P.myCardId = ex.turn; me = myMember(); }
  if (ex.turn && ex.turn !== me.cardId) { const hd = P.party[ex.turn]; return toast("ยังไม่ถึงตาคุณ · " + (ex.group ? hd.card.name + " กำลังนำทาง" : "ตอนนี้ตาของ " + hd.card.name)); }
  if (me.live.dead) return toast(me.card.name + " เสียชีวิตอยู่ ต้องกลับไปชุบที่วิหาร");
  if (P.busy) return;
  const def = mapDef(P.scene.loc); const grid = gridOf(def);
  const ch = def.rows[c.y][c.x];
  if (grid.walls[c.x + "," + c.y]) return;
  const start = me.pos || freeStart(def);
  const traps = clone(trapsHere());
  const known = traps.find((t) => t.found && !t.sprung && t.x === c.x && t.y === c.y);
  if (known) {
    if (Math.max(Math.abs(start.x - c.x), Math.abs(start.y - c.y)) > 1) return toast("กับดัก! เดินไปยืนข้าง ๆ แล้วแตะอีกครั้งเพื่อลองปลด");
    if (ex.acted) return toast("ใช้การกระทำไปแล้วในตานี้ ไว้ตาหน้าค่อยปลด");
    P.busy = true;
    try { const res = await disarmTrap(known, me); await writeScene({ traps, ex: { group: ex.group, turn: me.cardId, acted: true, moved: res && res.stop ? EX_FT : ex.moved } }); }
    finally { P.busy = false; }
    return;
  }
  const tgrid = { ...grid, walls: { ...grid.walls } };
  for (const t of traps) if (t.found && !t.sprung) tgrid.walls[t.x + "," + t.y] = 1;
  const here = c.x === start.x && c.y === start.y;
  const path = here ? [] : findPath({ map: tgrid, units: {} }, { id: "me", side: "pc", x: start.x, y: start.y }, c, {});
  if (!path) return toast("ไปตรงนั้นไม่ได้");
  const left = EX_FT - ex.moved; const steps = []; let budget = 0;
  for (const s of path) { const k = stepCost(grid, s); if (budget + k > left) break; budget += k; steps.push(s); }
  if (path.length && !steps.length) return toast("เดินครบ 6 ช่องแล้วในตานี้ กด “ส่งตาต่อ”");
  const bits = revealedBits(def);
  const reveal = (p) => { for (const k of visibleCells(grid, p, 8)) { const [x, y] = k.split(",").map(Number); bits[y * grid.w + x] = 1; } };
  const enc = Object.keys(def.encounters || {}).filter((L) => !(P.meta.cleared || {})[clearedKey(def.id, L)]).flatMap((L) => encounterSpawns(def, L, Math.max(1, Object.keys(P.party).length)));
  let end = { x: start.x, y: start.y }; let stopped = false; let used = 0; let sprung = null; let spotted = [];
  const watchers = ex.group ? ex.list : [me];
  reveal(end);
  spotted = spotTraps(traps, end, watchers, grid);
  for (const s of steps) {
    if (spotted.length) break;
    end = { x: s.x, y: s.y }; used += stepCost(grid, s); reveal(end);
    const hit = traps.find((t) => !t.sprung && !t.found && t.x === end.x && t.y === end.y);
    if (hit) { sprung = hit; break; }
    spotted = spotTraps(traps, end, watchers, grid);
    if (spotted.length) break;
    if (enc.some((m) => dist(end, m) <= 40 && hasLOS({ map: grid }, end, m))) { stopped = true; break; }
  }
  const moves = [];
  if (ex.group) { const others = ex.list.filter((p) => p.cardId !== me.cardId); const spots = formation(grid, end, others.length); others.forEach((p, i) => { const sp = spots[i] || end; reveal(sp); moves.push([p.cardId, sp]); }); }
  const reached = end.x === c.x && end.y === c.y && !stopped && !sprung && !spotted.length;
  const search = reached && (ch === "C" || ch === "?");
  if (search && ex.acted) toast("ค้นไปแล้วในตานี้ ไว้ตาหน้าค่อยค้นต่อ");
  const acted = ex.acted || (search && !ex.acted);
  const moved = ex.moved + used;
  const pass = !stopped && !sprung && !spotted.length && (ex.group || moved >= EX_FT);
  const nextTurn = () => { const i = ex.list.findIndex((p) => p.cardId === me.cardId); const nx = ex.list[(i + 1) % Math.max(1, ex.list.length)]; return nx ? nx.cardId : me.cardId; };
  P.busy = true;
  try {
    // the scene goes first so a combat started by the host can never be overwritten by this turn's bookkeeping
    const trapPatch = sprung || spotted.length ? { traps } : {};
    await writeScene({ ...trapPatch, ex: pass ? { group: ex.group, turn: nextTurn(), moved: 0, acted: false } : { group: ex.group, turn: me.cardId, moved, acted } });
    await writeParty(me.cardId, { pos: end, revealed: { ...(me.revealed || {}), [def.id]: bitsToStr(bits) } });
    for (const [id, sp] of moves) await writeParty(id, { pos: { x: sp.x, y: sp.y } });
    if (spotted.length) { const [t, who] = spotted[0]; await say("system", "👁 " + who.card.name + " สังเกตเห็น" + trapKind(t).th + " (Passive Perception " + passiveOf(who) + ") · ทีมเดินอ้อมได้ หรือยืนข้าง ๆ แล้วแตะเพื่อลองปลด"); return; }
    if (sprung) { const res = await springTrap(sprung, P.party[me.cardId] || me); await writeScene({ traps, ...(res.stop ? { ex: { group: ex.group, turn: me.cardId, moved: EX_FT, acted } } : {}) }); return; }
    if (stopped) { toast("⚠️ เจอศัตรู!"); return; }
    if (reached && ch === "E") await interact(def, c, ch);
    else if (search && !ex.acted) await interact(def, c, ch);
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

// ---------- combat HUD: my character plate, hotbar with popovers, step prompt ----------
function renderCombat() {
  const box = P.dom.combat; const sc = P.scene;
  const st = sc.mode === "combat" && !P.mapEdit ? combatState() : null;
  box.hidden = !st; if (!st) { P.pop = null; fill(box, ); return; }
  if (P.pop === "improv" && [P.dom.improvIn, P.dom.improvSel].includes(document.activeElement)) return;
  const cur = current(st); const mine = !!(cur && cur.side === "pc" && canControl(cur) && !st.over);
  const meU = mine ? cur : st.units["pc-" + P.myCardId];
  const out = [];
  if (meU) out.push(mePlate(st, meU));
  if (st.over) out.push(h("div", { class: "g-wait" }, st.over === "win" ? "🏆 ชนะ! กำลังสรุปผล…" : "💀 แพ้… กำลังสรุปผล"));
  else if (mine) out.push(...hotbar(st, cur));
  else if (cur && st.improv && !st.improv.done) out.push(h("div", { class: "g-wait" }, h("span", null, "🎭 DM กำลังตัดสินท่าพิเศษของ " + shortName((st.units[st.improv.by] || cur).name) + "…")));
  else if (cur) out.push(h("div", { class: "g-wait" }, h("span", null, cur.side === "foe" ? "ตาของ " + shortName(cur.name) + "…" : "รอ " + cur.name + " เล่น"),
    isHost() && cur.side === "pc" && h("button", { class: "btn small", onclick: async () => { const s2 = combatState(); log(s2, cur.name + " ข้ามตา"); finishTurn(s2); await commitCombat(s2); } }, "ข้ามตานี้")));
  fill(box, ...out);
}
function mePlate(st, u) {
  const T = u.turn || {}; const isCur = current(st) && current(st).id === u.id;
  const slots = (u.slots || []).map((n, i) => ({ lv: i + 1, max: n, left: slotsLeft(u, i + 1) })).filter((s) => s.max > 0);
  return h("div", { class: "g-me" + (isCur ? " now" : "") },
    face(u.portrait, u.name, "g-big"),
    h("div", { class: "g-stats" }, h("b", null, u.name),
      h("span", { class: "g-hpbar" }, h("i", { style: "width:" + pct(u.hp, u.maxHp) + "%" })),
      h("span", { class: "num" }, "HP " + u.hp + "/" + u.maxHp + (u.tempHp ? " +" + u.tempHp : "") + " · AC " + u.ac),
      slots.length > 0 && h("span", { class: "g-pips", title: "ช่องเวทที่เหลือ" }, "เวท", slots.map((s) => h("span", { class: "g-slv" }, slots.length > 1 && h("small", null, s.lv), Array.from({ length: s.max }, (_, i) => h("i", { class: i < s.left ? "on" : "" }))))),
      isCur && h("span", { class: "g-econ" },
        h("span", { class: T.action || T.attacksLeft > 0 ? "" : "used" }, "Action" + (T.attacksLeft > 0 && !T.action ? " ×" + T.attacksLeft : "")),
        h("span", { class: T.bonus ? "" : "used" }, "Bonus"), h("span", { class: u.reactionUsed ? "used" : "" }, "React"),
        h("span", null, Math.max(0, (T.move || 0) - (T.moved || 0)) + " ft"))));
}
function spellList(st, u) { return [...u.cantrips.map((id) => ({ id, lv: 0 })), ...u.spells.map((id) => ({ id, lv: (st.spellIndex[id] || {}).level || 1 }))].filter((s) => SPELLFX[s.id] && SPELLFX[s.id].t !== "util"); }
function hotbar(st, u) {
  const T = u.turn || {}; const out = [];
  const endBtn = h("button", { class: "g-slot end", "data-act": "end", onclick: endTurnNow }, h("kbd", null, "⏎"), svg("end"), h("span", null, "จบตา"));
  if (u.hp <= 0) { out.push(h("div", { class: "g-step" }, h("span", null, "หมดสติ: ระบบทอย Death Save ให้อัตโนมัติ")), h("div", { class: "g-hot" }, endBtn)); return out; }
  const inv = ((P.party[u.cardId] || {}).card || { inventory: [] }).inventory || [];
  const hasPotion = inv.some((x) => x.id === "potion-healing" && x.qty > 0);
  const chaos = homebrewOn() && chaosBottles({ inventory: inv }).length > 0;
  const canAct = T.action || T.attacksLeft > 0;
  const list = [["atk", "sword", "โจมตี", !canAct], spellList(st, u).length && ["spell", "spell", "เวท", false], (hasPotion || chaos) && ["potion", "potion", "ยา", false],
    ["dodge", "shield", "หลบ", !T.action], ["dash", "run", "วิ่ง", !T.action], ["more", "more", "อื่นๆ", false]].filter(Boolean);
  const pressed = (id) => P.pop === id || (id === "atk" && P.mode === "move" && P.attackSel != null) || (id === "spell" && P.mode === "spell");
  out.push(stepFor(st, u));
  if (P.pop) out.push(popover(st, u, P.pop, hasPotion));
  out.push(h("div", { class: "g-hot", role: "toolbar", "aria-label": "ท่าในตานี้" },
    list.map(([id, icon, label, dis], i) => h("button", { class: "g-slot", "data-act": id, disabled: dis, "aria-pressed": pressed(id) ? "true" : "false", onclick: () => hotAct(u, id) }, h("kbd", null, i + 1), svg(icon), h("span", null, label))), endBtn));
  return out;
}
function hotAct(u, id) {
  if (id === "dodge") { P.pop = null; return act(doDodge); }
  if (id === "dash") { P.pop = null; return act(doDash); }
  P.mode = "move"; P.spellSel = null; P.chaosSel = null;
  if (id === "atk" && u.attacks.length <= 1) { P.pop = null; P.attackSel = P.attackSel === 0 ? null : 0; return renderPlay(); }
  P.pop = P.pop === id ? null : id; renderPlay();
}
function endTurnNow() { P.mode = "move"; P.attackSel = null; P.pop = null; P.spellSel = null; act((s) => finishTurn(s)); }
function popover(st, u, id, hasPotion) {
  const T = u.turn || {}; let body;
  const opt = (label, sub, dis, fn, on) => h("button", { class: "g-opt", disabled: dis, "aria-pressed": on ? "true" : null, onclick: fn }, h("b", null, label), sub && h("small", null, sub));
  if (id === "atk") body = [h("div", { class: "g-pop-t" }, "เลือกอาวุธ แล้วแตะศัตรูที่เรืองแสง"), h("div", { class: "g-pop-list" }, u.attacks.map((a, i) =>
    opt(a.name, fmt(a.hit) + " · " + a.dmg + (a.range ? " · ระยะ " + a.range[0] + "/" + a.range[1] + " ft" : " · ประชิด " + a.reach + " ft"), false, () => { P.attackSel = i; P.pop = null; renderPlay(); }, P.attackSel === i)))];
  else if (id === "spell") body = spellPicker(st, u);
  else if (id === "improv") {
    const sel = P.dom.improvSel; const keep = sel.value;
    const opts = Object.values(st.units).filter((x) => alive(x) && x.id !== u.id).sort((a, b) => dist(u, a) - dist(u, b));
    sel.replaceChildren(h("option", { value: "" }, "ไม่เลือกเป้า"), ...opts.map((x) => h("option", { value: x.id }, (x.side === "foe" ? "⚔ " : "♥ ") + shortName(x.name) + " · " + dist(u, x) + " ft")));
    if (opts.some((x) => x.id === keep)) sel.value = keep;
    body = [h("div", { class: "g-pop-t" }, "💡 ท่าพิเศษ: พิมพ์ว่าจะทำอะไร แล้ว DM จะตัดสินว่าทอยอะไรและเกิดอะไรขึ้น (ใช้ Action)"),
      h("div", { class: "g-improv" }, P.dom.improvIn, h("div", { class: "row" }, sel, h("button", { class: "btn primary small", disabled: !T.action, onclick: sendImprov }, "ลองเลย")))];
    setTimeout(() => { if (P.pop === "improv" && document.activeElement !== sel) P.dom.improvIn.focus(); }, 0);
  }
  else if (id === "potion") body = [h("div", { class: "g-pop-t" }, "ยา"), h("div", { class: "g-pop-list" },
    hasPotion && opt("🧪 Potion of Healing", "Bonus Action · ฟื้น 2d4+2", !T.bonus, () => { P.pop = null; drinkPotion(); }),
    ...chaosBar(u, T).map((x) => h("div", { class: "g-opt-row" }, x)))];
  else {
    const res = u.resources || {};
    const go2 = (fn) => () => { P.pop = null; fn(); };
    body = [h("div", { class: "g-pop-t" }, "ท่าอื่น ๆ"), h("div", { class: "g-pop-list" },
      opt("💡 ท่าพิเศษ (พิมพ์เอง)", "Action · ทำอะไรก็ได้ที่คิดออก DM เป็นคนตัดสิน", !T.action || !!(st.improv && !st.improv.done), () => { P.pop = "improv"; renderPlay(); }),
      opt("Disengage", "Action · ถอยออกโดยไม่โดนฉวยโอกาสตี", !T.action, go2(() => act((s, a) => doDisengage(s, a)))),
      opt("Help", "Action · ช่วยเพื่อนที่ยืนติด ให้ได้เปรียบ", !T.action, go2(() => { P.mode = "help"; renderPlay(); })),
      res.secondWind && opt("Second Wind", "Bonus · ฟื้น 1d10+Lv (เหลือ " + (res.secondWind.max - res.secondWind.used) + ")", !T.bonus || res.secondWind.used >= res.secondWind.max, go2(() => act(secondWind))),
      res.actionSurge && opt("Action Surge", "ได้ Action เพิ่มอีก 1 ครั้ง", res.actionSurge.used >= res.actionSurge.max, go2(() => act(actionSurge))),
      u.features.includes("Cunning Action") && opt("Disengage (Bonus)", "Cunning Action", !T.bonus, go2(() => act((s, a) => doDisengage(s, a, true)))),
      u.attacks.filter((a) => a.light && a.melee).length >= 2 && opt("ตีมือรอง", "Bonus · แล้วแตะศัตรู", !T.bonus, go2(() => { P.mode = "offhand"; renderPlay(); })),
      u.spiritualWeapon && u.effects.some((e) => e.spiritual) && opt("Spiritual Weapon", "Bonus · แล้วแตะศัตรู", !T.bonus, go2(() => { P.mode = "spiritual"; renderPlay(); })),
      hasCond(u, "Prone") && opt("ลุกขึ้น", "ใช้ระยะเดินครึ่งหนึ่ง", false, go2(() => act(standUp))),
      opt("ดูข้อมูลศัตรูและบันทึก", "เปิดแผงด้านข้าง", false, go2(() => toggleDrawer(true, "log"))))];
  }
  return h("div", { class: "g-pop" }, h("button", { class: "g-pop-x", "aria-label": "ปิด", onclick: () => { P.pop = null; renderPlay(); } }, "✕"), body);
}
async function sendImprov() {
  const txt = P.dom.improvIn.value.trim(); if (!txt) return toast("พิมพ์ก่อนว่าจะทำอะไร");
  const tgt = P.dom.improvSel.value || null;
  P.dom.improvIn.value = ""; P.pop = null; P.dom.improvIn.blur();
  await requestImprov(txt, tgt);
}
function spellPicker(st, u) {
  const canSlot = (lv) => (u.slots || []).some((n, i) => i + 1 >= lv && slotsLeft(u, i + 1) > 0) || (u.mi && !u.miUsed && lv === 1);
  return [h("div", { class: "g-pop-t" }, "เลือกเวท"), h("div", { class: "g-pop-list" }, spellList(st, u).map((s) => {
    const sp = st.spellIndex[s.id] || { name: s.id }; const open = P.spPick === s.id && s.lv > 0;
    const chips = [];
    if (open) {
      for (let l = s.lv; l <= (u.slots || []).length; l++) if (slotsLeft(u, l) > 0) chips.push(h("button", { class: "chip", onclick: () => { P.pop = null; P.spPick = null; pickSpell(s.id, l, false); } }, "ช่อง Lv" + l + " (เหลือ " + slotsLeft(u, l) + ")"));
      if (u.mi && !u.miUsed && s.lv === 1) chips.push(h("button", { class: "chip", onclick: () => { P.pop = null; P.spPick = null; pickSpell(s.id, undefined, true); } }, "Magic Initiate (ฟรีวันละครั้ง)"));
    }
    return h("div", { class: "g-sp" }, h("button", { class: "g-opt", "aria-expanded": s.lv ? (open ? "true" : "false") : null, disabled: s.lv > 0 && !canSlot(s.lv), onclick: () => { if (!s.lv) { P.pop = null; pickSpell(s.id); } else { P.spPick = open ? null : s.id; renderPlay(); } } },
      h("b", null, sp.name), h("small", null, s.lv ? "Lv " + s.lv + (canSlot(s.lv) ? " · เลือกช่องเวท" : " · ช่องเวทหมด") : "cantrip · ใช้ได้ไม่จำกัด")), open && h("div", { class: "chips" }, chips));
  }))];
}
function stepFor(st, u) {
  const T = u.turn || {}; let t; const extra = [];
  if (st.improv && !st.improv.done) t = "🎭 DM กำลังตัดสินท่าพิเศษ…";
  else if (P.mode === "spell" && P.spellSel) {
    const need = spellNeed(P.spellSel.id); const sp = st.spellIndex[P.spellSel.id] || { name: P.spellSel.id };
    t = sp.name + ": " + (need.kind === "units" ? (need.ally ? "แตะเพื่อน" : "แตะศัตรูที่เรืองแสง") + (need.n > 1 ? " สูงสุด " + need.n + " เป้า" : "") : need.kind === "dir" ? "แตะทิศที่จะปล่อยเวท" : "แตะจุดที่จะร่าย") + (need.range ? " (ระยะ " + need.range + " ft)" : "");
    if ((P.spellSel.targets || []).length) extra.push(h("button", { class: "btn small primary", onclick: () => castNow({}) }, "ร่ายใส่ " + P.spellSel.targets.length + " เป้า"));
  } else if (P.mode === "help") t = "แตะเพื่อนที่ยืนติดเพื่อช่วย (Help)";
  else if (P.mode === "offhand") t = "แตะศัตรูเพื่อตีมือรอง";
  else if (P.mode === "spiritual") t = "แตะศัตรูให้ Spiritual Weapon ตี";
  else if (P.mode === "chaos") t = "แตะตัวเองเพื่อดื่ม หรือแตะเพื่อนที่ยืนติดเพื่อป้อนยาปรุง";
  else if (P.attackSel != null && u.attacks[P.attackSel]) t = "แตะศัตรูที่เรืองแสงเพื่อตีด้วย " + u.attacks[P.attackSel].name;
  else t = ((T.move || 0) - (T.moved || 0) > 0 ? "แตะช่องสีเขียวเพื่อเดิน · " : "") + (T.action || T.attacksLeft > 0 ? "แตะศัตรูเพื่อตี หรือเลือกท่าด้านล่าง" : "ใช้ Action แล้ว · เดินต่อ หรือกดจบตา");
  if (P.mode !== "move" || P.attackSel != null) extra.push(h("button", { class: "btn small ghost", onclick: () => { P.mode = "move"; P.spellSel = null; P.chaosSel = null; P.attackSel = null; renderPlay(); } }, "ยกเลิก"));
  return h("div", { class: "g-step" }, h("span", null, t), extra);
}

// ---------- effects everyone sees: dice for attacks and checks, floating numbers, turn banner ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fxChain = Promise.resolve();
// effects that fall more than a few seconds behind are skipped so the screen never lags behind the game
function fxQueue(fn) { const t = Date.now(); fxChain = fxChain.then(() => (Date.now() - t > 4500 ? null : fn())).catch(() => {}); }
const D20 = '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="#efe3c8" stroke="#2a1d12" stroke-width="2.5"/><polygon points="50,22 78,68 22,68" fill="#e2d2b0" stroke="#2a1d12" stroke-width="1.5"/><path d="M50 3 50 22M93 27 78 68M7 27 22 68M50 97 22 68M50 97 78 68M7 73 22 68M93 73 78 68M7 27 50 22 93 27" stroke="#2a1d12" stroke-width="1.3" fill="none"/></svg>';
// ---------- 3D d20 (three.js): tumbles, then settles with the rolled face toward the camera ----------
const DIE3 = { r: null, scene: null, cam: null, mesh: null, normals: [], ups: [], failed: false };
function die3Init() {
  if (DIE3.r || DIE3.failed) return DIE3.r;
  try {
    if (!window.THREE) throw new Error("no three");
    const T = window.THREE;
    const r = new T.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(190, 190, false);
    const scene = new T.Scene(); const cam = new T.PerspectiveCamera(32, 1, 0.1, 50); cam.position.set(0, 0, 5.2);
    scene.add(new T.AmbientLight(0xfff1d6, 0.55));
    const key = new T.DirectionalLight(0xffe2a8, 0.9); key.position.set(2, 3, 4); scene.add(key);
    const rim = new T.DirectionalLight(0x6fb0c8, 0.35); rim.position.set(-3, -2, 2); scene.add(rim);
    // atlas: 5x4 cells, one numbered triangle per face
    const cv = document.createElement("canvas"); cv.width = 1000; cv.height = 800; const g = cv.getContext("2d");
    const geo = new T.IcosahedronGeometry(1.25, 0); const pos = geo.attributes.position; const uv = new Float32Array(pos.count * 2);
    // standard d20 numbering: opposite faces add up to 21
    const order = [20, 2, 14, 8, 18, 4, 12, 16, 10, 6, 1, 19, 7, 13, 3, 17, 9, 5, 15, 11];
    const v = (i) => new T.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    const normals = [], ups = [], values = [];
    const faces = []; for (let f = 0; f < pos.count / 3; f++) { const a = v(f * 3), b = v(f * 3 + 1), c = v(f * 3 + 2); const n = new T.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize(); faces.push({ f, a, b, c, n }); }
    // give each face a value so opposites sum to 21
    const used = new Array(faces.length).fill(0); let k = 0;
    for (const F of faces) { if (used[F.f]) continue; const opp = faces.find((G) => !used[G.f] && G.f !== F.f && G.n.dot(F.n) < -0.99); const val = order[k++] <= 10 ? order[k - 1] : order[k - 1]; values[F.f] = val; used[F.f] = 1; if (opp) { values[opp.f] = 21 - val; used[opp.f] = 1; } }
    for (const F of faces) {
      const col = F.f % 5, row = Math.floor(F.f / 5); const u0 = col / 5, v0 = 1 - (row + 1) / 4, du = 1 / 5, dv = 1 / 4;
      const A = [u0 + du * 0.5, v0 + dv * 0.94], B = [u0 + du * 0.04, v0 + dv * 0.08], C = [u0 + du * 0.96, v0 + dv * 0.08];
      uv.set([...A, ...B, ...C], F.f * 6);
      const px = (p) => [p[0] * cv.width, (1 - p[1]) * cv.height];
      g.beginPath(); g.moveTo(...px(A)); g.lineTo(...px(B)); g.lineTo(...px(C)); g.closePath();
      const grd = g.createLinearGradient(...px(A), ...px([(B[0] + C[0]) / 2, B[1]])); grd.addColorStop(0, "#f6ead0"); grd.addColorStop(1, "#d9c49a");
      g.fillStyle = grd; g.fill(); g.lineWidth = 5; g.strokeStyle = "#7a5a2e"; g.stroke();
      const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3; const [tx, ty] = px([cx, cy]);
      const val = values[F.f]; g.fillStyle = val === 20 ? "#9b2a1a" : val === 1 ? "#3a3a3a" : "#2a1d12";
      g.font = "700 " + (val >= 10 ? 62 : 70) + "px 'IBM Plex Mono', monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(val), tx, ty + 6);
      if (val === 6 || val === 9) g.fillRect(tx - 16, ty + 38, 32, 5);
      const cen = F.a.clone().add(F.b).add(F.c).multiplyScalar(1 / 3);
      normals[val] = F.n.clone(); ups[val] = F.a.clone().sub(cen).normalize();
    }
    geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
    const tex = new T.CanvasTexture(cv); tex.anisotropy = 4;
    const mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.05, flatShading: true });
    const mesh = new T.Mesh(geo, mat); scene.add(mesh);
    Object.assign(DIE3, { r, scene, cam, mesh, normals, ups });
    return r;
  } catch (e) { DIE3.failed = true; return null; }
}
// quaternion that turns face `val` toward the camera with its number upright
function die3Target(val) {
  const T = window.THREE; const n = DIE3.normals[val], up = DIE3.ups[val]; if (!n) return new T.Quaternion();
  const q1 = new T.Quaternion().setFromUnitVectors(n, new T.Vector3(0, 0, 1));
  const u = up.clone().applyQuaternion(q1); const ang = Math.atan2(u.x, u.y);
  const q2 = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), ang);
  return q2.multiply(q1);
}
function die3Roll(host, val, ms) {
  return new Promise((done) => {
    const r = die3Init(); if (!r) return done(false);
    const T = window.THREE; host.append(r.domElement);
    const m = DIE3.mesh; m.quaternion.setFromEuler(new T.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    const axis = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const target = die3Target(val); const t0 = performance.now(); const spinEnd = ms * 0.62; let from = null;
    (function frame(now) {
      const t = now - t0;
      if (t < spinEnd) { const speed = 0.42 * (1 - t / spinEnd) + 0.05; m.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis, speed)); m.position.y = Math.abs(Math.sin(t / 120)) * 0.35 * (1 - t / spinEnd); }
      else { if (!from) from = m.quaternion.clone(); const k = Math.min(1, (t - spinEnd) / (ms - spinEnd)); const e = 1 - Math.pow(1 - k, 3); m.quaternion.copy(from).slerp(target, e); m.position.y = 0; }
      r.render(DIE3.scene, DIE3.cam);
      if (t < ms) requestAnimationFrame(frame); else done(true);
    })(t0);
  });
}
function diceAnim({ label, roll, bonus, total, vs, verdict, fast }) {
  return new Promise((done) => {
    const fx = P.dom && P.dom.fx; if (!fx) return done();
    const box = h("div", { class: "g-dice", role: "status" });
    box.innerHTML = '<div class="g-dcard"><div class="g-dlabel"></div><div class="g-d20 roll">' + D20 + '<b>?</b></div><div class="g-math"></div><div class="g-verdict"></div></div>';
    box.querySelector(".g-dlabel").textContent = label;
    fx.append(box); requestAnimationFrame(() => box.classList.add("show"));
    const b = box.querySelector("b"); let n = 0;
    const holder = box.querySelector(".g-d20");
    if (die3Init() && roll >= 1 && roll <= 20) {
      holder.classList.remove("roll"); holder.classList.add("d3"); holder.innerHTML = "";
      die3Roll(holder, roll, fast ? 700 : 1100).then((ok) => { if (!ok) { holder.innerHTML = D20 + "<b>" + roll + "</b>"; } land3(); });
    } else {
      const spin = setInterval(() => { b.textContent = 1 + Math.floor(Math.random() * 20); if (++n > (fast ? 5 : 9)) { clearInterval(spin); land(); } }, 70);
    }
    function land3() { land(true); }
    function land(is3d) {
      if (!is3d) b.textContent = roll;
      box.querySelector(".g-math").textContent = roll + (bonus >= 0 ? " + " + bonus : " − " + -bonus) + " = " + total + "   vs   " + vs;
      const v = box.querySelector(".g-verdict");
      v.textContent = { crit: "คริติคอล!", hit: "โดน!", miss: "พลาด", ok: "สำเร็จ!", fail: "ไม่สำเร็จ" }[verdict] || "";
      v.className = "g-verdict " + (verdict === "crit" ? "crit" : verdict === "hit" || verdict === "ok" ? "hit" : "miss");
      box.classList.add("done");
      setTimeout(() => { box.classList.remove("show"); setTimeout(() => { box.remove(); done(); }, 220); }, fast ? 850 : 1350);
    }
  });
}
function floatAt(unitId, text, cls) {
  const g = P.geo; const st = combatState(); const u = st && st.units[unitId];
  if (!g || g.kind !== "grid" || !u || !P.dom) return;
  const s = (u.size || 1) * g.cell;
  P.dom.fx.append(h("div", { class: "g-float " + (cls || ""), style: "left:" + Math.round(g.ox + u.x * g.cell + s / 2) + "px;top:" + Math.round(g.oy + u.y * g.cell - 4) + "px" }, text));
  const el = P.dom.fx.lastChild; setTimeout(() => el.remove(), 1400);
}
// a short spoken-style line over the board (DM rulings, enemy taunts, flavor on big moments)
function flavorPill(text, cls) {
  if (!P.dom || !text) return;
  const old = P.dom.fx.querySelectorAll(".g-flavor"); if (old.length > 1) old[0].remove();
  const el = h("div", { class: "g-flavor " + (cls || ""), role: "status" }, String(text).slice(0, 200)); P.dom.fx.append(el);
  requestAnimationFrame(() => el.classList.add("show")); setTimeout(() => el.remove(), 5200);
}
function banner(text, side) {
  if (!P.dom) return Promise.resolve();
  const b = h("div", { class: "g-banner " + (side || "") }, text); P.dom.fx.append(b);
  requestAnimationFrame(() => b.classList.add("show")); setTimeout(() => b.remove(), 1700);
  return sleep(1150);
}
function watchFx() {
  const lastTs = P.chat.length ? P.chat[P.chat.length - 1].ts : 0;
  if (P.fxChatCid !== P.cid) { P.fxChat = lastTs; P.fxChatCid = P.cid; }
  else if (lastTs > (P.fxChat || 0)) {
    for (const m of P.chat) if (m.ts > (P.fxChat || 0)) {
      if (Array.isArray(m.rolls)) for (const r of m.rolls.slice(0, 4))
        fxQueue(() => diceAnim({ label: r.who + " · " + r.label, roll: r.roll, bonus: r.bonus, total: r.total, vs: "DC " + r.dc, verdict: r.ok ? "ok" : "fail" }));
      if (m.flavor) flavorPill(m.text, "dm");
    }
    P.fxChat = lastTs;
  }
  const st = P.scene.mode === "combat" ? combatState() : null;
  if (!st) { P.fxCombat = null; return; }
  const key = P.cid + ":" + st.mapId + ":" + st.encounter; const hp = {};
  for (const u of Object.values(st.units)) hp[u.id] = u.hp;
  const cur = current(st); const prev = P.fxCombat && P.fxCombat.key === key ? P.fxCombat : null;
  if (prev && st.seq > prev.seq) {
    const fresh = st.log.filter((l) => l.n > prev.seq);
    const atks = fresh.filter((l) => l.kind === "attack").slice(-3);
    for (const l of fresh.filter((x) => x.kind === "check").slice(-2))
      fxQueue(() => diceAnim({ label: shortName(l.who || "") + " · " + l.label, roll: l.roll, bonus: l.total - l.roll, total: l.total, vs: "DC " + l.dc, verdict: l.ok ? "ok" : "fail" }));
    for (const l of fresh.filter((x) => x.kind === "say").slice(-2)) fxQueue(async () => { flavorPill(l.text); await sleep(300); });
    for (const l of atks) {
      const a = st.units[l.a], tg = st.units[l.t]; if (!a || !tg) continue;
      fxQueue(() => diceAnim({ label: shortName(a.name) + " → " + shortName(tg.name), roll: l.roll, bonus: l.total - l.roll, total: l.total, vs: "AC " + tg.ac, verdict: l.crit ? "crit" : l.hit ? "hit" : "miss", fast: a.side === "foe" }));
    }
    const gone = Object.values(st.units).filter((x) => x.left && prev.hp[x.id] > 0).map((x) => x.id);
    const diffs = Object.keys(hp).filter((id) => prev.hp[id] != null && hp[id] !== prev.hp[id] && !gone.includes(id)).map((id) => [id, hp[id] - prev.hp[id]]);
    if (gone.length) fxQueue(() => { for (const id of gone) floatAt(id, st.units[id].left === "flee" ? "หนี!" : "ยอมแพ้", "miss"); });
    const missed = atks.filter((l) => !l.hit).map((l) => l.t);
    if (diffs.length || missed.length) fxQueue(async () => {
      for (const [id, d] of diffs) floatAt(id, d > 0 ? "+" + d : "−" + -d, d > 0 ? "heal" : "");
      for (const id of missed) if (!diffs.some((x) => x[0] === id)) floatAt(id, "พลาด", "miss");
      await sleep(250);
    });
  }
  if (cur && !st.over && (!prev || prev.cur !== cur.id)) fxQueue(() => (P.scene && P.scene.mode === "combat" ? banner(cur.side === "pc" && canControl(cur) ? "ตาของคุณ!" : "ตาของ " + shortName(cur.name), cur.side) : null));
  P.fxCombat = { key, seq: st.seq, hp, cur: cur && cur.id };
}

// keyboard: 1-6 pick hotbar actions, Enter ends the turn, Esc backs out
document.addEventListener("keydown", (e) => {
  if (!P.dom || S.view !== "play" || !document.body.classList.contains("ingame")) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (e.key === "Escape") {
    if (P.coach) P.coach = false; else if (P.pop) P.pop = null;
    else if (P.mode !== "move" || P.attackSel != null) { P.mode = "move"; P.spellSel = null; P.chaosSel = null; P.attackSel = null; }
    else if (P.drawer) { P.drawer = false; P.dom.drawer.hidden = true; }
    else if (P.townPlace) { leavePlace(); return; }
    renderPlay(); return;
  }
  const slots = [...P.dom.combat.querySelectorAll(".g-hot .g-slot")]; if (!slots.length) return;
  if (e.key === "Enter") { const end = slots.find((s) => s.dataset.act === "end"); if (end) { e.preventDefault(); end.click(); } return; }
  const n = +e.key; if (n >= 1 && n <= 9) { const s = slots.filter((x) => x.dataset.act !== "end")[n - 1]; if (s && !s.disabled) { e.preventDefault(); s.click(); } }
});

// ---------- drawer: DM story history, party, combat log ----------
function renderSide() {
  if (!P.dom) return;
  const tabs = [["dm", "เรื่องเล่า"], ["party", "ทีม"], ["log", "บันทึก"]];
  fill(P.dom.sideTabs, ...tabs.map(([k, l]) => h("button", { class: "tab", role: "tab", "aria-selected": P.panel === k ? "true" : "false", "aria-current": P.panel === k ? "true" : "false", onclick: () => { P.panel = k; renderSide(); } }, l)));
  P.dom.chatForm.hidden = P.panel !== "dm";
  const hostP = Object.values(P.party).find((p) => p.uid === (P.meta || {}).hostUid);
  const body = P.panel === "party" ? h("div", null,
      h("div", { class: "row small", style: "margin-bottom:8px" }, h("span", { class: "tag" + (isHost() ? " ok" : "") }, NET.local ? "ออฟไลน์ (เครื่องนี้คุมทุกตัว)" : isHost() ? "คุณเป็น host" : "host: " + (hostP ? hostP.card.name : "ไม่อยู่")),
        !isHost() && !NET.local && h("button", { class: "btn tiny", onclick: async () => { await writeMeta({ hostUid: myUid() }); toast("คุณเป็น host แล้ว"); } }, "เป็น host แทน")),
      partyPanel())
    : P.panel === "log" ? logPanel() : chatPanel();
  const sb = P.dom.sideBody;
  const atBottom = sb.scrollHeight - sb.scrollTop - sb.clientHeight < 60;
  fill(sb, body);
  if (P.panel !== "party" && (atBottom || P.lastPanel !== P.panel)) sb.scrollTop = sb.scrollHeight;
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
    P.chat.length >= 4 && !NET.local && h("button", { class: "btn small ghost", style: "align-self:flex-start", onclick: () => { askRecap(); toast("ขอให้ DM สรุปเรื่องย่อแล้ว"); } }, "📖 สรุปเรื่องย่อ"),
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
