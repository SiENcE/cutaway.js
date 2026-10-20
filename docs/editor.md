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
  picker, or downloads the file.
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
  Issues, Checks, Help; a ● marks one with unsaved work), the **rooms** (click one to open it), and what
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

The panels scroll on their own; View shows or hides each of them (kept for the next time).

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
| Tools | the game's tasks from `studio.json` (their output goes to the output pane), Issues, Checks, State |
| Help | the editor guide (F1), the reference, the keys |

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
- **The camera**: in a room wider or taller than the screen, drag with the **middle button**, turn the
  **wheel** (Shift+wheel: across), or press the **arrows** while nothing is selected. Closing the editor
  gives the camera back to the one playing.
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

## Files the editor writes

| layer | file (the studio's `layers`) | what |
|---|---|---|
| room | `game/rooms/<id>.geo.js` | shapes: walk areas, holes, hotspot outlines, walk-to points, props' places (moved ones) and baselines, lamps, effect areas |
| texts | `game/strings/<lang>.texts.js` | the texts as changed, per language |
| edits | `game/edits.js` | properties of rooms, hotspots, props, lamps, effects, actors and items; their scripts; dialogues (whole); sequences' steps and after |
| sounds | `game/sounds.edit.js` | synthesised sounds made or changed |
| audio | `assets/audio.js` | recorded sounds (embedded) |
| voices | `assets/voices.<lang>.js` | recorded voices per line (embedded), one file per language |
| art | `art/import/`, packed into `assets/imported.js` (`artAtlas`) | imported and painted pictures and animations |

The page must load each layer after the game's own data (the game's `index.html`). The studio writes
(and, for Revert, removes) only in the folders `studio.json` lists in `write`. Its `studio.json`:

```json
{ "write": ["game", "art", "assets"],
  "layers": { "art": "art/import", "artAtlas": "assets/imported.js" },
  "tasks": { "art: imported": ["node", "lib/cutaway/tools/build-atlas.mjs", "art/import", "assets/imported.js"] },
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
| middle button, wheel | pan the camera over the picture (Shift+wheel: across) |
| B E G L R I M | the paint tools: pencil, eraser, fill, line, rectangle, picker, select |
| X, Shift+M, Shift+H, Shift+V | swap the colours, mirror, flip H, flip V (Paint) |
| wheel, + -, 0, Space | zoom, fit, pan (Paint) |
| , . O | frame before, after, onion skin (Paint) |
| Ctrl+C / X / V / A | copy, cut, paste, select all (Paint); copy, cut, paste steps (blocks) |
| F9 | the debug overlay |
| F11 | fullscreen |
