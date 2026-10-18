// Headless playthrough: solve the game in Node, then replay the winning path in Chrome through real
// mouse clicks (hotspots, portraits, the satchel, dialogue lines) on a manual clock. A title screen is
// passed with "new game", the hint button is tried once, and the end card goes back to the title.
// The intro (Cutaway.start({ intro })) is left out (?nointro); --intro plays it first, through to the
// title screen, then again from "Watch intro" with a click (the next shot) and Esc (skip it all).
//   node tools/play.mjs <index.html> [--path path.json] [--max states] [--shots dir] [--touch] [--intro] [--size 844x390] [--dpr 3]
// Must end with "all passed"; a demo that ends before the path does stops there. --shots saves a screenshot after every move. --touch plays it like a
// phone: a mobile viewport, taps for clicks and long presses for looks.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./lib/chrome.mjs";
import { loadGame } from "./lib/game.mjs";
import { makeSolver, describe } from "./lib/solver.mjs";

const args = process.argv.slice(2), page = args.find((a, i) => !a.startsWith("--") && !["--path", "--shots", "--size", "--dpr", "--max"].includes(args[i - 1]));
if (!page) { console.error("usage: node tools/play.mjs <index.html> [--path path.json] [--shots dir] [--touch] [--intro] [--size WxH] [--dpr n]"); process.exit(2); }
const touch = args.includes("--touch"), intro = args.includes("--intro");
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

let path;
if (opt("--path")) path = JSON.parse(readFileSync(opt("--path"), "utf8"));
else {
  const r = await (await makeSolver(loadGame(page))).search({ maxStates: Number(opt("--max") ?? 100000) });
  if (!r.solved) { console.log("FAIL  the solver found no way to the end"); process.exit(1); }
  path = r.path;
}
const shots = opt("--shots");
if (shots) mkdirSync(shots, { recursive: true });

const HELPERS = `window.__play = {
  ended: false,
  idle() { return !Cutaway.script.busy && !Cutaway.ui.line && Cutaway.scene.actorsHere().every((a) => a.state !== "walk" && !a.onceDone); },
  async step(ms) { Cutaway.clock.advance(ms); await new Promise((r) => setTimeout(r, 0)); },
  // run the clock until choices or a card show, the game ends or everything is quiet
  async run(max = 3000) {
    for (let i = 0, quiet = 0; i < max; i++) {
      if (Cutaway.dialogs.choices) return "choices";
      if (this.ended) return "ended";
      if (Cutaway.menu.card) return "card";
      await this.step(100);
      quiet = this.idle() ? quiet + 1 : 0;
      if (quiet >= 3) return "idle";
    }
    return "timeout";
  },
};
Cutaway.events.on("game.end", () => { __play.ended = true; });
Cutaway.events.on("sequence.shot", (e) => { __play.shot = e.shot; });`;

const [W, H] = (opt("--size") ?? (touch ? "844x390" : "960x540")).split("x").map(Number);
const chrome = await launch({ width: W, height: H, dpr: Number(opt("--dpr") ?? (touch ? 3 : 1)), touch });
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  — " + detail : ""}`); if (!ok) failed++; };
const point = async (expr) => { const p = await chrome.ev(expr); if (!p) throw new Error("nothing to click: " + expr); return p; };
// a hotspot out of view in a wide room: walk towards it along the floor, as a player would, until it shows
const reach = async (id) => {
  for (let n = 0; n < 12 && !(await chrome.ev(`Cutaway.debug.pointOn(${JSON.stringify(id)})`)); n++) {
    const p = await chrome.ev(`Cutaway.debug.towards(${JSON.stringify(id)})`);
    if (!p) break;
    await click(p);
    await settle();
  }
};
// run, clicking cards away (act titles, the end card) as a player would
const settle = async () => {
  let state = await chrome.ev("__play.run()");
  for (let n = 0; state === "card" && n < 20; n++) { await click({ x: 160, y: 90 }); state = await chrome.ev("__play.run()"); }
  return state;
};
const click = async (p, kind = "click") => {
  const x = Math.round(p.x), y = Math.round(p.y);
  if (!touch) await chrome.mouse(kind, x, y);
  else if (kind === "rclick") await chrome.hold(x, y);
  else await chrome.tap(x, y);
  await chrome.ev("__play.step(0)");
};

try {
  await chrome.open(pathToFileURL(resolve(page)).href + "?manual" + (intro ? "" : "&nointro"));
  await chrome.ev(HELPERS);
  // the opening may take a moment (the audio gate asks the browser first)
  const shown = "Cutaway.acts.titleOpen || !!Cutaway.sequence.playing() || (!!Cutaway.scene.room && !Cutaway.sequence.gated())";
  for (let i = 0; i < 100 && !(await chrome.ev(shown)); i++) await chrome.ev("new Promise((r) => setTimeout(r, 30))");
  if (intro) {
    const id = await chrome.ev("Cutaway.sequence.playing()");
    check("the intro plays first: " + id, !!id);
    if (id) {
      await chrome.ev("Cutaway.debug.settle(900000)");
      check("  ... to its end, then the title screen", await chrome.ev("!Cutaway.sequence.playing() && Cutaway.acts.titleOpen"));
      check("  ... and it is marked as seen", await chrome.ev(`Cutaway.settings.seen(${JSON.stringify(id)})`));
      const row = await chrome.ev(`(Cutaway.menu.rows ?? []).indexOf(Cutaway.i18n.t("@cutaway.title.intro"))`);
      check("title screen: \"" + (await chrome.ev(`Cutaway.i18n.t("@cutaway.title.intro")`)) + "\"", row >= 0);
      if (row >= 0) {
        await click(await chrome.ev(`Cutaway.menu.rowPoint(${row})`));
        await chrome.ev("__play.step(1000)");
        const before = await chrome.ev("__play.shot");
        await click({ x: 160, y: 90 });                         // a click: the next shot
        await chrome.ev("new Promise((r) => setTimeout(r, 300))");
        const after = await chrome.ev("__play.shot");
        check(`  a click skips to the next shot (${before} > ${after})`, await chrome.ev("!!Cutaway.sequence.playing()") && after !== before);
        if (touch) await chrome.hold(160, 90); else await chrome.key("Escape");   // Esc (a long press): skip it all
        await chrome.ev("new Promise((r) => setTimeout(r, 300))");
        await chrome.ev("Cutaway.debug.settle()");
        check(`  ${touch ? "a long press" : "Esc"} skips it, back to the title screen`, await chrome.ev("!Cutaway.sequence.playing() && Cutaway.acts.titleOpen && !!Cutaway.menu.rows"));
      }
    }
  }
  await chrome.ev("localStorage.clear()");
  if (await chrome.ev("Cutaway.acts.titleOpen")) {
    await chrome.ev("__play.step(600)");
    const rows = await chrome.ev("Cutaway.menu.rows");
    check("title screen: " + (rows ?? []).join(" / "), Array.isArray(rows) && rows.length > 0);
    await click(await chrome.ev("Cutaway.menu.rowPoint(0)"));             // new game
  }
  check("starts", (await settle()) !== "timeout");
  if (await chrome.ev("Cutaway.hints.any()")) {
    const p = await chrome.ev(`Cutaway.ui.buttonPoint("hint")`);
    if (p) await click(p);
    await chrome.ev("__play.step(100)");
    const line = await chrome.ev("Cutaway.ui.line?.text ?? null");
    check("hint button: " + JSON.stringify(line), !!p && !!line);
    check("  (after the hint)", (await settle()) !== "timeout");
  }
  for (const [n, m] of path.entries()) {
    const name = `${String(n + 1).padStart(2)}. ${describe(m)}`;
    // a demo ends before the full game's path does: the rest of the path is for acts it doesn't have
    if (await chrome.ev("__play.ended")) { check(`the game ended after ${n} moves (the path has ${path.length})`, true); break; }
    try {
      if (m.kind === "switch") await click(await point(`Cutaway.party.portraitPoint(${JSON.stringify(m.id)})`));
      else if (m.kind === "act" || m.kind === "look") { await reach(m.id); await click(await point(`Cutaway.debug.pointOn(${JSON.stringify(m.id)})`), m.kind === "look" ? "rclick" : "click"); }
      else {
        if (m.kind === "with") await reach(m.id);
        await click(await point("Cutaway.inventory.bagCentre()"));
        await chrome.ev("__play.step(400)");
        const first = m.kind === "combine" ? m.a : m.item;
        await click(await point(`Cutaway.inventory.cellOf(${JSON.stringify(first)})`), m.kind === "ilook" ? "rclick" : "click");
        if (m.kind === "combine") await click(await point(`Cutaway.inventory.cellOf(${JSON.stringify(m.b)})`));
        if (m.kind === "with") {
          if (!touch) await chrome.mouse("move", 160, 120);      // leave the bar, which then slides up
          await chrome.ev("__play.step(400)");
          await click(await point(`Cutaway.debug.pointOn(${JSON.stringify(m.id)})`));
        }
      }
      let state = await settle(), used = 0;
      while (state === "choices") {
        if (used >= (m.choices ?? []).length) throw new Error("more dialogue choices than the solver planned");
        await click(await chrome.ev(`Cutaway.dialogs.choicePoint(${m.choices[used++]})`));
        state = await settle();
      }
      check(name, state !== "timeout" && used === (m.choices ?? []).length, state);
    } catch (e) {
      check(name, false, String(e.message || e));
      break;
    }
    if (shots) { await chrome.ev("__play.step(0)"); writeFileSync(join(shots, `move_${String(n + 1).padStart(2, "0")}.png`), await chrome.screenshot()); }
  }
  check("reaches the end", await chrome.ev("__play.ended"));
  if (await chrome.ev("!!Cutaway.menu.card")) {                // the end card waits for a click (or a button)
    if (shots) { await chrome.ev("__play.step(0)"); writeFileSync(join(shots, "end_card.png"), await chrome.screenshot()); }
    const buttons = await chrome.ev("Cutaway.menu.cardButtons") ?? [];
    check("end card: " + JSON.stringify(await chrome.ev("Cutaway.menu.card")) + (buttons.length ? " [" + buttons.join(" | ") + "]" : ""), true);
    await click(buttons.length ? await chrome.ev(`Cutaway.menu.cardButtonPoint(${buttons.length - 1})`) : { x: 160, y: 90 });
    for (let i = 0; i < 30 && !(await chrome.ev("Cutaway.acts.titleOpen || !Cutaway.acts.hasTitle")); i++) await chrome.ev("__play.step(100)");
    if (await chrome.ev("Cutaway.acts.hasTitle")) check("back to the title screen", await chrome.ev("Cutaway.acts.titleOpen && !!Cutaway.menu.rows"));
  }
  check("no page errors", chrome.errors.length === 0, chrome.errors.join(" | "));
} finally {
  await chrome.close();
}
console.log(failed ? `${failed} failed` : "all passed");
process.exitCode = failed ? 1 : 0;
