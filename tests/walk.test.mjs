// Unit tests for src/walk.js: inside tests, line of sight, nearest point and A* paths.
import { load } from "./load.mjs";

export default function (t) {
  const C = load(["walk.js"]);
  const len = (from, pts) => { let d = 0, p = from; for (const q of pts) { d += Math.hypot(q.x - p.x, q.y - p.y); p = q; } return d; };

  // a floor band with a box-shaped obstacle in the middle
  const room = C.walk.create({ walk: [[10, 120, 310, 120, 310, 175, 10, 175]], holes: [[140, 130, 180, 130, 180, 160, 140, 160]] });
  t.ok("inside floor", room.inside({ x: 50, y: 150 }));
  t.ok("edge counts as inside", room.inside({ x: 10, y: 150 }) && room.inside({ x: 140, y: 145 }));
  t.ok("hole is outside", !room.inside({ x: 160, y: 145 }));
  t.ok("outside floor", !room.inside({ x: 50, y: 100 }));
  t.ok("line of sight blocked by the box", !room.visible({ x: 100, y: 145 }, { x: 220, y: 145 }));
  t.ok("line of sight above the box", room.visible({ x: 100, y: 125 }, { x: 220, y: 125 }));

  const path = room.path({ x: 100, y: 145 }, { x: 220, y: 145 });
  t.ok("path goes around the box", path.length >= 3, JSON.stringify(path));
  t.ok("path ends at the target", path.at(-1).x === 220 && path.at(-1).y === 145);
  let ok = true, p = { x: 100, y: 145 };
  for (const q of path) { if (!room.visible(p, q)) ok = false; p = q; }
  t.ok("every leg is walkable", ok);
  // the shortest way passes one of the box's long sides: corners (140,130)/(180,130) or (140,160)/(180,160)
  t.ok("path is short", len({ x: 100, y: 145 }, path) < 140, len({ x: 100, y: 145 }, path).toFixed(1));

  const n = room.nearest({ x: 50, y: 60 });
  t.ok("click above the floor snaps to its edge", n.x === 50 && n.y === 120, JSON.stringify(n));
  const n2 = room.nearest({ x: 160, y: 140 });
  t.ok("click into the hole snaps to its edge", room.inside(n2) && Math.abs(n2.y - 130) <= 1, JSON.stringify(n2));
  const p3 = room.path({ x: 30, y: 170 }, { x: 160, y: 140 });
  t.ok("walking into the hole stops at its edge", room.inside(p3.at(-1)));

  // concave L-shaped room: going round the inner corner
  const L = C.walk.create({ walk: [[0, 0, 100, 0, 100, 40, 40, 40, 40, 100, 0, 100]] });
  const pl = L.path({ x: 90, y: 20 }, { x: 20, y: 90 });
  t.ok("L-room passes the inner corner", pl.length === 2 && pl[0].x === 40 && pl[0].y === 40, JSON.stringify(pl));

  // two separate areas: the target is unreachable, walk to the closest reachable corner
  const two = C.walk.create({ walk: [[0, 0, 50, 0, 50, 50, 0, 50], [100, 0, 150, 0, 150, 50, 100, 50]] });
  const pu = two.path({ x: 10, y: 10 }, { x: 120, y: 20 });
  t.ok("unreachable target stays in the own area", pu.length > 0 && pu.at(-1).x <= 50, JSON.stringify(pu));

  // start outside the area: the first waypoint gets back in
  const po = room.path({ x: 50, y: 110 }, { x: 60, y: 150 });
  t.ok("start outside walks in first", po[0].y === 120, JSON.stringify(po));

  // union of two overlapping polygons
  const U = C.walk.create({ walk: [[0, 0, 60, 0, 60, 20, 0, 20], [40, 0, 60, 0, 60, 80, 40, 80]] });
  const pp = U.path({ x: 5, y: 10 }, { x: 50, y: 75 });
  let ok2 = true; p = { x: 5, y: 10 };
  for (const q of pp) { if (!U.visible(p, q)) ok2 = false; p = q; }
  t.ok("overlapping polygons work as one area", ok2 && pp.at(-1).y === 75, JSON.stringify(pp));
}
