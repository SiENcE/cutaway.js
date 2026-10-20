// What the editor needs from the engine, in Node on the demo: the clock held apart from the menus'
// pause (Step still moves it), the sound held without a context, and a sequence played from one of its
// shot marks (what comes before hurries and leaves its state, then it plays at its pace); a key held
// down skips nothing with its repeats.
import { loadGame, boot } from "../tools/lib/game.mjs";

/** The demo, booted at once, then with real waits and tweens again (as tests/cinema.test.mjs). */
async function demo(patch) {
  const g = loadGame("demo/index.html");
  if (patch) patch(g.C);
  const wait = g.C.clock.wait;
  await boot(g, { instant: true });
  g.C.clock.wait = wait;
  g.C.tween.instant = false;
  g.C.settings.init("sequence-test");
  return g;
}

/** Let game time pass in small steps, letting promise chains go on in between. */
const pass = async (C, ms) => {
  for (let t = 0; t < ms; t += 50) { C.clock.advance(50); await new Promise((r) => setTimeout(r, 0)); }
};

export default async function (t) {
  const { C } = await demo((C) => {
    C.sequence("film", {
      steps: [{ shot: "a" }, { goto: "intro_sky" }, { wait: 3000 }, { set: "saw_a" },
        { shot: "b" }, { goto: "yard" }, { caption: "Later.", ms: 2000 }, { wait: 4000 }, { set: "saw_b" },
        { if: "saw_b", then: [{ shot: "c" }] }, { wait: 5000 }, { set: "saw_c" }],
    });
  });

  // the clock: the editor's hold is its own, beside the menus' pause
  C.clock.held = true;
  const t0 = C.clock.time;
  let fired = false;
  C.clock.wait(100).then(() => { fired = true; });
  C.clock.advance(100);
  await new Promise((r) => setTimeout(r, 0));
  t.ok("clock: held apart from paused", C.clock.held && !C.clock.paused);
  t.ok("clock: a held clock still steps by hand (the editor's Step)", C.clock.time - t0 >= 99 && fired);
  C.clock.paused = true; C.clock.paused = false;
  t.ok("clock: the menus' pause doesn't release the hold", C.clock.held);
  C.clock.held = false;
  C.audio.hold(true);
  t.ok("audio: held without a context yet (nothing to suspend)", C.audio.held && !C.audio.ctx);
  C.audio.hold(false);

  // a sequence from a shot mark
  t.ok("sequence: its shot marks, in ifs too", C.sequence.shots("film").join() === "a,b,c", C.sequence.shots("film").join());
  const shots = [];
  C.events.on("sequence.shot", (e) => shots.push(e.shot));
  // a key held down counts once: its repeats don't skip
  C.sequence.init();
  const key = (code, repeat) => C.events.emit("key", { code, key: code, event: { repeat, preventDefault() {} } });
  const held = C.sequence.play("film");
  await pass(C, 300);
  key("Space", true); key("Enter", true); key("Escape", true);
  await pass(C, 300);
  t.ok("sequence: a held key's repeats don't skip", shots.join() === "a" && C.sequence.playing() === "film" && !C.state.flag("saw_a"), shots.join());
  key("Escape", false);
  await held;
  t.ok("sequence: its first press does", !C.sequence.playing() && shots.join() === "a");
  shots.length = 0;
  const film = C.sequence.play("film", { from: "b" });
  await pass(C, 100);
  t.ok("sequence: from a shot, the steps before it hurry and leave their state", C.state.flag("saw_a") && shots.join() === "a,b" && C.scene.room.id === "yard" && !C.state.flag("saw_b"), shots.join());
  t.ok("sequence: back to normal speed at that shot", !C.script.fast && !C.tween.instant && C.sequence.playing() === "film");
  await pass(C, 1000);
  t.ok("sequence: it plays at its pace from there", C.cinema.caption?.text === "Later." && !C.state.flag("saw_b"));
  await pass(C, 20000);
  const skipped = await film;
  t.ok("sequence: played to its end", C.state.flag("saw_c") && skipped === false && !C.sequence.playing() && C.scene.room.id === "hall");
  let err = "";
  try { await C.sequence.play("film", { from: "nope" }); } catch (e) { err = String(e.message); }
  t.ok("sequence: from a shot it doesn't have: an error, nothing plays", /no shot "nope"/.test(err) && !C.sequence.playing(), err);
}
