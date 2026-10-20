// Cutaway.js editor, scripts as blocks: a script (a list of steps) shown as rows to edit, one row per
// step: a line (of the one playing, or of someone), narration, a dialogue, walking, facing, going to a
// room, items, flags, things shown and hidden, sounds, the screen, the cinema steps of sequences (shot
// marks, the camera, props moved and played, letterbox, captions, dissolves, the worn tape, cards), and `if` / `once`
// with their branches (they fold). A step's kind is its first key that names an action, as the script
// runner reads it; an action the blocks don't know keeps its data (its JSON shows). The Things tab
// opens a hotspot's, an item's, an actor's, a room's or a sequence's scripts with it in the centre; the
// Dialogue tab uses it for what its choices do. Each change goes into the game at once (the edits layer).
// Keys (on a row): Up and Down pick a row, Alt+Up and Alt+Down move the step, Enter edits its first
// field (Esc back to the row), Insert or + adds a line after it, Delete removes it, Ctrl+D doubles it,
// Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste steps, Left and Right fold an if or once. Rows drag by
// their grip.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;

  /**
   * @typedef {"text" | "str" | "num" | "bool" | "goon" | "xy" | "actor" | "who" | "item" | "room" | "dir" | "sfx" | "dialog" | "cond" | "flag" | "obj" | "json" | "fade"
   *   | "camera" | "ease" | "sprite" | "bars" | "caption" | "at" | "typing" | "seq" | "act"} FieldType
   * who: an actor, or nobody for the one playing; goon: "the script goes on meanwhile" (wait: false);
   * fade: "in", "out" or a level 0..1; camera: [x, y] or "follow"; bars: true, false or a height;
   * caption: a text, or empty for false (clears it); typing: typed in, with a sound per letter
   * @typedef {{label: string, group: string, fields: [string, FieldType][], make: () => any}} StepKind
   */
  /** @type {Record<string, StepKind>} */
  const KINDS = {
    line: { label: "line", group: "talk", fields: [], make: () => "" },
    say: { label: "line by", group: "talk", fields: [["say", "who"], ["text", "text"]], make: () => ({ say: firstActor(), text: "" }) },
    narrate: { label: "narration", group: "talk", fields: [["narrate", "text"]], make: () => ({ narrate: "" }) },
    dialog: { label: "dialogue", group: "talk", fields: [["dialog", "dialog"], ["node", "str"]], make: () => ({ dialog: Cutaway.dialog.ids()[0] ?? "" }) },
    walk: { label: "walk", group: "move", fields: [["walk", "who"], ["to", "xy"], ["face", "dir"], ["run", "bool"], ["free", "bool"], ["wait", "goon"]], make: () => ({ walk: [160, 150] }) },
    face: { label: "face", group: "move", fields: [["face", "who"], ["to", "dir"]], make: () => ({ face: "right" }) },
    anim: { label: "animation", group: "move", fields: [["anim", "str"], ["wait", "goon"]], make: () => ({ anim: "" }) },
    goto: { label: "go to room", group: "move", fields: [["goto", "room"], ["at", "xy"], ["face", "dir"]], make: () => ({ goto: Cutaway.scene.room?.id ?? "" }) },
    place: { label: "place someone", group: "move", fields: [["place", "actor"], ["room", "room"], ["at", "xy"], ["face", "dir"]], make: () => ({ place: firstActor() }) },
    give: { label: "give item", group: "items", fields: [["give", "item"], ["to", "who"]], make: () => ({ give: Cutaway.item.ids()[0] ?? "" }) },
    take: { label: "take item", group: "items", fields: [["take", "item"], ["hide", "obj"]], make: () => ({ take: Cutaway.item.ids()[0] ?? "" }) },
    remove: { label: "remove item", group: "items", fields: [["remove", "item"], ["from", "who"]], make: () => ({ remove: Cutaway.item.ids()[0] ?? "" }) },
    set: { label: "set flag", group: "state", fields: [["set", "flag"], ["value", "json"]], make: () => ({ set: "" }) },
    unset: { label: "unset flag", group: "state", fields: [["unset", "flag"]], make: () => ({ unset: "" }) },
    inc: { label: "count up", group: "state", fields: [["inc", "flag"], ["by", "num"]], make: () => ({ inc: "" }) },
    show: { label: "show thing", group: "state", fields: [["show", "obj"]], make: () => ({ show: "" }) },
    hide: { label: "hide thing", group: "state", fields: [["hide", "obj"]], make: () => ({ hide: "" }) },
    state: { label: "thing's state", group: "state", fields: [["state", "obj"], ["value", "str"]], make: () => ({ state: "", value: "" }) },
    if: { label: "if", group: "flow", fields: [["if", "cond"]], make: () => ({ if: "", then: [], else: [] }) },
    once: { label: "once", group: "flow", fields: [], make: () => ({ once: [], else: [] }) },
    wait: { label: "wait (ms)", group: "flow", fields: [["wait", "num"]], make: () => ({ wait: 500 }) },
    sfx: { label: "sound", group: "sound", fields: [["sfx", "sfx"], ["gain", "num"]], make: () => ({ sfx: Cutaway.sfx.names().find((n) => !n.startsWith("_")) ?? "" }) },
    stinger: { label: "stinger", group: "sound", fields: [["stinger", "str"]], make: () => ({ stinger: "" }) },
    music: { label: "music", group: "sound", fields: [["music", "json"]], make: () => ({ music: { intensity: 0.5 } }) },
    fade: { label: "fade", group: "screen", fields: [["fade", "fade"], ["ms", "num"], ["color", "str"]], make: () => ({ fade: "out" }) },
    shake: { label: "shake", group: "screen", fields: [["shake", "num"]], make: () => ({ shake: 300 }) },
    card: { label: "card", group: "screen", fields: [["card", "text"], ["title", "str"]], make: () => ({ card: "" }) },
    act: { label: "go on to an act", group: "screen", fields: [["act", "act"]], make: () => ({ act: "next" }) },
    shot: { label: "shot mark", group: "cinema", fields: [["shot", "str"]], make: () => ({ shot: "" }) },
    camera: { label: "camera", group: "cinema", fields: [["camera", "camera"], ["ms", "num"], ["ease", "ease"], ["wait", "goon"]], make: () => ({ camera: [0, 0], ms: 1000 }) },
    move: { label: "move prop", group: "cinema", fields: [["move", "obj"], ["to", "xy"], ["by", "xy"], ["ms", "num"], ["ease", "ease"], ["wait", "goon"]], make: () => ({ move: "", to: [160, 150], ms: 1000 }) },
    play: { label: "play prop", group: "cinema", fields: [["play", "obj"], ["anim", "sprite"], ["loop", "bool"], ["wait", "goon"]], make: () => ({ play: "" }) },
    letterbox: { label: "letterbox", group: "cinema", fields: [["letterbox", "bars"], ["ms", "num"], ["ease", "ease"], ["wait", "goon"]], make: () => ({ letterbox: true, ms: 800 }) },
    caption: { label: "caption", group: "cinema", fields: [["caption", "caption"], ["at", "at"], ["type", "typing"], ["speed", "num"], ["ms", "num"], ["wait", "goon"]], make: () => ({ caption: "", ms: 2500 }) },
    dissolve: { label: "dissolve (ms)", group: "cinema", fields: [["dissolve", "num"]], make: () => ({ dissolve: 800 }) },
    open: { label: "open door (for the scene)", group: "cinema", fields: [["open", "obj"], ["sfx", "sfx"], ["ms", "num"]], make: () => ({ open: "", sfx: "", ms: 260 }) },
    close: { label: "close door", group: "cinema", fields: [["close", "obj"], ["sfx", "sfx"]], make: () => ({ close: "" }) },
    tape: { label: "worn tape (0..1)", group: "cinema", fields: [["tape", "num"], ["ms", "num"], ["wait", "goon"]], make: () => ({ tape: 0.8, ms: 700 }) },
    sequence: { label: "play sequence", group: "cinema", fields: [["sequence", "seq"]], make: () => ({ sequence: Cutaway.sequence?.ids()[0] ?? "" }) },
    other: { label: "other (JSON)", group: "other", fields: [], make: () => ({}) },
  };
  /** Not steps of their own: the `line` row is a plain string, `other` anything else. */
  const SPECIAL = ["line", "if", "once", "other"];
  /** The branches of the flow steps: [key, label]. @type {Record<string, [string, string][]>} */
  const BRANCHES = { if: [["then", "then"], ["else", "else"]], once: [["once", "the first time"], ["else", "after that"]] };
  const TALK = ["line", "say", "narrate"];

  function firstActor() { return Cutaway.scene.active?.id ?? Cutaway.actors.all()[0]?.id ?? ""; }

  /**
   * The kind of a step: as the script runner reads it, its first key that names an action (`{ goto,
   * at, face }` goes to a room, it doesn't turn anyone); one the blocks don't know is "other".
   * @param {any} s
   */
  function kindOf(s) {
    if (typeof s === "string") return "line";
    if (!s || typeof s !== "object" || Array.isArray(s)) return "other";
    if ("if" in s) return "if";
    if ("once" in s) return "once";
    const actions = new Set(Cutaway.script.names());
    for (const k of Object.keys(s)) {
      if (k in KINDS && !SPECIAL.includes(k)) return k;
      if (actions.has(k)) return "other";
    }
    return "other";
  }

  /** A step's fields as the form shows them (the short forms spelt out). @param {string} kind @param {any} s @returns {Record<string, any>} */
  function read(kind, s) {
    if (kind === "say" && !("text" in s)) return { ...s, say: "", text: s.say };
    if (kind === "walk" && Array.isArray(s.walk)) return { ...s, walk: "", to: s.walk };
    if (kind === "face" && !("to" in s)) return { ...s, face: "", to: s.face };
    return { ...s };
  }

  /** The step for a form (the short forms where nobody is named). @param {string} kind @param {Record<string, any>} f */
  function write(kind, f) {
    const s = { ...f };
    for (const k of Object.keys(s)) if (s[k] === undefined || s[k] === "" && !(k === kind || k === "text")) delete s[k];
    if (kind === "say" && !s.say) { const t = s.text ?? ""; delete s.text; s.say = t; }
    if (kind === "walk" && !s.walk) { s.walk = s.to ?? [160, 150]; delete s.to; }
    if (kind === "face" && !s.face) { s.face = s.to ?? "right"; delete s.to; }
    // the main key first, as people write it (no key before it named an action, so the runner reads
    // it the same); the others keep their order
    return { [kind]: s[kind] ?? "", ...s };
  }

  /** A condition as text: a string as it is, a list as "a, b", anything else as JSON. @param {any} c */
  function condText(c) {
    if (c === undefined || c === null) return "";
    if (typeof c === "string") return c;
    if (Array.isArray(c) && c.every((x) => typeof x === "string" && !x.includes(","))) return c.join(", ");
    return JSON.stringify(c);
  }
  /** @param {string} t @returns {any} */
  function condOf(t) {
    t = t.trim();
    if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t);
    if (t.includes(",")) return t.split(",").map((x) => x.trim()).filter(Boolean);
    return t;
  }

  /** A JSON field: JSON if it is, else the text. @param {string} t */
  function jsonOf(t) { if (!t.trim()) return undefined; try { return JSON.parse(t); } catch { return t; } }

  /** A one-line summary of a script (lists, the Things tab). @param {any} script */
  function summary(script) {
    const list = script === undefined || script === null ? [] : Array.isArray(script) ? script : [script];
    if (!list.length) return "(empty)";
    /** @param {any} s @returns {string} */
    const one = (s) => {
      const k = kindOf(s);
      if (k === "line") return `"${s}"`;
      if (k === "say") return "text" in s ? `${s.say}: "${s.text}"` : `"${s.say}"`;
      if (k === "narrate") return `narrate "${s.narrate}"`;
      if (k === "if") return `if ${condText(s.if)} ...`;
      if (k === "once") return "once ...";
      if (k === "other") return JSON.stringify(s).slice(0, 40);
      return `${k} ${JSON.stringify(s[k])}`.slice(0, 40);
    };
    return list.slice(0, 2).map(one).join(", ") + (list.length > 2 ? `, ... (${list.length} steps)` : "");
  }

  const CSS = `
.cw-sc { padding: 6px 10px 40px; overflow: auto; height: 100%; box-sizing: border-box; font: 12px/1.35 Consolas, Menlo, monospace; color: #ddd; }
.cw-sc .head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; position: sticky; top: -6px; background: #0e0b14; padding: 4px 0 6px; z-index: 2; border-bottom: 1px solid #3a3350; margin-bottom: 6px; }
.cw-sc .head .t { color: #ffe14a; font-weight: bold; margin-right: 8px; }
.cw-step { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; padding: 2px 4px; margin: 1px 0; border: 1px solid transparent; border-radius: 3px; background: #16121f; outline: none; }
.cw-step:hover { border-color: #3a3350; }
.cw-step.sel { border-color: #ffe14a; background: #1f1930; }
.cw-step.drop { box-shadow: 0 -2px 0 #ffe14a; }
.cw-step .grip { cursor: grab; color: #5c5470; padding: 0 2px; }
.cw-step .fd { color: #8a84a0; font-size: 11px; }
.cw-step input, .cw-step select { font: inherit; background: #221c30; color: #eee; border: 1px solid #4a4066; padding: 1px 3px; }
.cw-step input.text { flex: 1 1 240px; min-width: 160px; }
.cw-step .grow { flex: 1 1 260px; display: flex; align-items: center; gap: 4px; }
.cw-step .grow input { flex: 1; min-width: 120px; }
.cw-step input.bad, .cw-step select.bad { border-color: #ff6a5a; color: #ffb0a0; }
.cw-step .acts { margin-left: auto; white-space: nowrap; }
.cw-step .acts button { padding: 0 5px; margin: 0 1px; }
.cw-step .fold { cursor: pointer; color: #9a92b4; width: 12px; display: inline-block; }
.cw-step .kind { color: #ffe14a; }
.cw-step.k-if .kind, .cw-step.k-once .kind { color: #7ad8ff; }
.cw-step .note { flex-basis: 100%; color: #8a84a0; font-size: 11px; padding-left: 22px; }
.cw-blk { margin-left: 18px; padding-left: 8px; border-left: 1px dashed #3a3350; }
.cw-br { color: #7ad8ff; font-size: 11px; margin: 2px 0 0 -4px; }
.cw-add { margin: 2px 0 4px; }
.cw-add select { font: inherit; background: #1c1729; color: #8a84a0; border: 1px dashed #4a4066; }
`;
  function css() {
    if (document.getElementById("cw-script-css")) return;
    const st = document.createElement("style");
    st.id = "cw-script-css"; st.textContent = CSS;
    document.head.append(st);
  }

  /** @type {any[] | null} steps copied (Ctrl+C) */
  let clip = null;
  /** @type {Set<string>} folded branches ("<id>:<path>") */
  const folded = new Set();

  /**
   * Blocks for one script: they edit a copy and hand back the whole script after each change.
   * @param {{value: any, change: (v: any[]) => void, before?: () => void, id: string}} o
   *   change: after an edit; before: just before one (for undo)
   */
  function blocks(o) {
    css();
    /** @type {any[]} */
    let model = norm(o.value);
    let selP = "";
    const root = el("div", { className: "cw-blocks" });

    /** @param {any} v @returns {any[]} */
    function norm(v) { return JSON.parse(JSON.stringify(v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])); }
    /** The list a path points into, and the index. @param {(string | number)[]} p @returns {[any[], number]} */
    function listAt(p) {
      /** @type {any} */
      let l = model;
      for (let i = 0; i < p.length - 1; i += 2) l = (l[/** @type {number} */ (p[i])][p[i + 1]] ??= []);
      return [l, /** @type {number} */ (p[p.length - 1])];
    }
    /** @param {string} s @returns {(string | number)[]} */
    const parse = (s) => (s === "" ? [] : s.split(".").map((x, i) => (i % 2 ? x : Number(x))));
    /** @param {(string | number)[]} p */
    const key = (p) => p.join(".");
    /** Do an edit: before (undo), the change, the game told. @param {() => void} fn @param {boolean} [again] build the rows again */
    function edit(fn, again = true) {
      o.before?.();
      fn();
      o.change(JSON.parse(JSON.stringify(model)));
      if (again) render();
    }

    /** An input for one field. @param {Record<string, any>} f the form @param {string} k @param {FieldType} type @param {string} kind @param {string} path */
    function field(f, k, type, kind, path) {
      const v = f[k], id = `${path}:${k}`;
      /** @param {any} x */
      const set = (x) => edit(() => { f[k] = x; replace(path, write(kind, f)); }, false);
      /** @param {string[]} opts @param {string} none @param {(x: string) => string} [label] */
      const select = (opts, none, label) => {
        const s = /** @type {HTMLSelectElement} */ (el("select", { onchange: () => set(s.value || undefined) },
          [el("option", { value: "", textContent: none }), ...opts.map((x) => el("option", { value: x, textContent: label ? label(x) : x, selected: x === v }))]));
        if (v && !opts.includes(v)) { s.append(el("option", { value: v, textContent: `${v} (unknown)`, selected: true })); s.classList.add("bad"); }
        return s;
      };
      /** @param {string} cls @param {string} val @param {(t: string) => any} conv @param {string} [list] */
      const text = (cls, val, conv, list) => {
        const i = /** @type {HTMLInputElement} */ (el("input", { className: cls, value: val, spellcheck: false,
          onchange: () => { try { const x = conv(i.value); i.classList.remove("bad"); set(x); } catch { i.classList.add("bad"); } } }));
        if (list) i.setAttribute("list", list);
        return i;
      };
      /** @type {HTMLElement} */
      let input;
      switch (type) {
        case "text": input = text("text", v ?? "", (t) => t); break;
        case "str": input = text("", v ?? "", (t) => t || undefined); input.style.width = "110px"; break;
        case "num": input = text("", v ?? "", (t) => (t.trim() === "" ? undefined : Number(t))); input.style.width = "64px"; break;
        case "json": input = text("", v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v), jsonOf); input.style.width = "140px"; break;
        case "cond": input = text("text", condText(v), condOf, "cw-sc-flags"); input.title = 'a flag, "!flag", "has:item", "flag=3", "at:actor=room" ...; "a, b" = all of them; or JSON ({ or: [...] })'; break;
        case "flag": input = text("", v ?? "", (t) => t.trim(), "cw-sc-flags"); input.style.width = "150px"; break;
        case "obj": input = text("", v ?? "", (t) => t.trim() || undefined, "cw-sc-objs"); input.style.width = "120px"; break;
        case "bool": return el("label", { className: "fd" }, [el("input", { type: "checkbox", checked: !!v, onchange: (/** @type {any} */ e) => set(e.target.checked || undefined) }), k]);
        case "goon": return el("label", { className: "fd", title: "the script goes on while this happens" },
          [el("input", { type: "checkbox", checked: v === false, onchange: (/** @type {any} */ e) => set(e.target.checked ? false : undefined) }), "go on"]);
        case "xy": {
          const [x, y] = Array.isArray(v) ? v : ["", ""];
          const a = /** @type {HTMLInputElement} */ (el("input", { value: x, style: { width: "40px" } })), b = /** @type {HTMLInputElement} */ (el("input", { value: y, style: { width: "40px" } }));
          const ch = () => set(a.value.trim() === "" && b.value.trim() === "" ? undefined : [Number(a.value) || 0, Number(b.value) || 0]);
          a.addEventListener("change", ch); b.addEventListener("change", ch);
          a.dataset.f = id; b.dataset.f = id + ".y";
          return el("span", { className: "fd" }, [`${k} `, a, " ", b]);
        }
        case "actor": input = select(Cutaway.actors.all().map((a) => a.id), "(someone)"); break;
        case "who": input = select(Cutaway.actors.all().map((a) => a.id), "(the one playing)"); break;
        case "item": input = select(Cutaway.item.ids(), "(an item)"); break;
        case "room": input = select(Cutaway.room.ids(), "(a room)"); break;
        case "dialog": input = select(Cutaway.dialog.ids(), "(a dialogue)"); break;
        case "sfx": input = select(Cutaway.sfx.names().filter((n) => !n.startsWith("_")).sort(), "(a sound)"); break;
        case "dir": input = select(["left", "right", "up", "down"], "(as they are)"); break;
        case "fade":
          input = text("", v === undefined ? "" : String(v), (t) => { t = t.trim(); if (!t) return undefined; if (t === "in" || t === "out") return t; const n = Number(t); if (isNaN(n)) throw new Error(t); return n; }, "cw-sc-fade");
          input.style.width = "60px"; input.title = "out (black), in (back), or how dark: 0..1"; break;
        case "ease": input = select(["linear", "in", "out", "inOut"], "(inOut)"); break;
        case "at": input = select(["bl", "br", "tl", "tr", "c"], "(bottom left)", (x) => /** @type {Record<string, string>} */ ({ bl: "bottom left", br: "bottom right", tl: "top left", tr: "top right", c: "the middle" })[x]); break;
        case "typing": {
          const now = v === "sound" ? "sound" : v ? "yes" : "";
          const s = /** @type {HTMLSelectElement} */ (el("select", { onchange: () => set(s.value === "sound" ? "sound" : s.value === "yes" ? true : undefined) },
            [["", "(at once)"], ["yes", "typed"], ["sound", "typed, a sound a letter"]].map(([x, l]) => el("option", { value: x, textContent: l, selected: x === now }))));
          input = s; break;
        }
        case "seq": input = select(Cutaway.sequence?.ids() ?? [], "(a sequence)"); break;
        case "act": input = select(["next", ...Cutaway.act.ids()], "(an act)"); break;
        case "sprite": input = text("", v ?? "", (t) => t.trim() || undefined, "cw-sc-sprites"); input.style.width = "140px"; input.title = "a sprite or animation (none: its own image)"; break;
        case "caption":
          input = text("text", typeof v === "string" ? v : "", (t) => t || false);
          /** @type {HTMLInputElement} */ (input).placeholder = "(empty: clears the caption)"; break;
        case "bars":
          input = text("", v === undefined ? "" : String(v), (t) => { t = t.trim(); if (t === "" || t === "true") return true; if (t === "false") return false; const n = Number(t); if (isNaN(n)) throw new Error(t); return n; }, "cw-sc-bars");
          input.style.width = "60px"; input.title = "true (2.39:1), false (away) or the bars' height in px"; break;
        case "camera": {
          const follow = v === "follow", [x, y] = Array.isArray(v) ? v : ["", ""];
          const a = /** @type {HTMLInputElement} */ (el("input", { value: x, disabled: follow, style: { width: "40px" } })), b = /** @type {HTMLInputElement} */ (el("input", { value: y, disabled: follow, style: { width: "40px" } }));
          const ch = () => set([Number(a.value) || 0, Number(b.value) || 0]);
          a.addEventListener("change", ch); b.addEventListener("change", ch);
          a.dataset.f = id; b.dataset.f = id + ".y";
          const fl = el("label", { className: "fd", title: "give the camera back to the one playing" }, [el("input", { type: "checkbox", checked: follow,
            onchange: (/** @type {any} */ e) => set(e.target.checked ? "follow" : [Number(a.value) || 0, Number(b.value) || 0]) }), "follow"]);
          return el("span", { className: "fd" }, ["to ", a, " ", b, " ", fl]);
        }
        default: input = text("", "", (t) => t);
      }
      input.dataset.f = id;
      return el("span", { className: "fd" + (type === "text" || type === "cond" || type === "caption" ? " grow" : "") }, [k === kind || type === "text" ? "" : `${k} `, input]);
    }

    /** Put a step at a path. @param {string} path @param {any} step */
    function replace(path, step) { const [l, i] = listAt(parse(path)); l[i] = step; }

    /** One row and, for if / once, its branches. @param {any} s @param {(string | number)[]} p */
    function row(s, p) {
      const kind = kindOf(s), path = key(p), f = typeof s === "string" ? { line: s } : read(kind, s), spec = KINDS[kind];
      const kinds = el("select", { className: "kind", title: "the kind of step", onchange: () => edit(() => replace(path, convert(s, kindSel.value))) },
        groupsOf().map(([g, ks]) => { const og = el("optgroup", { label: g }); og.append(...ks.map((k) => el("option", { value: k, textContent: KINDS[k].label, selected: k === kind }))); return og; }));
      const kindSel = /** @type {HTMLSelectElement} */ (kinds);
      const fk = `${o.id}:${path}`, branches = BRANCHES[kind], shut = folded.has(fk);
      const r = el("div", { className: `cw-step k-${kind}${path === selP ? " sel" : ""}`, tabIndex: 0,
        onfocusin: () => { if (selP !== path) { root.querySelector(".cw-step.sel")?.classList.remove("sel"); r.classList.add("sel"); selP = path; } } }, [
        el("span", { className: "grip", title: "drag to move", onpointerdown: () => { r.draggable = true; } }, ["⠿"]),
        ...(branches ? [el("span", { className: "fold", textContent: shut ? "▸" : "▾", onclick: () => { if (shut) folded.delete(fk); else folded.add(fk); render(); } })] : []),
        kindSel,
      ]);
      r.dataset.p = path;
      if (kind === "line") {
        const i = /** @type {HTMLInputElement} */ (el("input", { className: "text", value: s, spellcheck: false, onchange: () => edit(() => replace(path, i.value), false) }));
        i.dataset.f = `${path}:line`;
        r.append(i);
      } else if (kind === "other") {
        const i = /** @type {HTMLInputElement} */ (el("input", { className: "text", value: JSON.stringify(s), spellcheck: false,
          onchange: () => { try { const v = JSON.parse(i.value); i.classList.remove("bad"); edit(() => replace(path, v), kindOf(v) !== "other"); } catch { i.classList.add("bad"); } } }));
        i.dataset.f = `${path}:json`;
        r.append(i);
      } else for (const [k, t] of spec.fields) r.append(field(f, k, t, kind, path));
      // what the form doesn't show stays: as JSON, to change by hand
      const known = new Set([...spec.fields.map(([k]) => k), ...(branches ?? []).map(([k]) => k), kind]);
      const extra = typeof s === "object" && kind !== "other" ? Object.fromEntries(Object.entries(s).filter(([k]) => !known.has(k))) : {};
      if (Object.keys(extra).length) {
        const i = /** @type {HTMLInputElement} */ (el("input", { value: JSON.stringify(extra), title: "more of this step (JSON)", style: { width: "160px" },
          onchange: () => { try { const more = JSON.parse(i.value || "{}"); i.classList.remove("bad"); edit(() => { const base = Object.fromEntries(Object.entries(s).filter(([k]) => known.has(k))); replace(path, { ...base, ...more }); }); } catch { i.classList.add("bad"); } } }));
        i.dataset.f = `${path}:more`;
        r.append(el("span", { className: "fd" }, ["more ", i]));
      }
      r.append(el("span", { className: "acts" }, [
        button("↑", () => move(path, -1), "move up (Alt+Up)"), button("↓", () => move(path, 1), "move down (Alt+Down)"),
        button("⧉", () => dup(path), "double it (Ctrl+D)"), button("✕", () => del(path), "remove it (Delete)")]));
      // a line: what it shows as now, if the texts layer says it differently
      const t = kind === "line" ? s : TALK.includes(kind) ? f.text ?? f.narrate : null;
      if (typeof t === "string" && t) {
        const now = Cutaway.i18n.t(t);
        if (now !== t) r.append(el("div", { className: "note" }, [`shows as: ${now}  (Texts tab)`]));
      }
      wireDrag(r, path);
      const out = [r];
      if (branches && !shut) {
        for (const [b, label] of branches) {
          if (s[b] !== undefined && !Array.isArray(s[b])) s[b] = [s[b]];   // one step alone is a list of one (the same to the game)
          out.push(el("div", { className: "cw-blk" }, [el("div", { className: "cw-br" }, [label]), ...list(s[b] ?? [], [...p, b])]));
        }
      }
      return out;
    }

    /** The kinds by group, for the kind menus. @returns {[string, string[]][]} */
    function groupsOf() {
      /** @type {Map<string, string[]>} */
      const m = new Map();
      for (const [k, d] of Object.entries(KINDS)) m.set(d.group, [...(m.get(d.group) ?? []), k]);
      return [...m];
    }

    /** A step turned into another kind (a line's text goes along). @param {any} s @param {string} kind */
    function convert(s, kind) {
      const old = kindOf(s), n = KINDS[kind].make();
      const text = old === "line" ? s : old === "say" ? ("text" in s ? s.text : s.say) : old === "narrate" ? s.narrate : "";
      if (kind === "line") return text;
      if (kind === "say") return { say: "text" in n ? n.say : firstActor(), text };
      if (kind === "narrate") return { narrate: text };
      if (kind === "other") return typeof s === "object" ? s : { say: s };
      if (BRANCHES[kind] && BRANCHES[old]) { const m = { ...n }; m[BRANCHES[kind][0][0]] = s[BRANCHES[old][0][0]] ?? []; m.else = s.else ?? []; if (kind === "if") m.if = s.if ?? ""; return m; }
      return n;
    }

    /** The rows of a list and its "add a step" menu. @param {any[]} l @param {(string | number)[]} p */
    function list(l, p) {
      const out = l.flatMap((s, i) => row(s, [...p, i]));
      const add = /** @type {HTMLSelectElement} */ (el("select", { title: "add a step at the end", onchange: () => {
        const k = add.value;
        if (!k) return;
        edit(() => { const [arr] = listAt([...p, 0]); arr.push(KINDS[k].make()); selP = key([...p, arr.length - 1]); });
        focusSel(true);
      } }, [el("option", { value: "", textContent: "+ step" }),
        ...groupsOf().map(([g, ks]) => { const og = el("optgroup", { label: g }); og.append(...ks.map((k) => el("option", { value: k, textContent: KINDS[k].label }))); return og; })]));
      const box = el("div", { className: "cw-add" }, [add]);
      box.dataset.list = key(p);
      wireDrop(box, p);
      out.push(box);
      return out;
    }

    /** @param {string} path @param {number} d */
    function move(path, d) {
      const p = parse(path), [l, i] = listAt(p), j = i + d;
      if (j < 0 || j >= l.length) return;
      edit(() => { [l[i], l[j]] = [l[j], l[i]]; selP = key([...p.slice(0, -1), j]); });
      focusSel();
    }
    /** @param {string} path */
    function dup(path) {
      const p = parse(path), [l, i] = listAt(p);
      edit(() => { l.splice(i + 1, 0, JSON.parse(JSON.stringify(l[i]))); selP = key([...p.slice(0, -1), i + 1]); });
      focusSel();
    }
    /** @param {string} path */
    function del(path) {
      const p = parse(path), [l, i] = listAt(p);
      if (!l[i] && l[i] !== "") return;
      edit(() => { l.splice(i, 1); selP = l.length ? key([...p.slice(0, -1), Math.min(i, l.length - 1)]) : ""; });
      focusSel();
    }
    /** Steps after the picked one (or at the end). @param {any[]} steps @param {boolean} [field] then into its first field */
    function insert(steps, field = false) {
      const p = selP ? parse(selP) : [model.length - 1];
      edit(() => {
        const [l, i] = selP ? listAt(p) : [model, model.length - 1];
        l.splice(i + 1, 0, ...JSON.parse(JSON.stringify(steps)));
        selP = key([...p.slice(0, -1), i + 1]);
      });
      focusSel(field);
    }

    // drag and drop: a row onto another row goes before it; onto a list's "+ step", at its end
    /** @type {string | null} */
    let dragged = null;
    /** @param {HTMLElement} r @param {string} path */
    function wireDrag(r, path) {
      r.addEventListener("dragstart", (e) => { dragged = path; e.dataTransfer?.setData("text/plain", path); e.stopPropagation(); });
      r.addEventListener("dragend", () => { dragged = null; r.draggable = false; root.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop")); });
      r.addEventListener("pointerup", () => { r.draggable = false; });
      r.addEventListener("dragover", (e) => { if (dragged !== null && !path.startsWith(dragged + ".") && dragged !== path) { e.preventDefault(); r.classList.add("drop"); } });
      r.addEventListener("dragleave", () => r.classList.remove("drop"));
      r.addEventListener("drop", (e) => { e.preventDefault(); r.classList.remove("drop"); if (dragged !== null) dropAt(dragged, parse(path)); });
    }
    /** @param {HTMLElement} box @param {(string | number)[]} p */
    function wireDrop(box, p) {
      box.addEventListener("dragover", (e) => { if (dragged !== null) { e.preventDefault(); box.classList.add("drop"); } });
      box.addEventListener("dragleave", () => box.classList.remove("drop"));
      box.addEventListener("drop", (e) => { e.preventDefault(); box.classList.remove("drop"); if (dragged !== null) { const [l] = listAt([...p, 0]); dropAt(dragged, [...p, l.length]); } });
    }
    /** Move a step to a place (before the step there). @param {string} from @param {(string | number)[]} to */
    function dropAt(from, to) {
      const fp = parse(from);
      if (key(to).startsWith(from + ".")) return;                 // not into itself
      edit(() => {
        const [fl, fi] = listAt(fp), [step] = fl.splice(fi, 1);
        // the target's index moves up by one if it was after the step in the same list
        const sameList = key(fp.slice(0, -1)) === key(to.slice(0, -1)), ti = /** @type {number} */ (to[to.length - 1]);
        const [tl] = listAt(to), at = sameList && fi < ti ? ti - 1 : ti;
        tl.splice(at, 0, step);
        selP = key([...to.slice(0, -1), at]);
      });
    }

    /** Give the picked row the keyboard (or its first field). @param {boolean} [field] */
    function focusSel(field = false) {
      const r = /** @type {HTMLElement | null} */ ([...root.querySelectorAll(".cw-step")].find((x) => /** @type {HTMLElement} */ (x).dataset.p === selP) ?? null);
      if (!r) return;
      const f = field ? /** @type {HTMLElement | null} */ (r.querySelector("input, select:not(.kind)")) : null;
      (f ?? r).focus();
      r.scrollIntoView({ block: "nearest" });
    }

    function render() {
      const had = /** @type {HTMLElement | null} */ (document.activeElement);
      const keepF = had && root.contains(had) ? had.dataset.f ?? (had.classList.contains("cw-step") ? "row" : "") : "";
      root.replaceChildren(...list(model, []));
      if (keepF === "row") focusSel();
      else if (keepF) /** @type {HTMLElement | undefined} */ ([...root.querySelectorAll("[data-f]")].find((x) => /** @type {HTMLElement} */ (x).dataset.f === keepF))?.focus();
    }

    /** Keys on the blocks (not in a field). @param {KeyboardEvent} e @returns {boolean} handled */
    function keys(e) {
      const t = /** @type {HTMLElement} */ (e.target);
      if (!root.contains(t)) return false;
      const on = /** @type {HTMLElement | null} */ (t.closest(".cw-step"));
      if (on?.dataset.p !== undefined) selP = on.dataset.p;            // the row the key is pressed on is the picked one
      const rows = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(".cw-step")]), i = rows.findIndex((r) => r.dataset.p === selP);
      const mod = e.ctrlKey || e.metaKey;
      const go = (/** @type {number} */ j) => { const r = rows[Cutaway.util.clamp(j, 0, rows.length - 1)]; if (r) { selP = r.dataset.p ?? ""; r.focus(); r.scrollIntoView({ block: "nearest" }); } };
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { if (selP) move(selP, e.key === "ArrowUp" ? -1 : 1); return true; }
      if (mod && e.code === "KeyD") { if (selP) dup(selP); return true; }
      if (mod && (e.code === "KeyC" || e.code === "KeyX")) {
        if (!selP) return true;
        const [l, j] = listAt(parse(selP));
        clip = [JSON.parse(JSON.stringify(l[j]))];
        navigator.clipboard?.writeText(JSON.stringify(l[j])).catch(() => {});
        if (e.code === "KeyX") del(selP);
        E.setStatus(e.code === "KeyX" ? "cut a step" : "copied a step");
        return true;
      }
      if (mod && e.code === "KeyV") { if (clip) insert(clip); return true; }
      if (mod) return false;
      switch (e.key) {
        case "ArrowDown": go(i + 1); return true;
        case "ArrowUp": go(i < 0 ? 0 : i - 1); return true;
        case "Home": go(0); return true;
        case "End": go(rows.length - 1); return true;
        case "Enter": focusSel(true); return true;
        case "Delete": case "Backspace": if (selP) del(selP); return true;
        case "Insert": case "+": insert([""], true); return true;
        case "ArrowLeft": case "ArrowRight": {
          const fk = `${o.id}:${selP}`, [l, j] = selP ? listAt(parse(selP)) : [[], 0];
          if (!selP || !BRANCHES[kindOf(l[j])]) return true;
          if (e.key === "ArrowLeft") folded.add(fk); else folded.delete(fk);
          render(); focusSel();
          return true;
        }
      }
      return false;
    }
    // Esc in a field: back to its row
    root.addEventListener("keydown", (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (e.key === "Escape" && t.dataset.f) { e.preventDefault(); e.stopPropagation(); /** @type {HTMLElement | null} */ (t.closest(".cw-step"))?.focus(); }
    });

    render();
    return {
      el: root, keys, render,
      get value() { return JSON.parse(JSON.stringify(model)); },
      /** Show another value (undo, revert). @param {any} v */
      set value(v) { model = norm(v); render(); },
    };
  }

  /** Suggestions for flags and things (datalists the fields share). */
  function datalists() {
    let box = document.getElementById("cw-sc-lists");
    if (!box) { box = document.createElement("div"); box.id = "cw-sc-lists"; box.style.display = "none"; document.body.append(box); }
    const flags = new Set(Object.keys(Cutaway.state.snapshot().flags).filter((f) => !f.startsWith("~")));
    /** @param {any} s */
    const scan = (s) => {
      if (Array.isArray(s)) { s.forEach(scan); return; }
      if (!s || typeof s !== "object") return;
      for (const k of ["set", "unset", "inc"]) if (typeof s[k] === "string") flags.add(s[k]);
      for (const v of Object.values(s)) if (v && typeof v === "object") scan(v);
    };
    for (const id of Cutaway.room.ids()) scan(Cutaway.room.get(id));
    for (const a of Cutaway.actors.all()) scan(a.def);
    for (const id of Cutaway.item.ids()) scan(Cutaway.item.get(id));
    for (const id of Cutaway.dialog.ids()) scan(Cutaway.dialog.get(id));
    const r = Cutaway.scene.room, objs = [...Object.keys(r?.hotspots ?? {}), ...(r?.props ?? []).map((p) => p.id).filter(Boolean)];
    /** @param {string} id @param {string[]} values */
    const dl = (id, values) => el("datalist", { id }, values.map((f) => el("option", { value: f })));
    box.replaceChildren(dl("cw-sc-flags", [...flags].sort()), dl("cw-sc-objs", /** @type {string[]} */ ([...new Set(objs)])),
      dl("cw-sc-sprites", Cutaway.assets.names().slice().sort()), dl("cw-sc-fade", ["out", "in", "0.5"]), dl("cw-sc-bars", ["true", "false"]));
  }

  /**
   * A script in the centre, with its own undo: the title, Test, Revert, Remove, and the blocks.
   * @param {{title: string, value: any, change: (v: any[] | null) => void, revert?: () => any, test?: (v: any[]) => void, changed?: () => boolean, close?: () => void}} o
   * @returns {EditorView & {blocks: ReturnType<typeof blocks>}}
   */
  function view(o) {
    css(); datalists();
    /** @type {string[]} */
    const undo = [];
    /** @type {string[]} */
    const redo = [];
    let now = JSON.stringify(o.value ?? []);
    const b = blocks({ id: o.title, value: o.value, before: () => { undo.push(now); if (undo.length > 200) undo.shift(); redo.length = 0; },
      change: (v) => { now = JSON.stringify(v); o.change(v); mark(); } });
    const state = el("span", { className: "cw-dim" });
    const mark = () => { state.textContent = o.changed?.() ? "changed (the edits layer: File > Save)" : "the game's own"; };
    mark();
    /** @param {string[]} from @param {string[]} to */
    const step = (from, to) => { const s = from.pop(); if (s === undefined) return; to.push(now); now = s; const v = JSON.parse(s); b.value = v; o.change(v); mark(); };
    const root = el("div", { className: "cw-sc" }, [
      el("div", { className: "head" }, [el("span", { className: "t" }, [o.title]),
        ...(o.test ? [button("▶ Test", () => o.test?.(b.value), "close the editor and run it")] : []),
        ...(o.revert ? [button("Revert", () => { const v = o.revert?.(); undo.push(now); now = JSON.stringify(v ?? []); b.value = v; mark(); }, "back to the game's own script")] : []),
        button("Remove", () => { if (!confirm("Remove this script? (The thing then does what nothing does: the default line.)")) return; undo.push(now); now = "[]"; b.value = []; o.change(null); mark(); }, "no script here (the default)"),
        ...(o.close ? [button("Close", () => o.close?.(), "back to the game picture (Esc on no row)")] : []),
        state]),
      b.el,
      el("div", { className: "cw-dim", style: { marginTop: "10px", whiteSpace: "pre-wrap" } }, [
        "a row: Up/Down pick, Alt+Up/Down move, Enter edit (Esc back), Insert or + new line, Del remove, Ctrl+D double,\n" +
        "Ctrl+C / X / V copy, cut, paste, Left/Right fold; drag a row by its grip. Changes play at once; File > Save keeps them."]),
    ]);
    return {
      el: root, blocks: b,
      key: (e) => b.keys(e),
      undo: () => step(undo, redo),
      redo: () => step(redo, undo),
      selectNone: () => o.close?.(),
    };
  }

  E.modules.script = { blocks, view, summary, kindOf, read, write, KINDS, condText, condOf, datalists };
})();
