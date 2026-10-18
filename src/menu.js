// Cutaway.js menu and cards.
// Esc (or the touch menu button) opens the pause menu: continue, hint, save, load (autosave and slots),
// settings, language, fullscreen, back to the title. The settings have pages of their own: sound,
// text and dialogue, picture, controls. Mouse, touch and keys (arrows, Enter, Esc) all work. Value rows
// show a meter: click it where you want the value, or use left and right; option rows show "< value >"
// and step through their options (left and right, or a click; on the left arrow it steps back).
// Pages sit in a bevelled frame with fittings at the corners and the heading on a plate across the
// top edge, the way menus looked in the late eighties (colours: the skin's `frame`). Other modules show
// their own pages with the same look (the title screen: `page`).
// Cards are full-screen texts that wait for a click (act titles, the end), optionally with a heading
// above and buttons below ("end of the demo": a link, back to the title):
//   { card: "The Hall", title: "Act 1" }
"use strict";

/**
 * A menu row: an action (`more`: it opens a page), a value (a meter 0..1 with `value`/`set`), options
 * (`options` as [value, label] pairs with `get`/`pick`) or a text with `text` that `run` cycles.
 * @typedef {{label: string, run?: () => void, more?: boolean, value?: () => number, set?: (v: number) => void,
 *   text?: () => string, options?: [any, string][], get?: () => any, pick?: (v: any) => void}} Entry
 * How a page shows: `y` its top (default: centred; below 0: its bottom, counted from the screen's), `w` its width, `dim` how dark the room behind gets
 * (0..1), `pause` whether the game stops meanwhile, `fixed` that Esc and right clicks can't leave it
 * (the title screen).
 * @typedef {{y?: number, w?: number, dim?: number, pause?: boolean, fixed?: boolean}} PageLook
 */

Cutaway.menu = (function () {
  // B: the frame's width; TOP: from the frame's top to the first row; PLATE: how far the heading's plate rises above it
  const SLOTS = [1, 2, 3], ROW = 11, W = 200, SEGS = 10, BAR = SEGS * 5 - 1, BUTTON_ROW = 14, B = 6, TOP = 17, PLATE = 5;
  /** @type {Entry[] | null} */
  let entries = null;
  let title = "", hoverIx = -1;
  /** @type {(() => void) | null} what Esc and right click go back to (null = close) */
  let backTo = null;
  /** @type {PageLook} */
  let look = {};
  /** @type {string[]} */
  let languages = ["en"];
  /** @type {{title: string, lines: string[], buttons: string[], hover: number, done: (i: number) => void} | null} */
  let card = null;

  /** @param {string} k */
  function t(k) { return Cutaway.i18n.t("@cutaway.menu." + k); }

  /** The frame's colours: the skin's `frame`, else ones that go with any dark panel. */
  function colours() {
    const s = Cutaway.ui.style, f = s.frame ?? {};
    return { outline: f.outline ?? s.outline, light: f.light ?? "#a89ccc", face: f.face ?? "#6a5c96", dark: f.dark ?? "#3a2f5c",
      fill: f.fill ?? "rgba(20, 16, 32, 0.92)", plate: f.plate ?? s.outline, rivet: f.rivet ?? s.accent, rivetLight: f.rivetLight ?? "#fff4b8",
      rivetDark: f.rivetDark ?? "#a8801c", hover: f.hover ?? "rgba(255, 255, 255, 0.1)" };
  }

  /** A one-pixel ring: top and left in one colour, bottom and right in another. @param {CanvasRenderingContext2D} ctx */
  function ring(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, /** @type {string} */ tl, /** @type {string} */ br) {
    ctx.fillStyle = tl;
    ctx.fillRect(x, y, w - 1, 1); ctx.fillRect(x, y + 1, 1, h - 2);
    ctx.fillStyle = br;
    ctx.fillRect(x + w - 1, y, 1, h); ctx.fillRect(x, y + h - 1, w - 1, 1);
  }

  /**
   * A bevelled frame with fittings at the corners and a shadow; inside, the fill. Pages, cards and
   * buttons use it, games' own pages may too.
   * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h
   * @param {{small?: boolean, fill?: string, shadow?: boolean}} [o]  small: a button's frame (two rings, no fittings)
   */
  function frame(ctx, x, y, w, h, o = {}) {
    const c = colours();
    if (o.shadow !== false) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(x + w, y + 2, 2, h); ctx.fillRect(x + 2, y + h, w - 2, 2);
    }
    const inset = o.small ? 2 : B;
    ctx.fillStyle = o.fill ?? c.fill;
    ctx.fillRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
    ring(ctx, x, y, w, h, c.outline, c.outline);
    ring(ctx, x + 1, y + 1, w - 2, h - 2, c.light, c.dark);
    if (o.small) return;
    ring(ctx, x + 2, y + 2, w - 4, h - 4, c.face, c.face);
    ring(ctx, x + 3, y + 3, w - 6, h - 6, c.face, c.face);
    ring(ctx, x + 4, y + 4, w - 8, h - 8, c.dark, c.light);
    ring(ctx, x + 5, y + 5, w - 10, h - 10, c.outline, c.outline);
    for (const [cx, cy] of [[x, y], [x + w - 7, y], [x, y + h - 7], [x + w - 7, y + h - 7]]) {   // brass fittings
      ctx.fillStyle = c.outline;
      ctx.fillRect(cx, cy, 7, 7);
      ctx.fillStyle = c.rivet;
      ctx.fillRect(cx + 1, cy + 1, 5, 5);
      ring(ctx, cx + 1, cy + 1, 5, 5, c.rivetLight, c.rivetDark);
      ctx.fillStyle = c.rivetDark;
      ctx.fillRect(cx + 3, cy + 3, 1, 1);
    }
  }

  /** How wide a row's value part is (the meter, the options between arrows, a text, the arrow of a page). @param {Entry} e */
  function valueWidth(e) {
    const f = Cutaway.ui.font();
    if (e.value) return BAR;
    // options: as wide as the widest on the page, so the arrows line up
    if (e.options) return Math.max(...(entries ?? [e]).flatMap((q) => (q.options ?? []).map(([, l]) => f.measure(l)))) + 14;
    if (e.text) return f.measure(e.text());
    return e.more ? 4 : 0;
  }

  function geometry() {
    const f = Cutaway.ui.font(), list = entries ?? [], n = list.length, h = TOP + n * ROW + B + 2;
    const need = Math.max(f.measure(title) + 40, ...list.map((e) => 2 * B + 18 + f.measure(e.label) + (valueWidth(e) ? valueWidth(e) + 10 : 0)));
    const SW = Cutaway.display.width, w = Math.min(SW - 6, Math.max(look.w ?? W, need));
    const H = Cutaway.display.height, y = look.y === undefined ? Math.round((H - h + PLATE) / 2) : look.y < 0 ? H + look.y - h : look.y;
    return { x: Math.round((SW - w) / 2), y, w, h };
  }

  /** The top of row i's text. @param {{y: number}} g @param {number} i */
  function rowY(g, i) { return g.y + TOP + i * ROW; }

  /** @param {number} x @param {number} y */
  function indexAt(x, y) {
    const g = geometry(), i = Math.floor((y - rowY(g, 0) + 2) / ROW);
    return entries && x >= g.x + B && x < g.x + g.w - B && i >= 0 && i < entries.length ? i : -1;
  }

  /** Where a row's value part starts and ends (right-aligned). */
  function valueBox(/** @type {Entry} */ e) { const g = geometry(), r = g.x + g.w - B - 6; return { x: r - valueWidth(e), r }; }

  /**
   * Show a page of rows.
   * @param {string} heading @param {Entry[]} list @param {(() => void) | null} [back] @param {PageLook} [o]
   */
  function show(heading, list, back = null, o = {}) {
    title = heading; entries = list; hoverIx = -1; backTo = back; look = o;
    Cutaway.clock.paused = o.pause !== false;
  }

  function close() { entries = null; look = {}; Cutaway.clock.paused = false; }
  function goBack() { if (backTo) backTo(); else if (!look.fixed) close(); }

  /** @param {string | number} slot */
  function slotLabel(slot) {
    const d = Cutaway.save.read(slot);
    const name = slot === "auto" ? t("autosave") : `${t("slot")} ${slot}`;
    if (!d) return `${name}: ${t("empty")}`;
    const room = Cutaway.room.has(d.room) ? Cutaway.i18n.t(Cutaway.room.get(d.room).name ?? d.room) : d.room;
    const when = new Date(d.time), hh = String(when.getHours()).padStart(2, "0"), mm = String(when.getMinutes()).padStart(2, "0");
    return `${name}: ${room} ${when.getDate()}.${when.getMonth() + 1}. ${hh}:${mm}`;
  }

  /** @param {string | number} s */
  async function loadSlot(s) {
    if (!Cutaway.save.read(s)) return;
    close();
    await Cutaway.fx.transition("out");
    await Cutaway.save.load(s);
    Cutaway.fx.transition("in");
  }

  /** The load page; `back` is where it returns to (the pause menu or the title screen). @param {() => void} from @param {PageLook} [o] */
  function loadPage(from, o) {
    show(t("load"), [...["auto", ...SLOTS].map((s) => ({ label: slotLabel(s), run: () => { loadSlot(s); } })), back(from)], from, o);
  }

  function main() {
    const hints = Cutaway.hints?.any(), acts = Cutaway.acts?.hasTitle;
    show(t("title"), [
      { label: t("continue"), run: close },
      ...(hints ? [{ label: t("hint"), run: () => { close(); Cutaway.hints.ask(); } }] : []),
      { label: t("save"), more: true, run: () => show(t("save"), [...SLOTS.map((s) => ({ label: slotLabel(s), run: () => { Cutaway.save.write(s); close(); } })), back(main)], main) },
      { label: t("load"), more: true, run: () => loadPage(main) },
      { label: t("settings"), more: true, run: () => settings(main) },
      ...(languages.length > 1 ? [{ label: t("language"), text: () => Cutaway.i18n.language.toUpperCase(), run: () => {
        const i = languages.indexOf(Cutaway.i18n.language);
        Cutaway.i18n.setLanguage(languages[(i + 1) % languages.length]);
        main();
      } }] : []),
      { label: t("fullscreen"), run: () => { Cutaway.display.toggleFullscreen(); close(); } },
      // (the autosave keeps what happened since the last room change, unless a script is half-way)
      ...(acts ? [{ label: t("toTitle"), run: () => { if (!Cutaway.script.busy) Cutaway.save.write("auto"); close(); Cutaway.acts.toTitle(); } }] : []),
    ]);
  }

  /** @param {() => void} [from] where Back goes (the pause menu by default) @param {PageLook} [o] */
  function settings(from = main, o) {
    const S = Cutaway.settings, here = () => settings(from, o);
    /** @param {string} heading @param {Entry[]} rows */
    const sub = (heading, rows) => ({ label: t(heading), more: true, run: () => show(t(heading), [...rows, back(here)], here, o) });
    /** @param {keyof Settings} k @param {string} label */
    const vol = (k, label) => ({ label: t(label), value: () => Number(S.values[k]), set: (/** @type {number} */ v) => S.set({ [k]: v }) });
    /** A row of options for a setting: [value, label key] pairs. @param {keyof Settings} k @param {string} label @param {[any, string][]} opts */
    const opt = (k, label, opts) => ({ label: t(label), options: opts.map(([v, l]) => /** @type {[any, string]} */ ([v, t(l)])),
      get: () => S.values[k], pick: (/** @type {any} */ v) => S.set({ [k]: v }) });
    /** @param {keyof Settings} k @param {string} label */
    const onOff = (k, label) => opt(k, label, [[false, "off"], [true, "on"]]);
    show(t("settings"), [
      sub("sound", [vol("master", "volume"), vol("music", "music"), vol("sfx", "sfx"), vol("voice", "voice"),
        onOff("voices", "voices"), onOff("muteUnfocused", "muteUnfocused")]),
      sub("text", [opt("textSpeed", "textSpeed", [[2, "verySlow"], [1.5, "slow"], [1, "normal"], [0.7, "fast"]]),
        opt("advance", "advance", [["auto", "auto"], ["click", "onClick"]]), onOff("textBox", "textBox")]),
      sub("picture", [
        { label: t("fullscreen"), text: () => t(typeof document !== "undefined" && document.fullscreenElement ? "on" : "off"), run: () => Cutaway.display.toggleFullscreen() },
        opt("fit", "fit", [["sharp", "sharp"], ["fill", "fill"]]),
        opt("crt", "crt", [["off", "off"], ["scanlines", "scanlines"], ["crt", "tube"]]),
        onOff("motion", "motion")]),
      sub("controls", [opt("swapButtons", "swap", [[false, "normal"], [true, "swapped"]]), onOff("alwaysRun", "alwaysRun"),
        opt("holdMs", "hold", [[300, "short"], [450, "normal"], [700, "long"]]),
        opt("buttons", "buttons", [[false, "auto"], [true, "always"]]), onOff("hintButton", "hintButton")]),
      { label: t("defaults"), run: () => S.reset() },
      back(from),
    ], from, o);
  }

  /** @param {() => void} to */
  function back(to) { return { label: t("back"), run: to }; }

  /** The option a row shows now (its index). @param {Entry} e */
  function optionIndex(e) { return Math.max(0, (e.options ?? []).findIndex(([v]) => v === e.get?.())); }

  /** Step a row: values by a tenth, options to the next or the one before, texts to the next. @param {Entry} e @param {number} dir */
  function adjust(e, dir) {
    if (e.value && e.set) e.set(Math.round(Cutaway.util.clamp(e.value() + dir * 0.1, 0, 1) * 10) / 10);
    else if (e.options && e.pick) { const n = e.options.length; e.pick(e.options[(optionIndex(e) + dir + n) % n][0]); }
    else if (e.text && e.run) e.run();
  }

  /**
   * Show a full-screen card until the player clicks (or, with buttons, picks one).
   * @param {string} text
   * @param {{title?: string, buttons?: string[]}} [o]
   * @returns {Promise<number>} the button picked (-1 without buttons)
   */
  function showCard(text, o = {}) {
    return new Promise((done) => {
      card = { title: o.title ? Cutaway.i18n.t(o.title) : "", lines: Cutaway.ui.font().wrap(Cutaway.i18n.t(text), 260),
        buttons: (o.buttons ?? []).map((b) => Cutaway.i18n.t(b)), hover: -1,
        done: (i) => { card = null; done(i); } };
    });
  }

  /** Where a card's parts go: the heading, the first text line, the first button. */
  function cardLayout() {
    if (!card) return null;
    const f = Cutaway.ui.font(), lh = f.lineHeight, SH = Cutaway.display.height;
    const head = card.title ? lh + 6 : 0, tail = card.buttons.length ? 10 + card.buttons.length * BUTTON_ROW : 0;
    const top = Math.round(SH / 2 - (head + card.lines.length * lh + tail) / 2);
    return { title: top, text: top + head, buttons: top + head + card.lines.length * lh + 10 };
  }

  /** @param {number} x @param {number} y */
  function cardButtonAt(x, y) {
    const L = cardLayout();
    if (!card || !L || !card.buttons.length) return -1;
    const i = Math.floor((y - L.buttons + 3) / BUTTON_ROW), f = Cutaway.ui.font();
    if (i < 0 || i >= card.buttons.length) return -1;
    const w = f.measure(card.buttons[i]) + 16;
    return Math.abs(x - Cutaway.display.width / 2) <= w / 2 ? i : -1;
  }

  /** A small arrow, 3 wide and 5 high, with an outline. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {1 | -1} dir @param {string} color */
  function arrow(ctx, x, y, dir, color) {
    const s = Cutaway.ui.style;
    for (const [c, grow] of /** @type {const} */ ([[s.outline, 1], [color, 0]])) {
      ctx.fillStyle = c;
      for (let i = 0; i < 3; i++) {
        const cx = dir > 0 ? x + i : x + 2 - i, hh = 5 - 2 * i;
        ctx.fillRect(cx - grow, y + i - grow, 1 + 2 * grow, hh + 2 * grow);
      }
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function renderCard(ctx) {
    if (!card) return;
    const L = /** @type {NonNullable<ReturnType<typeof cardLayout>>} */ (cardLayout());
    const f = Cutaway.ui.font(), s = Cutaway.ui.style, SW = Cutaway.display.width, SH = Cutaway.display.height;
    ctx.fillStyle = "#0c0a14";
    ctx.fillRect(0, 0, SW, SH);
    frame(ctx, 4, 4, SW - 8, SH - 8, { fill: "#0c0a14", shadow: false });
    if (card.title) f.draw(ctx, card.title, SW / 2, L.title, { align: "center", color: s.accent, outline: s.outline });
    card.lines.forEach((l, i) => f.draw(ctx, l, SW / 2, L.text + i * f.lineHeight, { align: "center", color: "#fff" }));
    card.buttons.forEach((b, i) => {
      const y = L.buttons + i * BUTTON_ROW, w = f.measure(b) + 14, on = i === card?.hover;
      frame(ctx, Math.round(SW / 2 - w / 2), y - 3, w, 13, { small: true, fill: on ? colours().face : s.panel });
      f.draw(ctx, b, SW / 2, y, { align: "center", color: on ? s.accent : "#fff", outline: s.outline });
    });
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function renderPage(ctx) {
    if (!entries) return;
    const f = Cutaway.ui.font(), s = Cutaway.ui.style, c = colours(), SW = Cutaway.display.width, SH = Cutaway.display.height, g = geometry();
    ctx.fillStyle = `rgba(0, 0, 0, ${look.dim ?? 0.45})`;
    ctx.fillRect(0, 0, SW, SH);
    frame(ctx, g.x, g.y, g.w, g.h);
    const pw = f.measure(title) + 16, px = Math.round(g.x + (g.w - pw) / 2), py = g.y - PLATE;   // the heading's plate across the top edge
    frame(ctx, px, py, pw, 15, { small: true, fill: c.plate });
    ctx.fillStyle = c.face;
    ctx.fillRect(px + 2, py + 2, pw - 4, 1);
    f.draw(ctx, title, g.x + g.w / 2, py + 4, { align: "center", color: s.accent, outline: s.outline });
    entries.forEach((e, i) => {
      const y = rowY(g, i), on = i === hoverIx, color = on ? s.accent : "#ffffff", v = valueBox(e);
      if (on) {
        ctx.fillStyle = c.hover;
        ctx.fillRect(g.x + B + 1, y - 2, g.w - 2 * B - 2, ROW);
        arrow(ctx, g.x + B + 4, y + 1, 1, s.accent);
      }
      f.draw(ctx, e.label, g.x + B + 11, y, { color, outline: s.outline });
      if (e.value) {                                   // a meter of ten lamps, as on an old amplifier
        const lit = Math.round(Cutaway.util.clamp(e.value(), 0, 1) * SEGS);
        ctx.fillStyle = s.outline;
        ctx.fillRect(v.x - 1, y, BAR + 2, 7);
        for (let k = 0; k < SEGS; k++) {
          ctx.fillStyle = k < lit ? color : "rgba(255, 255, 255, 0.16)";
          ctx.fillRect(v.x + k * 5, y + 1, 4, 5);
        }
      } else if (e.options) {
        const txt = (e.options[optionIndex(e)] ?? ["", ""])[1], dim = on ? s.accent : c.light;
        arrow(ctx, v.x, y + 1, -1, dim);
        arrow(ctx, v.r - 3, y + 1, 1, dim);
        f.draw(ctx, txt, Math.round((v.x + 3 + v.r - 3) / 2), y, { color, outline: s.outline, align: "center" });
      } else if (e.text) {
        const txt = e.text();
        f.draw(ctx, txt, v.r - f.measure(txt), y, { color, outline: s.outline });
      } else if (e.more) arrow(ctx, v.r - 3, y + 1, 1, on ? s.accent : c.light);
    });
  }

  /** @type {UiLayer} */
  const layer = {
    z: 100, modal: true,
    click(p) {
      if (card) {
        if (!card.buttons.length) card.done(-1);
        else { const i = cardButtonAt(p.x, p.y); if (i >= 0) card.done(i); }
        return true;
      }
      if (!entries) return false;
      const i = indexAt(p.x, p.y), e = i >= 0 ? entries[i] : null;
      if (!e) { if (p.button === 2) goBack(); return true; }
      hoverIx = i;
      if (e.value && e.set) {
        const b = valueBox(e);
        if (p.button === 2) adjust(e, -1);
        else if (p.x >= b.x - 2 && p.x < b.r + 2) e.set(Math.round(Cutaway.util.clamp((p.x - b.x + 1) / BAR, 0, 1) * 10) / 10);
        else adjust(e, 1);
      } else if (e.options) adjust(e, p.button === 2 || p.x < valueBox(e).x + 6 ? -1 : 1);
      else if (p.button === 0) e.run?.();
      else goBack();
      return true;
    },
    hover(x, y) {
      if (card) { const i = cardButtonAt(x, y); if (i >= 0) card.hover = i; return null; }
      if (!entries) return undefined;
      const i = indexAt(x, y);
      if (i >= 0) hoverIx = i;
      return null;
    },
    render(ctx) {
      if (card) renderCard(ctx);
      else renderPage(ctx);
    },
  };

  /** @param {{code: string, event: KeyboardEvent}} k */
  function onKey(k) {
    if (card) {
      const n = card.buttons.length;
      if (!n) { if (["Escape", "Enter", "Space"].includes(k.code)) card.done(-1); return; }
      if (k.code === "ArrowDown" || k.code === "ArrowUp") card.hover = (card.hover + (k.code === "ArrowDown" ? 1 : n - 1) + (card.hover < 0 ? 1 : 0)) % n;
      else if ((k.code === "Enter" || k.code === "Space") && card.hover >= 0) card.done(card.hover);
      else if (k.code === "Escape") card.done(n - 1);    // the last button is the way out
      else return;
      k.event.preventDefault();
      return;
    }
    if (k.code === "Escape") {
      if (entries) goBack();
      else if (!Cutaway.acts?.titleOpen) main();
      return;
    }
    if (!entries) return;
    const n = entries.length, e = hoverIx >= 0 ? entries[hoverIx] : null;
    if (k.code === "ArrowDown") hoverIx = (hoverIx + 1) % n;
    else if (k.code === "ArrowUp") hoverIx = (hoverIx - 1 + n) % n;
    else if (e && (k.code === "ArrowLeft" || k.code === "ArrowRight")) adjust(e, k.code === "ArrowLeft" ? -1 : 1);
    else if (e && (k.code === "Enter" || k.code === "Space")) { if (e.value || e.options) adjust(e, 1); else e.run?.(); }
    else return;
    k.event.preventDefault();
  }

  return {
    open: main, close, showCard, settings, loadPage, slotLabel, frame,
    /** Show a page of rows with this menu's look (the title screen uses it). */
    page: show,
    get isOpen() { return !!entries; },
    get card() { return card ? [card.title, ...card.lines].filter(Boolean).join(" ") : null; },
    /** The card's buttons (for tools and tests). */
    get cardButtons() { return card ? card.buttons.slice() : null; },
    /** Screen point of a card's button (for tools and tests). @param {number} i */
    cardButtonPoint(i) { const L = cardLayout(); return L && card && i < card.buttons.length ? { x: Cutaway.display.width / 2, y: L.buttons + i * BUTTON_ROW + 3 } : null; },
    /** The rows on screen (for tools and tests). */
    get rows() {
      return entries ? entries.map((e) => e.label + (e.text ? ": " + e.text() : e.value ? ": " + Math.round(e.value() * 100) + "%"
        : e.options ? ": " + (e.options[optionIndex(e)] ?? ["", ""])[1] : "")) : null;
    },
    /** Screen point of a row (for tools and tests). @param {number} i */
    rowPoint(i) { const g = geometry(); return { x: g.x + B + 20, y: rowY(g, i) + 3 }; },
    /** Languages the player can pick from the menu. @param {string[]} list */
    setLanguages(list) { languages = list.slice(); },
    get languages() { return languages.slice(); },
    init() {
      Cutaway.ui.addLayer(layer);
      Cutaway.events.on("key", onKey);
      Cutaway.script.action("card", async (s) => { await showCard(s.card, { title: s.title }); });
    },
  };
})();
