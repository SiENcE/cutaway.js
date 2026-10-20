// Cutaway.js voices. Lines are spoken by a voice provider; the default one "blips": short synthesised
// syllables in the style of Animal Crossing, shaped like the line's vowels.
//   Cutaway.actor("pip", { voice: { pitch: 72, range: 5, wave: "square", syllable: 70, speed: 1.1, gain: 0.25 } })
// Per line: one syllable per vowel group, pauses at commas and full stops, rising pitch at "?",
// louder at "!". A line always sounds the same: the random choices are seeded by the line's id.
// Recorded voices: a language's voices file (made in the editor's Voices tab) holds clips by the line's
// text as the game's data has it (its source, before translation), or "actor|text" for one speaker:
//   Cutaway.voice.layer("de", { "Hallo!": { sample: "data:audio/webm;base64,...", ms: 840, from: 60, gain: 1 } })
// from trims the clip's start (ms), ms is how long it plays (the line stays at least that long). A line
// with a clip in the language played plays it; the others blip. Other providers (Cutaway.voice.use) come first.
"use strict";

/**
 * @typedef {object} VoiceProfile
 * @property {number} [pitch]     base note (MIDI), e.g. 60 = middle C
 * @property {number} [range]     semitones of variation
 * @property {"square" | "saw" | "triangle" | "sine" | "pulse"} [wave]
 * @property {number} [syllable]  ms per syllable
 * @property {number} [speed]     faster (> 1) or slower (< 1) talker
 * @property {number} [gain]
 * @property {number} [formant]   shifts the vowel filters (1 = default; > 1 brighter, < 1 darker)
 */
/**
 * A voice provider speaks a line and returns a way to stop it, or null if it can't.
 * `at` = when to start on the audio clock (default: now; offline renders set it); `source` = the text in
 * the game's data (before translation).
 * @typedef {(line: {actor: string, text: string, source: string, id: string, ms: number, profile: VoiceProfile, at?: number}) => ({stop: () => void} | null)} VoiceProvider
 */
/**
 * A recorded line.
 * @typedef {object} VoiceClip
 * @property {string} sample   data URI (or "~" + scrambled base64 in a release)
 * @property {number} ms       how long it plays (after the trim)
 * @property {number} [from]   ms cut from the start
 * @property {number} [gain]
 */

Cutaway.voice = (function () {
  // vowel formants (Hz): F1, F2
  const VOWELS = /** @type {Record<string, [number, number]>} */ ({
    a: [800, 1250], e: [500, 1900], i: [320, 2300], o: [520, 900], u: [350, 750], y: [320, 2000],
    "ä": [650, 1700], "ö": [450, 1500], "ü": [320, 1700],
  });
  /** @type {VoiceProvider[]} */
  const providers = [];
  /** @type {Record<string, Record<string, VoiceClip>>} recorded lines: language -> key -> clip */
  const recorded = {};
  /** @type {{stop: () => void} | null} */
  let current = null;
  let enabled = true;

  /** @param {string} s */
  function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

  /**
   * Split a line into syllables and pauses.
   * @param {string} text
   * @returns {({vowel: string, accent: boolean} | {pause: number})[]}
   */
  function syllables(text) {
    /** @type {({vowel: string, accent: boolean} | {pause: number})[]} */
    const out = [];
    for (const m of text.toLowerCase().matchAll(/([a-zäöüß]+)|([,;:–])|([.!?…]+)|(\s+)/g)) {
      if (m[1]) {
        const groups = m[1].match(/[aeiouyäöü]+/g) ?? ["e"];
        for (const g of groups) out.push({ vowel: g[0], accent: false });
      } else if (m[2]) out.push({ pause: 140 });
      else if (m[3]) {
        if (m[3].includes("!")) for (let i = out.length - 1, n = 0; i >= 0 && n < 2; i--) { const s = out[i]; if ("vowel" in s) { s.accent = true; n++; } }
        out.push({ pause: 260 });
      }
    }
    return out;
  }

  /** @type {VoiceProvider} */
  const blips = (line) => {
    const c = Cutaway.audio.ctx, b = Cutaway.audio.buses;
    if (!c || !b) return null;
    const p = line.profile, out = c.createGain();
    out.connect(b.voice);
    let seed = hash(line.id + "|" + line.text);
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    const syl = (p.syllable ?? 75) / 1000 / (p.speed ?? 1), base = p.pitch ?? 64, range = p.range ?? 5;
    const parts = syllables(line.text), question = /\?\s*$/.test(line.text);
    const lastVowel = parts.map((s, i) => ("vowel" in s ? i : -1)).filter((i) => i >= 0).slice(-2);
    let t = line.at ?? c.currentTime + 0.03;
    const end = t + Math.max(0.3, line.ms / 1000 - 0.2);
    parts.forEach((s, i) => {
      if (t > end) return;
      if ("pause" in s) { t += s.pause / 1000 / (p.speed ?? 1); return; }
      let note = base + Math.round((rnd() - 0.5) * 2 * range);
      if (question && lastVowel.includes(i)) note = base + range + (i === lastVowel[lastVowel.length - 1] ? 3 : 1);
      const [f1, f2] = VOWELS[s.vowel] ?? VOWELS.e, k = p.formant ?? 1, len = syl * (0.75 + rnd() * 0.4);
      const osc = c.createOscillator(), g = c.createGain(), b1 = c.createBiquadFilter(), b2 = c.createBiquadFilter(), mix = c.createGain();
      if (p.wave === "pulse") osc.type = "square"; else osc.type = p.wave === "saw" ? "sawtooth" : (p.wave ?? "square");
      const f = Cutaway.synth.hz(note);
      osc.frequency.setValueAtTime(f * 1.04, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + len * 0.4);
      /** @type {[BiquadFilterNode, number][]} */
      const bands = [[b1, f1], [b2, f2]];
      for (const [bf, fq] of bands) { bf.type = "bandpass"; bf.frequency.value = fq * k; bf.Q.value = 6; osc.connect(bf).connect(mix); }
      mix.gain.value = 3;
      const dry = c.createGain();                      // a little of the raw tone, so every vowel has body
      dry.gain.value = 0.35;
      osc.connect(dry).connect(mix);
      const peak = (p.gain ?? 0.3) * (s.accent ? 1.4 : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.008);
      g.gain.setTargetAtTime(peak * 0.6, t + 0.01, len / 3);
      g.gain.setTargetAtTime(0, t + len * 0.8, 0.012);
      mix.connect(g).connect(out);
      osc.start(t); osc.stop(t + len + 0.06);
      t += len + syl * 0.15;
    });
    return {
      stop() {
        const now = c.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setTargetAtTime(0, now, 0.02);
        setTimeout(() => out.disconnect(), 300);
      },
    };
  };

  /** The clip of a line in the language played: the speaker's own, else the line's. @param {string} actor @param {string} source */
  function clipOf(actor, source) {
    const r = recorded[Cutaway.i18n.language];
    return r ? r[`${actor}|${source}`] ?? r[source] ?? null : null;
  }

  /**
   * Play a clip on the voice bus (the editor plays them too). Its decoding may take a moment; stopped
   * before, it never starts.
   * @param {VoiceClip} clip @param {number} [at]  when, on the audio clock
   * @returns {{stop: () => void} | null}
   */
  function playClip(clip, at) {
    const c = Cutaway.audio.ctx, b = Cutaway.audio.buses;
    if (!c || !b) return null;
    const out = c.createGain();
    out.gain.value = clip.gain ?? 1;
    out.connect(b.voice);
    let stopped = false;
    /** @type {AudioBufferSourceNode | null} */
    let src = null;
    Cutaway.sfx.decode(c, clip.sample).then((buf) => {
      if (stopped) return;
      src = c.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.start(Math.max(at ?? 0, c.currentTime), (clip.from ?? 0) / 1000, clip.ms / 1000);
    }).catch((e) => console.warn("Cutaway: a voice didn't decode", e));
    return {
      stop() {
        stopped = true;
        const now = c.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setTargetAtTime(0, now, 0.02);
        setTimeout(() => { try { src?.stop(); } catch { /* not started */ } out.disconnect(); }, 200);
      },
    };
  }

  /** @type {VoiceProvider} */
  const recordedVoice = (line) => {
    const clip = clipOf(line.actor, line.source);
    return clip ? playClip(clip, line.at) : null;
  };

  /** @param {{actor: string, text: string, source?: string, id?: string, ms: number}} e */
  function speak(e) {
    current?.stop();
    current = null;
    if (!enabled) return;
    const a = Cutaway.actors.get(e.actor), profile = /** @type {VoiceProfile} */ (a?.def.voice ?? {});
    const line = { actor: e.actor, text: e.text, source: e.source ?? e.text, id: e.id ?? e.text, ms: e.ms, profile };
    for (const p of [...providers, recordedVoice, blips]) { const h = p(line); if (h) { current = h; return; } }
  }

  return {
    syllables, blips, playClip,
    /**
     * A language's recorded lines (the voices file calls this; the editor too): key -> clip, null removes one.
     * @param {string} lang @param {Record<string, VoiceClip | null>} clips
     */
    layer(lang, clips) {
      const r = (recorded[lang] ??= {});
      // a release build scrambles the texts (the keys) as it does the game's; the samples are revealed when decoded
      const plain = (/** @type {string} */ k) => (k.charCodeAt(0) === 31 ? Cutaway.assets.reveal(k) : k);
      for (const [k, v] of Object.entries(clips)) { if (v) r[plain(k)] = v; else delete r[plain(k)]; }
    },
    /** The recorded lines of a language (a copy). @param {string} lang */
    layerOf(lang) { return { ...(recorded[lang] ?? {}) }; },
    /** The languages with recorded lines. */
    languages() { return Object.keys(recorded); },
    /** The clip a line would play now (the speaker's own, else the line's), or null. @param {string} actor @param {string} source */
    clip: clipOf,
    /** How long a line's clip holds it (0: none; the clip and a moment more). @param {string} actor @param {string} source */
    clipMs(actor, source) { const c = enabled ? clipOf(actor, source) : null; return c ? c.ms + 250 : 0; },
    /** Add a provider that is tried before the blips (e.g. recorded voices). @param {VoiceProvider} p */
    use(p) { providers.unshift(p); },
    /** @param {boolean} on */
    setEnabled(on) { enabled = on; if (!on) { current?.stop(); current = null; } },
    get enabled() { return enabled; },
    init() {
      Cutaway.events.on("say", (e) => speak(e));
      Cutaway.events.on("say.end", () => { current?.stop(); current = null; });
    },
  };
})();
