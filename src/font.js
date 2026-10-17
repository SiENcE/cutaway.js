// Cutaway.js font: variable-width bitmap fonts defined as data (glyph rows of "#" and ".").
// A font is turned into a white mask strip once; each colour gets its own tinted copy on first use.
// Text is drawn glyph by glyph on whole pixels, with an optional 1 px outline or drop shadow.
// The engine's default font "cutaway" (caps 6 px, line height 9 px) covers ASCII, German (ä ö ü ß
// Ä Ö Ü, their dots sit 2 rows above the caps) and German quotes. Games register their own fonts with Cutaway.font.define().
"use strict";

Cutaway.font = (function () {
  /**
   * @typedef {string[] | {dy: number, rows: string[]}} GlyphDef
   *   rows from the top of the cap height down; dy moves the glyph up (negative) or down
   */
  /**
   * @typedef {object} FontDef
   * @property {number} lineHeight  distance between lines
   * @property {number} [spacing]   empty columns between glyphs (default 1)
   * @property {Record<string, GlyphDef>} glyphs  must contain "?" (used for unknown characters)
   */
  /**
   * @typedef {object} TextOptions
   * @property {string} [color]     default white
   * @property {string} [outline]   1 px outline colour (all 8 neighbours)
   * @property {string} [shadow]    1 px drop shadow colour (down right)
   * @property {"left" | "center" | "right"} [align]  relative to x, per line
   */

  class Font {
    /** @param {string} name @param {FontDef} def */
    constructor(name, def) {
      if (!def.glyphs["?"]) throw new Error(`Cutaway: font "${name}" has no "?" glyph`);
      this.name = name;
      this.lineHeight = def.lineHeight;
      this.spacing = def.spacing ?? 1;
      /** @type {Map<string, {sx: number, w: number, dy: number, h: number}>} */
      this.glyphs = new Map();
      /** @type {Map<string, HTMLCanvasElement>} */
      this.tints = new Map();
      let x = 0, top = 0, bottom = 0;
      const list = Object.entries(def.glyphs).map(([ch, g]) => {
        const rows = Array.isArray(g) ? g : g.rows, dy = Array.isArray(g) ? 0 : g.dy;
        const w = Math.max(...rows.map((r) => r.length));
        top = Math.min(top, dy); bottom = Math.max(bottom, dy + rows.length);
        const item = { ch, rows, dy, w, sx: x };
        x += w + 1;                                          // 1 px gap so glyphs never bleed
        return item;
      });
      this.top = top;                                        // rows above the cap line (<= 0)
      this.mask = document.createElement("canvas");
      this.mask.width = Math.max(1, x); this.mask.height = Math.max(1, bottom - top);
      const m = /** @type {CanvasRenderingContext2D} */ (this.mask.getContext("2d"));
      m.fillStyle = "#fff";
      for (const g of list) {
        g.rows.forEach((row, ry) => {
          for (let rx = 0; rx < row.length; rx++) if (row[rx] === "#") m.fillRect(g.sx + rx, g.dy - top + ry, 1, 1);
        });
        this.glyphs.set(g.ch, { sx: g.sx, w: g.w, dy: g.dy, h: g.rows.length });
      }
    }

    /** @param {string} ch */
    glyph(ch) { return this.glyphs.get(ch) ?? /** @type {{sx: number, w: number, dy: number, h: number}} */ (this.glyphs.get("?")); }

    /**
     * Width of the widest line in pixels.
     * @param {string} text
     */
    measure(text) {
      let best = 0;
      for (const line of text.split("\n")) {
        let w = 0;
        for (const ch of line) w += this.glyph(ch).w + this.spacing;
        best = Math.max(best, w ? w - this.spacing : 0);
      }
      return best;
    }

    /**
     * Break text into lines no wider than maxWidth, at spaces (and at "\n").
     * @param {string} text
     * @param {number} maxWidth
     * @returns {string[]}
     */
    wrap(text, maxWidth) {
      /** @type {string[]} */
      const out = [];
      for (const para of text.split("\n")) {
        let line = "";
        for (const word of para.split(" ")) {
          const next = line ? line + " " + word : word;
          if (line && this.measure(next) > maxWidth) { out.push(line); line = word; }
          else line = next;
        }
        out.push(line);
      }
      return out;
    }

    /** @param {string} color */
    tint(color) {
      let c = this.tints.get(color);
      if (c) return c;
      c = document.createElement("canvas");
      c.width = this.mask.width; c.height = this.mask.height;
      const t = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
      t.drawImage(this.mask, 0, 0);
      t.globalCompositeOperation = "source-in";
      t.fillStyle = color;
      t.fillRect(0, 0, c.width, c.height);
      this.tints.set(color, c);
      return c;
    }

    /**
     * Draw text with the top of its cap height at y. Lines are separated by "\n".
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text
     * @param {number} x
     * @param {number} y
     * @param {TextOptions} [o]
     */
    draw(ctx, text, x, y, o = {}) {
      const lines = text.split("\n");
      const pass = (/** @type {string} */ color, /** @type {number} */ ox, /** @type {number} */ oy) => {
        const img = this.tint(color);
        lines.forEach((line, i) => {
          const w = this.measure(line);
          let cx = Math.round(x) + ox - (o.align === "center" ? Math.floor(w / 2) : o.align === "right" ? w : 0);
          const cy = Math.round(y) + oy + i * this.lineHeight;
          for (const ch of line) {
            const g = this.glyph(ch);
            if (ch !== " ") ctx.drawImage(img, g.sx, g.dy - this.top, g.w, g.h, cx, cy + g.dy, g.w, g.h);
            cx += g.w + this.spacing;
          }
        });
      };
      if (o.outline) for (const [dx, dy] of OUTLINE) pass(o.outline, dx, dy);
      if (o.shadow) pass(o.shadow, 1, 1);
      pass(o.color ?? "#fff", 0, 0);
    }
  }

  const OUTLINE = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  /** @type {Map<string, Font>} */
  const fonts = new Map();

  /**
   * Register a font. The first one becomes the default unless a later one is made default.
   * @param {string} name
   * @param {FontDef} def
   * @param {boolean} [makeDefault]
   */
  function define(name, def, makeDefault) {
    const f = new Font(name, def);
    fonts.set(name, f);
    if (makeDefault || !current) current = f;
    return f;
  }

  /** @type {Font | null} */
  let current = null;

  // The default font: caps and digits are 6 rows; lowercase has a 4-row x-height and 2-row descenders.
  /** @type {Record<string, GlyphDef>} */
  const DEFAULT = {
    A: [".##.", "#..#", "#..#", "####", "#..#", "#..#"],
    B: ["###.", "#..#", "###.", "#..#", "#..#", "###."],
    C: [".###", "#...", "#...", "#...", "#...", ".###"],
    D: ["###.", "#..#", "#..#", "#..#", "#..#", "###."],
    E: ["####", "#...", "###.", "#...", "#...", "####"],
    F: ["####", "#...", "###.", "#...", "#...", "#..."],
    G: [".###", "#...", "#.##", "#..#", "#..#", ".###"],
    H: ["#..#", "#..#", "####", "#..#", "#..#", "#..#"],
    I: ["###", ".#.", ".#.", ".#.", ".#.", "###"],
    J: ["..##", "...#", "...#", "...#", "#..#", ".##."],
    K: ["#..#", "#.#.", "##..", "#.#.", "#..#", "#..#"],
    L: ["#...", "#...", "#...", "#...", "#...", "####"],
    M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#"],
    N: ["#..#", "##.#", "#.##", "#..#", "#..#", "#..#"],
    O: [".##.", "#..#", "#..#", "#..#", "#..#", ".##."],
    P: ["###.", "#..#", "#..#", "###.", "#...", "#..."],
    Q: [".##.", "#..#", "#..#", "#..#", "#.#.", ".#.#"],
    R: ["###.", "#..#", "#..#", "###.", "#.#.", "#..#"],
    S: [".###", "#...", ".##.", "...#", "...#", "###."],
    T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#.."],
    U: ["#..#", "#..#", "#..#", "#..#", "#..#", ".##."],
    V: ["#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
    W: ["#...#", "#...#", "#...#", "#.#.#", "##.##", "#...#"],
    X: ["#...#", ".#.#.", "..#..", "..#..", ".#.#.", "#...#"],
    Y: ["#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    Z: ["####", "...#", "..#.", ".#..", "#...", "####"],
    "Ä": { dy: -2, rows: ["#..#", "....", ".##.", "#..#", "#..#", "####", "#..#", "#..#"] },
    "Ö": { dy: -2, rows: ["#..#", "....", ".##.", "#..#", "#..#", "#..#", "#..#", ".##."] },
    "Ü": { dy: -2, rows: ["#..#", "....", "#..#", "#..#", "#..#", "#..#", "#..#", ".##."] },
    a: ["....", "....", ".###", "#..#", "#..#", ".###"],
    b: ["#...", "#...", "###.", "#..#", "#..#", "###."],
    c: ["...", "...", ".##", "#..", "#..", ".##"],
    d: ["...#", "...#", ".###", "#..#", "#..#", ".###"],
    e: ["....", "....", ".##.", "####", "#...", ".###"],
    f: [".##", "#..", "###", "#..", "#..", "#.."],
    g: ["....", "....", ".###", "#..#", "#..#", ".###", "...#", ".##."],
    h: ["#...", "#...", "###.", "#..#", "#..#", "#..#"],
    i: ["#", ".", "#", "#", "#", "#"],
    j: [".#", "..", ".#", ".#", ".#", ".#", ".#", "#."],
    k: ["#..", "#..", "#.#", "##.", "#.#", "#.#"],
    l: ["#.", "#.", "#.", "#.", "#.", ".#"],
    m: [".....", ".....", "####.", "#.#.#", "#.#.#", "#.#.#"],
    n: ["....", "....", "###.", "#..#", "#..#", "#..#"],
    o: ["....", "....", ".##.", "#..#", "#..#", ".##."],
    p: ["....", "....", "###.", "#..#", "#..#", "###.", "#...", "#..."],
    q: ["....", "....", ".###", "#..#", "#..#", ".###", "...#", "...#"],
    r: ["...", "...", "#.#", "##.", "#..", "#.."],
    s: ["...", "...", ".##", "#..", "..#", "##."],
    t: [".#.", ".#.", "###", ".#.", ".#.", "..#"],
    u: ["....", "....", "#..#", "#..#", "#..#", ".###"],
    v: ["...", "...", "#.#", "#.#", "#.#", ".#."],
    w: [".....", ".....", "#...#", "#.#.#", "#.#.#", ".#.#."],
    x: ["...", "...", "#.#", ".#.", ".#.", "#.#"],
    y: ["....", "....", "#..#", "#..#", "#..#", ".###", "...#", ".##."],
    z: ["....", "....", "####", "..#.", ".#..", "####"],
    "ä": ["#..#", "....", ".###", "#..#", "#..#", ".###"],
    "ö": ["#..#", "....", ".##.", "#..#", "#..#", ".##."],
    "ü": ["#..#", "....", "#..#", "#..#", "#..#", ".###"],
    "ß": [".##.", "#..#", "#.#.", "#..#", "#..#", "#.#."],
    0: [".##.", "#..#", "#.##", "##.#", "#..#", ".##."],
    1: [".#.", "##.", ".#.", ".#.", ".#.", "###"],
    2: [".##.", "#..#", "..#.", ".#..", "#...", "####"],
    3: ["###.", "...#", ".##.", "...#", "...#", "###."],
    4: ["#..#", "#..#", "####", "...#", "...#", "...#"],
    5: ["####", "#...", "###.", "...#", "...#", "###."],
    6: [".##.", "#...", "###.", "#..#", "#..#", ".##."],
    7: ["####", "...#", "..#.", ".#..", ".#..", ".#.."],
    8: [".##.", "#..#", ".##.", "#..#", "#..#", ".##."],
    9: [".##.", "#..#", "#..#", ".###", "...#", ".##."],
    " ": ["..."],
    ".": [".", ".", ".", ".", ".", "#"],
    ",": [".", ".", ".", ".", ".", "#", "#"],
    ":": [".", ".", "#", ".", ".", "#"],
    ";": [".", ".", "#", ".", ".", "#", "#"],
    "!": ["#", "#", "#", "#", ".", "#"],
    "?": [".##.", "#..#", "..#.", ".#..", "....", ".#.."],
    "'": ["#", "#"],
    "\"": ["#.#", "#.#"],
    "‚": [".", ".", ".", ".", ".", "#", "#"],
    "‘": ["#", "#"],
    "’": ["#", "#"],
    "„": ["...", "...", "...", "...", "...", "#.#", "#.#"],
    "“": ["#.#", "#.#"],
    "”": ["#.#", "#.#"],
    "-": ["...", "...", "...", "###"],
    "–": ["....", "....", "....", "####"],
    "+": ["...", "...", ".#.", "###", ".#."],
    "=": ["...", "...", "###", "...", "###"],
    "*": ["...", "#.#", ".#.", "#.#"],
    "/": ["...#", "..#.", "..#.", ".#..", ".#..", "#..."],
    "%": ["#..#", "...#", "..#.", ".#..", "#...", "#..#"],
    "(": [".#", "#.", "#.", "#.", "#.", ".#"],
    ")": ["#.", ".#", ".#", ".#", ".#", "#."],
    "_": ["....", "....", "....", "....", "....", "....", "####"],
    "…": [".....", ".....", ".....", ".....", ".....", "#.#.#"],
  };

  return {
    Font, define,
    /** @param {string} [name] the named font, or the current default */
    get(name) {
      const f = name ? fonts.get(name) : current;
      if (!f) throw new Error(`Cutaway: no font "${name ?? "(default)"}"`);
      return f;
    },
    /** Glyph table of the built-in font (to extend or to copy as a starting point). */
    DEFAULT_GLYPHS: DEFAULT,
    /** Register the built-in font (called by Cutaway.start). */
    defineDefault() { if (!fonts.has("cutaway")) define("cutaway", { lineHeight: 9, glyphs: DEFAULT }); },
  };
})();
