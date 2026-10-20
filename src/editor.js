// Cutaway.js editor, in the running game. Open it with F10 or `?edit` (the engine loads this file on
// demand; games don't list it). Its workspaces (tabs): Room (this file: the shapes), and the modules it
// loads next to it: Texts, Things, Art (+ Paint: the pixel editor), Sound, Dialogue, State, Issues,
// Checks, Help (editor-*.js; the guide is docs/editor.md). It edits the live game data, so changes can
// be tried at once (F10 closes it and plays).
// The layout (docked in the game's page): a menu bar on top (File Edit View Room Art Play Tools Help),
// the workspaces and a browser (rooms, the room's things, sprites) on the left, the inspector (the
// active tab's panel) on the right, a status bar (and an output pane) at the bottom; the game picture
// fits into the centre (Cutaway.display.reserve), unless a workspace puts a view of its own there (the
// paint view). View > "Inspector in its own window" moves the inspector into an about:blank popup the
// game page builds and drives (same origin, so it works from file://).
// While it is open the game is paused (Play > Pause game, Ctrl+P): the clock is held (Cutaway.clock.held,
// apart from the menus' `paused`), and so is the sound, except in the Sound and Voices tabs, where you
// listen. Play > Step runs it on by 100 ms; the Play menu also plays sequences (from a shot mark too),
// with the game running for them.
// It saves layer files the game loads after its own code:
// with the studio (tools/studio.mjs) straight into the game's folder, else through the browser's file
// picker or as a download. The Room tab saves the shapes as `rooms/<id>.geo.js` (Cutaway.room.geometry),
// and warns when the game's page doesn't load that file.
//   walk areas and holes      drag corners, double-click an edge for a new corner, Delete removes one
//   hotspots                  polygons or rects (drag corners); their walk-to point (the cross)
//   props                     drag the place handle (the prop moves: `at`), the cyan baseline handle up or down
//   lamps                     drag the source, or the handle on the reach circle
//   effect areas              like polygons (haze, dust, rain), points (drips, steam, sparkles)
// Click a shape to select it, drag inside it to move it, arrows nudge (Shift: 10 px), Ctrl+Z / Ctrl+Y
// undo and redo. "+ Walk area" / "+ Hole" / "+ Hotspot": click the corners, then click the first
// corner again or press Enter (Esc cancels). The camera pans in a room bigger than the screen: the middle
// button, the wheel (Shift: across), the arrows when nothing is selected.
// The shapes are drawn over the whole picture (after the fade and the letterbox: frame.ui), so a black
// screen doesn't hide them.
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
 * @property {number} [extra]       index of the first handle that isn't a corner (walk-to, lamp reach, a prop's place)
 * @property {boolean} [pick]       false: a click inside the outline doesn't pick it (a prop's box: its handles do)
 * @property {Pt[]} [line]          a line drawn with it (a prop's baseline)
 */

/**
 * An item of a menu in the menu bar.
 * @typedef {object} MenuItem
 * @property {string} [label]
 * @property {string} [key]          its shortcut, shown right-aligned (the keys themselves are handled elsewhere)
 * @property {() => void} [run]
 * @property {boolean} [enabled]     default true; false greys it out
 * @property {boolean} [checked]     a check item (shown with a tick when true)
 * @property {boolean} [sep]         a separator line
 * @property {string} [head]         a heading line (not clickable)
 * @property {string} [title]        the tooltip
 */

/**
 * Something that takes over the centre while its workspace is active (the paint view): the game
 * picture hides behind it. Edit > Undo / Redo / Delete / Select none go to it first.
 * @typedef {object} EditorView
 * @property {HTMLElement} el
 * @property {(e: KeyboardEvent) => boolean} [key]   a key pressed (not in a text field); true: handled
 * @property {() => void} [undo]
 * @property {() => void} [redo]
 * @property {() => void} [del]
 * @property {() => void} [selectNone]
 * @property {() => void} [shown]                    it was put into the centre (it may measure itself)
 */

/**
 * An editor workspace (Room is built in; modules add theirs with Cutaway.editor.tab).
 * @typedef {object} EditorTab
 * @property {string} id
 * @property {string} label
 * @property {(box: HTMLElement) => void} build       fill the inspector (again when the tab asks: refresh)
 * @property {(ctx: CanvasRenderingContext2D) => void} [render]  draw over the room (room pixels)
 * @property {(p: Pt, button: number) => void} [pick] a click on the room picture (room pixels)
 * @property {() => void} [onRoom]                    another room was opened
 * @property {(all?: boolean) => any} [save]          File > Save, Ctrl+S (all: File > Save all, everything it has)
 * @property {() => void} [undo]                      Edit > Undo, Ctrl+Z
 * @property {() => void} [redo]                      Edit > Redo, Ctrl+Y
 * @property {() => void} [del]                       Edit > Delete
 * @property {() => void} [selectNone]                Edit > Select none, Esc
 * @property {(e: KeyboardEvent) => boolean} [key]    a key while it is active (not in a text field); true: handled
 * @property {() => Record<string, MenuItem[]>} [menu] its items in the menu bar, by menu title ("Art": [...])
 * @property {number | boolean | string} [unsaved]    what isn't saved (a getter; else its module's `unsaved`)
 * @property {() => EditorView | null} [view]         while it returns a view, that view takes the centre
 * @property {(box: HTMLElement) => void} [browse]    its part of the left panel's browser (else the room's things)
 */

/**
 * A row of a list (Cutaway.editor.list).
 * @typedef {object} ListItem
 * @property {string} key
 * @property {string} label
 * @property {string} [group]     the group it is in (groups fold)
 * @property {string} [title]     the tooltip (default: the key)
 * @property {string} [color]
 * @property {string} [mark]      a mark after the label ("●" not saved, "✓" done)
 * @property {boolean} [dim]
 */
/**
 * @typedef {object} ListOptions
 * @property {string} id                    keeps its folds, cursor, filter and scroll (and the focus) across rebuilds
 * @property {ListItem[]} items             in order; groups show where their first item is
 * @property {string} [selected]
 * @property {(key: string) => void} pick   a row picked (a click, or the cursor moved onto it with the keys)
 * @property {(key: string) => void} [open] Enter or a double click (default: pick)
 * @property {boolean | string} [filter]    a filter field above it (a string: its placeholder)
 * @property {string} [height]              a scroll box this high at most (CSS); else it grows (the left panel scrolls)
 * @property {number} [foldOver]            groups with more items start folded (all of them in a list five times as long)
 * @property {string} [empty]               what shows when there is nothing
 * @property {string} [title]
 * @property {(e: KeyboardEvent) => boolean} [keys]  keys of its own, before the list's (true: handled)
 */

Cutaway.editor = (function () {
  const GRAB = 2.5, MENU_H = 24, STATUS_H = 22, LEFT_W = 200, RIGHT_W = 360, OUT_H = 170;
  const MODULES = ["editor-texts.js", "editor-script.js", "editor-things.js", "editor-art.js", "editor-paint.js", "editor-sound.js", "editor-voices.js", "editor-dialogue.js", "editor-state.js",
    "editor-issues.js", "editor-checks.js", "editor-help.js", "editor-guide.js"];
  const COLORS = { walk: "#3df27a", hole: "#ff4a5a", hotspot: "#ffa03a", prop: "#3ae8ff", lamp: "#fff27a", fx: "#6aa8ff", walkTo: "#ffe14a" };
  let isOpen = false, showHud = false;
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
  /** @type {HTMLDivElement | null} the inspector: the active tab's panel */
  let panel = null;
  /** @type {Window | null} the inspector's own window (null: docked beside the game) */
  let win = null;
  /** @type {{left: boolean, right: boolean, output: boolean, window: boolean}} what is shown (kept in localStorage) */
  const layout = { left: true, right: true, output: false, window: false };
  try { Object.assign(layout, JSON.parse(localStorage.getItem("cutaway.editor.layout") ?? "{}")); } catch { /* none kept */ }
  let wantWindow = layout.window, pollTimer = 0, raf = 0;
  let status = "", panelDirty = true, outputDirty = true;
  /** @type {string[]} the output pane: status messages and task output */
  const log = [];
  /** @type {string | null} a view's own cursor text for the status bar (the paint view: the pixel) */
  let cursorText = null;
  /** @type {EditorTab[]} */
  const tabs = [];
  let active = "room", modulesLoaded = false, beforeHelp = "room";
  /** @type {Set<string>} rooms whose shapes changed since they were saved */
  const dirtyRooms = new Set();
  /** @type {WeakSet<PropDef>} props moved in the editor (their place goes into the shapes file) */
  const movedProps = new WeakSet();
  /** the game is paused (the editor holds the clock); `audioHeld`: the sound is held too */
  let holding = false, audioHeld = false, panned = false;
  /** @type {{x: number, y: number, cam: Pt} | null} the camera dragged with the middle button */
  let panDrag = null;
  /** @type {string | null} the room the editor knows (another one comes: its undo goes) */
  let knownRoom = null;
  /** Tabs where you listen: the sound isn't held there. */
  const LISTEN = ["sound", "voices"];

  /** What a tab has unsaved: its own `unsaved`, else its module's. @param {EditorTab} t */
  function unsavedOf(t) { return "unsaved" in t ? t.unsaved : /** @type {Record<string, any>} */ (api.modules)[t.id]?.unsaved; }

  /** What isn't saved yet, per tab ("Room", "Texts 3", ...). */
  function unsaved() {
    const out = [];
    for (const t of tabs) {
      const n = unsavedOf(t);
      if (n) out.push(t.label + (typeof n === "number" ? ` ${n}` : ""));
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
    /** @type {Promise<boolean> | null} */
    let connecting = null;
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
      /** Connect (once; the modules may ask again). @returns {Promise<boolean>} */
      connect() {
        connecting ??= (async () => {
          if (!token || location.protocol === "file:") return false;
          try { cfg = await (await call("config")).json(); } catch { cfg = null; }
          return !!cfg;
        })();
        return connecting;
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
      /** Remove a file (only where the studio may write: an import that is reverted). @param {string} path */
      async remove(path) { await call("remove?path=" + enc(path), { method: "DELETE" }); },
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
      // its place handle shows where it is drawn (shifted by its depth); a baseline of its own moves along
      const b = p.baseline ?? p.at[1], cx = box[0] + Math.floor(box[2] / 2), sh = Cutaway.scene.parallax(p);
      /** @param {number} dx @param {number} dy */
      const shift = (dx, dy) => {
        p.at = [p.at[0] + dx, p.at[1] + dy];
        if (p.baseline) p.baseline += dy;
        movedProps.add(p);
      };
      out.push({ key: `prop:${p.id}`, group: "prop", label: `${p.id} at ${p.at.join(", ")} baseline ${b}`, color: COLORS.prop,
        handles: [{ x: cx, y: b }, { x: p.at[0] + sh.x, y: p.at[1] + sh.y }], extra: 1, outline: rectPts(...box), closed: true, pick: false,
        line: [{ x: box[0], y: b }, { x: box[0] + box[2], y: b }],
        move(i, x, y) { if (i === 0) p.baseline = y; else shift(x - (p.at[0] + sh.x), y - (p.at[1] + sh.y)); },
        translate: shift });
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

  /**
   * A room's shapes as a geometry object (default: the current room's). A prop's place goes in when it
   * was moved here, or the file as saved has it (`prev`); `all`: every prop's (undo).
   * @param {Room | null} [d] @param {{all?: boolean, prev?: RoomGeometry | null}} [o]
   * @returns {RoomGeometry}
   */
  function geometry(d = room(), o = {}) {
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
    for (const p of d.props ?? []) {
      if (!p.id) continue;
      const at = o.all || movedProps.has(p) || !!o.prev?.props?.[p.id]?.at;
      if (at || p.baseline !== undefined) ps[p.id] = { ...(at ? { at: p.at } : {}), ...(p.baseline !== undefined ? { baseline: p.baseline } : {}) };
    }
    if (Object.keys(ps).length) g.props = ps;
    /** @type {NonNullable<RoomGeometry["lamps"]>} */
    const ls = {};
    // a lamp without an id goes by its place in the list (as effects do)
    (d.light?.lamps ?? []).forEach((l, i) => { ls[l.id ?? String(i)] = { at: l.at, r: l.r }; });
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

  /** The geometry file for a room (default: the current one). @param {string} [id] @param {RoomGeometry | null} [prev] the file as saved */
  function text(id, prev) {
    const d = id ? Cutaway.room.get(id) : room();
    if (!d) return "";
    return `// Shapes of the room "${d.id}": walk areas, holes, hotspots, props' places and baselines, lamps, effect areas.\n` +
      `// Made with the Cutaway.js room editor (F10 or ?edit); the room's logic is in ${d.id}.js.\n"use strict";\n\n` +
      `Cutaway.room.geometry(${JSON.stringify(d.id)}, ${fmt(geometry(d, { prev }))});\n`;
  }

  /**
   * What a room's shapes file says now (the studio reads it; or the engine kept it), so a prop's place
   * saved before stays in it.
   * @param {string} id @param {string} path @returns {Promise<RoomGeometry | null>}
   */
  async function savedGeometry(id, path) {
    if (studio.available) {
      try {
        const src = await studio.read(path);
        /** @type {RoomGeometry | null} */
        let g = null;
        new Function("Cutaway", src)({ room: { geometry: (/** @type {string} */ _id, /** @type {RoomGeometry} */ x) => { g = x; } } });
        return g;
      } catch { /* not saved yet */ }
    }
    return /** @type {any} */ (Cutaway.room).geometryOf?.(id) ?? null;
  }

  /** A path relative to a page's folder ("game/rooms/a.geo.js" from "demo/index.html": "../game/rooms/a.geo.js"). @param {string} page @param {string} path */
  function relTo(page, path) {
    const a = page.split("/").slice(0, -1), b = path.split("/");
    let i = 0;
    while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
    return "../".repeat(a.length - i) + b.slice(i).join("/");
  }

  /**
   * Does the game's page load a layer file? A warning if not (what is saved there would be lost on the
   * next reload), else "". With the studio it reads the page; without, it looks at the scripts loaded.
   * @param {string} path  where it was saved (in the game's folder)
   */
  async function notLoaded(path) {
    const name = path.split("/").pop() ?? path;
    if (studio.available && studio.config?.page) {
      const page = String(studio.config.page), base = new URL("/" + page, location.origin), file = new URL("/" + path, location.origin).href;
      let html = "";
      try { html = await studio.read(page); } catch { return ""; }
      const doc = new DOMParser().parseFromString(html, "text/html");
      if ([...doc.querySelectorAll("script[src]")].some((s) => new URL(s.getAttribute("src") ?? "", base).href === file)) return "";
      return `WARNING: ${page} doesn't load ${path}, so after a reload the game won't have what was saved there. ` +
        `Add <script src="${relTo(page, path)}"></script> to ${page}, after the room's own script.`;
    }
    if ([...document.scripts].some((s) => (s.getAttribute("src") ?? "").split("?")[0].split("/").pop() === name)) return "";
    return `WARNING: the page loads no ${name}, so after a reload the game won't have what was saved. ` +
      `Put the file in the game's rooms folder and add <script src=".../${name}"></script> to its index.html, after the room's own script.`;
  }

  /** @param {RoomGeometry} g */
  function restore(g) {
    const d = room();
    if (!d) return;
    // straight into the room's data, not through Cutaway.room.geometry: what the room's file gave stays the engine's
    if (g.walk) d.walk = g.walk;
    if (g.holes) d.holes = g.holes;
    for (const [k, h] of Object.entries(d.hotspots ?? {})) {
      const v = g.hotspots?.[k];
      if (!v && !h.poly && !h.rect && !h.walkTo) continue;
      delete h.poly; delete h.rect; delete h.walkTo;
      if (v) { delete h.face; Object.assign(h, v); }
    }
    for (const [k, v] of Object.entries(g.props ?? {})) { const p = d.props?.find((q) => q.id === k); if (p) Object.assign(p, v); }
    (d.light?.lamps ?? []).forEach((l, i) => { const v = g.lamps?.[l.id ?? String(i)]; if (v) Object.assign(l, v); });
    (d.fx ?? []).forEach((f, i) => { const v = g.fx?.[f.id ?? String(i)]; if (v) Object.assign(f, v); });
    Cutaway.scene.refresh();
  }

  function pushUndo() {
    const d = room();
    if (d) dirtyRooms.add(d.id);
    undoStack.push(JSON.stringify(geometry(d, { all: true })));
    if (undoStack.length > 200) undoStack.shift();
    redoStack = [];
  }
  /** @param {boolean} back */
  function undoRedo(back) {
    const from = back ? undoStack : redoStack, to = back ? redoStack : undoStack, s = from.pop();
    if (!s) return;
    to.push(JSON.stringify(geometry(room(), { all: true })));
    restore(JSON.parse(s));
    changed();
  }

  function changed() { Cutaway.scene.refresh(); panelDirty = true; }

  /** Save the shapes: the current room's, and any other room changed since it was saved. */
  async function save() {
    const ids = [...new Set([...(room() ? [/** @type {Room} */ (room()).id] : []), ...dirtyRooms])], out = [];
    let warned = false;
    for (const id of ids) {
      const path = studio.layer("room", { id }) || `${id}.geo.js`;
      try {
        const msg = await saveFile(path, text(id, await savedGeometry(id, path)));
        out.push(msg);
        if (msg === "not saved") continue;
        dirtyRooms.delete(id);
        const warn = await notLoaded(path);
        if (warn) { out.push(warn); warned = true; }
      } catch (e) { out.push(`${id}: save failed: ` + String(/** @type {any} */ (e)?.message ?? e)); }
    }
    if (warned) setLayout("output", true);
    setStatus(out.join("\n"));
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

  /** @param {CanvasRenderingContext2D} ctx @param {Pt} a @param {Pt} b @param {boolean} [dotted] */
  function line(ctx, a, b, dotted = false) {
    let x0 = Math.round(a.x), y0 = Math.round(a.y);
    const x1 = Math.round(b.x), y1 = Math.round(b.y);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 4000; n++) {
      if (!dotted || n % 2 === 0) ctx.fillRect(x0, y0, 1, 1);
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
      if (it.outline) {                                  // a prop's box is dotted: its handles move it, not a click inside
        const o = it.outline, dot = it.pick === false;
        for (let i = 0; i + 1 < o.length; i++) line(ctx, o[i], o[i + 1], dot);
        if (it.closed && o.length > 2) line(ctx, o[o.length - 1], o[0], dot);
      }
      if (it.line) line(ctx, it.line[0], it.line[1]);
      if (it.group === "lamp") {                        // the reach circle, dotted
        const c = it.handles[0], r = Math.hypot(it.handles[1].x - c.x, it.handles[1].y - c.y);
        for (let i = 0; i < 64; i += 2) { const a = (i / 64) * Math.PI * 2; ctx.fillRect(Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r), 1, 1); }
      }
      it.handles.forEach((p, i) => {
        const isExtra = it.extra !== undefined && i >= it.extra;
        if (it.group === "prop" && isExtra) {            // a prop's place: a diamond
          const x = Math.round(p.x), y = Math.round(p.y);
          ctx.fillStyle = sel ? (i === selHandle ? "#ff3ad0" : "#ffffff") : it.color;
          ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5); ctx.fillRect(x - 1, y - 1, 3, 3);
          return;
        }
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
      if (!show[it.group] || !it.outline || !it.closed || it.pick === false) continue;
      if (!Cutaway.walk.inPoly({ x: p.x + 0.5, y: p.y + 0.5 }, it.outline)) continue;
      const a = area(it.outline);
      if (a < bestA) { best = it; bestA = a; }
    }
    return best;
  }

  /** @param {string} key */
  function find(key) { return items().find((it) => it.key === key) ?? null; }

  // ------------------------------------------------------------------ the camera
  // A room bigger than the screen: the editor moves the camera (the scene's scripted camera, kept inside
  // the room); it is given back to the one playing when the editor closes.

  /** Move the camera by room pixels; true if it moved. @param {number} dx @param {number} dy */
  function pan(dx, dy) {
    const c = Cutaway.scene.camera, x = c.x, y = c.y;
    Cutaway.scene.cameraTo(x + dx, y + dy, { ms: 0 });
    panned = true;
    return c.x !== x || c.y !== y;
  }

  /** The wheel over the picture pans (Shift, or a room only as high as the screen: across). @param {WheelEvent} e */
  function onWheel(e) {
    if (e.target !== Cutaway.display.screen || e.ctrlKey) return;
    e.preventDefault(); e.stopPropagation();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 160 : 0.25;
    /** @param {number} d */
    const px = (d) => (d ? Math.sign(d) * Math.max(1, Math.round(Math.abs(d * k))) : 0);
    const across = px(e.shiftKey ? e.deltaY || e.deltaX : e.deltaX), down = e.shiftKey ? 0 : px(e.deltaY);
    if (!pan(across, down) && down && !across) pan(down, 0);
  }

  /** @param {PointerEvent} e */
  function onDown(e) {
    if (menuOutside(e) && e.target === Cutaway.display.screen) { e.stopPropagation(); e.preventDefault(); return; }
    if (e.target !== Cutaway.display.screen) return;
    e.stopPropagation(); e.preventDefault();
    if (e.button === 1) { const c = Cutaway.scene.camera; panDrag = { x: e.clientX, y: e.clientY, cam: { x: c.x, y: c.y } }; return; }
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
    if (panDrag) {
      e.stopPropagation();
      const a = Cutaway.display.toLogical(panDrag.x, panDrag.y), b = Cutaway.display.toLogical(e.clientX, e.clientY);
      Cutaway.scene.cameraTo(panDrag.cam.x - (b.x - a.x), panDrag.cam.y - (b.y - a.y), { ms: 0 });
      panned = true;
      return;
    }
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
    if (panDrag) { e.stopPropagation(); panDrag = null; }
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
  function startDrawing(group) { active = "room"; drawing = { group, pts: [] }; selKey = null; setStatus("click the corners; click the first one again (or Enter) to close"); }

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
    const mod = e.ctrlKey || e.metaKey;
    if (menuBox && e.code === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
    if (e.code === "F10") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.code === "F1") {                               // the help, at the section for this tab; again: back
      e.preventDefault(); e.stopPropagation();
      if (active === "help") active = beforeHelp; else { beforeHelp = active; api.modules.help?.open(active); }
      panelDirty = true;
      return;
    }
    if (mod && e.code === "KeyS") { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) saveAll(); else saveActive(); return; }   // in text fields too
    if ((mod && e.code === "KeyP") || e.code === "Pause") { e.preventDefault(); e.stopPropagation(); setHold(!holding); return; }       // not the browser's print
    if (isField(e.target)) return;                          // the field's own keys (they don't reach the game: guard)
    if (["F9", "F11"].includes(e.code)) return;            // the debug overlay and fullscreen still work
    e.stopPropagation();
    if (e.code === "F8") { e.preventDefault(); step(); return; }
    const lst = /** @type {any} */ (e.target)?.closest?.(".cw-lst"), ctl = lst ? listOf.get(lst) : null;
    if (ctl?.key(e)) { e.preventDefault(); return; }       // a list has the keyboard: it moves, folds, opens
    if (mod && e.code === "KeyZ") { e.preventDefault(); route(e.shiftKey ? "redo" : "undo"); return; }
    if (mod && e.code === "KeyY") { e.preventDefault(); route("redo"); return; }
    const v = currentView(), t = activeTab();
    if (v?.key?.(e) || t.key?.(e)) { e.preventDefault(); return; }
    if (e.code === "Escape") { route("selectNone"); return; }
    if (e.code === "Delete" || e.code === "Backspace") { if (route("del")) e.preventDefault(); return; }
    // the arrows pan the camera over the picture (in Room: while nothing is selected; else they nudge)
    if (e.code.startsWith("Arrow") && !v && !(active === "room" && (selKey || drawing))) {
      const k = e.shiftKey ? 40 : 8;
      pan(e.code === "ArrowLeft" ? -k : e.code === "ArrowRight" ? k : 0, e.code === "ArrowUp" ? -k : e.code === "ArrowDown" ? k : 0);
      e.preventDefault();
      return;
    }
    if (active !== "room") return;
    const it = selKey ? find(selKey) : null;
    if (e.code === "Enter" && drawing) finishDrawing();
    else if (it && e.code.startsWith("Arrow")) {
      const k = e.shiftKey ? 10 : 1, dx = e.code === "ArrowLeft" ? -k : e.code === "ArrowRight" ? k : 0, dy = e.code === "ArrowUp" ? -k : e.code === "ArrowDown" ? k : 0;
      pushUndo();
      if (selHandle >= 0) { const p = it.handles[selHandle]; it.move(selHandle, p.x + dx, p.y + dy); } else it.translate?.(dx, dy);
      changed();
    } else return;
    e.preventDefault();
  }

  /** Is this a text field (its keys are its own)? @param {any} t */
  function isField(t) { const tag = t?.tagName; return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || !!t?.isContentEditable; }

  /**
   * Keys typed in the editor's fields go to the field, never on to the game (its keys listen on the
   * window, after the document): Esc would open the pause menu, Space skip a line. The editor's own
   * capture listener lets them through to the field and its handlers first.
   * @param {Event} e
   */
  function guard(e) { if (isField(e.target)) e.stopPropagation(); }

  // ------------------------------------------------------------------ pausing the game

  /** Hold the game (the clock; the sound too, outside the tabs where you listen) or let it run. @param {boolean} on */
  function setHold(on) {
    holding = on;
    Cutaway.clock.held = on;
    syncAudio();
    panelDirty = true;
    setStatus(on ? "the game is paused (Ctrl+P runs it; F8 steps)" : "the game runs");
  }
  /** The sound is held while the game is, except in Sound and Voices. */
  function syncAudio() {
    const want = isOpen && holding && !LISTEN.includes(active);
    if (want !== audioHeld) { audioHeld = want; Cutaway.audio.hold(want); }
  }
  /** Run the paused game on by 100 ms (Play > Step, F8). */
  function step() { Cutaway.clock.advance(100); }

  /**
   * Play a sequence in the game (from a shot mark: what comes before hurries): the game runs for it,
   * then is paused again if it was.
   * @param {string} id @param {string} [from]
   */
  async function playSequence(id, from) {
    if (Cutaway.sequence.playing()) { setStatus(`"${Cutaway.sequence.playing()}" is playing: Play > Stop sequence first`); return; }
    const was = holding;
    if (was) setHold(false);
    setStatus(`playing the sequence "${id}"${from ? ` from the shot "${from}"` : ""} (Play > Stop sequence ends it)`);
    try { await Cutaway.sequence.play(id, from ? { from } : {}); } catch (e) { setStatus(errText(e)); }
    if (was && isOpen && !holding) setHold(true);
  }

  /** Delete in the Room tab: the selected corner, else the selected walk area or hole. */
  function deleteSelected() {
    const it = selKey ? find(selKey) : null;
    if (!it) return;
    if (selHandle >= 0 && it.remove) { pushUndo(); if (it.remove(selHandle)) { selHandle = -1; changed(); } else undoStack.pop(); }
    else if (it.group === "walk" || it.group === "hole") removeShape(it);
  }

  /** Esc in the Room tab: stop drawing, else clear the selection. */
  function roomSelectNone() { if (drawing) drawing = null; else { selKey = null; selHandle = -1; } panelDirty = true; }

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

  // ------------------------------------------------------------------ the layout

  // one style sheet for the whole editor (in the game's page and in the inspector's own window)
  const CSS = `
.cw-ed { position: fixed; left: 0; top: 0; right: 0; bottom: 0; pointer-events: none; z-index: 10; }
.cw-ed, .cutaway-editor, .cw-menu { font: 12px/1.35 Consolas, Menlo, monospace; color: #ddd; }
.cw-ed > div { pointer-events: auto; position: absolute; box-sizing: border-box; }
.cw-ed *, .cutaway-editor * { scrollbar-width: thin; scrollbar-color: #4a4066 #16121f; }
.cw-bar { left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 1px; padding: 0 4px; background: #1c1729;
  border-bottom: 1px solid #3a3350; white-space: nowrap; user-select: none; overflow: hidden; }
.cw-bar .brand { color: #ffe14a; font-weight: bold; padding: 0 10px 0 4px; }
.cw-bar .m { padding: 2px 8px; border-radius: 3px; cursor: default; }
.cw-bar .m:hover, .cw-bar .m.open { background: #2c2540; color: #ffe14a; }
.cw-bar .sp { flex: 1; }
.cw-bar .right { display: flex; align-items: center; gap: 6px; }
.cw-bar select { padding: 0 2px; }
.cw-bar button { padding: 0 8px; margin: 0; }
.cw-left { left: 0; background: #16121f; border-right: 1px solid #3a3350; overflow: auto; padding: 2px 0 12px; user-select: none; }
.cw-left .hd { color: #8a84a0; padding: 8px 8px 2px; font-size: 11px; letter-spacing: 1px; }
.cw-left .row { padding: 1px 8px 1px 14px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cw-left .row:hover { background: #221c30; color: #ffe14a; }
.cw-left .row.on { background: #2c2540; color: #ffe14a; border-left: 2px solid #ffe14a; padding-left: 12px; }
.cw-left .ws { padding-left: 8px; }
.cw-left .ws.on { padding-left: 6px; }
.cw-left .sub { color: #6c6484; padding: 4px 8px 0 10px; font-size: 11px; }
.cw-left .dot, .cw-dirty { color: #ff9a6a; }
.cutaway-editor { background: #16121f; white-space: pre-line; }
.cw-ed > .cutaway-editor { right: 0; border-left: 1px solid #3a3350; overflow: auto; padding: 0 8px 16px; }
.cw-pop .cutaway-editor { min-height: 100vh; box-sizing: border-box; padding: 0 8px 16px; }
.cw-title { position: sticky; top: 0; z-index: 1; background: #16121f; color: #ffe14a; font-weight: bold; padding: 6px 0 4px;
  margin-bottom: 4px; border-bottom: 1px solid #3a3350; display: flex; gap: 8px; align-items: baseline; }
.cw-title .cw-dirty { font-weight: normal; }
.cw-status { left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 14px; padding: 0 8px; background: #1c1729;
  border-top: 1px solid #3a3350; white-space: nowrap; overflow: hidden; user-select: none; }
.cw-status .msg { color: #ffe14a; overflow: hidden; text-overflow: ellipsis; cursor: pointer; min-width: 0; flex: 0 1 auto; }
.cw-status .sp { flex: 1; }
.cw-status .ok { color: #7c7; }
.cw-status .no { color: #c96; }
.cw-status button { padding: 0 6px; margin: 0; }
.cw-out { background: #100d18; border-top: 1px solid #3a3350; overflow: auto; padding: 4px 8px; white-space: pre-wrap; color: #ccc; }
.cw-out .e { border-bottom: 1px solid #221c30; padding: 2px 0; }
.cw-centre { background: #0e0b14; overflow: hidden; }
.cw-menu { position: fixed; z-index: 30; min-width: 230px; max-height: calc(100vh - 40px); overflow: auto; background: #221c30;
  border: 1px solid #4a4066; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5); padding: 3px 0; user-select: none; }
.cw-menu .it { display: flex; gap: 28px; padding: 3px 12px 3px 24px; position: relative; white-space: nowrap; cursor: default; }
.cw-menu .it:hover { background: #ffe14a; color: #1a1426; }
.cw-menu .it .k { margin-left: auto; color: #8a84a0; }
.cw-menu .it:hover .k { color: #1a1426; }
.cw-menu .it.off, .cw-menu .it.off:hover { color: #5c5470; background: none; }
.cw-menu .it.off .k { color: #4a4460; }
.cw-menu .it.on::before { content: "✓"; position: absolute; left: 8px; }
.cw-menu .sep { border-top: 1px solid #3a3350; margin: 3px 0; }
.cw-menu .hd { color: #8a84a0; padding: 3px 12px; font-size: 11px; }
.cw-ed button, .cutaway-editor button { margin: 2px; padding: 2px 7px; background: #2c2540; color: #eee; border: 1px solid #4a4066;
  border-radius: 3px; cursor: pointer; font: inherit; }
.cw-ed button:hover, .cutaway-editor button:hover { border-color: #ffe14a; }
.cw-ed button.on, .cutaway-editor button.on { background: #ffe14a; color: #1a1426; border-color: #ffe14a; }
.cw-ed button:disabled, .cutaway-editor button:disabled { opacity: 0.45; cursor: default; border-color: #4a4066; }
.cw-ed input, .cw-ed select, .cw-ed textarea, .cutaway-editor input, .cutaway-editor select, .cutaway-editor textarea {
  font: inherit; background: #221c30; color: #eee; border: 1px solid #4a4066; }
.cw-ed input[type=checkbox], .cutaway-editor input[type=checkbox] { vertical-align: middle; accent-color: #ffe14a; margin: 0 3px 0 0; }
.cw-ed input[type=color], .cutaway-editor input[type=color] { padding: 0; width: 28px; height: 20px; vertical-align: middle; }
.cutaway-editor .cw-sec { margin-top: 8px; border-top: 1px solid #3a3350; padding-top: 4px; }
.cutaway-editor .cw-h { color: #ffe14a; }
.cw-dim { color: #8a84a0; }
.cutaway-editor .cw-list { width: 100%; background: #1c1729; color: #ddd; border: 1px solid #3a3350; }
.cutaway-editor .cw-sw { display: inline-block; width: 15px; height: 15px; border: 1px solid rgba(0, 0, 0, 0.5); margin: 1px; cursor: pointer; vertical-align: middle; box-sizing: border-box; }
.cutaway-editor .cw-sw:hover { outline: 1px solid #ffe14a; }
.cutaway-editor .cw-sw.t, .cutaway-editor .cw-big.t { background: repeating-conic-gradient(#555 0 25%, #888 0 50%) 0 0 / 8px 8px; }
.cutaway-editor .cw-big { display: inline-block; width: 34px; height: 34px; border: 2px solid #4a4066; vertical-align: middle; margin-right: 4px; box-sizing: border-box; }
.cutaway-editor .cw-pals { white-space: normal; line-height: 0; margin: 2px 0 4px; }
.cw-lst { outline: none; user-select: none; white-space: nowrap; }
.cw-lst.box { overflow: auto; background: #1c1729; border: 1px solid #3a3350; }
.cw-lst:focus { box-shadow: inset 0 0 0 1px #6a5a9a; }
.cw-lst .row { padding: 1px 8px 1px 14px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; }
.cw-lst .row.in { padding-left: 22px; }
.cw-lst .row:hover { background: #221c30; color: #ffe14a; }
.cw-lst .row.on { background: #2c2540; color: #ffe14a; border-left: 2px solid #ffe14a; padding-left: 12px; }
.cw-lst .row.in.on { padding-left: 20px; }
.cw-lst .row.dim { color: #6c6484; }
.cw-lst:focus .cur { outline: 1px dotted #a89cc8; outline-offset: -1px; }
.cw-lst .row .mk { color: #ff9a6a; margin-left: 6px; }
.cw-lst .gh { padding: 2px 6px; color: #9a92b4; cursor: pointer; overflow: hidden; text-overflow: ellipsis; }
.cw-lst .gh:hover { color: #ffe14a; }
.cw-lst .gh .n, .cw-fold .n { color: #5c5470; margin-left: 6px; }
.cw-lsf { width: 100%; box-sizing: border-box; margin: 2px 0; }
.cw-left .cw-lsw { padding: 0 6px 0 4px; }
.cw-ed .cw-fold, .cutaway-editor .cw-fold { display: block; width: 100%; text-align: left; margin: 2px 0 0; padding: 2px 4px; background: none; border: none;
  border-bottom: 1px solid #2a2340; border-radius: 0; color: #c8c0e0; }
.cw-ed .cw-fold:hover, .cutaway-editor .cw-fold:hover, .cw-ed .cw-fold:focus, .cutaway-editor .cw-fold:focus { color: #ffe14a; outline: none; border-color: #4a4066; }
.cw-left .cw-fold { color: #8a84a0; font-size: 11px; letter-spacing: 1px; padding: 8px 8px 2px; border: none; }
.cw-foldb { padding-left: 6px; }
`;

  /** @type {HTMLDivElement | null} */ let root = null;
  /** @type {HTMLElement | null} */ let barEl = null;
  /** @type {HTMLElement | null} */ let barRight = null;
  /** @type {HTMLElement | null} */ let leftEl = null;
  /** @type {HTMLElement | null} */ let statusEl = null;
  /** @type {HTMLElement | null} */ let outputEl = null;
  /** @type {HTMLElement | null} */ let centreEl = null;
  /** @type {HTMLElement | null} the open dropdown */ let menuBox = null;
  let menuOpen = "";
  /** @type {EditorView | null} the view in the centre now */ let mounted = null;
  /** @type {Record<string, HTMLElement>} */ const statusParts = {};

  /** The style sheet, once per document. @param {Document} doc */
  function ensureCss(doc) {
    if (doc.getElementById("cw-editor-css")) return;
    const st = doc.createElement("style");
    st.id = "cw-editor-css"; st.textContent = CSS;
    doc.head.append(st);
  }

  /** @param {string} tag @param {Record<string, any>} [props] @param {(Node | string)[]} [kids] */
  function el(tag, props = {}, kids = []) {
    const e = /** @type {any} */ (document.createElement(tag));
    for (const [k, v] of Object.entries(props)) {
      if (k === "style") Object.assign(e.style, v); else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e[k] = v;
    }
    for (const c of kids) e.append(c);
    return /** @type {HTMLElement} */ (e);
  }
  /** A button in the editor's style (the style sheet). @param {string} label @param {() => void} fn @param {string} [title] */
  function button(label, fn, title = "") {
    return el("button", { textContent: label, title, onclick: fn });
  }

  function activeTab() { return tabs.find((t) => t.id === active) ?? tabs[0]; }
  /** The active workspace's view in the centre, if it has one now. */
  function currentView() { return isOpen ? activeTab()?.view?.() ?? null : null; }

  /** Edit > Undo, Redo, Delete, Select none: to the view in the centre first, else the active tab. @param {"undo" | "redo" | "del" | "selectNone"} name */
  function route(name) {
    const v = currentView(), f = v?.[name] ?? activeTab()[name];
    if (!f) return false;
    f(); panelDirty = true;
    return true;
  }
  /** @param {"undo" | "redo" | "del" | "selectNone"} name */
  const canRoute = (name) => !!(currentView()?.[name] ?? activeTab()[name]);

  /** @param {any} e */
  const errText = (e) => String(e?.message ?? e);

  /** File > Save (Ctrl+S): the active workspace's save. */
  async function saveActive() {
    const t = activeTab();
    if (!t.save) { setStatus(`${t.label}: nothing to save here`); return; }
    try { await t.save(false); } catch (e) { setStatus("save failed: " + errText(e)); }
    panelDirty = true;
  }

  /** File > Save all (Ctrl+Shift+S): every tab with unsaved work that can save. */
  async function saveAll() {
    const done = [];
    for (const t of tabs) {
      if (!t.save || !unsavedOf(t)) continue;
      try { await t.save(true); done.push(t.label); } catch (e) { done.push(`${t.label} FAILED (${errText(e)})`); }
    }
    setStatus(done.length ? "saved: " + done.join(", ") : "nothing to save");
  }

  /**
   * Run one of the game's tasks (studio.json) with its output in the output pane.
   * @param {string} task @returns {Promise<{code: number, output: string}>}
   */
  async function runTask(task) {
    if (!studio.available) { setStatus("the tasks run in the studio (tools/studio.mjs)"); return { code: -1, output: "" }; }
    setLayout("output", true);
    setStatus(`${task} ...`);
    try {
      const r = await studio.run(task);
      output(`$ ${task}\n${r.output.trim() || "(no output)"}`);
      setStatus(`${task}: ${r.code === 0 ? "done" : "FAILED (exit " + r.code + ")"}`);
      return r;
    } catch (e) {
      setStatus(`${task}: ${errText(e)}`);
      return { code: -1, output: errText(e) };
    }
  }

  /** The status line; it also goes into the output pane (whole, when it has several lines). @param {string} s */
  function setStatus(s) {
    status = s;
    if (s) output(s);
    panelDirty = true;
  }

  /** Add to the output pane. @param {string} s */
  function output(s) {
    log.push(s);
    if (log.length > 200) log.splice(0, log.length - 200);
    outputDirty = true;
  }

  /** Show or hide a part of the layout. @param {"left" | "right" | "output"} part @param {boolean} [on] */
  function setLayout(part, on) {
    layout[part] = on ?? !layout[part];
    keepLayout();
    place();
  }
  function keepLayout() { try { localStorage.setItem("cutaway.editor.layout", JSON.stringify(layout)); } catch { /* private mode */ } }

  /** Size the parts and keep their room free in the display (the picture fits into the centre). */
  function place() {
    if (!root) return;
    const L = layout.left ? LEFT_W : 0, R = layout.right && !win ? RIGHT_W : 0, O = layout.output ? OUT_H : 0;
    /** @param {HTMLElement | null} e @param {Record<string, string>} st */
    const at = (e, st) => { if (e) Object.assign(e.style, st); };
    at(barEl, { height: MENU_H + "px" });
    at(leftEl, { display: L ? "" : "none", top: MENU_H + "px", bottom: STATUS_H + "px", width: L + "px" });
    if (!win) at(panel, { display: R ? "" : "none", top: MENU_H + "px", bottom: STATUS_H + "px", width: R + "px" });
    at(outputEl, { display: O ? "" : "none", left: L + "px", right: R + "px", bottom: STATUS_H + "px", height: O + "px" });
    at(centreEl, { left: L + "px", right: R + "px", top: MENU_H + "px", bottom: STATUS_H + O + "px" });
    at(statusEl, { height: STATUS_H + "px" });
    Cutaway.display.reserve({ left: L, top: MENU_H, right: R, bottom: STATUS_H + O });
    mounted?.shown?.();
  }

  /** Show a workspace. @param {string} id */
  function showTab(id) { if (id !== "help") beforeHelp = id; active = id; panelDirty = true; }

  // ------------------------------------------------------------------ the menus

  /** The menu bar's menus, made when one opens (so they show the state now). @returns {[string, MenuItem[]][]} */
  function menus() {
    const t = activeTab(), d = room(), mods = /** @type {Record<string, any>} */ (api.modules);
    /** @type {Record<string, MenuItem[]>} */
    const ext = {};
    for (const tab of tabs) {
      if (!tab.menu) continue;
      try { for (const [k, list] of Object.entries(tab.menu())) (ext[k] ??= []).push(...list); } catch (e) { console.warn(e); }
    }
    const tasks = Object.keys(studio.config?.tasks ?? {});
    /** @param {() => void} fn */
    const inRoom = (fn) => () => { showTab("room"); fn(); };
    const acts = Cutaway.act.ids();
    /** @type {[string, MenuItem[]][]} */
    const list = [
      ["File", [
        { label: `Save (${t.label})`, key: "Ctrl+S", run: saveActive, enabled: !!t.save },
        { label: "Save all", key: "Ctrl+Shift+S", run: saveAll, enabled: unsaved().length > 0 },
        { sep: true },
        { label: "Reload game", run: () => location.reload(), title: "load the game's files again (the editor opens again with ?edit or the studio)" },
        { label: "Close editor and play", key: "F10", run: close },
      ]],
      ["Edit", [
        { label: "Undo", key: "Ctrl+Z", run: () => route("undo"), enabled: canRoute("undo") },
        { label: "Redo", key: "Ctrl+Y", run: () => route("redo"), enabled: canRoute("redo") },
        { sep: true },
        { label: "Delete", key: "Del", run: () => route("del"), enabled: canRoute("del") },
        { label: "Select none", key: "Esc", run: () => route("selectNone"), enabled: canRoute("selectNone") },
      ]],
      ["View", [
        { label: "Debug overlay", key: "F9", checked: Cutaway.debug.on, run: () => Cutaway.debug.toggle() },
        { label: "Game interface", checked: showHud, run: () => { showHud = !showHud; Cutaway.ui.setHud(showHud); } },
        { sep: true }, { head: "Room shapes" },
        ...Object.keys(show).map((g) => ({ label: g, checked: show[g], run: () => { show[g] = !show[g]; panelDirty = true; } })),
        { sep: true },
        { label: "Left panel", checked: layout.left, run: () => setLayout("left") },
        { label: "Inspector", checked: layout.right, run: () => setLayout("right"), enabled: !win },
        { label: "Output", checked: layout.output, run: () => setLayout("output") },
        { label: "Inspector in its own window", checked: !!win, run: () => { wantWindow = !win; layout.window = wantWindow; keepLayout(); close(); open(); } },
        { label: "Fullscreen", key: "F11", run: () => Cutaway.display.toggleFullscreen() },
      ]],
      ["Room", [
        { head: "Open" },
        ...Cutaway.room.ids().map((id) => ({ label: id, checked: id === d?.id, run: () => { openRoom(id); } })),
        { sep: true },
        { label: "+ Walk area", run: inRoom(() => startDrawing("walk")), enabled: !!d },
        { label: "+ Hole", run: inRoom(() => startDrawing("hole")), enabled: !!d },
        { label: "+ Hotspot", run: inRoom(() => startDrawing("hotspot")), enabled: !!d },
        { sep: true },
        { label: "Save the shapes", run: () => { save(); }, enabled: !!d, title: "rooms/<id>.geo.js" },
      ]],
      ["Art", []],
      ["Play", [
        { label: "Pause game", key: "Ctrl+P", checked: holding, run: () => setHold(!holding), title: "hold the game's clock and sound while you edit (on when the editor opens)" },
        { label: "Step (100 ms)", key: "F8", run: step, enabled: holding, title: "run the paused game on a little" },
        { label: "Play from here", key: "F10", run: close },
        ...(Cutaway.sequence.ids().length ? [{ sep: true }, { head: "Sequences (the game runs for them)" },
          { label: "Stop sequence", run: () => Cutaway.sequence.skip(), enabled: !!Cutaway.sequence.playing(), title: "as Esc in the game: its steps stop, `after` runs" },
          { label: "Next shot", run: () => Cutaway.sequence.next(), enabled: !!Cutaway.sequence.playing(), title: "as Space in the game: on to the next shot mark" },
          ...Cutaway.sequence.ids().flatMap((id) => [
            { label: `▶ ${id}`, checked: Cutaway.sequence.playing() === id, run: () => { playSequence(id); }, enabled: !Cutaway.sequence.playing() },
            ...Cutaway.sequence.shots(id).map((s) => ({ label: `    from "${s}"`, run: () => { playSequence(id, s); }, enabled: !Cutaway.sequence.playing(), title: `play ${id} from its shot mark "${s}"` }))])] : []),
        ...(acts.length ? [{ sep: true }, { head: "Begin an act (a new game)" },
          ...acts.map((id) => ({ label: id, checked: Cutaway.acts.current === id, run: () => mods.state?.beginAct(id), enabled: !!mods.state }))] : []),
        { sep: true },
        { label: "Test dialogue", run: () => { if (mods.dialogue) mods.dialogue.test(); else showTab("dialogue"); }, enabled: Cutaway.dialog.ids().length > 0,
          title: "close the editor and start the dialogue picked in the Dialogue tab" },
      ]],
      ["Tools", [
        ...(tasks.length ? [{ head: "Tasks (studio.json)" }, ...tasks.map((k) => ({ label: k, run: () => { runTask(k); }, title: (studio.config.tasks[k] ?? []).join(" ") }))]
          : [{ label: studio.available ? "no tasks in studio.json" : "tasks: start the studio", enabled: false }]),
        { sep: true },
        { label: "Issues", run: () => { showTab("issues"); mods.issues?.check(); }, title: "check the game as it is now" },
        { label: "Checks", run: () => showTab("checks") },
        { label: "State (the developer's menu)", run: () => showTab("state") },
      ]],
      ["Help", [
        { label: "Editor guide", key: "F1", run: () => mods.help?.open(active === "help" ? beforeHelp : active) },
        { label: "Reference", run: () => mods.help?.open(undefined, "reference") },
        { label: "Keys", run: () => mods.help?.open(undefined, "editor", "keys") },
      ]],
    ];
    for (const [title, items] of list) {
      const more = ext[title] ?? [];
      if (more.length && items.length) items.push({ sep: true });
      items.push(...more);
      if (!items.length) items.push({ label: "(nothing here yet)", enabled: false });
    }
    return list;
  }

  /** Open a menu under its title. @param {string} title */
  function openMenu(title) {
    closeMenu();
    if (!barEl) return;
    const def = menus().find((m) => m[0] === title), head = /** @type {HTMLElement | null} */ (barEl.querySelector(`[data-menu="${title}"]`));
    if (!def || !head) return;
    const box = el("div", { className: "cw-menu" });
    for (const it of def[1]) {
      if (it.sep) { box.append(el("div", { className: "sep" })); continue; }
      if (it.head) { box.append(el("div", { className: "hd", textContent: it.head })); continue; }
      const off = it.enabled === false;
      const row = el("div", { className: "it" + (off ? " off" : "") + (it.checked ? " on" : ""), title: it.title ?? "" },
        [el("span", { textContent: it.label ?? "" }), el("span", { className: "k", textContent: it.key ?? "" })]);
      if (!off) row.addEventListener("click", (e) => { e.stopPropagation(); closeMenu(); it.run?.(); panelDirty = true; });
      box.append(row);
    }
    const r = head.getBoundingClientRect();
    box.style.left = Math.max(0, Math.min(r.left, window.innerWidth - 250)) + "px"; box.style.top = r.bottom + "px";
    document.body.append(box);
    menuBox = box; menuOpen = title;
    head.classList.add("open");
  }

  function closeMenu() {
    menuBox?.remove(); menuBox = null; menuOpen = "";
    barEl?.querySelectorAll(".m.open").forEach((m) => m.classList.remove("open"));
  }

  /** A press anywhere outside the open menu closes it (and does nothing else). @param {PointerEvent} e */
  function menuOutside(e) {
    if (!menuBox) return false;
    const t = /** @type {Node} */ (e.target);
    if (menuBox.contains(t) || barEl?.contains(t)) return false;
    closeMenu();
    return true;
  }

  // ------------------------------------------------------------------ lists and folds
  // Every long list in the editor is one of these: keys move through it (arrows, Home, End, Page up and
  // down, letters jump to a name, Enter opens, Left and Right fold a group, + and - all of them, / the
  // filter), its groups fold (kept across sessions), and it keeps its place, its scroll and the focus
  // when the panel is built again (which happens after every change).

  /** @type {Map<string, {cursor: string, sel: string | undefined, filter: string, scroll: number, reveal: boolean, typed: string, typedAt: number}>} */
  const lists = new Map();
  /** @type {Record<string, Record<string, boolean>>} per list, its groups folded (true) or open (false); "~": the folds */
  let folds = {};
  try { folds = JSON.parse(localStorage.getItem("cutaway.editor.folds") ?? "{}"); } catch { /* none kept */ }
  function keepFolds() { try { localStorage.setItem("cutaway.editor.folds", JSON.stringify(folds)); } catch { /* private mode */ } }
  /** @type {WeakMap<Element, {key: (e: KeyboardEvent) => boolean, reveal: () => void, st: {scroll: number, reveal: boolean}}>} */
  const listOf = new WeakMap();

  /**
   * A list to pick from: the left panel's browsers and the inspector's lists.
   * @param {ListOptions} o
   */
  function list(o) {
    const st = lists.get(o.id) ?? { cursor: o.selected ?? "", sel: o.selected, filter: "", scroll: 0, reveal: false, typed: "", typedAt: 0 };
    lists.set(o.id, st);
    if (o.selected !== st.sel) { st.sel = o.selected; if (o.selected) st.cursor = o.selected; }
    /** @type {string[]} */
    const order = [];
    /** @type {Map<string, ListItem[]>} */
    const byGroup = new Map();
    for (const it of o.items) {
      const g = it.group ?? "";
      if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g); }
      /** @type {ListItem[]} */ (byGroup.get(g)).push(it);
    }
    const fl = (folds[o.id] ??= {});
    /** @param {string} g */
    const folded = (g) => g !== "" && (fl[g] ?? (o.foldOver !== undefined && ((byGroup.get(g)?.length ?? 0) > o.foldOver || o.items.length > 5 * o.foldOver)));
    const box = el("div", { className: "cw-lst" + (o.height ? " box" : ""), tabIndex: 0, style: o.height ? { maxHeight: o.height } : {},
      title: o.title ?? "", onscroll: () => { st.scroll = box.scrollTop; } });
    box.dataset.id = o.id;
    box.setAttribute("role", "listbox");
    /** @type {string[]} the rows as shown: item keys, "g:" + group for headers */
    let shown = [];
    /** @param {ListItem} it */
    const matches = (it) => { const q = st.filter.trim().toLowerCase(); return !q || `${it.label} ${it.key} ${it.group ?? ""}`.toLowerCase().includes(q); };

    function render() {
      const filtering = !!st.filter.trim();
      /** @type {(Node)[]} */
      const rows = [];
      shown = [];
      for (const g of order) {
        const its = /** @type {ListItem[]} */ (byGroup.get(g)).filter(matches);
        if (!its.length) continue;
        const shut = !filtering && folded(g);
        if (g) {
          const k = "g:" + g;
          shown.push(k);
          const h = el("div", { className: "gh" + (k === st.cursor ? " cur" : ""), title: "fold or unfold (Left, Right; + and - fold all)",
            onclick: () => { st.cursor = k; toggle(g); } }, [(shut ? "▸ " : "▾ ") + g, el("span", { className: "n", textContent: String(its.length) })]);
          h.dataset.key = k;
          rows.push(h);
        }
        if (shut) continue;
        for (const it of its) {
          shown.push(it.key);
          const on = it.key === o.selected;
          const r = el("div", { className: "row" + (g ? " in" : "") + (on ? " on" : "") + (it.key === st.cursor ? " cur" : "") + (it.dim ? " dim" : ""),
            title: it.title ?? it.key, onclick: () => { st.cursor = it.key; choose(it.key); }, ondblclick: () => o.open?.(it.key) },
          [it.label, ...(it.mark ? [el("span", { className: "mk", textContent: it.mark })] : [])]);
          if (it.color && !on) r.style.color = it.color;
          r.dataset.key = it.key;
          r.setAttribute("role", "option");
          r.setAttribute("aria-selected", String(on));
          rows.push(r);
        }
      }
      if (!shown.length) rows.push(el("div", { className: "cw-dim", style: { padding: "1px 8px" }, textContent: filtering ? "nothing matches" : o.empty ?? "(none)" }));
      box.replaceChildren(...rows);
    }
    /** @param {string} k */
    function choose(k) { st.sel = k; o.pick(k); render(); }
    /** @param {string} g @param {boolean} [shut] */
    function toggle(g, shut) { fl[g] = shut ?? !folded(g); keepFolds(); render(); }
    function reveal() {
      byData(box, "key", st.cursor)?.scrollIntoView({ block: "nearest" });
    }
    /** Move the cursor to a row (an item is picked as the cursor gets there). @param {number} j */
    function go(j) {
      if (!shown.length) return;
      const k = shown[Cutaway.util.clamp(j, 0, shown.length - 1)];
      st.cursor = k; st.reveal = true;
      if (k.startsWith("g:")) render(); else choose(k);
      reveal();
    }
    /** @param {KeyboardEvent} e @returns {boolean} handled */
    function key(e) {
      if (o.keys?.(e)) return true;
      if (e.ctrlKey || e.metaKey) return false;
      const i = shown.indexOf(st.cursor), head = st.cursor.startsWith("g:") ? st.cursor.slice(2) : null;
      const page = Math.max(1, Math.floor((o.height ? box.clientHeight : 320) / 17) - 1);
      switch (e.key) {
        case "ArrowDown": go(i < 0 ? 0 : i + 1); return true;
        case "ArrowUp": go(i < 0 ? 0 : i - 1); return true;
        case "Home": go(0); return true;
        case "End": go(shown.length - 1); return true;
        case "PageDown": go(i + page); return true;
        case "PageUp": go(i - page); return true;
        case "ArrowLeft": {
          if (head !== null) { if (!folded(head)) toggle(head, true); return true; }
          const g = o.items.find((x) => x.key === st.cursor)?.group;
          if (g) { st.cursor = "g:" + g; render(); reveal(); }
          return true;
        }
        case "ArrowRight":
          if (head !== null) { if (folded(head)) toggle(head, false); else go(i + 1); }
          return true;
        case "Enter":
          if (head !== null) toggle(head);
          else if (st.cursor) (o.open ?? choose)(st.cursor);
          return true;
        case "+": case "*": for (const g of order) if (g) fl[g] = false; keepFolds(); render(); return true;
        case "-": for (const g of order) if (g) fl[g] = true; keepFolds(); if (!head) { const g = o.items.find((x) => x.key === st.cursor)?.group; if (g) st.cursor = "g:" + g; } render(); return true;
        case "/": if (filterEl) { filterEl.focus(); filterEl.select(); return true; } return false;
        case "Escape": if (st.filter) { st.filter = ""; if (filterEl) filterEl.value = ""; render(); return true; } return false;
      }
      if (e.key === " " && !st.typed) { if (head !== null) toggle(head); else if (st.cursor) choose(st.cursor); return true; }
      if (e.key.length !== 1 || e.altKey) return false;
      // type-ahead: the next name that starts with what was typed (folded groups open for it)
      const now = Date.now();
      st.typed = (now - st.typedAt < 800 ? st.typed : "") + e.key.toLowerCase(); st.typedAt = now;
      const all = o.items.filter(matches), from = Math.max(0, all.findIndex((x) => x.key === st.cursor)) + (st.typed.length === 1 ? 1 : 0);
      const turn = [...all.slice(from), ...all.slice(0, from)];
      const hit = turn.find((x) => x.label.toLowerCase().startsWith(st.typed)) ?? turn.find((x) => x.label.toLowerCase().includes(st.typed));
      if (hit) {
        if (hit.group && folded(hit.group)) { fl[hit.group] = false; keepFolds(); }
        st.cursor = hit.key; st.reveal = true; choose(hit.key); reveal();
      }
      return true;
    }
    /** @type {HTMLInputElement | null} */
    let filterEl = null;
    if (o.filter) {
      const f = /** @type {HTMLInputElement} */ (el("input", { type: "search", className: "cw-lsf", placeholder: typeof o.filter === "string" ? o.filter : "filter  ( / )", value: st.filter,
        oninput: () => { st.filter = f.value; render(); },
        onkeydown: (/** @type {KeyboardEvent} */ e) => {
          if (e.key === "ArrowDown" || e.key === "Enter") {
            e.preventDefault();
            const first = shown.find((k) => !k.startsWith("g:"));
            if (e.key === "Enter" && first) { st.cursor = first; (o.open ?? choose)(first); return; }
            box.focus();
            if (!shown.includes(st.cursor) && shown.length) go(0);
          } else if (e.key === "Escape" && f.value) { e.preventDefault(); e.stopPropagation(); f.value = st.filter = ""; render(); }
        } }));
      f.dataset.list = o.id;
      filterEl = f;
    }
    render();
    listOf.set(box, { key, reveal, st });
    return el("div", { className: "cw-lsw" }, [...(filterEl ? [filterEl] : []), box]);
  }

  /**
   * A heading that folds what is under it (kept across sessions); the content is only made while open.
   * @param {string} id @param {string} title @param {(() => (Node | string)[]) | (Node | string)[]} content
   * @param {{folded?: boolean, open?: boolean, note?: string, title?: string}} [o]  folded: how it starts; open: open now
   *   whatever was kept (a search shows what it found); note: a count after the title
   */
  function fold(id, title, content, o = {}) {
    const f = (folds["~"] ??= {});
    let shut = o.open ? false : f[id] ?? !!o.folded;
    const body = el("div", { className: "cw-foldb" });
    const head = el("button", { className: "cw-fold", title: o.title ?? "fold or unfold", onclick: () => { shut = !shut; f[id] = shut; keepFolds(); show(); } });
    head.dataset.fold = id;
    // it opens and closes in place (in a view in the centre too, which isn't built again with the panels)
    const show = () => {
      head.replaceChildren((shut ? "▸ " : "▾ ") + title, ...(o.note ? [el("span", { className: "n", textContent: o.note })] : []));
      body.replaceChildren(...(shut ? [] : typeof content === "function" ? content() : content));
      body.style.display = shut ? "none" : "";
    };
    show();
    return el("div", {}, [head, body]);
  }

  /**
   * Group names by their first part (up to the first "_"): "robby_idle_r" in "robby"; a part only one
   * name has goes to "other".
   * @param {string[]} names @returns {(name: string) => string}
   */
  function prefixGroups(names) {
    const part = (/** @type {string} */ n) => n.replace(/^_+/, "").split("_")[0] || n;
    /** @type {Record<string, number>} */
    const count = {};
    for (const n of names) count[part(n)] = (count[part(n)] ?? 0) + 1;
    return (n) => (count[part(n)] > 1 ? part(n) : "other");
  }

  /** The element under a root whose data-<name> is a value. @param {ParentNode} root @param {string} name @param {string} v */
  function byData(root, name, v) {
    return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(`[data-${name}]`)]).find((e) => e.dataset[name] === v) ?? null;
  }

  /** The documents the editor's parts are in (the game's page, the inspector's own window). */
  function docs() { return win && !win.closed ? [document, win.document] : [document]; }

  /** Where the keyboard is, if in a list or its filter (to give it back after a rebuild). */
  function focusedList() {
    for (const doc of docs()) {
      const a = /** @type {any} */ (doc.activeElement);
      const l = a?.closest?.(".cw-lst");
      if (l) return { id: String(l.dataset.id), filter: false };
      if (a?.classList?.contains("cw-lsf")) return { id: String(a.dataset.list), filter: true };
      if (a?.dataset?.fold) return { id: "fold:" + a.dataset.fold, filter: false };
    }
    return null;
  }

  /** After the panels were built again: lists get their scroll, the focus and the cursor in view back. @param {{id: string, filter: boolean} | null} f */
  function afterBuild(f) {
    for (const doc of docs()) {
      for (const b of /** @type {NodeListOf<HTMLElement>} */ (doc.querySelectorAll(".cw-lst"))) {
        const ctl = listOf.get(b);
        if (!ctl) continue;
        if (ctl.st.scroll) b.scrollTop = ctl.st.scroll;
        if (f && f.id === b.dataset.id) {
          const inp = /** @type {HTMLInputElement | null} */ (f.filter ? b.parentElement?.querySelector(".cw-lsf") ?? null : null);
          if (inp) { inp.focus({ preventScroll: true }); inp.setSelectionRange(inp.value.length, inp.value.length); } else b.focus({ preventScroll: true });
        }
        if (ctl.st.reveal) { ctl.st.reveal = false; ctl.reveal(); }
      }
      if (f?.id.startsWith("fold:")) byData(doc, "fold", f.id.slice(5))?.focus({ preventScroll: true });
    }
  }

  // ------------------------------------------------------------------ the parts

  /** The menu bar: Cutaway, the menus; on the right the room, Play and the studio. */
  function buildBar() {
    if (!barEl) return;
    barEl.replaceChildren(el("span", { className: "brand", textContent: "Cutaway" }));
    for (const [title] of menus()) {
      const m = el("span", { className: "m", textContent: title,
        onpointerdown: (/** @type {PointerEvent} */ e) => { e.stopPropagation(); if (menuOpen === title) closeMenu(); else openMenu(title); },
        onpointerenter: () => { if (menuOpen && menuOpen !== title) openMenu(title); } });
      m.dataset.menu = title;
      barEl.append(m);
    }
    barRight = el("span", { className: "right" });
    barEl.append(el("span", { className: "sp" }), barRight);
  }

  /** The right of the menu bar (again when the room or the studio changes). */
  function buildBarRight() {
    if (!barRight) return;
    const d = room();
    const select = /** @type {HTMLSelectElement} */ (el("select", { title: "open a room", onchange: () => openRoom(select.value) },
      Cutaway.room.ids().map((id) => el("option", { value: id, textContent: id, selected: id === d?.id }))));
    barRight.replaceChildren(el("span", { className: "cw-dim", textContent: "room" }), select, button("▶ Play", close, "close the editor and play from here (F10)"),
      el("span", { style: { color: studio.available ? "#7c7" : "#c96", padding: "0 4px" },
        title: studio.available ? "the studio is connected: saves go into the game's folder, tasks run" : "no studio: saves go through the browser (start tools/studio.mjs)",
        textContent: studio.available ? "studio ●" : "studio ○" }));
  }

  /** The left panel: the workspaces, the rooms, and the room's things (or the active tab's own list). */
  function buildLeft() {
    if (!leftEl) return;
    const box = leftEl, d = room(), mods = /** @type {Record<string, any>} */ (api.modules);
    const keep = box.scrollTop;
    box.replaceChildren(
      fold("left.ws", "WORKSPACES", () => [list({ id: "workspaces", selected: active, pick: showTab,
        items: tabs.map((t) => ({ key: t.id, label: t.label, mark: unsavedOf(t) ? "●" : "", title: unsavedOf(t) ? "not saved" : t.label })) })]),
      fold("left.rooms", "ROOMS", () => [list({ id: "rooms", selected: d?.id, pick: (id) => { openRoom(id); }, filter: Cutaway.room.ids().length > 12,
        height: Cutaway.room.ids().length > 12 ? "200px" : undefined,
        items: Cutaway.room.ids().map((id) => ({ key: id, label: id })) })], { note: String(Cutaway.room.ids().length) }));
    const t = activeTab();
    if (t.browse) t.browse(box);
    else if (d) {
      const things = mods.things?.selected ?? "";
      /** @type {ListItem[]} */
      const items = [];
      /** @param {string} group @param {[string, string][]} rows */
      const add = (group, rows) => { for (const [key, label] of rows) items.push({ key, label, group }); };
      add("hotspots", Object.keys(d.hotspots ?? {}).map((id) => [`hot:${id}`, id]));
      add("props", (d.props ?? []).filter((p) => p.id).map((p) => [`prop:${p.id}`, /** @type {string} */ (p.id)]));
      add("actors", Cutaway.actors.all().filter((a) => a.room === d.id).map((a) => [`actor:${a.id}`, a.id]));
      add("lamps", (d.light?.lamps ?? []).map((l, i) => [`lamp:${l.id ?? i}`, String(l.id ?? i)]));
      add("effects", (d.fx ?? []).map((f, i) => [`fx:${f.id ?? i}`, `${f.kind} ${f.id ?? i}`]));
      box.append(fold("left.things", "IN " + d.id.toUpperCase(), () => [list({ id: "things.left", items, filter: items.length > 15,
        selected: active === "things" ? things : selKey ?? undefined, pick: selectThing })], { note: String(items.length) }));
    }
    box.scrollTop = keep;
  }

  /** A thing picked in the browser: its shape in Room, or its properties in Things (actors; or when Things is open). @param {string} key */
  function selectThing(key) {
    const things = /** @type {Record<string, any>} */ (api.modules).things;
    if (things && (key.startsWith("actor:") || active === "things" || !find(key))) { showTab("things"); things.select(key); return; }
    showTab("room"); selKey = key; selHandle = -1;
  }

  /** The inspector: the active tab's panel. */
  function buildPanel() {
    if (!panel) return;
    const t = activeTab(), n = unsavedOf(t);
    panel.replaceChildren(el("div", { className: "cw-title" }, [t.label,
      ...(n ? [el("span", { className: "cw-dirty", textContent: "● not saved" + (typeof n === "number" ? ` (${n})` : "") })] : [])]));
    const box = el("div", {});
    panel.append(box);
    try { t.build(box); } catch (e) { box.append(el("div", { style: { color: "#ff6a5a" } }, [`${t.label}: ${errText(e)}`])); console.error(e); }
  }

  /** The status bar: the message, the cursor, what isn't saved, the studio. */
  function buildStatus() {
    if (!statusEl) return;
    const p = statusParts;
    p.msg = el("span", { className: "msg", title: "the output (all of it)", onclick: () => setLayout("output") });
    p.cursor = el("span", { className: "cw-dim" });
    p.dirty = el("span", { className: "cw-dirty" });
    p.studio = el("span", {});
    p.hold = button("", () => setHold(!holding), "pause the game or let it run (Ctrl+P); F8 steps while paused");
    statusEl.replaceChildren(p.hold, p.msg, el("span", { className: "sp" }), p.cursor, p.dirty, p.studio,
      button("Output", () => setLayout("output"), "the output pane: every message and the tasks' output"));
  }

  /** Every frame (the editor's own loop: the game's clock may stand still with ?manual). */
  function tick() {
    if (!isOpen) return;
    raf = requestAnimationFrame(tick);
    const v = currentView();
    if (v !== mounted && centreEl) {
      centreEl.replaceChildren(...(v ? [v.el] : []));
      centreEl.style.display = v ? "" : "none";
      mounted = v;
      cursorText = null;                                  // the view sets its own again
      v?.shown?.();
    }
    if (panelDirty) {
      panelDirty = false;
      const f = focusedList();
      buildPanel(); buildLeft(); buildBarRight();
      afterBuild(f);
    }
    if (outputDirty && outputEl) {
      outputDirty = false;
      outputEl.replaceChildren(...log.map((s) => el("div", { className: "e", textContent: s })));
      outputEl.scrollTop = outputEl.scrollHeight;
    }
    syncAudio();
    const p = statusParts;
    if (!p.msg) return;
    const seq = Cutaway.sequence.playing(), hold = seq ? `▶ ${seq}` : holding ? "⏸ paused" : "▶ running";
    if (p.hold.textContent !== hold) { p.hold.textContent = hold; p.hold.classList.toggle("on", holding); }
    const lines = status.split("\n"), msg = lines[0] + (lines.length > 1 ? `   (+${lines.length - 1} lines: Output)` : "");
    if (p.msg.textContent !== msg) p.msg.textContent = msg;
    const c = cursorText ?? (mounted ? "" : `room ${cursor.x}, ${cursor.y}${drawing ? `   ${drawing.group}: ${drawing.pts.length} corners` : ""}`);
    if (p.cursor.textContent !== c) p.cursor.textContent = c;
    const u = unsaved(), us = u.length ? "● not saved: " + u.join(", ") : "";
    if (p.dirty.textContent !== us) p.dirty.textContent = us;
    const st = studio.available ? "studio connected" : "no studio";
    if (p.studio.textContent !== st) { p.studio.textContent = st; p.studio.className = studio.available ? "ok" : "no"; }
  }

  /** The Room tab: the room's shapes. @param {HTMLElement} panel */
  function buildRoom(panel) {
    const d = room();
    panel.append(
      el("div", { style: { margin: "6px 0" } }, [button("Save", save, "write rooms/<id>.geo.js (Ctrl+S)"), button("Copy", () => { navigator.clipboard?.writeText(text()); setStatus("copied the shapes file"); }, "the rooms/<id>.geo.js text"),
        button("Undo", () => undoRedo(true), "Ctrl+Z"), button("Redo", () => undoRedo(false), "Ctrl+Y")]),
      el("div", {}, [button("+ Walk area", () => startDrawing("walk")), button("+ Hole", () => startDrawing("hole")), button("+ Hotspot", () => startDrawing("hotspot"))]),
      el("div", { style: { margin: "6px 0" } }, Object.keys(show).map((g) => el("label", { style: { marginRight: "6px", color: /** @type {any} */ (COLORS)[g] } }, [
        el("input", { type: "checkbox", checked: show[g], onchange: (/** @type {Event} */ ev) => { show[g] = /** @type {HTMLInputElement} */ (ev.target).checked; } }), g]))),
    );
    const sel = selKey ? find(selKey) : null;
    if (sel) panel.append(selectedBox(sel));
    panel.append(el("div", { className: "cw-sec" }, [list({ id: "room.shapes", height: "260px", filter: true, selected: selKey ?? undefined,
      pick: (k) => { selKey = k; selHandle = -1; panelDirty = true; },
      items: items().map((it) => ({ key: it.key, label: it.label, group: it.group, color: it.color })) })]));
    const probs = problems();
    panel.append(el("div", { style: { marginTop: "6px", color: probs.length ? "#ff6a5a" : "#7a7" } }, [probs.length ? probs.join("\n") : "no problems"]));
    panel.append(el("pre", { className: "cw-dim", style: { whiteSpace: "pre-wrap", marginTop: "8px", font: "inherit" } }, [
      "click: select   drag: move\ndrag a corner   right click: delete it\ndouble-click an edge: new corner\narrows: nudge (Shift 10)   Del: delete\n" +
      "pan: the middle button, the wheel, the arrows (nothing selected)\nCtrl+Z / Ctrl+Y: undo / redo\nCtrl+P: pause or run   F8: step\nF10: play   F9: debug overlay"]));
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
    roomChanged();
  }

  /** Another room is shown (opened here, or the game or a sequence went there): the old one's undo and selection go. */
  function roomChanged() {
    knownRoom = Cutaway.scene.room?.id ?? null;
    selKey = null; selHandle = -1; drawing = null; drag = null; undoStack = []; redoStack = [];
    panned = false;                                       // a room load gives the camera back
    for (const t of tabs) t.onRoom?.();
    panelDirty = true;
  }

  const listeners = /** @type {[string, (e: any) => void][]} */ ([
    ["pointerdown", onDown], ["pointermove", onMove], ["pointerup", onUp], ["dblclick", onDouble], ["keydown", onKey], ["wheel", onWheel],
    ["contextmenu", (/** @type {Event} */ e) => { if (e.target === Cutaway.display.screen) e.preventDefault(); }],
    ["mousedown", (/** @type {MouseEvent} */ e) => { if (e.button === 1 && e.target === Cutaway.display.screen) e.preventDefault(); }],   // no autoscroll
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

  /** The inspector's own window, if the browser lets one open. @returns {Window | null} */
  function popup() {
    /** @type {Window | null} */
    let w = null;
    try { w = window.open("", "cutaway-editor", "width=420,height=940"); } catch { w = null; }
    if (!w) return null;
    try { void w.document.body; } catch { try { w.close(); } catch { /* gone */ } return null; }   // left from before a reload
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Cutaway editor</title></head><body class="cw-pop" style="margin:0;background:#16121f"></body></html>');
    w.document.close();
    return w;
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    studio.connect().then(() => { panelDirty = true; if (barEl) buildBar(); });
    loadModules().then(() => { if (barEl) buildBar(); });
    win = wantWindow ? popup() : null;
    ensureCss(document);
    root = /** @type {HTMLDivElement} */ (el("div", { className: "cw-ed" }));
    barEl = el("div", { className: "cw-bar" });
    leftEl = el("div", { className: "cw-left" });
    centreEl = el("div", { className: "cw-centre", style: { display: "none" } });
    outputEl = el("div", { className: "cw-out" });
    statusEl = el("div", { className: "cw-status" });
    panel = /** @type {HTMLDivElement} */ (el("div", { className: "cutaway-editor" }));
    root.append(barEl, leftEl, centreEl, outputEl, statusEl);
    if (win) {
      const w = win;
      ensureCss(w.document);
      w.document.body.append(panel);
      w.addEventListener("keydown", onKey, true);
      w.addEventListener("pointerdown", () => closeMenu(), true);
      w.addEventListener("pagehide", () => { if (win === w) { win = null; close(); } });
      pollTimer = window.setInterval(() => { if (win === w && w.closed) { win = null; close(); } }, 500);
      w.focus();
    } else root.append(panel);
    document.body.append(root);
    buildBar(); buildStatus();
    place();
    mounted = null;
    Cutaway.ui.setVisible(false);
    Cutaway.ui.setHud(showHud);                          // the portraits and buttons would cover the shapes
    Cutaway.display.screen.style.cursor = "crosshair";
    for (const [type, fn] of listeners) window.addEventListener(type, fn, { capture: true, passive: false });
    document.addEventListener("keydown", guard);
    knownRoom = Cutaway.scene.room?.id ?? null;
    setHold(true);
    panelDirty = true; outputDirty = true;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    drawing = null; drag = null;
    cancelAnimationFrame(raf);
    closeMenu();
    root?.remove(); panel?.remove();
    root = panel = null; barEl = barRight = leftEl = statusEl = outputEl = centreEl = null; mounted = null;
    for (const k of Object.keys(statusParts)) delete statusParts[k];
    clearInterval(pollTimer);
    if (win && !win.closed) { const w = win; win = null; w.close(); }
    win = null;
    Cutaway.display.reserve(0);
    Cutaway.ui.setVisible(true);
    Cutaway.ui.setHud(true);
    Cutaway.display.screen.style.cursor = "none";
    for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    document.removeEventListener("keydown", guard);
    holding = false; panDrag = null;
    Cutaway.clock.held = false;
    syncAudio();
    if (panned && !Cutaway.sequence.playing()) Cutaway.scene.cameraFollow();   // the camera back to the one playing
    panned = false;
  }

  tabs.push({ id: "room", label: "Room", build: buildRoom, save, undo: () => undoRedo(true), redo: () => undoRedo(false), del: deleteSelected,
    selectNone: roomSelectNone, get unsaved() { return dirtyRooms.size; } });
  // the game page goes (a reload): its editor window goes with it; unsaved changes ask first
  window.addEventListener("pagehide", () => { if (win && !win.closed) win.close(); });
  window.addEventListener("beforeunload", (e) => { if (unsaved().length) { e.preventDefault(); e.returnValue = ""; } });
  // over the whole picture, after the fade and the letterbox (in room pixels, as the camera shows them)
  Cutaway.events.on("frame.ui", (/** @type {CanvasRenderingContext2D} */ ctx) => {
    if (!isOpen || !Cutaway.scene.room) return;
    const cam = Cutaway.scene.camera;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    if (active === "room") render(ctx); else tabs.find((t) => t.id === active)?.render?.(ctx);
    ctx.restore();
  });
  Cutaway.events.on("room.enter", (/** @type {{id: string}} */ e) => { if (isOpen && e.id !== knownRoom) roomChanged(); });
  Cutaway.events.on("room.entered", () => { panelDirty = true; });

  const api = {
    open, close, text, geometry, items, problems, save, openRoom, studio, saveFile, download, el, button, fmt, unsaved, saveAll, runTask, output,
    list, fold, prefixGroups, playSequence, step, pan, notLoaded, relTo,
    /** Is the game paused by the editor? */
    get paused() { return holding; },
    /** Pause the game or let it run (Play > Pause game). @param {boolean} on */
    pause(on) { if (isOpen) setHold(on); },
    /** What the tab modules share with each other and the tests. @type {Record<string, any>} */
    modules: {},
    get isOpen() { return isOpen; },
    /** The inspector's own window, or null when docked. */
    get window() { return win; },
    /** Open the inspector docked (false, the default) or in a window of its own (true) from now on. @param {boolean} v */
    useWindow(v) { wantWindow = v; },
    /** Add a tab (the modules do). @param {EditorTab} t */
    tab(t) { const i = tabs.findIndex((x) => x.id === t.id); if (i >= 0) tabs[i] = t; else tabs.push(t); panelDirty = true; },
    /** Show a tab. @param {string} id */
    show: showTab,
    get activeTab() { return active; },
    /** Rebuild the inspector and the browser (a tab after its data changed). */
    refresh() { panelDirty = true; },
    /** The status line (and the output pane). @param {string} s */
    setStatus,
    /** A view's own text for the cursor in the status bar (null: the room's x, y). @param {string | null} s */
    setCursor(s) { cursorText = s; },
    /** Show or hide a part: "left", "right" (the inspector), "output". @param {"left" | "right" | "output"} part @param {boolean} [on] */
    setLayout,
    get layout() { return { ...layout, window: !!win }; },
    /** The menu bar's menus as they are now (tests, tools). */
    menus,
    /** Open a menu of the menu bar (tests, screenshots). @param {string} title */
    openMenu,
    closeMenu,
    /** The centre's element (where views go), or null while the editor is closed. */
    get centre() { return centreEl; },
    /** Select a shape by key (tools, tests). @param {string | null} key */
    select(key) { selKey = key; selHandle = -1; panelDirty = true; },
    get selected() { return selKey; },
    /** Start drawing a new shape (tools, tests). @param {"walk" | "hole" | "hotspot"} group */
    draw: startDrawing,
  };
  return api;
})();
