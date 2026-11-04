// Where the one played stands to talk to another actor (ActorDef walkTo, face; src/room.js hotspots): an
// actor's hotspot carries them, so the click walks there (someone behind a counter is talked to from its
// front); without them the hotspot has none (the interface stands beside the actor and turns both).
import { load } from "./load.mjs";

export default async function (t) {
  const C = load(["i18n.js", "state.js", "walk.js", "assets.js", "room.js", "actor.js"]);
  C.display = /** @type {any} */ ({ width: 320, height: 180 });
  C.room("shop", { name: "Shop", walk: [[0, 100, 320, 100, 320, 180, 0, 180]] });
  C.actor("cook", { name: "Cook", room: "shop", at: [200, 130], costume: { idle: "x" }, walkTo: [170, 160], face: "ne" });
  C.actor("kid", { name: "Kid", room: "shop", at: [80, 140], costume: { idle: "x" } });
  await C.scene.load("shop");
  const hs = C.scene.hotspots(), cook = hs.find((h) => h.id === "@cook"), kid = hs.find((h) => h.id === "@kid");
  t.ok("an actor's walkTo and face go to its hotspot", !!cook && cook.def.walkTo?.[0] === 170 && cook.def.walkTo?.[1] === 160 && cook.def.face === "ne", JSON.stringify(cook?.def));
  t.ok("without them, none (the interface stands beside it)", !!kid && kid.def.walkTo === undefined && kid.def.face === undefined);
}
