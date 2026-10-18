// Cutaway.js debug overlay (toggle with F9 or Cutaway.debug.toggle()).
// Shows the walk areas (green), holes (red), the visibility-graph corners, the active actor's path
// (yellow), prop baselines (cyan), hotspots (orange), actor anchors, lamps (their reach, dotted, and
// the source), effect areas (blue), and the pointer position.
"use strict";

Cutaway.debug = (function () {
  let on = false;

  /** @param {CanvasRenderingContext2D} ctx @param {{x: number, y: number}[]} poly @param {string} color */
  function outline(ctx, poly, color) {
    ctx.fillStyle = color;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) line(ctx, poly[j], poly[i]);
  }

  /** Whole-pixel line (Bresenham), so the overlay stays crisp. @param {CanvasRenderingContext2D} ctx */
  function line(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {{x: number, y: number}} */ a, /** @type {{x: number, y: number}} */ b) {
    let x0 = Math.round(a.x), y0 = Math.round(a.y);
    const x1 = Math.round(b.x), y1 = Math.round(b.y);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** World-space part, drawn inside the scene's camera transform. @param {CanvasRenderingContext2D} ctx */
  function world(ctx) {
    if (!on) return;
    const map = Cutaway.scene.walkMap;
    if (map) {
      for (const a of map.areas) outline(ctx, a, "#3df27a");
      for (const h of map.holes) outline(ctx, h, "#ff4a5a");
      ctx.fillStyle = "#ffffff";
      for (const n of map.nodes) ctx.fillRect(Math.round(n.x) - 1, Math.round(n.y) - 1, 3, 3);
    }
    ctx.fillStyle = "#3ae8ff";
    for (const p of Cutaway.scene.props()) {
      const b = p.def.baseline ?? p.def.at[1], box = Cutaway.scene.propBox(p.def);
      if (box) ctx.fillRect(box[0], b, box[2], 1);
    }
    ctx.fillStyle = "#ffa03a";
    for (const h of Cutaway.scene.hotspots()) outline(ctx, h.poly, "#ffa03a");
    for (const l of Cutaway.light.room?.lamps ?? []) {
      ctx.fillStyle = Cutaway.state.test(l.if) ? "#fff27a" : "#7a7650";
      const [x, y] = l.at, reach = l.r * (l.power ?? 1);
      for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(a) * reach), Math.round(y + Math.sin(a) * reach), 1, 1); }
      ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5);
    }
    for (const f of /** @type {FxDef[]} */ (/** @type {any} */ (Cutaway.scene.room)?.fx ?? [])) {
      ctx.fillStyle = "#6aa8ff";
      if (f.poly) outline(ctx, Cutaway.util.points(f.poly), "#6aa8ff");
      else if (f.rect) { const [x, y, w, h] = f.rect; outline(ctx, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], "#6aa8ff"); }
      for (const p of f.at ? [f.at] : f.points ?? []) ctx.fillRect(p[0] - 1, p[1] - 1, 3, 3);
    }
    for (const a of Cutaway.scene.actorsHere()) {
      if (a.path.length) {
        ctx.fillStyle = "#ffe14a";
        let prev = { x: a.x, y: a.y };
        for (const p of a.path) { line(ctx, prev, p); prev = p; }
      }
      ctx.fillStyle = "#ff3ad0";
      ctx.fillRect(Math.round(a.x) - 1, Math.round(a.y), 3, 1);
    }
  }

  /** Screen-space part (text), drawn after everything else. @param {CanvasRenderingContext2D} ctx */
  function screen(ctx) {
    if (!on) return;
    const f = Cutaway.font.get();
    const w = Cutaway.scene.toWorld(Cutaway.input.x, Cutaway.input.y);
    const a = Cutaway.scene.active;
    let text = `${Cutaway.scene.room?.id ?? "-"}  ${w.x},${w.y}`;
    if (a) text += `  ${a.id} ${Math.round(a.x)},${Math.round(a.y)} ${a.state}`;
    f.draw(ctx, text, 2, Cutaway.display.height - 8, { color: "#fff", outline: "#000" });
  }

  /**
   * With a manual clock: step time until nothing is running (no script, no walking, no line),
   * yielding between steps so promise chains can continue. For tools and headless checks.
   * @param {number} [maxMs]
   * @returns {Promise<number>} the game time spent
   */
  async function settle(maxMs = 120000) {
    const start = Cutaway.clock.time;
    const idle = () => !Cutaway.script.busy && !Cutaway.ui.line &&
      Cutaway.scene.actorsHere().every((a) => a.state !== "walk" && !a.onceDone);
    for (let quiet = 0; quiet < 3 && Cutaway.clock.time - start < maxMs;) {
      Cutaway.clock.advance(100);
      if (Cutaway.ui.line?.waiting) Cutaway.ui.skip();     // the player's setting: lines wait for a click
      await new Promise((r) => setTimeout(r, 0));
      quiet = idle() ? quiet + 1 : 0;
    }
    return Cutaway.clock.time - start;
  }

  /**
   * A screen point where a click lands on this hotspot (not covered by another one), or null.
   * Tries the middle of its box first, then spirals out. For tools and headless playthroughs.
   * @param {string} id
   * @returns {{x: number, y: number} | null}
   */
  function pointOn(id) {
    const h = Cutaway.scene.hotspots().find((q) => q.id === id);
    if (!h) return null;
    const xs = h.poly.map((p) => p.x), ys = h.poly.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
    const W = Cutaway.display.width, H = Cutaway.display.height;
    for (let r = 0; r <= Math.max(x1 - x0, y1 - y0); r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const wx = cx + dx, wy = cy + dy, s = Cutaway.scene.toScreen(wx, wy);
        if (s.x < 2 || s.y < 30 || s.x >= W - 2 || s.y >= H - 2) continue;      // keep clear of the top bar
        if (Cutaway.scene.hotspotAt(wx, wy)?.id === id) return s;
      }
    }
    return null;
  }

  /**
   * For a hotspot out of view in a room wider than the screen: a point on the walkable floor at the
   * screen's edge on its side, where a click walks the played actor (and the camera) towards it; null
   * when it is in view or there's no floor there. For tools and headless playthroughs.
   * @param {string} id
   * @returns {{x: number, y: number} | null}
   */
  function towards(id) {
    const h = Cutaway.scene.hotspots().find((q) => q.id === id), map = Cutaway.scene.walkMap;
    if (!h || !map) return null;
    const xs = h.poly.map((p) => p.x), W = Cutaway.display.width, H = Cutaway.display.height;
    const left = Cutaway.scene.toScreen(Math.max(...xs), 0).x < 2, right = Cutaway.scene.toScreen(Math.min(...xs), 0).x >= W - 2;
    if (!left && !right) return null;
    const sx = left ? 3 : W - 4;
    for (let sy = H - 3; sy >= 30; sy--) if (map.inside(Cutaway.scene.toWorld(sx, sy))) return { x: sx, y: sy };
    return null;
  }

  return {
    world, screen, settle, pointOn, towards,
    get on() { return on; },
    /** @param {boolean} [v] */
    toggle(v) { on = v ?? !on; },
  };
})();
