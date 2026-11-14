// Check the hand-over between acts from the acts' traced runs (tools/graph.mjs data files): a fresh act that
// reads a flag an earlier act sets but it doesn't keep (an error), a kept flag nobody reads, a consequence
// that never arrives, two runs of one act that touch (warnings), and the ways each act hands over to the next.
//   node tools/handoff.mjs <graph files or folders> [--page index.html]
// A folder: every .js in it. --page: the game is loaded and validated, for its acts (their order, fresh, keep)
// and the flags it sets and tests anywhere; without it the runs' own data says what it can. Exit code 1 on errors.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { handoff, parseGraph, formatHandoff } from "./lib/handoff.mjs";

const args = process.argv.slice(2);
const pi = args.indexOf("--page"), page = pi >= 0 ? args[pi + 1] : "";
const inputs = args.filter((a, i) => !a.startsWith("--") && !(pi >= 0 && i === pi + 1));
if (!inputs.length) { console.error("usage: node tools/handoff.mjs <graph files or folders> [--page index.html]"); process.exit(2); }

const files = inputs.flatMap((p) => statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith(".js")).sort().map((f) => path.join(p, f)) : [p]);
const graphs = [];
for (const f of files) {
  try { graphs.push({ ...parseGraph(readFileSync(f, "utf8")), file: path.basename(f) }); } catch (e) { console.log(`note   ${f}: ${/** @type {any} */ (e).message}`); }
}
/** @type {any} */
let o = {};
if (page) {
  const { loadGame, boot } = await import("./lib/game.mjs");
  const { validate } = await import("./lib/validate.mjs");
  const g = loadGame(page);
  await boot(g, { instant: true });
  const v = validate(g.C, { ...g.options, languages: g.options?.languages });
  o = { acts: v.acts, flags: v.flags };
}
const r = handoff(graphs, o);
for (const line of formatHandoff(r)) console.log(line);
process.exitCode = r.errors ? 1 : 0;
