// Cutaway.js acts, the title screen and the end of the game (or of the demo).
//   Cutaway.act("act1", { title: "Act 1", name: "The Hall", room: "hall", actor: "pip", start: [...] })
// A game is a row of acts, in the order they are defined. An act begins with its `start` steps (place
// the actors, lock party members, set flags), its title card, then its room. A new game begins its first
// act from an empty state: no flags, the actors where their data puts them, the party as it started.
// The step { act: "next" } (or { act: "act2" }) ends the act being played and begins that one. The act
// being played is in the save; acts begun once stay unlocked (in localStorage, like the settings) and
// can be started from the title screen.
// The end: { end: "Thanks for playing!" } shows a card and emits "game.end". A demo
// (Cutaway.start({ demo: { acts: ["act1"], link: "https://...", text: "..." } })) ends where it
// would go on to an act that isn't in it (or isn't made yet): the "end of the demo" card, with a button
// that opens the link (the full game) and one back to the title screen.
// The title screen (Cutaway.start({ title: { room, view, logo, name, tagline, footer } })): a room
// behind it (only shown: no enter script, no autosave), the logo (a sprite, or the game's name drawn
// large as a placeholder), and new game, continue (the newest save), acts, load, settings, fullscreen,
// and quit when the shell can (Cutaway.start({ quit })).
"use strict";

/**
 * @typedef {object} ActDef
 * @property {string} room       where it begins
 * @property {string} [actor]    who the player controls first
 * @property {string} [title]    the card's heading ("Act 1")
 * @property {string} [name]     the card's text, the act's name ("The Hall")
 * @property {Script} [start]    steps before the card and the room: place actors, lock members, set flags
 */
/**
 * @typedef {object} TitleOptions
 * @property {string} [room]               the room behind the title screen
 * @property {[number, number]} [view]     where the camera stays in it (top left)
 * @property {string} [logo]               sprite; without one, `name` is drawn large (a placeholder)
 * @property {string} [name]               the game's name
 * @property {string} [tagline]            the heading of the title's menu
 * @property {string} [footer]             small print at the bottom right (version, licence)
 * @property {any} [music]                 music state (default: the room's)
 */
/**
 * @typedef {object} DemoOptions
 * @property {string[]} [acts]   the acts in the demo (default: every act)
 * @property {string} [link]     the full game's page: the end card gets a button that opens it
 * @property {string} [text]     the end card's text
 */

/** Define an act: `Cutaway.act(id, def)`; acts come in the order they are defined. */
Cutaway.act = (function () {
  /** @type {Map<string, ActDef>} */
  const defs = new Map();
  /** @param {string} id @param {ActDef} def */
  function act(id, def) { defs.set(id, def); return id; }
  /** @param {string} id */
  act.get = (id) => defs.get(id) ?? null;
  act.ids = () => [...defs.keys()];
  return act;
})();

Cutaway.acts = (function () {
  const TITLE_LOOK = { y: -18, w: 136, dim: 0.2, pause: false, fixed: true };   // above the small print
  /** @type {string | null} the act being played */
  let current = null;
  /** @type {TitleOptions | null} */
  let title = null;
  /** @type {DemoOptions | null} */
  let demo = null;
  /** @type {(() => void) | null} */
  let quit = null;
  let gameId = "game", titleOpen = false;
  /** @type {{members: string[], locked: string[], staying?: string[]} | null} the party as the game started */
  let party0 = null;
  /** @type {Map<string, HTMLCanvasElement>} */
  const bigText = new Map();

  /** @param {string} k */
  function t(k) { return Cutaway.i18n.t("@cutaway." + k); }

  /** Is an act in this build (defined, and in the demo if this is one)? @param {string} id */
  function available(id) { return !!Cutaway.act.get(id) && (!demo?.acts || demo.acts.includes(id)); }
  function first() { return Cutaway.act.ids().find(available) ?? null; }

  /** Acts begun once, in any game. */
  function unlocked() {
    /** @type {string[]} */
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(`cutaway.${gameId}.acts`) ?? "[]"); } catch { /* none yet */ }
    return Cutaway.act.ids().filter((id) => seen.includes(id) && available(id));
  }
  /** @param {string} id */
  function unlock(id) {
    if (unlocked().includes(id)) return;
    try { localStorage.setItem(`cutaway.${gameId}.acts`, JSON.stringify([...unlocked(), id])); } catch { /* private mode */ }
  }

  /** Back to the start: an empty state, actors where their data puts them, the party as it began. */
  function reset() {
    Cutaway.ui.hold(null);
    Cutaway.inventory.setOpen(false);
    Cutaway.state.reset();
    if (party0) Cutaway.party.restore(party0);
    for (const a of Cutaway.actors.all()) a.place(a.def.room ?? null, a.def.at?.[0] ?? 0, a.def.at?.[1] ?? 0, a.def.facing ?? "right");
    Cutaway.scene.setActive(null);
    current = null;
  }

  /**
   * Begin an act: its start steps, its card, its room (whose enter script runs). `fresh` makes it a
   * new game; `card: false` leaves the card out. Resolves when the room's enter script has finished.
   * @param {string} id
   * @param {{fresh?: boolean, card?: boolean}} [o]
   */
  async function begin(id, o = {}) {
    const a = Cutaway.act.get(id);
    if (!a) throw new Error(`Cutaway: no act "${id}"`);
    titleOpen = false;
    if (Cutaway.scene.room) await Cutaway.fx.transition("out");     // (at start-up there is nothing to fade)
    if (o.fresh) reset();
    current = id;
    unlock(id);
    Cutaway.events.emit("act", { id });
    const steps = a.start === undefined ? [] : Array.isArray(a.start) ? a.start : [a.start];
    const card = (a.title || a.name) && o.card !== false ? [{ card: a.name ?? "", title: a.title }] : [];
    await Cutaway.script.run([...steps, ...card], { path: `act.${id}` });
    if (a.actor) Cutaway.scene.setActive(a.actor);
    const loaded = Cutaway.scene.load(a.room);
    Cutaway.fx.transition("in");
    await loaded;
  }

  /**
   * The end card: the game's own end, or the demo's (with the link to the full game). Then the title.
   * @param {string} text
   * @param {boolean} isDemo
   */
  async function end(text, isDemo) {
    Cutaway.events.emit("game.end", { demo: isDemo });
    const buttons = [...(isDemo && demo?.link ? ["@cutaway.demo.link"] : []), ...(title ? ["@cutaway.demo.toTitle"] : [])];
    for (;;) {
      const i = await Cutaway.menu.showCard(text, { title: isDemo ? "@cutaway.demo.title" : undefined, buttons });
      if (buttons[i] !== "@cutaway.demo.link") break;
      window.open(demo?.link, "_blank", "noopener");    // the card stays: the page opens beside the game
    }
    if (title) await toTitle();
  }

  /** The title screen's menu. */
  function titlePage() {
    if (!title) return;
    const newest = Cutaway.save.newest(), acts = unlocked(), start = first();
    Cutaway.menu.page(Cutaway.i18n.t(title.tagline ?? ""), [
      ...(start ? [{ label: t("title.new"), run: () => { Cutaway.menu.close(); begin(start, { fresh: true }); } }] : []),
      ...(newest ? [{ label: t("title.continue"), run: () => resume(newest.slot) }] : []),
      ...(acts.length > 1 ? [{ label: t("title.acts"), run: actsPage }] : []),
      ...(newest ? [{ label: t("menu.load"), run: () => Cutaway.menu.loadPage(titlePage, TITLE_LOOK) }] : []),
      { label: t("menu.settings"), run: () => Cutaway.menu.settings(titlePage, TITLE_LOOK) },
      { label: t("menu.fullscreen"), run: () => Cutaway.display.toggleFullscreen() },
      ...(quit ? [{ label: t("title.quit"), run: quit }] : []),
    ], null, TITLE_LOOK);
  }

  function actsPage() {
    Cutaway.menu.page(t("title.acts"), [
      ...unlocked().map((id) => {
        const a = /** @type {ActDef} */ (Cutaway.act.get(id));
        return { label: [a.title, a.name].filter(Boolean).map((s) => Cutaway.i18n.t(String(s))).join(": "), run: () => { Cutaway.menu.close(); begin(id, { fresh: true }); } };
      }),
      { label: t("menu.back"), run: titlePage },
    ], titlePage, TITLE_LOOK);
  }

  /** @param {string | number} slot */
  async function resume(slot) {
    Cutaway.menu.close();
    await Cutaway.fx.transition("out");
    titleOpen = false;
    await Cutaway.save.load(slot);
    Cutaway.fx.transition("in");
  }

  /** Show the title screen (at start, after the end, or from the pause menu). */
  function showTitle() {
    if (!title) return;
    reset();
    titleOpen = true;
    if (title.room) Cutaway.scene.load(title.room, { backdrop: title.view ?? [0, 0] });
    if (title.music) Cutaway.events.emit("music", title.music);
    Cutaway.fx.transition("in");
    titlePage();
  }

  /** Leave the game for the title screen (the game so far is in the autosave of the last room change). */
  async function toTitle() {
    await Cutaway.fx.transition("out");
    showTitle();
  }

  /** The game's name, drawn at twice the font's size (with its outline): a placeholder logo. @param {string} text */
  function big(text) {
    let c = bigText.get(text);
    if (c) return c;
    const f = Cutaway.ui.font(), s = Cutaway.ui.style, small = document.createElement("canvas");
    small.width = f.measure(text) + 2; small.height = f.lineHeight + 2;
    f.draw(/** @type {CanvasRenderingContext2D} */ (small.getContext("2d")), text, 1, 1, { color: s.accent, outline: s.outline });
    c = document.createElement("canvas");
    c.width = small.width * 2; c.height = small.height * 2;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    g.imageSmoothingEnabled = false;
    g.drawImage(small, 0, 0, c.width, c.height);
    bigText.set(text, c);
    return c;
  }

  /** @type {UiLayer} the logo and the small print, over the title's menu */
  const layer = {
    z: 101,
    render(ctx) {
      if (!titleOpen || !title || Cutaway.menu.card) return;
      const W = Cutaway.display.width, H = Cutaway.display.height, f = Cutaway.ui.font(), s = Cutaway.ui.style;
      const logo = title.logo && Cutaway.assets.get(title.logo)?.frames[0];
      if (logo) Cutaway.assets.draw(ctx, /** @type {string} */ (title.logo), Math.floor(W / 2), 10, { anchor: [Math.floor(logo.w / 2), 0] });
      else if (title.name) { const c = big(Cutaway.i18n.t(title.name)); ctx.drawImage(c, Math.floor((W - c.width) / 2), 22); }
      if (title.footer) {
        const txt = Cutaway.i18n.t(title.footer);
        f.draw(ctx, txt, W - 4 - f.measure(txt), H - 11, { color: "#d8d4e4", outline: s.outline });
      }
    },
  };

  return {
    begin, toTitle, showTitle, available, unlocked, reset,
    /** The act being played. */
    get current() { return current; },
    get titleOpen() { return titleOpen; },
    /** Has the game a title screen? */
    get hasTitle() { return !!title; },
    /** The act to begin a new game with. */
    first,
    /**
     * Set up from the start options. Call after the party is set (a new game starts with it).
     * @param {{id?: string, title?: TitleOptions, demo?: DemoOptions, quit?: () => void}} o
     */
    configure(o) {
      gameId = o.id ?? gameId; title = o.title ?? null; demo = o.demo ?? null; quit = o.quit ?? null;
      party0 = Cutaway.party.snapshot();
    },
    /** The act a save was made in. @param {string | null | undefined} id */
    restore(id) { current = id ?? null; titleOpen = false; },
    init() {
      Cutaway.ui.addLayer(layer);
      Cutaway.script.action("act", (s, ctx) => {
        const ids = Cutaway.act.ids();
        const next = s.act === "next" ? ids[ids.indexOf(current ?? "") + 1] : s.act;
        if (next && available(next)) return begin(next);
        return Cutaway.script.exec({ end: demo?.text ?? "@cutaway.demo.text", demo: true }, ctx);
      });
      Cutaway.script.action("end", (s) => end(s.end, !!s.demo));
    },
  };
})();
