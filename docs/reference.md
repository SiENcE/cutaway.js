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
- A game's own room changes: `Cutaway.fx.setTransition({ out, in, draw(ctx, t), ms({ from, to }) })`.
  `draw` replaces the plain fade of a room change (script fades stay plain): `t` has `level` (0..1, how
  covered the picture is), `dir` ("out", then "in"), `from`, `to` (the rooms) and `ms` (since this half
  began). `ms` returns other lengths for some changes (`{ out: 400, in: 500 }` into a camera), or nothing.
- The editor holds the game while it is open (`Cutaway.clock.held`: the logic stands, drawing goes on,
  `Cutaway.clock.advance` still steps; `Cutaway.audio.hold(true)` suspends the sound). The menus'
  own pause is `Cutaway.clock.paused`.
- `intro` and `gate`: see "Sequences and the intro".
- Query switches: `?manual` (the clock moves only on `Cutaway.clock.advance`), `?act=<id>` (begin an
  act at once, no title or card, no intro; with `&alone` that act is played alone, as a demo of it: where it
  would go on to the next, the game ends, which is how `play.mjs --act` tests one act), `?nointro` (leave the intro out), `?edit` (open the editor;
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
- `post: [...]`: post-effects over the room's picture (load `post.js` after `fx.js`), in order, before
  fades and the interface: `{ noise: 0.06 }` (grain, new every 100 ms), `{ palette: ["#030a0a", ...],
  dither: true }` (every pixel by its brightness onto a ramp; `dither` 0..1 an ordered 4x4 pattern),
  `{ scanlines: 2, amount: 0.18 }`, `{ roll: { speed: 30, height: 10, amount: 0.12 } }` (a band of
  light rolling down), `{ vignette: 0.35 }`, `{ tint: "#40ff80", amount: 0.2 }`. Pure functions of the
  clock (screenshots repeat); with the setting "motion" off the grain and the band stand still. A game's
  own: `Cutaway.post.add("name", (px, opts, t) => { ... })` (`px`: `{ data, w, h }`, RGBA, changed in place).
- `mic: { at: [x, y], clear: 40, lost: 160, noise: 0 }`: lines heard through a microphone. An actor of
  the room further than `clear` from it loses words (runs of them show as "…"), all of them at `lost`;
  `noise` loses more everywhere. Which words go is fixed per line. Lines from outside (the one played,
  watching) come through whole.
- `lines: "top"` or `"bottom"`: every line shows in a bar there instead of over the speaker; `label:
  true` puts the speaker's name before it ("Kessler: ...").
- `buttons: false`: the satchel and the buttons beside it don't show in this room (a full-screen computer,
  a map); the keys (H, Tab, Esc) still work.
- `observe: true`: a watched room (a camera's view, a window seen from afar). The one played isn't in
  it: going there (a `goto` or an exit) leaves them where they are, and clicks never walk. Hotspots and
  the actors in it are clicked as usual; the played actor's lines come from off-screen (at the top).
  Leave it with an exit or a `goto` back. It needs no walk area.
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
| `exit: { to, at, face, door, sfx }` | a door: go to that room, stand there. Party members who follow head for it with the one played. `door` names a hidden prop (the door standing open) shown as the actor gets there, with the sound `sfx`, a moment before the room changes (the scene's, not saved); door and room change are one script, so no other click comes in between. Give a door's `walkTo` at the door itself, so everyone walks up to it |
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
| `front: [x1, y1, x2, y2, ...]` | isometric rooms: the front edge of the prop's footprint, a line of room points (a box seen from above: its two front edges, a V). An actor draws in front of the prop when its feet are below the line where they stand (beyond the line's ends, the end's y), so it walks behind a cart and in front of it along the slope. The `baseline` still orders the props among themselves. In room coordinates (a moved prop's line stays). F9 draws it |
| `states: { open: "box_open" }` | an image per object state (`{ state: "box", value: "open" }`) |
| `flip`, `hidden` | |
| `if: "door_open"` | the prop is only there while the condition holds (a gate that stands open from some day on, a sign lit once a flag is set). Unlike `hidden` it is no state of its own: nothing to save, nothing more for the solver. A hotspot that uses the prop's box goes with it; `{ open }` shows it for the scene all the same. One rule says whether a prop is there, for the picture, its hotspot, the editor and the tools: `Cutaway.scene.propThere(p)` (shown for the scene, else not hidden and its `if` holding). `{ show }` and `{ hide }` on a prop with `if` are warned about by validate: its condition decides, and they set a state of their own |
| `alpha: 0.35` | how much of it shows, 0 to 1 (default 1): what stands behind it shows through evenly (a projection, a reflection, smoke) |
| `seeThrough: true` | where it hides an actor standing behind it (one drawn before it), it is drawn see-through over that actor's figure: every other pixel left out, a checkerboard fixed to the room, so the figure shows through. For things that stand in front of where people walk: an umbrella over a cart, a lamp post, a tall sign. Only while their boxes meet |
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
- Isometric rooms use the diagonals: `{ se, ne }` (a front three-quarter view walking down-right, a
  back three-quarter view walking up-right), mirrored for `sw` and `nw` (or give those too). A costume
  whose `walk` has a diagonal turns the actor to the diagonal of every step (a level step keeps the
  row it faced); `facing` and `{ face }` take `se ne sw nw` (and `left right up down`, shown as
  `sw se ne se`). A view missing for one row uses the other's.
- `poses`: costume entries while a condition holds (the first pose naming a state wins). A pose's `walk`
  (else its `idle`) also decides which ways a step turns the actor, so a figure drawn in the diagonals elsewhere
  can have `{ down, up, right, left }` in one room seen from above; a pose's `speed: [x, y]` is its walking speed
  while it holds (`poses: [{ if: "at:juno=market", idle: {...}, walk: {...}, speed: [40, 40] }]`).
- Extra costume keys are one-shot animations: `{ anim: "pip:reach" }`.
- An actor without a `costume` is a voice only (someone on the phone, a megaphone far away): it can
  `say` lines but is never drawn, so don't place it in a room.
- Double click (or double tap) makes the played actor run.
- Clicking another actor walks the one played up beside it, and the two turn to each other. `walkTo: [x, y]`
  (and `face`) on the actor says where to stand instead: someone behind a counter is talked to from its
  front (`face` then is the way the one played looks there, and neither turns).

## Extras

People who only make a room lively: a crowd, passers-by, a market's bustle. Load `extras.js` (after
`time.js`) and give a room its `extras`:

```js
extras: [
  { costume: { idle: { down: "man_idle_d", up: "man_idle_u", right: "man_idle_r" }, walk: { ... } },
    at: [210, 300], path: [[480, 300], [480, 360]], loop: "back", speed: [24, 12], pause: 800 },  // walks there and back
  { costume: { idle: "woman_idle_r" }, at: [140, 280], facing: "left" },                           // stands about
  { costume: { idle: "guard_idle_r" }, at: [600, 200], block: true },                               // stands in the way
]
```

- They are not actors: no id, nothing in `Cutaway.actors`, not saved, not clickable, never seen by the
  solver, the graph or `debug.settle()`. Each room load starts them afresh where their data puts them;
  as long as the one played doesn't move they move the same way every time (screenshots repeat).
- A walking one goes from `at` through `path`, then on to `at` again (`loop: "around"`, the default) or
  the same way back (`"back"`), at `speed` (px/s along x and y, slower up and down like the actors),
  standing `pause` ms at each point.
- A standing one plays its idle in its own time (no two in step), turns now and then to one of `turns`
  (default: the ways its idle can face; `false`: never) and back to `facing`, turns to look at the one
  played when she comes within `notice` px (default 24; 0: never), and leans `give` px (default 3)
  away from whoever passes closer.
- **They never stand in the way of the one played or of the actors.** They make way: a walking one
  that meets someone steps aside just far enough (to its right for someone coming towards it, else away
  from them; at most `side` px, default 14, and only where the walk map lets it stand), else waits, and
  after 2.5 s turns back the way it came. Two walking ones pass each other on their right. The one
  played is never held up, so a click walks exactly as in a room without them.
- `space: [w, h]` is the room an extra keeps round its feet (half width and half height, default
  [7, 4]); nobody walks into it. Where a crowd must not be walked through, leave it out of the walk
  map, or give a standing extra `block: true`: its space is cut out of the walk map (a hole, the same
  for the solver; its `if` isn't asked there).
- `apart: true`: a standing extra stands where nobody walks, on purpose (a vendor behind a counter, someone on a
  crate or a stage): outside the walk map, which validate otherwise warns about. It still idles, turns and looks.
- `if: cond` shows it only while the condition holds.

## Items

```js
Cutaway.item("key", { name: "key", icon: "inv_key", look: "A brass key.",
  combine: { string: [{ remove: "key" }, { give: "key_on_string" }] } });   // works both ways round
```

`fixed: true`: it stays in the bag, a click only looks at it (a companion who lives in there, a keepsake).

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
| `{ sequence: "flashback", restore: false }`, `{ shot: "name" }` | play a sequence (`restore: false`: the scene stays on its last shot instead of going back to the room it was in, so a `goto` after it changes rooms from there, with that room's transition); mark a shot in one ("Sequences and the intro") |
| `{ if: cond, then: [...], else: [...] }`, `{ once: [...], else: [...] }` | logic: such a step has only these keys (`{ give, if }` does nothing; validate says so). A `once` is marked by its place in the script, and an `if`'s `then` and `else` (or a `once`'s own steps and its `else`) count as the same place: a `once` first in both shares one mark, and validate calls that an error |
| `{ hint: true }` | the hint for now, as the hint button gives it (each ask one plainer): a character or a thing that gives the hints |

Add your own: `Cutaway.script.action("organ", async (step, ctx) => { ... })`. A third argument tells the
validator which flags a step of it sets or reads: `{ sets: (s) => [`tag_${s.tag}`], tests: (s) => [...] }`.
An action that may go on at once returns `Cutaway.script.goOn(step, done)`: the promise when the script
waits for it, nothing with `wait: false`, and in both cases the editor's timeline knows how long the step still
runs (a tween it starts with `Cutaway.tween.to` counts by itself).

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

## View flags

`Cutaway.state.view("deck_app")` declares flags that only say what a screen of the game's own shows (which
window is open, which page). They are saved like any flag, but the solver doesn't count them as state: from
each state it opens every view it can (by moves that change nothing else), plays every other move once, and
puts the clicks that open a view into its path (so `play.mjs` clicks them too). A view may change what can
be clicked, never what a click does.

`Cutaway.state.watch(fn)` tells `fn(kind, name, value)` of every read of the state (kind `"flag"`, `"item"`,
`"obj"`, `"hidden"`, `"visited"` or `"at"`); `watch(null)` stops it. Tools use it: `graph.mjs` asks what each
move depends on. `Cutaway.state.peek(name)` reads a flag without telling it: the engine's own bookkeeping (the
clock asking which moments have happened) is no move's condition.

## Conditions

| condition | true when |
|---|---|
| `"flag"`, `"!flag"`, `"count=3"` | a flag is set (not set, has that value) |
| `"chits>=80"`, `"day<3"`, `"tries>2"`, `"n<=0"`, `"mood!=sad"` | a flag compared with a number (an unset flag is 0; `!=` compares as text, like `=`) |
| `"time>=22:00"`, `"moment:ring"`, `"seen:ring"` | game time ("Game time, routines and moments") |
| `"setting:violence=bars"` | a player's setting (a game's own, `Cutaway.settings.define`, or the engine's) |
| `"has:key"` | the played actor's bag holds it |
| `"visited:yard"` | the room was entered |
| `"is:bolt"` | bolt is the one played |
| `"at:bolt=yard"` | bolt is in that room |
| `"state:box=open"`, `"hidden:box"` | an object's state, or hidden |
| `["a", "b"]`, `{ and: [...] }`, `{ or: [...] }`, `{ not: c }` | combinations |

## Game time, routines and moments

A day and a time of day, separate from the frame clock, saved with the game (the flags `day` and `time`,
in minutes). Load `time.js` (after `script.js`). It only moves when a script moves it:

```js
Cutaway.time.configure({ start: "18:00", end: "04:00" });   // a game day from 18:00; `next` stops at its end
// steps: { time: "+15" } on by 15 minutes; { time: "22:00" } on to 22:00 (never back);
//        { time: "next" } on to the next change; { time: "18:00", day: "+1" } the next day; { time: "21:30", day: 1 } set both
Cutaway.routine("kessler", [                                // where an actor is when (outside every entry: in no room)
  { day: 1, from: "22:00", to: "22:15", room: "cam03", at: [120, 140], face: "se", path: [[120, 140], [160, 120]] },
  { day: 1, from: "22:30", to: "22:50", room: "cam04", at: [90, 150], if: "!kessler_warned" },
]);
Cutaway.moment("ring", { room: "cam04", day: 1, from: "22:30", to: "22:45",   // a scene in a room within a window
  play: [{ say: "kessler", text: "Here. All of it." }, { set: "ring_given" }],  // when it is watched
  unseen: [{ set: "ring_given" }] });                                          // when the window passes unwatched
```

- A game day runs 24 hours from `start`: a clock time earlier than the start is the next morning, so
  with `start: "18:00"` the time `"01:00"` comes after `"23:00"`. Give the time at an act's start
  (`{ time: "21:30", day: 1 }`); before that it is day 1 at the start.
- Conditions: `"time>=22:00"`, `"time<23:30"`, `"time=22:00"`, `"day=2"`, `"day>1"`; `"moment:ring"`
  (it happened, watched or not), `"seen:ring"` (it was watched).
- **Routines:** when the time changes, every actor with a routine is put where its first entry that
  holds says (`day`: a number or a list, default every day; `from` up to `to`; `if`). An entry's `path`
  is walked round and round while its room is shown (the look only: positions aren't saved state).
- **Moments** happen once. Once the time is in the window, a moment plays its `play` script as soon as
  its room is the one shown (it waits for a watcher, within its window); if the window passes and nobody
  watched, it happens unseen and runs `unseen` (what it leaves behind). `next` stops at every
  routine's and moment's start and end, and at `Cutaway.time.mark("23:00")`.
- **Saving while a moment plays:** a script can't be saved half-way (see Saves). A moment that plays as a script of
  its own (its room is entered when its time has come) holds the game as it was just before it
  (`Cutaway.save.hold`; the save's `playing` names it): loaded, the player is there again and the moment plays from
  its start, so no step is done twice and nothing waits for steps that never came. A moment that plays inside a
  script (the one that waited, or went into its room) is part of that script: a save in its middle is the game
  before that script, and the player does the click again.
- **Holding the clock:** `Cutaway.time.hold((to) => ...)` is asked with the minutes a step would go on to; a true
  value keeps the time where it is until the state changes (a deadline the player must not sleep through).
  `next` then gives null, so the solver can't wait past it either, and `Cutaway.time.holding()` gives that value
  for the next change (a text saying why, say). A step to a new day isn't held.
- `Cutaway.time.now` (`{ day, minutes, text }`), `Cutaway.time.next()` (minutes, or null), and the
  event `"time.changed"`. `configure({ waitPoint: () => ({ x, y }) })` tells `play.mjs` where the
  game's own button for waiting is; without it, it runs the step. `Cutaway.time.config` (`{ start,
  end, marks }`), `.routines` and `.moments` are what the editor's Schedule tab draws; `Cutaway.time.source(kind,
  id)` (`"routine"` or `"moment"`) where each was defined (the script's address, line and column, from the
  stack when it was made), so the tab can change its times in that file.
- The solver waits as a move of its own ("wait": on to the next change), so a game that needs the
  player to be watching at the right time is checked like any other; waiting past a moment the end
  needs shows up as a soft-lock.

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
  The logo may be an animation (it plays on the game clock: a glitch now and then); the small print
  takes the skin's `labelColor`. `menu: { x, y, w, dim }` places the title's menu (and its load and
  settings pages): `x` its left, or below 0 its right edge from the screen's right (`x: -6`), `y` its top
  or below 0 its bottom (default `y: -18`, centred), `w` its width (default 136).
  `splash: { room, view, prompt, music }` puts a screen before the title on start-up: its room as a
  backdrop (the game's key art, its people), a blinking prompt at the bottom ("Click to start", or
  `prompt`), until a click or a key; then the title screen comes in. Left out where the intro is
  (`?nointro`, `?act=`, `?edit`) and on the way back from the game. `Cutaway.acts.splashing` says whether
  it shows.
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
- `Cutaway.sequence.source(id)`: where the game's code defines it (the script's address, line, column; null
  for one the edits layer made). The editor's Sequences tab writes changed steps there.
- `intro: "id"` (start option) plays it before the title screen (or the first act) the first time the
  game starts on this machine; skipped or not, it is then remembered (`Cutaway.settings.seen(id)`, kept
  beside the settings, not reset with them). `introAlways: true` plays it on every start (an intro
  short enough, or one that leads into the title: a click goes on a shot, Esc skips it). The title
  screen gets "Watch intro" (`@cutaway.title.intro`) to see it again. `?act=`, `?nointro` and `?edit`
  leave it out.
- `gate: { room, view, prompt, introOnly }` (start option): browsers let sound start only after a click or a key.
  Before the intro and the title, if sound can't start yet, the gate shows `room` as a still (at `view`,
  its top left) with `prompt` blinking at the bottom (default `@cutaway.gate.prompt`, "Click to start");
  the click or key starts the sound and goes on. Where sound may start at once (a desktop shell, a
  browser that allows it), there is no gate and the sound starts right away. `introOnly`: only when the intro
  is about to play, so that it isn't silent; a start without it has no gate (a click on the title lets the sound start).
- The Node tools don't play the intro: validate and solve don't start the game that way, and `play.mjs`
  and `shot.mjs` add `?nointro` (`--intro` plays it: `play.mjs --intro` plays it through to the title,
  then again from "Watch intro", with a click and Esc). `await Cutaway.debug.settle()` plays a sequence
  to its end. The validator checks sequences (each step in the room its last `goto` shows: the props
  `move` and `play` name must be there), `intro` and `gate`.

## The timeline (the editor's Sequences tab)

`src/timeline.js` (`Cutaway.timeline`, not in a game's load order: the editor loads it) plays a sequence to look at
moment by moment: silently, on the game's clock, stepped by hand (one logic step, then the promise chains go on), so
where it stands is a pure function of the time since its start.

```js
const tr = await Cutaway.timeline.trace("intro");   // { ms, steps: [{ path, step, kind, start, end, until, branch, depth }], shots, rooms, music, waits }
await Cutaway.timeline.seek("intro", 7250);         // the picture 7.25 s in, held there
Cutaway.timeline.play(); Cutaway.timeline.pause();      // on in real time with its sound, and held again
await Cutaway.timeline.close();                     // the game as it was before
const steps = Cutaway.timeline.edits.move(Cutaway.sequence.get("intro").steps, tr, "sequence.intro.9", 4000);
```

- Before each run the game is put back as it was (state, actors, party, the room; a backdrop stays a
  backdrop) and the clock set back to the same start (`Cutaway.clock.rewind(t)`: waiting timers and tweens
  keep what they have left), so a game's own drawers that read `Cutaway.clock.time` look the same at the same
  moment. A script of the game under way runs to its end first.
- A step's `start` and `end` are when it began and when the sequence went on; `until` is when what it started
  had finished (a tween, a walk, a dissolve, a caption's hold with `wait: false`). `path` is the script
  runner's (`sequence.intro.7`; in a branch `sequence.intro.7.0`, the `if`'s `branch` says which).
- While it seeks, `Cutaway.audio.quiet` is on: sounds, stingers and voices don't sound; the music and the
  rooms' loops follow what they are told. Lines that wait for a click go on when their time is up, a card
  after 3 s; a dialogue's choices end the run (`waits: "choice"`), and so does `Cutaway.timeline.cap` (10 minutes).
- What the engine tells it: `Cutaway.script.watch(fn)` (each step's start, end, branch, and what it still
  runs), `Cutaway.tween.watch(fn)`, `Cutaway.script.goOn`, and `Cutaway.sequence.abort()` (stops the sequence
  playing without its `after`). `Cutaway.clock.advance(ms, false)` steps without drawing.
- `Cutaway.timeline.edits`: pure functions on a copy of a sequence's steps, guided by a trace: `length(steps, tr,
  path, ms)`, `move(steps, tr, path, t)` (a step that goes on at once: the waits round it split and join, nothing
  else moves), `ripple(steps, tr, path, d)` (it and all after it), `insert(steps, tr, t, step)`,
  `remove(steps, tr, path)` (its time stays as a wait), `locate`, `lengthKey`.
- The edits layer makes a sequence the game doesn't have (`Cutaway.edits({ sequences: { boat: { steps } } })`).

## Hints

```js
Cutaway.hints([
  { if: "!got_key", about: "shelf", text: ["Something up high?", "Bolt is tall.", "Play Bolt, use the shelf."] },
  { about: "lamp", text: "The clean bulb goes into the lamp post." },
]);
```

`Cutaway.hints.configure({ by: "evi" })` has an actor say the hints (in their voice and colour, no "Hint:"
prefix): a character who gives them. The first hint whose `if` holds is the one for now; each ask (the bulb by the satchel, H, the pause
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
- **Sound places**: a sound at a room point is heard from the listener (the one played, where she
  stands; else the middle of the view): full within `near` px (default a quarter of `reach`), falling
  off, squared as the ear hears it, to nothing at `reach` (default 240), to the side it is on (by how
  far across half the screen, never wholly in one ear), and duller with distance (a lowpass down to
  900 Hz at the reach). Ten times a second it is heard anew as the listener walks.
  - an ambience loop: `ambience: [{ sfx: "wok", at: [420, 300], reach: 260, near: 40, gain: 1 }]`
    (a market: each stall's sound where it is; loops without `at` play everywhere);
  - a tune at a place, beside the room's music (a busker, a jingle, a second radio): a loop that plays a theme of the score
    with a player of its own, `Cutaway.sfx.define("busker", { loop: { theme: "busker_tune", speaker: 0.6, gain: 1 } })`, then
    `ambience: [{ sfx: "busker", at, reach }]`; `speaker` 0..1 makes it sound through a small speaker, `gain` (default 1)
    scales the theme's own mix, `section` and `intensity` say where it starts and which layers play;
  - a room's music: `music: { theme: "radio_song", speaker: 1, at: [430, 310], reach: 300 }` (a radio
    on a stall: the music bus goes through the place, `Cutaway.audio.place`);
  - a one-shot: `{ sfx: "cleaver", at: [x, y], reach: 200 }`.
  `Cutaway.sfx.heard(place, point)`, `heardNow()` and `listener()` say how it is heard (tests, tools).

## Music

- Instruments: `Cutaway.synth.define(name, { type: "sub" | "fm" | "pluck" | "drum", ... })`.
  Sends: `reverb` (a short room), `hall` (a long, dark reverb, 6.5 s: distance, a city at night),
  `delay` (echoes), each 0..1. Expression for `sub` and `fm`: `bend: { from: -120, time: 0.3 }` starts
  every note 120 cents low and slides it onto its pitch (a CS-80's ribbon, a scoop);
  `vibrato: { rate, depth, delay, rise }` with `rise` waits `delay` seconds, then deepens over `rise`.
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
- An actor's `lineBox: { x, y, w, align }` puts its lines at a place of its own whenever it isn't drawn in
  the room shown (a voice from a screen, a speaker, a bag): aligned to x (`"left"`, `"right"`, `"center"`),
  their bottom at y, wrapped to w. `Cutaway.ui.linePlacement()` says where the line on screen shows.
- Recorded voices (the editor's Voices tab) replace the blips line by line: a language's voices file
  `Cutaway.voice.layer("de", { "Hallo!": { sample, ms, from, gain }, "robby|Hallo!": { ... } })` keeps
  clips by the line's text in the game's data (before translation), or by `"actor|text"` for one
  speaker (that one wins). `sample` is a data URI, `from` trims the start (ms), `ms` is how long it plays:
  the line stays on screen at least that long. Lines without a clip in the language played blip.
- Texts are written in the game's first language, inline. Other languages are tables:
  `Cutaway.i18n.table("en", { "Hallo.": "Hello." })`; `"@key"` texts look a key up instead.
- Texts a game shows through its own code (its UI layers, its own actions, lists the engine doesn't
  know) are declared, so validate and the Texts tab see them like the data's:
  `const L = Cutaway.i18n.declare("deck", ["NACHRICHTEN", "Kein Zugang."])` (returns the list; repeat
  calls add). The game still draws them through `Cutaway.i18n.t(text)`. Validate checks them like the
  others (an `"@key"` must exist in every language, a literal text needs a translation in every other
  one); the Texts tab lists them as "game: deck".
- The editor's Texts tab exports every text as CSV or JSON for translators and imports them back.

## Scrolling

A game's own list (a UI layer) scrolls by listening: `Cutaway.events.on("pointer.wheel", ({ x, y, dy }) => ...)` (`dy` in screen pixels, the page
itself doesn't scroll), and for a finger `Cutaway.events.on("pointer.drag", ({ x, y, dx, dy, from, claim }) => ...)`: `dx`, `dy` what it moved since the
last time, `from` where it went down, `claim()` takes the drag, so that coming up doesn't act. Give it buttons too: a mouse without a wheel and a
controller have no other way. The demo's logbook in the hall shows it (`demo/game.js`).

A layer tells the rest of the game about them: `targets()` gives what can be clicked on it now (`{ x, y, w, h, name }`), so the marks show them and
`Cutaway.ui.targets()`, everything clickable on the screen with the hotspots, has them for a controller's pointer; `reveal(id)` says where a click brings
a hotspot nearer that the layer has scrolled away, and `tools/play.mjs` clicks there until it shows.

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

- An autosave on every room change, three slots in the pause menu (Esc), which the load page can also delete (it asks first), versioned:
  `Cutaway.save.configure({ migrate: (data, from) => data })` updates old saves.
- **A save never holds a script half-way.** While a script runs (a click's, a dialogue, a room's `enter`), a save is
  the game as it was just before it: saved from the pause menu in the middle of a line and loaded, the player
  stands before the click that began it, with none of its steps done. The autosave of a room change inside a
  script (a `goto`) is written when that script has ended, with all of it. The pause menu offers no hint while a
  script runs. `Cutaway.save.capture({ live: true })` is the game as it is right now, for tools.
- **When the game is replaced, the scripts under way end first** (`Cutaway.script.abort()`; loading a save and
  going back to the title do it): no further step runs, and what the steps under way wait for is let go (the
  line, a card, open choices, walks, animations, waits), so nothing of the old game happens to the one that
  comes. Never call it from a script's own step: it would wait for itself.
- What a script waits for on an actor ends by one rule (`actor.settle()`): a new walk, a new animation, `stop()`
  and `place()` all let an awaited walk or animation go on, and an actor a script has walking or playing an
  animation in a room that isn't shown walks there all the same and arrives. `walkTo` resolves `true` when the
  actor got there and `false` when the walk was taken away first.
- **One rule for "the player may act now"**: `Cutaway.ui.canAct()` (somebody to play, no script, no menu or
  card, not the title or its splash, no cutscene). The satchel, the portraits, the buttons by the satchel, the
  hint (H) and the keys 1–9 all ask it and add only their own (a dialogue's keys 1–9 ask
  `canAct({ script: true })`: a script may run, the pause menu may not be open). A game's own input asks it too.
- **A click's walk to a hotspot** ends in the hotspot's script only if it is still the click's when the actor
  gets there: the same room shown, the same actor played and in it, the walk not stopped or replaced, no save
  loaded meanwhile (`Cutaway.ui.cancelClick()` makes the click under way come to nothing; switching actors and
  loading do it). A script that runs when the actor arrives (a tip said on the way) goes first: the hotspot's
  script waits for its end (`Cutaway.script.idle()`) and then runs.
- Touch: a second finger while one is down is ignored (no look from the first one's hold). Tab marks the
  hotspots while it is held, and the window losing the focus lets it go (`Cutaway.ui.marking`).
- Settings belong to the player, not the save (localStorage per game). The pause menu's Settings has
  four pages: Sound (`master`, `music`, `sfx`, `voice` 0..1, `voices`, `muteUnfocused`), Text and
  dialogue (`textSpeed` 2 / 1.5 / 1 / 0.7, `advance` "auto" or "click": lines wait for a click, a key
  or Space, the arrow bobbing; `textBox`), Picture (fullscreen, `fit` "sharp" or "fill", `crt`
  "off" / "scanlines" / "crt", `motion`: shake and flickering lamps), Controls (`swapButtons`: in the
  room the left button looks, `alwaysRun`, `holdMs` 300 / 450 / 700, `buttons`: the eye and menu
  buttons for the mouse too, `hintButton`), and "Reset to defaults". `Cutaway.start({ settings })` sets
  a game's defaults; `Cutaway.settings.set({...})` and `.values` in code.
- A game's own settings: `Cutaway.settings.define("violence", { page: "content", pageLabel: "Inhalt",
  label: "Gewalt", options: [["bars", "Balken"], ["shown", "gezeigt"]], default: "bars" })` before
  `Cutaway.start`: a row on one of the pages (`"sound"`, `"text"`, `"picture"`, `"controls"`) or on a page
  of its own, kept with the others, back to its default with "Reset to defaults". Conditions:
  `"setting:violence=bars"`. `Cutaway.settings.get(key)`.
- `Cutaway.scene.boxes()`: what can be clicked now, as boxes on the screen (`{ id, actor, name, box: [x,
  y, w, h] }`), for a game's own overlay layer (brackets round people and things).
- The skin: `Cutaway.ui.skin({ cursor, font, labelColor, outline, accent, panel, buttons, frame, card, label, choices })`;
  `frame` colours the menu's frame: `{ light, face, dark }` (the bevel), `fill` (inside), `plate` (the
  heading's), `rivet`, `rivetLight`, `rivetDark` (the corner fittings), `hover` (the chosen row's band).
  A game with a look of its own gives `frame.draw(ctx, x, y, w, h, o)` and draws every frame itself;
  `o.kind` says what it is (`"page"` a menu page, `"plate"` the heading's plate across its top, `"card"`,
  `"button"` with `o.hover`), `o.small` a thin one, `o.fill` the inside. `card: { draw(ctx, c) }` draws
  the full-screen cards (act titles, the end) instead of the built-in look: `c` has `title`, `lines`
  (wrapped), `buttons`, `hover`, `ms` (how long it has shown, game time: for typing it on), `titleY`,
  `textY`, `buttonsY` and `buttonRow` (where the menu takes the clicks: buttons centred, one per row).
  `label: { font, format }` gives the hover labels (and a finger's) a font of their own and a way to show a
  name (`format: (t) => "[ " + t.toUpperCase() + " ]"`). `choices: { draw(ctx, c) }` draws the dialogue's
  choices: `c` has `texts`, `hover`, the panel's box (`x`, `y`, `w`, `h`: full width, at the bottom),
  `textY` (the first line's top), `line` (the distance between lines: 10, or the font's line height + 1
  if that is more) and `color` (the speaker's); clicks and the keys 1–9 still pick by line.
  `Cutaway.menu.frame(ctx, x, y, w, h, { small, fill })` draws one for a game's own pages,
  `Cutaway.party.layout({...})`, `Cutaway.inventory.setSprite(...)` (a sprite or an animation, like the skin's
  `cursor`, `cursorHot` and `buttons`: they play on the game clock), `Cutaway.inventory.setCorner("bottom")`
  (the satchel in the bottom right, its bar sliding up from the bottom edge; the hint button beside it).
- Drawing over the room in screen space: `Cutaway.events.on("frame.screen", (ctx) => ...)` for what belongs
  to the picture (a computer's screen, a camera's display: room changes and fades cover it),
  `"frame.ui"` for what lies over the fade (under the subtitles, labels and cursor).
- Events to listen to: `Cutaway.events.on("room.entered", fn)` (`{ id }`; `{ id, peek: true }` when the editor only
  shows the room: not visited, no autosave), `"say"`, `"game.end"`, `"act"`,
  `"sequence.start"`, `"sequence.shot"`, `"sequence.end"`, ...

## Tools

| tool | |
|---|---|
| `node tools/validate.mjs index.html` | every reference resolves (an act's `prologue` names a sequence, a hint's `act` an act), shapes are sound, texts are translated; a script step is never `null`, an `if` or `once` step has no keys it doesn't read, two `once` don't share a mark; `"time>=22"` (minutes, not hours) is warned about |
| `node tools/solve.mjs index.html --full` | proves the game can be finished, lists soft-locks, checks hints (`--workers N`: threads that search, default one less than the cores, at most 12; `--max N` states). It plays what a player can: every choice of every dialogue a click opens (one inside another, several in a row, in a moment's script), items only where the room has its bag (not with `buttons: false`) and never a `fixed` one in the hand. Exit code 1: unsolvable, a soft-lock, a state without a fitting hint, or the search stopped at `--max` (nothing is proved then). A dialogue more than 40 choices deep is an error (one that changes the state with every choice never ends) |
| `node tools/play.mjs index.html [--touch] [--intro]` | plays it through in headless Chrome with real clicks (or taps); `--intro` plays the intro first. Only a demo's end (an act played alone, `--act`) may come before the path's: any other end before it fails |
| `node tools/graph.mjs index.html [--act id] [--set f,g] [--out f.js]` | the game's connections: every state searched, every move watched (what it needs, what it brings about), as a puzzle dependency chart with the winning way, and how much each flag, item or once-mark multiplies the states; into `out/graph/<act>.js` (the studio's `graph` folder), shown by the editor's Connections tab and by `tools/graph.html` |
| `node tools/studio.mjs [index.html]` | the editor's local server: saves into the game, runs its tasks (`studio.json`: write, layers, tasks with `{name}` parts the editor fills, palette, editor: the game's own tabs) |
| `node tools/shot.mjs index.html ...` | screenshots (`--query`, `--eval`, `--out`, `--buffer`; `--intro` lets the intro play); a page that doesn't load (no `Cutaway` in it after 10 s) fails with no picture. The tools' Chrome (`tools/lib/chrome.mjs`) never hangs: a command fails when the page crashes, the connection closes or 5 minutes pass |
| `node tools/build-atlas.mjs dir... out.js` | packs PNGs (pxl output) into an atlas script (an animation too big for a page goes frame by frame over several) |
| `node tools/render-music.mjs index.html --out f.wav` | renders the music offline |
