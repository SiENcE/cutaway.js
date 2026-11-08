// A new game on Cutaway.js, ready to play, check and edit:
//   node tools/new-game.mjs <folder> [--title "My Game"] [--id my-game]
// It writes into a new (or empty) folder:
//   lib/cutaway/            the engine's runtime and the tools a game uses (validate, solve, play, graph, studio, ...),
//                           VERSION.txt says which commit; tools/sync-engine.sh copies a newer one in later
//   index.html              the engine in its load order, the art, the game's data, then the editor's layer file
//   assets/art.js           placeholder art drawn here: two rooms, a hero (idle, walk, talk), a key's icon
//   game/game.js            two rooms, a hero, a key in a crate, a locked door, an act, hints, the title screen:
//                           take the key, open the door with it, go out (the end)
//   game/edits.js           the editor's layer for properties and scripts (empty)
//   studio.json             what the editor may write, its layers, the tasks (validate, solve, play)
//   README.md, .gitignore   how to start
// Then: cd <folder>; node lib/cutaway/tools/studio.mjs (the game with the editor in the browser), and the checks
// node lib/cutaway/tools/validate.mjs index.html, solve.mjs index.html --full, play.mjs index.html.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "./lib/png.mjs";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (/** @type {string} */ k, /** @type {string} */ d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const title = opt("--title", "New Game");
const id = opt("--id", title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-game");
const dir = args[0];
if (!dir) { console.error('usage: node tools/new-game.mjs <folder> [--title "My Game"] [--id my-game]'); process.exit(2); }
if (existsSync(dir) && readdirSync(dir).length) { console.error(`${dir}: not empty; give a new folder`); process.exit(1); }
const out = (/** @type {string} */ p, /** @type {string | Buffer} */ text) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), text); };

// ---------------------------------------------------------------- the engine, as a game keeps it

const TOOLS = ["validate", "solve", "play", "graph", "build-atlas", "cutout", "shot", "render-music", "studio"];
mkdirSync(join(dir, "lib/cutaway/tools/lib"), { recursive: true });
cpSync(join(ENGINE, "src"), join(dir, "lib/cutaway"), { recursive: true });
cpSync(join(ENGINE, "LICENSE"), join(dir, "lib/cutaway/LICENSE"));
for (const t of TOOLS) cpSync(join(ENGINE, "tools", `${t}.mjs`), join(dir, "lib/cutaway/tools", `${t}.mjs`));
for (const f of ["graph.html", "music-lab.html", "check_pixels.py", "plot_audio.py"]) if (existsSync(join(ENGINE, "tools", f))) cpSync(join(ENGINE, "tools", f), join(dir, "lib/cutaway/tools", f));
for (const f of readdirSync(join(ENGINE, "tools/lib")).filter((f) => f.endsWith(".mjs"))) cpSync(join(ENGINE, "tools/lib", f), join(dir, "lib/cutaway/tools/lib", f));
const version = JSON.parse(readFileSync(join(ENGINE, "package.json"), "utf8")).version;
let commit = "none";
try { commit = execFileSync("git", ["-C", ENGINE, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* not a repository */ }
out("lib/cutaway/VERSION.txt", `Cutaway.js ${version}, commit ${commit}, copied ${new Date().toISOString().slice(0, 10)}\n`);

out("tools/sync-engine.sh", `#!/usr/bin/env sh
# Copy a newer Cutaway.js into lib/cutaway/: its runtime (src/) and the Node tools this game uses.
# Never edit lib/cutaway/ here: change the engine in its own repository, then sync again.
# Usage: sh tools/sync-engine.sh [path to the engine, default ${ENGINE.replace(/\\/g, "/")}]
set -e
cd "$(dirname "$0")/.."
ENGINE="\${1:-${ENGINE.replace(/\\/g, "/")}}"
[ -f "$ENGINE/src/core.js" ] || { echo "no engine at $ENGINE"; exit 1; }
rm -rf lib/cutaway
mkdir -p lib/cutaway/tools/lib
cp -r "$ENGINE"/src/. lib/cutaway/
cp "$ENGINE/LICENSE" lib/cutaway/LICENSE
for t in ${TOOLS.join(" ")}; do cp "$ENGINE/tools/$t.mjs" lib/cutaway/tools/; done
for f in graph.html music-lab.html check_pixels.py plot_audio.py; do [ -f "$ENGINE/tools/$f" ] && cp "$ENGINE/tools/$f" lib/cutaway/tools/; done
cp "$ENGINE"/tools/lib/*.mjs lib/cutaway/tools/lib/
version=$(node -p "require('$ENGINE/package.json').version")
commit=$(git -C "$ENGINE" rev-parse --short HEAD 2>/dev/null || echo "none")
printf 'Cutaway.js %s, commit %s, synced %s\\n' "$version" "$commit" "$(date +%Y-%m-%d)" > lib/cutaway/VERSION.txt
cat lib/cutaway/VERSION.txt
`);

// ---------------------------------------------------------------- placeholder art

const W = 641, H = 210, px = new Uint8Array(W * H * 4);
/** @param {string} hex */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** A filled rect in the atlas. @param {number} x @param {number} y @param {number} w @param {number} h @param {string} c */
function rect(x, y, w, h, c) {
  const [r, g, b] = rgb(c);
  for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) { const k = (j * W + i) * 4; px[k] = r; px[k + 1] = g; px[k + 2] = b; px[k + 3] = 255; }
}
// the room inside (0, 0): a wall, a skirting, a floor in boards, a window, a door, a crate
rect(0, 0, 320, 120, "#3a3f5c"); rect(0, 112, 320, 8, "#2a2d42");
for (let y = 120; y < 180; y += 6) { rect(0, y, 320, 6, y % 12 ? "#5c4a3a" : "#66523f"); rect(0, y + 5, 320, 1, "#4a3a2c"); }
rect(110, 24, 70, 50, "#20243a"); rect(112, 26, 66, 46, "#8ab4e8"); rect(144, 26, 2, 46, "#20243a"); rect(112, 48, 66, 2, "#20243a");
rect(258, 28, 48, 92, "#20243a"); rect(262, 32, 40, 88, "#7a5236"); rect(294, 74, 4, 4, "#e8c060");
rect(40, 134, 44, 30, "#2c2218"); rect(42, 136, 40, 26, "#a07850"); rect(42, 146, 40, 2, "#7a5a3a");
// outside (321, 0): a sky, hills, grass, the house's door behind
rect(321, 0, 320, 120, "#7ab8e8"); rect(321, 70, 320, 50, "#5a9a6a"); rect(321, 120, 320, 60, "#4a8a4a");
rect(341, 40, 50, 80, "#3a3f5c"); rect(351, 60, 30, 60, "#7a5236");
rect(560, 20, 24, 24, "#fff0a0");
// the hero (y 182): idle, two walking, two talking, 14 x 26 each; the key's icon after them
/** @param {number} x0 @param {number} legs @param {boolean} mouth */
function hero(x0, legs, mouth) {
  const y0 = 182;
  rect(x0 + 4, y0, 6, 6, "#f0c8a0"); rect(x0 + 4, y0, 6, 2, "#3a2a1a");                  // head, hair
  rect(x0 + 8, y0 + 3, 1, 1, "#1a1a1a"); if (mouth) rect(x0 + 7, y0 + 5, 2, 1, "#8a3a3a");
  rect(x0 + 3, y0 + 6, 8, 10, "#e85a4a"); rect(x0 + 2, y0 + 7, 1, 7, "#f0c8a0"); rect(x0 + 11, y0 + 7, 1, 7, "#f0c8a0");
  rect(x0 + 3, y0 + 16, 8, 3, "#2a3a6a");
  rect(x0 + 3 + legs, y0 + 19, 3, 7, "#2a3a6a"); rect(x0 + 8 - legs, y0 + 19, 3, 7, "#2a3a6a");
}
hero(0, 0, false); hero(14, 1, false); hero(28, -1, false); hero(42, 0, true); hero(56, 0, false);
rect(72, 190, 10, 6, "#e8c060"); rect(74, 192, 6, 2, "#a07820"); rect(82, 192, 10, 2, "#e8c060"); rect(88, 194, 2, 2, "#e8c060");
const atlas = `data:image/png;base64,${encode({ width: W, height: H, data: px }).toString("base64")}`;
const F = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, ms = 100) => [x, y, w, h, ms];
out("assets/art.js", `// Placeholder art made by tools/new-game.mjs: draw your own (any tool; pxl, or the editor's Paint) and pack it
// with lib/cutaway/tools/build-atlas.mjs into a file like this one.
Cutaway.assets.pack(${JSON.stringify({
  images: { art: atlas },
  anims: {
    start_bg: { image: "art", frames: [F(0, 0, 320, 180)] },
    outside_bg: { image: "art", frames: [F(321, 0, 320, 180)] },
    hero_idle_r: { image: "art", frames: [F(0, 182, 14, 26)] },
    hero_walk_r: { image: "art", frames: [F(14, 182, 14, 26, 200), F(0, 182, 14, 26, 200), F(28, 182, 14, 26, 200), F(0, 182, 14, 26, 200)] },
    hero_talk_r: { image: "art", frames: [F(42, 182, 14, 26, 150), F(56, 182, 14, 26, 150)] },
    inv_key: { image: "art", frames: [F(72, 189, 22, 8)] },
  },
}, null, 1)});
`);

// ---------------------------------------------------------------- the game

out("game/game.js", `// ${title}: the game's data (made by tools/new-game.mjs: change everything). A room is data: its picture, where
// one can walk, what can be clicked (hotspots: look, use, take, talk, exit; with an item: with). Scripts are lists
// of actions ("a line to say", { give: "key" }, { set: "flag" }, { if: "flag", then: [...], else: [...] }). The engine's
// reference (lib/cutaway's docs, or the editor's Help, F1) lists everything.
"use strict";
(function () {
  Cutaway.item("key", { name: "key", icon: "inv_key", look: "A small brass key." });

  Cutaway.room("start", {
    name: "Room", background: "start_bg",
    walk: [[4, 122, 316, 122, 318, 178, 2, 178]],
    holes: [[38, 150, 86, 150, 86, 166, 38, 166]],       // the crate's footprint
    hotspots: {
      window: { name: "window", rect: [110, 24, 70, 50], walkTo: [145, 130], face: "up", look: "Blue sky. Somewhere out there is the rest of the game." },
      crate: { name: "crate", rect: [40, 134, 44, 30], walkTo: [62, 172], face: "up",
        look: "An old crate.",
        use: [{ if: "!got_key", then: [{ give: "key" }, { set: "got_key" }, "A key, under the lid."], else: "Empty now." }] },
      door: { name: "door", if: "!door_open", rect: [258, 28, 48, 92], walkTo: [282, 132], face: "up",
        look: "The door. Locked.", use: "Locked.",
        with: { key: [{ remove: "key" }, { set: "door_open" }, "Click. It's open."] } },
      doorway: { name: "outside", if: "door_open", rect: [258, 28, 48, 92], walkTo: [282, 132],
        look: "Daylight.", exit: { to: "outside", at: [60, 150], face: "right" } },
    },
    enter: [{ if: "!visited:start", then: ["Where am I? And where's the key to that door?"] }],
  });

  Cutaway.room("outside", {
    name: "Outside", background: "outside_bg",
    walk: [[4, 124, 316, 124, 318, 178, 2, 178]],
    enter: [{ end: "Out at last. The end - now make the rest of the game!" }],
  });

  Cutaway.actor("hero", {
    name: "Hero", color: "#ffd27a", room: "start", at: [160, 160],
    costume: { idle: "hero_idle_r", walk: "hero_walk_r", talk: "hero_talk_r" },
    speed: [16, 8],
    look: "That's me.",
  });

  Cutaway.act("act1", { title: "Act 1", name: "${title.replace(/"/g, '\\"')}", room: "start", actor: "hero" });

  // the first that holds is the hint for now; each asks again more plainly
  Cutaway.hints([
    { if: "!got_key", about: "crate", text: ["The door is locked. Is the key somewhere in the room?", "Have a look in the crate."] },
    { if: "!door_open", about: "door", text: ["A key, a locked door...", "Use the key on the door."] },
    { about: "doorway", text: ["The door is open.", "Go outside."] },
  ]);

  Cutaway.start({ width: 320, height: 180, actor: "hero", id: "${id}", version: 1, languages: ["en"],
    title: { room: "start", name: "${title.replace(/"/g, '\\"')}", tagline: "A game made with Cutaway.js", footer: "Cutaway.js " + Cutaway.version } });
})();
`);
out("game/edits.js", `// The editor's layer: properties and scripts changed in the editor (Things, Scripts, Dialogue) are saved here
// and laid over the game's own data. Written by the editor; keep it loaded after game/game.js.
"use strict";
`);

// the page: the engine in its load order (as the engine's demo has it), the art, the game, the layer
const engineScripts = [...readFileSync(join(ENGINE, "demo/index.html"), "utf8").matchAll(/<script src="\.\.\/src\/([^"]+)"><\/script>/g)].map((m) => m[1]);
out("index.html", `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title.replace(/</g, "&lt;")}</title>
</head>
<body>
<!-- the engine (Cutaway.js, lib/cutaway/VERSION.txt) -->
${engineScripts.map((f) => `<script src="lib/cutaway/${f}"></script>`).join("\n")}
<!-- the art -->
<script src="assets/art.js"></script>
<!-- the game -->
<script src="game/game.js"></script>
<!-- the editor's layers (after the game's data) -->
<script src="game/edits.js"></script>
</body>
</html>
`);

out("studio.json", JSON.stringify({
  write: ["game", "art", "assets"],
  layers: { room: "game/rooms/{id}.geo.js", texts: "game/strings/{lang}.texts.js", edits: "game/edits.js", art: "art/import", artAtlas: "assets/imported.js" },
  tasks: {
    validate: ["node", "lib/cutaway/tools/validate.mjs", "index.html"],
    solve: ["node", "lib/cutaway/tools/solve.mjs", "index.html", "--full"],
    play: ["node", "lib/cutaway/tools/play.mjs", "index.html"],
    "art: imported": ["node", "lib/cutaway/tools/build-atlas.mjs", "art/import", "assets/imported.js"],
  },
}, null, 2) + "\n");

out(".gitignore", "build/\nout/\nnode_modules/\n");
out("README.md", `# ${title}

A point-and-click adventure made with [Cutaway.js](${ENGINE.replace(/\\/g, "/")}) (copied into \`lib/cutaway/\`).

## Playing

Open \`index.html\` (file:// works).

## Making it

- **The editor:** \`node lib/cutaway/tools/studio.mjs\` opens the game in the browser with the editor (F1: its guide
  and the engine's reference). It saves into this folder: shapes, texts, properties and scripts into its layer files
  (\`studio.json\`), never over your own code.
- **The data:** \`game/game.js\`: rooms, the hero, an item, an act, hints. **The art:** \`assets/art.js\` is a
  placeholder: draw your own and pack it with \`node lib/cutaway/tools/build-atlas.mjs <folder of PNGs> assets/art.js\`.
- **The checks**, after every change:
  \`\`\`sh
  node lib/cutaway/tools/validate.mjs index.html      # 0 errors
  node lib/cutaway/tools/solve.mjs index.html --full  # it can be finished, no soft-locks, a hint in every state
  node lib/cutaway/tools/play.mjs index.html          # played through with real clicks: "all passed"
  \`\`\`
- **A newer engine:** \`sh tools/sync-engine.sh\`.
`);

console.log(`${dir}: a new game "${title}" (${id}) with Cutaway.js ${version} (${commit}). Next:
  cd ${dir}
  node lib/cutaway/tools/studio.mjs                 the game with the editor in the browser
  node lib/cutaway/tools/validate.mjs index.html    and solve.mjs index.html --full, play.mjs index.html: the checks`);
