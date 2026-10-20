// Cutaway.js editor, Things tab: the properties of the room and of what is in it (hotspots, props,
// lamps, effects, actors) and of the items, and their scripts (what looking, using, talking, taking and
// using an item on them does; a room's entering): each opens as blocks in the centre (editor-script.js).
// Pick a thing in the list or click it on the picture, change a field or a step and the game does it at
// once; Save writes the edits layer (Cutaway.edits in game/edits.js, the studio's "edits" layer), which
// the Dialogue tab shares. Texts are changed in the Texts tab, shapes in the Room tab.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  /** @type {string} "room", "hot:<id>", "prop:<id>", "lamp:<id>", "fx:<id>", "actor:<id>", "item:<id>" */
  let sel = "room";
  let dirty = false;
  /** @type {{kind: EditKind, id: string, path: string[], title: string, view: EditorView} | null} the script open in the centre */
  let open = null;

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
      { path: "flip", type: "bool" }, { path: "hidden", type: "bool" }, { path: "baseline", type: "number" }, { path: "scroll", type: "number" },
      { path: "depth", type: "number", hint: "parallax: 1 the room, 0 fixed on the screen, >1 foreground" }],
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
  /** A patch that sets one path ("a.b.c" or its parts). @param {string | string[]} path @param {any} v */
  const patchOf = (path, v) => (Array.isArray(path) ? path : path.split(".")).slice().reverse().reduce((acc, k) => ({ [k]: acc }), v);

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

  /** Where the picked thing's data is in the edits layer: its kind, id and the path in it. @returns {{kind: EditKind, id: string, base: string[]} | null} */
  function where() {
    const r = room(), [kind, id] = sel.includes(":") ? [sel.slice(0, sel.indexOf(":")), sel.slice(sel.indexOf(":") + 1)] : [sel, ""];
    if (kind === "room") return r ? { kind: "rooms", id: r.id, base: [] } : null;
    if (kind === "hot") return r ? { kind: "rooms", id: r.id, base: ["hotspots", id] } : null;
    if (kind === "item") return { kind: "items", id, base: [] };
    if (kind === "actor") return { kind: "actors", id, base: [] };
    return null;
  }

  /** The scripts the picked thing has, and the verbs it could have. */
  function scripts() {
    const obj = target(), kind = sel.split(":")[0];
    if (!obj) return null;
    const verbs = kind === "room" ? ["enter"] : kind === "hot" ? ["look", "use", "talk", "take"] : kind === "item" ? ["look"] : kind === "actor" ? ["look", "talk"] : [];
    const withKey = kind === "item" ? "combine" : kind === "hot" || kind === "actor" ? "with" : "";
    /** @type {{label: string, path: string[], value: any}[]} */
    const list = verbs.filter((v) => obj[v] !== undefined).map((v) => ({ label: v, path: [v], value: obj[v] }));
    if (withKey) for (const [k, v] of Object.entries(obj[withKey] ?? {})) list.push({ label: `${withKey} ${k}`, path: [withKey, k], value: v });
    return { verbs: verbs.filter((v) => obj[v] === undefined), withKey, list };
  }

  /** Open a script of the picked thing in the centre. @param {string[]} path @param {string} label */
  function openScript(path, label) {
    const w = where(), S = E.modules.script;
    if (!w || !S) return;
    const full = [...w.base, ...path];
    const title = `${sel.startsWith("hot:") ? `${w.id}/${sel.slice(4)}` : sel.startsWith("item:") ? `item ${w.id}` : w.id}: ${label}`;
    const get = () => full.reduce((/** @type {any} */ v, k) => (v == null ? undefined : v[k]),
      w.kind === "rooms" ? Cutaway.room.get(w.id) : w.kind === "items" ? Cutaway.item.get(w.id) : Cutaway.actors.get(w.id)?.def);
    const hotspot = sel.startsWith("hot:") ? sel.slice(4) : undefined;
    const view = S.view({ title, value: get(),
      change: (/** @type {any[] | null} */ v) => { Cutaway.edits.change(w.kind, w.id, patchOf(full, v)); dirty = true; E.refresh(); },
      changed: () => Cutaway.edits.changed(w.kind, w.id, full),
      revert: () => { Cutaway.edits.revert(w.kind, w.id, full); E.refresh(); return get(); },
      test: (/** @type {any[]} */ v) => { E.close(); Cutaway.script.run(v, { path: `edit.${full.join(".")}`, hotspot }); },
      close: () => { open = null; E.refresh(); } });
    open = { kind: w.kind, id: w.id, path: full, title, view };
    E.refresh();
  }

  async function save() {
    const text = `// What the Cutaway editor changed in the game's data (Things and Dialogue tabs): rooms, hotspots, props,\n` +
      `// light, effects, music, items, actors, their scripts, and dialogues. Loaded after the game's own data;\n` +
      `// objects merge, values (and scripts) replace, null removes, a dialogue is kept whole.\n"use strict";\n\n` +
      `Cutaway.edits(${E.fmt(Cutaway.edits.data())});\n`;
    E.setStatus(await E.saveFile(E.studio.layer("edits") || "game/edits.js", text));
    dirty = false;
  }

  /** An input for a field. @param {Field} f @param {any} obj */
  function input(f, obj) {
    const v = get(obj, f.path), st = {};
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

  /** The things to pick from: the room, what is in it, the actors and the items. @returns {ListItem[]} */
  function things() {
    const r = room();
    /** @type {ListItem[]} */
    const out = [{ key: "room", label: `room ${r?.id ?? ""}` }];
    for (const id of Object.keys(r?.hotspots ?? {})) out.push({ key: `hot:${id}`, label: id, group: "hotspots" });
    for (const p of r?.props ?? []) if (p.id) out.push({ key: `prop:${p.id}`, label: p.id, group: "props" });
    (r?.light?.lamps ?? []).forEach((l, i) => out.push({ key: `lamp:${l.id ?? i}`, label: String(l.id ?? i), group: "lamps" }));
    (r?.fx ?? []).forEach((f, i) => out.push({ key: `fx:${f.id ?? i}`, label: `${f.kind} ${f.id ?? i}`, group: "effects" }));
    for (const a of Cutaway.actors.all()) out.push({ key: `actor:${a.id}`, label: a.id + (a.room === r?.id ? "  (here)" : ""), group: "actors", dim: a.room !== r?.id });
    for (const id of Cutaway.item.ids()) out.push({ key: `item:${id}`, label: id, group: "items" });
    return out;
  }

  function build(/** @type {HTMLElement} */ box) {
    const list = things();
    if (!list.some((t) => t.key === sel)) sel = "room";
    const pick = E.list({ id: "things", items: list, selected: sel, filter: true, height: "220px", foldOver: 20, pick: (k) => { sel = k; E.refresh(); } });
    box.append(el("div", { style: { margin: "4px 0" } }, [button(`Save${dirty ? " *" : ""}`, () => { save().catch((e) => E.setStatus("save failed: " + e.message)); }, "write the edits layer"),
      el("span", { className: "cw-dim" }, [" click a thing on the picture (or in the list on the left)"])]), pick);
    const obj = target(), kind = sel.split(":")[0];
    if (!obj) return;
    const form = el("div", { className: "cw-sec" });
    for (const f of FIELDS[kind] ?? []) {
      form.append(el("div", { style: { margin: "3px 0" } }, [el("div", { className: "cw-dim" }, [f.path + (f.hint ? `  (${f.hint})` : "")]), input(f, obj)]));
    }
    box.append(form);
    const sc = scripts(), w = where(), S = E.modules.script;
    if (sc && w && S && (sc.list.length || sc.verbs.length || sc.withKey)) {
      const add = /** @type {HTMLSelectElement} */ (el("select", { onchange: () => {
        const v = add.value;
        if (!v) return;
        if (v === "+with") {
          const ids = Cutaway.item.ids();
          const it = (prompt(`${sc.withKey} which item? (${ids.slice(0, 12).join(", ")}${ids.length > 12 ? ", ..." : ""})`) ?? "").trim();
          if (it) openScript([sc.withKey, it], `${sc.withKey} ${it}`);
        } else openScript([v], v);
      } }, [el("option", { value: "", textContent: "+ script" }), ...sc.verbs.map((v) => el("option", { value: v, textContent: v })),
        ...(sc.withKey ? [el("option", { value: "+with", textContent: `${sc.withKey} an item ...` })] : [])]));
      box.append(el("div", { className: "cw-sec" }, [E.fold("things.scripts", "scripts", () => [
        ...sc.list.map((x) => {
          const full = [...w.base, ...x.path], on = !!open && open.kind === w.kind && open.id === w.id && open.path.join(".") === full.join(".");
          return el("div", { style: { margin: "2px 0", cursor: "pointer", color: on ? "#ffe14a" : "" }, title: "open it in the centre", onclick: () => openScript(x.path, x.label) }, [
            el("span", { style: { color: "#7ad8ff" } }, [x.label]), Cutaway.edits.changed(w.kind, w.id, full) ? el("span", { className: "cw-dirty" }, [" ● changed"]) : "",
            el("div", { className: "cw-dim", style: { paddingLeft: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, [S.summary(x.value)])]);
        }),
        el("div", {}, [add]),
        el("div", { className: "cw-dim" }, ["Its name and texts: the Texts tab. Its shape and walk-to point: the Room tab."]),
      ], { note: String(sc.list.length) })]));
    }
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

  E.tab({ id: "things", label: "Things", build, pick, render, onRoom() { sel = "room"; open = null; }, save: () => save(),
    selectNone() { if (open) open = null; else sel = "room"; E.refresh(); }, view: () => open?.view ?? null });
  E.modules.things = { get unsaved() { return dirty; }, save, target, get selected() { return sel; }, openScript, get script() { return open; },
    /** Another tab changed the edits layer (the Dialogue tab): it is saved with this one. */
    touch() { dirty = true; }, select(/** @type {string} */ key) { sel = key; E.refresh(); }, change: (/** @type {string} */ s, /** @type {Field} */ f, /** @type {any} */ v) => { sel = s; change(f, v); }, FIELDS };
})();
