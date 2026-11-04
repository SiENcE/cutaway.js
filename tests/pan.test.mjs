// A backdrop's slow pan (src/room.js, load({ backdrop, pan }); the title's `pan`): the camera glides from the
// backdrop's point to `to` and back, eased, as a pure function of the room's clock, kept inside the room.
import { load } from "./load.mjs";

export default async function (t) {
  const C = load(["i18n.js", "state.js", "walk.js", "assets.js", "room.js", "actor.js"]);
  C.display = /** @type {any} */ ({ width: 320, height: 180 });
  C.events ??= { on() {}, emit() {} };
  C.room("wide", { name: "Wide", size: [416, 180] });
  await C.scene.load("wide", { backdrop: [0, 0], pan: { to: [96, 0], ms: 1000 } });
  const at = (ms) => { C.scene.update(ms); return C.scene.camera.x; };
  const x0 = C.scene.camera.x, x1 = at(500), x2 = at(500), x3 = at(500), x4 = at(500);
  t.ok("pan: from the backdrop's point", x0 === 0, String(x0));
  t.ok("pan: halfway at half the time (eased: the middle is the middle)", x1 === 48, String(x1));
  t.ok("pan: at `to` after `ms`, then back", x2 === 96 && x3 === 48 && x4 === 0, [x2, x3, x4].join(" "));
  t.ok("pan: whole pixels on the way", Number.isInteger(at(130)));
  await C.scene.load("wide", { backdrop: [0, 0], pan: { to: [400, 0], ms: 1000 } });
  t.ok("pan: kept inside the room", at(1000) === 96, String(C.scene.camera.x));
  await C.scene.load("wide", { backdrop: [10, 0] });
  t.ok("no pan: the backdrop stays put", at(700) === 10 && at(700) === 10);
}
