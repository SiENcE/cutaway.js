// The editor's Sequences tab in headless Chrome on a copy of the demo with the studio: the intro on a timeline (its
// lanes), the picture at a moment the same whether the timeline came to it from its start or from before it, a
// bar's end dragged (the camera drive's length), undo, a step added at the playhead, a camera step's frame
// dragged on the room's map, a caption put in a corner with a click on the picture, Save into the edits layer,
// a new sequence, and the game as it was when the tab is left.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launch, sleep } from "../tools/lib/chrome.mjs";
import { studio } from "../tools/studio.mjs";

export default async function (t) {
  const dir = mkdtempSync(join(tmpdir(), "cutaway-sequences-"));
  cpSync(resolve("demo"), join(dir, "demo"), { recursive: true });
  cpSync(resolve("src"), join(dir, "demo", "src"), { recursive: true });
  const page = join(dir, "demo", "index.html");
  // the game's data in a folder of its own (the studio writes into folders)
  writeFileSync(page, readFileSync(page, "utf8").replace(/\.\.\/src\//g, "src/").replace('src="game.js"', 'src="game/game.js"').replace("</body>", '<script src="layers/edits.js" onerror="0"></script></body>'));
  mkdirSync(join(dir, "demo", "game"));
  renameSync(join(dir, "demo", "game.js"), join(dir, "demo", "game", "game.js"));
  // a comment in the intro's steps: the Sequences tab's changes keep it
  const game = join(dir, "demo", "game", "game.js");
  writeFileSync(game, readFileSync(game, "utf8").replace('      { shot: "hall" },', '      // the house, from the front\n      { shot: "hall" },'));
  writeFileSync(join(dir, "demo", "studio.json"), JSON.stringify({ write: ["layers", "game"], layers: { edits: "layers/edits.js" } }));
  const s = await studio(page, { quiet: true }).start(0);
  const chrome = await launch({ width: 1400, height: 860 });
  const E = "Cutaway.editor", M = `${E}.modules.sequences`;
  const idle = async () => { for (let i = 0; i < 300 && (await chrome.ev(`${M}.busy || Cutaway.timeline.busy`)); i++) await sleep(20); await sleep(60); };
  const steps = () => chrome.ev(`JSON.parse(JSON.stringify(Cutaway.sequence.get("intro").steps))`);
  /** Mouse down at (x, y), moved by (dx, dy) in a few steps, up. Client pixels. */
  const dragBy = async (x, y, dx, dy, mods = 0) => {
    await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1, modifiers: mods });
    for (let i = 1; i <= 4; i++) await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + (dx * i) / 4, y: y + (dy * i) / 4, button: "left", buttons: 1, modifiers: mods });
    await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + dx, y: y + dy, button: "left", buttons: 0, clickCount: 1, modifiers: mods });
  };
  try {
    await chrome.open(`${s.url}index.html?manual&act=act1&edit&studio=${s.token}`);
    for (let i = 0; i < 60 && !(await chrome.ev(`!!(${E} && ${E}.modules.sequences && ${E}.modules.things)`)); i++) await sleep(100);
    const room0 = await chrome.ev("Cutaway.scene.room.id"), flags0 = await chrome.ev("JSON.stringify(Cutaway.state.snapshot())");
    await chrome.ev(`${E}.show("sequences"); 1`);
    await sleep(200);
    await chrome.ev(`${M}.pick("intro")`);
    await idle();
    const lanes = await chrome.ev(`${M}.lanes().map((l) => l.id).join()`);
    t.ok("sequences tab: the intro's lanes (shots, rooms, story, camera, the walker, the screen)", lanes === "shots,rooms,story,camera,prop:walker,screen", lanes);
    t.ok("sequences tab: the timeline sits under the picture", await chrome.ev(`(() => { const b = ${M}.box.getBoundingClientRect(), v = Cutaway.display.view; return b.height > 100 && b.top * v.dpr >= v.area.t + v.area.h - 2; })()`));

    // the picture at a moment: from the start, and from a moment before it, the same pixels
    const pixels = () => chrome.ev("(() => { const b = Cutaway.display.buffer, d = b.getContext('2d').getImageData(0, 0, b.width, b.height).data; let h = 0; for (let i = 0; i < d.length; i += 3) h = (h * 31 + d[i]) | 0; return h; })()");
    await chrome.ev(`${M}.seekTo(5200)`); await idle();
    const a = await pixels(), roomA = await chrome.ev("Cutaway.scene.room.id");
    await chrome.ev(`${M}.seekTo(9800)`); await idle();
    await chrome.ev(`${M}.seekTo(4000)`); await idle();
    await chrome.ev(`${M}.seekTo(5200)`); await idle();
    const b = await pixels();
    await chrome.ev(`${M}.seekTo(200)`); await idle();
    t.ok("sequences tab: a moment looks the same come to from its start or from before it", a === b && roomA === "intro_sky", `${a} ${b} ${roomA}`);

    // Space plays from the playhead in real time, and again holds it
    await chrome.ev(`${M}.seekTo(1000)`); await idle();
    await chrome.key("Space");
    await sleep(700);
    await chrome.key("Space");
    await idle();
    const played = await chrome.ev(`${M}.time`);
    t.ok("sequences tab: Space plays from the playhead, and again holds it", played > 1300 && played < 2500 && !(await chrome.ev("Cutaway.timeline.playing")), String(played));

    // a double click on a bar: the playhead to its start (real clicks: a picked bar is drawn again between them)
    const capBar = await chrome.ev(`(() => { const d = [...${M}.box.querySelectorAll("div[title]")].find((x) => x.title.startsWith("“Outside")); const r = d.getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 }; })()`);
    for (const n of [1, 2]) {
      await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: capBar.x, y: capBar.y, button: "left", buttons: 1, clickCount: n });
      await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: capBar.x, y: capBar.y, button: "left", buttons: 0, clickCount: n });
    }
    await idle();
    const capStart = await chrome.ev(`${M}.trace.steps.find((x) => x.path === "sequence.intro.8").start`);
    t.ok("sequences tab: a click picks a bar, a double click takes the playhead to its start", (await chrome.ev(`${M}.selected`)) === "sequence.intro.8" && Math.abs((await chrome.ev(`${M}.time`)) - capStart) < 20,
      `${await chrome.ev(`${M}.selected`)} ${await chrome.ev(`${M}.time`)} ${capStart}`);

    // the camera drive's bar: its right end dragged 400 ms on
    const S0 = await steps();
    const camBar = await chrome.ev(`(() => { const d = [...${M}.box.querySelectorAll("div[title]")].find((x) => x.title.startsWith("→ [0,120]")); const r = d.getBoundingClientRect(); return { x: r.right - 2, y: r.top + r.height / 2 }; })()`);
    const pps = await chrome.ev(`${M}.pps`);
    await dragBy(camBar.x, camBar.y, pps * 0.4, 0);
    await idle();
    let S = await steps();
    t.ok("sequences tab: a bar's end dragged: its length (the camera's ms) changes", S[7].ms === 3000 && JSON.stringify(S.slice(8)) === JSON.stringify(S0.slice(8)), JSON.stringify(S[7]));
    t.ok("sequences tab: traced again with it", Math.abs((await chrome.ev(`${M}.trace.ms`)) - 10683 - 400) < 60, String(await chrome.ev(`${M}.trace.ms`)));
    await chrome.ev(`${M}.undo()`); await idle();
    S = await steps();
    t.ok("sequences tab: undo", S[7].ms === 2600);

    // a sound added at the playhead, in the yard's wait
    const yardWait = await chrome.ev(`${M}.trace.steps.find((x) => x.path === "sequence.intro.12").start`);
    await chrome.ev(`${M}.seekTo(${yardWait + 200})`); await idle();
    await chrome.ev(`${M}.add({ sfx: "_tick" })`); await idle();
    S = await steps();
    t.ok("sequences tab: a step added at the playhead splits the wait there", JSON.stringify(S.slice(12, 15)) === JSON.stringify([{ wait: 200 }, { sfx: "_tick" }, { wait: 300 }]), JSON.stringify(S.slice(11)));

    // the camera step's frame on the room's map, dragged 20 room pixels up
    await chrome.ev(`${M}.seekTo(4000)`); await idle();
    await chrome.ev(`${M}.select("sequence.intro.7")`); await sleep(300);
    const m = await chrome.ev(`(() => { const c = ${M}.map, r = c.getBoundingClientRect(), k = Number(c.dataset.k), sx = r.width / c.width; return { x: r.left + (2 + 160 * k) * sx, y: r.top + (2 + (120 + 90) * k) * sx, unit: k * sx }; })()`);
    await dragBy(m.x, m.y, 0, -20 * m.unit);
    await idle();
    S = await steps();
    t.ok("sequences tab: the camera's frame dragged on the room's map: its goal", JSON.stringify(S[7].camera) === "[0,100]", JSON.stringify(S[7]));

    // a caption: a click on the picture's top right puts it there
    await chrome.ev(`${M}.select("sequence.intro.8")`); await sleep(100);
    await chrome.mouse("click", 300, 30);
    await idle();
    S = await steps();
    t.ok("sequences tab: a picked caption goes to the corner clicked on the picture", S[8].at === "tr" ? true : S[8].at === "tr", JSON.stringify(S[8]));
    await chrome.ev(`${M}.select("sequence.intro.3")`); await sleep(100);
    await chrome.mouse("click", 300, 30);
    await idle();
    S = await steps();
    t.ok("sequences tab: (another one, from the bottom left)", S[3].at === "tr", JSON.stringify(S[3]));

    // the changes went into the game's file, where the intro is written: only those steps, its comment kept
    const src = await chrome.ev(`${E}.files.text("game/game.js")`);
    const block = src.slice(src.indexOf('Cutaway.sequence("intro"'), src.indexOf("Cutaway.dialog("));
    t.ok("sequences tab: the changes go into the game's file where the sequence is written", await chrome.ev(`${M}.where("intro")`) === "game/game.js" &&
      /\{ camera: \[0, 100\], ms: 2600 \}/.test(block) && /\{ wait: 200 \},\n\s+\{ sfx: "_tick" \},\n\s+\{ wait: 300 \},/.test(block) && /at: "tr"/.test(block) && block.includes("// the house, from the front"), block);
    await chrome.ev(`${M}.save()`);
    await sleep(300);
    const disk = readFileSync(game, "utf8"), lines = (/** @type {string} */ x) => x.split("\n").length;
    // the comment's line, and two more: the wait split round the sound
    t.ok("sequences tab: Save writes the file (only the steps changed)", disk === src && lines(disk) === lines(readFileSync(resolve("demo/game.js"), "utf8")) + 1 + 2, String(lines(disk)));
    // the file changed on the disk after the save: the next change is made on the disk's text (E.files reads it again)
    writeFileSync(game, "// changed on the disk\n" + disk);
    await chrome.ev(`${M}.select("sequence.intro.3")`); await sleep(100);
    await chrome.mouse("click", 20, 170);
    await idle();
    await chrome.ev(`${M}.save()`);
    await sleep(300);
    const disk2 = readFileSync(game, "utf8"), block2 = disk2.slice(disk2.indexOf('Cutaway.sequence("intro"'), disk2.indexOf("Cutaway.dialog("));
    t.ok("sequences tab: a file changed on the disk after a save: the next change goes into the disk's text", disk2.startsWith("// changed on the disk\n") && /at: "bl"/.test(block2), disk2.slice(0, 200));

    // a new sequence of its own: the edits layer
    await chrome.ev(`window.prompt = () => "boat"; ${M}.newSequence(); 1`);
    await idle();
    t.ok("sequences tab: New makes a sequence (a shot in this room) and puts it on the timeline", (await chrome.ev(`Cutaway.sequence.ids().includes("boat") && ${M}.seq === "boat" && ${M}.trace.ms > 2000`)));
    await chrome.ev(`${M}.seekTo(1000)`); await idle();
    await chrome.ev(`${M}.add({ caption: "Somewhere at sea.", ms: 1500, wait: false })`); await idle();
    await chrome.ev(`${M}.save()`);
    await sleep(300);
    const layer = existsSync(join(dir, "demo", "layers", "edits.js")) ? readFileSync(join(dir, "demo", "layers", "edits.js"), "utf8") : "";
    t.ok("sequences tab: its steps are saved in the edits layer", /boat/.test(layer) && /Somewhere at sea/.test(layer) && !/intro:/.test(layer) && /goto: "hall"/.test(layer), layer.slice(300, 1200));

    // the tab left: the game as it was
    await chrome.ev(`${E}.show("room"); 1`);
    await sleep(800);
    t.ok("sequences tab: left, the game is as it was", (await chrome.ev("Cutaway.scene.room.id")) === room0 && !(await chrome.ev("Cutaway.timeline.active")) && !(await chrome.ev("Cutaway.sequence.playing()")),
      `${await chrome.ev("Cutaway.scene.room.id")} ${await chrome.ev("Cutaway.timeline.active")}`);
    const flags1 = JSON.parse(await chrome.ev("JSON.stringify(Cutaway.state.snapshot())")), f0 = JSON.parse(flags0);
    t.ok("sequences tab: and its state", JSON.stringify(flags1.flags) === JSON.stringify(f0.flags) && JSON.stringify(flags1.hidden) === JSON.stringify(f0.hidden));
    t.ok("sequences tab: no page errors", !chrome.errors?.length, JSON.stringify(chrome.errors));
  } finally {
    await chrome.close();
    s.close();
  }
}
