// The start states for an act from the runs of the act before (tools/graph.mjs data files): the ways they end, as the
// act keeps them (handoff.mjs startsFrom), for the solver's `starts`. Shared by tools/solve.mjs, tools/graph.mjs and a
// game's own solving tools.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseGraph, startsFrom } from "./handoff.mjs";
import { loadGame, boot } from "./game.mjs";
import { validate } from "./validate.mjs";

/**
 * @param {string} page the game's index.html (validated: which flags only its own code reads)
 * @param {string} act the act to begin
 * @param {string[]} inputs graph data files or folders (every .js in them); only runs whose next act is `act` count
 * @returns {Promise<{flags: Record<string, any>, n: number}[]>}
 */
export async function startsFor(page, act, inputs) {
  const files = inputs.flatMap((p) => statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith(".js")).sort().map((f) => path.join(p, f)) : [p]);
  const graphs = files.map((f) => parseGraph(readFileSync(f, "utf8")));
  const g = loadGame(page);
  await boot(g, { instant: true });
  const v = validate(g.C, { ...g.options, languages: g.options?.languages });
  const out = startsFrom(graphs, act, v.flags);
  if (!out.length) throw new Error(`no run in ${inputs.join(", ")} goes on to "${act}" (graph data of the act before, made by tools/graph.mjs)`);
  return out;
}
