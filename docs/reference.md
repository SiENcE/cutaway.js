# Cutaway.js reference

What a game's data can say. A game is plain data in classic script files: rooms, actors, items,
dialogues, acts and hints, with scripts as lists of actions. The engine runs it; the Node tools check it,
prove it can be finished and play it through. The editor (F10) changes most of it live (its guide is the
other book of this help).

## Starting a game

The page loads the engine's files (in the order of `demo/index.html`), the game's art (atlas scripts),
the game's data, and last a script that calls `Cutaway.start`:

```js
Cutaway.start({
  width: 320, height: 180,            // the low-resolution screen, scaled up by whole numbers
  id: "mygame", version: 1,           // keys the saves (localStorage); the data version in a save
  language: "en", languages: ["en", "de"],
  actor: "pip", party: ["pip", "bolt"],   // who is played; who can be (portraits, 1-9)
  follow: true,                       // party members in the same room go along through doors
  inventory: "shared",                // one bag for the party ("own": each their own, the default)
  title: { room: "yard", name: "My Game", tagline: "Act 1", footer: "v1.0" },
  demo: { acts: ["act1"], link: "https://...", text: "Thanks for playing!" },
  quit: () => window.close(),         // the title screen offers Quit (desktop shells)
  dev: true,                          // F9, F10, ?edit, ?debug, ?act= (turn off in releases)
});
```

- Without acts, `room` is the room to show first. With acts (below), a new game begins the first act,
  after the title screen if there is one.
- Other options: `border` (colour around the picture), `scale` (force one), `transition`
  (`{ out, in }` fade lengths in ms), `settings` (default volumes and text speed), `manualClock`.
- Query switches: `?manual` (the clock moves only on `Cutaway.clock.advance`), `?act=<id>` (begin an
  act at once, no title or card), `?edit` (open the editor), `?debug`, `?lang=de`, `?scale=3`.

## Rooms

```js
Cutaway.room("hall", {
  name: "Hall", background: "hall_bg", size: [400, 180],   // wider than the screen: it scrolls
  walk: [[6, 124, 314, 124, 318, 177, 2, 177]],            // walkable polygons (flat x, y lists)
  holes: [[138, 139, 182, 139, 182, 153, 138, 153]],       // obstacles cut out of them
  props: [{ id: "crate", image: "crate", at: [160, 151] }],
  hotspots: { window: { name: "window", rect: [118, 20, 64, 52], look: "Clouds." } },
  enter: [{ if: "!visited:hall", then: ["Morning!"] }],    // runs every time the room is entered
  music: { theme: "hall", intensity: 0.4 }, ambience: ["rain"],
  light: { ambient: 0.85, lamps: [...] }, fx: [...], scale: { far: [126, 0.86], near: [177, 1] },
});
```

- `foreground`: images drawn over everything (`[{ image, at }]`). `color`: a fill under the background.
- `scale`: actors scale with depth, from `far: [y, scale]` to `near: [y, scale]`.
- The shapes (walk areas, holes, hotspot outlines, walk-to points, baselines, lamps, effect areas) are
  best drawn in the editor's Room tab: it writes `rooms/<id>.geo.js` (`Cutaway.room.geometry`), loaded
  after the room.

## Hotspots

A hotspot is something to click. Its shape is `poly` (flat corners), `rect: [x, y, w, h]`, or a prop's
box (`prop`, default: the prop with the same id).

| field | |
|---|---|
| `name` | the hover label |
| `look` | right click (or a long press) |
| `talk`, `use`, `take`, `exit` | left click runs the first of these that it has |
| `with: { item: script, "*": script }` | an item used on it (`"*"`: any other item) |
| `walkTo: [x, y]`, `face` | where the actor stands, and which way it faces (`left right up down`) |
| `exit: { to, at, face }` | a door: go to that room, stand there |
| `if` | it only exists while this condition holds |
| `hidden` | starts hidden (`{ show: id }` shows it) |
| `z` | higher wins where hotspots overlap |

Other actors in the room are hotspots too: their `look`, `talk` and `with` come from the actor.

## Props

Pictures in the room that sort with the actors by their baseline (an actor lower on the screen draws
in front).

| field | |
|---|---|
| `id`, `image` | the sprite or animation |
| `at`, `anchor` | where it stands; the anchor inside the sprite (default bottom centre; `[0, 0]`: top left) |
| `baseline` | the sorting y (default `at[1]`; 0: always behind) |
| `states: { open: "box_open" }` | an image per object state (`{ state: "box", value: "open" }`) |
| `flip`, `hidden` | |
| `scroll: -40` | px per second along x (negative: to the left); the image repeats across the room, so scenery passes by (a ride, clouds). Layers at different speeds give parallax |

## Actors

```js
Cutaway.actor("pip", {
  name: "Pip", color: "#5af0c0",            // subtitles in this colour
  room: "hall", at: [90, 160], facing: "right",
  costume: { idle: "pip_idle_r", walk: "pip_walk_r", talk: "pip_talk_r", reach: "pip_reach_r" },
  speed: [16, 8], run: 2,                   // px per second along x and y; running is twice as fast
  portrait: "pip_portrait", voice: { pitch: 74, wave: "square", syllable: 65 },
  look: "Pip.", talk: [{ dialog: "pip" }], with: { key: [...] },
  poses: [{ if: "on_sofa", idle: "pip_sit_r" }],     // costume entries while a condition holds
});
```

- A costume entry is a side view facing right (mirrored for left), or per direction:
  `{ right, left, up, down }`. With `up` and `down` walks, an actor walking mostly up or down the
  screen shows its back or front.
- Extra costume keys are one-shot animations: `{ anim: "pip:reach" }`.
- Double click (or double tap) makes the played actor run.

## Items

```js
Cutaway.item("key", { name: "key", icon: "inv_key", look: "A brass key.",
  combine: { string: [{ remove: "key" }, { give: "key_on_string" }] } });   // works both ways round
```

Items live in a bag per actor, or one shared bag (`inventory: "shared"`). Click the satchel (top right),
pick an item, click a hotspot, an actor or another item to use it there.

## Dialogues

```js
Cutaway.dialog("bolt", {
  main: [
    { text: "How are you?", then: [{ say: "bolt", text: "Rusty." }] },
    { text: "The shelf?", if: "!got_key", once: true, goto: "shelf" },
    { text: "Bye.", goto: "end" },
  ],
  shelf: { enter: [{ say: "bolt", text: "Easy." }], choices: [{ text: "Thanks.", goto: "main" }] },
});
```

A choice: `text` (the active actor says it, unless `silent`), `if`, `once`, `then` (a script),
`goto` (a node, or `"end"`). Start one with `{ dialog: "bolt" }` (or `{ dialog, node }`).

## Scripts

A script is a list of steps, run one after another. A plain string is a line for the active actor.

| step | |
|---|---|
| `"Hello!"`, `{ say: "bolt", text: "Hi." }` | a line (over the speaker, in their colour) |
| `{ narrate: "Meanwhile..." }` | a line at the top |
| `{ walk: [x, y] }`, `{ walk: "bolt", to: [x, y], face, run: true, wait: false }` | walk (`wait: false`: the script goes on) |
| `{ face: "left" }`, `{ face: "bolt", to: "up" }` | turn |
| `{ anim: "bolt:reach" }`, `{ anim: "bolt:reach", wait: false }` | play a costume animation once (`wait: false`: the script goes on) |
| `{ wait: 500 }` | ms |
| `{ give: "key" }`, `{ give: "key", to: "bolt" }`, `{ take: "key" }`, `{ remove: "key" }` | items (`take` also hides the hotspot) |
| `{ set: "flag" }`, `{ set: "n", value: 3 }`, `{ unset }`, `{ inc: "n", by: 1 }` | flags |
| `{ state: "box", value: "open" }`, `{ show: "id" }`, `{ hide: "id" }` | objects (`room/id` for another room) |
| `{ goto: "yard", at: [x, y], face, transition: false, follow: false }` | change rooms |
| `{ place: "bolt", room: "yard", at, face }` | put an actor somewhere (`room: null`: nowhere) |
| `{ switch: "bolt" }`, `{ lock }`, `{ unlock }`, `{ stay }`, `{ follow }` | the party |
| `{ dialog: "bolt", node }` | a dialogue |
| `{ card: "Night", title: "Act 2" }`, `{ end: "The end." }` | full-screen cards; `end` ends the game |
| `{ act: "next" }`, `{ act: "act2" }` | go on to an act (a demo ends there) |
| `{ music: { theme, section, intensity } }`, `{ stinger: "found" }` | music |
| `{ sfx: "door", at: [x, y], gain }`, `{ fade: "out", ms }`, `{ shake: 300 }` | sound and screen |
| `{ if: cond, then: [...], else: [...] }`, `{ once: [...], else: [...] }` | logic |

Add your own: `Cutaway.script.action("organ", async (step, ctx) => { ... })`.

## Conditions

| condition | true when |
|---|---|
| `"flag"`, `"!flag"`, `"count=3"` | a flag is set (not set, has that value) |
| `"has:key"` | the played actor's bag holds it |
| `"visited:yard"` | the room was entered |
| `"is:bolt"` | bolt is the one played |
| `"at:bolt=yard"` | bolt is in that room |
| `"state:box=open"`, `"hidden:box"` | an object's state, or hidden |
| `["a", "b"]`, `{ and: [...] }`, `{ or: [...] }`, `{ not: c }` | combinations |

## Acts, the title screen, the demo

```js
Cutaway.act("act1", { title: "Act 1", name: "The Hall", room: "hall", actor: "pip",
  start: [{ place: "bolt", room: "hall", at: [230, 150] }, { lock: "bolt" }] });
```

- A new game begins the first act from a clean state: its `start` steps, its card, its room.
  `{ act: "next" }` goes on (after the last act, the game ends). The act is in the save; acts begun once
  can be chosen on the title screen.
- `fresh: true`: the act begins from a clean state also when the one before goes on into it. Its `start`
  gives what it carries over, so it is the same act from the title screen and after the act before
  (and the solver sees one state where it begins).
- `title` (start option) puts a title screen first, over a room shown as a backdrop: new game,
  continue (the newest save), acts, load, settings, fullscreen, quit.
- `demo: { acts, link, text }`: going on to an act the demo lacks ends it with the "end of the demo"
  card (a button that opens `link`, one back to the title).

## Hints

```js
Cutaway.hints([
  { if: "!got_key", about: "shelf", text: ["Something up high?", "Bolt is tall.", "Play Bolt, use the shelf."] },
  { about: "lamp", text: "The clean bulb goes into the lamp post." },
]);
```

The first hint whose `if` holds is the one for now; each ask (the bulb by the satchel, H, the pause
menu) shows the next, plainer line. A game in acts can give an act its own hints,
`Cutaway.hints([...], { act: "act2" })`: they count only while that act is played. `solve.mjs --full` checks that every state from which the end can
still be reached has a hint, and that its `about` (hotspots, actors, items) is still needed.

## Light and effects

- `light: { ambient, color, max, lamps: [...] }`: actors take on the light where they stand. A lamp:
  `id, at, r` (reach), `power`, `color`, `flicker` (0..1), `rate`, `add` (not in the art: its pool is
  added), `glow: { r, strength }`, `if`. Use the same lamp numbers as the art was lit with.
- `fx: [...]` (every particle is a function of time, so screenshots repeat):
  `{ kind: "haze", poly, color, alpha, fade }`, `{ kind: "dust", rect, count, color }`,
  `{ kind: "rain", rect, count, speed, slant, length }`, `{ kind: "drip", at, to, every }`,
  `{ kind: "sparkle", points, every }`, `{ kind: "steam", at, count, rise }`; any with `if` or
  `lamp: "id"` (follows that lamp).

## Sound

- Sounds are synthesised data: `Cutaway.sfx.define("boing", { tone: { wave: "triangle", from: 220,
  to: 660, ms: 180 } })`. Parts start together (or `at` ms later): `tone` (a pitch sweep), `noise`
  (filtered noise), `inst` (a synth instrument playing notes).
- Loops for a room's `ambience`: `{ loop: { noise, tone, gain, wobble, crackle } }`.
- Recorded sounds: `{ sample: "data:audio/ogg;base64,...", gain, rate }`, loops
  `{ loop: { sample, gain } }` (the editor's Sound tab imports them).
- Play one: `{ sfx: "boing", at: [x, y] }` (pans with the position).

## Music

- Instruments: `Cutaway.synth.define(name, { type: "sub" | "fm" | "pluck" | "drum", ... })`.
- Themes: `Cutaway.score.theme(id, { tempo, key, tracks, layers, sections, start, transitions })`;
  sections loop or go `next`, and change only at jump points (`exits`: the bar, the end, listed bars).
- Layers fade in and out with the intensity; stingers (`Cutaway.score.stinger`) play on the next beat
  in the current key.
- The game sets states, not tracks: a room's `music`, or `{ music: { theme, section, intensity } }`.
- `{ music: { speaker: 1 } }` makes the music sound like a small speaker in the scene (a radio, a
  boombox); `{ music: { speaker: 0, fade: 6 } }` opens it up to the full score over 6 seconds. A room
  whose `music` doesn't name `speaker` plays full range.
- Try them in `tools/music-lab.html?score=...` (also from the editor's Sound tab).

## Voices and texts

- Lines are spoken in blips: an actor's `voice: { pitch, range, wave, syllable, speed, gain, formant }`.
- Texts are written in the game's first language, inline. Other languages are tables:
  `Cutaway.i18n.table("en", { "Hallo.": "Hello." })`; `"@key"` texts look a key up instead.
- The editor's Texts tab exports every text as CSV or JSON for translators and imports them back.

## Layers: what the editor writes

| | |
|---|---|
| `Cutaway.room.geometry(id, {...})` | shapes (Room tab) |
| `Cutaway.i18n.layer(lang, {...})` | texts as changed (Texts tab) |
| `Cutaway.edits({ rooms, items, actors })` | properties (Things tab): objects merge, lists of things by id |
| `Cutaway.sfx.layer(defs, file)` | sounds made or changed, recorded sounds (Sound tab) |
| `Cutaway.assets.pack(...)` | imported and painted art (Art tab, the paint view; `art/import/` packed by `tools/build-atlas.mjs`): a name there replaces the game's own picture |

The page loads each layer file after the game's own data.

## Saves, settings, the interface

- An autosave on every room change, three slots in the pause menu (Esc), versioned:
  `Cutaway.save.configure({ migrate: (data, from) => data })` updates old saves.
- Settings (volumes, speech, text speed) belong to the player, not the save.
- The skin: `Cutaway.ui.skin({ cursor, font, labelColor, outline, accent, panel, buttons })`,
  `Cutaway.party.layout({...})`, `Cutaway.inventory.setSprite(...)`.
- Events to listen to: `Cutaway.events.on("room.entered", fn)`, `"say"`, `"game.end"`, `"act"`, ...

## Tools

| tool | |
|---|---|
| `node tools/validate.mjs index.html` | every reference resolves, shapes are sound, texts are translated |
| `node tools/solve.mjs index.html --full` | proves the game can be finished, lists soft-locks, checks hints |
| `node tools/play.mjs index.html [--touch]` | plays it through in headless Chrome with real clicks (or taps) |
| `node tools/studio.mjs [index.html]` | the editor's local server: saves into the game, runs its tasks (`studio.json`: write, layers, tasks, palette) |
| `node tools/shot.mjs index.html ...` | screenshots (`--query`, `--eval`, `--out`, `--buffer`) |
| `node tools/build-atlas.mjs dir... out.js` | packs PNGs (pxl output) into an atlas script |
| `node tools/render-music.mjs index.html --out f.wav` | renders the music offline |
