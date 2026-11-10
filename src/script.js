// Cutaway.js scripts: lists of declarative actions, run one after another.
//   ["Hallo!", { walk: [120, 150] }, { if: "!has:key", then: [{ take: "key" }], else: ["Hab ich schon."] }]
// A plain string is a line for the active actor. Each object names one action by its key; the other
// keys are its arguments. Games and plug-ins add actions with Cutaway.script.action(name, fn).
// While a script runs the player can't start another one (clicks skip the current line instead).
// A script can be stopped between steps (`cancel` in its context: a skipped sequence). In fast mode (a
// sequence skipping ahead) lines, sounds and waits are passed over at once.
// A script can't be saved half-way: while one runs, a save is of the game as it was just before it
// (Cutaway.save.hold), so loaded, the player stands before the click that began it. And when the game is
// replaced (a save loaded, back to the title), the scripts under way end first (Cutaway.script.abort): their
// remaining steps must not happen to the game that comes.
// The editor's timeline (the Sequences tab) watches the steps (Cutaway.script.watch): when each starts and ends, which branch an
// `if` or a `once` took, and what a step that goes on at once (wait: false) still runs (its promise,
// Cutaway.script.goOn). Nobody watching costs one check per step.
"use strict";

/**
 * @typedef {string | Record<string, any>} Step
 * @typedef {Step | Step[] | undefined} Script
 * @typedef {object} ScriptContext
 * @property {string} path        stable id of this step in the game data (used by `once`)
 * @property {string} [hotspot]   the hotspot that started the script
 * @property {string} [item]      the item used on it
 * @property {{stopped: boolean}} [cancel]  once `stopped`, no further step runs (nested ones neither)
 * @property {() => boolean} [after]  does a line still follow this step (in this script or the one around it)?
 */
/**
 * What a watcher of the steps hears: a step starts or ends, a branch is taken (`branch`: "then", "else",
 * "once"), or a step that went on at once still runs something (`runs`: its promise; `key`: a tween's).
 * @typedef {{phase: "start" | "end" | "branch" | "runs", path: string, t: number, step?: Step, branch?: string, done?: Promise<any>, key?: string, ms?: number}} ScriptEvent
 */

Cutaway.script = (function () {
  /** @type {Map<string, (step: Record<string, any>, ctx: ScriptContext) => (void | Promise<void>)>} */
  const actions = new Map();
  /** @type {Map<string, {sets?: (step: Record<string, any>) => string[], tests?: (step: Record<string, any>) => string[]}>} what games' actions tell the tools */
  const metas = new Map();
  let busy = 0, fast = false;
  /** the game is being replaced: no further step runs, what waits is let go (abort) */
  let stopping = false;
  /** this module holds the save (the game before the outermost script) */
  let holding = false;
  /** @type {((e: ScriptEvent) => void) | null} the editor's timeline, hearing every step */
  let watcher = null;
  /** the path of the step whose action is being called (its synchronous part): what it starts is its own */
  let current = "";

  /** Wait `ms` of game time; nothing in fast mode. @param {number} ms */
  function sleep(ms) { return fast || !(ms > 0) ? Promise.resolve() : Cutaway.clock.wait(ms); }

  /** Open or shut a door prop ("id" or "room/id") if its room is the one shown. @param {any} ref @param {boolean} on */
  function door(ref, on) {
    const [room, id] = String(ref).includes("/") ? String(ref).split("/") : [Cutaway.scene.room?.id, String(ref)];
    if (!room || room !== Cutaway.scene.room?.id) return false;
    Cutaway.scene.showProp(id, on);
    return true;
  }

  /**
   * Run a script to the end. Resolves when it has finished.
   * @param {Script} script
   * @param {Partial<ScriptContext>} [ctx]
   */
  async function run(script, ctx = {}) {
    // the first script under way: a save written from now on is the game as it is here (unless something holds
    // one already: a moment, which plays again once loaded)
    if (!busy && Cutaway.save && !Cutaway.save.held) {
      const before = Cutaway.save.capture();
      if (before) { Cutaway.save.hold(before); holding = true; }
    }
    busy++;
    Cutaway.events.emit("script.busy", true);
    try {
      await exec(script, { path: "", ...ctx });
    } catch (e) {
      console.error("Cutaway script error at " + (ctx.path ?? "?"), e);
    } finally {
      busy--;
      if (!busy) {
        if (holding) { holding = false; Cutaway.save.hold(null); }
        Cutaway.events.emit("script.busy", false);
      }
    }
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
   * End every script under way, because the game is being replaced (a save is loaded, the player goes back to
   * the title): no further step runs, and what the steps under way wait for is let go, as when a sequence is
   * skipped (the line, a card, open choices, walks and animations, waits and tweens). Resolves when no script
   * runs any more. Never call it from a script's own step: it would wait for itself.
   */
  async function abort() {
    while (stopping) await breathe();                      // one at a time
    if (!busy) return;
    stopping = true;
    const wasFast = fast, wasInstant = Cutaway.tween.instant;
    fast = true;
    Cutaway.tween.instant = true;
    try {
      if (Cutaway.sequence?.playing()) await Cutaway.sequence.abort();
      for (let i = 0; busy && i < 4000; i++) {
        if (Cutaway.menu?.card) Cutaway.menu.closeCard();
        if (Cutaway.ui.line) Cutaway.ui.skip();
        if (Cutaway.dialogs?.choices) Cutaway.dialogs.pick(-1);
        for (const a of Cutaway.actors.all()) a.settle();
        Cutaway.clock.advance(250, false);
        await breathe();
      }
    } finally {
      fast = wasFast;
      Cutaway.tween.instant = wasInstant;
      stopping = false;
    }
  }

  /**
   * @param {Script} script
   * @param {ScriptContext} ctx
   */
  async function exec(script, ctx) {
    if (script === undefined || script === null) return;
    const list = Array.isArray(script) ? script : [script];
    for (let i = 0; i < list.length; i++) {
      if (ctx.cancel?.stopped || stopping) return;
      const outer = ctx.after;
      await step(list[i], { ...ctx, path: `${ctx.path}.${i}`, after: () => speaks(list.slice(i + 1)) || !!outer?.() });
    }
  }

  /** The steps that change the state (after one of them, an `if` further on may go either way). */
  const CHANGES = ["set", "unset", "inc", "give", "take", "remove", "state", "show", "hide", "place", "goto", "bag"];

  /**
   * Is there a line (say, narrate, or a dialogue) in these steps, as things stand? An `if` counts by the state now,
   * or either way once a step before it changes the state; a `once` either way. The UI marks a line
   * with what comes next: more to read, or the end.
   * @param {Script} script
   * @param {{changed: boolean}} [seen]
   */
  function speaks(script, seen = { changed: false }) {
    if (script === undefined || script === null) return false;
    for (const s of Array.isArray(script) ? script : [script]) {
      if (typeof s === "string") return true;
      if (!s || typeof s !== "object") continue;
      if ("if" in s) {
        if (seen.changed ? speaks(s.then, seen) || speaks(s.else, seen) : speaks(Cutaway.state.test(s.if) ? s.then : s.else, seen)) return true;
      } else if ("once" in s) {
        if (speaks(s.once, seen) || speaks(s.else, seen)) return true;
      } else if ("say" in s || "narrate" in s || "dialog" in s) return true;   // a dialogue: the talk goes on
      else if (CHANGES.some((k) => k in s)) seen.changed = true;
    }
    return false;
  }

  /**
   * @param {Step} s
   * @param {ScriptContext} ctx
   */
  async function step(s, ctx) {
    if (watcher) return watched(s, ctx, watcher);
    if (typeof s === "string") return say({ say: s }, ctx);
    if ("if" in s) return exec(Cutaway.state.test(s.if) ? s.then : s.else, ctx);
    if ("once" in s) {
      if (Cutaway.state.once(ctx.path)) return exec(s.once, ctx);
      return exec(s.else, ctx);
    }
    for (const k of Object.keys(s)) {
      const fn = actions.get(k);
      if (fn) return fn(s, ctx);
    }
    throw new Error("Cutaway: unknown action " + JSON.stringify(s));
  }

  /**
   * A step run as `step` runs it, told to the watcher: its start, the branch it took, its end.
   * @param {Step} s @param {ScriptContext} ctx @param {(e: ScriptEvent) => void} w
   */
  async function watched(s, ctx, w) {
    const path = ctx.path, t = () => Cutaway.clock.time;
    w({ phase: "start", path, t: t(), step: s });
    try {
      if (typeof s === "string") { await call(() => say({ say: s }, ctx), path); return; }
      if ("if" in s) {
        const yes = Cutaway.state.test(s.if);
        w({ phase: "branch", path, t: t(), branch: yes ? "then" : "else" });
        await exec(yes ? s.then : s.else, ctx);
        return;
      }
      if ("once" in s) {
        const first = Cutaway.state.once(path);
        w({ phase: "branch", path, t: t(), branch: first ? "once" : "else" });
        await exec(first ? s.once : s.else, ctx);
        return;
      }
      for (const k of Object.keys(s)) {
        const fn = actions.get(k);
        if (fn) { await call(() => fn(s, ctx), path); return; }
      }
      throw new Error("Cutaway: unknown action " + JSON.stringify(s));
    } finally {
      w({ phase: "end", path, t: t() });
    }
  }

  /** Call an action with its path as the current one (what its synchronous part starts is its own). @param {() => any} fn @param {string} path */
  function call(fn, path) {
    const was = current;
    current = path;
    try { return fn(); } finally { current = was; }
  }

  /**
   * What an action returns: the step's promise (the script waits for it), or with `wait: false` nothing
   * (the script goes on), telling a watcher that the step still runs this.
   * @param {Record<string, any>} s @param {Promise<any> | undefined} done
   * @returns {Promise<any> | undefined}
   */
  function goOn(s, done) {
    if (s.wait !== false) return done;
    if (watcher && current && done) watcher({ phase: "runs", path: current, t: Cutaway.clock.time, done });
    return undefined;
  }

  /** The actor named by `who`, or the active one. @param {string} [who] */
  function actorOf(who) {
    const a = who ? Cutaway.actors.get(who) : Cutaway.scene.active;
    if (!a) throw new Error(`Cutaway: no actor "${who ?? "(active)"}"`);
    return a;
  }

  /** { say: "text" } or { say: "actor", text: "..." } @param {Record<string, any>} s @param {ScriptContext} ctx */
  function say(s, ctx) {
    const who = "text" in s ? s.say : undefined, text = "text" in s ? s.text : s.say;
    const a = actorOf(who);
    if (fast) return;
    // source: the text in the game's data (recorded voices are kept by it); a recording holds the line as long as it plays
    const shown = overheard(a, Cutaway.i18n.t(text), String(s.id ?? ctx.path));
    return Cutaway.ui.say(a, shown, { id: s.id ?? ctx.path, more: !!ctx.after?.(), source: text, minMs: Cutaway.voice?.clipMs(a.id, text) ?? 0 });
  }

  /**
   * A line heard through the room's microphone (`mic: { at: [x, y], clear: 40, lost: 160, noise: 0 }`): an actor
   * of this room further than `clear` from it loses words, all of them at `lost`, and `noise` loses more
   * everywhere. Which words go is fixed for each line (the same every time), and runs of lost words show
   * as one "…". Lines from outside the room (the one played, watching) come through as they are.
   * @param {{room: string | null, x: number, y: number}} a @param {string} text @param {string} id
   */
  function overheard(a, text, id) {
    const mic = Cutaway.scene.room?.mic;
    if (!mic || a.room !== Cutaway.scene.room?.id) return text;
    const [mx, my] = mic.at, clear = mic.clear ?? 40, lostAt = Math.max(clear + 1, mic.lost ?? 160);
    const loss = Math.min(1, Math.max(0, (Math.hypot(a.x - mx, a.y - my) - clear) / (lostAt - clear)) + (mic.noise ?? 0));
    if (loss <= 0) return text;
    let seed = 0;
    for (const ch of id + text) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    const words = text.split(/\s+/), out = /** @type {string[]} */ ([]);
    words.forEach((w, i) => {
      let h = (seed + i * 2654435761) | 0;
      h = (h ^ (h >>> 15)) * 2246822519; h ^= h >>> 13;
      const keep = ((h >>> 0) / 4294967296) >= loss;
      if (keep) out.push(w); else if (out[out.length - 1] !== "…") out.push("…");
    });
    return out.join(" ");
  }

  /** @param {any} v @returns {[number, number]} */
  function xy(v) {
    if (!Array.isArray(v) || v.length !== 2) throw new Error("Cutaway: expected [x, y], got " + JSON.stringify(v));
    return [v[0], v[1]];
  }

  /** { walk: [x, y] } or { walk: "actor", to: [x, y], face, run: true, wait: false, free: true } (wait false: the script goes on
   * meanwhile; free: a straight line, through anything) @param {Record<string, any>} s */
  function walk(s) {
    const [who, to] = Array.isArray(s.walk) ? [undefined, s.walk] : [s.walk, s.to];
    const a = actorOf(who), [x, y] = xy(to);
    const done = a.walkTo(x, y, !!s.run, !!s.free).then(() => { if (s.face) a.face(s.face); });
    return goOn(s, done);
  }

  const builtins = {
    say,
    /** @param {Record<string, any>} s @param {ScriptContext} ctx */
    narrate: (s, ctx) => (fast ? undefined : Cutaway.ui.narrate(Cutaway.i18n.t(s.narrate), { more: !!ctx.after?.() })),
    walk,
    /** { face: "left" } or { face: "actor", to: "left" } @param {Record<string, any>} s */
    face: (s) => { "to" in s ? actorOf(s.face).face(s.to) : actorOf().face(s.face); },
    /** { anim: "actor:costumeKey" } or { anim: "costumeKey" } plays it once (wait: false: the script goes on meanwhile) @param {Record<string, any>} s */
    anim: (s) => {
      const [who, k] = String(s.anim).includes(":") ? String(s.anim).split(":") : [undefined, String(s.anim)];
      const done = actorOf(who).playOnce(k);
      return goOn(s, done);
    },
    /** @param {Record<string, any>} s */
    wait: (s) => sleep(Number(s.wait) || 0),
    /** { give: "item" } to the active actor, or { give: "item", to: "actor" } @param {Record<string, any>} s */
    give: (s) => Cutaway.state.give(s.give, s.to ?? actorOf().id),
    /** { take: "item" } gives it and hides the hotspot (and prop) that ran the script, or `hide` @param {Record<string, any>} s @param {ScriptContext} ctx */
    take: (s, ctx) => {
      Cutaway.state.give(s.take, actorOf().id);
      const hide = s.hide ?? ctx.hotspot;
      if (hide) Cutaway.state.setHidden(hide, true);
    },
    /** @param {Record<string, any>} s */
    remove: (s) => Cutaway.state.remove(s.remove, s.from ?? actorOf().id),
    /** { bag: "own", who: "actor" } a bag of their own while split off from a party that shares one; { bag: "shared" } back
     * (who: the active actor by default) @param {Record<string, any>} s */
    bag: (s) => Cutaway.state.setBag(s.who ?? actorOf().id, s.bag === "own" ? "own" : "shared"),
    /** @param {Record<string, any>} s */
    set: (s) => Cutaway.state.set(s.set, "value" in s ? s.value : true),
    /** @param {Record<string, any>} s */
    unset: (s) => Cutaway.state.unset(s.unset),
    /** @param {Record<string, any>} s */
    inc: (s) => Cutaway.state.inc(s.inc, s.by ?? 1),
    /** { state: "door", value: "open" } @param {Record<string, any>} s */
    state: (s) => Cutaway.state.setObjState(s.state, String(s.value)),
    /** @param {Record<string, any>} s */
    show: (s) => Cutaway.state.setHidden(s.show, false),
    /** @param {Record<string, any>} s */
    hide: (s) => Cutaway.state.setHidden(s.hide, true),
    /** { goto: "room", at: [x, y], face, transition: false | "dissolve", dissolve: ms } moves the active actor there
     * (in a sequence: shows the room as a shot) @param {Record<string, any>} s */
    goto: (s) => Cutaway.scene.go(s.goto, s.at ? xy(s.at) : undefined, s.face, { transition: s.transition, follow: s.follow, dissolve: s.dissolve }),
    /** { place: "actor", room, at, face } (room: null takes the actor out of every room) @param {Record<string, any>} s */
    place: (s) => {
      const a = actorOf(s.place), [x, y] = s.at ? xy(s.at) : [a.x, a.y];
      a.place(s.room === null ? null : s.room ?? a.room, x, y, s.face);
    },
    // Sound and screen: the music and effects systems listen to these events.
    /** @param {Record<string, any>} s */
    music: (s) => Cutaway.events.emit("music", s.music),
    /** @param {Record<string, any>} s */
    stinger: (s) => { if (!fast) Cutaway.events.emit("stinger", s.stinger); },
    /** { sfx: "thump", at: [x, y], gain } @param {Record<string, any>} s */
    sfx: (s) => { if (!fast) Cutaway.events.emit("sfx", { sfx: s.sfx, at: s.at, gain: s.gain }); },
    /** @param {Record<string, any>} s */
    fade: (s) => Cutaway.events.emit("fade", s.fade),
    // { tape: 0..1, ms } a worn video tape's look: the screen's (fx.js replaces this where there is one)
    tape: () => undefined,
    /** @param {Record<string, any>} s */
    shake: (s) => { if (!fast) Cutaway.events.emit("shake", s.shake); },
    // The camera and the props, for cutscenes and sequences (the scene's, not saved; leaving the room resets them).
    /** { camera: [x, y], ms, ease, wait: false } moves the camera's top left there; { camera: "follow" } gives it back @param {Record<string, any>} s */
    camera: (s) => {
      if (s.camera === "follow") { Cutaway.scene.cameraFollow(); return; }
      const [x, y] = xy(s.camera), done = Cutaway.scene.cameraTo(x, y, { ms: s.ms, ease: s.ease });
      return goOn(s, done);
    },
    /** { move: "prop", to: [x, y] | by: [dx, dy], ms, ease, wait: false } @param {Record<string, any>} s */
    move: (s) => {
      const at = Cutaway.scene.propAt(String(s.move)), [x, y] = s.to ? xy(s.to) : (([dx, dy]) => [at.x + dx, at.y + dy])(xy(s.by ?? [0, 0]));
      const done = Cutaway.scene.moveProp(String(s.move), [x, y], { ms: s.ms, ease: s.ease });
      return goOn(s, done);
    },
    /** { play: "prop", anim: "name", loop: true, wait: false } plays its animation from the start (once: then holds the
     * last frame; the script waits until it has played through) @param {Record<string, any>} s */
    play: (s) => {
      const ms = Cutaway.scene.playProp(String(s.play), { image: s.anim, loop: !!s.loop });
      return goOn(s, s.loop && s.wait === false ? undefined : sleep(ms));
    },
    /** { open: "door_open", sfx: "creak", ms: 260 } shows a hidden prop of the room shown, for the scene (a door standing open while
     * someone goes through it; not saved), with a sound, then waits `ms`; { close: "door_open", sfx } shuts it again. "room/door_open"
     * names the room too (in a dialog, or after a goto); in another room it does nothing @param {Record<string, any>} s */
    open: (s) => {
      if (!door(s.open, true)) return;
      if (s.sfx && !fast) Cutaway.events.emit("sfx", { sfx: s.sfx, at: s.at });
      return sleep(Number(s.ms) || 0);
    },
    /** @param {Record<string, any>} s */
    close: (s) => { if (door(s.close, false) && s.sfx && !fast) Cutaway.events.emit("sfx", { sfx: s.sfx, at: s.at }); },
    /** { shot: "name" } marks where a shot of a sequence begins (Space and clicks skip to the next one) */
    shot: () => {},
  };
  for (const [k, fn] of Object.entries(builtins)) actions.set(k, fn);

  return {
    run, exec, sleep, speaks, goOn, abort, breathe,
    /** Are the scripts being ended, because the game is being replaced (abort)? */
    get stopping() { return stopping; },
    /**
     * Hear every step (the editor's timeline): when it starts and ends, which branch an `if` or a `once`
     * takes, what a step that goes on at once still runs, and the tweens a step starts. One at a time;
     * returns the function that stops it.
     * @param {(e: ScriptEvent) => void} fn
     * @returns {() => void}
     */
    watch(fn) {
      watcher = fn;
      Cutaway.tween.watch((tw) => { if (watcher && current) watcher({ phase: "runs", path: current, t: Cutaway.clock.time, done: tw.done, key: tw.key, ms: tw.ms }); });
      return () => { if (watcher === fn) { watcher = null; Cutaway.tween.watch(null); } };
    },
    /** The path of the step whose action is being called now ("" between steps). */
    get current() { return current; },
    /** Is a script running (the player waits)? */
    get busy() { return busy > 0; },
    /** Fast mode: lines, sounds and waits pass at once (a sequence skipping ahead). */
    get fast() { return fast; },
    /** @param {boolean} v */
    set fast(v) { fast = v; },
    /**
     * Add an action: `Cutaway.script.action("organ", async (step, ctx) => { ... })`. With `meta`, the
     * flags its steps set or read, for the validator: `{ sets: (s) => [`tag_${s.tag}`] }`.
     * @param {string} name
     * @param {(step: Record<string, any>, ctx: ScriptContext) => (void | Promise<void>)} fn
     * @param {{sets?: (step: Record<string, any>) => string[], tests?: (step: Record<string, any>) => string[]}} [meta]
     */
    action(name, fn, meta) { actions.set(name, fn); if (meta) metas.set(name, meta); },
    /**
     * What a game's action tells the tools (the validator): `sets(step)`, the flags a step of it sets
     * (so they count as set), `tests(step)`, the flags it reads.
     * @param {string} name @returns {{sets?: (step: Record<string, any>) => string[], tests?: (step: Record<string, any>) => string[]} | undefined}
     */
    meta(name) { return metas.get(name); },
    /** Names of every known action (the validator uses this). */
    names() { return [...actions.keys(), "if", "once"]; },
  };
})();
