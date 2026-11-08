// The demo's own editor tab, as an example of what a game can bring (docs/editor.md "A game's own tabs"): the
// studio loads the scripts its studio.json lists under "editor" after the engine's tabs. This one lays a grid
// over the room picture (render), names the cell under the pointer (hover), measures the room's hotspots in the
// inspector (build) and brings its own page for the editor guide (F1 on the tab opens it).
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  let size = 16;
  /** @type {{x: number, y: number} | null} the cell under the pointer */
  let at = null;

  /** The inspector: the cell size, and every hotspot of the room with its box in cells. @param {HTMLElement} panel */
  function build(panel) {
    panel.append(el("div", { style: { margin: "4px 0" } }, ["cell ", ...[8, 16, 32].map((n) => button(n === size ? `● ${n}` : String(n), () => { size = n; E.refresh(); }, `cells of ${n} px`))]));
    const r = Cutaway.scene.room;
    panel.append(el("div", { className: "cw-sec cw-h" }, [`the hotspots of ${r?.id ?? "no room"}`]));
    for (const h of Cutaway.scene.hotspots()) {
      const xs = h.poly.map((p) => p.x), ys = h.poly.map((p) => p.y), cells = (/** @type {number[]} */ v) => `${Math.floor(Math.min(...v) / size)}..${Math.floor(Math.max(...v) / size)}`;
      panel.append(el("div", {}, [`${h.id}: cells ${cells(xs)} × ${cells(ys)}`]));
    }
  }

  /** Over the picture, in room pixels: the grid, and the cell under the pointer. @param {CanvasRenderingContext2D} ctx */
  function render(ctx) {
    const r = Cutaway.scene.room;
    if (!r) return;
    const [w, h] = r.size ?? [Cutaway.display.width, Cutaway.display.height];
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    for (let x = 0; x <= w; x += size) ctx.fillRect(x, 0, 1, h);
    for (let y = 0; y <= h; y += size) ctx.fillRect(0, y, w, 1);
    if (at) { ctx.fillStyle = "rgba(255, 225, 74, 0.35)"; ctx.fillRect(at.x * size, at.y * size, size, size); }
  }

  /** The pointer over the picture (null: it left). @param {{x: number, y: number} | null} p */
  function hover(p) {
    at = p ? { x: Math.floor(p.x / size), y: Math.floor(p.y / size) } : null;
    E.setCursor(at ? `cell ${at.x}, ${at.y}` : null);
  }

  E.tab({ id: "grid", label: "Grid", build, render, hover });
  E.modules.grid = { get size() { return size; }, get at() { return at; } };
  // its guide, inside the editor guide (after "A game's own tabs"); F1 on the tab opens it
  E.modules.help?.addBook({ id: "grid", title: "Grid (the demo's tab)", file: "demo/editor/grid.js",
    md: "# Grid\n\nThe demo's own tab: a grid over the room picture, the cell under the pointer in the status bar, the room's hotspots measured in cells. Its script is the example in \"A game's own tabs\"." },
  { grid: "intro" }, { into: "editor" });
})();
