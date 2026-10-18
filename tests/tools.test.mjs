// The game tools on the demo: validate passes, broken references fail; solve finds the end, an
// unsolvable variant fails and a soft-lock is found.
import { loadGame, boot } from "../tools/lib/game.mjs";
import { validate } from "../tools/lib/validate.mjs";
import { makeSolver } from "../tools/lib/solver.mjs";

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

  const s2 = await makeSolver(await demo((C) => { C.room.get("hall").hotspots.shelf.use[0].then[0].then[0] = { set: "nothing" }; }));
  t.ok("solve: no key, no end", !(await s2.search()).solved);

  const s3 = await makeSolver(await demo((C) => { C.room.get("yard").hotspots.lamp.with.bulb = [{ remove: "bulb" }, "Oops. It broke."]; }));
  const r3 = await s3.search({ full: true });
  t.ok("solve: a soft-lock is found", r3.solved && r3.softlocks.length > 0, `${r3.softlocks.length} soft-locks`);
}
