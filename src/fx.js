// Cutaway.js effects: the small life of a room, and screen fades.
// Room effects are data (`fx: [...]` in a room). Every particle is a pure function of the scene's
// time and its index, so effects need no updating, look the same in every screenshot of the same
// moment, and survive saving and loading. Particles are whole pixels.
//   { kind: "haze", poly: [...], color: "#fff4dc", alpha: 0.16, fade: 0.3 }      a light beam (screen blend)
//   { kind: "dust", poly: [...] | rect: [x, y, w, h], count: 18, color }      motes drifting in a beam
//   { kind: "rain", rect: [x, y, w, h], count: 40, color, speed: 160, slant: 0.25, length: 4 }
//   { kind: "drip", at: [x, y], to: y2, every: 1600, color }                   a drop falls and splashes
//   { kind: "sparkle", points: [[x, y], ...], every: 2400, color }             glints on coins, water, glass
//   { kind: "steam", at: [x, y], count: 6, rise: 18, color }                   rising wisps (kettle, breath)
// Any effect may have `if: cond` (shown while it holds) and `lamp: "id"` (follows that lamp's flicker
// and switches off with it). Effects draw over the lit room, under the interface.
// Screen fades: { fade: "out", ms: 400, color: "#000" } and { fade: "in" } (`wait: false` goes on meanwhile); room changes fade by
// themselves (Cutaway.fx.transition, or `transition: false` on a goto). A dissolve ({ dissolve: ms },
// or `transition: "dissolve"` on a goto) keeps the picture as it is now and lets whatever comes next
// show through it pixel by pixel, in the order of a 4x4 Bayer pattern (16 steps, no blended colours).
// A worn tape ({ tape: 1, ms: 400 }, 0 = a clean picture): the picture as a played-back video tape, its
// rows wavering and tearing, a tracking band rolling up through it, snow and drop-outs; the level fades
// like a fade does. It lies over the fade too (black tape still has noise), under the interface.
"use strict";

/**
 * @typedef {object} FxDef
 * @property {"haze" | "dust" | "rain" | "drip" | "sparkle" | "steam"} kind
 * @property {string} [id]           names it for geometry files (else its index)
 * @property {number[]} [poly]       area, flat [x0, y0, x1, y1, ...]
 * @property {[number, number, number, number]} [rect]  area: x, y, w, h
 * @property {[number, number]} [at]
 * @property {[number, number][]} [points]
 * @property {number} [to]           drip: the y where it lands
 * @property {number} [count]
 * @property {string} [color]
 * @property {number} [alpha]        haze: opacity at the top (style guide: 0.12-0.22)
 * @property {number} [fade]         haze: opacity at the bottom, as a share of `alpha`
 * @property {number} [speed]        rain: pixels per second; dust: drift
 * @property {number} [slant]        rain: x per y
 * @property {number} [length]       rain: streak length
 * @property {number} [every]        drip, sparkle: ms between events
 * @property {number} [rise]         steam: how high the wisps rise
 * @property {string} [lamp]         follow this lamp's flicker and on/off state
 * @property {Cond} [if]
 */

Cutaway.fx = (function () {
  /** @type {{from: number, to: number, start: number, ms: number, color: string}} */
  let fadeState = { from: 0, to: 0, start: 0, ms: 0, color: "#000" };
  let active = false;
  const transitionMs = { out: 220, in: 260 };
  // the order in which a dissolve lets the new picture through, per pixel of each 4x4 block
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  /** @type {{old: HTMLCanvasElement, temp: HTMLCanvasElement, start: number, ms: number} | null} */
  let dissolving = null;
  /** @type {CanvasPattern[]} the masks of the 16 steps (what is still old), made once */
  const masks = [];
  /** @type {{from: number, to: number, start: number, ms: number}} */
  let tapeState = { from: 0, to: 0, start: 0, ms: 0 };
  /** @type {HTMLCanvasElement | null} the frame as it was, rows are copied back from it shifted */
  let tapeCopy = null;

  /** A repeatable random number in 0..1 for (a, b). @param {number} a @param {number} b */
  function rand(a, b) {
    let h = Math.imul(a + 0x632be5ab, 0x9e3779b1) ^ Math.imul(b + 0x1b873593, 0x85ebca6b);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  /** @param {string} c @param {number} a */
  function rgba(c, a) {
    const [r, g, b] = Cutaway.light.rgb(c);
    return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${Cutaway.util.clamp(a, 0, 1).toFixed(3)})`;
  }

  /** The area of an effect as a polygon and its bounding box. @param {FxDef} f */
  function area(f) {
    let poly = f.poly ? Cutaway.util.points(f.poly) : null;
    if (!poly && f.rect) { const [x, y, w, h] = f.rect; poly = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]; }
    if (!poly) return null;
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { poly, x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }

  /** How strongly an effect shows: 0 = off; follows its lamp's flicker. @param {FxDef} f @param {number} t */
  function strength(f, t) {
    if (!Cutaway.state.test(f.if)) return 0;
    if (!f.lamp) return 1;
    const lamps = Cutaway.light.room?.lamps ?? [], i = lamps.findIndex((l) => l.id === f.lamp);
    if (i < 0) return 1;
    const l = lamps[i];
    return Cutaway.state.test(l.if) ? Cutaway.light.flicker(l, i, t) : 0;
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {string} color @param {number} a */
  function dot(ctx, x, y, color, a) {
    if (a <= 0.02) return;
    ctx.fillStyle = rgba(color, a);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  /** @type {Record<string, (ctx: CanvasRenderingContext2D, f: FxDef, t: number, k: number, seed: number) => void>} */
  const kinds = {
    haze(ctx, f, t, k) {
      const ar = area(f);
      if (!ar) return;
      const a = (f.alpha ?? 0.16) * k * (1 + 0.04 * Math.sin(t / 900)), color = f.color ?? "#ffffff";
      const g = ctx.createLinearGradient(0, ar.y, 0, ar.y + ar.h);
      g.addColorStop(0, rgba(color, a));
      g.addColorStop(1, rgba(color, a * (f.fade ?? 0.3)));
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = g;
      ctx.beginPath();
      ar.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    dust(ctx, f, t, k, seed) {
      const ar = area(f);
      if (!ar) return;
      const n = f.count ?? 16, color = f.color ?? "#fff8e0", v = (f.speed ?? 3) / 1000;
      for (let i = 0; i < n; i++) {
        const r1 = rand(seed, i), r2 = rand(seed, i + 977), r3 = rand(seed, i + 1931);
        // slow fall with a lazy sideways sway; wraps inside the area's box
        const y = ar.y + ((r2 * ar.h + t * v * (0.5 + r3)) % ar.h);
        const x = ar.x + r1 * ar.w + Math.sin(t / (1400 + r3 * 900) + r1 * 6.3) * 3;
        if (!Cutaway.walk.inPoly({ x: x + 0.5, y: y + 0.5 }, ar.poly)) continue;
        const tw = 0.5 + 0.5 * Math.sin(t / (500 + r2 * 700) + r3 * 6.3);       // twinkle as it turns
        dot(ctx, x, y, color, k * (0.25 + 0.6 * tw));
      }
    },
    rain(ctx, f, t, k, seed) {
      const ar = area(f);
      if (!ar) return;
      const n = f.count ?? 40, color = f.color ?? "#cfe0ff", v = (f.speed ?? 160) / 1000, s = f.slant ?? 0.25, len = f.length ?? 4;
      ctx.fillStyle = rgba(color, 0.7 * k);
      for (let i = 0; i < n; i++) {
        const r1 = rand(seed, i), r2 = rand(seed, i + 501), sp = v * (0.8 + 0.4 * rand(seed, i + 1013));
        const y = ar.y + ((r2 * (ar.h + len) + t * sp) % (ar.h + len)) - len;
        const x = ar.x + ((r1 * ar.w - (y - ar.y) * s) % ar.w + ar.w) % ar.w;
        for (let j = 0; j < len; j++) {
          const py = Math.round(y + j), px = Math.round(x - j * s);
          if (py >= ar.y && py < ar.y + ar.h && Cutaway.walk.inPoly({ x: px + 0.5, y: py + 0.5 }, ar.poly)) ctx.fillRect(px, py, 1, 1);
        }
      }
    },
    drip(ctx, f, t, k, seed) {
      if (!f.at) return;
      const every = f.every ?? 1600, n = Math.floor(t / every), local = t - n * every, color = f.color ?? "#a8d8ff";
      const [x, y0] = f.at, y1 = f.to ?? y0 + 20, fall = Math.sqrt(2 * (y1 - y0) / 0.0004);   // g = 0.0004 px/ms²
      const hang = every * 0.5 * rand(seed, n);
      if (local < hang) { dot(ctx, x, y0, color, k * Math.min(1, local / hang)); return; }      // the drop swells
      const tt = local - hang;
      if (tt < fall) { dot(ctx, x, y0 + 0.0002 * tt * tt, color, k); return; }
      const sp = tt - fall;
      if (sp < 200) { dot(ctx, x - 1 - Math.floor(sp / 100), y1 - 1, color, k * 0.8); dot(ctx, x + 1 + Math.floor(sp / 100), y1 - 1, color, k * 0.8); }
    },
    sparkle(ctx, f, t, k, seed) {
      const every = f.every ?? 2400, color = f.color ?? "#ffffff";
      (f.points ?? []).forEach(([x, y], i) => {
        const off = rand(seed, i) * every, n = Math.floor((t + off) / every), local = t + off - n * every;
        if (rand(seed + n, i) < 0.35) return;                                   // not every cycle
        const ph = Math.floor(local / 100);                                     // 100 ms frames: dot, plus, dot
        if (ph > 2) return;
        dot(ctx, x, y, color, k);
        if (ph === 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(ctx, x + dx, y + dy, color, 0.7 * k);
      });
    },
    steam(ctx, f, t, k, seed) {
      if (!f.at) return;
      const n = f.count ?? 6, rise = f.rise ?? 18, color = f.color ?? "#ffffff", life = 2200;
      for (let i = 0; i < n; i++) {
        const off = rand(seed, i) * life, p = ((t + off) % life) / life;
        const x = f.at[0] + Math.sin(p * 5 + i * 1.7) * 2 * p + (rand(seed, i + 77) - 0.5) * 3;
        dot(ctx, x, f.at[1] - p * rise, color, k * 0.6 * (1 - p) * Math.min(1, p * 6));
      }
    },
  };

  /**
   * Draw the current room's effects (world space; the scene calls this inside its camera).
   * @param {CanvasRenderingContext2D} ctx
   */
  function render(ctx) {
    const list = /** @type {FxDef[]} */ (/** @type {any} */ (Cutaway.scene.room)?.fx ?? []);
    const t = Cutaway.scene.time;
    list.forEach((f, i) => {
      const k = strength(f, t), draw = kinds[f.kind];
      if (k > 0 && draw) draw(ctx, f, t, k, i * 7919 + 17);
    });
  }

  /** Current fade level (0 = clear, 1 = fully covered). */
  function level() {
    const f = fadeState, p = f.ms > 0 ? Cutaway.util.clamp((Cutaway.clock.time - f.start) / f.ms, 0, 1) : 1;
    return f.from + (f.to - f.from) * p;
  }

  /**
   * Fade the screen (not the interface) to a level: 1 = covered, 0 = clear. Resolves when done.
   * @param {number} to
   * @param {number} [ms]
   * @param {string} [color]
   */
  function fade(to, ms = 400, color) {
    fadeState = { from: level(), to, start: Cutaway.clock.time, ms, color: color ?? fadeState.color };
    if (!active || ms <= 0) { fadeState.ms = 0; fadeState.from = to; return Promise.resolve(); }
    return Cutaway.clock.wait(ms);
  }

  /**
   * Is a pixel still the old picture at a dissolve's step (0..16)? Step 0 keeps all of it, 16 none.
   * @param {number} x @param {number} y @param {number} step
   */
  function dissolveKeeps(x, y, step) { return BAYER[y & 3][x & 3] >= step; }

  /**
   * Begin a dissolve: the room as it is now stays on the screen and gives way, pixel by pixel, to
   * whatever is drawn from now on (a new room, a camera cut). Resolves after `ms`.
   * @param {number} [ms]
   */
  function dissolve(ms = 800) {
    if (!active || ms <= 0 || !Cutaway.scene.room) return Promise.resolve();
    const W = Cutaway.display.width, H = Cutaway.display.height;
    /** @param {number} w @param {number} h */
    const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
    const old = dissolving?.old.width === W && dissolving.old.height === H ? dissolving.old : canvas(W, H);
    const temp = dissolving?.temp.width === W && dissolving.temp.height === H ? dissolving.temp : canvas(W, H);
    const g = /** @type {CanvasRenderingContext2D} */ (old.getContext("2d"));
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    Cutaway.scene.render(g);
    dissolving = { old, temp, start: Cutaway.clock.time, ms };
    return Cutaway.clock.wait(ms);
  }

  /** The mask of a step as a repeating pattern: opaque where the old picture stays. @param {CanvasRenderingContext2D} ctx @param {number} step */
  function mask(ctx, step) {
    if (!masks[step]) {
      const c = document.createElement("canvas");
      c.width = 4; c.height = 4;
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
      g.fillStyle = "#fff";
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (dissolveKeeps(x, y, step)) g.fillRect(x, y, 1, 1);
      masks[step] = /** @type {CanvasPattern} */ (ctx.createPattern(c, "repeat"));
    }
    return masks[step];
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function renderDissolve(ctx) {
    const d = dissolving;
    if (!d) return;
    const step = Math.floor(((Cutaway.clock.time - d.start) / d.ms) * 16);
    if (step >= 16) { dissolving = null; return; }
    const W = Cutaway.display.width, H = Cutaway.display.height, g = /** @type {CanvasRenderingContext2D} */ (d.temp.getContext("2d"));
    g.globalCompositeOperation = "copy";
    g.drawImage(d.old, 0, 0);
    g.globalCompositeOperation = "destination-in";
    g.fillStyle = mask(g, Math.max(0, step));
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
    ctx.drawImage(d.temp, 0, 0);
  }

  /** How worn the tape looks now (0 = clean). */
  function tapeLevel() {
    const f = tapeState, p = f.ms > 0 ? Cutaway.util.clamp((Cutaway.clock.time - f.start) / f.ms, 0, 1) : 1;
    return f.from + (f.to - f.from) * p;
  }

  /**
   * Let the picture look like a worn video tape (0 = clean, 1 = barely holding). Resolves when the
   * level is reached.
   * @param {number} to @param {number} [ms]
   */
  function tape(to, ms = 0) {
    tapeState = { from: tapeLevel(), to: Cutaway.util.clamp(to, 0, 1), start: Cutaway.clock.time, ms };
    if (!active || ms <= 0) { tapeState.ms = 0; tapeState.from = tapeState.to; return Promise.resolve(); }
    return Cutaway.clock.wait(ms);
  }

  /**
   * The tape's faults, a pure function of the clock (25 noise frames a second): rows that waver and
   * tear, the tracking band rolling up, snow, drop-outs, now and then a hop of the whole picture.
   * @param {CanvasRenderingContext2D} ctx
   */
  function renderTape(ctx) {
    const k = tapeLevel();
    if (k <= 0.001) return;
    const W = Cutaway.display.width, H = Cutaway.display.height, t = Cutaway.clock.time, n = Math.floor(t / 40);
    if (!tapeCopy || tapeCopy.width !== W || tapeCopy.height !== H) { tapeCopy = document.createElement("canvas"); tapeCopy.width = W; tapeCopy.height = H; }
    const g = /** @type {CanvasRenderingContext2D} */ (tapeCopy.getContext("2d"));
    g.globalCompositeOperation = "copy";
    g.drawImage(ctx.canvas, 0, 0);
    g.globalCompositeOperation = "source-over";
    const band = H + 30 - ((t * 0.05) % (H + 60)), bandH = 5 + 9 * k;           // the tracking band, rolling up
    const hop = rand(n, 7) < k * k * 0.12 ? 1 + Math.floor(rand(n, 8) * 2 * k) : 0;
    const tear = rand(n, 9) < k * 0.5 ? { y: Math.floor(rand(n, 10) * H), h: 1 + Math.floor(rand(n, 11) * 4), dx: Math.round((rand(n, 12) - 0.5) * 24 * k) } : null;
    /** @param {number} y */
    const shift = (y) => {
      let dx = Math.round(k * 1.6 * Math.sin(y / 11 + t / 190) * (0.4 + rand(n >> 2, y >> 3)));
      if (Math.abs(y - band) < bandH) dx += Math.round(k * (4 + 9 * rand(n, y)));
      if (tear && y >= tear.y && y < tear.y + tear.h) dx += tear.dx;
      return dx;
    };
    ctx.fillStyle = "#000";
    for (let y = 0; y < H;) {                                // rows with the same shift go together
      const dx = shift(y);
      let y2 = y + 1;
      while (y2 < H && shift(y2) === dx) y2++;
      const sy = Math.max(0, y - hop);
      if (dx || hop) {
        ctx.fillRect(0, y, W, y2 - y);
        ctx.drawImage(tapeCopy, 0, sy, W, y2 - y, dx, y, W, y2 - y);
      }
      y = y2;
    }
    // the band's own noise: grey streaks, brighter in its middle
    for (let y = Math.max(0, Math.floor(band - bandH)); y < Math.min(H, band + bandH); y++) {
      const near = 1 - Math.abs(y - band) / bandH;
      for (let i = 0; i < 3 + 10 * k * near; i++) {
        const x = Math.floor(rand(n * 131 + y, i) * W), w = 1 + Math.floor(rand(y, n + i) * 12);
        ctx.fillStyle = `rgba(230, 232, 255, ${(0.25 + 0.55 * near * k).toFixed(3)})`;
        ctx.fillRect(x, y, w, 1);
      }
    }
    // snow and drop-outs over the whole picture
    const snow = Math.floor(k * k * 900 + k * 60);
    for (let i = 0; i < snow; i++) {
      const x = Math.floor(rand(n, i * 2) * W), y = Math.floor(rand(n, i * 2 + 1) * H), v = rand(i, n);
      ctx.fillStyle = v < 0.5 ? `rgba(255, 255, 255, ${(0.35 + 0.5 * k).toFixed(3)})` : `rgba(10, 10, 20, ${(0.3 + 0.4 * k).toFixed(3)})`;
      ctx.fillRect(x, y, v > 0.93 ? 2 + Math.floor(v * 6) : 1, 1);
    }
    if (k > 0.5) {                                           // a worn tape loses its colour a little
      ctx.fillStyle = `rgba(150, 160, 210, ${((k - 0.5) * 0.24).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** The screen pass over the room: a dissolve's old picture, the fade, then a worn tape's faults. @param {CanvasRenderingContext2D} ctx */
  function renderFade(ctx) {
    renderDissolve(ctx);
    const a = level();
    if (a > 0) {
      ctx.fillStyle = rgba(fadeState.color, a);
      ctx.fillRect(0, 0, Cutaway.display.width, Cutaway.display.height);
    }
    renderTape(ctx);
  }

  return {
    render, renderFade, fade, level, kinds, rand, dissolve, dissolveKeeps, tape, tapeLevel,
    /** Is a dissolve showing? */
    get dissolving() { return !!dissolving; },
    /** End a dissolve at once (a skipped cutscene). */
    stopDissolve() { dissolving = null; },
    /** A clean picture again at once (a sequence's end). */
    stopTape() { tapeState = { from: 0, to: 0, start: 0, ms: 0 }; },
    /** Is the screen on (fades and transitions run)? Off in the Node tools. */
    get active() { return active; },
    /**
     * Fade out before a room change ("out") or back in after it ("in").
     * @param {"out" | "in"} dir
     */
    transition(dir) {
      if (!active) return Promise.resolve();
      return dir === "out" ? fade(1, transitionMs.out) : fade(0, transitionMs.in);
    },
    /** Lengths of the room-change fades in ms (0 = cut). @param {{out?: number, in?: number}} o */
    setTransition(o) { Object.assign(transitionMs, o); },
    init() {
      active = true;
      Cutaway.script.action("fade", (s) => {
        const v = s.fade, to = v === "in" ? 0 : v === "out" ? 1 : Number(v);
        const done = fade(Number.isFinite(to) ? to : 1, Cutaway.script.fast ? 0 : s.ms ?? 400, s.color);
        return s.wait === false ? undefined : done;
      });
      Cutaway.script.action("tape", (s) => {
        const done = tape(Number(s.tape) || 0, Cutaway.script.fast ? 0 : Number(s.ms) || 0);
        return s.wait === false ? undefined : done;
      });
    },
  };
})();
