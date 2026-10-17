// Cutaway.js editor, in the running game. Open it with F10 or `?edit` (the engine loads this file on
// demand; games don't list it). Its tabs: Room (this file: the shapes), and the modules it loads next to
// it: Texts, Things, Art, Sound, Dialogue, State, Issues, Checks, Help (editor-*.js; the guide is
// docs/editor.md). It edits the live game data, so changes can be
// tried at once (F10 closes it and plays). It opens in a window of its own (an about:blank popup the
// game page builds and drives: same origin, so it works from file://, and the game keeps its size), or
// docked beside the game when popups are blocked (?edit on load) or wanted (Dock).
// It saves layer files the game loads after its own code:
// with the studio (tools/studio.mjs) straight into the game's folder, else through the browser's file
// picker or as a download. The Room tab saves the shapes as `rooms/<id>.geo.js` (Cutaway.room.geometry).
//   walk areas and holes      drag corners, double-click an edge for a new corner, Delete removes one
//   hotspots                  polygons or rects (drag corners); their walk-to point (the cross)
//   prop baselines            drag the cyan handle up or down
//   lamps                     drag the source, or the handle on the reach circle
//   effect areas              like polygons (haze, dust, rain), points (drips, steam, sparkles)
// Click a shape to select it, drag inside it to move it, arrows nudge (Shift: 10 px), Ctrl+Z / Ctrl+Y
// undo and redo. "+ Walk area" / "+ Hole" / "+ Hotspot": click the corners, then click the first
// corner again or press Enter (Esc cancels).
"use strict";

/**
 * @typedef {{x: number, y: number}} Pt
 * @typedef {object} EditItem
 * @property {string} key           "walk:0", "hole:1", "hot:print", "prop:booth", "lamp:bulb", "fx:2"
 * @property {string} group         walk, hole, hotspot, prop, lamp, fx
 * @property {string} label
 * @property {string} color
 * @property {Pt[]} handles         draggable points (room pixels)
 * @property {Pt[] | null} outline  the shape (hit test, drawing)
 * @property {boolean} [closed]     the outline is a polygon (else a line or nothing)
 * @property {boolean} [vertices]   its handles are polygon corners (insert and delete work)
 * @property {(i: number, x: number, y: number) => void} move
 * @property {(dx: number, dy: number) => void} [translate]
 * @property {(i: number, x: number, y: number) => void} [insert]   a corner after corner i
 * @property {(i: number) => boolean} [remove]
 * @property {number} [extra]       index of the first handle that isn't a corner (walk-to, lamp reach)
 */

/**
 * An editor tab (Room is built in; modules add theirs with Cutaway.editor.tab).
 * @typedef {object} EditorTab
 * @property {string} id
 * @property {string} label
 * @property {(box: HTMLElement) => void} build       fill the panel (again when the tab asks: refresh)
 * @property {(ctx: CanvasRenderingContext2D) => void} [render]  draw over the room (room pixels)
 * @property {(p: Pt, button: number) => void} [pick] a click on the room picture (room pixels)
 * @property {() => void} [onRoom]                    another room was opened
 */

Cutaway.editor = (function () {
  const PANEL = 380, GRAB = 2.5;
  const MODULES = ["editor-texts.js", "editor-things.js", "editor-art.js", "editor-sound.js", "editor-dialogue.js", "editor-state.js",
    "editor-issues.js", "editor-checks.js", "editor-help.js", "editor-guide.js"];
  const COLORS = { walk: "#3df27a", hole: "#ff4a5a", hotspot: "#ffa03a", prop: "#3ae8ff", lamp: "#fff27a", fx: "#6aa8ff", walkTo: "#ffe14a" };
  let isOpen = false;
  /** @type {string | null} */
  let selKey = null;
  let selHandle = -1;
  /** @type {{key: string, handle: number, last: Pt, pushed: boolean} | null} */
  let drag = null;
  /** @type {{group: "walk" | "hole" | "hotspot", pts: Pt[]} | null} */
  let drawing = null;
  /** @type {Pt} */
  let cursor = { x: 0, y: 0 };
  /** @type {string[]} geometry snapshots (JSON) */
  let undoStack = [];
  /** @type {string[]} */
  let redoStack = [];
  /** @type {Record<string, boolean>} */
  const show = { walk: true, hole: true, hotspot: true, prop: true, lamp: true, fx: true };
  /** @type {Map<string, any>} file handles per room (File System Access API) */
  const fileHandles = new Map();
  /** @type {HTMLDivElement | null} */
  let panel = null;
  /** @type {Window | null} the editor's own window (null: docked beside the game) */
  let win = null;
  let wantWindow = true, pollTimer = 0;
  let status = "", panelDirty = true;
  /** @type {EditorTab[]} */
  const tabs = [];
  let active = "room", modulesLoaded = false, roomDirty = false, beforeHelp = "room";

  /** What isn't saved yet, per tab ("Room", "Texts 3", ...): the modules report theirs (`unsaved`). */
  function unsaved() {
    const out = roomDirty ? ["Room"] : [];
    for (const [k, m] of Object.entries(/** @type {Record<string, any>} */ (api.modules))) {
      const n = m?.unsaved;
      if (n) out.push(k[0].toUpperCase() + k.slice(1) + (typeof n === "number" ? ` ${n}` : ""));
    }
    return out;
  }

  // ------------------------------------------------------------------ the studio (tools/studio.mjs)

  /** Files of the game through the studio server, when the page came from it (?studio=<token>). */
  const studio = (function () {
    const q = new URLSearchParams(location.search).get("studio");
    if (q) sessionStorage.setItem("cutaway.studio", q);
    const token = q ?? sessionStorage.getItem("cutaway.studio") ?? "";
    /** @type {any} */
    let cfg = null;
    /** @param {string} path @param {RequestInit} [o] */
    async function call(path, o = {}) {
      const r = await fetch("/__studio/" + path, { ...o, headers: { "x-studio-token": token } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
      return r;
    }
    const enc = encodeURIComponent;
    return {
      /** Is the studio there? (Connected when the editor opens.) */
      get available() { return !!cfg; },
      get config() { return cfg; },
      async connect() {
        if (!token || location.protocol === "file:") return false;
        try { cfg = await (await call("config")).json(); } catch { cfg = null; }
        return !!cfg;
      },
      /** The path of a layer file ("room", "texts", "edits", "sounds", "art", "artAtlas", "audio"). @param {string} kind @param {Record<string, string>} [vars] */
      layer(kind, vars = {}) { return String(cfg?.layers?.[kind] ?? "").replace(/\{(\w+)\}/g, (/** @type {string} */ _m, /** @type {string} */ k) => vars[k] ?? ""); },
      /** @param {string} path */
      async read(path) { return (await call("read?path=" + enc(path))).text(); },
      /** @param {string} path */
      async readBytes(path) { return new Uint8Array(await (await call("read?path=" + enc(path))).arrayBuffer()); },
      /** @param {string} path */
      async exists(path) { try { await call("read?path=" + enc(path)); return true; } catch { return false; } },
      /** @param {string} path @param {string | Uint8Array | Blob} data */
      async write(path, data) { await call("write?path=" + enc(path), { method: "PUT", body: /** @type {any} */ (data) }); },
      /** @param {string} dir @returns {Promise<{name: string, dir: boolean, size: number}[]>} */
      async list(dir) { return (await call("list?dir=" + enc(dir))).json(); },
      /** Run one of the game's tasks (studio.json). @param {string} task @returns {Promise<{code: number, output: string}>} */
      async run(task) { return (await call("run?task=" + enc(task), { method: "POST" })).json(); },
    };
  })();

  /**
   * Save a file: through the studio into the game's folder, else with the browser's file picker (or as
   * a download). Resolves to what happened, for the status line.
   * @param {string} path  where it goes in the game (its last part names the download)
   * @param {string | Uint8Array} content
   */
  async function saveFile(path, content) {
    const name = path.split("/").pop() ?? "file", w = /** @type {any} */ (window);
    if (studio.available) { await studio.write(path, content); return `saved ${path}`; }
    try {
      if (w.showSaveFilePicker) {
        let h = fileHandles.get(path);
        if (!h) h = await w.showSaveFilePicker({ suggestedName: name });
        fileHandles.set(path, h);
        const f = await h.createWritable();
        await f.write(content);
        await f.close();
        return `saved ${h.name}`;
      }
    } catch (e) {
      if (/** @type {any} */ (e)?.name === "AbortError") return "not saved";
    }
    download(name, content);
    return `downloaded ${name}: put it at ${path}`;
  }

  /** @param {string} name @param {string | Uint8Array | Blob} content */
  function download(name, content) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([/** @type {any} */ (content)]));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function room() { return /** @type {Room | null} */ (Cutaway.scene.room); }
  /** @param {number[]} flat */
  function pts(flat) { return Cutaway.util.points(flat); }
  /** @param {number} x @param {number} y @param {number} w @param {number} h @returns {Pt[]} */
  function rectPts(x, y, w, h) { return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]; }

  /** A polygon item over a flat [x, y, ...] array that lives in the room data. @param {number[]} arr */
  function polyOps(arr) {
    return {
      handles: pts(arr), outline: pts(arr), closed: true, vertices: true,
      /** @param {number} i @param {number} x @param {number} y */
      move(i, x, y) { arr[2 * i] = x; arr[2 * i + 1] = y; },
      /** @param {number} dx @param {number} dy */
      translate(dx, dy) { for (let i = 0; i < arr.length; i += 2) { arr[i] += dx; arr[i + 1] += dy; } },
      /** @param {number} i @param {number} x @param {number} y */
      insert(i, x, y) { arr.splice(2 * i + 2, 0, x, y); },
      /** @param {number} i */
      remove(i) { if (arr.length <= 6) return false; arr.splice(2 * i, 2); return true; },
    };
  }

  /** A rect item over [x, y, w, h]: corners drag, the opposite corner stays. @param {[number, number, number, number]} r */
  function rectOps(r) {
    const corners = rectPts(...r);
    return {
      handles: corners, outline: corners, closed: true,
      /** @param {number} i @param {number} x @param {number} y */
      move(i, x, y) {
        const o = corners[(i + 2) % 4];                   // the opposite corner
        r[0] = Math.min(x, o.x); r[1] = Math.min(y, o.y); r[2] = Math.max(1, Math.abs(x - o.x)); r[3] = Math.max(1, Math.abs(y - o.y));
      },
      /** @param {number} dx @param {number} dy */
      translate(dx, dy) { r[0] += dx; r[1] += dy; },
    };
  }

  /** Every editable thing in the current room. @returns {EditItem[]} */
  function items() {
    const d = room();
    if (!d) return [];
    /** @type {EditItem[]} */
    const out = [];
    (d.walk ?? []).forEach((a, i) => out.push({ key: `walk:${i}`, group: "walk", label: `walk area ${i + 1}`, color: COLORS.walk, ...polyOps(a) }));
    (d.holes ?? []).forEach((a, i) => out.push({ key: `hole:${i}`, group: "hole", label: `hole ${i + 1}`, color: COLORS.hole, ...polyOps(a) }));
    for (const [id, h] of Object.entries(d.hotspots ?? {})) {
      /** @type {any} */
      let base = null;
      if (h.poly) base = polyOps(h.poly);
      else if (h.rect) base = rectOps(h.rect);
      else {                                           // a prop's box: shown, not editable until it gets a shape
        const p = (d.props ?? []).find((q) => q.id === (h.prop ?? id)), box = p ? Cutaway.scene.propBox(p) : null;
        base = { handles: [], outline: box ? rectPts(...box) : null, closed: true, move() {} };
      }
      const n = base.handles.length, wt = h.walkTo;
      out.push({ key: `hot:${id}`, group: "hotspot", label: `${id}${h.poly ? "" : h.rect ? " (rect)" : " (prop box)"}`, color: COLORS.hotspot, ...base,
        handles: wt ? [...base.handles, { x: wt[0], y: wt[1] }] : base.handles, extra: n,
        /** @param {number} i @param {number} x @param {number} y */
        move(i, x, y) { if (i === n && h.walkTo) { h.walkTo[0] = x; h.walkTo[1] = y; } else base.move(i, x, y); },
        translate: base.translate });
    }
    for (const p of d.props ?? []) {
      if (!p.id) continue;
      const box = Cutaway.scene.propBox(p);
      if (!box) continue;
      const b = p.baseline ?? p.at[1], cx = box[0] + Math.floor(box[2] / 2);
      out.push({ key: `prop:${p.id}`, group: "prop", label: `${p.id} baseline ${b}`, color: COLORS.prop,
        handles: [{ x: cx, y: b }], outline: [{ x: box[0], y: b }, { x: box[0] + box[2], y: b }],
        move(_i, _x, y) { p.baseline = y; } });
    }
    (d.light?.lamps ?? []).forEach((l, i) => {
      const reach = l.r * (l.power ?? 1);
      out.push({ key: `lamp:${l.id ?? i}`, group: "lamp", label: `lamp ${l.id ?? i} r ${l.r}`, color: COLORS.lamp,
        handles: [{ x: l.at[0], y: l.at[1] }, { x: Math.round(l.at[0] + reach), y: l.at[1] }], outline: null, extra: 1,
        move(k, x, y) { if (k === 0) { l.at = [x, y]; } else l.r = Math.max(1, Math.round(Math.hypot(x - l.at[0], y - l.at[1]) / (l.power ?? 1))); },
        translate(dx, dy) { l.at = [l.at[0] + dx, l.at[1] + dy]; } });
    });
    (d.fx ?? []).forEach((f, i) => {
      const key = `fx:${f.id ?? i}`, label = `${f.kind} ${f.id ?? i}`;
      if (f.poly) out.push({ key, group: "fx", label, color: COLORS.fx, ...polyOps(f.poly) });
      else if (f.rect) out.push({ key, group: "fx", label, color: COLORS.fx, ...rectOps(f.rect) });
      else if (f.at) {
        const at = f.at;
        out.push({ key, group: "fx", label, color: COLORS.fx, handles: [{ x: at[0], y: at[1] }], outline: null,
          move(_i, x, y) { at[0] = x; at[1] = y; }, translate(dx, dy) { at[0] += dx; at[1] += dy; } });
      } else if (f.points) {
        const list = f.points;
        out.push({ key, group: "fx", label, color: COLORS.fx, handles: list.map(([x, y]) => ({ x, y })), outline: null,
          move(k, x, y) { list[k] = [x, y]; }, translate(dx, dy) { for (const p of list) { p[0] += dx; p[1] += dy; } },
          remove(k) { if (list.length <= 1) return false; list.splice(k, 1); return true; } });
      }
    });
    return out;
  }

  // ------------------------------------------------------------------ geometry in and out

  /** The current room's shapes as a geometry object. @returns {RoomGeometry} */
  function geometry() {
    const d = room();
    if (!d) return {};
    /** @type {RoomGeometry} */
    const g = { walk: d.walk ?? [], holes: d.holes ?? [] };
    /** @type {NonNullable<RoomGeometry["hotspots"]>} */
    const hs = {};
    for (const [id, h] of Object.entries(d.hotspots ?? {})) {
      if (!h.poly && !h.rect && !h.walkTo) continue;
      hs[id] = { ...(h.poly ? { poly: h.poly } : h.rect ? { rect: h.rect } : {}), ...(h.walkTo ? { walkTo: h.walkTo } : {}), ...(h.face ? { face: h.face } : {}) };
    }
    g.hotspots = hs;
    /** @type {NonNullable<RoomGeometry["props"]>} */
    const ps = {};
    for (const p of d.props ?? []) if (p.id && p.baseline !== undefined) ps[p.id] = { baseline: p.baseline };
    if (Object.keys(ps).length) g.props = ps;
    /** @type {NonNullable<RoomGeometry["lamps"]>} */
    const ls = {};
    for (const l of d.light?.lamps ?? []) if (l.id) ls[l.id] = { at: l.at, r: l.r };
    if (Object.keys(ls).length) g.lamps = ls;
    /** @type {NonNullable<RoomGeometry["fx"]>} */
    const fs = {};
    (d.fx ?? []).forEach((f, i) => {
      const v = f.poly ? { poly: f.poly } : f.rect ? { rect: f.rect } : f.points ? { points: f.points } : f.at ? { at: f.at, ...(f.to !== undefined ? { to: f.to } : {}) } : null;
      if (v) fs[f.id ?? String(i)] = v;
    });
    if (Object.keys(fs).length) g.fx = fs;
    return JSON.parse(JSON.stringify(g));
  }

  /** Compact, readable JS for a value (arrays on one line, identifier keys unquoted). @param {any} v @param {string} ind @returns {string} */
  function fmt(v, ind = "") {
    const flat = (/** @type {any} */ a) => Array.isArray(a) && a.every((y) => typeof y === "number");
    if (flat(v)) return JSON.stringify(v).replace(/,/g, ", ");
    if (Array.isArray(v) && v.every(flat)) {               // a list of polygons or points: one line if short
      const one = JSON.stringify(v).replace(/,/g, ", ");
      if (one.length <= 90) return one;
    }
    if (Array.isArray(v)) return `[\n${v.map((/** @type {any} */ x) => `${ind}  ${fmt(x, ind + "  ")},`).join("\n")}\n${ind}]`;
    if (v && typeof v === "object") {
      const keys = Object.keys(v), key = (/** @type {string} */ k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
      /** @type {string[]} */
      const inner = keys.map((k) => `${key(k)}: ${fmt(v[k], ind + "  ")}`);
      /** @type {string} */
      const one = `{ ${inner.join(", ")} }`;
      if (one.length < 100 && !one.includes("\n")) return one;
      return `{\n${keys.map((k) => `${ind}  ${key(k)}: ${fmt(v[k], ind + "  ")},`).join("\n")}\n${ind}}`;
    }
    return JSON.stringify(v);
  }

  /** The geometry file for a room (default: the current one). @param {string} [id] */
  function text(id) {
    const d = room();
    if (id && d?.id !== id) throw new Error("Cutaway.editor: open the room first");
    if (!d) return "";
    return `// Shapes of the room "${d.id}": walk areas, holes, hotspots, baselines, lamps, effect areas.\n` +
      `// Made with the Cutaway.js room editor (F10 or ?edit); the room's logic is in ${d.id}.js.\n"use strict";\n\n` +
      `Cutaway.room.geometry(${JSON.stringify(d.id)}, ${fmt(geometry())});\n`;
  }

  /** @param {RoomGeometry} g */
  function restore(g) {
    const d = room();
    if (!d) return;
    if (g.walk) d.walk = g.walk;
    if (g.holes) d.holes = g.holes;
    Cutaway.room.geometry(d.id, g);
    Cutaway.scene.refresh();
  }

  function pushUndo() {
    roomDirty = true;
    undoStack.push(JSON.stringify(geometry()));
    if (undoStack.length > 200) undoStack.shift();
    redoStack = [];
  }
  /** @param {boolean} back */
  function undoRedo(back) {
    const from = back ? undoStack : redoStack, to = back ? redoStack : undoStack, s = from.pop();
    if (!s) return;
    to.push(JSON.stringify(geometry()));
    restore(JSON.parse(s));
    changed();
  }

  function changed() { Cutaway.scene.refresh(); panelDirty = true; }

  async function save() {
    const d = room();
    if (!d) return;
    try { status = await saveFile(studio.layer("room", { id: d.id }) || `${d.id}.geo.js`, text()); roomDirty = false; } catch (e) { status = "save failed: " + String(/** @type {any} */ (e)?.message ?? e); }
    panelDirty = true;
  }

  // ------------------------------------------------------------------ checks

  /** Problems with the shapes: crossing edges, walk-to points off the floor. */
  function problems() {
    const d = room(), out = [];
    if (!d) return [];
    const map = Cutaway.scene.walkMap;
    /** @param {Pt[]} p */
    const crosses = (p) => {
      const cr = (/** @type {Pt} */ a, /** @type {Pt} */ b, /** @type {Pt} */ c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      for (let i = 0; i < p.length; i++) for (let j = i + 2; j < p.length; j++) {
        if (i === 0 && j === p.length - 1) continue;
        const [a, b, c, e] = [p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]];
        if (cr(a, b, c) * cr(a, b, e) < 0 && cr(c, e, a) * cr(c, e, b) < 0) return true;
      }
      return false;
    };
    for (const it of items()) if (it.vertices && it.outline && crosses(it.outline)) out.push(`${it.label}: edges cross`);
    for (const [id, h] of Object.entries(d.hotspots ?? {})) {
      if (h.walkTo && map && !map.inside({ x: h.walkTo[0], y: h.walkTo[1] })) out.push(`${id}: walk-to [${h.walkTo}] is off the floor`);
    }
    return out;
  }

  // ------------------------------------------------------------------ drawing

  /** @param {CanvasRenderingContext2D} ctx @param {Pt} a @param {Pt} b */
  function line(ctx, a, b) {
    let x0 = Math.round(a.x), y0 = Math.round(a.y);
    const x1 = Math.round(b.x), y1 = Math.round(b.y);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 4000; n++) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** @param {CanvasRenderingContext2D} ctx @param {Pt} p @param {string} fill */
  function handle(ctx, p, fill) {
    const x = Math.round(p.x), y = Math.round(p.y);
    ctx.fillStyle = "#1a1426"; ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = fill; ctx.fillRect(x - 1, y - 1, 3, 3);
  }

  /** World overlay (inside the camera). @param {CanvasRenderingContext2D} ctx */
  function render(ctx) {
    if (!isOpen) return;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";               // dim the room a little so the lines read
    const cam = Cutaway.scene.camera;
    ctx.fillRect(cam.x, cam.y, Cutaway.display.width, Cutaway.display.height);
    for (const it of items()) {
      if (!show[it.group]) continue;
      const sel = it.key === selKey;
      ctx.fillStyle = sel ? "#ffffff" : it.color;
      if (it.outline) {
        const o = it.outline;
        for (let i = 0; i + 1 < o.length; i++) line(ctx, o[i], o[i + 1]);
        if (it.closed && o.length > 2) line(ctx, o[o.length - 1], o[0]);
      }
      if (it.group === "lamp") {                        // the reach circle, dotted
        const c = it.handles[0], r = Math.hypot(it.handles[1].x - c.x, it.handles[1].y - c.y);
        for (let i = 0; i < 64; i += 2) { const a = (i / 64) * Math.PI * 2; ctx.fillRect(Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r), 1, 1); }
      }
      it.handles.forEach((p, i) => {
        const isExtra = it.extra !== undefined && i >= it.extra;
        if (it.group === "hotspot" && isExtra) {         // walk-to: a cross, linked to its hotspot
          ctx.fillStyle = sel ? "#ffffff" : COLORS.walkTo;
          ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y), 7, 1); ctx.fillRect(Math.round(p.x), Math.round(p.y) - 3, 1, 7);
          if (sel) handle(ctx, p, i === selHandle ? "#ff3ad0" : COLORS.walkTo);
          return;
        }
        if (sel) handle(ctx, p, i === selHandle ? "#ff3ad0" : "#ffffff");
        else { ctx.fillStyle = it.color; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2); }
      });
    }
    if (drawing) {
      ctx.fillStyle = "#ffffff";
      const p = drawing.pts;
      for (let i = 0; i + 1 < p.length; i++) line(ctx, p[i], p[i + 1]);
      if (p.length) { ctx.fillStyle = "#ff3ad0"; line(ctx, p[p.length - 1], cursor); }
      for (const q of p) handle(ctx, q, "#ffffff");
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ the mouse

  /** @param {PointerEvent | MouseEvent} e @returns {Pt} */
  function worldOf(e) {
    const l = Cutaway.display.toLogical(e.clientX, e.clientY), w = Cutaway.scene.toWorld(l.x, l.y);
    return { x: w.x, y: w.y };
  }

  /** The handle nearest to a point, preferring the selected item. @param {Pt} p */
  function handleAt(p) {
    const list = items().filter((it) => show[it.group]).sort((a, b) => (b.key === selKey ? 1 : 0) - (a.key === selKey ? 1 : 0));
    for (const it of list) {
      for (let i = it.handles.length - 1; i >= 0; i--) {
        if (Math.hypot(it.handles[i].x - p.x, it.handles[i].y - p.y) <= GRAB) return { it, i };
      }
    }
    return null;
  }

  /** The smallest shape containing a point. @param {Pt} p */
  function shapeAt(p) {
    /** @param {Pt[]} o */
    const area = (o) => { let s = 0; for (let i = 0; i < o.length; i++) { const a = o[i], b = o[(i + 1) % o.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s / 2); };
    let best = null, bestA = Infinity;
    for (const it of items()) {
      if (!show[it.group] || !it.outline || !it.closed) continue;
      if (!Cutaway.walk.inPoly({ x: p.x + 0.5, y: p.y + 0.5 }, it.outline)) continue;
      const a = area(it.outline);
      if (a < bestA) { best = it; bestA = a; }
    }
    return best;
  }

  /** @param {string} key */
  function find(key) { return items().find((it) => it.key === key) ?? null; }

  /** @param {PointerEvent} e */
  function onDown(e) {
    if (e.target !== Cutaway.display.screen) return;
    e.stopPropagation(); e.preventDefault();
    const p = worldOf(e);
    if (active !== "room") { tabs.find((t) => t.id === active)?.pick?.(p, e.button); return; }
    if (drawing) {
      const first = drawing.pts[0];
      if (e.button === 2) { drawing = null; return; }
      if (first && drawing.pts.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) <= GRAB + 1) { finishDrawing(); return; }
      drawing.pts.push(p);
      return;
    }
    const h = handleAt(p);
    if (h && e.button === 2) {                          // right click a corner: remove it
      if (h.it.remove) { pushUndo(); if (h.it.remove(h.i)) changed(); else undoStack.pop(); }
      return;
    }
    if (h) { selKey = h.it.key; selHandle = h.i; drag = { key: h.it.key, handle: h.i, last: p, pushed: false }; panelDirty = true; return; }
    const s = shapeAt(p);
    if (s && e.button === 0) {
      if (s.key !== selKey) panelDirty = true;
      selKey = s.key; selHandle = -1;
      drag = { key: s.key, handle: -1, last: p, pushed: false };
      return;
    }
    selKey = null; selHandle = -1; panelDirty = true;
  }

  /** @param {PointerEvent} e */
  function onMove(e) {
    if (e.target !== Cutaway.display.screen && !drag) return;
    cursor = worldOf(e);
    if (!drag || active !== "room") return;
    e.stopPropagation();
    const it = find(drag.key);
    if (!it) { drag = null; return; }
    const dx = cursor.x - drag.last.x, dy = cursor.y - drag.last.y;
    if (!dx && !dy) return;
    if (!drag.pushed) { pushUndo(); drag.pushed = true; }
    if (drag.handle >= 0) it.move(drag.handle, cursor.x, cursor.y);
    else it.translate?.(dx, dy);
    drag.last = cursor;
    changed();
  }

  /** @param {PointerEvent} e */
  function onUp(e) {
    if (drag) { e.stopPropagation(); drag = null; }
  }

  /** Double-click on an edge of the selected polygon: a new corner there. @param {MouseEvent} e */
  function onDouble(e) {
    if (e.target !== Cutaway.display.screen) return;
    e.stopPropagation();
    if (active !== "room") return;
    if (drawing) { if (drawing.pts.length >= 3) finishDrawing(); return; }
    const it = selKey ? find(selKey) : null, p = worldOf(e);
    if (!it?.vertices || !it.outline || !it.insert) return;
    const o = it.outline;
    let best = -1, bestD = GRAB + 1.5;
    for (let i = 0; i < o.length; i++) {
      const a = o[i], b = o[(i + 1) % o.length], vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
      const t = len2 ? Cutaway.util.clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / len2, 0, 1) : 0;
      const d = Math.hypot(a.x + t * vx - p.x, a.y + t * vy - p.y);
      if (d < bestD) { best = i; bestD = d; }
    }
    if (best < 0) return;
    pushUndo();
    it.insert(best, p.x, p.y);
    selHandle = best + 1;
    changed();
  }

  /** @param {"walk" | "hole" | "hotspot"} group */
  function startDrawing(group) { drawing = { group, pts: [] }; selKey = null; status = "click the corners; click the first one again (or Enter) to close"; panelDirty = true; }

  function finishDrawing() {
    const d = room();
    if (!d || !drawing || drawing.pts.length < 3) { drawing = null; return; }
    pushUndo();
    const flat = drawing.pts.flatMap((p) => [p.x, p.y]);
    if (drawing.group === "walk") { d.walk = [...(d.walk ?? []), flat]; selKey = `walk:${d.walk.length - 1}`; }
    else if (drawing.group === "hole") { d.holes = [...(d.holes ?? []), flat]; selKey = `hole:${d.holes.length - 1}`; }
    else {
      const id = (prompt("Hotspot id (it needs a name, look and use in the room's logic):", "new_hotspot") ?? "").trim();
      if (!id) { undoStack.pop(); drawing = null; return; }
      d.hotspots = d.hotspots ?? {};
      d.hotspots[id] = { ...(d.hotspots[id] ?? { name: id }), poly: flat };
      delete d.hotspots[id].rect;
      selKey = `hot:${id}`;
    }
    drawing = null; status = "";
    changed();
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.code === "F10") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.code === "F1") {                               // the help, at the section for this tab; again: back
      e.preventDefault(); e.stopPropagation();
      if (active === "help") active = beforeHelp; else { beforeHelp = active; api.modules.help?.open(active); }
      panelDirty = true;
      return;
    }
    const tag = /** @type {any} */ (e.target)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (["F9", "F11"].includes(e.code)) return;            // the debug overlay and fullscreen still work
    e.stopPropagation();
    if (active !== "room") return;
    const it = selKey ? find(selKey) : null;
    if (e.code === "Escape") { if (drawing) drawing = null; else { selKey = null; selHandle = -1; } panelDirty = true; }
    else if (e.code === "Enter" && drawing) finishDrawing();
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") undoRedo(!e.shiftKey);
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") undoRedo(false);
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") { e.preventDefault(); save(); }
    else if ((e.code === "Delete" || e.code === "Backspace") && it) {
      if (selHandle >= 0 && it.remove) { pushUndo(); if (it.remove(selHandle)) { selHandle = -1; changed(); } else undoStack.pop(); }
      else if (it.group === "walk" || it.group === "hole") removeShape(it);
    } else if (it && e.code.startsWith("Arrow")) {
      const k = e.shiftKey ? 10 : 1, dx = e.code === "ArrowLeft" ? -k : e.code === "ArrowRight" ? k : 0, dy = e.code === "ArrowUp" ? -k : e.code === "ArrowDown" ? k : 0;
      pushUndo();
      if (selHandle >= 0) { const p = it.handles[selHandle]; it.move(selHandle, p.x + dx, p.y + dy); } else it.translate?.(dx, dy);
      changed();
    } else return;
    e.preventDefault();
  }

  /** @param {EditItem} it */
  function removeShape(it) {
    const d = room();
    if (!d) return;
    pushUndo();
    const i = Number(it.key.split(":")[1]);
    if (it.group === "walk") d.walk = (d.walk ?? []).filter((_a, k) => k !== i);
    else d.holes = (d.holes ?? []).filter((_a, k) => k !== i);
    selKey = null; selHandle = -1;
    changed();
  }

  // ------------------------------------------------------------------ the panel

  /** @param {string} tag @param {Record<string, any>} [props] @param {(Node | string)[]} [kids] */
  function el(tag, props = {}, kids = []) {
    const e = /** @type {any} */ (document.createElement(tag));
    for (const [k, v] of Object.entries(props)) {
      if (k === "style") Object.assign(e.style, v); else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e[k] = v;
    }
    for (const c of kids) e.append(c);
    return /** @type {HTMLElement} */ (e);
  }
  /** @param {string} label @param {() => void} fn @param {string} [title] */
  function button(label, fn, title = "") {
    return el("button", { textContent: label, title, onclick: fn, style: { margin: "2px", padding: "3px 7px", background: "#2c2540", color: "#eee", border: "1px solid #4a4066", borderRadius: "3px", cursor: "pointer", font: "inherit" } });
  }

  /** The panel: the title, the room, the studio, the tabs, then the active tab. */
  function buildPanel() {
    if (!panel) return;
    const d = room();
    panel.replaceChildren();
    const select = /** @type {HTMLSelectElement} */ (el("select", { style: { font: "inherit", background: "#2c2540", color: "#eee" }, onchange: () => openRoom(select.value) },
      Cutaway.room.ids().map((id) => el("option", { value: id, textContent: id, selected: id === d?.id }))));
    panel.append(
      el("div", { style: { fontWeight: "bold", color: "#ffe14a", marginBottom: "4px" } }, ["Cutaway editor"]),
      el("div", { style: { color: studio.available ? "#7a7" : "#c96", marginBottom: "4px" } }, [studio.available
        ? "studio: saves go into the game's folder" : "no studio: saves go through the browser. Start it with\nnode lib/cutaway/tools/studio.mjs"]),
      ...(unsaved().length ? [el("div", { style: { color: "#ff9a6a" } }, ["● not saved: " + unsaved().join(", ")])] : []),
      el("div", {}, ["room ", select, " ", button("Play", close, "close the editor and play (F10)"),
        button(win ? "Dock" : "Window", () => { wantWindow = !win; close(); open(); }, win ? "dock the editor beside the game" : "open the editor in a window of its own")]),
      el("div", { style: { margin: "6px 0", borderBottom: "1px solid #3a3350" } }, tabs.map((t) => el("button", { textContent: t.label, onclick: () => { active = t.id; panelDirty = true; },
        style: { margin: "0 2px -1px 0", padding: "3px 8px", font: "inherit", cursor: "pointer", color: t.id === active ? "#1a1426" : "#ddd",
          background: t.id === active ? "#ffe14a" : "#2c2540", border: "1px solid #4a4066", borderRadius: "3px 3px 0 0" } }))),
    );
    const box = el("div", {});
    panel.append(box);
    (tabs.find((t) => t.id === active) ?? tabs[0]).build(box);
    panel.append(el("div", { style: { marginTop: "6px", color: "#ffe14a", minHeight: "1em", whiteSpace: "pre-wrap" } }, [status]));
    panelDirty = false;
  }

  /** The Room tab: the room's shapes. @param {HTMLElement} panel */
  function buildRoom(panel) {
    const d = room();
    panel.append(
      el("div", { style: { margin: "6px 0" } }, [button("Save", save, "write rooms/<id>.geo.js (Ctrl+S)"), button("Copy", () => { navigator.clipboard?.writeText(text()); status = "copied"; panelDirty = true; }),
        button("Undo", () => undoRedo(true), "Ctrl+Z"), button("Redo", () => undoRedo(false), "Ctrl+Y")]),
      el("div", {}, [button("+ Walk area", () => startDrawing("walk")), button("+ Hole", () => startDrawing("hole")), button("+ Hotspot", () => startDrawing("hotspot"))]),
      el("div", { style: { margin: "6px 0" } }, Object.keys(show).map((g) => el("label", { style: { marginRight: "6px", color: /** @type {any} */ (COLORS)[g] } }, [
        el("input", { type: "checkbox", checked: show[g], onchange: (/** @type {Event} */ ev) => { show[g] = /** @type {HTMLInputElement} */ (ev.target).checked; } }), g]))),
    );
    const sel = selKey ? find(selKey) : null;
    if (sel) panel.append(selectedBox(sel));
    const list = el("div", { style: { marginTop: "6px", maxHeight: "34vh", overflow: "auto", borderTop: "1px solid #3a3350" } });
    for (const it of items()) {
      list.append(el("div", { textContent: it.label, onclick: () => { selKey = it.key; selHandle = -1; panelDirty = true; },
        style: { cursor: "pointer", padding: "1px 4px", color: it.key === selKey ? "#1a1426" : it.color, background: it.key === selKey ? it.color : "transparent" } }));
    }
    panel.append(list);
    const probs = problems();
    panel.append(el("div", { style: { marginTop: "6px", color: probs.length ? "#ff6a5a" : "#7a7" } }, [probs.length ? probs.join("\n") : "no problems"]));
    panel.append(el("div", { id: "cutaway-editor-cursor", style: { color: "#aaa" } }, [""]));
    panel.append(el("pre", { style: { color: "#888", whiteSpace: "pre-wrap", marginTop: "8px", font: "inherit" } }, [
      "click: select   drag: move\ndrag a corner   right click: delete it\ndouble-click an edge: new corner\narrows: nudge (Shift 10)   Del: delete\nCtrl+Z / Ctrl+Y: undo / redo\nF10: play   F9: debug overlay"]));
  }

  /** @param {EditItem} it */
  function selectedBox(it) {
    const d = room(), box = el("div", { style: { margin: "6px 0", padding: "4px", border: `1px solid ${it.color}` } }, [el("div", { style: { color: it.color } }, [it.label])]);
    if (!d) return box;
    if (it.group === "hotspot") {
      const id = it.key.slice(4), h = /** @type {HotspotDef} */ ((d.hotspots ?? {})[id]);
      const row = el("div", {});
      if (!h.poly) row.append(button("Make polygon", () => {
        pushUndo();
        const o = it.outline;
        if (o) { h.poly = o.flatMap((p) => [p.x, p.y]); delete h.rect; }
        changed();
      }));
      row.append(button(h.walkTo ? "Walk-to: reset" : "Add walk-to", () => {
        pushUndo();
        const o = it.outline ?? [{ x: 160, y: 150 }], xs = o.map((p) => p.x), bottom = Math.max(...o.map((p) => p.y));
        const n = Cutaway.scene.walkMap?.nearest({ x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: bottom + 4 });
        h.walkTo = n ? [Math.round(n.x), Math.round(n.y)] : [160, 150];
        changed();
      }));
      const face = /** @type {HTMLSelectElement} */ (el("select", { style: { font: "inherit", background: "#2c2540", color: "#eee" }, onchange: () => {
        pushUndo();
        if (face.value) h.face = /** @type {Facing} */ (face.value); else delete h.face;
        changed();
      } }, ["", "left", "right", "up", "down"].map((f) => el("option", { value: f, textContent: f || "face: any", selected: (h.face ?? "") === f }))));
      row.append(face);
      box.append(row);
      if (h.walkTo) box.append(el("div", {}, [`walk-to ${h.walkTo.join(", ")}`]));
    }
    if (it.outline && it.vertices) box.append(el("div", { style: { color: "#aaa", wordBreak: "break-all" } }, [it.outline.map((p) => `${p.x},${p.y}`).join("  ")]));
    if (it.group === "walk" || it.group === "hole") box.append(button("Delete shape", () => removeShape(it)));
    return box;
  }

  /** @param {string} id */
  async function openRoom(id) {
    if (Cutaway.scene.room?.id !== id) await Cutaway.scene.load(id, { enter: false });
    selKey = null; selHandle = -1; drawing = null; undoStack = []; redoStack = [];
    for (const t of tabs) t.onRoom?.();
    panelDirty = true;
  }

  const listeners = /** @type {[string, (e: any) => void][]} */ ([
    ["pointerdown", onDown], ["pointermove", onMove], ["pointerup", onUp], ["dblclick", onDouble], ["keydown", onKey],
    ["contextmenu", (/** @type {Event} */ e) => { if (e.target === Cutaway.display.screen) e.preventDefault(); }],
  ]);

  /** Load the tab modules next to this file (once). */
  async function loadModules() {
    if (modulesLoaded) return;
    modulesLoaded = true;
    for (const m of MODULES) {
      await new Promise((resolve) => {
        const sc = document.createElement("script");
        sc.src = Cutaway.base + m;
        sc.onload = resolve;
        sc.onerror = () => { console.warn("Cutaway editor: no module " + m); resolve(undefined); };
        document.head.append(sc);
      });
    }
    panelDirty = true;
  }

  /** The editor's own window, if the browser lets one open. @returns {Window | null} */
  function popup() {
    /** @type {Window | null} */
    let w = null;
    try { w = window.open("", "cutaway-editor", "width=600,height=940"); } catch { w = null; }
    if (!w) return null;
    try { void w.document.body; } catch { try { w.close(); } catch { /* gone */ } return null; }   // left from before a reload
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Cutaway editor</title></head><body style="margin:0;background:#16121f"></body></html>');
    w.document.close();
    return w;
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    studio.connect().then(() => { panelDirty = true; });
    loadModules();
    win = wantWindow ? popup() : null;
    panel = /** @type {HTMLDivElement} */ (el("div", { className: "cutaway-editor", style: {
      ...(win ? { minHeight: "100vh" } : { position: "fixed", right: "0", top: "0", width: `${PANEL}px`, height: "100vh", overflow: "auto", zIndex: "10", borderLeft: "1px solid #3a3350" }),
      boxSizing: "border-box", padding: "8px", background: "#16121f", color: "#ddd", font: "12px/1.35 Consolas, Menlo, monospace", whiteSpace: "pre-line" } }));
    if (win) {
      const w = win;
      w.document.body.append(panel);
      w.addEventListener("keydown", onKey, true);
      w.addEventListener("pagehide", () => { if (win === w) { win = null; close(); } });
      pollTimer = window.setInterval(() => { if (win === w && w.closed) { win = null; close(); } }, 500);
      w.focus();
    } else {
      document.body.append(panel);
      Cutaway.display.reserve(PANEL);
    }
    Cutaway.ui.setVisible(false);
    Cutaway.display.screen.style.cursor = "crosshair";
    for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
    panelDirty = true;
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    drawing = null; drag = null;
    panel?.remove(); panel = null;
    clearInterval(pollTimer);
    if (win && !win.closed) { const w = win; win = null; w.close(); }
    Cutaway.display.reserve(0);
    Cutaway.ui.setVisible(true);
    Cutaway.display.screen.style.cursor = "none";
    for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
  }

  tabs.push({ id: "room", label: "Room", build: buildRoom });
  // the game page goes (a reload): its editor window goes with it; unsaved changes ask first
  window.addEventListener("pagehide", () => { if (win && !win.closed) win.close(); });
  window.addEventListener("beforeunload", (e) => { if (unsaved().length) { e.preventDefault(); e.returnValue = ""; } });
  Cutaway.events.on("scene.drawn", (/** @type {CanvasRenderingContext2D} */ ctx) => {
    if (!isOpen) return;
    if (active === "room") render(ctx); else tabs.find((t) => t.id === active)?.render?.(ctx);
  });
  Cutaway.clock.onRender(() => {
    if (!isOpen || !panel) return;
    if (panelDirty) buildPanel();
    const c = panel.ownerDocument.getElementById("cutaway-editor-cursor");
    if (c) c.textContent = `cursor ${cursor.x}, ${cursor.y}${drawing ? `   ${drawing.group}: ${drawing.pts.length} corners` : ""}`;
  });
  Cutaway.events.on("room.entered", () => { panelDirty = true; });

  const api = {
    open, close, text, geometry, items, problems, save, openRoom, studio, saveFile, download, el, button, fmt, unsaved,
    /** What the tab modules share with each other and the tests. @type {Record<string, any>} */
    modules: {},
    get isOpen() { return isOpen; },
    /** The editor's own window, or null when docked. */
    get window() { return win; },
    /** Open docked (false) or in a window of its own (true) from now on. @param {boolean} v */
    useWindow(v) { wantWindow = v; },
    /** Add a tab (the modules do). @param {EditorTab} t */
    tab(t) { const i = tabs.findIndex((x) => x.id === t.id); if (i >= 0) tabs[i] = t; else tabs.push(t); panelDirty = true; },
    /** Show a tab. @param {string} id */
    show(id) { active = id; panelDirty = true; },
    get activeTab() { return active; },
    /** Rebuild the panel (a tab after its data changed). */
    refresh() { panelDirty = true; },
    /** The status line. @param {string} s */
    setStatus(s) { status = s; panelDirty = true; },
    /** Select a shape by key (tools, tests). @param {string | null} key */
    select(key) { selKey = key; selHandle = -1; panelDirty = true; },
    get selected() { return selKey; },
    /** Start drawing a new shape (tools, tests). @param {"walk" | "hole" | "hotspot"} group */
    draw: startDrawing,
  };
  return api;
})();
