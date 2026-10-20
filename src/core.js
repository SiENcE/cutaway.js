// Cutaway.js core: the namespace, events, the fixed-step clock, easing and tweens.
// Every engine file is a classic script that adds one module to the global `Cutaway`
// (`Cutaway.x = (function () { ... })();`), so the engine runs from file:// without a build.
// MIT licence, see LICENSE.
"use strict";

/** The engine's one global namespace. Each src/ file adds a module to it. */
var Cutaway = {};
Cutaway.version = "0.1.0";
/** Where the engine's files are (from core.js's own script tag), so tools like the editor load on demand. */
Cutaway.base = (function () {
  const s = typeof document !== "undefined" ? /** @type {HTMLScriptElement | null} */ (document.currentScript) : null;
  return s && s.src ? s.src.replace(/[^/]*$/, "") : "";
})();

/** A tiny event hub. Modules announce what happened; games and other modules listen. */
Cutaway.events = (function () {
  /** @type {Map<string, Set<(data: any) => void>>} */
  const handlers = new Map();

  /**
   * Listen to an event. Returns a function that removes the listener again.
   * @param {string} type
   * @param {(data: any) => void} fn
   * @returns {() => void}
   */
  function on(type, fn) {
    let set = handlers.get(type);
    if (!set) handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => off(type, fn);
  }

  /**
   * @param {string} type
   * @param {(data: any) => void} fn
   */
  function off(type, fn) {
    const set = handlers.get(type);
    if (set) set.delete(fn);
  }

  /**
   * @param {string} type
   * @param {any} [data]
   */
  function emit(type, data) {
    const set = handlers.get(type);
    if (set) for (const fn of [...set]) fn(data);
  }

  return { on, off, emit };
})();

/**
 * The clock: game logic runs in fixed steps of 1/60 s, drawing runs once per animation frame.
 * Time is in milliseconds. A manual clock (`setManual(true)`) only moves on `advance(ms)`, which
 * makes tests, headless checks and trailer captures repeatable. Two things stop real time: `paused`
 * belongs to the menus, `held` to the editor (each sets and clears its own, so neither releases the
 * other's); drawing goes on, and `advance` still steps.
 */
Cutaway.clock = (function () {
  const STEP = 1000 / 60;
  const MAX_CATCH_UP = 250;                       // after a stall, skip ahead instead of racing
  let time = 0, acc = 0, last = -1, running = false, manual = false, paused = false, held = false, raf = 0;
  /** @type {((dt: number) => void)[]} */
  const updaters = [];
  /** @type {(() => void)[]} */
  const renderers = [];
  /** @type {{at: number, done: () => void}[]} */
  let timers = [];

  function tick() {
    for (const fn of updaters) fn(STEP);
    time += STEP;
    if (timers.length) {
      const due = timers.filter((t) => t.at <= time);
      timers = timers.filter((t) => t.at > time);
      for (const t of due) t.done();
    }
  }

  function render() {
    for (const fn of renderers) fn();
  }

  /** @param {number} now */
  function frame(now) {
    if (!running || manual) return;
    raf = requestAnimationFrame(frame);
    if (last < 0) last = now;
    acc += Math.min(MAX_CATCH_UP, now - last);
    last = now;
    if (paused || held) acc = 0;
    while (acc >= STEP) { tick(); acc -= STEP; }
    render();
  }

  return {
    STEP,
    /** Game time in ms (only advances while the game runs). */
    get time() { return time; },
    get paused() { return paused; },
    /** @param {boolean} p */
    set paused(p) { paused = p; },
    /** The editor holds the game (its own switch beside the menus' `paused`). */
    get held() { return held; },
    /** @param {boolean} h */
    set held(h) { held = h; },
    /** Run `fn(dt)` on every logic step. @param {(dt: number) => void} fn */
    onUpdate(fn) { updaters.push(fn); },
    /** Run `fn()` once per drawn frame. @param {() => void} fn */
    onRender(fn) { renderers.push(fn); },
    start() {
      if (running) return;
      running = true; last = -1;
      if (!manual) raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    /**
     * Switch between the real-time clock and a manual one that only moves on `advance`.
     * @param {boolean} on
     */
    setManual(on) {
      manual = on;
      if (!on && running) { last = -1; raf = requestAnimationFrame(frame); }
    },
    /**
     * Resolves after `ms` of game time (stands still while paused, held or in a manual clock).
     * @param {number} ms
     * @returns {Promise<void>}
     */
    wait(ms) { return new Promise((done) => timers.push({ at: time + ms, done })); },
    /**
     * Advance the clock by `ms` (in whole logic steps) and draw once: a manual clock, or a held one
     * stepped by hand (the editor's Step).
     * @param {number} ms
     */
    advance(ms) {
      const steps = Math.round(ms / STEP);
      for (let i = 0; i < steps; i++) tick();
      render();
    },
  };
})();

/** Small shared helpers. */
Cutaway.util = (function () {
  return {
    /** @param {number} v @param {number} lo @param {number} hi */
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    /**
     * Turn a flat coordinate list [x0, y0, x1, y1, ...] into points.
     * @param {number[]} flat
     * @returns {{x: number, y: number}[]}
     */
    points(flat) {
      const out = [];
      for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
      return out;
    },
    /**
     * An easing curve by name: "linear", "in" (slow start), "out" (slow end), "inOut" (both, the default).
     * Maps 0..1 to 0..1 (sine curves: soft like a camera operator's hand).
     * @param {string} [name]
     * @returns {(t: number) => number}
     */
    ease(name = "inOut") {
      if (name === "linear") return (t) => t;
      if (name === "in") return (t) => 1 - Math.cos((t * Math.PI) / 2);
      if (name === "out") return (t) => Math.sin((t * Math.PI) / 2);
      return (t) => (1 - Math.cos(t * Math.PI)) / 2;
    },
  };
})();

/**
 * Tweens: a value that goes from 0 to 1 over some ms of game time (the camera, a prop, the letterbox),
 * stepped with the logic clock. `to` resolves when it arrives (or is stopped or finished early).
 * A key names it: a new tween with the same key replaces the old one. `instant` (the Node tools, a
 * skipped cutscene) makes every tween arrive at once.
 */
Cutaway.tween = (function () {
  /** @typedef {{key: string, start: number, ms: number, ease: (t: number) => number, step: (k: number) => void, done: () => void}} Tween */
  /** @type {Tween[]} */
  let list = [];
  let instant = false;

  /** @param {Tween} t */
  function end(t) { list = list.filter((q) => q !== t); t.done(); }

  /**
   * Run a tween: `step(k)` gets the eased progress 0..1 on every logic step, last with 1.
   * @param {{key?: string, ms?: number, ease?: string, step: (k: number) => void}} o
   * @returns {Promise<void>}
   */
  function to(o) {
    if (o.key) stop(o.key);
    return new Promise((done) => {
      const ms = Number(o.ms) || 0;
      if (instant || ms <= 0) { o.step(1); done(); return; }
      list.push({ key: o.key ?? "", start: Cutaway.clock.time, ms, ease: Cutaway.util.ease(o.ease), step: o.step, done });
    });
  }

  /** Stop tweens where they are (all, or the one with this key); their promises resolve. @param {string} [key] */
  function stop(key) { for (const t of list.slice()) if (key === undefined || t.key === key) end(t); }

  /** Let tweens arrive now (all, or the one with this key). @param {string} [key] */
  function finish(key) { for (const t of list.slice()) if (key === undefined || t.key === key) { t.step(1); end(t); } }

  Cutaway.clock.onUpdate(() => {
    const now = Cutaway.clock.time;
    for (const t of list.slice()) {
      const p = Math.min(1, Math.max(0, (now - t.start) / t.ms));
      t.step(p >= 1 ? 1 : t.ease(p));
      if (p >= 1) end(t);
    }
  });

  return {
    to, stop, finish,
    /** How many tweens are running. */
    get count() { return list.length; },
    /** Is a tween with this key running? @param {string} key */
    has(key) { return list.some((t) => t.key === key); },
    get instant() { return instant; },
    /** Every tween arrives at once (tools, skipped cutscenes). @param {boolean} v */
    set instant(v) { instant = v; if (v) finish(); },
  };
})();
