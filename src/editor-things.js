// Cutaway.js editor, Things tab: the properties of the room and of what is in it (hotspots, props,
// lamps, effects, actors) and of the items. Pick a thing in the list or click it on the picture, change a
// field and the game shows it at once; Save writes the edits layer (Cutaway.edits in game/edits.js, the
// studio's "edits" layer). Texts are changed in the Texts tab, shapes in the Room tab, logic in code.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  /** @type {string} "room", "hot:<id>", "prop:<id>", "lamp:<id>", "fx:<id>", "actor:<id>", "item:<id>" */
  let sel = "room";
  let dirty = false;

  /**
   * A field: a path into the thing's data and how to edit it.
   * @typedef {{path: string, type: "number" | "color" | "bool" | "text" | "sprite" | "json" | "theme" | "section" | "loops", hint?: string}} Field
   */
  /** @type {Record<string, Field[]>} */
  const FIELDS = {
    room: [
      { path: "music.theme", type: "theme" }, { path: "music.section", type: "section" }, { path: "music.intensity", type: "number", hint: "0..1" },
      { path: "ambience", type: "loops", hint: "sound loops, comma separated" },
      { path: "light.ambient", type: "number", hint: "0.75..1 (style guide)" }, { path: "light.color", type: "color" },
      { path: "scale", type: "json", hint: "{ far: [y, s], near: [y, s] }" }, { path: "background", type: "sprite" },
    ],
    hot: [{ path: "z", type: "number", hint: "higher wins where hotspots overlap" }, { path: "hidden", type: "bool" }, { path: "prop", type: "text", hint: "a prop to click on (no shape)" }],
    prop: [{ path: "image", type: "sprite" }, { path: "at", type: "json", hint: "[x, y]" }, { path: "anchor", type: "json", hint: "[x, y] in the sprite" },
      { path: "flip", type: "bool" }, { path: "hidden", type: "bool" }, { path: "baseline", type: "number" }, { path: "scroll", type: "number" }],
    lamp: [{ path: "power", type: "number" }, { path: "color", type: "color" }, { path: "flicker", type: "number", hint: "0..1" }, { path: "rate", type: "number" },
      { path: "add", type: "bool", hint: "not in the art" }, { path: "glow", type: "json", hint: "{ r, strength }" }],
    fx: [{ path: "color", type: "color" }, { path: "count", type: "number" }, { path: "alpha", type: "number" }, { path: "fade", type: "number" },
      { path: "speed", type: "number" }, { path: "every", type: "number", hint: "ms" }, { path: "slant", type: "number" }, { path: "length", type: "number" }],
    actor: [{ path: "color", type: "color", hint: "subtitles" }, { path: "speed", type: "json", hint: "[x, y] px/s" }, { path: "run", type: "number", hint: "running speed, times walking" },
      { path: "costume", type: "json" }, { path: "voice", type: "json" }, { path: "portrait", type: "sprite" }, { path: "portraitActive", type: "sprite" }],
    item: [{ path: "icon", type: "sprite" }],
  };

  function room() { return Cutaway.scene.room; }
  /** The thing's live data object. @returns {any} */
  function target() {
    const r = room(), [kind, id] = sel.includes(":") ? [sel.slice(0, sel.indexOf(":")), sel.slice(sel.indexOf(":") + 1)] : [sel, ""];
    if (kind === "room") return r;
    if (kind === "hot") return r?.hotspots?.[id];
    if (kind === "prop") return r?.props?.find((p) => p.id === id);
    if (kind === "lamp") return r?.light?.lamps?.find((l, i) => (l.id ?? String(i)) === id);
    if (kind === "fx") return r?.fx?.find((f, i) => (f.id ?? String(i)) === id);
    if (kind === "actor") return Cutaway.actors.get(id)?.def;
    if (kind === "item") return Cutaway.item.get(id);
    return null;
  }
  /** @param {any} o @param {string} path */
  const get = (o, path) => path.split(".").reduce((v, k) => (v == null ? undefined : v[k]), o);
  /** A patch that sets one path. @param {string} path @param {any} v */
  const patchOf = (path, v) => path.split(".").reverse().reduce((acc, k) => ({ [k]: acc }), v);

  /** Change a field: in the live data and in the edits layer. @param {Field} f @param {any} v */
  function change(f, v) {
    const r = room(), [kind, id] = sel.includes(":") ? [sel.slice(0, sel.indexOf(":")), sel.slice(sel.indexOf(":") + 1)] : [sel, ""];
    const p = patchOf(f.path, v);
    if (kind === "actor") Cutaway.edits.change("actors", id, p);
    else if (kind === "item") Cutaway.edits.change("items", id, p);
    else if (r) {
      const wrap = kind === "room" ? p : kind === "hot" ? { hotspots: { [id]: p } } : kind === "prop" ? { props: { [id]: p } } : kind === "lamp" ? { light: { lamps: { [id]: p } } } : { fx: { [id]: p } };
      Cutaway.edits.change("rooms", r.id, wrap);
      if (kind === "room" && f.path.startsWith("music")) Cutaway.events.emit("music", r.music);
      if (kind === "room" && f.path === "ambience") Cutaway.sfx.ambience(r.ambience ?? []);
    }
    dirty = true;
  }

  async function save() {
    const text = `// What the Cutaway editor changed in the game's data (Things tab): rooms, hotspots, props, light,\n` +
      `// effects, music, items and actors. Loaded after the game's own data; objects merge, values replace.\n"use strict";\n\n` +
      `Cutaway.edits(${E.fmt(Cutaway.edits.data())});\n`;
    E.setStatus(await E.saveFile(E.studio.layer("edits") || "game/edits.js", text));
    dirty = false;
  }

  /** An input for a field. @param {Field} f @param {any} obj */
  function input(f, obj) {
    const v = get(obj, f.path), st = { font: "inherit", background: "#221c30", color: "#eee", border: "1px solid #4a4066" };
    /** @param {any} x */
    const set = (x) => { change(f, x); };
    if (f.type === "bool") return el("input", { type: "checkbox", checked: !!v, onchange: (/** @type {any} */ e) => set(e.target.checked) });
    if (f.type === "number") return el("input", { type: "number", step: "any", value: v ?? "", style: { ...st, width: "80px" }, onchange: (/** @type {any} */ e) => set(e.target.value === "" ? undefined : Number(e.target.value)) });
    if (f.type === "color") {
      const text = /** @type {HTMLInputElement} */ (el("input", { value: v ?? "", style: { ...st, width: "80px" }, onchange: () => set(text.value || undefined) }));
      return el("span", {}, [el("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(v ?? "") ? v : "#ffffff", onchange: (/** @type {any} */ e) => { text.value = e.target.value; set(e.target.value); } }), " ", text]);
    }
    /** @param {string[]} opts */
    const select = (opts) => el("select", { style: st, onchange: (/** @type {any} */ e) => set(e.target.value || undefined) },
      ["", ...opts].map((o) => el("option", { value: o, textContent: o || "(none)", selected: o === (v ?? "") })));
    if (f.type === "sprite") return select(Cutaway.assets.names());
    if (f.type === "theme") return select(Cutaway.score?.ids?.() ?? []);
    if (f.type === "section") { const th = get(obj, "music.theme"); return select(th && Cutaway.score?.has?.(th) ? Object.keys(Cutaway.score.get(th).sections) : []); }
    if (f.type === "loops") return el("input", { value: (v ?? []).map((/** @type {any} */ a) => (typeof a === "string" ? a : JSON.stringify(a))).join(", "), style: { ...st, width: "200px" },
      onchange: (/** @type {any} */ e) => set(String(e.target.value).split(",").map((x) => x.trim()).filter(Boolean).map((x) => (x.startsWith("{") ? JSON.parse(x) : x))) });
    if (f.type === "json") {
      const a = /** @type {HTMLTextAreaElement} */ (el("textarea", { value: v === undefined ? "" : JSON.stringify(v), rows: 2, style: { ...st, width: "100%", boxSizing: "border-box" },
        onchange: () => { try { set(a.value.trim() ? JSON.parse(a.value) : undefined); a.style.borderColor = "#4a4066"; } catch { a.style.borderColor = "#ff6a5a"; } } }));
      return a;
    }
    return el("input", { value: v ?? "", style: { ...st, width: "160px" }, onchange: (/** @type {any} */ e) => set(e.target.value || undefined) });
  }

  /** The things to pick from: the room, what is in it, the actors and the items. */
  function things() {
    const r = room(), out = [["room", `room ${r?.id ?? ""}`]];
    for (const id of Object.keys(r?.hotspots ?? {})) out.push([`hot:${id}`, `hotspot ${id}`]);
    for (const p of r?.props ?? []) if (p.id) out.push([`prop:${p.id}`, `prop ${p.id}`]);
    (r?.light?.lamps ?? []).forEach((l, i) => out.push([`lamp:${l.id ?? i}`, `lamp ${l.id ?? i}`]));
    (r?.fx ?? []).forEach((f, i) => out.push([`fx:${f.id ?? i}`, `${f.kind} ${f.id ?? i}`]));
    for (const a of Cutaway.actors.all()) out.push([`actor:${a.id}`, `actor ${a.id}${a.room === r?.id ? " (here)" : ""}`]);
    for (const id of Cutaway.item.ids()) out.push([`item:${id}`, `item ${id}`]);
    return out;
  }

  function build(/** @type {HTMLElement} */ box) {
    const list = things();
    if (!list.some(([k]) => k === sel)) sel = "room";
    const pick = el("select", { size: 12, style: { width: "100%", font: "inherit", background: "#1c1729", color: "#ddd", border: "1px solid #3a3350" },
      onchange: (/** @type {any} */ e) => { sel = e.target.value; E.refresh(); } }, list.map(([k, label]) => el("option", { value: k, textContent: label, selected: k === sel })));
    box.append(el("div", { style: { margin: "4px 0" } }, [button(`Save${dirty ? " *" : ""}`, () => { save().catch((e) => E.setStatus("save failed: " + e.message)); }, "write the edits layer"),
      el("span", { style: { color: "#888" } }, [" click a thing on the picture to pick it"])]), pick);
    const obj = target(), kind = sel.split(":")[0];
    if (!obj) return;
    const form = el("div", { style: { marginTop: "6px", borderTop: "1px solid #3a3350", paddingTop: "4px" } });
    for (const f of FIELDS[kind] ?? []) {
      form.append(el("div", { style: { margin: "3px 0" } }, [el("div", { style: { color: "#aaa" } }, [f.path + (f.hint ? `  (${f.hint})` : "")]), input(f, obj)]));
    }
    if (kind === "hot" || kind === "item" || kind === "room" || kind === "actor") form.append(el("div", { style: { color: "#888", marginTop: "4px" } },
      ["Its name and texts: the Texts tab. Its shape and walk-to point: the Room tab. What it does: the game's code."]));
    box.append(form);
  }

  /** Click on the picture: the hotspot or actor there (else a prop's box). @param {{x: number, y: number}} p */
  function pick(p) {
    const h = Cutaway.scene.hotspotAt(p.x, p.y);
    if (h) sel = h.actor ? `actor:${h.actor}` : `hot:${h.id}`;
    else {
      const r = room(), prop = (r?.props ?? []).slice().reverse().find((q) => {
        const b = q.id ? Cutaway.scene.propBox(q) : null;
        return b && p.x >= b[0] && p.x < b[0] + b[2] && p.y >= b[1] && p.y < b[1] + b[3];
      });
      sel = prop?.id ? `prop:${prop.id}` : "room";
    }
    E.refresh();
  }

  /** The picked thing's outline over the picture. @param {CanvasRenderingContext2D} ctx */
  function render(ctx) {
    const obj = target(), kind = sel.split(":")[0];
    /** @type {[number, number, number, number] | null} */
    let box = null;
    if (kind === "prop" && obj) box = Cutaway.scene.propBox(obj);
    if (kind === "actor") { const a = Cutaway.actors.get(sel.slice(6)); if (a && a.room === room()?.id) box = a.box(); }
    if (kind === "hot") { const h = Cutaway.scene.hotspots().find((q) => q.id === sel.slice(4)); if (h) { const xs = h.poly.map((q) => q.x), ys = h.poly.map((q) => q.y); box = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; } }
    if (kind === "lamp" && obj) box = [obj.at[0] - 3, obj.at[1] - 3, 7, 7];
    if (!box) return;
    ctx.fillStyle = "#ffe14a";
    const [x, y, w, h] = box.map(Math.round);
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h, w + 1, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w, y, 1, h);
  }

  E.tab({ id: "things", label: "Things", build, pick, render, onRoom() { sel = "room"; } });
  E.modules.things = { get unsaved() { return dirty; }, save, target, select(/** @type {string} */ key) { sel = key; E.refresh(); }, change: (/** @type {string} */ s, /** @type {Field} */ f, /** @type {any} */ v) => { sel = s; change(f, v); }, FIELDS };
})();
