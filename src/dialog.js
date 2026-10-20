// Cutaway.js dialogue trees.
//   Cutaway.dialog("bolt", {
//     main: [
//       { text: "How are you?", then: [{ say: "bolt", text: "Rusty." }] },
//       { text: "Can you reach the shelf?", if: "!has:key", once: true, goto: "shelf" },
//       { text: "Bye.", goto: "end" },
//     ],
//     shelf: { enter: [{ say: "bolt", text: "With my long arms? Sure." }], choices: [ ... ] },
//   })
// Started with the action { dialog: "bolt" } (or { dialog: "bolt", node: "shelf" }). The choices
// show at the bottom; the active actor says the chosen line (unless `silent`), then `then` runs and
// the dialogue moves to `goto` (or stays on the node). `goto: "end"` ends it, as does a node with no
// choices left. `once` choices disappear after use.
"use strict";

/**
 * @typedef {object} Choice
 * @property {string} text
 * @property {Cond} [if]
 * @property {boolean} [once]
 * @property {boolean} [silent]   don't say the line, just run `then`
 * @property {Script} [then]
 * @property {string} [goto]      node id or "end"
 */
/** @typedef {Choice[] | {enter?: Script, choices: Choice[]}} DialogNode */

/** Define a dialogue tree: `Cutaway.dialog(id, { nodeId: [choices], ... })`; the first node starts. */
Cutaway.dialog = (function () {
  /** @type {Map<string, Record<string, DialogNode>>} */
  const defs = new Map();
  /** @param {string} id @param {Record<string, DialogNode>} nodes */
  function dialog(id, nodes) { defs.set(id, nodes); return id; }
  /** @param {string} id */
  dialog.get = (id) => defs.get(id) ?? null;
  dialog.ids = () => [...defs.keys()];
  return dialog;
})();

Cutaway.dialogs = (function () {
  const LINE = 10;
  /** @type {{texts: string[], hover: number, pick: (i: number) => void} | null} */
  let menu = null;
  /** @type {((texts: string[], at: {dialog: string, node: string}) => number | Promise<number>) | null} */
  let chooser = null;

  /** @returns {{x: number, y: number, h: number}} */
  function geometry() {
    const n = menu ? menu.texts.length : 0, h = n * LINE + 6;
    return { x: 8, y: Cutaway.display.height - h, h };
  }

  /** @param {number} x @param {number} y */
  function indexAt(x, y) {
    if (!menu) return -1;
    const g = geometry(), i = Math.floor((y - g.y - 3) / LINE);
    return y >= g.y && i >= 0 && i < menu.texts.length ? i : -1;
  }

  /**
   * Show choices and wait for one.
   * @param {string[]} texts
   * @returns {Promise<number>}
   */
  function choose(texts) {
    return new Promise((resolve) => {
      menu = { texts, hover: -1, pick: (i) => { menu = null; resolve(i); } };
      Cutaway.events.emit("dialog.choices", { texts });
    });
  }

  /** @param {DialogNode} n */
  function choicesOf(n) { return Array.isArray(n) ? n : n.choices; }

  /**
   * Run a dialogue tree until it ends.
   * @param {string} id
   * @param {string} [start]
   */
  async function run(id, start) {
    const tree = Cutaway.dialog.get(id);
    if (!tree) throw new Error(`Cutaway: no dialog "${id}"`);
    let node = start ?? Object.keys(tree)[0], entered = "";
    for (let guard = 0; guard < 1000; guard++) {
      const n = tree[node];
      if (!n) throw new Error(`Cutaway: dialog "${id}" has no node "${node}"`);
      if (!Array.isArray(n) && n.enter && entered !== node) await Cutaway.script.exec(n.enter, { path: `dialog.${id}.${node}.enter` });
      entered = node;
      const all = choicesOf(n).map((c, i) => ({ c, i }));
      const open = all.filter(({ c, i }) => Cutaway.state.test(c.if) && !(c.once && Cutaway.state.flag(`~dlg.${id}.${node}.${i}`)));
      if (!open.length) return;
      const texts = open.map(({ c }) => Cutaway.i18n.t(c.text));
      const k = chooser ? await chooser(texts, { dialog: id, node }) : await choose(texts);
      if (!(k >= 0 && k < open.length)) return;              // a chooser may end the dialogue
      const { c, i } = open[k];
      if (c.once) Cutaway.state.set(`~dlg.${id}.${node}.${i}`);
      const path = `dialog.${id}.${node}.${i}`;
      if (!c.silent) await Cutaway.script.exec({ say: c.text }, { path: path + ".say", after: () => Cutaway.script.speaks(c.then) });
      if (c.then) await Cutaway.script.exec(c.then, { path });
      if (c.goto === "end") return;
      if (c.goto) node = c.goto;
    }
  }

  /** @type {UiLayer} */
  const layer = {
    z: 80, modal: true,
    click(p) {
      if (!menu) return false;
      const i = indexAt(p.x, p.y);
      if (i >= 0 && p.button === 0) menu.pick(i);
      return true;
    },
    hover(x, y) {
      if (!menu) return undefined;
      menu.hover = indexAt(x, y);
      return null;
    },
    render(ctx) {
      if (!menu) return;
      const g = geometry(), f = Cutaway.ui.font(), s = Cutaway.ui.style, color = Cutaway.scene.active?.color ?? "#c8c8ff";
      ctx.fillStyle = s.panel;
      ctx.fillRect(0, g.y, Cutaway.display.width, g.h);
      menu.texts.forEach((t, i) => {
        f.draw(ctx, t, g.x, g.y + 3 + i * LINE, { color: i === menu?.hover ? "#ffffff" : color, outline: s.outline });
      });
    },
  };

  return {
    run, choose,
    /** The open choices, if any (for tools and tests). */
    get choices() { return menu ? menu.texts.slice() : null; },
    /** Screen point of a choice line (for tools). @param {number} i */
    choicePoint(i) { const g = geometry(); return { x: g.x + 10, y: g.y + 3 + i * LINE + 3 }; },
    /** Pick a choice by index (for tools and tests). @param {number} i */
    pick(i) { menu?.pick(i); },
    /**
     * Answer choices in code instead of the menu (tools: solver, autoplay). null = the menu again.
     * @param {((texts: string[], at: {dialog: string, node: string}) => number | Promise<number>) | null} fn
     */
    setChooser(fn) { chooser = fn; },
    init() {
      Cutaway.ui.addLayer(layer);
      Cutaway.script.action("dialog", (s) => run(s.dialog, s.node));
      Cutaway.events.on("key", (k) => {
        const n = Number(k.key);
        if (menu && n >= 1 && n <= menu.texts.length) menu.pick(n - 1);
      });
    },
  };
})();
