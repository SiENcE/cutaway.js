// The start states for an act from the runs of the act before (tools/graph.mjs data files): the ways they end, as the
// act keeps them (handoff.mjs startsFrom), for the solver's `starts`. Shared by tools/solve.mjs, tools/graph.mjs and a
// game's own solving tools, which take the same options:
//   --from <graph files or folders, comma between them>  --hold f,g  --vary f,g  --only f,g   (startsFrom says what each does)
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseGraph, startsFrom } from "./handoff.mjs";
import { loadGame, boot } from "./game.mjs";
import { validate } from "./validate.mjs";

/** The options' names, each followed by its value. */
export const STARTS_OPTIONS = ["--from", "--hold", "--vary", "--only"];

/**
 * @param {string} page the game's index.html (validated: which flags only its own code reads)
 * @param {string} act the act to begin
 * @param {string[]} inputs graph data files or folders (every .js in them); only runs whose next act is `act` count
 * @param {{hold?: string[], vary?: string[], only?: string[]}} [o] startsFrom's
 * @returns {Promise<{flags: Record<string, any>, n: number}[]>}
 */
export async function startsFor(page, act, inputs, o = {}) {
  const files = inputs.flatMap((p) => statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith(".js")).sort().map((f) => path.join(p, f)) : [p]);
  const graphs = files.map((f) => parseGraph(readFileSync(f, "utf8")));
  const g = loadGame(page);
  await boot(g, { instant: true });
  const v = validate(g.C, { ...g.options, languages: g.options?.languages });
  const out = startsFrom(graphs, act, v.flags, o);
  if (!out.length) throw new Error(`no end of the runs in ${inputs.join(", ")} goes on to "${act}"${o.only?.length ? ` with ${o.only.join(", ")}` : ""} (graph data of the act before, made by tools/graph.mjs)`);
  return out;
}

/**
 * The starts a command line asks for (--from and the rest), told on the console; undefined without --from.
 * @param {string} page @param {string} act @param {string[]} args the command line
 */
export async function startsFromArgs(page, act, args) {
  const opt = (/** @type {string} */ n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : ""; };
  const list = (/** @type {string} */ n) => (opt(n) ? opt(n).split(",") : undefined);
  const from = opt("--from");
  if (!from) return undefined;
  if (!act) throw new Error("--from needs an act: the act the runs go on to");
  const starts = await startsFor(page, act, from.split(","), { hold: list("--hold"), vary: list("--vary"), only: list("--only") });
  console.log(`${starts.length} start${starts.length === 1 ? "" : "s"} from the runs before (${starts.reduce((n, s) => n + s.n, 0)} end states)`);
  return starts;
}
