# Cutaway.js

A point-and-click adventure engine for the browser, in the tradition of the LucasArts classics, with a
modern verb-less interface: left click does the sensible thing, right click looks.

- **No build step, no dependencies.** Plain `<script>` files: a game runs straight from `file://`, a web
  server, Electron or Capacitor.
- **Pixel-perfect.** Draws into a low-resolution screen (320x180, say) and shows it at the largest
  whole-number scale that fits, on exact device pixels.
- **Games are data.** Rooms, hotspots, actors, items, dialogues and scripts are plain objects, so the
  tools can check a game, prove it can be finished and play it through on their own.
- **An editor inside the game.** Shapes, texts, properties, art, sound, dialogue and the game's state,
  changed live while it runs, saved as files next to the game's code.

**Status:** version 0.1, early. The API may still change between versions.

## Try it

Open `demo/index.html` in a browser: Pip and Bolt want to switch on the lamp in the yard.

| | |
|---|---|
| left click | walk, or do what fits (use, take, talk, go through a door); double click: run |
| right click | look |
| satchel (top right) | the items: pick one, click where to use it |
| portraits (top left), 1-9 | play another character |
| H, the bulb | a hint, plainer each time you ask |
| Tab | show every hotspot |
| Esc | the menu: save, load, settings, title screen (in the intro or a cutscene: skip it) |
| Space, Enter, . | the next line (lines may wait for it: Settings > Text); in the intro: the next shot |
| F10 | the editor (F1 in it: help) |
| F9, F11 | the debug overlay, fullscreen |

On a phone: tap to act (double tap to run), hold to look; the bulb, eye and menu buttons sit next to
the satchel. `?act=act1` skips the title screen, `?nointro` the intro. `demo/testcard.html` checks the display and the
font; `tools/music-lab.html` plays the demo's music.

## What's in it

- **World:** rooms with props sorted by baseline, polygon walk areas with holes and A* paths, depth
  scaling, rooms wider than the screen that scroll, actors with side, front and back views.
- **Interaction:** hotspots with smart click and look, items (use on things, combine), dialogue trees,
  several playable characters (Maniac Mansion's "new kid", with a shared bag if you like), saves with
  migration, languages.
- **Story:** acts with title cards, a title screen (new game, continue, acts), demos that end with a
  link to the full game, hints that get plainer each time; sequences (an intro before the title, the
  first time; cutscenes) with shots to skip, a scripted camera, prop moves, parallax depth, long
  rendered animations, a letterbox, typed captions and pixel dissolves; a click-to-start gate where
  browsers hold the sound back.
- **Look and sound:** runtime light (actors take on the room's light, flickering and added lamps,
  glows), effects (light haze, dust, rain, drips, glints, steam), fades; synthesised dynamic music in
  the spirit of iMUSE (sections, jump points, transitions, intensity layers, stingers), synthesised
  sound effects and ambience, recorded sounds, blip voices.
- **Players:** mouse, touch (tap, hold to look, show hotspots), keyboard; settings for sound (volumes,
  speech, mute in the background), text (speed, lines that wait for a click, a box behind them), the
  picture (pixel-perfect or filling the window, scanlines or an old CRT, no shake or flicker) and the
  controls (swapped mouse buttons, always run, the touch hold time, the screen buttons, the hint button).
- **Tools:** a validator, a solver (proves the game can be finished, finds soft-locks, checks every
  hint), a headless playthrough with real clicks or taps, screenshots, an atlas packer, offline music
  renders, and the studio (a local server for the editor).

## A room in a few lines

```html
<script src="src/core.js"></script> <!-- ... the engine's files, as in demo/index.html ... -->
<script src="src/engine.js"></script>
<script src="my-assets.js"></script>  <!-- your art, packed by tools/build-atlas.mjs -->
<script>
  Cutaway.room("hall", {
    background: "hall_bg",
    walk: [[6, 124, 314, 124, 318, 177, 2, 177]],          // where actors can walk
    holes: [[138, 139, 182, 139, 182, 153, 138, 153]],      // a crate's footprint
    props: [{ id: "crate", image: "crate", at: [160, 151] }],
    hotspots: {
      window: { name: "window", rect: [118, 20, 64, 52], look: "Clouds. Lots of them.",
        use: ["It doesn't open.", "Somebody painted it shut."] },
    },
  });
  Cutaway.actor("pip", { room: "hall", at: [90, 160], costume: { idle: "pip_idle_r", walk: "pip_walk_r" } });
  Cutaway.start({ width: 320, height: 180, room: "hall", actor: "pip" });
</script>
```

The whole data format (rooms, hotspots, props, actors, items, dialogues, every script action and
condition, acts, hints, light, effects, sound, music, layers) is in **[docs/reference.md](docs/reference.md)**.

## The editor and the studio

In a game's folder, `node path/to/cutaway/tools/studio.mjs` starts a small server on your own computer
and opens the game with the editor, docked around it like most editors: a menu bar (File, Edit, View,
Room, Art, Play, Tools, Help), the workspaces and a browser of the rooms and their things on the left,
the game (or the paint view) in the centre, the inspector on the right, a status bar and an output
pane below. What you change shows at once; saving writes layer files next to the game's code (nothing
hand-written is overwritten). Its workspaces:

- **Room** (walk areas, holes, hotspots, walk-to points, baselines, lamps, effect areas)
- **Texts** (every text, live; CSV and JSON for translators)
- **Things** (properties of rooms, hotspots, props, lamps, effects, actors, items)
- **Art** (preview, PNG export and import as sprites or animations; a **pixel editor** for sprites,
  animations and backgrounds: tools, palette, frames, onion skin, undo; pxl sources edited and built)
- **Sound** (synthesised sounds as data, WAV export, WAV/OGG/MP3 import, the music)
- **Dialogue** (what is offered now, test it)
- **State** (go anywhere, set flags, give items: the developer's menu)
- **Issues** (the validator on the live data), **Checks** (the game's tasks)
- **Help** (F1: the editor guide and this reference, with search)

Without the studio, F10 opens it too and saves through the browser. The guide:
**[docs/editor.md](docs/editor.md)**.

## Making a game

A game keeps a pinned copy of `src/` (and the tools it uses) in its own repository, never the other
way round: this repository holds no game's content. A good start is a copy of `demo/`:

1. `index.html` loads the engine's files in order, your art, your data, and last a script with
   `Cutaway.start`.
2. Draw the art (any tool; the demo's is code, `demo/art/demo.px.js`, made with pxl), pack it with
   `tools/build-atlas.mjs` into a script that registers it.
3. Write rooms, actors, items and dialogues as data; draw the shapes in the editor.
4. Check it often: `validate`, `solve --full`, `play` (below).

For a release, a game can bundle its scripts into one file and scramble its art and texts with a key
(`Cutaway.assets.setKey`): the engine decodes them as they are used.

## Development

```sh
npm install              # only TypeScript, for the type check
npm run check            # tsc --checkJs over src/ (JSDoc types everywhere)
node tests/run.mjs       # unit, tool and browser tests: "all passed"
npm run validate         # the demo's data
npm run solve            # prove the demo can be finished, find soft-locks, check its hints
npm run play             # play it through in headless Chrome (add --touch: as a phone)
node tools/build-editor-help.mjs   # after changing docs/editor.md or docs/reference.md
```

## Status

Early development (0.1). Everything above works and is tested (unit tests, the tools on the demo, the
editor in headless Chrome); the first game built on it plays its first act from title screen to the end.
Next: a visual script editor, recorded voices per line, published API docs and an npm package.

## Licence

MIT, see [LICENSE](LICENSE).
