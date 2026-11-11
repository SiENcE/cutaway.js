// Cutaway.js extras: people who only make a room lively (a crowd, passers-by). They stand, idle and turn now
// and then, or walk round a path. They make way for the one played, for the actors and for each other, and
// never block anybody: the one played walks wherever the walk map lets her, and an extra steps aside, waits
// or turns back. They belong to the scene, not to the game: not actors (nothing in Cutaway.actors), never
// saved, not clickable, unseen by the solver and the graph; each room load starts them afresh, and without
// the one played moving they move the same way every time (a screenshot repeats).
// A room's `extras` list says them (docs/reference.md, "Extras").
"use strict";

/**
 * @typedef {object} ExtraDef
 * @property {Costume} costume
 * @property {[number, number]} at        where it stands, or where its path begins (its feet)
 * @property {Facing} [facing]            the way it faces at first (standing: the way it comes back to)
 * @property {Facing[] | false} [turns]   the ways a standing extra turns to now and then (default: the costume's idle views; false: never)
 * @property {[number, number][]} [path]  it walks from `at` through these points (none: it stands)
 * @property {"around" | "back"} [loop]   after the last point: on to `at` again (default), or the same way back
 * @property {[number, number]} [speed]   px/s along x and y (default [24, 12])
 * @property {number} [pause]             ms it stands at each point of its path (default 0)
 * @property {[number, number]} [space]   the room it keeps round its feet: half width and half height (default [7, 4])
 * @property {number} [notice]            a standing extra turns to look at the one played within this many px (default 24; 0: never)
 * @property {number} [give]              px a standing extra leans away from whoever passes close (default 3)
 * @property {number} [side]              px a walking extra may step aside to let someone by (default 14)
 * @property {boolean} [block]            a standing extra is an obstacle: its space is cut out of the walk map
 * @property {boolean} [apart]            a standing extra stands where nobody walks, on purpose (behind a counter, on a crate, on a stage):
 *                                        validate doesn't take it for a mistake
 * @property {Cond} [if]                  only there while this holds (not asked of the walk map: a blocking one always blocks)
 */

Cutaway.extras = (function () {
  /**
   * @typedef {object} Extra
   * @property {ExtraDef} def
   * @property {InstanceType<typeof Cutaway.actor.Actor>} a   drawn where it is: its feet plus its lean or step aside
   * @property {number} i
   * @property {[number, number]} space
   * @property {{x: number, y: number}[]} pts   the path's points, `at` first
   * @property {number[]} at                    the distance along the path where each point is
   * @property {number} total                   the path's length (around: back to `at`)
   * @property {number} s                       how far along the path it is
   * @property {1 | -1} dir
   * @property {number} off                     how far it has stepped aside (to its right)
   * @property {number} wait                    ms it has waited for the way to clear
   * @property {number} pause                   ms still to stand at a point
   * @property {number} lean                    0..1 of its lean
   * @property {{x: number, y: number}} away    the way it leans
   * @property {number} turnAt                  scene ms of its next turn
   * @property {number} turns                   how many turns it has made
   */

  /** @type {Extra[]} */
  let list = [];
  /** @type {object | null} the room they were made for */
  let builtFor = null;
  let now = 0;                                    // scene ms since they were made

  /** A repeatable number in 0..1 for extra i and purpose k. @param {number} i @param {number} k */
  function hash(i, k) {
    let h = Math.imul(i + 1, 374761393) ^ Math.imul(k + 7, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** @param {ExtraDef} d @param {number} i @returns {Extra} */
  function make(d, i) {
    const a = new Cutaway.actor.Actor(`extra:${i}`, { costume: d.costume, speed: d.speed, at: d.at, facing: d.facing ?? "right" });
    const pts = [{ x: d.at[0], y: d.at[1] }, ...(d.path ?? []).map(([x, y]) => ({ x, y }))];
    if (d.path?.length && (d.loop ?? "around") === "around") pts.push({ x: d.at[0], y: d.at[1] });
    const at = [0];
    for (let k = 1; k < pts.length; k++) at.push(at[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const e = { def: d, a, i, space: d.space ?? [7, 4], pts, at, total: at[at.length - 1], s: 0, dir: /** @type {1 | -1} */ (1),
      off: 0, wait: 0, pause: 0, lean: 0, away: { x: 0, y: 0 }, turnAt: 2000 + hash(i, 1) * 6000, turns: 0 };
    if (e.total > 0) a.setState("walk");
    a.t = Math.floor(hash(i, 0) * 4000);          // each in its own time: a crowd doesn't breathe or step in step
    return e;
  }

  /** The extras of the room shown, made afresh when the room changed. */
  function current() {
    const room = Cutaway.scene.room ?? null;
    if (room !== builtFor) {
      builtFor = room; now = 0;
      list = (room?.extras ?? []).map(make);
    }
    return list;
  }

  /** Where it is on its path: the point and the way on (unit). @param {Extra} e @param {number} s */
  function onPath(e, s) {
    let k = 1;
    while (k < e.at.length - 1 && e.at[k] < s) k++;
    const p = e.pts[k - 1], q = e.pts[k], len = e.at[k] - e.at[k - 1] || 1, f = Math.max(0, Math.min(1, (s - e.at[k - 1]) / len));
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, tx: (q.x - p.x) / len, ty: (q.y - p.y) / len };
  }

  /**
   * How close two feet are, against the room both keep, squared: under 1 they stand in each other. (Plain arithmetic: the
   * hot loops of a crowd stay off Math, which costs in the Node tools' vm.)
   * @param {{x: number, y: number}} p @param {{x: number, y: number}} q @param {[number, number]} sp @param {[number, number]} sq
   */
  function near(p, q, sp, sq) { const a = (p.x - q.x) / (sp[0] + sq[0]), b = (p.y - q.y) / (sp[1] + sq[1]); return a * a + b * b; }

  /** Is a point one may stand on? (No walk map: anywhere.) @param {number} x @param {number} y */
  function free(x, y) {
    const m = Cutaway.scene.walkMap;
    return !m || m.inside({ x, y });
  }

  /** @typedef {{x: number, y: number, space: [number, number], tx: number, ty: number, played: boolean, e: Extra | null}} Other */
  /**
   * Everyone an extra must not walk into, where they are now: the room's actors (the one played among them)
   * and the extras shown. Made once a step and shared, so a crowd costs little.
   * @param {Extra[]} es @returns {Other[]}
   */
  function everyone(es) {
    /** @type {Other[]} */
    const out = [];
    const played = Cutaway.scene.active;
    for (const a of Cutaway.scene.actorsHere()) {
      const p = a.state === "walk" ? a.path[0] : null, d = p ? Math.hypot(p.x - a.x, p.y - a.y) || 1 : 1;
      out.push({ x: a.x, y: a.y, space: [7, 4], tx: p ? (p.x - a.x) / d : 0, ty: p ? (p.y - a.y) / d : 0, played: a === played, e: null });
    }
    for (const e of es) {
      const w = e.total > 0 && e.a.state === "walk" ? onPath(e, e.s) : null;
      out.push({ x: e.a.x, y: e.a.y, space: e.space, tx: w ? w.tx * e.dir : 0, ty: w ? w.ty * e.dir : 0, played: false, e });
    }
    return out;
  }

  /** @param {Extra} e */
  function shown(e) { return !e.def.if || Cutaway.state.test(e.def.if); }

  /**
   * A walking extra's step: on along its path; someone ahead in its way, it steps aside (to its right for
   * someone coming towards it, else away from them) where it can stand, or waits; waiting too long, it turns
   * back. It never moves anybody else.
   * @param {Extra} e @param {number} dt ms @param {Other[]} all
   */
  function walk(e, dt, all) {
    const a = e.a, sec = dt / 1000;
    if (e.pause > 0) { e.pause -= dt; a.setState("idle"); return; }
    const w = onPath(e, e.s), tx = w.tx * e.dir, ty = w.ty * e.dir, nx = -ty, ny = tx;   // the way on, and its right
    const v = tx || ty ? a.scale() / Math.hypot(tx / a.speed[0], ty / a.speed[1]) : a.scale() * a.speed[0];
    const look = (e.space[0] + e.space[1]) * 1.5, step = v * sec;
    const at = (/** @type {number} */ s, /** @type {number} */ off) => { const p = onPath(e, s); return { x: p.x + nx * off, y: p.y + ny * off }; };
    const reach = look * 2.5 + 2 * (e.space[0] + e.space[1]);
    const crowd = all.filter((o) => o.e !== e && o.x - a.x < reach && a.x - o.x < reach && o.y - a.y < reach && a.y - o.y < reach);
    /** Is anybody ahead of it in the way of feet at p? @param {{x: number, y: number}} p */
    const inWay = (p) => crowd.some((o) => (o.x - a.x) * tx + (o.y - a.y) * ty > -0.5 && near(p, o, e.space, o.space) < 1);
    /** Can it stand aside here (walkable, nobody there)? @param {number} off */
    const canStand = (off) => { const p = at(e.s, off); return free(p.x, p.y) && !crowd.some((o) => near(p, o, e.space, o.space) < 1); };
    // who is coming: someone in the way a little ahead; one coming towards it is seen further off (one pass)
    const comes = (/** @type {Other} */ o) => o.tx * tx + o.ty * ty < -0.3;
    const p0 = at(e.s + e.dir * step, e.off), p1 = at(e.s + e.dir * look, e.off), p2 = at(e.s + e.dir * look * 2.5, e.off);
    /** @type {Other[]} */
    const blockers = [];
    for (const o of crowd) {
      if ((o.x - a.x) * tx + (o.y - a.y) * ty <= -0.5) continue;
      if (near(p0, o, e.space, o.space) < 1 || near(p1, o, e.space, o.space) < 1 || (comes(o) && near(p2, o, e.space, o.space) < 1)) blockers.push(o);
    }
    const side = e.def.side ?? 14;
    let target = 0;
    if (blockers.length) {
      // just far enough aside to pass them: on the side away from them (to its right for one coming towards it),
      // else the other side, never further than `side`; no room either way: it stays and waits
      const o = blockers[0], lat = (o.x - a.x) * nx + (o.y - a.y) * ny + e.off, towards = comes(o);
      const clear = 1 / Math.hypot(nx / (e.space[0] + o.space[0]), ny / (e.space[1] + o.space[1])) + 1;
      const right = lat + clear, left = lat - clear;
      // once on its way to one side it keeps to it (else it would sway between the two)
      const order = Math.abs(e.off) > 0.01 ? (Math.abs(right - e.off) <= Math.abs(left - e.off) ? [right, left] : [left, right])
        : towards ? [right, left] : lat > 0 ? [left, right] : [right, left];
      const ways = order.filter((w) => Math.abs(w) <= side);
      target = ways.find((w) => canStand(w)) ?? e.off;
    } else if (!canStand(0)) target = e.off;      // back onto its path only once there is room there
    // aside first (a little quicker than it walks), then on
    const lateral = Math.max(-1.5 * step, Math.min(1.5 * step, target - e.off));
    e.off += lateral;
    const next = at(e.s + e.dir * step, e.off);
    if (!inWay(next)) {
      const before = e.s;
      e.s += e.dir * step;
      e.wait = 0;
      // a point of the path passed: stand a moment (pause); at an end of a "back" path, the way back
      const loopBack = (e.def.loop ?? "around") === "back";
      if (e.s >= e.total) { if (loopBack) { e.s = 2 * e.total - e.s; e.dir = -1; } else e.s -= e.total; }
      else if (e.s <= 0) { if (loopBack) { e.s = -e.s; e.dir = 1; } else e.s += e.total; }
      if (e.def.pause && e.at.some((d) => (before - d) * (e.s - d) < 0 || e.s === d)) e.pause = e.def.pause;
      a.setState("walk");
      const mx = tx * step + nx * lateral, my = ty * step + ny * lateral, ml = Math.hypot(mx, my) || 1;
      a.facing = a.heading(mx / ml * 8, my / ml * 8);    // a step is under a pixel: heading wants the way, not the distance
    } else {
      a.setState("idle");
      if (lateral) a.facing = a.heading(nx * Math.sign(lateral) * 8, ny * Math.sign(lateral) * 8);
      e.wait += dt;
      if (e.wait > 2500) { e.dir = e.dir === 1 ? -1 : 1; e.wait = 0; }   // it won't clear: back the way it came
    }
    const p = at(e.s, e.off);
    a.x = p.x; a.y = p.y;
  }

  /**
   * A standing extra: it idles, turns now and then (back to where it faced between two other ways), looks at
   * the one played when she comes close, and leans away from whoever passes closer.
   * @param {Extra} e @param {number} dt ms @param {Other[]} movers  those who walk (and the one played): nobody leans for one who stands
   */
  function stand(e, dt, movers) {
    const a = e.a, d = e.def, home = d.facing ?? "right";
    a.setState("idle");
    const played = Cutaway.scene.active, here = played && played.room === Cutaway.scene.room?.id ? played : null;
    const dx = here ? here.x - d.at[0] : 0, dy = here ? here.y - d.at[1] : 0;
    if (here && Math.hypot(dx, dy) < (d.notice ?? 24) && Math.hypot(dx, dy) > 0.5) a.facing = a.heading(dx, dy);
    else if (now >= e.turnAt && d.turns !== false) {
      const ways = d.turns ?? views(a);
      e.turns++;
      a.facing = e.turns % 2 === 0 || !ways.length ? home : ways[Math.floor(hash(e.i, 10 + e.turns) * ways.length)];
      e.turnAt = now + 2500 + hash(e.i, 30 + e.turns) * 6000;
    }
    // the lean: away from the closest of those passing (the room's actors, the walking extras)
    const feet = { x: d.at[0], y: d.at[1] };
    let best = 2.56, bx = 0, by = 0;                         // 1.6 squared
    for (const o of movers) {
      if (o.e === e || o.x - feet.x > 30 || feet.x - o.x > 30 || o.y - feet.y > 20 || feet.y - o.y > 20) continue;
      const n = near(feet, o, e.space, o.space);
      if (n < best) { best = n; const l = Math.hypot(feet.x - o.x, feet.y - o.y) || 1; bx = (feet.x - o.x) / l; by = (feet.y - o.y) / l; }
    }
    const want = best < 2.56 ? 1 : 0, rate = dt / 250;
    if (want) e.away = { x: bx, y: by };
    e.lean += Math.max(-rate, Math.min(rate, want - e.lean));
    const g = (d.give ?? 3) * e.lean;
    a.x = feet.x + e.away.x * g; a.y = feet.y + e.away.y * g;
  }

  /** The ways a costume's idle can face (side views: left and right). @param {InstanceType<typeof Cutaway.actor.Actor>} a @returns {Facing[]} */
  function views(a) {
    const idle = a.costume.idle;
    if (typeof idle === "string") return ["left", "right"];
    /** @type {Facing[]} */
    const ways = [];
    for (const k of /** @type {Facing[]} */ (["down", "up", "left", "right", "se", "ne", "sw", "nw"])) if (idle[k]) ways.push(k);
    if (idle.right && !idle.left) ways.push("left");
    if (idle.left && !idle.right) ways.push("right");
    for (const [k, m] of /** @type {[Facing, Facing][]} */ ([["se", "sw"], ["ne", "nw"], ["sw", "se"], ["nw", "ne"]])) if (idle[k] && !idle[m]) ways.push(m);
    return ways;
  }

  /** @param {number} dt ms */
  function update(dt) {
    const room = Cutaway.scene.room;
    if (!room) return;
    const es = current();
    if (!es.length) return;
    now += dt;
    const here = es.filter(shown), all = everyone(here), movers = all.filter((o) => o.tx || o.ty || o.played);
    for (const e of here) {
      e.a.t += dt;
      if (e.total > 0) walk(e, dt, all); else stand(e, dt, movers);
    }
  }
  Cutaway.clock.onUpdate(update);

  return {
    /** The extras shown now, as actors to draw (the scene sorts them with its people). */
    here() { return current().filter(shown).map((e) => e.a); },
    /**
     * A room's blocking extras as holes for its walk map: each one's space as an octagon round its feet.
     * @param {{extras?: ExtraDef[]}} def @returns {number[][]}
     */
    holes(def) {
      return (def.extras ?? []).filter((d) => d.block && !d.path?.length).map((d) => {
        const [rx, ry] = d.space ?? [7, 4], [x, y] = d.at, cx = rx * 0.4, cy = ry * 0.4;
        return [x - cx, y - ry, x + cx, y - ry, x + rx, y - cy, x + rx, y + cy, x + cx, y + ry, x - cx, y + ry, x - rx, y + cy, x - rx, y - cy];
      });
    },
    /** Make them afresh (they start where their data puts them). */
    reset() { builtFor = null; },
  };
})();
