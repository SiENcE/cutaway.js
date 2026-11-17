// The game tools on the demo: validate passes, broken references fail; solve finds the end, an
// unsolvable variant fails and a soft-lock is found; graph traces the moves (what each needs and brings about)
// and what an act hands over; the hand-over between acts is checked statically and from runs (handoff).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "../tools/lib/chrome.mjs";
import { loadGame, boot } from "../tools/lib/game.mjs";
import { validate } from "../tools/lib/validate.mjs";
import { makeSolver, loadFor, describe } from "../tools/lib/solver.mjs";
import { buildGraph, handoffOf } from "../tools/lib/graph.mjs";
import { handoff, parseGraph, flagOf } from "../tools/lib/handoff.mjs";
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
    ["a pose's speed", (C) => { C.actors.get("pip").def.poses[0].speed = 30; }, /pose's speed/],
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
  // what the editor needs to play the solver's ways: the way turn by turn, each with the state it begins from
  {
    const rp = G.replay, flat = rp.turns.flatMap((/** @type {any} */ x) => x.moves);
    t.ok("graph: the replay holds the winning way turn by turn, from the state the search began in",
      flat.map(describe).join(" > ") === tr.path.map(describe).join(" > ") && rp.turns[0].snap.room === rp.from.room && JSON.stringify(rp.turns[0].snap.state) === JSON.stringify(rp.from.state)
      && rp.turns.every((/** @type {any} */ x) => x.snap?.state && (x.step === null || G.moves.some((m) => m.id === x.step))) && !!rp.end && rp.lost.length === 0 && rp.unhinted.length === 0,
      `${flat.length} moves, path ${tr.path.length}`);
    const tl = await (await makeSolver(await demo((C) => { C.room.get("yard").hotspots.lamp.with.bulb = [{ remove: "bulb" }, "Oops. It broke."]; }), { trace: true })).search({ full: true });
    const lost = buildGraph(/** @type {any} */ (tl), []).replay.lost;
    t.ok("graph: the replay keeps the nearest soft-locks with their states (the bulb broken)", lost.length > 0 && lost.length <= 30 && lost[0].path.some((/** @type {any} */ m) => m.item === "bulb")
      && !(lost[0].snap.state.inv?.pip ?? []).includes("bulb"), JSON.stringify(lost[0]?.path));
  }
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
  const off = await warnsOf((/** @type {any} */ C) => { C.room.get("yard").extras.push({ costume: { idle: "pip_idle_r" }, at: [160, 20] }); });
  t.ok("validate warns: an extra standing outside the walk map", off.some((w) => /extras\.5/.test(w) && /outside the walk map/.test(w)), off.join(" | "));
  t.ok("validate: not for one that stands apart on purpose (the demo's on the crate)", !(await warnsOf()).some((w) => /extras/.test(w)));
  const showIf = await warnsOf((/** @type {any} */ C) => { C.room.get("hall").hotspots.window.use = [{ show: "door" }]; });
  t.ok("validate warns: { show } on a prop with if", showIf.some((w) => /window/.test(w) && /if/.test(w) && /door/.test(w)), showIf.join(" | "));
  t.ok("validate: the demo has no such warning", !(await warnsOf()).some((w) => /prop with if/.test(w)));
  t.ok("graph: the state budget names the once-mark that doubles the states", G.factors.some((f) => f.part === "once:hall.crate.use.0" && Math.abs(f.factor - 2) < 0.01), JSON.stringify(G.factors.slice(0, 3)));

  // ---- the hand-over between acts: the lamp goes on to act2, which is fresh and keeps flags; the window waves (optional)
  const twoActs = (/** @type {string[]} */ keep) => (/** @type {any} */ C) => {
    const lit = C.room.get("yard").hotspots.lamp.with.bulb_clean;
    lit[lit.length - 1] = { act: "next" };
    C.room.get("hall").hotspots.window.use = [{ set: "waved" }, "Hello out there."];
    C.act("act2", { title: "Act 2", room: "hall", actor: "pip", fresh: true, keep, start: C.act.get("act1").start });
  };
  {
    const g = await demo(twoActs(["got_bulb", "never_set", "waved"]));
    await boot(g, { instant: true });
    const v = validate(g.C, { languages: g.options.languages });
    t.ok("validate fails: an act keeps a flag nothing sets", v.issues.some((i) => i.level === "error" && i.where === "act act2.keep" && /keeps "never_set", which nothing sets/.test(i.msg)), JSON.stringify(v.issues.filter((i) => /keep/.test(i.where))));
    t.ok("validate warns: an act keeps a flag nothing tests", v.issues.some((i) => i.level === "warning" && i.where === "act act2.keep" && /"waved"/.test(i.msg)) && !v.issues.some((i) => /"got_bulb"/.test(i.msg)));
    // a flag the game's own code reads (a screen it draws) counts as tested: Cutaway.state.readBy
    {
      const g2 = await demo(twoActs(["got_bulb", "waved"]));
      g2.C.state.readBy("the postcard screen", ["waved"]);
      await boot(g2, { instant: true });
      const v2 = validate(g2.C, { languages: g2.options.languages });
      t.ok("validate: a flag read by the game's code (readBy) is tested, there", !v2.issues.some((i) => /"waved"/.test(i.msg)) && (v2.flags.testedAt.waved ?? []).includes("code the postcard screen") && v2.flags.testedInPlay.has("waved"),
        JSON.stringify(v2.issues.filter((i) => /waved/.test(i.msg))));
    }
    const a2 = v.acts.find((a) => a.id === "act2"), bulb = a2?.keep.find((k) => k.flag === "got_bulb");
    t.ok("validate: a kept flag's values and where it is set and tested", !!bulb && JSON.stringify(bulb.values) === '["true"]' && bulb.setAt.some((w) => /mailbox\.use/.test(w)) && bulb.testedAt.some((w) => /mailbox\.use/.test(w)), JSON.stringify(bulb));
    t.ok("validate: the flags' values, set and tested places", JSON.stringify(v.flags.values.waved) === '["true"]' && v.flags.setAt.waved?.[0] === "room hall.hotspots.window.use.0" && !!v.flags.testedAt.got_key?.length);
    t.ok("validate: the acts' hand-over variants (each kept flag's values and unset; the first act: one)", v.acts[0].variants === 1 && a2?.variants === 4, JSON.stringify(v.acts.map((a) => a.variants)));
    const counted = await demo((/** @type {any} */ C) => { twoActs(["n"])(C); C.room.get("hall").hotspots.window.use = [{ inc: "n" }, { if: "n>=2", then: "Twice." }]; });
    await boot(counted, { instant: true });
    t.ok("validate: a kept flag that counts makes the variants many (null)", validate(counted.C, {}).acts[1].variants === null);
    // leave: what the act leaves behind on purpose, not kept too, set somewhere
    const left = await demo((/** @type {any} */ C) => { twoActs(["got_bulb"])(C); C.act.get("act2").leave = ["got_bulb", "door_open", "nowhere_set"]; });
    await boot(left, { instant: true });
    const lv = validate(left.C, {});
    t.ok("validate fails: a flag both kept and left behind", lv.issues.some((i) => i.level === "error" && i.where === "act act2.leave" && /"got_bulb" is both kept and left/.test(i.msg)), JSON.stringify(lv.issues.filter((i) => /leave/.test(i.where))));
    t.ok("validate warns: a flag left behind that nothing sets", lv.issues.some((i) => i.level === "warning" && i.where === "act act2.leave" && /"nowhere_set"/.test(i.msg)) && !lv.issues.some((i) => /"door_open"/.test(i.msg)));
    t.ok("validate: an act's leave, told as its keep", lv.acts[1].leave.map((k) => k.flag).join(",") === "got_bulb,door_open,nowhere_set" && lv.acts[1].leave[1].setAt.length > 0);
  }
  {
    // a traced search of act1 alone: what it keeps, the next act and what that keeps, its start, its ends projected
    const g = await demo(twoActs(["got_bulb", "waved"]));
    Object.assign(g.options, { act: "act1", demo: { acts: ["act1"] } });
    const rt = await (await makeSolver(g, { trace: true })).search({ full: true });
    const H = handoffOf(g.C, "act1", /** @type {any} */ (rt), []);
    t.ok("graph: the data says the act, its keep, the next act and what it keeps", H.from === "act1" && JSON.stringify(H.keep) === "[]" && H.next === "act2" && JSON.stringify(H.nextKeep) === '["got_bulb","waved"]', JSON.stringify({ ...H, ends: null }));
    t.ok("graph: the start's flags (none in the demo)", Array.isArray(H.start) && H.start.length === 0, JSON.stringify(H.start));
    const ways = H.ends?.projections.map((p) => JSON.stringify(p.flags)).sort().join(" ");
    t.ok("graph: the ends projected onto the next act's keep (waved or not, the bulb always)", !!H.ends && H.ends.wins > 0 && H.ends.variants === 2 && ways === '{"got_bulb":true,"waved":true} {"got_bulb":true}'
      && H.ends.projections.reduce((n, p) => n + p.n, 0) === H.ends.wins, JSON.stringify(H.ends));
    // act2 alone, waved given (as the act before may leave it): it is in its start, and it has no next
    const g2 = await demo(twoActs(["got_bulb", "waved"]));
    Object.assign(g2.options, { act: "act2", demo: { acts: ["act2"] } });
    g2.C.act.get("act2").start = [...g2.C.act.get("act2").start, { set: "waved" }];
    g2.C.act.get("act2").leave = ["door_open"];
    const r2 = await (await makeSolver(g2, { trace: true })).search({ full: true });
    const H2 = handoffOf(g2.C, "act2", /** @type {any} */ (r2), []);
    t.ok("graph: a run's start holds what --set gave it, its leave; the last act has no next", H2.start.includes("waved") && JSON.stringify(H2.leave) === '["door_open"]' && H2.next === null && H2.nextKeep === null && H2.ends?.variants === null, JSON.stringify({ ...H2, ends: H2.ends?.wins }));
  }
  {
    // handoff() on runs made up for it
    const run = (/** @type {any} */ o) => ({ act: o.act, from: o.act, set: o.set ?? [], keep: o.keep ?? null, next: o.next ?? null, nextKeep: o.nextKeep ?? null, start: o.start ?? [],
      ends: o.ends ?? null, states: 10, complete: true,
      moves: (o.moves ?? []).map((/** @type {any} */ m, /** @type {number} */ i) => ({ id: `r|m${i}`, room: "r", move: m.move ?? `act m${i}`, reads: (m.reads ?? []).map((/** @type {string} */ f) => [f, 1]), neg: (m.neg ?? []).map((/** @type {string} */ f) => [f, 1]), writes: m.writes ?? [] })) });
    const acts = [{ id: "a1", fresh: false, keep: [] }, { id: "a2", fresh: true, keep: [{ flag: "k" }] }];
    const a1 = run({ act: "a1", keep: [], next: "a2", nextKeep: ["k"], moves: [{ writes: ["x", "c", "k"] }],
      ends: { wins: 3, variants: 2, projections: [{ flags: { k: true }, n: 2 }, { flags: {}, n: 1 }] } });
    const a2 = run({ act: "a2", keep: ["k"], moves: [{ move: "use door", neg: ["x", "has:key", "~dlg.a"] }] });
    const r1 = handoff([a1, a2], { acts, flags: { set: ["x", "c", "k"], tested: ["x", "c"] } });
    const p2 = r1.acts[1].problems, p1 = r1.acts[0].problems;
    t.ok("handoff: an act reads what an earlier act sets but doesn't keep (an error, with its steps)", r1.errors === 1 && p2.some((p) => p.level === "error" && p.flag === "x" && /earlier act sets, but doesn't keep it/.test(p.msg) && p.at?.[0] === "r: use door"), JSON.stringify(r1.problems));
    t.ok("handoff: a kept flag no run reads and nothing tests, in the last act: kept for nothing", p2.some((p) => p.level === "warning" && p.flag === "k" && /nothing in the game tests/.test(p.msg) && /kept for nothing/.test(p.msg)));
    // ... but the game tests it somewhere (a look that only talks, a drawn screen): an info naming where
    const r1t = handoff([a1, a2], { acts, flags: { set: ["x", "c", "k"], tested: ["x", "c", "k"], testedAt: { k: ["room r.hotspots.bao.look.0"] } } });
    const kt = r1t.acts[1].problems.find((p) => p.flag === "k");
    t.ok("handoff: a kept flag no run reads but the game tests: an info, read where the solver doesn't go", kt?.level === "info" && /where the solver doesn't go: room r\.hotspots\.bao\.look\.0/.test(kt.msg) && !r1t.problems.some((p) => p.flag === "k" && p.level === "warning"), JSON.stringify(r1t.problems));
    // left behind on purpose: no error, an info
    const r1l = handoff([a1, a2], { acts: [acts[0], { ...acts[1], leave: [{ flag: "x" }] }], flags: { set: ["x", "c", "k"], tested: ["x", "c"] } });
    t.ok("handoff: a flag the act leaves behind on purpose is no error (an info)", r1l.errors === 0 && r1l.acts[1].problems.some((p) => p.level === "info" && /left behind on purpose \(leave\): x/.test(p.msg)) && r1l.acts[1].leave.includes("x"), JSON.stringify(r1l.problems));
    const r1lr = handoff([a1, { ...a2, leave: ["x"] }]);
    t.ok("handoff: without the game, leave from the run's data", r1lr.errors === 0, JSON.stringify(r1lr.problems));
    t.ok("handoff: set, tested in the game, read nowhere here, not kept by the next: a consequence that never arrives", p1.some((p) => p.level === "warning" && p.flag === "c" && /never arrives/.test(p.msg)) && !p1.some((p) => p.flag === "k"), JSON.stringify(p1));
    t.ok("handoff: the ways an act hands over", p1.some((p) => p.level === "info" && /in 2 ways/.test(p.msg)) && r1.acts[0].variants?.count === 2);
    t.ok("handoff: other facts and marks aren't flags", flagOf("has:key") === null && flagOf("!door_open") === "door_open" && flagOf("chits=…") === "chits" && !r1.acts[1].reads.includes("~dlg.a"));
    // two runs of a2 (parts shut apart): one writes x, so it is no error; the other reading it is a warning
    const a2w = run({ act: "a2", set: ["off_q"], keep: ["k"], start: ["off_q"], moves: [{ writes: ["x"] }, { reads: ["k"] }] });
    const a2r = run({ act: "a2", set: ["off_p"], keep: ["k"], start: ["off_p"], moves: [{ move: "use door", neg: ["x"] }] });
    const r2 = handoff([a1, a2w, a2r], { acts, flags: { set: ["x", "c", "k"], tested: ["x", "c"] } });
    t.ok("handoff: no error when another run of the same act writes the flag", r2.errors === 0, JSON.stringify(r2.problems));
    t.ok("handoff: a run reads what only another run of its act sets (a warning naming them)", r2.problems.some((p) => p.level === "warning" && p.flag === "x" && /"x" is set only by the run \[off_q\] but read by 1 other run \(\[off_p\]\)/.test(p.msg)), JSON.stringify(r2.problems));
    // four runs reading it: one warning for the flag, counted; the runs and their steps in the data
    const readers = ["p1", "p2", "p3", "p4"].map((n) => run({ act: "a2", set: [`off_${n}`], keep: ["k"], start: [`off_${n}`], moves: [{ move: `look ${n}`, neg: ["x"] }] }));
    const r5 = handoff([a1, a2w, ...readers], { acts, flags: { set: ["x", "c", "k"], tested: ["x", "c"] } });
    const cross = r5.acts[1].problems.filter((p) => p.flag === "x" && p.level === "warning");
    t.ok("handoff: runs reading what only another run sets: one warning per flag, the runs counted", cross.length === 1 && /set only by the run \[off_q\] but read by 4 other runs$/.test(cross[0].msg)
      && cross[0].runs?.length === 4 && JSON.stringify(cross[0].writers) === '["[off_q]"]' && cross[0].detail?.[3]?.at[0] === "r: look p4", JSON.stringify(cross));
    t.ok("handoff: the runs merged by act, in the acts' order", r2.acts.map((a) => `${a.id}:${a.runs.map((x) => x.label).join("")}`).join(" ") === "a1:[all] a2:[off_q][off_p]");
    // without the game: the order from the runs' next, the flags from the runs; the data file's text read back
    const r3 = handoff([a2, a1].map((d) => parseGraph(`window.CUTAWAY_GRAPH = ${JSON.stringify(d)};\n`)));
    t.ok("handoff: without the game, the order from the runs and the same error", r3.acts.map((a) => a.id).join(" ") === "a1 a2" && r3.errors === 1, JSON.stringify(r3.problems));
    // a whole game's run spans acts: left out with a note
    const r4 = handoff([{ ...a1, act: null }]);
    t.ok("handoff: a whole game's run (no --act) is left out, said in a note", r4.notes.length === 1 && r4.acts.every((a) => !a.runs.length));
  }

  // validate: a step with if or once carries only its own keys (the engine does nothing with the others)
  const use = (/** @type {any} */ steps) => (/** @type {any} */ C) => { C.room.get("hall").hotspots.window.use = steps; };
  const stray = await errorsOf(use([{ give: "key", if: "door_open" }, { if: "door_open", than: ["Open."] }, { once: ["Hi."], set: "x" }]));
  t.ok("validate fails: { give, if }, { if, than } and { once, set } (keys an if or a once step doesn't read)",
    stray.some((e) => /use\.0/.test(e) && /give/.test(e)) && stray.some((e) => /use\.1/.test(e) && /than/.test(e)) && stray.some((e) => /use\.2/.test(e) && /set/.test(e)), stray.join(" | "));
  const nul = await errorsOf(use([null, "Hello."]));
  t.ok("validate fails: null in a script (the engine stops there and loses the rest)", nul.some((e) => /use\.0/.test(e) && /null/.test(e)), nul.join(" | "));
  // a once at the same place in an if's then and else (or a once's own and its else) shares one mark
  const twin = await errorsOf(use([{ if: "door_open", then: [{ once: ["A."] }], else: [{ once: ["B."] }] }, { once: [{ once: ["C."] }], else: [{ once: ["D."] }] }]));
  t.ok("validate fails: a once at the same place in then and else, and in a once and its else", twin.filter((e) => /once/.test(e) && /mark/.test(e)).length === 2, twin.join(" | "));
  const apart = await errorsOf(use([{ if: "door_open", then: [{ once: ["A."] }], else: ["B.", { once: ["C."] }] }]));
  t.ok("validate: a once at another place in the else is fine", !apart.some((e) => /once/.test(e)), apart.join(" | "));
  // an act's prologue names a sequence; a hint's act is an act
  const pro = await errorsOf((/** @type {any} */ C) => { C.act.get("act1").prologue = "nope"; });
  t.ok("validate fails: an act's prologue that is no sequence", pro.some((e) => /act1/.test(e) && /prologue/.test(e) && /nope/.test(e)), pro.join(" | "));
  const hintAct = await errorsOf((/** @type {any} */ C) => { C.hints([{ text: "Look around." }], { act: "act9" }); });
  t.ok("validate fails: a hint for an act there isn't", hintAct.some((e) => /hints/.test(e) && /act9/.test(e)), hintAct.join(" | "));
  // "time>=22" compares the minutes of the day with 22: always true in the evening
  const bare = await warnsOf((/** @type {any} */ C) => { C.time.configure({ start: "18:00", end: "02:00" }); C.room.get("hall").hotspots.window.use = [{ if: "time>=22", then: ["Late."] }]; });
  t.ok("validate warns: time compared with a bare number (\"time>=22\": minutes, write 22:00)", bare.some((w) => /time>=22/.test(w) && /22:00/.test(w)), bare.join(" | "));

  // play.mjs: a game that ends before the path does fails (only a demo's end may come early)
  const tmp = mkdtempSync(join(tmpdir(), "cutaway-play-"));
  const pj = join(tmp, "path.json");
  spawnSync(process.execPath, ["tools/solve.mjs", "demo/index.html", "--json", pj, "--workers", "0"], { encoding: "utf8" });
  const solved = JSON.parse(readFileSync(pj, "utf8"));
  writeFileSync(pj, JSON.stringify([...solved, solved[solved.length - 1]]));
  const early = spawnSync(process.execPath, ["tools/play.mjs", "demo/index.html", "--path", pj], { encoding: "utf8" });
  t.ok("play fails: the game ends before the path does (not a demo's end)", early.status !== 0 && /FAIL/.test(early.stdout), early.stdout.split("\n").slice(-4).join(" / "));
  // (a copy of the demo whose act goes on to the next instead of ending the game: played alone, that is the demo's end)
  cpSync(resolve("demo"), join(tmp, "demo"), { recursive: true });
  cpSync(resolve("src"), join(tmp, "src"), { recursive: true });
  const gameJs = join(tmp, "demo", "game.js");
  writeFileSync(gameJs, readFileSync(gameJs, "utf8").replace('{ end: "The lamp shines. Thanks for playing the Cutaway.js demo!" }', '{ act: "next" }'));
  const alone = spawnSync(process.execPath, ["tools/play.mjs", join(tmp, "demo", "index.html"), "--act", "act1", "--path", pj], { encoding: "utf8" });
  t.ok("play: an act played alone may end before the path (the demo's end)", alone.status === 0 && /all passed/.test(alone.stdout), alone.stdout.split("\n").slice(-4).join(" / "));
  // shot.mjs: a page that doesn't load is a failure, and no picture is written
  const png = join(tmp, "none.png");
  const shot = spawnSync(process.execPath, ["tools/shot.mjs", join(tmp, "missing.html"), "--out", png], { encoding: "utf8" });
  t.ok("shot fails: a page that doesn't load (no picture of the error page)", shot.status !== 0 && !existsSync(png), `${shot.status} ${existsSync(png)}`);
  // chrome.mjs: a command gets an answer or an error, never hangs: the page crashed, the browser gone
  const within = (/** @type {Promise<any>} */ p, ms) => Promise.race([p.then(() => "resolved", (e) => "rejected: " + e.message), sleep(ms).then(() => "hung")]);
  const c1 = await launch();
  try {
    await c1.open(pathToFileURL(resolve("demo/index.html")).href + "?manual&act=act1");
    const waiting = c1.ev("new Promise(() => {})");
    c1.send("Page.crash").catch(() => {});
    const r = await within(waiting, 15000);
    t.ok("chrome: a command under way when the page crashes ends with an error", r.startsWith("rejected"), r);
  } finally { await c1.close(); }
  const c2 = await launch();
  try {
    await c2.open(pathToFileURL(resolve("demo/index.html")).href + "?manual&act=act1");
    const waiting = c2.ev("new Promise(() => {})");
    c2.send("Browser.close").catch(() => {});
    const r = await within(waiting, 15000);
    t.ok("chrome: a command under way when the browser goes ends with an error", r.startsWith("rejected"), r);
  } finally { await c2.close(); }
  const c3 = await launch();
  try {
    const r = await within(c3.open("data:text/html,<p>no game here</p>", { timeout: 2000 }), 15000);
    t.ok("chrome: open() fails on a page without the engine", r.startsWith("rejected"), r);
  } finally { await c3.close(); }
  const many = await Promise.allSettled([launch(), launch(), launch(), launch()]);
  t.ok("chrome: four browsers start at once (each its own port)", many.every((m) => m.status === "fulfilled"), many.map((m) => m.status === "rejected" ? m.reason.message : "ok").join(" "));
  for (const m of many) if (m.status === "fulfilled") await m.value.close();
  rmSync(tmp, { recursive: true, force: true });
}
