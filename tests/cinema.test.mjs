// Cinema (src/core.js tweens, room.js camera, depth, prop moves and plays, cinema.js letterbox and
// captions, fx.js's dissolve order, sequence.js) on the demo in Node with a manual clock: tweens arrive
// in whole pixels, the camera stays where a script put it until the room changes, props move and play
// long animations once, skipping a sequence (to the next shot, or all of it) leaves a sound state, and
// the validator and the atlas builder know the new data.
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import vm from "node:vm";
import { loadGame, boot } from "../tools/lib/game.mjs";
import { validate } from "../tools/lib/validate.mjs";
import { makeSolver } from "../tools/lib/solver.mjs";
import { encode } from "../tools/lib/png.mjs";
import { load } from "./load.mjs";

/** The demo, booted at once, then with real waits and tweens again (the cinema needs time to pass). */
async function demo(patch) {
  const g = loadGame("demo/index.html");
  if (patch) patch(g.C);
  const wait = g.C.clock.wait;
  await boot(g, { instant: true });
  g.C.clock.wait = wait;
  g.C.tween.instant = false;
  g.C.settings.init("cinema-test");
  return g;
}

/** Let game time pass in small steps, letting promise chains go on in between. */
const pass = async (C, ms) => {
  for (let t = 0; t < ms; t += 50) { C.clock.advance(50); await new Promise((r) => setTimeout(r, 0)); }
  await new Promise((r) => setTimeout(r, 0));
};

export default async function (t) {
  {
    const C = load([]);
    const e = C.util.ease("inOut"), lin = C.util.ease("linear");
    t.ok("ease: from 0 to 1, inOut through the middle", e(0) === 0 && Math.abs(e(1) - 1) < 1e-9 && Math.abs(e(0.5) - 0.5) < 1e-9 && lin(0.3) === 0.3);
    t.ok("ease: in starts slow, out ends slow", C.util.ease("in")(0.2) < 0.2 && C.util.ease("out")(0.2) > 0.2);
    let v = -1, first = "";
    const a = C.tween.to({ key: "x", ms: 1000, ease: "linear", step: (k) => { v = k; } }).then(() => { first = "done"; });
    C.clock.advance(500);
    t.ok("tween: half way after half the time", Math.abs(v - 0.5) < 0.05, String(v));
    C.tween.to({ key: "x", ms: 100, step: () => {} });
    await a;
    t.ok("tween: a new one with the same key replaces it (the old one resolves)", first === "done" && C.tween.count === 1);
    C.tween.finish();
    t.ok("tween: finish lets them arrive", C.tween.count === 0);
    C.tween.instant = true;
    let w = 0;
    await C.tween.to({ ms: 5000, step: (k) => { w = k; } });
    t.ok("tween: instant arrives at once (tools, skips)", w === 1);
  }

  {
    const { C } = await demo();
    // the camera: tilt down a room taller than the screen, clamped, whole pixels, not overridden
    await C.scene.load("intro_sky");
    t.ok("camera: starts at the top left without the actor in the room", C.scene.camera.x === 0 && C.scene.camera.y === 0);
    const done = C.script.run({ camera: [40, 500], ms: 1000 });
    await pass(C, 400);
    const mid = { ...C.scene.camera };
    t.ok("camera: moving in whole pixels", mid.y > 0 && mid.y < 120 && Number.isInteger(mid.y) && mid.x === 0, JSON.stringify(mid));
    await pass(C, 700);
    await done;
    t.ok("camera: kept inside the room (300 high: 120 at most)", C.scene.camera.y === 120 && C.scene.camera.x === 0, JSON.stringify(C.scene.camera));
    C.scene.update(16); C.scene.update(16);
    t.ok("camera: following the actor doesn't take it back", C.scene.camera.y === 120 && C.scene.cameraScripted);

    // depth: the lamp post (1.4) shifts against the camera; the hills (1) don't
    const post = C.room.get("intro_sky").props.find((p) => p.id === "post"), hills = C.room.get("intro_sky").props.find((p) => p.id === "hills");
    const pb = C.scene.propBox(post), hb = C.scene.propBox(hills);
    t.ok("depth: a foreground (1.4) is drawn at at - camera * depth", pb[1] === 348 - 66 - 48 && hb[1] === 120, JSON.stringify([pb, hb]));
    t.ok("depth: 0 stays on the screen", (() => { post.depth = 0; const b = C.scene.propBox(post); post.depth = 1.4; return b[1] - C.scene.camera.y === 348 - 66; })());

    // moving a prop: to and by, whole pixels on the screen, not kept when the room is entered again
    const moved = C.script.run({ move: "walker", to: [100, 278], ms: 1000, ease: "linear" });
    await pass(C, 500);
    const half = C.scene.propAt("walker"), box = C.scene.propBox(C.room.get("intro_sky").props.find((p) => p.id === "walker"));
    t.ok("move: half way, drawn in whole pixels", half.x > 30 && half.x < 50 && Number.isInteger(box[0]), JSON.stringify(half));
    await pass(C, 600);
    await moved;
    await C.script.run({ move: "walker", by: [10, -8] });
    t.ok("move: to, then by", C.scene.propAt("walker").x === 110 && C.scene.propAt("walker").y === 270);
    await C.scene.load("intro_sky");
    t.ok("leaving the room: the camera follows again, props are back", !C.scene.cameraScripted && C.scene.camera.y === 0 && C.scene.propAt("walker").x === -20);
    await C.script.run({ camera: [0, 60] });
    await C.script.run({ camera: "follow" });
    t.ok("camera: follow gives it back", !C.scene.cameraScripted && C.scene.camera.y === 0);

    // a long animation played once on a prop: the script waits it out, then it holds the last frame
    C.assets.anim("take", { image: "yard_bg", loop: true, frames: Array.from({ length: 300 }, (_, i) => [i % 2, 0, 10, 10, 1000 / 12]) });
    const a = C.assets.get("take");
    let played = false;
    const p = C.script.run({ play: "post", anim: "take" }).then(() => { played = true; });
    await pass(C, 20000);
    t.ok("play: 300 frames at 12 a second take 25 s", !played && Math.abs(a.total - 25000) < 1);
    await pass(C, 5200);
    await p;
    t.ok("play: the script waited until it played through", played);
    t.ok("play: once, it holds its last frame (the data loops)", C.assets.frameAt(a, 999999, false) === a.frames[299] && C.assets.frameAt(a, 25000 + 1000 / 12 / 2) !== a.frames[299]);
    t.ok("play: the prop shows the animation", C.scene.props().find((q) => q.def.id === "post").image === "take");

    // letterbox: 2.39:1 is 23 px on 320x180; a height; away
    const lb = C.script.run({ letterbox: true, ms: 400 });
    await pass(C, 200);
    const barsMid = C.cinema.bars;
    await pass(C, 300);
    await lb;
    t.ok("letterbox: slides in to 23 px (2.39:1)", barsMid > 0 && barsMid < 23 && C.cinema.bars === 23, `${barsMid} ${C.cinema.bars}`);
    await C.script.run({ letterbox: 10 });
    const ten = C.cinema.bars;
    await C.script.run({ letterbox: false });
    t.ok("letterbox: a height, then away", ten === 10 && C.cinema.bars === 0);

    // captions: typed letter by letter with a blip, inside the picture, held, then gone
    let blips = 0;
    C.events.on("sfx", (s) => { if (s.sfx === "_tick") blips++; });
    await C.script.run({ letterbox: true });
    let shown = false;
    const cap = C.script.run({ caption: "Hello there", at: "bl", type: true, blip: "_tick", speed: 10, ms: 1000 }).then(() => { shown = true; });
    await pass(C, 500);
    const typing = C.cinema.caption;
    t.ok("caption: types in", typing && typing.shown > 2 && typing.shown < 11, JSON.stringify(typing));
    await pass(C, 800);
    const whole = C.cinema.caption;
    t.ok("caption: bottom left, inside the bars", whole && whole.shown === 11 && whole.x === 6 && whole.y + 9 <= 180 - 23 - 4, JSON.stringify(whole));
    t.ok("caption: a blip per letter", blips >= 8 && blips <= 10, String(blips));
    await pass(C, 1100);
    await cap;
    t.ok("caption: held for ms, then gone", shown && C.cinema.caption === null);
    await C.script.run({ caption: "Top right", at: "tr" });
    const tr = C.cinema.caption;
    await C.script.run({ caption: false });
    t.ok("caption: top right; false clears it", tr && tr.y === 23 + 6 && tr.x + tr.w === 320 - 6 && C.cinema.caption === null, JSON.stringify(tr));
    C.cinema.reset();

    // the dissolve's order: every 4x4 block loses one old pixel per step, 16 steps, no blends
    const kept = (step) => { let n = 0; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) n += C.fx.dissolveKeeps(x, y, step) ? 1 : 0; return n; };
    t.ok("dissolve: 16 steps, one pixel of each 4x4 block at a time", [...Array(17).keys()].every((s) => kept(s) === 16 - s));
    t.ok("dissolve: inactive in the Node tools", !C.fx.active && !C.fx.dissolving);
  }

  {
    // a sequence: shots, skip to the next shot, skip all (after), the scene back as it was
    const { C } = await demo((C) => {
      C.sequence("film", {
        steps: [{ shot: "a" }, { goto: "intro_sky" }, { letterbox: true }, { camera: [0, 120], ms: 2000 }, { wait: 3000 }, { set: "saw_a" },
          { shot: "b" }, { goto: "yard" }, { caption: "Later.", ms: 2000 }, { wait: 4000 }, { set: "saw_b" }, { shot: "c" }, { wait: 5000 }, { set: "saw_c" }],
        after: [{ set: "skipped" }],
      });
    });
    const shots = [], ends = [];
    C.events.on("sequence.shot", (e) => shots.push(e.shot));
    C.events.on("sequence.end", (e) => ends.push(e));
    const pip = C.actors.get("pip"), at = [pip.room, pip.x, pip.y];
    localStorage_clear(C);
    const film = C.sequence.play("film");
    await pass(C, 500);
    t.ok("sequence: plays as a cutscene, rooms are shots", C.sequence.playing() === "film" && C.ui.cutscene && C.scene.filming && C.scene.room.id === "intro_sky" && C.script.busy);
    t.ok("sequence: a shot has nothing to click, nobody is moved there", C.scene.hotspots().length === 0 && pip.room === at[0] && pip.x === at[1]);
    C.sequence.next();
    await pass(C, 100);
    t.ok("sequence: skip to the next shot (the steps between ran, quickly)", shots.join() === "a,b" && C.state.flag("saw_a") && C.scene.room.id === "yard" && !C.state.flag("saw_b") && C.cinema.bars === 23, shots.join());
    t.ok("sequence: back to normal speed at the shot", !C.script.fast && !C.tween.instant);
    await pass(C, 1000);
    t.ok("sequence: the next shot plays at its pace", C.cinema.caption?.text === "Later." && !C.state.flag("saw_b"));
    t.ok("sequence: no autosave of a shot", C.save.read("auto")?.room !== "yard");
    C.sequence.skip();
    await film;
    t.ok("sequence: Esc stops it where it is and runs `after`", !C.state.flag("saw_b") && !C.state.flag("saw_c") && C.state.flag("skipped") && ends[0]?.skipped === true);
    t.ok("sequence: then everything is as before", !C.sequence.playing() && !C.ui.cutscene && !C.scene.filming && C.scene.room.id === "hall" && C.cinema.bars === 0 && !C.cinema.caption && !C.scene.cameraScripted && !C.script.busy);
    const done = C.sequence.play("film");
    await pass(C, 20000);
    await done;
    t.ok("sequence: played through, every step ran and `after` didn't", C.state.flag("saw_c") && ends[1]?.skipped === false && shots.slice(2).join() === "a,b,c");
    t.ok("sequence: settings remember what was seen (not reset with the settings)", (() => { C.settings.markSeen("film"); C.settings.reset(); return C.settings.seen("film") && !C.settings.seen("other"); })());
  }

  {
    // the validator: sequences, the new actions, intro and gate
    const errorsOf = async (patch, opts = {}) => {
      const g = loadGame("demo/index.html");
      patch(g.C);
      await boot(g, { instant: true });
      return validate(g.C, { languages: g.options.languages, ...g.options, ...opts }).issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.msg}`);
    };
    const seq = (steps) => (C) => C.sequence("bad", { steps });
    const broken = [
      ["unknown sequence", (C) => { C.room.get("hall").hotspots.window.use = [{ sequence: "flashback" }]; }, null, /unknown sequence "flashback"/],
      ["unknown intro", () => {}, { intro: "opening" }, /intro: unknown sequence "opening"/],
      ["gate in an unknown room", () => {}, { gate: { room: "vcr" } }, /gate.room: unknown room "vcr"/],
      ["move an unknown prop", seq([{ goto: "yard" }, { move: "crate", to: [1, 2] }]), null, /unknown prop "crate" in room "yard"/],
      ["move needs a target", seq([{ goto: "hall" }, { move: "crate" }]), null, /move needs to/],
      ["shot in an unknown room", seq([{ goto: "attic" }]), null, /unknown room "attic"/],
      ["caption place", seq([{ caption: "Hi", at: "middle" }]), null, /unknown caption place "middle"/],
      ["caption blip", seq([{ caption: "Hi", type: true, blip: "tock" }]), null, /unknown sound "tock"/],
      ["camera ease", seq([{ camera: [0, 10], ease: "bounce" }]), null, /unknown ease "bounce"/],
      ["unknown transition", seq([{ goto: "yard", transition: "wipe" }]), null, /unknown transition "wipe"/],
      ["letterbox", seq([{ letterbox: "wide" }]), null, /letterbox is true, false/],
      ["play an unknown animation", seq([{ goto: "yard" }, { play: "lamp", anim: "lamp_flicker" }]), null, /unknown image or animation "lamp_flicker"/],
    ];
    for (const [name, patch, opts, re] of broken) {
      const errs = await errorsOf(patch, opts ?? {});
      t.ok(`validate fails: ${name}`, errs.some((e) => re.test(e)), errs.join(" | ") || "no errors");
    }
    const g = loadGame("demo/index.html");
    await boot(g, { instant: true });
    const all = validate(g.C, { languages: g.options.languages, ...g.options }).issues;
    t.ok("validate: the demo's intro, its shot room and gate are fine (no walk area needed)", !all.some((i) => /intro_sky|sequence|gate|intro/.test(i.where)), all.map((i) => i.where + ": " + i.msg).join(" | "));
  }

  {
    // the solver: a sequence played from a hotspot runs at once (its flags count), and the game is
    // back in its room after it; the intro itself is never part of the search
    const g = loadGame("demo/index.html");
    g.C.room.get("hall").hotspots.window.use = [{ sequence: "intro" }, { set: "saw_film" }, "Nice."];
    g.C.hints([...g.C.hints.all()]);
    const r = await (await makeSolver(g)).search({ full: true });
    t.ok("solve: a sequence in a script runs at once and leaves the game where it was", r.solved && r.complete && r.softlocks.length === 0, `${r.states} states`);
    await g.C.script.run({ sequence: "intro" });
    t.ok("solve: after it, the room and the actor are as before", g.C.scene.room.id === "hall" && g.C.scene.active.room === "hall" && !g.C.sequence.playing());
  }

  {
    // the atlas builder: an animation too big for a page goes frame by frame over several pages
    const dir = path.resolve("out/test-long-anim"), animDir = path.join(dir, "anims");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(animDir, { recursive: true });
    const n = 40, fw = 60, fh = 40, data = new Uint8Array(n * fw * fh * 4);
    for (let i = 0; i < n; i++) for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const o = (y * n * fw + i * fw + x) * 4, k = i < 10 ? 0 : i;     // the first ten frames are the same (black)
      data.set([k * 6, 255 - k * 6, (x + y) % 255, 255], o);
    }
    writeFileSync(path.join(animDir, "take.png"), encode({ width: n * fw, height: fh, data }));
    writeFileSync(path.join(animDir, "take.json"), JSON.stringify({ frames: Array.from({ length: n }, (_, i) => ({ frame: { x: i * fw, y: 0, w: fw, h: fh }, duration: 83 })) }));
    const out = path.join(dir, "take.js");
    execFileSync(process.execPath, ["tools/build-atlas.mjs", dir, out, "--max", "256"], { stdio: "pipe" });
    const ctx = vm.createContext({ Cutaway: { assets: { pack: (p) => { ctx.pack = p; } } } });
    vm.runInContext(readFileSync(out, "utf8"), ctx);
    const anim = ctx.pack.anims.take, pages = Object.keys(ctx.pack.images);
    const frames = anim?.frames ?? [];
    const onPages = new Set(frames.map((f) => f[5] ?? anim.image));
    t.ok("atlas: a long animation keeps all its frames, over several pages", frames.length === n && pages.length > 1 && onPages.size > 1, `${frames.length} frames on ${onPages.size} of ${pages.length} pages`);
    t.ok("atlas: frames that are the same are packed once", JSON.stringify(frames[0]) === JSON.stringify(frames[9]) && JSON.stringify(frames[9]) !== JSON.stringify(frames[10]));
    const A = load(["assets.js"]);
    A.assets.anim("take", { image: anim.image, frames: anim.frames });
    const a = A.assets.get("take");
    t.ok("assets: a frame names its page", a.frames.some((f) => f.image && f.image !== anim.image) && Math.abs(a.total - n * 83) < 1);
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The vm's localStorage: start without an autosave. @param {any} C */
function localStorage_clear(C) { C.save.remove("auto"); }
