// Cutaway.js editor, Dialogue tab: each dialogue as its nodes and choices (the text, when it shows, where
// it leads, once only, silent), with what the game would offer right now (a choice's `if` tested on the
// state in play), and Test: close the editor and talk. Texts are changed in the Texts tab (search for
// the choice); the structure lives in the game's code.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  let sel = "";

  /** Who talks it: the actor whose talk script opens it, if any. @param {string} id */
  function speaker(id) {
    const opens = (/** @type {any} */ s) => JSON.stringify(s ?? null).includes(`"dialog":${JSON.stringify(id)}`);
    return Cutaway.actors.all().find((a) => opens(a.def.talk))?.id ?? "";
  }

  /** @param {Cond | undefined} c */
  const holds = (c) => { try { return Cutaway.state.test(c); } catch { return false; } };

  function build(/** @type {HTMLElement} */ box) {
    const ids = Cutaway.dialog.ids();
    if (!ids.length) { box.append(el("div", { style: { color: "#888" } }, ["No dialogues (Cutaway.dialog)."])); return; }
    if (!ids.includes(sel)) sel = ids[0];
    const d = Cutaway.dialog.get(sel) ?? {}, who = speaker(sel);
    box.append(el("div", {}, [el("select", { onchange: (/** @type {any} */ e) => { sel = e.target.value; E.refresh(); } },
      ids.map((i) => el("option", { value: i, textContent: i, selected: i === sel }))), " ",
      button("Test in game", () => test(), `close the editor and start it${who ? ` (${who} talks it)` : ""}`)]));
    if (who) box.append(el("div", { className: "cw-dim" }, [`${who} opens it when talked to`]));
    for (const [node, n] of Object.entries(d)) {
      const choices = Array.isArray(n) ? n : n.choices ?? [];
      const nodeBox = el("div", { style: { marginTop: "6px", border: "1px solid #3a3350", padding: "4px" } }, [el("div", { style: { color: "#ffe14a" } }, [`node ${node}`])]);
      if (!Array.isArray(n) && n.enter) nodeBox.append(el("div", { style: { color: "#aaa", whiteSpace: "pre-wrap" } }, ["on entering: " + JSON.stringify(n.enter).slice(0, 160)]));
      for (const c of choices) {
        const now = holds(c.if);
        nodeBox.append(el("div", { style: { padding: "2px 0", borderTop: "1px solid #2a2340", color: now ? "#eee" : "#777" } }, [
          `${now ? "▸" : "·"} ${Cutaway.i18n.t(c.text)}`,
          el("div", { style: { color: "#8a84a0", fontSize: "11px" } }, [[c.if ? `if ${JSON.stringify(c.if)}` : "", c.once ? "once" : "", c.silent ? "silent" : "",
            c.goto ? `-> ${c.goto}` : "", c.then ? "then: " + JSON.stringify(c.then).slice(0, 90) : ""].filter(Boolean).join("   ")]),
        ]));
      }
      box.append(nodeBox);
    }
    box.append(el("div", { className: "cw-dim", style: { marginTop: "4px" } }, ["▸ offered now   · not now (its condition doesn't hold)"]));
  }

  /** Close the editor and start a dialogue (the one picked here). @param {string} [id] */
  function test(id) {
    const d = id ?? (Cutaway.dialog.ids().includes(sel) ? sel : Cutaway.dialog.ids()[0]);
    if (!d) return;
    E.close();
    Cutaway.script.run({ dialog: d });
  }

  E.tab({ id: "dialogue", label: "Dialogue", build });
  E.modules.dialogue = { test, get selected() { return sel || Cutaway.dialog.ids()[0] || ""; } };
})();
