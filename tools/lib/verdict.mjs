// What a full search says (solver.mjs with `full`), printed the same by tools/solve.mjs and tools/graph.mjs:
// incomplete, soft-locks, hints. A game can use either as its check.
import { describe } from "./solver.mjs";

/**
 * Print the verdicts of a full search. @param {any} r the search's result @param {any} C the engine (its hints)
 * @param {(line: string) => void} [log]
 * @returns {boolean} whether it failed (stopped at the limit, a soft-lock, a state without a fitting hint)
 */
export function verdicts(r, C, log = console.log) {
  let failed = false;
  // several starts (the ways the act before ends): what each reached first, the ones with a problem
  if (r.starts) {
    const bad = r.starts.map((/** @type {any} */ s, /** @type {number} */ i) => ({ ...s, i })).filter((/** @type {any} */ s) => !s.solved || s.softlocks || s.hints);
    const same = r.starts.filter((/** @type {any} */ s) => s.same !== null).length;
    log(`starts: ${r.starts.length}${same ? ` (${same} the same state as one before)` : ""}, ${bad.length ? `${bad.length} with a problem` : "every one can be won"}`);
    for (const s of bad.slice(0, 10)) log(`  start ${s.i}${s.flags ? " " + JSON.stringify(s.flags) : ""}: ${s.solved ? "can be won" : "CAN'T BE WON"}, ${s.softlocks} soft-locks, ${s.hints} states without a fitting hint`);
  }
  if (!r.complete) { log("soft-lock check incomplete: raise --max"); failed = true; }
  else if (r.softlocks.length) {
    log(`SOFT-LOCKS: ${r.softlocks.length} states can't reach the end. Shortest ways into one:`);
    for (const p of r.softlocks.slice(0, 5)) log("  " + p.map(describe).join(" > "));
    failed = true;
  } else log("no soft-locks");
  if (r.hints) {
    const all = C.hints.all(), text = (/** @type {number} */ i) => { const h = all[i]; return JSON.stringify((Array.isArray(h.text) ? h.text[0] : h.text).slice(0, 50)); };
    if (r.hints.problems.length) {
      log(`HINTS: ${r.hints.problems.length} states without a fitting hint. The nearest:`);
      for (const p of r.hints.problems.slice(0, 5)) log(`  ${p.hint >= 0 ? "hint " + p.hint + " " + text(p.hint) : ""} ${p.problem}, after: ${p.path.map(describe).join(" > ") || "(the start)"}`);
      failed = true;
    } else log(`hints: every state on the way has one (${all.length} hints)`);
    r.hints.uses.forEach((/** @type {number} */ n, /** @type {number} */ i) => { if (!n) log(`  warn: hint ${i} ${text(i)} never holds`); });
  }
  return failed;
}
