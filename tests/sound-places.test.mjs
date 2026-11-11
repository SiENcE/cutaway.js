// Sound places (src/sfx.js, src/audio.js): a loop, a room's music or a one-shot at a room point, heard by distance
// from the listener (the one played, else the middle of the view): louder, to its side and clearer nearer.
import { loadGame, boot } from "../tools/lib/game.mjs";

export default async function (t) {
  const g = loadGame("demo/index.html");
  await boot(g, { instant: true });
  const C = g.C, S = C.sfx;
  const src = { at: /** @type {[number, number]} */ ([100, 100]), reach: 200, near: 40 };

  // ---- how a place is heard
  const at = (x, y) => S.heard(src, { x, y });
  t.ok("within near: full, open", at(120, 100).gain === 1 && at(120, 100).cutoff === 20000);
  t.ok("at the reach and beyond: nothing", at(300, 100).gain === 0 && at(400, 100).gain === 0);
  const d = [60, 100, 140, 180].map((x) => at(100 + x, 100));
  t.ok("further: quieter and duller, step by step", d.every((h, i) => i === 0 || (h.gain < d[i - 1].gain && h.cutoff < d[i - 1].cutoff)));
  t.ok("it falls off as the ear hears it (squared): halfway out is a quarter", Math.abs(at(220, 100).gain - 0.25) < 1e-9);
  t.ok("to the side it is on", at(40, 100).pan > 0 && at(160, 100).pan < 0 && at(100, 140).pan === 0);
  t.ok("... never wholly in one ear", at(-500, 100).pan <= 0.8 && at(700, 100).pan >= -0.8);
  t.ok("no near given: a quarter of the reach", S.heard({ at: [0, 0], reach: 200 }, { x: 50, y: 0 }).gain === 1 && S.heard({ at: [0, 0], reach: 200 }, { x: 51, y: 0 }).gain < 1);

  // ---- the listener, and a room's music at a place
  const pip = C.actors.get("pip");
  await C.scene.load("hall");
  C.scene.setActive("pip");
  pip.place("hall", 60, 140, "right");
  t.ok("the listener is the one played", S.listener().x === 60 && S.listener().y === 140);
  const close = S.heardNow().music;
  pip.place("hall", 300, 170, "left");
  const far = S.heardNow().music;
  t.ok("the hall's music at the shelf: fuller near it", close.gain > far.gain && close.cutoff > far.cutoff, `${close.gain} ${far.gain}`);
  t.ok("... and from its side across the room", far.pan < -0.5);
  for (let i = 0; i < 12; i++) C.clock.advance(1000 / 60);
  t.ok("the music's place follows her, ten times a second", Math.abs(C.audio.placeNow.gain - far.gain) < 1e-9);
  pip.place("yard", 40, 150, "right");
  await C.scene.load("yard");
  t.ok("a room whose music is at no place plays it full and in the middle", JSON.stringify(S.heardNow().music) === JSON.stringify({ gain: 1, pan: 0, cutoff: 20000 }));
  for (let i = 0; i < 12; i++) C.clock.advance(1000 / 60);
  t.ok("... the place set back", C.audio.placeNow.gain === 1 && C.audio.placeNow.pan === 0);
  pip.place("hall", 60, 140, "right");
  t.ok("the one played in another room: the listener is the middle of the view", S.listener().x === C.scene.camera.x + 160 && S.listener().y === C.scene.camera.y + 90);

  // ---- a tune at a place: a loop that plays a theme of the score with a player of its own, beside the room's music (the yard's
  // radio on the mailbox). A stand-in for the browser's audio: every node and parameter takes anything and connects to anything.
  const fake = () => {
    const f = function () { return fake(); };
    return new Proxy(f, {
      get: (o, k) => (k === "connect" ? (/** @type {any} */ n) => n : k in o ? o[k] : (o[k] = fake())),
      set: (o, k, v) => { o[k] = v; return true; },
    });
  };
  const ctx = fake();
  ctx.currentTime = 0; ctx.sampleRate = 48000; ctx.state = "running";
  C.audio.init({ context: ctx });
  Object.assign(g.ctx.window, { setInterval, clearInterval, setTimeout, clearTimeout });     // the browser's timers
  C.sfx.init();                                                                              // (the tools' boot leaves sound out)
  const notes = [], play = C.synth.play;
  C.synth.play = (inst, o) => { notes.push([inst, o.note, o.time]); return play.call(C.synth, inst, o); };
  pip.place("yard", 190, 150, "right");
  await C.scene.load("yard");
  for (let k = 0; k < 40; k++) { ctx.currentTime += 0.1; await new Promise((r) => setTimeout(r, 55)); }
  const bells = notes.filter(([inst]) => inst === "bell");
  t.ok("a tune at a place plays its theme's notes", bells.length >= 8, `${bells.length} bell notes of ${notes.length}`);
  const placed = S.heardNow().loops;              // the lamp post's hum, the mailbox's radio
  t.ok("... heard from its place: full beside the mailbox, the hum further off quieter", placed.length === 2 && placed.filter((h) => h.gain === 1).length === 1, JSON.stringify(placed));
  await C.scene.load("hall");
  for (let k = 0; k < 5; k++) { ctx.currentTime += 0.1; await new Promise((r) => setTimeout(r, 55)); }
  const left = notes.length;
  for (let k = 0; k < 20; k++) { ctx.currentTime += 0.1; await new Promise((r) => setTimeout(r, 55)); }
  t.ok("... and it stops with the room", notes.length === left, `${notes.length - left} notes after leaving`);
  C.synth.play = play;
}
