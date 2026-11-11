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
}
