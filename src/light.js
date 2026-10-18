// Cutaway.js light at runtime: the "bit of modern lighting" on top of flat, pre-lit room art.
// Room backgrounds come with their light baked in (e.g. by pxl's lighting pass). At runtime the engine
// adds only what moves or changes:
//   - actors are tinted by the room's light field where they stand (ambient plus lamps), so a kid
//     walking under the bulb turns warm and bright, and dims in the corners like the room does;
//   - flickering lamps make the whole room breathe with them (a ratio over the baked light);
//   - lamps that aren't in the art (`add: true`: police lights, a plasma ball, a torch someone carries)
//     add their light pool and an optional glow.
//   light: { ambient: 0.8, color: "#eceaf6", lamps: [
//     { id: "bulb", at: [104, 54], r: 96, power: 1.15, color: "#fff0d2", flicker: 0.06 },
//     { id: "plasma", at: [258, 70], r: 30, power: 0.9, color: "#ff7ae0", flicker: 0.3, add: true, glow: 10 } ] }
// The light model is the one pxl bakes with: each lamp gives `power - distance / r` (eased), the lamps
// and the ambient combine by the brightest per colour channel, and a pixel is its colour times its light.
// Lamps switch with a condition (`if: "lamp_on"`). The UI is never lit.
"use strict";

/**
 * @typedef {object} LampDef
 * @property {string} [id]
 * @property {[number, number]} at      the light source (room pixels)
 * @property {number} r                 reach: the light falls by 1 per r pixels
 * @property {number} [power]           brightness at the source (1 = the surface's own colour; > 1 overexposes)
 * @property {string} [color]
 * @property {number} [flicker]         0..1: how far the power swings (0.1 = ±10 %)
 * @property {number} [rate]            flicker steps per second (default 10: the 100 ms animation grid)
 * @property {boolean} [add]            not baked into the art: its light pool is added at runtime
 * @property {number | {r: number, strength?: number}} [glow]  a soft halo at the source (runtime)
 * @property {Cond} [if]                the lamp is on while this holds
 */
/**
 * @typedef {object} LightDef
 * @property {number} [ambient]   light away from every lamp (default 1: actors keep their own colours)
 * @property {string} [color]     colour of the ambient light (near white)
 * @property {LampDef[]} [lamps]
 * @property {number} [max]       brightest tint on actors (default 1.25)
 */

Cutaway.light = (function () {
  const CELL = 2;
  /** the player's setting: lamps burn steady (no flicker) */
  let calm = false;
  /** @type {Map<string, [number, number, number]>} */
  const rgbCache = new Map();
  /** @type {{w: number, h: number, dark: HTMLCanvasElement, bright: HTMLCanvasElement, copy: HTMLCanvasElement, tint: HTMLCanvasElement, over: HTMLCanvasElement, key: string, any: boolean} | null} */
  let buf = null;

  /** "#rrggbb" or "#rgb" -> [0..1, 0..1, 0..1] @param {string} [c] @returns {[number, number, number]} */
  function rgb(c = "#ffffff") {
    let v = rgbCache.get(c);
    if (v) return v;
    const t = c.trim().replace(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3");
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(t);
    if (!m) throw new Error(`Cutaway: colour "${c}" is not #rrggbb or #rgb`);
    v = [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
    rgbCache.set(c, v);
    return v;
  }

  /** Repeatable noise in -1..1 for a lamp at step n. @param {number} n @param {number} seed */
  function noise(n, seed) {
    let h = Math.imul((n | 0) ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return ((h >>> 0) / 4294967296) * 2 - 1;
  }

  /** The current room's light, if any. @returns {LightDef | null} */
  function def() { return /** @type {any} */ (Cutaway.scene.room)?.light ?? null; }

  /** @param {LampDef} l */
  function isOn(l) { return Cutaway.state.test(l.if); }

  /**
   * A lamp's flicker factor at a time (1 = steady). Steps on the animation grid, so it reads like
   * frame-by-frame pixel art rather than a smooth wobble.
   * @param {LampDef} l @param {number} i lamp index (seeds the noise) @param {number} t ms
   */
  function flicker(l, i, t) {
    if (!l.flicker || calm) return 1;
    const n = Math.floor(t * (l.rate ?? 10) / 1000);
    // mostly small wobbles with the odd deeper dip, like a real bulb or flame
    const a = noise(n, i + 1), b = noise(n >> 2, i + 101);
    return 1 + l.flicker * (0.7 * a + 0.3 * b);
  }

  /**
   * Light at a room point: [r, g, b], 1 = the surface's own colour.
   * @param {number} x @param {number} y
   * @param {{t?: number, base?: boolean}} [o]  t = time for the flicker; base = the baked light only
   *   (no flicker, no added lamps)
   * @returns {[number, number, number]}
   */
  function sample(x, y, o = {}) {
    const d = def();
    if (!d) return [1, 1, 1];
    const amb = d.ambient ?? 1, ac = rgb(d.color);
    const L = /** @type {[number, number, number]} */ ([amb * ac[0], amb * ac[1], amb * ac[2]]);
    (d.lamps ?? []).forEach((l, i) => {
      if (!isOn(l) || (o.base && l.add)) return;
      const p = (l.power ?? 1) * (o.base ? 1 : flicker(l, i, o.t ?? Cutaway.scene.time));
      const f = p - Math.hypot(x - l.at[0], y - l.at[1]) / l.r;
      if (f <= 0) return;
      const v = f >= 1 ? f : 1 - (1 - f) ** 2, c = rgb(l.color);
      for (let k = 0; k < 3; k++) if (v * c[k] > L[k]) L[k] = v * c[k];
    });
    return L;
  }

  /** Does the light change over time or add anything to the art? */
  function dynamic() {
    const d = def();
    return !!d && (d.lamps ?? []).some((l) => isOn(l) && (l.flicker || l.add || l.glow));
  }

  /** @param {number} w @param {number} h */
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  /** @param {HTMLCanvasElement} c */
  function ctx2d(c) { return /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")); }

  function buffers() {
    const W = Cutaway.display.width, H = Cutaway.display.height, w = Math.ceil(W / CELL) + 1, h = Math.ceil(H / CELL) + 1;
    if (!buf || buf.w !== w || buf.h !== h) {
      buf = { w, h, dark: canvas(w, h), bright: canvas(w, h), copy: canvas(W, H), tint: canvas(64, 64), over: canvas(64, 64), key: "", any: false };
    }
    return buf;
  }

  /**
   * The light pass over the drawn room (screen space): flicker as a ratio over the baked light, the
   * pools of added lamps, glows. Called by the scene after the foreground.
   * @param {CanvasRenderingContext2D} ctx
   */
  function render(ctx) {
    const d = def();
    if (!d || !dynamic()) return;
    const b = buffers(), cam = Cutaway.scene.camera, t = Cutaway.scene.time, lamps = d.lamps ?? [];
    const powers = lamps.map((l, i) => (isOn(l) ? (l.power ?? 1) * flicker(l, i, t) : 0));
    const key = `${cam.x},${cam.y},${powers.map((p) => p.toFixed(3)).join(",")}`;
    if (key !== b.key) { b.key = key; b.any = ratioMaps(d, b, cam, powers); }
    if (b.any) {
      const W = Cutaway.display.width, H = Cutaway.display.height, sw = b.w * CELL, sh = b.h * CELL;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);              // screen pixels (the copy below is untransformed)
      ctx.imageSmoothingEnabled = true;                // the light itself is soft; the art stays crisp
      // brighter: add scene x (ratio - 1), from a copy of the scene
      const cc = ctx2d(b.copy);
      cc.globalCompositeOperation = "copy";
      cc.drawImage(ctx.canvas, 0, 0);
      cc.globalCompositeOperation = "multiply";
      cc.imageSmoothingEnabled = true;
      cc.drawImage(b.bright, 0, 0, b.w, b.h, -CELL / 2, -CELL / 2, sw, sh);
      cc.globalCompositeOperation = "source-over";
      // darker: multiply by the ratio where it is below 1
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(b.dark, 0, 0, b.w, b.h, -CELL / 2, -CELL / 2, sw, sh);
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(b.copy, 0, 0, W, H, 0, 0, W, H);
      ctx.restore();
    }
    // glows: a soft halo at the source, breathing with the flicker
    lamps.forEach((l, i) => {
      if (!l.glow || !powers[i]) return;
      const g = typeof l.glow === "number" ? { r: l.glow, strength: 0.4 } : l.glow;
      const x = l.at[0] - cam.x, y = l.at[1] - cam.y, c = rgb(l.color), k = (g.strength ?? 0.4) * powers[i] / (l.power ?? 1);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, g.r);
      grad.addColorStop(0, `rgba(${c.map((v) => Math.round(v * 255)).join(",")},${Math.min(1, k).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${c.map((v) => Math.round(v * 255)).join(",")},0)`);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grad;
      ctx.fillRect(Math.floor(x - g.r), Math.floor(y - g.r), Math.ceil(g.r * 2) + 1, Math.ceil(g.r * 2) + 1);
      ctx.restore();
    });
  }

  /**
   * Fill the ratio maps (one value per CELL x CELL block of the screen): dark = min(1, now / baked),
   * bright = max(0, now / baked - 1). Returns false when nothing differs from the baked light.
   * @param {LightDef} d @param {NonNullable<typeof buf>} b @param {{x: number, y: number}} cam @param {number[]} powers
   */
  function ratioMaps(d, b, cam, powers) {
    const amb = d.ambient ?? 1, ac = rgb(d.color), lamps = d.lamps ?? [];
    const dark = ctx2d(b.dark).createImageData(b.w, b.h), bright = ctx2d(b.bright).createImageData(b.w, b.h);
    const L0 = [0, 0, 0], L1 = [0, 0, 0];
    let any = false;
    for (let cy = 0; cy < b.h; cy++) for (let cx = 0; cx < b.w; cx++) {
      const x = cam.x + cx * CELL, y = cam.y + cy * CELL;
      for (let k = 0; k < 3; k++) { L0[k] = amb * ac[k]; L1[k] = L0[k]; }
      let touched = false;
      for (let i = 0; i < lamps.length; i++) {
        const l = lamps[i];
        if (!powers[i]) continue;
        const dist = Math.hypot(x - l.at[0], y - l.at[1]) / l.r, c = rgb(l.color);
        const f1 = powers[i] - dist;
        if (f1 > 0) {
          touched = true;
          const v = f1 >= 1 ? f1 : 1 - (1 - f1) ** 2;
          for (let k = 0; k < 3; k++) if (v * c[k] > L1[k]) L1[k] = v * c[k];
        }
        if (l.add) continue;
        const f0 = (l.power ?? 1) - dist;
        if (f0 > 0) {
          const v = f0 >= 1 ? f0 : 1 - (1 - f0) ** 2;
          for (let k = 0; k < 3; k++) if (v * c[k] > L0[k]) L0[k] = v * c[k];
        }
      }
      const o = (cy * b.w + cx) * 4;
      dark.data[o + 3] = 255;
      bright.data[o + 3] = 255;
      for (let k = 0; k < 3; k++) {
        const r = touched && L0[k] > 0.001 ? L1[k] / L0[k] : 1;
        dark.data[o + k] = Math.round(Math.min(1, r) * 255);
        bright.data[o + k] = Math.round(Cutaway.util.clamp(r - 1, 0, 1) * 255);
        if (Math.abs(r - 1) > 0.004) any = true;
      }
    }
    ctx2d(b.dark).putImageData(dark, 0, 0);
    ctx2d(b.bright).putImageData(bright, 0, 0);
    return any;
  }

  /**
   * Draw an actor's sprite tinted by a light value (multiply up to 1, add the overexposure on top).
   * @param {CanvasRenderingContext2D} ctx
   * @param {(c: CanvasRenderingContext2D, x: number, y: number) => void} drawSprite  draws the sprite with its top-left at x, y
   * @param {[number, number, number, number]} box  where the sprite goes: x, y, w, h
   * @param {[number, number, number]} L
   */
  function drawTinted(ctx, drawSprite, box, L) {
    const [x, y, w, h] = box;
    if (L.every((v) => Math.abs(v - 1) < 0.004) || w <= 0 || h <= 0) { drawSprite(ctx, x, y); return; }
    const b = buffers();
    for (const cv of [b.tint, b.over]) if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
    const byte = (/** @type {number} */ v) => Math.round(Cutaway.util.clamp(v, 0, 1) * 255);
    /** the sprite times a colour, on its own canvas (destination-in clears the whole canvas) @param {HTMLCanvasElement} cv @param {number[]} k */
    const times = (cv, k) => {
      const c = ctx2d(cv);
      c.imageSmoothingEnabled = false;
      c.globalCompositeOperation = "source-over";
      c.clearRect(0, 0, cv.width, cv.height);
      drawSprite(c, 0, 0);
      c.globalCompositeOperation = "multiply";
      c.fillStyle = `rgb(${byte(k[0])},${byte(k[1])},${byte(k[2])})`;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = "destination-in";
      drawSprite(c, 0, 0);
      c.globalCompositeOperation = "source-over";
      return c;
    };
    const c = times(b.tint, L);
    const over = L.map((v) => Math.max(0, v - 1));
    if (over.some((v) => v > 0.004)) {                 // overexposed: the sprite times the excess, added
      times(b.over, over);
      c.globalCompositeOperation = "lighter";
      c.drawImage(b.over, 0, 0, w, h, 0, 0, w, h);
      c.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(b.tint, 0, 0, w, h, x, y, w, h);
  }

  return {
    sample, render, drawTinted, flicker, dynamic, rgb,
    /** Steady lamps for players who'd rather have no flicker (Cutaway.settings). @param {boolean} v */
    setCalm(v) { calm = v; },
    /** The current room's light definition. */
    get room() { return def(); },
  };
})();
