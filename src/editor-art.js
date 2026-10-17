// Cutaway.js editor, Art tab: every sprite and animation of the game, previewed and exported (PNG, as a
// strip of frames with a JSON of the frames), and imported: a PNG (one picture, or a strip of frames)
// under a new name or replacing one. An import shows in the game at once; Save writes it into the
// studio's "art" folder (art/import/sprites, art/import/anims + .json, .anchor.json: what
// tools/build-atlas.mjs reads) and runs the game's "art: imported" task, which packs them into the
// "artAtlas" layer (assets/imported.js, loaded after the game's own art, so a name there replaces one).
// With the studio, the pxl sources (art/**/*.px.js) open here too: edit, save, build.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  let search = "", onlyRoom = true, sel = "", zoom = 3;
  /** @type {{name: string, png: Uint8Array, url: string, w: number, h: number, frames: number, ms: number, anchor: [number, number] | null} | null} */
  let pending = null;
  /** @type {{path: string, text: string} | null} a pxl source being edited */
  let source = null;
  /** @type {HTMLCanvasElement | null} */
  let preview = null;

  /** The frames of an asset, as rects on its image. @param {string} name */
  function framesOf(name) {
    const a = Cutaway.assets.get(name);
    return a ? { img: Cutaway.assets.img(a.image), frames: a.frames, anchor: a.anchor } : null;
  }

  /** A canvas with every frame side by side. @param {string} name */
  function strip(name) {
    const f = framesOf(name);
    if (!f || !f.img || !f.frames.length) return null;
    const w = Math.max(...f.frames.map((q) => q.w)), h = Math.max(...f.frames.map((q) => q.h)), c = document.createElement("canvas");
    c.width = w * f.frames.length; c.height = h;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    f.frames.forEach((q, i) => g.drawImage(/** @type {CanvasImageSource} */ (f.img), q.x, q.y, q.w, q.h, i * w, h - q.h, q.w, q.h));
    return { canvas: c, w, h, frames: f.frames, anchor: f.anchor };
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
    pending = { name: sel || f.name.replace(/\.png$/i, ""), png, url, w: img.width, h: img.height,
      frames: existing && existing.frames.length > 1 && img.width % existing.frames.length === 0 ? existing.frames.length : 1,
      ms: existing?.frames[0]?.duration ?? 100, anchor: null };
    E.setStatus(`${f.name}: ${img.width}x${img.height}. Set the name and frames, then Apply (to try it) or Save.`);
    E.refresh();
  }

  /** The pending import in the game, now. */
  function apply() {
    if (!pending) return;
    const p = pending, fw = Math.floor(p.w / p.frames), imgName = `${p.name}__import`;
    Cutaway.assets.image(imgName, p.url);
    Cutaway.assets.anim(p.name, { image: imgName, frames: Array.from({ length: p.frames }, (_v, i) => [i * fw, 0, fw, p.h, p.ms]), ...(p.anchor ? { anchor: p.anchor } : {}) });
    sel = p.name;
    E.setStatus(`${p.name} is in the game now (until it reloads): Save keeps it`);
    E.refresh();
  }

  /** Write the import into the game's art folder and rebuild the imported atlas. */
  async function save() {
    if (!pending) return;
    apply();
    const p = pending, dir = E.studio.layer("art") || "art/import", fw = Math.floor(p.w / p.frames);
    const kind = p.frames > 1 ? "anims" : "sprites", out = [];
    out.push(await E.saveFile(`${dir}/${kind}/${p.name}.png`, p.png));
    if (p.frames > 1) out.push(await E.saveFile(`${dir}/anims/${p.name}.json`,
      JSON.stringify({ frames: Array.from({ length: p.frames }, (_v, i) => ({ frame: { x: i * fw, y: 0, w: fw, h: p.h }, duration: p.ms })) }, null, 1)));
    if (p.anchor) out.push(await E.saveFile(`${dir}/${kind}/${p.name}.anchor.json`, JSON.stringify({ anchor: p.anchor })));
    if (E.studio.available && E.studio.config?.tasks?.["art: imported"]) {
      const r = await E.studio.run("art: imported");
      out.push(r.code === 0 ? r.output.trim() : "art: imported FAILED\n" + r.output);
    } else out.push(`then pack ${dir} into ${E.studio.layer("artAtlas") || "assets/imported.js"} (tools/build-atlas.mjs)`);
    pending = null;
    E.setStatus(out.join("\n"));
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

  /** @type {string[] | null} */
  let sourceList = null;

  function build(/** @type {HTMLElement} */ box) {
    const room = Cutaway.scene.room?.id ?? "", q = search.toLowerCase();
    /** @param {string} n */
    const ofRoom = (n) => Cutaway.room.ids().find((r) => n.startsWith(r + "_")) ?? "";
    const names = Cutaway.assets.names().filter((n) => !n.endsWith("__import") && !/_atlas(_\d+)?$/.test(n)
      && (!onlyRoom || ofRoom(n) === "" || ofRoom(n) === room) && (!q || n.toLowerCase().includes(q)));
    const find = /** @type {HTMLInputElement} */ (el("input", { type: "search", value: search, placeholder: "search", style: { font: "inherit", width: "130px", background: "#221c30", color: "#eee", border: "1px solid #4a4066" },
      onchange: () => { search = find.value; E.refresh(); } }));
    box.append(el("div", {}, [find, " ", el("label", {}, [el("input", { type: "checkbox", checked: onlyRoom, onchange: () => { onlyRoom = !onlyRoom; E.refresh(); } }), "this room (and the cast)"])]));
    box.append(el("select", { size: 10, style: { width: "100%", font: "inherit", background: "#1c1729", color: "#ddd", border: "1px solid #3a3350", marginTop: "4px" },
      onchange: (/** @type {any} */ e) => { sel = e.target.value; E.refresh(); } }, names.map((n) => el("option", { value: n, textContent: n, selected: n === sel }))));
    preview = /** @type {HTMLCanvasElement} */ (el("canvas", { width: 344, height: 160, style: { background: "#3c9c94", imageRendering: "pixelated", marginTop: "4px", width: "344px", height: "160px" } }));
    box.append(preview);
    const a = sel ? Cutaway.assets.get(sel) : null;
    if (a) {
      const f0 = a.frames[0];
      box.append(el("div", { style: { color: "#aaa" } }, [`${sel}: ${f0?.w}x${f0?.h}, ${a.frames.length} frame${a.frames.length > 1 ? "s" : ""}, ${a.total} ms${a.anchor ? `, anchor ${a.anchor.join(",")}` : ""}  `,
        button("x" + zoom, () => { zoom = zoom >= 6 ? 1 : zoom + 1; E.refresh(); }, "zoom")]));
    }
    const file = /** @type {HTMLInputElement} */ (el("input", { type: "file", accept: "image/png", style: { display: "none" },
      onchange: () => { const f = file.files?.[0]; if (f) readImport(f).catch((e) => E.setStatus("import failed: " + e.message)); } }));
    box.append(el("div", { style: { margin: "4px 0" } }, [button("Export PNG", () => { exportSel(); }, "the frames side by side (+ JSON for animations)"),
      button(sel ? `Import over ${sel}` : "Import PNG", () => file.click(), "a PNG: one picture, or frames side by side"), button("New import", () => { sel = ""; file.click(); }), file]));
    if (pending) {
      const p = pending, st = { font: "inherit", background: "#221c30", color: "#eee", border: "1px solid #4a4066", width: "70px" };
      const name = /** @type {HTMLInputElement} */ (el("input", { value: p.name, style: { ...st, width: "160px" }, onchange: () => { p.name = name.value.trim(); } }));
      box.append(el("div", { style: { border: "1px solid #ffe14a", padding: "4px", margin: "4px 0" } }, [
        el("div", {}, [`import ${p.w}x${p.h}: name `, name]),
        el("div", {}, ["frames ", el("input", { type: "number", min: 1, value: p.frames, style: st, onchange: (/** @type {any} */ e) => { p.frames = Math.max(1, Number(e.target.value) || 1); } }),
          " ms each ", el("input", { type: "number", min: 10, value: p.ms, style: st, onchange: (/** @type {any} */ e) => { p.ms = Number(e.target.value) || 100; } })]),
        el("div", {}, ["anchor (x,y; empty: bottom centre) ", el("input", { value: p.anchor ? p.anchor.join(",") : "", style: st,
          onchange: (/** @type {any} */ e) => { const v = String(e.target.value).split(",").map(Number); p.anchor = v.length === 2 && v.every(Number.isFinite) ? /** @type {[number, number]} */ (v) : null; } })]),
        el("div", {}, [button("Apply", apply, "show it in the game now"), button("Save", () => { save().catch((e) => E.setStatus("save failed: " + e.message)); }, "write it into the game's art and pack it"),
          button("Cancel", () => { pending = null; E.refresh(); })]),
      ]));
    }
    if (E.studio.available) {
      const sec = el("div", { style: { marginTop: "6px", borderTop: "1px solid #3a3350", paddingTop: "4px" } }, ["pxl sources "]);
      if (!sourceList) { sources().then((l) => { sourceList = l; E.refresh(); }).catch(() => { sourceList = []; }); sec.append("..."); }
      else sec.append(el("select", { style: { font: "inherit", background: "#2c2540", color: "#eee", maxWidth: "240px" },
        onchange: async (/** @type {any} */ e) => { const path = e.target.value; source = path ? { path, text: await E.studio.read(path) } : null; E.refresh(); } },
        ["", ...sourceList].map((s) => el("option", { value: s, textContent: s || "(open one)", selected: s === source?.path }))));
      if (source) {
        const src = source, area = /** @type {HTMLTextAreaElement} */ (el("textarea", { value: src.text, rows: 16, spellcheck: false,
          style: { width: "100%", boxSizing: "border-box", font: "11px/1.2 Consolas, monospace", background: "#100d18", color: "#ddd", border: "1px solid #3a3350", whiteSpace: "pre" },
          oninput: () => { src.text = area.value; } }));
        const tasks = Object.keys(E.studio.config?.tasks ?? {}).filter((t) => t.startsWith("art"));
        sec.append(area, el("div", {}, [button("Save source", async () => { E.setStatus(await E.saveFile(src.path, src.text)); }),
          ...tasks.map((t) => button(t, async () => { E.setStatus(`${t} ...`); const r = await E.studio.run(t); E.setStatus(`${t}: ${r.code === 0 ? "done" : "FAILED"}\n${r.output.trim().split("\n").slice(-6).join("\n")}`); })),
          button("Reload", () => location.reload(), "load the new art (the editor opens again)")]));
      }
      box.append(sec);
    }
  }

  // the preview: the selected asset, animated, at the zoom, anchored bottom centre
  Cutaway.clock.onRender(() => {
    if (!preview || !preview.isConnected || !sel) return;
    const g = /** @type {CanvasRenderingContext2D} */ (preview.getContext("2d")), a = Cutaway.assets.get(sel);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, preview.width, preview.height);
    if (!a) return;
    g.save();
    g.scale(zoom, zoom);
    const f = a.frames[0];
    Cutaway.assets.draw(g, sel, Math.floor(preview.width / zoom / 2), Math.min(Math.floor(preview.height / zoom) - 2, (f?.h ?? 0) + 4), { t: performance.now(), anchor: a.anchor ?? (f ? [Math.floor(f.w / 2), f.h] : [0, 0]) });
    g.restore();
  });

  E.tab({ id: "art", label: "Art", build, onRoom() { sourceList = sourceList; } });
  E.modules.art = { get unsaved() { return pending ? 1 : 0; }, strip, framesOf, readImport, apply, save, get pending() { return pending; }, select(/** @type {string} */ n) { sel = n; E.refresh(); } };
})();
