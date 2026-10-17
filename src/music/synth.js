// Cutaway.js synth: instruments as data, played on the WebAudio clock.
//   Cutaway.synth.define("bass", { type: "sub", wave: "saw", filter: { cutoff: 400, env: 900, q: 6, decay: 0.2 },
//                                 amp: { a: 0.005, d: 0.2, s: 0.6, r: 0.1 }, gain: 0.5 })
//   Cutaway.synth.play("bass", { time, note: "C2", duration: 0.25, velocity: 0.8 })
// Types:
//   sub    subtractive: saw / square / pulse (pulseWidth) / triangle / sine, unison voices + detune,
//          a lowpass (or other) filter with its own envelope, vibrato
//   fm     two-operator FM (bells, electric piano, slap bass): ratio, index, indexDecay
//   pluck  Karplus-Strong string (guitar, harp): decay, bright
//   drum   kick, snare, clap, hat, openhat, tom: tune, decay; `gate` adds the gated-reverb snare sound
// Every instrument: gain, pan (-1..1), reverb and delay send levels (0..1).
"use strict";

/**
 * @typedef {{a?: number, d?: number, s?: number, r?: number}} Env   seconds, sustain level 0..1
 * @typedef {object} InstrumentDef
 * @property {"sub" | "fm" | "pluck" | "drum"} type
 * @property {"saw" | "square" | "pulse" | "triangle" | "sine"} [wave]
 * @property {number} [pulseWidth]   0..1 (pulse wave)
 * @property {number} [voices]       unison oscillators (sub)
 * @property {number} [detune]       cents between unison voices
 * @property {number} [octave]       shift in octaves
 * @property {{type?: BiquadFilterType, cutoff?: number, q?: number, env?: number, a?: number, decay?: number, sustain?: number, keyTrack?: number}} [filter]
 * @property {Env} [amp]
 * @property {{rate?: number, depth?: number, delay?: number}} [vibrato]  depth in cents
 * @property {number} [ratio]        fm: modulator frequency / carrier frequency
 * @property {number} [index]        fm: modulation depth
 * @property {number} [indexDecay]   fm: seconds for the index to fall to a fifth
 * @property {number} [decay]        pluck: string damping (0.9..0.999); drum: length in seconds
 * @property {number} [bright]       pluck: 0..1
 * @property {"kick" | "snare" | "clap" | "hat" | "openhat" | "tom"} [kind]  drum
 * @property {number} [tune]         drum: pitch factor
 * @property {number} [gate]         drum: gated reverb length in seconds
 * @property {number} [gain]
 * @property {number} [pan]
 * @property {number} [reverb]
 * @property {number} [delay]
 */
/**
 * @typedef {object} PlayOptions
 * @property {number} time            AudioContext time to start
 * @property {number | string} [note] MIDI number or name ("C4" = 60, "F#3", "Bb2")
 * @property {number} [duration]      seconds the note is held (before the release)
 * @property {number} [velocity]      0..1
 * @property {AudioNode} [out]        default: the music bus
 */

Cutaway.synth = (function () {
  /** @type {Map<string, InstrumentDef>} */
  const defs = new Map();
  /** @type {WeakMap<BaseAudioContext, {noise: AudioBuffer, pulses: Map<number, PeriodicWave>, gated: {input: GainNode, gate: GainNode}}>} */
  const perCtx = new WeakMap();
  /** @type {Map<string, Float32Array>} */
  const plucks = new Map();
  const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let hits = 0;

  /** "C4" -> 60, "F#3" -> 54, "Bb2" -> 46; numbers pass through. @param {number | string} n */
  function midi(n) {
    if (typeof n === "number") return n;
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(n.trim());
    if (!m) throw new Error(`Cutaway.synth: bad note "${n}"`);
    const base = NAMES[/** @type {keyof typeof NAMES} */ (m[1].toUpperCase())];
    return base + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
  }
  /** @param {number} m */
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /** @param {BaseAudioContext} c */
  function shared(c) {
    let s = perCtx.get(c);
    if (s) return s;
    const noise = c.createBuffer(1, c.sampleRate, c.sampleRate), d = noise.getChannelData(0);
    let seed = 99;
    for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
    // gated reverb: a bright short room whose output is opened per hit and slammed shut
    const input = c.createGain(), conv = c.createConvolver(), gate = c.createGain();
    conv.buffer = Cutaway.audio.impulse(c, 0.9, 1.2);
    gate.gain.value = 0;
    const buses = Cutaway.audio.buses;
    input.connect(conv).connect(gate);
    if (buses) gate.connect(buses.music);
    s = { noise, pulses: new Map(), gated: { input, gate } };
    perCtx.set(c, s);
    return s;
  }

  /** @param {BaseAudioContext} c @param {number} width */
  function pulseWave(c, width) {
    const sh = shared(c), k = Math.round(width * 100);
    let w = sh.pulses.get(k);
    if (w) return w;
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 1; i < n; i++) im[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * width);
    w = c.createPeriodicWave(re, im);
    sh.pulses.set(k, w);
    return w;
  }

  /**
   * Gain envelope: attack to peak, decay to sustain, hold, release. Returns the end time.
   * @param {AudioParam} p @param {number} t @param {number} dur @param {number} peak @param {Env} e
   */
  function envelope(p, t, dur, peak, e) {
    const a = e.a ?? 0.005, d = e.d ?? 0.1, s = e.s ?? 0.7, r = e.r ?? 0.1;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setTargetAtTime(peak * s, t + a, Math.max(0.001, d / 3));
    const off = t + Math.max(dur, a);
    p.setTargetAtTime(0, off, Math.max(0.001, r / 4));
    return off + r * 1.5;
  }

  /** Output chain: gain -> pan -> out, plus reverb and delay sends. @param {BaseAudioContext} c @param {InstrumentDef} def @param {AudioNode} out */
  function chain(c, def, out) {
    const amp = c.createGain(), pan = c.createStereoPanner();
    pan.pan.value = def.pan ?? 0;
    amp.connect(pan).connect(out);
    const b = Cutaway.audio.buses;
    if (b && def.reverb) { const s = c.createGain(); s.gain.value = def.reverb; pan.connect(s).connect(b.reverb); }
    if (b && def.delay) { const s = c.createGain(); s.gain.value = def.delay; pan.connect(s).connect(b.delay); }
    return amp;
  }

  /** @param {BaseAudioContext} c @param {InstrumentDef} def @param {PlayOptions} o @param {AudioNode} out */
  function sub(c, def, o, out) {
    const t = o.time, dur = o.duration ?? 0.2, f = hz(midi(o.note ?? 60) + 12 * (def.octave ?? 0));
    const amp = chain(c, def, out), filt = c.createBiquadFilter(), F = def.filter ?? {};
    filt.type = F.type ?? "lowpass";
    filt.Q.value = F.q ?? 1;
    const base = (F.cutoff ?? 2000) * Math.pow(f / 261.6, F.keyTrack ?? 0.5), peak = base + (F.env ?? 0) * (o.velocity ?? 1);
    filt.frequency.setValueAtTime(base, t);
    filt.frequency.linearRampToValueAtTime(peak, t + (F.a ?? 0.005));
    filt.frequency.setTargetAtTime(base + (peak - base) * (F.sustain ?? 0), t + (F.a ?? 0.005), Math.max(0.005, (F.decay ?? 0.2) / 3));
    filt.connect(amp);
    const end = envelope(amp.gain, t, dur, (def.gain ?? 0.3) * (o.velocity ?? 1), def.amp ?? {});
    const n = def.voices ?? 1;
    for (let i = 0; i < n; i++) {
      const osc = c.createOscillator();
      if (def.wave === "pulse") osc.setPeriodicWave(pulseWave(c, def.pulseWidth ?? 0.25));
      else osc.type = def.wave === "saw" ? "sawtooth" : (def.wave ?? "sawtooth");
      osc.frequency.value = f;
      osc.detune.value = n > 1 ? (i / (n - 1) - 0.5) * (def.detune ?? 12) : 0;
      if (def.vibrato) {
        const lfo = c.createOscillator(), lg = c.createGain(), V = def.vibrato;
        lfo.frequency.value = V.rate ?? 5.5;
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(V.depth ?? 15, t + (V.delay ?? 0.25) + 0.2);
        lfo.connect(lg).connect(osc.detune);
        lfo.start(t); lfo.stop(end);
      }
      osc.connect(filt);
      osc.start(t); osc.stop(end);
    }
    return end;
  }

  /** @param {BaseAudioContext} c @param {InstrumentDef} def @param {PlayOptions} o @param {AudioNode} out */
  function fm(c, def, o, out) {
    const t = o.time, dur = o.duration ?? 0.3, f = hz(midi(o.note ?? 60) + 12 * (def.octave ?? 0));
    const amp = chain(c, def, out), car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain();
    car.frequency.value = f; mod.frequency.value = f * (def.ratio ?? 2);
    const idx = (def.index ?? 3) * f * (o.velocity ?? 1);
    mg.gain.setValueAtTime(idx, t);
    mg.gain.setTargetAtTime(idx * 0.2, t, Math.max(0.01, (def.indexDecay ?? 0.3) / 2));
    mod.connect(mg).connect(car.frequency);
    car.connect(amp);
    const end = envelope(amp.gain, t, dur, (def.gain ?? 0.3) * (o.velocity ?? 1), def.amp ?? { a: 0.003, d: 0.6, s: 0.3, r: 0.3 });
    car.start(t); mod.start(t); car.stop(end); mod.stop(end);
    return end;
  }

  /** @param {BaseAudioContext} c @param {InstrumentDef} def @param {PlayOptions} o @param {AudioNode} out */
  function pluck(c, def, o, out) {
    const t = o.time, m = midi(o.note ?? 60) + 12 * (def.octave ?? 0), len = Math.min(4, (o.duration ?? 0.5) + 1.2);
    const key = `${c.sampleRate}/${m}/${def.decay ?? 0.996}/${def.bright ?? 0.5}/${len}`;
    let data = plucks.get(key);
    if (!data) {
      const sr = c.sampleRate, period = Math.max(2, Math.round(sr / hz(m))), n = Math.floor(sr * len);
      data = new Float32Array(n);
      const ring = new Float32Array(period);
      let seed = m * 7919;
      for (let i = 0; i < period; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; ring[i] = seed / 0x3fffffff - 1; }
      const damp = def.decay ?? 0.996, b = def.bright ?? 0.5;
      for (let i = 0, p = 0; i < n; i++) {
        const cur = ring[p], next = ring[(p + 1) % period];
        data[i] = cur;
        ring[p] = damp * (cur * (0.5 + b * 0.5) + next * (0.5 - b * 0.5));
        p = (p + 1) % period;
      }
      plucks.set(key, data);
    }
    const buf = c.createBuffer(1, data.length, c.sampleRate);
    buf.getChannelData(0).set(data);
    const src = c.createBufferSource(), amp = chain(c, def, out);
    src.buffer = buf;
    const end = t + (o.duration ?? 0.5) + 0.25;
    amp.gain.setValueAtTime((def.gain ?? 0.4) * (o.velocity ?? 1), t);
    amp.gain.setTargetAtTime(0, t + (o.duration ?? 0.5), 0.06);
    src.connect(amp);
    src.start(t); src.stop(end);
    return end;
  }

  /** @param {BaseAudioContext} c @param {InstrumentDef} def @param {PlayOptions} o @param {AudioNode} out */
  function drum(c, def, o, out) {
    const t = o.time, v = (def.gain ?? 0.5) * (o.velocity ?? 1), tune = def.tune ?? 1, sh = shared(c);
    const amp = chain(c, def, out);
    const noise = (/** @type {number} */ hp, /** @type {number} */ len, /** @type {number} */ level, /** @type {BiquadFilterType} */ type = "highpass") => {
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = sh.noise; f.type = type; f.frequency.value = hp; f.Q.value = type === "bandpass" ? 1.2 : 0.7;
      g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(f).connect(g).connect(amp);
      src.start(t, (hits++ % 7) * 0.07); src.stop(t + len + 0.02);    // vary the noise, repeatably
      return g;
    };
    const tone = (/** @type {number} */ f0, /** @type {number} */ f1, /** @type {number} */ len, /** @type {number} */ level, /** @type {OscillatorType} */ wave = "sine") => {
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f1, t + len * 0.6);
      g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      osc.connect(g).connect(amp);
      osc.start(t); osc.stop(t + len + 0.02);
    };
    amp.gain.value = v;
    const k = def.kind ?? "kick", len = def.decay;
    if (k === "kick") { tone(160 * tune, 42 * tune, len ?? 0.32, 1.2); noise(3000, 0.012, 0.25); }
    else if (k === "snare") { tone(190 * tune, 160 * tune, 0.1, 0.5, "triangle"); noise(1500, len ?? 0.2, 0.8); }
    else if (k === "clap") { for (const dt of [0, 0.011, 0.022]) noise(1100, (len ?? 0.15) + dt, 0.6, "bandpass"); }
    else if (k === "hat") noise(7500, len ?? 0.045, 0.5);
    else if (k === "openhat") noise(7000, len ?? 0.32, 0.45);
    else if (k === "tom") tone(240 * tune, 120 * tune, len ?? 0.35, 1);
    if (def.gate) {
      const send = c.createGain();
      send.gain.value = 0.9;
      amp.connect(send).connect(sh.gated.input);
      const gp = sh.gated.gate.gain;
      gp.cancelScheduledValues(t);
      gp.setValueAtTime(0, t); gp.linearRampToValueAtTime(1, t + 0.004);
      gp.setValueAtTime(1, t + def.gate); gp.linearRampToValueAtTime(0, t + def.gate + 0.015);
    }
    return t + (len ?? 0.4) + 0.05;
  }

  /**
   * Play one note. Returns the time the sound has ended (or the start time if audio is off).
   * @param {string | InstrumentDef} inst
   * @param {PlayOptions} o
   */
  function play(inst, o) {
    const c = Cutaway.audio.ctx, b = Cutaway.audio.buses;
    if (!c || !b) return o.time;
    const def = typeof inst === "string" ? defs.get(inst) : inst;
    if (!def) throw new Error(`Cutaway.synth: no instrument "${inst}"`);
    const out = o.out ?? b.music;
    if (def.type === "sub") return sub(c, def, o, out);
    if (def.type === "fm") return fm(c, def, o, out);
    if (def.type === "pluck") return pluck(c, def, o, out);
    if (def.type === "drum") return drum(c, def, o, out);
    throw new Error(`Cutaway.synth: unknown instrument type "${def.type}"`);
  }

  return {
    play, midi, hz,
    /** @param {string} name @param {InstrumentDef} def */
    define(name, def) { defs.set(name, def); },
    /** @param {string} name */
    get(name) { return defs.get(name) ?? null; },
    names() { return [...defs.keys()]; },
  };
})();
