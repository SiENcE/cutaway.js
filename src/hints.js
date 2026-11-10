// Cutaway.js hints: what to try next, in the game's own words.
//   Cutaway.hints([
//     { if: "!got_key", about: "shelf", text: ["Something up high?", "Bolt is tall.", "Play Bolt, use the shelf."] },
//     { if: "!door_open", about: ["door", "key"], text: "The key fits the door." },
//   ])
// The first hint whose `if` holds is the one for now. A game in acts can give an act its own hints,
// which count only while that act is played: Cutaway.hints([...], { act: "act2" }). Asking again (the bulb button beside the satchel,
// H, or "Hint" in the pause menu) shows its next, clearer line; a new hint starts at its first line.
// `solve.mjs --full` checks every state from which the end can still be reached: a hint must hold there,
// and its `about` (hotspot, actor or item ids, or "room/hotspot") must still be on the way to the end.
"use strict";

/** @typedef {{if?: Cond, about?: string | string[], text: string | string[], act?: string}} HintDef */

Cutaway.hints = (function () {
  /** @type {HintDef[]} */
  let list = [];
  let lastIx = -1, level = 0;

  /**
   * Set the game's hints, in order: the first that holds is shown. With `act`, they are that act's
   * hints (replacing only its own): they count only while it is played.
   * @param {HintDef[]} defs
   * @param {{act?: string}} [o]
   */
  function hints(defs, o = {}) {
    const own = defs.map((h) => (o.act ? { ...h, act: o.act } : h));
    list = o.act ? [...list.filter((h) => h.act !== o.act), ...own] : own;
    lastIx = -1; level = 0;
  }

  /** The index of the hint for now, or -1. */
  function currentIndex() { return list.findIndex((h) => (!h.act || h.act === Cutaway.acts.current) && Cutaway.state.test(h.if)); }

  /** who speaks the hints (an actor's id), or null: they are narrated with the hint prefix */
  let by = /** @type {string | null} */ (null);
  /** The step that shows a hint's text: said by the hint giver, or narrated. @param {string} text @param {boolean} plain */
  const show = (text, plain) => (by ? { say: by, text } : { narrate: plain ? text : Cutaway.i18n.t("@cutaway.hint.prefix") + Cutaway.i18n.t(text) });

  /** Take the next line of the hint for now (each ask one plainer): the step that shows it and its path. */
  function next() {
    const i = currentIndex(), h = list[i];
    if (!h) return { step: show("@cutaway.hint.none", true), path: "hint.none" };
    if (i !== lastIx) { lastIx = i; level = 0; }
    const lines = Array.isArray(h.text) ? h.text : [h.text], n = Math.min(level++, lines.length - 1);
    Cutaway.events.emit("hint", { index: i, line: n });
    return { step: show(lines[n], false), path: `hint.${i}` };
  }

  /** Show the hint for now (the next line of it, when asked again). */
  hints.ask = function () {
    const { step, path } = next();
    return Cutaway.script.run(step, { path });
  };
  /** `by`: an actor who speaks the hints (in their voice and colour, no prefix); null narrates them. @param {{by?: string | null}} o */
  hints.configure = (o) => { if ("by" in o) by = o.by ?? null; };
  /** The next line as a script step, for the { hint: true } action (a character who gives the hints). */
  hints.next = () => next().step;
  /** Does the game have hints? */
  hints.any = () => list.length > 0;
  /** All hints (the tools check them). */
  hints.all = () => list.slice();
  /** The hint for now, or null. */
  hints.current = () => list[currentIndex()] ?? null;
  hints.currentIndex = currentIndex;
  /** Can the player ask now (no script, menu or card in the way, somebody to play)? */
  hints.ready = () => list.length > 0 && Cutaway.ui.canAct() && !Cutaway.ui.line;
  hints.init = function () {
    Cutaway.events.on("key", (k) => { if (k.code === "KeyH" && hints.ready()) { hints.ask(); k.event.preventDefault(); } });
  };
  // { hint: true }: the hint for now, as if the hint button were pressed (from a hotspot, a character)
  Cutaway.script.action("hint", (s, ctx) => Cutaway.script.exec([hints.next()], ctx));
  return hints;
})();
