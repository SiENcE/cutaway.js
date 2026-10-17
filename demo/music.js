// The demo's music (original): two themes at the same tempo, so the change between rooms stays in time.
//   hall  C major, calm: bass, electric piano; drums, pad and lead come in with the intensity
//   yard  G major, brighter: plucked guitar, bass; drums and a whistled tune with the intensity
// Each theme has a one-bar transition segment that leads into the other's key.
"use strict";
(function () {
  const I = Cutaway.synth.define;
  I("kick", { type: "drum", kind: "kick", gain: 0.9 });
  I("snare", { type: "drum", kind: "snare", gain: 0.45, gate: 0.22, reverb: 0.15 });
  I("hat", { type: "drum", kind: "hat", gain: 0.22, pan: 0.25 });
  I("bass", { type: "sub", wave: "saw", filter: { cutoff: 260, env: 1100, q: 7, decay: 0.18 }, amp: { a: 0.004, d: 0.2, s: 0.55, r: 0.08 }, gain: 0.42 });
  I("epiano", { type: "fm", ratio: 1, index: 1.4, indexDecay: 0.45, amp: { a: 0.003, d: 0.9, s: 0.25, r: 0.35 }, gain: 0.16, reverb: 0.25, pan: -0.15 });
  I("pad", { type: "sub", wave: "saw", voices: 3, detune: 16, filter: { cutoff: 850, q: 1 }, amp: { a: 0.7, d: 0.5, s: 0.85, r: 1.2 }, gain: 0.06, reverb: 0.45 });
  I("lead", { type: "sub", wave: "pulse", pulseWidth: 0.3, filter: { cutoff: 2200, env: 1400, decay: 0.3 }, vibrato: { rate: 5.5, depth: 16, delay: 0.2 },
    amp: { a: 0.01, d: 0.1, s: 0.8, r: 0.15 }, gain: 0.11, delay: 0.22, reverb: 0.2, pan: 0.1 });
  I("guitar", { type: "pluck", decay: 0.995, bright: 0.65, gain: 0.32, pan: -0.25, reverb: 0.2 });
  I("whistle", { type: "sub", wave: "sine", vibrato: { rate: 6, depth: 24, delay: 0.12 }, amp: { a: 0.03, d: 0.1, s: 0.9, r: 0.15 }, gain: 0.16, reverb: 0.3, delay: 0.2 });
  I("bell", { type: "fm", ratio: 3.5, index: 2, indexDecay: 0.8, amp: { a: 0.002, d: 1.2, s: 0, r: 1 }, gain: 0.2, reverb: 0.4 });
  I("brass", { type: "sub", wave: "saw", voices: 2, detune: 8, filter: { cutoff: 600, env: 2400, a: 0.05, decay: 0.4, sustain: 0.4 }, amp: { a: 0.03, d: 0.2, s: 0.8, r: 0.2 }, gain: 0.14, reverb: 0.3 });

  // one bar of 16 steps from a chord
  const comp = (c) => `${c} - - . . . ${c} - . . . ${c} - . . .`;
  const hold = (c) => `${c} - - - - - - - - - - - - - - -`;
  const arp = (r, t, f, o) => `${r} . ${t} . ${f} . ${o} . ${f} . ${t} . ${r} . ${f} .`;
  const bars = (...b) => b.join(" | ");
  const C = "C4+E4+G4", Am = "A3+C4+E4", F = "A3+C4+F4", G = "B3+D4+G4", Em = "B3+E4+G4", D = "A3+D4+F#4";
  const DRUMS = {
    kick: "x . . . . . . . x . x . . . . .",
    snare: ". . . . X . . . . . . . X . . .",
    hat: "x . x . x . x . x . x . x . x x",
  };

  Cutaway.score.theme("hall", {
    tempo: 96, key: "C",
    tracks: {
      kick: { inst: "kick", layer: "drums" }, snare: { inst: "snare", layer: "drums" }, hat: { inst: "hat", layer: "drums" },
      bass: { inst: "bass" }, keys: { inst: "epiano" }, pad: { inst: "pad", layer: "pads" }, lead: { inst: "lead", layer: "lead" },
    },
    layers: { drums: [0.25, 0.45], pads: [0.35, 0.6], lead: [0.6, 0.85] },
    start: "intro",
    sections: {
      intro: { bars: 2, next: "a", tracks: { keys: bars(comp(C), comp(G)), pad: bars(hold(C), hold(G)) } },
      a: { bars: 4, next: "b", tracks: {
        ...DRUMS,
        bass: bars("C2 - . C2 . . G1 . C2 - . . G1 . A1 B1", "A1 - . A1 . . E2 . A1 - . . G1 . A1 .", "F1 - . F1 . . C2 . F1 - . . C2 . F1 .", "G1 - . G1 . . D2 . G1 - . . B1 . D2 ."),
        keys: bars(comp(C), comp(Am), comp(F), comp(G)),
        pad: bars(hold(C), hold(Am), hold(F), hold(G)),
        lead: bars("E5 - . G5 - . A5 . G5 - . E5 . D5 . .", "C5 - - . . . E5 . D5 - . C5 . A4 - .", "A4 - . C5 - . F5 . E5 - . C5 . A4 . .", "B4 - . D5 - . G5 - - - . . . . . ."),
      } },
      b: { bars: 4, next: "a", exits: [2, 4], tracks: {
        ...DRUMS,
        bass: bars("F1 - . F1 . . C2 . F1 - . . A1 . C2 .", "G1 - . G1 . . D2 . G1 - . . B1 . D2 .", "E1 - . E1 . . B1 . E1 - . . G1 . B1 .", "A1 - . A1 . . E2 . A1 - . E2 G1 . E1 ."),
        keys: bars(comp(F), comp(G), comp(Em), comp(Am)),
        pad: bars(hold(F), hold(G), hold(Em), hold(Am)),
        lead: bars("A5 - . G5 . F5 . E5 - - . C5 . D5 - .", "D5 - . E5 . D5 . B4 - - . G4 . A4 - .", "G4 - . B4 . E5 . G5 - - . E5 . D5 - .", "C5 - - - . . A4 - - - . . . . . ."),
      } },
      to_yard: { bars: 1, tracks: {
        bass: "C2 . . . D2 . . . E2 . . . F#2 . . .", keys: comp(D), pad: hold(D),
        kick: "x . . . . . . . x . . . . . . .", snare: ". . . . . . . . . . . . x x x X",
      } },
    },
    transitions: { yard: "to_yard" },
  });

  Cutaway.score.theme("yard", {
    tempo: 96, key: "G",
    tracks: {
      kick: { inst: "kick", layer: "drums" }, snare: { inst: "snare", layer: "drums" }, hat: { inst: "hat", layer: "drums" },
      bass: { inst: "bass" }, guitar: { inst: "guitar" }, whistle: { inst: "whistle", layer: "lead" },
    },
    layers: { drums: [0.25, 0.45], lead: [0.55, 0.8] },
    sections: {
      a: { bars: 4, next: "b", tracks: {
        ...DRUMS,
        bass: bars("G1 - . G1 . . D2 . G1 - . . B1 . D2 .", "E1 - . E1 . . B1 . E1 - . . G1 . B1 .", "C2 - . C2 . . G1 . C2 - . . E2 . G1 .", "D2 - . D2 . . A1 . D2 - . . F#1 . A1 ."),
        guitar: bars(arp("G3", "B3", "D4", "G4"), arp("E3", "G3", "B3", "E4"), arp("C3", "E3", "G3", "C4"), arp("D3", "F#3", "A3", "D4")),
        whistle: bars("B5 - - . A5 . G5 . D5 - - . . . . .", "E5 - . G5 . B5 . A5 - - . G5 . E5 . .", "C6 - - . B5 . A5 . G5 - . E5 . G5 . .", "F#5 - . A5 . D6 - - - . . . . . . ."),
      } },
      b: { bars: 4, next: "a", tracks: {
        ...DRUMS,
        bass: bars("C2 - . C2 . . G1 . C2 - . . E2 . G1 .", "D2 - . D2 . . A1 . D2 - . . F#1 . A1 .", "B1 - . B1 . . F#1 . B1 - . . D2 . F#1 .", "E1 - . E1 . . B1 . E1 - . D2 . B1 . ."),
        guitar: bars(arp("C3", "E3", "G3", "C4"), arp("D3", "F#3", "A3", "D4"), arp("B2", "D3", "F#3", "B3"), arp("E3", "G3", "B3", "E4")),
        whistle: bars("E5 - . G5 . C6 - - . B5 . A5 . G5 . .", "F#5 - . A5 . D6 - - . C6 . B5 . A5 . .", "B5 - - . A5 . F#5 . D5 - . F#5 . A5 . .", "G5 - - - . . E5 - - - . . . . . ."),
      } },
      to_hall: { bars: 1, tracks: {
        bass: "G1 . . . F1 . . . E1 . . . D1 . . .", guitar: arp("G3", "B3", "D4", "F4"),
        kick: "x . . . . . . . x . . . . . . .", snare: ". . . . . . . . . . . . x . x X",
      } },
    },
    transitions: { hall: "to_hall" },
  });

  Cutaway.score.stinger("pickup", { inst: "bell", notes: "C6 E6 G6 C7 - - -", key: "C" });
  Cutaway.score.stinger("discovery", { inst: "brass", notes: "G4 C5 E5 G5+C6 - - - - - -", key: "C", stepsPerNote: 1 });
})();
