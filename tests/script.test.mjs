// Unit tests for src/state.js (conditions, inventory) and src/script.js (the action runner),
// with a stub scene, actors and UI.
import { load } from "./load.mjs";

export default async function (t) {
  const C = load(["i18n.js", "state.js", "script.js"]);
  const said = [];
  const actor = { id: "pip", room: "hall", x: 0, y: 0, face(f) { this.facing = f; }, walkTo(x, y) { this.x = x; this.y = y; return Promise.resolve(); },
    place(room, x, y) { this.room = room; this.x = x; this.y = y; } };
  C.scene = { room: { id: "hall" }, active: actor, go: async (id) => { C.scene.room = { id }; actor.room = id; } };
  C.actors = { get: (id) => (id === "pip" ? actor : null) };
  C.ui = { say: async (a, text) => { said.push(a.id + ": " + text); }, narrate: async (text) => { said.push("* " + text); } };

  const S = C.state;
  S.set("lamp"); S.set("count", 3); S.give("key");
  t.ok("flag", S.test("lamp") && !S.test("!lamp") && !S.test("nope"));
  t.ok("flag value", S.test("count=3") && !S.test("count=4"));
  t.ok("has", S.test("has:key") && !S.test("has:map"));
  t.ok("and (array)", S.test(["lamp", "has:key"]) && !S.test(["lamp", "has:map"]));
  t.ok("or / not", S.test({ or: ["nope", "lamp"] }) && S.test({ not: "nope" }));
  t.ok("is / at", S.test("is:pip") && S.test("at:pip=hall") && !S.test("at:pip=yard"));
  S.setObjState("door", "open");
  t.ok("state of an object (current room)", S.test("state:door=open") && S.test("state:hall/door=open") && !S.test("state:yard/door=open"));
  let threw = false; try { S.test("bogus:x"); } catch { threw = true; }
  t.ok("unknown condition throws", threw);

  await C.script.run(["Hello.", { say: "pip", text: "Me again." }, { narrate: "Later..." }]);
  t.ok("say and narrate", said.join("|") === "pip: Hello.|pip: Me again.|* Later...", said.join("|"));

  said.length = 0;
  await C.script.run([{ if: "has:key", then: ["yes"], else: ["no"] }, { if: "has:map", then: ["yes"], else: ["no"] }]);
  t.ok("if / then / else", said.join() === "pip: yes,pip: no", said.join());

  said.length = 0;
  const twice = [{ once: ["first"], else: ["again"] }];
  await C.script.run(twice, { path: "hall.x.use" });
  await C.script.run(twice, { path: "hall.x.use" });
  t.ok("once runs once, else after", said.join() === "pip: first,pip: again", said.join());

  await C.script.run([{ take: "map" }, { remove: "key" }, { inc: "count", by: 2 }, { unset: "lamp" }, { hide: "plant" }], { hotspot: "frame" });
  t.ok("take gives and hides its hotspot", S.has("map") && S.isHidden("frame"));
  t.ok("remove, inc, unset, hide", !S.has("key") && S.flag("count") === 5 && !S.test("lamp") && S.isHidden("plant"));

  await C.script.run([{ walk: [50, 60], face: "left" }, { goto: "yard" }]);
  t.ok("walk and goto", actor.x === 50 && actor.facing === "left" && C.scene.room.id === "yard");

  const walkTo = actor.walkTo;
  actor.walkTo = () => new Promise(() => {});                 // a walk that never arrives
  const bg = await Promise.race([C.script.run([{ walk: "pip", to: [90, 60], wait: false }, { set: "went_on" }]).then(() => "done"),
    new Promise((r) => setTimeout(() => r("stuck"), 50))]);
  actor.walkTo = walkTo;
  /** @type {any[]} */
  let args = [];
  actor.walkTo = (...a) => { args = a; return Promise.resolve(); };
  await C.script.run([{ walk: "pip", to: [70, 60], free: true, run: true }]);
  t.ok("a free walk asks the actor to ignore the walk map", args[0] === 70 && args[2] === true && args[3] === true);
  actor.walkTo = walkTo;
  t.ok("walk with wait: false goes on at once", bg === "done" && S.test("went_on"));

  C.script.action("beep", (s) => { said.push("beep " + s.beep); });
  said.length = 0;
  await C.script.run({ beep: 3 });
  t.ok("custom action", said.join() === "beep 3");

  const snap = S.snapshot(); S.reset();
  t.ok("reset clears", !S.has("map"));
  S.restore(snap);
  t.ok("snapshot / restore", S.has("map") && S.flag("count") === 5);

  C.i18n.table("en", { "door.locked": "Locked." }); C.i18n.table("de", { "door.locked": "Zu.", "Hello.": "Hallo." });
  t.ok("i18n keys and fallback", C.i18n.t("@door.locked") === "Locked." && C.i18n.t("@missing") === "missing");
  C.i18n.setLanguage("de");
  t.ok("i18n by source text", C.i18n.t("Hello.") === "Hallo." && C.i18n.t("@door.locked") === "Zu.");
}
