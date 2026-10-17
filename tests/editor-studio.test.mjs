// The editor with the studio, in headless Chrome on a copy of the demo: the tabs load, the Texts tab
// lists the game's texts, a changed text shows in the game at once and is saved through the studio as
// the language's text layer, which gives the same text when loaded again; the Checks tab runs a task.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { launch, sleep } from "../tools/lib/chrome.mjs";
import { studio } from "../tools/studio.mjs";
import { load } from "./load.mjs";

export default async function (t) {
  // a copy of the demo with the engine beside it (the page loads ../src/)
  const dir = mkdtempSync(join(tmpdir(), "cutaway-editor-"));
  cpSync(resolve("demo"), join(dir, "demo"), { recursive: true });
  cpSync(resolve("src"), join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "demo", "studio.json"), JSON.stringify({ write: ["texts", "layers", "art"], layers: { texts: "texts/{lang}.texts.js", edits: "layers/edits.js", sounds: "layers/sounds.edit.js",
    art: "art/import", artAtlas: "layers/imported.js" },
    tasks: { hello: ["node", "-e", "console.log('checked')"], "art: imported": ["node", resolve("tools", "build-atlas.mjs"), "art/import", "layers/imported.js"] },
    palette: ["art/palette.txt"] }));
  mkdirSync(join(dir, "demo", "art"), { recursive: true });
  writeFileSync(join(dir, "demo", "art", "palette.txt"), 'skin: "#f0c8a0", shade: "#3a2a4a"');
  const page = join(dir, "demo", "index.html");
  writeFileSync(page, readFileSync(page, "utf8").replace(/\.\.\/src\//g, "src/"));
  cpSync(join(dir, "src"), join(dir, "demo", "src"), { recursive: true });
  cpSync(resolve("tools", "lib", "validate.mjs"), join(dir, "demo", "src", "tools", "lib", "validate.mjs"));   // where the Issues tab looks (Cutaway.base)
  const s = await studio(page, { quiet: true }).start(0);
  const chrome = await launch({ width: 1400, height: 800 });
  try {
    await chrome.open(`${s.url}index.html?manual&act=act1&edit&studio=${s.token}`);
    for (let i = 0; i < 60 && !(await chrome.ev("!!(Cutaway.editor && Cutaway.editor.modules.texts && Cutaway.editor.studio.available)")); i++) await sleep(100);
    t.ok("editor: the tab modules load and the studio is there", await chrome.ev("!!Cutaway.editor.modules.texts && Cutaway.editor.studio.available"));
    const texts = await chrome.ev("Cutaway.editor.modules.texts.collect().map((x) => x.text)");
    t.ok("texts: the game's texts are listed", texts.includes("Clouds. Lots of them.") && texts.includes("Hall") && texts.length > 40, String(texts.length));
    await chrome.ev(`Cutaway.editor.modules.texts.set("Clouds. Lots of them.", "en", "Rain clouds, lots of them.")`);
    t.ok("texts: a change shows in the game at once", (await chrome.ev(`Cutaway.i18n.t("Clouds. Lots of them.")`)) === "Rain clouds, lots of them.");
    await chrome.ev("Cutaway.editor.modules.texts.save()");
    const file = readFileSync(join(dir, "demo", "texts", "en.texts.js"), "utf8");
    const C = load(["i18n.js", "assets.js"]);
    vm.runInContext(file, vm.createContext({ Cutaway: C }));
    t.ok("texts: saved through the studio as the text layer", C.i18n.t("Clouds. Lots of them.") === "Rain clouds, lots of them.", file);
    const csv = await chrome.ev(`Cutaway.editor.modules.texts.parseCsv('where,text,en\\n"a, b","x ""y""",z')`);
    t.ok("texts: CSV with quotes and commas", JSON.stringify(csv) === JSON.stringify([["where", "text", "en"], ["a, b", 'x "y"', "z"]]));
    // Things: a change shows at once and saves as the edits layer, which gives it back when loaded
    await chrome.ev(`Cutaway.editor.modules.things.change("prop:crate", { path: "flip", type: "bool" }, true)`);
    t.ok("things: a change shows in the game", await chrome.ev(`Cutaway.room.get("hall").props.find((p) => p.id === "crate").flip === true`));
    await chrome.ev("Cutaway.editor.modules.things.save()");
    const edits = readFileSync(join(dir, "demo", "layers", "edits.js"), "utf8");
    const C2 = load(["i18n.js", "state.js", "walk.js", "assets.js", "room.js", "actor.js", "inventory.js", "layers.js"]);
    C2.room("hall", { props: [{ id: "crate", image: "crate", at: [0, 0] }] });
    vm.runInContext(edits, vm.createContext({ Cutaway: C2 }));
    t.ok("things: the edits layer gives the change back", C2.room.get("hall").props[0].flip === true, edits);
    // Sound: a new synthesised sound saved in the sounds layer
    await chrome.ev(`Cutaway.editor.modules.sound.define("beep2", { tone: { wave: "square", from: 880, ms: 80 } }); 1`);
    await chrome.ev("Cutaway.editor.modules.sound.save()");
    const sounds = readFileSync(join(dir, "demo", "layers", "sounds.edit.js"), "utf8");
    const C3 = load(["i18n.js", "assets.js", "audio.js", "music/synth.js", "music/sequencer.js", "sfx.js"]);
    vm.runInContext(sounds, vm.createContext({ Cutaway: C3 }));
    t.ok("sound: a new sound saved as the sounds layer", C3.sfx.get("beep2")?.tone?.from === 880, sounds);
    // Art: a PNG made in the page, imported over a sprite, is in the game at once
    const imported = await chrome.ev(`(async () => {
      const c = document.createElement("canvas"); c.width = 8; c.height = 4; const g = c.getContext("2d"); g.fillStyle = "#f00"; g.fillRect(0, 0, 8, 4);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      await Cutaway.editor.modules.art.readImport(new File([blob], "crate.png", { type: "image/png" }));
      const p = Cutaway.editor.modules.art.pending; p.name = "crate"; p.frames = 2; Cutaway.editor.modules.art.apply();
      await new Promise((r) => setTimeout(r, 100));
      const a = Cutaway.assets.get("crate"); return a.frames.length + "x" + a.frames[0].w;
    })()`);
    t.ok("art: an import shows in the game at once (2 frames of 4 px)", imported === "2x4", imported);
    // Paint: a cut-out (its room position as an explicit anchor) painted, saved as an import with its
    // anchor and packed; then reverted: the files go and the atlas is packed without it
    await chrome.ev(`(() => { const a = Cutaway.assets.get("plant"), f = a.frames[0];
      Cutaway.assets.anim("hall_cut", { image: a.image, frames: [[f.x, f.y, f.w, f.h, 100]], anchor: [-10, -20] }); return 1; })()`);
    await chrome.ev("Cutaway.editor.modules.paint.open('hall_cut'); Cutaway.editor.modules.paint.setColors('#ff00ff'); 1");
    await sleep(300);
    const c = await chrome.ev("Cutaway.editor.modules.paint.clientOf(1, 1)");
    await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
    await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", buttons: 1, clickCount: 1 });
    await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", buttons: 0, clickCount: 1 });
    const pal = await chrome.ev("(() => { const b = document.createElement('div'); Cutaway.editor.modules.paint.inspector(b); return new Promise((r) => setTimeout(() => { const b2 = document.createElement('div'); Cutaway.editor.modules.paint.inspector(b2); r(b2.textContent.includes('game palette') && !!b2.querySelector('[title^=\"game palette: #f0c8a0\"]')); }, 300)); })()");
    t.ok("paint: the game palette from studio.json's files", pal === true);
    await chrome.ev("Cutaway.editor.modules.paint.save()");
    const imp = join(dir, "demo", "art", "import", "sprites");
    const anchor = existsSync(join(imp, "hall_cut.anchor.json")) ? JSON.parse(readFileSync(join(imp, "hall_cut.anchor.json"), "utf8")).anchor : null;
    const packed = existsSync(join(dir, "demo", "layers", "imported.js")) ? readFileSync(join(dir, "demo", "layers", "imported.js"), "utf8") : "";
    t.ok("paint: Save writes the import with its anchor and packs it", existsSync(join(imp, "hall_cut.png")) && JSON.stringify(anchor) === "[-10,-20]"
      && /"hall_cut": \{ image: "imported_atlas", frames: \[\[[\d, ]+\]\], anchor: \[-10,-20\] \}/.test(packed), packed.slice(-300));
    t.ok("paint: the art list marks it as imported", await chrome.ev("Cutaway.editor.modules.art.isImported('hall_cut') && !Cutaway.editor.modules.art.isImported('plant')"));
    await chrome.ev("Cutaway.editor.modules.paint.revert('hall_cut', false)");
    const repacked = readFileSync(join(dir, "demo", "layers", "imported.js"), "utf8");
    t.ok("paint: Revert removes the import files and packs again", !existsSync(join(imp, "hall_cut.png")) && !existsSync(join(imp, "hall_cut.anchor.json")) && !repacked.includes("hall_cut")
      && await chrome.ev("!Cutaway.editor.modules.art.isImported('hall_cut')"));
    // Issues: the validator in the page, on the live data
    await chrome.ev("Cutaway.editor.modules.issues.check()");
    const issues = await chrome.ev("Cutaway.editor.modules.issues.issues");
    t.ok("issues: the validator runs in the page", Array.isArray(issues), String(issues));
    // State: go to another room with the active actor
    await chrome.ev(`Cutaway.editor.show("state"); 1`);
    await sleep(200);
    t.ok("state: the tab builds", await chrome.ev("!!document.querySelector('.cutaway-editor')"));
    // help: both guides, cut into sections; F1 opens the section of the tab; search finds and marks words
    await chrome.ev(`Cutaway.editor.show("sound"); 1`);
    await chrome.ev(`window.dispatchEvent(new KeyboardEvent("keydown", { code: "F1" })); 1`);
    await sleep(200);
    t.ok("help: F1 opens the section of the tab", JSON.stringify(await chrome.ev("Cutaway.editor.modules.help.at")) === JSON.stringify(["editor", "sound"]) && await chrome.ev("Cutaway.editor.activeTab") === "help");
    const books = await chrome.ev("Cutaway.editor.modules.help.books().map((b) => b.id + ':' + b.secs.length)");
    t.ok("help: the editor guide and the reference, in sections", books.length === 2 && books.every((b) => Number(b.split(":")[1]) > 5), books.join(" "));
    await chrome.ev(`Cutaway.editor.modules.help.search("conditions"); Cutaway.clock.advance(0); 1`);   // (?manual: the panel redraws on a tick)
    await sleep(200);
    t.ok("help: a search marks the words", await chrome.ev("document.querySelectorAll('.cw-help mark').length > 0"));
    const sample = ["- a", "  - b", "1. c", "", "| x | y |", "|---|---|", "| 1 | 2 |", "", "```", "code", "```"].join("\n");
    const md = await chrome.ev(`Cutaway.editor.modules.help.markdown(${JSON.stringify(sample)})`);
    t.ok("help: markdown (nested lists, numbered, tables, code)", /<ul><li>a<ul><li>b/.test(md) && /<table>/.test(md) && /<pre>code<\/pre>/.test(md), md);
    // its own window: the editor opens in a popup the game page drives (if the browser allows one)
    await chrome.ev("Cutaway.editor.close(); Cutaway.editor.useWindow(true); Cutaway.editor.open(); 1");
    await sleep(500);
    const w = await chrome.ev("(() => { const w = Cutaway.editor.window; return w ? !!w.document.querySelector('.cutaway-editor') : null; })()");
    t.ok("editor: in a window of its own (or docked when popups are blocked)", w === true || (w === null && await chrome.ev("!!document.querySelector('.cutaway-editor')")), String(w));
    await chrome.ev("Cutaway.editor.close(); 1");
    const run = await chrome.ev("Cutaway.editor.studio.run('hello')");
    t.ok("checks: the studio runs the game's task", run.code === 0 && run.output.trim() === "checked");
    t.ok("editor+studio: no page errors", chrome.errors.length === 0, chrome.errors.join(" | "));
  } finally {
    await chrome.close();
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
