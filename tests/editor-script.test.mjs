// The script blocks' reading of steps in Node (src/editor-script.js with a stub editor): a step's kind
// is its first key that names an action, as the script runner reads it (a goto with a face is a goto,
// a letterbox that doesn't wait isn't a wait), and a step edited keeps its keys in their order.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

export default async function (t) {
  const ctx = vm.createContext({ console, Math, JSON, Promise, setTimeout });
  for (const f of ["core.js", "script.js"]) vm.runInContext(readFileSync(path.join(src, f), "utf8"), ctx, { filename: f });
  vm.runInContext("Cutaway.editor = { el() {}, button() {}, modules: {} }; Cutaway.script.action('organ', () => {});", ctx);
  vm.runInContext(readFileSync(path.join(src, "editor-script.js"), "utf8"), ctx, { filename: "editor-script.js" });
  const S = vm.runInContext("Cutaway.editor.modules.script", ctx);

  const cases = [
    [{ place: "bolt", room: "yard", at: [1, 2], face: "left" }, "place"],
    [{ goto: "yard", at: [1, 2], face: "left", follow: false }, "goto"],
    [{ walk: "bolt", to: [1, 2], face: "up", wait: false }, "walk"],
    [{ face: "bolt", to: "up" }, "face"],
    [{ letterbox: true, ms: 800, wait: false }, "letterbox"],
    [{ camera: [0, 120], ms: 6000, ease: "inOut", wait: false }, "camera"],
    [{ caption: "Paris, 1925.", at: "bl", type: true, ms: 2500 }, "caption"],
    [{ play: "tv", anim: "tv_news", loop: true }, "play"],
    [{ fade: 0 }, "fade"],
    [{ tape: 0.8, ms: 700, wait: false }, "tape"],
    [{ organ: "bach", wait: 100 }, "other"],                 // an action the blocks don't know comes first
    [{ at: [3, 4], goto: "yard" }, "goto"],                  // `at` names no action: the goto is the step
    ["Hello.", "line"],
    [{ if: "x", then: [] }, "if"],
  ];
  const got = cases.map(([s]) => S.kindOf(s)), want = cases.map(([, k]) => k);
  t.ok("blocks: a step's kind is its first key that names an action", JSON.stringify(got) === JSON.stringify(want), got.join(","));

  // a field changed: the step keeps its keys in their order (the main one first)
  const keys = (/** @type {any} */ s) => Object.keys(s).join(",");
  const place = { place: "bolt", room: "yard", at: [1, 2], face: "left" };
  const f = S.read("place", place);
  f.face = "right";
  const edited = S.write("place", f);
  t.ok("blocks: a place edited stays a place, its keys in order", keys(edited) === "place,room,at,face" && edited.face === "right" && S.kindOf(edited) === "place", JSON.stringify(edited));
  const go = S.write("goto", { ...S.read("goto", { goto: "yard", at: [1, 2], face: "left", follow: false }), at: [5, 6] });
  t.ok("blocks: a goto edited keeps its face and follow after it", keys(go) === "goto,at,face,follow" && S.kindOf(go) === "goto", JSON.stringify(go));
  const fade = S.write("fade", S.read("fade", { fade: 0, ms: 400 }));
  t.ok("blocks: a fade to 0 stays 0", fade.fade === 0 && fade.ms === 400, JSON.stringify(fade));
}
