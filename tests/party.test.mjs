// The party on the demo in Node: following through doors, staying behind, poses that follow the
// game state, taking an actor out of every room, and saves keeping who stays.
import { loadGame, boot } from "../tools/lib/game.mjs";

export default async function (t) {
  const g = loadGame("demo/index.html");
  await boot(g, { instant: true });
  const C = g.C, pip = C.actors.get("pip"), bolt = C.actors.get("bolt");
  C.party.setFollow(true);
  C.state.set("door_open");

  await C.scene.go("yard", [40, 150], "right");
  t.ok("follow: Bolt comes along into the yard", bolt.room === "yard" && C.scene.walkMap.inside({ x: bolt.x, y: bolt.y }), `${bolt.room} ${bolt.x},${bolt.y}`);
  t.ok("follow: he stands beside Pip, not on him", Math.abs(bolt.x - pip.x) >= 8, `${bolt.x} vs ${pip.x}`);

  await C.script.run({ stay: "bolt" });
  await C.scene.go("hall", [284, 132], "left");
  t.ok("stay: Bolt stays in the yard", bolt.room === "yard" && pip.room === "hall");
  const snap = C.save.capture();
  t.ok("stay: saves keep it", snap.party.staying.includes("bolt"));
  await C.script.run({ follow: "bolt" });
  C.party.restore(snap.party);
  t.ok("stay: restored from a save", C.party.isStaying("bolt"));
  await C.script.run({ follow: "bolt" });
  await C.party.switchTo("bolt");
  await C.scene.go("hall", [284, 132], "left");
  t.ok("follow: back together after follow", bolt.room === "hall");

  await C.scene.go("yard", [40, 150], "right", { follow: false });
  t.ok("goto with follow: false goes alone", bolt.room === "yard" && pip.room === "hall");

  C.party.setFollow(false);
  await C.scene.go("hall", [200, 150]);
  t.ok("without follow nobody comes along", pip.room === "hall" && bolt.room === "hall" && C.scene.active.id === "bolt");

  bolt.def.poses = [{ if: "sitting", idle: "pip_idle_r" }];
  t.ok("poses: none while the condition is false", bolt.look().anim === "bolt_idle_r");
  C.state.set("sitting");
  t.ok("poses: the pose while it holds", bolt.look().anim === "pip_idle_r");
  bolt.state = "walk";
  t.ok("poses: states the pose doesn't name keep the costume", bolt.look().anim === "bolt_walk_r");
  bolt.state = "idle";
  delete bolt.def.poses;

  await C.script.run({ place: "pip", room: null });
  t.ok("place room: null takes an actor out of every room", pip.room === null && !C.scene.actorsHere().includes(pip));
  await shared(t);
}

// a shared bag: the party's backpack
export async function shared(t) {
  const g = loadGame("demo/index.html");
  await boot(g, { instant: true });
  const C = g.C;
  C.state.share(["pip", "bolt"]);
  C.state.give("key", "pip");
  t.ok("shared bag: what Pip takes, Bolt has", C.state.has("key", "bolt") && C.state.items("bolt").join() === "key");
  t.ok("shared bag: same bag", C.state.sameBag("pip", "bolt") && !C.state.sameBag("pip", "nobody"));
  C.state.remove("key", "bolt");
  t.ok("shared bag: and it's gone for both", !C.state.has("key", "pip"));
  // a bag of one's own while split off, and back
  C.state.give("map", "pip");
  await C.script.run({ bag: "own", who: "bolt" });
  t.ok("own bag: empty at first, the others keep theirs", C.state.items("bolt").length === 0 && C.state.has("map", "pip") && !C.state.sameBag("pip", "bolt"));
  C.state.give("rope", "bolt");
  t.ok("own bag: what Bolt takes stays his", C.state.has("rope", "bolt") && !C.state.has("rope", "pip"));
  const snap = C.state.snapshot();
  await C.script.run({ bag: "shared", who: "bolt" });
  t.ok("own bag: back in the party's bag, with what he carried", C.state.items("pip").join() === "map,rope" && C.state.sameBag("pip", "bolt"));
  C.state.restore(snap);
  t.ok("own bag: saves keep it", !C.state.sameBag("pip", "bolt") && C.state.items("bolt").join() === "rope");
  C.state.restore({ flags: {}, inv: {}, obj: {}, hidden: {}, visited: {}, once: {} });
  t.ok("own bag: an old save shares again", C.state.sameBag("pip", "bolt"));
}
