// Cutaway.js cinema: a film's means for cutscenes and sequences, as script actions.
//   { letterbox: true, ms: 600 }   black bars top and bottom: true = 2.39:1 (320x180: bars of 23 px), a
//                                  number = the bars' height in px, false = away; they slide over `ms`
//   { caption: "Somewhere, 1985.", at: "bl", type: true, blip: "key", ms: 3000 }
//                                  a line in a corner of the picture ("bl" "br" "tl" "tr", or "c" in the
//                                  middle), typed in letter by letter (`type`, `speed` letters a second,
//                                  `blip` a sound per letter), held `ms`, then gone; { caption: false } clears it
//   { dissolve: 800 }              the picture as it is now gives way, pixel by pixel, to what the next
//                                  steps show (a camera cut, a prop shown); the script goes on at once
// The bars are drawn over the room and the fade, under the caption; the caption sits inside the
// picture (6 px from the bars, or from the screen's edge without them), in the game's font, white with
// the interface's outline, so it reads on black too. Lines and the interface draw over both. None of it
// is saved; a sequence clears it when it ends.
"use strict";

/** @typedef {"bl" | "br" | "tl" | "tr" | "c"} CaptionPlace */

Cutaway.cinema = (function () {
  const MARGIN = 6, PLACES = ["bl", "br", "tl", "tr", "c"];
  let bars = 0;
  /**
   * @type {{lines: string[], at: CaptionPlace, start: number, msPerChar: number, color: string, blip?: string,
   *   shown: number, chars: number} | null}
   */
  let caption = null;

  /** The bars' height that makes the picture 2.39:1 (the wide screen of a cinema). */
  function wide() {
    const W = Cutaway.display.width, H = Cutaway.display.height;
    return Math.max(0, Math.round((H - W / 2.39) / 2));
  }

  /**
   * Slide the bars in or out. Resolves when they are there.
   * @param {boolean | number} v  true = 2.39:1, a number = the bars' height, false = none
   * @param {{ms?: number, ease?: string}} [o]
   */
  function letterbox(v, o = {}) {
    const to = v === true ? wide() : !v ? 0 : Math.max(0, Math.round(Number(v)) || 0), from = bars;
    return Cutaway.tween.to({ key: "letterbox", ms: Cutaway.script.fast ? 0 : o.ms, ease: o.ease, step: (k) => { bars = from + (to - from) * k; } });
  }

  /**
   * Show a caption (or clear it with false). Resolves when it is typed and, with `ms`, has been held
   * that long (and is gone again).
   * @param {Record<string, any>} s  the step: { caption, at, type, blip, speed, ms, color }
   */
  async function show(s) {
    if (s.caption === false || s.caption === null) { caption = null; return; }
    const f = Cutaway.ui.font(), W = Cutaway.display.width, fast = Cutaway.script.fast;
    const lines = f.wrap(Cutaway.i18n.t(String(s.caption)), s.at === "c" ? W - 2 * MARGIN : Math.round(W * 0.66));
    const typing = !!s.type && !fast, msPerChar = 1000 / (Number(s.speed) || 20), chars = lines.join("").length;
    const c = caption = { lines, at: PLACES.includes(s.at) ? s.at : "bl", start: Cutaway.clock.time, msPerChar: typing ? msPerChar : 0,
      color: s.color ?? "#ffffff", blip: typeof s.type === "string" ? s.type : s.blip, shown: typing ? 0 : chars, chars };
    await Cutaway.script.sleep(typing ? chars * msPerChar : 0);
    if (s.ms === undefined) return;
    await Cutaway.script.sleep(Number(s.ms) || 0);
    if (caption === c) caption = null;
  }

  /** How many letters of the caption show now. */
  function shown() {
    const c = caption;
    if (!c) return 0;
    return c.msPerChar ? Math.min(c.chars, Math.floor((Cutaway.clock.time - c.start) / c.msPerChar)) : c.chars;
  }

  /** Where the caption's block starts (left edge, top) and its width. */
  function placeOf(/** @type {NonNullable<typeof caption>} */ c) {
    const f = Cutaway.ui.font(), W = Cutaway.display.width, H = Cutaway.display.height, b = Math.round(bars);
    const w = Math.max(...c.lines.map((l) => f.measure(l))), h = c.lines.length * f.lineHeight;
    const x = c.at === "c" ? Math.round((W - w) / 2) : c.at[1] === "r" ? W - MARGIN - w : MARGIN;
    const y = c.at === "c" ? Math.round((H - h) / 2) : c.at[0] === "t" ? b + MARGIN : H - b - MARGIN - h + 2;
    return { x, y, w };
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function render(ctx) {
    const W = Cutaway.display.width, H = Cutaway.display.height, b = Math.round(bars);
    if (b > 0) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, b);
      ctx.fillRect(0, H - b, W, b);
    }
    const c = caption;
    if (c) {
      const f = Cutaway.ui.font(), p = placeOf(c), outline = Cutaway.ui.style.outline;
      let left = shown();
      c.lines.forEach((line, i) => {
        if (left <= 0) return;
        const part = line.slice(0, left), lw = f.measure(line);
        left -= line.length;
        // each line keeps its place while it types: right-aligned and centred lines don't wander
        const x = c.at === "c" ? Math.round(W / 2) - Math.floor(lw / 2) : c.at[1] === "r" ? p.x + p.w - lw : p.x;
        f.draw(ctx, part, x, p.y + i * f.lineHeight, { color: c.color, outline });
      });
    }
    // a sequence skipping ahead: a cut through black instead of a blur of what is passed over
    if (Cutaway.script.fast) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
  }

  /** The typewriter's blips: one per logic step in which a letter (not a space) appeared. */
  function update() {
    const c = caption;
    if (!c || c.shown >= c.chars) return;
    const n = shown();
    if (n > c.shown && c.blip && !Cutaway.script.fast && /\S/.test(c.lines.join("").slice(c.shown, n))) Cutaway.events.emit("sfx", { sfx: c.blip });
    c.shown = n;
  }

  /** No bars, no caption, no dissolve, a clean picture (a sequence's end, a new game). */
  function reset() {
    Cutaway.tween.stop("letterbox");
    bars = 0;
    caption = null;
    Cutaway.fx.stopDissolve();
    Cutaway.fx.stopTape();
  }

  Cutaway.script.action("letterbox", (s) => {
    const done = letterbox(s.letterbox, { ms: s.ms, ease: s.ease });
    return s.wait === false ? undefined : done;
  });
  Cutaway.script.action("caption", (s) => {
    const done = show(s);
    return s.wait === false ? undefined : done;
  });
  Cutaway.script.action("dissolve", (s) => { if (!Cutaway.script.fast) Cutaway.fx.dissolve(Number(s.dissolve) || 800); });
  Cutaway.events.on("frame.ui", render);
  Cutaway.clock.onUpdate(update);

  return {
    letterbox, reset, wide, PLACES,
    /** The bars' height now (whole pixels). */
    get bars() { return Math.round(bars); },
    /** The caption on screen: its text, how much of it is typed, and where (for tools and tests). */
    get caption() {
      const c = caption;
      return c ? { text: c.lines.join(" "), shown: shown(), at: c.at, ...placeOf(c) } : null;
    },
  };
})();
