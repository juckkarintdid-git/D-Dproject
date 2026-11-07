// ---------- ข้อมูล (rules & how-to reference): how to play, abilities/skills, conditions, classes, origins, spells, gear ----------
const INFO_SECTIONS = [["how", "วิธีเล่น"], ["rules", "กติกาพื้นฐาน"], ["skills", "ความสามารถและทักษะ"], ["conds", "สภาพผิดปกติ"], ["classes", "คลาส"], ["origins", "เผ่าพันธุ์และภูมิหลัง"], ["spells", "เวท"], ["gear", "อาวุธ เกราะ ของใช้"]];
const HOW_TO = [
  ["เตรียมตัว", ["ไปที่หน้า “ตัวละคร” แล้วสร้างตัวละครเอง หรือกด “ใช้ตัวนี้” ที่ตัวสำเร็จรูป", "กลับมาหน้า “เข้าเล่น” แล้วเลือกตัวที่จะใช้เล่น", "สร้างห้อง หรือเข้าห้องที่เพื่อนสร้างไว้ เพื่อนที่เปิดลิงก์เดียวกันจะเห็นห้องเดียวกัน"]],
  ["ในหมู่บ้าน", ["แตะอาคารบนรูปหมู่บ้านเพื่อเข้าไปคุยกับ NPC: โรงเตี๊ยม (พักผ่อน ฟังข่าว) วิหาร (รักษา ชุบชีวิต) ตลาด (ซื้อขายของ) กระดานประกาศ (รับภารกิจ)", "ที่ตลาดกด “ต่อราคากับ Bram” ได้ ถ้าทอยผ่านจะได้ส่วนลดจนกว่าจะออกจากหมู่บ้าน", "กด “ชวนทีมไปที่นี่” ที่กระดานประกาศ เพื่อนทุกคนกดพร้อมแล้วทีมจะออกเดินทาง"]],
  ["สำรวจดันเจียน", ["ผลัดกันเดินคนละ 30 ฟุต (6 ช่อง) ต่อตา แตะช่องที่อยากไป", "โหมด “จับกลุ่ม”: ทั้งทีมเดินไปด้วยกัน ผลัดกันเป็นคนนำเลือกเส้นทาง", "แตะ ✦ เพื่อหาเบาะแส แตะหีบเพื่อเปิด เดินเข้าใกล้ศัตรูจะเริ่มการต่อสู้"]],
  ["ต่อสู้", ["ทุกคนทอย Initiative เรียงลำดับ ถึงตาใครคนนั้นเล่น", "ในตาของคุณ: เดินได้ตามความเร็ว + 1 Action (โจมตี เวท หลบ วิ่ง ฯลฯ) + 1 Bonus Action ถ้ามีท่าที่ใช้ได้", "แถบท่าด้านล่างกดเลขคีย์ 1–6 ได้ กด Enter เพื่อจบตา Esc เพื่อยกเลิก", "“อื่นๆ → 💡 ท่าพิเศษ” พิมพ์อะไรก็ได้ที่อยากทำ เช่น เตะโต๊ะใส่ศัตรู DM (Claude) จะตัดสินว่าต้องทอยอะไรและเกิดอะไรขึ้น", "ศัตรูธรรมดาที่เสียขวัญอาจยอมแพ้หรือหนี บอสสู้จนตัวตาย"]],
  ["คุยกับ DM", ["พิมพ์ในช่องด้านล่างจอว่าจะทำอะไร หรือกดตัวเลือกที่ DM เสนอ", "DM อาจขอให้ทอยเช็กทักษะ ระบบทอยให้และโชว์ลูกเต๋าให้ทุกคนเห็น", "กลับมาเล่นหลังหายไปนาน DM จะสรุป “ครั้งที่แล้ว…” ให้ หรือกด “📖 สรุปเรื่องย่อ” ในแผงเรื่องเล่า"]],
  ["ตาย พัก และเลเวล", ["HP เหลือ 0 จะหมดสติและทอย Death Save ทุกตา สำเร็จ 3 ครั้งรอด พลาด 3 ครั้งตาย", "ตัวละครที่ตายไปชุบชีวิตที่วิหารได้ (เสียเงิน)", "พักสั้นใช้ Hit Dice ฟื้น HP พักยาวที่โรงเตี๊ยมฟื้นทุกอย่าง", "ได้ EXP จากการต่อสู้และภารกิจ ครบแล้วเลเวลอัปในหน้าชีต (สูงสุด Lv 5)"]],
];
const RULES = [
  ["d20 Test", "ทุกอย่างที่ไม่แน่นอนทอย d20 + โบนัส ถ้าได้เท่าหรือมากกว่าเป้า (AC หรือ DC) ถือว่าสำเร็จ"],
  ["ได้เปรียบ / เสียเปรียบ", "ได้เปรียบทอย d20 สองลูกเอาค่าสูง เสียเปรียบเอาค่าต่ำ ถ้ามีทั้งสองอย่างหักล้างกัน DM อาจให้ตามสถานการณ์ เช่น ยืนที่สูง หรือศัตรูมองไม่เห็น"],
  ["AC", "Armor Class ค่าป้องกัน ทอยโจมตีต้องได้เท่าหรือมากกว่า AC ถึงจะโดน"],
  ["DC", "Difficulty Class ความยาก: 10 ง่าย, 15 ปานกลาง, 20 ยาก"],
  ["Proficiency Bonus (PB)", "โบนัสความชำนาญ +2 ที่ Lv 1–4 และ +3 ที่ Lv 5 บวกเมื่อใช้ทักษะ อาวุธ หรือเซฟที่ถนัด"],
  ["คริติคอล", "ทอยโจมตีได้ 20 โดนแน่และทอยลูกเต๋าดาเมจเพิ่มเป็นสองเท่า ทอยได้ 1 พลาดแน่"],
  ["Saving Throw", "ทอยเซฟเพื่อต้านเวทหรือผลร้าย เช่น DEX เซฟหลบลูกไฟ CON เซฟต้านพิษ"],
  ["Action", "โจมตี ร่ายเวท Dash (วิ่งได้อีกเท่าตัว) Disengage (ถอยไม่โดนตีสวน) Dodge (ศัตรูตีเสียเปรียบ) Help (ให้เพื่อนได้เปรียบ) ใช้สิ่งของ"],
  ["Bonus Action / Reaction", "Bonus Action ใช้ได้เมื่อมีท่าที่ระบุว่าเป็น Bonus Reaction ใช้ได้ครั้งเดียวต่อรอบ เช่น ตีสวนศัตรูที่เดินหนีออกจากระยะ (Opportunity Attack)"],
  ["Concentration", "เวทบางอย่างต้องตั้งสมาธิ ร่ายได้ทีละอย่าง ถ้าโดนตีต้องทอย CON เซฟ (DC 10 หรือครึ่งดาเมจ) ไม่งั้นเวทหาย"],
  ["ช่องเวท (Spell Slot)", "เวทเลเวล 1 ขึ้นไปใช้ช่องเวท พักยาวคืนหมด Cantrip ใช้ได้ไม่จำกัด"],
  ["Cover", "ยืนหลังสิ่งกีดขวางครึ่งตัว AC +2 สามในสี่ AC +5"],
];
const CONDS_TH = [
  ["Blinded", "มองไม่เห็น", "เช็กที่ต้องใช้สายตาพลาดอัตโนมัติ ตีเสียเปรียบ คนอื่นตีใส่ได้เปรียบ"],
  ["Charmed", "ถูกมนต์เสน่ห์", "ทำร้ายผู้ร่ายไม่ได้ ผู้ร่ายคุยด้วยได้เปรียบ"],
  ["Deafened", "หูหนวก", "ไม่ได้ยิน เช็กที่ต้องใช้การฟังพลาดอัตโนมัติ"],
  ["Exhaustion", "อ่อนล้า", "ทุกระดับ d20 −2 และความเร็ว −5 ฟุต ระดับ 6 ตาย พักยาวลด 1 ระดับ"],
  ["Frightened", "หวาดกลัว", "ตีและเช็กเสียเปรียบเมื่อมองเห็นต้นเหตุ เดินเข้าใกล้ต้นเหตุไม่ได้"],
  ["Grappled", "ถูกจับยึด", "ความเร็วเป็น 0 ตีตัวอื่นที่ไม่ใช่คนจับเสียเปรียบ"],
  ["Incapacitated", "ไร้ความสามารถ", "ใช้ Action, Bonus Action, Reaction ไม่ได้ เสียสมาธิ"],
  ["Invisible", "ล่องหน", "คนอื่นตีใส่เสียเปรียบ ตัวเองตีได้เปรียบ"],
  ["Paralyzed", "เป็นอัมพาต", "ไร้ความสามารถ ขยับไม่ได้ เซฟ STR/DEX พลาดอัตโนมัติ โดนตีได้เปรียบ ตีในระยะ 5 ฟุตเป็นคริติคอล"],
  ["Petrified", "กลายเป็นหิน", "ไร้ความสามารถ ต้านทานดาเมจทุกชนิด เซฟ STR/DEX พลาดอัตโนมัติ"],
  ["Poisoned", "ติดพิษ", "ตีและเช็กเสียเปรียบ"],
  ["Prone", "ล้มลง", "คลานได้ ลุกใช้ระยะเดินครึ่งหนึ่ง ตีเสียเปรียบ คนติดตัวตีได้เปรียบ คนไกลตีเสียเปรียบ"],
  ["Restrained", "ถูกพันธนาการ", "ความเร็ว 0 ตีเสียเปรียบ โดนตีได้เปรียบ เซฟ DEX เสียเปรียบ"],
  ["Stunned", "มึนงง", "ไร้ความสามารถ เซฟ STR/DEX พลาดอัตโนมัติ โดนตีได้เปรียบ"],
  ["Unconscious", "หมดสติ", "ล้มลง ไร้ความสามารถ เซฟ STR/DEX พลาดอัตโนมัติ โดนตีได้เปรียบ ตีในระยะ 5 ฟุตเป็นคริติคอล"],
];
const ABILITY_USE = { STR: "ตีระยะประชิด ยกของ ปีน ผลัก", DEX: "ยิงธนู อาวุธ Finesse หลบ AC จากเกราะเบา", CON: "HP และการตั้งสมาธิ", INT: "เวทของ Wizard ความรู้ สืบสวน", WIS: "เวทของ Cleric/Ranger การรับรู้ สัญชาตญาณ", CHA: "พูดโน้มน้าว หลอก ขู่ แสดง" };

function viewInfo() {
  const sec = S.infoSec || "how";
  const q = (S.infoQ || "").trim().toLowerCase();
  const search = h("input", { type: "search", class: "info-q", placeholder: "ค้นหา เช่น Prone, Fireball, Stealth", value: S.infoQ || "", "aria-label": "ค้นหาข้อมูล",
    oninput: (e) => { S.infoQ = e.target.value; filterInfo(); } });
  const nav = h("nav", { class: "info-nav", "aria-label": "หัวข้อ" }, INFO_SECTIONS.map(([k, l]) => h("button", { class: "chip", "aria-pressed": sec === k ? "true" : "false", onclick: () => { S.infoSec = k; render(); } }, l)));
  const body = h("div", { class: "info-body", id: "info-body" }, infoSection(sec));
  const page = h("div", { class: "info" },
    h("div", { class: "shelf-head" }, h("div", null, h("div", { class: "eyebrow" }, "ข้อมูลและวิธีเล่น"), h("h2", null, "ทุกอย่างที่ต้องรู้ก่อนลงดันเจียน")), search),
    nav, body);
  if (q) setTimeout(filterInfo, 0);
  return page;
}
// search hides rows that don't contain the query (any element marked data-q)
function filterInfo() {
  const q = (S.infoQ || "").trim().toLowerCase(); const box = document.getElementById("info-body"); if (!box) return;
  let shown = 0;
  box.querySelectorAll("[data-q]").forEach((el) => { const ok = !q || el.textContent.toLowerCase().includes(q); el.hidden = !ok; if (ok) shown++; });
  let none = box.querySelector(".info-none"); if (!none) { none = h("p", { class: "muted info-none" }, "ไม่พบในหัวข้อนี้ ลองเลือกหัวข้ออื่นด้านบน"); box.append(none); }
  none.hidden = shown > 0;
}
const infoTable = (head, rows) => h("div", { class: "tbl" }, h("table", null, h("thead", null, h("tr", null, head.map((x) => h("th", null, x)))), h("tbody", null, rows)));
function infoSection(sec) {
  const O = DATA.origins, E = DATA.equipment;
  if (sec === "how") return h("div", { class: "info-grid" }, HOW_TO.map(([t, list]) => h("section", { class: "panel info-card", "data-q": "" }, h("h3", null, t), h("ol", null, list.map((x) => h("li", null, x))))));
  if (sec === "rules") return h("div", { class: "info-grid" }, RULES.map(([t, d]) => h("section", { class: "panel info-card", "data-q": "" }, h("h3", null, t), h("p", null, d))));
  if (sec === "skills") return h("div", null,
    h("h3", { class: "info-h" }, "ค่าความสามารถ 6 อย่าง"),
    infoTable(["ค่า", "ชื่อ", "ใช้กับ"], Object.entries(O.abilities).map(([k, a]) => h("tr", { "data-q": "" }, h("td", { class: "num" }, k), h("td", null, a.name + " · " + a.th), h("td", null, ABILITY_USE[k] || "")))),
    h("p", { class: "small muted" }, "โบนัส (modifier) = (ค่า − 10) ÷ 2 ปัดลง เช่น 16 → +3, 8 → −1"),
    h("h3", { class: "info-h" }, "ทักษะ 18 อย่าง"),
    infoTable(["ทักษะ", "ใช้ค่า", "ความหมาย"], Object.entries(O.skills).map(([k, s]) => h("tr", { "data-q": "" }, h("td", null, k), h("td", { class: "num" }, s.ab), h("td", null, s.th)))),
    h("p", { class: "small muted" }, "โบนัสทักษะ = โบนัสค่าความสามารถ + PB (ถ้าถนัดทักษะนั้น)"));
  if (sec === "conds") return infoTable(["สภาพ", "ผล"], CONDS_TH.map(([en, th, d]) => h("tr", { "data-q": "" }, h("td", null, h("b", null, en), h("div", { class: "small muted" }, th)), h("td", null, d))));
  if (sec === "classes") return h("div", { class: "info-grid wide" }, DATA.classes.classes.map((c) => h("section", { class: "panel info-card", "data-q": "" },
    h("h3", null, c.name + " · " + c.th), h("p", { class: "small" }, c.role),
    h("div", { class: "row small" }, h("span", { class: "tag num" }, "Hit Die d" + c.hitDie), h("span", { class: "tag" }, "ค่าหลัก " + c.primary.join("/")), h("span", { class: "tag" }, "เซฟ " + c.saves.join("/"))),
    h("details", null, h("summary", null, "ความสามารถ Lv 1–5"), h("ul", { class: "small" }, c.features.filter((f) => f.lv <= 5).map((f) => h("li", null, h("b", null, "Lv " + f.lv + " " + f.name), f.th ? " · " + f.th : "")))),
    (c.subclasses || []).length > 0 && h("details", null, h("summary", null, "สายย่อย (Lv 3)"), h("ul", { class: "small" }, c.subclasses.map((s) => h("li", null, h("b", null, s.name), " · " + (s.th || ""))))))));
  if (sec === "origins") return h("div", null,
    h("h3", { class: "info-h" }, "เผ่าพันธุ์"),
    h("div", { class: "info-grid wide" }, O.species.map((s) => h("section", { class: "panel info-card", "data-q": "" }, h("h3", null, s.name), h("div", { class: "small muted" }, s.th + " · ความเร็ว " + s.speed + " ft" + (s.darkvision ? " · มองในที่มืด " + s.darkvision + " ft" : "")),
      h("ul", { class: "small" }, (s.traits || []).map((t) => h("li", null, h("b", null, t.name), t.th ? " · " + t.th : "")))))),
    h("h3", { class: "info-h" }, "ภูมิหลัง"),
    infoTable(["ภูมิหลัง", "เพิ่มค่า", "ทักษะ", "Feat"], O.backgrounds.map((b) => h("tr", { "data-q": "" }, h("td", null, b.name, h("div", { class: "small muted" }, b.th)), h("td", { class: "num" }, b.abilities.join(" ")), h("td", null, b.skills.join(", ")), h("td", null, ((O.feats || []).find((f) => f.id === b.feat) || { name: b.feat }).name)))));
  if (sec === "spells") {
    const cls = S.infoCls || ""; const lvl = S.infoLv == null ? "" : S.infoLv;
    const list = DATA.spells.filter((s) => (!cls || s.classes.includes(cls)) && (lvl === "" || s.level === +lvl)).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    return h("div", null,
      h("div", { class: "row", style: "margin-bottom:10px" },
        h("select", { "aria-label": "คลาส", onchange: (e) => { S.infoCls = e.target.value; render(); } }, h("option", { value: "" }, "ทุกคลาส"), ["Cleric", "Ranger", "Wizard"].map((c) => h("option", { value: c, selected: cls === c }, c))),
        h("select", { "aria-label": "เลเวลเวท", onchange: (e) => { S.infoLv = e.target.value === "" ? null : e.target.value; render(); } }, h("option", { value: "" }, "ทุกเลเวล"), [0, 1, 2, 3].map((l) => h("option", { value: l, selected: String(lvl) === String(l) }, l ? "Lv " + l : "Cantrip"))),
        h("span", { class: "small muted" }, list.length + " เวท")),
      h("div", { class: "spell-list" }, list.map((s) => h("details", { class: "panel spell-row", "data-q": "" },
        h("summary", null, h("b", null, s.name), h("span", { class: "small muted" }, " · " + (s.level ? "Lv " + s.level : "Cantrip") + " · " + s.school + " · " + s.classes.join("/") + (s.concentration ? " · สมาธิ" : ""))),
        h("div", { class: "small num" }, s.time + " · ระยะ " + s.range + " · " + s.duration + " · " + s.components),
        (s.text || []).map((p) => h("p", { class: "small" }, p))))));
  }
  if (sec === "gear") {
    const money = (c) => (c >= 1 ? c + " GP" : Math.round(c * 10) >= 1 ? Math.round(c * 10) + " SP" : Math.round(c * 100) + " CP");
    return h("div", null,
      h("h3", { class: "info-h" }, "อาวุธ"),
      infoTable(["อาวุธ", "ดาเมจ", "คุณสมบัติ", "Mastery", "ราคา"], E.weapons.map((w) => h("tr", { "data-q": "" }, h("td", null, w.name, h("div", { class: "small muted" }, w.cat + " " + w.type)), h("td", { class: "num" }, w.dmg + " " + w.dtype), h("td", { class: "small" }, (w.props || []).join(", ")), h("td", null, w.mastery || ""), h("td", { class: "num" }, money(w.cost))))),
      h("h3", { class: "info-h" }, "คุณสมบัติอาวุธ"),
      infoTable(["คุณสมบัติ", "ผล"], Object.entries(E.weaponProperties).map(([k, v]) => h("tr", { "data-q": "" }, h("td", null, k), h("td", null, v)))),
      h("h3", { class: "info-h" }, "Weapon Mastery"),
      infoTable(["Mastery", "ผล"], Object.entries(E.masteries).map(([k, v]) => h("tr", { "data-q": "" }, h("td", null, k), h("td", null, v.th || v.en)))),
      h("h3", { class: "info-h" }, "เกราะ"),
      infoTable(["เกราะ", "AC", "ราคา"], E.armor.map((a) => h("tr", { "data-q": "" }, h("td", null, a.name, h("div", { class: "small muted" }, a.cat)), h("td", { class: "num" }, a.cat === "shield" ? "+2" : a.ac + (a.dex ? (a.cat === "medium" ? " + DEX (สูงสุด 2)" : " + DEX") : "") + (a.stealthDis ? " · Stealth เสียเปรียบ" : "")), h("td", { class: "num" }, money(a.cost))))),
      h("h3", { class: "info-h" }, "ของใช้"),
      infoTable(["ของ", "ราคา"], E.gear.map((g) => h("tr", { "data-q": "" }, h("td", null, g.name), h("td", { class: "num" }, money(g.cost))))));
  }
  return h("div");
}
