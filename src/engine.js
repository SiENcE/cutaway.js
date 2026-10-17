// Cutaway.js start-up: wires the modules into the loop. Load this file last.
//   Cutaway.start({ width: 320, height: 180, room: "hall", actor: "pip" })
// A game with acts (Cutaway.act) starts with its title screen (`title`), or else begins its first act;
// ?act=<id> begins that act at once, without its card (also `act`). Without acts it shows `room`.
// Each frame: the room (props, actors, light, effects), the screen fade, "frame.ui" listeners (screen
// space), the interface (subtitles, labels, cursor), the debug text, then the buffer goes to the screen.
"use strict";

/**
 * @typedef {object} StartOptions
 * @property {number} [width]
 * @property {number} [height]
 * @property {HTMLElement} [parent]
 * @property {string} [border]   colour around the picture
 * @property {number} [scale]    force a scale (0 = fit the window)
 * @property {string} [room]     the room to show first
 * @property {string} [actor]    the actor the player controls
 * @property {boolean} [debug]   start with the debug overlay on
 * @property {boolean} [manualClock]  only advance on Cutaway.clock.advance (tests, captures)
 * @property {string[]} [party]  playable actors (default: just `actor`)
 * @property {string} [id]       game id, keys the saves in localStorage
 * @property {number} [version]  game data version stored in saves
 * @property {string} [language] first language (default: ?lang=, else the first of `languages`)
 * @property {string[]} [languages]  languages the player can choose in the menu
 * @property {Partial<Settings>} [settings]  the game's default settings (volumes, text speed)
 * @property {{out?: number, in?: number}} [transition]  room-change fade lengths in ms (0 = cut)
 * @property {boolean} [follow]   party members in the same room go along through doors
 * @property {"own" | "shared"} [inventory]  each party member has their own items (default), or the party shares one bag
 * @property {TitleOptions} [title]  a title screen before the game (games with acts)
 * @property {DemoOptions} [demo]    a demo: only some acts, then the "end of the demo" card
 * @property {string} [act]          begin this act at once (no title screen)
 * @property {() => void} [quit]     the title screen offers "Quit" (desktop shells)
 * @property {boolean} [dev]         developer keys and switches: F9, F10, ?edit, ?debug, ?act (default on)
 */

/**
 * Open the room editor (src/editor.js), loading it first: games don't list it in their pages, so it
 * isn't part of a release unless someone opens it.
 */
Cutaway.openEditor = async function () {
  const C = /** @type {any} */ (Cutaway);
  if (!C.editor) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = Cutaway.base + "editor.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Cutaway: the editor (editor.js) did not load from " + s.src));
      document.head.append(s);
    });
  }
  C.editor.open();
};

/**
 * Start the engine. Resolves once assets are loaded and the first frame is drawn.
 * @param {StartOptions} [o]
 */
Cutaway.start = async function (o = {}) {
  const params = new URLSearchParams(location.search);
  const forced = Number(params.get("scale")) || o.scale || 0;
  Cutaway.display.init({ width: o.width, height: o.height, parent: o.parent, border: o.border, scale: forced });
  Cutaway.input.init();
  Cutaway.font.defineDefault();
  await Cutaway.assets.ready();

  Cutaway.events.on("scene.drawn", (ctx) => Cutaway.debug.world(ctx));
  const dev = o.dev !== false;
  Cutaway.events.on("key", (k) => {
    if (dev && k.code === "F9") { Cutaway.debug.toggle(); k.event.preventDefault(); }
    if (dev && k.code === "F10") { Cutaway.openEditor(); k.event.preventDefault(); }
    if (k.code === "F11" || (k.code === "Enter" && k.event.altKey)) { Cutaway.display.toggleFullscreen(); k.event.preventDefault(); }
  });
  Cutaway.ui.init();
  Cutaway.inventory.init();
  Cutaway.party.init();
  Cutaway.dialogs.init();
  Cutaway.save.init();
  Cutaway.menu.init();
  Cutaway.acts.init();
  Cutaway.hints.init();
  Cutaway.audio.hook();
  Cutaway.music.init();
  Cutaway.voice.init();
  Cutaway.sfx.init();
  Cutaway.fx.init();
  if (o.transition) Cutaway.fx.setTransition(o.transition);
  Cutaway.save.configure({ id: o.id, version: o.version });
  Cutaway.settings.init(o.id ?? "game", o.settings);
  const langs = o.languages ?? [o.language ?? "en"];
  Cutaway.menu.setLanguages(langs);
  Cutaway.i18n.setFallback(langs[0]);
  Cutaway.i18n.setLanguage(params.get("lang") ?? o.language ?? langs[0]);

  // { shake: ms } jolts the room (not the interface) by a pixel or two
  let shakeUntil = 0;
  Cutaway.events.on("shake", (ms) => { shakeUntil = Cutaway.clock.time + (Number(ms) || 300); });

  Cutaway.clock.onUpdate((dt) => Cutaway.scene.update(dt));
  Cutaway.clock.onRender(() => {
    const ctx = Cutaway.display.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, Cutaway.display.width, Cutaway.display.height);
    const t = Cutaway.clock.time, shaking = t < shakeUntil;
    if (shaking) { ctx.save(); ctx.translate(Math.round(Math.sin(t * 0.09) * 2), Math.round(Math.cos(t * 0.13))); }
    Cutaway.scene.render(ctx);
    if (shaking) ctx.restore();
    Cutaway.fx.renderFade(ctx);
    Cutaway.events.emit("frame.ui", ctx);
    Cutaway.ui.render(ctx);
    if (Cutaway.input.touched && window.innerHeight > window.innerWidth) {     // phones held upright
      const f = Cutaway.ui.font(), s = Cutaway.ui.style, W = Cutaway.display.width, H = Cutaway.display.height;
      ctx.fillStyle = s.panel;
      ctx.fillRect(0, H - 16, W, 16);
      f.draw(ctx, Cutaway.i18n.t("@cutaway.rotate"), W / 2, H - 12, { align: "center", color: "#fff", outline: s.outline });
    }
    Cutaway.debug.screen(ctx);
    Cutaway.display.present();
  });

  if (o.actor) Cutaway.scene.setActive(o.actor);
  Cutaway.party.set(o.party ?? (o.actor ? [o.actor] : []));
  Cutaway.party.setFollow(!!o.follow);
  if (o.inventory === "shared") Cutaway.state.share(Cutaway.party.members());
  Cutaway.acts.configure({ id: o.id, title: o.title, demo: o.demo, quit: o.quit });
  // these run in the background (the first room's enter script, the title screen)
  const act = (dev && params.get("act")) || o.act;
  if (act) Cutaway.acts.begin(act, { fresh: true, card: false });
  else if (Cutaway.acts.first() && o.title) Cutaway.acts.showTitle();
  else if (Cutaway.acts.first()) Cutaway.acts.begin(/** @type {string} */ (Cutaway.acts.first()), { fresh: true });
  else if (o.room) Cutaway.scene.load(o.room);
  if (dev && (o.debug || params.has("debug"))) Cutaway.debug.toggle(true);
  if (dev && params.has("edit")) Cutaway.openEditor();
  if (o.manualClock || params.has("manual")) Cutaway.clock.setManual(true);
  Cutaway.clock.start();
  Cutaway.clock.advance(0);
  Cutaway.events.emit("started");
};
