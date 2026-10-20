// The editor's lists, script blocks, dialogue editing and voices in headless Chrome on the demo: the
// keyboard moves through a list and keeps its focus when the panels are built again, a group folds; a
// step moves with Alt+Down (into the game and the edits layer) and Ctrl+Z takes it back; a node renamed
// takes its gotos along; a recording is cut to the voice and holds its line; a sequence's steps edit as
// blocks.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "../tools/lib/chrome.mjs";

export default async function (t) {
  const chrome = await launch({ width: 1400, height: 800 });
  try {
    await chrome.send("Emulation.setFocusEmulationEnabled", { enabled: true });   // focus events in a page that isn't in front
    await chrome.open(pathToFileURL(resolve("demo/index.html")).href + "?manual&edit&act=act1");
    for (let i = 0; i < 80 && !(await chrome.ev("!!(Cutaway.editor && Cutaway.editor.isOpen && Cutaway.editor.modules.voices)")); i++) await sleep(50);
    const run = (/** @type {string} */ body) => chrome.ev(`(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const key = async (k, o = {}) => { document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: o.code ?? k, altKey: !!o.alt, ctrlKey: !!o.ctrl, bubbles: true, cancelable: true })); await frame(); await frame(); };
      const E = Cutaway.editor;
      ${body}
    })()`);

    // a list: the workspaces, by keys (each pick builds the panels again)
    const ws = await run(`await frame(); E.show("room"); await frame(); await frame();
      document.querySelector(".cw-left .cw-lst").focus();
      const seen = [];
      for (const k of ["ArrowDown", "ArrowDown", "End", "Home"]) { await key(k); seen.push(E.activeTab + "/" + document.activeElement?.dataset?.id); }
      return seen.join(" ");`);
    t.ok("lists: the arrows pick, the focus stays in the list", ws === "texts/workspaces things/workspaces help/workspaces room/workspaces", ws);
    const fold = await run(`E.show("things"); await frame(); await frame();
      const l = [...document.querySelectorAll(".cw-left .cw-lst")].find((x) => x.dataset.id === "things.left");
      l.focus(); await key("ArrowDown"); await key("ArrowLeft"); await key("ArrowLeft");
      const head = l.isConnected ? l : [...document.querySelectorAll(".cw-left .cw-lst")].find((x) => x.dataset.id === "things.left");
      const folded = head.querySelector(".gh").textContent.startsWith("▸");
      await key("ArrowRight");
      const open = [...document.querySelectorAll(".cw-left .cw-lst")].find((x) => x.dataset.id === "things.left").querySelector(".gh").textContent.startsWith("▾");
      await key("d");
      return [folded, open, E.selected ?? E.modules.things.selected].join(" ");`);
    t.ok("lists: Left folds a group, Right opens it, a letter jumps", /^true true .*door/.test(fold), fold);

    // a script as blocks
    const sc = await run(`E.show("things"); E.modules.things.select("hot:shelf"); await frame();
      E.modules.things.openScript(["use"], "use"); await frame(); await frame();
      const rows = document.querySelectorAll(".cw-centre .cw-step");
      rows[1].focus(); await key("ArrowDown"); await key("ArrowDown", { alt: true });
      const inner = () => Cutaway.room.get("hall").hotspots.shelf.use[0].then[0].then.map((s) => typeof s === "string" ? "line" : Object.keys(s)[0]).join(",");
      const moved = inner(), layer = Cutaway.edits.changed("rooms", "hall", ["hotspots", "shelf", "use"]);
      await key("z", { ctrl: true, code: "KeyZ" });
      return [rows.length, moved, layer, inner()].join(" ");`);
    t.ok("blocks: a step moves (Alt+Down), into the game and the layer; Ctrl+Z takes it back", sc === "8 set,give,stinger,line true give,set,stinger,line", sc);
    const kinds = await run(`const before = JSON.stringify(Cutaway.room.get("hall").hotspots.shelf.use);
      const row = document.querySelectorAll(".cw-centre .cw-step")[5], kind = row.querySelector("select.kind");
      kind.value = "say"; kind.dispatchEvent(new Event("change")); await frame();
      const step = Cutaway.room.get("hall").hotspots.shelf.use[0].then[0].then[3];
      return JSON.stringify(step);`);
    t.ok("blocks: a line turned into a line by someone keeps its text", /"say":"\w+","text":"A key, in the pickle jar. Of course."/.test(kinds), kinds);

    // a dialogue: a node renamed, its gotos follow; Ctrl+Z
    const dl = await run(`E.modules.dialogue.edit("bolt"); await frame(); await frame();
      const inp = [...document.querySelectorAll(".cw-centre [data-f]")].find((x) => x.dataset.f === "node:shelf");
      inp.value = "reach"; inp.dispatchEvent(new Event("change")); await frame();
      const tr = Cutaway.dialog.get("bolt"), gotos = Object.values(tr).flatMap((n) => (Array.isArray(n) ? n : n.choices).map((c) => c.goto ?? "-"));
      const out = [Object.keys(tr).join(","), gotos.join(","), !!Cutaway.edits.data().dialogs.bolt];
      document.querySelector(".cw-centre .cw-ch").focus();
      await key("z", { ctrl: true, code: "KeyZ" });
      out.push(Object.keys(Cutaway.dialog.get("bolt")).join(","));
      return out.join(" ");`);
    t.ok("dialogue: a node renamed takes its gotos along; undo", dl === "main,reach -,reach,end,main,main true main,shelf", dl);

    // a recording: cut to the voice, levelled, played for its line
    const vo = await run(`E.show("voices"); await frame();
      const V = E.modules.voices, line = V.lines().find((l) => l.who === "bolt");
      const sr = 44100, b = new AudioBuffer({ length: Math.round(sr * 1.5), sampleRate: sr, numberOfChannels: 1 }), d = b.getChannelData(0);
      for (let i = Math.round(sr * 0.3); i < Math.round(sr * 1.1); i++) d[i] = 0.3 * Math.sin((i / sr) * 2 * Math.PI * 220);
      V.select(line.key); await frame();
      await V.take(new Blob([E.modules.sound.wav(b)], { type: "audio/wav" }), line.key); await frame();
      const c = Cutaway.voice.clip("bolt", line.text);
      return [c.from >= 150 && c.from <= 260, c.ms >= 900 && c.ms <= 1150, c.gain > 2, Cutaway.voice.clipMs("bolt", line.text) > c.ms, V.selected !== line.key, E.unsaved().includes("Voices 1")].join(" ");`);
    t.ok("voices: a recording is cut, levelled, holds its line; the next line is picked", vo === "true true true true true true", vo);

    // a sequence in Things: its steps as blocks (the cinema steps have kinds of their own), a caption
    // changed goes into the game and the edits layer; its captions are texts; the Play menu plays it
    const sq = await run(`E.show("things"); E.modules.things.select("seq:intro"); await frame();
      E.modules.things.openScript(["steps"], "steps"); await frame(); await frame();
      const kinds = [...document.querySelectorAll(".cw-centre .cw-step select.kind")].map((s) => s.value);
      const cap = [...document.querySelectorAll(".cw-centre [data-f]")].find((x) => x.dataset.f === "3:caption");
      cap.value = "Somewhere, a tiny house."; cap.dispatchEvent(new Event("change")); await frame();
      const texts = E.modules.texts.collect().filter((x) => x.where.startsWith("sequence intro")).map((x) => x.text);
      const play = E.menus().find((m) => m[0] === "Play")[1].map((i) => i.label ?? "");
      return [kinds.slice(0, 4).join(","), kinds.includes("other"), Cutaway.sequence.get("intro").steps[3].caption, Cutaway.edits.changed("sequences", "intro", ["steps"]),
        texts.includes("Somewhere, a tiny house."), play.includes("▶ intro") && play.some((l) => l.includes('from "sky"'))].join(" ");`);
    t.ok("sequences: steps as blocks, a caption changed in the game and the layer, its texts, the Play menu",
      sq === "shot,goto,letterbox,caption false Somewhere, a tiny house. true true true", sq);
    t.ok("editor blocks: no page errors", chrome.errors.length === 0, chrome.errors.join(" | "));
  } finally {
    await chrome.close();
  }
}
