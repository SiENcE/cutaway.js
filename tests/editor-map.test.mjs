// The editor's Map tab and what a game's own tabs build on, in headless Chrome on a copy of the demo with the
// studio: a tab the game lists in studio.json ("editor") is loaded after the engine's; a tab's drag hook gets
// the pointer's down, moves and up on the picture; the Map tab finds the rooms, their exits and script warps,
// what the start doesn't reach and a way to no room; the Art tab opens a pxl source at a line.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launch, sleep } from "../tools/lib/chrome.mjs";
import { studio } from "../tools/studio.mjs";

export default async function (t) {
  const dir = mkdtempSync(join(tmpdir(), "cutaway-map-"));
  cpSync(resolve("demo"), join(dir, "demo"), { recursive: true });
  cpSync(resolve("src"), join(dir, "demo", "src"), { recursive: true });
  const page = join(dir, "demo", "index.html");
  writeFileSync(page, readFileSync(page, "utf8").replace(/\.\.\/src\//g, "src/"));
  // a game's own tab: it takes a drag on the picture and keeps what it got
  writeFileSync(join(dir, "demo", "mytab.js"), `"use strict";
    (function () {
      const E = Cutaway.editor, got = [];
      E.tab({ id: "mytab", label: "Mine", build(box) { box.append("mine"); }, drag(p, phase) { got.push(phase + ":" + Math.round(p.x) + "," + Math.round(p.y)); return true; } });
      E.modules.mytab = { got };
      E.roomNote((id) => (id === "yard" ? "The yard's shapes are made elsewhere." : null));
      E.modules.help.addBook({ id: "mine", title: "My guide", file: "mine.md", md: "# Mine\\n\\nWhat it is.\\n\\n## How\\n\\nHow it goes." }, { mytab: "how" });
    })();`);
  writeFileSync(join(dir, "demo", "studio.json"), JSON.stringify({ write: ["layers"], layers: { edits: "layers/edits.js" }, editor: ["mytab.js"], tasks: {} }));
  const s = await studio(page, { quiet: true }).start(0);
  const chrome = await launch({ width: 1400, height: 800 });
  const E = "Cutaway.editor";
  try {
    await chrome.open(`${s.url}index.html?manual&act=act1&edit&studio=${s.token}`);
    for (let i = 0; i < 60 && !(await chrome.ev(`!!(${E} && ${E}.modules.map && ${E}.modules.mytab)`)); i++) await sleep(100);
    t.ok("editor: a game's own tab (studio.json \"editor\") loads after the engine's", await chrome.ev(`!!${E}.modules.mytab && !!${E}.modules.map`));
    // the drag hook: down on the picture, a move, up
    await chrome.ev(`${E}.show("mytab"); 1`);
    await sleep(200);
    await chrome.ev(`(() => {
      const scr = Cutaway.display.screen, a = Cutaway.display.toClient(100, 80), b = Cutaway.display.toClient(130, 90);
      const ev = (type, p, target) => (target ?? scr).dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, button: 0, buttons: 1, bubbles: true, pointerId: 1 }));
      ev("pointerdown", a); ev("pointermove", b, window); ev("pointerup", b, window);
      return 1; })()`);
    const got = await chrome.ev(`${E}.modules.mytab.got`);
    t.ok("editor: a tab's drag hook gets down, move and up (room pixels)", got.length === 3 && got[0].startsWith("down:") && got[1].startsWith("move:") && got[2].startsWith("up:"), got.join(" "));
    // the game's tab in the Tools menu, its guide in the Help menu and at F1
    const menus = await chrome.ev(`Object.fromEntries(${E}.menus().map(([t, items]) => [t, items.map((i) => i.label ?? i.head ?? "")]))`);
    t.ok("editor: Tools lists Connections, Map and the game's tabs; Help the game's guide", menus.Tools.includes("Connections") && menus.Tools.includes("Map") && menus.Tools.includes("The game's tabs") && menus.Tools.includes("Mine") && menus.Help.includes("My guide"), JSON.stringify(menus.Tools) + JSON.stringify(menus.Help));
    await chrome.ev(`${E}.modules.help.open("mytab"); 1`);
    await sleep(200);
    t.ok("editor: F1 on a game's tab opens its guide at its section", JSON.stringify(await chrome.ev(`${E}.modules.help.at`)) === '["mine","how"]' && /How it goes/.test(await chrome.ev("document.body.textContent")));
    // the Map tab
    await chrome.ev(`${E}.show("map"); 1`);
    await sleep(400);
    const d = await chrome.ev(`(() => { const d = ${E}.modules.map.collect(); return { rooms: d.rooms, ways: d.ways.map((w) => w.kind + ":" + w.from + ">" + w.to), roots: d.roots, unreachable: d.unreachable, broken: d.broken.length }; })()`);
    t.ok("map: the rooms, their exits both ways, the start", d.rooms.includes("hall") && d.rooms.includes("yard") && d.ways.includes("exit:hall>yard") && d.ways.includes("exit:yard>hall") && d.roots.join() === "hall", JSON.stringify(d));
    t.ok("map: nothing unreachable, nothing broken in the demo", d.unreachable.length === 0 && d.broken === 0, JSON.stringify(d));
    t.ok("map: the rooms drawn in the centre", await chrome.ev(`!!${E}.centre.querySelector("canvas")`));
    // a goto to no room, and a room nothing leads to
    await chrome.ev(`Cutaway.room("attic", { background: Cutaway.room.get("hall").background }); Cutaway.room.get("hall").hotspots.plant.look = [{ goto: "cellar" }]; 1`);
    const d2 = await chrome.ev(`(() => { const d = ${E}.modules.map.collect(); return { unreachable: d.unreachable, broken: d.broken.map((w) => w.from + ">" + w.to + " " + w.label) }; })()`);
    t.ok("map: a room nothing leads to is unreachable, a goto to no room is broken", d2.unreachable.join() === "attic" && d2.broken.join() === "hall>cellar plant: look", JSON.stringify(d2));
    await chrome.ev(`${E}.modules.map.select("yard"); 1`);
    await sleep(300);
    t.ok("map: a picked room lists its ways", /ways in/.test(await chrome.ev("document.body.textContent")) && /← hall/.test(await chrome.ev("document.body.textContent")));
    // a game's note on a room shows on top of the Room tab there, and nowhere else
    await chrome.ev(`${E}.openRoom("hall").then(() => ${E}.show("room"))`);
    await sleep(300);
    const inHall = /made elsewhere/.test(await chrome.ev("document.body.textContent"));
    await chrome.ev(`${E}.openRoom("yard")`);
    await sleep(300);
    t.ok("editor: a game's note on a room shows in the Room tab there only", !inHall && /The yard's shapes are made elsewhere/.test(await chrome.ev("document.body.textContent")));
    // the Art tab opens a pxl source at a line
    await chrome.ev(`${E}.modules.art.openSource("art/demo.px.js", 5)`);
    await sleep(300);
    const sel = await chrome.ev(`(() => { const a = [...document.querySelectorAll("textarea")].find((x) => x.value.length > 100); const lines = a.value.split("\\n"); return { at: a.selectionStart, end: a.selectionEnd, want: lines.slice(0, 4).join("\\n").length + 1, len: lines[4].length }; })()`);
    t.ok("art: a pxl source opens at a line, the line selected", sel.at === sel.want && sel.end === sel.want + sel.len, JSON.stringify(sel));
    t.ok("map: no page errors", chrome.errors.length === 0, chrome.errors.join("\n"));
  } finally {
    await chrome.close();
    s.close();
  }
}
