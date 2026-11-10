// The editor's Map tab and what a game's own tabs build on, in headless Chrome on a copy of the demo with the
// studio: a tab the game lists in studio.json ("editor") is loaded after the engine's; a tab's drag hook gets
// the pointer's down, moves and up on the picture; the Map tab finds the rooms, their exits and script warps,
// what the start doesn't reach and a way to no room; the Art tab opens a pxl source at a line.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  mkdirSync(join(dir, "demo", "layers"), { recursive: true });
  writeFileSync(join(dir, "demo", "layers", "times.js"), `"use strict";
// a guard and two cats: the Schedule tab's test
Cutaway.time.configure({ start: "18:00", end: "02:00" });
Cutaway.routine("guard", [
  { day: 1, from: "20:00", to: "22:00", room: "hall", at: [100, 140] },
  { day: 1, from: "21:00", to: "23:00", if: "door_open", room: "yard", at: [60, 140] },
  { day: 2, from: "19:00", to: "20:00", room: "yard" },
]);
for (const id of ["cat_a", "cat_b"]) Cutaway.routine(id, [{ day: 1, from: "19:00", to: "19:30", room: "yard" }]);
const BELL = "22:30";
Cutaway.moment("bell", { room: "yard", day: 1, from: BELL, to: "22:45", play: [] });
const RING = [{ sfx: "_tick" }];
Cutaway.moment("ring", { room: "hall", day: 2, from: "19:00", to: "19:15", play: RING });
const SPOT = [60, 140];
Cutaway.moment("dog", { room: "yard", day: 2, from: "20:00", to: "20:15", play: [
  { say: "pip", text: "Here." },   // pip calls
  { walk: "pip", to: SPOT },
] });
Cutaway.moment("gong", { room: "hall", day: 2, from: "21:00", to: "21:15", play: [...RING, { set: "gonged" }] });
Cutaway.time.mark("01:00");
`);
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
    // the Schedule tab: the demo has no game time, so the test gives it a day, routines and a moment, in a file of its
    // own (layers/times.js: where the studio may write), loaded now
    await chrome.ev(`new Promise((ok) => { const s = document.createElement("script"); s.src = "layers/times.js"; s.onload = ok; document.body.append(s); })`);
    await chrome.ev(`(() => { Cutaway.state.set("day", 1); Cutaway.state.set("time", 21 * 60 + 15); ${E}.show("schedule"); return 1; })()`);
    await sleep(300);
    const tt = await chrome.ev(`(() => { const d = ${E}.modules.schedule.table(1); return { days: ${E}.modules.schedule.days(), lanes: d.actors.map((a) => a.actor + ":" + a.lanes.length).join(), moments: d.moments.map((m) => m.id).join(),
      stops: d.stops.map((s) => Cutaway.time.format(s)).join(" "), span: Cutaway.time.format(d.t0) + "-" + Cutaway.time.format(d.t1),
      bars: [...${E}.centre.querySelectorAll("[title]")].filter((e) => /^(guard|cat_a|cat_b|bell):/.test(e.title)).length }; })()`);
    t.ok("schedule: a day's table: the guard's two entries in two lanes (they overlap), the moment, the day's span", tt.lanes === "guard:2,cat_a:1,cat_b:1" && tt.moments === "bell" && tt.span === "18:00-02:00" && tt.days.join() === "1,2", JSON.stringify(tt));
    t.ok("schedule: the stops of the clock are every start and end that day and the marks", tt.stops === "19:00 19:30 20:00 21:00 22:00 22:30 22:45 23:00 01:00", tt.stops);
    t.ok("schedule: the bars drawn in the centre", tt.bars === 5, String(tt.bars));
    await chrome.ev(`${E}.modules.schedule.select({ kind: "routine", actor: "guard", i: 1 }); 1`);
    await sleep(150);
    t.ok("schedule: a picked entry shows its room and its condition", /guard, entry 1/.test(await chrome.ev("document.body.textContent")) && /if door_open/.test(await chrome.ev("document.body.textContent")));
    await chrome.ev(`${E}.modules.schedule.day = 2; 1`);
    await sleep(150);
    t.ok("schedule: another day", (await chrome.ev(`${E}.modules.schedule.table(2).actors[0].lanes[0].length`)) === 1);
    // the zoom: Fit puts the day in the view's width; the wheel zooms round the pointer, the time under it staying
    const zm = await chrome.ev(`(async () => {
      const M = ${E}.modules.schedule, box = ${E}.centre.firstElementChild ?? ${E}.centre, d = M.table(2), q = (d.t1 - d.t0) / 15;
      M.fit(); await new Promise((r) => setTimeout(r, 50));
      const fitted = Math.abs(150 + q * M.width + 12 - box.clientWidth) <= 2;
      const r = box.getBoundingClientRect(), px = 400, before = (box.scrollLeft + px - 150) / M.width;
      box.dispatchEvent(new WheelEvent("wheel", { deltaY: -500, clientX: r.left + px, clientY: r.top + 60, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 50));
      const after = (box.scrollLeft + px - 150) / M.width;
      return { fitted, wider: M.width > (box.clientWidth - 162) / q * 2, kept: Math.abs(after - before) < 0.05, w: M.width };
    })()`);
    t.ok("schedule: Fit puts the day in the view; the wheel zooms round the pointer, the time there staying", zm.fitted && zm.wider && zm.kept, JSON.stringify(zm));
    // changing times: in the file where they are written (only that value), in the game at once; undo; save
    const M = `${E}.modules.schedule`, file = join(dir, "demo", "layers", "times.js");
    const src0 = readFileSync(file, "utf8");
    t.ok("schedule: where a routine is written (its file and line)", JSON.stringify(await chrome.ev(`${M}.where("routine", "guard")`)) === '{"path":"layers/times.js","line":4}');
    const ch = await chrome.ev(`(async () => { const ok = await ${M}.change("routine", "guard", 0, { from: "20:15" }); return { ok, live: Cutaway.time.routines.get("guard")[0].from, unsaved: ${M}.unsaved, text: ${E}.files.text("layers/times.js") }; })()`);
    t.ok("schedule: a time changed in the game and in the file's text, only that value, not saved yet", ch.ok && ch.live === "20:15" && ch.unsaved === 1 && ch.text === src0.replace('from: "20:00", to: "22:00"', 'from: "20:15", to: "22:00"'), JSON.stringify(ch).slice(0, 300));
    const cats = await chrome.ev(`(async () => { const ok = await ${M}.change("routine", "cat_a", 0, { to: "19:45" }); return { ok, shared: ${M}.sharing("routine", "cat_a").join(), b: Cutaway.time.routines.get("cat_b")[0].to }; })()`);
    t.ok("schedule: routines a loop makes share their text: a change moves them all", cats.ok && cats.shared === "cat_a,cat_b" && cats.b === "19:45", JSON.stringify(cats));
    const bell = await chrome.ev(`(async () => ({ ok: await ${M}.change("moment", "bell", 0, { from: "22:15" }), live: Cutaway.time.moments.get("bell").from }))()`);
    t.ok("schedule: a value the file computes (a variable) is left to the file", !bell.ok && bell.live === "22:30", JSON.stringify(bell));
    const days = await chrome.ev(`(async () => { const ok = await ${M}.change("moment", "bell", 0, { day: [1, 2] }); return { ok, day: Cutaway.time.moments.get("bell").day }; })()`);
    t.ok("schedule: a moment's days changed", days.ok && JSON.stringify(days.day) === "[1,2]", JSON.stringify(days));
    await chrome.ev(`(() => { document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", key: "z", ctrlKey: true, bubbles: true })); return 1; })()`);
    t.ok("schedule: Ctrl+Z undoes the last change, in the game and the text", (await chrome.ev(`Cutaway.time.moments.get("bell").day`)) === 1 && !(await chrome.ev(`${E}.files.text("layers/times.js")`)).includes("day: [1, 2]"));
    // a real click on a bar picks it (the bar takes the pointer when pressed, for a drag: the click must still pick)
    const mouseAt = async (fn, double = false) => {
      const p = await chrome.ev(`(() => { const b = [...${E}.centre.querySelectorAll("[title]")].find(${fn}), r = b.getBoundingClientRect(); return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 }; })()`);
      for (const n of double ? [1, 2] : [1]) {
        await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
        await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: n });
        await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: n });
      }
      await sleep(200);
    };
    await chrome.ev(`(() => { ${M}.select(null); ${M}.day = 1; return 1; })()`);
    await sleep(200);
    await mouseAt(`(e) => /^bell:/.test(e.title)`);
    t.ok("schedule: a click on a moment's bar picks it: its times and its scripts in the inspector", JSON.stringify(await chrome.ev(`${M}.selected`)) === JSON.stringify({ kind: "moment", id: "bell" }) &&
      /play \(\d+ steps?\)/.test(await chrome.ev("document.querySelector('.cutaway-editor').textContent")), JSON.stringify(await chrome.ev(`${M}.selected`)));

    // a moment's script as blocks in the centre, written into its file (only the steps that changed)
    await chrome.ev(`${M}.select({ kind: "moment", id: "bell" }); ${M}.openScript("bell", "play")`);
    await sleep(300);
    t.ok("schedule: a moment's play opens as blocks in the centre", /moment bell: play/.test(await chrome.ev(`${E}.centre.textContent`)) && (await chrome.ev(`${M}.script?.id`)) === "bell");
    const sc = await chrome.ev(`(async () => { const ok = await ${M}.changeScript("bell", "play", [{ sfx: "_tick" }, { set: "bell_rang" }]); return { ok, live: Cutaway.time.moments.get("bell").play, text: ${E}.files.text("layers/times.js") }; })()`);
    t.ok("schedule: its steps changed: in the game and in the file", sc.ok && sc.live.length === 2 && sc.text.includes('play: [{ sfx: "_tick" }, { set: "bell_rang" }] });'), sc.text);
    const sc2 = await chrome.ev(`(async () => { const ok = await ${M}.changeScript("bell", "play", [{ sfx: "_tick" }, { wait: 500 }, { set: "bell_rang" }]); return { ok, text: ${E}.files.text("layers/times.js") }; })()`);
    t.ok("schedule: a step put in between: only it is added, the others stay as written", sc2.ok && /\{ sfx: "_tick" \},\s*\{ wait: 500 \},\s*\{ set: "bell_rang" \}/.test(sc2.text) && sc2.text.includes("// a guard and two cats"), sc2.text);
    const ring = await chrome.ev(`(async () => ({ ok: await ${M}.changeScript("ring", "play", [{ wait: 100 }]), live: Cutaway.time.moments.get("ring").play.length }))()`);
    // steps that hold code: kept as written; a change to their code is left to the file; a list spread into it too
    const dog = await chrome.ev(`(async () => {
      const a = await ${M}.changeScript("dog", "play", [{ say: "pip", text: "Here, boy." }, { walk: "pip", to: [60, 140] }, { set: "dog_called" }]);
      const textA = ${E}.files.text("layers/times.js");
      const b = await ${M}.changeScript("dog", "play", [{ say: "pip", text: "Here, boy." }, { walk: "pip", to: [70, 140] }, { set: "dog_called" }]);
      const g = await ${M}.changeScript("gong", "play", [{ sfx: "_tick" }]);
      return { a, b, g, textA, textB: ${E}.files.text("layers/times.js"), gong: Cutaway.time.moments.get("gong").play.length }; })()`);
    t.ok("schedule: a step that holds code stays as written while another changes (its comment too)", dog.a && /text: "Here, boy\." \},\s+\/\/ pip calls\n\s+\{ walk: "pip", to: SPOT \},\s*\{ set: "dog_called" \}/.test(dog.textA), dog.textA.slice(dog.textA.indexOf('"dog"'), dog.textA.indexOf('"gong"')));
    t.ok("schedule: a change to a value the code computes (to: SPOT) is left to the file", !dog.b && dog.textB === dog.textA, JSON.stringify(dog.b) + dog.textB.slice(dog.textB.indexOf('"dog"'), dog.textB.indexOf('"gong"')));
    t.ok("schedule: a list spread into a script (...RING) is left to the file", !dog.g && dog.gong === 2);
    t.ok("schedule: a script the file computes (a variable) is left to the file", !ring.ok && ring.live === 1, JSON.stringify(ring));
    await chrome.ev(`${M}.script.view.selectNone(); 1`);
    await sleep(200);
    t.ok("schedule: closed, the timetable is back in the centre", !(await chrome.ev(`${M}.script`)) && !/moment bell: play/.test(await chrome.ev(`${E}.centre.textContent`)));
    // Ctrl+Z twice: the dog's change, then the step put into the bell's
    await chrome.ev(`(() => { for (let i = 0; i < 2; i++) document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", key: "z", ctrlKey: true, bubbles: true })); return 1; })()`);
    await sleep(200);
    t.ok("schedule: Ctrl+Z: the changes go again, in the game and the file", (await chrome.ev(`Cutaway.time.moments.get("dog").play.length`)) === 2 && (await chrome.ev(`Cutaway.time.moments.get("bell").play.length`)) === 2 && !(await chrome.ev(`${E}.files.text("layers/times.js")`)).includes("wait: 500"));
    await chrome.ev(`${M}.save()`);
    await sleep(300);
    const saved = readFileSync(file, "utf8");
    t.ok("schedule: Save writes the file: the changes there, its comments kept", saved.includes('from: "20:15"') && saved.includes('to: "19:45"') && saved.includes('{ set: "bell_rang" }') && saved.includes("// a guard and two cats") && (await chrome.ev(`${M}.unsaved`)) === 0, saved.slice(0, 400));
    // a bar dragged by its right end, two quarter hours on
    await chrome.ev(`(() => { ${M}.day = 1; ${M}.fit(); return 1; })()`);
    await sleep(200);
    const dragged = await chrome.ev(`(async () => {
      const b = [...${E}.centre.querySelectorAll("[title]")].find((e) => /^guard: 20:15/.test(e.title)), r = b.getBoundingClientRect(), box = ${E}.centre.firstElementChild ?? ${E}.centre;
      const at = (x) => ({ clientX: x, clientY: r.top + 5, button: 0, bubbles: true, pointerId: 1 });
      b.dispatchEvent(new PointerEvent("pointerdown", at(r.right - 2)));
      box.dispatchEvent(new PointerEvent("pointermove", at(r.right - 2 + 2 * ${M}.width)));
      box.dispatchEvent(new PointerEvent("pointerup", at(r.right - 2 + 2 * ${M}.width)));
      await new Promise((ok) => setTimeout(ok, 100));
      return Cutaway.time.routines.get("guard")[0].to; })()`);
    t.ok("schedule: a bar dragged by its end: two quarter hours later", dragged === "22:30", String(dragged));
    await mouseAt(`(e) => /^bell:/.test(e.title)`, true);
    t.ok("schedule: a double click on a bar opens its room", (await chrome.ev(`${E}.activeTab`)) === "room" && (await chrome.ev("Cutaway.scene.room.id")) === "yard",
      `${await chrome.ev(`${E}.activeTab`)} ${await chrome.ev("Cutaway.scene.room.id")}`);

    // one text per file for every tab (E.files). A file saved and then changed on the disk: the next change is made on
    // the disk's text, so the disk's change stays
    await chrome.ev(`${M}.save()`);
    writeFileSync(file, readFileSync(file, "utf8").replace("// a guard and two cats", "// a guard and two cats (changed on the disk)"));
    const re = await chrome.ev(`(async () => { const ok = await ${M}.change("routine", "guard", 0, { from: "20:30" }); await ${M}.save(); return ok; })()`);
    const reText = readFileSync(file, "utf8");
    t.ok("files: a file changed on the disk after a save: the next change is made on the disk's text", re && reText.includes("(changed on the disk)") && reText.includes('from: "20:30"'), reText.slice(0, 400));
    // the source editor shows what the tab changed and not saved; a change there and the tab's both go into the file
    await chrome.ev(`(async () => { await ${M}.change("routine", "guard", 0, { from: "20:15" }); await ${E}.modules.art.openSource("layers/times.js"); return 1; })()`);
    await sleep(300);
    const both = await chrome.ev(`(async () => {
      const a = [...document.querySelectorAll("textarea")].find((x) => x.value.includes("a guard and two cats"));
      const shown = !!a && a.value.includes('from: "20:15"');
      if (a) { a.value = a.value.replace("// a guard and two cats (changed on the disk)", "// a guard, two cats"); a.dispatchEvent(new Event("input")); }
      await ${M}.save();
      return { shown, art: ${E}.modules.art.unsaved ?? 0, tab: ${E}.unsaved().join() }; })()`);
    const bothText = readFileSync(file, "utf8");
    t.ok("files: the source editor shows the tab's unsaved change; a change there and the tab's both go into the file", both.shown && bothText.includes('from: "20:15"') && bothText.includes("// a guard, two cats") && !both.tab,
      JSON.stringify(both) + bothText.slice(0, 300));
    // changed on the disk while the editor has unsaved changes: it isn't written over, the editor asks (reload, overwrite, leave it)
    await chrome.ev(`${M}.change("routine", "guard", 0, { from: "20:30" })`);
    writeFileSync(file, readFileSync(file, "utf8").replace("// a guard, two cats", "// a guard, two cats, a disk"));
    const asking = chrome.ev(`${M}.save().then(() => 1)`);
    let prompted = false;
    for (let i = 0; i < 30 && !(prompted = await chrome.ev(`!!document.querySelector(".cw-ask")`)); i++) await sleep(50);
    const kept = readFileSync(file, "utf8");
    t.ok("files: a file changed on the disk while the editor has unsaved changes isn't written over: the editor asks", prompted && kept.includes("a disk") && kept.includes('from: "20:15"'), kept.slice(0, 300));
    const answer = (/** @type {RegExp} */ re) => chrome.ev(`(() => { const b = [...document.querySelectorAll(".cw-ask button")].find((x) => ${re}.test(x.textContent)); if (b) b.click(); return !!b; })()`);
    if (prompted) await answer(/Leave/);
    await asking;
    t.ok("files: left as it is, nothing is written and the change is still unsaved", readFileSync(file, "utf8") === kept && (await chrome.ev(`${E}.files.unsaved("layers/times.js")`)) === true);
    const asking2 = chrome.ev(`${M}.save().then(() => 1)`);
    prompted = false;
    for (let i = 0; i < 30 && !(prompted = await chrome.ev(`!!document.querySelector(".cw-ask")`)); i++) await sleep(50);
    if (prompted) await answer(/Reload/);
    await asking2;
    const reloaded = await chrome.ev(`(() => { const x = ${E}.files.text("layers/times.js"); return { text: x === ${JSON.stringify(kept)}, unsaved: ${E}.files.unsaved("layers/times.js"), shown: [...document.querySelectorAll("textarea")].some((a) => a.value.includes("a disk")) }; })()`);
    t.ok("files: Reload takes the disk's text (the source editor shows it), nothing unsaved", reloaded.text && !reloaded.unsaved && reloaded.shown, JSON.stringify(reloaded));
    await chrome.ev(`(() => { ${E}.show("schedule"); document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", key: "z", ctrlKey: true, bubbles: true })); return 1; })()`);
    await sleep(100);
    t.ok("files: Ctrl+Z after Reload leaves the disk's text alone", (await chrome.ev(`${E}.files.text("layers/times.js")`)) === kept);
    await chrome.ev(`${M}.change("routine", "guard", 0, { from: "20:45" })`);
    writeFileSync(file, kept.replace("a disk", "a disk again"));
    const asking4 = chrome.ev(`${M}.save().then(() => 1)`);
    prompted = false;
    for (let i = 0; i < 30 && !(prompted = await chrome.ev(`!!document.querySelector(".cw-ask")`)); i++) await sleep(50);
    if (prompted) await answer(/Overwrite/);
    await asking4;
    const over = readFileSync(file, "utf8");
    t.ok("files: Overwrite writes the editor's text", prompted && over.includes('from: "20:45"') && !over.includes("a disk again"), over.slice(0, 300));
    // a file with CRLF typed in in the source editor keeps its line ends (a textarea gives LF only)
    const crlf = join(dir, "demo", "layers", "crlf.js");
    writeFileSync(crlf, '"use strict";\r\n// one\r\n// two\r\n');
    await chrome.ev(`${E}.modules.art.openSource("layers/crlf.js", 3).then(() => 1)`);
    await sleep(300);
    const crSel = await chrome.ev(`(() => { const a = [...document.querySelectorAll("textarea")].find((x) => x.value.includes("// two")); return [a.selectionStart, a.selectionEnd].join(); })()`);
    t.ok("files: a CRLF file opened at a line: that line is selected", crSel === "21,27", crSel);
    await chrome.ev(`(() => { const a = [...document.querySelectorAll("textarea")].find((x) => x.value.includes("// two")); a.value = a.value.replace("// two", "// two, three"); a.dispatchEvent(new Event("input")); return 1; })()`);
    const typed = await chrome.ev(`${E}.files.text("layers/crlf.js")`);
    t.ok("files: a file with CRLF keeps its line ends when typed in in the source editor", typed === '"use strict";\r\n// one\r\n// two, three\r\n', JSON.stringify(typed));
    t.ok("map: no page errors", chrome.errors.length === 0, chrome.errors.join("\n"));
  } finally {
    await chrome.close();
    s.close();
  }
}
