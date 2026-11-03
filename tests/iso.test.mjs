// Unit tests for isometric rooms: diagonal facings (src/actor.js) and props' front lines (src/room.js).
import { load } from "./load.mjs";

export default async function (t) {
  const C = load(["i18n.js", "state.js", "walk.js", "assets.js", "room.js", "actor.js"]);
  const step = (a, ms) => { for (let i = 0; i < ms / 20; i++) a.update(20); };

  // ---- diagonal facings
  const iso = { idle: { se: "j_idle_se", ne: "j_idle_ne" }, walk: { se: "j_walk_se", ne: "j_walk_ne" } };
  const j = C.actor("j", { costume: iso, at: [100, 100], speed: [32, 16] });
  j.walkTo(140, 120); step(j, 100);
  t.ok("down-right: se, as drawn", j.facing === "se" && j.look().anim === "j_walk_se" && !j.look().flip);
  j.walkTo(60, 100); step(j, 100);
  t.ok("down-left... up-left: nw is ne mirrored", j.facing === "nw" && j.look().anim === "j_walk_ne" && j.look().flip);
  j.walkTo(j.x - 40, j.y + 20); step(j, 100);
  t.ok("down-left: sw is se mirrored", j.facing === "sw" && j.look().anim === "j_walk_se" && j.look().flip);
  j.walkTo(j.x + 40, j.y - 20); step(j, 100);
  t.ok("up-right: ne", j.facing === "ne" && j.look().anim === "j_walk_ne" && !j.look().flip);
  j.walkTo(j.x + 40, j.y); step(j, 100);
  t.ok("a flat step keeps the row it faced", j.facing === "ne");
  step(j, 5000);
  t.ok("standing: the idle view of the facing", j.state === "idle" && j.look().anim === "j_idle_ne");
  j.face("left");
  t.ok("a side facing on an iso costume: left looks down-left", j.look().anim === "j_idle_se" && j.look().flip);
  j.face("up");
  t.ok("up looks up-right", j.look().anim === "j_idle_ne" && !j.look().flip);

  const front = C.actor("f", { costume: { idle: { se: "f_se" }, walk: { se: "f_se" } }, at: [0, 0] });
  front.face("nw");
  t.ok("only a front view: walking away uses it, mirrored", front.look().anim === "f_se" && front.look().flip);
  const side = C.actor("s", { costume: { idle: "s_r", walk: "s_r" }, at: [0, 0] });
  side.walkTo(-40, 20); step(side, 100);
  t.ok("a side costume ignores the diagonals", side.facing === "left" && side.look().flip);
  side.face("sw");
  t.ok("a side costume faced sw: mirrored", side.look().anim === "s_r" && side.look().flip);

  // ---- front lines
  const S = C.scene;
  t.ok("frontY: along the line, the ends beyond it", S.frontY([10, 50, 30, 60], 20) === 55 && S.frontY([10, 50, 30, 60], 0) === 50 && S.frontY([30, 60, 10, 50], 99) === 60);
  t.ok("frontY: a V (a box's two front edges)", S.frontY([0, 40, 20, 50, 40, 40], 20) === 50 && S.frontY([0, 40, 20, 50, 40, 40], 30) === 45);
  const names = (list) => list.map((d) => d.name).join(" ");
  const cart = { name: "cart", baseline: 50, front: [0, 40, 20, 50, 40, 40], draw() {} };
  const lamp = { name: "lamp", baseline: 30, draw() {} };
  const at = (name, x, y) => ({ name, x, baseline: y, draw() {} });
  t.ok("an actor below the V draws in front of the cart", names(S.orderWithFronts([cart, lamp], [at("a", 30, 47)])) === "lamp cart a");
  t.ok("an actor above the V (behind the cart's right end) draws behind it", names(S.orderWithFronts([cart, lamp], [at("a", 30, 44)])) === "lamp a cart");
  t.ok("plain baselines still sort as before", names(S.orderWithFronts([lamp], [at("a", 0, 29), at("b", 0, 30), at("c", 0, 31)])) === "a lamp b c");
  t.ok("actors at the same place by their y", names(S.orderWithFronts([cart], [at("b", 30, 48), at("a", 30, 46)])) === "cart a b");
}
