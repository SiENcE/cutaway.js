// Cutaway.js editor, Time tab: the game day as a timetable, day by day. Each actor with a routine is a row, its
// entries bars from their start to their end, coloured and named by the room they put the actor in (an entry
// under an `if` striped, its condition in the inspector; entries that hold at the same time under different
// conditions lie in lanes of their own); each moment is a row too, its window a bar in its room's colour. The
// times the clock stops at when the player waits (every start and end that day, the marks) are lines down the
// whole table, so a stop that only one thing needs shows; the time now is a line of its own. A click picks a bar
// (what it says, where it is), a double click opens its room.
// Times and days can be changed here (the inspector's fields, or a bar dragged: whole, or by an end, in quarter
// hours): the change goes into the game's file where the routine or the moment is written (Cutaway.time.source
// says where; only that value changes, the file's comments and layout stay) and into the game at once. A value
// the file computes (a variable, a loop's) is left to the file. A picked moment's scripts (what it plays when watched,
// what it leaves when nobody watched) open as blocks in the centre and are written back the same way: only the steps
// that changed (editor-literal.js), unless the file computes them. Undo and redo; Save (Ctrl+S) writes the files.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  const NAME_W = 150, ROW = 18, HEAD = 22, TW_MIN = 6, TW_MAX = 320, KEY = "cutaway.editor.time:" + location.pathname;
  /** the width of a quarter hour, px: the wheel, + and - zoom it (kept for this game in the browser) */
  let tw = 26;
  try { tw = Number(localStorage.getItem(KEY)) || 26; } catch { /* none kept */ }

  const COL = { ground: "#100d18", grid: "#221c30", hour: "#3a3150", stop: "rgba(255, 225, 74, 0.35)", now: "#ff5ad8", sel: "#ffe14a", nowhere: "#3a3450" };
  /** @type {number | null} the day shown (null: today's) */
  let shownDay = null;
  /** @type {{kind: "routine", actor: string, i: number} | {kind: "moment", id: string} | null} */
  let sel = null;

  const T = () => Cutaway.time;
  /** @param {number | number[] | undefined} d @param {number} day */
  const onDay = (d, day) => d === undefined || (Array.isArray(d) ? d.includes(day) : d === day);
  /** @param {any} c */
  const condText = (c) => (c === undefined || c === null || c === "" ? "" : typeof c === "string" ? c : JSON.stringify(c));
  /** A room's colour, the same every time. @param {string | null | undefined} room */
  function roomColor(room) {
    if (!room) return COL.nowhere;
    let h = 0;
    for (const ch of room) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `hsl(${h % 360} 45% 38%)`;
  }

  /** Every day that something names (and today). */
  function days() {
    const s = new Set([T().now.day]);
    const add = (/** @type {number | number[] | undefined} */ d) => { for (const x of Array.isArray(d) ? d : d === undefined ? [] : [d]) s.add(x); };
    for (const list of T().routines.values()) for (const e of list) add(e.day);
    for (const m of T().moments.values()) add(m.day);
    return [...s].sort((a, b) => a - b);
  }

  /**
   * The day's table: its span (minutes), the actors' entries in lanes, the moments, the stops of the clock.
   * @param {number} day
   */
  function table(day) {
    const t = T(), cfg = t.config;
    /** @type {{actor: string, lanes: {i: number, e: RoutineEntry, from: number, to: number}[][]}[]} */
    const actors = [];
    /** @type {{id: string, m: MomentDef, from: number, to: number}[]} */
    const moments = [];
    /** @type {Set<number>} */
    const stops = new Set();
    for (const [actor, list] of t.routines) {
      /** @type {{i: number, e: RoutineEntry, from: number, to: number}[][]} */
      const lanes = [];
      list.forEach((e, i) => {
        if (!onDay(e.day, day)) return;
        const from = t.parse(e.from), to = t.parse(e.to);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return;
        stops.add(from); stops.add(to);
        const lane = lanes.find((l) => l.every((x) => x.to <= from || x.from >= to));
        const bar = { i, e, from, to };
        if (lane) lane.push(bar); else lanes.push([bar]);
      });
      if (lanes.length) actors.push({ actor, lanes });
    }
    for (const [id, m] of t.moments) {
      if (!onDay(m.day, day)) continue;
      const from = t.parse(m.from), to = t.parse(m.to);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      stops.add(from); stops.add(to);
      moments.push({ id, m, from, to });
    }
    for (const k of cfg.marks) { const v = t.parse(k); if (Number.isFinite(v)) stops.add(v); }
    const all = [...stops];
    let t0 = cfg.start ?? (all.length ? Math.min(...all) : 0), t1 = cfg.end ?? (all.length ? Math.max(...all) : t0 + 360);
    if (all.length) { t0 = Math.min(t0, ...all); t1 = Math.max(t1, ...all); }
    t0 = Math.floor(t0 / 60) * 60; t1 = Math.max(t0 + 60, Math.ceil(t1 / 60) * 60);
    return { day, t0, t1, actors, moments, stops: [...stops].filter((v) => v > (cfg.start ?? -Infinity) && (cfg.end === null || v <= cfg.end)).sort((a, b) => a - b) };
  }

  // ---- the view: the table in the centre, scrolling both ways (the names and the hours stay)

  const box = el("div", { style: { width: "100%", height: "100%", overflow: "auto", background: COL.ground, position: "relative", font: "11px Consolas, monospace", color: "#d8d0f0" } });

  function draw() {
    const d = table(shownDay ?? T().now.day), span = (d.t1 - d.t0) / 15, W = NAME_W + span * tw;
    const x = (/** @type {number} */ min) => NAME_W + ((min - d.t0) / 15) * tw;
    /** @type {HTMLElement[]} */
    const rows = [];
    let y = HEAD;
    /** @param {string} text */
    const heading = (text) => { rows.push(el("div", { style: { position: "absolute", left: "0", top: `${y}px`, width: `${W}px`, height: `${ROW}px`, background: "#1a1526", color: "#9a92b4", boxSizing: "border-box", letterSpacing: "1px" } },
      [el("span", { style: { position: "sticky", left: "0", display: "inline-block", padding: "2px 6px", whiteSpace: "nowrap" } }, [text])])); y += ROW; };
    /**
     * A bar. @param {number} from @param {number} to @param {string | null | undefined} room @param {string} cond
     * @param {boolean} on @param {string} title @param {() => void} pick @param {{kind: "routine" | "moment", id: string, i: number}} who
     */
    const bar = (from, to, room, cond, on, title, pick, who) => {
      const c = roomColor(room);
      const b = el("div", { title, onclick: (/** @type {MouseEvent} */ e) => { e.stopPropagation(); if (dragged) { dragged = false; return; } pick(); },
        ondblclick: () => { if (room && Cutaway.room.ids().includes(room)) { E.openRoom(room); E.show("room"); } },
        style: { position: "absolute", left: `${x(from) + 1}px`, top: `${y + 2}px`, width: `${Math.max(3, x(to) - x(from) - 2)}px`, height: `${ROW - 4}px`, boxSizing: "border-box",
          background: cond ? `repeating-linear-gradient(135deg, ${c} 0 5px, #1a1526 5px 8px)` : c, border: `1px solid ${on ? COL.sel : "rgba(0,0,0,.5)"}`,
          outline: on ? `1px solid ${COL.sel}` : "", borderRadius: "2px", overflow: "clip", whiteSpace: "nowrap", lineHeight: `${ROW - 6}px`,
          color: "#fff", textShadow: "0 1px 0 #000", cursor: "pointer" } },
        // its name stays at the view's left edge while a long bar runs on past it (clip, not hidden: that would stop the sticky)
        [el("span", { style: { position: "sticky", left: `${NAME_W + 2}px`, padding: "0 3px" } }, [`${cond ? "? " : ""}${room ?? "—"}`])]);
      // dragged: whole, or by an end (the outer 5 px), in quarter hours
      const edge = (/** @type {PointerEvent} */ e) => { const r = b.getBoundingClientRect(), o = e.clientX - r.left; return o < 5 ? "from" : o > r.width - 5 ? "to" : "move"; };
      b.addEventListener("pointermove", (e) => { if (!drag) b.style.cursor = edge(e) === "move" ? "grab" : "ew-resize"; });
      b.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        drag = { who, el: b, x0: e.clientX, from, to, nf: from, nt: to, mode: edge(e), left: x(from) + 1 };
        box.setPointerCapture(e.pointerId);
      });
      return b;
    };
    /** @param {string} name @param {string} [title] */
    const name = (name, title) => el("div", { title: title ?? name, style: { position: "sticky", left: "0", width: `${NAME_W - 4}px`, height: `${ROW}px`, padding: "2px 6px", boxSizing: "border-box", background: COL.ground, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", zIndex: "2" } }, [name]);
    if (d.actors.length) heading("ROUTINES: who is where");
    for (const a of d.actors) {
      a.lanes.forEach((lane, k) => {
        const row = el("div", { style: { position: "absolute", left: "0", top: `${y}px`, width: `${W}px`, height: `${ROW}px` } }, [name(k ? "" : a.actor, a.actor)]);
        rows.push(row);
        for (const b of lane) {
          const on = sel?.kind === "routine" && sel.actor === a.actor && sel.i === b.i;
          rows.push(bar(b.from, b.to, b.e.room, condText(b.e.if), on, `${a.actor}: ${T().format(b.from)} to ${T().format(b.to)} in ${b.e.room ?? "no room"}${condText(b.e.if) ? `, if ${condText(b.e.if)}` : ""}`,
            () => { sel = { kind: "routine", actor: a.actor, i: b.i }; E.refresh(); draw(); }, { kind: "routine", id: a.actor, i: b.i }));
        }
        y += ROW;
      });
    }
    if (d.moments.length) heading("MOMENTS: a scene in a room, within its window");
    for (const m of d.moments) {
      rows.push(el("div", { style: { position: "absolute", left: "0", top: `${y}px`, width: `${W}px`, height: `${ROW}px` } }, [name(m.id)]));
      const on = sel?.kind === "moment" && sel.id === m.id, done = Cutaway.state.peek(`~moment.${m.id}`);
      rows.push(bar(m.from, m.to, m.m.room, condText(m.m.if), on, `${m.id}: ${T().format(m.from)} to ${T().format(m.to)} in ${m.m.room}${condText(m.m.if) ? `, if ${condText(m.m.if)}` : ""}${done ? ` (happened: ${done})` : ""}`,
        () => { sel = { kind: "moment", id: m.id }; E.refresh(); draw(); }, { kind: "moment", id: m.id, i: 0 }));
      y += ROW;
    }
    if (!d.actors.length && !d.moments.length) { rows.push(el("div", { style: { position: "absolute", left: "8px", top: `${y + 6}px`, color: "#9a92b4" } }, [`Nothing is scheduled on day ${d.day}: no routine, no moment.`])); y += ROW * 2; }
    const H = Math.max(y + 8, 60);
    // the grid under it all: the quarter hours, the hours, the stops of the clock, the time now
    /** @type {HTMLElement[]} */
    const grid = [];
    for (let m = d.t0; m <= d.t1; m += 15) grid.push(el("div", { style: { position: "absolute", left: `${x(m)}px`, top: `${HEAD}px`, width: "1px", height: `${H - HEAD}px`, background: m % 60 ? COL.grid : COL.hour } }));
    for (const s of d.stops) grid.push(el("div", { title: `the clock stops at ${T().format(s)}`, style: { position: "absolute", left: `${x(s)}px`, top: "12px", width: "1px", height: `${H - 12}px`, background: COL.stop } }));
    const now = T().now;
    if (now.day === d.day && now.minutes >= d.t0 && now.minutes <= d.t1) grid.push(el("div", { title: `now: ${now.text}`, style: { position: "absolute", left: `${x(now.minutes)}px`, top: "0", width: "2px", height: `${H}px`, background: COL.now, zIndex: "1" } }));
    // the hours along the top, staying while the table scrolls down
    const head = el("div", { style: { position: "sticky", top: "0", height: `${HEAD}px`, width: `${W}px`, background: COL.ground, zIndex: "3" } }, [
      el("div", { style: { position: "sticky", left: "0", width: `${NAME_W - 4}px`, height: `${HEAD}px`, padding: "4px 6px", boxSizing: "border-box", background: COL.ground, color: "#ffe14a", zIndex: "1" } }, [`day ${d.day}`])]);
    // the hours (every second or third when they would crowd), the quarters too when there is room
    const every = Math.max(1, Math.ceil(44 / (4 * tw)));
    for (let m = d.t0; m < d.t1; m += 15) {
      const hour = m % 60 === 0;
      if (hour ? ((m - d.t0) / 60) % every : tw < 36) continue;
      head.append(el("div", { style: { position: "absolute", left: `${x(m) + 3}px`, top: "4px", color: hour ? "#9a92b4" : "#5c5470" } }, [hour ? T().format(m) : `:${String(m % 60).padStart(2, "0")}`]));
    }
    for (const s of d.stops) head.append(el("div", { style: { position: "absolute", left: `${x(s) - 2}px`, top: "15px", width: "5px", height: "5px", background: "#ffe14a", borderRadius: "50%" }, title: `the clock stops at ${T().format(s)}` }));
    const keep = [box.scrollLeft, box.scrollTop];
    box.replaceChildren(head, el("div", { style: { position: "relative", width: `${W}px`, height: `${H - HEAD}px`, marginTop: `-${HEAD}px` } }, [...grid, ...rows]));
    [box.scrollLeft, box.scrollTop] = keep;
  }
  box.addEventListener("click", () => { if (sel) { sel = null; E.refresh(); draw(); } });
  box.addEventListener("dblclick", (/** @type {MouseEvent} */ e) => { if (e.target === box || !(/** @type {any} */ (e.target).title)) fit(); });

  /**
   * Zoom the time axis, the time at `px` (from the box's left edge) staying where it is.
   * @param {number} f the factor @param {number} [px]
   */
  function zoom(f, px = (box.clientWidth + NAME_W) / 2) {
    const at = (box.scrollLeft + px - NAME_W) / tw, next = Math.min(TW_MAX, Math.max(TW_MIN, tw * f));
    if (next === tw) return;
    tw = next;
    try { localStorage.setItem(KEY, String(tw)); } catch { /* private mode */ }
    draw();
    box.scrollLeft = Math.max(0, at * tw + NAME_W - px);
    E.refresh();
  }
  /** The whole day in the width of the view. */
  function fit() {
    const d = table(shownDay ?? T().now.day), quarters = (d.t1 - d.t0) / 15;
    tw = Math.min(TW_MAX, Math.max(TW_MIN, (box.clientWidth - NAME_W - 12) / quarters));
    try { localStorage.setItem(KEY, String(tw)); } catch { /* private mode */ }
    draw(); box.scrollLeft = 0; E.refresh();
  }
  // the wheel zooms round the pointer (as the picture and the map); Shift+wheel scrolls across
  box.addEventListener("wheel", (/** @type {WheelEvent} */ e) => {
    if (e.shiftKey || !e.deltaY) return;
    e.preventDefault(); e.stopPropagation();
    zoom(Math.exp(-e.deltaY * 0.002), e.clientX - box.getBoundingClientRect().left);
  }, { passive: false });

  /** @type {EditorView} */
  const view = { el: box, shown() { draw(); }, selectNone() { sel = null; E.refresh(); draw(); },
    undo: () => step(undo, redo, false), redo: () => step(redo, undo, true),
    /** + and - zoom, 0 (or Ctrl+0) fits the day */
    key(e) {
      if (e.key === "+" || e.code === "NumpadAdd" || e.code === "Equal") { zoom(1.5); return true; }
      if (e.key === "-" || e.code === "NumpadSubtract" || e.code === "Minus") { zoom(1 / 1.5); return true; }
      if (e.code === "Digit0" || e.code === "Numpad0") { fit(); return true; }
      return false;
    } };

  // ---- dragging a bar

  /** @type {{who: {kind: "routine" | "moment", id: string, i: number}, el: HTMLElement, x0: number, from: number, to: number, nf: number, nt: number, mode: string, left: number} | null} */
  let drag = null;
  /** a drag just ended: the click that follows it doesn't pick */
  let dragged = false;
  box.addEventListener("pointermove", (/** @type {PointerEvent} */ e) => {
    if (!drag) return;
    const q = Math.round((e.clientX - drag.x0) / tw) * 15, d = drag;
    if (d.mode === "move") { d.nf = d.from + q; d.nt = d.to + q; }
    else if (d.mode === "from") { d.nf = Math.min(d.from + q, d.to - 15); d.nt = d.to; }
    else { d.nf = d.from; d.nt = Math.max(d.to + q, d.from + 15); }
    d.el.style.left = `${d.left + ((d.nf - d.from) / 15) * tw}px`;
    d.el.style.width = `${Math.max(3, ((d.nt - d.nf) / 15) * tw - 2)}px`;
    E.setCursor(`${T().format(d.nf)} to ${T().format(d.nt)}`);
  });
  box.addEventListener("pointerup", () => {
    const d = drag;
    drag = null;
    if (!d) return;
    E.setCursor(null);
    if (d.nf === d.from && d.nt === d.to) return;
    dragged = true;
    sel = d.who.kind === "routine" ? { kind: "routine", actor: d.who.id, i: d.who.i } : { kind: "moment", id: d.who.id };
    /** @type {Record<string, any>} */
    const v = {};
    if (d.nf !== d.from) v.from = T().format(d.nf);
    if (d.nt !== d.to) v.to = T().format(d.nt);
    change(d.who.kind, d.who.id, d.who.i, v).then((ok) => { if (!ok) draw(); });
  });

  // ---- changing the game's file

  /** @type {Map<string, {src: string, saved: string}>} the files touched: as they are now, as saved */
  const files = new Map();
  /** @typedef {{path: string, before: string, after: string, live: {o: any, key: string, before: any, after: any}[]}} TimeEdit */
  /** @type {TimeEdit[]} */ let undo = [];
  /** @type {TimeEdit[]} */ let redo = [];
  const RE = { routine: /Cutaway\.(?:time\.)?routine\s*\(/, moment: /Cutaway\.(?:time\.)?moment\s*\(/ };

  /** A script's address as a path in the game's folder ("game/prolog.js"), or null (another place). @param {string} url */
  function relPath(url) {
    try {
      const u = new URL(url, location.href), base = new URL(".", location.href);
      if (u.origin === base.origin && u.pathname.startsWith(base.pathname)) return decodeURIComponent(u.pathname.slice(base.pathname.length));
    } catch { /* not an address */ }
    return null;
  }
  /** Where a routine or a moment is written: its file in the game's folder and its line. @param {"routine" | "moment"} kind @param {string} id */
  function where(kind, id) {
    const s = T().source(kind, id), path = s ? relPath(s.file) : null;
    return path && s ? { path, line: s.line } : null;
  }
  /** Everything one text defines (routines made in a loop share it). @param {"routine" | "moment"} kind @param {string} id */
  function sharing(kind, id) {
    const w = where(kind, id);
    if (!w) return [id];
    return [...(kind === "routine" ? T().routines.keys() : T().moments.keys())].filter((o) => { const v = where(kind, o); return v && v.path === w.path && v.line === w.line; });
  }
  /** A value as the data writes it. @param {any} v @returns {string} */
  const lit = (v) => (Array.isArray(v) ? `[${v.map(lit).join(", ")}]` : typeof v === "string" ? JSON.stringify(v) : String(v));
  /**
   * The object of a routine's entry i or of a moment in its file's text, or null (computed there). The call is found by
   * its id where it names it (a moment's script changed above it moves the lines), else on its line.
   * @param {string} src @param {"routine" | "moment"} kind @param {number} line @param {number} i @param {string} [id]
   */
  function locate(src, kind, line, i, id) {
    const L = E.modules.literal;
    if (id) {
      const m = new RegExp(`Cutaway\\.(?:time\\.)?${kind}\\s*\\(\\s*["'\`]${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).exec(src);
      if (m) line = L.lineOf(src, m.index);
    }
    const c = L?.call(src, line, RE[kind]);
    if (!c || c.args.length < 2) return null;
    const a = c.args[1];
    if (kind === "moment") return a.t === "obj" ? a : null;
    return a.t === "arr" && a.items?.[i]?.t === "obj" ? a.items[i] : null;
  }

  /**
   * Change keys of a routine's entry or a moment: in its file (only those values) and in the game now (every
   * routine the same text defines). A value undefined takes the key out. False when it can't (no studio, the
   * file computes it).
   * @param {"routine" | "moment"} kind @param {string} id @param {number} i @param {Record<string, any>} values
   */
  async function change(kind, id, i, values) {
    const what = kind === "routine" ? `${id}'s entry ${i}` : `the moment ${id}`;
    if (!E.studio.available) { E.setStatus("time: changing a time needs the studio (it writes the game's file)"); return false; }
    const w = where(kind, id);
    if (!w) { E.setStatus(`time: where ${what} is written isn't known: change it in the game's file`); return false; }
    const L = E.modules.literal;
    if (!files.has(w.path)) { try { const t = await E.studio.read(w.path); files.set(w.path, { src: t, saved: t }); } catch (e) { E.setStatus(`time: ${w.path}: ${/** @type {any} */ (e).message}`); return false; } }
    const f = /** @type {{src: string, saved: string}} */ (files.get(w.path));
    let src = f.src;
    for (const [key, v] of Object.entries(values)) {
      const o = locate(src, kind, w.line, i, id), n = o ? L.field(o, key) : null;
      if (!o || n?.t === "code") { E.setStatus(`time: ${what} has its ${o ? key : "values"} computed in the code (${w.path}:${w.line}): change it there`); return false; }
      src = v === undefined ? (n ? L.removeKey(src, o, key) : src) : L.setKey(src, o, key, lit(v));
    }
    /** @type {TimeEdit["live"]} */
    const live = [];
    for (const other of sharing(kind, id)) {
      const obj = kind === "routine" ? T().routines.get(other)?.[i] : T().moments.get(other);
      if (obj) for (const [key, v] of Object.entries(values)) live.push({ o: obj, key, before: /** @type {any} */ (obj)[key], after: v });
    }
    const ed = { path: w.path, before: f.src, after: src, live };
    undo.push(ed); if (undo.length > 200) undo.shift();
    redo = [];
    put(ed, true);
    E.setStatus(`time: ${what} ${Object.entries(values).map(([k, v]) => `${k} ${v === undefined ? "(every day)" : lit(v)}`).join(", ")} in ${w.path}:${w.line} (not saved)`);
    return true;
  }
  // ---- a moment's scripts as blocks in the centre

  /** @type {{id: string, key: "play" | "unseen", view: EditorView} | null} the script open in the centre */
  let open = null;
  const SCRIPT = { play: "what it plays when watched", unseen: "what it leaves when nobody watched" };
  /**
   * Where a moment's script is written: the file's text, the moment's object and the script's node there; or why it can't
   * be changed here (no studio, not known, made for several moments by one text, computed in the code).
   * @param {string} id @param {"play" | "unseen"} key
   */
  async function scriptAt(id, key) {
    if (!E.studio.available) return { why: "changing a script needs the studio (it writes the game's file)" };
    const w = where("moment", id);
    if (!w) return { why: "where the moment is written isn't known" };
    if (sharing("moment", id).length > 1) return { why: `one text makes ${sharing("moment", id).join(", ")} (${w.path}:${w.line}): change it there`, w };
    if (!files.has(w.path)) { try { const t = await E.studio.read(w.path); files.set(w.path, { src: t, saved: t }); } catch (e) { return { why: `${w.path}: ${/** @type {any} */ (e).message}` }; } }
    const f = /** @type {{src: string, saved: string}} */ (files.get(w.path)), L = E.modules.literal, o = locate(f.src, "moment", w.line, 0, id);
    if (!o) return { why: `the moment's data is computed in the code (${w.path}:${w.line})`, w };
    const n = L.field(o, key);
    if (n && n.t !== "arr" && n.t !== "str") return { why: `its ${key} is computed in the code (${w.path}:${w.line}): change it there`, w };
    return { w, f, o, n };
  }
  /** Open a moment's script in the centre (computed in the code: the file opens there instead). @param {string} id @param {"play" | "unseen"} key */
  async function openScript(id, key) {
    const S = E.modules.script, m = T().moments.get(id);
    if (!S || !m) return;
    const at = await scriptAt(id, key);
    if ("why" in at) { E.setStatus(`time: ${id}'s ${key}: ${at.why}`); if (at.w) E.modules.art?.openSource(at.w.path, at.w.line); return; }
    const view = S.view({ title: `moment ${id}: ${key} (${SCRIPT[key]})`, value: m[key] ?? [],
      change: (/** @type {any[] | null} */ v) => { changeScript(id, key, v ?? []); },
      close: () => { open = null; E.refresh(); draw(); } });
    open = { id, key, view };
    E.refresh();
  }
  /** Write a moment's script: in its file (only the steps that changed) and in the game. @param {string} id @param {"play" | "unseen"} key @param {any[]} v */
  async function changeScript(id, key, v) {
    const m = T().moments.get(id), at = await scriptAt(id, key), L = E.modules.literal;
    if (!m) return false;
    if ("why" in at) { E.setStatus(`time: ${id}'s ${key}: ${at.why}`); return false; }
    const now = m[key] === undefined ? [] : Array.isArray(m[key]) ? m[key] : [m[key]];
    /** @type {{text: string} | {why: string}} */
    let r;
    if (!at.n) r = { text: L.setKey(at.f.src, at.o, key, L.lit(v)) };
    else if (at.n.t !== "arr") r = { text: L.put(at.f.src, at.n, L.lit(v)) };
    else r = L.replaceList(at.f.src, at.n, now, v, (/** @type {string} */ text) => L.field(locate(text, "moment", at.w.line, 0, id), key) ?? null);
    if (!("text" in r)) { E.setStatus(`time: ${id}'s ${key}: ${r.why}`); return false; }
    const ed = { path: at.w.path, before: at.f.src, after: r.text, live: [{ o: m, key, before: m[key], after: JSON.parse(JSON.stringify(v)) }] };
    undo.push(ed); if (undo.length > 200) undo.shift();
    redo = [];
    put(ed, true);
    E.setStatus(`time: ${id}'s ${key} (${v.length} steps) in ${at.w.path} (not saved)`);
    return true;
  }

  /** An edit done (true) or undone. @param {TimeEdit} ed @param {boolean} on */
  function put(ed, on) {
    const f = files.get(ed.path);
    if (f) f.src = on ? ed.after : ed.before;
    for (const c of ed.live) { const v = on ? c.after : c.before; if (v === undefined) delete c.o[c.key]; else c.o[c.key] = v; }
    // the script open in the centre shows what it holds now (an undo from the tab)
    const shown = open ? T().moments.get(open.id) : null;
    if (open && shown && ed.live.some((c) => c.o === shown && c.key === open?.key)) /** @type {any} */ (open.view).blocks.value = shown[open.key] ?? [];
    T().apply();
    E.refresh(); draw();
  }
  /** @param {TimeEdit[]} from @param {TimeEdit[]} to @param {boolean} on */
  function step(from, to, on) { const ed = from.pop(); if (!ed) return; to.push(ed); put(ed, on); }
  /** The files changed, written. */
  async function save() {
    const out = [];
    for (const [path, f] of files) if (f.src !== f.saved) { out.push(await E.saveFile(path, f.src)); f.saved = f.src; }
    E.setStatus(out.length ? `time: ${out.join(", ")}` : "time: nothing to save");
    E.refresh();
  }
  const unsaved = () => [...files.values()].filter((f) => f.src !== f.saved).length;

  /** The fields of a picked entry or moment: from, to, the day; where it is written. @param {"routine" | "moment"} kind @param {string} id @param {number} i @param {any} o */
  function fields(kind, id, i, o) {
    const t = T();
    /** @param {string} key @param {string} v @param {string} title */
    const time = (key, v, title) => el("input", { value: v, title, style: { width: "52px" }, onchange: (/** @type {any} */ e) => {
      const x = String(e.target.value).trim(), m = t.parse(x);
      if (!/^\d{1,2}:\d{2}$/.test(x) || !Number.isFinite(m)) { E.setStatus("time: a clock time, 22:15"); E.refresh(); return; }
      const from = key === "from" ? m : t.parse(o.from), to = key === "to" ? m : t.parse(o.to);
      if (!(from < to)) { E.setStatus("time: it must end after it begins (on the game day: the morning comes after the evening)"); E.refresh(); return; }
      if (m % 15) E.setStatus(`time: ${x} is off the quarter hours (the solver counts every stop of the clock)`);
      change(kind, id, i, { [key]: t.format(m) });
    } });
    const dayText = o.day === undefined ? "" : Array.isArray(o.day) ? o.day.join(", ") : String(o.day);
    const day = el("input", { value: dayText, placeholder: "every day", title: "a day (2), several (2, 3), or empty: every day", style: { width: "70px" }, onchange: (/** @type {any} */ e) => {
      const x = String(e.target.value).trim(), list = x ? x.split(/[\s,]+/).map(Number) : [];
      if (list.some((n) => !Number.isInteger(n) || n < 1)) { E.setStatus("time: days are whole numbers from 1 (2, or 2, 3; empty: every day)"); E.refresh(); return; }
      change(kind, id, i, { day: list.length === 0 ? undefined : list.length === 1 ? list[0] : list });
    } });
    const w = where(kind, id), shared = sharing(kind, id);
    return el("div", {}, [
      el("div", { style: { margin: "4px 0" } }, ["from ", time("from", o.from, "its start, a clock time (Enter)"), " to ", time("to", o.to, "its end, not included"), " day ", day]),
      ...(shared.length > 1 ? [el("div", { style: { color: "#ffd27a" } }, [`one text for ${shared.join(", ")}: a change here changes them all`])] : []),
      w ? el("div", { style: { cursor: "pointer", color: "#7ad8ff" }, title: "open the file at this line", onclick: () => { E.modules.art?.openSource(w.path, w.line); } }, [`${w.path}:${w.line}`])
        : el("div", { className: "cw-dim" }, ["where it is written isn't known"])]);
  }

  // ---- the inspector

  function build(/** @type {HTMLElement} */ panel) {
    const t = T();
    if (!t.used) { panel.append(el("div", { className: "cw-dim" }, ["This game has no game time: no routine, no moment (Cutaway.time, the reference's \"Game time\")."])); draw(); return; }
    const ds = days(), day = shownDay ?? t.now.day, d = table(day);
    panel.append(el("div", { style: { margin: "4px 0" } }, ["zoom ", button("−", () => zoom(1 / 1.5), "narrower (-, or the wheel)"), button("+", () => zoom(1.5), "wider (+, or the wheel round the pointer)"),
      button("Fit", fit, "the whole day in view (0, or a double click on the empty table)"), el("span", { className: "cw-dim" }, [` ${Math.round(tw)} px a quarter hour`])]));
    panel.append(el("div", { style: { margin: "4px 0" } }, ["day ", ...ds.map((n) => button(n === day ? `● ${n}` : String(n), () => { shownDay = n; sel = null; E.refresh(); draw(); }, `day ${n}${n === t.now.day ? " (today)" : ""}`))]));
    panel.append(el("div", { className: "cw-dim", style: { margin: "2px 0 6px" } }, [`${d.actors.length} actors · ${d.moments.length} moments · the clock stops ${d.stops.length} times: ${d.stops.map((s) => t.format(s)).join(" ")}`]));
    panel.append(el("div", { className: "cw-dim" }, ["A bar is where an actor is (its room's name and colour) or a moment's window; striped: only under a condition. The yellow lines are the stops of the clock (where waiting stops: every start and end, the marks), the pink one now. A click picks a bar, a double click opens its room; drag a bar (or one of its ends) to change its times. The wheel zooms round the pointer, Shift+wheel scrolls across."]));
    if (unsaved()) panel.append(el("div", { style: { margin: "4px 0" } }, [button(`Save (${unsaved()} file${unsaved() > 1 ? "s" : ""})`, () => { save(); }, "write the changed times into the game's files (Ctrl+S)")]));
    if (sel?.kind === "routine") {
      const s = sel, e = t.routines.get(s.actor)?.[s.i];
      if (e) panel.append(el("div", { className: "cw-sec" }, [
        el("div", { style: { fontWeight: "bold" } }, [`${s.actor}, entry ${s.i}`]),
        fields("routine", s.actor, s.i, e),
        el("div", {}, [`in ${e.room ?? "no room"}${e.at ? ` at ${e.at.join(", ")}` : ""}${e.face ? `, facing ${e.face}` : ""}${e.path ? `, walking a path of ${e.path.length}` : ""}`]),
        ...(condText(e.if) ? [el("div", { style: { color: "#ffd27a" } }, [`if ${condText(e.if)}`])] : []),
        el("div", { style: { marginTop: "4px" } }, [
          ...(e.room && Cutaway.room.ids().includes(e.room) ? [button("Open room", () => { E.openRoom(/** @type {string} */ (e.room)); E.show("room"); }, "its room in the Room tab (or a double click on the bar)")] : []),
          ...(E.modules.things ? [button("Things", () => { E.modules.things.reveal(e.room ?? Cutaway.scene.room?.id ?? "", `actor:${s.actor}`); }, "the actor in Things")] : [])])]));
    } else if (sel?.kind === "moment") {
      const s = sel, m = t.moments.get(s.id), done = Cutaway.state.peek(`~moment.${s.id}`);
      if (m) panel.append(el("div", { className: "cw-sec" }, [
        el("div", { style: { fontWeight: "bold" } }, [`moment ${s.id}, in ${m.room}`]),
        fields("moment", s.id, 0, m),
        ...(condText(m.if) ? [el("div", { style: { color: "#ffd27a" } }, [`if ${condText(m.if)}`])] : []),
        el("div", { className: "cw-dim" }, [`${m.play ? "plays when watched" : "nothing to play"}${m.unseen ? "; leaves something behind when nobody watched" : ""}${done ? `; happened (${done})` : "; not yet"}`]),
        el("div", { style: { marginTop: "4px" } }, /** @type {("play" | "unseen")[]} */ (["play", "unseen"]).map((key) => {
          const v = m[key], n = v === undefined ? 0 : Array.isArray(v) ? v.length : 1;
          return button(`${open?.id === s.id && open.key === key ? "● " : ""}${key} (${n} step${n === 1 ? "" : "s"})`, () => { openScript(s.id, key); }, `${SCRIPT[key]}: as blocks in the centre, written into the game's file (what the code computes opens the file instead)`);
        })),
        ...(Cutaway.room.ids().includes(m.room) ? [el("div", { style: { marginTop: "4px" } }, [button("Open room", () => { E.openRoom(m.room); E.show("room"); }, "its room in the Room tab")])] : [])]));
    }
    draw();
  }

  E.tab({ id: "time", label: "Time", build, view: () => open?.view ?? view, selectNone: () => view.selectNone?.(), save: () => save(),
    undo: () => step(undo, redo, false), redo: () => step(redo, undo, true), get unsaved() { return unsaved(); } });
  E.modules.time = { table, days, zoom, fit, change, save, where, sharing, openScript, changeScript, get script() { return open; }, get unsaved() { return unsaved(); }, files, get width() { return tw; }, get day() { return shownDay ?? T().now.day; }, set day(n) { shownDay = n; E.refresh(); draw(); }, get selected() { return sel; },
    select(/** @type {any} */ s) { sel = s; E.refresh(); draw(); } };
})();
