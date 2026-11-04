// A see-through prop (PropDef.seeThrough), in headless Chrome on the demo's yard: an actor behind the lamp post
// shows through it on every other pixel of the post's box where the figure is, one in front changes nothing.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "../tools/lib/chrome.mjs";

export default async function (t) {
  const chrome = await launch({ width: 960, height: 540 });
  try {
    await chrome.open(pathToFileURL(resolve("demo/index.html")).href + "?manual&act=act1");
    for (let i = 0; i < 60 && !(await chrome.ev("!!(Cutaway.scene && Cutaway.scene.active)")); i++) await sleep(100);
    await chrome.ev("Cutaway.debug.settle()");
    // the pixels of the lamp post's box, with the post see-through and without, the actor at (x, y)
    const diff = (x, y) => chrome.ev(`(async () => {
      Cutaway.scene.go("yard", [${x}, ${y}], "left", { transition: false });
      await Cutaway.debug.settle(); Cutaway.clock.advance(20);
      const lamp = Cutaway.room.get("yard").props.find((p) => p.id === "lamp");
      const box = Cutaway.scene.propBox(lamp), cam = Cutaway.scene.camera;
      const grab = () => { Cutaway.clock.advance(1); return Cutaway.display.buffer.getContext("2d").getImageData(box[0] - cam.x, box[1] - cam.y, box[2], box[3]).data; };
      lamp.seeThrough = true; const on = grab();
      lamp.seeThrough = false; const off = grab();
      lamp.seeThrough = true;
      const px = [];
      for (let i = 0; i < on.length; i += 4) if (on[i] !== off[i] || on[i + 1] !== off[i + 1] || on[i + 2] !== off[i + 2]) { const k = i / 4; px.push([box[0] + (k % box[2]), box[1] + Math.floor(k / box[2])]); }
      return { n: px.length, parity: [...new Set(px.map(([a, b]) => (a + b) & 1))] };
    })()`);
    const behind = await diff(270, 131);
    t.ok("see-through: an actor behind the lamp post shows through it", behind.n > 10, JSON.stringify(behind));
    t.ok("see-through: on every other pixel (a checkerboard fixed to the room)", behind.parity.length === 1, JSON.stringify(behind));
    const before = await diff(270, 160);
    t.ok("see-through: an actor in front of it changes nothing", before.n === 0, JSON.stringify(before));
    t.ok("see-through: no page errors", chrome.errors.length === 0, chrome.errors.join(" | "));
  } finally {
    await chrome.close();
  }
}
