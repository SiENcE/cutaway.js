// Cutaway.js menu and cards.
// Esc (or the touch menu button) opens the pause menu: continue, hint, save, load (autosave and slots),
// settings (volumes, voices, text speed), language, fullscreen, back to the title. Mouse, touch and keys
// (arrows, Enter, Esc) all work. Value rows show a bar: click it where you want the value, or use left
// and right. Other modules show their own pages with the same look (the title screen: `page`).
// Cards are full-screen texts that wait for a click (act titles, the end), optionally with a heading
// above and buttons below ("end of the demo": a link, back to the title):
//   { card: "The Hall", title: "Act 1" }
"use strict";

/**
 * A menu row: an action, or a value (bar 0..1 with `value`/`set`, or a text with `text` that `run` cycles).
 * @typedef {{label: string, run?: () => void, value?: () => number, set?: (v: number) => void, text?: () => string}} Entry
 * How a page shows: `y` its top (default: centred; below 0: its bottom, counted from the screen's), `w` its width, `dim` how dark the room behind gets
 * (0..1), `pause` whether the game stops meanwhile, `fixed` that Esc and right clicks can't leave it
 * (the title screen).
 * @typedef {{y?: number, w?: number, dim?: number, pause?: boolean, fixed?: boolean}} PageLook
 */

Cutaway.menu = (function () {
  const SLOTS = [1, 2, 3], ROW = 11, W = 200, BAR = 50, BUTTON_ROW = 13;
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

  function geometry() {
    const n = entries ? entries.length : 0, h = 22 + n * ROW, w = look.w ?? W;
    const H = Cutaway.display.height, y = look.y === undefined ? Math.round((H - h) / 2) : look.y < 0 ? H + look.y - h : look.y;
    return { x: Math.round((Cutaway.display.width - w) / 2), y, w, h };
  }

  /** @param {number} x @param {number} y */
  function indexAt(x, y) {
    const g = geometry(), i = Math.floor((y - g.y - 18) / ROW);
    return entries && x >= g.x && x < g.x + g.w && i >= 0 && i < entries.length && y >= g.y + 18 ? i : -1;
  }

  /** The bar of a value row: x, width. */
  function barBox() { const g = geometry(); return { x: g.x + g.w - 8 - BAR, w: BAR }; }

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
      { label: t("save"), run: () => show(t("save"), [...SLOTS.map((s) => ({ label: slotLabel(s), run: () => { Cutaway.save.write(s); close(); } })), back(main)], main) },
      { label: t("load"), run: () => loadPage(main) },
      { label: t("settings"), run: () => settings(main) },
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
    const S = Cutaway.settings, vol = (/** @type {"master" | "music" | "sfx" | "voice"} */ k) =>
      ({ label: t(k === "master" ? "volume" : k), value: () => S.values[k], set: (/** @type {number} */ v) => S.set({ [k]: v }) });
    const speeds = [[1.5, "slow"], [1, "normal"], [0.7, "fast"]];
    show(t("settings"), [
      vol("master"), vol("music"), vol("sfx"), vol("voice"),
      { label: t("voices"), text: () => t(S.values.voices ? "on" : "off"), run: () => S.set({ voices: !S.values.voices }) },
      { label: t("textSpeed"), text: () => t(String((speeds.find(([k]) => k === S.values.textSpeed) ?? speeds[1])[1])), run: () => {
        const i = speeds.findIndex(([k]) => k === S.values.textSpeed);
        S.set({ textSpeed: Number(speeds[(i + 1) % speeds.length][0]) });
      } },
      back(from),
    ], from, o);
  }

  /** @param {() => void} to */
  function back(to) { return { label: t("back"), run: to }; }

  /** Step a row: values by a tenth, texts to the next option. @param {Entry} e @param {number} dir */
  function adjust(e, dir) {
    if (e.value && e.set) e.set(Math.round(Cutaway.util.clamp(e.value() + dir * 0.1, 0, 1) * 10) / 10);
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
    const i = Math.floor((y - L.buttons + 2) / BUTTON_ROW), f = Cutaway.ui.font();
    if (i < 0 || i >= card.buttons.length) return -1;
    const w = f.measure(card.buttons[i]) + 16;
    return Math.abs(x - Cutaway.display.width / 2) <= w / 2 ? i : -1;
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
      if (e.value && e.set) {
        const b = barBox();
        if (p.button === 2) adjust(e, -1);
        else if (p.x >= b.x - 2 && p.x < b.x + b.w + 2) e.set(Math.round(Cutaway.util.clamp((p.x - b.x) / (b.w - 1), 0, 1) * 10) / 10);
        else adjust(e, 1);
      } else if (p.button === 0) e.run?.();
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
      const f = Cutaway.ui.font(), s = Cutaway.ui.style, SW = Cutaway.display.width, SH = Cutaway.display.height;
      if (card) {
        const L = /** @type {NonNullable<ReturnType<typeof cardLayout>>} */ (cardLayout());
        ctx.fillStyle = "#0c0a14";
        ctx.fillRect(0, 0, SW, SH);
        if (card.title) f.draw(ctx, card.title, SW / 2, L.title, { align: "center", color: s.accent, outline: s.outline });
        card.lines.forEach((l, i) => f.draw(ctx, l, SW / 2, L.text + i * f.lineHeight, { align: "center", color: "#fff" }));
        card.buttons.forEach((b, i) => {
          const y = L.buttons + i * BUTTON_ROW, w = f.measure(b) + 12, on = i === card?.hover;
          ctx.fillStyle = on ? s.accent : s.outline;
          ctx.fillRect(Math.round(SW / 2 - w / 2) - 1, y - 3, w + 2, 12);
          ctx.fillStyle = s.panel;
          ctx.fillRect(Math.round(SW / 2 - w / 2), y - 2, w, 10);
          f.draw(ctx, b, SW / 2, y, { align: "center", color: on ? s.accent : "#fff", outline: s.outline });
        });
        return;
      }
      if (!entries) return;
      const g = geometry(), b = barBox();
      ctx.fillStyle = `rgba(0, 0, 0, ${look.dim ?? 0.45})`;
      ctx.fillRect(0, 0, SW, SH);
      ctx.fillStyle = s.outline;
      ctx.fillRect(g.x - 1, g.y - 1, g.w + 2, g.h + 2);
      ctx.fillStyle = s.panel;
      ctx.fillRect(g.x, g.y, g.w, g.h);
      f.draw(ctx, title, g.x + g.w / 2, g.y + 5, { align: "center", color: s.accent, outline: s.outline });
      entries.forEach((e, i) => {
        const y = g.y + 19 + i * ROW, color = i === hoverIx ? s.accent : "#ffffff";
        f.draw(ctx, e.label, g.x + 8, y, { color, outline: s.outline });
        if (e.value) {                                   // a bar: outline, filled part, tenths
          const v = Cutaway.util.clamp(e.value(), 0, 1), fill = Math.round(v * (b.w - 2));
          ctx.fillStyle = s.outline;
          ctx.fillRect(b.x, y + 1, b.w, 6);
          ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
          ctx.fillRect(b.x + 1, y + 2, b.w - 2, 4);
          ctx.fillStyle = color;
          ctx.fillRect(b.x + 1, y + 2, fill, 4);
        } else if (e.text) {
          const txt = e.text();
          f.draw(ctx, txt, g.x + g.w - 8 - f.measure(txt), y, { color, outline: s.outline });
        }
      });
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
    else if (e && (k.code === "Enter" || k.code === "Space")) { if (e.value) adjust(e, 1); else e.run?.(); }
    else return;
    k.event.preventDefault();
  }

  return {
    open: main, close, showCard, settings, loadPage, slotLabel,
    /** Show a page of rows with this menu's look (the title screen uses it). */
    page: show,
    get isOpen() { return !!entries; },
    get card() { return card ? [card.title, ...card.lines].filter(Boolean).join(" ") : null; },
    /** The card's buttons (for tools and tests). */
    get cardButtons() { return card ? card.buttons.slice() : null; },
    /** Screen point of a card's button (for tools and tests). @param {number} i */
    cardButtonPoint(i) { const L = cardLayout(); return L && card && i < card.buttons.length ? { x: Cutaway.display.width / 2, y: L.buttons + i * BUTTON_ROW + 3 } : null; },
    /** The rows on screen (for tools and tests). */
    get rows() { return entries ? entries.map((e) => e.label + (e.text ? ": " + e.text() : e.value ? ": " + Math.round(e.value() * 100) + "%" : "")) : null; },
    /** Screen point of a row (for tools and tests). @param {number} i */
    rowPoint(i) { const g = geometry(); return { x: g.x + 20, y: g.y + 19 + i * ROW + 3 }; },
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
