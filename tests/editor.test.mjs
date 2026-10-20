// The room editor in headless Chrome on the demo: draw a hole with the mouse, drag a corner, undo,
// insert a corner with a double-click, and the saved geometry file gives back the same shapes; the game is
// paused while it is open and its fields keep their keys; a prop moves by its handle; the camera pans.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { launch, sleep } from "../tools/lib/chrome.mjs";
import { load } from "./load.mjs";

export default async function (t) {
  const chrome = await launch({ width: 1400, height: 800 });
  try {
    await chrome.open(pathToFileURL(resolve("demo/index.html")).href + "?manual&edit&act=act1");
    for (let i = 0; i < 40 && !(await chrome.ev("!!(Cutaway.editor && Cutaway.editor.isOpen)")); i++) await sleep(50);
    t.ok("editor: ?edit loads and opens it", await chrome.ev("!!(Cutaway.editor && Cutaway.editor.isOpen && document.querySelector('.cutaway-editor'))"));
    const raw = async (type, x, y, buttons = 1, clickCount = 1) => {
      const c = await chrome.ev(`Cutaway.display.toClient(${x}, ${y})`);
      await chrome.send("Input.dispatchMouseEvent", { type, x: c.x, y: c.y, button: type === "mouseMoved" ? "none" : "left", buttons, clickCount });
    };
    const holes = () => chrome.ev("JSON.stringify(Cutaway.room.get('hall').holes)");
    const before = JSON.parse(await holes()).length;
    await chrome.ev("Cutaway.editor.draw('hole')");
    for (const [x, y] of [[60, 140], [90, 140], [90, 156], [60, 156], [60, 140]]) await chrome.mouse("click", x, y);
    const after = JSON.parse(await holes());
    t.ok("editor: a hole drawn with clicks", after.length === before + 1 && JSON.stringify(after.at(-1)) === "[60,140,90,140,90,156,60,156]", JSON.stringify(after.at(-1)));
    t.ok("editor: the walk map knows the new hole", await chrome.ev("!Cutaway.scene.walkMap.inside({ x: 75, y: 148 })"));
    await raw("mouseMoved", 90, 156, 0); await raw("mousePressed", 90, 156); await raw("mouseMoved", 94, 158); await raw("mouseReleased", 94, 158, 0);
    t.ok("editor: a corner drags", JSON.parse(await holes()).at(-1)[5] === 158);
    await chrome.ev("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true }))");
    t.ok("editor: undo", JSON.parse(await holes()).at(-1)[5] === 156);
    await chrome.ev(`Cutaway.editor.select('hole:${before}')`);
    await raw("mouseMoved", 75, 140, 0); await raw("mousePressed", 75, 140, 1, 1); await raw("mouseReleased", 75, 140, 0, 1);
    await raw("mousePressed", 75, 140, 1, 2); await raw("mouseReleased", 75, 140, 0, 2);
    t.ok("editor: double-click on an edge adds a corner", JSON.parse(await holes()).at(-1).length === 10, await holes());
    const text = await chrome.ev("Cutaway.editor.text()");
    const C = load(["room.js"]);
    C.room("hall", { hotspots: Object.fromEntries((await chrome.ev("Object.keys(Cutaway.room.get('hall').hotspots)")).map((k) => [k, {}])),
      props: (await chrome.ev("Cutaway.room.get('hall').props.map((p) => ({ id: p.id }))")), light: { lamps: [{ id: "sun", at: [0, 0], r: 1 }] }, fx: [{ kind: "haze" }, { kind: "dust" }, { kind: "sparkle" }] });
    vm.runInContext(text, vm.createContext({ Cutaway: C }));
    t.ok("editor: the geometry file gives the same shapes", JSON.stringify(C.room.get("hall").holes) === (await holes()) && C.room.geometryIssues().length === 0, C.room.geometryIssues().join("; "));

    // the game is paused while the editor is open; keys typed in its fields don't reach the game
    t.ok("editor: the game is paused while it is open", await chrome.ev("Cutaway.editor.paused && Cutaway.clock.held && !Cutaway.clock.paused"));
    const leaked = await chrome.ev(`(() => {
      let n = 0; const off = Cutaway.events.on("key", () => n++);
      const f = document.querySelector(".cw-lsf") ?? document.body.appendChild(Object.assign(document.createElement("input"), { className: "cutaway-editor" }));
      f.focus();
      for (const code of ["Escape", "Space", "KeyA"]) f.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true }));
      off(); return n; })()`);
    t.ok("editor: keys in a text field don't reach the game (Esc, Space)", leaked === 0, String(leaked));
    // a prop's place: its handle moves it, the shapes file keeps it (only the props moved)
    const at = await chrome.ev(`(() => { const it = Cutaway.editor.items().find((i) => i.key === "prop:crate"), was = Cutaway.room.get("hall").props.find((p) => p.id === "crate").at.slice();
      it.move(1, it.handles[1].x + 5, it.handles[1].y); const now = Cutaway.room.get("hall").props.find((p) => p.id === "crate").at;
      const g = Cutaway.editor.geometry(); return [now[0] - was[0], now[1] - was[1], !!g.props.crate.at, Object.values(g.props).filter((p) => p.at).length].join(" "); })()`);
    t.ok("editor: a prop's place handle moves it; only a moved prop's place is saved", at === "5 0 true 1", at);
    // the camera pans in a room bigger than the screen, and goes back to the one playing on close
    const cam = await chrome.ev(`(async () => { await Cutaway.editor.openRoom("intro_sky"); const moved = Cutaway.editor.pan(0, 50);
      const y = Cutaway.scene.camera.y; await Cutaway.editor.openRoom("hall"); return [moved, y].join(" "); })()`);
    t.ok("editor: the camera pans in a taller room", cam === "true 50", cam);
    const warn = await chrome.ev(`Cutaway.editor.notLoaded("rooms/hall.geo.js")`);
    t.ok("editor: a shapes file the page doesn't load is warned about", /WARNING: the page loads no hall\.geo\.js/.test(warn), warn);
    t.ok("editor: the script line for a layer, from the page's folder", await chrome.ev(`Cutaway.editor.relTo("demo/index.html", "game/rooms/a.geo.js") === "../game/rooms/a.geo.js" && Cutaway.editor.relTo("index.html", "game/rooms/a.geo.js") === "game/rooms/a.geo.js"`));
    await chrome.ev("Cutaway.editor.close(); 1");
    t.ok("editor: closed, the game runs again", await chrome.ev("!Cutaway.clock.held && !Cutaway.audio.held"));
    t.ok("editor: no page errors", chrome.errors.length === 0, chrome.errors.join(" | "));
  } finally {
    await chrome.close();
  }
}
