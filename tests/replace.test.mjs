// Scripts and the game that is replaced, on the demo in Node with real lines, walks and waits (not `instant`):
// a script under way ends when a save is loaded or the player goes back to the title (Cutaway.script.abort), a
// walk that was taken away is no script's to wait for, and a save never holds a script half-way (a save written
// while one runs is the game just before it; the autosave of a room change waits for the script's end).
import { loadGame, boot } from "../tools/lib/game.mjs";

/** The demo with real time: no act card to click away, no lines on entering the hall. @param {(C: any) => void} [patch] */
async function live(patch) {
  const g = loadGame("demo/index.html"), C = g.C;
  Object.assign(C.act.get("act1"), { title: undefined, name: undefined });
  C.room.get("hall").enter = undefined;
  patch?.(C);
  await boot(g);
  C.clock.onUpdate((/** @type {number} */ dt) => C.scene.update(dt));   // as engine.js does: actors walk, animations play
  C.save.init();                                                        // and the autosave listens (the tools leave it out)
  return C;
}
const turn = () => new Promise((r) => setTimeout(r, 0));
/** Let game time pass, the promise chains going on in between. @param {any} C @param {number} ms */
async function pass(C, ms) { for (let t = 0; t < ms; t += 250) { C.clock.advance(250, false); await turn(); } }
/** Click the lines away until the script under way has ended. @param {any} C */
async function finish(C) { for (let i = 0; i < 80 && C.script.busy; i++) { C.ui.skip(); await pass(C, 250); } }

export default async function (t) {
  // ---- a script under way ends when a save is loaded
  {
    const C = await live(), before = C.save.capture();
    C.script.run(["A line that waits.", { set: "leak" }, { give: "key" }]);
    await turn();
    t.ok("a line is up and its script runs", !!C.ui.line && C.script.busy);
    await C.save.apply(before);
    t.ok("load during a line: the line is gone, no script runs", !C.ui.line && !C.script.busy);
    await pass(C, 6000);
    t.ok("load during a line: the script's later steps never reach the loaded game", !C.state.flag("leak") && !C.state.test("has:key"));
  }
  {
    const C = await live(), before = C.save.capture(), pip = C.actors.get("pip");
    C.script.run([{ walk: [300, 160] }, { set: "leak" }]);
    await pass(C, 500);
    t.ok("a scripted walk is under way", pip.state === "walk" && C.script.busy);
    await C.save.apply(before);
    t.ok("load during a scripted walk: nothing waits for the walk any more", !C.script.busy && pip.state === "idle" && pip.x === before.actors.pip.x);
    await pass(C, 6000);
    t.ok("load during a scripted walk: its later steps never come", !C.state.flag("leak"));
  }
  {
    const C = await live(), before = C.save.capture();
    C.script.run([{ dialog: "bolt" }, { set: "leak" }]);
    await turn();
    t.ok("choices are open", !!C.dialogs.choices && C.script.busy);
    await C.save.apply(before);
    t.ok("load during a dialogue: the choices close, the script ends, nothing leaks", !C.dialogs.choices && !C.script.busy && !C.state.flag("leak"));
  }
  {
    // back to the title (the pause menu ends the scripts first): a goto still to come never loads its room
    const C = await live(), saves = [];
    C.events.on("saved", (/** @type {{slot: any}} */ e) => saves.push(e.slot));
    C.script.run(["A line that waits.", { goto: "yard" }, { set: "leak" }]);
    await turn();
    await C.script.abort();
    await pass(C, 6000);
    t.ok("abort during a line before a goto: the room stays, nothing is autosaved, nothing leaks",
      C.scene.room.id === "hall" && !saves.length && !C.state.flag("leak") && !C.script.busy, `${C.scene.room.id}, saves ${saves.join(",")}`);
    await C.script.run([{ set: "after" }]);
    t.ok("after an abort, scripts run again", C.state.flag("after") === true);
  }

  // ---- what scripts wait for on an actor
  {
    const C = await live(), bolt = C.actors.get("bolt");
    C.script.run([{ place: "bolt", room: "yard", at: [100, 160] }, { walk: "bolt", to: [150, 160] }, { set: "arrived" }]);
    await pass(C, 20000);
    t.ok("a scripted walk of an actor in a room not shown arrives", C.state.flag("arrived") === true && bolt.x === 150 && !C.script.busy, `x ${bolt.x}`);
  }
  {
    const C = await live(), bolt = C.actors.get("bolt");
    C.script.run([{ anim: "bolt:talk", wait: false }, { walk: "bolt", to: [200, 160] }, { set: "walked" }]);
    await pass(C, 20000);
    t.ok("a walk begun while an animation plays (wait: false) starts and arrives", C.state.flag("walked") === true && bolt.x === 200, `x ${bolt.x}, ${bolt.state}`);
  }
  {
    const C = await live(), pip = C.actors.get("pip");
    let walked = false, played = false;
    pip.walkTo(300, 160).then(() => { walked = true; });
    pip.place("hall", 90, 160);
    await turn();
    pip.playOnce("talk").then(() => { played = true; });
    pip.stop();
    await turn();
    t.ok("place ends an awaited walk, stop an awaited animation", walked && played && !pip.onceDone && !pip.arrived.length);
  }
  {
    // a click's walk that is taken away is no arrival: the hotspot's script doesn't run
    const C = await live();
    const clicked = C.ui.interact("plant", "act");
    await pass(C, 250);
    C.actors.get("pip").place("yard", 40, 150);
    await clicked;
    await pass(C, 3000);
    t.ok("a click's walk taken away (the actor put elsewhere) doesn't run the hotspot", !C.state.test("has:leaf") && !C.script.busy);
  }
  {
    // a line a game says while the actor walks to what was clicked (a tip, a remark) doesn't lose the click
    const C = await live();
    const clicked = C.ui.interact("plant", "act");
    await pass(C, 250);
    C.script.run(["A tip, said on the way."]);
    await pass(C, 8000);
    await finish(C);
    await clicked;
    t.ok("a script begun during a click's walk doesn't lose the click", C.state.test("has:leaf") && !C.script.busy);
  }

  // ---- a save never holds a script half-way
  {
    const C = await live();
    C.script.run([{ give: "leaf" }, "A line that waits.", { set: "second_half" }]);
    await turn();
    const mid = C.save.capture(), now = C.save.capture({ live: true });
    t.ok("a save in the middle of a script is the game just before it", !!mid && !Object.values(mid.state.inv).flat().includes("leaf") && C.save.held);
    t.ok("capture({ live }) is the game as it is", Object.values(now.state.inv).flat().includes("leaf"));
    await finish(C);
    const after = C.save.capture();
    t.ok("after the script, a save is the game as it is", !C.save.held && Object.values(after.state.inv).flat().includes("leaf") && after.state.flags.second_half === true);
    await C.save.apply(mid);
    t.ok("loaded, the script hasn't happened: the player stands before the click", !C.state.test("has:leaf") && !C.state.flag("second_half"));
  }
  {
    const C = await live(), saves = [];
    C.events.on("saved", (/** @type {{slot: any}} */ e) => saves.push(e.slot));
    C.script.run([{ goto: "yard" }, { set: "came_through" }, "A line that waits."]);
    await pass(C, 1500);
    t.ok("a goto inside a script: no autosave while the script still runs", C.scene.room.id === "yard" && C.script.busy && !saves.length, `${C.scene.room.id}, saves ${saves.join(",")}`);
    await finish(C);
    const auto = C.save.read("auto");
    t.ok("the autosave comes when the script has ended, with all of it", saves.join() === "auto" && auto?.room === "yard" && auto.state.flags.came_through === true, `saves ${saves.join(",")}`);
  }
  {
    const C = await live();
    C.menu.open();
    const calm = C.menu.rows.some((/** @type {string} */ r) => r === C.i18n.t("@cutaway.menu.hint"));
    C.menu.close();
    C.script.run(["A line that waits."]);
    await turn();
    C.menu.open();
    const during = C.menu.rows.some((/** @type {string} */ r) => r === C.i18n.t("@cutaway.menu.hint"));
    C.menu.close();
    await C.script.abort();
    t.ok("the pause menu offers the hint, but not while a script runs", calm && !during);
  }
}
