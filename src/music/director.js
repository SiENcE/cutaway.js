// Cutaway.js music director: the game sets music states, not tracks.
//   { music: { theme: "lounge", section: "sneak", intensity: 0.4 } }   script action (or room `music`)
//   { music: { intensity: 0.9 } }                                     only the layers change
//   { stinger: "discovery" }                                          a one-shot on the next beat, in key
//   { music: { speaker: 1 } } ... { music: { speaker: 0, fade: 4 } }  the music from a radio in the scene,
//                                                                     then opening up to the full score
// The director turns each request into a musical move: wait for the next jump point, play the
// transition segment, fade the layers over a bar. It ducks the music a little under speech.
// A room's `music` may be a theme id or a state object. Music starts once audio is unlocked.
// Cutaway.music.render() renders offline (tools, tests: the timing can be checked exactly).
"use strict";

/**
 * speaker: 0..1, how much it sounds like a small speaker in the scene; fade: seconds to get there.
 * @typedef {{theme?: string, section?: string, intensity?: number, speaker?: number, fade?: number}} MusicState
 */

Cutaway.music = (function () {
  const LOOKAHEAD = 0.15, TICK_MS = 25;
  /** @type {InstanceType<typeof Cutaway.sequencer.Player> | null} */
  let player = null;
  /** @type {Map<string, GainNode>} */
  const layers = new Map();
  /** @type {MusicState} */
  let wanted = { intensity: 0.5 };
  let timer = 0, ducked = false;
  /** @type {((e: any) => void) | null} */
  let log = null;

  /** @param {string} name */
  function layerNode(name) {
    let g = layers.get(name);
    const c = Cutaway.audio.ctx, b = Cutaway.audio.buses;
    if (!c || !b) throw new Error("Cutaway.music: no audio");
    if (!g) { g = c.createGain(); g.gain.value = name === "base" ? 1 : 0; g.connect(b.music); layers.set(name, g); }
    return g;
  }

  function makePlayer() {
    return new Cutaway.sequencer.Player({
      note(e) {
        log?.({ kind: "note", ...e });
        Cutaway.synth.play(e.inst, { time: e.time, note: e.note, duration: e.duration, velocity: e.velocity, out: layerNode(e.layer) });
      },
      layerGain(name, gain, time, ramp) {
        log?.({ kind: "layer", layer: name, gain, time, ramp });
        const p = layerNode(name).gain;
        p.cancelScheduledValues(time);
        p.setValueAtTime(p.value, time);
        p.linearRampToValueAtTime(gain, time + Math.max(0.01, ramp));
      },
      section(e) { log?.({ kind: "section", ...e }); Cutaway.events.emit("music.section", e); },
    });
  }

  /** Apply the wanted state to the player. @param {number} now */
  function apply(now) {
    if (!player || !wanted.theme) return;
    if (!player.pos) { player.intensity = wanted.intensity ?? 0.5; player.start(wanted.theme, now + 0.05, wanted.section); }
    else player.request(wanted.theme, wanted.section);
    player.setIntensity(wanted.intensity ?? 0.5, now);
  }

  function startLive() {
    const c = Cutaway.audio.ctx;
    if (!c || player) return;
    player = makePlayer();
    apply(c.currentTime);
    timer = window.setInterval(() => { if (player && Cutaway.audio.ctx) player.pump(Cutaway.audio.ctx.currentTime + LOOKAHEAD); }, TICK_MS);
  }

  /**
   * Change the music state. Missing fields keep their value; a theme id string is short for { theme }.
   * @param {MusicState | string} s
   */
  function set(s) {
    merge(s);
    if (typeof s === "object" && s.speaker !== undefined) Cutaway.audio.speaker(s.speaker, s.fade ?? 0);
    const c = Cutaway.audio.ctx;
    if (c && player) apply(c.currentTime);
  }

  /** @param {MusicState | string} s */
  function merge(s) {
    const st = typeof s === "string" ? { theme: s } : s;
    if (st.theme && st.theme !== wanted.theme) wanted = { ...wanted, theme: st.theme, section: st.section };
    else if (st.section) wanted = { ...wanted, section: st.section };
    if (st.intensity !== undefined) wanted = { ...wanted, intensity: st.intensity };
  }

  /**
   * Play a stinger on the next beat, transposed into the playing theme's key.
   * @param {string} id
   */
  function stinger(id) {
    const c = Cutaway.audio.ctx;
    if (c && player) stingerAt(id, c.currentTime + 0.02);
  }

  /** Lower the music while someone speaks. @param {boolean} on */
  function duck(on) {
    const c = Cutaway.audio.ctx, b = Cutaway.audio.buses;
    if (!c || !b || on === ducked) return;
    ducked = on;
    const p = b.music.gain, v = Cutaway.audio.volume.music * (on ? 0.6 : 1);
    p.cancelScheduledValues(c.currentTime);
    p.setTargetAtTime(v, c.currentTime, on ? 0.05 : 0.3);
  }

  /**
   * Render music offline and return the samples (tools, tests, the music lab's export).
   * `steps` run in order: { at: seconds, set: MusicState }, { at, stinger: id } or { at, say: [actor, text] }
   * (a line in the actor's blip voice, ducking the music as in the game).
   * @param {{seconds: number, sampleRate?: number, steps: ({at: number, set?: MusicState | string, stinger?: string, say?: [string, string]})[], onEvent?: (e: any) => void}} o
   * @returns {Promise<AudioBuffer>}
   */
  async function render(o) {
    const sr = o.sampleRate ?? 44100, c = new OfflineAudioContext(2, Math.ceil(o.seconds * sr), sr);
    const keepPlayer = player, keepLayers = new Map(layers), keepWanted = wanted, keepLog = log, keepAudio = Cutaway.audio.save();
    layers.clear();
    Cutaway.audio.init({ context: c });
    Cutaway.audio.speaker(0, 0, 0);
    player = makePlayer();
    wanted = { intensity: 0.5 };
    log = o.onEvent ?? null;
    try {
      for (const s of o.steps.slice().sort((a, b) => a.at - b.at)) {
        player.pump(s.at);
        if (s.set !== undefined) {
          merge(s.set); apply(s.at - 0.05);
          if (typeof s.set === "object" && s.set.speaker !== undefined) Cutaway.audio.speaker(s.set.speaker, s.set.fade ?? 0, s.at);
        }
        if (s.stinger) stingerAt(s.stinger, s.at);
        if (s.say) {
          const [actor, text] = s.say, a = Cutaway.actors?.get(actor);
          const ms = Math.max(1400, text.length * 55), b = Cutaway.audio.buses;
          Cutaway.voice?.blips({ actor, text, id: text, ms, profile: a?.def.voice ?? {}, at: s.at });
          if (b) {                                      // duck the music under the line
            const v = Cutaway.audio.volume.music;
            b.music.gain.setTargetAtTime(v * 0.6, s.at, 0.05);
            b.music.gain.setTargetAtTime(v, s.at + ms / 1000, 0.3);
          }
        }
      }
      player.pump(o.seconds);
      return await c.startRendering();
    } finally {
      player = keepPlayer; wanted = keepWanted; log = keepLog;
      Cutaway.audio.restore(keepAudio);
      layers.clear();
      for (const [k, v] of keepLayers) layers.set(k, v);
    }
  }

  /** A stinger on the first beat at or after `now`. @param {string} id @param {number} now */
  function stingerAt(id, now) {
    const s = Cutaway.score.getStinger(id);
    if (!s || !player) return;
    const t = player.pos ? Cutaway.score.get(player.pos.theme) : null;
    const shift = t ? (((Cutaway.score.KEYS[t.key ?? "C"] - Cutaway.score.KEYS[s.key ?? "C"]) % 12) + 12) % 12 : 0;
    const step = (player.pos ? player.stepDur : 0.15) * (s.stepsPerNote ?? 1);
    let time = player.pos ? Math.max(now, player.nextBeat()) : now;
    log?.({ kind: "stinger", id, time, shift });
    for (const ev of Cutaway.sequencer.parse(s.notes)) {
      if (ev) for (const n of ev.notes) Cutaway.synth.play(s.inst, { time, note: n + (shift > 6 ? shift - 12 : shift), duration: ev.len * step * 0.9, velocity: ev.vel * (s.gain ?? 1), out: layerNode("base") });
      time += step;
    }
  }

  /** Encode an AudioBuffer as a 16-bit WAV file. @param {AudioBuffer} buf @returns {Uint8Array} */
  function wav(buf) {
    const ch = buf.numberOfChannels, n = buf.length, bytes = 44 + n * ch * 2, out = new DataView(new ArrayBuffer(bytes));
    const str = (/** @type {number} */ o, /** @type {string} */ s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); out.setUint32(4, bytes - 8, true); str(8, "WAVEfmt "); out.setUint32(16, 16, true);
    out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, buf.sampleRate, true);
    out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
    str(36, "data"); out.setUint32(40, n * ch * 2, true);
    const data = [...Array(ch)].map((_, i) => buf.getChannelData(i));
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) out.setInt16(o, Math.max(-1, Math.min(1, data[c][i])) * 32767, true);
    return new Uint8Array(out.buffer);
  }

  return {
    set, stinger, duck, render, wav,
    /** The wanted state and where the music is (bar, step, layers). */
    get state() {
      return { ...wanted, playing: player?.pos ? { ...player.pos } : null, layers: player ? Object.fromEntries(player.layerGains) : {} };
    },
    stop() {
      clearInterval(timer);
      player = null;
      for (const g of layers.values()) g.disconnect();
      layers.clear();
    },
    /** Hook the director to the game: rooms, script actions, speech. */
    init() {
      Cutaway.audio.ready(startLive);
      Cutaway.events.on("room.enter", (e) => {
        // a room plays its music full range unless it says otherwise (a radio scene ends with the room)
        const m = typeof e.music === "string" ? { theme: e.music } : e.music;
        if (Cutaway.audio.speakerAmount > 0 && m?.speaker === undefined) Cutaway.audio.speaker(0, 0.5);
        if (m) set(m);
      });
      Cutaway.events.on("music", (s) => set(s));
      Cutaway.events.on("stinger", (id) => stinger(id));
      Cutaway.events.on("say", () => duck(true));
      Cutaway.events.on("say.end", () => duck(false));
    },
  };
})();
