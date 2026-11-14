// The Connections tab with the studio, in headless Chrome on a copy of the demo: a graph task makes the data
// and the tab loads it; the chart shows the demo's steps; a step opens its hotspot with the script the move
// runs in the Things tab, a fact lists the places in the data that name it, the Things tab shows a hotspot's
// steps; the state budget shows; the Handoffs tab shows the demo's one act with its run; and tools/graph.html
// draws the same data as a page of its own.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  mkdirSync(join(dir, "demo", "tools", "lib"), { recursive: true });   // where the Handoffs tab looks (beside Cutaway.base)
  for (const f of ["validate.mjs", "handoff.mjs"]) cpSync(resolve("tools", "lib", f), join(dir, "demo", "tools", "lib", f));
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
    // watching the solver: the winning way played in the game (the picture and the dock under it), to the end as the
    // solver played it; a jump puts the game in the solver's state; a game that goes another way stops and says so
    const R = `${E}.modules.replay`;
    await chrome.ev(`${E}.show("connections"); ${E}.refresh(); 1`);
    await sleep(200);
    const moves = await chrome.ev(`${G}.data.replay.turns.reduce((n, t) => n + t.moves.length, 0)`);
    await chrome.ev(`[...document.querySelectorAll("button")].find((b) => /The winning way/.test(b.textContent)).click(); 1`);
    for (let i = 0; i < 50 && !(await chrome.ev(`!!${R}.plan`)); i++) await sleep(100);
    await sleep(300);
    const shown = await chrome.ev(`({ mode: ${G}.mode, centre: !!${E}.centre.querySelector(".cwg-chart"), rows: document.querySelectorAll(".cw-replay .cw-list > *, .cw-replay [data-key]").length,
      dock: document.querySelector(".cw-replay")?.textContent ?? "", paused: ${E}.paused, room: Cutaway.scene.room?.id })`);
    t.ok("watch: the winning way loads in the game, held at its start, its moves in the dock", shown.mode === "game" && !shown.centre && shown.paused && /Play/.test(shown.dock) && /1\. /.test(shown.dock) && moves > 3,
      JSON.stringify({ ...shown, dock: shown.dock.slice(0, 200), moves }));
    await chrome.ev(`${R}.speed = 8; ${R}.play(); 1`);
    for (let i = 0; i < 900 && (await chrome.ev(`${R}.busy || ${R}.playing`)); i++) await sleep(100);
    const end = await chrome.ev(`({ note: ${R}.note, turn: ${R}.at.turn, turns: ${G}.data.replay.turns.length, ended: ${R}.ended })`);
    t.ok("watch: it plays the way to the game's end, as the solver did", end.ended && end.turn === end.turns && /ended after move/.test(end.note), JSON.stringify(end));
    await chrome.ev(`${R}.jump(3)`);
    const diff = await chrome.ev(`${R}.differences(Cutaway.save.capture({ live: true }), ${G}.data.replay.turns[3].snap)`);
    t.ok("watch: a jump puts the game in the solver's state before that move (after the end card, too)", diff.length === 0 && (await chrome.ev(`${R}.at.turn === 3 && ${E}.paused && !Cutaway.acts.titleOpen && !Cutaway.menu.card`)), diff.join(" | "));
    await chrome.ev(`Cutaway.state.set("tampered", true); ${R}.play(true); 1`);
    for (let i = 0; i < 300 && (await chrome.ev(`${R}.busy || ${R}.playing`)); i++) await sleep(100);
    const off = await chrome.ev(`${R}.note`);
    t.ok("watch: where the game goes another way than the solver, it stops and says what differs", /another way/.test(off) && /tampered: the game true, the solver unset/.test(off), off);
    await chrome.ev(`${G}.watchState(${G}.data.replay.turns[2], "a state", false)`);
    t.ok("watch: a state opened as the solver found it", (await chrome.ev(`${R}.differences(Cutaway.save.capture({ live: true }), ${G}.data.replay.turns[2].snap).length === 0 && !${R}.plan && ${E}.paused`)));
    // every run in the folder, one after another: a second run of the act (a copy that shuts one thing away, so it comes
    // after), each from its own start, also after the game's end
    {
      const one = join(dir, "demo", "graphs", "demo.js"), text = readFileSync(one, "utf8");
      writeFileSync(join(dir, "demo", "graphs", "demo_b.js"), text.replace(/"set":\[\]/, '"set":["nothing"]'));
      writeFileSync(join(dir, "demo", "graphs", "a_old.js"), text.replace(/,"replay":\{.*\}\};\s*$/s, "};\n"));
      await chrome.ev(`${G}.listFiles()`);
      await sleep(300);
      await chrome.ev(`[...document.querySelectorAll("button")].find((b) => /Play all runs/.test(b.textContent)).click(); 1`);
      for (let i = 0; i < 50 && !(await chrome.ev(`${R}.plan?.turns.some((t) => t.run === "demo_b.js")`)); i++) await sleep(100);
      const list = await chrome.ev(`(() => { const p = ${R}.plan; const runs = [...new Set(p.turns.map((t) => t.run))]; return { runs, begins: p.turns.filter((t) => t.begin).length }; })()`);
      t.ok("watch: all runs in the folder in turn (the one that shuts least first), a file made before left out", list.runs.join(",") === "demo.js,demo_b.js" && list.begins === 2, JSON.stringify(list));
      await chrome.ev(`${R}.speed = 8; ${R}.play(); 1`);
      for (let i = 0; i < 1200 && (await chrome.ev(`${R}.busy || ${R}.playing`)); i++) await sleep(100);
      const all = await chrome.ev(`({ note: ${R}.note, turn: ${R}.at.turn, turns: ${R}.plan.turns.length, ended: ${R}.ended })`);
      t.ok("watch: they play one after another to the last one's end, the second from its own start after the first's end", all.ended && all.turn === all.turns && /demo_b\.js: the game ended/.test(all.note), JSON.stringify(all));
      for (const f of ["demo_b.js", "a_old.js"]) rmSync(join(dir, "demo", "graphs", f));
      await chrome.ev(`${G}.listFiles()`);
    }
    await chrome.ev(`${G}.setMode("chart"); 1`);
    // the Handoffs tab: the demo's one act (the first: it keeps nothing) and its run from the graph folder
    await chrome.ev(`${E}.show("handoffs"); ${E}.refresh(); 1`);
    for (let i = 0; i < 100 && !(await chrome.ev(`!!${E}.modules.handoffs.report`)); i++) await sleep(100);
    await sleep(200);
    const ho = await chrome.ev(`(() => { const r = ${E}.modules.handoffs.report; return { acts: r?.acts.map((a) => a.id + ":" + a.runs.length).join(" "), errors: r?.errors, text: document.body.textContent }; })()`);
    const hoButtons = await chrome.ev(`[...document.querySelectorAll("button")].map((b) => b.textContent)`);
    t.ok("handoffs: the tab shows the act, that it keeps nothing, and its run", ho.acts === "act1:1" && ho.errors === 0 && /act act1/.test(ho.text) && /keeps nothing/.test(ho.text) && /1 run in graphs\/: demo\.js/.test(ho.text)
      && hoButtons.includes("graph: demo") && !hoButtons.includes("hello"), JSON.stringify({ ...ho, text: ho.text.slice(-400) }));
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
