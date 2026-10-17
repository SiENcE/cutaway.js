// The music system's timing, without audio: patterns, sections, jump points, transitions, layers.
import { load } from "./load.mjs";
import { readFileSync } from "node:fs";
import vm from "node:vm";

export default function (t) {
  const C = load(["music/synth.js", "music/sequencer.js", "music/score.js"]);
  const P = C.sequencer.parse;

  const hits = P("x . o | X . (x .)*2");
  t.ok("hits: velocities, rests, bars, groups", hits.length === 9 && hits[0].vel === 0.8 && hits[1] === null && hits[2].vel === 0.45 && hits[3].vel === 1 && hits[5] && hits[7] && !hits[8]);
  const notes = P("C4 - - . C4+E4+G4! . Bb2");
  t.ok("notes: holds, chords, accents, flats", notes[0].len === 3 && notes[0].notes[0] === 60 && notes[4].notes.join() === "60,64,67" && notes[4].vel === 1 && notes[6].notes[0] === 46);
  t.ok("note names", C.synth.midi("A4") === 69 && C.synth.midi("F#3") === 54 && C.synth.midi(61) === 61);

  // the demo's scores, with instruments defined by demo/music.js
  vm.runInContext(readFileSync("demo/music.js", "utf8"), vm.createContext(Object.assign(Object.create(null), { Cutaway: C })));
  t.ok("demo scores check out", C.score.ids().every((id) => C.score.check(id).length === 0) && C.score.stingerIds().every((id) => C.score.checkStinger(id).length === 0),
    C.score.ids().map((id) => C.score.check(id).join("; ")).join(" / "));

  const STEP = 60 / 96 / 4, BAR = STEP * 16;
  const run = () => {
    const ev = [], sections = [], layers = [];
    const p = new C.sequencer.Player({ note: (e) => ev.push(e), section: (e) => sections.push(e), layerGain: (l, g, time) => layers.push({ l, g, time }) });
    return { p, ev, sections, layers };
  };
  const near = (a, b) => Math.abs(a - b) < 1e-6;

  let r = run();
  r.p.start("hall", 0);
  r.p.pump(12);
  t.ok("starts with the intro, then section a after 2 bars", r.sections[0].section === "intro" && r.sections[1].section === "a" && near(r.sections[1].time, 2 * BAR));
  t.ok("notes sit on the step grid", r.ev.every((e) => near((e.time / STEP) - Math.round(e.time / STEP), 0)));

  r = run();
  r.p.start("hall", 0);
  r.p.pump(2 * BAR + 5 * STEP);                       // in bar 1 of section a
  r.p.request("yard");
  r.p.pump(20);
  const seg = r.sections.find((s) => s.section === "to_yard"), yard = r.sections.find((s) => s.theme === "yard");
  t.ok("theme change waits for the bar end, through the transition segment", seg && near(seg.time, 3 * BAR) && yard && near(yard.time, 4 * BAR),
    JSON.stringify(r.sections.map((s) => [s.theme, s.section, +(s.time / BAR).toFixed(3)])));
  t.ok("no hall notes after the segment", r.ev.filter((e) => e.theme === "hall" && e.time >= 4 * BAR - 1e-9).length === 0);

  r = run();
  r.p.start("hall", 0, "b");                           // section b only allows exits after bars 2 and 4
  r.p.pump(STEP * 3);
  r.p.request("hall", "a");
  r.p.pump(10);
  const a = r.sections.find((s) => s.section === "a");
  t.ok("exits [2, 4]: the change waits for the end of bar 2", a && near(a.time, 2 * BAR), a && String(a.time / BAR));

  r = run();
  r.p.start("hall", 0);
  r.p.setIntensity(0, 0);
  r.p.pump(1 + STEP);                                   // mid-beat
  r.layers.length = 0;
  r.p.setIntensity(1, 1);
  const lead = r.layers.find((l) => l.l === "lead");
  t.ok("intensity fades layers in from the next beat", lead && lead.g === 1 && near((lead.time / (STEP * 4)) - Math.round(lead.time / (STEP * 4)), 0) && lead.time >= 1,
    JSON.stringify(r.layers));
  t.ok("layers below their range stay silent", r.p.layerGains.get("drums") === 1 && run().p.layerGains.size === 0);

  C.score.theme("bad", { tempo: 0, tracks: { x: { inst: "nope", layer: "missing" } }, sections: { a: { bars: 0, next: "zz", tracks: { y: "Q9" } } }, transitions: { nowhere: "seg" } });
  const probs = C.score.check("bad");
  t.ok("broken score: every problem reported", probs.length >= 6, probs.join("; "));
}
