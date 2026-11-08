# Proposal: the Sequences tab, a timeline for sequences

Status: built, stages 1 to 4, as the tab **Sequences** (it was to be called Film: docs/editor.md "Sequences",
docs/reference.md "The timeline", `Cutaway.timeline` in src/timeline.js, the tab src/editor-sequences.js); of stage 5 only the
music's state when playing from the playhead. Where it went another way than written here:
- `Cutaway.timeline` (`src/timeline.js`, loaded by the editor) holds `trace`, `seek`, `play`, `close` and the step
  changes (`edits`), not `Cutaway.sequence`; the sequence gives `abort()` and `source(id)`.
- No checkpoints at the shot marks: a running script can't be copied, and a game's own state (a drawer's
  progress) isn't in any snapshot. A seek plays on from where the run stands, and back it runs again from the
  start; that is fast enough (the demo's intro traces in 50 ms, a two-minute film in well under a second).
  Each run starts from the same clock time (`Cutaway.clock.rewind`), so whatever draws by the clock repeats.
- Camera and props are placed on a map of the whole room in the inspector (the picture shows only the
  camera's view); the picked camera step's frame is also drawn on the picture.
- Not yet: thumbnails of the shots, the ease drawn as a curve in a bar, picking the same row in the Things
  tab, the trace of an `if`'s other branch, steps a helper made shown as one group (such a sequence's steps
  go into the edits layer, said in the status line), the music's sections and the ambience as bands, sfx
  waveforms.

Was: proposal, nothing built yet. Scope: the editor (`editor-sequences.js`, a new tab) and small hooks in
`script.js`, `sequence.js` and `core.js`. No change to how a game writes a sequence.

## Why

A sequence (an intro, a cutscene, an act's prologue) is a list of script steps. Its timing is implicit:
it is what the `wait`s, the `ms` of tweens and the steps that run on (`wait: false`) add up to. Today
the editor can play a sequence, play it from a shot mark, skip to the next mark, pause, and step 100 ms
(Play menu, Things tab). Its steps are edited as blocks, one row per step.

What's missing is the thing a film needs:
- see where everything happens in time (the camera drives 34 s; the flash comes 7 s in; the caption is
  typed while the camera still moves)
- go to any moment and look at it, back and forth
- change a timing by dragging it, and see the result at that moment at once
- place a camera or a prop where it should be at a moment, on the picture

Today this means editing numbers, playing from the last shot mark, waiting, and doing it again. A
timeline makes the time visible and the moment reachable. The step list stays what the game is
written in.

## What it looks like

A new tab, **Film** (Tools > Film; F1 opens its section). The usual layout:

```
┌ left ─────────────┬ centre ──────────────────────────────────────────┬ inspector ──────────┐
│ sequences         │ the game picture at the playhead                 │ the picked step:    │
│  ▸ intro          │  (overlays: camera frame and path, letterbox,    │  its block form     │
│    shots          │   caption area, a moved prop's path)             │  (editor-script's), │
│      hall  0.0 s  │                                                  │  its time: start,   │
│      sky   2.3 s  ├──────────────────────────────────────────────────┤  end, length,       │
│      yard  9.1 s  │ ▶ ⏸ ⏮ ⏭  00:07.250 / 00:12.400   [in][out] ⟲     │  ease; "open in     │
│  ▸ cutscene_boat  │ ├ 0s ──── 2s ──── 4s ──── 6s ──── 8s ──── 10s ─┤ │  file" for code     │
│                   │ shots  │ hall  │ sky ▓▓▓▓▓▓▓▓▓▓▓▓│ yard ▓▓▓▓▓▓│ │                     │
│                   │ room   │ hall  │ intro_sky       │ yard       │ │                     │
│                   │ story  │wait│caption ▬▬│ camera ▬▬▬▬│caption▬│w│ │                     │
│                   │ camera │    │          │ ▬▬▬▬▬▬▬▬▬▬ [0,120] │ │                     │
│                   │ walker │    │          │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬ by 190 │                     │
│                   │ screen │ letterbox ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│▬ fade ▬│ │                     │
│                   │ sound  │ ♪ theme   ◆ tick        ◆ thunder     │ │                     │
│                   │        │                ▲ playhead             │ │                     │
└───────────────────┴──────────────────────────────────────────────────┴─────────────────────┘
```

### The timeline

The time runs to the right; the ruler is in seconds. It zooms and scrolls the way the Time tab does:
the wheel zooms round the pointer, Shift+wheel scrolls, Fit or a double click shows the whole film,
and the zoom is kept for each game.

Lanes, top to bottom:

| lane | what |
|---|---|
| shots | each shot mark to the next, named; a thumbnail of its first frame |
| room | which room is shown (each `goto`), in the room's colour (as the Time tab's) |
| story | the steps the film waits for, end to end: waits as empty gaps, lines and narration as bars with their text, dialogues, anything else that blocks |
| camera | each `camera` step as a bar from start to end, its target and ease written on it |
| one lane per prop | `move`, `play`, `show` / `hide` of that prop |
| one lane per actor | `walk`, `anim`, `face`, `place`, `say` (the actor's lines also show here) |
| screen | `letterbox`, `fade`, `dissolve`, `shake`, `caption` (from the caption to the one that clears it), `tape` and the like |
| sound | `music` changes (section, intensity), `stinger`, `sfx` as diamonds; the room's ambience as a band |
| state | `set` / `unset` / `inc` / `give` …: small marks, the flag or item named (so a skip's `after` can be checked against them) |

A lane only shows when the film has something for it. A step that runs on (`wait: false`) sits in its
own lane while the story lane goes on, which is exactly what the film does when it plays.

A game's own actions (`Cutaway.script.action`) go in a lane named by the action. Their bars run from
when the action is called until its promise resolves, or they are marks when it returns at once.

### The playhead

- Click or drag on the ruler (or anywhere off a bar) to go to that moment. The picture shows the film
  there, still (the game is paused, as it is in the editor).
- Space plays from the playhead and pauses. Home and End go to the start and the end.
- ← and → move one frame (1/60 s); with Shift, 1 s. PageUp and PageDown jump to the shot marks.
- `[` and `]` set an in and an out point; ⟲ loops between them (to tune one beat over and over).
- A click on a bar picks its step. The inspector shows the step's form, and the Things tab's block
  list, if open, picks the same row.
- Playing shows the picture and plays the sound. Seeking is silent, and the music resumes at its section
  when play starts (see Limits).

## How it works

The step list stays the truth. The timeline is a view of it and an editor over it, so every existing
sequence works as it is, and the tools (validate, solve, play) read the same data as before.

### 1. A trace: when each step runs

Tracing works like this:
1. `script.js` emits `script.step` (`{ path, phase: "start" | "end", t }`) around each step, but only
   while someone listens (one flag check per step when nobody does).
2. The paths are the stable ones the script runner already makes (`sequence.intro.7`). Inside an `if`
   or a `once` the runner gives its branch's steps the `if`'s own path (`sequence.intro.7.0`, whichever
   branch ran), so the trace adds the branch (`then` / `else`) to tell the rows apart. The paths tie
   each bar to its row in the step list.
3. `Cutaway.sequence.trace(id)` plays the sequence on a manual clock with nothing shown and nothing
   heard. It records each step's start and end, what the step is, and the room at each shot mark, then
   puts the game back as it was.

Putting the game back works like this:
1. Before the trace, `Cutaway.save.capture()` takes the state, the actors, the party and the room, plus
   the scene (camera, props, the cinema's bars and caption).
2. After the trace, `apply` restores them.

What makes the trace possible:
- **The clock is already deterministic.** Everything the film shows is a function of game time:
  - tweens run on `Cutaway.clock`
  - effects and scrolling props are pure functions of the scene time
  - `?manual` and `clock.advance` step it

  So `advance` in 1/60 s steps, as fast as the page can, gives the film's real timings, not estimates.
- **No clicks are needed.** Lines that wait for a click (`advance: "click"`) count as their reading
  time, as `debug.settle()` already does for the tools. A recorded voice counts as its clip's length.

A trace of a two-minute film is about 7200 logic steps with no drawing. That takes a fraction of a
second. It runs again after every edit, so the bars always match what the film does.

### 2. Seeking: the picture at any moment

`Cutaway.sequence.seek(id, ms)` does this:
1. It puts the game back to the start, or to the nearest **checkpoint** before `ms`. A checkpoint is
   taken at each shot mark during the trace: the same capture plus the scene, the cinema and the
   playing tweens.
2. It plays on silently on the manual clock to `ms`, then stops the clock.

The picture is then exactly what the player would see at that moment. Dragging the playhead seeks once
per frame. With checkpoints, a seek replays at most one shot's length, which stays quick.

The engine already hurries a sequence to a shot mark (`play(id, { from })`). Seek is its precise
sibling:
- **Hurry** passes over waits and lines; that is right for skipping.
- **Seek** runs them in game time without drawing; that is right for looking at a moment.

### 3. Editing on the timeline

Every change is a change to the steps. It goes the way the Things tab's changes already go: into the
game at once (the sequence is replaced, traced again, and the picture seeks to the same moment), into
the edits layer (`game/edits.js`, the sequence's steps), with undo and redo. Save (Ctrl+S) writes the
files.

| on the timeline | in the steps |
|---|---|
| drag the end of a wait or a tween bar | its `ms` (`wait`, `camera`, `move`, `fade`, `letterbox`, `dissolve`, …) |
| drag a bar that runs on (`wait: false`) left or right | the waits around it: the gap before it grows, the one after shrinks, so nothing else moves. Without a wait to take from, one is made |
| drag a mark (an `sfx`, a `stinger`, a `set`) | the same: it moves between the steps it sits between, splitting or joining waits |
| Alt+drag: move everything after | the wait before grows or shrinks; everything later shifts (ripple) |
| right click on the story lane at the playhead: Add here … | splits the wait under the playhead and puts the new step there: caption, sound, stinger, camera, move a prop, fade, shot mark, line, a game's action (JSON) |
| Delete | removes the step; a gap it leaves stays as a wait, so the time after it doesn't jump |
| the ease (on a tween bar's menu) | `ease`: linear, in, out, inOut, with a small curve shown in the bar |

On the picture, at the playhead:
- **Camera.** The camera's frame is drawn in the room, and the room is shown whole when it is wider
  than the screen. Dragging the frame sets the target (`camera: [x, y]`) of the camera step that is
  running at the playhead, or of the next one. The path of every camera step in the shot shows as a
  dotted line with its keys.
- **A moved prop.** Picked on the picture at the playhead, it is dragged to set its `move` step's `to`
  (or `by`, as written). Its path shows as for the camera.
- **A caption.** Its text is edited in place in the inspector. Its `at` (the corner) is picked by
  clicking a corner of the frame. Its length comes from `ms` or from the step that clears it.

The snapping rules:
- Times snap to 50 ms. With Shift held they don't snap, and with Ctrl they snap to the other bars'
  edges and to the shot marks.
- A drag shows the new time and the change in it ("+350 ms").

### 4. Steps the file computes

A game may write steps with its own code, for example
`...flash("bolt", 0.5)` or `...caption("text", 5000)` from a helper function. The edits layer replaces a
sequence's steps whole, and the timeline can save that. The question is how such steps stay readable as
the game wrote them:
- **Steps written as literals** in the game's file can be changed right there. `editor-literal.js`
  (which the Time tab uses) changes only the value, and the file's comments and layout stay.
- **Steps a helper made** show as one group: a bar with the helper's name, read from the trace's path
  and the source position, if the engine can learn it as `Cutaway.time.source` does. Inside the group
  the steps are shown but not taken apart. The group moves as a whole (the wait before it changes).
  Changing what's inside is "Open in file" or "Unfold": unfolding writes its steps out as literals into
  the edits layer, after asking first.

A game whose sequences are all literals gets full editing in its own file. A game that uses helpers
gets timing edits around them, plus the edits layer when it wants to unfold one.

## Limits (said in the tab, not hidden)

- **Steps that wait for the player** (a dialogue's choices, an `if` on state the film itself doesn't
  set) are traced the way the state is now. An `if` shows the branch it took, with a toggle to trace
  the other one.
- **Music:** the director picks sections and jump points by state, not by time. Seeking doesn't play
  music. Play from the playhead starts the music state the trace recorded at that moment (theme,
  section, intensity) at the section's start. It is close, not sample exact.
- **Long or endless steps** (a `loop: true` animation, a wait for an event) end the trace at a cap,
  default 10 minutes, with a warning on the bar.
- **Sequences inside sequences** (`{ sequence: id }`) trace as one bar that can be opened. Edits go to
  the inner sequence.

## Building it, in stages

Each stage is usable on its own and comes with its tests (`node tests/run.mjs`), `npm run check`, and
its section in `docs/editor.md` (the Help tab).

1. **Watch.**
   - `script.step` events; `sequence.trace` and `sequence.seek`; checkpoints at shot marks.
   - The Sequences tab: lanes, ruler, zoom, the playhead, play and pause, in/out and loop.
   - Picking a bar picks the step in the inspector and in the Things tab.

   Tests use the demo's intro:
   - the trace's times (its camera step 2.6 s, its captions) and its paths
   - a seek to t gives the same picture as playing to t (the frame's pixels compared)
   - the state is the same after a trace as before
2. **Retime.**
   - Dragging ends, marks and bars that run on (wait arithmetic); ripple; the ease.
   - Add at the playhead; delete; undo and redo; written to the edits layer.

   Tests: each drag's change to the steps, the trace after it, Ctrl+Z, Save.
3. **Place.**
   - The camera frame and paths on the picture; dragging a moved prop; captions in place.

   Tests: a drag at a moment changes the right step's target.
4. **In the file.**
   - Literal steps changed in the game's own file (`editor-literal.js`); helper groups with their
     source; Unfold.

   Tests: one value changed with comments kept; a helper group moved as one; Unfold.
5. **Sound.**
   - The music lane with its sections; the ambience band; play from the playhead with the music's
     state.
   - Sfx waveforms drawn from the synthesised sound (offline render), so a sound can be put on a beat.

The size, as a guess: stage 1 is the most work (the trace, the seek and checkpoints, the lanes). After
it, stage 2 is as big as the Time tab's drag and write. Stages 3 to 5 are smaller each.

## Open questions

- **One tab or a part of Things?** A tab of its own gives the timeline the room it needs (most of the
  centre's height). Things keeps the step list, and the two stay in step through the shared path.
- **Absolute times in the data?** A track form (`{ at: 7000, sfx: "thunder" }` inside a step that runs
  its children by their times) would make some films easier to write by hand. It would also be a
  second way to say the same thing. The proposal keeps the step list as the only form; a track action
  can come later, if writing by hand asks for it.
- **The picture while dragging the playhead fast:** seek every frame, or every other one, with a
  thumbnail strip as a fallback? It depends on how fast the seek is in a real game; to measure in
  stage 1.
