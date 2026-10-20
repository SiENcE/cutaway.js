// Cutaway.js editor, Voices tab: recorded voices, line by line (a voice-over session). The left panel
// lists every spoken line of the game, by speaker or by place, with a tick where it is recorded in the
// language picked; the inspector records the picked one from the microphone (or takes an audio file),
// plays it, trims it and sets its gain. A recording is cut to the voice (the silence before and after
// goes) and levelled; it plays in the game at once (the line stays as long as it plays), and Save writes
// the language's voices file (Cutaway.voice.layer in assets/voices.<lang>.js, the studio's "voices"
// layer; the game's page loads it). Lines are kept by their text in the game's data: a line someone
// in particular says is kept for them ("actor|text"); a line of whoever is playing for anyone, unless
// it is recorded for one of them. Lines without a recording blip as before.
// Keys (in the list, or anywhere in the tab but a field): R records and stops, P plays, N goes to the
// next line without a recording, Delete removes the recording; Up and Down go through the lines.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  let lang = "", sel = "", by = "speaker", onlyMissing = false, advance = true, level = true, forWho = "";
  /** @type {Record<string, Record<string, VoiceClip | null>>} what changed per language, not saved (null: removed) */
  const changed = {};
  /** @type {{stop: () => void, started: number, key: string, meter: () => number} | null} */
  let rec = null;
  /** @type {{stop: () => void} | null} */
  let playing = null;
  /** @type {string[]} the keys in the list's order (for "next") */
  let order = [];
  /** @type {Map<string, Promise<AudioBuffer>>} decoded clips, for the waveform */
  const decoded = new Map();

  /**
   * A spoken line: its key (the text, or "actor|text"), the text, who says it ("" the one playing), where.
   * @typedef {{key: string, text: string, who: string, where: string[], place: string}} Line
   */

  function languages() {
    const l = [...new Set([...Cutaway.menu.languages, Cutaway.i18n.language, ...Cutaway.voice.languages()])].filter(Boolean);
    return l.length ? l : ["en"];
  }

  /** Every spoken line of the game. @returns {Line[]} */
  function lines() {
    /** @type {Map<string, Line>} */
    const out = new Map();
    /** @param {any} text @param {string} who @param {string} where @param {string} place */
    const add = (text, who, where, place) => {
      if (typeof text !== "string" || !text || text.startsWith("@")) return;
      const key = who ? `${who}|${text}` : text, l = out.get(key);
      if (l) { if (!l.where.includes(where)) l.where.push(where); } else out.set(key, { key, text, who, where: [where], place });
    };
    /** @param {any} s @param {string} where @param {string} place @param {string} who */
    const script = (s, where, place, who) => {
      if (s === undefined || s === null) return;
      if (typeof s === "string") { add(s, who, where, place); return; }
      if (Array.isArray(s)) { s.forEach((x) => script(x, where, place, who)); return; }
      if (typeof s !== "object") return;
      if ("if" in s) {                                   // { if: "is:robby", then: [...] }: Robby says those
        const m = typeof s.if === "string" ? /^is:([\w-]+)$/.exec(s.if) : null;
        script(s.then, where, place, m ? m[1] : who); script(s.else, where, place, who);
        return;
      }
      if ("once" in s) { script(s.once, where, place, who); script(s.else, where, place, who); return; }
      if ("say" in s) add("text" in s ? s.text : s.say, "text" in s ? s.say : who, where, place);
    };
    for (const id of Cutaway.room.ids()) {
      const r = Cutaway.room.get(id);
      script(r.enter, `${id}: entering`, id, "");
      for (const [hid, h] of Object.entries(r.hotspots ?? {})) {
        for (const v of ["look", "use", "talk", "take"]) script(/** @type {any} */ (h)[v], `${id}/${hid}: ${v}`, id, "");
        for (const [it, s] of Object.entries(h.with ?? {})) script(s, `${id}/${hid}: with ${it}`, id, "");
      }
    }
    for (const id of Cutaway.item.ids()) {
      const it = /** @type {ItemDef} */ (Cutaway.item.get(id));
      script(it.look, `item ${id}: look`, "items", "");
      for (const [o, s] of Object.entries(it.combine ?? {})) script(s, `item ${id}: with ${o}`, "items", "");
    }
    for (const a of Cutaway.actors.all()) {
      const place = a.def.room ?? "the cast";
      for (const v of ["look", "talk"]) script(/** @type {any} */ (a.def)[v], `${a.id}: ${v}`, place, "");
      for (const [it, s] of Object.entries(a.def.with ?? {})) script(s, `${a.id}: with ${it}`, place, "");
    }
    for (const id of Cutaway.dialog.ids()) {
      for (const [node, n] of Object.entries(Cutaway.dialog.get(id) ?? {})) {
        const choices = Array.isArray(n) ? n : n.choices;
        if (!Array.isArray(n)) script(n.enter, `dialogue ${id}/${node}`, `dialogue ${id}`, "");
        for (const c of choices ?? []) { if (!c.silent) add(c.text, "", `dialogue ${id}/${node}: choice`, `dialogue ${id}`); script(c.then, `dialogue ${id}/${node}`, `dialogue ${id}`, ""); }
      }
    }
    for (const id of Cutaway.act.ids()) script(/** @type {ActDef} */ (Cutaway.act.get(id)).start, `act ${id}`, "acts", "");
    for (const id of Cutaway.sequence.ids()) { const q = /** @type {any} */ (Cutaway.sequence.get(id)); script(q?.steps, `sequence ${id}`, "sequences", ""); script(q?.after, `sequence ${id}: after`, "sequences", ""); }
    return [...out.values()];
  }

  /** The clip of a key in the language picked (changed here, or as loaded). @param {string} key */
  function clip(key) {
    const c = changed[lang];
    if (c && key in c) return c[key];
    return Cutaway.voice.layerOf(lang)[key] ?? null;
  }
  /** The key a recording of a line goes to (a line of whoever plays: for anyone, or for the one picked). @param {Line} l */
  const keyFor = (l) => (l.who || !forWho ? l.key : `${forWho}|${l.text}`);

  /** Keep a clip (null: remove it) for the language picked; the game plays it at once. @param {string} key @param {VoiceClip | null} c */
  function put(key, c) {
    (changed[lang] ??= {})[key] = c;
    Cutaway.voice.layer(lang, { [key]: c });
    E.refresh();
  }

  // ------------------------------------------------------------------ recording and files

  /** @param {Blob} b @returns {Promise<string>} */
  const dataUri = (b) => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(b); });

  /** Decode a clip's sample (once). @param {string} sample */
  function decode(sample) {
    let p = decoded.get(sample);
    if (!p) {
      const bin = atob(sample.slice(sample.indexOf(",") + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      p = new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer);
      decoded.set(sample, p);
    }
    return p;
  }

  /**
   * A recording (or an audio file) as a clip: cut to the voice (the quiet before and after goes, a little
   * kept) and levelled, if the tab says so. @param {Blob} blob @param {string} key
   */
  async function take(blob, key) {
    // the type without its codec ("audio/webm;codecs=opus"): the bytes say what they are, and a release build finds them
    const sample = (await dataUri(blob)).replace(/^data:([^;,]+)[^,]*;base64,/, "data:$1;base64,");
    const buf = await decode(sample), d = buf.getChannelData(0), sr = buf.sampleRate;
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak < 0.003) { E.setStatus("that was silence (is the microphone on?)"); return; }
    let a = 0, b = d.length - 1;
    if (level) {
      const th = Math.max(0.01, peak * 0.08);
      while (a < d.length && Math.abs(d[a]) < th) a++;
      while (b > a && Math.abs(d[b]) < th) b--;
      a = Math.max(0, a - Math.round(sr * 0.08)); b = Math.min(d.length - 1, b + Math.round(sr * 0.15));
    }
    /** @type {VoiceClip} */
    const c = { sample, ms: Math.round(((b - a) / sr) * 1000), ...(a ? { from: Math.round((a / sr) * 1000) } : {}),
      ...(level && peak < 0.85 ? { gain: Math.round(Math.min(4, 0.85 / peak) * 100) / 100 } : {}) };
    put(key, c);
    E.setStatus(`recorded "${key.length > 40 ? key.slice(0, 40) + "..." : key}": ${(c.ms / 1000).toFixed(2)} s, ${Math.round(blob.size / 1024)} KB`);
    if (advance) next(true);
  }

  async function record() {
    if (rec) { rec.stop(); return; }
    const l = lines().find((x) => x.key === sel);
    if (!l) { E.setStatus("pick a line first"); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { E.setStatus("this browser can't record (Import a file instead)"); return; }
    const key = keyFor(l);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
      /** @type {Blob[]} */
      const chunks = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      // a level meter while it records
      const c = new AudioContext(), an = c.createAnalyser(), pcm = new Float32Array(1024);
      an.fftSize = 1024;
      c.createMediaStreamSource(stream).connect(an);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        c.close().catch(() => {});
        rec = null;
        E.refresh();
        take(new Blob(chunks, { type: r.mimeType }), key).catch((e) => E.setStatus("recording failed: " + e.message));
      };
      playing?.stop(); playing = null;
      r.start();
      rec = { stop: () => r.stop(), started: performance.now(), key, meter: () => { an.getFloatTimeDomainData(pcm); let m = 0; for (const v of pcm) m = Math.max(m, Math.abs(v)); return m; } };
      E.refresh();
      meterLoop();
    } catch (e) { E.setStatus("no microphone: " + /** @type {any} */ (e).message); }
  }

  /** The level bar and the time while recording. */
  function meterLoop() {
    if (!rec) return;
    const bar = /** @type {HTMLElement | null} */ (document.getElementById("cw-vo-meter"));
    if (bar) {
      const m = rec.meter();
      bar.style.width = Math.round(Math.min(1, m) * 100) + "%";
      bar.style.background = m > 0.95 ? "#ff6a5a" : m > 0.6 ? "#ffe14a" : "#7c7";
      const t = document.getElementById("cw-vo-time");
      if (t) t.textContent = ((performance.now() - rec.started) / 1000).toFixed(1) + " s";
    }
    requestAnimationFrame(meterLoop);
  }

  function play() {
    playing?.stop(); playing = null;
    const l = lines().find((x) => x.key === sel), c = l ? clip(keyFor(l)) ?? clip(l.key) : null;
    if (!c) { E.setStatus("no recording for this line yet (R records)"); return; }
    playing = Cutaway.voice.playClip(c);
    if (!playing) E.setStatus("no sound yet: click into the game once");
  }

  /** Remove the picked line's recording. */
  function remove() {
    const l = lines().find((x) => x.key === sel), key = l ? keyFor(l) : "";
    if (!key || !clip(key)) return;
    if (!confirm("Remove this recording?")) return;
    put(key, null);
  }

  /** The next line (without a recording, if asked). @param {boolean} [missing] */
  function next(missing = false) {
    const i = order.indexOf(sel);
    for (let k = 1; k <= order.length; k++) {
      const key = order[(i + k) % order.length], l = linesByKey.get(key);
      if (!missing || (l && !clip(keyFor(l)))) { sel = key; E.refresh(); return; }
    }
    E.setStatus("every line has a recording");
  }
  /** @type {Map<string, Line>} */
  let linesByKey = new Map();

  /** The voices file of a language. @param {string} l */
  function fileText(l) {
    const all = Cutaway.voice.layerOf(l), keys = Object.keys(all).sort();
    return `// Recorded voices of the language "${l}", made in the Cutaway editor (Voices tab): the line's text in\n` +
      `// the game's data (or "actor|text": that one's own), then its clip. Embedded, so the game runs from file://.\n"use strict";\n\n` +
      `Cutaway.voice.layer(${JSON.stringify(l)}, {\n${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(all[k])},`).join("\n")}${keys.length ? "\n" : ""}});\n`;
  }

  async function save() {
    const out = [];
    for (const l of Object.keys(changed)) {
      if (!Object.keys(changed[l]).length) continue;
      out.push(await E.saveFile(E.studio.layer("voices", { lang: l }) || `assets/voices.${l}.js`, fileText(l)));
      changed[l] = {};
    }
    E.setStatus(out.length ? out.join("\n") + "\n(the game's page needs <script src=\"assets/voices.<lang>.js\"> once)" : "nothing changed");
  }

  /** Keys of the tab (and its list). @param {KeyboardEvent} e */
  function keys(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.code === "KeyR") { record(); return true; }
    if (e.code === "KeyP") { play(); return true; }
    if (e.code === "KeyN") { next(true); return true; }
    if (e.code === "Delete") { remove(); return true; }
    return false;
  }

  // ------------------------------------------------------------------ the panels

  /** @param {Line} l */
  const whoOf = (l) => l.who || "(the one playing)";
  /** A text as the language picked says it. @param {string} t */
  const inLang = (t) => (lang === Cutaway.i18n.language ? Cutaway.i18n.t(t) : Cutaway.i18n.strings(lang)[t] ?? t);

  /** The left panel: the lines, grouped. @param {HTMLElement} box */
  function browse(box) {
    if (!lang) lang = Cutaway.i18n.language;
    const all = lines();
    linesByKey = new Map(all.map((l) => [l.key, l]));
    const shown = all.filter((l) => !onlyMissing || !clip(keyFor(l)) || l.key === sel);
    const items = shown.map((l) => {
      const c = clip(keyFor(l)) ?? clip(l.key);
      return { key: l.key, label: inLang(l.text), group: by === "speaker" ? whoOf(l) : l.place, mark: c ? "✓" : "",
        title: `${l.where.join("\n")}${c ? `\n(recorded, ${(c.ms / 1000).toFixed(1)} s)` : ""}` };
    });
    // in the list's order: groups as they come
    /** @type {Map<string, string[]>} */
    const g = new Map();
    for (const it of items) g.set(it.group, [...(g.get(it.group) ?? []), it.key]);
    order = [...g.values()].flat();
    const done = all.filter((l) => clip(keyFor(l)) || clip(l.key)).length;
    box.append(E.fold("left.voices", "LINES", () => [E.list({ id: "voices", items, selected: sel, filter: true, foldOver: 30, keys,
      pick: (k) => { sel = k; E.refresh(); }, open: () => record(), empty: onlyMissing ? "every line has a recording" : "no lines" })], { note: `${done} / ${all.length}` }));
  }

  /** The waveform of a clip, the trimmed parts shaded. @param {VoiceClip} c */
  function wave(c) {
    const cv = /** @type {HTMLCanvasElement} */ (el("canvas", { width: 340, height: 56, style: { background: "#100d18", width: "340px", height: "56px", display: "block", margin: "4px 0" } }));
    decode(c.sample).then((buf) => {
      const g = cv.getContext("2d"), d = buf.getChannelData(0), W = cv.width, H = cv.height, per = Math.max(1, Math.floor(d.length / W));
      if (!g) return;
      const total = (d.length / buf.sampleRate) * 1000, a = ((c.from ?? 0) / total) * W, b = (((c.from ?? 0) + c.ms) / total) * W;
      for (let x = 0; x < W; x++) {
        let lo = 0, hi = 0;
        for (let i = x * per; i < Math.min(d.length, (x + 1) * per); i++) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); }
        const k = c.gain ?? 1;
        g.fillStyle = x >= a && x <= b ? "#7ad8a8" : "#3a3350";
        g.fillRect(x, Math.round(H / 2 - hi * k * H / 2), 1, Math.max(1, Math.round((hi - lo) * k * H / 2)));
      }
    }).catch(() => {});
    return cv;
  }

  function build(/** @type {HTMLElement} */ box) {
    if (!lang) lang = Cutaway.i18n.language;
    const all = lines();
    linesByKey = new Map(all.map((l) => [l.key, l]));
    if (!sel || !linesByKey.has(sel)) sel = order[0] ?? all[0]?.key ?? "";
    const pending = Object.values(changed).reduce((n, c) => n + Object.keys(c).length, 0);
    const langSel = /** @type {HTMLSelectElement} */ (el("select", { onchange: () => { lang = langSel.value; E.refresh(); } },
      languages().map((l) => el("option", { value: l, textContent: l, selected: l === lang }))));
    const bySel = /** @type {HTMLSelectElement} */ (el("select", { onchange: () => { by = bySel.value; E.refresh(); } },
      [["speaker", "by speaker"], ["place", "by place"]].map(([v, t]) => el("option", { value: v, textContent: t, selected: v === by }))));
    /** @param {string} label @param {boolean} v @param {(v: boolean) => void} set @param {string} [title] */
    const check = (label, v, set, title = "") => el("label", { title, style: { marginRight: "8px" } }, [el("input", { type: "checkbox", checked: v, onchange: (/** @type {any} */ e) => { set(e.target.checked); E.refresh(); } }), label]);
    box.append(
      el("div", {}, ["language ", langSel, " ", bySel]),
      el("div", { style: { margin: "4px 0" } }, [check("only lines without one", onlyMissing, (v) => { onlyMissing = v; }),
        check("then the next", advance, (v) => { advance = v; }, "after a recording, go to the next line without one"),
        check("cut and level", level, (v) => { level = v; }, "cut the silence before and after, and bring it to a good loudness")]),
      el("div", {}, [button(`Save${pending ? ` (${pending})` : ""}`, () => { save().catch((e) => E.setStatus("save failed: " + e.message)); }, "write the voices file of each changed language")]),
    );
    const l = linesByKey.get(sel);
    if (!l) { box.append(el("div", { className: "cw-dim" }, ["No spoken lines in this game yet."])); return; }
    const key = keyFor(l), c = clip(key), any = l.who ? null : clip(l.key);
    const file = /** @type {HTMLInputElement} */ (el("input", { type: "file", accept: "audio/*,.wav,.ogg,.mp3,.webm,.m4a", style: { display: "none" },
      onchange: () => { const f = file.files?.[0]; if (f) take(f, key).catch((e) => E.setStatus("import failed: " + e.message)); } }));
    const sec = el("div", { className: "cw-sec" }, [
      el("div", { className: "cw-h" }, [whoOf(l)]),
      el("div", { style: { fontSize: "14px", color: "#fff", margin: "4px 0 6px", whiteSpace: "pre-wrap" } }, [inLang(l.text)]),
      ...(inLang(l.text) !== l.text ? [el("div", { className: "cw-dim" }, [l.text])] : []),
    ]);
    if (!l.who) {
      const who = /** @type {HTMLSelectElement} */ (el("select", { onchange: () => { forWho = who.value; E.refresh(); } },
        [el("option", { value: "", textContent: "anyone who plays" }), ...Cutaway.party.members().map((m) => el("option", { value: m, textContent: m, selected: m === forWho }))]));
      sec.append(el("div", { title: "whoever plays says this line: one recording for all of them, or one each" }, ["recording for ", who]));
    }
    sec.append(el("div", { style: { margin: "6px 0" } }, [
      button(rec ? "■ Stop (R)" : "● Record (R)", () => { record(); }, "from the microphone; R again stops"),
      button("▶ Play (P)", play, "the recording, as the game plays it"),
      button("Import", () => file.click(), "an audio file for this line (WAV, OGG, MP3, WebM)"),
      button("Remove", remove, "Delete"), file]));
    if (rec) sec.append(el("div", {}, [el("div", { style: { height: "8px", background: "#221c30", border: "1px solid #3a3350", width: "240px", display: "inline-block", verticalAlign: "middle" } },
      [el("div", { id: "cw-vo-meter", style: { height: "100%", width: "0%" } })]), " ", el("span", { id: "cw-vo-time", style: { color: "#ff6a5a" } }, ["0.0 s"]), " recording ..."]));
    if (c) {
      /** @param {"from" | "ms" | "gain"} k @param {number} step */
      const num = (k, step) => el("input", { type: "number", step, value: c[k] ?? (k === "gain" ? 1 : 0), style: { width: "64px" },
        onchange: (/** @type {any} */ e) => { const v = Number(e.target.value); put(key, { ...c, [k]: k === "gain" ? Math.max(0, v) : Math.max(0, Math.round(v)) }); } });
      sec.append(wave(c), el("div", {}, ["start ", num("from", 10), " ms  length ", num("ms", 10), " ms  gain ", num("gain", 0.05)]),
        el("div", { className: "cw-dim" }, [`${(c.ms / 1000).toFixed(2)} s, ${Math.round((c.sample.length * 3) / 4 / 1024)} KB${key.includes("|") ? `, for ${key.split("|")[0]} only` : ""}`]));
    } else if (any) sec.append(el("div", { className: "cw-dim" }, ["not recorded for this one: the recording for anyone plays"]));
    else sec.append(el("div", { className: "cw-dim" }, ["not recorded yet: it blips"]));
    sec.append(el("div", { className: "cw-dim", style: { marginTop: "6px", whiteSpace: "pre-wrap" } }, [`where: ${l.where.slice(0, 6).join("\n       ")}${l.where.length > 6 ? `\n       ... (${l.where.length} places)` : ""}`]));
    box.append(sec, el("div", { className: "cw-dim", style: { marginTop: "8px", whiteSpace: "pre-wrap" } }, [
      "R record / stop   P play   N next without one   Del remove\nUp, Down: the lines (in the list)   Enter: record"]));
  }

  E.tab({ id: "voices", label: "Voices", build, browse, key: keys, save: () => save() });
  E.modules.voices = { lines, take, save, fileText, clip, put, next,
    get unsaved() { return Object.values(changed).reduce((n, c) => n + Object.keys(c).length, 0); },
    get selected() { return sel; }, select(/** @type {string} */ k) { sel = k; E.refresh(); },
    set language(/** @type {string} */ l) { lang = l; }, get language() { return lang; } };
})();
