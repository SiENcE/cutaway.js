// Cutaway.js sound effects: synthesised one-shots and ambience loops (no files; works on file://).
//   Cutaway.sfx.define("boing", { tone: { wave: "triangle", from: 220, to: 660, ms: 180 } })
//   { sfx: "thump" }   { sfx: "door", at: [280, 120] }   (at = pans with the position on screen)
//   room: { ambience: ["rain", { sfx: "hum", gain: 0.5 }] }   loops while the room is shown
// A sound is a list of parts that start together (or `at` ms later):
//   tone   { wave, from, to, ms, attack, gain, vibrato: [rate, cents] }   pitch sweep (Hz or note names)
//   noise  { filter: "lowpass" | "highpass" | "bandpass", from, to, q, ms, attack, gain }   filtered noise sweep
//   inst   { inst: "name", notes: "C5 E5 G5", step: 70, gain }   a synth instrument (Cutaway.synth)
// Loops (ambience) are { loop: { noise: { filter, freq, q }, tone: { wave, freq }, gain, wobble: [rate, depth] } }.
// Recorded sounds (samples, imported in the editor) sit next to them: { sample: "data:audio/ogg;base64,...",
// gain, rate } plays the clip, { loop: { sample, gain } } loops it as ambience. They are embedded, so
// file:// still works (a release build may scramble them: "~" + ..., like the art).
// The engine brings a small generic set (below); games define their own. Cutaway.sfx.layer(defs, file)
// defines sounds from one of the editor's layer files and remembers them, so the editor can save them back.
"use strict";

/**
 * @typedef {{wave?: OscillatorType, from: number | string, to?: number | string, ms?: number, attack?: number, gain?: number, vibrato?: [number, number], at?: number}} TonePart
 * @typedef {{filter?: BiquadFilterType, from: number, to?: number, q?: number, ms?: number, attack?: number, gain?: number, at?: number}} NoisePart
 * @typedef {{inst: string, notes: string, step?: number, gain?: number, at?: number}} InstPart
 * @typedef {{noise?: {filter?: BiquadFilterType, freq: number, q?: number}, tone?: {wave?: OscillatorType, freq: number}, sample?: string, gain?: number, wobble?: [number, number], crackle?: number}} LoopDef
 * @typedef {{tone?: TonePart | TonePart[], noise?: NoisePart | NoisePart[], inst?: InstPart | InstPart[], loop?: LoopDef, sample?: string, rate?: number, gain?: number}} SfxDef
 */

Cutaway.sfx = (function () {
  /** @type {Map<string, SfxDef>} */
  const defs = new Map();
  /** @type {WeakMap<BaseAudioContext, AudioBuffer>} */
  const noiseBufs = new WeakMap();
  /** @type {{key: string, stop: () => void}[]} */
  let loops = [];
  /** @type {any[]} the ambience the room asked for (started once audio exists) */
  let wantAmbience = [];
  /** @type {WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer>>>} decoded samples per audio context */
  const decoded = new WeakMap();
  /** @type {Map<string, Record<string, SfxDef>>} the editor's layer files: file -> its sounds */
  const layers = new Map();

  /**
   * A sample's bytes decoded for a context (once).
   * @param {BaseAudioContext} c @param {string} data  data URI or "~" + scrambled base64
   */
  function buffer(c, data) {
    let m = decoded.get(c);
    if (!m) decoded.set(c, (m = new Map()));
    let p = m.get(data);
    if (!p) {
      const b64 = data.startsWith("~") ? Cutaway.assets.unscramble(data) : data.slice(data.indexOf(",") + 1);
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      p = c.decodeAudioData(bytes.buffer);
      m.set(data, p);
    }
    return p;
  }

  /** @param {BaseAudioContext} c */
  function noiseBuf(c) {
    let b = noiseBufs.get(c);
    if (b) return b;
    b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    let seed = 4242;
    for (let i = 0; i < d.length; i++) { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; d[i] = seed / 2147483648 - 1; }
    noiseBufs.set(c, b);
    return b;
  }

  /** @param {number | string} f */
  function hz(f) { return typeof f === "number" ? f : Cutaway.synth.hz(Cutaway.synth.midi(f)); }
  /** @template T @param {T | T[] | undefined} v @returns {T[]} */
  function list(v) { return v === undefined ? [] : Array.isArray(v) ? v : [v]; }

  /**
   * Gain envelope: quick attack, exponential-ish fall over `ms`.
   * @param {AudioParam} p @param {number} t @param {number} peak @param {number} attack @param {number} ms
   */
  function env(p, t, peak, attack, ms) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + attack / 1000);
    p.setTargetAtTime(0, t + attack / 1000, Math.max(0.005, (ms - attack) / 1000 / 3));
  }

  /**
   * Play a sound now (or at `time` on the audio clock).
   * @param {string} name
   * @param {{pan?: number, gain?: number, time?: number, at?: [number, number]}} [o]
   * @returns {boolean} false if it didn't play (no audio yet, unknown name)
   */
  function play(name, o = {}) {
    const c = Cutaway.audio.ctx, b = Cutaway.audio.buses, d = defs.get(name);
    if (!c || !b || !d) return false;
    sound(c, b.sfx, d, o);
    return true;
  }

  /**
   * Play a sound's parts into a destination (the sfx bus, or an offline render's).
   * @param {BaseAudioContext} c @param {AudioNode} dest @param {SfxDef} d
   * @param {{pan?: number, gain?: number, time?: number, at?: [number, number]}} o
   * @returns {number} when it ends (audio clock)
   */
  function sound(c, dest, d, o) {
    const t0 = o.time ?? c.currentTime + 0.005;
    const out = c.createGain(), pan = c.createStereoPanner();
    out.gain.value = (d.gain ?? 1) * (o.gain ?? 1);
    let p = o.pan ?? 0;
    if (o.at) p = Cutaway.util.clamp((Cutaway.scene.toScreen(o.at[0], o.at[1]).x / Cutaway.display.width - 0.5) * 1.2, -0.8, 0.8);
    pan.pan.value = p;
    out.connect(pan).connect(dest);
    let end = t0;
    if (d.sample) {
      const rate = d.rate ?? 1;
      buffer(c, d.sample).then((buf) => {
        const src = c.createBufferSource();
        src.buffer = buf; src.playbackRate.value = rate;
        src.connect(out);
        src.start(Math.max(t0, c.currentTime));
      }).catch((e) => console.warn("Cutaway: a sample didn't decode", e));
    }
    for (const tp of list(d.tone)) {
      const t = t0 + (tp.at ?? 0) / 1000, ms = tp.ms ?? 150, osc = c.createOscillator(), g = c.createGain();
      osc.type = tp.wave ?? "square";
      osc.frequency.setValueAtTime(hz(tp.from), t);
      if (tp.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, hz(tp.to)), t + ms / 1000);
      if (tp.vibrato) {
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = tp.vibrato[0]; lg.gain.value = hz(tp.from) * (Math.pow(2, tp.vibrato[1] / 1200) - 1);
        lfo.connect(lg).connect(osc.frequency); lfo.start(t); lfo.stop(t + ms / 1000 + 0.1);
      }
      env(g.gain, t, tp.gain ?? 0.3, tp.attack ?? 4, ms);
      osc.connect(g).connect(out);
      osc.start(t); osc.stop(t + ms / 1000 + 0.15);
      end = Math.max(end, t + ms / 1000 + 0.15);
    }
    for (const np of list(d.noise)) {
      const t = t0 + (np.at ?? 0) / 1000, ms = np.ms ?? 200, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = noiseBuf(c); src.loop = true;
      f.type = np.filter ?? "lowpass"; f.Q.value = np.q ?? 1;
      f.frequency.setValueAtTime(np.from, t);
      if (np.to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(10, np.to), t + ms / 1000);
      env(g.gain, t, np.gain ?? 0.4, np.attack ?? 3, ms);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random() * 1.5); src.stop(t + ms / 1000 + 0.15);
      end = Math.max(end, t + ms / 1000 + 0.15);
    }
    for (const ip of list(d.inst)) {
      let t = t0 + (ip.at ?? 0) / 1000;
      const step = (ip.step ?? 80) / 1000;
      for (const ev of Cutaway.sequencer.parse(ip.notes)) {
        if (ev) for (const n of ev.notes) Cutaway.synth.play(ip.inst, { time: t, note: n, duration: ev.len * step * 0.9, velocity: ev.vel * (ip.gain ?? 1), out });
        t += step;
      }
      end = Math.max(end, t + 1);
    }
    if (!(c instanceof OfflineAudioContext)) setTimeout(() => out.disconnect(), Math.max(0, (end - c.currentTime) * 1000) + (d.sample ? 60000 : 2000));
    return end;
  }

  /**
   * Render a sound offline (the editor's WAV export). Samples are decoded first.
   * @param {string} name @param {number} [seconds] @returns {Promise<AudioBuffer | null>}
   */
  async function render(name, seconds) {
    const d = defs.get(name);
    if (!d || d.loop) return null;
    const rate = 44100, len = seconds ?? (d.sample ? 30 : 4);
    const off = new OfflineAudioContext(2, Math.ceil(rate * len), rate);
    if (d.sample) await buffer(off, d.sample);
    sound(off, off.destination, d, { time: 0.01 });
    if (d.sample) await new Promise((r) => setTimeout(r, 0));   // its source starts after the decode resolved
    return off.startRendering();
  }

  /**
   * Start a loop; returns a stop function (fades out).
   * @param {LoopDef} l @param {number} gain
   */
  function startLoop(l, gain) {
    const c = /** @type {BaseAudioContext} */ (Cutaway.audio.ctx), b = /** @type {Buses} */ (Cutaway.audio.buses);
    const out = c.createGain(), t = c.currentTime;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime((l.gain ?? 0.1) * gain, t + 1.2);
    out.connect(b.sfx);
    /** @type {AudioScheduledSourceNode[]} */
    const srcs = [];
    if (l.noise) {
      const src = c.createBufferSource(), f = c.createBiquadFilter();
      src.buffer = noiseBuf(c); src.loop = true;
      f.type = l.noise.filter ?? "lowpass"; f.frequency.value = l.noise.freq; f.Q.value = l.noise.q ?? 0.7;
      src.connect(f).connect(out); srcs.push(src);
      if (l.wobble) {                                  // slow swell (wind, surf)
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = l.wobble[0]; lg.gain.value = l.noise.freq * l.wobble[1];
        lfo.connect(lg).connect(f.frequency); srcs.push(lfo);
      }
    }
    if (l.sample) {                                    // a recorded loop
      let stopped = false;
      buffer(c, l.sample).then((buf) => {
        if (stopped) return;
        const src = c.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.connect(out); src.start();
        srcs.push(src);
      }).catch((e) => console.warn("Cutaway: a sample didn't decode", e));
      srcs.push(/** @type {any} */ ({ start() {}, stop() { stopped = true; } }));
    }
    if (l.tone) {
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = l.tone.wave ?? "sine"; osc.frequency.value = l.tone.freq; g.gain.value = 0.5;
      osc.connect(g).connect(out); srcs.push(osc);
    }
    for (const s of srcs) s.start(t);
    let crackle = 0;
    if (l.crackle) {                                   // random ticks (rain on a roof, a fire)
      const tick = () => {
        const cc = Cutaway.audio.ctx;
        if (!cc) return;
        play("_tick", { gain: l.crackle, pan: Math.random() * 1.2 - 0.6 });
        crackle = window.setTimeout(tick, 40 + Math.random() * 260);
      };
      crackle = window.setTimeout(tick, 100);
    }
    return () => {
      clearTimeout(crackle);
      const now = c.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.8);
      for (const s of srcs) s.stop(now + 0.9);
      setTimeout(() => out.disconnect(), 1200);
    };
  }

  /**
   * Set the ambience loops (a room's `ambience`): loops that keep playing carry on, others fade.
   * @param {(string | {sfx: string, gain?: number})[]} want
   */
  function ambience(want) {
    wantAmbience = want ?? [];
    if (!Cutaway.audio.ctx) return;
    const next = wantAmbience.map((w) => (typeof w === "string" ? { sfx: w, gain: 1 } : { sfx: w.sfx, gain: w.gain ?? 1 }));
    const keys = next.map((n) => `${n.sfx}@${n.gain}`);
    loops = loops.filter((l) => { if (keys.includes(l.key)) return true; l.stop(); return false; });
    for (const [i, n] of next.entries()) {
      if (loops.some((l) => l.key === keys[i])) continue;
      const d = defs.get(n.sfx);
      if (d?.loop) loops.push({ key: keys[i], stop: startLoop(d.loop, n.gain) });
    }
  }

  /** @param {string} name @param {SfxDef} def */
  function define(name, def) { defs.set(name, def); return name; }

  // a small generic set; games add their own (and may redefine these)
  define("_tick", { noise: { filter: "highpass", from: 3000, q: 0.5, ms: 25, gain: 0.25 } });
  define("click", { tone: { wave: "square", from: 1400, to: 900, ms: 35, gain: 0.12 } });
  define("pickup", { tone: [{ wave: "triangle", from: 660, to: 990, ms: 90, gain: 0.25 }, { wave: "triangle", from: 990, to: 1480, ms: 120, gain: 0.2, at: 70 }] });
  define("thump", { tone: { wave: "sine", from: 110, to: 45, ms: 220, gain: 0.7 }, noise: { filter: "lowpass", from: 900, to: 120, ms: 140, gain: 0.5 } });
  define("knock", { tone: [{ wave: "sine", from: 180, to: 90, ms: 90, gain: 0.5 }, { wave: "sine", from: 180, to: 90, ms: 90, gain: 0.5, at: 170 }],
    noise: [{ filter: "bandpass", from: 1200, q: 2, ms: 50, gain: 0.3 }, { filter: "bandpass", from: 1200, q: 2, ms: 50, gain: 0.3, at: 170 }] });
  define("whoosh", { noise: { filter: "bandpass", from: 300, to: 2600, q: 1.5, ms: 380, attack: 140, gain: 0.45 } });
  define("door", { noise: [{ filter: "bandpass", from: 500, to: 300, q: 4, ms: 450, attack: 80, gain: 0.18 }, { filter: "lowpass", from: 700, to: 100, ms: 160, gain: 0.6, at: 420 }],
    tone: { wave: "sine", from: 90, to: 50, ms: 180, gain: 0.5, at: 420 } });
  define("creak", { tone: { wave: "sawtooth", from: 210, to: 150, ms: 520, attack: 60, gain: 0.07, vibrato: [23, 90] } });
  define("crash", { noise: [{ filter: "highpass", from: 2400, q: 0.7, ms: 600, gain: 0.45 }, { filter: "lowpass", from: 1200, to: 150, ms: 300, gain: 0.5 }],
    tone: { wave: "triangle", from: 2600, to: 1900, ms: 300, gain: 0.08, at: 30 } });
  define("zap", { noise: { filter: "bandpass", from: 4200, to: 1800, q: 3, ms: 90, gain: 0.3 }, tone: { wave: "square", from: 1900, to: 400, ms: 80, gain: 0.06 } });
  define("rain", { loop: { noise: { filter: "lowpass", freq: 4200, q: 0.4 }, gain: 0.05, crackle: 0.1 } });
  define("wind", { loop: { noise: { filter: "bandpass", freq: 480, q: 1.2 }, gain: 0.12, wobble: [0.13, 0.5] } });
  define("hum", { loop: { tone: { wave: "sine", freq: 58 }, gain: 0.05 } });

  return {
    define, play, ambience, render,
    /** A recorded sample's bytes decoded for an audio context (once; voices use it too). */
    decode: buffer,
    /**
     * Sounds from one of the editor's layer files (defined, and remembered so the editor can save the
     * file back with its changes). @param {Record<string, SfxDef>} list @param {string} [file]
     */
    layer(list, file = "sounds") {
      layers.set(file, { ...(layers.get(file) ?? {}), ...list });
      for (const [k, v] of Object.entries(list)) define(k, v);
    },
    /** The sounds of a layer file. @param {string} [file] */
    layerOf(file = "sounds") { return { ...(layers.get(file) ?? {}) }; },
    /** @param {string} name */
    has(name) { return defs.has(name); },
    /** @param {string} name */
    get(name) { return defs.get(name) ?? null; },
    names() { return [...defs.keys()]; },
    /** Stop every loop (e.g. on a card). */
    stopAll() { for (const l of loops) l.stop(); loops = []; },
    init() {
      Cutaway.events.on("sfx", (s) => {
        if (typeof s === "string") play(s);
        else if (s && s.sfx) play(s.sfx, s);
      });
      Cutaway.events.on("room.enter", (e) => ambience(/** @type {any} */ (Cutaway.room.get(e.id)).ambience ?? []));
      Cutaway.audio.ready(() => ambience(wantAmbience));
    },
  };
})();
