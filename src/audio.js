// Cutaway.js audio: the WebAudio graph every sound goes through.
//   music bus -> tone -> place ┐  (tone: a small speaker on the scene's music, e.g. a radio; Cutaway.audio.speaker;
//                               place: where that music plays in the room, by distance: Cutaway.audio.place)
//   voice bus ────────├─> master gain -> compressor -> speakers
//   sfx bus   ┘
//   The score's sends (reverb: a convolver with a generated impulse; hall; delay) come back into the music bus, so its
//   reverb is turned down with the music, sounds through the same small speaker and comes from the same place. A tune
//   played as a sound (a loop at a place, a jingle) has sends of its own that come back into the sfx bus (sfxSends).
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
 * @property {GainNode} reverb   send: whatever goes in comes out reverberated, into the music bus
 * @property {GainNode} hall     send: a long, dark reverb (6.5 s)
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
  /** @typedef {{lp: BiquadFilterNode, gain: GainNode, pan: StereoPannerNode}} Place */
  /** @type {Place | null} */
  let placeNodes = null;
  /** @type {{gain: number, pan: number, cutoff: number}} where the music is heard from (Cutaway.audio.place) */
  let placeNow = { gain: 1, pan: 0, cutoff: 20000 };
  const volume = { master: 0.8, music: 0.7, voice: 0.8, sfx: 0.8 };
  /** @type {(() => void)[]} */
  const readyFns = [];
  let muted = false, held = false, quiet = false;

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
   * The sends' returns into `dest`: the reverb (2.4 s), the hall (a long tail, its highs rolled off, so it stays behind
   * like distance) and the delay's echoes.
   * @param {BaseAudioContext} c @param {{reverb: GainNode, hall: GainNode, delay: GainNode}} s @param {AudioNode} dest
   */
  function returns(c, s, dest) {
    const g = () => c.createGain();
    const conv = c.createConvolver();
    conv.buffer = impulse(c, 2.4, 2.6);
    const wet = g(); wet.gain.value = 0.32;
    s.reverb.connect(conv).connect(wet).connect(dest);
    const hconv = c.createConvolver(), hlp = c.createBiquadFilter(), hwet = g();
    hconv.buffer = impulse(c, 6.5, 2.2); hlp.type = "lowpass"; hlp.frequency.value = 2400; hwet.gain.value = 0.3;
    s.hall.connect(hconv).connect(hlp).connect(hwet).connect(dest);
    const dl = c.createDelay(2), fb = g(), dlf = c.createBiquadFilter();
    dl.delayTime.value = 0.375; fb.gain.value = 0.32; dlf.type = "lowpass"; dlf.frequency.value = 2600;
    s.delay.connect(dl).connect(dlf).connect(fb).connect(dl);
    const dwet = g(); dwet.gain.value = 0.4;
    dlf.connect(dwet).connect(dest);
  }

  /** @type {WeakMap<BaseAudioContext, {reverb: GainNode, hall: GainNode, delay: GainNode}>} */
  const sfxWet = new WeakMap();
  /**
   * Sends whose returns come into the sfx bus, made on first use: for a tune played as a sound, whose notes reverberate
   * where it plays (each loop at a place sends through its own place on the way in), not in the score's.
   * @returns {{reverb: GainNode, hall: GainNode, delay: GainNode} | null}
   */
  function sfxSends() {
    if (!ctx || !buses) return null;
    let s = sfxWet.get(ctx);
    if (!s) { s = { reverb: ctx.createGain(), hall: ctx.createGain(), delay: ctx.createGain() }; returns(ctx, s, buses.sfx); sfxWet.set(ctx, s); }
    return s;
  }

  /**
   * Build the graph on a context (a live AudioContext, or an OfflineAudioContext for rendering).
   * @param {{context?: BaseAudioContext}} [o]
   */
  function init(o = {}) {
    if (ctx && !o.context) return ctx;
    const c = o.context ?? new AudioContext({ latencyHint: "interactive" });
    const g = () => c.createGain();
    const master = g(), music = g(), voice = g(), sfx = g(), reverb = g(), hall = g(), delay = g();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
    master.connect(comp).connect(c.destination);
    const hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), mid = c.createBiquadFilter();
    hp.type = "highpass"; lp.type = "lowpass"; mid.type = "peaking"; mid.frequency.value = 1500; mid.Q.value = 0.9;
    const plp = c.createBiquadFilter(), pgain = g(), ppan = c.createStereoPanner();
    plp.type = "lowpass"; plp.frequency.value = 20000;
    music.connect(hp).connect(lp).connect(mid).connect(plp).connect(pgain).connect(ppan).connect(master);
    for (const b of [voice, sfx]) b.connect(master);
    returns(c, { reverb, hall, delay }, music);
    ctx = c;
    buses = { master, music, voice, sfx, reverb, hall, delay };
    tone = { hp, lp, mid };
    placeNodes = { lp: plp, gain: pgain, pan: ppan };
    speaker(speakerAmount, 0);
    place(placeNow, 0);
    applyVolumes();
    if (!o.context) {                                 // offline renders don't start the game's sound
      if (held && "suspend" in c) /** @type {AudioContext} */ (c).suspend();
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

  /**
   * Where the music is heard from: a source in the room (a radio on a stall) heard from where the one played
   * stands: its loudness (0..1), its side (-1..1) and how dull the distance makes it (a lowpass, Hz). Glides
   * there over `seconds` (the sound places of sfx.js call it as the listener moves).
   * @param {{gain?: number, pan?: number, cutoff?: number}} p @param {number} [seconds]
   */
  function place(p, seconds = 0.08) {
    placeNow = { gain: p.gain ?? 1, pan: p.pan ?? 0, cutoff: p.cutoff ?? 20000 };
    if (!ctx || !placeNodes) return;
    const t = ctx.currentTime, k = Math.max(0.001, seconds / 3);
    placeNodes.gain.gain.setTargetAtTime(placeNow.gain, t, k);
    placeNodes.pan.pan.setTargetAtTime(placeNow.pan, t, k);
    placeNodes.lp.frequency.setTargetAtTime(placeNow.cutoff, t, k);
  }

  function applyVolumes() {
    if (!buses) return;
    buses.master.gain.value = muted ? 0 : volume.master;
    buses.music.gain.value = volume.music;
    buses.voice.gain.value = volume.voice;
    buses.sfx.gain.value = volume.sfx;
  }

  /** The live context runs unless the page is hidden or the sound is held (the editor). */
  function wake() {
    const c = /** @type {AudioContext | null} */ (ctx);
    if (!c || !("suspend" in c)) return;
    if (held || (typeof document !== "undefined" && document.hidden)) { if (c.state === "running") c.suspend(); }
    else if (c.state === "suspended") c.resume();
  }

  /** Create (or resume) the live context on the first user gesture; suspend while the page is hidden. */
  function hook() {
    const unlock = () => {
      if (!ctx) init();
      wake();
    };
    for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, unlock, { capture: true });
    document.addEventListener("visibilitychange", wake);
  }

  /**
   * Hold the sound (the editor pauses the game): the live context is suspended, so music, loops and
   * lines stop where they are, until it is released (and the page is shown).
   * @param {boolean} on
   */
  function hold(on) { held = on; wake(); }

  /**
   * May sound start now, without the player's click or key (a desktop shell, a browser that allows
   * it, or audio already unlocked)? If so, the live context is made at once. Asks the browser without
   * starting anything when it can tell (getAutoplayPolicy); else a trial context shows it.
   * @returns {Promise<boolean>}
   */
  async function autoplay() {
    if (ctx) return ctx.state === "running";
    if (typeof AudioContext === "undefined") return false;
    const nav = /** @type {any} */ (typeof navigator !== "undefined" ? navigator : {});
    let ok = false;
    if (typeof nav.getAutoplayPolicy === "function") ok = nav.getAutoplayPolicy("audiocontext") === "allowed";
    else {
      try {
        const c = new AudioContext();
        ok = c.state === "running" || await new Promise((done) => {
          c.onstatechange = () => { if (c.state === "running") done(true); };
          setTimeout(() => done(c.state === "running"), 150);
        });
        c.close();
      } catch { ok = false; }
    }
    if (ok) init();
    return ok;
  }

  return {
    init, hook, impulse, speaker, place, autoplay, hold, sfxSends,
    /** Is the sound held (the editor)? */
    get held() { return held; },
    /**
     * Quiet: what the game says to the sound is heard but nothing sounds that happens once (sounds, stingers,
     * lines' voices); the music and the rooms' loops still follow what they are told, to sound from there
     * (the editor's timeline while it seeks).
     */
    get quiet() { return quiet; },
    /** @param {boolean} v */
    set quiet(v) { quiet = v; },
    /** How much the music sounds like a small speaker now (the last value asked for). */
    get speakerAmount() { return speakerAmount; },
    /** Where the music is heard from now (the last place asked for). */
    get placeNow() { return { ...placeNow }; },
    /** The current context and buses, to put back after an offline render. */
    save() { return { ctx, buses, tone, speakerAmount, placeNodes, placeNow }; },
    /** @param {{ctx: BaseAudioContext | null, buses: Buses | null, tone: Tone | null, speakerAmount: number, placeNodes?: Place | null, placeNow?: {gain: number, pan: number, cutoff: number}}} s */
    restore(s) { ctx = s.ctx; buses = s.buses; tone = s.tone; speakerAmount = s.speakerAmount; placeNodes = s.placeNodes ?? null; placeNow = s.placeNow ?? placeNow; },
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
