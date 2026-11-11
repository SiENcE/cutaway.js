// The tools' way to a hotspot out of view (src/debug.js towards): in a room bigger than the screen, a click on the floor at the
// screen's edge on its side walks the one played (and the camera) towards it, left or right, and above or below in a room that
// scrolls up and down too (a market seen from above).
import { load } from "./load.mjs";

export default async function (t) {
  const C = load(["i18n.js", "state.js", "walk.js", "assets.js", "room.js", "actor.js", "debug.js"]);
  C.display = /** @type {any} */ ({ width: 320, height: 180 });
  C.ui = /** @type {any} */ ({ reveal: () => null });
  C.room("market", { name: "Market", size: [640, 540], walk: [[0, 0, 640, 0, 640, 540, 0, 540]],
    hotspots: { below: { name: "below", rect: [140, 480, 40, 30] }, above: { name: "above", rect: [140, 40, 40, 20] }, east: { name: "east", rect: [600, 470, 30, 30] } } });
  C.actor("p", { name: "P", room: "market", at: [160, 60], costume: { idle: "x" } });
  await C.scene.load("market");
  C.scene.setActive("p");
  const below = C.debug.towards("below");
  t.ok("a hotspot below the screen: a point on the floor near the bottom edge, under it", !!below && below.y > 180 * 3 / 4 && Math.abs(below.x - 160) < 40, JSON.stringify(below));
  t.ok("... and none for one in view", C.debug.towards("above") === null);
  const east = C.debug.towards("east");
  t.ok("one off to the side and below: the side first, as before", !!east && east.x > 300, JSON.stringify(east));
  const p = C.actors.get("p");
  p.place("market", 160, 500); C.scene.setActive("p");
  const above = C.debug.towards("above");
  t.ok("a hotspot above the screen: a point near the top edge, clear of the satchel's bar", !!above && above.y >= 30 && above.y < 180 / 4 + 31, JSON.stringify(above));
}
