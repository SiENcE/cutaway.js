// Cutaway.js scores: themes and stingers as data (the iMUSE ideas, see the music director).
//   Cutaway.score.theme("hall", {
//     tempo: 96, key: "C", beatsPerBar: 4, stepsPerBeat: 4, swing: 0,
//     tracks: { kick: { inst: "kick", layer: "drums" }, bass: { inst: "bass" }, lead: { inst: "lead", layer: "lead" } },
//     layers: { drums: [0.2, 0.4], lead: [0.6, 0.8] },   // intensity range over which a layer fades in
//     sections: {
//       a:   { bars: 4, exits: "bar", next: "b", tracks: { kick: "x . . . x . . .", bass: "C2 - . C2 ..." } },
//       b:   { bars: 4, exits: [2, 4], next: ["a", "c"], tracks: { ... } },
//       out: { bars: 1, tracks: { ... } },                  // a transition segment
//     },
//     start: "a",
//     transitions: { yard: "out" },                         // play "out" once on the way to theme "yard"
//   })
//   Cutaway.score.stinger("found", { inst: "bell", notes: "C5 E5 G5 C6 -", key: "C" })
// Sections loop unless `next` says otherwise (null ends the music). Changes of theme or section
// wait for a jump point: the end of any bar ("bar", the default), of the section ("end") or of the
// listed bars ([2, 4]). Stingers are written in their `key` and transposed to the playing theme's key.
"use strict";

/**
 * @typedef {{inst: string, layer?: string, transpose?: number, gain?: number, legato?: number}} TrackDef
 * @typedef {{bars: number, tracks?: Record<string, string>, exits?: "bar" | "end" | number[], next?: string | string[] | null}} SectionDef
 * @typedef {object} ThemeDef
 * @property {number} tempo           beats per minute
 * @property {string} [key]           tonic, e.g. "C", "F#", "Bb" (stingers follow it)
 * @property {number} [beatsPerBar]
 * @property {number} [stepsPerBeat]
 * @property {number} [swing]         0..0.5: delay of every second step, in steps
 * @property {Record<string, TrackDef>} tracks
 * @property {Record<string, [number, number]>} [layers]
 * @property {Record<string, SectionDef>} sections
 * @property {string} [start]
 * @property {Record<string, string | string[]>} [transitions]
 * @typedef {{inst: string, notes: string, key?: string, stepsPerNote?: number, gain?: number}} StingerDef
 */

Cutaway.score = (function () {
  /** @type {Map<string, ThemeDef>} */
  const themes = new Map();
  /** @type {Map<string, StingerDef>} */
  const stingers = new Map();
  const KEYS = /** @type {Record<string, number>} */ ({ C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 });

  /**
   * Problems in a theme (empty when it's fine). The validator and the music lab use this.
   * @param {string} id
   * @returns {string[]}
   */
  function check(id) {
    const t = themes.get(id), out = [];
    if (!t) return [`no theme "${id}"`];
    if (!(t.tempo > 0)) out.push("tempo must be a positive number");
    if (t.key && !(t.key in KEYS)) out.push(`unknown key "${t.key}"`);
    const secs = Object.keys(t.sections ?? {});
    if (!secs.length) out.push("no sections");
    if (t.start && !t.sections[t.start]) out.push(`start section "${t.start}" doesn't exist`);
    for (const [name, tr] of Object.entries(t.tracks ?? {})) {
      if (!Cutaway.synth.get(tr.inst)) out.push(`track "${name}": no instrument "${tr.inst}"`);
      if (tr.layer && tr.layer !== "base" && !t.layers?.[tr.layer]) out.push(`track "${name}": no layer "${tr.layer}"`);
    }
    for (const [name, s] of Object.entries(t.sections ?? {})) {
      if (!(s.bars >= 1)) out.push(`section "${name}": bars must be at least 1`);
      for (const [track, text] of Object.entries(s.tracks ?? {})) {
        if (!t.tracks?.[track]) out.push(`section "${name}": no track "${track}"`);
        try { Cutaway.sequencer.parse(text); } catch (e) { out.push(`section "${name}", track "${track}": ${/** @type {Error} */ (e).message}`); }
      }
      const nexts = s.next === undefined || s.next === null ? [] : Array.isArray(s.next) ? s.next : [s.next];
      for (const n of nexts) if (!t.sections[n]) out.push(`section "${name}": next section "${n}" doesn't exist`);
      if (Array.isArray(s.exits)) for (const b of s.exits) if (!(b >= 1 && b <= s.bars)) out.push(`section "${name}": exit after bar ${b}, but it has ${s.bars}`);
    }
    for (const [to, seg] of Object.entries(t.transitions ?? {})) {
      if (!themes.has(to)) out.push(`transition to unknown theme "${to}"`);
      for (const s of Array.isArray(seg) ? seg : [seg]) if (!t.sections[s]) out.push(`transition to "${to}": no section "${s}"`);
    }
    return out;
  }

  return {
    check, KEYS,
    /** @param {string} id @param {ThemeDef} def */
    theme(id, def) { themes.set(id, def); },
    /** @param {string} id */
    get(id) {
      const t = themes.get(id);
      if (!t) throw new Error(`Cutaway: no music theme "${id}"`);
      return t;
    },
    /** @param {string} id */
    has(id) { return themes.has(id); },
    ids() { return [...themes.keys()]; },
    /** @param {string} id @param {StingerDef} def */
    stinger(id, def) { stingers.set(id, def); },
    /** @param {string} id */
    getStinger(id) { return stingers.get(id) ?? null; },
    stingerIds() { return [...stingers.keys()]; },
    /** Problems in a stinger. @param {string} id */
    checkStinger(id) {
      const s = stingers.get(id), out = [];
      if (!s) return [`no stinger "${id}"`];
      if (!Cutaway.synth.get(s.inst)) out.push(`no instrument "${s.inst}"`);
      try { Cutaway.sequencer.parse(s.notes); } catch (e) { out.push(/** @type {Error} */ (e).message); }
      return out;
    },
  };
})();
