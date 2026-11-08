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
      E.tab({ id: "mytab", label: "Mine", build(box) { box.append("mine"); }, drag(p, phase) { got.push(phase + ":" + Math.round(p.x) + "," + Math.round(p.y)); return true; },
        hover(p) { got.push(p ? "hover:" + Math.round(p.x) + "," + Math.round(p.y) : "hover:out"); } });
      E.modules.mytab = { got };
      E.roomNote((id) => (id === "yard" ? "The yard's shapes are made elsewhere." : null));
      E.modules.help.addBook({ id: "mine", title: "My guide", file: "mine.md", md: "# Mine\\n\\nWhat it is.\\n\\n## How\\n\\nHow it goes." }, { mytab: "how" });
      E.modules.help.addBook({ id: "minefmt", title: "My format", file: "fmt.md", md: "# My format\\n\\nWhat it holds.\\n\\n## Keys\\n\\nThe keys of it." }, {}, { into: "reference" });
    })();`);
  writeFileSync(join(dir, "demo", "studio.json"), JSON.stringify({ write: ["layers"], layers: { edits: "layers/edits.js" }, editor: ["mytab.js"], tasks: { where: ["node", "-e", "console.log('in ' + process.argv[1])", "{room}"] } }));
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
      ev("pointermove", a); ev("pointermove", a, document.body);
      return 1; })()`);
    const got = await chrome.ev(`${E}.modules.mytab.got`);
    t.ok("editor: a tab's drag hook gets down, move and up (room pixels)", got.length === 5 && got[0].startsWith("down:") && got[1].startsWith("move:") && got[2].startsWith("up:"), got.join(" "));
    t.ok("editor: a tab's hover hook gets the pointer over the picture with nothing dragged, and null when it leaves", got[3] === got[0].replace("down:", "hover:") && got[4] === "hover:out", got.join(" "));
    // the game's tab in the Tools menu, its guide in the Help menu and at F1
    const menus = await chrome.ev(`Object.fromEntries(${E}.menus().map(([t, items]) => [t, items.map((i) => i.label ?? i.head ?? "")]))`);
    t.ok("editor: Tools lists Connections, Map and the game's tabs; Help the game's guide", menus.Tools.includes("Connections") && menus.Tools.includes("Map") && menus.Tools.includes("The game's tabs") && menus.Tools.includes("Mine") && menus.Help.includes("My guide"), JSON.stringify(menus.Tools) + JSON.stringify(menus.Help));
    await chrome.ev(`${E}.modules.help.open("mytab"); 1`);
    await sleep(200);
    const merged = await chrome.ev(`(() => { const b = ${E}.modules.help.books(); const ref = b.find((x) => x.id === "reference"); return { books: b.map((x) => x.id), secs: ref.secs.slice(-2).map((s) => s.title + " @" + s.file) }; })()`);
    t.ok("editor: a game's guide can go into the reference, its sections at the end, titled and marked with its file", !merged.books.includes("minefmt") && merged.secs.join() === "My format @fmt.md,My format: Keys @fmt.md", JSON.stringify(merged));
    t.ok("editor: F1 on a game's tab opens its guide at its section",JSON.stringify(await chrome.ev(`${E}.modules.help.at`)) === '["mine","how"]' && /How it goes/.test(await chrome.ev("document.body.textContent")));
    // a task with a {room} part run without it asks, the open room offered
    const asked = await chrome.ev(`(async () => { let offered = ""; window.prompt = (q, d) => { offered = d; return d; }; const r = await ${E}.runTask("where"); return { offered, out: r.output.trim() }; })()`);
    t.ok("editor: a task's {room} left open is asked for, the room open offered", asked.offered === "hall" && asked.out === "in hall", JSON.stringify(asked));
    // a room wider than the screen gets a scrollbar under the picture; its thumb moves the camera
    await chrome.ev(`Cutaway.room.get("hall").size = [480, 180]; ${E}.openRoom("hall").then(() => ${E}.show("room"))`);
    await sleep(300);
    const sb = await chrome.ev(`(async () => {
      const h = document.querySelector(".cw-picbars .cw-sb.h"), v = document.querySelector(".cw-picbars .cw-sb.v"), th = h.querySelector(".cw-sb-thumb"), t = th.getBoundingClientRect();
      const ev = (type, x) => th.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: t.top + 3, bubbles: true, pointerId: 5, button: 0, buttons: 1 }));
      const x0 = Cutaway.scene.camera.x; ev("pointerdown", t.left + 4); ev("pointermove", t.left + 300); ev("pointerup", t.left + 300);
      await new Promise((r) => setTimeout(r, 100));
      const a = Cutaway.display.view, hr = h.getBoundingClientRect();
      return { h: getComputedStyle(h).display !== "none", v: getComputedStyle(v).display !== "none", moved: Cutaway.scene.camera.x > x0, atEdge: Math.abs(hr.bottom - (a.area.t + a.area.h) / a.dpr) < 2 };
    })()`);
    t.ok("editor: a room wider than the screen has a scrollbar along the work area's bottom (none up the side); its thumb moves the camera", sb.h && !sb.v && sb.moved && sb.atEdge, JSON.stringify(sb));
    // the wheel zooms the picture by whole steps round the pointer, both scrollbars then; Ctrl+0 fits it again
    const zoom = await chrome.ev(`(async () => {
      const D = Cutaway.display, s0 = D.scale, p = D.toClient(160, 90), pt0 = Cutaway.scene.camera.x + 160;
      for (let i = 0; i < 3; i++) { D.screen.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 50)); }
      const s1 = D.scale, pt1 = Cutaway.scene.camera.x + D.toLogical(p.x, p.y).x;
      await new Promise((r) => setTimeout(r, 100));
      const both = [...document.querySelectorAll(".cw-picbars .cw-sb")].every((b) => getComputedStyle(b).display !== "none");
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit0", key: "0", ctrlKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
      return { s0, s1, pt0, pt1, both, fitted: D.scale === s0 && D.view.zoom === 0 };
    })()`);
    t.ok("editor: the wheel zooms the picture round the pointer, scrollbars both ways; Ctrl+0 fits it again", zoom.s1 === zoom.s0 + 3 && Math.abs(zoom.pt1 - zoom.pt0) <= 1 && zoom.both && zoom.fitted, JSON.stringify(zoom));
    await chrome.ev(`delete Cutaway.room.get("hall").size; 1`);
    // the panels' edges resize them, and the sizes are kept
    const sized = await chrome.ev(`(async () => {
      const e = document.querySelector(".cw-split.col"), r = e.getBoundingClientRect(), x = r.left + 3, y = r.top + 200;
      const ev = (type, px) => e.dispatchEvent(new PointerEvent(type, { clientX: px, clientY: y, bubbles: true, pointerId: 6, button: 0, buttons: 1 }));
      const w0 = ${E}.layout.leftW; ev("pointerdown", x); ev("pointermove", x + 50); ev("pointerup", x + 50);
      await new Promise((r) => setTimeout(r, 100));
      return { w0, w1: ${E}.layout.leftW, kept: JSON.parse(localStorage.getItem("cutaway.editor.layout")).leftW, panel: Math.round(document.querySelector(".cw-left").getBoundingClientRect().width) };
    })()`);
    t.ok("editor: dragging the left panel's edge widens it, and the width is kept", sized.w1 === sized.w0 + 50 && sized.kept === sized.w1 && sized.panel === sized.w1, JSON.stringify(sized));
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
    // zoomed in, the map has scrollbars
    const mapBars = await chrome.ev(`(async () => { ${E}.modules.map.fit(); const box = ${E}.centre.querySelector("canvas").parentElement; box.querySelector("canvas").dispatchEvent(new WheelEvent("wheel", { deltaY: -800, clientX: 600, clientY: 300, bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 100)); return [...box.querySelectorAll(".cw-sb")].map((b) => getComputedStyle(b).display !== "none"); })()`);
    t.ok("map: zoomed in, it has scrollbars both ways", mapBars.length === 2 && mapBars.every(Boolean), JSON.stringify(mapBars));
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
