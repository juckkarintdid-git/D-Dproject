// Inlines data + rules engine + app into one HTML page: app/index.html
// Run: node tools/build.mjs
import { readFileSync, writeFileSync } from "node:fs";

const r = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const json = (p) => JSON.stringify(JSON.parse(r(p)));
const data = `const DATA = {classes: ${json("data/classes.json")}, origins: ${json("data/origins.json")}, equipment: ${json("data/equipment.json")}, spells: ${json("data/spells.json")}};
const PREMADES = ${json("data/premades.json")};
const TEMPLATE = ${JSON.stringify(r("character-template.md"))};`;
const engine = r("engine/rules.js").replace(/^export /gm, "");
const app = r("app/src/app.js");
const safe = (s) => s.replace(/<\/script/gi, "<\\/script");
const html = r("app/src/page.html")
  .replace("/*__DATA__*/", () => safe(data))
  .replace("/*__ENGINE__*/", () => safe(engine))
  .replace("/*__APP__*/", () => safe(app));
writeFileSync(new URL("../app/index.html", import.meta.url), html);
console.log("app/index.html", (html.length / 1024).toFixed(0) + " KB");
