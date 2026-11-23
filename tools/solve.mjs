// Prove that a Cutaway game can be finished, and find soft-locks.
//   node tools/solve.mjs <index.html> [--full] [--max 100000] [--json path.json] [--workers N] [--act id] [--set f,g=v] [--from graph files] [--hold f,g] [--vary f,g] [--only f,g]
// Prints the shortest winning path (player moves). --full explores every reachable state and lists
// soft-locks: states from which the end can no longer be reached, and checks the game's hints (every
// state that can still be won has one that holds, about something still needed). Exit code 1 if unsolvable,
// soft-locked, a state without a fitting hint, or --full stopped at the limit (nothing is proved then). --json writes the winning path for tools/play.mjs. --workers: threads that search (default:
// one less than the machine's cores, at most 12; 0: this one only).
// --act: one act alone, from its start (going on to the next act ends it); --set: flags for its start (flag or flag=value).
// --from: the runs of the act before (tools/graph.mjs data files or folders, comma between them): the act is begun from every
// way they end, as it keeps them (lib/handoff.mjs startsFrom), and searched from all at once; with --full each start must be won.
// --hold, --vary, --only narrow the starts for a run about a part of the act (lib/handoff.mjs startsFrom): flags no start takes over,
// the only flags that make starts of their own, the only ends that count (those with these flags set).
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { makeSolver, loadFor, describe } from "./lib/solver.mjs";
import { verdicts } from "./lib/verdict.mjs";
import { startsFromArgs, STARTS_OPTIONS } from "./lib/starts.mjs";

const args = process.argv.slice(2);
const valued = ["--max", "--json", "--workers", "--act", "--set", ...STARTS_OPTIONS];
const page = args.find((a, i) => !a.startsWith("--") && !valued.includes(args[i - 1]));
if (!page) { console.error("usage: node tools/solve.mjs <index.html> [--full] [--max N] [--json out.json] [--act id] [--set f,g=v] [--from graph files] [--hold f,g] [--vary f,g] [--only f,g]"); process.exit(2); }
const opt = (/** @type {string} */ n, /** @type {string | undefined} */ d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const act = opt("--act", ""), kept = opt("--set", "");
/** a flag, or flag=value (a number when it reads as one) @param {string} f */
const step = (f) => { const [k, v] = f.split("="); return v === undefined ? { set: k } : { set: k, value: Number.isNaN(Number(v)) ? v : Number(v) }; };
const setup = { page, options: act ? { act, demo: { acts: [act] } } : {}, start: kept ? kept.split(",").map(step) : [] };
const starts = await startsFromArgs(page, act, args);
const workers = Number(opt("--workers", String(Math.min(12, availableParallelism() - 1))));
const g = loadFor(setup), solver = await makeSolver(g, { workers, setup, starts: starts?.map((s) => s.flags) });
const t0 = Date.now();
let shown = 0;   // now and then, how far it has got (on stderr)
const progress = (/** @type {string} */ text) => { if (Date.now() - shown > 30000) { shown = Date.now(); process.stderr.write(`  ... ${text}\n`); } };
const r = await solver.search({ full: args.includes("--full"), maxStates: Number(opt("--max", "100000")), progress });
console.log(`${r.states} states searched in ${Date.now() - t0} ms${r.complete ? "" : " (stopped at the limit)"}`);
if (!r.solved) {
  console.log("UNSOLVABLE: no way to the end found");
  process.exitCode = 1;
} else {
  console.log(`solved in ${r.path.length} moves:`);
  r.path.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${describe(m)}`));
  const out = opt("--json", undefined);
  if (out) { writeFileSync(out, JSON.stringify(r.path, null, 1)); console.log("wrote " + out); }
}
if (args.includes("--full") && verdicts(r, g.C)) process.exitCode = 1;
