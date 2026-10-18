// Acts, the demo's end and hints, on the demo game in Node: a new game starts from a clean state, the
// act is in the save, { act: "next" } goes on or ends the demo, hints get clearer, and the tools catch
// broken acts and hints.
import { loadGame, boot } from "../tools/lib/game.mjs";
import { validate } from "../tools/lib/validate.mjs";
import { makeSolver } from "../tools/lib/solver.mjs";

/** The demo, booted without a screen; `patch` runs on the data before it starts. */
async function demo(patch, opts) {
  const g = loadGame("demo/index.html");
  if (patch) patch(g.C);
  if (opts) Object.assign(g.options, opts);
  const run = await boot(g, { instant: true });
  return { C: g.C, g, run };
}

export default async function (t) {
  {
    const { C } = await demo();
    t.ok("acts: the demo begins its act", C.acts.current === "act1" && C.scene.room.id === "hall" && C.scene.active.id === "pip");
    C.state.set("got_key");
    C.actors.get("bolt").place("yard", 100, 160);
    const saved = C.save.capture();
    t.ok("acts: the act is in the save", saved.act === "act1");
    await C.acts.begin("act1", { fresh: true });
    t.ok("acts: a new game starts clean", !C.state.flag("got_key") && C.actors.get("bolt").room === "hall");
    await C.save.apply(saved);
    t.ok("acts: loading brings the state back", C.state.flag("got_key") && C.acts.current === "act1");
    t.ok("acts: begun acts stay unlocked", C.acts.unlocked().includes("act1"));
  }
  {
    // a second act: { act: "next" } goes on to it; in a demo of act 1 it ends the game instead
    const second = (C) => C.act("act2", { title: "Act 2", name: "Night", room: "yard", actor: "bolt", start: [{ set: "night" }] });
    const ride = async (C) => { await C.script.run({ act: "next" }); };
    const a = await demo(second);
    await ride(a.C);
    t.ok("acts: next begins the next act", a.C.acts.current === "act2" && a.C.scene.room.id === "yard" && a.C.state.flag("night") && !a.run.ended);
    const b = await demo(second, { demo: { acts: ["act1"], link: "https://example.org" } });
    await ride(b.C);
    t.ok("acts: a demo ends before an act it doesn't have", b.run.ended && b.C.acts.current === "act1");
    const c = await demo();
    await ride(c.C);
    t.ok("acts: with no act after it, the game ends", c.run.ended);
    // a fresh act forgets the act before it: only what its start gives comes along
    const d = await demo((C) => C.act("act2", { room: "yard", actor: "bolt", fresh: true, start: [{ set: "night" }] }));
    d.C.state.set("got_key");
    await ride(d.C);
    t.ok("acts: a fresh act begins clean after the one before", d.C.acts.current === "act2" && d.C.state.flag("night") && !d.C.state.flag("got_key"));
    // ... except the flags it keeps, and those only when the act before goes on into it
    const e = await demo((C) => C.act("act2", { room: "yard", actor: "bolt", fresh: true, keep: ["got_key", "lamp_lit"] }));
    e.C.state.set("got_key"); e.C.state.set("bulb_clean");
    await ride(e.C);
    t.ok("acts: a fresh act keeps the flags it lists", e.C.state.flag("got_key") === true && !e.C.state.flag("bulb_clean") && !("lamp_lit" in e.C.state.snapshot().flags));
    await e.C.acts.begin("act2", { fresh: true });
    t.ok("acts: started anew, a fresh act keeps nothing", !e.C.state.flag("got_key"));
  }
  {
    const { C } = await demo();
    const lines = [];
    C.events.on("hint", (h) => lines.push(`${h.index}.${h.line}`));
    for (let i = 0; i < 4; i++) await C.hints.ask();
    C.state.set("got_key");
    await C.hints.ask();
    t.ok("hints: asking again gets clearer, a new hint starts over", lines.join(" ") === "0.0 0.1 0.2 0.2 1.0", lines.join(" "));
    // an act's own hints count only while it is played, before the game's others
    const all = C.hints.all();
    C.hints([{ text: "Night hint." }], { act: "act2" });
    t.ok("hints: an act's hints wait for their act", C.hints.all().length === all.length + 1 && C.hints.current() !== C.hints.all()[all.length]);
    C.hints([{ text: "Night hint, again." }], { act: "act2" });
    t.ok("hints: giving an act its hints again replaces only them", C.hints.all().length === all.length + 1 && C.hints.all()[all.length].text === "Night hint, again.");
  }
  {
    const errorsOf = async (patch, opts) => {
      const { C, g } = await demo(patch, opts);
      return validate(C, { languages: g.options.languages, demo: g.options.demo, title: g.options.title }).issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.msg}`);
    };
    const broken = [
      ["unknown act", (C) => { C.room.get("yard").hotspots.hills.use = [{ act: "act9" }]; }, null, /unknown act "act9"/],
      ["act in an unknown room", (C) => { C.act("act2", { room: "attic" }); }, null, /act act2.room: unknown room "attic"/],
      ["demo of an unknown act", null, { demo: { acts: ["act7"] } }, /demo: unknown act "act7"/],
      ["hint about nothing", (C) => { C.hints([...C.hints.all(), { about: "fridge", text: "Hungry?" }]); }, null, /"fridge" is no hotspot/],
    ];
    for (const [name, patch, opts, re] of broken) {
      const errs = await errorsOf(patch, opts);
      t.ok(`validate fails: ${name}`, errs.some((e) => re.test(e)), errs.join(" | ") || "no errors");
    }
  }
  {
    // the solver's hint check: a hint about the wrong thing, and states without any hint
    const stale = await makeSolver((await demo()).g);
    const solver = async (patch) => { const g = loadGame("demo/index.html"); patch(g.C); return makeSolver(g); };
    t.ok("solve: the demo's hints fit every state", (await stale.search({ full: true })).hints.problems.length === 0);
    const wrong = await (await solver((C) => { const h = C.hints.all(); h[2].about = "shelf"; C.hints(h); })).search({ full: true });
    t.ok("solve: a hint about something no longer needed is found", wrong.hints.problems.some((p) => p.hint === 2 && /no longer needs/.test(p.problem)));
    const gap = await (await solver((C) => { C.hints(C.hints.all().slice(0, 4)); })).search({ full: true });
    t.ok("solve: states without a hint are found", gap.hints.problems.some((p) => p.hint === -1));
  }
}
