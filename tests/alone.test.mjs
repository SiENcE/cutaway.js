// ?act=<id>&alone, in headless Chrome on the demo: the act is played alone, so { act: "next" } ends the game where it would go on
// to the next act (as tools/play.mjs --act and the solver see it); without ?alone the next act begins.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "../tools/lib/chrome.mjs";

/** Opens the demo at act1 with a second act added, goes on, and says which act runs and whether the game ended. @param {string} query */
async function goOn(query) {
  const chrome = await launch({ width: 960, height: 540 });
  try {
    await chrome.open(pathToFileURL(resolve("demo/index.html")).href + "?manual&nointro&act=act1" + query);
    for (let i = 0; i < 60 && !(await chrome.ev("!!(Cutaway.scene && Cutaway.scene.active)")); i++) await sleep(100);
    await chrome.ev("Cutaway.debug.settle()");
    return await chrome.ev(`(async () => {
      let ended = null;
      Cutaway.events.on("game.end", (e) => { ended = e; });
      Cutaway.act("act2", { room: "yard", actor: "pip" });
      Cutaway.script.run([{ act: "next" }]);
      for (let i = 0; i < 200 && !ended && Cutaway.acts.current !== "act2"; i++) { Cutaway.clock.advance(50); await new Promise((r) => setTimeout(r, 0)); }
      return { current: Cutaway.acts.current, ended: !!ended, demo: !!ended?.demo, errors: 0 };
    })()`).then((r) => ({ ...r, errors: chrome.errors.length }));
  } finally {
    await chrome.close();
  }
}

export default async function (t) {
  const along = await goOn("");
  t.ok("alone: without it the next act begins", along.current === "act2" && !along.ended, JSON.stringify(along));
  const alone = await goOn("&alone");
  t.ok("alone: with it the act ends where it would go on", alone.current === "act1" && alone.ended && alone.demo, JSON.stringify(alone));
  t.ok("alone: no page errors", along.errors === 0 && alone.errors === 0, JSON.stringify({ along: along.errors, alone: alone.errors }));
}
