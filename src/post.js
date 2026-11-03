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

  /** Grain frames (eight, repeating), made once per size and strength. @type {Map<string, Int16Array[]>} */
  const grains = new Map();
  passes.set("noise", (px, o, t) => {
    const k = Number(o.noise) || 0, key = `${px.w}x${px.h}/${k}`;
    let frames = grains.get(key);
    if (!frames) {
      frames = [];
      for (let f = 0; f < 8; f++) {
        const g = new Int16Array(px.w * px.h);
        for (let i = 0; i < g.length; i++) g[i] = Math.round((hash(i % px.w, Math.floor(i / px.w), f) - 0.5) * 2 * k * 255);
        frames.push(g);
      }
      grains.set(key, frames);
    }
    const g = frames[moving() ? Math.floor(t / 100) % 8 : 0], d = px.data;
    for (let i = 0, j = 0; i < g.length; i++, j += 4) { const n = g[i]; d[j] += n; d[j + 1] += n; d[j + 2] += n; }
  });

  /** A palette's lookup: for each of the 16 Bayer steps and 256 brightness levels, the colour's index. @type {WeakMap<object, {pal: number[][], lut: Uint8Array}>} */
  const ramps = new WeakMap();
  passes.set("palette", (px, o) => {
    let r = ramps.get(o);
    if (!r) {
      const pal = /** @type {number[][]} */ ((o.palette ?? []).map(rgb)), n = pal.length - 1;
      const dither = o.dither === undefined ? 0 : o.dither === true ? 1 : Number(o.dither), lut = new Uint8Array(16 * 256);
      for (let b = 0; b < 16; b++) for (let l = 0; l < 256; l++) {
        const off = dither ? ((BAYER[b] + 0.5) / 16 - 0.5) * dither : 0;
        lut[b * 256 + l] = Math.max(0, Math.min(n, Math.round((l / 255) * n + off)));
      }
      r = { pal, lut };
      ramps.set(o, r);
    }
    if (r.pal.length < 2) return;
    const d = px.data, { pal, lut } = r;
    for (let y = 0; y < px.h; y++) {
      const row = (y & 3) * 4;
      for (let x = 0; x < px.w; x++) {
        const i = (y * px.w + x) * 4, lum = (77 * d[i] + 150 * d[i + 1] + 29 * d[i + 2]) >> 8;
        const c = pal[lut[(row + (x & 3)) * 256 + (lum > 255 ? 255 : lum)]];
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      }
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

  /** @type {Map<string, Float32Array>} */
  const vignettes = new Map();
  passes.set("vignette", (px, o) => {
    const amt = Number(o.vignette) || 0, key = `${px.w}x${px.h}/${amt}`;
    let f = vignettes.get(key);
    if (!f) {
      f = new Float32Array(px.w * px.h);
      const cx = (px.w - 1) / 2, cy = (px.h - 1) / 2;
      for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
        const dx = (x - cx) / cx, dy = (y - cy) / cy;
        f[y * px.w + x] = 1 - amt * Math.min(1, (dx * dx + dy * dy) / 2);
      }
      vignettes.set(key, f);
    }
    const d = px.data;
    for (let i = 0, j = 0; i < f.length; i++, j += 4) { const k = f[i]; if (k < 1) { d[j] *= k; d[j + 1] *= k; d[j + 2] *= k; } }
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
