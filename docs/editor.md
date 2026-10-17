# The Cutaway editor

The editor works inside the running game: what you change shows at once, and you can play it right away.
It saves its own files (layers) next to the game's code, which the game loads after its own data, so
nothing hand-written is ever overwritten.

This guide is also inside the editor: **F1** (it opens at the tab you are on) or the **Help** tab, with
the engine's reference beside it (everything a game's data can say).

## Opening it

- **With the studio** (recommended): `node lib/cutaway/tools/studio.mjs` in the game's folder. It starts
  a small server on your computer only, opens the game in the browser with the editor, and lets the
  editor save straight into the game's folder and run the game's checks and builds.
- **Without it**: F10 in the game (or `index.html?edit`). Saving then goes through the browser's file
  picker, or downloads the file.
- The editor opens in a **window of its own** (the game keeps its full size). If the browser blocks it
  (`?edit` when the page loads), it docks beside the game; **Window** and **Dock** switch.
- **Play** (or F10) closes the editor and plays from where you are. F9 shows the debug overlay.

## Room: shapes
Walk areas (green), holes (red), hotspots (orange), walk-to points (the yellow cross), prop baselines
(cyan), lamps (their reach) and effect areas (blue), drawn over the room.
- Click a shape to select it, drag inside it to move it, drag a corner, **double-click** an edge for a
  new corner, **right click** a corner (or Delete) to remove it. Arrows nudge (Shift: 10 px).
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
- Pick a thing in the list, or **click it on the picture**. **Save** writes the edits layer
  (`edits.js`). A thing's texts are in Texts, its shape in Room, what it does in the game's code.

## Art
Every sprite and animation: preview (animated, zoom), **Export PNG** (the frames side by side, and a
JSON of the frames for an animation).
- **Import** a PNG over the selected sprite, or as a new one: one picture, or frames side by side (set
  how many and how long each shows; the anchor is bottom centre unless you give one). **Apply** shows it
  in the game now, **Save** writes it into `art/import/` and packs `assets/imported.js` (the studio's
  task "art: imported"); a name there replaces the game's own.
- With the studio, the **pxl sources** (`art/**/*.px.js`) open here: edit, save, run the art tasks,
  **Reload**.

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
**▸** marks what the game would offer right now. **Test in game** closes the editor and starts it.

## State
The game in progress, to test from anywhere: who is played and where, **go to** any room, lock and
unlock kids, bring one over, begin an act; the **flags** (change, add, remove), the bag (give, take
away), what is shown or hidden in the room and its things' states, the rooms visited, the hint for now,
and a save slot **"dev"** to come back to.

## Issues
The same checks the Node validator runs, on the game as it is now (your changes included): unknown
names, conditions and flags, shapes, walk-to points, translations. Click an issue to open the room and
the thing. (Needs the studio; else the Checks tab runs "validate".)

## Checks
The game's tasks from its `studio.json`: validate, solve (proves the game can be finished, finds
soft-locks, checks the hints), build the art. **Reload the game** loads new files (the editor opens
again).

## Files the editor writes

| layer | file (the studio's `layers`) | what |
|---|---|---|
| room | `game/rooms/<id>.geo.js` | shapes: walk areas, holes, hotspot outlines, walk-to points, baselines, lamps, effect areas |
| texts | `game/strings/<lang>.texts.js` | the texts as changed, per language |
| edits | `game/edits.js` | properties of rooms, hotspots, props, lamps, effects, actors and items |
| sounds | `game/sounds.edit.js` | synthesised sounds made or changed |
| audio | `assets/audio.js` | recorded sounds (embedded) |
| art | `art/import/`, packed into `assets/imported.js` | imported pictures and animations |

The page must load each layer after the game's own data (the game's `index.html`). The studio writes
only into the folders `studio.json` lists in `write`.

## Keys

| key | |
|---|---|
| F10 | close the editor and play (and open it again) |
| F1 | this help |
| Ctrl+S | save (the Room tab: its shapes) |
| Ctrl+Z / Ctrl+Y | undo / redo (Room tab) |
| arrows, Shift | nudge 1 or 10 px (Room tab) |
| Delete | remove the selected corner or shape (Room tab) |
| Esc | cancel drawing, clear the selection |
| F9 | the debug overlay |
