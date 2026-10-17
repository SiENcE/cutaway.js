// Cutaway.js editor, Sound tab: every sound of the game, to play, to change (a synthesised sound is
// data: edit it and hear it at once), to export (WAV) and to import (a WAV, OGG or MP3 becomes a sound,
// or an ambience loop, under a new name or replacing one). Save writes the studio's layer files:
// "sounds" (game/sounds.edit.js: synthesised sounds) and "audio" (assets/audio.js: the recorded ones,
// embedded). Below, the music: its themes to play at an intensity, and the music lab.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  let search = "", sel = "", theme = "", section = "", intensity = 0.5;
  /** @type {Set<string>} sounds changed or made here, not saved yet */
  const changed = new Set();
  /** @type {Record<string, SfxDef>} the recorded ones made here, kept for saving */
  const recorded = {};

  /** @param {SfxDef} d */
  const isRecorded = (d) => !!(d.sample || d.loop?.sample);

  /** A WAV file (16-bit PCM) of a rendered buffer. @param {AudioBuffer} b */
  function wav(b) {
    const ch = b.numberOfChannels, n = b.length, data = new DataView(new ArrayBuffer(44 + n * ch * 2));
    /** @param {number} o @param {string} s */
    const str = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); data.setUint32(4, 36 + n * ch * 2, true); str(8, "WAVE"); str(12, "fmt ");
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, b.sampleRate, true);
    data.setUint32(28, b.sampleRate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
    str(36, "data"); data.setUint32(40, n * ch * 2, true);
    const chans = Array.from({ length: ch }, (_v, i) => b.getChannelData(i));
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) data.setInt16(o, Math.max(-1, Math.min(1, chans[c][i])) * 0x7fff, true);
    return new Uint8Array(data.buffer);
  }

  async function exportWav() {
    const b = await Cutaway.sfx.render(sel);
    if (!b) { E.setStatus(`${sel}: a loop or nothing to render`); return; }
    // trim the silence at the end
    const d0 = b.getChannelData(0);
    let last = d0.length - 1;
    while (last > 0 && Math.abs(d0[last]) < 1e-4) last--;
    const out = new AudioBuffer({ length: Math.min(b.length, last + 2205), numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
    for (let c = 0; c < b.numberOfChannels; c++) out.copyToChannel(b.getChannelData(c).subarray(0, out.length), c);
    E.download(`${sel}.wav`, wav(out));
    E.setStatus(`exported ${sel}.wav (${(out.length / out.sampleRate).toFixed(2)} s)`);
  }

  /** Import an audio file as a sound (or a loop). @param {File} f */
  async function importAudio(f) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const type = f.type || (f.name.endsWith(".ogg") ? "audio/ogg" : f.name.endsWith(".mp3") ? "audio/mpeg" : "audio/wav");
    const data = `data:${type};base64,${btoa(bin)}`, name = sel || f.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
    const old = Cutaway.sfx.get(name), loop = !!old?.loop;
    /** @type {SfxDef} */
    const def = loop ? { loop: { sample: data, gain: old?.loop?.gain ?? 0.5 } } : { sample: data, gain: old?.gain ?? 1 };
    Cutaway.sfx.define(name, def);
    recorded[name] = def; changed.add(name); sel = name;
    E.setStatus(`${f.name} is the sound "${name}" now (${Math.round(bytes.length / 1024)} KB${loop ? ", a loop" : ""}): Save keeps it`);
    if (!loop) Cutaway.sfx.play(name);
    E.refresh();
  }

  /** The layer file text. @param {string} file @param {Record<string, SfxDef>} list */
  function layerText(file, list) {
    const head = file === "audio"
      ? "// Recorded sounds imported in the Cutaway editor (Sound tab), embedded so the game runs from file://.\n"
      : "// Sounds made or changed in the Cutaway editor (Sound tab). Loaded after the game's own sounds.\n";
    return `${head}"use strict";\n\nCutaway.sfx.layer(${E.fmt(list)}, ${JSON.stringify(file)});\n`;
  }

  async function save() {
    const synth = Cutaway.sfx.layerOf("sounds"), rec = Cutaway.sfx.layerOf("audio");
    for (const n of changed) {
      const d = Cutaway.sfx.get(n);
      if (!d) continue;
      if (isRecorded(d)) { rec[n] = d; delete synth[n]; } else { synth[n] = d; delete rec[n]; }
    }
    const out = [];
    out.push(await E.saveFile(E.studio.layer("sounds") || "game/sounds.edit.js", layerText("sounds", synth)));
    if (Object.keys(rec).length) out.push(await E.saveFile(E.studio.layer("audio") || "assets/audio.js", layerText("audio", rec)));
    Cutaway.sfx.layer(synth, "sounds");
    if (Object.keys(rec).length) Cutaway.sfx.layer(rec, "audio");
    changed.clear();
    E.setStatus(out.join("\n"));
  }

  function build(/** @type {HTMLElement} */ box) {
    const st = {};
    const q = search.toLowerCase(), names = Cutaway.sfx.names().filter((n) => !n.startsWith("_") && (!q || n.includes(q))).sort();
    const find = /** @type {HTMLInputElement} */ (el("input", { type: "search", value: search, placeholder: "search", style: { ...st, width: "130px" }, onchange: () => { search = find.value; E.refresh(); } }));
    const file = /** @type {HTMLInputElement} */ (el("input", { type: "file", accept: "audio/*,.wav,.ogg,.mp3", style: { display: "none" },
      onchange: () => { const f = file.files?.[0]; if (f) importAudio(f).catch((e) => E.setStatus("import failed: " + e.message)); } }));
    box.append(el("div", {}, [find, " ", button(`Save${changed.size ? ` (${changed.size})` : ""}`, () => { save().catch((e) => E.setStatus("save failed: " + e.message)); }), file]));
    box.append(el("select", { size: 9, className: "cw-list", style: { marginTop: "4px" },
      onchange: (/** @type {any} */ e) => { sel = e.target.value; if (!Cutaway.sfx.get(sel)?.loop) Cutaway.sfx.play(sel); E.refresh(); } },
      names.map((n) => { const d = Cutaway.sfx.get(n); return el("option", { value: n, selected: n === sel,
        textContent: `${changed.has(n) ? "● " : ""}${n}${d?.loop ? "  (loop)" : ""}${d && isRecorded(d) ? "  (recorded)" : ""}` }); })));
    const d = sel ? Cutaway.sfx.get(sel) : null;
    box.append(el("div", { style: { margin: "4px 0" } }, [
      button("Play", () => { if (!sel) return; if (d?.loop) Cutaway.sfx.ambience([sel]); else Cutaway.sfx.play(sel); }, "a loop plays as the ambience"),
      button("Stop loops", () => Cutaway.sfx.ambience(Cutaway.scene.room?.ambience ?? []), "back to the room's ambience"),
      button("Export WAV", () => { if (sel) exportWav().catch((e) => E.setStatus("export failed: " + e.message)); }),
      button(sel ? `Import over ${sel}` : "Import audio", () => file.click(), "WAV, OGG or MP3"), button("New import", () => { sel = ""; file.click(); })]));
    if (d) {
      if (isRecorded(d)) {
        const g = d.loop ? d.loop.gain ?? 0.1 : d.gain ?? 1;
        box.append(el("div", {}, [`recorded ${d.loop ? "loop" : "sound"}, gain `, el("input", { type: "number", step: "0.05", value: g, style: { ...st, width: "70px" },
          onchange: (/** @type {any} */ e) => { const v = Number(e.target.value); if (d.loop) d.loop.gain = v; else d.gain = v; changed.add(sel); E.refresh(); } }),
          d.loop ? "" : " rate ", d.loop ? "" : el("input", { type: "number", step: "0.05", value: d.rate ?? 1, style: { ...st, width: "60px" },
            onchange: (/** @type {any} */ e) => { d.rate = Number(e.target.value) || 1; changed.add(sel); } })]));
      } else {
        const area = /** @type {HTMLTextAreaElement} */ (el("textarea", { value: JSON.stringify(d, null, 1), rows: 12, spellcheck: false,
          style: { width: "100%", boxSizing: "border-box", font: "11px/1.25 Consolas, monospace" } }));
        box.append(area, el("div", {}, [button("Apply and play", () => {
          try {
            const nd = JSON.parse(area.value);
            Cutaway.sfx.define(sel, nd); changed.add(sel);
            if (nd.loop) Cutaway.sfx.ambience([sel]); else Cutaway.sfx.play(sel);
            E.refresh();
          } catch (e) { E.setStatus("not JSON: " + /** @type {any} */ (e).message); }
        }), button("As a new sound", () => {
          const n = (prompt("Name of the new sound:", sel + "_2") ?? "").trim();
          if (!n) return;
          try { Cutaway.sfx.define(n, JSON.parse(area.value)); changed.add(n); sel = n; E.refresh(); } catch (e) { E.setStatus("not JSON: " + /** @type {any} */ (e).message); }
        })]), el("div", { className: "cw-dim" }, ["parts: tone { wave, from, to, ms, gain, at, vibrato }, noise { filter, from, to, q, ms, gain, at }, inst { inst, notes, step }; loops: loop { noise, tone, gain, wobble, crackle }"]));
      }
    }
    // the music
    const themes = Cutaway.score?.ids?.() ?? [];
    if (themes.length) {
      if (!themes.includes(theme)) theme = themes[0];
      const sections = Object.keys(Cutaway.score.get(theme)?.sections ?? {});
      const msel = (/** @type {string[]} */ opts, /** @type {string} */ v, /** @type {(v: string) => void} */ set) => el("select", { style: st, onchange: (/** @type {any} */ e) => set(e.target.value) },
        opts.map((o) => el("option", { value: o, textContent: o || "(from the start)", selected: o === v })));
      box.append(el("div", { className: "cw-sec" }, [
        el("div", { className: "cw-h" }, ["music"]),
        el("div", {}, [msel(themes, theme, (v) => { theme = v; section = ""; E.refresh(); }), " ", msel(["", ...sections], section, (v) => { section = v; }),
          " intensity ", el("input", { type: "range", min: 0, max: 1, step: 0.05, value: intensity, onchange: (/** @type {any} */ e) => { intensity = Number(e.target.value); Cutaway.events.emit("music", { intensity }); } })]),
        el("div", {}, [button("Play", () => Cutaway.events.emit("music", { theme, ...(section ? { section } : {}), intensity })),
          button("Room's music", () => Cutaway.events.emit("music", Cutaway.scene.room?.music)),
          button("Music lab", () => window.open(Cutaway.base + "tools/music-lab.html", "_blank"), "every score, its layers and stingers, WAV export")]),
      ]));
    }
  }

  E.tab({ id: "sound", label: "Sound", build, save: () => save() });
  E.modules.sound = { get unsaved() { return changed.size; }, wav, importAudio, save, layerText, select(/** @type {string} */ n) { sel = n; E.refresh(); }, get changed() { return [...changed]; },
    /** Make or change a sound (as the tab does). @param {string} n @param {SfxDef} d */
    define(n, d) { Cutaway.sfx.define(n, d); changed.add(n); } };
})();
