// Cutaway.js default interface: modern and verb-less.
//   Left click: on a hotspot, walk there and do its default action (talk, use, take or exit, the
//   first one it has); on the floor, walk. A double click (or tap) runs. Right click (or a long
//   press): look at it.
//   Hovering a hotspot shows its name next to the cursor. Speech appears above the speaker in the
//   speaker's colour; a click skips the current line. Each line ends in a mark: an arrow if another
//   line follows, a square if it is the last. The player's settings may make lines wait for a
//   click (the arrow bobs when its time is up), put a box behind them, swap what the mouse's
//   buttons do in the room, make every walk a run, show the touch buttons for the mouse too.
//   Holding an inventory item: click a hotspot or actor to use the item on it, right click to put
//   it back.
//   Touch: a tap acts, holding looks; a finger shows the label of what it is on; taps that miss a
//   hotspot by a few pixels still hit it. Tab (or the eye button, shown once the screen is touched)
//   marks every hotspot for a moment; the menu button opens the pause menu. The hint button (a bulb,
//   for mouse and touch, when the game has hints) shows what to try next.
//   Going through an exit, party members who follow head for it too; an exit's `door` (a hidden
//   prop: the door standing open) shows as the actor gets there, a moment before the room changes.
// Other parts of the interface (satchel, portraits, dialogue choices, the menu) plug in as layers.
// In a cutscene (a sequence plays: setCutscene) only lines and the modal layers (cards, the menu) show:
// no cursor, labels, marks, satchel, portraits or buttons.
// Everything visual is a skin setting (Cutaway.ui.skin({...})): cursor sprites, font, colours.
"use strict";

/**
 * @typedef {object} Skin
 * @property {string} [cursor]        sprite name (anchor = its hot spot); unset = built-in arrow
 * @property {string} [cursorHot]     sprite over a hotspot
 * @property {[number, number]} [cursorAnchor]
 * @property {string} [font]          font name (default: the default font)
 * @property {string} [labelColor]
 * @property {string} [outline]       outline colour of labels and subtitles
 * @property {string} [accent]        highlight colour (active portrait, hovered choice)
 * @property {string} [panel]         translucent panel colour (satchel bar, choices, menu)
 * @property {number} [lineWidth]     subtitle wrap width in pixels
 * @property {number} [msPerChar]     subtitle time per character
 * @property {number} [minLineMs]
 * @property {number} [touchReach]    touch: a tap this many pixels off a hotspot still hits it
 * @property {{menu?: string, hotspots?: string, hint?: string}} [buttons]  sprites for the buttons (default: built in)
 * @property {{outline?: string, light?: string, face?: string, dark?: string, fill?: string, plate?: string, rivet?: string,
 *   rivetLight?: string, rivetDark?: string, hover?: string}} [frame]  the menu's frame: its bevel (light, face, dark),
 *   the fill inside, the heading's plate, the fittings at the corners (rivet), the band under the chosen row
 */
/**
 * A part of the interface drawn over the room.
 * @typedef {object} UiLayer
 * @property {number} z               higher layers get clicks first and draw last
 * @property {boolean} [modal]        gets clicks even while a script runs or a line shows
 * @property {(p: {x: number, y: number, button: number}) => boolean} [click]  true = handled
 * @property {(x: number, y: number) => (string | null | undefined)} [hover]   label under the pointer
 * @property {(ctx: CanvasRenderingContext2D) => void} [render]
 * @property {(dt: number) => void} [update]
 */
/** @typedef {{id: string, def: HotspotDef, poly: {x: number, y: number}[], actor?: string}} Hotspot */

Cutaway.ui = (function () {
  /** @type {Required<Omit<Skin, "cursor" | "cursorHot" | "cursorAnchor" | "font" | "buttons" | "frame">> & Skin} */
  const skin = { labelColor: "#ffffff", outline: "#1a1426", accent: "#ffe14a", panel: "rgba(20, 16, 32, 0.78)",
    lineWidth: 200, msPerChar: 55, minLineMs: 1400, touchReach: 7 };

  // built-in arrow cursor (white with a dark outline), hot spot at its tip
  const ARROW = ["k.......", "kk......", "kwk.....", "kwwk....", "kwwwk...", "kwwwwk..", "kwwwwwk.", "kwwwkkkk", "kwkwk...", "kk.kwk..", "k...kk.."];
  /** @type {HTMLCanvasElement | null} */
  let arrow = null;

  /** @type {{actor: InstanceType<typeof Cutaway.actor.Actor> | null, lines: string[], color: string, until: number, done: () => void, since: number, more: boolean, waiting?: boolean} | null} */
  let line = null;
  /** The player's choices (Cutaway.settings): lines wait for a click, a box behind them, ... */
  const opts = { advance: /** @type {"auto" | "click"} */ ("auto"), textBox: false, swap: false, alwaysRun: false, buttons: false, hintButton: true };
  /** @type {Hotspot | null} */
  let hover = null;
  /** @type {string | null} label from a layer under the pointer */
  let layerLabel = null;
  /** @type {UiLayer[]} */
  const layers = [];
  /** @type {string | null} the inventory item on the cursor */
  let held = null;
  let clickSeq = 0, pointerType = "mouse", visible = true, hud = true, cutscene = false, textSpeed = 1, markUntil = 0, markHeld = false;
  /** the click that started the current approach was a double click: run there */
  let running = false;
  const DOOR_MS = 260;                                   // an exit's door stands open this long before the room changes
  /** @type {{text: string, x: number, y: number, until: number} | null} what a finger is on */
  let touchLabel = null;
  // buttons (12x11): a bulb (hint), an eye (show hotspots) and three bars (menu)
  const ICONS = {
    hint: ["....kkkk....", "...kyyyyk...", "..kyywwyyk..", "..kywyyyyk..", "..kyyyyyyk..", "..kyyyyyyk..", "...kyyyyk...", "....kwwk....", "....kkkk....", "....kwwk....", ".....kk....."],
    hotspots: ["............", "....kkkk....", "..kkwwwwkk..", ".kwwwkkwwwk.", "kwwwkyykwwwk", "kwwwkyykwwwk", ".kwwwkkwwwk.", "..kkwwwwkk..", "....kkkk....", "............", "............"],
    menu: ["kkkkkkkkkkkk", "kwwwwwwwwwwk", "kkkkkkkkkkkk", "............", "kkkkkkkkkkkk", "kwwwwwwwwwwk", "kkkkkkkkkkkk", "............", "kkkkkkkkkkkk", "kwwwwwwwwwwk", "kkkkkkkkkkkk"],
  };
  /** @type {Record<string, HTMLCanvasElement>} */
  const iconCache = {};

  function font() { return Cutaway.font.get(skin.font); }

  /**
   * Show a line above an actor until its time is up or the player clicks.
   * @param {InstanceType<typeof Cutaway.actor.Actor>} actor
   * @param {string} text
   * @param {{id?: string, more?: boolean, source?: string, minMs?: number}} [o]  id = the line's id; more = another line follows
   *   (its mark); source = the text in the game's data (recorded voices are kept by it); minMs = it shows at least this long
   * @returns {Promise<void>}
   */
  function say(actor, text, o = {}) {
    finishLine();
    const ms = Math.max(lineMs(text), o.minMs ?? 0);
    return new Promise((done) => {
      line = { actor, lines: font().wrap(text, skin.lineWidth), color: actor.color, until: Cutaway.clock.time + ms, done, since: Cutaway.clock.time, more: !!o.more };
      if (actor.state === "idle") actor.setState("talk");
      Cutaway.events.emit("say", { actor: actor.id, text, id: o.id, ms, source: o.source ?? text });
    });
  }

  /**
   * A line from nobody in particular, at the top of the screen.
   * @param {string} text
   * @param {{more?: boolean}} [o]  more = another line follows (its mark)
   * @returns {Promise<void>}
   */
  function narrate(text, o = {}) {
    finishLine();
    const ms = lineMs(text);
    return new Promise((done) => {
      line = { actor: null, lines: font().wrap(text, 260), color: "#ffffff", until: Cutaway.clock.time + ms, done, since: Cutaway.clock.time, more: !!o.more };
    });
  }

  /** How long a line stays (the text speed setting stretches it). @param {string} text */
  function lineMs(text) { return Math.max(skin.minLineMs, text.length * skin.msPerChar) * textSpeed; }

  function finishLine() {
    if (!line) return;
    const l = line;
    line = null;
    if (l.actor && l.actor.state === "talk") l.actor.setState("idle");
    Cutaway.events.emit("say.end", { actor: l.actor?.id });
    l.done();
  }

  /** The default action of a hotspot: the first of talk, use, take, exit it defines. @param {HotspotDef} h */
  function verbOf(h) {
    for (const v of /** @type {const} */ (["talk", "use", "take", "exit"])) if (h[v] !== undefined) return v;
    return "look";
  }

  /**
   * Walk the active actor to a hotspot. Resolves false if the player clicked elsewhere meanwhile.
   * @param {Hotspot} h
   */
  async function approach(h) {
    const a = Cutaway.scene.active, seq = ++clickSeq;
    if (!a) return false;
    let [x, y] = h.def.walkTo ?? [0, 0];
    if (!h.def.walkTo) {                               // the walkable point nearest to its bottom middle
      const xs = h.poly.map((p) => p.x), bottom = Math.max(...h.poly.map((p) => p.y));
      let cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
      if (h.actor) cx += a.x < cx ? -18 : 18;          // stand beside other actors, not in them
      const n = Cutaway.scene.walkMap?.nearest({ x: cx, y: h.actor ? bottom : bottom + 2 });
      x = n ? n.x : a.x; y = n ? n.y : a.y;
    }
    await a.walkTo(x, y, running);
    if (seq !== clickSeq) return false;
    if (h.def.face) a.face(h.def.face);
    else if (h.actor) {                                // face each other
      const other = Cutaway.actors.get(h.actor);
      if (other) { a.face(other.x < a.x ? "left" : "right"); other.face(a.x < other.x ? "left" : "right"); }
    }
    return true;
  }

  /**
   * Party members who go along through an exit head for it with the one played, each a step further
   * back on the way they come from (the room changes once the one played is there).
   * @param {Hotspot} h
   */
  function followToExit(h) {
    const a = Cutaway.scene.active, map = Cutaway.scene.walkMap, to = h.def.walkTo;
    if (!a || !map || !to) return;
    Cutaway.party.followers(Cutaway.scene.room?.id ?? null, a.id).forEach((m, i) => {
      const f = Cutaway.actors.get(m);
      if (!f) return;
      const dx = f.x - to[0], dy = f.y - to[1], d = Math.hypot(dx, dy) || 1, back = Math.min(d, 14 * (i + 1));
      const p = map.nearest({ x: to[0] + (dx / d) * back, y: to[1] + (dy / d) * back });
      if (p) f.walkTo(Math.round(p.x), Math.round(p.y), running);
    });
  }

  /**
   * Do something with a hotspot: "act" (its default action), "look", or use an item on it.
   * @param {string} id
   * @param {"act" | "look"} how
   * @param {string} [item]
   */
  async function interact(id, how, item) {
    const h = Cutaway.scene.hotspots().find((q) => q.id === id);
    if (!h) return;
    const room = Cutaway.scene.room?.id ?? "";
    const base = h.actor ? `actor.${h.actor}` : `${room}.${id}`;
    if (item) {
      if (!(await approach(h))) return;
      const a = Cutaway.scene.active, mate = h.actor && Cutaway.party.has(h.actor) && !(a && Cutaway.state.sameBag(a.id, h.actor));
      const s = h.def.with?.[item] ?? h.def.with?.["*"] ?? (mate ? [{ give: item, to: h.actor }, { remove: item }] : "@cutaway.with");
      await Cutaway.script.run(s, { path: `${base}.with.${item}`, hotspot: h.actor ? undefined : id, item });
      return;
    }
    const verb = how === "look" ? "look" : verbOf(h.def);
    if (verb === "look") {
      await Cutaway.script.run(h.def.look ?? "@cutaway.look", { path: `${base}.look`, hotspot: id });
      return;
    }
    if (verb === "exit") followToExit(h);
    if (!(await approach(h))) return;
    if (verb === "exit") {
      const e = /** @type {ExitDef} */ (h.def.exit);
      if (e.door && !Cutaway.script.fast) {             // the door opens, a moment to see it, then through
        Cutaway.scene.showProp(e.door);
        if (e.sfx) Cutaway.events.emit("sfx", { sfx: e.sfx, at: h.def.walkTo });
        await Cutaway.clock.wait(DOOR_MS);
      }
      await Cutaway.script.run({ goto: e.to, at: e.at, face: e.face }, { path: `${base}.exit`, hotspot: id });
      return;
    }
    await Cutaway.script.run(h.def[verb], { path: `${base}.${verb}`, hotspot: h.actor ? undefined : id });
  }

  function sortedLayers() { return layers.slice().sort((a, b) => b.z - a.z); }
  /** @param {UiLayer} l */
  function addLayer(l) { layers.push(l); }

  /**
   * The hotspot under a room point; for a finger also one a few pixels away (the nearest).
   * @param {number} x @param {number} y @param {boolean} [touch]
   */
  function hotspotNear(x, y, touch) {
    const h = Cutaway.scene.hotspotAt(x, y);
    if (h || !touch) return h;
    for (let r = 1; r <= (skin.touchReach ?? 7); r++) {
      for (let i = 0; i < 8 * r; i++) {
        const a = (i / (8 * r)) * Math.PI * 2, q = Cutaway.scene.hotspotAt(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r));
        if (q) return q;
      }
    }
    return null;
  }

  /** @param {{x: number, y: number, button: number, touch?: boolean, double?: boolean}} p */
  function onClick(p) {
    running = !!p.double || opts.alwaysRun;
    for (const l of sortedLayers()) if (l.modal && l.click?.(p)) return;
    if (line && Cutaway.clock.time - line.since > 120) { finishLine(); return; }   // skip the line
    if (Cutaway.script.busy) return;
    for (const l of sortedLayers()) if (!l.modal && l.click?.(p)) return;
    if (opts.swap && !p.touch) p = { ...p, button: p.button === 2 ? 0 : 2 };
    const w = Cutaway.scene.toWorld(p.x, p.y), h = hotspotNear(w.x, w.y, p.touch);
    if (held) {
      const item = held;
      held = null;
      if (h && p.button === 0) interact(h.id, "act", item);
      return;
    }
    if (h) { interact(h.id, p.button === 2 ? "look" : "act"); return; }
    const a = Cutaway.scene.active;
    if (a && p.button === 0) { clickSeq++; a.walkTo(w.x, w.y, running); }
  }

  /** @param {number} dt */
  function update(dt) {
    if (line && !line.waiting && Cutaway.clock.time >= line.until) {
      if (opts.advance !== "click") finishLine();
      else {                                           // its time is up: stop talking, wait for the player
        line.waiting = true;
        if (line.actor && line.actor.state === "talk") line.actor.setState("idle");
      }
    }
    for (const l of layers) l.update?.(dt);
  }

  function refreshHover() {
    const x = Cutaway.input.x, y = Cutaway.input.y;
    layerLabel = null; hover = null;
    if (!Cutaway.input.inside) return;
    for (const l of sortedLayers()) {
      if (!l.hover || (!l.modal && Cutaway.script.busy)) continue;
      const label = l.hover(x, y);
      if (label !== undefined) { layerLabel = label; return; }   // null = over the layer, no label
    }
    if (Cutaway.script.busy) return;
    const w = Cutaway.scene.toWorld(x, y);
    hover = Cutaway.scene.hotspotAt(w.x, w.y);
  }

  /** @param {string} id */
  function itemName(id) { return Cutaway.i18n.t(Cutaway.item.get(id)?.name ?? id); }

  /** What a finger is on: a layer's label (portraits, items) or a hotspot's name. @param {{x: number, y: number}} p */
  function onPress(p) {
    touchLabel = null;
    if (line || Cutaway.script.busy) return;
    let text = null;
    for (const l of sortedLayers()) {
      if (!l.hover) continue;
      const label = l.hover(p.x, p.y);
      if (label !== undefined) { text = label; break; }
    }
    if (text === null) {
      const w = Cutaway.scene.toWorld(p.x, p.y), h = hotspotNear(w.x, w.y, true);
      if (h) text = Cutaway.i18n.t(h.def.name ?? h.id);
    }
    if (text) touchLabel = { text, x: p.x, y: p.y, until: Infinity };
  }

  /** Mark every hotspot for a while (ms); Tab marks them while held. @param {number} [ms] */
  function showHotspots(ms = 1600) { markUntil = Cutaway.clock.time + ms; }

  /** @param {CanvasRenderingContext2D} ctx */
  function renderMarks(ctx) {
    if (!markHeld && Cutaway.clock.time >= markUntil) return;
    if (Cutaway.script.busy || line) return;
    const pulse = Math.floor(Cutaway.clock.time / 300) % 2;
    for (const h of Cutaway.scene.hotspots()) {
      const p = Cutaway.debug.pointOn(h.id);
      if (!p) continue;
      const x = Math.round(p.x), y = Math.round(p.y), r = 3 + pulse;
      ctx.fillStyle = skin.outline;
      ctx.fillRect(x - r - 1, y - 1, 2 * r + 3, 3); ctx.fillRect(x - 1, y - r - 1, 3, 2 * r + 3);
      ctx.fillStyle = skin.accent;
      ctx.fillRect(x - r, y, 2 * r + 1, 1); ctx.fillRect(x, y - r, 1, 2 * r + 1);
    }
  }

  /** Built-in button icon. @param {"menu" | "hotspots" | "hint"} k */
  function icon(k) {
    if (iconCache[k]) return iconCache[k];
    const rows = ICONS[k], c = document.createElement("canvas");
    c.width = rows[0].length; c.height = rows.length;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = ch === "k" ? skin.outline : ch === "y" ? skin.accent : "#ffffff";
      g.fillRect(x, y, 1, 1);
    }));
    return (iconCache[k] = c);
  }

  /** The buttons left of the satchel: the hint (if the game has hints), then for touch the eye and the menu. */
  function buttonBoxes() {
    const bag = Cutaway.inventory.bagCentre(), y = 5;
    /** @type {{k: "hint" | "hotspots" | "menu", x: number, y: number, w: number, h: number, sprite: string | undefined}[]} */
    const out = [];
    if (!Cutaway.scene.active || Cutaway.script.busy || Cutaway.inventory.openness > 0 || Cutaway.menu.isOpen) return out;
    /** @type {("hint" | "hotspots" | "menu")[]} */
    const kinds = [...(Cutaway.hints.any() && opts.hintButton ? /** @type {const} */ (["hint"]) : []),
      ...(Cutaway.input.touched || opts.buttons ? /** @type {const} */ (["hotspots", "menu"]) : [])];
    let x = bag.x - 12;
    for (const k of kinds) {
      const sprite = skin.buttons?.[k], f = sprite ? Cutaway.assets.get(sprite)?.frames[0] : null;
      const w = f ? f.w : 12, h = f ? f.h : 11;
      x -= w + 8;
      out.push({ k, x, y, w, h, sprite });
    }
    return out;
  }

  /** The button under a point. @param {number} x @param {number} y */
  function buttonAt(x, y) {
    return buttonBoxes().find((b) => x >= b.x - 3 && x < b.x + b.w + 3 && y >= b.y - 4 && y < b.y + b.h + 4) ?? null;
  }

  /** @type {UiLayer} */
  const buttons = {
    z: 45,
    click(p) {
      const b = buttonAt(p.x, p.y);
      if (!b) return false;
      if (b.k === "menu") Cutaway.menu.open(); else if (b.k === "hint") Cutaway.hints.ask(); else showHotspots();
      return true;
    },
    hover(x, y) {
      const b = buttonAt(x, y);
      return b ? Cutaway.i18n.t("@cutaway.button." + b.k) : undefined;
    },
    render(ctx) {
      for (const b of buttonBoxes()) {
        if (b.sprite) Cutaway.assets.draw(ctx, b.sprite, b.x, b.y, { anchor: [0, 0] });
        else ctx.drawImage(icon(b.k), b.x, b.y);
      }
    },
  };

  /** @param {CanvasRenderingContext2D} ctx */
  function render(ctx) {
    const f = font(), W = Cutaway.display.width;
    refreshHover();
    if (hud && !cutscene) renderMarks(ctx);
    if (line) {
      const lh = f.lineHeight, n = line.lines.length;
      let x = W / 2, y = 6;
      if (line.actor && line.actor.room === Cutaway.scene.room?.id) {   // a voice from another room: at the top
        const s = Cutaway.scene.toScreen(line.actor.x, line.actor.y);
        x = s.x; y = s.y - line.actor.height() - 4 - n * lh;
      }
      const wMax = Math.max(...line.lines.map((l) => f.measure(l))), pad = opts.textBox ? 3 : 0;
      // its mark after the last word, all the time it shows: an arrow if another line follows, a square
      // if it is the last; once a line waits for a click, the arrow bobs. Room is kept for it on the right.
      x = Cutaway.util.clamp(Math.round(x), Math.ceil(wMax / 2) + 2 + pad, W - Math.ceil(wMax / 2) - 10 - pad);
      y = Math.max(2 + pad, Math.round(y));
      const last = line.lines[n - 1], ax = x + Math.ceil(f.measure(last) / 2) + 3, left = x - Math.ceil(wMax / 2) - pad;
      if (opts.textBox) {
        ctx.fillStyle = skin.panel;
        ctx.fillRect(left, y - pad, Math.max(wMax + 2 * pad + 1, ax + 6 + pad - left), n * lh + 2 * pad - 1);
      }
      line.lines.forEach((l, i) => f.draw(ctx, l, x, y + i * lh, { color: line?.color, outline: skin.outline, align: "center" }));
      const bob = line.waiting && line.more && Math.floor((Cutaway.clock.time - line.until) / 400) % 2 === 1 ? 1 : 0;
      const ay = y + (n - 1) * lh + 2 + bob;
      ctx.fillStyle = skin.outline;
      if (line.more) {
        ctx.fillRect(ax - 1, ay - 1, 7, 3); ctx.fillRect(ax, ay + 2, 5, 2); ctx.fillRect(ax + 1, ay + 4, 3, 1); ctx.fillRect(ax + 2, ay + 5, 1, 1);
        ctx.fillStyle = line.color;
        ctx.fillRect(ax, ay, 5, 1); ctx.fillRect(ax + 1, ay + 1, 3, 1); ctx.fillRect(ax + 2, ay + 2, 1, 1);
      } else {
        ctx.fillRect(ax, ay - 1, 5, 5);
        ctx.fillStyle = line.color;
        ctx.fillRect(ax + 1, ay, 3, 3);
      }
    }
    if (hud) for (const l of layers.slice().sort((a, b) => a.z - b.z)) if (!cutscene || l.modal) l.render?.(ctx);
    if (cutscene) return;
    if (touchLabel && pointerType !== "mouse" && Cutaway.clock.time < touchLabel.until && !line) {
      const lw = f.measure(touchLabel.text);           // above the finger, where it can be seen
      const lx = Cutaway.util.clamp(touchLabel.x - Math.floor(lw / 2), 2, W - lw - 2), ly = Cutaway.util.clamp(touchLabel.y - 22, 2, Cutaway.display.height - 10);
      f.draw(ctx, touchLabel.text, lx, ly, { color: skin.labelColor, outline: skin.outline });
    }
    if (!visible || !Cutaway.input.inside || pointerType !== "mouse") return;
    const mx = Cutaway.input.x, my = Cutaway.input.y;
    let label = layerLabel ?? (hover ? Cutaway.i18n.t(hover.def.name ?? hover.id) : null);
    if (held && hover) label = Cutaway.i18n.t("@cutaway.useWith").replace("{item}", itemName(held)).replace("{target}", label ?? "");
    else if (held && !layerLabel) label = itemName(held);
    if (label && !(line && !held)) {
      const lw = f.measure(label);
      let lx = mx + 10, ly = my - 3;
      if (lx + lw > W - 2) lx = mx - 4 - lw;
      ly = Cutaway.util.clamp(ly, 2, Cutaway.display.height - 10);
      f.draw(ctx, label, lx, ly, { color: skin.labelColor, outline: skin.outline });
    }
    if (held) {
      const icon = Cutaway.item.get(held)?.icon;
      if (icon) { Cutaway.assets.draw(ctx, icon, mx, my, { anchor: centre(icon) }); return; }
    }
    const name = (hover || layerLabel) && skin.cursorHot ? skin.cursorHot : skin.cursor;
    if (name) Cutaway.assets.draw(ctx, name, mx, my, { t: Cutaway.clock.time, anchor: skin.cursorAnchor ?? [0, 0] });
    else ctx.drawImage(arrowImage(), mx, my);
  }

  /** Anchor that centres a sprite on a point. @param {string} name @returns {[number, number]} */
  function centre(name) {
    const a = Cutaway.assets.get(name), f = a?.frames[0];
    return f ? [Math.floor(f.w / 2), Math.floor(f.h / 2)] : [0, 0];
  }

  function arrowImage() {
    if (arrow) return arrow;
    arrow = document.createElement("canvas");
    arrow.width = 8; arrow.height = ARROW.length;
    const c = /** @type {CanvasRenderingContext2D} */ (arrow.getContext("2d"));
    ARROW.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === ".") return;
      c.fillStyle = ch === "k" ? "#1a1426" : "#ffffff";
      c.fillRect(x, y, 1, 1);
    }));
    return arrow;
  }

  function init() {
    Cutaway.events.on("pointer.click", onClick);
    Cutaway.events.on("pointer.press", onPress);
    Cutaway.events.on("pointer.release", () => { if (touchLabel) touchLabel.until = Cutaway.clock.time + 700; });
    Cutaway.events.on("key", (k) => { if (k.code === "Tab") { markHeld = true; k.event.preventDefault(); } });
    Cutaway.events.on("key.up", (k) => { if (k.code === "Tab") markHeld = false; });
    Cutaway.events.on("key", (k) => {                  // Space, Enter or "." skips the current line
      if ((k.code === "Space" || k.code === "Enter" || k.code === "NumpadEnter" || k.code === "Period") && line && !Cutaway.menu.isOpen && Cutaway.clock.time - line.since > 120) { finishLine(); k.event.preventDefault(); }
    });
    addLayer(buttons);
    Cutaway.display.screen.style.cursor = "none";
    Cutaway.display.screen.addEventListener("pointermove", (e) => { pointerType = e.pointerType; });
    Cutaway.display.screen.addEventListener("pointerdown", (e) => { pointerType = e.pointerType; });
    Cutaway.clock.onUpdate(update);
    Cutaway.events.on("room.enter", () => { held = null; });
  }

  return {
    init, render, say, narrate, interact, verbOf, centre,
    /** @param {Skin} s */
    skin(s) { Object.assign(skin, s); },
    get style() { return skin; },
    font,
    addLayer,
    showHotspots,
    /** Screen centre of a button ("hint", "hotspots", "menu") if it shows (for tools). @param {string} k */
    buttonPoint(k) { const b = buttonBoxes().find((q) => q.k === k); return b ? { x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) } : null; },
    /**
     * The player's choices from Cutaway.settings: `advance` "click" (lines wait for a click), `textBox`
     * (a box behind lines), `swap` (in the room the left button looks, the right one acts), `alwaysRun`,
     * `buttons` (the eye and menu buttons without touching first), `hintButton`.
     * @param {Partial<typeof opts>} o
     */
    configure(o) { Object.assign(opts, o); },
    /** Text speed: line time is multiplied by this (0.7 = fast, 1.5 = slow). @param {number} k */
    setTextSpeed(k) { textSpeed = k; },
    get textSpeed() { return textSpeed; },
    /** The hotspot under the pointer, if any. */
    get hover() { return hover; },
    /** The line on screen, if any. */
    get line() { return line ? { actor: line.actor?.id ?? null, text: line.lines.join(" "), waiting: !!line.waiting, more: line.more } : null; },
    /** The inventory item on the cursor. */
    get held() { return held; },
    /** @param {string | null} id */
    hold(id) { held = id; },
    /** Skip the current line. */
    skip() { finishLine(); },
    /** Hide the cursor and labels. @param {boolean} v */
    setVisible(v) { visible = v; },
    /** A cutscene: no cursor, labels, marks or interface layers but the modal ones (cards, the menu). @param {boolean} v */
    setCutscene(v) { cutscene = v; if (v) { held = null; touchLabel = null; } },
    get cutscene() { return cutscene; },
    /** Draw the interface's layers (portraits, satchel, buttons, menus) and marks; subtitles always show (the editor turns them off). @param {boolean} v */
    setHud(v) { hud = v; },
    get hud() { return hud; },
  };
})();
