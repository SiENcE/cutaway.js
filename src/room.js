// Cutaway.js rooms: room definitions (data) and the scene that shows the current room.
// Drawing order: background, then props and actors sorted by baseline (the y where they touch the
// floor; lower on screen = in front), then foreground overlays, the light pass (Cutaway.light) and the
// room's effects (Cutaway.fx). Actors are tinted by the room's light where they stand, and scale with
// their depth when the room has a `scale`. Rooms wider or taller than the screen scroll with a camera
// that follows the active actor.
"use strict";

/**
 * @typedef {object} PropDef
 * @property {string} [id]
 * @property {string} image          animation or image name
 * @property {Record<string, string>} [states]  object state -> image (state set with { state: id, value })
 * @property {[number, number]} at   anchor position (the sprite's anchor, bottom-centre by default)
 * @property {[number, number]} [anchor]  anchor inside the sprite; [0, 0] = `at` is the top-left corner
 *                                   (cut-outs from a room render), then give a baseline
 * @property {number} [baseline]     sorting y (default: at[1]); actors with a larger y draw in front
 * @property {boolean} [flip]
 * @property {boolean} [hidden]      starts hidden (a script can { show: id })
 * @property {number} [scroll]       px per second along x (negative: to the left); the image repeats
 *                                   across the room's width, so scenery passes by in a moving shot
 */
/**
 * @typedef {object} OverlayDef
 * @property {string} image
 * @property {[number, number]} [at] top-left corner (default 0, 0)
 */
/**
 * @typedef {object} ExitDef
 * @property {string} to             room id
 * @property {[number, number]} [at] where the actor arrives
 * @property {Facing} [face]
 */
/**
 * @typedef {object} HotspotDef
 * @property {string} [name]         hover label (text or "@key")
 * @property {number[]} [poly]       outline, flat [x0, y0, x1, y1, ...]
 * @property {[number, number, number, number]} [rect]  x, y, w, h
 * @property {string} [prop]         use this prop's sprite box (default: the prop with the same id)
 * @property {[number, number]} [walkTo]  where the actor stands to use it (default: nearest walkable point)
 * @property {Facing} [face]         which way the actor faces there
 * @property {Script} [look]         right click
 * @property {Script} [talk]         left click runs the first of talk, use, take, exit that exists
 * @property {Script} [use]
 * @property {Script} [take]
 * @property {ExitDef} [exit]
 * @property {Record<string, Script>} [with]  inventory item dropped on it
 * @property {Cond} [if]             the hotspot only exists while this holds
 * @property {boolean} [hidden]      starts hidden
 * @property {number} [z]            higher wins where hotspots overlap (default: later in the list wins)
 */
/**
 * @typedef {object} RoomDef
 * @property {string} [name]
 * @property {[number, number]} [size]  room size in pixels (default: the screen size)
 * @property {string} [background]      image drawn at 0, 0
 * @property {string} [color]           fill colour under the background
 * @property {PropDef[]} [props]
 * @property {OverlayDef[]} [foreground]  drawn over everything (pillars, leaves in front)
 * @property {number[][]} [walk]        walkable polygons, flat [x0, y0, x1, y1, ...]
 * @property {number[][]} [holes]       obstacles cut out of the walkable polygons
 * @property {Record<string, HotspotDef>} [hotspots]
 * @property {Script} [enter]           runs every time the room is entered
 * @property {any} [music]              music state for the room (see the music director)
 * @property {LightDef} [light]         runtime light: ambient for actors, flickering and added lamps
 * @property {FxDef[]} [fx]             effects: haze, dust, rain, drips, sparkles, steam
 * @property {(string | {sfx: string, gain?: number})[]} [ambience]  sound loops while the room shows
 * @property {{far: [number, number], near: [number, number]}} [scale]  actor scale by depth: [y, scale]
 *                                      at the back and at the front (pixel art: keep it between ~0.7 and 1)
 */
/** @typedef {RoomDef & {id: string}} Room */
/**
 * A room's shapes, kept apart from its logic (the room editor writes these files):
 *   Cutaway.room.geometry("attic", { walk, holes, hotspots: { id: { poly | rect, walkTo, face } },
 *     props: { id: { at, baseline } }, lamps: { id: { at, r } }, fx: { idOrIndex: { poly | rect | at | points | to } } })
 * Whatever it names replaces the same fields of the room's own data.
 * @typedef {object} RoomGeometry
 * @property {number[][]} [walk]
 * @property {number[][]} [holes]
 * @property {Record<string, {poly?: number[], rect?: [number, number, number, number], walkTo?: [number, number], face?: Facing}>} [hotspots]
 * @property {Record<string, {at?: [number, number], baseline?: number}>} [props]
 * @property {Record<string, {at?: [number, number], r?: number}>} [lamps]
 * @property {Record<string, {poly?: number[], rect?: [number, number, number, number], at?: [number, number], points?: [number, number][], to?: number}>} [fx]
 */

/**
 * Define a room: `Cutaway.room("attic", { background: "attic_bg", walk: [[...]], props: [...] })`.
 * Look one up with `Cutaway.room.get(id)`.
 */
Cutaway.room = (function () {
  /** @type {Map<string, Room>} */
  const defs = new Map();
  /** @type {Map<string, RoomGeometry>} */
  const geos = new Map();
  /** @type {string[]} geometry that names things the room doesn't have (the validator reports these) */
  const issues = [];

  /** @template T @param {T} v @returns {T} */
  function copy(v) { return JSON.parse(JSON.stringify(v)); }

  /** @param {Room} d @param {RoomGeometry} g */
  function applyGeometry(d, g) {
    if (g.walk) d.walk = copy(g.walk);
    if (g.holes) d.holes = copy(g.holes);
    for (const [k, v] of Object.entries(g.hotspots ?? {})) {
      const h = d.hotspots?.[k];
      if (!h) { issues.push(`room ${d.id}: geometry for unknown hotspot "${k}"`); continue; }
      if (v.poly) { h.poly = copy(v.poly); delete h.rect; }
      else if (v.rect) { h.rect = copy(v.rect); delete h.poly; }
      if (v.walkTo) h.walkTo = copy(v.walkTo);
      if (v.face) h.face = v.face;
    }
    for (const [k, v] of Object.entries(g.props ?? {})) {
      const p = (d.props ?? []).find((q) => q.id === k);
      if (!p) { issues.push(`room ${d.id}: geometry for unknown prop "${k}"`); continue; }
      if (v.at) p.at = copy(v.at);
      if (v.baseline !== undefined) p.baseline = v.baseline;
    }
    for (const [k, v] of Object.entries(g.lamps ?? {})) {
      const l = (d.light?.lamps ?? []).find((q) => q.id === k);
      if (!l) { issues.push(`room ${d.id}: geometry for unknown lamp "${k}"`); continue; }
      if (v.at) l.at = copy(v.at);
      if (v.r !== undefined) l.r = v.r;
    }
    for (const [k, v] of Object.entries(g.fx ?? {})) {
      const list = d.fx ?? [], f = list.find((q) => q.id === k) ?? (/^\d+$/.test(k) ? list[Number(k)] : undefined);
      if (!f) { issues.push(`room ${d.id}: geometry for unknown effect "${k}"`); continue; }
      Object.assign(f, copy(v));
    }
  }

  /**
   * @param {string} id
   * @param {RoomDef} def
   */
  function room(id, def) {
    const d = { ...def, id };
    defs.set(id, d);
    const g = geos.get(id);
    if (g) applyGeometry(d, g);
    return id;
  }
  /**
   * Give a room its shapes from a geometry file (before or after the room is defined).
   * @param {string} id
   * @param {RoomGeometry} g
   */
  room.geometry = (id, g) => {
    geos.set(id, g);
    const d = defs.get(id);
    if (d) applyGeometry(d, g);
  };
  /** Problems found while applying geometry files. */
  room.geometryIssues = () => issues.slice();
  /** @param {string} id */
  room.get = (id) => {
    const d = defs.get(id);
    if (!d) throw new Error(`Cutaway: no room "${id}"`);
    return d;
  };
  /** @param {string} id */
  room.has = (id) => defs.has(id);
  room.ids = () => [...defs.keys()];
  return room;
})();

/** The current room at runtime: its walk map, props, hotspots, actors and camera. */
Cutaway.scene = (function () {
  /**
   * @typedef {object} Drawable
   * @property {number} baseline
   * @property {(ctx: CanvasRenderingContext2D) => void} draw
   */

  /** @type {Room | null} */
  let current = null;
  /** @type {InstanceType<typeof Cutaway.walk.WalkMap> | null} */
  let walkMap = null;
  /** @type {WeakMap<Room, InstanceType<typeof Cutaway.walk.WalkMap>>} */
  const walkMaps = new WeakMap();
  const camera = { x: 0, y: 0 };
  /** @type {string | null} the actor the camera follows and clicks move */
  let activeId = null;
  let time = 0;
  /** @type {[number, number] | null} where the camera stays in a backdrop */
  let view = null;

  /**
   * Show a room and run its `enter` script (unless `enter: false`, as when loading a save).
   * Actors whose `room` is this id appear in it. A backdrop (`backdrop: [x, y]`, the camera's top left;
   * the title screen) is only shown: no enter script, not visited, no autosave.
   * @param {string} id
   * @param {{enter?: boolean, backdrop?: [number, number]}} [o]
   */
  async function load(id, o = {}) {
    const def = Cutaway.room.get(id);
    current = def;
    walkMap = mapOf(def);
    view = o.backdrop ?? null;
    follow(true);
    Cutaway.events.emit("room.enter", { id, music: def.music });
    if (view) return;
    if (def.enter && o.enter !== false) await Cutaway.script.run(def.enter, { path: `${id}.enter` });
    Cutaway.state.visit(id);
    Cutaway.events.emit("room.entered", { id });
  }

  /** The walk map of a room, built once (the visibility graph is costly). @param {Room} def */
  function mapOf(def) {
    let m = walkMaps.get(def);
    if (!m) { m = Cutaway.walk.create({ walk: def.walk ?? [], holes: def.holes ?? [] }); walkMaps.set(def, m); }
    return m;
  }

  /**
   * Move the active actor to another room (a `goto` or an exit), fading out and in. Party members
   * who follow come along and stand beside the arrival point.
   * @param {string} id
   * @param {[number, number]} [at]
   * @param {Facing} [face]
   * @param {{transition?: boolean, follow?: boolean}} [o]  transition: false = cut; follow: false = alone
   */
  async function go(id, at, face, o = {}) {
    const a = active(), from = current?.id, fade = o.transition !== false && id !== from;
    Cutaway.events.emit("room.leave", { id: from, to: id });
    if (fade) await Cutaway.fx.transition("out");
    if (a) {
      a.place(id, at ? at[0] : a.x, at ? at[1] : a.y, face);
      if (o.follow !== false && id !== from) {
        const map = mapOf(Cutaway.room.get(id));
        Cutaway.party.followers(from, a.id).forEach((m, i) => {
          const f = Cutaway.actors.get(m), side = i % 2 ? -1 : 1, dx = side * 16 * (Math.floor(i / 2) + 1);
          const p = map.nearest({ x: a.x + dx, y: a.y + (i % 2 ? 3 : -3) });
          f?.place(id, Math.round(p ? p.x : a.x), Math.round(p ? p.y : a.y), a.facing);
        });
      }
    }
    const loaded = load(id);
    if (fade) Cutaway.fx.transition("in");
    await loaded;
  }

  /** Actor scale at a depth (y) in the current room: 1 without a `scale`. @param {number} y */
  function scaleAt(y) {
    const s = current?.scale;
    if (!s) return 1;
    const [y0, s0] = s.far, [y1, s1] = s.near;
    if (y1 === y0) return s1;
    return s0 + (s1 - s0) * Cutaway.util.clamp((y - y0) / (y1 - y0), 0, 1);
  }

  function size() {
    const s = current?.size;
    return { w: s ? s[0] : Cutaway.display.width, h: s ? s[1] : Cutaway.display.height };
  }

  /** Move the camera to keep the active actor in view. @param {boolean} [snap] */
  function follow(snap) {
    const a = active(), { w, h } = size();
    const sw = Cutaway.display.width, sh = Cutaway.display.height;
    if (!a || view) { camera.x = view?.[0] ?? 0; camera.y = view?.[1] ?? 0; return; }
    const tx = Cutaway.util.clamp(Math.round(a.x - sw / 2), 0, Math.max(0, w - sw));
    const ty = Cutaway.util.clamp(Math.round(a.y - 20 - sh / 2), 0, Math.max(0, h - sh));
    if (snap) { camera.x = tx; camera.y = ty; return; }
    camera.x += Math.sign(tx - camera.x) * Math.min(Math.abs(tx - camera.x), 2);
    camera.y += Math.sign(ty - camera.y) * Math.min(Math.abs(ty - camera.y), 2);
  }

  function active() { return activeId ? Cutaway.actors.get(activeId) : null; }

  /** Actors in the current room. */
  function actorsHere() { return current ? Cutaway.actors.all().filter((a) => a.room === current?.id) : []; }

  /** Visible props with their current image. */
  function props() {
    /** @type {{def: PropDef, image: string}[]} */
    const out = [];
    for (const p of current?.props ?? []) {
      if (p.id && Cutaway.state.isHidden(p.id, !!p.hidden)) continue;
      if (!p.id && p.hidden) continue;
      const st = p.id && p.states ? Cutaway.state.objState(p.id) : "";
      out.push({ def: p, image: (st && p.states?.[st]) || p.image });
    }
    return out;
  }

  /**
   * The screen box of a prop's current frame.
   * @param {PropDef} p
   * @returns {[number, number, number, number] | null}
   */
  function propBox(p) {
    const a = Cutaway.assets.get(p.image);
    if (!a || !a.frames.length) return null;
    const f = a.frames[0], [ax, ay] = p.anchor ?? a.anchor ?? [Math.floor(f.w / 2), f.h];
    return [p.at[0] - (p.flip ? f.w - 1 - ax : ax), p.at[1] - ay, f.w, f.h];
  }

  /** Hotspots that exist right now, in data order, then the other actors in the room. */
  function hotspots() {
    /** @type {Hotspot[]} */
    const out = [];
    if (view) return out;                                // a backdrop is only looked at
    for (const [id, h] of Object.entries(current?.hotspots ?? {})) {
      if (Cutaway.state.isHidden(id, !!h.hidden) || !Cutaway.state.test(h.if)) continue;
      let poly = h.poly ? Cutaway.util.points(h.poly) : null;
      if (!poly && h.rect) { const [x, y, w, hh] = h.rect; poly = rectPoly(x, y, w, hh); }
      if (!poly) {
        const p = (current?.props ?? []).find((q) => q.id === (h.prop ?? id));
        const box = p && !Cutaway.state.isHidden(p.id ?? "", !!p.hidden) ? propBox(p) : null;
        if (box) poly = rectPoly(...box);
      }
      if (poly) out.push({ id, def: h, poly });
    }
    for (const a of actorsHere()) {
      if (a.id === activeId || a.def.hidden) continue;
      const [x, y, w, h] = a.box();
      out.push({ id: "@" + a.id, actor: a.id, poly: rectPoly(x, y, w, h),
        def: { name: a.name, look: a.def.look, talk: a.def.talk, with: a.def.with, z: 1 } });
    }
    return out;
  }

  /** @param {number} x @param {number} y @param {number} w @param {number} h */
  function rectPoly(x, y, w, h) { return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]; }

  /**
   * The topmost hotspot under a room point.
   * @param {number} x
   * @param {number} y
   */
  function hotspotAt(x, y) {
    const list = hotspots();
    let best = null, bestZ = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const h = list[i], z = (h.def.z ?? 0) * 1e4 + i;
      if (z >= bestZ && Cutaway.walk.inPoly({ x: x + 0.5, y: y + 0.5 }, h.poly)) { best = h; bestZ = z; }
    }
    return best;
  }

  /** Rebuild the current room's walk map after its polygons changed (the room editor). */
  function refresh() {
    if (!current) return;
    walkMap = Cutaway.walk.create({ walk: current.walk ?? [], holes: current.holes ?? [] });
    walkMaps.set(current, walkMap);
  }

  /** @param {number} dt */
  function update(dt) {
    time += dt;
    for (const a of actorsHere()) a.update(dt);
    follow(false);
  }

  /**
   * Where the copies of a scrolling prop stand now: one image width apart, covering the room. A pure
   * function of the scene time, in whole pixels, so screenshots of the same moment match.
   * @param {PropDef} d @param {string} image @param {number} roomW
   */
  function scrollXs(d, image, roomW) {
    const a = Cutaway.assets.get(image), fw = a?.frames[0]?.w ?? 0;
    if (!fw) return [];
    const ax = d.anchor ? d.anchor[0] : (a?.anchor?.[0] ?? Math.floor(fw / 2));
    const off = ((Math.floor(d.at[0] + time * (d.scroll ?? 0) / 1000) % fw) + fw) % fw;
    const xs = [];
    for (let x = off - fw; x - ax < roomW; x += fw) if (x - ax + fw > 0) xs.push(x);
    return xs;
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function render(ctx) {
    if (!current) return;
    const { w, h } = size();
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    if (current.color) { ctx.fillStyle = current.color; ctx.fillRect(0, 0, w, h); }
    if (current.background) Cutaway.assets.draw(ctx, current.background, 0, 0, { t: time, anchor: [0, 0] });
    /** @type {Drawable[]} */
    const list = [];
    for (const p of props()) {
      const d = p.def, o = { t: time, flip: d.flip, anchor: d.anchor };
      list.push({ baseline: d.baseline ?? d.at[1], draw: d.scroll
        ? (c) => { for (const x of scrollXs(d, p.image, w)) Cutaway.assets.draw(c, p.image, x, d.at[1], o); }
        : (c) => Cutaway.assets.draw(c, p.image, d.at[0], d.at[1], o) });
    }
    const lit = !!current.light;
    for (const a of actorsHere()) list.push({ baseline: a.y, draw: (c) => a.draw(c, lit ? Cutaway.light.sample(a.x, a.y - a.height() / 2, { base: true }) : undefined) });
    list.sort((p, q) => p.baseline - q.baseline);       // Array.sort is stable: ties keep data order
    for (const d of list) d.draw(ctx);
    for (const f of current.foreground ?? []) Cutaway.assets.draw(ctx, f.image, f.at?.[0] ?? 0, f.at?.[1] ?? 0, { t: time, anchor: [0, 0] });
    ctx.restore();
    // the light pass works on the screen: flicker over the baked light, added lamps, glows
    if (lit) Cutaway.light.render(ctx);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    Cutaway.fx.render(ctx);
    Cutaway.events.emit("scene.drawn", ctx);           // world-space overlays (debug)
    ctx.restore();
  }

  return {
    load, go, update, render, follow, actorsHere, hotspots, hotspotAt, props, propBox, scaleAt, refresh, scrollXs,
    get room() { return current; },
    /** Is the room only a backdrop (the title screen)? */
    get backdrop() { return !!view; },
    get walkMap() { return walkMap; },
    get camera() { return camera; },
    get time() { return time; },
    /** The actor the player controls in this room. */
    get active() { return active(); },
    /** @param {string | null} id */
    setActive(id) { activeId = id; follow(true); },
    /**
     * Screen (logical) pixel to room pixel.
     * @param {number} x
     * @param {number} y
     */
    toWorld(x, y) { return { x: x + camera.x, y: y + camera.y }; },
    /** Room pixel to screen pixel. @param {number} x @param {number} y */
    toScreen(x, y) { return { x: x - camera.x, y: y - camera.y }; },
  };
})();
