// Render a game's music offline in headless Chrome and write a WAV file (plus the event log).
//   node tools/render-music.mjs <page.html> --out music.wav [--seconds 30] [--rate 44100] [--steps '[{"at":0,"set":"hall"}]']
// Steps: { at: seconds, set: theme id or { theme, section, intensity } } or { at, stinger: id }.
// Prints when each section starts, so changes can be checked against the bar grid.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./lib/chrome.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const page = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const out = opt("--out");
if (!page || !out) { console.error("usage: node tools/render-music.mjs <page.html> --out f.wav [--seconds 30] [--steps json]"); process.exit(2); }
const seconds = Number(opt("--seconds", "30")), rate = Number(opt("--rate", "44100"));
const steps = JSON.parse(opt("--steps", '[{"at":0,"set":{"intensity":0.5}}]'));

const chrome = await launch();
try {
  await chrome.open(pathToFileURL(resolve(page)).href + "?manual");
  const r = await chrome.ev(`(async () => {
    const log = [];
    const buf = await Cutaway.music.render({ seconds: ${seconds}, sampleRate: ${rate}, steps: ${JSON.stringify(steps)}, onEvent: (e) => { if (e.kind !== "note") log.push(e); } });
    const bytes = Cutaway.music.wav(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    return { wav: btoa(bin), log, peak };
  })()`);
  writeFileSync(out, Buffer.from(r.wav, "base64"));
  for (const e of r.log) {
    if (e.kind === "section") console.log(`${e.time.toFixed(3).padStart(8)} s  section ${e.theme}/${e.section}`);
    else if (e.kind === "stinger") console.log(`${e.time.toFixed(3).padStart(8)} s  stinger ${e.id} (+${e.shift} semitones)`);
    else if (e.kind === "layer") console.log(`${e.time.toFixed(3).padStart(8)} s  layer ${e.layer} -> ${e.gain.toFixed(2)} over ${e.ramp.toFixed(2)} s`);
  }
  console.log(`peak ${r.peak.toFixed(3)}; wrote ${out}`);
  for (const e of chrome.errors) console.error(e);
  process.exitCode = chrome.errors.length || r.peak > 1 ? 1 : 0;
} finally {
  await chrome.close();
}
