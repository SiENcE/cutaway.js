// Prove that a Cutaway game can be finished, and find soft-locks.
//   node tools/solve.mjs <index.html> [--full] [--max 100000] [--json path.json] [--workers N]
// Prints the shortest winning path (player moves). --full explores every reachable state and lists
// soft-locks: states from which the end can no longer be reached, and checks the game's hints (every
// state that can still be won has one that holds, about something still needed). Exit code 1 if unsolvable or
// soft-locked. --json writes the winning path for tools/play.mjs. --workers: threads that search (default:
// one less than the machine's cores, at most 12; 0: this one only).
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { makeSolver, loadFor, describe } from "./lib/solver.mjs";

const args = process.argv.slice(2);
const page = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a) && !a.endsWith(".json"));
if (!page) { console.error("usage: node tools/solve.mjs <index.html> [--full] [--max N] [--json out.json]"); process.exit(2); }
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const setup = { page }, workers = Number(opt("--workers", String(Math.min(12, availableParallelism() - 1))));
const g = loadFor(setup), solver = await makeSolver(g, { workers, setup });
const t0 = Date.now();
let shown = 0;   // now and then, how far it has got (on stderr)
const progress = (text) => { if (Date.now() - shown > 30000) { shown = Date.now(); process.stderr.write(`  ... ${text}\n`); } };
const r = await solver.search({ full: args.includes("--full"), maxStates: Number(opt("--max", "100000")), progress });
console.log(`${r.states} states searched in ${Date.now() - t0} ms${r.complete ? "" : " (stopped at the limit)"}`);
if (!r.solved) {
  console.log("UNSOLVABLE: no way to the end found");
  process.exitCode = 1;
} else {
  console.log(`solved in ${r.path.length} moves:`);
  r.path.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${describe(m)}`));
  const out = opt("--json");
  if (out) { writeFileSync(out, JSON.stringify(r.path, null, 1)); console.log("wrote " + out); }
}
if (args.includes("--full")) {
  if (!r.complete) console.log("soft-lock check incomplete: raise --max");
  else if (r.softlocks.length) {
    console.log(`SOFT-LOCKS: ${r.softlocks.length} states can't reach the end. Shortest ways into one:`);
    for (const p of r.softlocks.slice(0, 5)) console.log("  " + p.map(describe).join(" > "));
    process.exitCode = 1;
  } else console.log("no soft-locks");
  if (r.hints) {
    const all = g.C.hints.all(), text = (i) => { const h = all[i]; return JSON.stringify((Array.isArray(h.text) ? h.text[0] : h.text).slice(0, 50)); };
    if (r.hints.problems.length) {
      console.log(`HINTS: ${r.hints.problems.length} states without a fitting hint. The nearest:`);
      for (const p of r.hints.problems.slice(0, 5)) console.log(`  ${p.hint >= 0 ? "hint " + p.hint + " " + text(p.hint) : ""} ${p.problem}, after: ${p.path.map(describe).join(" > ") || "(the start)"}`);
      process.exitCode = 1;
    } else console.log(`hints: every state on the way has one (${all.length} hints)`);
    r.hints.uses.forEach((n, i) => { if (!n) console.log(`  warn: hint ${i} ${text(i)} never holds`); });
  }
}
