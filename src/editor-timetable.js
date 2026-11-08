// Cutaway.js editor, Time tab: the game day as a timetable, day by day. Each actor with a routine is a row, its
// entries bars from their start to their end, coloured and named by the room they put the actor in (an entry
// under an `if` striped, its condition in the inspector; entries that hold at the same time under different
// conditions lie in lanes of their own); each moment is a row too, its window a bar in its room's colour. The
// times the clock stops at when the player waits (every start and end that day, the marks) are lines down the
// whole table, so a stop that only one thing needs shows; the time now is a line of its own. A click picks a bar
// (what it says, where it is), a double click opens its room.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  const NAME_W = 150, TW = 26, ROW = 18, HEAD = 22;
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
    const d = table(shownDay ?? T().now.day), span = (d.t1 - d.t0) / 15, W = NAME_W + span * TW;
    const x = (/** @type {number} */ min) => NAME_W + ((min - d.t0) / 15) * TW;
    /** @type {HTMLElement[]} */
    const rows = [];
    let y = HEAD;
    /** @param {string} text */
    const heading = (text) => { rows.push(el("div", { style: { position: "absolute", left: "0", top: `${y}px`, width: `${W}px`, height: `${ROW}px`, background: "#1a1526", color: "#9a92b4", padding: "2px 6px", boxSizing: "border-box", letterSpacing: "1px" } }, [text])); y += ROW; };
    /**
     * A bar. @param {number} from @param {number} to @param {string | null | undefined} room @param {string} cond
     * @param {boolean} on @param {string} title @param {() => void} pick
     */
    const bar = (from, to, room, cond, on, title, pick) => {
      const c = roomColor(room);
      return el("div", { title, onclick: (/** @type {MouseEvent} */ e) => { e.stopPropagation(); pick(); },
        ondblclick: () => { if (room && Cutaway.room.ids().includes(room)) { E.openRoom(room); E.show("room"); } },
        style: { position: "absolute", left: `${x(from) + 1}px`, top: `${y + 2}px`, width: `${Math.max(3, x(to) - x(from) - 2)}px`, height: `${ROW - 4}px`, boxSizing: "border-box",
          background: cond ? `repeating-linear-gradient(135deg, ${c} 0 5px, #1a1526 5px 8px)` : c, border: `1px solid ${on ? COL.sel : "rgba(0,0,0,.5)"}`,
          outline: on ? `1px solid ${COL.sel}` : "", borderRadius: "2px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", padding: "0 3px", lineHeight: `${ROW - 6}px`,
          color: "#fff", textShadow: "0 1px 0 #000", cursor: "pointer" } }, [`${cond ? "? " : ""}${room ?? "—"}`]);
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
            () => { sel = { kind: "routine", actor: a.actor, i: b.i }; E.refresh(); draw(); }));
        }
        y += ROW;
      });
    }
    if (d.moments.length) heading("MOMENTS: a scene in a room, within its window");
    for (const m of d.moments) {
      rows.push(el("div", { style: { position: "absolute", left: "0", top: `${y}px`, width: `${W}px`, height: `${ROW}px` } }, [name(m.id)]));
      const on = sel?.kind === "moment" && sel.id === m.id, done = Cutaway.state.peek(`~moment.${m.id}`);
      rows.push(bar(m.from, m.to, m.m.room, condText(m.m.if), on, `${m.id}: ${T().format(m.from)} to ${T().format(m.to)} in ${m.m.room}${condText(m.m.if) ? `, if ${condText(m.m.if)}` : ""}${done ? ` (happened: ${done})` : ""}`,
        () => { sel = { kind: "moment", id: m.id }; E.refresh(); draw(); }));
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
      el("div", { style: { position: "sticky", left: "0", width: `${NAME_W - 4}px`, height: `${HEAD}px`, padding: "4px 6px", boxSizing: "border-box", background: COL.ground, color: "#ffe14a" } }, [`day ${d.day}`])]);
    for (let m = d.t0; m < d.t1; m += 60) head.append(el("div", { style: { position: "absolute", left: `${x(m) + 3}px`, top: "4px", color: "#9a92b4" } }, [T().format(m)]));
    for (const s of d.stops) head.append(el("div", { style: { position: "absolute", left: `${x(s) - 2}px`, top: "15px", width: "5px", height: "5px", background: "#ffe14a", borderRadius: "50%" }, title: `the clock stops at ${T().format(s)}` }));
    const keep = [box.scrollLeft, box.scrollTop];
    box.replaceChildren(head, el("div", { style: { position: "relative", width: `${W}px`, height: `${H - HEAD}px`, marginTop: `-${HEAD}px` } }, [...grid, ...rows]));
    [box.scrollLeft, box.scrollTop] = keep;
  }
  box.addEventListener("click", () => { if (sel) { sel = null; E.refresh(); draw(); } });

  /** @type {EditorView} */
  const view = { el: box, shown() { draw(); }, selectNone() { sel = null; E.refresh(); draw(); } };

  // ---- the inspector

  function build(/** @type {HTMLElement} */ panel) {
    const t = T();
    if (!t.used) { panel.append(el("div", { className: "cw-dim" }, ["This game has no game time: no routine, no moment (Cutaway.time, the reference's \"Game time\")."])); draw(); return; }
    const ds = days(), day = shownDay ?? t.now.day, d = table(day);
    panel.append(el("div", { style: { margin: "4px 0" } }, ["day ", ...ds.map((n) => button(n === day ? `● ${n}` : String(n), () => { shownDay = n; sel = null; E.refresh(); draw(); }, `day ${n}${n === t.now.day ? " (today)" : ""}`))]));
    panel.append(el("div", { className: "cw-dim", style: { margin: "2px 0 6px" } }, [`${d.actors.length} actors · ${d.moments.length} moments · the clock stops ${d.stops.length} times: ${d.stops.map((s) => t.format(s)).join(" ")}`]));
    panel.append(el("div", { className: "cw-dim" }, ["A bar is where an actor is (its room's name and colour) or a moment's window; striped: only under a condition. The yellow lines are the stops of the clock (where waiting stops: every start and end, the marks), the pink one now. A click picks a bar, a double click opens its room."]));
    if (sel?.kind === "routine") {
      const s = sel, e = t.routines.get(s.actor)?.[s.i];
      if (e) panel.append(el("div", { className: "cw-sec" }, [
        el("div", { style: { fontWeight: "bold" } }, [`${s.actor}, entry ${s.i}`]),
        el("div", {}, [`${e.from} to ${e.to}${e.day === undefined ? ", every day" : `, day ${Array.isArray(e.day) ? e.day.join(", ") : e.day}`}`]),
        el("div", {}, [`in ${e.room ?? "no room"}${e.at ? ` at ${e.at.join(", ")}` : ""}${e.face ? `, facing ${e.face}` : ""}${e.path ? `, walking a path of ${e.path.length}` : ""}`]),
        ...(condText(e.if) ? [el("div", { style: { color: "#ffd27a" } }, [`if ${condText(e.if)}`])] : []),
        el("div", { style: { marginTop: "4px" } }, [
          ...(e.room && Cutaway.room.ids().includes(e.room) ? [button("Open room", () => { E.openRoom(/** @type {string} */ (e.room)); E.show("room"); }, "its room in the Room tab (or a double click on the bar)")] : []),
          ...(E.modules.things ? [button("Things", () => { E.modules.things.reveal(e.room ?? Cutaway.scene.room?.id ?? "", `actor:${s.actor}`); }, "the actor in Things")] : [])])]));
    } else if (sel?.kind === "moment") {
      const s = sel, m = t.moments.get(s.id), done = Cutaway.state.peek(`~moment.${s.id}`);
      if (m) panel.append(el("div", { className: "cw-sec" }, [
        el("div", { style: { fontWeight: "bold" } }, [`moment ${s.id}`]),
        el("div", {}, [`${m.from} to ${m.to}${m.day === undefined ? ", every day" : `, day ${Array.isArray(m.day) ? m.day.join(", ") : m.day}`}, in ${m.room}`]),
        ...(condText(m.if) ? [el("div", { style: { color: "#ffd27a" } }, [`if ${condText(m.if)}`])] : []),
        el("div", { className: "cw-dim" }, [`${m.play ? "plays when watched" : "nothing to play"}${m.unseen ? "; leaves something behind when nobody watched" : ""}${done ? `; happened (${done})` : "; not yet"}`]),
        ...(Cutaway.room.ids().includes(m.room) ? [el("div", { style: { marginTop: "4px" } }, [button("Open room", () => { E.openRoom(m.room); E.show("room"); }, "its room in the Room tab")])] : [])]));
    }
    draw();
  }

  E.tab({ id: "time", label: "Time", build, view: () => view, selectNone: () => view.selectNone?.() });
  E.modules.time = { table, days, get day() { return shownDay ?? T().now.day; }, set day(n) { shownDay = n; E.refresh(); draw(); }, get selected() { return sel; },
    select(/** @type {any} */ s) { sel = s; E.refresh(); draw(); } };
})();
