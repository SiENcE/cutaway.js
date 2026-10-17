// Cutaway.js editor, Paint: a pixel editor for sprites, animations and room backgrounds, in the centre of
// the editor (the Art workspace: Edit pixels, or a double-click on a sprite). Each frame of the asset is
// its own picture (frames of different sizes go into a box of the largest one, so the anchor stays
// right); tools: pencil, eraser, fill, line, rectangle, picker, select (move, copy, cut, paste, flip),
// a mirror for front views; a palette (the asset's colours, the game's: studio.json "palette", else the
// room background's); frames (add, delete, move, durations, onion skin, a live preview); undo per asset.
// Apply puts it into the running game; Save writes it as an import (editor-art.js: art/import/...,
// packed into assets/imported.js, which replaces the game's own picture of that name until reverted).
// The painting itself is plain functions on {w, h, data} pictures (Cutaway.paint), tested in Node.
"use strict";

/**
 * A picture to paint on: w x h pixels, RGBA, row by row.
 * @typedef {{w: number, h: number, data: Uint8ClampedArray}} Pix
 * @typedef {{x: number, y: number, w: number, h: number}} PixRect
 */

/** Painting on pictures, without the DOM. Colours are 0xRRGGBBAA numbers; 0 is transparent. */
Cutaway.paint = (function () {
  /** @param {number} w @param {number} h @returns {Pix} */
  const make = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
  /** @param {Pix} p @returns {Pix} */
  const clone = (p) => ({ w: p.w, h: p.h, data: new Uint8ClampedArray(p.data) });

  /** The colour of a pixel (0: transparent, -1: outside). @param {Pix} p @param {number} x @param {number} y */
  function get(p, x, y) {
    if (x < 0 || y < 0 || x >= p.w || y >= p.h) return -1;
    const i = (y * p.w + x) * 4, d = p.data;
    return d[i + 3] === 0 ? 0 : ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
  }
  /** @param {Pix} p @param {number} x @param {number} y @param {number} c */
  function set(p, x, y, c) {
    if (x < 0 || y < 0 || x >= p.w || y >= p.h) return false;
    const i = (y * p.w + x) * 4, d = p.data;
    d[i] = c >>> 24; d[i + 1] = (c >>> 16) & 255; d[i + 2] = (c >>> 8) & 255; d[i + 3] = c & 255;
    return true;
  }

  /** "#rrggbb" to an opaque colour; "" (or "transparent") to 0. @param {string} hex */
  function parse(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    return m ? ((parseInt(m[1], 16) << 8) | 255) >>> 0 : 0;
  }
  /** A colour as "#rrggbb" ("" for transparent). @param {number} c */
  const hex = (c) => (c ? "#" + (c >>> 8).toString(16).padStart(6, "0") : "");
  /** Pixel art: a pixel is fully there or not at all. @param {number} c */
  const solid = (c) => (c > 0 && (c & 255) ? ((c | 255) >>> 0) : 0);

  /** Fill the area of one colour around (x, y) (4 neighbours). Returns how many pixels changed. @param {Pix} p @param {number} x @param {number} y @param {number} c */
  function fill(p, x, y, c) {
    const from = get(p, x, y);
    if (from < 0 || from === c) return 0;
    const W = p.w, H = p.h, stack = [y * W + x];
    let n = 0;
    while (stack.length) {
      const i = /** @type {number} */ (stack.pop()), px = i % W, py = (i - px) / W;
      if (get(p, px, py) !== from) continue;
      set(p, px, py, c); n++;
      if (px > 0) stack.push(i - 1);
      if (px < W - 1) stack.push(i + 1);
      if (py > 0) stack.push(i - W);
      if (py < H - 1) stack.push(i + W);
    }
    return n;
  }

  /** Every pixel of one colour becomes another. @param {Pix} p @param {number} from @param {number} to */
  function replace(p, from, to) {
    let n = 0;
    if (from === to) return 0;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (get(p, x, y) === from) { set(p, x, y, to); n++; }
    return n;
  }

  /** The pixels of a line (Bresenham). @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @returns {[number, number][]} */
  function line(x0, y0, x1, y1) {
    /** @type {[number, number][]} */
    const out = [];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      out.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return out;
  }

  /** The pixels of a rectangle between two corners: its outline, or all of it. @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {boolean} [filled] */
  function rect(x0, y0, x1, y1, filled = false) {
    const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
    /** @type {[number, number][]} */
    const out = [];
    for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) if (filled || y === t || y === b || x === l || x === r) out.push([x, y]);
    return out;
  }

  /** The column mirrored around the picture's centre. @param {number} w @param {number} x */
  const mirror = (w, x) => w - 1 - x;

  /** Points and their mirror images (no doubles). @param {[number, number][]} pts @param {number} w */
  function mirrored(pts, w) {
    const seen = new Set(pts.map(([x, y]) => x + "," + y)), out = pts.slice();
    for (const [x, y] of pts) { const m = mirror(w, x); if (!seen.has(m + "," + y)) { seen.add(m + "," + y); out.push([m, y]); } }
    return out;
  }

  /** A rect cut to the picture. @param {Pix} p @param {PixRect} [r] @returns {PixRect} */
  function clip(p, r) {
    if (!r) return { x: 0, y: 0, w: p.w, h: p.h };
    const x = Math.max(0, r.x), y = Math.max(0, r.y);
    return { x, y, w: Math.max(0, Math.min(p.w, r.x + r.w) - x), h: Math.max(0, Math.min(p.h, r.y + r.h) - y) };
  }

  /** A part of a picture as a picture of its own (all of it: a copy). @param {Pix} p @param {PixRect} [r] */
  function crop(p, r) {
    const c = clip(p, r), out = make(c.w, c.h);
    for (let y = 0; y < c.h; y++) out.data.set(p.data.subarray(((c.y + y) * p.w + c.x) * 4, ((c.y + y) * p.w + c.x + c.w) * 4), y * c.w * 4);
    return out;
  }

  /** Make a part transparent. @param {Pix} p @param {PixRect} [r] */
  function clear(p, r) {
    const c = clip(p, r);
    for (let y = 0; y < c.h; y++) p.data.fill(0, ((c.y + y) * p.w + c.x) * 4, ((c.y + y) * p.w + c.x + c.w) * 4);
  }

  /** Put a picture onto another at (x, y); its transparent pixels leave what is below. @param {Pix} dst @param {Pix} src @param {number} x @param {number} y */
  function paste(dst, src, x, y) {
    for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
      const c = get(src, i, j);
      if (c > 0) set(dst, x + i, y + j, c);
    }
  }

  /** Mirror left to right (all of it, or a part). @param {Pix} p @param {PixRect} [r] */
  function flipH(p, r) {
    const c = clip(p, r);
    for (let y = c.y; y < c.y + c.h; y++) for (let i = 0; i < Math.floor(c.w / 2); i++) {
      const a = get(p, c.x + i, y), b = get(p, c.x + c.w - 1 - i, y);
      set(p, c.x + i, y, b); set(p, c.x + c.w - 1 - i, y, a);
    }
  }

  /** Mirror top to bottom (all of it, or a part). @param {Pix} p @param {PixRect} [r] */
  function flipV(p, r) {
    const c = clip(p, r);
    for (let j = 0; j < Math.floor(c.h / 2); j++) for (let x = c.x; x < c.x + c.w; x++) {
      const a = get(p, x, c.y + j), b = get(p, x, c.y + c.h - 1 - j);
      set(p, x, c.y + j, b); set(p, x, c.y + c.h - 1 - j, a);
    }
  }

  /**
   * A new size, kept at the bottom centre (where a sprite's default anchor is): the old picture's
   * column floor(w / 2) lands on the new one's, its bottom on the new bottom. Returns the picture and
   * how far the old one moved (an explicit anchor moves with it).
   * @param {Pix} p @param {number} w @param {number} h
   */
  function resize(p, w, h) {
    const out = make(w, h), dx = Math.floor(w / 2) - Math.floor(p.w / 2), dy = h - p.h;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const c = get(p, x, y); if (c) set(out, x + dx, y + dy, c); }
    return { pix: out, dx, dy };
  }

  /** The colours of pictures, the most used first (transparent left out). @param {Pix | Pix[]} list @param {number} [max] @returns {string[]} */
  function colors(list, max = 64) {
    /** @type {Map<number, number>} */
    const n = new Map();
    for (const p of Array.isArray(list) ? list : [list]) {
      const d = p.data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; n.set(k, (n.get(k) ?? 0) + 1); }
    }
    return [...n].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, max).map(([k]) => "#" + k.toString(16).padStart(6, "0"));
  }

  /** The "#rrggbb" colours a text names (a palette file, a pxl source), each once, in order. @param {string} text */
  function scanHex(text) {
    return [...new Set((text.match(/#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g) ?? []).map((s) => s.toLowerCase()))];
  }

  /** Are two pictures the same? @param {Pix} a @param {Pix} b */
  function same(a, b) {
    if (a.w !== b.w || a.h !== b.h) return false;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
    return true;
  }

  return { make, clone, get, set, parse, hex, solid, fill, replace, line, rect, mirror, mirrored, clip, crop, clear, paste, flipH, flipV, resize, colors, scanHex, same };
})();

// ------------------------------------------------------------------ the paint view (in the editor only)

(function () {
  const E = Cutaway.editor;
  if (!E || typeof document === "undefined") return;
  const P = Cutaway.paint, el = E.el, button = E.button, art = E.modules.art;
  const ZOOMS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32], LIMIT = 200;
  const TOOLS = /** @type {const} */ ([["pencil", "Pencil", "B"], ["eraser", "Eraser", "E"], ["fill", "Fill", "G"], ["line", "Line", "L"],
    ["rect", "Rect", "R"], ["picker", "Pick", "I"], ["select", "Select", "M"]]);

  /**
   * @typedef {{pix: Pix, ms: number, canvas: HTMLCanvasElement}} PFrame
   * @typedef {{cur: number, frame: number, pix?: Pix, all?: {w: number, h: number, anchor: [number, number] | null, frames: {pix: Pix, ms: number}[]}}} Snap
   * @typedef {object} PDoc
   * @property {string} name
   * @property {number} w
   * @property {number} h
   * @property {PFrame[]} frames
   * @property {[number, number] | null} anchor   explicit (it is saved: room cut-outs carry their place this way)
   * @property {number} cur
   * @property {Snap[]} undo
   * @property {Snap[]} redo
   * @property {boolean} dirty      changed since it was saved (or opened)
   * @property {boolean} applied    in the game now
   * @property {boolean} isNew      not in the game's art
   */

  /** @type {Map<string, PDoc>} every asset painted in this session, with its undo */
  const docs = new Map();
  /** @type {Map<string, NonNullable<ReturnType<typeof Cutaway.assets.get>>>} the game's own frames of an asset, before the first Apply */
  const originals = new Map();
  /** @type {PDoc | null} */
  let doc = null;
  /** @type {string} */
  let tool = "pencil";
  let mirrorOn = false, grid = true, onion = false, zoom = 4, ox = 0, oy = 0, fitNext = true;
  let backdrop = "checker", backColor = "#3c9c94", primary = P.parse("#000000"), secondary = 0, picked = false;
  /** @type {PixRect | null} */
  let sel = null;
  /** @type {{pix: Pix, x: number, y: number, lifted: boolean, canvas: HTMLCanvasElement} | null} a selection being moved, or pasted */
  let float = null;
  /** @type {Pix | null} */
  let clipboard = null;
  /** @type {{kind: string, color: number, start: [number, number], last: [number, number], ox: number, oy: number, cx: number, cy: number, shift: boolean} | null} */
  let drag = null;
  /** @type {[number, number] | null} */
  let hover = null;
  let spaceHeld = false, needRedraw = false, thumbsDirty = true, playing = false, playStart = 0, playTimer = 0, previewScale = 2;
  /** @type {string[]} colours added by hand */
  const added = [];
  /** @type {{key: string, label: string, colors: string[]} | null} */
  let gamePal = null;

  // ------------------------------------------------------------------ pictures and canvases

  /** @param {number} w @param {number} h */
  function canvas(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  /** @param {HTMLCanvasElement} c */
  const ctx2d = (c) => /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
  /** A frame's canvas shows its pixels again. @param {PFrame} f */
  function sync(f) {
    if (f.canvas.width !== f.pix.w || f.canvas.height !== f.pix.h) { f.canvas.width = f.pix.w; f.canvas.height = f.pix.h; }
    ctx2d(f.canvas).putImageData(new ImageData(/** @type {any} */ (f.pix.data), f.pix.w, f.pix.h), 0, 0);
  }
  /** @param {Pix} pix @param {number} ms @returns {PFrame} */
  function frameOf(pix, ms) { const f = { pix, ms, canvas: canvas(pix.w, pix.h) }; sync(f); return f; }

  /** An asset's frames as pictures (from its atlas), in boxes of the largest frame (art.layoutFrames). @param {string} name @returns {PDoc | null} */
  function load(name) {
    const a = Cutaway.assets.has(name) ? Cutaway.assets.get(name) : null, img = a ? Cutaway.assets.img(a.image) : null;
    if (!a || !img || !a.frames.length || !img.width) return null;
    const L = art.layoutFrames(a.frames, a.anchor);
    const frames = a.frames.map((f, i) => {
      const c = canvas(L.w, L.h), g = ctx2d(c);
      g.drawImage(img, f.x, f.y, f.w, f.h, L.at[i][0], L.at[i][1], f.w, f.h);
      return { pix: { w: L.w, h: L.h, data: g.getImageData(0, 0, L.w, L.h).data }, ms: f.duration, canvas: c };
    });
    return { name, w: L.w, h: L.h, frames, anchor: a.anchor ? [a.anchor[0], a.anchor[1]] : null, cur: 0, undo: [], redo: [], dirty: false, applied: false, isNew: false };
  }

  const frame = () => /** @type {PDoc} */ (doc).frames[/** @type {PDoc} */ (doc).cur];

  // ------------------------------------------------------------------ undo

  /** @param {PDoc} d @param {number} i @returns {Snap} */
  const snapPix = (d, i) => ({ cur: d.cur, frame: i, pix: P.clone(d.frames[i].pix) });
  /** @param {PDoc} d @returns {Snap} */
  const snapAll = (d) => ({ cur: d.cur, frame: -1, all: { w: d.w, h: d.h, anchor: d.anchor ? [d.anchor[0], d.anchor[1]] : null, frames: d.frames.map((f) => ({ pix: P.clone(f.pix), ms: f.ms })) } });
  /** Keep how it was before a change. @param {PDoc} d @param {Snap} s */
  function push(d, s) {
    d.undo.push(s);
    if (d.undo.length > LIMIT) d.undo.shift();
    d.redo = [];
    d.dirty = true;
  }
  /** @param {PDoc} d @param {Snap} s */
  function restore(d, s) {
    if (s.all) {
      d.w = s.all.w; d.h = s.all.h; d.anchor = s.all.anchor;
      d.frames = s.all.frames.map((f) => frameOf(f.pix, f.ms));
    } else if (s.pix && d.frames[s.frame]) { d.frames[s.frame].pix = s.pix; sync(d.frames[s.frame]); }
    d.cur = Math.min(s.cur, d.frames.length - 1);
    d.dirty = true;
    changed(true);
  }
  /** @param {boolean} back */
  function undoRedo(back) {
    const d = doc;
    if (!d) return;
    if (float && back) { const f = float; float = null; if (!f.lifted) { changed(); return; } }
    else commitFloat();
    const s = (back ? d.undo : d.redo).pop();
    if (!s) return;
    (back ? d.redo : d.undo).push(s.all ? snapAll(d) : snapPix(d, s.frame));
    restore(d, s);
  }

  // ------------------------------------------------------------------ painting

  /** Something changed: draw again (the thumbnails too, unless a stroke is going on). @param {boolean} [frames] */
  function changed(frames = false) {
    if (frames) { thumbsDirty = true; updateUi(); }
    schedule();
  }

  /** The pixel under the pointer. @param {MouseEvent} e @returns {[number, number]} */
  function pixAt(e) {
    const r = cv.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left - ox) / zoom), Math.floor((e.clientY - r.top - oy) / zoom)];
  }

  /** @param {[number, number][]} pts @param {number} c */
  function plot(pts, c) {
    const f = frame();
    for (const [x, y] of mirrorOn ? P.mirrored(pts, f.pix.w) : pts) P.set(f.pix, x, y, c);
    sync(f);
  }

  /** The line or rectangle being drawn. @returns {[number, number][]} */
  function shapePts() {
    if (!drag) return [];
    const [x0, y0] = drag.start, [x1, y1] = drag.last;
    const pts = drag.kind === "line" ? P.line(x0, y0, x1, y1) : P.rect(x0, y0, x1, y1, drag.shift);
    return mirrorOn && doc ? P.mirrored(pts, doc.w) : pts;
  }

  /** The floating selection goes down onto the frame. */
  function commitFloat() {
    if (!float || !doc) return;
    const f = frame();
    if (!float.lifted) push(doc, snapPix(doc, doc.cur));
    P.paste(f.pix, float.pix, float.x, float.y);
    sync(f);
    sel = { x: float.x, y: float.y, w: float.pix.w, h: float.pix.h };
    float = null;
    changed(true);
  }

  /** @param {Pix} pix @param {number} x @param {number} y @param {boolean} lifted */
  function floatOf(pix, x, y, lifted) { const c = canvas(pix.w, pix.h); ctx2d(c).putImageData(new ImageData(/** @type {any} */ (pix.data), pix.w, pix.h), 0, 0); return { pix, x, y, lifted, canvas: c }; }

  /** @param {number} c */
  function pick(c, right = false) {
    const s = P.solid(c);
    if (right) secondary = s; else primary = s;
    picked = true;
    E.refresh(); updateUi();
  }

  /** @param {PointerEvent} e */
  function down(e) {
    if (!doc) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const p = pixAt(e), right = e.button === 2;
    const base = { start: p, last: p, ox, oy, cx: e.clientX, cy: e.clientY, shift: e.shiftKey, color: right ? secondary : primary };
    if (e.button === 1 || spaceHeld) { drag = { kind: "pan", ...base }; return; }
    if (e.altKey || tool === "picker") { const c = P.get(frame().pix, p[0], p[1]); if (c >= 0) pick(c, right); return; }
    const d = doc;
    if (tool === "select") {
      const r = float ? { x: float.x, y: float.y, w: float.pix.w, h: float.pix.h } : sel;
      if (r && p[0] >= r.x && p[1] >= r.y && p[0] < r.x + r.w && p[1] < r.y + r.h) {
        if (!float && sel) { push(d, snapPix(d, d.cur)); float = floatOf(P.crop(frame().pix, sel), sel.x, sel.y, true); P.clear(frame().pix, sel); sync(frame()); }
        drag = { kind: "move", ...base };
      } else { commitFloat(); sel = null; drag = { kind: "select", ...base }; }
      changed();
      return;
    }
    commitFloat();
    if (tool === "fill") {
      const f = frame(), from = P.get(f.pix, p[0], p[1]);
      if (from < 0) return;
      push(d, snapPix(d, d.cur));
      const n = e.shiftKey ? P.replace(f.pix, from, base.color) : P.fill(f.pix, p[0], p[1], base.color) + (mirrorOn ? P.fill(f.pix, P.mirror(f.pix.w, p[0]), p[1], base.color) : 0);
      if (!n) d.undo.pop();
      sync(f); changed(true);
      return;
    }
    if (tool === "pencil" || tool === "eraser") {
      push(d, snapPix(d, d.cur));
      drag = { kind: "paint", ...base, color: tool === "eraser" ? 0 : base.color };
      plot([p], drag.color);
      changed();
      return;
    }
    drag = { kind: tool, ...base };                       // line, rect
    changed();
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (!doc) return;
    const p = pixAt(e);
    hover = p;
    const c = P.get(frame().pix, p[0], p[1]);
    E.setCursor(c < 0 ? `${doc.w}x${doc.h}   ${zoom}x` : `x ${p[0]}, y ${p[1]}   ${c ? P.hex(c) + ((c & 255) < 255 ? ` (alpha ${c & 255})` : "") : "transparent"}   ${zoom}x`);
    if (!drag) { schedule(); return; }
    if (drag.kind === "pan") { ox = drag.ox + e.clientX - drag.cx; oy = drag.oy + e.clientY - drag.cy; schedule(); return; }
    const [lx, ly] = drag.last;
    if (lx === p[0] && ly === p[1]) return;
    if (drag.kind === "paint") plot(P.line(lx, ly, p[0], p[1]), drag.color);
    else if (drag.kind === "move" && float) { float.x += p[0] - lx; float.y += p[1] - ly; }
    drag.last = p; drag.shift = e.shiftKey;
    schedule();
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (!drag || !doc) return;
    const d = doc, g = drag;
    drag = null;
    try { cv.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (g.kind === "line" || g.kind === "rect") {
      g.shift = e.shiftKey;
      drag = g;
      const pts = shapePts();
      drag = null;
      push(d, snapPix(d, d.cur));
      const f = frame();
      for (const [x, y] of pts) P.set(f.pix, x, y, g.color);
      sync(f);
    } else if (g.kind === "select") {
      const [x0, y0] = g.start, [x1, y1] = g.last;
      sel = P.clip(frame().pix, { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 });
      if (!sel.w || !sel.h) sel = null;
    }
    changed(true);
    E.refresh();
  }

  /** Zoom to a step, keeping the pixel under (cx, cy) where it is. @param {number} z @param {number} [cx] @param {number} [cy] */
  function zoomTo(z, cx, cy) {
    z = Math.max(1, Math.min(32, z));
    const r = cv.getBoundingClientRect(), x = cx ?? r.width / 2, y = cy ?? r.height / 2;
    ox = Math.round(x - ((x - ox) / zoom) * z); oy = Math.round(y - ((y - oy) / zoom) * z);
    zoom = z;
    updateUi(); schedule();
  }
  /** One step in or out. @param {number} dir @param {number} [cx] @param {number} [cy] */
  function zoomStep(dir, cx, cy) {
    zoomTo(dir > 0 ? ZOOMS.find((z) => z > zoom) ?? 32 : [...ZOOMS].reverse().find((z) => z < zoom) ?? 1, cx, cy);
  }
  /** The biggest zoom that shows all of it, centred. */
  function fit() {
    if (!doc) return;
    const r = stage.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    zoom = [...ZOOMS].reverse().find((z) => doc && doc.w * z <= r.width - 24 && doc.h * z <= r.height - 24) ?? 1;
    ox = Math.floor((r.width - doc.w * zoom) / 2); oy = Math.floor((r.height - doc.h * zoom) / 2);
    fitNext = false;
    updateUi(); schedule();
  }

  // ------------------------------------------------------------------ selection, clipboard, flips

  const selRect = () => (float ? { x: float.x, y: float.y, w: float.pix.w, h: float.pix.h } : sel);

  function copy() {
    if (!doc) return;
    clipboard = float ? P.clone(float.pix) : P.crop(frame().pix, sel ?? undefined);
    E.setStatus(`copied ${clipboard.w}x${clipboard.h}`);
  }
  function cut() {
    if (!doc) return;
    copy();
    if (float) { const f = float; float = null; if (!f.lifted) return; changed(true); return; }
    push(doc, snapPix(doc, doc.cur));
    P.clear(frame().pix, sel ?? undefined); sync(frame()); changed(true);
  }
  function paste() {
    if (!doc || !clipboard) return;
    commitFloat();
    const r = cv.getBoundingClientRect();
    const x = sel ? sel.x : Math.max(0, Math.min(doc.w - clipboard.w, Math.floor((r.width / 2 - ox) / zoom - clipboard.w / 2)));
    const y = sel ? sel.y : Math.max(0, Math.min(doc.h - clipboard.h, Math.floor((r.height / 2 - oy) / zoom - clipboard.h / 2)));
    float = floatOf(P.clone(clipboard), x, y, false);
    tool = "select";
    changed(); updateUi();
  }
  /** @param {"h" | "v"} dir */
  function flip(dir) {
    if (!doc) return;
    const f = dir === "h" ? P.flipH : P.flipV;
    if (float) { f(float.pix); float = floatOf(float.pix, float.x, float.y, float.lifted); changed(); return; }
    push(doc, snapPix(doc, doc.cur));
    f(frame().pix, sel ?? undefined); sync(frame()); changed(true);
  }
  function del() {
    if (!doc) return;
    if (float) { const f = float; float = null; changed(f.lifted); return; }
    if (!sel) return;
    push(doc, snapPix(doc, doc.cur));
    P.clear(frame().pix, sel); sync(frame()); changed(true);
  }
  function selectNone() { commitFloat(); sel = null; changed(); }
  function selectAll() { if (!doc) return; commitFloat(); sel = { x: 0, y: 0, w: doc.w, h: doc.h }; tool = "select"; updateUi(); changed(); }

  // ------------------------------------------------------------------ frames

  /** @param {number} i */
  function goFrame(i) { if (!doc) return; commitFloat(); doc.cur = (i + doc.frames.length) % doc.frames.length; changed(true); }
  function addFrame() {
    if (!doc) return;
    commitFloat();
    push(doc, snapAll(doc));
    const f = frame();
    doc.frames.splice(doc.cur + 1, 0, frameOf(P.clone(f.pix), f.ms));
    doc.cur++;
    changed(true); E.refresh();
  }
  function deleteFrame() {
    if (!doc || doc.frames.length < 2) return;
    commitFloat();
    push(doc, snapAll(doc));
    doc.frames.splice(doc.cur, 1);
    doc.cur = Math.min(doc.cur, doc.frames.length - 1);
    changed(true); E.refresh();
  }
  /** @param {number} dir */
  function moveFrame(dir) {
    if (!doc) return;
    const j = doc.cur + dir;
    if (j < 0 || j >= doc.frames.length) return;
    push(doc, snapAll(doc));
    [doc.frames[doc.cur], doc.frames[j]] = [doc.frames[j], doc.frames[doc.cur]];
    doc.cur = j;
    changed(true);
  }
  /** @param {number} ms */
  function setMs(ms) {
    if (!doc || !(ms > 0)) return;
    push(doc, snapAll(doc));
    frame().ms = Math.round(ms);
    changed(true);
  }
  /** A new canvas size for every frame, kept at the bottom centre (an explicit anchor moves along). @param {number} w @param {number} h */
  function resizeCanvas(w, h) {
    const d = doc;
    if (!d || !(w > 0 && h > 0) || (w === d.w && h === d.h)) return;
    commitFloat();
    push(d, snapAll(d));
    let dx = 0, dy = 0;
    d.frames = d.frames.map((f) => { const r = P.resize(f.pix, w, h); dx = r.dx; dy = r.dy; return frameOf(r.pix, f.ms); });
    if (d.anchor) d.anchor = [d.anchor[0] + dx, d.anchor[1] + dy];
    d.w = w; d.h = h; sel = null;
    fitNext = true; fit();
    changed(true); E.refresh();
  }

  // ------------------------------------------------------------------ into the game, into the files

  /** The frames side by side. @param {PDoc} d */
  function stripOf(d) {
    const c = canvas(d.w * d.frames.length, d.h), g = ctx2d(c);
    d.frames.forEach((f, i) => g.drawImage(f.canvas, i * d.w, 0));
    return c;
  }
  /** @param {PDoc} d */
  const importOf = (d) => { const c = stripOf(d); return { name: d.name, src: c, w: c.width, h: c.height, frames: d.frames.length, ms: d.frames.map((f) => f.ms), anchor: d.anchor }; };

  /** The painting in the running game, now. @param {PDoc | null} [d] */
  function apply(d = doc, quiet = false) {
    if (!d) return;
    if (d === doc) commitFloat();
    if (!originals.has(d.name) && Cutaway.assets.has(d.name)) originals.set(d.name, /** @type {NonNullable<ReturnType<typeof Cutaway.assets.get>>} */ (Cutaway.assets.get(d.name)));
    art.applyImport(importOf(d));
    d.applied = true;
    Cutaway.scene.refresh?.();
    if (!quiet) E.setStatus(`${d.name} is in the game now${d.dirty ? " (not saved: Save keeps it)" : ""}`);
    E.refresh();
  }

  /** Apply, then write it as an import and pack the imported atlas. @param {PDoc | null} [d] */
  async function save(d = doc) {
    if (!d) return;
    apply(d, true);
    const lines = await art.writeImport(importOf(d));
    d.dirty = false; d.isNew = false;
    E.setStatus(`saved ${d.name}: ${lines.join("\n")}`);
    E.refresh();
  }
  async function saveAll() { for (const d of docs.values()) if (d.dirty) await save(d); }

  /**
   * Back to the game's own art: the import's files go (with the studio), the atlas is packed and the
   * art loaded again; a painting only applied goes back to the frames from before.
   * @param {string} name @param {boolean} [ask]
   */
  async function revert(name, ask = true) {
    if (!name) return;
    if (ask && !confirm(`Revert ${name} to the game's own art? The painting and its import files go.`)) return;
    const lines = [];
    const d = docs.get(name);
    docs.delete(name);
    if (doc === d) doc = null;
    if (art.isImported(name)) {
      if (!E.studio.available) { E.setStatus("reverting an import needs the studio (it removes the files in art/import)"); if (d) docs.set(name, d); return; }
      const gone = await art.removeImport(name);
      lines.push(gone.length ? "removed " + gone.join(", ") : "no import files");
      if (gone.length) lines.push(...await art.pack());
      originals.delete(name);
      try { await art.reloadArt(); } catch (e) { lines.push(String(/** @type {any} */ (e).message)); }
    }
    const o = originals.get(name);
    if (o) { Cutaway.assets.anim(name, { image: o.image, frames: o.frames, loop: o.loop, ...(o.anchor ? { anchor: o.anchor } : {}) }); originals.delete(name); }
    lines.unshift(`${name}: the game's own art again`);
    if (Cutaway.assets.has(name) && Cutaway.assets.img(Cutaway.assets.get(name)?.image ?? "")) open(name); else close();
    E.setStatus(lines.join("\n"));
  }

  // ------------------------------------------------------------------ open, new, close

  /** Paint an asset (the centre shows it). @param {string} name */
  function open(name) {
    if (!name) return false;
    let d = docs.get(name) ?? null;
    if (!d) {
      try { d = load(name); } catch (e) { E.setStatus(`${name}: its pixels can't be read here (${/** @type {any} */ (e).message}); the studio serves them`); return false; }
      if (!d) { E.setStatus(`${name}: no such picture (or it hasn't loaded)`); return false; }
      docs.set(name, d);
    }
    show(d);
    return true;
  }

  /** @param {PDoc} d */
  function show(d) {
    if (doc !== d) { commitFloat(); sel = null; float = null; fitNext = true; }
    doc = d;
    if (!picked) { const c = P.colors(d.frames.map((f) => f.pix), 1)[0]; if (c) primary = P.parse(c); }
    thumbsDirty = true; playing = false; clearInterval(playTimer);
    art.showPaint(d.name);
    updateUi();
    requestAnimationFrame(() => { if (fitNext) fit(); schedule(); });
  }

  /** A new sprite: empty, or a copy of another asset. @param {string} name @param {number} w @param {number} h @param {string} [copyOf] */
  function newSprite(name, w, h, copyOf) {
    /** @type {PDoc | null} */
    let d = copyOf ? load(copyOf) : null;
    if (copyOf && !d) { E.setStatus(`${copyOf}: can't copy it`); return; }
    if (d) d.name = name;
    else d = { name, w, h, frames: [frameOf(P.make(w, h), 100)], anchor: null, cur: 0, undo: [], redo: [], dirty: true, applied: false, isNew: true };
    d.dirty = true; d.isNew = !Cutaway.assets.has(name);
    docs.set(name, d);
    show(d);
    E.setStatus(`${name}: ${d.w}x${d.h}. Apply shows it in the game, Save writes it as an import`);
  }

  function close() {
    commitFloat();
    doc = null; playing = false; clearInterval(playTimer);
    E.setCursor(null);
    art.closeCentre();
  }

  // the art loaded again (a pxl build): what was applied and not saved goes back in, the rest is read again
  Cutaway.events.on("art.reloaded", () => {
    for (const d of [...docs.values()]) {
      if (d.dirty && d.applied) apply(d, true);
      else if (!d.dirty) {
        docs.delete(d.name);
        if (doc === d) { const n = load(d.name); if (n) { docs.set(d.name, n); doc = n; thumbsDirty = true; schedule(); } }
      }
    }
  });

  // ------------------------------------------------------------------ the view

  const CSS = `
.cw-paint { display: flex; flex-direction: column; height: 100%; }
.cw-ptools { display: flex; flex-wrap: wrap; align-items: center; gap: 1px; padding: 3px 6px; background: #1c1729; border-bottom: 1px solid #3a3350; }
.cw-ptools .gap { width: 10px; }
.cw-ptools .lbl { color: #8a84a0; margin: 0 2px 0 4px; }
.cw-ptools button { margin: 1px; }
.cw-ptools button .k { color: #8a84a0; font-size: 10px; }
.cw-ptools button.on .k { color: #5a4a20; }
.cw-pstage { flex: 1; position: relative; overflow: hidden; min-height: 0; }
.cw-pstage canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
.cw-pframes { display: flex; gap: 8px; align-items: stretch; padding: 4px 6px; background: #1c1729; border-top: 1px solid #3a3350; height: 104px; box-sizing: border-box; }
.cw-thumbs { display: flex; gap: 4px; overflow-x: auto; overflow-y: hidden; flex: 1; align-items: flex-end; min-width: 0; }
.cw-thumb { border: 1px solid #3a3350; padding: 2px; cursor: pointer; text-align: center; font-size: 10px; color: #8a84a0; flex: none; background: #16121f; }
.cw-thumb.on { border-color: #ffe14a; color: #ffe14a; }
.cw-thumb canvas { display: block; image-rendering: pixelated; margin: 0 auto 1px; }
.cw-fctl { display: flex; flex-direction: column; justify-content: center; white-space: nowrap; }
.cw-fctl input { width: 54px; }
.cw-fprev { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.cw-fprev canvas { image-rendering: pixelated; background: #3c9c94; }
`;
  if (!document.getElementById("cw-paint-css")) { const st = document.createElement("style"); st.id = "cw-paint-css"; st.textContent = CSS; document.head.append(st); }

  const cv = /** @type {HTMLCanvasElement} */ (el("canvas", {}));
  const stage = el("div", { className: "cw-pstage" }, [cv]);
  const toolsBar = el("div", { className: "cw-ptools" });
  const thumbs = el("div", { className: "cw-thumbs" });
  const msIn = /** @type {HTMLInputElement} */ (el("input", { type: "number", min: 10, step: 10, title: "how long this frame shows (ms)", onchange: () => setMs(Number(msIn.value)) }));
  const prev = /** @type {HTMLCanvasElement} */ (el("canvas", { width: 64, height: 64 }));
  const playBtn = button("▶ Play", () => togglePlay(), "the animation, live");
  const scaleBtn = button("2x", () => { previewScale = previewScale === 1 ? 2 : 1; updateUi(); drawPreview(); }, "the preview's size");
  const onionBtn = button("Onion", () => { onion = !onion; updateUi(); schedule(); }, "the frame before, faint (O)");
  const backBox = el("div", { className: "cw-fctl" });
  const framesBar = el("div", { className: "cw-pframes" }, [
    thumbs,
    el("div", { className: "cw-fctl" }, [
      el("div", {}, [button("+ Frame", addFrame, "a copy of this frame after it"), button("Delete", deleteFrame, "this frame")]),
      el("div", {}, [button("◀", () => moveFrame(-1), "move this frame left"), button("▶", () => moveFrame(1), "move this frame right"), " ", msIn, " ms"]),
      el("div", {}, [onionBtn, playBtn, scaleBtn]),
    ]),
    backBox,
    el("div", { className: "cw-fprev" }, [prev]),
  ]);
  const viewEl = el("div", { className: "cw-paint" }, [toolsBar, stage, framesBar]);
  /** @type {Record<string, HTMLElement>} */
  const toolBtn = {};

  function buildTools() {
    const b = (/** @type {string} */ label, /** @type {() => void} */ fn, /** @type {string} */ title) => button(label, fn, title);
    for (const [id, label, key] of TOOLS) {
      toolBtn[id] = b(label, () => setTool(id), { pencil: "left: the 1st colour, right: the 2nd", eraser: "transparent", fill: "the area of one colour (Shift: that colour everywhere in the frame)",
        line: "drag", rect: "drag (Shift: filled)", picker: "take a colour (also Alt+click; right: the 2nd colour)", select: "drag a rectangle; drag inside to move it; Ctrl+C / X / V" }[id] ?? "");
      toolBtn[id].title = `${label} (${key}): ${toolBtn[id].title}`;
      toolBtn[id].append(el("span", { className: "k", textContent: " " + key }));
    }
    toolBtn.mirror = b("Mirror", () => { mirrorOn = !mirrorOn; updateUi(); schedule(); }, "draw mirrored around the centre column (Shift+M)");
    toolBtn.grid = b("Grid", () => { grid = !grid; updateUi(); schedule(); }, "the pixel grid (from 6x)");
    const zoomLbl = el("span", { className: "lbl", textContent: "" });
    toolBtn.zoom = zoomLbl;
    const back = /** @type {HTMLSelectElement} */ (el("select", { title: "what shows through transparent pixels", onchange: () => { backdrop = back.value; schedule(); drawPreview(); } },
      [["checker", "checkerboard"], ["solid", "colour"]].map(([v, t]) => el("option", { value: v, textContent: t, selected: v === backdrop }))));
    const backCol = /** @type {HTMLInputElement} */ (el("input", { type: "color", value: backColor, title: "the backdrop colour", onchange: () => { backColor = backCol.value; backdrop = "solid"; back.value = "solid"; schedule(); drawPreview(); } }));
    toolsBar.replaceChildren(...TOOLS.map(([id]) => toolBtn[id]), el("span", { className: "gap" }), toolBtn.mirror,
      b("Flip H", () => flip("h"), "the selection, or the frame (Shift+H)"), b("Flip V", () => flip("v"), "the selection, or the frame (Shift+V)"),
      el("span", { className: "gap" }), b("-", () => zoomStep(-1), "zoom out (-, wheel)"), zoomLbl, b("+", () => zoomStep(1), "zoom in (+, wheel)"), b("Fit", fit, "the biggest zoom that shows it all (0)"), toolBtn.grid,
      el("span", { style: { flex: "1" } }),
      b("Apply", () => apply(), "put it into the running game now"), b("Save", () => { save().catch((e) => E.setStatus("save failed: " + e.message)); }, "write it as an import (art/import) and pack it (Ctrl+S)"),
      b("Close", close, "back to the game picture"));
    backBox.replaceChildren(el("span", { className: "cw-dim", textContent: "backdrop" }), back, el("span", {}, [backCol]));
  }

  function updateUi() {
    for (const [id] of TOOLS) toolBtn[id]?.classList.toggle("on", tool === id);
    toolBtn.mirror?.classList.toggle("on", mirrorOn);
    toolBtn.grid?.classList.toggle("on", grid);
    onionBtn.classList.toggle("on", onion);
    if (toolBtn.zoom) toolBtn.zoom.textContent = `${zoom}x`;
    playBtn.textContent = playing ? "■ Stop" : "▶ Play";
    scaleBtn.textContent = previewScale + "x";
    if (doc && document.activeElement !== msIn) msIn.value = String(frame().ms);
  }

  /** @param {string} id */
  function setTool(id) { if (id !== "select") commitFloat(); tool = id; updateUi(); schedule(); }

  function sizeCanvas() {
    const r = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    if (fitNext) fit();
    schedule();
  }
  new ResizeObserver(() => sizeCanvas()).observe(stage);

  const checker = (() => { const c = canvas(16, 16), g = ctx2d(c); g.fillStyle = "#5a5a66"; g.fillRect(0, 0, 16, 16); g.fillStyle = "#7a7a86"; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8); return c; })();

  function schedule() { if (!needRedraw) { needRedraw = true; requestAnimationFrame(redraw); } }

  /** Draw the zoomed frame: drawImage of the frame's canvas, nearest neighbour (fast for backgrounds too). */
  function redraw() {
    needRedraw = false;
    if (!doc || !cv.isConnected) return;
    const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext("2d")), dpr = window.devicePixelRatio || 1, cw = cv.width / dpr, ch = cv.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#0e0b14"; g.fillRect(0, 0, cw, ch);
    const d = doc, f = frame(), W = d.w * zoom, H = d.h * zoom;
    g.fillStyle = backdrop === "checker" ? /** @type {CanvasPattern} */ (g.createPattern(checker, "repeat")) : backColor;
    g.fillRect(ox, oy, W, H);
    if (onion && d.frames.length > 1) { g.globalAlpha = 0.3; g.drawImage(d.frames[(d.cur - 1 + d.frames.length) % d.frames.length].canvas, ox, oy, W, H); g.globalAlpha = 1; }
    g.drawImage(f.canvas, 0, 0, d.w, d.h, ox, oy, W, H);
    if (float) g.drawImage(float.canvas, ox + float.x * zoom, oy + float.y * zoom, float.pix.w * zoom, float.pix.h * zoom);
    if (drag && (drag.kind === "line" || drag.kind === "rect")) {
      g.fillStyle = drag.color ? P.hex(drag.color) : "rgba(255, 58, 208, 0.6)";
      for (const [x, y] of shapePts()) g.fillRect(ox + x * zoom, oy + y * zoom, zoom, zoom);
    }
    if (grid && zoom >= 6) {                               // only the visible lines
      g.fillStyle = "rgba(0, 0, 0, 0.22)";
      const x0 = Math.max(0, Math.floor(-ox / zoom)), x1 = Math.min(d.w, Math.ceil((cw - ox) / zoom)), y0 = Math.max(0, Math.floor(-oy / zoom)), y1 = Math.min(d.h, Math.ceil((ch - oy) / zoom));
      for (let x = x0; x <= x1; x++) g.fillRect(ox + x * zoom, oy + y0 * zoom, 1, (y1 - y0) * zoom);
      for (let y = y0; y <= y1; y++) g.fillRect(ox + x0 * zoom, oy + y * zoom, (x1 - x0) * zoom, 1);
    }
    g.strokeStyle = "#4a4066"; g.lineWidth = 1; g.strokeRect(ox - 0.5, oy - 0.5, W + 1, H + 1);
    if (mirrorOn) { g.fillStyle = "rgba(255, 58, 208, 0.8)"; g.fillRect(Math.round(ox + (d.w / 2) * zoom), oy - 8, 1, H + 16); }
    const an = d.anchor ?? [Math.floor(d.w / 2), d.h];      // the anchor: a small mark where the sprite stands
    if (an[0] >= 0 && an[0] <= d.w && an[1] >= 0 && an[1] <= d.h) {
      const ax = ox + (an[0] + 0.5) * zoom, ay = oy + an[1] * zoom;
      g.fillStyle = "#ff3ad0"; g.beginPath(); g.moveTo(ax, ay + 1); g.lineTo(ax - 5, ay + 8); g.lineTo(ax + 5, ay + 8); g.fill();
    }
    let r = selRect();
    if (drag?.kind === "select") { const [x0, y0] = drag.start, [x1, y1] = drag.last; r = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 }; }
    if (r) {
      g.lineWidth = 1;
      g.setLineDash([4, 4]); g.strokeStyle = "#000"; g.strokeRect(ox + r.x * zoom + 0.5, oy + r.y * zoom + 0.5, r.w * zoom - 1, r.h * zoom - 1);
      g.lineDashOffset = 4; g.strokeStyle = "#ffe14a"; g.strokeRect(ox + r.x * zoom + 0.5, oy + r.y * zoom + 0.5, r.w * zoom - 1, r.h * zoom - 1);
      g.setLineDash([]); g.lineDashOffset = 0;
    }
    if (hover && !drag && tool !== "select" && zoom >= 4 && P.get(f.pix, hover[0], hover[1]) >= 0) {
      g.strokeStyle = "rgba(255, 255, 255, 0.85)";
      g.strokeRect(ox + hover[0] * zoom + 0.5, oy + hover[1] * zoom + 0.5, zoom - 1, zoom - 1);
    }
    if (thumbsDirty && !drag) buildThumbs();
    if (!playing) drawPreview();
  }

  /** The frames strip: a thumbnail each (made again only when the frames change, not while painting). */
  function buildThumbs() {
    thumbsDirty = false;
    const d = doc;
    if (!d) return;
    const s = Math.min(4, 52 / d.h, 120 / d.w), tw = Math.max(4, Math.round(d.w * s)), th = Math.max(4, Math.round(d.h * s));
    thumbs.replaceChildren(...d.frames.map((f, i) => {
      const c = canvas(tw, th), g = ctx2d(c);
      g.imageSmoothingEnabled = s < 1;
      if (backdrop === "solid") { g.fillStyle = backColor; g.fillRect(0, 0, tw, th); } else { g.fillStyle = /** @type {CanvasPattern} */ (g.createPattern(checker, "repeat")); g.fillRect(0, 0, tw, th); }
      g.drawImage(f.canvas, 0, 0, tw, th);
      return el("div", { className: "cw-thumb" + (i === d.cur ? " on" : ""), title: `frame ${i + 1}: ${f.ms} ms`, onclick: () => goFrame(i) }, [c, `${i + 1}  ${f.ms}ms`]);
    }));
    thumbs.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    updateUi();
  }

  /** The live preview: the frame now (playing: as the game shows it). */
  function drawPreview() {
    const d = doc;
    if (!d) return;
    const s = Math.max(1, Math.min(previewScale, Math.floor(160 / d.w), Math.floor(84 / d.h))) || 1, sc = d.w > 160 || d.h > 84 ? Math.min(160 / d.w, 84 / d.h) : s;
    const w = Math.max(1, Math.round(d.w * sc)), h = Math.max(1, Math.round(d.h * sc));
    if (prev.width !== w || prev.height !== h) { prev.width = w; prev.height = h; }
    const g = ctx2d(prev);
    g.imageSmoothingEnabled = sc < 1;
    g.fillStyle = backdrop === "solid" ? backColor : "#3c9c94"; g.fillRect(0, 0, w, h);
    let f = frame();
    if (playing) {
      const total = d.frames.reduce((n, q) => n + q.ms, 0);
      let t = (performance.now() - playStart) % Math.max(1, total);
      for (const q of d.frames) { if (t < q.ms) { f = q; break; } t -= q.ms; }
    }
    g.drawImage(f.canvas, 0, 0, w, h);
  }

  function togglePlay() {
    playing = !playing;
    clearInterval(playTimer);
    if (playing) { playStart = performance.now(); playTimer = window.setInterval(() => { if (!doc || !prev.isConnected) { playing = false; clearInterval(playTimer); updateUi(); } else drawPreview(); }, 30); }
    updateUi(); drawPreview();
  }

  cv.addEventListener("pointerdown", down);
  cv.addEventListener("pointermove", move);
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("pointerleave", () => { hover = null; if (doc) E.setCursor(`${doc.w}x${doc.h}   ${zoom}x`); schedule(); });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") spaceHeld = false; });
  buildTools();

  /** Keys while the paint view shows (the editor passes them unless a text field has the focus). @param {KeyboardEvent} e */
  function key(e) {
    if (!doc) return false;
    const mod = e.ctrlKey || e.metaKey, c = e.code;
    if (mod) {
      if (c === "KeyC") copy(); else if (c === "KeyX") cut(); else if (c === "KeyV") paste(); else if (c === "KeyA") selectAll(); else return false;
      return true;
    }
    if (e.altKey) return false;
    if (c === "Space") { spaceHeld = true; return true; }
    if (e.shiftKey) {
      if (c === "KeyM") { mirrorOn = !mirrorOn; updateUi(); schedule(); } else if (c === "KeyH") flip("h"); else if (c === "KeyV") flip("v");
      else if (c === "Equal") zoomStep(1); else return false;
      return true;
    }
    const t = TOOLS.find(([, , k]) => c === "Key" + k);
    if (t) { setTool(t[0]); return true; }
    if (c === "KeyX") { [primary, secondary] = [secondary, primary]; E.refresh(); }
    else if (c === "KeyO") { onion = !onion; updateUi(); schedule(); }
    else if (c === "Equal" || c === "NumpadAdd") zoomStep(1);
    else if (c === "Minus" || c === "NumpadSubtract") zoomStep(-1);
    else if (c === "Digit0" || c === "Numpad0") fit();
    else if (c === "Comma") goFrame(doc.cur - 1);
    else if (c === "Period") goFrame(doc.cur + 1);
    else if (c === "Enter") commitFloat();
    else if (float && c.startsWith("Arrow")) { float.x += c === "ArrowLeft" ? -1 : c === "ArrowRight" ? 1 : 0; float.y += c === "ArrowUp" ? -1 : c === "ArrowDown" ? 1 : 0; schedule(); }
    else return false;
    return true;
  }

  /** @type {EditorView} */
  const view = { el: viewEl, key, undo: () => undoRedo(true), redo: () => undoRedo(false), del, selectNone, shown() { sizeCanvas(); buildThumbs(); } };

  // ------------------------------------------------------------------ the inspector (the Art tab, while painting)

  /** The game's palette: the colours in the files studio.json lists ("palette"), else the room background's. */
  function gamePalette() {
    const files = E.studio.available ? /** @type {string[]} */ (E.studio.config?.palette ?? []) : [];
    const bg = Cutaway.scene.room?.background ?? "", key = files.length ? "files:" + files.join(",") : "bg:" + bg;
    if (gamePal?.key === key) return gamePal;
    if (files.length) {
      gamePal = { key, label: "game palette", colors: [] };
      const pal = gamePal;
      Promise.all(files.map((f) => E.studio.read(f).catch(() => ""))).then((texts) => { pal.colors = P.scanHex(texts.join("\n")); E.refresh(); });
    } else {
      /** @type {PDoc | null} */
      let d = null;
      try { d = bg ? docs.get(bg) ?? load(bg) : null; } catch { d = null; }
      gamePal = { key, label: bg ? `${bg}'s colours` : "the room's colours", colors: d ? P.colors(d.frames.map((f) => f.pix), 48) : [] };
    }
    return gamePal;
  }

  /** @param {string} hexc @param {string} [title] */
  function swatch(hexc, title) {
    return el("span", { className: "cw-sw" + (hexc ? "" : " t"), title: (title ? title + ": " : "") + (hexc || "transparent") + "  (left: 1st colour, right: 2nd)",
      style: hexc ? { background: hexc } : {},
      onclick: () => { primary = P.parse(hexc); picked = true; E.refresh(); },
      oncontextmenu: (/** @type {MouseEvent} */ e) => { e.preventDefault(); secondary = P.parse(hexc); E.refresh(); } });
  }

  /** The paint panel, at the top of the Art tab's inspector. @param {HTMLElement} box */
  function inspector(box) {
    const d = doc;
    if (!d) return;
    const flags = [d.isNew ? "new" : "", d.dirty ? "changed" : "", d.applied ? "in the game" : "", art.isImported(d.name) ? "● imported" : ""].filter(Boolean).join(", ");
    box.append(el("div", { className: "cw-h", style: { fontWeight: "bold" } }, [`Painting ${d.name}`]),
      el("div", { className: "cw-dim" }, [`${d.w}x${d.h}, ${d.frames.length} frame${d.frames.length > 1 ? "s" : ""}, anchor ${d.anchor ? d.anchor.join(", ") : "bottom centre"}${flags ? "  (" + flags + ")" : ""}`]));
    const big = (/** @type {number} */ c, /** @type {string} */ t) => el("span", { className: "cw-big" + (c ? "" : " t"), title: `${t}: ${P.hex(c) || "transparent"}`, style: c ? { background: P.hex(c) } : {} });
    const add = /** @type {HTMLInputElement} */ (el("input", { type: "color", value: P.hex(primary) || "#000000", title: "any colour (it becomes the 1st)",
      onchange: () => { const h = add.value.toLowerCase(); if (!added.includes(h)) added.push(h); primary = P.parse(h); picked = true; E.refresh(); } }));
    box.append(el("div", { style: { margin: "6px 0", display: "flex", alignItems: "center", gap: "4px" } }, [big(primary, "1st (left button)"), big(secondary, "2nd (right button)"),
      el("div", {}, [button("Swap X", () => { [primary, secondary] = [secondary, primary]; E.refresh(); }, "swap the colours (X)"), el("br"), add, " ",
        el("span", { className: "cw-dim" }, [`${P.hex(primary) || "transparent"} / ${P.hex(secondary) || "transparent"}`])])]));
    /** @param {string} title @param {string[]} list */
    const row = (title, list) => box.append(el("div", { className: "cw-dim" }, [title]), el("div", { className: "cw-pals" }, list.map((h) => swatch(h, title))));
    row("this picture", ["", ...P.colors(d.frames.map((f) => f.pix), 64)]);
    const gp = gamePalette();
    if (gp.colors.length && gp.key !== "bg:" + d.name) row(gp.label, gp.colors);
    if (added.length) row("added", added);
    const w = /** @type {HTMLInputElement} */ (el("input", { type: "number", min: 1, max: 2048, value: d.w, style: { width: "56px" } }));
    const h = /** @type {HTMLInputElement} */ (el("input", { type: "number", min: 1, max: 2048, value: d.h, style: { width: "56px" } }));
    box.append(el("div", { style: { margin: "4px 0" } }, ["size ", w, " x ", h, button("Resize", () => resizeCanvas(Number(w.value), Number(h.value)), "every frame, kept at the bottom centre")]));
    box.append(el("div", { style: { margin: "4px 0" } }, [
      button("Apply", () => apply(), "put it into the running game now"),
      button("Save", () => { save().catch((e) => E.setStatus("save failed: " + e.message)); }, "Apply, write it as an import (art/import) and pack it (Ctrl+S)"),
      button("Revert", () => { revert(d.name).catch((e) => E.setStatus("revert failed: " + e.message)); }, "the game's own art again (removes the import)"),
      button("Close", close, "back to the game picture")]));
    box.append(el("div", { className: "cw-dim", style: { fontSize: "11px", marginTop: "4px" } }, [
      "B pencil  E eraser  G fill (Shift: that colour everywhere)  L line  R rect (Shift: filled)  I pick (Alt+click)  M select: drag inside moves; Ctrl+C X V, Ctrl+A, Del, Enter: put down\n" +
      "Shift+H / Shift+V flip  Shift+M mirror  X swap colours  wheel, + - zoom  0 fit  Space or middle drag: pan  , . frames  O onion  Ctrl+Z / Ctrl+Y"]));
  }

  E.modules.paint = {
    P, open, close, apply, save, saveAll, revert, newSprite, inspector, docs, undo: () => undoRedo(true), redo: () => undoRedo(false),
    copy, cut, paste, flip, selectAll, fit, addFrame, deleteFrame, moveFrame, setMs, resizeCanvas,
    get view() { return doc ? view : null; },
    get doc() { return doc; },
    get unsaved() { let n = 0; for (const d of docs.values()) if (d.dirty) n++; return n; },
    get tool() { return tool; },
    /** @param {string} t */
    setTool,
    /** The 1st and 2nd colours ("#rrggbb", "" transparent). @param {string} a @param {string} [b] */
    setColors(a, b) { primary = P.parse(a); if (b !== undefined) secondary = P.parse(b); picked = true; E.refresh(); },
    /** The colour of a pixel of the frame now ("#rrggbb", "" transparent). @param {number} x @param {number} y */
    pixel(x, y) { return doc ? P.hex(P.get(frame().pix, x, y)) : null; },
    /** Where a pixel's centre is on the page (CSS pixels; tests send the mouse there). @param {number} x @param {number} y */
    clientOf(x, y) { const r = cv.getBoundingClientRect(); return { x: r.left + ox + (x + 0.5) * zoom, y: r.top + oy + (y + 0.5) * zoom }; },
    get zoom() { return zoom; },
    /** @param {number} z */
    setZoom(z) { zoomTo(z); },
    /** @param {boolean} on */
    setMirror(on) { mirrorOn = on; updateUi(); schedule(); },
    /** @param {boolean} on */
    setOnion(on) { onion = on; updateUi(); schedule(); },
    get selection() { return selRect(); },
    redraw,
  };
})();
