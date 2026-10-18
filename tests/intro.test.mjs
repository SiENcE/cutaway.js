// The opening in headless Chrome on the demo (src/sequence.js, engine.js): the intro plays on the first
// start in cutscene mode, Space goes to the next shot and Esc skips it (not the pause menu), then the
// title; the next start goes straight to the title; ?act= and ?nointro leave it out; where sound needs
// a click first, the gate shows its room and prompt until a click, then the intro plays.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "../tools/lib/chrome.mjs";

export default async function (t) {
  const chrome = await launch({ width: 960, height: 540 });
  const url = pathToFileURL(resolve("demo/index.html")).href;
  const until = async (expr, n = 100) => { for (let i = 0; i < n && !(await chrome.ev(expr)); i++) await sleep(30); return chrome.ev(expr); };
  try {
    await chrome.open(url + "?manual");
    await chrome.ev(`window.__shots = []; Cutaway.events.on("sequence.shot", (e) => __shots.push(e.shot));`);
    t.ok("intro: plays on the first start", await until("Cutaway.sequence.playing() === 'intro'"));
    t.ok("intro: a cutscene (no cursor or interface), not the title yet", await chrome.ev("Cutaway.ui.cutscene && !Cutaway.acts.titleOpen && Cutaway.script.busy"));
    await chrome.ev("(async () => { for (let i = 0; i < 20; i++) { Cutaway.clock.advance(50); await new Promise((r) => setTimeout(r, 0)); } })()");
    const first = await chrome.ev("Cutaway.scene.room.id");
    await chrome.key("Space");
    await sleep(300);
    const after = await chrome.ev("[Cutaway.scene.room.id, Cutaway.sequence.playing(), Cutaway.cinema.bars]");
    t.ok("intro: Space skips to the next shot", first === "hall" && after[0] === "intro_sky" && after[1] === "intro" && after[2] === 23, JSON.stringify([first, after]));
    await chrome.key("Escape");
    await sleep(300);
    await chrome.ev("Cutaway.debug.settle()");
    t.ok("intro: Esc skips it to the title screen (no pause menu)", await chrome.ev("!Cutaway.sequence.playing() && Cutaway.acts.titleOpen && Cutaway.menu.rows?.[0] === 'New game' && !Cutaway.ui.cutscene"));
    t.ok("intro: then the letterbox is gone and the room is the title's", await chrome.ev("Cutaway.cinema.bars === 0 && Cutaway.scene.room.id === 'yard' && Cutaway.scene.backdrop"));
    t.ok("intro: remembered as seen", await chrome.ev("Cutaway.settings.seen('intro')"));

    await chrome.open(url + "?manual");
    await until("Cutaway.acts.titleOpen");
    t.ok("intro: the next start goes straight to the title", await chrome.ev("Cutaway.acts.titleOpen && !Cutaway.sequence.playing()"));
    t.ok("title: offers \"Watch intro\"", await chrome.ev("Cutaway.menu.rows.includes('Watch intro')"));

    await chrome.ev("localStorage.clear()");
    await chrome.open(url + "?manual&act=act1");
    await until("!!Cutaway.scene.active");
    t.ok("intro: ?act= leaves it out", await chrome.ev("!Cutaway.sequence.playing() && Cutaway.acts.current === 'act1' && !Cutaway.settings.seen('intro')"));
    await chrome.open(url + "?manual&nointro");
    await until("Cutaway.acts.titleOpen");
    t.ok("intro: ?nointro leaves it out", await chrome.ev("Cutaway.acts.titleOpen && !Cutaway.sequence.playing()"));

    // where sound needs a click: the browser says no to autoplay
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: "Object.defineProperty(Navigator.prototype, 'getAutoplayPolicy', { configurable: true, value: () => 'disallowed' });" });
    await chrome.open(url + "?manual");
    await until("Cutaway.sequence.gated()");
    t.ok("gate: its room as a still, waiting (no intro, no title yet)", await chrome.ev("Cutaway.sequence.gated() && Cutaway.scene.room?.id === 'yard' && Cutaway.scene.backdrop && !Cutaway.sequence.playing() && !Cutaway.acts.titleOpen && !Cutaway.audio.ctx"));
    await chrome.mouse("click", 160, 90);
    t.ok("gate: a click lets sound start and the intro play", await until("Cutaway.sequence.playing() === 'intro'") && await chrome.ev("!!Cutaway.audio.ctx && !Cutaway.sequence.gated()"));
    t.ok("opening: no page errors", chrome.errors.length === 0, chrome.errors.join(" | "));
  } finally {
    await chrome.close();
  }
}
