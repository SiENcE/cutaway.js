// A routine's path walked once (src/time.js, `once: true`): the actor starts at its first point, walks to its last
// and stays there, facing `face` (the demo with a camera room, as in time.test.mjs).
import { loadGame, boot } from "../tools/lib/game.mjs";

function withCamera(/** @type {any} */ C, once) {
  C.time.configure({ start: "18:00", end: "04:00" });
  C.room("cam", { name: "Camera", background: "hall_bg", observe: true, walk: [[0, 100, 320, 100, 320, 180, 0, 180]], hotspots: {} });
  C.actor("visitor", { name: "Visitor", costume: { idle: "bolt_idle_r", walk: "bolt_walk_r", talk: "bolt_talk_r" } });
  C.routine("visitor", [{ day: 1, from: "18:00", to: "20:00", room: "cam", at: [200, 150], face: "left", once, path: [[100, 150], [140, 150], [180, 150]] }]);
  const act = C.act.get("act1");
  act.start = [...(act.start ?? []), { time: "18:00", day: 1 }];
}
/** Let the clock run: the routine's update starts each leg once the last one is walked. */
async function run(/** @type {any} */ C, ms) { for (let t = 0; t < ms; t += 50) { C.clock.advance(50); await new Promise((r) => setTimeout(r, 0)) } }

export default async function (t) {
  const g = loadGame("demo/index.html");
  withCamera(g.C, true);
  await boot(g, { instant: true });
  const C = g.C, v = C.actors.get("visitor");
  t.ok("once: placed at the path's first point, not at `at`", v.room === "cam" && v.x === 100 && v.y === 150, `${v.x},${v.y}`);
  await C.scene.go("cam", undefined, undefined, { transition: false });
  await run(C, 20000);
  t.ok("once: walked to the last point and stays there", v.x === 180 && v.y === 150 && v.state !== "walk", `${v.x},${v.y} ${v.state}`);
  t.ok("once: faces `face` at the end", v.facing === "left", v.facing);

  await run(C, 5000)
  t.ok("once: still there after more time (no second round)", v.x === 180 && v.y === 150, `${v.x},${v.y}`)
}
