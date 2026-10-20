// Cutaway.js scripts: lists of declarative actions, run one after another.
//   ["Hallo!", { walk: [120, 150] }, { if: "!has:key", then: [{ take: "key" }], else: ["Hab ich schon."] }]
// A plain string is a line for the active actor. Each object names one action by its key; the other
// keys are its arguments. Games and plug-ins add actions with Cutaway.script.action(name, fn).
// While a script runs the player can't start another one (clicks skip the current line instead).
// A script can be stopped between steps (`cancel` in its context: a skipped sequence). In fast mode (a
// sequence skipping ahead) lines, sounds and waits are passed over at once.
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

Cutaway.script = (function () {
  /** @type {Map<string, (step: Record<string, any>, ctx: ScriptContext) => (void | Promise<void>)>} */
  const actions = new Map();
  let busy = 0, fast = false;

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
    busy++;
    Cutaway.events.emit("script.busy", true);
    try {
      await exec(script, { path: "", ...ctx });
    } catch (e) {
      console.error("Cutaway script error at " + (ctx.path ?? "?"), e);
    } finally {
      busy--;
      if (!busy) Cutaway.events.emit("script.busy", false);
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
      if (ctx.cancel?.stopped) return;
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
    return Cutaway.ui.say(a, Cutaway.i18n.t(text), { id: s.id ?? ctx.path, more: !!ctx.after?.(), source: text, minMs: Cutaway.voice?.clipMs(a.id, text) ?? 0 });
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
    return s.wait === false ? undefined : done;
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
      return s.wait === false ? undefined : done;
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
      return s.wait === false ? undefined : done;
    },
    /** { move: "prop", to: [x, y] | by: [dx, dy], ms, ease, wait: false } @param {Record<string, any>} s */
    move: (s) => {
      const at = Cutaway.scene.propAt(String(s.move)), [x, y] = s.to ? xy(s.to) : (([dx, dy]) => [at.x + dx, at.y + dy])(xy(s.by ?? [0, 0]));
      const done = Cutaway.scene.moveProp(String(s.move), [x, y], { ms: s.ms, ease: s.ease });
      return s.wait === false ? undefined : done;
    },
    /** { play: "prop", anim: "name", loop: true, wait: false } plays its animation from the start (once: then holds the
     * last frame; the script waits until it has played through) @param {Record<string, any>} s */
    play: (s) => {
      const ms = Cutaway.scene.playProp(String(s.play), { image: s.anim, loop: !!s.loop });
      return s.wait === false ? undefined : sleep(ms);
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
    run, exec, sleep, speaks,
    /** Is a script running (the player waits)? */
    get busy() { return busy > 0; },
    /** Fast mode: lines, sounds and waits pass at once (a sequence skipping ahead). */
    get fast() { return fast; },
    /** @param {boolean} v */
    set fast(v) { fast = v; },
    /**
     * Add an action: `Cutaway.script.action("organ", async (step, ctx) => { ... })`.
     * @param {string} name
     * @param {(step: Record<string, any>, ctx: ScriptContext) => (void | Promise<void>)} fn
     */
    action(name, fn) { actions.set(name, fn); },
    /** Names of every known action (the validator uses this). */
    names() { return [...actions.keys(), "if", "once"]; },
  };
})();
