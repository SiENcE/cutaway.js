// Cutaway.js hints: what to try next, in the game's own words.
//   Cutaway.hints([
//     { if: "!got_key", about: "shelf", text: ["Something up high?", "Bolt is tall.", "Play Bolt, use the shelf."] },
//     { if: "!door_open", about: ["door", "key"], text: "The key fits the door." },
//   ])
// The first hint whose `if` holds is the one for now. Asking again (the bulb button beside the satchel,
// H, or "Hint" in the pause menu) shows its next, clearer line; a new hint starts at its first line.
// `solve.mjs --full` checks every state from which the end can still be reached: a hint must hold there,
// and its `about` (hotspot, actor or item ids, or "room/hotspot") must still be on the way to the end.
"use strict";

/** @typedef {{if?: Cond, about?: string | string[], text: string | string[]}} HintDef */

Cutaway.hints = (function () {
  /** @type {HintDef[]} */
  let list = [];
  let lastIx = -1, level = 0;

  /**
   * Set the game's hints, in order: the first that holds is shown.
   * @param {HintDef[]} defs
   */
  function hints(defs) { list = defs.slice(); lastIx = -1; level = 0; }

  /** The index of the hint for now, or -1. */
  function currentIndex() { return list.findIndex((h) => Cutaway.state.test(h.if)); }

  /** Show the hint for now (the next line of it, when asked again). */
  hints.ask = function () {
    const i = currentIndex(), h = list[i];
    if (!h) return Cutaway.script.run({ narrate: "@cutaway.hint.none" });
    if (i !== lastIx) { lastIx = i; level = 0; }
    const lines = Array.isArray(h.text) ? h.text : [h.text], n = Math.min(level++, lines.length - 1);
    Cutaway.events.emit("hint", { index: i, line: n });
    return Cutaway.script.run({ narrate: Cutaway.i18n.t("@cutaway.hint.prefix") + Cutaway.i18n.t(lines[n]) }, { path: `hint.${i}` });
  };
  /** Does the game have hints? */
  hints.any = () => list.length > 0;
  /** All hints (the tools check them). */
  hints.all = () => list.slice();
  /** The hint for now, or null. */
  hints.current = () => list[currentIndex()] ?? null;
  hints.currentIndex = currentIndex;
  /** Can the player ask now (no script, menu or card in the way, somebody to play)? */
  hints.ready = () => list.length > 0 && !!Cutaway.scene.active && !Cutaway.script.busy && !Cutaway.menu.isOpen && !Cutaway.menu.card && !Cutaway.ui.line;
  hints.init = function () {
    Cutaway.events.on("key", (k) => { if (k.code === "KeyH" && hints.ready()) { hints.ask(); k.event.preventDefault(); } });
  };
  return hints;
})();
