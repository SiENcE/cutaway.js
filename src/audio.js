// Cutaway.js audio: the WebAudio graph every sound goes through.
//   music bus -> tone ┐  (tone: a small speaker on the scene's music, e.g. a radio; Cutaway.audio.speaker)
//   voice bus ────────├─> master gain -> compressor -> speakers
//   sfx bus   ┘
//   reverb send (convolver with a generated impulse) and delay send feed the master too.
// Browsers only start audio after a user gesture: the context is created on the first click, tap or
// key. Everything works on file:// (no audio files; sounds are synthesised).
// Tools render offline with Cutaway.audio.init({ context: new OfflineAudioContext(...) }).
"use strict";

/**
 * @typedef {object} Buses
 * @property {GainNode} master
 * @property {GainNode} music
 * @property {GainNode} voice
 * @property {GainNode} sfx
 * @property {GainNode} reverb   send: whatever goes in comes out reverberated
 * @property {GainNode} delay    send: echoes
 */

Cutaway.audio = (function () {
  /** @type {BaseAudioContext | null} */
  let ctx = null;
  /** @type {Buses | null} */
  let buses = null;
  /** @typedef {{hp: BiquadFilterNode, lp: BiquadFilterNode, mid: BiquadFilterNode}} Tone */
  /** @type {Tone | null} */
  let tone = null;
  let speakerAmount = 0;
  const volume = { master: 0.8, music: 0.7, voice: 0.8, sfx: 0.8 };
  /** @type {(() => void)[]} */
  const readyFns = [];
  let muted = false;

  /**
   * A reverb impulse: decaying stereo noise, darker towards the end.
   * @param {BaseAudioContext} c
   * @param {number} seconds
   * @param {number} decay  higher = shorter tail
   */
  function impulse(c, seconds, decay) {
    const n = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(2, n, c.sampleRate);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n, k = 0.9 - 0.6 * t;               // the tail gets darker
        lp = lp * (1 - k) + rnd() * k;
        d[i] = lp * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  /**
   * Build the graph on a context (a live AudioContext, or an OfflineAudioContext for rendering).
   * @param {{context?: BaseAudioContext}} [o]
   */
  function init(o = {}) {
    if (ctx && !o.context) return ctx;
    const c = o.context ?? new AudioContext({ latencyHint: "interactive" });
    const g = () => c.createGain();
    const master = g(), music = g(), voice = g(), sfx = g(), reverb = g(), delay = g();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
    master.connect(comp).connect(c.destination);
    const hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), mid = c.createBiquadFilter();
    hp.type = "highpass"; lp.type = "lowpass"; mid.type = "peaking"; mid.frequency.value = 1500; mid.Q.value = 0.9;
    music.connect(hp).connect(lp).connect(mid).connect(master);
    for (const b of [voice, sfx]) b.connect(master);
    const conv = c.createConvolver();
    conv.buffer = impulse(c, 2.4, 2.6);
    const wet = g(); wet.gain.value = 0.32;
    reverb.connect(conv).connect(wet).connect(master);
    const dl = c.createDelay(2), fb = g(), dlf = c.createBiquadFilter();
    dl.delayTime.value = 0.375; fb.gain.value = 0.32; dlf.type = "lowpass"; dlf.frequency.value = 2600;
    delay.connect(dl).connect(dlf).connect(fb).connect(dl);
    const dwet = g(); dwet.gain.value = 0.4;
    dlf.connect(dwet).connect(master);
    ctx = c;
    buses = { master, music, voice, sfx, reverb, delay };
    tone = { hp, lp, mid };
    speaker(speakerAmount, 0);
    applyVolumes();
    if (!o.context) {                                 // offline renders don't start the game's sound
      for (const fn of readyFns.splice(0)) fn();
      Cutaway.events.emit("audio.ready", {});
    }
    return c;
  }

  /**
   * How much the music sounds like it comes from a small speaker in the scene (a radio, a boombox):
   * 0 = full range, 1 = thin and boxy. Ramps over `seconds` (exponentially, as the ear hears it).
   * @param {number} amount
   * @param {number} [seconds]
   * @param {number} [at]  context time to start (default now)
   */
  function speaker(amount, seconds = 0, at) {
    speakerAmount = Math.max(0, Math.min(1, amount));
    if (!ctx || !tone) return;
    const t = at ?? ctx.currentTime, k = speakerAmount;
    const target = { hp: 20 * Math.pow(500 / 20, k), lp: 20000 * Math.pow(2800 / 20000, k), mid: 7 * k };
    for (const [name, node] of /** @type {[keyof typeof target, BiquadFilterNode][]} */ (Object.entries(tone))) {
      const p = name === "mid" ? node.gain : node.frequency;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      if (seconds <= 0) p.setValueAtTime(target[name], t);
      else if (name === "mid") p.linearRampToValueAtTime(target[name], t + seconds);
      else p.exponentialRampToValueAtTime(target[name], t + seconds);
    }
  }

  function applyVolumes() {
    if (!buses) return;
    buses.master.gain.value = muted ? 0 : volume.master;
    buses.music.gain.value = volume.music;
    buses.voice.gain.value = volume.voice;
    buses.sfx.gain.value = volume.sfx;
  }

  /** Create (or resume) the live context on the first user gesture; suspend while the page is hidden. */
  function hook() {
    const unlock = () => {
      if (!ctx) init();
      const c = /** @type {AudioContext} */ (ctx);
      if (c.state === "suspended" && "resume" in c) c.resume();
    };
    for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, unlock, { capture: true });
    document.addEventListener("visibilitychange", () => {
      const c = /** @type {AudioContext | null} */ (ctx);
      if (!c || !("suspend" in c)) return;
      if (document.hidden) c.suspend(); else c.resume();
    });
  }

  return {
    init, hook, impulse, speaker,
    /** How much the music sounds like a small speaker now (the last value asked for). */
    get speakerAmount() { return speakerAmount; },
    /** The current context and buses, to put back after an offline render. */
    save() { return { ctx, buses, tone, speakerAmount }; },
    /** @param {{ctx: BaseAudioContext | null, buses: Buses | null, tone: Tone | null, speakerAmount: number}} s */
    restore(s) { ctx = s.ctx; buses = s.buses; tone = s.tone; speakerAmount = s.speakerAmount; },
    /** The context, or null until audio is unlocked. */
    get ctx() { return ctx; },
    get buses() { return buses; },
    /** Run fn once audio exists (now, or after the first gesture). @param {() => void} fn */
    ready(fn) { if (ctx) fn(); else readyFns.push(fn); },
    /** @param {Partial<typeof volume>} v */
    setVolume(v) { Object.assign(volume, v); applyVolumes(); },
    get volume() { return { ...volume }; },
    /** @param {boolean} m */
    mute(m) { muted = m; applyVolumes(); },
  };
})();
