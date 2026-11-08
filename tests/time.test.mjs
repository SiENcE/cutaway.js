// Game time (src/time.js) on the demo: the clock and its conditions, routines that move an actor between
// rooms, a moment that waits for a watcher, a watched room (`observe`), and the tools: validate knows it
// all, the solver waits for a moment it needs.
import { loadGame, boot } from "../tools/lib/game.mjs";
import { validate } from "../tools/lib/validate.mjs";
import { makeSolver } from "../tools/lib/solver.mjs";

/** The demo with a camera: Pip can watch the hall from a monitor; a visitor's routine takes him through it. */
function withCamera(/** @type {any} */ C, o = {}) {
  C.time.configure({ start: "18:00", end: "04:00" });
  C.room("cam", { name: "Camera", background: "hall_bg", observe: true,
    hotspots: { off: { name: "monitor off", rect: [0, 0, 30, 30], exit: { to: "hall" } } } });
  const hall = C.room.get("hall");
  hall.hotspots.monitor = { name: "monitor", rect: [200, 40, 20, 20], walkTo: [210, 130], use: [{ goto: "cam" }] };
  C.actor("visitor", { name: "Visitor", costume: { idle: "bolt_idle_r", walk: "bolt_walk_r", talk: "bolt_talk_r" } });
  C.routine("visitor", [
    { day: 1, from: "18:00", to: "19:00", room: "yard", at: [120, 150] },
    { day: 1, from: "19:00", to: "20:00", room: "cam", at: [100, 150], path: [[100, 150], [140, 150]] },
  ]);
  C.moment("visit", { room: "cam", day: 1, from: "19:00", to: "20:00", play: [{ set: "saw_visit" }, "There he is."], unseen: [{ set: "missed_visit" }] });
  const act = C.act.get("act1");
  act.start = [...(act.start ?? []), { time: "18:00", day: 1 }];
  if (o.need) {                                      // the lamp only works once Pip has watched Bolt's visit
    const lamp = hall && C.room.get("yard").hotspots.lamp;
    lamp.with.bulb_clean = [{ if: "seen:visit", then: lamp.with.bulb_clean, else: "Not before I've seen Bolt on the camera." }];
  }
}

export default async function (t) {
  const g = loadGame("demo/index.html");
  withCamera(g.C);
  await boot(g, { instant: true });
  const C = g.C, S = C.state, T = C.time, run = (s) => C.script.run(s);

  // ---- the clock
  t.ok("parse: a game day from 18:00, the small hours after midnight", T.parse("18:00") === 1080 && T.parse("23:30") === 1410 && T.parse("01:00") === 1500);
  t.ok("format: back to a clock time", T.format(1500) === "01:00" && T.format(1080) === "18:00");
  t.ok("an act's start sets day and time", T.now.day === 1 && T.now.text === "18:00");
  t.ok("conditions: time and day", S.test("time>=18:00") && S.test("time<19:00") && S.test("day=1") && !S.test("day>1") && S.test("time=18:00"));
  await run([{ time: "+15" }]);
  t.ok("+15: on by a quarter", T.now.text === "18:15");
  await run([{ time: "18:00" }]);
  t.ok("a time already past: nothing", T.now.text === "18:15");
  t.ok("the next change: Bolt's routine at 19:00", T.next() === T.parse("19:00"));

  // ---- routines
  t.ok("a routine puts Bolt where he is at this time", C.actors.get("visitor").room === "yard");

  // ---- a watched room
  const pip = C.actors.get("pip");
  await C.ui.interact("monitor", "act");
  t.ok("going to a watched room leaves Pip where he is", C.scene.room.id === "cam" && pip.room === "hall");
  t.ok("nobody walks in a watched room", await (async () => { const x = pip.x; await C.ui.interact("off", "look"); return pip.x === x; })());

  // ---- a moment waits for a watcher
  await run([{ time: "next" }]);
  t.ok("19:00: Bolt comes into the camera's view", T.now.text === "19:00" && C.actors.get("visitor").room === "cam");
  const bx = C.scene.boxes(), v = bx.find((b) => b.actor === "visitor");
  t.ok("boxes: the visitor and the monitor's off switch, on the screen, named", !!v && v.box[2] > 0 && v.name === "Visitor" && bx.some((b) => b.id === "off" && b.name === "monitor off"), JSON.stringify(bx));
  const vis = C.actors.get("visitor");
  C.time.routines.get("visitor"); vis.state = "idle";
  C.clock.advance?.(0);
  t.ok("a scripted walk clears the background mark", (vis.walkTo(120, 150), vis.ambient === false));
  t.ok("the moment plays while its room is watched", S.test("seen:visit") && S.test("moment:visit") && S.flag("saw_visit") === true);
  await run([{ time: "next" }]);
  t.ok("20:00: Bolt has gone (no entry: no room)", C.actors.get("visitor").room === null);
  await run([{ time: "18:00", day: "+1" }]);
  t.ok("the next day", T.now.day === 2 && T.now.text === "18:00" && S.test("day=2"));
  t.ok("nothing more today: no next", T.next() === null);

  // ---- unseen: nobody watching while the window passes
  const g2 = loadGame("demo/index.html");
  withCamera(g2.C);
  await boot(g2, { instant: true });
  await g2.C.script.run([{ time: "19:15" }]);
  t.ok("in the window but not watched: it waits", !g2.C.state.test("moment:visit"));
  await g2.C.script.run([{ time: "20:00" }]);
  t.ok("the window passed: it happened unseen", g2.C.state.test("moment:visit") && !g2.C.state.test("seen:visit") && g2.C.state.flag("missed_visit") === true);

  // ---- a save written while a moment plays: the game just before it, and the moment plays again once loaded
  const g3 = loadGame("demo/index.html");
  withCamera(g3.C);
  /** @type {any} */
  let mid = null;
  g3.C.script.action("grab", () => { mid = g3.C.save.capture(); });
  g3.C.time.moments.get("visit").play = [{ set: "saw_visit" }, { inc: "visits" }, { grab: true }, "There he is.", { set: "visit_over" }];
  await boot(g3, { instant: true });
  const C3 = g3.C;
  await C3.script.run([{ goto: "cam" }, { time: "19:00" }]);
  t.ok("a save in the middle of a moment holds the game just before it", mid && mid.playing === "moment.visit" && mid.state.flags["~moment.visit"] === undefined
    && mid.state.flags.saw_visit === undefined && C3.state.flag("visit_over") === true && !C3.save.held, JSON.stringify(mid?.state.flags));
  await C3.save.apply(mid);
  await new Promise((r) => setTimeout(r, 0));
  t.ok("loaded, the moment plays again from its start, once (its counter counts one)", C3.state.test("seen:visit") && C3.state.flag("visit_over") === true && C3.state.flag("visits") === 1,
    JSON.stringify(C3.state.snapshot().flags));
  const after = C3.save.capture();
  t.ok("and a save after it is of the game as it is", !after.playing && after.state.flags["~moment.visit"] === "seen");

  // ---- a save keeps the time
  const snap = C.save.capture();
  await run([{ time: "+60" }]);
  await C.save.apply(snap);
  t.ok("a save keeps day and time", T.now.day === 2 && T.now.text === "18:00");

  // ---- validate
  const issues = (patch) => {
    const v = loadGame("demo/index.html");
    withCamera(v.C);
    patch?.(v.C);
    return boot(v, { instant: true }).then(() => validate(v.C, { languages: v.options.languages }).issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.msg}`));
  };
  const clean = await issues();
  t.ok("validate: time, routines, a moment and a watched room are fine", clean.length === 0, clean.join(" | "));
  const declared = await issues((C) => {
    C.script.action("mark", () => {}, { sets: (s) => [`m_${s.mark}`] });
    C.room.get("hall").hotspots.window.use = [{ mark: "x" }]; C.room.get("hall").hotspots.crate.if = "m_x";
  });
  t.ok("validate: a game's action that says which flags it sets", declared.length === 0, declared.join(" | "));
  const bad = [
    ["a bad time step", (C) => { C.room.get("hall").hotspots.window.use = [{ time: "soon" }]; }, /time "soon"/],
    ["an unknown moment", (C) => { C.room.get("hall").hotspots.window.if = "seen:vist"; }, /unknown moment "vist"/],
    ["a routine ending before it starts", (C) => { C.time.routines.get("visitor")[1].to = "18:30"; }, /end is before the start/],
    ["a routine in an unknown room", (C) => { C.time.routines.get("visitor")[0].room = "yrad"; }, /unknown room "yrad"/],
    ["a comparison with a word", (C) => { C.room.get("hall").hotspots.window.if = "chits>=lots"; }, /not a number/],
  ];
  for (const [name, patch, re] of bad) {
    const errs = await issues(patch);
    t.ok(`validate fails: ${name}`, errs.some((e) => re.test(e)), errs.join(" | ") || "no errors");
  }

  // ---- holding the clock
  const gh = loadGame("demo/index.html");
  withCamera(gh.C);
  await boot(gh, { instant: true });
  const H = gh.C, stop = H.time.parse("18:30");
  H.time.mark("18:15", "18:30", "18:45");
  H.time.hold((to) => to > stop && !H.state.flag("go") ? "not yet" : null);
  await H.script.run([{ time: "next" }, { time: "next" }]);
  t.ok("hold: the clock goes on up to where it is held", H.time.now.text === "18:30", H.time.now.text);
  t.ok("hold: next gives null, holding says why", H.time.next() === null && H.time.holding() === "not yet");
  await H.script.run([{ time: "next" }, { time: "+15" }, { time: "19:00" }]);
  t.ok("hold: no step goes past it", H.time.now.text === "18:30", H.time.now.text);
  await H.script.run([{ time: "18:00", day: "+1" }]);
  t.ok("hold: a new day isn't held", H.time.now.day === 2 && H.time.now.text === "18:00");
  await H.script.run([{ time: "18:00", day: 1 }, { time: "18:30" }, { set: "go" }, { time: "next" }]);
  t.ok("hold: once the state allows it, the clock goes on", H.time.now.text === "18:45" && H.time.holding() === null, H.time.now.text);

  // ---- the solver waits for what it needs
  const gs = loadGame("demo/index.html");
  withCamera(gs.C, { need: true });
  const r = await (await makeSolver(gs)).search({ full: true });
  const way = r.path.map((m) => m.kind === "wait" ? "wait" : `${m.kind} ${m.id ?? m.item ?? ""}`.trim());
  t.ok("solve: the end needs the moment, and the solver finds the way through the camera", r.solved && way.includes("wait") && way.includes("act monitor"), way.join(", "));
  t.ok("solve: waiting past the window in the hall is found as a soft-lock", r.softlocks.length > 0, `${r.softlocks.length} soft-locks`);
}
