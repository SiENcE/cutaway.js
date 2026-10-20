// Cutaway.js sequences: little films made of script steps, for an intro before the title screen and
// for cutscenes.
//   Cutaway.sequence("intro", {
//     steps: [{ shot: "logo" }, { goto: "logo" }, { wait: 3000 },
//             { shot: "sea" }, { goto: "sea", transition: "dissolve" }, { letterbox: true, ms: 800 },
//             { camera: [0, 120], ms: 6000 }, { caption: "Somewhere, 1985.", type: true, ms: 2500 }],
//     after: [{ set: "intro_seen" }],
//   });
// Playing one (Cutaway.sequence.play(id), { sequence: id } in a script, Cutaway.start({ intro: id }))
// runs its steps as a script in cutscene mode: no cursor, no interface, nothing to click, and a `goto`
// shows a room as a shot (nobody is moved there, no enter script, no autosave; `place` actors into it).
// { shot: "name" } marks where a shot begins. Space, Enter or a click skip to the next shot mark: the
// steps in between run at once (lines, sounds and waits are passed over; their state changes stay).
// Esc (or a right click, a long press) skips the whole sequence: its steps stop where they are, the
// screen goes black, and `after` runs (the state the rest would have left), then whatever comes next
// fades in. When it ends, the bars, the caption and the camera are cleared, and the scene is back in
// the room it was in before (unless `restore: false`).
// A key held down counts once: its repeats neither release the gate nor skip shots (a Space held at the
// gate would else skip the intro's first shots too).
// Cutaway.sequence.play(id, { from: "sea" }) begins at a shot mark (the editor, to try one shot): the
// steps before it hurry as a skip does (their state changes stay), then it plays from there.
// The opening (Cutaway.start({ gate, intro })): in a browser, sound may only start after a click or a
// key. A `gate` shows a room as a still with a blinking prompt until then (not where sound may start
// at once, as in a desktop shell). Then the intro plays, the first time only (the settings' storage
// remembers it, skipped or not); the title screen's "Watch intro" plays it again.
"use strict";

/**
 * @typedef {object} SequenceDef
 * @property {Script} steps     the film: script steps, with { shot: "name" } where shots begin
 * @property {Script} [after]   steps run when it is skipped as a whole (Esc): what the skipped steps would have set
 */
/**
 * @typedef {object} GateOptions
 * @property {string} [room]               a room shown behind the prompt, as a still
 * @property {[number, number]} [view]     where the camera stays in it (top left)
 * @property {string} [prompt]             the blinking text (default "@cutaway.gate.prompt": "Click to start")
 */

/** Define a sequence: `Cutaway.sequence(id, { steps, after })`; play it with `Cutaway.sequence.play(id)`. */
Cutaway.sequence = (function () {
  /** @type {Map<string, SequenceDef>} */
  const defs = new Map();
  /**
   * The sequence playing: its steps stop once `cancel.stopped`; `skipping` is "shot" (to the next mark)
   * or "end" (all of it) while it hurries.
   * `until`: the shot mark a skip hurries to (none: the next one).
   * @typedef {{id: string, cancel: {stopped: boolean}, skipping: "" | "shot" | "end", until: string, done: boolean, hurry: Promise<void> | null}} Playing
   * @type {Playing | null}
   */
  let cur = null;
  /** @type {{prompt: string, done: () => void} | null} the gate, waiting for a click or a key */
  let gate = null;
  /** @type {GateOptions | null} the gate the game asked for (the editor lists its prompt with the texts) */
  let gateDef = null;
  let tweensWere = false, lastSkip = -1e9;

  /** @param {string} id @param {SequenceDef} def */
  function sequence(id, def) { defs.set(id, def); return id; }

  /** Lines, sounds and waits pass at once while a sequence skips ahead; tweens arrive at once. @param {boolean} on */
  function hurrying(on) {
    if (on === Cutaway.script.fast) return;
    Cutaway.script.fast = on;
    if (on) { tweensWere = Cutaway.tween.instant; Cutaway.tween.instant = true; }
    else Cutaway.tween.instant = tweensWere;
  }

  /** Let promise chains go on (a message is quicker than a timer, which browsers slow down). */
  function breathe() {
    return new Promise((/** @type {(v?: any) => void} */ done) => {
      if (typeof MessageChannel === "undefined") { setTimeout(done, 0); return; }
      const ch = new MessageChannel();
      ch.port1.onmessage = () => done();
      ch.port2.postMessage(0);
    });
  }

  /**
   * Hurry: run game time on quickly (what was waiting when the skip came, a line, a walk, a wait,
   * finishes), until the next shot mark or the end.
   * @param {Playing} c
   */
  function hurry(c) {
    hurrying(true);
    c.hurry = (async () => {
      const limit = Cutaway.clock.time + 600000;
      while (c.skipping && !c.done && Cutaway.clock.time < limit) {
        await breathe();
        if (!c.skipping || c.done) break;
        if (Cutaway.menu.card) Cutaway.menu.closeCard();
        if (Cutaway.ui.line) Cutaway.ui.skip();
        Cutaway.clock.advance(250);
      }
      if (c.skipping === "shot") c.skipping = "";
      if (cur === c && !c.skipping) hurrying(false);
      c.hurry = null;
    })();
  }

  /** Skip to the next shot mark (Space, Enter, a click). */
  function next() {
    const c = cur, now = typeof performance !== "undefined" ? performance.now() : 0;
    if (!c || c.done || c.skipping || now - lastSkip < 250) return;
    lastSkip = now;
    c.skipping = "shot"; c.until = "";
    hurry(c);
  }

  /** Skip the whole sequence (Esc, a right click, a long press). */
  function skip() {
    const c = cur;
    if (!c || c.done || c.cancel.stopped) return;
    c.cancel.stopped = true;
    Cutaway.fx.fade(1, 0);                                 // black: what comes next fades in
    const was = c.skipping;
    c.skipping = "end";
    if (!was) hurry(c);
  }

  /** A shot mark: a skip to the next shot ends here. @param {string} name */
  function shot(name) {
    const c = cur;
    if (!c) return;
    if (c.skipping === "shot" && (!c.until || c.until === name)) { c.skipping = ""; c.until = ""; hurrying(false); }
    Cutaway.events.emit("sequence.shot", { id: c.id, shot: name });
  }

  /** The shot marks in steps, in order (inside ifs and onces too). @param {any} steps @returns {string[]} */
  function shots(steps) {
    /** @type {string[]} */
    const out = [];
    /** @param {any} s */
    const walk = (s) => {
      if (Array.isArray(s)) { s.forEach(walk); return; }
      if (!s || typeof s !== "object") return;
      if ("shot" in s) out.push(String(s.shot));
      for (const k of ["then", "else", "once"]) if (k in s) walk(s[k]);
    };
    walk(steps);
    return out;
  }

  /**
   * Play a sequence. Resolves when it has ended (true if it was skipped as a whole). Inside another
   * one, its steps simply run as part of that one.
   * @param {string} id
   * @param {{restore?: boolean, from?: string}} [o]  restore: false leaves the scene as the sequence left it (the
   *   intro and the title screen: the title comes next); from: begin at this shot mark (what comes
   *   before it hurries, as a skip does)
   * @returns {Promise<boolean>}
   */
  async function play(id, o = {}) {
    const def = defs.get(id);
    if (!def) throw new Error(`Cutaway: no sequence "${id}"`);
    if (o.from && !shots(def.steps).includes(o.from)) throw new Error(`Cutaway: no shot "${o.from}" in sequence "${id}"`);
    if (cur) { await Cutaway.script.exec(def.steps, { path: `sequence.${id}`, cancel: cur.cancel }); return false; }
    const room = Cutaway.scene.room?.id ?? null, view = Cutaway.scene.view;
    /** @type {Playing} */
    const c = { id, cancel: { stopped: false }, skipping: "", until: "", done: false, hurry: null };
    cur = c;
    Cutaway.ui.hold(null);
    Cutaway.ui.setCutscene(true);
    Cutaway.events.emit("sequence.start", { id });
    if (o.from) { c.skipping = "shot"; c.until = o.from; hurry(c); }
    await Cutaway.script.run(def.steps, { path: `sequence.${id}`, cancel: c.cancel });
    c.done = true;
    if (c.hurry) await c.hurry;
    const skipped = c.cancel.stopped;
    if (skipped && def.after !== undefined) {
      hurrying(true);
      await Cutaway.script.run(def.after, { path: `sequence.${id}.after` });
    }
    hurrying(false);
    Cutaway.tween.finish();                                // camera drifts and moves that didn't wait
    Cutaway.cinema.reset();
    Cutaway.scene.cameraFollow();
    cur = null;
    Cutaway.ui.setCutscene(false);
    Cutaway.events.emit("sequence.end", { id, skipped });
    if (o.restore !== false && room) await Cutaway.scene.load(room, { enter: false, backdrop: view ?? undefined });
    if (skipped) Cutaway.fx.transition("in");
    return skipped;
  }

  /**
   * Can sound start without a click (a desktop shell, or the player has already clicked)? If not, show
   * the gate (a room as a still, a blinking prompt) until a click or a key, which unlocks it.
   * @param {GateOptions} o
   */
  async function waitAtGate(o) {
    if (await Cutaway.audio.autoplay()) return;
    if (o.room) Cutaway.scene.load(o.room, { backdrop: o.view ?? [0, 0] });
    Cutaway.ui.setCutscene(true);
    await new Promise((done) => { gate = { prompt: o.prompt ?? "@cutaway.gate.prompt", done: () => done(undefined) }; });
    Cutaway.ui.setCutscene(false);
  }

  /** @param {{code: string, event: KeyboardEvent}} k */
  function onKey(k) {
    if (k.event.repeat) return;                            // a key held down: only its first press counts
    if (gate) {
      // keys that don't count as the player's gesture for sound (or belong to the browser)
      if (["Escape", "Tab", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(k.code) || /^F\d+$/.test(k.code)) return;
      const g = gate; gate = null; g.done(); k.event.preventDefault();
      return;
    }
    if (!cur || Cutaway.menu.card || Cutaway.menu.isOpen) return;
    if (k.code === "Escape") { skip(); k.event.preventDefault(); }
    else if (k.code === "Space" || k.code === "Enter" || k.code === "NumpadEnter") { next(); k.event.preventDefault(); }
  }

  /** @param {{x: number, y: number, button: number}} p */
  function onClick(p) {
    if (gate) { const g = gate; gate = null; g.done(); return; }
    if (!cur || Cutaway.menu.card || Cutaway.menu.isOpen || Cutaway.dialogs.choices) return;
    if (p.button === 2) skip(); else next();
  }

  /** The gate's prompt, blinking at the bottom. @param {CanvasRenderingContext2D} ctx */
  function render(ctx) {
    if (!gate || Math.floor(Cutaway.clock.time / 500) % 2) return;
    const f = Cutaway.ui.font(), W = Cutaway.display.width, H = Cutaway.display.height;
    f.draw(ctx, Cutaway.i18n.t(gate.prompt), Math.round(W / 2), H - 20, { align: "center", color: "#ffffff", outline: Cutaway.ui.style.outline });
  }

  Cutaway.script.action("sequence", async (s) => { await play(String(s.sequence)); });
  Cutaway.script.action("shot", (s) => shot(String(s.shot)));

  sequence.play = play;
  sequence.skip = skip;
  sequence.next = next;
  /** @param {string} id */
  sequence.get = (id) => defs.get(id) ?? null;
  sequence.ids = () => [...defs.keys()];
  /** The shot marks of a sequence, in order (to play it from one). @param {string} id */
  sequence.shots = (id) => shots(defs.get(id)?.steps ?? []);
  /** The gate the game asked for (Cutaway.start's `gate`), or null. */
  sequence.gate = () => gateDef;
  /** The id of the sequence playing, or null. */
  sequence.playing = () => cur?.id ?? null;
  /** Is the gate waiting for the player's click? */
  sequence.gated = () => !!gate;
  /**
   * What comes before the title screen (Cutaway.start): the gate, then the intro (marked as seen in
   * the settings' storage, whether it played through or was skipped).
   * @param {{gate?: GateOptions, intro?: string}} o
   */
  sequence.opening = async (o) => {
    gateDef = o.gate ?? null;
    if (o.gate) await waitAtGate(o.gate);
    if (o.intro && defs.has(o.intro)) {
      Cutaway.scene.unload();                              // black until its first shot (the gate's room goes)
      await play(o.intro, { restore: false });
      Cutaway.settings.markSeen(o.intro);
    }
  };
  /** Listen to the keys and clicks that skip (before the interface does: start-up calls this first). */
  sequence.init = () => {
    Cutaway.events.on("key", onKey);
    Cutaway.events.on("pointer.click", onClick);
    Cutaway.events.on("frame.ui", render);
  };
  return sequence;
})();
