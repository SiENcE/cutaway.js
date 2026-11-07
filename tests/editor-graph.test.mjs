// The Connections tab with the studio, in headless Chrome on a copy of the demo: a graph task makes the data
// and the tab loads it; the chart shows the demo's steps; a step opens its hotspot with the script the move
// runs in the Things tab, a fact lists the places in the data that name it, the Things tab shows a hotspot's
// steps; the state budget shows; and tools/graph.html draws the same data as a page of its own.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "../tools/lib/chrome.mjs";
import { studio } from "../tools/studio.mjs";

export default async function (t) {
  // a copy of the demo with the engine beside it (the page loads src/), as editor-studio.test does
  const dir = mkdtempSync(join(tmpdir(), "cutaway-graph-"));
  cpSync(resolve("demo"), join(dir, "demo"), { recursive: true });
  cpSync(resolve("src"), join(dir, "demo", "src"), { recursive: true });
  const page = join(dir, "demo", "index.html");
  writeFileSync(page, readFileSync(page, "utf8").replace(/\.\.\/src\//g, "src/"));
  writeFileSync(join(dir, "demo", "studio.json"), JSON.stringify({ write: ["layers"], layers: { graph: "graphs", edits: "layers/edits.js" },
    tasks: { "graph: demo": ["node", resolve("tools", "graph.mjs"), "index.html", "--workers", "0", "--out", "graphs/demo.js"], hello: ["node", "-e", "1"] } }));
  mkdirSync(join(dir, "demo", "graphs"), { recursive: true });
  const s = await studio(page, { quiet: true }).start(0);
  const chrome = await launch({ width: 1400, height: 800 });
  const E = "Cutaway.editor", G = `${E}.modules.graph`;
  try {
    await chrome.open(`${s.url}index.html?manual&act=act1&edit&studio=${s.token}`);
    for (let i = 0; i < 60 && !(await chrome.ev(`!!(${E} && ${G} && ${E}.studio.available)`)); i++) await sleep(100);
    await chrome.ev(`${E}.show("connections"); ${E}.refresh(); 1`);
    await sleep(300);
    const buttons = await chrome.ev(`[...document.querySelectorAll(".cw-panel button, button")].map((b) => b.textContent)`);
    t.ok("connections: the tab offers the game's graph tasks", buttons.includes("graph: demo") && !buttons.includes("hello"), buttons.join(" | "));
    // the task from the tab: it runs graph.mjs through the studio, then loads what it wrote
    await chrome.ev(`[...document.querySelectorAll("button")].find((b) => b.textContent === "graph: demo").click(); 1`);
    for (let i = 0; i < 300 && !(await chrome.ev(`!!${G}.view`)); i++) await sleep(100);
    t.ok("connections: the task makes the data and the tab loads it", await chrome.ev(`!!${G}.view && ${G}.data.states > 100`), String(await chrome.ev(`${G}.data?.states`)));
    await sleep(300);
    const nodes = await chrome.ev(`[...${G}.view.model.nodes.keys()]`);
    t.ok("connections: the chart shows the demo's steps and facts", nodes.some((k) => k.startsWith("hall|use key on door")) && nodes.includes("f:door_open"), nodes.join(" "));
    t.ok("connections: the chart is drawn in the centre", await chrome.ev(`!!${E}.centre.querySelector(".cwg-chart svg .node")`));
    // a step opens where it happens
    const door = nodes.find((k) => k.startsWith("hall|use key on door"));
    await chrome.ev(`${G}.view.select(${JSON.stringify(door)}); ${G}.openStep(${G}.view.model.nodes.get(${JSON.stringify(door)})); 1`);
    await sleep(300);
    t.ok("connections: a step opens its hotspot with the script of the move in Things",
      (await chrome.ev(`${E}.activeTab`)) === "things" && (await chrome.ev(`${E}.modules.things.selected`)) === "hot:door" && /with key/.test(await chrome.ev(`${E}.modules.things.script?.title ?? ""`)),
      await chrome.ev(`${E}.modules.things.script?.title ?? "(none)"`));
    const panel = await chrome.ev("document.body.textContent");
    t.ok("connections: the Things tab shows the hotspot's steps", /connections/.test(panel) && /needs has:key[^;]*; brings [^]*door_open/.test(panel) && (await chrome.ev(`${G}.stepsAt("hall", "door").length`)) > 0);
    // a fact: every place in the data that names it
    const places = await chrome.ev(`${G}.placesOf(${G}.wordOf("door_open")).map((p) => p.label)`);
    t.ok("connections: a fact lists the places that name it", places.includes("hall/door: with key") && places.some((p) => p.startsWith("hall/doorway")), places.join(" | "));
    const words = await chrome.ev(`["has:key", "visited:yard", "state:yard/mailbox=open", "~moment.x=seen", "chits=…"].map((f) => ${G}.wordOf(f)).join(",")`);
    t.ok("connections: a fact's word (items, rooms, states, moments, quantities)", words === "key,yard,mailbox,x,chits", words);
    // the budget in the centre
    await chrome.ev(`${E}.show("connections"); 1`);
    await sleep(300);
    await chrome.ev(`[...document.querySelectorAll("button")].find((b) => /Budget/.test(b.textContent)).click(); 1`);
    await sleep(300);
    t.ok("connections: the budget shows the once-mark that doubles the states", /once:hall\.crate\.use\.0/.test(await chrome.ev(`${E}.centre.textContent`)));
    // the same data as a page of its own
    const data = join(dir, "demo", "graphs", "demo.js");
    await chrome.send("Page.navigate", { url: `${pathToFileURL(resolve("tools", "graph.html")).href}?data=${encodeURIComponent(pathToFileURL(data).href)}` });
    for (let i = 0; i < 50 && !(await chrome.ev("!!window.cutawayGraph")); i++) await sleep(100);
    t.ok("graph.html: the page draws the same chart", (await chrome.ev("window.cutawayGraph ? window.cutawayGraph.view.model.nodes.size : 0")) === nodes.length && /states/.test(await chrome.ev(`document.getElementById("meta").textContent`)));
    t.ok("connections: no page errors", chrome.errors.length === 0, chrome.errors.join("\n"));
  } finally {
    await chrome.close();
    s.close();
  }
}
