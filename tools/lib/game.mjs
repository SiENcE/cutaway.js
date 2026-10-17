// Load a Cutaway game in Node: the page's own scripts (engine + data) run in a vm with small DOM
// stubs, so the tools check the real data with the real engine code.
//   const g = loadGame("demo/index.html");  g.C = the Cutaway namespace, g.options = Cutaway.start's options
//   await boot(g, { instant: true })        start it without a screen: lines, walks and waits finish at once
// A game with acts begins its first act (or `act`) as a new game; there is no title screen here.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { size as pngSize } from "./png.mjs";

/** A canvas that draws nothing. */
function fakeCanvas() {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  return { width: 0, height: 0, style: {}, getContext: () => ctx, addEventListener() {}, toDataURL: () => "" };
}

/** <img> that knows the size of PNG data URIs (and files next to the page). */
function imageClass(baseDir) {
  return class FakeImage {
    constructor() { this.width = 0; this.height = 0; this.onload = null; this.onerror = null; this._src = ""; }
    get src() { return this._src; }
    set src(v) {
      this._src = v;
      try {
        const buf = v.startsWith("data:") ? Buffer.from(v.slice(v.indexOf(",") + 1), "base64") : readFileSync(path.resolve(baseDir, v));
        const s = pngSize(buf);
        this.width = s.width; this.height = s.height;
        setTimeout(() => this.onload?.(), 0);
      } catch (e) {
        setTimeout(() => this.onerror?.(e), 0);
      }
    }
  };
}

/**
 * @param {string} htmlFile the game's page (its <script src> tags give the files and their order)
 * @param {{scripts?: string[]}} [o] extra scripts to run after the page's own
 */
export function loadGame(htmlFile, o = {}) {
  const html = readFileSync(htmlFile, "utf8"), dir = path.dirname(path.resolve(htmlFile));
  const files = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => path.resolve(dir, m[1])).concat(o.scripts ?? []);
  const store = new Map();
  const sandbox = {
    console, setTimeout, clearTimeout, URLSearchParams, performance, atob, btoa, TextDecoder,
    location: { search: "" }, devicePixelRatio: 1, innerWidth: 320, innerHeight: 180,
    addEventListener() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => ({ addEventListener() {} }),
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { createElement: () => fakeCanvas(), body: { appendChild() {}, style: {} }, documentElement: { style: {} },
      addEventListener() {}, fullscreenElement: null },
    Image: imageClass(dir),
  };
  sandbox.window = sandbox;
  /** @type {any} */
  let options = null;
  // Cutaway.start only records the game's options: trapped the moment the engine defines it, so this
  // works for separate files and for a release build's single bundle alike
  const stub = (opts) => { options = opts ?? {}; return Promise.resolve(); };
  let ns;
  Object.defineProperty(sandbox, "Cutaway", {
    configurable: false, enumerable: true, get: () => ns,
    set(v) {
      ns = v;
      Object.defineProperty(v, "start", { configurable: true, enumerable: true, get: () => stub, set() { /* the engine's own start isn't used here */ } });
    },
  });
  const ctx = vm.createContext(sandbox);
  for (const f of files) vm.runInContext(readFileSync(f, "utf8"), ctx, { filename: f });
  const C = vm.runInContext("Cutaway", ctx);
  return { C, get options() { return options; }, files, dir, ctx };
}

/**
 * Start a loaded game without a screen. With `instant`, speech, walking, animations and waits finish
 * immediately (walks still follow the walk map, so unreachable targets stay unreached).
 * @param {{C: any, options: any}} g
 * @param {{instant?: boolean, language?: string, act?: string}} [o]
 */
export async function boot(g, o = {}) {
  const C = g.C, opt = g.options ?? {};
  await C.assets.ready();
  C.font.defineDefault();
  C.display = { width: opt.width ?? 320, height: opt.height ?? 180, toLogical: () => ({ x: 0, y: 0, inside: false }) };
  for (const m of [C.inventory, C.party, C.dialogs, C.menu, C.acts, C.hints]) m.init();
  const langs = opt.languages ?? [opt.language ?? "en"];
  C.i18n.setFallback(langs[0]);
  C.i18n.setLanguage(o.language ?? opt.language ?? langs[0]);
  C.save.configure({ id: opt.id, version: opt.version });
  let ended = false;
  C.events.on("game.end", () => { ended = true; });
  if (o.instant) {
    C.ui.say = async () => {};
    C.ui.narrate = async () => {};
    C.clock.wait = async () => {};
    C.script.action("card", () => {});
    C.script.action("end", () => { C.events.emit("game.end", {}); });
    const A = C.actor.Actor.prototype;
    A.walkTo = function (x, y) {
      const map = this.room === C.scene.room?.id ? C.scene.walkMap : null;
      const p = map ? map.path({ x: this.x, y: this.y }, { x, y }) : [{ x, y }];
      if (p.length) { this.x = p[p.length - 1].x; this.y = p[p.length - 1].y; }
      return Promise.resolve();
    };
    A.playOnce = function () { return Promise.resolve(); };
  }
  if (opt.actor) C.scene.setActive(opt.actor);
  C.party.set(opt.party ?? (opt.actor ? [opt.actor] : []));
  C.party.setFollow?.(!!opt.follow);
  if (opt.inventory === "shared") C.state.share(C.party.members());
  C.acts.configure({ id: opt.id, demo: opt.demo });
  const act = o.act ?? opt.act ?? C.acts.first();
  if (act) await C.acts.begin(act, { fresh: true });
  else if (opt.room) await C.scene.load(opt.room);
  return { get ended() { return ended; }, reset() { ended = false; } };
}
