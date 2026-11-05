// Cutaway.js input: pointer (mouse, touch, pen) and keyboard, reported in logical pixels.
// Events on Cutaway.events:
//   "pointer.move"  {x, y}              the pointer moved (x, y in logical screen pixels)
//   "pointer.click" {x, y, button, touch, double}  button 0 = act, 2 = look (right click or a long press);
//                                       touch = it came from a finger or pen (bigger targets);
//                                       double = the second act click (or tap) in a row, quick and close
//                                       to the first (actors run there)
//   "pointer.press" {x, y}              a finger went down (the interface shows what is under it)
//   "pointer.release" {}                ...and came up again
//   "pointer.wheel" {x, y, dy}          the wheel turned over the screen; dy in screen pixels, down positive (the page doesn't scroll)
//   "pointer.drag"  {x, y, dx, dy, from, claim}  a finger moved more than a little since it went down: where it is, what it moved since the
//                                       last time, where it went down (from: {x, y}). claim() takes it: when it comes up, it doesn't act
//   "key"           {key, code, event}  a key went down
// Touch: a tap acts, holding for `holdMs` looks. Nobody has to answer a drag, and scrolling never is the only way: whatever scrolls has buttons too.
"use strict";

Cutaway.input = (function () {
  let x = -1, y = -1, inside = false, holdMs = 450, touched = false;
  /** @type {{x: number, y: number, lx: number, ly: number, t: number, id: number, timer: number, fired: boolean, moved: boolean, claimed: boolean} | null} */
  let press = null;
  /** @type {Set<string>} */
  const down = new Set();
  const DOUBLE_MS = 400, DOUBLE_PX = 8;
  let lastAct = { x: -99, y: -99, t: -1e9 };

  /** An act click: is it the second of a double click (or tap)? @param {number} px @param {number} py @param {boolean} touch */
  function act(px, py, touch) {
    const now = performance.now(), double = now - lastAct.t < DOUBLE_MS && Math.hypot(px - lastAct.x, py - lastAct.y) <= DOUBLE_PX;
    lastAct = double ? { x: -99, y: -99, t: -1e9 } : { x: px, y: py, t: now };
    Cutaway.events.emit("pointer.click", { x: px, y: py, button: 0, touch, double });
  }

  /** @param {MouseEvent} e */
  function locate(e) {
    const p = Cutaway.display.toLogical(e.clientX, e.clientY);
    x = p.x; y = p.y; inside = p.inside;
    return p;
  }

  function init() {
    const el = Cutaway.display.screen;
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointermove", (e) => {
      const p = locate(e);
      if (press && press.id === e.pointerId && Math.hypot(p.x - press.x, p.y - press.y) > 4) { clearTimeout(press.timer); press.moved = true; }
      Cutaway.events.emit("pointer.move", { x, y });
      if (press && press.id === e.pointerId && press.moved && !press.fired) {
        const pr = press;
        Cutaway.events.emit("pointer.drag", { x: p.x, y: p.y, dx: p.x - pr.lx, dy: p.y - pr.ly, from: { x: pr.x, y: pr.y }, claim() { pr.claimed = true; } });
      }
      if (press && press.id === e.pointerId) { press.lx = p.x; press.ly = p.y; }
    });
    el.addEventListener("pointerdown", (e) => {
      const p = locate(e);
      Cutaway.events.emit("pointer.move", { x, y });
      if (!p.inside) return;
      if (e.pointerType === "mouse") {
        if (e.button === 2) Cutaway.events.emit("pointer.click", { x: p.x, y: p.y, button: 2, touch: false });
        else act(p.x, p.y, false);
        return;
      }
      // touch and pen: decide between tap (act) and hold (look) on release or after holdMs
      touched = true;
      const pr = { x: p.x, y: p.y, lx: p.x, ly: p.y, t: performance.now(), id: e.pointerId, timer: 0, fired: false, moved: false, claimed: false };
      pr.timer = window.setTimeout(() => {
        pr.fired = true;
        Cutaway.events.emit("pointer.click", { x: pr.x, y: pr.y, button: 2, touch: true });
      }, holdMs);
      press = pr;
      Cutaway.events.emit("pointer.press", { x: p.x, y: p.y });
    });
    el.addEventListener("pointerup", (e) => {
      if (!press || press.id !== e.pointerId) return;
      clearTimeout(press.timer);
      Cutaway.events.emit("pointer.release", {});
      if (!press.fired && !press.claimed) act(press.x, press.y, true);
      press = null;
    });
    el.addEventListener("pointercancel", () => { if (press) clearTimeout(press.timer); press = null; Cutaway.events.emit("pointer.release", {}); });
    el.addEventListener("wheel", (e) => {
      const p = locate(e);
      if (!p.inside) return;
      e.preventDefault();
      Cutaway.events.emit("pointer.wheel", { x: p.x, y: p.y, dy: e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 120 : e.deltaY });
    }, { passive: false });
    window.addEventListener("keydown", (e) => {
      down.add(e.code);
      Cutaway.events.emit("key", { key: e.key, code: e.code, event: e });
    });
    window.addEventListener("keyup", (e) => { down.delete(e.code); Cutaway.events.emit("key.up", { key: e.key, code: e.code, event: e }); });
    window.addEventListener("blur", () => down.clear());
  }

  return {
    init,
    /** Last pointer position in logical screen pixels (-1 before the first move). */
    get x() { return x; },
    get y() { return y; },
    get inside() { return inside; },
    /** Has the player used a finger or pen (touch controls show from then on)? */
    get touched() { return touched; },
    /** @param {string} code KeyboardEvent.code */
    isDown(code) { return down.has(code); },
    /** @param {number} ms */
    setHoldTime(ms) { holdMs = ms; },
  };
})();
