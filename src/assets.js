// Cutaway.js assets: images and animations.
// Images are loaded through <img> (works on file://). Atlases written by tools/build-atlas.mjs embed
// their pages as data URIs, which also keeps the canvas readable (no file:// taint) for screenshots and hit tests.
// An animation is an image plus frames (rect + duration); a plain image is a one-frame animation.
// Sprites are anchored bottom-centre by default: x - floor(w / 2), y - h.
// Release builds may scramble the embedded images ("~" + base64 of the PNG XORed with a key the build
// sets with Cutaway.assets.setKey before the packs): the art can't be copied out of the files as is.
// Texts can be scrambled the same way ("" + base64 of the UTF-8 bytes XORed with the key):
// Cutaway.i18n.t reveals them when they are shown.
"use strict";

Cutaway.assets = (function () {
  /**
   * @typedef {object} Frame
   * @property {number} x
   * @property {number} y
   * @property {number} w
   * @property {number} h
   * @property {number} duration  ms
   */
  /**
   * @typedef {object} Anim
   * @property {string} name
   * @property {string} image     name of the image that holds the frames
   * @property {Frame[]} frames
   * @property {number} total     sum of the durations, ms
   * @property {boolean} loop
   * @property {[number, number]} [anchor]  anchor inside a frame; default [floor(w / 2), h]
   */
  /**
   * @typedef {object} AnimDef
   * @property {string} [image]   image name (default: the animation's own name)
   * @property {(number[] | Frame)[]} [frames]  [x, y, w, h, duration] or Frame objects
   * @property {any} [json]       Aseprite/pxl JSON ({ frames: { ... } } or { frames: [ ... ] })
   * @property {boolean} [loop]
   * @property {[number, number]} [anchor]
   */
  /**
   * @typedef {object} Pack
   * @property {Record<string, string>} [images]  name -> URL or data URI
   * @property {Record<string, AnimDef>} [anims]
   */

  /** @type {Map<string, HTMLImageElement | HTMLCanvasElement>} */
  const images = new Map();
  /** @type {Map<string, Anim>} */
  const anims = new Map();
  /** @type {Promise<void>[]} */
  let pending = [];
  let key = "";
  /** @type {Map<string, string>} */
  const revealed = new Map();

  /**
   * Undo a release build's scrambling: "~" + base64 of the bytes XORed with the key. Returns base64.
   * @param {string} s
   */
  function unscramble(s) {
    const bin = atob(s.slice(1)), out = [];
    for (let i = 0; i < bin.length; i += 8192) {
      const part = new Array(Math.min(8192, bin.length - i));
      for (let j = 0; j < part.length; j++) part[j] = String.fromCharCode(bin.charCodeAt(i + j) ^ key.charCodeAt((i + j) % key.length));
      out.push(part.join(""));
    }
    return btoa(out.join(""));
  }

  /**
   * Register an image by URL or data URI, or an already drawn canvas.
   * @param {string} name
   * @param {string | HTMLImageElement | HTMLCanvasElement} src
   */
  function image(name, src) {
    if (typeof src !== "string") { images.set(name, src); return; }
    if (src.startsWith("~")) src = "data:image/png;base64," + unscramble(src);
    const img = new Image();
    images.set(name, img);
    pending.push(new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Cutaway: image "${name}" failed to load (${src.slice(0, 60)})`));
    }));
    img.src = src;
  }

  /**
   * Register an animation over an image.
   * @param {string} name
   * @param {AnimDef} def
   */
  function anim(name, def) {
    /** @type {Frame[]} */
    let frames = [];
    if (def.json) {
      const list = Array.isArray(def.json.frames) ? def.json.frames : Object.values(def.json.frames);
      frames = list.map((/** @type {any} */ f) => ({ ...f.frame, duration: f.duration ?? 100 }));
    } else if (def.frames) {
      frames = def.frames.map((f) => Array.isArray(f) ? { x: f[0], y: f[1], w: f[2], h: f[3], duration: f[4] ?? 100 } : f);
    }
    anims.set(name, {
      name, image: def.image ?? name, frames, loop: def.loop ?? true, anchor: def.anchor,
      total: frames.reduce((s, f) => s + f.duration, 0),
    });
  }

  /** Register everything in a pack. @param {Pack} p */
  function pack(p) {
    for (const [name, src] of Object.entries(p.images ?? {})) image(name, src);
    for (const [name, def] of Object.entries(p.anims ?? {})) anim(name, def);
  }

  /** Resolves when every image registered so far has loaded. */
  async function ready() {
    const now = pending;
    pending = [];
    await Promise.all(now);
  }

  /**
   * The animation with this name; a plain image counts as a one-frame animation.
   * @param {string} name
   * @returns {Anim | null}
   */
  function get(name) {
    const a = anims.get(name);
    if (a) return a;
    const img = images.get(name);
    if (!img) return null;
    const w = img.width, h = img.height;
    const one = { name, image: name, frames: [{ x: 0, y: 0, w, h, duration: 100 }], total: 100, loop: true };
    if (w && h) anims.set(name, one);                       // cache once the image has its size
    return one;
  }

  /**
   * The frame shown `t` ms after the animation started.
   * @param {Anim} a
   * @param {number} t
   */
  function frameAt(a, t) {
    if (a.frames.length === 1 || a.total <= 0) return a.frames[0];
    let local = a.loop ? ((t % a.total) + a.total) % a.total : Math.min(t, a.total - 1);
    for (const f of a.frames) { if (local < f.duration) return f; local -= f.duration; }
    return a.frames[a.frames.length - 1];
  }

  /**
   * Size and anchor of a frame drawn at a scale. Pixel art scales in whole pixels: the height is
   * rounded, the width follows it, so a walking actor changes size one pixel row at a time.
   * @param {{w: number, h: number}} f
   * @param {number} [scale]
   * @param {[number, number]} [anchor]
   */
  function scaled(f, scale = 1, anchor) {
    const [ax, ay] = anchor ?? [Math.floor(f.w / 2), f.h];
    if (scale === 1) return { w: f.w, h: f.h, ax, ay };
    const h = Math.max(1, Math.round(f.h * scale)), k = h / f.h, w = Math.max(1, Math.round(f.w * k));
    return { w, h, ax: Math.floor(ax * k), ay: Math.round(ay * k) };
  }

  /**
   * Draw a frame of an animation (or image) with its anchor at (x, y).
   * @param {CanvasRenderingContext2D} ctx
   * @param {string | Anim} what
   * @param {number} x
   * @param {number} y
   * @param {{t?: number, frame?: number, flip?: boolean, alpha?: number, anchor?: [number, number], scale?: number}} [o]
   *   t = time into the animation (ms); frame = fixed frame index; flip = mirror horizontally;
   *   anchor = override the anchor ([0, 0] draws with the top-left corner at x, y);
   *   scale = draw smaller or larger (nearest neighbour, whole pixels)
   */
  function draw(ctx, what, x, y, o = {}) {
    const a = typeof what === "string" ? get(what) : what;
    if (!a || !a.frames.length) return;
    const img = images.get(a.image);
    if (!img) return;
    const f = o.frame !== undefined ? a.frames[o.frame % a.frames.length] : frameAt(a, o.t ?? 0);
    const s = scaled(f, o.scale, o.anchor ?? a.anchor);
    // flipped, the anchor column mirrors to w - 1 - ax, so the same body column stays on x
    const left = Math.round(x) - (o.flip ? s.w - 1 - s.ax : s.ax), top = Math.round(y) - s.ay;
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    if (o.flip) {
      ctx.save();
      ctx.translate(left + s.w, top);
      ctx.scale(-1, 1);
      ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, s.w, s.h);
      ctx.restore();
    } else {
      ctx.drawImage(img, f.x, f.y, f.w, f.h, left, top, s.w, s.h);
    }
    if (o.alpha !== undefined) ctx.globalAlpha = 1;
  }

  return {
    image, anim, pack, ready, get, frameAt, draw, scaled, unscramble,
    /** A scrambled text ("" + ...) as it was (each one decoded once: labels ask every frame). @param {string} s */
    reveal(s) {
      let text = revealed.get(s);
      if (text !== undefined) return text;
      const bin = atob(unscramble("~" + s.slice(1))), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      text = new TextDecoder().decode(bytes);
      revealed.set(s, text);
      return text;
    },
    /** The key of a release build's scrambled data (set before its packs). @param {string} k */
    setKey(k) { key = k; },
    /** @param {string} name */
    img(name) { return images.get(name) ?? null; },
    /** @param {string} name */
    has(name) { return anims.has(name) || images.has(name); },
    /** Every sprite and animation name (the editor's pickers). */
    names() { return [...new Set([...anims.keys(), ...images.keys()])].sort(); },
  };
})();
