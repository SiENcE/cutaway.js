// Cutaway.js display: a low-resolution buffer (e.g. 320x180) shown pixel-perfect in any window.
// The visible canvas covers the whole window at device-pixel resolution; the buffer is drawn into it
// at the largest whole-number scale that fits, centred on whole device pixels, with nearest
// filtering. No CSS scaling is involved, so every logical pixel becomes an exact square.
// Players may choose to fill the window instead (`setFit("fill")`: the largest scale that fits, not
// a whole number) and an old screen's look (`setCrt`: "scanlines", or "crt" with a shadow mask, a
// vignette and round corners), drawn over the picture from one overlay made on every resize.
"use strict";

Cutaway.display = (function () {
  /** @type {HTMLCanvasElement} */
  let screen;
  /** @type {CanvasRenderingContext2D} */
  let screenCtx;
  /** @type {HTMLCanvasElement} */
  let buffer;
  /** @type {CanvasRenderingContext2D} */
  let ctx;
  let width = 320, height = 180, scale = 1, offX = 0, offY = 0, dpr = 1;
  let border = "#000", maxScale = Infinity, fixedScale = 0;
  /** @type {"sharp" | "fill"} */
  let fit = "sharp";
  /** @type {"off" | "scanlines" | "crt"} */
  let crt = "off";
  /** @type {HTMLCanvasElement | null} the old screen's look, made for the current size */
  let overlay = null;
  /** CSS pixels kept free on each side (the editor's panels); the picture fits into the rest. */
  let reserved = { left: 0, top: 0, right: 0, bottom: 0 };

  /**
   * @typedef {object} DisplayOptions
   * @property {number} [width]       logical width in pixels (default 320)
   * @property {number} [height]      logical height in pixels (default 180)
   * @property {HTMLElement} [parent] element that receives the canvas (default document.body)
   * @property {string} [border]      colour around the picture when the window's shape differs
   * @property {number} [maxScale]    never scale up further than this
   * @property {number} [scale]       force this scale (screenshots, tests); 0 = fit the window
   */

  /** @param {DisplayOptions} [o] */
  function init(o = {}) {
    width = o.width ?? 320; height = o.height ?? 180;
    border = o.border ?? "#000"; maxScale = o.maxScale ?? Infinity; fixedScale = o.scale ?? 0;
    buffer = document.createElement("canvas");
    buffer.width = width; buffer.height = height;
    ctx = /** @type {CanvasRenderingContext2D} */ (buffer.getContext("2d"));
    ctx.imageSmoothingEnabled = false;

    screen = document.createElement("canvas");
    screen.className = "cutaway-screen";
    Object.assign(screen.style, { position: "fixed", left: "0", top: "0", width: "100vw", height: "100vh",
      display: "block", touchAction: "none", cursor: "default" });
    screenCtx = /** @type {CanvasRenderingContext2D} */ (screen.getContext("2d", { alpha: false }));
    (o.parent ?? document.body).appendChild(screen);
    Object.assign(document.documentElement.style, { margin: "0", height: "100%", overflow: "hidden", background: border });
    Object.assign(document.body.style, { margin: "0", height: "100%", overflow: "hidden", background: border });

    window.addEventListener("resize", resize);
    // devicePixelRatio changes (browser zoom, moving to another monitor) do not always fire resize
    matchDpr();
    resize();
  }

  function matchDpr() {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener("change", () => { resize(); matchDpr(); }, { once: true });
  }

  /** Recompute the scale and the device-pixel size of the visible canvas. */
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const dw = Math.max(1, Math.round(window.innerWidth * dpr));
    const dh = Math.max(1, Math.round(window.innerHeight * dpr));
    // the editor's panels may take the edges: the picture fits into what is left, centred there
    const l = Math.round(reserved.left * dpr), t = Math.round(reserved.top * dpr);
    const aw = Math.max(1, dw - l - Math.round(reserved.right * dpr)), ah = Math.max(1, dh - t - Math.round(reserved.bottom * dpr));
    screen.width = dw; screen.height = dh;
    const most = Math.min(maxScale, aw / width, ah / height);
    scale = fixedScale || (fit === "fill" && !reserved.left && !reserved.right ? Math.max(1, most) : Math.max(1, Math.floor(most)));
    offX = l + Math.floor((aw - width * scale) / 2);
    offY = t + Math.floor((ah - height * scale) / 2);
    overlay = makeOverlay();
    screenCtx.imageSmoothingEnabled = false;
    Cutaway.events.emit("resize", { scale, width, height });
    present();
  }

  /** Copy the buffer to the screen. Called once per frame after everything is drawn. */
  function present() {
    screenCtx.fillStyle = border;
    screenCtx.fillRect(0, 0, screen.width, screen.height);
    screenCtx.imageSmoothingEnabled = false;
    const pw = Math.round(width * scale), ph = Math.round(height * scale);
    screenCtx.drawImage(buffer, 0, 0, width, height, offX, offY, pw, ph);
    if (overlay) screenCtx.drawImage(overlay, offX, offY);
  }

  /** The old screen's look for the picture's size now: dark lines between the pixel rows, for "crt" also a shadow mask, a vignette and round corners. */
  function makeOverlay() {
    if (crt === "off") return null;
    const pw = Math.round(width * scale), ph = Math.round(height * scale);
    const c = document.createElement("canvas");
    c.width = pw; c.height = ph;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    // a dark line at the foot of each logical row: about a third of it, at least one device pixel
    const dark = Math.max(1, Math.round(scale / 3));
    g.fillStyle = scale >= 2 ? "rgba(0, 0, 0, 0.32)" : "rgba(0, 0, 0, 0.16)";
    for (let y = 0; y < height; y++) {
      const bottom = Math.round((y + 1) * scale);
      g.fillRect(0, bottom - dark, pw, dark);
    }
    if (crt === "crt") {
      if (scale >= 3) {                                // red, green, blue stripes, as in a shadow mask
        const tints = ["rgba(255, 60, 60, 0.07)", "rgba(60, 255, 60, 0.05)", "rgba(80, 80, 255, 0.08)"];
        for (let x = 0; x < pw; x++) { g.fillStyle = tints[x % 3]; g.fillRect(x, 0, 1, ph); }
      }
      const r = Math.hypot(pw, ph) / 2, v = g.createRadialGradient(pw / 2, ph / 2, r * 0.55, pw / 2, ph / 2, r);
      v.addColorStop(0, "rgba(0, 0, 0, 0)");
      v.addColorStop(1, "rgba(0, 0, 0, 0.42)");
      g.fillStyle = v;
      g.fillRect(0, 0, pw, ph);
      const k = Math.round(Math.min(pw, ph) * 0.03);   // round corners, in the border's colour
      g.fillStyle = border;
      g.beginPath();
      g.rect(0, 0, pw, ph);
      g.roundRect(0, 0, pw, ph, k);
      g.fill("evenodd");
    }
    return c;
  }

  /**
   * Convert a pointer position (CSS pixels, e.g. MouseEvent.clientX/Y) to logical pixels.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{x: number, y: number, inside: boolean}}
   */
  function toLogical(clientX, clientY) {
    const x = Math.floor((clientX * dpr - offX) / scale);
    const y = Math.floor((clientY * dpr - offY) / scale);
    return { x, y, inside: x >= 0 && y >= 0 && x < width && y < height };
  }

  /**
   * Logical pixel (its centre) to a pointer position in CSS pixels; the inverse of toLogical.
   * @param {number} x
   * @param {number} y
   */
  function toClient(x, y) {
    return { x: (offX + (x + 0.5) * scale) / dpr, y: (offY + (y + 0.5) * scale) / dpr };
  }

  /** Enter or leave fullscreen (must be called from a user gesture). */
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  return {
    init, resize, present, toLogical, toClient, toggleFullscreen,
    /**
     * Keep CSS pixels free at the edges (the editor's panels) and fit the picture, centred, into the rest.
     * A number keeps only the right edge free (a side panel); 0 or {} gives the whole window back.
     * @param {number | {left?: number, top?: number, right?: number, bottom?: number}} r
     */
    reserve(r) {
      reserved = typeof r === "number" ? { left: 0, top: 0, right: r, bottom: 0 }
        : { left: r.left ?? 0, top: r.top ?? 0, right: r.right ?? 0, bottom: r.bottom ?? 0 };
      resize();
    },
    /** Whole-number scaling only ("sharp", the default) or fill the window ("fill"). @param {"sharp" | "fill"} v */
    setFit(v) { if (v !== fit) { fit = v; resize(); } },
    /** The look of an old screen: "off", "scanlines" or "crt". @param {"off" | "scanlines" | "crt"} v */
    setCrt(v) { if (v !== crt) { crt = v; overlay = makeOverlay(); present(); } },
    /** What reserve() keeps free now (CSS pixels). */
    get reserved() { return { ...reserved }; },
    /** The low-resolution drawing context. Draw everything here, in whole logical pixels. */
    get ctx() { return ctx; },
    get buffer() { return buffer; },
    get screen() { return screen; },
    get width() { return width; },
    get height() { return height; },
    /** Current scale (device pixels per logical pixel): a whole number, unless the player fills the window. */
    get scale() { return scale; },
  };
})();
