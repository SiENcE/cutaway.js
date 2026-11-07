// The game's connections, to look at: the solver searches every state (as solve.mjs --full) and watches
// every move it plays: what it needed of the state and what it changed. Out comes a data file for
// tools/graph.html: the puzzle dependency chart (moves, the facts they need and bring about, the winning
// way through them) and the state budget (how much each flag, item or once-mark multiplies the states).
//   node tools/graph.mjs <index.html> [--act id] [--set flag,flag] [--max N] [--workers N] [--out out/graph/<act>.js]
// --act: one act alone, from its start (going on to the next act ends it, as ?alone); --set: flags for its
// start (one the act before leaves, or one that shuts a part of the game away).
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeSolver, loadFor } from "./lib/solver.mjs";
import { buildGraph } from "./lib/graph.mjs";

const args = process.argv.slice(2);
const valued = ["--act", "--set", "--max", "--workers", "--out"];
const opt = (/** @type {string} */ n, /** @type {string} */ d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const page = args.find((a, i) => !a.startsWith("--") && !valued.includes(args[i - 1]));
if (!page) { console.error("usage: node tools/graph.mjs <index.html> [--act id] [--set flag,flag] [--max N] [--workers N] [--out file.js]"); process.exit(2); }
const act = opt("--act", ""), kept = opt("--set", ""), out = path.resolve(opt("--out", `out/graph/${act || "game"}.js`));   // out/graph: the studio's "graph" folder, where the editor looks

const setup = { page, options: act ? { act, demo: { acts: [act] } } : {}, start: kept ? kept.split(",").map((f) => ({ set: f })) : [] };
const g = loadFor(setup);
const solver = await makeSolver(g, { workers: Number(opt("--workers", String(Math.min(12, availableParallelism() - 1)))), setup, trace: true });
const t0 = Date.now();
let shown = 0;
const progress = (/** @type {string} */ text) => { if (Date.now() - shown > 30000) { shown = Date.now(); process.stderr.write(`  ... ${text}\n`); } };
const r = /** @type {any} */ (await solver.search({ full: true, maxStates: Number(opt("--max", "1000000")), progress }));
console.log(`${r.states} states in ${Date.now() - t0} ms${r.complete ? "" : " (stopped at the limit: the graph shows only what was reached)"}`);

const data = { page: path.basename(page), act: act || null, set: kept ? kept.split(",") : [], made: new Date().toISOString(), ...buildGraph(r, g.C.state.views?.() ?? []) };
mkdirSync(path.dirname(out), { recursive: true });
// a script, not JSON: the viewer runs from file:// and loads it with a <script> tag (no fetch)
writeFileSync(out, `// made by tools/graph.mjs\nwindow.CUTAWAY_GRAPH = ${JSON.stringify(data)};\n`);
console.log(`${data.moves.length} moves that change something, ${data.facts.length} facts, the way ${data.way.length} steps`);
console.log("what multiplies the states most:");
for (const f of data.factors.slice(0, 12)) console.log(`  x${f.factor.toFixed(2).padEnd(6)} ${f.part} (${f.values} values)`);
const viewer = path.join(path.dirname(fileURLToPath(import.meta.url)), "graph.html");
console.log(`wrote ${out}\nopen ${pathToFileURL(viewer)}?data=${encodeURIComponent(pathToFileURL(out).href)}`);
