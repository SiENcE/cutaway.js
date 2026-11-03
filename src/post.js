// Cutaway.js post-effects: passes over the finished room picture (the room, its actors, its light and
// effects), before fades and the interface. A room lists them in order:
//   Cutaway.room("cam03", { ..., post: [
//     { noise: 0.06 },                                  // grain, new every 100 ms
//     { palette: ["#030a0a", "#0c221f", "#1a483e", "#388169", "#8acfae", "#d4f7e2"], dither: true },  // by brightness onto a ramp
//     { scanlines: 2, amount: 0.18 },                   // every 2nd row darker
//     { roll: { speed: 30, height: 10, amount: 0.12 } },  // a band of light rolling down (px a second)
//     { vignette: 0.35 },                               // darker towards the corners
//     { tint: "#40ff80", amount: 0.2 },                 // towards a colour
//   ] })
// Every pass is a pure function of the frame clock, so screenshots repeat. With the setting "motion"
// off, noise and the rolling band stand still. A game adds its own: Cutaway.post.add("name", (px, o, t) => ...),
// px being { data, w, h } (RGBA bytes, changed in place), o the pass's options, t the clock in ms.
"use strict";

/** @typedef {{data: Uint8ClampedArray, w: number, h: number}} PostPixels */
/** @typedef {(px: PostPixels, o: Record<string, any>, t: number) => void} PostPass */

Cutaway.post = (function () {
  /** @type {Map<string, PostPass>} */
  const passes = new Map();
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /** A stable hash in [0, 1). @param {number} a @param {number} b @param {number} c */
  function hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /** "#rrggbb" as [r, g, b]. @param {string} hex */
  function rgb(hex) {
    const v = parseInt(String(hex).replace("#", ""), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  /** Does the picture move (noise, the band)? The player may have switched motion off. */
  function moving() { return Cutaway.settings?.values?.motion !== false; }

  passes.set("noise", (px, o, t) => {
    const k = Number(o.noise) || 0, f = moving() ? Math.floor(t / 100) : 0, d = px.data;
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      const i = (y * px.w + x) * 4, n = (hash(x, y, f) - 0.5) * 2 * k * 255;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
  });

  /** @type {WeakMap<object, number[][]>} */
  const ramps = new WeakMap();
  passes.set("palette", (px, o) => {
    const pal = ramps.get(o) ?? /** @type {number[][]} */ ((o.palette ?? []).map(rgb));
    ramps.set(o, pal);
    if (!pal.length) return;
    const d = px.data, n = pal.length - 1, dither = o.dither === undefined ? 0 : o.dither === true ? 1 : Number(o.dither);
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      const i = (y * px.w + x) * 4, lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const b = dither ? ((BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * dither : 0;
      const k = Math.max(0, Math.min(n, Math.round(lum * n + b))), c = pal[k];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  });

  passes.set("scanlines", (px, o) => {
    const every = Math.max(2, Number(o.scanlines) || 2), keep = 1 - (o.amount ?? 0.18), d = px.data;
    for (let y = every - 1; y < px.h; y += every) for (let x = 0; x < px.w; x++) {
      const i = (y * px.w + x) * 4;
      d[i] *= keep; d[i + 1] *= keep; d[i + 2] *= keep;
    }
  });

  passes.set("roll", (px, o, t) => {
    const r = o.roll ?? {}, speed = r.speed ?? 30, hgt = r.height ?? 10, amt = r.amount ?? 0.12;
    const period = px.h + hgt * 2, at = moving() ? ((t / 1000) * speed) % period - hgt : px.h / 3, d = px.data;
    for (let y = Math.max(0, Math.floor(at - hgt)); y < Math.min(px.h, at + hgt); y++) {
      const k = 1 + amt * (1 - Math.abs(y - at) / hgt);
      for (let x = 0; x < px.w; x++) { const i = (y * px.w + x) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
    }
  });

  passes.set("vignette", (px, o) => {
    const amt = Number(o.vignette) || 0, cx = (px.w - 1) / 2, cy = (px.h - 1) / 2, d = px.data;
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      const dx = (x - cx) / cx, dy = (y - cy) / cy, k = 1 - amt * Math.min(1, (dx * dx + dy * dy) / 2);
      const i = (y * px.w + x) * 4;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
  });

  passes.set("tint", (px, o) => {
    const [r, g, b] = rgb(o.tint), a = o.amount ?? 0.2, d = px.data;
    for (let i = 0; i < d.length; i += 4) { d[i] += (r - d[i]) * a; d[i + 1] += (g - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a; }
  });

  /** Which pass a step names: its first key that is a pass. @param {Record<string, any>} step */
  function nameOf(step) { return Object.keys(step).find((k) => passes.has(k)) ?? null; }

  /**
   * Run the current room's passes over the picture (the whole screen, before the interface).
   * @param {CanvasRenderingContext2D} ctx
   */
  function render(ctx) {
    const list = Cutaway.scene.room?.post;
    if (!list?.length || Cutaway.scene.backdrop) return;
    const W = ctx.canvas.width, H = ctx.canvas.height, img = ctx.getImageData(0, 0, W, H);
    const px = { data: img.data, w: W, h: H }, t = Cutaway.clock.time;
    for (const step of list) {
      const name = nameOf(step);
      if (name) passes.get(name)?.(px, step, t);
    }
    ctx.putImageData(img, 0, 0);
  }

  return {
    render,
    /** Add a pass of the game's own. @param {string} name @param {PostPass} fn */
    add(name, fn) { passes.set(name, fn); },
    /** The passes' names (the validator uses this). */
    names() { return [...passes.keys()]; },
    /** Run passes over pixels directly (tests, tools). @param {PostPixels} px @param {Record<string, any>[]} list @param {number} [t] */
    apply(px, list, t = 0) { for (const s of list) { const n = nameOf(s); if (n) passes.get(n)?.(px, s, t); } },
  };
})();
