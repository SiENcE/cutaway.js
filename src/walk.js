// Cutaway.js walking: walkable areas as polygons with holes, and shortest paths through them.
// Pathfinding uses a visibility graph over the polygon corners plus A*: paths are exact and short,
// with no grid. A line of sight is checked where it meets an edge and once between two such places
// (only there can it go out or come back in), so a big room's map with hundreds of corners builds quickly. Points on an edge count as inside, so paths may run along walls and around the
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

  const ROW = 8;            // the rows a polygon's edges are sorted into, in pixels
  /** @typedef {{box: number[], y0: number, rows: Float64Array[]}} Indexed  each row: its edges as x0, y0, x1, y1 in turn */
  /**
   * A polygon's edges sorted into rows of ROW px by their height (grown by EPS), so a point asks only the edges near it: a big
   * room's outline has hundreds of corners.
   * @param {Pt[]} poly @returns {Indexed}
   */
  function indexed(poly) {
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    const box = [Math.min(...xs) - EPS, Math.min(...ys) - EPS, Math.max(...xs) + EPS, Math.max(...ys) + EPS], y0 = box[1];
    /** @type {number[][]} */
    const rows = Array.from({ length: Math.max(1, Math.ceil((box[3] - y0) / ROW) + 1) }, () => []);
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j], lo = Math.floor((Math.min(a.y, b.y) - EPS - y0) / ROW), hi = Math.floor((Math.max(a.y, b.y) + EPS - y0) / ROW);
      for (let r = Math.max(0, lo); r <= Math.min(rows.length - 1, hi); r++) rows[r].push(a.x, a.y, b.x, b.y);
    }
    return { box, y0, rows: rows.map((r) => Float64Array.from(r)) };
  }
  /** The row of an indexed polygon's edges at p, or null when p is outside its box. @param {Indexed} ix @param {Pt} p */
  function rowAt(ix, p) {
    const b = ix.box;
    if (p.x < b[0] || p.y < b[1] || p.x > b[2] || p.y > b[3]) return null;
    return ix.rows[Math.floor((p.y - ix.y0) / ROW)] ?? null;
  }
  /** Is p inside an indexed polygon (even-odd)? @param {Indexed} ix @param {Pt} p */
  function inIx(ix, p) {
    const row = rowAt(ix, p);
    if (!row) return false;
    const px = p.x, py = p.y;
    let c = false;
    for (let i = 0; i < row.length; i += 4) {
      const ax = row[i], ay = row[i + 1], ex = row[i + 2], ey = row[i + 3];
      if ((ay > py) !== (ey > py) && px < (ex - ax) * (py - ay) / (ey - ay) + ax) c = !c;
    }
    return c;
  }
  /** Is p within EPS of an indexed polygon's outline? @param {Indexed} ix @param {Pt} p */
  function nearIx(ix, p) {
    const row = rowAt(ix, p);
    if (!row) return false;
    const px = p.x, py = p.y;
    for (let i = 0; i < row.length; i += 4) {
      const ax = row[i], ay = row[i + 1], dx = row[i + 2] - ax, dy = row[i + 3] - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const qx = px - ax - dx * t, qy = py - ay - dy * t;
      if (qx * qx + qy * qy <= EPS * EPS) return true;
    }
    return false;
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
      /** @type {Indexed[]} */
      this.areaIx = this.areas.map(indexed);
      /** @type {Indexed[]} */
      this.holeIx = this.holes.map(indexed);
      /** @type {[Pt, Pt, number, number, number, number][]} every edge with its box (x0, y0, x1, y1), for the line of sight */
      this.edges = [];
      for (const poly of [...this.areas, ...this.holes]) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const p = poly[j], q = poly[i];
        this.edges.push([p, q, Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)]);
      }
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
      return this.areaIx.some((ix) => inIx(ix, p) || nearIx(ix, p)) && !this.holeIx.some((ix) => inIx(ix, p) && !nearIx(ix, p));
    }

    /** Is p inside the area itself, not only within half a pixel of its edge? @param {Pt} p */
    within(p) {
      return this.areaIx.some((ix) => inIx(ix, p)) && !this.holeIx.some((ix) => inIx(ix, p));
    }

    /** Is p off every edge (a line running along an edge between two places where it meets others stays on it)? @param {Pt} p */
    offEdge(p) {
      for (const [e, f, x0, y0, x1, y1] of this.edges) {
        if (p.x < x0 - 1e-6 || p.x > x1 + 1e-6 || p.y < y0 - 1e-6 || p.y > y1 + 1e-6) continue;
        const q = project(p, e, f);
        if (dist(p, q) < 1e-6) return false;
      }
      return true;
    }

    /** Can one walk from a to b in a straight line? @param {Pt} a @param {Pt} b */
    visible(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) return this.inside(a);
      // most lines between far corners leave the area: a few points first say so cheaply
      for (const t of [0.5, 0.25, 0.75]) if (!this.inside({ x: a.x + dx * t, y: a.y + dy * t })) return false;
      // where the line meets an edge (crossing it, touching it, a corner on it): between two of these it is all in or all out
      const ts = [0, 1];
      const x0 = Math.min(a.x, b.x) - EPS, y0 = Math.min(a.y, b.y) - EPS, x1 = Math.max(a.x, b.x) + EPS, y1 = Math.max(a.y, b.y) + EPS;
      for (const [p, q, ex0, ey0, ex1, ey1] of this.edges) {
        if (ex1 < x0 || ex0 > x1 || ey1 < y0 || ey0 > y1) continue;
        const ex = q.x - p.x, ey = q.y - p.y, den = dx * ey - dy * ex;
        if (Math.abs(den) > 1e-9) {
          const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den, u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
          if (t > 0 && t < 1 && u > -1e-9 && u < 1 + 1e-9) ts.push(t);
        } else {
          // parallel: the edge's ends where they lie on the line
          for (const e of [p, q]) {
            const t = ((e.x - a.x) * dx + (e.y - a.y) * dy) / len2;
            if (t > 0 && t < 1 && Math.abs((e.x - a.x) * dy - (e.y - a.y) * dx) / Math.sqrt(len2) < 1e-6) ts.push(t);
          }
        }
      }
      ts.sort((m, n) => m - n);
      const at = (/** @type {number} */ t) => ({ x: a.x + dx * t, y: a.y + dy * t });
      for (let i = 0; i < ts.length; i++) {
        if (!this.inside(at(ts[i]))) return false;
        if (i + 1 >= ts.length || ts[i + 1] - ts[i] <= 1e-9) continue;
        const m = at((ts[i] + ts[i + 1]) / 2);
        if (!this.inside(m)) return false;
        // in only by the half pixel beside an edge (not on it): it runs outside close by, and may drift further out; look along it
        if (!this.within(m) && this.offEdge(m)) {
          const n = Math.max(1, Math.ceil(Math.sqrt(len2) * (ts[i + 1] - ts[i]) / 0.5));
          for (let k = 1; k < n; k++) if (!this.inside(at(ts[i] + (ts[i + 1] - ts[i]) * k / n))) return false;
        }
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
