// Cutaway.js scripts: lists of declarative actions, run one after another.
//   ["Hallo!", { walk: [120, 150] }, { if: "!has:key", then: [{ take: "key" }], else: ["Hab ich schon."] }]
// A plain string is a line for the active actor. Each object names one action by its key; the other
// keys are its arguments. Games and plug-ins add actions with Cutaway.script.action(name, fn).
// While a script runs the player can't start another one (clicks skip the current line instead).
"use strict";

/**
 * @typedef {string | Record<string, any>} Step
 * @typedef {Step | Step[] | undefined} Script
 * @typedef {object} ScriptContext
 * @property {string} path        stable id of this step in the game data (used by `once`)
 * @property {string} [hotspot]   the hotspot that started the script
 * @property {string} [item]      the item used on it
 */

Cutaway.script = (function () {
  /** @type {Map<string, (step: Record<string, any>, ctx: ScriptContext) => (void | Promise<void>)>} */
  const actions = new Map();
  let busy = 0;

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
    for (let i = 0; i < list.length; i++) await step(list[i], { ...ctx, path: `${ctx.path}.${i}` });
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
    return Cutaway.ui.say(actorOf(who), Cutaway.i18n.t(text), { id: s.id ?? ctx.path });
  }

  /** @param {any} v @returns {[number, number]} */
  function xy(v) {
    if (!Array.isArray(v) || v.length !== 2) throw new Error("Cutaway: expected [x, y], got " + JSON.stringify(v));
    return [v[0], v[1]];
  }

  /** { walk: [x, y] } or { walk: "actor", to: [x, y], face, run: true, wait: false } (false: the script goes on meanwhile) @param {Record<string, any>} s */
  function walk(s) {
    const [who, to] = Array.isArray(s.walk) ? [undefined, s.walk] : [s.walk, s.to];
    const a = actorOf(who), [x, y] = xy(to);
    const done = a.walkTo(x, y, !!s.run).then(() => { if (s.face) a.face(s.face); });
    return s.wait === false ? undefined : done;
  }

  const builtins = {
    say,
    /** @param {Record<string, any>} s */
    narrate: (s) => Cutaway.ui.narrate(Cutaway.i18n.t(s.narrate)),
    walk,
    /** { face: "left" } or { face: "actor", to: "left" } @param {Record<string, any>} s */
    face: (s) => { "to" in s ? actorOf(s.face).face(s.to) : actorOf().face(s.face); },
    /** { anim: "actor:costumeKey" } or { anim: "costumeKey" } plays it once @param {Record<string, any>} s */
    anim: (s) => {
      const [who, k] = String(s.anim).includes(":") ? String(s.anim).split(":") : [undefined, String(s.anim)];
      return actorOf(who).playOnce(k);
    },
    /** @param {Record<string, any>} s */
    wait: (s) => Cutaway.clock.wait(Number(s.wait) || 0),
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
    /** { goto: "room", at: [x, y], face, transition: false } moves the active actor there @param {Record<string, any>} s */
    goto: (s) => Cutaway.scene.go(s.goto, s.at ? xy(s.at) : undefined, s.face, { transition: s.transition, follow: s.follow }),
    /** { place: "actor", room, at, face } (room: null takes the actor out of every room) @param {Record<string, any>} s */
    place: (s) => {
      const a = actorOf(s.place), [x, y] = s.at ? xy(s.at) : [a.x, a.y];
      a.place(s.room === null ? null : s.room ?? a.room, x, y, s.face);
    },
    // Sound and screen: the music and effects systems listen to these events.
    /** @param {Record<string, any>} s */
    music: (s) => Cutaway.events.emit("music", s.music),
    /** @param {Record<string, any>} s */
    stinger: (s) => Cutaway.events.emit("stinger", s.stinger),
    /** { sfx: "thump", at: [x, y], gain } @param {Record<string, any>} s */
    sfx: (s) => Cutaway.events.emit("sfx", { sfx: s.sfx, at: s.at, gain: s.gain }),
    /** @param {Record<string, any>} s */
    fade: (s) => Cutaway.events.emit("fade", s.fade),
    /** @param {Record<string, any>} s */
    shake: (s) => Cutaway.events.emit("shake", s.shake),
  };
  for (const [k, fn] of Object.entries(builtins)) actions.set(k, fn);

  return {
    run, exec,
    /** Is a script running (the player waits)? */
    get busy() { return busy > 0; },
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
