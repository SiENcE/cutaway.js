// Cutaway.js display: a low-resolution buffer (e.g. 320x180) shown pixel-perfect in any window.
// The visible canvas covers the whole window at device-pixel resolution; the buffer is drawn into it
// at the largest whole-number scale that fits, centred on whole device pixels, with nearest
// filtering. No CSS scaling is involved, so every logical pixel becomes an exact square.
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
  let border = "#000", maxScale = Infinity, fixedScale = 0, reserved = 0;

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
    const aw = Math.max(1, dw - Math.round(reserved * dpr));          // a side panel (the editor) may take the right edge
    screen.width = dw; screen.height = dh;
    scale = fixedScale || Math.max(1, Math.min(maxScale, Math.floor(Math.min(aw / width, dh / height))));
    offX = Math.floor((aw - width * scale) / 2);
    offY = Math.floor((dh - height * scale) / 2);
    screenCtx.imageSmoothingEnabled = false;
    Cutaway.events.emit("resize", { scale, width, height });
    present();
  }

  /** Copy the buffer to the screen. Called once per frame after everything is drawn. */
  function present() {
    screenCtx.fillStyle = border;
    screenCtx.fillRect(0, 0, screen.width, screen.height);
    screenCtx.imageSmoothingEnabled = false;
    screenCtx.drawImage(buffer, 0, 0, width, height, offX, offY, width * scale, height * scale);
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
    /** Keep `px` CSS pixels on the right free (for a side panel) and fit the picture into the rest. @param {number} px */
    reserve(px) { reserved = px; resize(); },
    /** The low-resolution drawing context. Draw everything here, in whole logical pixels. */
    get ctx() { return ctx; },
    get buffer() { return buffer; },
    get screen() { return screen; },
    get width() { return width; },
    get height() { return height; },
    /** Current whole-number scale (device pixels per logical pixel). */
    get scale() { return scale; },
  };
})();
