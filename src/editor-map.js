// Cutaway.js editor, Map tab: every room at once, as a picture of its background, and the ways between them:
// exits (a hotspot's `exit`), script warps (a `goto` in any script: a room's entering, a hotspot's or an
// actor's scripts, a dialogue an actor in that room opens; one under an `if` is conditional, its condition
// shown), and the rooms a sequence goes to. From the acts' rooms the ways are followed: a room none of them
// reaches is unreachable (a sequence's own rooms are only seen in it), a way to a room that doesn't exist
// is broken. Drag a room to place it (kept for this game in the browser), Re-layout lays them out again by
// how far each is from the start; a click picks a room (its ways listed, each opening where it is in the
// data), a double click opens it in the Room tab. The wheel zooms, a drag on the empty ground moves the view.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  const COL = { exit: "#5ab4d6", script: "#b88ce8", seq: "#c9a060", broken: "#ff5a5a", sel: "#ffe14a", ground: "#100d18", box: "#1c1729" };
  const opts = { exits: true, scripts: true, seq: false, only: false, unreachable: false };
  const KEY = "cutaway.editor.map:" + location.pathname;
  let sel = "";
  /** @type {Record<string, {x: number, y: number}>} where each room's picture is, in map pixels */
  let pos = {};
  try { pos = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { pos = {}; }
  const zoom = { x: 20, y: 20, k: 0.25 };
  let fitted = false;

  /**
   * A way between rooms.
   * @typedef {{from: string, to: string, kind: "exit" | "script" | "seq", label: string, cond: string, go: () => void}} Way
   */

  /** The steps of a script with the conditions they are under (an `if`'s then: its condition; its else: not). @param {any} s @param {(step: any, cond: string[]) => void} f @param {string[]} [cond] */
  function walk(s, f, cond = []) {
    if (Array.isArray(s)) { for (const x of s) walk(x, f, cond); return; }
    if (!s || typeof s !== "object") return;
    f(s, cond);
    const c = "if" in s ? (typeof s.if === "string" ? s.if : JSON.stringify(s.if)) : null;
    for (const [k, v] of Object.entries(s)) {
      if (k === "if" || !v || typeof v !== "object") continue;
      walk(v, f, c === null ? cond : [...cond, k === "else" ? (c.startsWith("!") ? c.slice(1) : `!${c}`) : c]);
    }
  }

  /** Every way in the game's data. */
  function collect() {
    const rooms = Cutaway.room.ids(), known = new Set(rooms);
    /** @type {Way[]} */
    const ways = [];
    // a dialogue's choices go to its nodes with `goto` too ({ text, goto: "end" }): only a step's goto goes to a room
    /** @param {string} from @param {any} script @param {string} label @param {() => void} go @param {Way["kind"]} [kind] */
    const gotos = (from, script, label, go, kind = "script") => walk(script, (s, cond) => {
      if (typeof s.goto === "string" && !("text" in s) && !("choices" in s)) ways.push({ from, to: s.goto, kind, label, cond: cond.join(" and "), go });
    });
    const things = E.modules.things;
    for (const id of rooms) {
      const r = Cutaway.room.get(id);
      gotos(id, r.enter, "entering", () => { things?.reveal(id, "room", ["enter"]); });
      for (const [hid, h] of Object.entries(/** @type {Record<string, any>} */ (r.hotspots ?? {}))) {
        if (h.exit?.to) ways.push({ from: id, to: h.exit.to, kind: "exit", label: hid, cond: typeof h.if === "string" ? h.if : h.if ? JSON.stringify(h.if) : "", go: () => { things?.reveal(id, `hot:${hid}`); } });
        for (const v of ["look", "use", "talk", "take"]) gotos(id, h[v], `${hid}: ${v}`, () => { things?.reveal(id, `hot:${hid}`, [v]); });
        for (const [it, s] of Object.entries(/** @type {Record<string, any>} */ (h.with ?? {}))) gotos(id, s, `${hid}: with ${it}`, () => { things?.reveal(id, `hot:${hid}`, ["with", it]); });
      }
    }
    // an actor's scripts and the dialogues their talk opens run where the actor is
    for (const a of Cutaway.actors.all()) {
      if (!a.room) continue;
      const room = a.room;
      for (const v of /** @type {const} */ (["look", "talk"])) gotos(room, a.def[v], `${a.id}: ${v}`, () => { things?.reveal("", `actor:${a.id}`, [v]); });
      walk(a.def.talk, (s) => {
        if (typeof s.dialog === "string") gotos(room, Cutaway.dialog.get(s.dialog), `${a.id}: dialogue ${s.dialog}`, () => { E.modules.dialogue?.edit(s.dialog); });
      });
    }
    for (const id of Cutaway.sequence?.ids() ?? []) {
      const q = Cutaway.sequence.get(id);
      /** @type {string | null} */
      let last = null;
      walk(q?.steps, (s) => {
        if (typeof s.goto !== "string") return;
        if (last) ways.push({ from: last, to: s.goto, kind: "seq", label: `sequence ${id}`, cond: "", go: () => { things?.reveal("", `seq:${id}`, ["steps"]); } });
        last = s.goto;
      });
    }
    // the start: the acts' rooms (else the room shown now)
    const roots = [...new Set(Cutaway.act.ids().map((a) => Cutaway.act.get(a)?.room).filter((r) => typeof r === "string" && known.has(r)))];
    if (!roots.length && Cutaway.scene.room) roots.push(Cutaway.scene.room.id);
    const reach = new Set(roots), todo = [...roots];
    while (todo.length) {
      const r = todo.pop();
      for (const w of ways) if (w.from === r && w.kind !== "seq" && known.has(w.to) && !reach.has(w.to)) { reach.add(w.to); todo.push(w.to); }
    }
    const inSeq = new Set(ways.filter((w) => w.kind === "seq").flatMap((w) => [w.from, w.to]));
    for (const id of Cutaway.sequence?.ids() ?? []) walk(Cutaway.sequence.get(id)?.steps, (s) => { if (typeof s.goto === "string") inSeq.add(s.goto); });
    // the title screen's rooms are no place to walk to: they are the game's menus
    const t = /** @type {any} */ (Cutaway.acts.title), menus = new Set([t?.room, t?.splash?.room].filter((r) => typeof r === "string" && known.has(r)));
    const broken = ways.filter((w) => !known.has(w.to));
    const unreachable = rooms.filter((r) => !reach.has(r) && !inSeq.has(r) && !menus.has(r));
    return { rooms, known, ways, roots, reach, inSeq, menus, broken, unreachable };
  }

  /** A room's size in pixels. @param {string} id */
  function sizeOf(id) {
    const r = Cutaway.room.get(id);
    return r?.size ?? [Cutaway.display.width, Cutaway.display.height];
  }

  /** Lay the rooms out again: a column per step from the start, rooms in the order they are met. */
  function relayout() {
    const d = collect(), dist = new Map(d.roots.map((r) => [r, 0])), order = [...d.roots];
    for (let i = 0; i < order.length; i++) {
      for (const w of d.ways) if (w.from === order[i] && w.kind !== "seq" && d.known.has(w.to) && !dist.has(w.to)) { dist.set(w.to, /** @type {number} */ (dist.get(order[i])) + 1); order.push(w.to); }
    }
    // what the start doesn't reach: a sequence's rooms, then the rest, in columns of their own after the others
    let next = Math.max(0, ...dist.values()) + 1;
    for (const r of d.rooms) if (!dist.has(r) && (d.inSeq.has(r) || d.menus.has(r))) { dist.set(r, next); order.push(r); }
    next++;
    for (const r of d.rooms) if (!dist.has(r)) { dist.set(r, next); order.push(r); }
    const GAP = 60, cols = new Map();
    for (const r of order) { const c = /** @type {number} */ (dist.get(r)); if (!cols.has(c)) cols.set(c, []); cols.get(c).push(r); }
    let x = 0;
    pos = {};
    for (const c of [...cols.keys()].sort((a, b) => a - b)) {
      const list = cols.get(c);
      let y = 0, w = 0;
      for (const r of list) { const [rw, rh] = sizeOf(r); pos[r] = { x, y }; y += rh + GAP; w = Math.max(w, rw); }
      x += w + GAP * 2;
    }
    keep();
    fitted = false;
  }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(pos)); } catch { /* private mode */ } };

  // ---- the view: a canvas in the centre

  const canvas = /** @type {HTMLCanvasElement} */ (el("canvas", { style: { width: "100%", height: "100%", display: "block", cursor: "grab" } }));
  const box = el("div", { style: { width: "100%", height: "100%", background: COL.ground } }, [canvas]);
  /** @type {ReturnType<typeof collect> | null} */
  let data = null;

  function draw() {
    const r = box.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (!r.width) return;
    if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COL.ground; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!data) return;
    for (const id of data.rooms) if (!pos[id]) { relayout(); break; }
    ctx.setTransform(dpr * zoom.k, 0, 0, dpr * zoom.k, dpr * zoom.x, dpr * zoom.y);
    ctx.imageSmoothingEnabled = false;
    const lw = 1 / zoom.k;
    // the rooms' pictures
    for (const id of data.rooms) {
      const p = pos[id], [w, h] = sizeOf(id), room = Cutaway.room.get(id);
      const dim = (opts.only && sel && sel !== id && !data.ways.some((x) => (x.from === sel && x.to === id) || (x.to === sel && x.from === id))) ||
        (opts.unreachable && !data.unreachable.includes(id));
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.fillStyle = room.color ?? COL.box; ctx.fillRect(p.x, p.y, w, h);
      if (room.background) Cutaway.assets.draw(ctx, room.background, p.x, p.y, { frame: 0, anchor: [0, 0] });
      ctx.lineWidth = (id === sel ? 3 : 1.5) * lw;
      ctx.setLineDash(data.unreachable.includes(id) ? [8 * lw, 5 * lw] : []);
      ctx.strokeStyle = id === sel ? COL.sel : data.unreachable.includes(id) ? COL.broken : data.roots.includes(id) ? "#fff" : "#4a4066";
      ctx.strokeRect(p.x, p.y, w, h);
      ctx.setLineDash([]);
      // its name in a label at the top left, readable at any zoom
      ctx.font = `${12 * lw}px Consolas, monospace`;
      const tw = ctx.measureText(id).width;
      ctx.fillStyle = "rgba(16,13,24,.85)"; ctx.fillRect(p.x, p.y, tw + 8 * lw, 16 * lw);
      ctx.fillStyle = "#fff"; ctx.fillText(id, p.x + 4 * lw, p.y + 12 * lw);
    }
    ctx.globalAlpha = 1;
    // the ways
    for (const w of data.ways) {
      if ((w.kind === "exit" && !opts.exits) || (w.kind === "script" && !opts.scripts) || (w.kind === "seq" && !opts.seq)) continue;
      if (opts.only && sel && w.from !== sel && w.to !== sel) continue;
      const a = pos[w.from], b = pos[w.to];
      if (!a) continue;
      const [aw, ah] = sizeOf(w.from), pa = [a.x + aw / 2, a.y + ah / 2];
      const pb = b ? (() => { const [bw, bh] = sizeOf(w.to); return [b.x + bw / 2, b.y + bh / 2]; })() : [pa[0] + aw * 0.7, pa[1] - ah * 0.7];
      if (w.from === w.to) continue;
      const hot = sel && (w.from === sel || w.to === sel);
      ctx.strokeStyle = !b ? COL.broken : COL[w.kind];
      ctx.globalAlpha = sel && !hot ? 0.3 : 0.9;
      ctx.lineWidth = (hot ? 2.5 : 1.5) * lw;
      ctx.setLineDash(w.kind === "exit" ? [] : [7 * lw, 5 * lw]);
      // a curve bowing to one side, so the ways there and back don't lie on each other
      const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, dx = pb[0] - pa[0], dy = pb[1] - pa[1], len = Math.hypot(dx, dy) || 1;
      const cx = mx - (dy / len) * len * 0.15, cy = my + (dx / len) * len * 0.15;
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.quadraticCurveTo(cx, cy, pb[0], pb[1]); ctx.stroke();
      // its head where it arrives
      const t = 0.92, hx = (1 - t) ** 2 * pa[0] + 2 * (1 - t) * t * cx + t * t * pb[0], hy = (1 - t) ** 2 * pa[1] + 2 * (1 - t) * t * cy + t * t * pb[1];
      const ang = Math.atan2(pb[1] - hy, pb[0] - hx), s = 10 * lw;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(pb[0], pb[1]); ctx.lineTo(pb[0] - s * Math.cos(ang - 0.4), pb[1] - s * Math.sin(ang - 0.4));
      ctx.moveTo(pb[0], pb[1]); ctx.lineTo(pb[0] - s * Math.cos(ang + 0.4), pb[1] - s * Math.sin(ang + 0.4)); ctx.stroke();
      if (!b) { ctx.fillStyle = COL.broken; ctx.font = `${12 * lw}px Consolas, monospace`; ctx.fillText(`${w.to}?`, pb[0] + 4 * lw, pb[1]); }
    }
    ctx.globalAlpha = 1;
  }

  /** Everything in view. */
  function fit() {
    if (!data) return;
    const r = box.getBoundingClientRect();
    if (!r.width) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of data.rooms) { const p = pos[id], [w, h] = sizeOf(id); if (!p) continue; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + w); y1 = Math.max(y1, p.y + h); }
    if (!isFinite(x0)) return;
    zoom.k = Math.min(r.width / (x1 - x0 + 80), r.height / (y1 - y0 + 80), 2);
    zoom.x = (r.width - (x1 - x0) * zoom.k) / 2 - x0 * zoom.k;
    zoom.y = (r.height - (y1 - y0) * zoom.k) / 2 - y0 * zoom.k;
    fitted = true;
    draw();
  }

  /** The room under a point of the canvas (CSS pixels), the topmost. @param {number} cx @param {number} cy */
  function roomAt(cx, cy) {
    const x = (cx - zoom.x) / zoom.k, y = (cy - zoom.y) / zoom.k;
    for (const id of [...(data?.rooms ?? [])].reverse()) { const p = pos[id], [w, h] = sizeOf(id); if (p && x >= p.x && x < p.x + w && y >= p.y && y < p.y + h) return id; }
    return "";
  }

  /** @type {{room: string, x: number, y: number, ox: number, oy: number, moved: boolean} | null} */
  let drag = null;
  canvas.addEventListener("pointerdown", (/** @type {PointerEvent} */ e) => {
    const r = canvas.getBoundingClientRect(), room = e.button === 0 ? roomAt(e.clientX - r.left, e.clientY - r.top) : "";
    drag = { room, x: e.clientX, y: e.clientY, ox: room ? pos[room].x : zoom.x, oy: room ? pos[room].y : zoom.y, moved: false };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (/** @type {PointerEvent} */ e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.room) pos[drag.room] = { x: Math.round(drag.ox + dx / zoom.k), y: Math.round(drag.oy + dy / zoom.k) };
    else { zoom.x = drag.ox + dx; zoom.y = drag.oy + dy; }
    draw();
  });
  canvas.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.room && drag.moved) keep();
    if (!drag.moved) { sel = drag.room; E.refresh(); draw(); }
    drag = null;
    canvas.style.cursor = "grab";
  });
  canvas.addEventListener("dblclick", (/** @type {MouseEvent} */ e) => {
    const r = canvas.getBoundingClientRect(), room = roomAt(e.clientX - r.left, e.clientY - r.top);
    if (room) { E.openRoom(room); E.show("room"); } else fit();
  });
  canvas.addEventListener("wheel", (/** @type {WheelEvent} */ e) => {
    e.preventDefault(); e.stopPropagation();
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = Math.exp(-e.deltaY * 0.0015);
    zoom.x = mx - (mx - zoom.x) * f; zoom.y = my - (my - zoom.y) * f; zoom.k *= f;
    draw();
  }, { passive: false });
  new ResizeObserver(() => draw()).observe(box);

  /** @type {EditorView} */
  const view = { el: box, shown() { data = collect(); requestAnimationFrame(() => { if (!fitted) fit(); else draw(); }); }, selectNone() { sel = ""; E.refresh(); draw(); } };

  // ---- the inspector

  function build(/** @type {HTMLElement} */ panel) {
    data = collect();
    const d = data;
    const counts = `${d.rooms.length} rooms · ${d.ways.filter((w) => w.kind === "exit").length} exits · ${d.ways.filter((w) => w.kind === "script").length} script warps · ` +
      `${d.unreachable.length} unreachable from ${d.roots.join(", ") || "the start"} · ${d.broken.length} broken`;
    panel.append(el("div", { className: "cw-dim", style: { margin: "2px 0 6px" } }, [counts]));
    /** @param {keyof typeof opts} k @param {string} text @param {string} [color] */
    const check = (k, text, color) => el("label", { style: { display: "block", margin: "2px 0", cursor: "pointer" } }, [
      el("input", { type: "checkbox", checked: opts[k], onchange: (/** @type {any} */ e) => { opts[k] = e.target.checked; draw(); } }),
      el("span", { style: { color: color ?? "" } }, [` ${text}`])]);
    panel.append(el("div", { className: "cw-sec" }, [
      check("exits", "── exits", COL.exit), check("scripts", "- - script warps (a goto)", COL.script), check("seq", "- - sequences", COL.seq),
      check("only", "only the picked room's ways"), check("unreachable", "light up what is unreachable"),
      el("div", { style: { marginTop: "4px" } }, [button("Fit", fit, "every room in view (or a double click on the ground)"),
        button("Re-layout", () => { relayout(); fit(); }, "lay the rooms out again by how far each is from the start (your places go)")])]));
    /** @param {Way[]} list @param {(w: Way) => string} text */
    const ways = (list, text) => list.length ? list.map((w) => el("div", { style: { margin: "2px 0", cursor: "pointer" }, title: "open it where it is in the data", onclick: w.go }, [
      el("span", { style: { color: COL[w.kind] } }, [text(w)]), el("span", { className: "cw-dim" }, [`  ${w.label}${w.cond ? `  (if ${w.cond})` : ""}`])]))
      : [el("div", { className: "cw-dim" }, ["—"])];
    if (sel && d.known.has(sel)) {
      const status = d.roots.includes(sel) ? "an act begins here" : d.reach.has(sel) ? "reached from the start" : d.menus.has(sel) ? "the title screen's" : d.inSeq.has(sel) ? "only in a sequence" : "unreachable from the start";
      panel.append(el("div", { className: "cw-sec" }, [
        el("div", { style: { fontWeight: "bold" } }, [sel]), el("div", { className: "cw-dim" }, [status]),
        el("div", { style: { margin: "4px 0" } }, [button("Open", () => { E.openRoom(sel); E.show("room"); }, "the room in the Room tab (or a double click)"),
          button("Things", () => { E.modules.things?.reveal(sel, "room"); }, "its properties and scripts")]),
        E.fold("map.out", "ways out", () => ways(d.ways.filter((w) => w.from === sel), (w) => `→ ${w.to}`)),
        E.fold("map.in", "ways in", () => ways(d.ways.filter((w) => w.to === sel), (w) => `← ${w.from}`))]));
    } else panel.append(el("div", { className: "cw-dim" }, ["Click a room: its ways out and in. A double click opens it; drag one to place it."]));
    if (d.broken.length) panel.append(el("div", { className: "cw-sec" }, [E.fold("map.broken", "broken: to no room", () => ways(d.broken, (w) => `${w.from} → ${w.to}?`), { note: String(d.broken.length) })]));
    if (d.unreachable.length) panel.append(el("div", { className: "cw-sec" }, [E.fold("map.unreachable", "unreachable", () => d.unreachable.map((r) => el("div", { style: { cursor: "pointer", color: COL.broken }, onclick: () => { sel = r; E.refresh(); draw(); } }, [r])), { note: String(d.unreachable.length) })]));
    draw();
  }

  E.tab({ id: "map", label: "Map", build, view: () => view, selectNone: () => view.selectNone?.() });
  E.modules.map = { collect, relayout, fit, get selected() { return sel; }, select(/** @type {string} */ id) { sel = id; E.refresh(); draw(); }, get positions() { return pos; } };
})();
