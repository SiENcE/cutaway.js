// The example of a game's own tab (docs/editor.md "A game's own tabs"): the demo's Grid tab, loaded by the studio as
// the engine's studio.json lists it (as `npm run studio` starts it): it is there, in Tools > The game's tabs, it
// draws its grid over the picture and names the cell under the pointer, measures the hotspots, and F1 on it opens
// its page, which sits in the editor guide.
import { launch, sleep } from "../tools/lib/chrome.mjs";
import { studio } from "../tools/studio.mjs";

export default async function (t) {
  const s = await studio("demo/index.html", { quiet: true, root: "." }).start(0);
  const chrome = await launch({ width: 1300, height: 760 });
  const E = "Cutaway.editor";
  try {
    const base = s.url.replace(/[^/]*$/, "");
    await chrome.open(`${base}demo/index.html?manual&act=act1&edit&studio=${s.token}`);
    for (let i = 0; i < 80 && !(await chrome.ev(`!!(${E} && ${E}.modules.grid)`)); i++) await sleep(100);
    t.ok("plugin: the demo's Grid tab comes with the studio (studio.json \"editor\")", await chrome.ev(`!!${E}.modules.grid`));
    const tools = await chrome.ev(`${E}.menus().find(([m]) => m === "Tools")[1].map((i) => i.label || i.head || "").join("|")`);
    t.ok("plugin: Tools > The game's tabs > Grid", /The game's tabs\|Grid/.test(tools), tools);
    await chrome.ev(`${E}.show("grid"); 1`);
    await sleep(300);
    const pane = await chrome.ev("document.querySelector('.cutaway-editor').textContent");
    t.ok("plugin: its inspector measures the room's hotspots in cells", /the hotspots of hall/.test(pane) && /cells \d+\.\.\d+ × \d+\.\.\d+/.test(pane), pane.slice(0, 200));
    await chrome.mouse("move", 40, 100);
    await sleep(200);
    t.ok("plugin: the pointer over the picture names its cell", JSON.stringify(await chrome.ev(`${E}.modules.grid.at`)) === JSON.stringify({ x: 2, y: 6 }), JSON.stringify(await chrome.ev(`${E}.modules.grid.at`)));
    // the grid is drawn over the picture: a line's pixel lighter than the one beside it
    const lit = await chrome.ev(`(() => { Cutaway.clock.advance(0); const c = Cutaway.scene.camera.x, g = Cutaway.display.buffer.getContext("2d"), a = g.getImageData(32 - c, 150, 1, 1).data, b = g.getImageData(33 - c, 150, 1, 1).data; return a[0] + a[1] + a[2] > b[0] + b[1] + b[2]; })()`);
    t.ok("plugin: its grid is drawn over the picture", lit);
    await chrome.key("F1");
    await sleep(300);
    t.ok("plugin: F1 on it opens its page in the editor guide", JSON.stringify(await chrome.ev(`${E}.modules.help.at`)).includes("grid") && /The demo's own tab/.test(await chrome.ev("document.body.textContent")),
      JSON.stringify(await chrome.ev(`${E}.modules.help.at`)));
    t.ok("plugin: no page errors", !chrome.errors?.length, JSON.stringify(chrome.errors));
  } finally {
    await chrome.close();
    s.close();
  }
}
