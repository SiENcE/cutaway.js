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

  // a big room (a market at 4x4 screens): a wavy band with 60 stalls in it, about 300 corners. The line of sight checks only where
  // a line meets an edge, so the map builds quickly; it says what a check every half pixel says, but for lines that graze a corner
  // or run along an edge by less than a pixel
  const top = [], bottom = [];
  for (let x = 0; x <= 1280; x += 16) { top.push(x, Math.round(120 + 40 * Math.sin(x / 150))); bottom.unshift(x, Math.round(600 + 40 * Math.sin(x / 130 + 1))); }
  const stalls = [];
  for (let i = 0; i < 60; i++) { const x = 30 + (i % 12) * 104 + (i * 37) % 20, y = 210 + Math.floor(i / 12) * 72 + (i * 13) % 17; stalls.push([x, y, x + 34, y, x + 34, y + 22, x, y + 22]); }
  const t0 = Date.now(), big = C.walk.create({ walk: [[...top, ...bottom]], holes: stalls }), ms = Date.now() - t0;
  t.ok("a big room's walk map builds quickly", ms < 2000 && big.nodes.length > 250, `${ms} ms, ${big.nodes.length} corners`);
  const sampled = (a, b) => { const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25)); for (let i = 0; i <= n; i++) if (!big.inside({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n })) return false; return true; };
  const edgeNear = (q) => [...big.areas, ...big.holes].some((poly) => poly.some((v, i) => { const w = poly[(i + 1) % poly.length], P = C.walk.project(q, v, w); return Math.hypot(P.x - q.x, P.y - q.y) < 1; }));
  let differ = 0, far = 0;
  for (let i = 0; i < big.nodes.length; i += 3) for (let j = i + 1; j < big.nodes.length; j += 7) {
    const a = big.nodes[i], b = big.nodes[j];
    if (sampled(a, b) === big.visible(a, b)) continue;
    differ++;
    // where the sampled check finds it outside, it is never more than a pixel from an edge
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25);
    for (let k = 0; k <= n; k++) { const q = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }; if (!big.inside(q) && !edgeNear(q)) far++; }
  }
  t.ok("a big room's line of sight: as a check every quarter pixel, but by under a pixel at an edge", far === 0, `${differ} differ, ${far} points far from an edge`);
  const route = big.path({ x: 10, y: 180 }, { x: 1270, y: 560 });
  let clear = true, from = { x: 10, y: 180 };
  for (const q of route) { if (!big.visible(from, q)) clear = false; from = q; }
  t.ok("a big room: a path across it, every leg in sight", clear && route.at(-1).x === 1270, JSON.stringify(route));
}
