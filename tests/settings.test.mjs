// The player's settings (src/settings.js) and the menu's pages (src/menu.js), in headless Chrome on the
// demo: lines that wait for a click (and settle() going past them), the settings' pages and their option
// rows by keys, steady lamps, swapped mouse buttons in the room, filling the window, the old screen's
// overlay, back to the defaults.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "../tools/lib/chrome.mjs";

export default async function (t) {
  const chrome = await launch({ width: 1400, height: 800 });
  const key = (code) => `Cutaway.events.emit("key", { key: "", code: "${code}", event: { preventDefault() {} } });`;
  try {
    await chrome.open(pathToFileURL(resolve("demo/index.html")).href + "?manual&act=act1");
    for (let i = 0; i < 60 && !(await chrome.ev("!!(Cutaway.scene && Cutaway.scene.active)")); i++) await sleep(100);
    await chrome.ev("Cutaway.debug.settle()");
    t.ok("settings: the defaults", await chrome.ev("JSON.stringify(Cutaway.settings.values)").then((s) => /"advance":"auto"/.test(s) && /"crt":"off"/.test(s) && /"fit":"sharp"/.test(s)));

    // lines: by themselves, or waiting for a click
    const said = await chrome.ev("Cutaway.ui.say(Cutaway.scene.active, 'A line.'); Cutaway.clock.advance(20000); !Cutaway.ui.line");
    t.ok("lines: auto, a line goes by itself", said);
    const waits = await chrome.ev(`Cutaway.settings.set({ advance: "click" }); Cutaway.ui.say(Cutaway.scene.active, "A line."); Cutaway.clock.advance(20000);
      [Cutaway.ui.line?.waiting, Cutaway.scene.active.state]`);
    t.ok("lines: on click, a line waits when its time is up (and the actor stops talking)", waits[0] === true && waits[1] !== "talk", JSON.stringify(waits));
    t.ok("lines: Space goes on", await chrome.ev(`${key("Space")} !Cutaway.ui.line`));
    t.ok("lines: settle() goes past waiting lines", await chrome.ev(`Cutaway.ui.say(Cutaway.scene.active, "A line."); Cutaway.debug.settle().then(() => !Cutaway.ui.line)`));
    // each line's mark: more to come (an arrow) or the last (a square), looking ahead through ifs and the script around
    const marks = await chrome.ev(`(async () => {
      const seen = [];
      Cutaway.state.set("mark_flag");
      const run = Cutaway.script.run(["One.", { wait: 0 }, { if: "!mark_flag", then: ["Never."] }, { if: "mark_flag", then: ["Two.", { wait: 10 }] },
        { set: "mark_later" }, { if: "mark_later", then: [{ narrate: "Three." }] }]);
      for (let i = 0; i < 30 && seen.length < 3; i++) {
        const l = Cutaway.ui.line;
        if (l && seen[seen.length - 1]?.[0] !== l.text) seen.push([l.text, l.more]);
        ${key("Space")} Cutaway.clock.advance(50); await new Promise((r) => setTimeout(r, 5));
      }
      await Cutaway.debug.settle(); await run;
      return seen;
    })()`);
    t.ok("lines: an arrow while more follows, a square on the last", JSON.stringify(marks) === JSON.stringify([["One.", true], ["Two.", true], ["Three.", false]]), JSON.stringify(marks));
    t.ok("lines: a lone line (a look, a hint) is the last", await chrome.ev(`Cutaway.script.run("Alone."); const m = Cutaway.ui.line?.more; Cutaway.debug.settle().then(() => m === false)`));

    // the settings' pages
    const pages = await chrome.ev("Cutaway.menu.settings(); Cutaway.menu.rows.length");
    const text = await chrome.ev(`(() => { const p = Cutaway.menu.rowPoint(1); Cutaway.events.emit("pointer.click", { x: p.x, y: p.y, button: 0 }); return Cutaway.menu.rows; })()`);
    t.ok("menu: settings has four pages, defaults and back", pages === 6 && text.some((r) => /^Next line: on click$/.test(r)), JSON.stringify(text));
    const stepped = await chrome.ev(`${key("ArrowDown")} ${key("ArrowDown")} ${key("ArrowRight")} const a = Cutaway.settings.values.advance; ${key("ArrowRight")} ${key("ArrowLeft")} ${key("ArrowLeft")}
      [a, Cutaway.settings.values.advance, Cutaway.menu.rows[1]]`);
    t.ok("menu: left and right step an option row both ways", stepped[0] === "auto" && stepped[1] === "click" && stepped[2] === "Next line: on click", JSON.stringify(stepped));
    t.ok("menu: Esc goes back a page, then closes", await chrome.ev(`${key("Escape")} const r = Cutaway.menu.rows.length === 6; ${key("Escape")} ${key("Escape")} r && !Cutaway.menu.isOpen`));

    // motion off: lamps burn steady; swapped buttons: in the room, the right button walks
    t.ok("motion off: steady lamps", await chrome.ev(`Cutaway.settings.set({ motion: false }); Cutaway.light.flicker({ at: [0, 0], r: 1, flicker: 0.5 }, 0, 1234) === 1`));
    const walks = await chrome.ev(`(async () => {
      Cutaway.settings.set({ swapButtons: true, advance: "auto" });
      const a = Cutaway.scene.active, x0 = a.x, p = Cutaway.scene.walkMap.nearest({ x: a.x + 30, y: a.y }), s = Cutaway.scene.toScreen(p.x, p.y);
      Cutaway.events.emit("pointer.click", { x: s.x, y: s.y, button: 0 }); await Cutaway.debug.settle();
      const left = a.x;
      Cutaway.events.emit("pointer.click", { x: s.x, y: s.y, button: 2 }); await Cutaway.debug.settle();
      return [x0, left, a.x, p.x];
    })()`);
    t.ok("swapped buttons: left looks (no walk), right walks", walks[1] === walks[0] && Math.abs(walks[2] - walks[3]) <= 2, JSON.stringify(walks));

    // the picture
    const scales = await chrome.ev(`const s0 = Cutaway.display.scale; Cutaway.settings.set({ fit: "fill", crt: "crt" }); const s1 = Cutaway.display.scale;
      const c = Cutaway.display.toClient(100, 50), l = Cutaway.display.toLogical(c.x, c.y); [s0, s1, l.x, l.y]`);
    t.ok("picture: fill the window (not a whole number), clicks still land", scales[0] === 4 && scales[1] > 4 && scales[1] < 5 && scales[2] === 100 && scales[3] === 50, JSON.stringify(scales));
    t.ok("settings: back to the defaults", await chrome.ev(`Cutaway.settings.reset(); const v = Cutaway.settings.values;
      v.fit === "sharp" && v.crt === "off" && v.motion && !v.swapButtons && Cutaway.display.scale === 4`));
    t.ok("settings: stored for the next visit", await chrome.ev(`Cutaway.settings.set({ textBox: true }); Object.values(localStorage).some((s) => /"textBox":true/.test(s))`));
    t.ok("settings: no page errors", chrome.errors.length === 0, chrome.errors.join(" | "));
  } finally {
    await chrome.close();
  }
}
