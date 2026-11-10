// The game tools on the demo: validate passes, broken references fail; solve finds the end, an
// unsolvable variant fails and a soft-lock is found; graph traces the moves (what each needs and brings about).
import { spawnSync } from "node:child_process";
import { loadGame, boot } from "../tools/lib/game.mjs";
import { validate } from "../tools/lib/validate.mjs";
import { makeSolver, loadFor } from "../tools/lib/solver.mjs";
import { buildGraph } from "../tools/lib/graph.mjs";
import { makeTracer } from "../tools/lib/trace.mjs";

async function demo(patch) {
  const g = loadGame("demo/index.html");
  if (patch) patch(g.C);
  return g;
}
const errorsOf = async (patch) => {
  const g = await demo(patch);
  await boot(g, { instant: true });
  return validate(g.C, { languages: g.options.languages }).issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.msg}`);
};

export default async function (t) {
  t.ok("validate: the demo has no errors", (await errorsOf()).length === 0);
  // an actor without a costume is a voice: fine on its own, wrong in a room
  t.ok("validate: a voice-only actor is fine", (await errorsOf((C) => {
    C.actor("radio", { name: "Radio" }); C.room.get("hall").hotspots.window.use = [{ say: "radio", text: "Hello?" }];
  })).length === 0);
  // a walk area of its own (a boat) is fine when a goto leads there, an error when nothing does
  const island = (/** @type {boolean} */ withGoto) => (/** @type {any} */ C) => {
    const hall = C.room.get("hall");
    hall.walk = [...hall.walk, [10, 20, 40, 20, 40, 40, 10, 40]];
    hall.hotspots.window.walkTo = [20, 30];
    if (withGoto) hall.hotspots.window.use = [{ goto: "hall", at: [25, 30] }];
  };
  t.ok("validate: a walk area reached by a goto is fine", (await errorsOf(island(true))).length === 0, (await errorsOf(island(true))).join(" | "));
  t.ok("validate fails: a walk area nothing leads to", (await errorsOf(island(false))).some((e) => /can't be reached/.test(e)));
  // a walk area wider than the room: the room's size is missing
  const wide = await demo((/** @type {any} */ C) => { const hall = C.room.get("hall"); hall.walk = [...hall.walk, [300, 150, 380, 150, 380, 170, 300, 170]]; });
  await boot(wide, { instant: true });
  t.ok("validate warns: a walk area beyond the room's size", validate(wide.C, {}).issues.some((i) => i.level === "warning" && /beyond the room's size/.test(i.msg)));
  // texts the game declares (Cutaway.i18n.declare): validate sees them like the data's
  const decl = await demo((/** @type {any} */ C) => { C.i18n.declare("a panel", ["Only on a panel.", "@panel.nowhere"]); });
  await boot(decl, { instant: true });
  const dv = validate(decl.C, { languages: decl.options.languages });
  t.ok("validate: a declared text is a text", dv.texts.has("Only on a panel."));
  t.ok("validate fails: a declared @key missing in a language", dv.issues.some((i) => i.level === "error" && /"@panel.nowhere" missing/.test(i.msg)));
  // view flags (state.view): a "lens" view that shows the shelf; the solver opens it on the way (its click
  // in the path) and doesn't count it as state
  {
    const viewed = await demo((/** @type {any} */ C) => {
      const hall = C.room.get("hall");
      hall.hotspots.lens = { name: "lens", rect: [0, 0, 8, 8], use: [{ set: "lens", value: "near" }] };
      hall.hotspots.lens_off = { name: "lens off", rect: [8, 0, 8, 8], if: "lens", use: [{ unset: "lens" }] };
      hall.hotspots.shelf.if = "lens=near";
      C.state.view("lens");
    });
    const sv = await makeSolver(viewed);
    const rv = await sv.search({ full: true });
    const ids = rv.path.map((m) => m.id);
    t.ok("view flags: solved, the view opened on the way", rv.solved && ids.indexOf("lens") >= 0 && ids.indexOf("lens") < ids.indexOf("shelf"), ids.join(" "));
    const plain = await demo((/** @type {any} */ C) => {
      const hall = C.room.get("hall");
      hall.hotspots.lens = { name: "lens", rect: [0, 0, 8, 8], use: [{ set: "lens", value: "near" }] };
      hall.hotspots.lens_off = { name: "lens off", rect: [8, 0, 8, 8], if: "lens", use: [{ unset: "lens" }] };
      hall.hotspots.shelf.if = "lens=near";
    });
    const rp = await (await makeSolver(plain)).search({ full: true });
    t.ok("view flags: fewer states than the same flag as state, no soft-locks", rv.states < rp.states && rv.softlocks.length === 0, `${rv.states} vs ${rp.states}`);
  }
  const broken = [
    ["unknown item", (C) => { C.room.get("hall").hotspots.plant.take[0].take = "leef"; }, /unknown item "leef"/],
    ["unknown exit room", (C) => { C.room.get("hall").hotspots.doorway.exit.to = "yrad"; }, /unknown room "yrad"/],
    ["unknown action", (C) => { C.room.get("hall").hotspots.window.use = [{ jump: 3 }]; }, /unknown action/],
    ["flag typo", (C) => { C.room.get("hall").hotspots.doorway.if = "door_opne"; }, /"door_opne" is tested but never set/],
    ["unknown image", (C) => { C.room.get("yard").props[0].image = "mailbx"; }, /unknown image or animation "mailbx"/],
    ["walkTo outside", (C) => { C.room.get("hall").hotspots.window.walkTo = [150, 60]; }, /outside the walkable area/],
    ["unreachable walkTo", (C) => { C.room.get("hall").holes.push([0, 120, 320, 120, 320, 140, 0, 140]); }, /can't be reached|outside the walkable/],
    ["bad condition", (C) => { C.room.get("hall").hotspots.window.if = "hsa:key"; }, /unknown condition/],
    ["unknown dialog node", (C) => { C.dialog.get("bolt").main[0].goto = "nowhere"; }, /unknown node "nowhere"/],
    ["missing @key", (C) => { C.room.get("hall").hotspots.window.look = "@hall.window"; }, /"@hall.window" missing/],
    ["unknown music theme", (C) => { C.room.get("yard").music = { theme: "yrad" }; }, /unknown music theme "yrad"/],
    ["unknown stinger", (C) => { C.room.get("hall").hotspots.window.use = [{ stinger: "boing" }]; }, /unknown stinger "boing"/],
    ["voice in a room", (C) => { C.actor("radio", { name: "Radio", room: "hall", at: [100, 160] }); }, /voice only/],
    ["broken score", (C) => { C.score.get("hall").sections.a.next = "zz"; }, /next section "zz"/],
  ];
  for (const [name, patch, re] of broken) {
    const errs = await errorsOf(patch);
    t.ok(`validate fails: ${name}`, errs.some((e) => re.test(e)), errs.join(" | ") || "no errors");
  }

  const solver = await makeSolver(await demo());
  const r = await solver.search({ full: true });
  t.ok("solve: the demo can be finished", r.solved && r.path.length > 0, `${r.states} states`);
  t.ok("solve: no soft-locks in the demo", r.complete && r.softlocks.length === 0);
  // worker threads search the same states and find the same way
  const setup = { page: "demo/index.html" }, par = await (await makeSolver(loadFor(setup), { workers: 2, setup })).search({ full: true });
  t.ok("solve: with workers, the same states, way and hints", par.states === r.states && JSON.stringify(par.path) === JSON.stringify(r.path) &&
    par.softlocks.length === 0 && JSON.stringify(par.hints?.uses) === JSON.stringify(r.hints?.uses), `${par.states} vs ${r.states}`);

  const s2 = await makeSolver(await demo((C) => { C.room.get("hall").hotspots.shelf.use[0].then[0].then[0] = { set: "nothing" }; }));
  t.ok("solve: no key, no end", !(await s2.search()).solved);

  const s3 = await makeSolver(await demo((C) => { C.room.get("yard").hotspots.lamp.with.bulb = [{ remove: "bulb" }, "Oops. It broke."]; }));
  const r3 = await s3.search({ full: true });
  t.ok("solve: a soft-lock is found", r3.solved && r3.softlocks.length > 0, `${r3.softlocks.length} soft-locks`);

  // ---- dialogues: every choice of every dialogue a move opens is played
  // a choice that breaks the game for good (the lamp never lights), and the window as the place to talk
  const trap = (/** @type {any} */ C, /** @type {any} */ use) => {
    const lamp = C.room.get("yard").hotspots.lamp;
    lamp.with.bulb_clean = [{ if: "broken", then: "It is broken for good.", else: lamp.with.bulb_clean }];
    C.dialog("trap", { main: [{ text: "Break it.", then: [{ set: "broken" }], goto: "end" }, { text: "Leave it.", goto: "end" }] });
    C.dialog("chat", { main: [{ text: "Hi.", goto: "end" }, { text: "Ho.", goto: "end" }, { text: "Hum.", goto: "end" }] });
    C.dialog("outer", { main: [{ text: "Ask.", then: [{ dialog: "trap" }] }, { text: "Bye.", goto: "end" }] });
    C.room.get("hall").hotspots.window.use = use;
  };
  const locks = async (/** @type {any} */ use) => (await (await makeSolver(await demo((C) => trap(C, use)))).search({ full: true })).softlocks.length;
  t.ok("solve: a choice that breaks the game is a soft-lock", (await locks([{ dialog: "trap" }])) > 0);
  t.ok("solve: so it is in a dialogue inside a dialogue's choice", (await locks([{ dialog: "outer" }])) > 0);
  t.ok("solve: and in the second of two dialogues in a row", (await locks([{ dialog: "chat" }, { dialog: "trap" }])) > 0);
  t.ok("solve: the same dialogue twice in a row, and what comes after it", (await locks([{ dialog: "chat" }, { dialog: "chat" }, { set: "broken" }])) > 0);
  const asked = await (await makeSolver(await demo((/** @type {any} */ C) => {
    const door = C.room.get("hall").hotspots.door;
    door.with.key = [{ if: "asked", then: door.with.key, else: "Not before I've asked." }];
    C.dialog("sub", { main: [{ text: "May I?", then: [{ set: "asked" }], goto: "end" }, { text: "Never mind.", goto: "end" }] });
    C.dialog("outer", { main: [{ text: "A question.", then: [{ dialog: "sub" }] }, { text: "Bye.", goto: "end" }] });
    C.room.get("hall").hotspots.window.use = [{ dialog: "outer" }];
  }))).search();
  t.ok("solve: what the end needs can lie behind a dialogue inside a dialogue", asked.solved);
  // a dialogue that changes the state with every choice never comes to an end: said, not cut short in silence
  let endless = "";
  try {
    await (await makeSolver(await demo((/** @type {any} */ C) => {
      C.dialog("count", { main: [{ text: "One more.", then: [{ inc: "n" }] }, { text: "Enough.", goto: "end" }] });
      C.room.get("hall").hotspots.window.use = [{ dialog: "count" }];
    }))).search();
  } catch (e) { endless = String(/** @type {any} */ (e).message); }
  t.ok("solve: a dialogue more than 40 choices deep is an error", /act window.*more than 40 choices/.test(endless), endless || "no error");

  // ---- only moves a player can make
  t.ok("solve: no bag in a room without buttons (the bulb can't go into the lamp)",
    !(await (await makeSolver(await demo((/** @type {any} */ C) => { C.room.get("yard").buttons = false; }))).search()).solved);
  t.ok("solve: a fixed item is never held (the key can't go into the door)",
    !(await (await makeSolver(await demo((/** @type {any} */ C) => { C.item.get("key").fixed = true; }))).search()).solved);
  t.ok("solve: a held item can still be used on a fixed one (the bulb on the leaf)",
    (await (await makeSolver(await demo((/** @type {any} */ C) => { C.item.get("leaf").fixed = true; }))).search()).solved);

  // ---- two acts that begin alike are two states
  const two = await (await makeSolver(await demo((/** @type {any} */ C) => {
    const lit = C.room.get("yard").hotspots.lamp.with.bulb_clean;
    lit[lit.length - 1] = { act: "next" };
    C.act("act2", { title: "Act 2", room: "hall", actor: "pip", fresh: true, start: C.act.get("act1").start });
  }))).search({ full: true });
  t.ok("solve: a second act that begins as the first is played too", two.solved && two.states > r.states && two.softlocks.length === 0, `${two.states} states, ${two.softlocks.length} soft-locks`);

  // ---- a search cut short proves nothing (a limit just under the demo's states: the end is found, not every state)
  const cut = spawnSync(process.execPath, ["tools/solve.mjs", "demo/index.html", "--full", "--max", String(r.states - 50), "--workers", "0"], { encoding: "utf8" });
  t.ok("solve.mjs: --full stopped at the limit exits 1", cut.status === 1 && /solved in/.test(cut.stdout) && /incomplete/.test(cut.stdout), `exit ${cut.status}: ${cut.stdout.split("\n").slice(-3).join(" | ")}`);

  // state.watch hears reads; a traced search gives the steps, the way and the state budget
  const g0 = await demo();
  await boot(g0, { instant: true });
  const heard = [];
  g0.C.state.watch((k, n) => heard.push(`${k}:${n}`));
  for (const c of ["door_open", "has:key", "visited:yard"]) g0.C.state.test(c);
  g0.C.state.watch(null);
  g0.C.state.test("got_key");
  t.ok("state.watch: hears flags, items and rooms read, nothing once stopped", heard.join(" ") === "flag:door_open item:key visited:yard", heard.join(" "));
  const tr = await (await makeSolver(loadFor(setup), { workers: 2, setup, trace: true })).search({ full: true });
  const G = buildGraph(/** @type {any} */ (tr), []);
  const door = G.moves.find((m) => m.move === "use key on door");
  t.ok("graph: the key opens the door (needs has:key, brings door_open)", !!door && door.reads.some(([f, s]) => f === "has:key" && s === 1) && door.writes.includes("door_open"), JSON.stringify(door));
  const box = G.moves.filter((m) => m.room === "yard" && m.move === "act mailbox");
  t.ok("graph: one click, a step per outcome (the mailbox opens, gives the bulb, closes)", box.length === 3, box.map((m) => m.writes.join(",")).join(" | "));
  t.ok("graph: combining is the same step in every room", G.moves.filter((m) => m.move.startsWith("combine")).length === 1);
  t.ok("graph: the winning way runs through the steps and ends with the end", G.way.length > 3 && G.way.every((id) => G.moves.some((m) => m.id === id)) && !!G.moves.find((m) => m.id === G.way[G.way.length - 1])?.wins, G.way.join(" > "));
  // the tracer: a hotspot that takes its box from a prop needs what makes the prop be there
  {
    const gt = await demo((/** @type {any} */ C) => { C.room.get("hall").props.find((/** @type {any} */ q) => q.id === "plant").if = "fern"; });
    await boot(gt, { instant: true });
    const C = gt.C;
    await C.acts.begin("act1", { card: false });
    C.state.set("fern");
    const snap = C.save.capture({ live: true }), m = { kind: "act", id: "plant" }, tracer = makeTracer(C, []);
    tracer.begin(snap, m);
    tracer.end(snap, m, { ...snap, state: { ...snap.state, flags: { ...snap.state.flags, took: true } } }, false);
    const step = Object.values(tracer.take())[0];
    t.ok("trace: a hotspot on a prop's box needs the prop's if", !!step && (step.reads.fern ?? 0) > 0, JSON.stringify(step));
  }
  // validate: { show } or { hide } on a prop with if (its condition decides; the state they set is one more)
  const warnsOf = async (/** @type {any} */ patch) => {
    const g = await demo(patch);
    await boot(g, { instant: true });
    return validate(g.C, {}).issues.filter((i) => i.level === "warning").map((i) => `${i.where}: ${i.msg}`);
  };
  const showIf = await warnsOf((/** @type {any} */ C) => { C.room.get("hall").hotspots.window.use = [{ show: "door" }]; });
  t.ok("validate warns: { show } on a prop with if", showIf.some((w) => /window/.test(w) && /if/.test(w) && /door/.test(w)), showIf.join(" | "));
  t.ok("validate: the demo has no such warning", !(await warnsOf()).some((w) => /prop with if/.test(w)));
  t.ok("graph: the state budget names the once-mark that doubles the states", G.factors.some((f) => f.part === "once:hall.crate.use.0" && Math.abs(f.factor - 2) < 0.01), JSON.stringify(G.factors.slice(0, 3)));
}
