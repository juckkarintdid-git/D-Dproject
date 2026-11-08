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
  "ghast": "a ghast in tattered priest robes with ashen skin, sharp claws and a putrid green aura", "bandit": "a rough unshaven human bandit with no hood, a dirty red-brown scarf over the lower face, patched brown leather jerkin, scimitar in hand and a light crossbow on the back (NOT green, NOT a cloak, must look different from a scout)",
  "scout": "a sharp-eyed scout in a green cloak with a longbow", "tough": "a burly thug with a mace and studded leather armor",
  "bandit-captain": "a scarred bandit captain with a red bandana, scimitar and dagger, fine but dirty coat",
  "cultist": "a cultist in an ash-gray robe with a three-pronged flame symbol", "magma-mephit": "a small impish creature of molten rock and dripping magma",
  "cultist-fanatic": "a fanatical cult leader in ash-gray and ember-red robes holding a flaming dagger", "hell-hound": "a black hound wreathed in fire with smoldering red eyes",
  "red-dragon-wyrmling": "a young red dragon with crimson scales, horned head and smoke curling from its nostrils",
};
const images = [];
// Town NPCs: shown full height on the left when a player enters a building (background = that building's interior map).
const NPC_TAIL = " Waist-up character portrait, facing slightly toward the viewer, warm candle and lantern light, softly blurred dark background, painted like a fantasy RPG visual novel character.";
const NPCS = [
  ["npc-maren", "Sister Maren · วิหาร", "Sister Maren, a kind middle-aged human priestess of a dawn goddess, warm brown skin, gentle smile, silver-streaked dark hair under a cream hood, white and gold robes with a sunrise emblem on the chest, holding a small glowing lantern"],
  ["npc-pell", "Old Pell · โรงเตี๊ยม", "Old Pell, a very old halfling storyteller sitting by a tavern hearth, bushy white eyebrows, twinkling eyes, long pipe with a curl of smoke, patched green waistcoat, mug of ale, leaning in as if telling a secret about a dragon"],
  ["npc-bram", "Bram · ตลาด", "Bram, a grumpy stout dwarf shopkeeper with a braided red-brown beard, leather apron full of tools, one eyebrow raised, arms crossed, shelves of potions, rope and weapons behind him"],
  ["npc-oswin", "Mayor Oswin Hale · กระดานประกาศ", "Mayor Oswin Hale, a worried but kind human village mayor in his fifties, round face, receding gray hair, tired eyes, plain brown coat with a brass chain of office, holding a crumpled missing-persons notice"],
  ["npc-hilda", "Hilda Emberheart · โรงตีเหล็ก", "Hilda Emberheart, a loud proud female dwarf blacksmith, broad shoulders, soot-smudged ruddy face, big grin, thick copper-red braids tied back, leather apron over a sleeveless shirt, heavy forging hammer resting on her shoulder, glowing anvil and sparks behind her"],
  ["npc-mirelle", "Mirelle Quickdraught · ร้านยา", "Mirelle Quickdraught, an excitable young female gnome alchemist, wild lavender hair poking out under brass goggles pushed up on her forehead, big curious eyes, purple-stained fingers holding up a bubbling glowing green flask, patched violet coat with many pockets of vials"],
  ["npc-garrick", "Garrick Hale · คอกม้าและคาราวาน", "Garrick Hale, a quiet weathered human caravan master in his forties, short gray-brown beard, kind tired eyes, wide-brimmed dusty hat, long brown travel coat, coiled whip and reins in one hand, a horse's head beside him in the stable"],
  ["npc-sable", "Sable · ตลาดโคมกลางคืน", "Sable, a mysterious night-market trader of unknown race wearing an ornate white porcelain half-mask shaped like a paper lantern, dark hooded robe embroidered with tiny gold stars, holding a glowing blue paper lantern, sly smile, night fog and floating lanterns behind"],
];
for (const [name, label, look] of NPCS) images.push({ group: "npc", name, label, ratio: "3:4", prompt: look + "." + NPC_TAIL });
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
for (const [id, m] of Object.entries({})) images.push({ group: "map", name: "map-" + id, label: m.name + " · " + m.th, ratio: "3:2", map: id,
  prompt: `Top-down tabletop battle map of ${THEME[m.theme] || m.theme}: ${m.name}. ${m.final ? "A huge circular lair at the summit with a dragon hoard of gold. " : ""}Readable floor texture, clear contrast between walls and floor.` });
const maps = Object.fromEntries(Object.entries({ ...camp.maps, ...(camp.fields || {}) }).map(([id, m]) => [id, m.rows]));
// Welcome art for the home page (text is overlaid at the bottom-left, keep that area calm and darker)
images.push({ group: "welcome", name: "welcome", label: "รูปต้อนรับหน้าเข้าเล่น", ratio: "16:9",
  prompt: "Epic wide establishing shot of Ember Vale at dusk: a cozy log village with warm lit windows by a stream in the foreground left, a dark thorny forest in the middle, a red stone tower on a sea cliff to the right, and far away a black volcanic spire glowing with lava and smoke where a red dragon silhouette circles. Five adventurers seen from behind on a hill in the lower right (a dwarf fighter with a greatsword, a halfling rogue, a human cleric with a shining shield, an elf ranger with a bow, a gnome wizard with a staff light). Cinematic painted fantasy key art, warm amber and teal palette, the lower-left third is darker and simpler so title text can sit there." });
// Map objects drawn on battle maps
images.push({ group: "object", name: "obj-chest", label: "หีบสมบัติบนแผนที่", ratio: "1:1",
  prompt: "A single small closed wooden treasure chest with iron bands and a gold lock, seen from directly above at a slight angle like a tabletop map prop, centered, filling most of the frame, plain flat dark brown background, soft warm light, no shadow outside the chest." });
images.push({ group: "object", name: "obj-trap", label: "กับดักที่เจอแล้ว", ratio: "1:1",
  prompt: "A single armed bear trap with open iron jaws and a pressure plate, seen from directly above like a tabletop map prop, centered, filling most of the frame, plain flat dark brown background, small red warning glow around it, no shadow outside the object." });
images.push({ group: "object", name: "obj-clue", label: "จุดเบาะแส (✦)", ratio: "1:1",
  prompt: "A small pile of mysterious clues on the floor: a torn parchment note, a broken amulet and footprints in dust, softly glowing with golden sparkles, seen from directly above like a tabletop map prop, centered, plain flat dark brown background, no shadow outside the objects." });
// Story scenes: full-screen when the campaign ends or the party is defeated (text sits at the bottom, keep it darker)
images.push({ group: "scene", name: "scene-victory", label: "ฉากจบ · ชนะมังกร", ratio: "16:9",
  prompt: "Triumphant fantasy key art at sunrise: five adventurers (a dwarf fighter with a greatsword, a halfling rogue, a human cleric with a shining shield, an elf ranger with a bow, a gnome wizard with a staff) stand on the summit of a black volcanic spire beside the slain body of a young red dragon, ash drifting, the lava cooling, golden morning light breaking through smoke over a green valley with a small log village far below. Cinematic painted style, warm gold and teal palette, the bottom third darker and simpler for text." });
images.push({ group: "scene", name: "scene-win", label: "การ์ดชนะการต่อสู้", ratio: "16:9",
  prompt: "Victorious fantasy adventurers after a battle in a torch-lit dungeon: a dwarf fighter raising a greatsword, a halfling rogue flipping a gold coin, an elf ranger lowering her bow, a gnome wizard with sparks fading from his staff, a human cleric smiling, defeated goblins and scattered gold coins around them, warm golden light and floating embers. Cinematic painted style, centered composition, no text." });
images.push({ group: "scene", name: "scene-death", label: "การ์ดผู้เล่นเสียชีวิต", ratio: "16:9",
  prompt: "Somber fantasy scene: a fallen adventurer's sword planted in the stone floor of a dark dungeon with a cloak draped over its hilt, a single ray of pale light from above, drifting dust and a few red petals, cold blue and deep red palette, quiet and respectful mood, the center lower area simple and dark for a round portrait overlay. Cinematic painted style, no people visible, no text." });
images.push({ group: "scene", name: "scene-defeat", label: "ฉากแพ้ · ตื่นที่วิหาร", ratio: "16:9",
  prompt: "Quiet fantasy scene inside a small stone temple of a dawn goddess: wounded adventurers lie on simple cots bandaged, waking up, a kind priestess in white and gold robes with a sunrise emblem tends to them, soft beams of dawn light through tall windows, candles, hopeful but somber mood. Cinematic painted style, warm cream and gold palette, the bottom third darker and simpler for text." });
// Quest chapter art: banner at the top of each main quest in the quest book
const QART = {
  m1: "A dark thorny forest hollow at dusk, goblin tracks in the mud, a dropped child's doll, crude goblin totems of bones on the thorn branches, a faint campfire glow deep inside",
  m2: "An old misty graveyard at night with a crumbling stone crypt, black candles burning with eerie dark flames at its door, skeletal hands rising from the earth",
  m3: "A ruined red stone tower on a sea cliff at sunset, bandit tents and supply crates in the courtyard, archers on the walls, waves crashing below",
  m4: "A black volcanic spire glowing with lava under a stormy sky, ash-gray cultists chanting in a ring at its base, a huge red dragon silhouette waking in the smoke",
};
for (const q of camp.quests.main) images.push({ group: "quest", name: "quest-" + q.id, label: q.title, ratio: "16:9",
  prompt: QART[q.id] + ". Wide painted fantasy chapter illustration, no people in the foreground, no text, moody cinematic light." });
// Village building interiors: background behind the NPC when a player walks in (same top-down style as room-inn / room-market)
const ROOM_TAIL = " Top-down tabletop battle map of a single room seen from directly above, hand-painted fantasy RPG style, warm interior light, readable floor, no people, no text, no grid.";
const ROOMS = [
  ["room-forge", "Emberheart Forge · โรงตีเหล็ก", "A dwarven blacksmith forge interior: a big glowing coal forge with bellows, a heavy anvil in the center, quenching barrel, racks of swords, axes and shields on the walls, half-finished armor on a stand, sparks and soot on the stone floor"],
  ["room-alchemist", "The Bubbling Flask · ร้านยา", "A cluttered gnome alchemist shop interior: tables covered with bubbling glass flasks and copper tubes, shelves of colorful potions, dried herbs hanging from beams, a small cauldron with green smoke, scroll racks, a low counter sized for a gnome"],
  ["room-stable", "Hale & Hoof Caravans · คอกม้า", "A village stable and caravan yard: wooden horse stalls with hay, two horses, a covered canvas wagon ready to leave, saddles and harnesses on pegs, feed sacks, a small desk with a route map, dirt and straw floor, open gate to a road"],
  ["room-night", "Lantern Night Market · ตลาดกลางคืน", "A small night market square in fog: a few mysterious stalls under dark cloth awnings lit by floating paper lanterns in blue and gold, rugs with strange wares, potion bottles, masks and old weapons on display, cobblestones, deep blue night mood"],
];
for (const [name, label, look] of ROOMS) images.push({ group: "room", name, label, ratio: "3:2", prompt: look + "." + ROOM_TAIL });
// Journey screen: full-screen while the party travels (5 s); event art pops up on a card if something happens on the road
const TRAVEL_TAIL = " Wide cinematic painted fantasy illustration, Ember Vale countryside, no text.";
const TRAVEL = [
  ["travel-road", "เดินทางด้วยเท้า (พื้นหลังหลัก)", "Five small adventurers seen from behind walking along a winding dirt road through green hills and a pine forest toward distant mountains, late afternoon light, long shadows, a wooden signpost by the road; keep the top and bottom areas calm and darker for text"],
  ["travel-caravan", "นั่งคาราวาน", "A covered canvas wagon pulled by two horses rolling along a country road, adventurers sitting in the back, a caravan master with a wide-brimmed hat holding the reins, dust in golden light, rolling fields; keep the top and bottom areas calm and darker for text"],
  ["travel-home", "เดินทางกลับหมู่บ้าน", "Tired adventurers walking back toward a cozy log village with warm lit windows and chimney smoke at dusk, a stream and a small wooden bridge in front; keep the top and bottom areas calm and darker for text"],
  ["travel-merchant", "เหตุการณ์ · เกวียนติดหล่ม", "A traveling merchant's cart stuck with one wheel deep in mud on a forest road, crates tilting, a worried merchant waving for help, a tired mule"],
  ["travel-wolves", "เหตุการณ์ · รอยหมาป่า", "Fresh wolf paw prints in the mud leading into a dark forest, the remains of a deer by the roadside, glowing eyes faintly visible between the trees"],
  ["travel-rain", "เหตุการณ์ · พายุฝน", "A heavy rainstorm over a muddy country road, dark clouds and lightning, puddles and bending trees, a rocky overhang nearby as shelter"],
  ["travel-watcher", "เหตุการณ์ · คนคลุมผ้าเทา", "A mysterious figure in a long ash-gray hooded cloak standing on a hilltop watching the road below, face hidden, misty evening, a three-pronged flame symbol on the cloak"],
  ["travel-shrine", "เหตุการณ์ · ศาลเจ้าริมทาง", "A small roadside stone shrine of a dawn goddess with a sunrise emblem, lit candles and flowers as offerings, soft golden light breaking through morning mist"],
  ["travel-signpost", "เหตุการณ์ · ป้ายถูกหมุน", "A crossroads wooden signpost whose arrows have been twisted to point the wrong ways, small goblin footprints and a crude scratched grin on the post, overcast sky"],
  ["travel-bard", "เหตุการณ์ · นักดนตรีพเนจร", "A cheerful wandering bard with a feathered hat playing a lute while sitting on a stone by the road, a small campfire, colorful patched clothes, sunset"],
  ["travel-camp", "เหตุการณ์ · กองไฟทิ้งร้าง", "An abandoned campfire still smoking by the roadside, scattered bones and a broken goblin spear, many small footprints circling it, dim forest edge at dusk"],
];
for (const [name, label, look] of TRAVEL) images.push({ group: "travel", name, label, ratio: "16:9", prompt: look + "." + TRAVEL_TAIL });
// Review status per image (what is already in the game, what to redo)
const NOTE = {
"token-red-dragon-wyrmling": ["ok", "ใช้ได้ (พื้นหลังลายตารางลบไม่หมดนิดหน่อยแถวหัว ถ้าอยากเนียนค่อยทำใหม่)"],
};
for (const im of images) { const n = NOTE[im.name]; im.note = n ? n[0] : "ok"; im.noteText = n ? n[1] : "อยู่ในเกมแล้ว"; }
const html = r("tools/gen-images.template.html").replace("/*__IMAGES__*/[]", JSON.stringify(images)).replace("/*__MAPS__*/{}", JSON.stringify(maps));
writeFileSync(new URL("../gen-images.html", import.meta.url), html);
console.log("gen-images.html", images.length, "images");
