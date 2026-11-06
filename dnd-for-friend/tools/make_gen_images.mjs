// Builds gen-images.html (image maker page) from the game data: premade portraits, campaign monster tokens, world map, battle maps.
// Run: node tools/make_gen_images.mjs
import { readFileSync, writeFileSync } from "node:fs";
const r = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const premades = JSON.parse(r("data/premades.json"));
const camp = JSON.parse(r("data/campaign.json"));
const mons = Object.fromEntries(JSON.parse(r("data/monsters.json")).map((m) => [m.id, m]));

const LOOK = {
  "wolf": "a lean gray wolf with bared fangs", "goblin-minion": "a scrawny green goblin with a rusty knife and ragged hood",
  "goblin-warrior": "a goblin warrior with a scimitar, small round shield and leather armor", "goblin-boss": "a hulking goblin chieftain with a crown of bones, chain shirt and heavy scimitar",
  "skeleton": "an animated human skeleton with a notched shortsword and glowing blue eye sockets", "zombie": "a shambling rotting zombie in torn burial clothes",
  "swarm-of-rats": "a writhing swarm of dozens of black rats", "ghoul": "a gaunt gray ghoul with long claws and a hungry grin",
  "ghast": "a ghast in tattered priest robes with ashen skin, sharp claws and a putrid green aura", "bandit": "a hooded human bandit with a scimitar and light crossbow",
  "scout": "a sharp-eyed scout in a green cloak with a longbow", "tough": "a burly thug with a mace and studded leather armor",
  "bandit-captain": "a scarred bandit captain with a red bandana, scimitar and dagger, fine but dirty coat",
  "cultist": "a cultist in an ash-gray robe with a three-pronged flame symbol", "magma-mephit": "a small impish creature of molten rock and dripping magma",
  "cultist-fanatic": "a fanatical cult leader in ash-gray and ember-red robes holding a flaming dagger", "hell-hound": "a black hound wreathed in fire with smoldering red eyes",
  "red-dragon-wyrmling": "a young red dragon with crimson scales, horned head and smoke curling from its nostrils",
};
const images = [];
for (const p of premades) images.push({ group: "portrait", name: "portrait-" + p.id, label: p.name, ratio: "1:1",
  prompt: (p.portraitPrompt || `Fantasy portrait of ${p.name}`) + ". Head and shoulders, centered, plain dark background." });
const ids = [...new Set(Object.values(camp.maps).flatMap((m) => Object.values(m.encounters).flatMap((e) => e.monsters.map((x) => x[0]))))];
for (const id of ids) images.push({ group: "token", name: "token-" + id, label: mons[id].name + " · CR " + mons[id].crText, ratio: "1:1",
  prompt: `Circular top-down tabletop token of ${LOOK[id] || mons[id].name}, viewed from directly above at a slight angle, centered inside a thin dark round frame, transparent-looking plain light gray background outside the circle.` });
const locs = camp.world.locations.map((l) => `${l.name} (${l.type === "town" ? "a small log village by a stream" : l.id === "hollow" ? "a thorny forest hollow" : l.id === "crypt" ? "an old crypt in a misty graveyard" : l.id === "tower" ? "a red stone tower on a sea cliff" : "a black volcanic spire with smoke"}) at ${l.x}% from the left and ${l.y}% from the top`).join("; ");
images.push({ group: "world", name: "map-world", label: "Ember Vale world map", ratio: "16:9",
  prompt: `Hand-painted fantasy overland map of a valley called Ember Vale, parchment style seen from above. Places: ${locs}. Dirt roads connect the village to the forest hollow, the crypt and the tower, and the hollow and tower to the volcanic spire. A river runs across the lower third. Mountains in the north. Leave the place markers unlabeled (the game draws its own pins and names).` });
const THEME = {
  cave: "a dark earthen cave and forest hollow with roots, rocks, campfire remains and bones",
  crypt: "an ancient stone crypt with cracked flagstones, sarcophagi, candles with black flames and cobwebs",
  ruins: "a ruined red stone watchtower courtyard on a cliff with grass, crates, tents and rubble",
  volcanic: "a volcanic obsidian spire interior with glowing lava channels, ash and cult banners",
};
for (const [id, m] of Object.entries(camp.maps)) images.push({ group: "map", name: "map-" + id, label: m.name + " · " + m.th, ratio: "3:2", map: id,
  prompt: `Top-down tabletop battle map of ${THEME[m.theme] || m.theme}: ${m.name}. ${m.final ? "A huge circular lair at the summit with a dragon hoard of gold. " : ""}Readable floor texture, clear contrast between walls and floor.` });
const maps = Object.fromEntries(Object.entries(camp.maps).map(([id, m]) => [id, m.rows]));
const html = r("tools/gen-images.template.html").replace("/*__IMAGES__*/[]", JSON.stringify(images)).replace("/*__MAPS__*/{}", JSON.stringify(maps));
writeFileSync(new URL("../gen-images.html", import.meta.url), html);
console.log("gen-images.html", images.length, "images");
