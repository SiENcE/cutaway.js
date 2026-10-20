// Cutaway.js editor, Texts tab: every text of the game (lines, looks, names, choices, cards, hints,
// sequences' lines and captions, the title screen and the gate) with where it is used. Change one and the game shows it at once; Save writes the language's text
// layer (Cutaway.i18n.layer in game/strings/<lang>.texts.js, the studio's "texts" layer), which maps
// the text in the game's data to what it says now. Export and import CSV or JSON, for translators:
// one row per text, a column per language.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  let lang = "", search = "", onlyRoom = true;
  /** @type {Record<string, Record<string, string>>} what changed per language, not saved yet */
  const changed = {};

  function languages() { const l = Cutaway.menu.languages; return l.length ? l : [Cutaway.i18n.language]; }
  function source() { return languages()[0]; }

  /**
   * Every text in the game's data: [where, text]. Script steps (captions too), names, choices, cards,
   * hints, sequences, the title screen and the gate's prompt.
   * @returns {{where: string, room: string, text: string}[]}
   */
  function collect() {
    /** @type {{where: string, room: string, text: string}[]} */
    const out = [];
    const seen = new Set();
    /** @param {any} t @param {string} where @param {string} room */
    const add = (t, where, room) => {
      if (typeof t !== "string" || !t || t.startsWith("@")) return;
      const k = room + "\u0000" + t;
      if (seen.has(k)) return;
      seen.add(k); out.push({ where, room, text: t });
    };
    /** @param {any} s @param {string} where @param {string} room */
    const script = (s, where, room) => {
      if (s === undefined || s === null) return;
      if (typeof s === "string") { add(s, where, room); return; }
      if (Array.isArray(s)) { s.forEach((x) => script(x, where, room)); return; }
      if (typeof s !== "object") return;
      if ("if" in s) { script(s.then, where, room); script(s.else, where, room); return; }
      if ("once" in s) { script(s.once, where, room); script(s.else, where, room); return; }
      if ("say" in s) add("text" in s ? s.text : s.say, where, room);
      for (const k of ["narrate", "card", "title", "end", "caption"]) if (k in s) add(s[k], where, room);
    };
    for (const id of Cutaway.room.ids()) {
      const r = Cutaway.room.get(id);
      add(r.name, `${id}: name`, id);
      script(r.enter, `${id}: entering`, id);
      for (const [hid, h] of Object.entries(r.hotspots ?? {})) {
        add(h.name, `${id}/${hid}: name`, id);
        for (const v of ["look", "use", "talk", "take"]) script(/** @type {any} */ (h)[v], `${id}/${hid}: ${v}`, id);
        for (const [it, s] of Object.entries(h.with ?? {})) script(s, `${id}/${hid}: with ${it}`, id);
      }
    }
    for (const id of Cutaway.item.ids()) {
      const it = /** @type {ItemDef} */ (Cutaway.item.get(id));
      add(it.name, `item ${id}: name`, "");
      script(it.look, `item ${id}: look`, "");
      for (const [o, s] of Object.entries(it.combine ?? {})) script(s, `item ${id}: with ${o}`, "");
    }
    for (const a of Cutaway.actors.all()) {
      const room = a.def.room ?? "";
      add(a.def.name, `${a.id}: name`, "");
      for (const v of ["look", "talk"]) script(/** @type {any} */ (a.def)[v], `${a.id}: ${v}`, room);
      for (const [it, s] of Object.entries(a.def.with ?? {})) script(s, `${a.id}: with ${it}`, room);
    }
    for (const id of Cutaway.dialog.ids()) {
      for (const [node, n] of Object.entries(Cutaway.dialog.get(id) ?? {})) {
        const choices = Array.isArray(n) ? n : n.choices;
        if (!Array.isArray(n)) script(n.enter, `dialog ${id}/${node}`, "");
        for (const c of choices ?? []) { add(c.text, `dialog ${id}/${node}: choice`, ""); script(c.then, `dialog ${id}/${node}`, ""); }
      }
    }
    for (const id of Cutaway.act.ids()) {
      const a = /** @type {ActDef} */ (Cutaway.act.get(id));
      add(a.title, `act ${id}: title`, ""); add(a.name, `act ${id}: name`, ""); script(a.start, `act ${id}: start`, "");
    }
    Cutaway.hints.all().forEach((h, i) => (Array.isArray(h.text) ? h.text : [h.text]).forEach((t) => add(t, `hint ${i + 1}`, "")));
    for (const id of Cutaway.sequence?.ids() ?? []) {
      const q = Cutaway.sequence.get(id);
      script(q?.steps, `sequence ${id}`, ""); script(q?.after, `sequence ${id}: after`, "");
    }
    // the title screen's texts and the gate's prompt
    const ti = Cutaway.acts.title;
    if (ti) for (const k of /** @type {const} */ (["name", "tagline", "footer"])) add(ti[k], `title screen: ${k}`, "");
    add(Cutaway.sequence?.gate()?.prompt, "the gate: prompt", "");
    return out;
  }

  /** What a text says now in a language. @param {string} text @param {string} l */
  function current(text, l) {
    const c = changed[l]?.[text];
    if (c !== undefined) return c;
    const tbl = Cutaway.i18n.strings(l);
    return tbl[text] ?? (l === source() ? text : "");
  }

  /** Change a text now (the game shows it at once). @param {string} text @param {string} l @param {string} value */
  function set(text, l, value) {
    (changed[l] ??= {})[text] = value;
    Cutaway.i18n.table(l, { [text]: value });
  }

  /** The layer file of a language: what it had, plus the changes. @param {string} l */
  function layerText(l) {
    const entries = { ...Cutaway.i18n.layerOf(l), ...(changed[l] ?? {}) };
    for (const [k, v] of Object.entries(entries)) if (l === source() && k === v) delete entries[k];   // back as it was
    const body = Object.keys(entries).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(entries[k])},`).join("\n");
    return `// Texts of the language "${l}" as changed in the Cutaway editor (Texts tab): the text in the game's\n` +
      `// data, then what it says now. Loaded after the game's own data.\n"use strict";\n\n` +
      `Cutaway.i18n.layer(${JSON.stringify(l)}, {\n${body}${body ? "\n" : ""}});\n`;
  }

  async function save() {
    const out = [];
    for (const l of Object.keys(changed)) {
      if (!Object.keys(changed[l]).length) continue;
      const msg = await E.saveFile(E.studio.layer("texts", { lang: l }) || `game/strings/${l}.texts.js`, layerText(l));
      Cutaway.i18n.layer(l, changed[l]);
      changed[l] = {};
      out.push(msg);
    }
    E.setStatus(out.length ? out.join("\n") : "nothing changed");
  }

  // ------------------------------------------------------------------ export and import

  /** @param {string} v */
  const csvCell = (v) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  function exportCsv() {
    const ls = languages(), rows = [["where", "text", ...ls]];
    for (const t of collect()) rows.push([t.where, t.text, ...ls.map((l) => current(t.text, l))]);
    E.download("texts.csv", "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n");
    E.setStatus(`exported ${rows.length - 1} texts (texts.csv: one column per language)`);
  }
  function exportJson() {
    /** @type {Record<string, any>} */
    const out = {};
    for (const t of collect()) out[t.text] = { where: t.where, ...Object.fromEntries(languages().map((l) => [l, current(t.text, l)])) };
    E.download("texts.json", JSON.stringify(out, null, 2));
    E.setStatus(`exported ${Object.keys(out).length} texts (texts.json)`);
  }

  /** Parse CSV (RFC 4180: commas, quotes, newlines in quotes). @param {string} s @returns {string[][]} */
  function parseCsv(s) {
    const rows = []; let row = [], cell = "", q = false;
    s = s.replace(/^﻿/, "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === "," || c === ";") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c !== ""));
  }

  /** Take texts from a CSV or JSON export (changes only where they differ). @param {File} f */
  async function importFile(f) {
    const s = await f.text();
    /** @type {Record<string, Record<string, string>>} text -> lang -> value */
    const got = {};
    if (f.name.endsWith(".json")) {
      for (const [text, v] of Object.entries(JSON.parse(s))) got[text] = typeof v === "string" ? { [lang]: v } : v;
    } else {
      const [head, ...rows] = parseCsv(s), ti = head.indexOf("text");
      if (ti < 0) throw new Error('no "text" column');
      for (const r of rows) got[r[ti]] = Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""]).filter(([h]) => h !== "where" && h !== "text"));
    }
    let n = 0;
    for (const [text, byLang] of Object.entries(got)) {
      for (const [l, v] of Object.entries(byLang)) {
        if (l === "where" || typeof v !== "string" || !v || v === current(text, l)) continue;
        set(text, l, v); n++;
      }
    }
    E.setStatus(`imported ${n} changed texts from ${f.name}: Save to keep them` +
      (Object.keys(changed).some((l) => !languages().includes(l)) ? "\n(a new language also needs its texts file in the page and in Cutaway.start's languages)" : ""));
    E.refresh();
  }

  function build(/** @type {HTMLElement} */ box) {
    if (!lang || !languages().includes(lang)) lang = source();
    const room = Cutaway.scene.room?.id ?? "";
    const all = collect(), q = search.toLowerCase();
    const list = all.filter((t) => (!onlyRoom || t.room === room) && (!q || t.text.toLowerCase().includes(q) || current(t.text, lang).toLowerCase().includes(q) || t.where.toLowerCase().includes(q)));
    const pending = Object.values(changed).reduce((n, c) => n + Object.keys(c).length, 0);
    const langSel = /** @type {HTMLSelectElement} */ (el("select", { onchange: () => { lang = langSel.value; E.refresh(); } },
      languages().map((l) => el("option", { value: l, textContent: l + (l === source() ? " (source)" : ""), selected: l === lang }))));
    const find = /** @type {HTMLInputElement} */ (el("input", { type: "search", value: search, placeholder: "search", style: { width: "120px" },
      onchange: () => { search = find.value; E.refresh(); } }));
    const file = /** @type {HTMLInputElement} */ (el("input", { type: "file", accept: ".csv,.json", style: { display: "none" },
      onchange: () => { const f = file.files?.[0]; if (f) importFile(f).catch((e) => E.setStatus("import failed: " + e.message)); } }));
    box.append(
      el("div", {}, ["language ", langSel, " ", find, " ", el("label", {}, [el("input", { type: "checkbox", checked: onlyRoom, onchange: () => { onlyRoom = !onlyRoom; E.refresh(); } }), "this room"])]),
      el("div", { style: { margin: "6px 0" } }, [button(`Save${pending ? ` (${pending})` : ""}`, () => { save().catch((e) => E.setStatus("save failed: " + e.message)); }, "write the text layer of each changed language"),
        button("Export CSV", exportCsv), button("Export JSON", exportJson), button("Import", () => file.click(), "CSV or JSON from an export"), file]),
      el("div", { className: "cw-dim" }, [`${list.length} of ${all.length} texts`]),
    );
    /** @param {{where: string, room: string, text: string}} t */
    const row = (t) => {
      const now = current(t.text, lang), differs = now !== t.text;
      const area = /** @type {HTMLTextAreaElement} */ (el("textarea", { value: now, rows: Math.min(4, 1 + Math.floor(now.length / 46)),
        style: { width: "100%", boxSizing: "border-box", color: lang === source() && !differs ? "#eee" : "#ffe9a0", borderColor: "#3a3350", resize: "vertical" },
        oninput: () => set(t.text, lang, area.value) }));
      return el("div", { style: { padding: "4px 0", borderBottom: "1px solid #2a2340" } }, [
        el("div", { style: { color: "#8a84a0", fontSize: "11px" } }, [t.where]),
        ...(differs || lang !== source() ? [el("div", { style: { color: "#777", fontSize: "11px", whiteSpace: "pre-wrap" } }, [t.text])] : []),
        area]);
    };
    // grouped (this room: by hotspot; else by room, items, dialogues, acts, hints, sequences, the title); a group's rows are made while it is open
    /** @type {Map<string, {where: string, room: string, text: string}[]>} */
    const groups = new Map();
    for (const t of list) { const g = groupOf(t); groups.set(g, [...(groups.get(g) ?? []), t]); }
    const many = list.length > 40;
    for (const [g, ts] of groups) box.append(E.fold(`texts.${onlyRoom ? "room." : ""}${g}`, g, () => ts.map(row), { note: String(ts.length), folded: many, open: !!q && ts.length <= 60 }));
  }

  /** The group a text is listed in. @param {{where: string, room: string}} t */
  function groupOf(t) {
    const w = t.where;
    if (onlyRoom && t.room) return w.slice(0, w.indexOf(":") >= 0 ? w.indexOf(":") : w.length);
    if (w.startsWith("item ")) return "items";
    if (w.startsWith("dialog ")) return w.slice(0, w.indexOf("/") >= 0 ? w.indexOf("/") : w.length);
    if (w.startsWith("act ")) return "acts";
    if (w.startsWith("hint ")) return "hints";
    if (w.startsWith("sequence ")) return w.split(":")[0];
    if (w.startsWith("title screen") || w.startsWith("the gate")) return "title screen";
    return t.room || "the cast";
  }

  E.tab({ id: "texts", label: "Texts", build, save: () => save() });
  Cutaway.editor.modules.texts = { collect, current, set, layerText, parseCsv, save,
    get unsaved() { return Object.values(changed).reduce((n, c) => n + Object.keys(c).length, 0); } };
})();
