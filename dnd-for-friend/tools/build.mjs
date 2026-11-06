// Inlines data + engines + app into one HTML page: app/index.html
// Run: node tools/build.mjs
import { readFileSync, writeFileSync } from "node:fs";

const r = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const json = (p) => JSON.stringify(JSON.parse(r(p)));
const data = `const DATA = {classes: ${json("data/classes.json")}, origins: ${json("data/origins.json")}, equipment: ${json("data/equipment.json")}, spells: ${json("data/spells.json")}, monsters: ${json("data/monsters.json")}};
const PREMADES = ${json("data/premades.json")};
const CAMPAIGN = ${json("data/campaign.json")};
const TEMPLATE = ${JSON.stringify(r("character-template.md"))};`;
const strip = (s) => s.replace(/^import[\s\S]*?from\s+"[^"]+";?[ \t]*$/gm, "").replace(/^export /gm, "");
const engine = ["engine/rules.js", "engine/combat.js", "engine/ai.js"].map((p) => "// ---- " + p + " ----\n" + strip(r(p))).join("\n");
const app = ["app/src/app.js", "app/src/play.js", "app/src/play-ui.js"].map(r).join("\n");
const safe = (s) => s.replace(/<\/script/gi, "<\\/script");
const html = r("app/src/page.html")
  .replace("/*__DATA__*/", () => safe(data))
  .replace("/*__ENGINE__*/", () => safe(engine))
  .replace("/*__APP__*/", () => safe(app));
writeFileSync(new URL("../app/index.html", import.meta.url), html);
console.log("app/index.html", (html.length / 1024).toFixed(0) + " KB");
