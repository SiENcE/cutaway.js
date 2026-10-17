// Cutaway.js items and the satchel.
//   Cutaway.item("key", { name: "key", icon: "inv_key", look: "A small brass key.",
//                         combine: { string: [{ remove: "key" }, { give: "key_on_string" }] } })
// The satchel icon sits at the top right. Clicking it (or touching the top edge of the screen)
// slides down a bar with the active actor's items. Click an item to hold it, then click a hotspot,
// an actor or another item to use it there; right click an item to look at it.
"use strict";

/**
 * @typedef {object} ItemDef
 * @property {string} [name]     label (text or "@key")
 * @property {string} [icon]     sprite, about 24x16
 * @property {Script} [look]
 * @property {Record<string, Script>} [combine]  other item id -> script (works in both directions)
 */

/** Define an item: `Cutaway.item(id, def)`; look one up with `Cutaway.item.get(id)`. */
Cutaway.item = (function () {
  /** @type {Map<string, ItemDef>} */
  const defs = new Map();
  /** @param {string} id @param {ItemDef} def */
  function item(id, def) { defs.set(id, def); return id; }
  /** @param {string} id */
  item.get = (id) => defs.get(id) ?? null;
  item.ids = () => [...defs.keys()];
  return item;
})();

Cutaway.inventory = (function () {
  const BAR_H = 24, CELL = 26, SLIDE_MS = 160;
  // built-in satchel icon (16x14), used unless the skin names a sprite
  const BAG = ["....kkkkkk......", "...k......k.....", "..k..kkkk..k....", "kkkkkkkkkkkkkkkk", "kbbbbbbbbbbbbbbk",
    "kbbbbbbbbbbbbbbk", "kBBBBBBkkBBBBBBk", "kbbbbbbkykbbbbbk", "kbbbbbbbkbbbbbbk", "kbbbbbbbbbbbbbbk", "kbbbbbbbbbbbbbbk",
    "kBbbbbbbbbbbbbBk", ".kBBBBBBBBBBBBk.", "..kkkkkkkkkkkk.."];
  const BAG_COLORS = /** @type {Record<string, string>} */ ({ k: "#1a1426", b: "#a8703c", B: "#7a4a26", y: "#f2d04a" });
  /** @type {HTMLCanvasElement | null} */
  let bag = null;
  let open = 0, wantOpen = false, byHover = false;
  /** @type {string | null} sprite name of the satchel icon */
  let satchelSprite = null;

  function W() { return Cutaway.display.width; }
  function bagBox() {
    const f = satchelSprite ? Cutaway.assets.get(satchelSprite)?.frames[0] : null;
    return f ? { x: W() - f.w - 4, y: 4, w: f.w, h: f.h } : { x: W() - 20, y: 3, w: 16, h: 14 };
  }
  function items() { return Cutaway.state.items(); }
  /** @param {number} i */
  function cellX(i) { return 6 + i * CELL; }
  function barY() { return Math.round(-BAR_H + BAR_H * open); }
  function shown() { return !!Cutaway.scene.active && !Cutaway.script.busy; }

  /** @param {number} x @param {number} y @returns {number} item index under the point, or -1 */
  function itemAt(x, y) {
    if (open < 1 || y < barY() || y >= barY() + BAR_H) return -1;
    const i = Math.floor((x - 6) / CELL);
    return i >= 0 && i < items().length && x - cellX(i) < CELL - 2 ? i : -1;
  }

  /** @param {number} x @param {number} y */
  function onBag(x, y) { const b = bagBox(); return x >= b.x - 2 && x < b.x + b.w + 2 && y >= b.y - 2 && y < b.y + b.h + 2; }

  /**
   * Use one item on another.
   * @param {string} a
   * @param {string} b
   */
  function combine(a, b) {
    const s = Cutaway.item.get(a)?.combine?.[b] ?? Cutaway.item.get(b)?.combine?.[a] ?? "@cutaway.with";
    const [p, q] = [a, b].sort();
    return Cutaway.script.run(s, { path: `item.${p}.combine.${q}`, item: a });
  }

  /** @param {string} id */
  function look(id) {
    return Cutaway.script.run(Cutaway.item.get(id)?.look ?? "@cutaway.look", { path: `item.${id}.look`, item: id });
  }

  /** @type {UiLayer} */
  const layer = {
    z: 40,
    click(p) {
      if (!shown()) return false;
      if (onBag(p.x, p.y) && open < 1) { wantOpen = true; byHover = false; return true; }
      if (onBag(p.x, p.y)) { wantOpen = false; Cutaway.ui.hold(null); return true; }
      if (open < 1 || p.y >= barY() + BAR_H) return false;
      const i = itemAt(p.x, p.y), id = i >= 0 ? items()[i] : null, held = Cutaway.ui.held;
      if (!id) { Cutaway.ui.hold(null); return true; }          // empty part of the bar
      if (p.button === 2) { Cutaway.ui.hold(null); look(id); return true; }
      if (held && held !== id) { Cutaway.ui.hold(null); combine(held, id); return true; }
      Cutaway.ui.hold(held === id ? null : id);
      return true;
    },
    hover(x, y) {
      if (!shown()) return undefined;
      if (onBag(x, y)) return Cutaway.i18n.t("@cutaway.satchel");
      if (open < 1 || y >= barY() + BAR_H) return undefined;
      const i = itemAt(x, y);
      if (i < 0) return null;
      const id = items()[i], name = Cutaway.i18n.t(Cutaway.item.get(id)?.name ?? id), held = Cutaway.ui.held;
      if (held && held !== id) {
        const hn = Cutaway.i18n.t(Cutaway.item.get(held)?.name ?? held);
        return Cutaway.i18n.t("@cutaway.useWith").replace("{item}", hn).replace("{target}", name);
      }
      return name;
    },
    update(dt) {
      const y = Cutaway.input.y;
      if (!shown()) wantOpen = false;
      else if (Cutaway.input.inside && y <= 1 && !wantOpen) { wantOpen = true; byHover = true; }
      else if (wantOpen && Cutaway.input.inside && y > BAR_H + 10 && (byHover || Cutaway.ui.held)) wantOpen = false;
      open = Cutaway.util.clamp(open + (wantOpen ? 1 : -1) * dt / SLIDE_MS, 0, 1);
    },
    render(ctx) {
      if (!Cutaway.scene.active) return;
      const f = Cutaway.ui.font(), list = items();
      if (open > 0) {
        const y = barY();
        ctx.fillStyle = Cutaway.ui.style.panel;
        ctx.fillRect(0, y, W(), BAR_H);
        list.forEach((id, i) => {
          const def = Cutaway.item.get(id), cx = cellX(i) + 12, cy = y + 12;
          if (Cutaway.ui.held === id) return;                    // it's on the cursor
          if (def?.icon && Cutaway.assets.has(def.icon)) Cutaway.assets.draw(ctx, def.icon, cx, cy, { anchor: Cutaway.ui.centre(def.icon) });
          else f.draw(ctx, Cutaway.i18n.t(def?.name ?? id).slice(0, 4), cx, cy - 3, { align: "center", color: "#fff" });
        });
        if (!list.length) f.draw(ctx, Cutaway.i18n.t("@cutaway.empty"), 8, y + 9, { color: "#c8c8d8" });
      }
      if (Cutaway.script.busy) return;
      const b = bagBox();
      if (satchelSprite) Cutaway.assets.draw(ctx, satchelSprite, b.x, b.y, { anchor: [0, 0] });
      else ctx.drawImage(bagImage(), b.x, b.y);
    },
  };

  function bagImage() {
    if (bag) return bag;
    bag = document.createElement("canvas");
    bag.width = 16; bag.height = BAG.length;
    const c = /** @type {CanvasRenderingContext2D} */ (bag.getContext("2d"));
    BAG.forEach((row, y) => [...row].forEach((ch, x) => { if (BAG_COLORS[ch]) { c.fillStyle = BAG_COLORS[ch]; c.fillRect(x, y, 1, 1); } }));
    return bag;
  }

  return {
    layer, combine, look,
    init() { Cutaway.ui.addLayer(layer); },
    /** @param {boolean} v */
    setOpen(v) { wantOpen = v; byHover = false; if (!v) open = 0; },
    get isOpen() { return open >= 1; },
    /** 0 = closed ... 1 = fully open. */
    get openness() { return open; },
    /** Use a sprite for the satchel icon (drawn at the top right, 4 px from the edges). @param {string | null} name */
    setSprite(name) { satchelSprite = name; },
    /** Screen centre of an item's cell (for tools and tests). @param {string} id */
    cellOf(id) { const i = items().indexOf(id); return i < 0 ? null : { x: cellX(i) + 12, y: barY() + 12 }; },
    bagCentre() { const b = bagBox(); return { x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) }; },
  };
})();
