// DnD for friend · character builder UI (phase 1)
// Depends on DATA, PREMADES and the rules engine functions inlined above by tools/build.mjs.
const D = DATA;
const IX = index(D);
const ABN = { STR: "พลัง", DEX: "ว่องไว", CON: "อึด", INT: "ปัญญา", WIS: "สติ", CHA: "เสน่ห์" };
const ALIGN = ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"];
const STEPS = [
  { id: "species", th: "เผ่า" }, { id: "class", th: "คลาส" }, { id: "background", th: "พื้นเพ" },
  { id: "scores", th: "ค่าสถานะ" }, { id: "skills", th: "ทักษะและความสามารถ" }, { id: "spells", th: "เวทมนตร์" },
  { id: "equipment", th: "อุปกรณ์" }, { id: "identity", th: "ชื่อและตัวตน" },
];

const S = { view: "shelf", cards: [], store: "loading", draft: null, step: 0, sheet: null, banner: null,
  openSpell: null, spellLv: "all", confirmDel: false, exportText: null, xpEdit: false, importErrs: null };

// ---------- tiny DOM helper ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const sname = (id) => (IX.spell[id] ? IX.spell[id].name : id);
const iname = (id) => (IX.items[id] ? IX.items[id].name : id);
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}
function initials(name) { return (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }
function portraitEl(card, big) {
  if (card.portrait) return h("img", { class: "portrait" + (big ? " big" : ""), src: card.portrait, alt: "รูปของ " + card.name });
  return h("div", { class: "portrait" + (big ? " big" : ""), "aria-hidden": "true" }, initials(card.name));
}
function safeSheet(card) { try { return computeSheet(card, D); } catch (e) { return null; } }
function classLine(card) {
  const c = IX.cls[card.classId], sp = IX.species[card.speciesId], bg = IX.bg[card.backgroundId];
  const sub = c && c.subclasses.find((s) => s.id === card.subclassId);
  return [sp && (card.speciesChoice ? card.speciesChoice : sp.name), c && c.name + (sub ? " (" + sub.name + ")" : ""), bg && bg.name].filter(Boolean).join(" · ");
}

// ---------- card storage: per account in db, browser storage as a fallback ----------
const LS = "dnd4f-cards";
let col = null;
function lsRead() { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch (e) { return []; } }
function lsWrite(list) { try { localStorage.setItem(LS, JSON.stringify(list)); } catch (e) {} }
function useLocal(why) {
  col = null; S.store = "local"; S.cards = lsRead();
  setPill(why || "เก็บการ์ดไว้ในเบราว์เซอร์นี้เท่านั้น"); render();
}
function setPill(t) { document.getElementById("storePill").textContent = t; }
async function initStore() {
  const use = window.claude && window.claude.use;
  if (!use) return useLocal();
  try {
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    const uid = user && (await user.id());
    if (!db || !uid) return useLocal("ยังไม่ได้ล็อกอิน: เก็บการ์ดในเบราว์เซอร์นี้");
    col = db.collection("data/users/" + uid);
    S.store = "db"; setPill("เซฟการ์ดในบัญชีของคุณ");
    col.onSnapshot((snap) => {
      S.cards = snap.docs.map((d) => d.data()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
      if (S.view === "shelf") render();
      if (S.view === "sheet" && S.sheet && !S.sheet.premade) {
        const fresh = S.cards.find((c) => c.id === S.sheet.id);
        if (fresh && fresh !== S.sheet) { S.sheet = fresh; render(); }
      }
    }, () => useLocal("เชื่อมบัญชีไม่ได้: เก็บการ์ดในเบราว์เซอร์นี้"));
  } catch (e) { useLocal(); }
}
async function saveCard(card) {
  const c = clone(card); delete c.premade; c.updated = Date.now();
  if (col) {
    try { await col.doc(c.id).set(c); return c; }
    catch (e) {
      if (e && e.code === "quota_exceeded") { toast("ที่เก็บเต็ม ลบการ์ดเก่าก่อน"); throw e; }
      toast("เซฟในบัญชีไม่ได้ จึงเซฟในเบราว์เซอร์แทน"); useLocal();
    }
  }
  const list = lsRead().filter((x) => x.id !== c.id); list.unshift(c); lsWrite(list); S.cards = list;
  return c;
}
async function deleteCard(id) {
  if (col) { try { await col.doc(id).delete(); return; } catch (e) { toast("ลบไม่สำเร็จ ลองอีกครั้ง"); return; } }
  const list = lsRead().filter((x) => x.id !== id); lsWrite(list); S.cards = list;
}

// ---------- navigation ----------
function go(view) { S.view = view; S.confirmDel = false; S.exportText = null; S.xpEdit = false; render(); window.scrollTo(0, 0); }
function openSheet(card) { S.sheet = card; go("sheet"); }
function startNew() { S.draft = newCard(); S.step = 0; S.banner = null; go("build"); }
function editCard(card) { S.draft = clone(card); delete S.draft.premade; S.step = 0; S.banner = null; go("build"); }
async function adoptPremade(p) {
  const c = clone(p); delete c.premade;
  c.id = newCard().id; c.state.hp = null;
  const saved = await saveCard(c);
  toast("เพิ่ม " + c.name + " เข้าการ์ดของคุณแล้ว"); openSheet(saved);
}

function renderTabs() {
  const t = document.getElementById("tabs"); t.replaceChildren();
  const tab = (id, label, dis) => h("button", { class: "tab", "aria-current": S.view === id ? "true" : "false", disabled: dis, onclick: () => go(id) }, label);
  t.append(tab("shelf", "การ์ดตัวละคร"), tab("build", S.draft ? "หน้าสร้าง/แก้ไข" : "สร้างตัวละคร", false), tab("sheet", "ชีตตัวละคร", !S.sheet));
}
function render() {
  renderTabs();
  const app = document.getElementById("app");
  if (S.view === "build" && !S.draft) S.draft = newCard();
  const v = S.view === "build" ? viewBuild() : S.view === "sheet" && S.sheet ? viewSheet(S.sheet) : viewShelf();
  app.replaceChildren(v);
}

// ---------- shelf ----------
function cardTile(card, premade) {
  const errs = validate(card, D);
  const sh = safeSheet(card);
  return h("article", { class: "ccard" },
    portraitEl(card),
    h("div", { style: "min-width:0" },
      h("h3", null, card.name || "ไม่มีชื่อ"),
      h("div", { class: "small muted" }, classLine(card) || "ยังไม่ได้เลือกคลาส"),
      h("div", null,
        h("span", { class: "tag num" }, "Lv " + card.level),
        sh && h("span", { class: "tag num" }, "HP " + sh.hpMax),
        sh && h("span", { class: "tag num" }, "AC " + sh.ac),
        errs.length ? h("span", { class: "tag warn" }, "ยังไม่ครบ " + errs.length) : h("span", { class: "tag ok" }, "พร้อมเล่น")),
      premade && card.tagline && h("div", { class: "small", style: "margin-top:6px" }, card.tagline)),
    h("div", { class: "acts" },
      premade
        ? [h("button", { class: "btn primary", onclick: () => adoptPremade(card) }, "ใช้ตัวนี้"),
           h("button", { class: "btn", onclick: () => openSheet({ ...card, premade: true }) }, "ดูชีต")]
        : [h("button", { class: "btn primary", onclick: () => openSheet(card) }, "เปิดชีต"),
           h("button", { class: "btn", onclick: () => editCard(card) }, "แก้ไข")]));
}
function viewShelf() {
  const mine = S.cards;
  return h("div", null,
    h("div", { class: "shelf-head" },
      h("div", null, h("div", { class: "eyebrow" }, "การ์ดของฉัน"), h("h2", null, "เลือกการ์ดแล้วเข้าเล่นได้เลย")),
      h("div", { class: "row" },
        h("button", { class: "btn primary", onclick: startNew }, "+ สร้างตัวละครใหม่"),
        h("button", { class: "btn", onclick: () => document.getElementById("fileIn").click() }, "โหลดการ์ดจากไฟล์"))),
    S.importErrs && h("div", { class: "banner", style: "margin-bottom:14px" },
      h("b", null, "โหลดการ์ดแล้ว แต่ยังมีจุดที่ต้องแก้: "), S.importErrs.join(" · ")),
    h("div", { class: "cards" },
      S.store === "loading" ? h("div", { class: "empty" }, "กำลังโหลดการ์ดของคุณ…")
      : mine.length ? mine.map((c) => cardTile(c, false))
      : h("div", { class: "empty" }, "ยังไม่มีการ์ด กด “สร้างตัวละครใหม่” หรือกด “ใช้ตัวนี้” ที่ตัวสำเร็จรูปด้านล่าง แล้วการ์ดจะมาอยู่ตรงนี้ เพื่อนที่มีการ์ดเป็นไฟล์ กด “โหลดการ์ดจากไฟล์” ได้เลย")),
    h("div", { class: "shelf-head" },
      h("div", null, h("div", { class: "eyebrow" }, "ตัวสำเร็จรูป 5 ตัว"), h("h2", null, "หยิบไปเล่นได้ทันที หรือเอาไปแก้ต่อ"))),
    h("div", { class: "cards" }, PREMADES.map((p) => cardTile(p, true))));
}
document.getElementById("fileIn").addEventListener("change", async (ev) => {
  const f = ev.target.files[0]; ev.target.value = "";
  if (!f) return;
  try {
    const { card, errors } = importCard(await f.text(), D);
    const saved = await saveCard(card);
    S.importErrs = errors.length ? errors : null;
    toast("โหลดการ์ด " + saved.name + " แล้ว"); S.view = "shelf"; render();
  } catch (e) { toast("ไฟล์นี้ไม่ใช่การ์ด DnD for friend"); }
});

// ---------- builder ----------
function stepErrors(card) {
  const errs = validate(card, D);
  const m = { species: /เผ่า|Lineage|Ancestry|Legacy/, class: /คลาส|สายย่อย|เลเวล/, background: /พื้นเพ/,
    scores: /Standard Array|Point Buy|ค่าที่ทอย|วิธีกำหนด|เกิน 20/, skills: /ทักษะ|Expertise|Fighting|Divine|Hunter|Ability Score|Origin Feat|Skilled|Magic Initiate|Mastery|Scholar|Deft/,
    spells: /Cantrip|เวท|สมุด/, equipment: /^$/, identity: /ชื่อ/ };
  const out = {};
  for (const s of STEPS) out[s.id] = [];
  for (const e of errs) {
    const k = (e.startsWith("Magic Initiate") ? "skills" : null) || STEPS.find((s) => m[s.id].test(e))?.id || "identity";
    out[k].push(e);
  }
  return { all: errs, by: out };
}
function touched(card, id) {
  return { species: card.speciesId, class: card.classId, background: card.backgroundId, scores: true, skills: card.classId,
    spells: card.classId, equipment: card.inventory.length, identity: card.name }[id];
}
function update(fn) { fn(S.draft); render(); }
function viewBuild() {
  const c = S.draft;
  const se = stepErrors(c);
  const rail = h("nav", { class: "rail", "aria-label": "ขั้นตอน" }, STEPS.map((s, i) => {
    const bad = se.by[s.id].length && touched(c, s.id);
    const done = !se.by[s.id].length && touched(c, s.id);
    return h("button", { class: bad ? "bad" : done ? "done" : "", "aria-current": S.step === i ? "true" : "false", onclick: () => { S.step = i; render(); } },
      h("span", { class: "dot" }, done ? "✓" : i + 1), h("span", { class: "lbl" }, s.th));
  }));
  const step = STEPS[S.step].id;
  const body = { species: stepSpecies, class: stepClass, background: stepBackground, scores: stepScores, skills: stepSkills,
    spells: stepSpells, equipment: stepEquipment, identity: stepIdentity }[step](c);
  const nav = h("div", { class: "row" },
    S.step > 0 && h("button", { class: "btn", onclick: () => { S.step--; render(); window.scrollTo(0, 0); } }, "← ย้อนกลับ"),
    S.step < STEPS.length - 1 && h("button", { class: "btn primary", onclick: () => { S.step++; render(); window.scrollTo(0, 0); } }, "ถัดไป: " + STEPS[S.step + 1].th + " →"));
  return h("div", { class: "builder" }, rail,
    h("div", { class: "work" },
      S.banner && h("div", { class: "banner" }, S.banner),
      body, se.by[step].length ? h("ul", { class: "errs" }, se.by[step].map((e) => h("li", null, e))) : null, nav),
    summaryPanel(c, se.all));
}
function summaryPanel(c, errs) {
  const sh = c.classId && c.speciesId && c.backgroundId ? safeSheet(c) : null;
  const sc = finalScores(c, D);
  return h("aside", { class: "summary panel" },
    h("div", { class: "row" }, portraitEl(c),
      h("div", { style: "min-width:0;flex:1" }, h("h3", null, c.name || "ตัวละครใหม่"), h("div", { class: "small muted" }, classLine(c) || "เลือกเผ่า คลาส และพื้นเพ"), h("div", { class: "small num" }, "Level " + c.level))),
    sh && h("div", { class: "stats" },
      [["HP", sh.hpMax], ["AC", sh.ac], ["Speed", sh.speed], ["Init", fmt(sh.init)], ["PB", "+" + sh.pb], ["Perc.", sh.passivePerception]]
        .map(([l, v]) => h("div", { class: "stat" }, h("div", { class: "v" }, v), h("div", { class: "l" }, l)))),
    h("div", { class: "stats" }, ABILITIES.map((a) => h("div", { class: "stat" }, h("div", { class: "v" }, sc[a]), h("div", { class: "l" }, a + " " + fmt(mod(sc[a])))))),
    errs.length ? [h("div", { class: "eyebrow" }, "ยังขาดอีก " + errs.length + " อย่าง"), h("ul", { class: "errs" }, errs.slice(0, 8).map((e) => h("li", null, e)))]
      : h("div", { class: "small", style: "color:var(--ok)" }, "ครบทุกอย่างแล้ว พร้อมเล่น"),
    h("button", { class: "btn primary", disabled: !c.classId || !c.speciesId || !c.backgroundId, onclick: async () => {
      if (!c.name.trim()) c.name = "นักผจญภัยไร้นาม";
      const saved = await saveCard(c);
      toast(errs.length ? "เซฟแล้ว (ยังไม่ครบ " + errs.length + " อย่าง)" : "เซฟการ์ดแล้ว");
      S.draft = null; openSheet(saved);
    } }, "เซฟการ์ด"),
    h("button", { class: "btn ghost small", onclick: () => { S.draft = null; go("shelf"); } }, "ยกเลิกการแก้ไข"));
}

// step 1: species
function stepSpecies(c) {
  const sp = IX.species[c.speciesId];
  return h("div", { class: "work" },
    h("div", { class: "panel" },
      h("div", null, h("div", { class: "eyebrow" }, "ขั้นที่ 1"), h("h2", null, "เลือกเผ่า")),
      h("div", { class: "pick-grid" }, D.origins.species.map((s) =>
        h("button", { class: "pick", "aria-pressed": c.speciesId === s.id ? "true" : "false", onclick: () => update((d) => {
          if (d.speciesId !== s.id) { d.speciesId = s.id; d.speciesChoice = ""; d.speciesSkills = []; d.humanFeat = ""; }
        }) },
          h("span", { class: "nm" }, s.name), h("span", { class: "th" }, s.th),
          h("span", { class: "small muted num" }, s.size + " · " + s.speed + " ft" + (s.darkvision ? " · มองมืด " + s.darkvision + " ft" : "")))))),
    sp && h("div", { class: "panel" },
      h("h3", null, sp.name + " ได้อะไรบ้าง"),
      h("ul", { class: "traits" }, sp.traits.map((t) => h("li", null, h("b", null, t.name), " · " + t.th))),
      sp.choice && h("div", null,
        h("div", { class: "eyebrow", style: "margin-bottom:6px" }, sp.choice.label),
        h("div", { class: "pick-grid" }, Object.entries(sp.choice.options).map(([k, o]) =>
          h("button", { class: "pick", "aria-pressed": c.speciesChoice === k ? "true" : "false", onclick: () => update((d) => (d.speciesChoice = k)) },
            h("b", null, k), h("span", { class: "small muted" }, typeof o === "string" ? "ธาตุ " + o : o.th))))),
      sp.skillChoice && skillChips(c, "speciesSkills", sp.skillChoice.count,
        sp.skillChoice.from === "any" ? Object.keys(D.origins.skills) : sp.skillChoice.from, "ทักษะจากเผ่า")));
}
function skillChips(c, field, count, from, label, lockedSet) {
  const picks = c[field] || [];
  const locked = lockedSet || new Set();
  return h("div", null,
    h("div", { class: "row", style: "margin-bottom:6px" }, h("span", { class: "eyebrow" }, label),
      h("span", { class: "counter" + (picks.length === count ? " full" : picks.length > count ? " over" : "") }, picks.length + "/" + count)),
    h("div", { class: "chips" }, from.map((s) => {
      if (locked.has(s) && !picks.includes(s)) return h("span", { class: "chip locked", title: "ได้อยู่แล้ว" }, s + " ✓");
      const on = picks.includes(s);
      return h("button", { class: "chip", "aria-pressed": on ? "true" : "false", disabled: !on && picks.length >= count,
        onclick: () => update((d) => { const a = d[field] || []; d[field] = on ? a.filter((x) => x !== s) : [...a, s]; }) },
        s + (D.origins.skills[s] ? " · " + D.origins.skills[s].th : ""));
    })));
}

// step 2: class
function stepClass(c) {
  const cl = IX.cls[c.classId];
  return h("div", { class: "work" },
    h("div", { class: "panel" },
      h("div", null, h("div", { class: "eyebrow" }, "ขั้นที่ 2"), h("h2", null, "เลือกคลาส")),
      h("div", { class: "pick-grid" }, D.classes.classes.map((k) =>
        h("button", { class: "pick", "aria-pressed": c.classId === k.id ? "true" : "false", onclick: () => update((d) => {
          if (d.classId === k.id) return;
          Object.assign(d, { classId: k.id, subclassId: "", skills: [], expertise: [], fightingStyle: "", divineOrder: "", huntersPrey: "",
            masteries: [], cantrips: [], spells: [], spellbook: [], asi: [], inventory: [], gp: 0, equipPick: null });
          if (d.abilityMethod === "standard") d.baseScores = { ...k.standardArray };
        }) },
          h("span", { class: "die" }, "d" + k.hitDie + " HIT DIE"), h("span", { class: "nm" }, k.name), h("span", { class: "th" }, k.th),
          h("span", { class: "small muted" }, k.role))))),
    cl && h("div", { class: "panel" },
      h("h3", null, cl.name + " · " + cl.th),
      h("div", { class: "small" },
        h("div", null, "ค่าหลัก: ", h("b", null, cl.primary.join(" / ")), " · เซฟที่ชำนาญ: ", h("b", null, cl.saves.join(", "))),
        h("div", null, "เกราะ: ", cl.armor.length ? cl.armor.join(", ") : "ไม่มี", " · อาวุธ: ", cl.weapons.join(", ").replace("martial:Finesse|Light", "martial ที่เป็น Finesse/Light"))),
      h("div", { class: "row" }, h("span", { class: "eyebrow" }, "เลเวล"), h("b", { class: "num" }, c.level),
        h("span", { class: "small muted" }, "ตัวใหม่เริ่มเลเวล 1 แล้วอัปจากหน้าชีตเมื่อได้ EXP ครบ")),
      c.level >= 3 && h("div", null, h("div", { class: "eyebrow", style: "margin-bottom:6px" }, "สายย่อย (เลเวล 3)"),
        h("div", { class: "pick-grid" }, cl.subclasses.map((s) =>
          h("button", { class: "pick", "aria-pressed": c.subclassId === s.id ? "true" : "false", onclick: () => update((d) => (d.subclassId = s.id)) },
            h("b", null, s.name), h("span", { class: "small muted" }, s.th))))),
      h("div", { class: "eyebrow" }, "ความสามารถถึงเลเวล 5"),
      h("ul", { class: "feat-list" }, [...cl.features, ...(cl.subclasses[0] ? cl.subclasses[0].features.map((f) => ({ ...f, name: f.name + " (" + cl.subclasses[0].name + ")" })) : [])]
        .sort((a, b) => a.lv - b.lv).map((f) => h("li", { style: f.lv > c.level ? "opacity:.55" : null },
          h("span", { class: "lv" }, "Lv" + f.lv), h("div", null, h("b", null, f.name), h("div", { class: "small muted" }, f.th)))))));
}

// step 3: background
function stepBackground(c) {
  const bg = IX.bg[c.backgroundId];
  const bb = c.bgBonus || {};
  const mode = Object.keys(bb).length === 3 ? "111" : "21";
  const plus2 = Object.keys(bb).find((k) => bb[k] === 2), plus1 = Object.keys(bb).find((k) => bb[k] === 1);
  return h("div", { class: "work" },
    h("div", { class: "panel" },
      h("div", null, h("div", { class: "eyebrow" }, "ขั้นที่ 3"), h("h2", null, "เลือกพื้นเพ")),
      h("div", { class: "pick-grid" }, D.origins.backgrounds.map((b) => {
        const f = IX.feat[b.feat];
        return h("button", { class: "pick", "aria-pressed": c.backgroundId === b.id ? "true" : "false", onclick: () => update((d) => {
          if (d.backgroundId === b.id) return;
          d.backgroundId = b.id; d.bgBonus = {}; d.magicInitiate = null; d.inventory = []; d.equipPick = null;
          d.skills = (d.skills || []).filter((s) => !b.skills.includes(s));
        }) },
          h("span", { class: "nm" }, b.name), h("span", { class: "th" }, b.th),
          h("span", { class: "small muted" }, "ค่า " + b.abilities.join("/") + " · " + b.skills.join(", ")),
          h("span", { class: "small" }, "Feat: " + (f ? f.name : b.feat)));
      }))),
    bg && h("div", { class: "panel" },
      h("h3", null, "โบนัสค่าสถานะจาก " + bg.name),
      h("div", { class: "row" },
        h("button", { class: "chip", "aria-pressed": mode === "21" ? "true" : "false", onclick: () => update((d) => (d.bgBonus = {})) }, "+2 / +1"),
        h("button", { class: "chip", "aria-pressed": mode === "111" ? "true" : "false", onclick: () => update((d) => (d.bgBonus = Object.fromEntries(bg.abilities.map((a) => [a, 1])))) }, "+1 / +1 / +1")),
      mode === "21" && h("div", { class: "fields" },
        h("label", { class: "fld" }, "+2 ให้", h("select", { id: "bg2", onchange: (e) => update((d) => { const o = { [e.target.value]: 2 }; if (plus1 && plus1 !== e.target.value) o[plus1] = 1; d.bgBonus = o; }) },
          h("option", { value: "" }, "เลือก…"), bg.abilities.map((a) => h("option", { value: a, selected: plus2 === a }, a + " " + ABN[a])))),
        h("label", { class: "fld" }, "+1 ให้", h("select", { id: "bg1", onchange: (e) => update((d) => { const o = { [e.target.value]: 1 }; if (plus2 && plus2 !== e.target.value) o[plus2] = 2; d.bgBonus = o; }) },
          h("option", { value: "" }, "เลือก…"), bg.abilities.filter((a) => a !== plus2).map((a) => h("option", { value: a, selected: plus1 === a }, a + " " + ABN[a]))))),
      h("div", { class: "small" }, "ทักษะ: ", h("b", null, bg.skills.join(", ")), " · เครื่องมือ: ", bg.tool),
      IX.feat[bg.feat] && h("div", { class: "small" }, h("b", null, IX.feat[bg.feat].name), " · " + IX.feat[bg.feat].th)));
}

// step 4: scores
function stepScores(c) {
  const cl = IX.cls[c.classId];
  const method = c.abilityMethod;
  const base = c.baseScores;
  const fs = finalScores(c, D);
  const cost = pointBuyCost(base, D);
  const used = new Map();
  if (method === "standard") ABILITIES.forEach((a) => used.set(a, base[a]));
  const setMethod = (m) => update((d) => {
    d.abilityMethod = m;
    d.baseScores = m === "pointbuy" ? { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 } : { ...(cl ? cl.standardArray : { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 }) };
  });
  return h("div", { class: "work" }, h("div", { class: "panel" },
    h("div", null, h("div", { class: "eyebrow" }, "ขั้นที่ 4"), h("h2", null, "กำหนดค่าสถานะ")),
    h("div", { class: "row" },
      h("button", { class: "chip", "aria-pressed": method === "standard" ? "true" : "false", onclick: () => setMethod("standard") }, "Standard Array (15,14,13,12,10,8)"),
      h("button", { class: "chip", "aria-pressed": method === "pointbuy" ? "true" : "false", onclick: () => setMethod("pointbuy") }, "Point Buy (27 แต้ม)"),
      cl && method === "standard" && h("button", { class: "btn ghost small", onclick: () => update((d) => (d.baseScores = { ...cl.standardArray })) }, "ใช้ค่าแนะนำของ " + cl.name)),
    method === "pointbuy" && h("div", { class: "counter " + (cost > 27 ? "over" : cost === 27 ? "full" : "") }, "ใช้ไป " + cost + " / 27 แต้ม"),
    h("div", { class: "abil" }, ABILITIES.map((a) => {
      let ctl;
      if (method === "standard") {
        ctl = h("select", { id: "sa-" + a, "aria-label": a, onchange: (e) => update((d) => {
          const v = +e.target.value; const other = ABILITIES.find((x) => x !== a && d.baseScores[x] === v);
          if (other) d.baseScores[other] = d.baseScores[a];
          d.baseScores[a] = v;
        }) }, D.origins.standardArray.map((v) => h("option", { value: v, selected: base[a] === v }, v)));
      } else {
        const next = { ...base, [a]: base[a] + 1 };
        const nc = pointBuyCost(next, D);
        ctl = h("div", { class: "step" },
          h("button", { "aria-label": "ลด " + a, disabled: base[a] <= 8, onclick: () => update((d) => d.baseScores[a]--) }, "−"),
          h("span", { class: "num" }, base[a]),
          h("button", { "aria-label": "เพิ่ม " + a, disabled: nc === null || nc > 27, onclick: () => update((d) => d.baseScores[a]++) }, "+"));
      }
      const bonus = (c.bgBonus || {})[a] || 0;
      const asi = fs[a] - base[a] - bonus;
      return h("div", { class: "ab" }, h("span", { class: "k" }, a + " · " + ABN[a]), ctl,
        h("span", { class: "score" }, fs[a]), h("span", { class: "mod" }, fmt(mod(fs[a]))),
        h("span", { class: "parts" }, base[a] + (bonus ? " +" + bonus + " bg" : "") + (asi ? " +" + asi + " asi" : "")));
    })),
    cl && h("div", { class: "small muted" }, cl.name + " ใช้ " + cl.primary.join(" / ") + " เป็นหลัก ใส่ค่าสูงสุดตรงนั้นก่อน แล้วตามด้วย CON")));
}

// step 5: skills & class choices
function stepSkills(c) {
  const cl = IX.cls[c.classId], bg = IX.bg[c.backgroundId], sp = IX.species[c.speciesId];
  if (!cl || !bg) return h("div", { class: "panel" }, h("h2", null, "ทักษะและความสามารถ"), h("p", { class: "muted" }, "เลือกคลาสและพื้นเพก่อน แล้วค่อยมาเลือกทักษะ"));
  const lv = c.level;
  const bgSet = new Set(bg.skills);
  const prof = skillProfs(c, D);
  const parts = [];
  parts.push(h("div", { class: "panel" },
    h("div", null, h("div", { class: "eyebrow" }, "ขั้นที่ 5"), h("h2", null, "ทักษะและความสามารถ")),
    skillChips(c, "skills", cl.skills.count, cl.skills.from, "ทักษะจากคลาส " + cl.name, bgSet),
    h("div", { class: "small muted" }, "ได้จากพื้นเพแล้ว: " + bg.skills.join(", ") + ((c.speciesSkills || []).length ? " · จากเผ่า: " + c.speciesSkills.join(", ") : ""))));

  const exCount = c.classId === "rogue" ? 2 : (c.classId === "ranger" || c.classId === "wizard") && lv >= 2 ? 1 : 0;
  if (exCount) {
    const from = c.classId === "wizard" ? ["Arcana", "History", "Investigation", "Medicine", "Nature", "Religion"].filter((s) => prof.has(s)) : [...prof];
    parts.push(h("div", { class: "panel" }, h("h3", null, c.classId === "wizard" ? "Scholar: Expertise" : "Expertise"),
      h("div", { class: "small muted" }, "เลือกทักษะที่ชำนาญแล้ว ได้โบนัสชำนาญ 2 เท่า"),
      skillChips(c, "expertise", exCount, from.sort(), "Expertise")));
  }
  if (cl.features.some((f) => f.choice === "fighting" && f.lv <= lv)) {
    parts.push(h("div", { class: "panel" }, h("h3", null, "Fighting Style"),
      h("div", { class: "pick-grid" }, D.origins.feats.filter((f) => f.cat === "fighting").map((f) =>
        h("button", { class: "pick", "aria-pressed": c.fightingStyle === f.id ? "true" : "false", onclick: () => update((d) => (d.fightingStyle = f.id)) },
          h("b", null, f.name), h("span", { class: "small muted" }, f.th))))));
  }
  if (c.classId === "cleric") {
    const f = cl.features.find((x) => x.choice === "divineOrder");
    parts.push(h("div", { class: "panel" }, h("h3", null, "Divine Order"),
      h("div", { class: "pick-grid" }, Object.entries(f.options).map(([k, t]) =>
        h("button", { class: "pick", "aria-pressed": c.divineOrder === k ? "true" : "false", onclick: () => update((d) => (d.divineOrder = k)) }, h("b", null, k), h("span", { class: "small muted" }, t))))));
  }
  if (c.classId === "ranger" && lv >= 3) {
    const sub = cl.subclasses.find((s) => s.id === "hunter");
    const f = sub.features.find((x) => x.choice === "huntersPrey");
    parts.push(h("div", { class: "panel" }, h("h3", null, "Hunter's Prey"),
      h("div", { class: "pick-grid" }, Object.entries(f.options).map(([k, t]) =>
        h("button", { class: "pick", "aria-pressed": c.huntersPrey === k ? "true" : "false", onclick: () => update((d) => (d.huntersPrey = k)) }, h("b", null, k), h("span", { class: "small muted" }, t))))));
  }
  const wm = cl.weaponMastery ? cl.weaponMastery[lv - 1] : 0;
  if (wm) {
    const ws = D.equipment.weapons.filter((w) => weaponProficient(w, c, D));
    const picks = c.masteries || [];
    parts.push(h("div", { class: "panel" },
      h("div", { class: "row" }, h("h3", null, "Weapon Mastery"), h("span", { class: "counter" + (picks.length === wm ? " full" : "") }, picks.length + "/" + wm)),
      h("div", { class: "small muted" }, "อาวุธที่เลือกจะใช้ท่าพิเศษ (Mastery) ได้ เลือกอาวุธที่ตัวเองถือจริง"),
      h("div", { class: "chips" }, ws.map((w) => {
        const on = picks.includes(w.id);
        return h("button", { class: "chip", "aria-pressed": on ? "true" : "false", disabled: !on && picks.length >= wm, title: D.equipment.masteries[w.mastery]?.th,
          onclick: () => update((d) => { d.masteries = on ? picks.filter((x) => x !== w.id) : [...picks, w.id]; }) }, w.name + " · " + w.mastery);
      }))));
  }
  if (sp && sp.originFeat) {
    const opts = D.origins.feats.filter((f) => f.cat === "origin" && (f.repeatable || f.id !== bg.feat) && !(f.id.startsWith("magic-initiate") && bg.feat.startsWith("magic-initiate")));
    parts.push(h("div", { class: "panel" }, h("h3", null, "Origin Feat จากมนุษย์ (Versatile)"),
      h("div", { class: "pick-grid" }, opts.map((f) =>
        h("button", { class: "pick", "aria-pressed": c.humanFeat === f.id ? "true" : "false", onclick: () => update((d) => {
          d.humanFeat = f.id; d.skilledPicks = [];
          if (f.id.startsWith("magic-initiate")) d.magicInitiate = { list: f.list, ability: "", cantrips: [], spell: "" };
          else if (!bg.feat.startsWith("magic-initiate")) d.magicInitiate = null;
        }) }, h("b", null, f.name), h("span", { class: "small muted" }, f.th))))));
  }
  const feats = [bg.feat, c.humanFeat].filter(Boolean);
  if (feats.includes("skilled")) {
    const n = 3 * feats.filter((x) => x === "skilled").length;
    const locked = new Set([...bg.skills, ...(c.skills || []), ...(c.speciesSkills || [])]);
    parts.push(h("div", { class: "panel" }, skillChips(c, "skilledPicks", n, Object.keys(D.origins.skills), "Skilled: ทักษะเพิ่ม", locked)));
  }
  const miFeat = feats.find((f) => f.startsWith("magic-initiate"));
  if (miFeat) parts.push(magicInitiatePanel(c, IX.feat[miFeat].list));
  if (cl.features.some((f) => f.choice === "asi" && f.lv <= lv)) parts.push(asiPanel(c));
  return h("div", { class: "work" }, parts);
}
function magicInitiatePanel(c, list) {
  const mi = c.magicInitiate || { list, ability: "", cantrips: [], spell: "" };
  const setMi = (fn) => update((d) => { d.magicInitiate = { ...mi, list, ...fn(mi) }; });
  const can = D.spells.filter((s) => s.level === 0 && s.classes.includes(list));
  const one = D.spells.filter((s) => s.level === 1 && s.classes.includes(list));
  return h("div", { class: "panel" }, h("h3", null, "Magic Initiate (" + list + ")"),
    h("div", { class: "small muted" }, "ได้ Cantrip 2 อย่าง กับเวทเลเวล 1 อีก 1 อย่าง ร่ายฟรีวันละครั้ง (หรือใช้ช่องเวทถ้ามี)"),
    h("div", { class: "fields" },
      h("label", { class: "fld" }, "ค่าที่ใช้ร่าย", h("select", { id: "mi-ab", onchange: (e) => setMi(() => ({ ability: e.target.value })) },
        h("option", { value: "" }, "เลือก…"), ["INT", "WIS", "CHA"].map((a) => h("option", { value: a, selected: mi.ability === a }, a + " " + ABN[a])))),
      h("label", { class: "fld" }, "เวทเลเวล 1", h("select", { id: "mi-sp", onchange: (e) => setMi(() => ({ spell: e.target.value })) },
        h("option", { value: "" }, "เลือก…"), one.map((s) => h("option", { value: s.id, selected: mi.spell === s.id }, s.name))))),
    h("div", { class: "row" }, h("span", { class: "eyebrow" }, "Cantrip"), h("span", { class: "counter" + (mi.cantrips.length === 2 ? " full" : "") }, mi.cantrips.length + "/2")),
    h("div", { class: "chips" }, can.map((s) => {
      const on = mi.cantrips.includes(s.id);
      return h("button", { class: "chip", "aria-pressed": on ? "true" : "false", disabled: !on && mi.cantrips.length >= 2,
        onclick: () => setMi((m) => ({ cantrips: on ? m.cantrips.filter((x) => x !== s.id) : [...m.cantrips, s.id] })) }, s.name);
    })));
}
function asiPanel(c) {
  const p = (c.asi || []).find((x) => x.lv === 4) || { lv: 4, inc: {} };
  const inc = p.inc || {};
  const base = finalScores({ ...c, asi: [] }, D);
  const total = Object.values(inc).reduce((a, b) => a + b, 0);
  const set = (np) => update((d) => { d.asi = [...(d.asi || []).filter((x) => x.lv !== 4), np]; });
  const isGrap = p.feat === "grappler";
  return h("div", { class: "panel" }, h("h3", null, "เลเวล 4: Ability Score Improvement"),
    h("div", { class: "row" },
      h("button", { class: "chip", "aria-pressed": !isGrap ? "true" : "false", onclick: () => set({ lv: 4, inc: {} }) }, "เพิ่มค่าสถานะ 2 แต้ม"),
      h("button", { class: "chip", "aria-pressed": isGrap ? "true" : "false", onclick: () => set({ lv: 4, feat: "grappler", inc: { STR: 1 } }) }, "Feat: Grappler (+1 STR หรือ DEX)")),
    !isGrap ? [h("div", { class: "counter" + (total === 2 ? " full" : "") }, "ใช้ไป " + total + "/2 (ค่าสูงสุด 20)"),
      h("div", { class: "abil" }, ABILITIES.map((a) => h("div", { class: "ab" }, h("span", { class: "k" }, a), h("span", { class: "num" }, base[a] + (inc[a] ? " → " + (base[a] + inc[a]) : "")),
        h("div", { class: "step" },
          h("button", { "aria-label": "ลด " + a, disabled: !inc[a], onclick: () => set({ lv: 4, inc: { ...inc, [a]: inc[a] - 1 } }) }, "−"),
          h("button", { "aria-label": "เพิ่ม " + a, disabled: total >= 2 || base[a] + (inc[a] || 0) >= 20, onclick: () => set({ lv: 4, inc: { ...inc, [a]: (inc[a] || 0) + 1 } }) }, "+")))))]
      : h("div", { class: "row" }, ["STR", "DEX"].map((a) => h("button", { class: "chip", "aria-pressed": inc[a] ? "true" : "false", onclick: () => set({ lv: 4, feat: "grappler", inc: { [a]: 1 } }) }, "+1 " + a)),
        h("span", { class: "small muted" }, IX.feat.grappler.th)));
}

// step 6: spells
function spellRow(s, opts) {
  const open = S.openSpell === s.id;
  const tags = [s.time.split(",")[0], s.range, s.concentration ? "Conc." : null, s.ritual ? "Ritual" : null].filter(Boolean).join(" · ");
  return h("div", { class: "sp" },
    opts.locked ? h("span", { title: "เตรียมไว้เสมอ", class: "die" }, "★")
      : h("input", { type: "checkbox", id: (opts.key || "s") + "-" + s.id, checked: opts.checked, disabled: opts.disabled, "aria-label": s.name, onchange: opts.onchange }),
    h("button", { class: "nm", "aria-expanded": open ? "true" : "false", onclick: () => { S.openSpell = open ? null : s.id; render(); } },
      h("b", null, s.name), " ", h("span", { class: "small muted" }, (s.level ? "Lv" + s.level + " " : "Cantrip ") + s.school)),
    h("span", { class: "meta" }, tags),
    open && h("div", { class: "txt" }, h("div", { class: "small muted num" }, "Components " + s.components + " · Duration " + s.duration), s.text.map((p) => h("p", null, p))));
}
function stepSpells(c) {
  const cl = IX.cls[c.classId];
  if (!cl) return h("div", { class: "panel" }, h("h2", null, "เวทมนตร์"), h("p", { class: "muted" }, "เลือกคลาสก่อน"));
  const sh = safeSheet(c);
  const ci = sh && sh.casting.find((x) => x.source === cl.name);
  if (!ci) return h("div", { class: "panel" }, h("div", { class: "eyebrow" }, "ขั้นที่ 6"), h("h2", null, "เวทมนตร์"),
    h("p", { class: "muted" }, cl.name + " ไม่ใช้เวทจากคลาส ข้ามขั้นนี้ได้เลย" + (c.magicInitiate ? " (เวทจาก Magic Initiate เลือกในขั้นทักษะแล้ว)" : "")));
  const list = D.spells.filter((s) => s.classes.includes(ci.list));
  const always = new Set(sh.alwaysPrepared);
  const parts = [h("div", { class: "panel" },
    h("div", null, h("div", { class: "eyebrow" }, "ขั้นที่ 6"), h("h2", null, "เวทมนตร์ของ " + cl.name)),
    h("div", { class: "row small" },
      h("span", { class: "tag num" }, "Spell DC " + ci.dc), h("span", { class: "tag num" }, "Spell attack " + fmt(ci.attack)),
      h("span", { class: "tag num" }, "ช่องเวท " + ci.slots.map((n, i) => "Lv" + (i + 1) + "×" + n).join(" ")),
      h("span", { class: "tag" }, "ใช้ค่า " + ci.ability)),
    h("div", { class: "small muted" }, "กดชื่อเวทเพื่ออ่านรายละเอียด (ภาษาอังกฤษจาก SRD)"))];
  const toggle = (field, id, on) => update((d) => { const a = d[field] || []; d[field] = on ? a.filter((x) => x !== id) : [...a, id]; if (field === "spellbook" && on) d.spells = (d.spells || []).filter((x) => x !== id); });
  if (ci.cantripsKnown) {
    const picks = c.cantrips || [];
    parts.push(h("div", { class: "panel" }, h("div", { class: "row" }, h("h3", null, "Cantrip"), h("span", { class: "counter" + (picks.length === ci.cantripsKnown ? " full" : picks.length > ci.cantripsKnown ? " over" : "") }, picks.length + "/" + ci.cantripsKnown)),
      h("div", { class: "spells" }, list.filter((s) => s.level === 0).map((s) => { const on = picks.includes(s.id);
        return spellRow(s, { key: "can", checked: on, disabled: !on && picks.length >= ci.cantripsKnown, onchange: () => toggle("cantrips", s.id, on) }); }))));
  }
  const ranked = list.filter((s) => s.level >= 1 && s.level <= ci.maxSpellLevel);
  if (ci.spellbookSize) {
    const book = c.spellbook || [];
    parts.push(h("div", { class: "panel" }, h("div", { class: "row" }, h("h3", null, "สมุดเวท"), h("span", { class: "counter" + (book.length === ci.spellbookSize ? " full" : "") }, book.length + "/" + ci.spellbookSize)),
      h("div", { class: "small muted" }, "Wizard จดเวทลงสมุด แล้วเลือกเตรียมจากในสมุดเท่านั้น"),
      lvFilter(ci.maxSpellLevel),
      h("div", { class: "spells" }, ranked.filter((s) => S.spellLv === "all" || s.level === +S.spellLv).map((s) => { const on = book.includes(s.id);
        return spellRow(s, { key: "book", checked: on, disabled: !on && book.length >= ci.spellbookSize, onchange: () => toggle("spellbook", s.id, on) }); }))));
  }
  const prep = c.spells || [];
  const prepFrom = ci.spellbookSize ? ranked.filter((s) => (c.spellbook || []).includes(s.id)) : ranked;
  parts.push(h("div", { class: "panel" }, h("div", { class: "row" }, h("h3", null, "เวทที่เตรียมไว้"), h("span", { class: "counter" + (prep.length === ci.preparedMax ? " full" : prep.length > ci.preparedMax ? " over" : "") }, prep.length + "/" + ci.preparedMax)),
    h("div", { class: "small muted" }, "เปลี่ยนเวทที่เตรียมได้ทุกครั้งที่พักยาว · ★ คือเวทที่เตรียมไว้เสมอ ไม่นับโควตา"),
    !ci.spellbookSize && lvFilter(ci.maxSpellLevel),
    h("div", { class: "spells" },
      [...always].map((id) => IX.spell[id]).filter((s) => s && s.level > 0).map((s) => spellRow(s, { locked: true })),
      prepFrom.filter((s) => !always.has(s.id) && (ci.spellbookSize || S.spellLv === "all" || s.level === +S.spellLv)).map((s) => { const on = prep.includes(s.id);
        return spellRow(s, { key: "prep", checked: on, disabled: !on && prep.length >= ci.preparedMax, onchange: () => toggle("spells", s.id, on) }); }),
      ci.spellbookSize && !prepFrom.length ? h("div", { class: "sp" }, h("span"), h("span", { class: "muted small" }, "ยังไม่มีเวทในสมุด เลือกสมุดเวทด้านบนก่อน")) : null)));
  return h("div", { class: "work" }, parts);
}
function lvFilter(max) {
  return h("div", { class: "chips" }, ["all", ...Array.from({ length: max }, (_, i) => String(i + 1))].map((v) =>
    h("button", { class: "chip", "aria-pressed": S.spellLv === v ? "true" : "false", onclick: () => { S.spellLv = v; render(); } }, v === "all" ? "ทุกเลเวล" : "เลเวล " + v)));
}

// step 7: equipment
function stepEquipment(c) {
  const cl = IX.cls[c.classId], bg = IX.bg[c.backgroundId];
  if (!cl || !bg) return h("div", { class: "panel" }, h("h2", null, "อุปกรณ์"), h("p", { class: "muted" }, "เลือกคลาสและพื้นเพก่อน"));
  const pick = c.equipPick || { cls: "A", bg: "A" };
  const apply = (np) => update((d) => { d.equipPick = np; Object.assign(d, startingInventory(d, D, np.cls, np.bg)); });
  const itemsTxt = (arr) => arr.map(([id, q]) => (q > 1 ? q + "× " : "") + iname(id)).join(", ");
  const parts = [h("div", { class: "panel" },
    h("div", null, h("div", { class: "eyebrow" }, "ขั้นที่ 7"), h("h2", null, "อุปกรณ์เริ่มต้น")),
    h("div", { class: "eyebrow" }, "ชุดจากคลาส " + cl.name),
    h("div", { class: "pick-grid" }, Object.entries(cl.equip).map(([k, p]) =>
      h("button", { class: "pick", "aria-pressed": c.inventory.length && pick.cls === k ? "true" : "false", onclick: () => apply({ ...pick, cls: k }) },
        h("b", null, "ชุด " + k), h("span", { class: "small" }, p.items.length ? itemsTxt(p.items) : "ไม่เอาของ รับเงินแทน"), h("span", { class: "small num muted" }, p.gp + " GP")))),
    h("div", { class: "eyebrow" }, "ชุดจากพื้นเพ " + bg.name),
    h("div", { class: "pick-grid" },
      h("button", { class: "pick", "aria-pressed": c.inventory.length && pick.bg === "A" ? "true" : "false", onclick: () => apply({ ...pick, bg: "A" }) },
        h("b", null, "ชุด A"), h("span", { class: "small" }, itemsTxt(bg.equip.A)), h("span", { class: "small num muted" }, bg.equip.Agp + " GP")),
      h("button", { class: "pick", "aria-pressed": c.inventory.length && pick.bg === "B" ? "true" : "false", onclick: () => apply({ ...pick, bg: "B" }) },
        h("b", null, "ชุด B"), h("span", { class: "small" }, "รับเงินแทน"), h("span", { class: "small num muted" }, bg.equip.Bgp + " GP"))),
    !c.inventory.length && h("button", { class: "btn primary", onclick: () => apply(pick) }, "รับชุด A + A"))];
  if (c.inventory.length) parts.push(inventoryPanel(c, true));
  return h("div", { class: "work" }, parts);
}
function inventoryPanel(c, editable) {
  return h("div", { class: "panel" }, h("div", { class: "row" }, h("h3", null, "กระเป๋า"), h("span", { class: "tag num" }, c.gp + " GP")),
    h("div", { class: "tbl" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "ของ"), h("th", null, "จำนวน"), h("th", null, "รายละเอียด"), editable && h("th", null, "สวมใส่"))),
      h("tbody", null, c.inventory.map((x, i) => {
        const it = IX.items[x.id] || { name: x.id };
        const det = it.kind === "weapon" ? it.dmg + " " + it.dtype + (it.props.length ? " · " + it.props.join(", ") : "")
          : it.kind === "armor" ? (it.cat === "shield" ? "+2 AC" : "AC " + it.ac + (it.dex ? (it.dexMax !== undefined ? " + DEX (สูงสุด " + it.dexMax + ")" : " + DEX") : "")) : "";
        return h("tr", null, h("td", null, it.name), h("td", { class: "num" }, x.qty), h("td", { class: "small muted" }, det),
          editable && h("td", null, it.kind === "armor" ? h("input", { type: "checkbox", id: "eq-" + i, checked: x.equipped, "aria-label": "สวม " + it.name,
            onchange: () => update((d) => {
              const inv = d.inventory; const now = !inv[i].equipped;
              if (now) inv.forEach((y) => { const yi = IX.items[y.id]; if (yi && yi.kind === "armor" && (yi.cat === "shield") === (it.cat === "shield")) y.equipped = false; });
              inv[i].equipped = now;
            }) }) : ""));
      })))));
}

// step 8: identity
function stepIdentity(c) {
  const live = (field) => (e) => { c[field] = e.target.value; };
  const langs = D.origins.languages.standard.filter((l) => l !== "Common");
  const extra = (c.languages || []).filter((l) => l !== "Common");
  return h("div", { class: "work" }, h("div", { class: "panel" },
    h("div", null, h("div", { class: "eyebrow" }, "ขั้นที่ 8"), h("h2", null, "ชื่อและตัวตน")),
    h("div", { class: "fields" },
      h("label", { class: "fld" }, "ชื่อตัวละคร", h("input", { type: "text", id: "f-name", value: c.name, maxlength: 60, oninput: live("name"), onchange: () => render() })),
      h("label", { class: "fld" }, "ชื่อผู้เล่น", h("input", { type: "text", id: "f-player", value: c.player, maxlength: 40, oninput: live("player") })),
      h("label", { class: "fld" }, "Alignment", h("select", { id: "f-align", onchange: live("alignment") }, h("option", { value: "" }, "เลือก…"), ALIGN.map((a) => h("option", { value: a, selected: c.alignment === a }, a))))),
    h("div", null, h("div", { class: "row", style: "margin-bottom:6px" }, h("span", { class: "eyebrow" }, "ภาษา: Common + เลือก 2"), h("span", { class: "counter" + (extra.length === 2 ? " full" : "") }, extra.length + "/2")),
      h("div", { class: "chips" }, langs.map((l) => { const on = extra.includes(l);
        return h("button", { class: "chip", "aria-pressed": on ? "true" : "false", disabled: !on && extra.length >= 2,
          onclick: () => update((d) => { d.languages = ["Common", ...(on ? extra.filter((x) => x !== l) : [...extra, l])]; }) }, l); }))),
    h("label", { class: "fld" }, "หน้าตา", h("textarea", { id: "f-look", oninput: live("appearance") }, c.appearance)),
    h("label", { class: "fld" }, "ประวัติ", h("textarea", { id: "f-story", oninput: live("backstory"), style: "min-height:150px" }, c.backstory)),
    h("div", { class: "row" }, portraitEl(c, true),
      h("div", { style: "display:flex;flex-direction:column;gap:8px;min-width:0;flex:1" },
        h("span", { class: "eyebrow" }, "รูปตัวละคร"),
        h("div", { class: "row" },
          h("label", { class: "btn", for: "f-pic" }, "เลือกรูป…"),
          h("input", { type: "file", id: "f-pic", accept: "image/*", hidden: true, onchange: (e) => loadPortrait(e.target.files[0]) }),
          c.portrait && h("button", { class: "btn ghost", onclick: () => update((d) => (d.portrait = "")) }, "เอารูปออก")),
        h("span", { class: "small muted" }, "รูปจะถูกย่อเหลือ 256 พิกเซลแล้วเก็บไว้ในการ์ด"))),
    c.portraitPrompt && h("label", { class: "fld" }, "Prompt สำหรับเจนรูป (คัดลอกไปใช้ใน gen-images ได้)",
      h("textarea", { id: "f-prompt", readonly: true, style: "min-height:70px" }, c.portraitPrompt))));
}
function loadPortrait(file) {
  if (!file) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const k = Math.max(s / img.width, s / img.height), w = img.width * k, hh = img.height * k;
    cv.getContext("2d").drawImage(img, (s - w) / 2, (s - hh) / 2, w, hh);
    URL.revokeObjectURL(url);
    update((d) => (d.portrait = cv.toDataURL("image/jpeg", 0.82)));
  };
  img.onerror = () => toast("เปิดรูปนี้ไม่ได้ ลองไฟล์ JPG หรือ PNG");
  img.src = url;
}

// ---------- sheet ----------
function viewSheet(card) {
  const sh = safeSheet(card);
  if (!sh) return h("div", { class: "panel" }, h("p", null, "การ์ดนี้ยังสร้างไม่ครบ"), h("button", { class: "btn primary", onclick: () => editCard(card) }, "แก้ต่อ"));
  const errs = validate(card, D);
  const sp = IX.species[card.speciesId];
  const nextXp = sh.xpNext;
  const prevXp = xpForLevel(card.level, D);
  const pct = nextXp ? Math.min(100, ((card.xp - prevXp) / (nextXp - prevXp)) * 100) : 100;
  const canLevel = nextXp && card.xp >= nextXp;
  const own = !card.premade;
  const ci = sh.casting.find((x) => x.source !== "Magic Initiate");
  const mi = sh.casting.find((x) => x.source === "Magic Initiate");

  const actions = h("div", { class: "row" },
    own ? [
      h("button", { class: "btn primary", disabled: !nextXp, onclick: () => levelUp(card) }, nextXp ? "เลเวลอัปเป็น " + (card.level + 1) : "เลเวลสูงสุดของเฟสนี้"),
      h("button", { class: "btn", onclick: () => { S.xpEdit = !S.xpEdit; render(); } }, "ใส่ EXP"),
      h("button", { class: "btn", onclick: () => editCard(card) }, "แก้ไข"),
      h("button", { class: "btn", onclick: () => downloadCard(card) }, "ดาวน์โหลดการ์ด"),
      h("button", { class: "btn danger", onclick: () => { S.confirmDel = true; render(); } }, "ลบ")]
    : [h("button", { class: "btn primary", onclick: () => adoptPremade(card) }, "ใช้ตัวนี้"), h("button", { class: "btn", onclick: () => editCard(card) }, "เอาไปแก้เป็นตัวของฉัน")]);

  return h("div", { class: "sheet" },
    h("div", { class: "full sheet-head" }, portraitEl(card, true),
      h("div", { style: "min-width:0;flex:1;display:flex;flex-direction:column;gap:6px" },
        h("div", { class: "eyebrow" }, card.premade ? "ตัวสำเร็จรูป" : card.player ? "ผู้เล่น: " + card.player : "การ์ดของฉัน"),
        h("h1", null, card.name),
        h("div", null, classLine(card), card.alignment ? " · " + card.alignment : ""),
        h("div", { class: "row small num" }, h("b", null, "Level " + card.level), h("div", { class: "xpbar", role: "progressbar", "aria-valuenow": Math.round(pct), "aria-valuemin": 0, "aria-valuemax": 100 }, h("i", { style: "width:" + pct + "%" })),
          h("span", { class: "muted" }, card.xp + (nextXp ? " / " + nextXp + " EXP" : " EXP"))),
        errs.length ? h("div", { class: "small", style: "color:var(--danger)" }, "ยังไม่ครบ: " + errs.join(" · ")) : null,
        actions)),
    S.xpEdit && h("div", { class: "full panel" }, h("div", { class: "row" },
      h("label", { class: "fld", style: "max-width:200px" }, "EXP ทั้งหมด", h("input", { type: "number", id: "xp-in", min: 0, value: card.xp })),
      h("button", { class: "btn primary", onclick: async () => {
        const v = Math.max(0, parseInt(document.getElementById("xp-in").value, 10) || 0);
        S.sheet = await saveCard({ ...card, xp: v }); S.xpEdit = false; toast("บันทึก EXP แล้ว"); render();
      } }, "บันทึก"),
      h("span", { class: "small muted" }, "ปกติ DM จะให้ EXP หลังจบการต่อสู้ ใส่เองได้ตรงนี้"))),
    S.confirmDel && h("div", { class: "full confirm" }, h("b", null, "ลบการ์ด " + card.name + " ถาวร?"),
      h("button", { class: "btn danger", onclick: async () => { await deleteCard(card.id); S.sheet = null; toast("ลบแล้ว"); go("shelf"); } }, "ลบเลย"),
      h("button", { class: "btn", onclick: () => { S.confirmDel = false; render(); } }, "ไม่ลบ")),
    S.exportText && h("div", { class: "full panel" }, h("h3", null, "ข้อมูลการ์ด (คัดลอกไปบันทึกเป็นไฟล์ .json)"),
      h("textarea", { class: "json", id: "exp-json", readonly: true }, S.exportText),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: async (e) => {
        const ta = document.getElementById("exp-json");
        try { await navigator.clipboard.writeText(S.exportText); toast("คัดลอกแล้ว"); } catch (err) { ta.select(); toast("เลือกข้อความไว้แล้ว กด Ctrl+C"); }
      } }, "คัดลอก"), h("button", { class: "btn ghost", onclick: () => { S.exportText = null; render(); } }, "ปิด"))),
    canLevel && own && h("div", { class: "full banner" }, "EXP ครบแล้ว! กด “เลเวลอัปเป็น " + (card.level + 1) + "” ได้เลย"),

    h("div", { class: "full bigstats" }, [["AC", sh.ac], ["HP", sh.hpMax], ["Speed", sh.speed + " ft"], ["Initiative", fmt(sh.init)], ["Prof. Bonus", "+" + sh.pb], ["Passive Perc.", sh.passivePerception]]
      .map(([l, v]) => h("div", { class: "stat" }, h("div", { class: "v" }, v), h("div", { class: "l" }, l)))),
    sh.acNotes.length ? h("div", { class: "full small", style: "color:var(--danger)" }, sh.acNotes.join(" · ")) : null,
    h("div", { class: "full abil" }, ABILITIES.map((a) => {
      const sv = sh.saves.find((x) => x.ab === a);
      return h("div", { class: "ab" }, h("span", { class: "k" }, a + " · " + ABN[a]), h("span", { class: "score" }, sh.scores[a]), h("span", { class: "mod" }, fmt(sh.mods[a])),
        h("span", { class: "parts" }, h("span", { class: "pdot" + (sv.prof ? " on" : "") }), "Save " + fmt(sv.bonus)));
    })),
    h("div", { class: "panel" }, h("h3", null, "ทักษะ"),
      h("div", { class: "skills" }, sh.skills.map((s) => h("div", null,
        h("span", null, h("span", { class: "pdot" + (s.expertise ? " ex" : s.prof ? " on" : "") }), s.name, h("span", { class: "muted small" }, " " + s.ab)),
        h("b", { class: "num" }, fmt(s.bonus))))),
      h("div", { class: "small muted" }, "● ชำนาญ · ● สีทอง = Expertise")),
    h("div", { class: "panel" }, h("h3", null, "การโจมตี"),
      sh.attacks.length ? h("div", { class: "tbl" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "อาวุธ"), h("th", null, "ทอยโจมตี"), h("th", null, "ดาเมจ"), h("th", null, "Mastery"))),
        h("tbody", null, sh.attacks.map((a) => h("tr", null,
          h("td", null, a.name, a.range ? h("div", { class: "small muted" }, a.range + " ft") : null, a.notes.length ? h("div", { class: "small", style: "color:var(--danger)" }, a.notes.join(", ")) : null),
          h("td", { class: "num" }, fmt(a.hit), a.prof ? "" : h("div", { class: "small muted" }, "ไม่ชำนาญ")),
          h("td", { class: "num" }, a.dmg + " " + a.dtype, a.versatile ? h("div", { class: "small muted" }, "สองมือ " + a.versatile) : null),
          h("td", { class: "small" }, a.mastery || "–")))))) : h("p", { class: "muted small" }, "ไม่มีอาวุธ"),
      sh.sneakAttack && h("div", { class: "small" }, h("b", null, "Sneak Attack " + sh.sneakAttack), " · ใช้ได้เทิร์นละครั้งเมื่อได้เปรียบหรือมีเพื่อนยืนติดเป้า"),
      Object.keys(sh.resources).length ? h("div", { class: "row" }, Object.values(sh.resources).map((r) => h("span", { class: "tag num" }, r.name + " ×" + r.max))) : null),
    (ci || mi || sh.speciesCantrips.length) && h("div", { class: "full panel" }, h("h3", null, "เวทมนตร์"),
      ci && [h("div", { class: "row small" }, h("span", { class: "tag num" }, "DC " + ci.dc), h("span", { class: "tag num" }, "Attack " + fmt(ci.attack)), h("span", { class: "tag" }, ci.ability),
        h("div", { class: "slots" }, ci.slots.map((n, i) => h("span", { class: "slot" }, "Lv" + (i + 1), Array.from({ length: n }, () => h("i"))))))],
      h("div", { class: "spells" },
        [...(card.cantrips || []), ...sh.speciesCantrips].map((id) => IX.spell[id]).filter(Boolean).map((s) => spellRow(s, { locked: true })),
        [...sh.alwaysPrepared, ...(card.spells || []).filter((x) => !sh.alwaysPrepared.includes(x))].map((id) => IX.spell[id]).filter((s) => s && s.level > 0).map((s) => spellRow(s, { locked: true })),
        mi && card.magicInitiate ? [...card.magicInitiate.cantrips, card.magicInitiate.spell].map((id) => IX.spell[id]).filter(Boolean).map((s) => spellRow(s, { locked: true })) : null),
      card.classId === "wizard" && (card.spellbook || []).length ? h("div", { class: "small muted" }, "สมุดเวท: " + card.spellbook.map(sname).join(", ")) : null,
      mi && h("div", { class: "small muted" }, "Magic Initiate ใช้ " + mi.ability + " (DC " + mi.dc + ", attack " + fmt(mi.attack) + ") ร่ายเวทเลเวล 1 ฟรีวันละครั้ง")),
    h("div", { class: "panel" }, h("h3", null, "ความสามารถของคลาส"),
      h("ul", { class: "feat-list" }, sh.features.map((f) => h("li", null, h("span", { class: "lv" }, "Lv" + f.lv), h("div", null, h("b", null, f.name), h("div", { class: "small muted" }, f.th))))),
      sh.weaponMastery ? h("div", { class: "small" }, "Weapon Mastery: " + (card.masteries || []).map(iname).join(", ")) : null,
      card.fightingStyle && h("div", { class: "small" }, "Fighting Style: " + (IX.feat[card.fightingStyle] || {}).name),
      card.divineOrder && h("div", { class: "small" }, "Divine Order: " + card.divineOrder),
      card.huntersPrey && h("div", { class: "small" }, "Hunter's Prey: " + card.huntersPrey)),
    h("div", { class: "panel" }, h("h3", null, "เผ่าและ Feat"),
      h("ul", { class: "traits" }, sp.traits.map((t) => h("li", null, h("b", null, t.name), " · " + t.th)),
        sh.feats.map((f) => h("li", null, h("b", null, f.name), " · " + f.th))),
      h("div", { class: "small muted" }, "ภาษา: " + (card.languages || []).join(", ") + (sh.darkvision ? " · มองในที่มืด " + sh.darkvision + " ft" : ""))),
    h("div", { class: "full" }, inventoryPanel(card, false)),
    (card.appearance || card.backstory) && h("div", { class: "full panel" }, h("h3", null, "ตัวตน"),
      card.appearance && h("p", { style: "margin:0;max-width:70ch" }, h("b", null, "หน้าตา: "), card.appearance),
      card.backstory && h("p", { style: "margin:0;max-width:70ch" }, card.backstory),
      card.portraitPrompt && h("details", null, h("summary", { class: "small muted" }, "Prompt สำหรับเจนรูป"), h("p", { class: "small num" }, card.portraitPrompt))));
}
function levelUp(card) {
  const next = card.level + 1;
  const need = xpForLevel(next, D);
  if (card.xp < need) {
    S.xpEdit = true; render();
    toast("ต้องมี " + need + " EXP ก่อน (ตอนนี้ " + card.xp + ")"); return;
  }
  const needs = levelUpNeeds(card, D);
  const c = clone(card); c.level = next;
  const cl = IX.cls[c.classId];
  const label = { subclass: "สายย่อย", asi: "เพิ่มค่าสถานะ/Feat", fighting: "Fighting Style", expertise: "Expertise", huntersPrey: "Hunter's Prey", mastery: "อาวุธ Mastery เพิ่ม", spells: "เวทใหม่" };
  const fixed = cl.hitDie / 2 + 1;
  const sc = finalScores(c, D);
  S.draft = c;
  S.banner = h("div", null, h("b", null, "เลเวลอัปเป็น " + next + "! "), "HP เพิ่ม " + Math.max(1, fixed + mod(sc.CON)) + (IX.species[c.speciesId].hpPerLevel ? " +1" : "") + " (ค่าเฉลี่ย d" + cl.hitDie + ")",
    needs.length ? [" · ต้องเลือก: ", needs.map((n) => label[n]).join(", "), ". ทำตามรายการที่ขึ้นสีแดงแล้วกดเซฟการ์ด"] : " · ไม่มีอะไรต้องเลือก กดเซฟการ์ดได้เลย",
    h("div", { class: "small", style: "margin-top:4px" }, "ความสามารถใหม่: " + cl.features.filter((f) => f.lv === next).map((f) => f.name).join(", ")));
  S.step = needs.includes("subclass") ? 1 : needs.some((n) => ["asi", "fighting", "expertise", "huntersPrey", "mastery"].includes(n)) ? 4 : needs.includes("spells") ? 5 : 7;
  go("build");
}
async function downloadCard(card) {
  const text = exportCard(card);
  const fname = (card.name || "card").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-") + ".dndcard.json";
  let dl = null;
  try { dl = window.claude && (await window.claude.use("downloads")); } catch (e) {}
  if (dl) {
    try { await dl.save({ filename: fname, data: text }); toast("บันทึกไฟล์แล้ว"); return; }
    catch (e) { if (e && e.code === "declined") return; }
  }
  S.exportText = text; render();
}

render();
initStore();
