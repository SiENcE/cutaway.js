// Cutaway.js editor, Issues tab: the validator (tools/lib/validate.mjs, the same one the Node tools run)
// on the live game data, edits included: unknown rooms, items, actors, sounds and images, conditions
// and flags, shapes that cross, walk-to points off the floor, missing translations. A click on an issue
// opens the room and the thing it is about. It loads the validator as a module, which a browser only
// allows over http: with the studio. Without it, the Checks tab runs the game's "validate" task.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  /** @type {{level: string, where: string, msg: string}[] | null} */
  let issues = null;
  let running = false, failed = "", showWarnings = true;

  async function check() {
    running = true; failed = ""; E.refresh();
    try {
      // a game's pinned copy keeps the tools beside the engine (lib/cutaway/tools), the engine above it
      let mod = null;
      for (const u of [Cutaway.base + "tools/lib/validate.mjs", Cutaway.base + "../tools/lib/validate.mjs"]) {
        try { mod = await import(u); break; } catch { /* the next */ }
      }
      if (!mod) throw new Error("tools/lib/validate.mjs isn't beside the engine");
      issues = mod.validate(Cutaway, { languages: Cutaway.menu.languages }).issues;
      E.setStatus(`${issues?.filter((i) => i.level === "error").length} errors, ${issues?.filter((i) => i.level === "warning").length} warnings`);
    } catch (e) {
      issues = null;
      failed = `The validator didn't load here (${/** @type {any} */ (e)?.message ?? e}).\n` +
        (E.studio.available ? "Is lib/cutaway/tools/lib/validate.mjs there?" : "It needs the studio (http). The Checks tab runs \"validate\" too.");
    }
    running = false; E.refresh();
  }

  /** Open what an issue is about: "room attic.hotspots.print.look" -> the attic, the print. @param {string} where */
  async function go(where) {
    const m = where.match(/^room (\w+)(?:\.(hotspots|props|light\.lamps|fx)\.([\w-]+))?/);
    if (!m) { E.setStatus(where); return; }
    await E.openRoom(m[1]);
    if (m[2]) {
      const kind = m[2] === "hotspots" ? "hot" : m[2] === "props" ? "prop" : m[2] === "fx" ? "fx" : "lamp";
      if (E.modules.things) { E.show("things"); E.modules.things.select(`${kind}:${m[3]}`); }
    } else E.show("room");
  }

  function build(/** @type {HTMLElement} */ box) {
    box.append(el("div", { style: { margin: "4px 0" } }, [button(running ? "checking ..." : issues ? "Check again" : "Check", () => { if (!running) check(); }),
      el("label", {}, [el("input", { type: "checkbox", checked: showWarnings, onchange: () => { showWarnings = !showWarnings; E.refresh(); } }), "warnings"])]));
    if (failed) { box.append(el("div", { style: { color: "#c96", whiteSpace: "pre-wrap" } }, [failed])); return; }
    if (!issues) { box.append(el("div", { className: "cw-dim" }, ["Checks the game as it is now, with what you changed (saved or not)."])); return; }
    const list = issues.filter((i) => showWarnings || i.level === "error");
    if (!list.length) { box.append(el("div", { style: { color: "#7a7" } }, ["no issues"])); return; }
    const rows = el("div", {});
    for (const i of list) {
      rows.append(el("div", { onclick: () => { go(i.where); }, title: "open it",
        style: { cursor: "pointer", padding: "2px 4px", borderBottom: "1px solid #2a2340", color: i.level === "error" ? "#ff8a7a" : "#e6c86a" } },
        [el("div", { style: { color: "#8a84a0", fontSize: "11px" } }, [i.where]), i.msg]));
    }
    box.append(rows);
  }

  E.tab({ id: "issues", label: "Issues", build });
  E.modules.issues = { check, get issues() { return issues; } };
})();
