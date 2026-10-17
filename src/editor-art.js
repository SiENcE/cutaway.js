// Cutaway.js editor, Art tab: every sprite and animation of the game, previewed and exported (PNG, as a
// strip of frames with a JSON of the frames), and imported: a PNG (one picture, or a strip of frames)
// under a new name or replacing one. An import shows in the game at once; Save writes it into the
// studio's "art" folder (art/import/sprites, art/import/anims + .json, .anchor.json: what
// tools/build-atlas.mjs reads) and runs the game's "art: imported" task, which packs them into the
// "artAtlas" layer (assets/imported.js, loaded after the game's own art, so a name there replaces one).
// The paint view (editor-paint.js) paints an asset and saves it the same way (applyImport, writeImport).
// With the studio, the pxl sources (art/**/*.px.js) open in the centre: edit, save, build, reload the art.
"use strict";

/**
 * Pictures for the game as an import: frames of equal size side by side in one image.
 * @typedef {object} ArtImport
 * @property {string} name
 * @property {string | HTMLCanvasElement} src    the picture: a URL or a canvas
 * @property {number} w                          the whole strip
 * @property {number} h
 * @property {number} frames
 * @property {number | number[]} ms              how long each frame shows (one for all, or one each)
 * @property {[number, number] | null} anchor    an explicit anchor (else bottom centre)
 * @property {Uint8Array} [png]                  the PNG file (made from a canvas when missing)
 */

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  let search = "", onlyRoom = true, sel = "", zoom = 3, newForm = false;
  /** @type {"" | "paint" | "source"} what the Art workspace shows in the centre */
  let centre = "";
  /** @type {(ArtImport & {png: Uint8Array}) | null} a PNG read for import, not applied or saved yet */
  let pending = null;
  /** @type {{path: string, text: string, saved: string} | null} a pxl source being edited */
  let source = null;
  /** @type {string[] | null} */
  let sourceList = null;
  /** @type {Set<string>} the names in the studio's import folder */
  let imported = new Set();
  /** @type {HTMLCanvasElement | null} */
  let preview = null;
  const file = /** @type {HTMLInputElement} */ (el("input", { type: "file", accept: "image/png", style: { display: "none" },
    onchange: () => { const f = file.files?.[0]; file.value = ""; if (f) readImport(f).catch((e) => E.setStatus("import failed: " + e.message)); } }));
  document.body.append(file);

  /** The frames of an asset, as rects on its image. @param {string} name */
  function framesOf(name) {
    const a = Cutaway.assets.get(name);
    return a ? { img: Cutaway.assets.img(a.image), frames: a.frames, anchor: a.anchor } : null;
  }

  /**
   * Where each frame goes in a box of the largest frame's size, so the anchor stays right: bottom
   * centre (the default anchor's column stays on floor(w / 2)), or the top left with an explicit anchor
   * (it is the same point in every frame).
   * @param {{w: number, h: number}[]} frames @param {[number, number] | null | undefined} anchor
   */
  function layoutFrames(frames, anchor) {
    const w = Math.max(...frames.map((q) => q.w)), h = Math.max(...frames.map((q) => q.h));
    return { w, h, at: frames.map((q) => (anchor ? [0, 0] : [Math.floor(w / 2) - Math.floor(q.w / 2), h - q.h])) };
  }

  /** A canvas with every frame side by side (each in a box of the largest frame's size). @param {string} name */
  function strip(name) {
    const f = framesOf(name);
    if (!f || !f.img || !f.frames.length) return null;
    const L = layoutFrames(f.frames, f.anchor), c = document.createElement("canvas");
    c.width = L.w * f.frames.length; c.height = L.h;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    f.frames.forEach((q, i) => g.drawImage(/** @type {CanvasImageSource} */ (f.img), q.x, q.y, q.w, q.h, i * L.w + L.at[i][0], L.at[i][1], q.w, q.h));
    return { canvas: c, w: L.w, h: L.h, frames: f.frames, anchor: f.anchor };
  }

  /** @param {HTMLCanvasElement} c @returns {Promise<Uint8Array>} */
  const pngOf = (c) => new Promise((ok) => c.toBlob(async (b) => ok(new Uint8Array(await /** @type {Blob} */ (b).arrayBuffer())), "image/png"));

  async function exportSel() {
    const s = strip(sel);
    if (!s) return;
    E.download(`${sel}.png`, await pngOf(s.canvas));
    if (s.frames.length > 1 || s.anchor) {
      E.download(`${sel}.json`, JSON.stringify({ frames: s.frames.map((q, i) => ({ frame: { x: i * s.w, y: 0, w: s.w, h: s.h }, duration: q.duration })),
        ...(s.anchor ? { anchor: s.anchor } : {}) }, null, 1));
    }
    E.setStatus(`exported ${sel}.png (${s.frames.length} frame${s.frames.length > 1 ? "s" : ""})`);
  }

  /** Read a PNG for import. @param {File} f */
  async function readImport(f) {
    const png = new Uint8Array(await f.arrayBuffer()), url = URL.createObjectURL(f);
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
    const existing = sel ? Cutaway.assets.get(sel) : null;
    pending = { name: sel || f.name.replace(/\.png$/i, ""), png, src: url, w: img.width, h: img.height,
      frames: existing && existing.frames.length > 1 && img.width % existing.frames.length === 0 ? existing.frames.length : 1,
      ms: existing?.frames[0]?.duration ?? 100, anchor: existing?.anchor ?? null };
    E.setStatus(`${f.name}: ${img.width}x${img.height}. Set the name and frames, then Apply (to try it) or Save.`);
    centre = "";
    E.show("art");
  }

  /** @param {ArtImport} p @param {number} i */
  const msOf = (p, i) => (Array.isArray(p.ms) ? p.ms[i] ?? 100 : p.ms);

  /** An import in the game, now (until it reloads): the picture under `<name>__import`, the frames under the name. @param {ArtImport} p */
  function applyImport(p) {
    const fw = Math.floor(p.w / p.frames), imgName = `${p.name}__import`;
    Cutaway.assets.image(imgName, p.src);
    Cutaway.assets.anim(p.name, { image: imgName, frames: Array.from({ length: p.frames }, (_v, i) => [i * fw, 0, fw, p.h, msOf(p, i)]), ...(p.anchor ? { anchor: p.anchor } : {}) });
  }

  /** The pending import in the game, now. */
  function apply() {
    if (!pending) return;
    applyImport(pending);
    sel = pending.name;
    E.setStatus(`${pending.name} is in the game now (until it reloads): Save keeps it`);
  }

  /** The studio's import folder. */
  const artDir = () => E.studio.layer("art") || "art/import";

  /**
   * Write an import into the game's art folder (what build-atlas.mjs reads) and pack the imported atlas
   * (the game's "art: imported" task). Resolves to what happened, a line each.
   * @param {ArtImport} p @returns {Promise<string[]>}
   */
  async function writeImport(p) {
    const dir = artDir(), fw = Math.floor(p.w / p.frames), kind = p.frames > 1 ? "anims" : "sprites", out = [];
    const png = p.png ?? (typeof p.src === "string" ? null : await pngOf(p.src));
    if (!png) throw new Error("no PNG for " + p.name);
    if (E.studio.available) {                              // a sprite that became an animation (or back): the other one goes
      const other = kind === "anims" ? "sprites" : "anims";
      for (const f of [`${dir}/${other}/${p.name}.png`, `${dir}/${other}/${p.name}.json`, `${dir}/${other}/${p.name}.anchor.json`]) {
        if (await E.studio.exists(f)) { await E.studio.remove(f); out.push(`removed ${f}`); }
      }
    }
    out.push(await E.saveFile(`${dir}/${kind}/${p.name}.png`, png));
    if (p.frames > 1) out.push(await E.saveFile(`${dir}/anims/${p.name}.json`,
      JSON.stringify({ frames: Array.from({ length: p.frames }, (_v, i) => ({ frame: { x: i * fw, y: 0, w: fw, h: p.h }, duration: msOf(p, i) })) }, null, 1)));
    if (p.anchor) out.push(await E.saveFile(`${dir}/${kind}/${p.name}.anchor.json`, JSON.stringify({ anchor: p.anchor })));
    out.push(...await pack());
    imported.add(p.name);
    E.refresh();
    return out;
  }

  /** Pack the import folder into the imported atlas (the game's "art: imported" task). @returns {Promise<string[]>} */
  async function pack() {
    if (E.studio.available && E.studio.config?.tasks?.["art: imported"]) {
      const r = await E.runTask("art: imported");
      return [r.code === 0 ? r.output.trim() : "art: imported FAILED\n" + r.output];
    }
    return [`then pack ${artDir()} into ${E.studio.layer("artAtlas") || "assets/imported.js"} (tools/build-atlas.mjs)`];
  }

  /** Remove an asset's import files (with the studio). @param {string} name @returns {Promise<string[]>} the files removed */
  async function removeImport(name) {
    if (!E.studio.available) throw new Error("removing an import needs the studio");
    const dir = artDir(), gone = [];
    for (const k of ["sprites", "anims"]) for (const ext of [".png", ".json", ".anchor.json"]) {
      const f = `${dir}/${k}/${name}${ext}`;
      if (await E.studio.exists(f)) { await E.studio.remove(f); gone.push(f); }
    }
    imported.delete(name);
    E.refresh();
    return gone;
  }

  /** Which names the import folder holds (with the studio). */
  async function scanImported() {
    if (!E.studio.available) return;
    const dir = artDir(), names = new Set();
    for (const k of ["sprites", "anims"]) for (const e of await E.studio.list(`${dir}/${k}`).catch(() => [])) if (!e.dir && e.name.endsWith(".png")) names.add(e.name.slice(0, -4));
    imported = names;
    E.refresh();
  }

  /** Is a name overridden by an import (its file in the import folder, or its frames on the imported atlas)? @param {string} n */
  function isImported(n) {
    if (imported.has(n)) return true;
    const a = Cutaway.assets.has(n) ? Cutaway.assets.get(n) : null;
    const base = (E.studio.layer("artAtlas") || "assets/imported.js").split("/").pop()?.replace(/\.js$/, "").replace(/[^a-zA-Z0-9_]/g, "_") ?? "imported";
    return !!a && a.image.startsWith(base + "_atlas");
  }

  /**
   * Load the game's atlas scripts again (after building art), without reloading the page: every script
   * of the page that is just a Cutaway.assets.pack (what build-atlas.mjs writes), in the page's order.
   * Needs http (the studio). Resolves to how many it loaded.
   */
  async function reloadArt() {
    if (location.protocol === "file:") throw new Error("reloading the art needs the studio (http): reload the page instead");
    const urls = [...document.querySelectorAll("script[src]")].map((s) => /** @type {HTMLScriptElement} */ (s).src).filter((u) => !u.startsWith(Cutaway.base));
    let n = 0;
    for (const u of urls) {
      let text = "";
      try { text = await (await fetch(u, { cache: "no-store" })).text(); } catch { continue; }
      if (!/^\s*(\/\/[^\n]*\n\s*)*Cutaway\.assets\.pack\(/.test(text)) continue;
      const s = document.createElement("script");
      s.textContent = text + `\n//# sourceURL=${u}`;
      document.head.append(s); s.remove();
      n++;
    }
    await Cutaway.assets.ready();
    Cutaway.events.emit("art.reloaded", n);
    await scanImported();
    E.setStatus(`reloaded the art (${n} atlas script${n === 1 ? "" : "s"})`);
    return n;
  }

  /** The pxl sources under art/ (with the studio). @returns {Promise<string[]>} */
  async function sources() {
    /** @type {string[]} */
    const out = [];
    /** @param {string} d */
    const walk = async (d) => {
      for (const e of await E.studio.list(d)) {
        if (e.dir) { if (d.split("/").length < 4) await walk(`${d}/${e.name}`); }
        else if (e.name.endsWith(".px.js")) out.push(`${d}/${e.name}`);
      }
    };
    await walk("art");
    return out.sort();
  }

  // ------------------------------------------------------------------ the pxl source, in the centre

  /** @param {string} path */
  async function openSource(path) {
    try {
      const text = await E.studio.read(path);
      source = { path, text, saved: text };
      srcArea.value = text;
      srcArea.setSelectionRange(0, 0);
      srcArea.scrollTop = 0;
      centre = "source";
      E.show("art");
      buildSourceBar();
    } catch (e) { E.setStatus(`${path}: ${/** @type {any} */ (e).message}`); }
  }

  async function saveSource() {
    if (!source) return;
    source.text = srcArea.value;
    E.setStatus(await E.saveFile(source.path, source.text));
    source.saved = source.text;
    buildSourceBar();
  }

  /** Save the source, run an art task, load the new art. @param {string} task */
  async function buildSource(task) {
    if (source && source.text !== source.saved) await saveSource();
    const r = await E.runTask(task);
    if (r.code === 0) await reloadArt().catch((e) => E.setStatus(String(e.message)));
  }

  const srcArea = /** @type {HTMLTextAreaElement} */ (el("textarea", { spellcheck: false, wrap: "off",
    style: { flex: "1", width: "100%", boxSizing: "border-box", resize: "none", font: "13px/1.4 Consolas, Menlo, monospace", background: "#100d18",
      color: "#e8e0f0", border: "0", borderTop: "1px solid #3a3350", padding: "8px 10px", whiteSpace: "pre", outline: "none", tabSize: "2" },
    oninput: () => { if (source) { const was = source.text !== source.saved; source.text = srcArea.value; if (was !== (source.text !== source.saved)) { buildSourceBar(); E.refresh(); } } },
    onkeydown: (/** @type {KeyboardEvent} */ e) => {                // Tab: two spaces (Shift+Tab takes two away)
      if (e.key !== "Tab") return;
      e.preventDefault();
      const a = srcArea.selectionStart, b = srcArea.selectionEnd, v = srcArea.value, start = v.lastIndexOf("\n", a - 1) + 1;
      if (e.shiftKey) {
        if (v.slice(start, start + 2) === "  ") { srcArea.setRangeText("", start, start + 2, "preserve"); srcArea.selectionStart = Math.max(start, a - 2); srcArea.selectionEnd = Math.max(start, b - 2); }
      } else srcArea.setRangeText("  ", a, b, "end");
      srcArea.dispatchEvent(new Event("input"));
    } }));
  const srcBar = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "2px", alignItems: "center", padding: "3px 6px", background: "#1c1729" } });
  /** @type {EditorView} */
  const srcView = { el: el("div", { style: { display: "flex", flexDirection: "column", height: "100%" } }, [srcBar, srcArea]),
    shown() { srcArea.focus(); } };

  function buildSourceBar() {
    const tasks = Object.keys(E.studio.config?.tasks ?? {}).filter((t) => t.startsWith("art"));
    const dirty = !!source && source.text !== source.saved;
    const pick = /** @type {HTMLSelectElement} */ (el("select", { onchange: () => { if (pick.value) openSource(pick.value); } },
      [...new Set([...(sourceList ?? []), ...(source ? [source.path] : [])])].sort().map((s) => el("option", { value: s, textContent: s, selected: s === source?.path }))));
    const task = /** @type {HTMLSelectElement} */ (el("select", { title: "the art task to run" }, tasks.map((t) => el("option", { value: t, textContent: t }))));
    srcBar.replaceChildren(pick, el("span", { className: "cw-dirty", textContent: dirty ? " ●" : "" }),
      button("Save", () => { saveSource(); }, "Ctrl+S"),
      ...(tasks.length ? [task, button("Build", () => { E.runTask(task.value); }, "run the task (output: the output pane)"),
        button("Save + build + reload art", () => { buildSource(task.value); }, "save, run the task, load the new art into the game")] : []),
      button("Reload art", () => { reloadArt().catch((e) => E.setStatus(e.message)); }, "load the game's atlas scripts again (no page reload)"),
      button("Reload page", () => location.reload(), "load everything again (the editor opens again)"),
      el("span", { style: { flex: "1" } }),
      button("Close", () => { centre = ""; E.refresh(); }, "back to the game picture"));
  }

  // ------------------------------------------------------------------ the lists

  /** The asset names to list: the search, this room's own (and the cast's). */
  function names() {
    const room = Cutaway.scene.room?.id ?? "", q = search.toLowerCase();
    /** @param {string} n */
    const ofRoom = (n) => Cutaway.room.ids().find((r) => n.startsWith(r + "_")) ?? "";
    return Cutaway.assets.names().filter((n) => !n.endsWith("__import") && !/_atlas(_\d+)?$/.test(n)
      && (!onlyRoom || ofRoom(n) === "" || ofRoom(n) === room) && (!q || n.toLowerCase().includes(q)));
  }

  /** @param {string} n */
  function marks(n) {
    const p = E.modules.paint, d = p?.docs?.get(n);
    return (d?.dirty ? "* " : "") + n + (isImported(n) ? "  ● imported" : "");
  }

  /** The left panel's list: the sprites (click: select, double-click: paint). @param {HTMLElement} box */
  function browse(box) {
    box.append(el("div", { className: "hd", textContent: onlyRoom ? "SPRITES (THIS ROOM + CAST)" : "SPRITES" }));
    for (const n of names()) {
      box.append(el("div", { className: "row" + (n === sel ? " on" : ""), textContent: marks(n), title: "double-click: paint it",
        onclick: () => { sel = n; E.refresh(); }, ondblclick: () => { sel = n; E.modules.paint?.open(n); } }));
    }
  }

  function build(/** @type {HTMLElement} */ box) {
    const paint = E.modules.paint;
    if (paint?.doc && centre === "paint") { paint.inspector(box); box.append(el("div", { className: "cw-sec cw-h", textContent: "all the art" })); }
    if (newForm) box.append(newSpriteForm());
    const list = names();
    const find = /** @type {HTMLInputElement} */ (el("input", { type: "search", value: search, placeholder: "search", style: { width: "130px" },
      onchange: () => { search = find.value; E.refresh(); } }));
    box.append(el("div", {}, [find, " ", el("label", {}, [el("input", { type: "checkbox", checked: onlyRoom, onchange: () => { onlyRoom = !onlyRoom; E.refresh(); } }), "this room (and the cast)"])]));
    box.append(el("select", { size: 8, className: "cw-list", style: { marginTop: "4px" }, title: "double-click: paint it",
      onchange: (/** @type {any} */ e) => { sel = e.target.value; E.refresh(); }, ondblclick: () => { if (sel) paint?.open(sel); } },
      list.map((n) => el("option", { value: n, textContent: marks(n), selected: n === sel }))));
    preview = /** @type {HTMLCanvasElement} */ (el("canvas", { width: 340, height: 120, style: { background: "#3c9c94", imageRendering: "pixelated", marginTop: "4px", width: "340px", height: "120px" } }));
    box.append(preview);
    requestAnimationFrame(drawPreview);
    const a = sel ? Cutaway.assets.get(sel) : null;
    if (a) {
      const f0 = a.frames[0];
      box.append(el("div", { className: "cw-dim" }, [`${sel}: ${f0?.w}x${f0?.h}, ${a.frames.length} frame${a.frames.length > 1 ? "s" : ""}, ${a.total} ms${a.anchor ? `, anchor ${a.anchor.join(",")}` : ""}  `,
        button("x" + zoom, () => { zoom = zoom >= 6 ? 1 : zoom + 1; E.refresh(); }, "zoom")]));
      if (isImported(sel)) box.append(el("div", { style: { color: "#ff9a6a" } }, ["● imported: this picture replaces the game's own (its pxl source doesn't show until reverted)"]));
    }
    box.append(el("div", { style: { margin: "4px 0" } }, [
      button("Edit pixels", () => { if (sel) paint?.open(sel); }, "paint it (also: double-click it)"),
      button("New sprite", () => { newForm = true; E.refresh(); }),
      ...(sel && (isImported(sel) || paint?.docs?.get(sel)?.applied) ? [button("Revert", () => { paint?.revert(sel); }, "remove the import: the game's own art again")] : []),
    ]));
    box.append(el("div", { style: { margin: "4px 0" } }, [button("Export PNG", () => { exportSel(); }, "the frames side by side (+ JSON for animations)"),
      button(sel ? `Import over ${sel}` : "Import PNG", () => file.click(), "a PNG: one picture, or frames side by side"), button("New import", () => { sel = ""; file.click(); })]));
    if (pending) {
      const p = pending, st = { width: "70px" };
      const name = /** @type {HTMLInputElement} */ (el("input", { value: p.name, style: { width: "160px" }, onchange: () => { p.name = name.value.trim(); } }));
      box.append(el("div", { style: { border: "1px solid #ffe14a", padding: "4px", margin: "4px 0" } }, [
        el("div", {}, [`import ${p.w}x${p.h}: name `, name]),
        el("div", {}, ["frames ", el("input", { type: "number", min: 1, value: p.frames, style: st, onchange: (/** @type {any} */ e) => { p.frames = Math.max(1, Number(e.target.value) || 1); } }),
          " ms each ", el("input", { type: "number", min: 10, value: p.ms, style: st, onchange: (/** @type {any} */ e) => { p.ms = Number(e.target.value) || 100; } })]),
        el("div", {}, ["anchor (x,y; empty: bottom centre) ", el("input", { value: p.anchor ? p.anchor.join(",") : "", style: st,
          onchange: (/** @type {any} */ e) => { const v = String(e.target.value).split(",").map(Number); p.anchor = v.length === 2 && v.every(Number.isFinite) ? /** @type {[number, number]} */ (v) : null; } })]),
        el("div", {}, [button("Apply", apply, "show it in the game now"), button("Save", () => { saveImport().catch((e) => E.setStatus("save failed: " + e.message)); }, "write it into the game's art and pack it"),
          button("Cancel", () => { pending = null; E.refresh(); })]),
      ]));
    }
    if (E.studio.available) {
      const sec = el("div", { className: "cw-sec" }, [el("div", { className: "cw-h" }, ["pxl sources"])]);
      if (!sourceList) { loadSources(); sec.append("..."); }
      else {
        sec.append(el("div", { className: "cw-dim" }, ["open one in the centre: edit, save (Ctrl+S), build, reload the art"]));
        for (const s of sourceList) sec.append(el("div", { textContent: s, style: { cursor: "pointer", color: s === source?.path ? "#ffe14a" : "#b8b0c8" }, onclick: () => { openSource(s); } }));
      }
      sec.append(el("div", {}, [button("Reload art", () => { reloadArt().catch((e) => E.setStatus(e.message)); }, "load the game's atlas scripts again (no page reload)")]));
      box.append(sec);
    }
  }

  function loadSources() {
    if (sourceList || !E.studio.available) return;
    sourceList = [];
    sources().then((l) => { sourceList = l; buildSourceBar(); E.refresh(); }).catch(() => { sourceList = []; });
  }

  /** New sprite: a name, a size, empty or a copy of another. */
  function newSpriteForm() {
    const name = /** @type {HTMLInputElement} */ (el("input", { value: "new_sprite", style: { width: "150px" } }));
    const w = /** @type {HTMLInputElement} */ (el("input", { type: "number", min: 1, max: 1024, value: 32, style: { width: "56px" } }));
    const h = /** @type {HTMLInputElement} */ (el("input", { type: "number", min: 1, max: 1024, value: 32, style: { width: "56px" } }));
    const copy = /** @type {HTMLSelectElement} */ (el("select", { style: { maxWidth: "200px" } }, ["", ...Cutaway.assets.names().filter((n) => !n.endsWith("__import") && !/_atlas(_\d+)?$/.test(n))]
      .map((n) => el("option", { value: n, textContent: n || "(empty)", selected: n === sel && false }))));
    return el("div", { style: { border: "1px solid #ffe14a", padding: "4px", margin: "4px 0" } }, [
      el("div", { className: "cw-h" }, ["New sprite"]),
      el("div", {}, ["name ", name]), el("div", {}, ["size ", w, " x ", h]), el("div", {}, ["copy of ", copy]),
      el("div", {}, [button("Create", () => {
        const n = name.value.trim().replace(/[^\w-]+/g, "_");
        if (!n) return;
        if (Cutaway.assets.has(n) && !confirm(`${n} exists: paint over it?`)) return;
        newForm = false;
        E.modules.paint?.newSprite(n, Number(w.value) || 32, Number(h.value) || 32, copy.value || undefined);
      }), button("Cancel", () => { newForm = false; E.refresh(); })]),
    ]);
  }

  /** Save the pending import. */
  async function saveImport() {
    if (!pending) return;
    apply();
    const lines = await writeImport(pending);
    pending = null;
    E.setStatus(lines.join("\n"));
  }

  /** File > Save: what the Art workspace shows (all: everything it has unsaved). @param {boolean} [all] */
  async function save(all) {
    const paint = E.modules.paint;
    if (all) {
      if (source && source.text !== source.saved) await saveSource();
      if (pending) await saveImport();
      if (paint?.unsaved) await paint.saveAll();
      return;
    }
    if (centre === "source" && source) await saveSource();
    else if (centre === "paint" && paint?.doc) await paint.save();
    else if (pending) await saveImport();
    else E.setStatus("Art: nothing to save");
  }

  /** The Art menu. @returns {Record<string, MenuItem[]>} */
  function menu() {
    const paint = E.modules.paint, s = E.studio.available;
    if (s) loadSources();
    return { Art: [
      { label: sel ? `Edit pixels: ${sel}` : "Edit pixels", key: "dbl-click", run: () => paint?.open(sel), enabled: !!sel && !!paint },
      { label: "New sprite ...", run: () => { newForm = true; E.show("art"); } },
      { label: "Revert to the game's art", run: () => paint?.revert(sel), enabled: !!sel && !!paint && (isImported(sel) || !!paint.docs.get(sel)?.applied) },
      { sep: true },
      { label: sel ? `Import PNG over ${sel} ...` : "Import PNG ...", run: () => file.click() },
      { label: "Export PNG", run: () => { exportSel(); }, enabled: !!sel },
      { sep: true },
      { label: "Reload art", run: () => { reloadArt().catch((e) => E.setStatus(e.message)); }, enabled: s, title: "load the game's atlas scripts again" },
      { head: "pxl sources" },
      ...(s ? (sourceList ?? []).slice(0, 30).map((p) => ({ label: p, checked: p === source?.path && centre === "source", run: () => { openSource(p); } }))
        : [{ label: "(with the studio)", enabled: false }]),
      ...(s && sourceList && !sourceList.length ? [{ label: "(none under art/)", enabled: false }] : []),
    ] };
  }

  // the preview: the selected asset, animated, at the zoom, anchored bottom centre
  function drawPreview() {
    if (!preview || !preview.isConnected) return;
    requestAnimationFrame(drawPreview);
    const g = /** @type {CanvasRenderingContext2D} */ (preview.getContext("2d")), a = sel ? Cutaway.assets.get(sel) : null;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, preview.width, preview.height);
    if (!a) return;
    g.save();
    const f = a.frames[0], fw = f?.w ?? 1, fh = f?.h ?? 1;
    const z = fw * zoom > preview.width - 4 || fh * zoom > preview.height - 4 ? Math.min((preview.width - 4) / fw, (preview.height - 4) / fh) : zoom;   // big pictures fit
    g.scale(z, z);
    Cutaway.assets.draw(g, /** @type {string} */ (sel), Math.floor(preview.width / z / 2), Math.min(Math.floor(preview.height / z) - 2, fh + 4), { t: performance.now(), anchor: f ? [Math.floor(fw / 2), fh] : [0, 0] });
    g.restore();
  }

  Cutaway.events.on("art.reloaded", () => E.refresh());
  E.tab({ id: "art", label: "Art", build, browse, menu, save,
    get unsaved() { return (pending ? 1 : 0) + (source && source.text !== source.saved ? 1 : 0) + (E.modules.paint?.unsaved ?? 0); },
    view() { return centre === "source" && source ? srcView : centre === "paint" ? E.modules.paint?.view ?? null : null; },
    onRoom() { E.refresh(); } });
  E.modules.art = { get unsaved() { return pending ? 1 : 0; }, strip, framesOf, layoutFrames, pngOf, readImport, apply, applyImport, writeImport, removeImport, pack,
    scanImported, isImported, reloadArt, openSource, save: saveImport, get pending() { return pending; }, get selected() { return sel; },
    /** The paint view takes the centre (it calls this when it opens one). @param {string} name */
    showPaint(name) { sel = name; centre = "paint"; E.show("art"); },
    /** Back to the game picture. */
    closeCentre() { centre = ""; E.refresh(); },
    get centre() { return centre; },
    select(/** @type {string} */ n) { sel = n; E.refresh(); } };
  E.studio.connect().then(() => scanImported());
})();
