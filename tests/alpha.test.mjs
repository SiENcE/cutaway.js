// A prop's alpha (PropDef.alpha), in headless Chrome on the demo's yard: the picture under the prop is mixed with it by that much, whatever else stands there.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "../tools/lib/chrome.mjs";

export default async function (t) {
  const chrome = await launch({ width: 960, height: 540 });
  try {
    await chrome.open(pathToFileURL(resolve("demo/index.html")).href + "?manual&act=act1");
    for (let i = 0; i < 60 && !(await chrome.ev("!!(Cutaway.scene && Cutaway.scene.active)")); i++) await sleep(100);
    await chrome.ev("Cutaway.debug.settle()");
    const r = await chrome.ev(`(async () => {
      Cutaway.scene.go("yard", [60, 160], "left", { transition: false });
      await Cutaway.debug.settle(); Cutaway.clock.advance(20);
      const def = Cutaway.room.get("yard").props.find((p) => p.id === "holo"), was = def.alpha;
      const box = Cutaway.scene.propBox(def), cam = Cutaway.scene.camera;
      const grab = (a) => { def.alpha = a; Cutaway.scene.render(Cutaway.display.buffer.getContext("2d")); return Cutaway.display.buffer.getContext("2d").getImageData(box[0] - cam.x, box[1] - cam.y, box[2], box[3]).data; };
      const none = grab(0), part = grab(0.35), full = grab(1), unset = grab(undefined);
      def.alpha = was;
      let sumFull = 0, sumPart = 0, same = true;
      for (let i = 0; i < full.length; i += 4) for (let c = 0; c < 3; c++) { sumFull += Math.abs(full[i + c] - none[i + c]); sumPart += Math.abs(part[i + c] - none[i + c]); if (unset[i + c] !== full[i + c]) same = false; }
      return { was, sumFull, ratio: sumPart / sumFull, same };
    })()`);
    t.ok("alpha: the demo's projection is partly there", r.was > 0 && r.was < 1, JSON.stringify(r));
    t.ok("alpha: the prop shows at all", r.sumFull > 0, JSON.stringify(r));
    t.ok("alpha: 0.35 is about a third of the way from nothing to all of it", Math.abs(r.ratio - 0.35) < 0.05, JSON.stringify(r));
    t.ok("alpha: left out it is fully there", r.same, JSON.stringify(r));
    t.ok("alpha: no page errors", chrome.errors.length === 0, chrome.errors.join(" | "));
  } finally {
    await chrome.close();
  }
}
