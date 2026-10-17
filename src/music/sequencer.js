// Cutaway.js sequencer: step patterns and a look-ahead player on the audio clock.
//
// Patterns are text, one token per step; "|" marks bars for the eye and is ignored:
//   hits:  "x . . . x . o . | X . . . x . . ."     x = hit, X = accent, o = ghost, . = rest
//   notes: "C3 - . C3 G2 - . . | A2+E3 - - - . . . ."  note names, chords with "+", "-" holds,
//          "C4!" accent; "(x . x .)*2" repeats a group
// A pattern shorter than its section loops.
//
// The player schedules every step a little ahead of time (sample-accurate WebAudio timing), always
// knows the bar and step, and changes section or theme only at jump points (see score.js). Layers
// fade with the intensity, in time with the beat. The scheduling logic is plain JS with an
// injectable clock and note output, so it is unit-tested in Node.
"use strict";

/**
 * @typedef {{notes: number[], vel: number, len: number}} StepEvent   len in steps (with holds)
 * @typedef {(StepEvent | null)[]} Pattern
 */

Cutaway.sequencer = (function () {
  const HITS = /** @type {Record<string, number>} */ ({ x: 0.8, X: 1, o: 0.45 });

  /** Expand "(a b)*3" groups. @param {string} s */
  function expand(s) {
    for (let guard = 0; guard < 50 && s.includes("("); guard++) {
      s = s.replace(/\(([^()]*)\)\*(\d+)/g, (_, body, n) => Array(Number(n)).fill(body).join(" "));
    }
    return s;
  }

  /**
   * Parse a pattern string into steps.
   * @param {string} text
   * @returns {Pattern}
   */
  function parse(text) {
    const tokens = expand(text).split(/\s+/).filter((t) => t && t !== "|");
    /** @type {Pattern} */
    const out = [];
    /** @type {StepEvent | null} */
    let last = null;
    for (const tok of tokens) {
      if (tok === ".") { out.push(null); last = null; continue; }
      if (tok === "-") { out.push(null); if (last) last.len++; continue; }
      if (tok in HITS) { last = { notes: [60], vel: HITS[tok], len: 1 }; out.push(last); continue; }
      const accent = tok.endsWith("!"), body = accent ? tok.slice(0, -1) : tok;
      last = { notes: body.split("+").map((n) => Cutaway.synth.midi(n)), vel: accent ? 1 : 0.8, len: 1 };
      out.push(last);
    }
    return out;
  }

  /** @type {Map<string, Pattern>} */
  const cache = new Map();
  /** @param {string} text */
  function pattern(text) {
    let p = cache.get(text);
    if (!p) { p = parse(text); cache.set(text, p); }
    return p;
  }

  /**
   * @typedef {object} NoteEvent
   * @property {number} time
   * @property {string} theme
   * @property {string} section
   * @property {number} bar      bar inside the section (0-based)
   * @property {number} step     step inside the bar
   * @property {string} track
   * @property {string} inst
   * @property {number} note
   * @property {number} velocity
   * @property {number} duration seconds
   * @property {string} layer
   */
  /**
   * @typedef {object} PlayerHooks
   * @property {(e: NoteEvent) => void} note           play (or record) a note
   * @property {(layer: string, gain: number, time: number, rampSeconds: number) => void} [layerGain]
   * @property {(e: {time: number, theme: string, section: string, bar: number}) => void} [section]  a section starts
   */

  /** Plays themes from score.js. */
  class Player {
    /** @param {PlayerHooks} hooks */
    constructor(hooks) {
      this.hooks = hooks;
      /** @type {{theme: string, section: string, bar: number, step: number} | null} */
      this.pos = null;
      this.nextTime = 0;
      /** @type {{theme: string, section?: string} | null} */
      this.pending = null;
      /** @type {string[]} sections still to play before the pending target (transition segments) */
      this.via = [];
      this.intensity = 0.5;
      /** @type {Map<string, number>} layer -> current gain */
      this.layerGains = new Map();
      this.stopAt = Infinity;
      this.cycle = -1;                                // walks through `next` lists in order
    }

    /** @param {string} id */
    theme(id) { return Cutaway.score.get(id); }
    get stepDur() { return this.pos ? 60 / this.theme(this.pos.theme).tempo / (this.theme(this.pos.theme).stepsPerBeat ?? 4) : 0.15; }

    /**
     * Start a theme at once (no jump point to wait for).
     * @param {string} theme
     * @param {number} time
     * @param {string} [section]
     */
    start(theme, time, section) {
      const t = this.theme(theme);
      this.pos = { theme, section: section ?? t.start ?? Object.keys(t.sections)[0], bar: 0, step: 0 };
      this.nextTime = time;
      this.stopAt = Infinity;
      this.applyLayers(time, 0);
      this.hooks.section?.({ time, theme, section: this.pos.section, bar: 0 });
    }

    /**
     * Ask for another theme or section; it begins at the next jump point.
     * @param {string} theme
     * @param {string} [section]
     */
    request(theme, section) {
      if (!this.pos) return;
      if (this.pos.theme === theme && (!section || this.pos.section === section) && !this.via.length) { this.pending = null; return; }
      this.pending = { theme, section };
      const cur = this.theme(this.pos.theme), seg = theme !== this.pos.theme ? cur.transitions?.[theme] : undefined;
      this.via = seg ? (Array.isArray(seg) ? seg.slice() : [seg]) : [];
    }

    /**
     * Change the intensity (0..1). Layers fade from the next beat over `bars` bars.
     * @param {number} v
     * @param {number} now
     * @param {number} [bars]
     */
    setIntensity(v, now, bars = 1) {
      this.intensity = Math.max(0, Math.min(1, v));
      if (!this.pos) return;
      const t = this.theme(this.pos.theme), bar = this.stepDur * (t.stepsPerBeat ?? 4) * (t.beatsPerBar ?? 4);
      this.applyLayers(Math.max(now, this.nextBeat()), bar * bars);
    }

    /** @param {number} time @param {number} ramp */
    applyLayers(time, ramp) {
      if (!this.pos) return;
      const t = this.theme(this.pos.theme);
      for (const [name, range] of Object.entries(t.layers ?? {})) {
        const [lo, hi] = range, g = hi <= lo ? (this.intensity >= lo ? 1 : 0) : Math.max(0, Math.min(1, (this.intensity - lo) / (hi - lo)));
        if (this.layerGains.get(name) === g) continue;
        this.layerGains.set(name, g);
        this.hooks.layerGain?.(name, g, time, ramp);
      }
    }

    /** Is the end of this bar a jump point of the current section? @param {number} barDone 1-based */
    jumpPoint(barDone) {
      if (!this.pos) return false;
      const sec = this.theme(this.pos.theme).sections[this.pos.section], ex = sec.exits ?? "bar";
      if (ex === "bar") return true;
      if (ex === "end") return barDone === sec.bars;
      return ex.includes(barDone) || barDone === sec.bars;
    }

    /** Move to the next bar; switch section or theme where the music allows. */
    nextBar() {
      if (!this.pos) return;
      const t = this.theme(this.pos.theme), sec = t.sections[this.pos.section], barDone = this.pos.bar + 1;
      const atEnd = barDone >= sec.bars;
      if (this.pending && this.jumpPoint(barDone)) {
        if (this.via.length) { this.enter(this.pos.theme, /** @type {string} */ (this.via.shift())); return; }
        const p = this.pending;
        this.pending = null;
        const nt = this.theme(p.theme);
        this.enter(p.theme, p.section ?? nt.start ?? Object.keys(nt.sections)[0]);
        return;
      }
      if (!atEnd) { this.pos.bar = barDone; return; }
      const next = sec.next === undefined ? this.pos.section : sec.next;
      if (next === null) { this.stopAt = this.nextTime; this.pos = null; return; }
      const choice = Array.isArray(next) ? next[++this.cycle % next.length] : next;
      this.enter(this.pos.theme, choice);
    }

    /** @param {string} theme @param {string} section */
    enter(theme, section) {
      const changed = !this.pos || this.pos.theme !== theme;
      this.pos = { theme, section, bar: 0, step: 0 };
      if (changed) this.applyLayers(this.nextTime, this.stepDur * 2);
      this.hooks.section?.({ time: this.nextTime, theme, section, bar: 0 });
    }

    /** Schedule every step that starts before `until` (seconds on the audio clock). @param {number} until */
    pump(until) {
      for (let guard = 0; this.pos && this.nextTime < until && guard < 10000; guard++) {
        const t = this.theme(this.pos.theme), spb = t.stepsPerBeat ?? 4, perBar = spb * (t.beatsPerBar ?? 4);
        const sec = t.sections[this.pos.section], dur = this.stepDur;
        const swing = (this.pos.step % 2 === 1) ? (t.swing ?? 0) * dur : 0;
        const index = this.pos.bar * perBar + this.pos.step;
        for (const [track, text] of Object.entries(sec.tracks ?? {})) {
          const tr = t.tracks[track], pat = pattern(text);
          if (!tr || !pat.length) continue;
          const ev = pat[index % pat.length];
          if (!ev) continue;
          for (const n of ev.notes) {
            this.hooks.note({ time: this.nextTime + swing, theme: this.pos.theme, section: this.pos.section, bar: this.pos.bar,
              step: this.pos.step, track, inst: tr.inst, note: n + (tr.transpose ?? 0), velocity: ev.vel * (tr.gain ?? 1),
              duration: ev.len * dur * (tr.legato ?? 0.9), layer: tr.layer ?? "base" });
          }
        }
        this.nextTime += dur;
        this.pos.step++;
        if (this.pos.step >= perBar) { this.pos.step = 0; this.nextBar(); }
      }
    }

    /** Time of the next beat at or after the next step to be scheduled. */
    nextBeat() {
      if (!this.pos) return this.nextTime;
      const spb = this.theme(this.pos.theme).stepsPerBeat ?? 4, r = this.pos.step % spb;
      return this.nextTime + (r ? spb - r : 0) * this.stepDur;
    }
  }

  return { parse, pattern, expand, Player };
})();
