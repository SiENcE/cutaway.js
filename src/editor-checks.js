// Cutaway.js editor, Checks tab: the game's tasks from its studio.json (validate, solve, build the art,
// ...) run by the studio, with their output (here and in the output pane; Tools runs them too); and a
// reload, to see files written by a task (new art).
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  let output = "", running = "";

  /** @param {string} task */
  async function run(task) {
    running = task; output = ""; E.refresh();
    const r = await E.runTask(task);
    output = r.output.trim() || "(no output)";
    running = ""; E.refresh();
  }

  function build(/** @type {HTMLElement} */ box) {
    if (!E.studio.available) {
      box.append(el("div", { style: { color: "#c96" } }, ["The checks run in the studio:\nnode lib/cutaway/tools/studio.mjs\n(it opens the game with the editor)."]));
      return;
    }
    const tasks = Object.keys(E.studio.config?.tasks ?? {});
    box.append(el("div", { style: { margin: "4px 0" } }, tasks.length
      ? tasks.map((t) => button(running === t ? t + " ..." : t, () => { if (!running) run(t); }, (E.studio.config.tasks[t] ?? []).join(" ")))
      : ["No tasks: list them in studio.json (\"tasks\")."]));
    box.append(el("div", {}, [button("Reload the game", () => location.reload(), "load the files again (after building art or changing code); the editor opens again"),
      ...(E.modules.art ? [button("Reload art", () => { E.modules.art.reloadArt().catch((/** @type {any} */ e) => E.setStatus(e.message)); }, "load the game's atlas scripts again, without a reload")] : [])]));
    box.append(el("pre", { style: { whiteSpace: "pre-wrap", font: "inherit", color: "#ccc", background: "#100d18", padding: "4px" } },
      [running ? `running ${running} ...` : output]));
  }

  E.tab({ id: "checks", label: "Checks", build });
})();
