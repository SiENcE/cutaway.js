// Prove that a Cutaway game can be finished, and find soft-locks.
//   node tools/solve.mjs <index.html> [--full] [--max 100000] [--json path.json] [--workers N]
// Prints the shortest winning path (player moves). --full explores every reachable state and lists
// soft-locks: states from which the end can no longer be reached, and checks the game's hints (every
// state that can still be won has one that holds, about something still needed). Exit code 1 if unsolvable,
// soft-locked, a state without a fitting hint, or --full stopped at the limit (nothing is proved then). --json writes the winning path for tools/play.mjs. --workers: threads that search (default:
// one less than the machine's cores, at most 12; 0: this one only).
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { makeSolver, loadFor, describe } from "./lib/solver.mjs";
import { verdicts } from "./lib/verdict.mjs";

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
if (args.includes("--full") && verdicts(r, g.C)) process.exitCode = 1;
