# Cutaway.js code review

**Scope:** the whole repository at `39d7fd7` (`main`): the runtime engine (`src/*.js`, `src/music/`), the in-game editor (`src/editor*.js`), the studio server and the Node tools (`tools/`), and the tests.
**Date:** 2026-10-30

## Summary

Cutaway.js is small, tidy and unusually well thought through for a 0.1. Games are data, the runtime is a set of no-build classic scripts that share one namespace, everything is JSDoc-typed and passes `tsc --checkJs --strict`, and the tooling (validator, solver, headless playthrough) is a real strength. The code is consistent in style and dense with useful comments.

Most of the serious problems are in one area: **the lifecycle of running scripts.** Scripts are fire-and-forget promises with no owner. Nothing cancels them when a game is loaded, nothing stops a save from being taken half-way through one, and some actor operations can leave a script waiting forever. In an adventure game every one of these is a soft-lock or a corrupt save. All of the high-severity engine findings below come from this.

**Baseline checks**

| Check | Result |
|---|---|
| `npm run check` (`tsc`) | clean |
| `node tests/run.mjs` | **389 / 389 pass**, but only with `CHROME` pointing at a Chromium wrapper that adds `--no-sandbox` (see [T1](#t1)). Out of the box it stops at the first browser test with "no Chrome found". |

Findings marked **(reproduced)** were confirmed by running code: a Node script against the engine files, or headless Chromium on the demo. The rest come from reading the code.

## Findings at a glance

| # | Severity | Area | Finding |
|---|---|---|---|
| [E1](#e1) | High | save / menu | Loading a save doesn't stop the scripts already running; they go on to change the loaded game **(reproduced)** |
| [E2](#e2) | High | save | The autosave and manual saves are taken half-way through scripts; loading one leaves the rest of that script undone |
| [E3](#e3) | High | actor | `{ anim, wait: false }` followed by a walk leaves the actor stuck and the script waiting forever **(reproduced)** |
| [E4](#e4) | High | actor / scene | A walk or `anim` for an actor outside the room on screen never ends, so its script hangs **(reproduced)** |
| [E5](#e5) | Medium | script | Which action a step runs depends on the order of its keys, and argument names clash with action names **(reproduced)** |
| [E6](#e6) | Medium | script / dialog / save | `once` and once-only dialogue choices are keyed by their position in the data, so editing a game breaks older saves |
| [E7](#e7) | Medium | walk | Building a walk map takes O(N² · L · E) time: 1.6 s for a room with 128 corners **(reproduced)** |
| [E8](#e8) | Medium | layers | Reverting a whole thing in the editor leaves the keys the edit added in the live data **(reproduced)** |
| [E9](#e9) | Medium | display | The canvas is styled `100vh` but sized from `innerHeight`, so on mobile Safari the pixels are stretched and taps land off-target |
| [E10](#e10) | Medium | room | Applying geometry changes the game's own room objects; the walk map isn't rebuilt when geometry arrives later |
| [E11](#e11) | Low | ui | During an exit's door delay the player can start something else, and the `goto` still happens |
| [E12](#e12) | Low | dialog / party | Number keys pick dialogue choices or switch characters while the pause menu is open on top |
| [E13](#e13) | Low | actor | A second `playOnce` overwrites the first one's resolver, so the first promise never resolves |
| [E14](#e14) | Low | core | One listener that throws stops `events.emit` for every listener after it |
| [E15](#e15) | Low | state | `{ inc, by: "2" }` joins strings ("02"); `state:` and `at:` conditions split on the first `=` only |
| [E16](#e16) | Low | assets | A single image that fails to load rejects `assets.ready()`, so `Cutaway.start` never draws a frame |
| [E17](#e17) | Low | ui / scene | Hotspot polygons are rebuilt several times every frame, and up to ~220 times for one tap |
| [T1](#t1) | Medium | tests | The browser tests can't find Chrome on Linux or Playwright installs and can't run as root (no `--no-sandbox`) |

| [D1](#d1) | High | editor: blocks | Dragging a step into a later step's branch throws half-way and loses the step, or puts it in the wrong place |
| [D2](#d2) | High | editor: blocks | Changing a step's kind or its "more" JSON reads a stale step object and undoes the field edits just made |
| [D3](#d3) | High | editor: saving | Cancelling the save-file picker marks Texts, Things, Voices, Sound, Paint and Art as saved |
| [D4](#d4) | High | editor: Art | Every panel rebuild starts one more `requestAnimationFrame` loop that is never stopped |
| [D5](#d5) | Medium | studio | No `Host` check: DNS rebinding can read any file under the root, `.git/` and dotfiles included |
| [D6](#d6) | Medium | editor: Room | Undo doesn't take back a prop's first baseline, and undo/redo don't mark the room unsaved |
| [D7](#d7) | Medium | editor | A prop's `at` and `baseline` are saved to two layer files (edits and geometry); the file loaded last wins |
| [D8](#d8) | Medium | editor | Rebuilding the panels (on `setStatus`, `refresh`, a room change) throws away a field being typed in |
| [D9](#d9) | Medium | editor: Things | Removing a key from a JSON field does nothing: the patch is deep-merged |
| [D10](#d10) | Medium | editor: Dialogue | Renaming a node doesn't update `{ dialog, node }` steps; reachability is found by regex |
| [S1](#s1) | High | solver | Each packed state keeps a whole 16 KiB zlib buffer: about 80× the memory and worker traffic it needs **(reproduced)** |
| [S2](#s2) | High | solver | A second dialogue in the same run overwrites `need` and `seen`, so choices go unexplored (false UNSOLVABLE, soft-locks missed) |
| [S3](#s3) | Medium | solver | The state key leaves out `act`, so an `{ act: "next" }` that starts in the same room looks like a self-loop |
| [S4](#s4) | Medium | solver | A worker that crashes after start-up leaves `solve.mjs` hanging forever |
| [S5](#s5) | Medium | tools | build-atlas: an image taller than `--max` makes an empty 0×0 page and a page that is too tall; PNG tRNS is ignored for grey and RGB images |
| [S6](#s6) | Medium | tools | chrome.mjs: no handling when Chrome exits or the socket closes, a random port it may not own, temp profiles left behind |
| [A1](#a1) | Medium | music | Transition segments are cut after their first bar; going back to the current theme mid-transition loops the segment forever |
| [A2](#a2) | Medium | music | A new intensity during a layer fade snaps and clicks (`cancelScheduledValues` at a future time) |
| [A3](#a3) | Medium | music | `render()` swaps the global player, context and buses during an `await`: live music stops, then the missed notes come in a burst |
| [A4](#a4) | Medium | sfx | Exporting a WAV of a sound with `inst` parts fails, or leaves the notes out (synth always uses the live context) |
| [D11](#d11) | Medium | editor: perf | The Voices tab is O(lines × clips) per rebuild with an unbounded decode cache; a Room drag rebuilds the walk map on every mouse move |

---

## Runtime engine

### <a id="e1"></a>E1. Loading a save doesn't stop running scripts (High, reproduced)

`src/menu.js:376-379`, `src/save.js:462-476`

Esc opens the pause menu whenever no cutscene is playing, including while an ordinary script runs (a line, a walk to a hotspot, a dialogue). From the menu the player can load a save. `save.apply` restores the state, the actors and the room, but the script that was running is never cancelled. When the clock starts again, that script carries on and changes the game that was just loaded.

**Reproduced** in headless Chromium on the demo: save to slot 1 (no key), run `["Hold on...", { give: "key" }, { set: "got_key" }]`, press Esc (the menu opens and `script.busy` is still true), load slot 1, and skip the line. The loaded game now has `key` and `got_key`. The same happens with **Title screen** (`acts.toTitle`): a dialogue still waiting for a choice survives into the title screen and the next game. An open dialogue menu (`dialogs.menu`) is never closed either.

**Fix:** give every `script.run` a cancel token, the `{ stopped }` object that sequences already use, and keep the tokens in a set. Add `script.cancelAll()`: it stops each token, resolves the pending line (`ui.skip()`), closes the dialogue menu and stops the actors' walks. Call it from `save.apply`, `acts.toTitle`, `acts.begin` and `scene.unload`. Better still, don't offer **Load** or **Save** while `script.busy`, or grey them out.

### <a id="e2"></a>E2. Saves are taken in the middle of scripts (High)

`src/save.js:496`, `src/room.js:234-236`, `src/menu.js:167`

The autosave listens for `room.entered`. A `goto` inside a script runs `scene.go` → `load` → `room.entered` **before** the steps after the `goto` have run. Take the script `[{ goto: "vault" }, { give: "gold" }, { set: "robbed" }]`: the autosave holds the new room without the gold or the flag. When it's loaded (with `enter: false`), nothing runs the rest of the script, so the gold is gone for good. A dialogue whose choice `then` does a `goto` before setting flags breaks the same way. The manual **Save** row in the pause menu doesn't check `script.busy` either, so the player can save half-way through any interaction. The comment on **Title screen** (`menu.js:176`) shows the problem is known, but only that path checks for it.

**Fix:** defer the autosave until `script.busy` goes false (listen for `script.busy` → `false` and write then if a room change happened meanwhile), and disable manual **Save** while a script runs. The solver should also check that every autosave point is a resting state.

### <a id="e3"></a>E3. `anim` without waiting, then a walk: the walk never ends (High, reproduced)

`src/actor.js:262-267`, `src/actor.js:287-295`, `src/actor.js:323-328`

`playOnce` sets `onceDone`. `walkTo` changes the state to `"walk"` but leaves `onceDone` alone. In `update`, the `onceDone` branch runs first and returns early, so the actor doesn't move. Once the elapsed time passes the **walk** cycle's length (that is what `look()` now returns), it calls `setState("idle")` and resolves the old animation. From then on the actor is idle with a path left over, and `update` returns at `if (this.state !== "walk")`. The walk's promise never resolves, the script never ends, and `script.busy` blocks the player for good.

**Reproduced** with `a.playOnce("wave"); a.walkTo(50, 0)`: after 10 s of updates `x = 0`, `state = "idle"`, one waypoint is left and the walk never arrived. The script form is `[{ anim: "wave", wait: false }, { walk: [50, 150] }]`.

**Fix:** have `walkTo`, `place` and `stop` resolve and clear a pending `onceDone` first, so a new action replaces the animation cleanly.

### <a id="e4"></a>E4. Actors outside the room on screen never finish walking or animating (High, reproduced)

`src/room.js:464-468`, `src/actor.js:287-295`

`scene.update` only updates `actorsHere()`. `walkTo` for an actor in another room makes a straight path, but that actor's `update` is never called, so the promise never resolves. `playOnce` hangs the same way, and so does any actor with `room: null` (voice-only actors). `{ walk: "bolt", to: [...] }` while Bolt is in the next room blocks the player for good. This is easy to write in a party game, where the other member is off-screen.

**Reproduced:** an actor in room `r2`, the scene on `r1`, 10 s of `scene.update`: the walk never arrived.

**Fix:** update every actor that has a pending walk or animation, or resolve walks off-screen at once (place the actor at the target). The validator could warn about `walk` or `anim` for an actor who may not be in the room.

### <a id="e5"></a>E5. Which action a step runs depends on the order of its keys (Medium, reproduced)

`src/script.js:105-108`, `tools/lib/validate.mjs:100`

`step()` runs the **first** key of the object that names an action. Several arguments share their names with actions: `face` (walk, goto, place), `wait` (walk, camera, move, play, anim), `hide` (take), `sfx` (open, close), `anim` (play), `to` and `at`. So `{ take: "key", hide: "jar" }` takes the key, but `{ hide: "jar", take: "key" }` only hides the jar and never gives the key (reproduced). Likewise `{ wait: false, walk: [...] }` waits 0 ms and never walks. JSON from tools, the editor, or a hand reorder can change the order of keys without anyone noticing. The validator uses the same first-match rule, so it doesn't warn either.

**Fix:** let every action declare its own argument names, and resolve the action as "the one key that isn't an argument of the others". Simpler: pick by a fixed priority list (`walk`, `take`, `goto`, … before `face`, `hide`, `wait`, `sfx`). Either way, have the validator flag steps that name more than one action.

### <a id="e6"></a>E6. Once-only flags are keyed by position, so edits break older saves (Medium)

`src/script.js:65`, `src/script.js:102`, `src/dialog.js:182-188`

The `once` flag of a step is stored under its path, such as `hall.crate.use.0`. That path is made of indices, and so is the key of a once-only dialogue choice (`~dlg.bolt.main.1`). Insert a step or a choice before it, which the editor's block view and the edits layer make easy, and every save made before the change now points at the wrong step. Lines already spoken play again, and choices already used come back (or the wrong one disappears). This matters most for patches to a released game.

**Fix:** allow a stable `id` on `once` steps and choices (`{ once: [...], id: "crate_locked" }`, `{ text, once: true, id: "ask_shelf" }`), use it as the key, have the editor create one, and have the validator warn when a `once` has no id. Saves can then be migrated by id.

### <a id="e7"></a>E7. Building a walk map is slow (Medium, reproduced)

`src/walk.js:56-92`

The visibility graph tests all N² pairs of corners. Each test samples the segment every 0.5 px, and each sample runs `inPoly` and `edgeDist` over every edge. Measured on a 640-pixel-wide room:

| corners | build | one path |
|---|---|---|
| 32 | 67 ms | 1.6 ms |
| 64 | 243 ms | 1.8 ms |
| 96 | 668 ms | 3.1 ms |
| 128 | **1654 ms** | 4.5 ms |

The map is built on the main thread when the room is first entered, during the fade, so the game freezes. The editor rebuilds it (`scene.refresh()`) after every change to a shape. `path()` also runs `visible(s, node)` for every node on every click.

**Fix:** test the segment exactly instead of sampling it: does it cross any edge properly, and is its midpoint inside? That is O(E) per pair rather than O(L · E). Link only reflex corners, which is what makes shortest paths in a visibility graph. Cache the graph per room in the atlas or geometry build if it is still slow. A binary heap for the open list would also help larger rooms.

### <a id="e8"></a>E8. Reverting a whole thing leaves keys the edit added (Medium, reproduced)

`src/layers.js:401-411`

`edits.revert(kind, id)` with no path deletes the top-level keys that weren't in the original, then `merge(d, was)`. `merge` only walks the keys of the **patch** (`was`), so nested keys the edit added are never removed. Reproduced: `edits.change("rooms", "attic", { hotspots: { print: { z: 1 } } })` then `edits.revert("rooms", "attic")` leaves `z: 1` on the live hotspot, while the layer is empty. The game in the editor no longer matches what will be saved until the page is reloaded.

**Fix:** for a full revert, replace the live object's contents with a deep clone of `was`: clear every key, then copy. Keep the object's identity, because the scene and the walk-map cache hold references to it.

### <a id="e9"></a>E9. Stretched pixels and misplaced taps on mobile Safari (Medium)

`src/display.js` (in `init` and `resize`)

The screen canvas is styled `width: 100vw; height: 100vh`, but its backing store is sized from `window.innerWidth` and `innerHeight`. On iOS Safari (and Chrome on Android with a collapsing URL bar), `100vh` is the *large* viewport, taller than `innerHeight`. The canvas is then stretched vertically, which breaks the "exact squares" promise and moves `toLogical`'s mapping off the drawn picture. `100vw` also counts the scrollbar on desktop browsers that show one.

**Fix:** in `resize()`, set `screen.style.width` and `height` to `innerWidth` and `innerHeight` in pixels (or use `100dvh`). Listen to `visualViewport` `resize` as well.

### <a id="e10"></a>E10. Geometry changes the game's own objects; the walk-map cache goes stale (Medium)

`src/room.js:114-154`, `src/room.js:239-244`

`room(id, def)` makes a *shallow* copy, so `applyGeometry` writes into the game's own hotspot, prop, lamp and effect objects (`delete h.rect`, `Object.assign(f, ...)`). Code that defines a room again from the same object, or that keeps the def to compare with it later (the original data, a hot reload), sees the geometry and not what it wrote. Also, `room.geometry(id, g)` arriving after the room's walk map was built (lazy-loaded geometry, an editor reload) updates `walk` and `holes` but not the cached `WalkMap`.

**Fix:** deep-clone `def` in `room()`, and drop the room's `walkMaps` entry in `applyGeometry` (or call `scene.refresh()` when it is the current room).

### <a id="e11"></a>E11. A race during an exit's door delay (Low)

`src/ui.js:209-219`

For an exit with a `door`, `interact` waits `DOOR_MS` after the approach and then runs the `goto`. During that wait `script.busy` is false, so a click starts a new walk or interaction, and the `goto` still teleports the actor. The `clickSeq` check is done before the wait, not after it. **Fix:** check `seq` again after the wait, or run the door and the `goto` as one script so the player waits.

### <a id="e12"></a>E12. Number keys go through the pause menu (Low)

`src/dialog.js:238-241`, `src/party.js:131-134`

Events go to every listener. With the pause menu open over a dialogue, pressing `1` picks a dialogue choice behind it. With no script running, `1`–`9` switch characters and load their room behind the menu, and the fade then waits on the paused clock. **Fix:** ignore these keys while `Cutaway.menu.isOpen || Cutaway.menu.card`.

### <a id="e13"></a>E13. A second `playOnce` orphans the first promise (Low)

`src/actor.js:262-267`

`this.onceDone = resolve` replaces any earlier resolver, which never gets called. A script awaiting the first animation (for example a background script while a cutscene plays another animation on the same actor) hangs. **Fix:** resolve the previous `onceDone` before replacing it. This is the same change as the fix for E3.

### <a id="e14"></a>E14. One throwing listener stops `emit` (Low)

`src/core.js:47-50`

`emit` calls the listeners one after another with no `try`. An exception in one game listener on, say, `room.enter` skips every later listener (music, autosave, editor) and is thrown back into whoever emitted the event, often in the middle of a scene load. **Fix:** wrap each call and report errors with `console.error`, as `script.run` already does.

### <a id="e15"></a>E15. Loose parsing of values in state (Low)

`src/state.js:340`, `src/state.js:322-323`, `src/script.js:176`

`inc` does `(Number(flag) || 0) + by`. With `by` given as a string (likely from the editor's text fields or JSON), the result is joined text ("02"). `state:` and `at:` split on `=` and keep only the first part after it, so a value that contains `=` never matches. `setObjState`, `setHidden` and `visit` don't emit `state.changed`, unlike `set` and `inc`, so listeners that depend on it (hints, the editor's State view) can miss changes. **Fix:** `Number(by)`; `indexOf("=")` with `slice`; emit `state.changed` from every setter.

### <a id="e16"></a>E16. One broken image stops the start (Low)

`src/assets.js:81-85`, `src/assets.js:115-119`

`ready()` is `Promise.all` over every image. One `onerror` rejects it, so `Cutaway.start` rejects before it draws anything: a black page, with the error only in the console. Failing fast is a fair choice during development. For players, a missing sprite would be better than a black page. **Fix:** use `allSettled`, log what failed, and draw a placeholder.

### <a id="e17"></a>E17. Hotspots are rebuilt over and over (Low)

`src/ui.js:276-288`, `src/ui.js:232-242`, `src/room.js:415-437`

`hotspots()` evaluates conditions and makes new polygon arrays on every call. `render` calls it through `refreshHover` every frame, again in `renderMarks`, and in the debug overlay. `hotspotNear` for a tap calls `hotspotAt` up to 224 times, and each call rebuilds the whole list. It is fine in the demo, but it grows with hotspots × frames. **Fix:** cache the list once per update step, or invalidate it on `state.changed` and `room.enter`.

### Smaller notes

- **`clock.setManual(false)`** while the clock is already running real-time starts a second `requestAnimationFrame` chain, so it renders twice per frame. Guard it with `if (manual && !on)` (`src/core.js:124-127`).
- **`script.run` errors** report the path of the outer context, not the step that failed (`src/script.js:48`). Attach `ctx.path` in `step()` when rethrowing.
- **Saves:** `save.remove` isn't wrapped in `try`, unlike `read` and `write`. A save with an unknown `format` is silently dropped rather than migrated, and an exception in `migrate` makes the slot look empty (`src/save.js:449-455`, `483`).
- **The dialogue guard** (`for (guard < 1000)`) quietly ends a long conversation that stays on one node. Count only node changes, not picks (`src/dialog.js:176`).
- **i18n:** any line that starts with `@` is taken as a key, and tables keyed by the source text can't translate the same English text two ways in different places.
- **"Scrambling"** of art and texts is XOR with a key shipped in the same bundle. That is fine as a deterrent, but the README shouldn't let anyone think it is protection.
- **`propBox`** uses frame 0's size, while its comment says "the current frame" (`src/room.js:352-363`).

---

## Tests and the development setup

### <a id="t1"></a>T1. The browser tests don't run out of the box on Linux (Medium)

`tools/lib/chrome.mjs:8-24`

`CHROMES` lists only `/usr/bin/google-chrome`, `/usr/bin/chromium`, a Windows path and a macOS path. It misses `chromium-browser`, `google-chrome-stable`, Snap and Flatpak installs, and Playwright's or Puppeteer's cached browsers. Chrome is also started without `--no-sandbox`, so it exits at once as root (containers, CI). `node tests/run.mjs` then stops at the first browser test with an uncaught exception, not a FAIL line, and every test file after it is skipped too. Wrapping the executable as `chromium --no-sandbox "$@"` makes **all 389 tests pass**.

**Fix:** add the common Linux paths and `PLAYWRIGHT_BROWSERS_PATH` or `CHROME_PATH`. Add `--no-sandbox` when `process.getuid?.() === 0` or when `CI` is set. In `tests/run.mjs`, catch a failing module so that it reports a FAIL and goes on to the next file.

### Test coverage

There are good tests of the walk geometry, sequences, acts, the party, layers and the editor blocks. Nothing tests:

- loading or saving while a script runs (E1, E2)
- actor animations that overlap walks, and actors outside the room on screen (E3, E4)
- key order in steps (E5)
- a full revert (E8)

Each of these fits in a few lines with the `tests/load.mjs` harness, and the repro scripts used for this review can be turned into tests directly.

---

## Editor and studio

The editor builds its DOM with `textContent` throughout, so there is no practical XSS. Its one `innerHTML` renders the bundled, escaped docs. The edit layers are a good design: changes go into separate files that load after the game's own data, and the engine keeps the data as it was before, so changes can be reverted. The weak spots are structural. Each tab has its own dirty flag, undo stack and save routine. Any change rebuilds the whole inspector. Event handlers hold on to objects that later edits replace. Findings D1 to D4 and D6 to D11 all come from these three things.

### <a id="d1"></a>D1. Drag-and-drop can delete a step (High)

`src/editor-script.js:448-459`

`dropAt` removes the dragged step first and works out the target afterwards. It only corrects the target's index when source and target are in the same list. When the source list *contains* the target and the source comes before it, every index after the source is off by one. With `[A, { if, then: [X] }]`, dragging A onto X (target `1.then.0`) throws in `listAt` once the splice has run. A is already gone from the model, so the next edit writes the script back without it. With two `if` steps after A, nothing throws: A silently lands in the wrong branch.
**Fix:** find the target list before the splice, or do the move on a copy and keep it only if it succeeds.

### <a id="d2"></a>D2. Edits reverted by a stale step object (High)

`src/editor-script.js:311`, `336-337`, `370-378`

Field edits call `edit(..., false)`, which doesn't rebuild the rows. `replace()` swaps in a new step object, but the row's kind menu (`convert(s, ...)`) and its "more" JSON field (`Object.entries(s)`) still hold the *old* object. Edit a line's text and then change its kind, and the old text comes back. The same happens when you edit the "more" JSON next.
**Fix:** read the current step with `listAt(parse(path))` in these handlers.

### <a id="d3"></a>D3. A cancelled save counts as saved (High)

`src/editor.js:261`, `src/editor-texts.js:117-119`, `src/editor-things.js:128-129`, `src/editor-voices.js:237-238`, `src/editor-sound.js:79-83`, `src/editor-paint.js:590-591`, `src/editor-art.js:135-140`

`saveFile` returns the string `"not saved"` when the user cancels the file picker. Only the Room tab checks for it (`editor.js:544`). Every other tab clears its dirty state anyway, so the ● marker and the `beforeunload` warning disappear, and a reload loses the work. This only affects editing without the studio (saving through the browser).
**Fix:** return `{ ok, msg }` and use one shared "save a layer, then clear dirty" helper in place of the six copies.

### <a id="d4"></a>D4. Animation loops pile up in the Art tab (High)

`src/editor-art.js:328-330`, `441-443`

Each `build()` makes a new preview canvas and calls `requestAnimationFrame(drawPreview)`. Each loop checks the module-level `preview` variable, which always points at the newest canvas, so the older loops never stop. Arrowing through 200 sprites leaves about 200 loops redrawing every frame, and every paint stroke (`E.refresh()`) adds one more. They only end when you leave the tab.
**Fix:** keep a single loop (`if (!raf) raf = requestAnimationFrame(...)`), or give each loop its own canvas and stop it when that canvas is disconnected.

### <a id="d5"></a>D5. The studio can be read by DNS rebinding (Medium)

`tools/studio.mjs:133-140`, `57-61`

The server binds to `127.0.0.1` and checks a token on every API call, which is good. But static `GET`s need no token, the `Host` header is never checked, and `inside()` allows dotfiles. A web page that rebinds its domain to `127.0.0.1:<port>` can read `.git/config`, `.env`, `studio.json` and all the source under the root. With `--root .` that is the whole repository. Writes stay safe.
**Fix:** reject any request whose `Host` isn't `127.0.0.1:<port>` or `localhost:<port>`, and refuse paths with a segment that starts with a dot. Minor hardening on top: cap the request body size, check `isDirectory()` for `list?dir=` (a file returns a 500 that shows the absolute path), and call `realpath` before `inside()` so symlinks can't lead outside.

### <a id="d6"></a>D6. Room undo is incomplete and doesn't mark the room unsaved (Medium)

`src/editor.js:402-403`, `505-531`

- **Baselines:** the snapshot leaves out `baseline` when it is undefined, and `restore()` uses `Object.assign`, which never deletes a key. So undoing the first baseline drag on a prop doesn't take it back.
- **New hotspots:** undoing "+ Hotspot" leaves a hotspot with no shape behind.
- **Unsaved marker:** `undoRedo` never adds the room to `dirtyRooms`. If you drag, save, then undo, the room shows nothing unsaved, **Save all** skips it, and a reload brings the undone shape back.

**Fix:** have `restore` delete the keys the snapshot doesn't have, and mark the room dirty in `undoRedo`.

### <a id="d7"></a>D7. One field, two owners (Medium)

`src/editor-things.js:32-33` vs `src/editor.js:343-347`

Things writes a prop's `at` and `baseline` into `edits.js`. Room writes the same fields into `rooms/<id>.geo.js`. After a reload, whichever file loads last silently wins.
**Fix:** let geometry own these fields and drop them from the Things prop fields, or have Things send them through Room's shape edits.

### <a id="d8"></a>D8. Rebuilds throw away what is being typed (Medium)

`src/editor.js:1109-1113`, `1483-1492`, `1613-1618`

`setStatus`, `E.refresh()` and `room.entered` each rebuild the inspector and the left panel. Afterwards only the focus on lists and folds is restored. If a Checks task finishes while you type into a Things field, the text and the focus are gone. The Help tab's 30 ms refocus (`editor-guide.js:156`) works around the same problem. Ctrl+S from a focused field has a related bug: it saves before the field's `change` fires (`editor.js:827`).
**Fix:** `setStatus` should update only the status bar. Skip a rebuild, or commit the field first, while an input has focus. Call `blur()` on the focused field before saving.

### <a id="d9"></a>D9. JSON fields can't remove keys (Medium)

`src/editor-things.js:160-163`, `src/layers.js:301-313`

A whole-value JSON field (`costume`, `voice`, `glow`, `scale`) is sent as a patch and deep-merged into the existing value. Deleting `"reach"` from a costume does nothing, in the live data or in the saved layer.
**Fix:** a "replace" flag on `edits.change`, or send `null` before the new value. This is the same root cause as [E8](#e8).

### <a id="d10"></a>D10. Renaming dialogue nodes (Medium)

`src/editor-dialogue.js:30`, `46`, `84-96`

`reorder()` renames the `goto`s of choices but not the `{ dialog, node }` steps in `enter`, `then` or actors' scripts, so those now point nowhere. `links()` finds references with a regex over `JSON.stringify`. That only matches when `node` comes right after `dialog`, and it ignores which dialogue is meant. So the warnings that no choice leads to a node are unreliable. Moving a choice also shifts the index keys of once-only choices ([E6](#e6)).
**Fix:** one shared structural walk over the game's data, used here, in Texts, in Voices and in the blocks. It is written four times today.

### <a id="d11"></a>D11. Editor performance (Medium)

- **Voices** (`src/editor-voices.js:93-123`, `265-276`): `clip()` calls `voice.layerOf()`, which copies the whole clip map, up to five times per line on every rebuild, and every arrow key causes a rebuild. The `decoded` cache keeps every AudioBuffer, keyed by its whole data URI, and never lets go.
- **Room drags** (`src/editor.js:533`, `758-762`): `changed()` on every mouse move rebuilds the walk map ([E7](#e7)), even when you drag a lamp or a prop, and the panels with it.
- **Grouping:** `[...(map.get(g) ?? []), x]` is O(n²) for big groups (`editor-texts.js:215`, `editor-state.js:51`, `editor-voices.js:274`).

**Fix:** read the clip layer once per rebuild and bound the cache. Rebuild the walk map only for walk-area and hole edits, on pointer-up. Use `push` to build groups.

### Editor: lower-severity

- Paint: redo after undoing a moved selection loses the moved pixels, leaving a transparent hole (`src/editor-paint.js:303-308`).
- Paint: Space-to-pan can get stuck after a key release in the popup or a lost focus (`src/editor-paint.js:877`, `889`). Clear it on `blur`.
- Room: a drag goes on after the button is released outside the window (`src/editor.js:742-769`). Check `e.buttons`, or use pointer capture as Paint does.
- Texts: CSV import always splits on `;` as well as `,` (`src/editor-texts.js:151`). Detect the delimiter from the header.
- Studio client: `studio.exists()` downloads the whole file just to see whether it exists (`src/editor.js:229`).
- Structure: `editor.js` (1,870 lines, one IIFE) holds the studio client, the shape tool, the list widget and the shell. Splitting those out would make the problems above easier to fix and to test.

---

## Solver and Node tools

The tools are a real strength. The solver, the validator and the playthrough all run the *real* engine in a `vm`, so there is no second model of the game to drift out of step. The search order is fixed, the canonical SHA-1 keys handle inventories and flags in any order, worker results are merged in a fixed order, and the backward pass that finds soft-locks is sound. The weak spots are whether the state key covers everything, the bookkeeping for dialogue branches, and resources at process boundaries.

### <a id="s1"></a>S1. Packed states keep 16 KiB each (High, reproduced)

`tools/lib/solver.mjs:18` (and the same `pack` in `solver-worker.mjs`)

`deflateRawSync` returns a small `Buffer` that is a *view* into zlib's 16 KiB output chunk. A demo state packs to 207 bytes but keeps all 16,384 alive. I checked this separately: a 21-byte result has a backing buffer of `byteLength` 16384. Sending a state to a worker copies the full 16 KiB as well. With `--full --max 100000` that is about 1.6 GB where about 20 MB would do.
**Fix:** `export const pack = (snap) => Buffer.from(deflateRawSync(JSON.stringify(snap)));`

### <a id="s2"></a>S2. A second dialogue overwrites the branching bookkeeping (High)

`tools/lib/solver.mjs:137-158`

When a run reaches a dialogue choice that hasn't been planned, the chooser records `need = texts.length`, adds the point to `seen` and returns -1. That ends the *dialogue*, but the outer script goes on. If the script then reaches another dialogue, for example `talk: [{ dialog: "guard" }, { dialog: "guard2" }]` or a `goto` into a room whose `enter` opens one, the chooser runs again. It overwrites `need` with the second dialogue's count and pollutes `seen`. Guard's other options are never tried. The solver can then report a solvable game as unsolvable, or miss a soft-lock, and the polluted `seen` can drop later runs as duplicates.
**Fix:** record only the first unplanned choice point (`if (!need && !dup)`), or stop the run there.

### <a id="s3"></a>S3. The state key leaves out the act (Medium)

`tools/lib/solver.mjs:74-78`

`key()` hashes the room, the active actor, the actors' rooms, the party and the state, but not `snap.act`. Hints (`h.act === acts.current`) and `{ act: "next" }` both depend on the act. An act that isn't `fresh`, has no `start` steps and begins in the same room gets the same key as the act before it. The solver takes it as a self-loop and never explores the act.
**Fix:** add `snap.act` to the tuple.

### <a id="s4"></a>S4. A crashed worker hangs the solver (Medium)

`tools/lib/solver.mjs:219-228`

`w.on("error", reject)` only covers start-up, and there is no `exit` handler. An uncaught throw from a game timer inside the worker's vm, or running out of memory, leaves its job unsettled, so `Promise.all` never resolves and `solve.mjs` waits forever with no output.
**Fix:** on `error` or `exit`, reject every pending job and end the pool.

### <a id="s5"></a>S5. build-atlas and png.mjs (Medium)

- `tools/build-atlas.mjs:149`, `159-162`: only the width is checked against `--max`. An image taller than the maximum is sorted first and pushes the still-empty `{ w: 0, h: 0 }` page. The result is a 0×0 PNG that won't load, plus a page that is too tall. **Fix:** check the height too, and never write an empty page.
- `tools/lib/png.mjs:49`: tRNS is applied only to palette images. Greyscale and RGB images with a colour key (a common oxipng or pngcrush result for sprites with 1-bit alpha) come out opaque with a coloured box. **Fix:** apply the key for colour types 0 and 2.
- `tools/build-atlas.mjs:136`: frame dedup uses the pixel bytes only, so a 2×4 and a 4×2 frame with identical bytes (typically fully transparent) are merged. Animations with the same name silently overwrite each other. **Fix:** put `w×h` in the key, and make a duplicate name an error.

### <a id="s6"></a>S6. Chrome lifecycle (Medium)

`tools/lib/chrome.mjs:25-39`, `53-55`, `99-104`. This adds to [T1](#t1).

- **Port:** it is random in 9300-9799, and nothing checks that the Chrome just started owns it. A stale or concurrent Chrome on that port gets driven instead.
- **Failures:**
  - There is no `proc.on("exit")` handler and no error handler on the WebSocket, and pending `send`s are never rejected.
  - A Chrome crash hangs the tool, or ends with "did not start" only after 10 s.
- **Clean-up:**
  - "Did not start" leaves the profile directory behind.
  - `close()` sends SIGTERM, sleeps a fixed 300 ms, then removes the profile with errors ignored. On Windows this often fails with EBUSY and leaves a `cutaway-chrome-*` folder every run.

**Fix:** `--remote-debugging-port=0` and read `DevToolsActivePort` from the profile; reject everything pending on exit or close; await the `exit` event, then `rmSync(..., { maxRetries: 5 })`.

### Tools: lower-severity

- `tools/lib/solver.mjs:357-363`: the hint check follows only *one* shortest path, so a hint that is about an equally short other path is reported as no longer needed (a false failure).
- `tools/lib/game.mjs:43`: the script-tag regex needs `src` to be the first attribute, in double quotes. `<script defer src="rooms2.js">` is silently skipped, so the validator checks only part of the game. It should at least warn about `<script>` tags it doesn't match.
- `tools/play.mjs:17`: `--workers` is missing from the flags that take a value, so `play.mjs --workers 4 demo/index.html` takes "4" as the page.
- `tools/build-editor-help.mjs:306`: the "am I the main module" check fails behind a symlink (macOS `/tmp`), and the tool then does nothing and exits 0. Compare the `realpathSync` of both sides.
- `tools/check_pixels.py:9`: a screenshot smaller than the buffer compares 0 pixels and passes.

---

## Audio and music

The design is clean: buses into a compressor, instruments defined as data, a sequencer whose timing logic is unit-tested apart from WebAudio, scheduling with lookahead, and seeded noise. The problems are the usual ones in hand-written WebAudio code.

### <a id="a1"></a>A1. Transition segments (Medium)

`src/music/sequencer.js:128`, `173-174`

- **Cut short:** after `enter(theme, via.shift())`, `pending` stays set. The segment's default `exits: "bar"` then counts its own first bar line as a jump point, so a 2-bar outro plays one bar. The demo's segments are one bar long, so it doesn't show this.
- **Looping forever:** while `to_yard` (a section of the hall theme) is playing, `request("hall")` sees `theme === "hall"` and clears `pending`. Transition segments have no `next`, so the snare roll then loops forever. This is the demo's own case when the player leaves the hall and steps straight back in.

**Fix:** jump only at the end of a segment that is part of a transition, and remember the section to go back to.

### <a id="a2"></a>A2. Layer fades click when the intensity changes again (Medium)

`src/music/director.js:54-57`

`cancelScheduledValues(time)` with `time` on the next beat removes a ramp that is still running, so the gain snaps back to the ramp's start now. It then jumps to the value read on the main thread at `time`. Two `{ music: { intensity } }` steps less than a bar apart, or dragging the music lab's slider, make layers drop out with a click.
**Fix:** use `cancelAndHoldAtTime` where the browser has it. Otherwise keep each ramp's start, end and values in JS and compute the value at `time`.

### <a id="a3"></a>A3. `render()` swaps globals across an `await` (Medium)

`src/music/director.js:85`, `154-190`

While `startRendering()` runs, `player`, `layers`, `fader`, `wanted` and `Cutaway.audio.ctx` and `buses` all point at the offline render. The live `setInterval` pumps the render player, so live music stops, and live `say`, `sfx` and `music` events go into the offline graph. When the globals are restored, `pump()` has no guard against falling behind and plays every missed step at once. A stall on the main thread longer than `LOOKAHEAD` (150 ms) also causes such a burst. Rendering also ignores `stop` and `fade`, so a render differs from live play.
**Fix:** render with a separate Player and its own buses, and in `pump`, skip steps whose time has passed instead of playing them.

### <a id="a4"></a>A4. Sound export with `inst` parts (Medium)

`src/sfx.js:147-151`, `src/music/synth.js:250-252`

`sfx.render` uses an `OfflineAudioContext`, but `synth.play` always uses `Cutaway.audio.ctx`. If live audio is unlocked, `connect` throws `InvalidAccessError` and the export fails. If it isn't, the `inst` notes are silently left out.
**Fix:** pass the context and its buses into `synth.play` (from `o.out.context`).

### Audio: lower-severity

- **Gated reverb** (`src/music/synth.js:76-82`, `233-241`): there is one gate per context, always wired to `buses.music`. So it ignores the layer and fader levels and the `stop` fade, and the gated drums of sound effects come out on the music bus.
- **Clicks at note ends:**
  - the drum noise buffer runs out when `decay` is above about 0.56 s (`synth.js:214`);
  - pluck notes stop abruptly after about 2.8 s (`synth.js:175`, `197`);
  - long tones in `sfx` are cut at about 4% of their level (`sfx.js:81`, `133`).

  End notes with a short linear ramp to 0 before `stop`.
- **iOS** (`src/audio.js:126-131`): `wake()` resumes only from `"suspended"`, so after a phone call or Siri (`"interrupted"`) the game stays silent. `resume()` rejections are also left unhandled.
- **Volume** (`src/audio.js:117-123`): `applyVolumes` sets `.gain.value` directly, so sliders click, and changing the music volume while speech is ducking it removes the duck.

---

## Recommendations, in order

1. **Give running scripts an owner.**
   - Add cancel tokens for every `script.run` and a `script.cancelAll()` that the load and title-screen paths call ([E1](#e1)).
   - Defer saves until no script is running ([E2](#e2)).
   - Have actor operations always settle, both on screen and off it ([E3](#e3), [E4](#e4), [E13](#e13)).

   This removes the soft-locks and save corruption, and is the most valuable change.
2. **Make script data unambiguous and stable:** one action per step, resolved by declared arguments and checked by the validator ([E5](#e5)), and stable ids for once-only flags ([E6](#e6), [D10](#d10)).
3. **Fix the solver's completeness bugs** ([S1](#s1)-[S3](#s3)). The solver is what proves a game can be finished, so it must not miss branches.
4. **Lock down the studio** with a `Host` check and no dotfiles ([D5](#d5)), and **make the tests run anywhere** ([T1](#t1), [S6](#s6)).
5. **Editor: one change-and-save service** (unsaved state, save results, one owner per field) and targeted re-renders in place of rebuilding everything. That deals with [D3](#d3), [D4](#d4) and [D6](#d6)-[D11](#d11) structurally. [D1](#d1) and [D2](#d2) need only small, local fixes.
6. **Performance:** an exact visibility test in the walk map ([E7](#e7)), and a cached hotspot list ([E17](#e17)).
7. Add tests for each of the High findings. The repro scripts used for this review fit straight into `tests/load.mjs` and the Chromium harness.
