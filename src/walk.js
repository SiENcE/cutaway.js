// Cutaway.js walking: walkable areas as polygons with holes, and shortest paths through them.
// Pathfinding uses a visibility graph over the polygon corners plus A*: paths are exact and short,
// with no grid. Points on an edge count as inside, so paths may run along walls and around the
// corners of obstacles. A click outside the area walks to the nearest point inside; an unreachable
// target walks to the reachable corner closest to it.
// Pure geometry, no DOM: the Node tests load this file directly.
"use strict";

Cutaway.walk = (function () {
  /** @typedef {{x: number, y: number}} Pt */
  /**
   * @typedef {object} WalkDef
   * @property {number[][]} walk     walkable polygons, each a flat list [x0, y0, x1, y1, ...]
   * @property {number[][]} [holes]  obstacles cut out of the walkable polygons
   */

  const EPS = 0.5;          // half a pixel: closer than this to an edge counts as on the edge
  const STEP = 0.5;         // sampling step for line of sight, in pixels

  /** @param {Pt} p @param {Pt[]} poly even-odd rule */
  function inPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }

  /** Closest point to p on segment ab. @param {Pt} p @param {Pt} a @param {Pt} b @returns {Pt} */
  function project(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    return { x: a.x + dx * t, y: a.y + dy * t };
  }

  /** @param {Pt} a @param {Pt} b */
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /** Distance from p to the outline of poly. @param {Pt} p @param {Pt[]} poly */
  function edgeDist(p, poly) {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) best = Math.min(best, dist(p, project(p, poly[j], poly[i])));
    return best;
  }

  /** @param {number[]} flat @returns {Pt[]} */
  function toPts(flat) {
    if (flat.length < 6 || flat.length % 2) throw new Error("Cutaway.walk: a polygon needs at least 3 points as x,y pairs");
    /** @type {Pt[]} */
    const out = [];
    for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
    return out;
  }

  class WalkMap {
    /** @param {WalkDef} def */
    constructor(def) {
      /** @type {Pt[][]} */
      this.areas = (def.walk ?? []).map(toPts);
      /** @type {Pt[][]} */
      this.holes = (def.holes ?? []).map(toPts);
      /** @type {Pt[]} graph nodes: every corner that lies in the walkable area */
      this.nodes = [];
      for (const poly of [...this.areas, ...this.holes]) for (const p of poly) {
        if (this.inside(p) && !this.nodes.some((n) => n.x === p.x && n.y === p.y)) this.nodes.push(p);
      }
      /** @type {{to: number, d: number}[][]} */
      this.links = this.nodes.map(() => []);
      for (let i = 0; i < this.nodes.length; i++) for (let j = i + 1; j < this.nodes.length; j++) {
        if (this.visible(this.nodes[i], this.nodes[j])) {
          const d = dist(this.nodes[i], this.nodes[j]);
          this.links[i].push({ to: j, d }); this.links[j].push({ to: i, d });
        }
      }
    }

    /** Is p walkable? Points on (or within half a pixel of) an edge count as inside. @param {Pt} p */
    inside(p) {
      const inArea = this.areas.some((/** @type {Pt[]} */ a) => inPoly(p, a) || edgeDist(p, a) <= EPS);
      return inArea && !this.holes.some((/** @type {Pt[]} */ h) => inPoly(p, h) && edgeDist(p, h) > EPS);
    }

    /** Can one walk from a to b in a straight line? @param {Pt} a @param {Pt} b */
    visible(a, b) {
      const n = Math.max(1, Math.ceil(dist(a, b) / STEP));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (!this.inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
      }
      return true;
    }

    /**
     * The walkable point closest to p, on whole pixels where possible.
     * @param {Pt} p
     * @returns {Pt}
     */
    nearest(p) {
      if (this.inside(p)) return { x: p.x, y: p.y };
      let best = null, bestD = Infinity;
      for (const poly of [...this.areas, ...this.holes]) {
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const q = project(p, poly[j], poly[i]), d = dist(p, q);
          if (d < bestD && this.inside(q)) { best = q; bestD = d; }
        }
      }
      if (!best) return this.nodes.length ? this.nodes[0] : { x: p.x, y: p.y };
      // prefer a whole pixel next to the exact point if it is walkable too
      const rx = Math.round(best.x), ry = Math.round(best.y);
      const cands = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cands.push({ x: rx + dx, y: ry + dy });
      cands.sort((a, b) => dist(a, p) - dist(b, p));
      return cands.find((c) => this.inside(c)) ?? best;
    }

    /**
     * Shortest path from `from` to `to` as waypoints (the start not included). Targets outside the
     * area move to the nearest walkable point; unreachable targets end at the closest reachable corner.
     * @param {Pt} from
     * @param {Pt} to
     * @returns {Pt[]}
     */
    path(from, to) {
      const s = this.nearest(from), t = this.nearest(to);
      const lead = (s.x !== from.x || s.y !== from.y) ? [s] : [];
      if (this.visible(s, t)) return [...lead, t];

      const N = this.nodes.length, S = N, T = N + 1;
      const pts = [...this.nodes, s, t];
      /** @param {number} i @returns {{to: number, d: number}[]} */
      const neighbours = (i) => {
        if (i === S) return this.nodes.map((n, k) => ({ to: k, d: dist(s, n) })).filter((l) => this.visible(s, this.nodes[l.to]));
        const out = this.links[i].slice();
        if (this.visible(this.nodes[i], t)) out.push({ to: T, d: dist(this.nodes[i], t) });
        return out;
      };
      const g = new Array(N + 2).fill(Infinity), prev = new Array(N + 2).fill(-1), done = new Array(N + 2).fill(false);
      g[S] = 0;
      /** @type {number[]} */
      const open = [S];
      while (open.length) {
        let bi = 0;
        for (let k = 1; k < open.length; k++) if (g[open[k]] + dist(pts[open[k]], t) < g[open[bi]] + dist(pts[open[bi]], t)) bi = k;
        const cur = open.splice(bi, 1)[0];
        if (cur === T) break;
        if (done[cur]) continue;
        done[cur] = true;
        for (const l of neighbours(cur)) {
          const ng = g[cur] + l.d;
          if (ng < g[l.to]) { g[l.to] = ng; prev[l.to] = cur; open.push(l.to); }
        }
      }
      let end = T;
      if (g[T] === Infinity) {
        // unreachable: go to the reached corner closest to the target (or stay)
        end = S;
        for (let k = 0; k < N; k++) if (g[k] < Infinity && dist(pts[k], t) < dist(pts[end], t)) end = k;
        if (end === S) return lead;
      }
      /** @type {Pt[]} */
      const out = [];
      for (let k = end; k !== S && k !== -1; k = prev[k]) out.unshift({ x: pts[k].x, y: pts[k].y });
      return [...lead, ...out];
    }
  }

  return {
    WalkMap,
    /** @param {WalkDef} def */
    create(def) { return new WalkMap(def); },
    inPoly, project,
  };
})();
