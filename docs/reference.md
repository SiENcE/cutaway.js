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
  intro: "intro",                     // a sequence before the title screen, the first time (below)
  introAlways: false,                 // true: the intro on every start
  gate: { room: "vcr", prompt: "@press_play" },  // where sound needs a click first: a still and a prompt
  dev: true,                          // F9, F10, ?edit, ?debug, ?act= (turn off in releases)
});
```

- Without acts, `room` is the room to show first. With acts (below), a new game begins the first act,
  after the title screen if there is one.
- Other options: `border` (colour around the picture), `scale` (force one), `transition`
  (`{ out, in }` fade lengths in ms), `settings` (the player's defaults, any of the keys below), `manualClock`.
- The editor holds the game while it is open (`Cutaway.clock.held`: the logic stands, drawing goes on,
  `Cutaway.clock.advance` still steps; `Cutaway.audio.hold(true)` suspends the sound). The menus'
  own pause is `Cutaway.clock.paused`.
- `intro` and `gate`: see "Sequences and the intro".
- Query switches: `?manual` (the clock moves only on `Cutaway.clock.advance`), `?act=<id>` (begin an
  act at once, no title or card, no intro), `?nointro` (leave the intro out), `?edit` (open the editor;
  no intro either), `?debug`, `?lang=de`, `?scale=3`.

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

- `foreground`: images drawn over everything (`[{ image, at, depth }]`). `color`: a fill under the background.
- A `size` taller than the screen lets the camera move up and down too (a tilt in a sequence).
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
| `exit: { to, at, face, door, sfx }` | a door: go to that room, stand there. Party members who follow head for it with the one played. `door` names a hidden prop (the door standing open) shown as the actor gets there, with the sound `sfx`, a moment before the room changes (the scene's, not saved). Give a door's `walkTo` at the door itself, so everyone walks up to it |
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
| `scroll: -40` | px per second along x (negative: to the left); the image repeats across the room, so scenery passes by (a ride, clouds). Layers at different speeds give parallax. The scene's clock starts when the room loads, so a scrolling layer stands where it is drawn at first |
| `depth: 0.5` | parallax against the camera (default 1, the room): on the screen it is at `at - camera * depth`, in whole pixels. 0 stays put on the screen, 0.5 is far away (half the camera's speed), 1.4 a foreground that passes faster. A hotspot that uses the prop's box follows it; hotspots with their own shape stay in room coordinates. The editor draws and picks it where it shows |

A script can move a prop (`{ move }`) and play its animation from the start (`{ play }`). Both belong
to the scene, not the save: entering the room again (or loading a save) shows the prop where its data
puts it. A lasting change is a `state` (another image) or `show`/`hide` of a second prop.

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
- An actor without a `costume` is a voice only (someone on the phone, a megaphone far away): it can
  `say` lines but is never drawn, so don't place it in a room.
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

Every line ends in a mark: an arrow when another line follows (later in the script, or in the one
around it, as the state stands: an `if` counts by its condition now, or either way once a step before
it changes the state; a `{ dialog }` counts as more), a square when it is the last.

| step | |
|---|---|
| `"Hello!"`, `{ say: "bolt", text: "Hi." }` | a line (over the speaker, in their colour; it ends in an arrow if another line follows, a square if it is the last, below) |
| `{ narrate: "Meanwhile..." }` | a line at the top |
| `{ walk: [x, y] }`, `{ walk: "bolt", to: [x, y], face, run: true, wait: false, free: true }` | walk (`wait: false`: the script goes on; `free: true`: in a straight line, ignoring the walk areas, e.g. wading out into water) |
| `{ face: "left" }`, `{ face: "bolt", to: "up" }` | turn |
| `{ anim: "bolt:reach" }`, `{ anim: "bolt:reach", wait: false }` | play a costume animation once (`wait: false`: the script goes on) |
| `{ wait: 500 }` | ms |
| `{ give: "key" }`, `{ give: "key", to: "bolt" }`, `{ take: "key" }`, `{ remove: "key" }` | items (`take` also hides the hotspot) |
| `{ bag: "own", who: "bolt" }`, `{ bag: "shared", who: "bolt" }` | with `inventory: "shared"`: a party member split off from the others carries a bag of their own (empty at first; saved); `"shared"` puts them and what they carry back into the party's bag |
| `{ set: "flag" }`, `{ set: "n", value: 3 }`, `{ unset }`, `{ inc: "n", by: 1 }` | flags |
| `{ state: "box", value: "open" }`, `{ show: "id" }`, `{ hide: "id" }` | objects (`room/id` for another room) |
| `{ goto: "yard", at: [x, y], face, transition: false, follow: false }` | change rooms (`transition: false`: a cut; `"dissolve"`: pixel by pixel, below). After a `{ fade: "out" }`, a `goto` brings the picture back, also within the same room (moving everyone while the screen is dark) |
| `{ place: "bolt", room: "yard", at, face }` | put an actor somewhere (`room: null`: nowhere) |
| `{ switch: "bolt" }`, `{ lock }`, `{ unlock }`, `{ stay }`, `{ follow }` | the party |
| `{ dialog: "bolt", node }` | a dialogue |
| `{ card: "Night", title: "Act 2" }`, `{ end: "The end." }` | full-screen cards; `end` ends the game |
| `{ act: "next" }`, `{ act: "act2" }` | go on to an act (a demo ends there) |
| `{ music: { theme, section, intensity } }`, `{ music: { stop: true, fade: 1 } }`, `{ stinger: "found" }` | music |
| `{ sfx: "door", at: [x, y], gain }`, `{ fade: "out", ms, color, wait: false }`, `{ shake: 300 }` | sound and screen (a white `fade` of 100 ms is a flash; `fade` takes a level 0..1 too; `wait: false` goes on while it fades) |
| `{ camera: [x, y], ms, ease, wait: false }`, `{ camera: "follow" }` | move the camera (its top left), below |
| `{ move: "crate", to: [x, y], ms, ease, wait: false }`, `{ move: "crate", by: [dx, dy] }` | move a prop of this room |
| `{ open: "door_open", sfx: "creak", ms: 260 }`, `{ close: "door_open", sfx }` | show a hidden prop of this room for the scene only (a door standing open while someone comes or goes through it; not saved, gone when the room is entered again), with a sound, then wait `ms`; `close` takes it back. `"room/door_open"` names the room too (in a dialog, after a goto): in another room it does nothing |
| `{ play: "tv", anim: "tv_news", loop: true, wait: false }` | play a prop's animation from its first frame |
| `{ letterbox: true, ms }`, `{ caption: "Paris, 1925.", at: "bl", type: true, ms }`, `{ dissolve: 800 }`, `{ tape: 1, ms }` | cinema, below |
| `{ sequence: "flashback" }`, `{ shot: "name" }` | play a sequence; mark a shot in one ("Sequences and the intro") |
| `{ if: cond, then: [...], else: [...] }`, `{ once: [...], else: [...] }` | logic |

Add your own: `Cutaway.script.action("organ", async (step, ctx) => { ... })`.

### Camera, props and cinema

`ms` is a length in game time (default 0: at once); `ease` is `"linear"`, `"in"` (slow start), `"out"`
(slow end) or `"inOut"` (both, the default); with `wait: false` the script goes on while it moves.
Positions may be fractional while moving; drawing is always in whole pixels.

- `{ camera: [x, y], ms, ease }`: the camera's top left goes to that room point, kept inside the room
  (a room higher than the screen tilts). It stays there, not following the actor, until
  `{ camera: "follow" }` or the room changes (entering a room gives the camera back).
- `{ move: "id", to: [x, y] }` or `by: [dx, dy]`: a prop of the current room, from where it is now.
- `{ play: "id", anim, loop, wait }`: the prop shows `anim` (or its own image) from the first frame, at
  the frame lengths of the atlas. Once by default: the script waits until it has played through, then
  the prop holds the last frame. `loop: true` repeats it (and doesn't wait). A long take (hundreds of
  rendered frames) works too: `build-atlas.mjs` spreads it over several atlas pages.
- `{ letterbox: true, ms }`: black bars top and bottom; `true` makes the picture 2.39:1 (bars of 23 px
  on 320x180), a number is the bars' height in px, `false` slides them away.
- `{ caption: text, at, type, blip, speed, ms, color }`: a line of text in the picture: `at` is `"bl"`
  (bottom left, the default), `"br"`, `"tl"`, `"tr"` or `"c"` (the middle). It sits 6 px inside the
  picture's edge (the bars' edge with a letterbox), in the game's font, white (or `color`) with the
  interface's outline, so it also reads on black. `type: true` types it in (`speed` letters a second,
  default 20; `blip`, or `type: "sound"`, plays a sound per letter); `ms` holds it that long after
  that, then it goes (without `ms` it stays). The script waits for the typing and the hold
  (`wait: false`: it goes on). `{ caption: false }` clears it. Long texts wrap.
- `{ dissolve: ms }` keeps the picture as it is now and lets whatever the next steps show (a camera
  cut, a prop shown, a state) come through it pixel by pixel, in the order of a 4x4 Bayer pattern
  (16 steps, never a blended colour). The script goes on at once. `{ goto: "room", transition:
  "dissolve", dissolve: ms }` changes rooms that way (default 800 ms). Like the fades, it is off in the
  Node tools.
- `{ tape: 0..1, ms }`: the picture as a worn video tape played back (1: barely holding, 0: clean),
  reached over `ms` like a fade (`wait: false`: the script goes on). Its rows waver and tear, a
  tracking band rolls up through it, snow and drop-outs flicker, now and then the picture hops; at
  higher levels it loses a little colour. It lies over the fade too (a black tape still has noise),
  under the bars and the interface. Every fault is a function of the clock, so screenshots repeat. A
  sequence's end clears it; off in the Node tools.
- The bars and the caption are drawn over the room and the fade, under lines and the interface. None
  of it is saved.

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
  `keep: ["photo"]` lists flags that do come along when the act before goes on into it (an optional
  deed that pays off later); a start from the title screen or the acts menu leaves them unset.
- `title` (start option) puts a title screen first, over a room shown as a backdrop: new game,
  continue (the newest save), acts, load, settings, fullscreen, quit. It makes an entrance: the logo
  (or the name) and the small print fade in, then the menu rises from below the screen (under two
  seconds); a click or a key finishes it at once and still counts for the menu. An intro that ends
  showing the title's room goes on into it without a jump (the room keeps its clock and its rain).
- `demo: { acts, link, text }`: going on to an act the demo lacks ends it with the "end of the demo"
  card (a button that opens `link`, one back to the title).
- `prologue: "id"`: a sequence that tells the story so far, played when the act is begun as a new game
  (from the title screen or the acts menu), before its `start` steps and card; from black, back to
  black. Esc skips it, a click or Space goes on a shot. The title screen gets "Watch the prologue"
  (`@cutaway.title.prologue`) for the first act's. `?nointro`, `?edit` and `?act=` leave it out, and so
  do the Node tools (`Cutaway.acts.configure({ prologues })`; `play.mjs --intro` plays it, a click and Esc).
  The title's music fades out with the picture as it begins; the film brings its own (a theme set with
  `fade` fades in from the silence, `{ music: { stop: true, fade } }` lets it go at the end, and in
  its `after` for a skip).

## Sequences and the intro

A sequence is a little film made of script steps: an intro before the title screen, a cutscene.

```js
Cutaway.sequence("intro", {
  steps: [
    { shot: "logo" }, { goto: "logo", transition: false }, { play: "logo", anim: "logo_build" },
    { shot: "sea" }, { goto: "sea", transition: "dissolve" }, { letterbox: true, ms: 800 },
    { music: { theme: "storm", section: "flight" } },
    { camera: [0, 120], ms: 6000, ease: "inOut", wait: false },
    { caption: "Somewhere, 1985.", at: "bl", type: true, blip: "type", ms: 2500 },
    { shot: "title" }, { goto: "street" }, { letterbox: false, ms: 600 }, { fade: "out", ms: 400 },
  ],
  after: [{ music: { theme: "title" } }],   // when it is skipped: what the rest would have set
});
```

- Playing one (`Cutaway.sequence.play(id)`, `{ sequence: id }` in a script, the `intro` start option)
  runs its steps as a script in cutscene mode: no cursor, no satchel, portraits or buttons, nothing to
  click (lines and cards still show). Every action works in it, with the camera, prop and cinema ones.
- A `goto` in a sequence shows a room as a shot: nobody is moved there, its enter script doesn't run,
  it isn't visited, there is no autosave, it has no hotspots. Rooms made only as shots need no walk
  area. Put actors into a shot with `place`. A room's `music` and `ambience` still apply when it is
  shown, so shot rooms usually leave them out and the sequence sets the music.
- `{ shot: "name" }` marks where a shot begins (the event `"sequence.shot"`). Space, Enter or a click
  skip to the next mark: the steps in between run at once (lines, sounds, cards and waits are passed
  over, moves arrive, their state changes stay), through a cut to black. A held key's repeats don't
  count (holding Space at the gate doesn't skip the intro's shots).
- `Cutaway.sequence.play(id, { from: "name" })` starts at a shot mark (the steps before it hurry
  through, so their state is there); `Cutaway.sequence.shots(id)` lists the marks, and
  `Cutaway.sequence.gate()` the gate's options. The editor's Play menu uses them.
- Esc (or a right click, a long press on a phone) skips the whole sequence: the steps stop where they
  are, the screen goes black, `after` runs (at once), and whatever comes next fades in.
- When it ends, the letterbox, the caption and the camera are cleared and the scene is back in the
  room it was in before (`Cutaway.sequence.play(id, { restore: false })` leaves it as the sequence left
  it). Played inside another sequence, its steps simply run as part of that one.
- Dialogues in a sequence would wait for the player; leave them out.
- `intro: "id"` (start option) plays it before the title screen (or the first act) the first time the
  game starts on this machine; skipped or not, it is then remembered (`Cutaway.settings.seen(id)`, kept
  beside the settings, not reset with them). `introAlways: true` plays it on every start (an intro
  short enough, or one that leads into the title: a click goes on a shot, Esc skips it). The title
  screen gets "Watch intro" (`@cutaway.title.intro`) to see it again. `?act=`, `?nointro` and `?edit`
  leave it out.
- `gate: { room, view, prompt }` (start option): browsers let sound start only after a click or a key.
  Before the intro and the title, if sound can't start yet, the gate shows `room` as a still (at `view`,
  its top left) with `prompt` blinking at the bottom (default `@cutaway.gate.prompt`, "Click to start");
  the click or key starts the sound and goes on. Where sound may start at once (a desktop shell, a
  browser that allows it), there is no gate and the sound starts right away.
- The Node tools don't play the intro: validate and solve don't start the game that way, and `play.mjs`
  and `shot.mjs` add `?nointro` (`--intro` plays it: `play.mjs --intro` plays it through to the title,
  then again from "Watch intro", with a click and Esc). `await Cutaway.debug.settle()` plays a sequence
  to its end. The validator checks sequences (each step in the room its last `goto` shows: the props
  `move` and `play` name must be there), `intro` and `gate`.

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
- `{ music: { stop: true, fade: 1.5 } }` doesn't wait for a jump point: what plays fades out over
  `fade` seconds and the music is silent. The next theme then starts at once, from its first bar; with
  `fade` it fades in over that many seconds (`{ music: { theme: "storm", fade: 5 } }`). Between two
  films, or from a title screen into a prologue, this is the clean cut.
- `{ music: { speaker: 1 } }` makes the music sound like a small speaker in the scene (a radio, a
  boombox); `{ music: { speaker: 0, fade: 6 } }` opens it up to the full score over 6 seconds. A room
  whose `music` doesn't name `speaker` plays full range.
- Try them in `tools/music-lab.html?score=...` (also from the editor's Sound tab).

## Voices and texts

- Lines are spoken in blips: an actor's `voice: { pitch, range, wave, syllable, speed, gain, formant }`.
- Recorded voices (the editor's Voices tab) replace the blips line by line: a language's voices file
  `Cutaway.voice.layer("de", { "Hallo!": { sample, ms, from, gain }, "robby|Hallo!": { ... } })` keeps
  clips by the line's text in the game's data (before translation), or by `"actor|text"` for one
  speaker (that one wins). `sample` is a data URI, `from` trims the start (ms), `ms` is how long it plays:
  the line stays on screen at least that long. Lines without a clip in the language played blip.
- Texts are written in the game's first language, inline. Other languages are tables:
  `Cutaway.i18n.table("en", { "Hallo.": "Hello." })`; `"@key"` texts look a key up instead.
- The editor's Texts tab exports every text as CSV or JSON for translators and imports them back.

## Layers: what the editor writes

| | |
|---|---|
| `Cutaway.room.geometry(id, {...})` | shapes (Room tab) |
| `Cutaway.i18n.layer(lang, {...})` | texts as changed (Texts tab) |
| `Cutaway.edits({ rooms, items, actors, dialogs, sequences })` | properties and scripts (Things tab), dialogues (Dialogue tab), sequences (Things tab: their `steps` and `after` as blocks): objects merge, lists of things by id (by their place in the list when they have none), values and scripts replace, `null` removes; a dialogue is kept whole (it replaces the game's tree), a sequence's `steps` and `after` too |
| `Cutaway.sfx.layer(defs, file)` | sounds made or changed, recorded sounds (Sound tab) |
| `Cutaway.voice.layer(lang, {...})` | recorded voices per line (Voices tab), `assets/voices.<lang>.js` |
| `Cutaway.assets.pack(...)` | imported and painted art (Art tab, the paint view; `art/import/` packed by `tools/build-atlas.mjs`): a name there replaces the game's own picture |

The page loads each layer file after the game's own data.

## Saves, settings, the interface

- An autosave on every room change, three slots in the pause menu (Esc), versioned:
  `Cutaway.save.configure({ migrate: (data, from) => data })` updates old saves.
- Settings belong to the player, not the save (localStorage per game). The pause menu's Settings has
  four pages: Sound (`master`, `music`, `sfx`, `voice` 0..1, `voices`, `muteUnfocused`), Text and
  dialogue (`textSpeed` 2 / 1.5 / 1 / 0.7, `advance` "auto" or "click": lines wait for a click, a key
  or Space, the arrow bobbing; `textBox`), Picture (fullscreen, `fit` "sharp" or "fill", `crt`
  "off" / "scanlines" / "crt", `motion`: shake and flickering lamps), Controls (`swapButtons`: in the
  room the left button looks, `alwaysRun`, `holdMs` 300 / 450 / 700, `buttons`: the eye and menu
  buttons for the mouse too, `hintButton`), and "Reset to defaults". `Cutaway.start({ settings })` sets
  a game's defaults; `Cutaway.settings.set({...})` and `.values` in code.
- The skin: `Cutaway.ui.skin({ cursor, font, labelColor, outline, accent, panel, buttons, frame })`;
  `frame` colours the menu's frame: `{ light, face, dark }` (the bevel), `fill` (inside), `plate` (the
  heading's), `rivet`, `rivetLight`, `rivetDark` (the corner fittings), `hover` (the chosen row's band).
  `Cutaway.menu.frame(ctx, x, y, w, h, { small, fill })` draws one for a game's own pages,
  `Cutaway.party.layout({...})`, `Cutaway.inventory.setSprite(...)`.
- Events to listen to: `Cutaway.events.on("room.entered", fn)`, `"say"`, `"game.end"`, `"act"`,
  `"sequence.start"`, `"sequence.shot"`, `"sequence.end"`, ...

## Tools

| tool | |
|---|---|
| `node tools/validate.mjs index.html` | every reference resolves, shapes are sound, texts are translated |
| `node tools/solve.mjs index.html --full` | proves the game can be finished, lists soft-locks, checks hints (`--workers N`: threads that search, default one less than the cores, at most 12; `--max N` states) |
| `node tools/play.mjs index.html [--touch] [--intro]` | plays it through in headless Chrome with real clicks (or taps); `--intro` plays the intro first |
| `node tools/studio.mjs [index.html]` | the editor's local server: saves into the game, runs its tasks (`studio.json`: write, layers, tasks, palette) |
| `node tools/shot.mjs index.html ...` | screenshots (`--query`, `--eval`, `--out`, `--buffer`; `--intro` lets the intro play) |
| `node tools/build-atlas.mjs dir... out.js` | packs PNGs (pxl output) into an atlas script (an animation too big for a page goes frame by frame over several) |
| `node tools/render-music.mjs index.html --out f.wav` | renders the music offline |
