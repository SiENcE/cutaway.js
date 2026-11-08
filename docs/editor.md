# The Cutaway editor

The editor works inside the running game: what you change shows at once, and you can play it right away.
It saves its own files (layers) next to the game's code, which the game loads after its own data, so
nothing hand-written is ever overwritten.

This guide is also inside the editor: **F1** (it opens at the section of the workspace you are in) or
Help > Editor guide, with the engine's reference beside it (everything a game's data can say).

## Opening it

- **With the studio** (recommended): `node lib/cutaway/tools/studio.mjs` in the game's folder. It starts
  a small server on your computer only, opens the game in the browser with the editor, and lets the
  editor save straight into the game's folder and run the game's checks and builds.
- **Without it**: F10 in the game (or `index.html?edit`). Saving then goes through the browser's file
  picker, or downloads the file, and a game's own tabs are missing; the status bar and a line under the
  workspaces say why and how to get the studio.
- **The indicator** at the top right: "studio ●" the studio is connected, "studio ○" it isn't. The studio
  opens the page at `…/index.html?edit&studio=<token>` and prints that address: the token is its key, so a
  page without it (typed by hand, opened as a file, an old tab) gets no studio. Open the printed address.
- **Play** (the ▶ button, or F10) closes the editor and plays from where you are; F10 again opens it.
  F9 shows the debug overlay.
- **The game is paused** while the editor is open: nobody walks, scripts and sequences wait, scrolling
  props and effects stand still, the music and the room's sound are held (not in Sound and Voices, where
  you listen). **Ctrl+P** (or the Pause key, Play > Pause game, the ⏸ button in the status bar) lets it
  run while you watch, and pauses it again; **F8** (Play > Step) runs the paused game on by 100 ms.
  Closing the editor lets it run.
- `?edit` leaves the game's intro and the acts' prologues out (so does `?nointro`); the title screen's
  "Watch intro" plays it, and Play > Sequences plays any of them in an editor session.

## The layout

The editor docks around the game in its own page, like most editors:

- **The menu bar** on top: File, Edit, View, Room, Art, Play, Tools, Help (below). On its right: the
  room to open, **▶ Play**, and whether the studio is connected.
- **The left panel**: the **workspaces** (Room, Texts, Things, Art, Sound, Voices, Dialogue, State,
  Issues, Checks, Connections, Map, Time, Sequences; a ● marks one with unsaved work; the help isn't one of them:
  the Help menu and F1 open it), the **rooms** (click one to open it), and what
  is in the room: hotspots, props, actors, lamps, effects. A click selects it in Room (its shape) or in
  Things (its properties and scripts; actors always, and anything while Things is open). In the Art
  workspace the list shows the sprites instead (click: select, double-click: paint), in Voices the
  spoken lines. Each part folds at its heading.
- **The centre**: the game picture, as large as fits in whole pixels. A workspace can put a view of its
  own there while it is active: the paint view, or a pxl source. Switch to another workspace and the
  game picture is back; come back and the view is too.
- **The inspector** on the right: the active workspace's panel.
- **The status bar** at the bottom: whether the game is paused (⏸ paused, ▶ running, or the sequence
  playing; click it to switch), the last message (click it for all of it), the cursor's position in
  the room (or the pixel and its colour while painting), what isn't saved, the studio. **Output** opens
  the output pane above it: every message, and the output of the tasks.

The panels scroll on their own; View shows or hides each of them (kept for the next time). **Drag a
panel's inner edge** to make it wider or narrower (the left panel's right edge, the inspector's left edge,
the output pane's top edge; a double click on the edge gives back its first size); the sizes are kept too.

## Lists and the keyboard
Every list (the workspaces, the rooms, the room's things, the sprites, the sounds, the things to pick
in Things, the dialogues, the spoken lines, the Room tab's shapes) works the same way:

- **Up / Down** move through it, and what the cursor gets to is picked (in Sound it plays: a quick way
  to hear them all); **Home / End**, **Page Up / Page Down** jump; **Enter** opens (paints a sprite, plays
  a loop, edits a dialogue, records a line).
- **Letters** jump to the next name that starts with what you type (a folded group opens for it).
- Long lists are **grouped** (sprites by room or first part of the name, sounds by first part, things by
  kind, lines by speaker or place) and the groups **fold**: click a group's heading, or **Left / Right**
  on it (Left on a row goes to its heading), **+** and **-** open or fold them all. What is folded is
  kept for the next time; groups with many rows start folded.
- **/** goes to the list's **filter** (above it): type to narrow the list down (groups with matches
  open); Down goes back into the list, Enter opens the first match, Esc clears it.
- The keyboard stays in the list when the panels are built again (after every change), and so does its
  place and scroll.

Sections in the inspector (State's flags, the Texts groups, Things' scripts, a dialogue's nodes) fold
the same way at their headings (also with Enter or Space on the heading).

## Menus

| menu | what |
|---|---|
| File | **Save** (Ctrl+S: what the workspace you are in has; Room: the shapes, Art: the painting, the pxl source or an import), **Save all** (Ctrl+Shift+S: every workspace with unsaved work), **Reload game**, **Close editor and play** (F10) |
| Edit | **Undo** (Ctrl+Z), **Redo** (Ctrl+Y or Ctrl+Shift+Z), **Delete**, **Select none** (Esc): for the paint view while it shows, else the workspace (Room: the shapes) |
| View | the debug overlay (F9), **Game interface** (the portraits, satchel and buttons; hidden while editing, so they don't cover the shapes), the Room shapes to show (walk, hole, hotspot, prop, lamp, fx), the left panel, the inspector, the output pane, **Inspector in its own window**, fullscreen (F11) |
| Room | the rooms (open one), **+ Walk area**, **+ Hole**, **+ Hotspot**, save the shapes |
| Art | **Edit pixels** (the selected sprite), **New sprite**, **Revert** to the game's art, **Import PNG**, **Export PNG**, **Reload art**, the pxl sources (with the studio) |
| Play | **Pause game** (Ctrl+P), **Step** (F8: 100 ms), **Play from here** (F10); the **sequences**: each one, and each from one of its shot marks (the game runs while it plays, then is paused again), **Stop sequence** (as Esc in the game: `after` runs), **Next shot** (as Space); begin an act as a new game, **Test dialogue** (the one picked in Dialogue) |
| Tools | the game's tasks from `studio.json` (their output goes to the output pane), Issues, Checks, Connections, Map, State, and the game's own tabs |
| Help | the editor guide (F1), the reference, the keys, and a game's own guides (its tabs') |

**Inspector in its own window** moves the inspector into a window of its own (the game gets the room
it took); the menus, the browser and the status bar stay with the game. Browsers block such a window
when the page opens it by itself (`?edit`): then it stays docked, open it from the View menu.

## Room: shapes
Walk areas (green), holes (red), hotspots (orange), walk-to points (the yellow cross), props (cyan: a
dotted box, their place and their baseline), lamps (their reach) and effect areas (blue), drawn over
the whole picture (a black fade or the letterbox doesn't hide them).
- Click a shape to select it (or pick it in the left panel), drag inside it to move it, drag a corner,
  **double-click** an edge for a new corner, **right click** a corner (or Delete) to remove it. Arrows
  nudge (Shift: 10 px).
- A **prop** moves by its place handle (the diamond: where it stands, `at`), or by the arrows while it
  is selected; its own baseline goes along. The handle on its baseline moves only the baseline. A prop
  moved here (or whose place the shapes file already has) keeps its place in the shapes file.
- **+ Walk area / + Hole / + Hotspot**: click the corners, then the first one again (or Enter).
- **Zoom and scroll the picture**: the **wheel** zooms it by whole steps round the pointer (every pixel
  stays a sharp square), **Ctrl+0** fits it again (also View > Zoom in, Zoom out, Zoom to fit). When the room
  is wider or taller than the screen, or the picture zoomed larger than the work area, **scrollbars** lie
  along the work area's bottom and right edges: drag the thumb, or click beside it for a page. The **middle
  button** drags the view, **Shift+wheel** scrolls across, the **arrows** scroll while nothing is selected.
- Ctrl+Z / Ctrl+Y undo and redo (in the room on screen: when another room comes, by the game or a
  sequence, the undo starts again). **Save** (Ctrl+S) writes `rooms/<id>.geo.js`, and that of any other
  room changed since it was saved. If the game's page doesn't load that file, it says so (in the output
  pane) with the `<script>` line to add to `index.html`, after the room's own script: else what was saved
  is gone after a reload.
- A lamp without an `id` can be moved, but its place isn't saved in the shapes file: give it an id (the
  room's problems list it).

## Texts
Every text of the game with where it is used: lines, looks, names, dialogue choices, cards, hints, the
sequences' lines and captions, the title screen (its name, tagline and footer) and the gate's prompt.
- Change one and the game shows it at once. **Save** writes the language's text layer
  (`strings/<lang>.texts.js`).
- **this room** shows only the texts of the room you are in (grouped by hotspot); without it they are
  grouped by room, items, dialogues, acts and hints. The groups fold (a long list starts folded);
  **search** finds a text anywhere and opens the groups it is in.
- **Export CSV / JSON** for translators: a row per text, a column per language. **Import** takes such a
  file back (only what differs). A new language also needs its texts file in the page and in the
  game's languages.

## Things
The properties of the room (music, ambience, light, depth scale, background, size, fill colour) and of
what is in it: hotspots (`z`, hidden), props (image, position, anchor, flip, baseline, scroll, depth), lamps
(power, colour, flicker, glow), effects (colour, count, speed ...), actors (colour, speed, running speed,
costume, voice, portraits), items (icon) and the sequences.
- Pick a thing in the list, in the left panel, or **click it on the picture** (a prop that is shown
  before one that is hidden there). **Save** writes the edits layer (`edits.js`). A thing's texts are
  in Texts, its shape in Room. Lamps and effects without an `id` go by their place in the room's list.
- **ambience**: the loops' names, comma separated; a loop with settings (`{ "sfx": "rain", "gain": 1 }`)
  makes it a JSON list (`[...]`), which is shown and taken as it is.
- **scripts**: what the thing does: a hotspot's look, use, talk, take and "with <item>" (an item used on
  it), an item's look and "combine <item>", an actor's look, talk and "with <item>", a room's enter, a
  sequence's **steps** and **after** (what a skip with Esc runs). Each shows a summary; click one to edit
  it as blocks in the centre (next section). **+ script** adds one it hasn't got. A ● marks a script the
  edits layer changed.
- A **sequence** has **▶ Play** (in the game, the editor stays open; from the start or from one of its
  shot marks: what comes before hurries, as a skip does) and **■ Stop**. Its ▶ Test plays it too.
- A prop's **depth** is its parallax against the camera (1 the room, 0 fixed on the screen, 0.5 far
  away, above 1 a foreground). The picture, its outline and its baseline show it where it is for the
  camera now, and a click there picks it.

## Scripts
A script is a list of steps, shown as rows of blocks in the centre. Each row has its kind (a menu) and
its fields:

| kind | fields |
|---|---|
| line, line by, narration | the text (a line by: who says it; nobody picked: the one playing) |
| dialogue | which, and the node to start at |
| walk, face, animation, go to room, place someone | who, where (x y), which way they face, run, in a straight line, "go on" (the script doesn't wait) |
| give, take, remove item | the item, to or from whom (take: what it hides) |
| set, unset, count up a flag; show, hide a thing; a thing's state | the flag (known flags are suggested) or the thing |
| if, once | the condition (`flag`, `!flag`, `has:item`, `flag=3`, `at:actor=room`; `a, b` = all of them; JSON for `{ or: [...] }`) and their branches: then / else, the first time / after that. They fold |
| wait, sound, stinger, music, shake | how long, which, how loud ... |
| fade | `out` (black), `in` (back) or how dark (0..1), ms, colour |
| card, go on to an act | the card's text and title; `next` or an act |
| shot mark, camera, move prop, play prop | a shot's name; where the camera goes (or **follow**), ms, ease, "go on"; the prop, to or by (x y); the prop, its animation, loop |
| letterbox, caption, dissolve, worn tape, play sequence | `true`, `false` or the bars' height, ms; the caption's text (empty: clears it), where, typed in (with a sound), letters a second, how long it stays; ms; how worn (0..1), ms, "go on"; which sequence |
| other (JSON) | any action the blocks don't know (a game's own), as JSON |

- A step's kind is its first key that names an action, as the game reads it (`{ goto, at, face }` goes
  to a room; `face` there is where they look). A step's data the form doesn't show stays as it is (a
  **more** field, JSON); editing keeps its keys in their order.
- Change a field (Enter or leaving it) or the kind, and the game does it from now on; **▶ Test**
  closes the editor and runs the script. **Revert** goes back to the game's own script; **Remove**
  leaves the thing without one (the default line). File > Save (Ctrl+S in Things) writes `edits.js`.
- Keys on a row: **Up / Down** pick a row, **Alt+Up / Alt+Down** move the step, **Enter** edits its first
  field (**Esc** back to the row), **Insert** or **+** adds a line after it, **Delete** removes it,
  **Ctrl+D** doubles it, **Ctrl+C / Ctrl+X / Ctrl+V** copy, cut and paste steps, **Left / Right** fold an
  if or once, Ctrl+Z / Ctrl+Y undo and redo. Rows drag by their grip (⠿): onto another row (before it)
  or onto a list's **+ step** (at its end). **+ step** adds a step of any kind at the end of a list.
- A line shows what it says now if the Texts layer words it differently. Changing a line's text here
  changes the text in the game's data: its translations (Texts) then belong to the old text.
- A script changed in the editor replaces the game's whole script; `once` steps count by their place in
  the script, so moving them may let a "first time" happen again in a saved game.

## Art
Every sprite and animation: preview (animated, zoom), **Export PNG** (the frames side by side, and a
JSON of the frames for an animation). A sprite marked **● imported** is replaced by an import (below):
the game shows that picture, not what its pxl source builds, until it is reverted.
- **Edit pixels** (or a double-click on a sprite): paint it in the centre (next section).
- **Import** a PNG over the selected sprite, or as a new one: one picture, or frames side by side (set
  how many and how long each shows; the anchor is the sprite's, or bottom centre). **Apply** shows it
  in the game now, **Save** writes it into `art/import/` and packs `assets/imported.js` (the studio's
  task "art: imported"); a name there replaces the game's own.
- With the studio, the **pxl sources** (`art/**/*.px.js`) open in the centre as a large editor: Tab
  indents (two spaces), Ctrl+S saves, **Build** runs an art task (its output in the output pane),
  **Save + build + reload art** does all three, and **Reload art** loads the game's atlas scripts again
  without reloading the page (so the editor and the game stay where they are).

### Three ways to change art
1. **Paint it here** (Edit pixels): quick fixes, new frames, a new prop. Saved as an import.
2. **Edit its pxl source here** and build it: the art stays code, made again from the source.
3. **Export PNG**, change it in any pixel editor (Aseprite, ...), **Import** it back. Saved as an import.

An import replaces the built sprite of the same name for as long as its files are in `art/import/`.
To go back to what the source builds, **Revert** it (Art menu, the Art panel, or the paint panel).

## Paint
A pixel editor for sprites, animations and room backgrounds (`<room>_bg` is a sprite like any other).
The picture fills the centre at the biggest zoom that fits; the toolbar has the tools, the mirror,
the flips, the zoom and the grid; below are the frames and a live preview; the inspector has the
colours, the palette, the size and **Apply / Save / Revert / Close**.

| key | tool |
|---|---|
| B | pencil (left button: the 1st colour, right button: the 2nd; transparent at first) |
| E | eraser (transparent) |
| G | fill the area of one colour (Shift+click: that colour everywhere in the frame) |
| L | line (drag) |
| R | rectangle (drag; Shift: filled) |
| I | picker (also Alt+click with any tool; right button: the 2nd colour) |
| M | select a rectangle; drag inside it to move it (it floats until Enter, another tool or Esc) |

- **Ctrl+C / Ctrl+X / Ctrl+V** copy, cut, paste (the selection, or the whole frame); a paste floats where
  the selection is (or in the middle) until you put it down. Ctrl+A selects everything, Delete clears
  the selection. Arrows move a floating selection by a pixel.
- **Flip H / Flip V** (Shift+H / Shift+V): the selection, or the frame. **Mirror** (Shift+M) paints
  mirrored around the centre column too, for front views.
- **Zoom**: the wheel (at the pointer), + and -, **Fit** (0); 1x to 32x; the grid shows from 6x. **Pan**:
  the middle button, or Space and drag. The backdrop behind transparent pixels: a checkerboard or a
  colour (the strip below the picture). The pink mark under the picture is the anchor (where the sprite
  stands).
- **Colours**: the two current ones are shown big (**X** swaps them). The palette has the picture's own
  colours, the game's (the files `studio.json` lists in `"palette"`, their `#rrggbb` colours; without
  them, the colours of the room's background), and colours you add with the colour field. Hover a
  swatch for its hex; left click: the 1st colour, right click: the 2nd. Pixels are painted fully opaque
  or fully transparent: no blending, no smoothing.
- **Frames**: click a thumbnail to paint it; **+ Frame** copies the frame after it, **Delete**, **◀ ▶**
  move it, its **ms** is how long it shows; **Onion** shows the frame before, faint (O); **Play** runs
  the animation in the preview (1x or 2x). `,` and `.` go to the frame before and after. **Resize** (the
  inspector) changes the size of every frame, kept at the bottom centre (an explicit anchor moves along).
- **Undo / Redo** (Ctrl+Z / Ctrl+Y, Edit menu): for each picture on its own, 200 steps.
- **Apply** puts the painting into the running game now (until it reloads). **Save** (Ctrl+S) applies
  it, writes it as an import (`art/import/sprites/<name>.png`, or `anims/<name>.png` + `.json` for an
  animation, and `<name>.anchor.json` when the sprite has an explicit anchor: a prop cut out of a lit
  room keeps its place in the room) and packs `assets/imported.js`. **Revert** removes the import's
  files (with the studio), packs again and loads the art again: the game's own picture is back.
- **New sprite** (Art menu or panel): a name and a size, empty or a copy of another sprite. It is in the
  game after Apply; a prop or an item shows it once its data names it (Things).

## Sound
Every sound: click one to hear it (or go through the list with the arrows: each plays as you get to it).
A synthesised sound is data: change it, **Apply and play**, or keep it **As a new sound**. **Export WAV**
renders one.
- **Import** a WAV, OGG or MP3 over the selected sound or as a new one (a loop stays a loop: room
  ambience). Recorded sounds are embedded, so the game still runs from a file.
- **Save** writes `sounds.edit.js` (synthesised) and `assets/audio.js` (recorded).
- **Music**: play a theme (and section) at an intensity, go back to the room's music, or open the
  **music lab** (every score, its layers and stingers, WAV export).

## Voices
Recorded voices, line by line, like a voice-over session. The left panel lists every spoken line (lines
in scripts, a dialogue's choices, the acts' and sequences' lines) **by speaker** or **by place**, with a
✓ where it is recorded in the language picked; its heading counts them.

- Pick a line and **● Record** (**R**; R again stops) from the microphone, or **Import** an audio file
  for it. **▶ Play** (**P**) plays it as the game does. **N** goes to the next line without a recording,
  **Delete** removes one.
- **cut and level** (on): a recording is cut to the voice (the silence before and after goes, a little
  kept) and brought to a good loudness. **start**, **length** and **gain** change that by hand; the
  waveform shows what plays (green). **then the next** goes on to the next line without a recording
  after each one; **only lines without one** hides the done ones.
- A line someone in particular says (a `say` with their name, or a line under `if: "is:<them>"`) is kept
  for them. A line of whoever is playing is kept for anyone, unless **recording for** names one of the
  party: then that one has their own (and the one for anyone plays for the others).
- It plays in the game at once (the line stays on screen as long as it plays); lines without a
  recording blip as before. **Save** writes `assets/voices.<lang>.js` (embedded, so the game runs from a
  file); the game's page loads it once (`<script src="assets/voices.de.js">`).
- Recordings are WebM/Opus where the browser can (about 6 KB a second). A text changed later is a new
  line: its old recording no longer plays.

## Dialogue
The inspector lists the dialogues (and who talks each one) and the nodes of the one picked: ★ the start,
in orange the nodes nothing leads to. **Edit** (or Enter, a double click) opens it in the centre:

- Each **node**: its name (rename it: the gotos follow), ★ to make it the start, ↑ ↓ to move it, ▶ to
  test from it, ✕ to remove it; where it is reached from; its **on entering** script (blocks, as in
  Scripts).
- Each **choice**: the text, **if** (when it shows), **once**, **silent** (not said, just done), where it
  leads (stay, a node, end), and **then** (what it does: blocks). **▸** marks what the game would offer
  right now, **·** what it wouldn't. **+ choice**, **+ Node** add them.
- Keys on a choice: **Up / Down** pick, **Alt+Up / Alt+Down** move, **Insert** adds one after it,
  **Delete** removes it, **Ctrl+D** doubles it, **Enter** edits its text; Ctrl+Z / Ctrl+Y undo and redo.
- **▶ Test** (also Play > Test dialogue) closes the editor and starts it. **Revert** gives back the
  game's own dialogue. **New dialogue** makes one (an actor's talk script starts it: a "dialogue" step).
- A changed dialogue is kept whole in `edits.js` (File > Save; the same file as Things).

## State
The game in progress, to test from anywhere: who is played and where, **go to** any room, lock and
unlock kids, bring one over, begin an act (also Play > the acts); the **flags** (change, add, remove),
the bag (give, take away), what is shown or hidden in the room and its things' states, the rooms
visited, the hint for now, and a save slot **"dev"** to come back to.

## Issues
The same checks the Node validator runs, on the game as it is now (your changes included): unknown
names, conditions and flags, shapes, walk-to points, translations. Click an issue to open the room and
the thing. (Needs the studio; else the Checks tab runs "validate".)

## Checks
The game's tasks from its `studio.json`: validate, solve (proves the game can be finished, finds
soft-locks, checks the hints), build the art. Their output shows here and in the output pane (Tools
runs them from anywhere). **Reload the game** loads new files (the editor opens again); **Reload art**
loads only the art.

## Connections
The game's connections: every state searched and every move watched (`tools/graph.mjs`), as the puzzle
dependency chart in the centre. A step is a move with what it brings about (one click that opens a box,
takes what is in it or closes it again is three steps), a box in its room's colour with the room's name;
a fact is a pill (dashed: there from the start); the winning way's steps are numbered. Click one: what it
needs lights up to the left, what it opens to the right, and the inspector lists them (each a link).
The wheel zooms, a drag moves, a double click fits everything in.

- **The data:** the files in the studio's `graph` folder (`layers.graph`, default `out/graph`). The game's
  tasks whose names begin with "graph" make them from here (they search every state: minutes in a big
  game) and the new file loads when done; without the studio, **Load a file …** takes one from anywhere:
  make it with `node lib/cutaway/tools/graph.mjs index.html --act <act>` in the game's folder (it writes
  `out/graph/<act>.js`, or `--out` another file).
- **Show:** only what the winning way needs; facts nothing needs; conditions on absence ("not yet …",
  red, dashed); facts read only sometimes; the clock; the search's own flags (what `--set` gave its start,
  such as one shutting a part of the game away). **Rooms:** click one to leave it out. Being in its room
  is a need of every step there, so it alone doesn't put a step on the chart.
- **Open in Things** (a step): its hotspot, actor or item in the Things tab, with the script the move runs
  in the centre as blocks. A fact lists every place in the data that names it (rooms, hotspots, actors,
  items, dialogues, sequences, an act's start), each opening there; "nowhere" means the game's own code
  sets or asks it.
- **Budget:** how many times more states each part of the state makes (a flag, an item carried, an
  object's state, a once-mark, where an actor is): ×2 doubles them, ×1 follows from the rest.
- The other way: the Things tab shows a hotspot's or an actor's steps (**connections**, while data is
  loaded); a click shows the step in the chart.

The same chart opens as a page of its own: `tools/graph.html?data=<the file's URL>` (graph.mjs prints the link).

## Map
Every room at once, each as a picture of its background with its name, and the ways between them:
**exits** (a hotspot's `exit`, solid), **script warps** (a `goto` in any script: a room's entering, a
hotspot's or an actor's scripts, a dialogue an actor in that room opens; dashed) and, when shown,
**sequences** (the rooms a sequence goes through). From the rooms the acts begin in, the ways are followed:
a room none of them reaches is **unreachable** (dashed red; the title screen's rooms and a sequence's own
are seen elsewhere, so they don't count), a way to a room that doesn't exist is **broken**. The line on
top counts them.

- Click a room: its **ways out** and **ways in**, each with where it is in the data (a hotspot, a script,
  a dialogue) and the condition it is under (`if ...`); click one to open it there. **Open** (or a double
  click) shows the room in the Room tab, **Things** its properties and scripts.
- Drag a room to place it (kept for this game in the browser); **Re-layout** lays them out again, a column
  per step from the start. The wheel zooms, a drag on the ground or the **scrollbars** move the view, **Fit**
  (or a double click on the ground) shows everything.
- **only the picked room's ways** hides the rest; **light up what is unreachable** dims the others.

## Time
The game day as a timetable (for a game with game time: routines and moments, the reference's "Game time"),
one day at a time: pick it with the **day** buttons (every day something names, and today). Each actor with a
routine is a row; its entries are **bars** from their start to their end, coloured and named by the room they
put the actor in (no room: grey). An entry under an `if` is **striped**; entries that hold at the same time
under different conditions lie in lanes of their own. Each **moment** is a row too, its window a bar in its
room's colour. The **yellow lines** (and the dots under the hours) are the times the clock stops at when the
player waits: every start and end that day and the marks (`Cutaway.time.mark`); the line on top lists them,
so a stop only one thing needs shows (each one is another state for the solver). The **pink line** is the
time now.

- Click a bar: its times, its room and place, its condition, and where it is written (`game/prolog.js:29`:
  a click opens the file there); **Open room** (or a double click on the bar) shows the room. Esc or a click on
  the empty table lets go.
- **Changing times** (with the studio): the picked bar's **from**, **to** and **day** (a day, several as
  `2, 3`, empty: every day) in the inspector, or **drag a bar**: whole, or by one of its ends, in quarter
  hours. The change goes into the game at once (the actors move) and into the game's file where the routine
  or the moment is written, only that value (comments and layout stay); **Save** (Ctrl+S) writes the file,
  Ctrl+Z / Ctrl+Y undo and redo. Routines a loop makes share one text: the inspector names them, and a change
  moves them all. A value the file computes (a variable, `from: start`) is left to the file: the status line
  says so and the link opens it there. A time off the quarter hours is allowed, with a word: every stop of
  the clock is another state for the solver.
- **Zoom:** the wheel zooms the time axis round the pointer (the time there stays where it is), **+** and
  **−** (the keys or the buttons) step it, **Fit** (or **0**, or a double click on the empty table) puts the
  whole day in view; zoomed in, the quarter hours get their labels too. The zoom is kept.
- The table scrolls both ways (Shift+wheel across); the names and the hours stay.

## Sequences

A sequence (an intro, a cutscene, an act's prologue) on a timeline, to see where everything happens in time,
to look at any moment and to change its timing by hand. Tools > Sequences. The steps stay what the game is written
in: the timeline is a view of them and an editor over them.

- **Pick a sequence** on the left (its shots are listed under it: a click goes there). The tab runs the
  sequence silently to its end (a **trace**: a two-minute sequence takes well under a second) and shows its
  **lanes** under the game picture: the **shots** (each mark to the next), the **room** shown (a room's
  colour, as in the Time tab), the **story** (what the sequence waits for: waits as hollow bars, lines,
  dialogues), the **camera**, a lane for each **prop** and each **actor** that a step moves, the **screen**
  (letterbox, fades, dissolves, captions, the worn tape), the **sound** (music, stingers, sounds), the
  **state** (flags, items), and a lane for each of the game's own actions. A step that goes on at once
  (`wait: false`) runs as long as what it started (its tweens, a walk, a dissolve): its bar shows that, while
  the story goes on beside it. A mark (a diamond) is a step that takes no time.
- **The playhead:** click or drag on the ruler or the empty timeline. The picture shows the sequence at that
  moment, still: the game is put back as it was and the sequence run again on the game's clock (from the same
  clock time, so whatever draws by the clock looks the same), silently. **Space** plays from the playhead (with
  its sound; the music starts from what it was told by then, close rather than exact) and pauses; **Home**
  and **End**, **←** and **→** a frame (Shift: a second), **PageUp** and **PageDown** the shots. **[** and
  **]** set an in and an out point, **⟲** loops between them (to tune one beat over and over).
- **A click on a bar** picks its step: the inspector shows its times (from, to, how long it runs on) and its
  form (the blocks of the Things tab), **Go to its start** (or a double click on the bar) and **Take it out**.
- **Changing the timing** (every change is a change to the steps):
  - drag a bar's **right end**: its length (a wait's, a tween's `ms`, a dissolve's); what comes after moves
    with it;
  - drag a step that **goes on at once** (a sound, a flag, a camera drive with `wait: false`): it moves
    between the steps it sits between; the wait it lands in splits, the waits where it was join, so
    nothing else moves (landing inside a step the sequence waits for, it goes to that step's nearer edge);
  - drag a step the sequence **waits for** (or any step with **Alt**): it and everything after it move (the wait
    before it grows or shrinks; one is made when there is none);
  - drags snap to 50 ms; **Shift**: not at all; **Ctrl**: to the other bars' edges and the shot marks. The
    status bar says the new time and the change;
  - **add at the playhead** (the inspector's buttons: a caption, a sound, a camera drive from where the
    camera is, a prop moved, a fade, the letterbox, a shot mark, a cut to a room, a line, a wait, the music,
    any step as JSON, a game's own action too): in a wait it splits the wait, so nothing after moves; the
    new steps that move something go on at once (`wait: false`);
  - **Delete** takes the picked step out; the time it took stays as a wait.
- **On the room's map** (the inspector shows the whole room the sequence is in at the playhead): white is the
  camera now, cyan the goals of the shot's camera steps (with their path), yellow the picked one. **Drag a
  frame** to set its camera step's goal (a click on another frame picks that step); a picked `move` step
  shows its prop's goal as a square to drag (`to`, or `by` from where the room's data puts the prop).
- **On the picture:** the picked camera step's frame is drawn where it is in the room; with a **caption**
  picked, a click puts it in that corner (the middle third: in the middle).
- **Where the changes go:** with the studio, into the game's own file where the sequence is written
  (`Cutaway.sequence("intro", { steps: [...] })`): only the steps that changed, the file's comments and
  layout kept (a split wait becomes three steps on their own lines). Where that can't be (no studio, steps
  computed in code, steps the edits layer already holds), into the edits layer (`sequences`), as the Things
  tab's changes; the status line says which and why. **Save** (Ctrl+S) writes them; Ctrl+Z and Ctrl+Y undo
  and redo. After each change the sequence is traced again and the picture stays at its moment.
- **New sequence** makes one of its own in the edits layer (a shot in the room the game is in, the bars in and
  out); play it from a script with `{ sequence: "id" }`, or from an act's `prologue`. **▶ Play in the game**
  plays it as the player sees it.
- **Limits** (said where they apply): a dialogue's choices end the trace there (the sequence would wait for the
  player); something that runs on and on (a looping animation that is waited for) ends it at 10 minutes. An
  `if` shows the branch it took with the state the game is in. Leaving the tab puts the game back as it was.

## A game's own tabs
A game can bring tabs of its own (a map editor for its own room format, a tool only it needs): the scripts
listed in its `studio.json` under `"editor"` (paths from the game's page) load after the engine's tabs and
add themselves with `Cutaway.editor.tab({ id, label, build, view, render, pick, drag, ... })`. `drag(p,
phase, e)` gets the pointer on the room picture: "down" first (return true to take the drag), then each
"move" and the "up", in room pixels. `hover(p)` gets the pointer moving over the picture with nothing
dragged (null once it leaves), to light up what a click would take. A task's `{name}` parts are filled when the tab runs it:
`Cutaway.editor.runTask("art: room", { room: "hall" })` for `"art: room": ["sh", "tools/build_art.sh",
"room", "{room}"]` (plain names only: letters, digits, `_ . -`); run from the Tools menu or the Checks tab, the editor asks for each part (a room: the one open is offered). `Cutaway.editor.modules.things.reveal(room,
key, path)` shows a thing and its script, `modules.art.openSource(path, line)` a pxl source at a line.
A game's tabs are listed in the Tools menu under "The game's tabs", and the game can bring its own guide
for them: `Cutaway.editor.modules.help.addBook({ id, title, file, md }, { <tab>: "<section>" })` adds a book
beside the editor guide and the reference (Markdown, cut at its `##` headings; in the Help menu too), and F1
on one of those tabs opens it at its section (`"intro"`: the top). With a third argument `{ into: "editor" }`
(or `"reference"`) its sections go into this guide (or the reference) instead, right after this section (at
the reference's end), each titled with the game's own title and marked with its file: a game's tabs are
then described here, found by the search, while the engine's guides stay free of any game. A game's tabs and guides come only with the studio (its `studio.json` lists them); opened without it (F10, `?edit`), the editor has the engine's tabs alone, and the Help tab says so.
`Cutaway.editor.roomNote((room) => text | null)` says something about rooms in the Room tab: shown on top of
its panel there, and once at the first change (a room whose shapes a game bakes from a map says where to
change them, as the next bake would undo a change made here).

**An example: the demo's Grid tab.** The demo brings a tab of its own, `demo/editor/grid.js` (the engine's
`studio.json` lists it: `npm run studio` and Tools > The game's tabs > Grid). It lays a grid over the room
picture, names the cell under the pointer in the status bar, measures the room's hotspots in cells, and puts
its page into this guide. In a game, `studio.json` names the script (paths from the game's page; the studio
only loads what this list names):

```json
{ "write": ["game"], "editor": ["game/editor/grid.js"] }
```

and the script adds its tab (the whole file is in the demo; its skeleton):

```js
"use strict";
(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  let size = 16, at = null;
  E.tab({
    id: "grid", label: "Grid",
    build(panel) {                                   // the inspector, built again on E.refresh()
      panel.append(el("div", {}, ["cell ", ...[8, 16, 32].map((n) => button(String(n), () => { size = n; E.refresh(); }))]));
    },
    render(ctx) {                                    // over the picture, in room pixels
      const [w, h] = Cutaway.scene.room?.size ?? [Cutaway.display.width, Cutaway.display.height];
      ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
      for (let x = 0; x <= w; x += size) ctx.fillRect(x, 0, 1, h);
      for (let y = 0; y <= h; y += size) ctx.fillRect(0, y, w, 1);
    },
    hover(p) {                                       // the pointer over the picture (null: it left)
      at = p && { x: Math.floor(p.x / size), y: Math.floor(p.y / size) };
      E.setCursor(at ? `cell ${at.x}, ${at.y}` : null);
    },
  });
  // its page in the editor guide; F1 on the tab opens it
  E.modules.help?.addBook({ id: "grid", title: "Grid", file: "game/editor/grid.js", md: "# Grid

What it does." },
    { grid: "intro" }, { into: "editor" });
})();
```

A tab that writes the game's files uses `E.studio.read(path)` and `E.saveFile(path, text)` (only in the
folders `write` lists), `E.modules.literal` to change one value where it is written (comments and layout
kept, as the Time and Sequences tabs do), and `save`, `undo`, `redo` and `unsaved` in its `E.tab` so that
Ctrl+S, Ctrl+Z and the unsaved marks reach it. A bigger example is Glass Sister's Iso-Editor (a room's map
edited over its picture and baked by a task), which isn't in this repo.

## Files the editor writes

| layer | file (the studio's `layers`) | what |
|---|---|---|
| room | `game/rooms/<id>.geo.js` | shapes: walk areas, holes, hotspot outlines, walk-to points, props' places (moved ones) and baselines, lamps, effect areas |
| texts | `game/strings/<lang>.texts.js` | the texts as changed, per language |
| edits | `game/edits.js` | properties of rooms, hotspots, props, lamps, effects, actors and items; their scripts; dialogues (whole); sequences' steps and after, and sequences made in the Sequences tab |
| sounds | `game/sounds.edit.js` | synthesised sounds made or changed |
| audio | `assets/audio.js` | recorded sounds (embedded) |
| voices | `assets/voices.<lang>.js` | recorded voices per line (embedded), one file per language |
| art | `art/import/`, packed into `assets/imported.js` (`artAtlas`) | imported and painted pictures and animations |
| graph | `out/graph/` (read only) | the connections' data the Connections tab shows (`tools/graph.mjs` writes it) |

The page must load each layer after the game's own data (the game's `index.html`). The studio writes
(and, for Revert, removes) only in the folders `studio.json` lists in `write`. Its `studio.json`:

```json
{ "write": ["game", "art", "assets"],
  "layers": { "art": "art/import", "artAtlas": "assets/imported.js" },
  "tasks": { "art: imported": ["node", "lib/cutaway/tools/build-atlas.mjs", "art/import", "assets/imported.js"],
             "art: room": ["sh", "tools/build_art.sh", "room", "{room}"] },
  "editor": ["game/editor/rooms.js"],
  "palette": ["art/palette.px.js"] }
```

`palette` is optional: files whose `#rrggbb` colours make the paint view's game palette.

## Keys

| key | |
|---|---|
| F10 | close the editor and play (and open it again) |
| Ctrl+P, Pause | pause the game or let it run |
| F8 | run the paused game on by 100 ms |
| Up Down Home End PgUp PgDn | move through a list (what the cursor gets to is picked) |
| letters, /, Enter | jump to a name, the list's filter, open (a list) |
| Left Right, + - | fold or open a group, all groups (a list); fold an if or once (blocks) |
| Alt+Up / Alt+Down | move a step (blocks) or a choice (Dialogue) |
| Insert, Ctrl+D | a new line or choice after the picked one, double it |
| R P N | record or stop, play, next line without a recording (Voices) |
| F1 | this help (at the section of the workspace; again: back) |
| Ctrl+S | save what the workspace has (Room: its shapes; Art: the painting or the pxl source) |
| Ctrl+Shift+S | save all |
| Ctrl+Z / Ctrl+Y | undo / redo (Room, the paint view); also Ctrl+Shift+Z |
| Delete | remove the selected corner or shape (Room), clear the selection (Paint), remove a step, a choice or a recording |
| Esc | close a menu, cancel drawing, clear the selection |
| arrows, Shift | nudge 1 or 10 px (Room); pan the camera (nothing selected: 8 or 40 px); move a floating selection (Paint) |
| wheel, Ctrl+0 | zoom the picture round the pointer, fit it again |
| scrollbars, middle button, Shift+wheel | scroll the picture (the room, and the picture when zoomed in) |
| B E G L R I M | the paint tools: pencil, eraser, fill, line, rectangle, picker, select |
| X, Shift+M, Shift+H, Shift+V | swap the colours, mirror, flip H, flip V (Paint) |
| wheel, + -, 0, Space | zoom, fit, pan (Paint) |
| , . O | frame before, after, onion skin (Paint) |
| Ctrl+C / X / V / A | copy, cut, paste, select all (Paint); copy, cut, paste steps (blocks) |
| F9 | the debug overlay |
| F11 | fullscreen |
