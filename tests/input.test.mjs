// Scrolling input in headless Chrome on the demo: the wheel's event (in pixels, whatever the wheel's unit), a finger dragging (with what it moved since
// the last time), a drag that was claimed doesn't act when the finger comes up, one that wasn't still does (as before), and the demo's logbook scrolling.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "../tools/lib/chrome.mjs";

export default async function (t) {
  const chrome = await launch({ width: 960, height: 540 });
  try {
    await chrome.open(pathToFileURL(resolve("demo/index.html")).href + "?manual&act=act1");
    for (let i = 0; i < 60 && !(await chrome.ev("!!(Cutaway.scene && Cutaway.scene.active)")); i++) await sleep(100);
    await chrome.ev("Cutaway.debug.settle()");
    await chrome.ev(`window.seen = { wheel: [], drag: [], click: [], claim: false };
      Cutaway.events.on("pointer.wheel", (e) => seen.wheel.push(e));
      Cutaway.events.on("pointer.drag", (e) => { seen.drag.push({ dx: e.dx, dy: e.dy, from: e.from }); if (seen.claim) e.claim(); });
      Cutaway.events.on("pointer.click", (e) => seen.click.push(e.button));
      window.fire = (type, x, y, id = 7) => { const r = Cutaway.display.screen.getBoundingClientRect();
        Cutaway.display.screen.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: r.left + r.width * x / 320, clientY: r.top + r.height * y / 180, bubbles: true })); };
      window.wheel = (deltaY, deltaMode) => { const r = Cutaway.display.screen.getBoundingClientRect();
        const e = new WheelEvent("wheel", { deltaY, deltaMode, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true });
        Cutaway.display.screen.dispatchEvent(e); return e.defaultPrevented; };`);

    const w = await chrome.ev(`const stopped = wheel(120, 0); wheel(3, 1); [stopped, seen.wheel[0].dy, seen.wheel[1].dy, seen.wheel[0].x, seen.wheel[0].y]`);
    t.ok("wheel: in pixels, at the pointer, and the page doesn't scroll", w[0] === true && w[1] === 120 && w[2] === 48 && w[3] === 160 && w[4] === 90, JSON.stringify(w));

    const d = await chrome.ev(`fire("pointerdown", 100, 100); fire("pointermove", 101, 100); const before = seen.drag.length;
      fire("pointermove", 100, 90); fire("pointermove", 100, 80); fire("pointerup", 100, 80); [before, seen.drag.length, seen.drag[1]?.dy, seen.drag[0]?.from?.y, seen.click.length]`);
    t.ok("drag: not for a finger that hardly moved, then what it moved each time, from where it began", d[0] === 0 && d[1] === 2 && d[2] === -10 && d[3] === 100, JSON.stringify(d));
    t.ok("drag: nobody claimed it, so the finger coming up acts where it went down, as before", d[4] === 1, JSON.stringify(d));

    const c = await chrome.ev(`seen.claim = true; seen.click.length = 0; fire("pointerdown", 100, 100); fire("pointermove", 100, 80); fire("pointerup", 100, 80); seen.click.length`);
    t.ok("drag: a claimed one doesn't act", c === 0, String(c));

    const l = await chrome.ev(`seen.claim = false; const L = Cutaway.demoLog; L.open = true; L.y = 0; wheel(64, 0); const a = L.y; fire("pointerdown", 160, 120); fire("pointermove", 160, 110); fire("pointerup", 160, 110);
      const b = L.y; const n = seen.click.length; L.open = false; [a, b]`);
    t.ok("the demo's logbook scrolls by wheel and by finger", l[0] > 0 && l[1] === l[0] + 10, JSON.stringify(l));
  } finally {
    await chrome.close();
  }
}
