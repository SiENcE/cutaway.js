// Cutaway.js editor, Sequences tab: a sequence on a timeline. The steps stay what the game is written in; the tab
// runs the sequence silently (Cutaway.timeline: a trace, then seeks) and shows when each step happens, in lanes
// under the game picture: the shots, the rooms, the story (what the sequence waits for: waits, lines), the
// camera, each prop and actor, the screen (letterbox, fades, captions), the sound, the state, a game's own
// actions. The playhead goes to any moment and the picture shows the sequence there, still; Space plays from it.
// Changing the timing is changing the steps (Cutaway.timeline.edits): a bar's end drags its length, a step that
// goes on at once drags along its waits (nothing else moves), Alt+drag moves it and everything after it, a
// step is added at the playhead or taken out (its time stays as a wait). On the room's map in the inspector
// the camera's frame of a camera step and a moved prop's goal drag to where they should be; a click on the
// picture puts a picked caption in that corner. Every change goes into the game at once and into the edits
// layer (File > Save, with the Things tab's), with undo and redo; the sequence is traced again and the picture
// stays at its moment. New makes a sequence of its own (in the edits layer).
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button, F = () => Cutaway.timeline;
  const NAME_W = 92, ROW = 18, HEAD = 20, KEY = "cutaway.editor.sequences:" + location.pathname, STEP = Cutaway.clock.STEP;
  const COL = { ground: "#100d18", grid: "#221c30", sec: "#3a3150", head: "#9a92b4", play: "#ff5ad8", sel: "#ffe14a", inout: "rgba(122, 216, 255, 0.12)" };
  const LANE_COL = { shots: "#6a5acd", rooms: "#3a6a8a", story: "#8a6a3a", camera: "#2f8f6f", prop: "#7a5a9a", actor: "#9a5a6a", screen: "#4a6aa0", sound: "#a08a3a", state: "#5a7a4a", other: "#6a6a6a" };
  /** px a second (the wheel, + and - zoom it; kept for this game) */
  let pps = 60;
  try { pps = Number(localStorage.getItem(KEY)) || 60; } catch { /* none kept */ }

  /** @type {string | null} the sequence on the timeline */ let seq = null;
  /** @type {TimelineTrace | null} */ let tr = null;
  /** the playhead (ms from the sequence's start) */ let T = 0;
  /** @type {string | null} the picked step's path */ let sel = null;
  /** @type {[number, number] | null} in and out points */ let io = null;
  let loop = false, tracing = false;
  /** @type {string} what the last trace or change said */ let note = "";
  /** @type {any[]} */ let undo = [];
  /** @type {any[]} */ let redo = [];
  let dirty = false;

  const fmt = (/** @type {number} */ ms) => { const t = Math.max(0, Math.round(ms)), m = Math.floor(t / 60000), s = Math.floor(t / 1000) % 60; return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(t % 1000).padStart(3, "0")}`; };
  const px = (/** @type {number} */ ms) => NAME_W + (ms / 1000) * pps;
  const msAt = (/** @type {number} */ x) => Math.max(0, ((x - NAME_W) / pps) * 1000);
  const steps = () => /** @type {any[]} */ (seq ? Cutaway.sequence.get(seq)?.steps ?? [] : []);
  const recOf = (/** @type {string | null} */ p) => (p && tr ? [...tr.steps].reverse().find((s) => s.path === p) ?? null : null);
  /** The step itself at a path (in its list), as the game has it now. @param {string | null} p */
  function stepAt(p) { if (!p || !tr) return undefined; const at = F().edits.locate(JSON.parse(JSON.stringify(steps())), tr, p); return at ? at.list[at.index] : undefined; }
  /** A room's colour, the same every time (as the Schedule tab's). @param {string} room */
  function roomColor(room) { let h = 0; for (const ch of room) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 45% 38%)`; }

  // ---- the lanes

  /**
   * @typedef {{from: number, to: number, label: string, title: string, color: string, rec?: TimelineStep, shot?: string, room?: string}} Bar
   * @typedef {{id: string, label: string, rows: Bar[][]}} Lane
   */

  /** Which lane a step goes in, and its name. @param {TimelineStep} r @returns {[string, string, string] | null} [lane id, label, colour] */
  function laneOf(r) {
    const s = r.step, k = r.kind;
    if (k === "if" || k === "once" || k === "shot" || k === "goto") return null;
    if (["say", "narrate", "dialog", "wait", "card", "sequence", "act", "end"].includes(k)) return ["story", "story", LANE_COL.story];
    if (k === "camera") return ["camera", "camera", LANE_COL.camera];
    if (["move", "play", "open", "close", "show", "hide"].includes(k)) { const id = String(s[k]); return [`prop:${id}`, id, LANE_COL.prop]; }
    if (["walk", "anim", "face", "place"].includes(k)) {
      const who = k === "walk" ? (Array.isArray(s.walk) ? "" : s.walk) : k === "anim" ? (String(s.anim).includes(":") ? String(s.anim).split(":")[0] : "") : k === "face" ? ("to" in s ? s.face : "") : s.place;
      const id = who || Cutaway.scene.active?.id || "actor";
      return [`actor:${id}`, id, LANE_COL.actor];
    }
    if (["letterbox", "fade", "dissolve", "shake", "caption", "tape"].includes(k)) return ["screen", "screen", LANE_COL.screen];
    if (["music", "stinger", "sfx"].includes(k)) return ["sound", "sound", LANE_COL.sound];
    if (["set", "unset", "inc", "give", "take", "remove", "state", "bag"].includes(k)) return ["state", "state", LANE_COL.state];
    return [`own:${k}`, k, LANE_COL.other];
  }
  /** A step's words on its bar. @param {TimelineStep} r */
  function labelOf(r) {
    const s = r.step, k = r.kind, j = (/** @type {any} */ v) => (typeof v === "string" ? v : JSON.stringify(v));
    if (typeof s === "string") return `“${s}”`;
    switch (k) {
      case "say": return `${"text" in s ? s.say + ": " : ""}“${"text" in s ? s.text : s.say}”`;
      case "narrate": return `“${s.narrate}”`;
      case "wait": return `wait ${s.wait}`;
      case "caption": return s.caption === false ? "caption off" : `“${s.caption}”`;
      case "camera": return s.camera === "follow" ? "follow" : `→ ${j(s.camera)}${s.ease ? " " + s.ease : ""}`;
      case "move": return `${s.to ? "→ " + j(s.to) : "by " + j(s.by)}`;
      case "music": return j(s.music);
      default: return `${k} ${j(s[k])}`.trim();
    }
  }
  /** Bars in rows, so none covers another. @param {Bar[]} bars */
  function rows(bars) {
    /** @type {Bar[][]} */
    const out = [];
    for (const b of bars.sort((a, c) => a.from - c.from)) {
      const end = (/** @type {Bar} */ x) => Math.max(x.to, x.from + (1000 * 14) / pps);   // a mark takes its diamond's room
      const row = out.find((rw) => rw.every((x) => end(x) <= b.from + 0.5 || x.from >= end(b) - 0.5));
      if (row) row.push(b); else out.push([b]);
    }
    return out.length ? out : [[]];
  }
  /** The sequence's lanes, from the trace. @returns {Lane[]} */
  function lanes() {
    if (!tr) return [];
    /** @type {Lane[]} */
    const out = [];
    const shots = tr.shots.map((s, i) => ({ from: s.t, to: tr?.shots[i + 1]?.t ?? tr?.ms ?? s.t, label: s.name, title: `shot "${s.name}" at ${fmt(s.t)}`, color: LANE_COL.shots, shot: s.name }));
    if (shots.length) out.push({ id: "shots", label: "shots", rows: [shots] });
    const rooms = tr.rooms.map((r, i) => ({ from: r.t, to: tr?.rooms[i + 1]?.t ?? tr?.ms ?? r.t, label: r.id, title: `the room ${r.id} from ${fmt(r.t)}`, color: roomColor(r.id), room: r.id,
      rec: tr?.steps.find((s) => s.path === r.path) }));
    if (rooms.length) out.push({ id: "rooms", label: "room", rows: [rooms] });
    /** @type {Map<string, {label: string, bars: Bar[]}>} */
    const by = new Map();
    const order = ["story", "camera", "prop:", "actor:", "screen", "sound", "state", "own:"];
    for (const r of tr.steps) {
      const l = laneOf(r);
      if (!l) continue;
      const [id, label, color] = l;
      if (!by.has(id)) by.set(id, { label, bars: [] });
      by.get(id)?.bars.push({ from: r.start, to: r.until, label: labelOf(r), title: `${labelOf(r)}\n${fmt(r.start)} to ${fmt(r.until)}${r.until > r.end + 1 ? ` (the sequence goes on at ${fmt(r.end)})` : ""}\n${r.path}`, color, rec: r });
    }
    const ids = [...by.keys()].sort((a, b) => {
      const ia = order.findIndex((o) => (o.endsWith(":") ? a.startsWith(o) : a === o)), ib = order.findIndex((o) => (o.endsWith(":") ? b.startsWith(o) : b === o));
      return ia - ib || a.localeCompare(b);
    });
    for (const id of ids) { const l = /** @type {{label: string, bars: Bar[]}} */ (by.get(id)); out.push({ id, label: l.label, rows: rows(l.bars) }); }
    return out;
  }

  // ---- the dock: the transport and the timeline

  const timeText = el("span", { style: { color: "#ffe14a", margin: "0 8px", fontVariantNumeric: "tabular-nums" } });
  const playBtn = button("▶", () => togglePlay(), "play from the playhead (Space); again: pause");
  const loopBtn = button("⟲", () => { loop = !loop; drawBar(); }, "loop between the in and out points");
  const bar = el("div", { style: { height: "26px", display: "flex", alignItems: "center", gap: "2px", padding: "0 6px", borderBottom: "1px solid #2a2340", whiteSpace: "nowrap", overflow: "hidden" } });
  const box = el("div", { style: { position: "absolute", top: "27px", left: "0", right: "0", bottom: "0", overflow: "auto", background: COL.ground, font: "11px Consolas, monospace", color: "#d8d0f0" } });
  const dock = el("div", { style: { position: "relative", width: "100%", height: "100%" } }, [bar, box]);
  const head = el("div", { style: { position: "absolute", left: "0", top: "0", width: "2px", background: COL.play, zIndex: "4", pointerEvents: "none" } });

  function drawBar() {
    const sh = shotTimes();
    bar.replaceChildren(
      playBtn, button("⏮", () => seekTo(0), "to the start (Home)"), button("◀", () => seekTo(sh.filter((t) => t < T - 1).pop() ?? 0), "the shot before (PageUp)"),
      button("▶|", () => { const n = sh.find((t) => t > T + 1); if (n !== undefined) seekTo(n); }, "the next shot (PageDown)"), button("⏭", () => seekTo(tr?.ms ?? 0), "to the end (End)"),
      timeText,
      button("[", () => setIO(0), "the in point at the playhead ([)"), button("]", () => setIO(1), "the out point at the playhead (])"), loopBtn,
      ...(io ? [button("×", () => { io = null; drawBar(); draw(); }, "no in and out points")] : []),
      el("span", { style: { width: "10px" } }), button("−", () => zoom(1 / 1.5), "narrower (-, or the wheel)"), button("+", () => zoom(1.5), "wider (+, or the wheel round the pointer)"),
      button("Fit", fit, "the whole sequence in view (0, or a double click on the ruler)"),
      el("span", { className: "cw-dim", style: { marginLeft: "8px" } }, [tracing ? "tracing…" : seq ? `${seq}: ${fmt(tr?.ms ?? 0)}${tr?.waits === "choice" ? " (stops: a dialogue waits for a choice)" : tr?.waits === "cap" ? " (stops at the cap: something runs on and on)" : ""}` : "pick a sequence (left)"]));
    loopBtn.classList.toggle("on", loop);
    loopBtn.style.color = loop ? "#ffe14a" : "";
    playBtn.textContent = F()?.playing ? "⏸" : "▶";
    showTime();
  }
  function showTime() { timeText.textContent = `${fmt(T)} / ${fmt(tr?.ms ?? 0)}`; }
  const shotTimes = () => (tr ? tr.shots.map((s) => s.t) : []);
  /** @param {0 | 1} i */
  function setIO(i) { const v = io ? [...io] : [0, tr?.ms ?? 0]; v[i] = T; io = v[0] < v[1] ? [v[0], v[1]] : [v[1], v[0]]; drawBar(); draw(); }

  function draw() {
    const L = lanes(), W = px(tr?.ms ?? 0) + 60;
    /** @type {HTMLElement[]} */
    const kids = [];
    let y = HEAD;
    for (const lane of L) {
      lane.rows.forEach((row, k) => {
        kids.push(el("div", { style: { position: "absolute", left: "0", top: `${y}px`, width: `${W}px`, height: `${ROW}px`, pointerEvents: "none" } }, [
          el("div", { title: lane.label, style: { position: "sticky", left: "0", width: `${NAME_W - 4}px`, height: `${ROW}px`, padding: "2px 6px", boxSizing: "border-box", background: COL.ground,
            color: COL.head, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", zIndex: "2", pointerEvents: "auto" } }, [k ? "" : lane.label])]));
        for (const b of row) kids.push(barEl(b, y));
        y += ROW;
      });
      kids.push(el("div", { style: { position: "absolute", left: "0", top: `${y}px`, width: `${W}px`, height: "1px", background: COL.grid } }));
    }
    if (!L.length) kids.push(el("div", { style: { position: "absolute", left: "8px", top: `${HEAD + 8}px`, color: COL.head } }, [seq ? (tracing ? "tracing…" : "nothing traced yet") : "Pick a sequence on the left (or New in the inspector)."]));
    const H = Math.max(y + 10, 60);
    // the ruler: seconds (tenths when there is room), the shot marks, the in and out points
    const ruler = el("div", { title: "click or drag: the playhead; a double click: fit", style: { position: "sticky", top: "0", height: `${HEAD}px`, width: `${W}px`, background: "#16121f", zIndex: "3", cursor: "col-resize", borderBottom: "1px solid #2a2340" } });
    const every = pps >= 400 ? 0.1 : pps >= 120 ? 0.5 : pps >= 40 ? 1 : pps >= 15 ? 5 : 10, span = (tr?.ms ?? 0) / 1000;
    for (let s = 0; s <= span + every; s += every) {
      const whole = Math.abs(s - Math.round(s)) < 1e-6;
      ruler.append(el("div", { style: { position: "absolute", left: `${px(s * 1000)}px`, bottom: "0", width: "1px", height: whole ? "8px" : "4px", background: whole ? COL.head : "#5c5470" } }));
      if (whole || every < 1) ruler.append(el("div", { style: { position: "absolute", left: `${px(s * 1000) + 2}px`, top: "1px", color: whole ? COL.head : "#5c5470", pointerEvents: "none" } }, [every < 1 ? s.toFixed(1) : `${Math.round(s)}s`]));
    }
    for (const sh of tr?.shots ?? []) ruler.append(el("div", { title: `shot "${sh.name}"`, style: { position: "absolute", left: `${px(sh.t) - 3}px`, bottom: "0", width: "0", height: "0", borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: `6px solid ${LANE_COL.shots}` } }));
    /** @type {HTMLElement[]} */
    const under = [];
    for (const sh of tr?.shots ?? []) under.push(el("div", { style: { position: "absolute", left: `${px(sh.t)}px`, top: `${HEAD}px`, width: "1px", height: `${H - HEAD}px`, background: COL.sec } }));
    if (io) under.push(el("div", { style: { position: "absolute", left: `${px(io[0])}px`, top: "0", width: `${px(io[1]) - px(io[0])}px`, height: `${H}px`, background: COL.inout, pointerEvents: "none" } }));
    head.style.height = `${H}px`;
    const keep = [box.scrollLeft, box.scrollTop];
    const content = el("div", { style: { position: "relative", width: `${W}px`, height: `${H - HEAD}px` } }, [...under, ...kids, head]);
    box.replaceChildren(ruler, el("div", { style: { position: "relative", marginTop: `-${HEAD}px`, height: "0" } }), content);
    content.style.marginTop = "0";
    [box.scrollLeft, box.scrollTop] = keep;
    ruler.addEventListener("pointerdown", (e) => { e.preventDefault(); scrub = true; box.setPointerCapture(e.pointerId); seekTo(snap(msAt(e.clientX - box.getBoundingClientRect().left + box.scrollLeft), e)); });
    ruler.addEventListener("dblclick", fit);
    placeHead();
  }
  function placeHead() { head.style.left = `${px(T) - 1}px`; head.style.top = "0"; showTime(); }

  /** A bar on the timeline (a mark: a diamond). @param {Bar} b @param {number} y */
  function barEl(b, y) {
    const on = !!b.rec && b.rec.path === sel && !b.shot && !b.room, mark = b.to - b.from < STEP;
    const x0 = px(b.from), w = mark ? 9 : Math.max(3, px(b.to) - x0 - 1), lenKey = b.rec && !b.shot && !b.room ? F().edits.lengthKey(b.rec.step) : null;
    const d = el("div", { title: b.title, style: { position: "absolute", left: `${mark ? x0 - 4 : x0}px`, top: `${y + 2}px`, width: `${w}px`, height: `${ROW - 4}px`, boxSizing: "border-box",
      background: b.rec?.kind === "wait" ? "transparent" : b.color, border: `1px solid ${on ? COL.sel : b.rec?.kind === "wait" ? "#6a5a40" : "rgba(0,0,0,.5)"}`, outline: on ? `1px solid ${COL.sel}` : "",
      borderRadius: mark ? "0" : "2px", transform: mark ? "rotate(45deg) scale(0.75)" : "", overflow: "clip", whiteSpace: "nowrap", lineHeight: `${ROW - 6}px`, color: "#fff",
      textShadow: "0 1px 0 #000", cursor: "pointer", zIndex: "1" } },
      mark ? [] : [el("span", { style: { position: "sticky", left: `${NAME_W + 2}px`, padding: "0 3px" } }, [b.label])]);
    if (mark) d.append(el("span", { style: { position: "absolute", left: "12px", top: "-1px", transform: "rotate(-45deg)", transformOrigin: "left", color: "#cfc6e8", pointerEvents: "none" } }, []));
    d.addEventListener("pointermove", (e) => { if (!drag) d.style.cursor = lenKey && !mark && e.offsetX > d.clientWidth - 5 ? "ew-resize" : b.shot || b.room ? "pointer" : "grab"; });
    d.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      if (b.shot !== undefined || b.room !== undefined) {
        if (b.rec) { sel = b.rec.path; E.refresh(); }
        else if (b.shot) { const st = tr?.steps.find((s) => s.kind === "shot" && s.step.shot === b.shot); if (st) sel = st.path; E.refresh(); }
        seekTo(b.from);
        return;
      }
      if (!b.rec) return;
      const mode = lenKey && !mark && e.offsetX > d.clientWidth - 5 ? "len" : "body";
      drag = { rec: b.rec, el: d, x0: e.clientX, left: parseFloat(d.style.left), width: parseFloat(d.style.width), mode, d: 0, alt: e.altKey };
      box.setPointerCapture(e.pointerId);
    });
    d.addEventListener("dblclick", (e) => { e.stopPropagation(); if (b.rec) seekTo(b.rec.start); });
    return d;
  }

  /** @type {{rec: TimelineStep, el: HTMLElement, x0: number, left: number, width: number, mode: "len" | "body", d: number, alt: boolean} | null} */
  let drag = null;
  let scrub = false;
  /** @type {{path: string, at: number} | null} the bar clicked last */
  let lastClick = null;
  box.addEventListener("pointermove", (e) => {
    if (scrub) { seekTo(snap(msAt(e.clientX - box.getBoundingClientRect().left + box.scrollLeft), e)); return; }
    const g = drag;
    if (!g) return;
    const raw = ((e.clientX - g.x0) / pps) * 1000, r = g.rec;
    // the edge it moves (its start, or its end) snaps; the change is what that gives
    g.d = g.mode === "len" ? snap(r.until + raw, e) - r.until : snap(r.start + raw, e) - r.start;
    g.alt = e.altKey;
    if (g.mode === "len") g.el.style.width = `${Math.max(3, g.width + (g.d / 1000) * pps)}px`;
    else g.el.style.left = `${g.left + (g.d / 1000) * pps}px`;
    E.setCursor(`${g.mode === "len" ? "length" : instant(r) && !g.alt ? "at" : "everything after"} ${g.d >= 0 ? "+" : ""}${Math.round(g.d)} ms → ${fmt(g.mode === "len" ? r.until + g.d : r.start + g.d)}`);
  });
  box.addEventListener("pointerup", () => {
    if (scrub) { scrub = false; return; }
    const g = drag;
    drag = null;
    if (!g) return;
    E.setCursor(null);
    if (Math.abs(g.d) < 1) {
      // a click picks it; a second one soon goes to its start (picked, the bars are drawn again: no double click of the browser's)
      const now = performance.now(), twice = lastClick?.path === g.rec.path && now - lastClick.at < 450;
      lastClick = { path: g.rec.path, at: now };
      sel = g.rec.path; E.refresh(); draw();
      if (twice) seekTo(g.rec.start);
      return;
    }
    sel = g.rec.path;
    const r = g.rec, ed = F().edits, S = steps();
    let next = null, what = "";
    if (g.mode === "len") {
      const key = ed.lengthKey(r.step), s = stepAt(r.path), now = typeof s?.[key ?? ""] === "number" ? s[key ?? ""] : key === "dissolve" ? 800 : "fade" in (s ?? {}) ? 400 : 0;
      next = ed.length(S, /** @type {TimelineTrace} */ (tr), r.path, Math.max(0, now + g.d)); what = `length ${Math.round(Math.max(0, now + g.d))} ms`;
    } else if (instant(r) && !g.alt) { next = ed.move(S, /** @type {TimelineTrace} */ (tr), r.path, r.start + g.d); what = `moved to ${fmt(r.start + g.d)}`; }
    else { next = ed.ripple(S, /** @type {TimelineTrace} */ (tr), r.path, g.d); what = `${g.d > 0 ? "later" : "earlier"} by ${Math.abs(Math.round(g.d))} ms, and all after it`; }
    if (!next) { E.setStatus("sequences: that can't change so (no wait before it to take from)"); draw(); return; }
    commit(next, what);
  });
  /** Takes it no time in the sequence's flow (it goes on at once)? @param {TimelineStep} r */
  const instant = (r) => r.end - r.start < STEP / 2;
  /** A time snapped: to 50 ms; Shift: not at all; Ctrl: to the bars' edges and the shot marks near it. @param {number} ms @param {{shiftKey: boolean, ctrlKey: boolean}} e */
  function snap(ms, e) {
    if (e.shiftKey) return Math.round(ms);
    if (e.ctrlKey && tr) {
      const edges = [...tr.shots.map((s) => s.t), ...tr.steps.flatMap((s) => [s.start, s.end, s.until]), 0, tr.ms];
      const near = edges.reduce((a, b) => (Math.abs(b - ms) < Math.abs(a - ms) ? b : a), Infinity);
      if (Math.abs(near - ms) * pps / 1000 < 8) return Math.round(near);
    }
    return Math.round(ms / 50) * 50;
  }

  /** @param {number} f @param {number} [at] the px from the box's left edge that stays */
  function zoom(f, at = box.clientWidth / 2) {
    const ms = msAt(box.scrollLeft + at);
    pps = Math.min(2000, Math.max(4, pps * f));
    try { localStorage.setItem(KEY, String(pps)); } catch { /* private mode */ }
    draw();
    box.scrollLeft = Math.max(0, px(ms) - at);
  }
  function fit() {
    if (!tr) return;
    pps = Math.min(2000, Math.max(4, (box.clientWidth - NAME_W - 30) / Math.max(1, tr.ms / 1000)));
    try { localStorage.setItem(KEY, String(pps)); } catch { /* private mode */ }
    draw(); box.scrollLeft = 0;
  }
  box.addEventListener("wheel", (e) => {
    if (e.shiftKey || !e.deltaY) return;
    e.preventDefault(); e.stopPropagation();
    zoom(Math.exp(-e.deltaY * 0.002), e.clientX - box.getBoundingClientRect().left);
  }, { passive: false });
  box.addEventListener("pointerdown", (e) => {
    // off a bar: the playhead goes there
    if (e.button !== 0 || e.target === box) return;
    const x = e.clientX - box.getBoundingClientRect().left + box.scrollLeft;
    if (x < NAME_W) return;
    scrub = true; box.setPointerCapture(e.pointerId);
    seekTo(snap(msAt(x), e));
  });

  // ---- the sequence: traced, sought, played

  /** @type {string | null} the room the inspector's map shows */
  let mapRoom = null;
  /** @type {number | null} the latest moment asked for while a seek was under way */
  let wanted = null, seeking = false;
  /** Show the sequence at ms (a drag asks often: only the latest is sought). @param {number} ms */
  async function seekTo(ms) {
    if (!seq || !tr) return;
    if (F().playing) { F().pause(); drawBar(); }
    wanted = Math.max(0, Math.min(ms, tr.ms));
    T = wanted; placeHead();
    if (seeking) return;
    seeking = true;
    try {
      while (wanted !== null) { const m = wanted; wanted = null; T = await F().seek(seq, m); }
    } catch (e) { E.setStatus("sequences: " + /** @type {any} */ (e).message); }
    seeking = false;
    placeHead();
    keepInView();
    // another room at this moment: the inspector's map is of it
    if (Cutaway.scene.room?.id !== mapRoom) { mapRoom = Cutaway.scene.room?.id ?? null; E.refresh(); } else mapDraw();
  }
  function keepInView() { const x = px(T); if (x < box.scrollLeft + NAME_W || x > box.scrollLeft + box.clientWidth - 20) box.scrollLeft = Math.max(0, x - NAME_W - 40); }

  /** Trace the sequence again (after a change, or picked) and show it at the moment it stood at. */
  async function retrace() {
    if (!seq) return;
    const id = seq;
    tracing = true; drawBar();
    try {
      E.pause(true);
      tr = await F().trace(id);
      note = "";
    } catch (e) { tr = null; note = /** @type {any} */ (e).message; E.setStatus("sequences: " + note); }
    tracing = false;
    if (seq !== id) return;
    if (tr) { T = Math.min(T, tr.ms); await seekTo(T); }
    drawBar(); draw(); E.refresh();
  }

  function togglePlay() {
    const f = F();
    if (!seq || !tr) return;
    if (f.playing) { f.pause(); drawBar(); return; }
    if (f.ended || T >= tr.ms - 1) { seekTo(io ? io[0] : 0).then(() => { f.play(); drawBar(); }); return; }
    if (io && (T < io[0] || T >= io[1])) { seekTo(io[0]).then(() => { f.play(); drawBar(); }); return; }
    f.play(); drawBar();
  }
  let offTime = () => {};
  /** @param {number} t */
  function onTime(t) {
    T = t; placeHead(); keepInView();
    if (io && loop && t >= io[1]) { const s = io[0]; F().pause(); seekTo(s).then(() => { F().play(); drawBar(); }); return; }
    if (!F().playing) drawBar();
    mapDraw();
  }

  /** Pick a sequence: traced from the start. @param {string} id */
  async function pick(id) {
    if (seq === id && tr) return;
    if (F().active && seq !== id) await F().close();
    seq = id; sel = null; T = 0; io = null; tr = null;
    E.refresh(); drawBar(); draw();
    await retrace();
    fit();
  }

  /** The tab was left (or the editor closed): the game as it was. */
  async function leave() { if (F()?.active) { await F().close(); } }
  setInterval(() => { if (F()?.active && !F().busy && (!E.isOpen || E.activeTab !== "sequences")) leave(); }, 300);

  // ---- changes: into the game, and into the game's file where the sequence is written (only the steps that
  // changed; its comments and layout stay), else into the edits layer; undo and redo

  /** @typedef {{id: string, before: string, after: string, file?: {path: string, before: string, after: string}}} SequenceEdit */
  /** @type {Set<string>} the game's files this tab changed (their text is the editor's one, E.files) */
  const touched = new Set();
  const L = () => E.modules.literal;
  /** A script's address as a path in the game's folder ("game/intro.js"), or null. @param {string} url */
  function relPath(url) {
    try {
      const u = new URL(url, location.href), base = new URL(".", location.href);
      if (u.origin === base.origin && u.pathname.startsWith(base.pathname)) return decodeURIComponent(u.pathname.slice(base.pathname.length));
    } catch { /* not an address */ }
    return null;
  }
  /** Where a sequence is written: its file in the game's folder (null: in the edits layer, or nowhere known). @param {string} id */
  function where(id) { const s = Cutaway.sequence.source?.(id); return s ? relPath(s.file) : null; }

  /** The `steps` list of a sequence's call in a file's text. @param {string} src @param {string} id */
  function stepsNode(src, id) {
    const m = new RegExp(`Cutaway\\.sequence\\s*\\(\\s*["'\`]${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).exec(src);
    if (!m) return null;
    const c = L()?.call(src, L().lineOf(src, m.index), /Cutaway\.sequence\s*\(/), o = c?.args[1], n = o?.t === "obj" ? L().field(o, "steps") : null;
    return n?.t === "arr" ? n : null;
  }
  /**
   * The file's text with the sequence's steps changed from the live ones to `next`, or why not.
   * @param {string} src @param {string} id @param {any[]} next @returns {{text: string} | {why: string}}
   */
  function fileText(src, id, next) {
    const n = stepsNode(src, id);
    if (!n) return { why: "its steps aren't a list written in the file" };
    // only the steps that changed (editor-literal.js): comments and layout stay
    return L().replaceList(src, n, steps(), next, (/** @type {string} */ text) => stepsNode(text, id));
  }

  /** @param {any[]} next @param {string} what */
  async function commit(next, what) {
    if (!seq) return;
    const id = seq, before = JSON.stringify(steps()), after = JSON.stringify(next);
    if (before === after) { draw(); return; }
    /** @type {SequenceEdit} */
    const ed = { id, before, after };
    const path = where(id);
    let why = !E.studio.available ? "no studio" : !path ? "it isn't written in a file of the game" : Cutaway.edits.changed("sequences", id, ["steps"]) ? "the edits layer has its steps" : "";
    if (!why && path && L()) {
      try {
        const src = await E.files.read(path), r = fileText(src, id, next);
        if ("text" in r) ed.file = { path, before: src, after: r.text }; else why = r.why;
      } catch (e) { why = /** @type {any} */ (e).message; }
    }
    undo.push(ed); if (undo.length > 200) undo.shift();
    redo = [];
    if (!put(ed, true)) { undo.pop(); E.setStatus(`sequences: ${id}: ${ed.file?.path} changed meanwhile: try again`); return; }
    E.setStatus(`sequences: ${id}: ${what} ${ed.file ? `in ${ed.file.path}` : `in the edits layer${why ? ` (${why})` : ""}`} (not saved: Ctrl+S)`);
  }
  /**
   * An edit done (true) or undone; false when its file's text isn't what the edit was made on (changed since in another
   * tab or read again from the disk): nothing is done then. @param {SequenceEdit} ed @param {boolean} on
   */
  function put(ed, on) {
    const v = JSON.parse(on ? ed.after : ed.before);
    if (ed.file) {
      if (E.files.text(ed.file.path) !== (on ? ed.file.before : ed.file.after)) return false;
      E.files.set(ed.file.path, on ? ed.file.after : ed.file.before);
      touched.add(ed.file.path);
      const d = Cutaway.sequence.get(ed.id);
      if (d) d.steps = v;
    } else {
      Cutaway.edits.change("sequences", ed.id, { steps: v });
      dirty = true;
      E.modules.things?.touch?.();
    }
    if (seq !== ed.id) { pick(ed.id); return true; }
    retrace();
    return true;
  }
  /** @param {SequenceEdit[]} from @param {SequenceEdit[]} to @param {boolean} fwd */
  function step(from, to, fwd) {
    const u = from.pop();
    if (!u) return;
    if (put(u, fwd)) { to.push(u); return; }
    // the file isn't what these edits were made on: none of them can be taken back or done again in it
    undo = []; redo = [];
    E.setStatus(`sequences: ${u.file?.path} was changed since (in another tab, or read again from the disk): there is nothing to ${fwd ? "redo" : "undo"} here`);
    E.refresh();
  }
  const unsavedFiles = () => [...touched].filter((p) => E.files.unsaved(p)).length;
  async function save() {
    const out = [];
    for (const path of touched) if (E.files.unsaved(path)) out.push(await E.files.save(path) ? path : `${path} (not saved)`);
    if (dirty) {
      const th = E.modules.things;
      if (th?.save) { if (await th.save()) { dirty = false; out.push("the edits layer"); } else out.push("the edits layer (not saved)"); } else E.setStatus("sequences: saving the edits layer needs the Things tab");
    }
    E.setStatus(out.length ? `sequences: saved ${out.join(", ")}` : "sequences: nothing to save");
    E.refresh();
  }
  /** Replace the picked step with these (none: it goes). @param {string} path @param {any[]} list */
  function replace(path, list) {
    if (!tr) return;
    const out = JSON.parse(JSON.stringify(steps())), at = F().edits.locate(out, tr, path);
    if (!at) return;
    at.list.splice(at.index, 1, ...list);
    if (!list.length) sel = null;
    commit(out, list.length ? "step changed" : "step removed");
  }
  function del() {
    if (!sel || !tr) return;
    const next = F().edits.remove(steps(), tr, sel);
    if (!next) return;
    sel = null;
    commit(next, "step taken out (its time stays as a wait)");
  }
  /** Add a step at the playhead. @param {any} s */
  function add(s) {
    if (!seq || !tr) return;
    const next = F().edits.insert(steps(), tr, T, s);
    if (!next) return;
    commit(next, `${F().kindOf(s)} added at ${fmt(T)}`);
    // the new step: where its kind first appears at the playhead after the trace
    const k = F().kindOf(s);
    setTimeout(() => { const r = tr?.steps.filter((x) => x.kind === k && Math.abs(x.start - T) < 60).pop(); if (r) { sel = r.path; E.refresh(); draw(); } }, 400);
  }
  /** New steps to add, by what they do. */
  function addable() {
    const cam = Cutaway.scene.camera, room = Cutaway.scene.room;
    const prop = room?.props?.find((p) => p.id)?.id ?? "";
    const actor = Cutaway.scene.active?.id ?? Cutaway.actors.all()[0]?.id ?? "";
    /** @type {[string, string, () => any][]} */
    const out = [
      ["caption", "a caption in a corner, held 2.5 s (the sequence goes on meanwhile)", () => ({ caption: "…", at: "bl", ms: 2500, wait: false })],
      ["sound", "a sound", () => ({ sfx: Cutaway.sfx.names().find((n) => !n.startsWith("_")) ?? "" })],
      ["camera", "the camera drives from where it is now, 2 s (the sequence goes on meanwhile)", () => ({ camera: [Math.round(cam.x), Math.round(cam.y)], ms: 2000, ease: "inOut", wait: false })],
      ...(prop ? /** @type {[string, string, () => any][]} */ ([["move prop", `move ${prop} by 20 px over 1 s`, () => ({ move: prop, by: [20, 0], ms: 1000, wait: false })]]) : []),
      ["fade", "the screen to black over 0.6 s", () => ({ fade: "out", ms: 600, wait: false })],
      ["letterbox", "the bars in over 0.6 s", () => ({ letterbox: true, ms: 600, wait: false })],
      ["shot", "a shot mark (Space skips to it)", () => ({ shot: `shot${(tr?.shots.length ?? 0) + 1}` })],
      ["room", "cut to a room (this one)", () => ({ goto: room?.id ?? "", transition: false })],
      ...(actor ? /** @type {[string, string, () => any][]} */ ([["line", `a line of ${actor} (the sequence waits for it)`, () => ({ say: actor, text: "…" })]]) : []),
      ["wait", "a second more (everything after moves)", () => ({ wait: 1000 })],
      ["music", "the music: a theme", () => ({ music: { theme: Cutaway.score?.ids?.()[0] ?? "" } })],
      ["JSON…", "any step, written as JSON (a game's own action too)", () => { const t = prompt("A step as JSON:", '{ "wait": 500 }'); if (!t) return null; try { return JSON.parse(t); } catch { E.setStatus("sequences: that isn't JSON"); return null; } }],
    ];
    return out;
  }
  /** A new sequence of its own, in the edits layer: a shot in this room. */
  async function newSequence() {
    const id = prompt("The new sequence's id (letters, digits, _):", "cutscene");
    if (!id) return;
    if (!/^[A-Za-z_][\w-]*$/.test(id)) { E.setStatus("sequences: an id of letters, digits, _ and -"); return; }
    if (Cutaway.sequence.get(id)) { E.setStatus(`sequences: there is a sequence "${id}" already`); return; }
    await leave();                                          // the room the game is in, not the sequence's
    seq = null; tr = null;
    const room = Cutaway.scene.room?.id ?? Cutaway.room.ids()[0];
    Cutaway.edits.change("sequences", id, { steps: [{ shot: "a" }, { goto: room, transition: false }, { letterbox: true, ms: 600 }, { wait: 2000 }, { letterbox: false, ms: 600 }] });
    dirty = true; E.modules.things?.touch?.();
    E.setStatus(`sequences: the sequence "${id}" made (in the edits layer; File > Save keeps it). Play it with { sequence: "${id}" }`);
    pick(id);
  }

  // ---- the room's map: the camera's frames and a moved prop's goal

  const map = /** @type {HTMLCanvasElement} */ (el("canvas", { width: 320, height: 180, title: "the whole room: drag the picked camera step's frame (or a moved prop's goal)", style: { width: "100%", imageRendering: "pixelated", background: "#000", cursor: "crosshair", display: "block", marginTop: "4px" } }));
  const mapNote = el("div", { className: "cw-dim", style: { display: "none" } }, ["This room has no picture of its own (the game draws it over the scene): no map to place the camera on."]);
  /** @type {HTMLCanvasElement | null} */ let whole = null;
  /** @type {{kind: "camera" | "prop", path: string, dx: number, dy: number, at: [number, number]} | null} */ let mapDrag = null;
  /** The camera steps of the shot the playhead is in, in order. */
  function shotCams() {
    if (!tr) return [];
    const sh = tr.shots.filter((s) => s.t <= T + 1).pop(), next = tr.shots.find((s) => s.t > T + 1);
    return tr.steps.filter((s) => s.kind === "camera" && Array.isArray(s.step.camera) && s.start >= (sh?.t ?? 0) - 1 && s.start < (next?.t ?? Infinity));
  }
  /** The goal of a moved prop's step (to, or by from where it stands in the room's data). @param {any} s */
  function propGoal(s) {
    const p = Cutaway.scene.room?.props?.find((q) => q.id === s.move);
    if (!p) return null;
    const at = /** @type {[number, number]} */ ([p.at[0], p.at[1]]);
    return { from: at, to: /** @type {[number, number]} */ (s.to ? [s.to[0], s.to[1]] : [at[0] + (s.by?.[0] ?? 0), at[1] + (s.by?.[1] ?? 0)]) };
  }
  function mapDraw() {
    const r = Cutaway.scene.room;
    if (!r || !map.isConnected) return;
    const W = Cutaway.display.width, H = Cutaway.display.height, [rw, rh] = r.size ?? [W, H];
    if (!whole || whole.width !== rw || whole.height !== rh) { whole = document.createElement("canvas"); whole.width = rw; whole.height = rh; }
    const g = /** @type {CanvasRenderingContext2D} */ (whole.getContext("2d", { willReadFrequently: true })), cam = Cutaway.scene.camera;
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#000"; g.fillRect(0, 0, rw, rh);
    g.save(); g.translate(Math.round(cam.x), Math.round(cam.y)); Cutaway.scene.render(g); g.restore();
    const k = Math.max(1, Math.floor(Math.min(680 / rw, 400 / rh) * 2) / 2), pad = 2;
    map.width = Math.round(rw * k) + pad * 2; map.height = Math.round(rh * k) + pad * 2;
    const c = /** @type {CanvasRenderingContext2D} */ (map.getContext("2d"));
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#0e0b14"; c.fillRect(0, 0, map.width, map.height);
    c.drawImage(whole, pad, pad, rw * k, rh * k);
    /** @param {number} x @param {number} y @param {string} col @param {boolean} [dash] */
    const frame = (x, y, col, dash) => { c.save(); c.strokeStyle = col; c.lineWidth = 1; if (dash) c.setLineDash([3, 3]); c.strokeRect(pad + x * k + 0.5, pad + y * k + 0.5, W * k - 1, H * k - 1); c.restore(); };
    let prev = null;
    for (const cs of shotCams()) {
      const s = stepAt(cs.path) ?? cs.step, [x, y] = mapDrag?.kind === "camera" && mapDrag.path === cs.path ? mapDrag.at : s.camera;
      if (prev) { c.strokeStyle = "rgba(122,216,255,.6)"; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(pad + (prev[0] + W / 2) * k, pad + (prev[1] + H / 2) * k); c.lineTo(pad + (x + W / 2) * k, pad + (y + H / 2) * k); c.stroke(); c.setLineDash([]); }
      frame(x, y, cs.path === sel ? COL.sel : "#7ad8ff", cs.path !== sel);
      prev = [x, y];
    }
    frame(Math.round(cam.x), Math.round(cam.y), "#ffffff");
    const s = stepAt(sel);
    if (s && typeof s === "object" && "move" in s) {
      const pg = propGoal(s);
      if (pg) {
        const to = /** @type {[number, number]} */ (mapDrag?.kind === "prop" ? mapDrag.at : pg.to);
        c.strokeStyle = COL.sel; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(pad + pg.from[0] * k, pad + pg.from[1] * k); c.lineTo(pad + to[0] * k, pad + to[1] * k); c.stroke(); c.setLineDash([]);
        c.fillStyle = COL.sel; c.fillRect(pad + to[0] * k - 3, pad + to[1] * k - 3, 7, 7);
      }
    }
    map.dataset.k = String(k);
    // a room without a picture of its own (the game draws it over the scene): no map to place anything on
    const d = g.getImageData(0, 0, rw, rh).data, flat = [...Array(64)].every((_, i) => {
      const x = Math.floor(((i % 8) + 0.5) * rw / 8), y = Math.floor((Math.floor(i / 8) + 0.5) * rh / 8), o = (y * rw + x) * 4;
      return d[o] === d[0] && d[o + 1] === d[1] && d[o + 2] === d[2];
    });
    map.style.display = flat ? "none" : "block";
    mapNote.style.display = flat ? "" : "none";
  }
  /** A pointer on the map in room pixels. @param {PointerEvent} e */
  function mapAt(e) { const b = map.getBoundingClientRect(), k = Number(map.dataset.k) || 1, sx = map.width / b.width; return { x: ((e.clientX - b.left) * sx - 2) / k, y: ((e.clientY - b.top) * sx - 2) / k }; }
  map.addEventListener("pointerdown", (e) => {
    const p = mapAt(e), W = Cutaway.display.width, H = Cutaway.display.height, s = stepAt(sel);
    if (s && typeof s === "object" && "move" in s) {
      const pg = propGoal(s);
      if (pg && Math.hypot(p.x - pg.to[0], p.y - pg.to[1]) < 8) { mapDrag = { kind: "prop", path: /** @type {string} */ (sel), dx: pg.to[0] - p.x, dy: pg.to[1] - p.y, at: pg.to }; map.setPointerCapture(e.pointerId); return; }
    }
    // a camera frame of the shot: the picked one first, else the one under the pointer gets picked
    const cams = shotCams().map((cs) => ({ cs, s: stepAt(cs.path) ?? cs.step }));
    const hit = cams.find((q) => q.cs.path === sel && inside(p, q.s.camera, W, H)) ?? cams.slice().reverse().find((q) => inside(p, q.s.camera, W, H));
    if (!hit) return;
    if (hit.cs.path !== sel) { sel = hit.cs.path; E.refresh(); draw(); }
    mapDrag = { kind: "camera", path: hit.cs.path, dx: hit.s.camera[0] - p.x, dy: hit.s.camera[1] - p.y, at: [hit.s.camera[0], hit.s.camera[1]] };
    map.setPointerCapture(e.pointerId);
  });
  /** @param {{x: number, y: number}} p @param {number[]} c @param {number} W @param {number} H */
  const inside = (p, c, W, H) => p.x >= c[0] && p.y >= c[1] && p.x < c[0] + W && p.y < c[1] + H;
  map.addEventListener("pointermove", (e) => {
    const g = mapDrag, r = Cutaway.scene.room;
    if (!g || !r) return;
    const p = mapAt(e), W = Cutaway.display.width, H = Cutaway.display.height, [rw, rh] = r.size ?? [W, H];
    let x = Math.round(p.x + g.dx), y = Math.round(p.y + g.dy);
    if (g.kind === "camera") { x = Math.max(0, Math.min(rw - W, x)); y = Math.max(0, Math.min(rh - H, y)); }
    g.at = [x, y];
    E.setCursor(`${g.kind === "camera" ? "camera" : "goal"} ${x}, ${y}`);
    mapDraw();
  });
  map.addEventListener("pointerup", () => {
    const g = mapDrag;
    mapDrag = null;
    if (!g) return;
    E.setCursor(null);
    const s = stepAt(g.path);
    if (!s || typeof s !== "object") return;
    const n = { ...s };
    if (g.kind === "camera") { if (n.camera[0] === g.at[0] && n.camera[1] === g.at[1]) return; n.camera = g.at; }
    else {
      const pg = propGoal(s);
      if (!pg) return;
      if (s.to) n.to = g.at; else n.by = [g.at[0] - pg.from[0], g.at[1] - pg.from[1]];
    }
    replace(g.path, [n]);
  });

  // ---- on the picture: the picked camera step's frame; a click puts a picked caption in a corner

  /** @param {CanvasRenderingContext2D} ctx */
  function render(ctx) {
    if (!seq) return;
    const s = stepAt(sel);
    if (!s || typeof s !== "object" || !Array.isArray(s.camera)) return;
    const W = Cutaway.display.width, H = Cutaway.display.height;
    ctx.fillStyle = COL.sel;
    for (let x = 0; x < W; x += 4) { ctx.fillRect(s.camera[0] + x, s.camera[1], 2, 1); ctx.fillRect(s.camera[0] + x, s.camera[1] + H - 1, 2, 1); }
    for (let y = 0; y < H; y += 4) { ctx.fillRect(s.camera[0], s.camera[1] + y, 1, 2); ctx.fillRect(s.camera[0] + W - 1, s.camera[1] + y, 1, 2); }
  }
  /** @param {{x: number, y: number}} p */
  function pickOn(p) {
    const s = stepAt(sel);
    if (!sel || !s || typeof s !== "object" || !("caption" in s) || s.caption === false) return;
    const cam = Cutaway.scene.camera, W = Cutaway.display.width, H = Cutaway.display.height, x = (p.x - cam.x) / W, y = (p.y - cam.y) / H;
    const at = x > 0.33 && x < 0.67 && y > 0.33 && y < 0.67 ? "c" : `${y < 0.5 ? "t" : "b"}${x < 0.5 ? "l" : "r"}`;
    if ((s.at ?? "bl") === at) return;
    replace(sel, [{ ...s, at }]);
  }

  // ---- the left panel and the inspector

  /** @param {HTMLElement} left */
  function browse(left) {
    /** @type {ListItem[]} */
    const items = [];
    for (const id of Cutaway.sequence.ids()) {
      items.push({ key: `seq:${id}`, label: id, group: "sequences", mark: Cutaway.edits.changed("sequences", id) ? "●" : "" });
      if (id === seq && tr) for (const s of tr.shots) items.push({ key: `shot:${s.name}`, label: `${s.name}   ${fmt(s.t)}`, group: `shots of ${id}`, title: `go to the shot "${s.name}"` });
    }
    left.append(E.fold("left.sequences", "SEQUENCES", () => [E.list({ id: "sequences.left", items, selected: seq ? `seq:${seq}` : undefined, empty: "this game has no sequence (New in the inspector)",
      pick: (k) => { if (k.startsWith("seq:")) pick(k.slice(4)); else { const s = tr?.shots.find((x) => `shot:${x.name}` === k); if (s) seekTo(s.t); } } })]));
  }

  /** @param {HTMLElement} panel */
  function build(panel) {
    if (!F()) { panel.append(el("div", { className: "cw-dim" }, ["timeline.js isn't loaded (the editor loads it next to editor.js)."])); return; }
    panel.append(el("div", { style: { margin: "4px 0" } }, [
      button("New sequence", newSequence, "a sequence of its own, in the edits layer: a shot in this room"),
      ...(seq ? [button("▶ Play in the game", () => { leave().then(() => E.playSequence(/** @type {string} */ (seq))); }, "as the player sees it (the sequence's picture goes back first)"),
        button("Things", () => { E.modules.things?.reveal?.("", `seq:${seq}`, ["steps"]); E.show("things"); }, "its steps as blocks in the Things tab")] : []),
      ...(dirty || unsavedFiles() || undo.length ? [button(`Save${dirty || unsavedFiles() ? " *" : ""}`, () => { save(); }, "write the edits layer (Ctrl+S)"), button("Undo", () => step(undo, redo, false), "Ctrl+Z"), button("Redo", () => step(redo, undo, true), "Ctrl+Y")] : [])]));
    if (!seq) {
      panel.append(el("div", { className: "cw-dim" }, ["A sequence on a timeline: pick one on the left. The picture shows the sequence at the playhead; Space plays from there. Drag a bar's end for its length, a bar to move it (with Alt: and all after it); add steps at the playhead here."]));
      return;
    }
    if (note) panel.append(el("div", { style: { color: "#ff9a6a", margin: "4px 0" } }, [note]));
    if (tr?.waits) panel.append(el("div", { style: { color: "#ffd27a", margin: "4px 0" } }, [tr.waits === "choice" ? "The sequence stops where a dialogue waits for the player's choice: what comes after isn't traced." : "The sequence stops at the cap (10 minutes): something runs on and on (a loop, a wait for an event)."]));
    panel.append(el("div", { className: "cw-sec cw-h" }, [`add at ${fmt(T)}`]));
    panel.append(el("div", { style: { display: "flex", flexWrap: "wrap", gap: "2px" } }, addable().map(([label, title, make]) => button(label, () => { const s = make(); if (s) add(s); }, title))));
    const r = recOf(sel), s = stepAt(sel);
    if (sel && r && s !== undefined) {
      panel.append(el("div", { className: "cw-sec cw-h" }, [`${r.kind}  ${r.path}`]));
      panel.append(el("div", { className: "cw-dim" }, [`from ${fmt(r.start)} to ${fmt(r.end)}${r.until > r.end + 1 ? `, running on to ${fmt(r.until)}` : ""} (${Math.round(r.until - r.start)} ms)${r.branch ? `; took "${r.branch}"` : ""}`]));
      const S = E.modules.script;
      if (S) panel.append(S.blocks({ id: `sequences:${seq}:${sel}`, value: [s], change: (/** @type {any[]} */ v) => { const p = sel; if (p) replace(p, v); } }).el);
      panel.append(el("div", { style: { margin: "4px 0" } }, [button("Go to its start", () => seekTo(r.start), "the playhead to where it begins (or a double click on its bar)"),
        button("Take it out", del, "Delete: its time stays as a wait")]));
      if (s && typeof s === "object" && "caption" in s) panel.append(el("div", { className: "cw-dim" }, ["A click on the picture puts it in that corner (the middle: in the middle)."]));
    }
    if (Cutaway.scene.room) {
      mapRoom = Cutaway.scene.room.id;
      panel.append(el("div", { className: "cw-sec cw-h" }, [`the room: ${Cutaway.scene.room.id}`]));
      panel.append(map, mapNote);
      panel.append(el("div", { className: "cw-dim" }, ["White: the camera now. Cyan: the camera steps of this shot (a click picks one, drag it: its goal). Yellow: the picked one; a moved prop's goal as a square."]));
      requestAnimationFrame(mapDraw);
    }
    panel.append(el("div", { className: "cw-dim", style: { marginTop: "8px" } }, [
      "Keys: Space play/pause, Home/End, ←/→ a frame (Shift: a second), PageUp/PageDown the shots, [ and ] in and out, Delete takes the step out. Drag snaps to 50 ms; Shift: not at all; Ctrl: to the other bars' edges and the shots. The wheel zooms round the pointer; Shift+wheel scrolls."]));
  }

  E.tab({
    id: "sequences", label: "Sequences", build, browse, render, pick: (p) => pickOn(p),
    dock: () => { if (!offTimeSet) { offTime = F()?.onTime(onTime) ?? offTime; offTimeSet = true; E.pause(true); if (!tr) { drawBar(); draw(); } } return dock; },
    save: () => save(), undo: () => step(undo, redo, false), redo: () => step(redo, undo, true), del,
    selectNone: () => { sel = null; E.refresh(); draw(); },
    key(e) {
      if (!seq) return false;
      const fr = 1000 / 60;
      if (e.code === "Space") { togglePlay(); return true; }
      if (e.code === "Home") { seekTo(0); return true; }
      if (e.code === "End") { seekTo(tr?.ms ?? 0); return true; }
      if (e.code === "ArrowLeft") { seekTo(T - (e.shiftKey ? 1000 : fr)); return true; }
      if (e.code === "ArrowRight") { seekTo(T + (e.shiftKey ? 1000 : fr)); return true; }
      if (e.code === "PageUp") { seekTo(shotTimes().filter((t) => t < T - 1).pop() ?? 0); return true; }
      if (e.code === "PageDown") { const n = shotTimes().find((t) => t > T + 1); if (n !== undefined) seekTo(n); return true; }
      if (e.key === "[") { setIO(0); return true; }
      if (e.key === "]") { setIO(1); return true; }
      if (e.key === "+" || e.code === "NumpadAdd" || e.code === "Equal") { zoom(1.5); return true; }
      if (e.key === "-" || e.code === "NumpadSubtract" || e.code === "Minus") { zoom(1 / 1.5); return true; }
      if (e.code === "Digit0" || e.code === "Numpad0") { fit(); return true; }
      return false;
    },
    get unsaved() { return dirty || unsavedFiles() > 0; },
  });
  let offTimeSet = false;
  void offTime;

  E.modules.sequences = {
    pick, seekTo, retrace, togglePlay, lanes, add, del, commit, save, leave, newSequence, replace,
    get seq() { return seq; }, get trace() { return tr; }, get time() { return T; }, get selected() { return sel; },
    select(/** @type {string | null} */ p) { sel = p; E.refresh(); draw(); },
    get busy() { return tracing || seeking; }, get unsaved() { return dirty || unsavedFiles() > 0; }, fileText, where, get pps() { return pps; },
    /** The timeline's element (tests). */ get box() { return box; }, get map() { return map; },
    /** @param {number} i */ setIO(i) { setIO(/** @type {0 | 1} */ (i)); },
    get io() { return io; }, set loop(/** @type {boolean} */ v) { loop = v; },
    undo: () => step(undo, redo, false), redo: () => step(redo, undo, true),
  };
})();
