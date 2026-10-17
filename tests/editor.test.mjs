// The room editor in headless Chrome on the demo: draw a hole with the mouse, drag a corner, undo,
// insert a corner with a double-click, and the saved geometry file gives back the same shapes.
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
    t.ok("editor: no page errors", chrome.errors.length === 0, chrome.errors.join(" | "));
  } finally {
    await chrome.close();
  }
}
