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

## The layout

The editor docks around the game in its own page, like most editors:

- **The menu bar** on top: File, Edit, View, Room, Art, Play, Tools, Help (below). On its right: the
  room to open, **▶ Play**, and whether the studio is connected.
- **The left panel**: the **workspaces** (Room, Texts, Things, Art, Sound, Dialogue, State, Issues,
  Checks, Help; a ● marks one with unsaved work), the **rooms** (click one to open it), and what is in
  the room: hotspots, props, actors, lamps, effects. A click selects it in Room (its shape) or in
  Things (its properties; actors always, and anything while Things is open). In the Art workspace the
  list shows the sprites instead (click: select, double-click: paint).
- **The centre**: the game picture, as large as fits in whole pixels. A workspace can put a view of its
  own there while it is active: the paint view, or a pxl source. Switch to another workspace and the
  game picture is back; come back and the view is too.
- **The inspector** on the right: the active workspace's panel.
- **The status bar** at the bottom: the last message (click it for all of it), the cursor's position in
  the room (or the pixel and its colour while painting), what isn't saved, the studio. **Output** opens
  the output pane above it: every message, and the output of the tasks.

The panels scroll on their own; View shows or hides each of them (kept for the next time).

## Menus

| menu | what |
|---|---|
| File | **Save** (Ctrl+S: what the workspace you are in has; Room: the shapes, Art: the painting, the pxl source or an import), **Save all** (Ctrl+Shift+S: every workspace with unsaved work), **Reload game**, **Close editor and play** (F10) |
| Edit | **Undo** (Ctrl+Z), **Redo** (Ctrl+Y or Ctrl+Shift+Z), **Delete**, **Select none** (Esc): for the paint view while it shows, else the workspace (Room: the shapes) |
| View | the debug overlay (F9), **Game interface** (the portraits, satchel and buttons; hidden while editing, so they don't cover the shapes), the Room shapes to show (walk, hole, hotspot, prop, lamp, fx), the left panel, the inspector, the output pane, **Inspector in its own window**, fullscreen (F11) |
| Room | the rooms (open one), **+ Walk area**, **+ Hole**, **+ Hotspot**, save the shapes |
| Art | **Edit pixels** (the selected sprite), **New sprite**, **Revert** to the game's art, **Import PNG**, **Export PNG**, **Reload art**, the pxl sources (with the studio) |
| Play | **Play from here** (F10), begin an act as a new game, **Test dialogue** (the one picked in Dialogue) |
| Tools | the game's tasks from `studio.json` (their output goes to the output pane), Issues, Checks, State |
| Help | the editor guide (F1), the reference, the keys |

**Inspector in its own window** moves the inspector into a window of its own (the game gets the room
it took); the menus, the browser and the status bar stay with the game. Browsers block such a window
when the page opens it by itself (`?edit`): then it stays docked, open it from the View menu.

## Room: shapes
Walk areas (green), holes (red), hotspots (orange), walk-to points (the yellow cross), prop baselines
(cyan), lamps (their reach) and effect areas (blue), drawn over the room.
- Click a shape to select it (or pick it in the left panel), drag inside it to move it, drag a corner,
  **double-click** an edge for a new corner, **right click** a corner (or Delete) to remove it. Arrows
  nudge (Shift: 10 px).
- **+ Walk area / + Hole / + Hotspot**: click the corners, then the first one again (or Enter).
- Ctrl+Z / Ctrl+Y undo and redo; **Save** (Ctrl+S) writes `rooms/<id>.geo.js`.

## Texts
Every text of the game with where it is used: lines, looks, names, dialogue choices, cards and hints.
- Change one and the game shows it at once. **Save** writes the language's text layer
  (`strings/<lang>.texts.js`).
- **this room** shows only the texts of the room you are in; **search** finds a text anywhere.
- **Export CSV / JSON** for translators: a row per text, a column per language. **Import** takes such a
  file back (only what differs). A new language also needs its texts file in the page and in the
  game's languages.

## Things
The properties of the room (music, ambience, light, depth scale, background) and of what is in it:
hotspots (`z`, hidden), props (image, position, anchor, flip, baseline), lamps (power, colour,
flicker, glow), effects (colour, count, speed ...), actors (colour, speed, running speed, costume,
voice, portraits) and items (icon).
- Pick a thing in the list, in the left panel, or **click it on the picture**. **Save** writes the
  edits layer (`edits.js`). A thing's texts are in Texts, its shape in Room, what it does in the game's
  code.

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
Every sound: click one to hear it. A synthesised sound is data: change it, **Apply and play**, or keep it
**As a new sound**. **Export WAV** renders one.
- **Import** a WAV, OGG or MP3 over the selected sound or as a new one (a loop stays a loop: room
  ambience). Recorded sounds are embedded, so the game still runs from a file.
- **Save** writes `sounds.edit.js` (synthesised) and `assets/audio.js` (recorded).
- **Music**: play a theme (and section) at an intensity, go back to the room's music, or open the
  **music lab** (every score, its layers and stingers, WAV export).

## Dialogue
Each dialogue's nodes and choices: the text, when it shows (`if`), where it leads, once only, silent.
**▸** marks what the game would offer right now. **Test in game** (also Play > Test dialogue) closes
the editor and starts it.

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
| room | `game/rooms/<id>.geo.js` | shapes: walk areas, holes, hotspot outlines, walk-to points, baselines, lamps, effect areas |
| texts | `game/strings/<lang>.texts.js` | the texts as changed, per language |
| edits | `game/edits.js` | properties of rooms, hotspots, props, lamps, effects, actors and items |
| sounds | `game/sounds.edit.js` | synthesised sounds made or changed |
| audio | `assets/audio.js` | recorded sounds (embedded) |
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
| F1 | this help (at the section of the workspace; again: back) |
| Ctrl+S | save what the workspace has (Room: its shapes; Art: the painting or the pxl source) |
| Ctrl+Shift+S | save all |
| Ctrl+Z / Ctrl+Y | undo / redo (Room, the paint view); also Ctrl+Shift+Z |
| Delete | remove the selected corner or shape (Room), clear the selection (Paint) |
| Esc | close a menu, cancel drawing, clear the selection |
| arrows, Shift | nudge 1 or 10 px (Room); move a floating selection (Paint) |
| B E G L R I M | the paint tools: pencil, eraser, fill, line, rectangle, picker, select |
| X, Shift+M, Shift+H, Shift+V | swap the colours, mirror, flip H, flip V (Paint) |
| wheel, + -, 0, Space | zoom, fit, pan (Paint) |
| , . O | frame before, after, onion skin (Paint) |
| Ctrl+C / X / V / A | copy, cut, paste, select all (Paint) |
| F9 | the debug overlay |
| F11 | fullscreen |
