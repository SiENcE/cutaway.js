// The hand-over between acts, checked from traced runs (tools/graph.mjs data: each a search of one act, its
// moves with the facts they read and wrote, its start's flags, what the act and the next one keep, its end
// states projected onto what the next act keeps). Pure: no Node, so the editor's Handoffs tab imports it too.
// An act may have several runs that differ by their `set` (parts of the game shut for the solver); they are
// merged by act, in the acts' order. What it finds, per act:
//   error    a fresh act reads a flag that no run of it writes, that no run's start has and it neither keeps
//            nor leaves (`leave`: left behind on purpose, an info), but that an earlier act's run writes (without
//            runs of earlier acts: that the game sets somewhere); in the act it is always unset;
//   warning  a kept flag no run of the act reads, which the next act doesn't keep either and nothing in the game
//            tests: kept for nothing (an info when the game tests it somewhere: the solver doesn't play looks that
//            only talk, and reads in a game's drawn screens aren't moves, so those reads are where it doesn't go);
//   warning  a flag the act writes and the game tests somewhere (not only in a hint's condition), which no run
//            of the act reads and the next (fresh) act doesn't keep: a consequence that never arrives;
//   warning  a flag only some runs of the act write that other runs read (without writing it or starting with
//            it): parts meant to stay apart touch; one per flag, the runs in its `runs` and `writers`, each reading
//            run's steps in its `detail`;
//   info     the ways the act hands over to the next (its runs' end states projected onto the next act's keep).
// Flags whose names begin with "~" (the engine's and a game's own marks) are left out, as the validator does.

/**
 * @typedef {{id: string, room: string, move: string, reads: [string, number][], neg: [string, number][], writes: string[]}} HandoffMove
 * @typedef {{page?: string, act: string | null, from?: string | null, set?: string[], file?: string, states?: number, complete?: boolean,
 *   keep?: string[] | null, leave?: string[], next?: string | null, nextKeep?: string[] | null, start?: string[],
 *   ends?: {wins: number, variants: number | null, projections: {flags: Record<string, any>, n: number}[]} | null, moves: HandoffMove[]}} HandoffGraph
 * @typedef {{level: "error" | "warning" | "info", act: string, flag?: string, msg: string, at?: string[], runs?: string[], writers?: string[],
 *   detail?: {run: string, at: string[]}[]}} HandoffProblem
 *   at: steps that read it (a few); runs, writers, detail: the runs that read it, those that write it, each reading run's steps
 * @typedef {{label: string, set: string[], file: string, states: number | null, complete: boolean}} HandoffRun
 * @typedef {{id: string, index: number, fresh: boolean, keep: string[] | null, leave: string[], next: string | null, nextKeep: string[] | null, runs: HandoffRun[],
 *   reads: string[], written: string[], start: string[], variants: {count: number, projections: {flags: Record<string, any>, n: number, runs: string[]}[]} | null,
 *   problems: HandoffProblem[]}} HandoffAct
 * @typedef {{acts: HandoffAct[], notes: string[], problems: HandoffProblem[], errors: number, warnings: number}} HandoffReport
 */

/** Steps named per flag and run (enough to find them). */
const AT = 3;
/** Runs named in a message (more are counted; the report's data names them all). */
const FEW = 3;

/** The data of a graph file's text (a script: window.CUTAWAY_GRAPH = {...};). @param {string} text @returns {any} */
export function parseGraph(text) {
  const a = text.indexOf("="), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("not a graph data file (tools/graph.mjs writes them)");
  return JSON.parse(text.slice(a + 1, b + 1));
}

/** A fact's flag ("name", "name=3", "name=…", "!name"), or null for other facts (has:, state:, ...). @param {string} fact */
export function flagOf(fact) {
  const f = fact.replace(/^!/, "");
  if (f.includes(":")) return null;          // flag names hold no colon; other facts have their kind before one
  return f.replace(/=.*$/, "") || null;
}

/** @param {string} f */
const ours = (f) => !f.startsWith("~");

/**
 * Check the hand-over between acts from traced runs.
 * @param {HandoffGraph[]} graphs the runs' data (several per act may differ by their `set`)
 * @param {{acts?: (string | {id: string, fresh?: boolean, keep?: (string | {flag: string})[], leave?: (string | {flag: string})[]})[],
 *   flags?: {set?: Iterable<string>, tested?: Iterable<string>, testedInPlay?: Iterable<string>, testedAt?: Record<string, string[]>}}} [o]
 *   acts: the game's acts in order (the validator's `acts`, or ids), else the order the runs' `next` gives; flags: the validator's
 *   (what the game sets and tests anywhere; testedInPlay: tested by more than the hints; testedAt: where), else what the runs read
 * @returns {HandoffReport}
 */
export function handoff(graphs, o = {}) {
  /** @type {string[]} */
  const notes = [];
  /** @type {Map<string, {fresh?: boolean, keep?: string[], leave?: string[]}>} */
  const given = new Map();
  const names = (/** @type {(string | {flag: string})[] | undefined} */ l) => l?.map((k) => (typeof k === "string" ? k : k.flag));
  for (const a of o.acts ?? []) {
    if (typeof a === "string") given.set(a, {});
    else given.set(a.id, { fresh: a.fresh, keep: names(a.keep), leave: names(a.leave) });
  }
  // the runs, each with the act it searched (a whole game's run spans several acts: no act's alone)
  const runs = [];
  for (const d of graphs) {
    const act = d.act ?? d.from ?? null;
    if (!act) { notes.push(`${d.file ?? "a run"}: no act named (made before graph.mjs wrote what it hands over): left out`); continue; }
    if (!d.act && d.next) { notes.push(`${d.file ?? "a run"}: a run of the whole game (no --act) goes on through the acts: left out (search each act alone)`); continue; }
    runs.push({ act, d });
  }
  // the acts' order: as given, else from the runs' next
  const order = given.size ? [...given.keys()] : chain(runs.map((r) => [r.act, r.d.next ?? null]));
  for (const r of runs) if (!order.includes(r.act)) { notes.push(`${r.d.file ?? "a run"}: act "${r.act}" isn't one of the game's acts`); order.push(r.act); }

  const tested = o.flags?.testedInPlay ?? o.flags?.tested, testedSet = tested ? new Set(tested) : null, setAnywhere = o.flags?.set ? new Set(o.flags.set) : null;
  /** tested anywhere at all (a hint's condition too), and where */
  const testedAll = o.flags?.tested ? new Set(o.flags.tested) : null, testedAt = o.flags?.testedAt ?? {};

  /** One run's flags: read (with the steps reading them), written, its start. @param {HandoffGraph} d */
  const flagsOf = (d) => {
    /** @type {Map<string, string[]>} */
    const reads = new Map();
    const written = new Set(), start = new Set();
    for (const m of d.moves ?? []) {
      for (const [f] of [...(m.reads ?? []), ...(m.neg ?? [])]) {
        const n = flagOf(f);
        if (!n || !ours(n)) continue;
        let l = reads.get(n);
        if (!l) reads.set(n, (l = []));
        const step = `${m.room || "anywhere"}: ${m.move}`;
        if (l.length < AT && !l.includes(step)) l.push(step);
      }
      for (const f of m.writes ?? []) { const n = f.startsWith("!") ? null : flagOf(f); if (n && ours(n)) written.add(n); }
    }
    for (const f of d.start ?? []) { const n = flagOf(f); if (n) start.add(n); }
    return { reads, written, start };
  };

  /** @type {HandoffAct[]} */
  const acts = [];
  /** @type {HandoffProblem[]} */
  const problems = [];
  /** flags the runs of the acts so far write */
  const before = new Set();
  let earlierRuns = 0;
  const allReads = new Set();
  const per = order.map((id) => runs.filter((r) => r.act === id).map((r) => ({ ...r, ...flagsOf(r.d) })));
  for (const list of per) for (const r of list) for (const f of r.reads.keys()) allReads.add(f);

  order.forEach((id, index) => {
    const list = per[index], g = given.get(id), first = list[0]?.d;
    const next = order[index + 1] ?? null;
    /** @param {string} a @param {string[] | null | undefined} fromRun */
    const keepOf = (a, fromRun) => {
      if (order.indexOf(a) === 0) return [];
      const ga = given.get(a);
      if (ga && ga.fresh !== undefined) return ga.fresh ? ga.keep ?? [] : null;
      return fromRun === undefined ? null : fromRun;
    };
    const keep = keepOf(id, first?.keep);
    const leave = g?.leave ?? first?.leave ?? [];
    const nextKeep = next ? keepOf(next, list.find((r) => r.d.next === next)?.d.nextKeep ?? per[index + 1]?.[0]?.d.keep) : null;
    const reads = new Map(), written = new Set(), start = new Set();
    for (const r of list) {
      for (const [f, at] of r.reads) { const l = reads.get(f) ?? []; for (const s of at) if (l.length < AT && !l.includes(s)) l.push(s); reads.set(f, l); }
      for (const f of r.written) written.add(f);
      for (const f of r.start) start.add(f);
    }
    /** @type {HandoffProblem[]} */
    const mine = [];
    const say = (/** @type {HandoffProblem} */ p) => { mine.push(p); problems.push(p); };
    const fresh = index > 0 && keep !== null;
    if (fresh) {
      const left = [];
      for (const [f, at] of reads) {
        if (written.has(f) || start.has(f) || keep.includes(f)) continue;
        if (!(earlierRuns ? before.has(f) : setAnywhere?.has(f))) continue;
        if (leave.includes(f)) { left.push(f); continue; }
        say({ level: "error", act: id, flag: f, at, msg: earlierRuns ? `reads "${f}", which an earlier act sets, but doesn't keep it (here it is always unset)`
          : `reads "${f}", which the game sets elsewhere (no run of an earlier act to tell where), but doesn't keep it` });
      }
      if (left.length) say({ level: "info", act: id, msg: `left behind on purpose (leave): ${left.sort().join(", ")}, which an earlier act sets and this one reads as unset` });
    }
    if (list.length) {
      // the next act takes it (fresh: in its keep; not fresh: everything comes along)
      const arrives = (/** @type {string} */ f) => !!next && (nextKeep === null || nextKeep.includes(f));
      for (const f of keep ?? []) {
        if (!ours(f) || reads.has(f) || arrives(f)) continue;
        // a flag the game tests that no run reads: read where the solver doesn't go (a look that only talks, a drawn screen)
        if (testedAll?.has(f)) {
          const where = (testedAt[f] ?? []).slice(0, AT);
          say({ level: "info", act: id, flag: f, at: where, msg: `keeps "${f}", which no run of it reads: read only where the solver doesn't go${where.length ? `: ${where.join("; ")}` : ""}` });
        } else say({ level: "warning", act: id, flag: f, msg: `keeps "${f}", which no run of it reads${testedAll ? " and nothing in the game tests" : ""}${next ? `, and ${next} doesn't keep it` : " (the last act)"}: kept for nothing` });
      }
      if (next && nextKeep !== null) {
        for (const f of written) if (!reads.has(f) && (testedSet ?? allReads).has(f) && !nextKeep.includes(f))
          say({ level: "warning", act: id, flag: f, msg: `sets "${f}", which the game tests, but nothing here reads it and ${next} doesn't keep it: a consequence that never arrives` });
      }
      // runs that read what only other runs of the act write: one warning per flag
      /** @type {Map<string, {run: string, at: string[]}[]>} */
      const touch = new Map();
      for (const q of list) for (const [f, at] of q.reads) {
        if (q.written.has(f) || q.start.has(f) || !list.some((p) => p !== q && p.written.has(f))) continue;
        let l = touch.get(f);
        if (!l) touch.set(f, (l = []));
        l.push({ run: label(q.d), at });
      }
      for (const [f, detail] of [...touch].sort((a, b) => a[0].localeCompare(b[0]))) {
        const writers = list.filter((p) => p.written.has(f)).map((p) => label(p.d)), runs = detail.map((d) => d.run), n = runs.length;
        /** @type {string[]} */
        const at = [];
        for (const d of detail) for (const s of d.at) if (at.length < AT && !at.includes(s)) at.push(s);
        say({ level: "warning", act: id, flag: f, at, runs, writers, detail,
          msg: `"${f}" is set only by the run${writers.length > 1 ? "s" : ""} ${writers.join(", ")} but read by ${n} other run${n === 1 ? "" : "s"}${n <= FEW ? ` (${runs.join(", ")})` : ""}` });
      }
    }
    // the ways it hands over: distinct projections across runs (each run its own search)
    /** @type {Map<string, {flags: Record<string, any>, n: number, runs: string[]}>} */
    const ways = new Map();
    let any = false;
    for (const r of list) {
      const e = r.d.ends;
      if (!e || !next || nextKeep === null) continue;
      any = true;
      for (const p of e.projections ?? []) {
        const k = JSON.stringify(Object.keys(p.flags).sort().map((f) => [f, p.flags[f]]));
        const w = ways.get(k);
        if (w) { w.n += p.n; if (!w.runs.includes(label(r.d))) w.runs.push(label(r.d)); } else ways.set(k, { flags: p.flags, n: p.n, runs: [label(r.d)] });
      }
    }
    const variants = any ? { count: ways.size, projections: [...ways.values()].sort((a, b) => b.n - a.n) } : null;
    if (variants && nextKeep?.length) {
      say({ level: "info", act: id, msg: `hands over to ${next} in ${variants.count} way${variants.count === 1 ? "" : "s"} (it keeps ${nextKeep.join(", ")}): ` +
        variants.projections.map((p) => `${show(p.flags)} ×${p.n}`).join(", ") + (list.length > 1 ? " (each run is a search of its own: their ends are not weighed against each other)" : "") });
    } else if (list.length && next && nextKeep === null) say({ level: "info", act: id, msg: `${next} isn't fresh: everything this act leaves comes along` });

    acts.push({ id, index, fresh: index > 0 && keep !== null, keep, leave, next, nextKeep,
      runs: list.map((r) => ({ label: label(r.d), set: r.d.set ?? [], file: r.d.file ?? "", states: r.d.states ?? null, complete: r.d.complete !== false })),
      reads: [...reads.keys()].sort(), written: [...written].sort(), start: [...start].sort(), variants, problems: mine });
    for (const r of list) for (const f of r.written) before.add(f);
    earlierRuns += list.length;
  });
  return { acts, notes, problems, errors: problems.filter((p) => p.level === "error").length, warnings: problems.filter((p) => p.level === "warning").length };
}

/** A run's name: what its search was given (--set), or "(all)". @param {HandoffGraph} d */
const label = (d) => (d.set?.length ? `[${d.set.join(",")}]` : "[all]");

/** Kept flags as words: {a, b=2}, or {} for none. @param {Record<string, any>} flags */
const show = (flags) => `{${Object.entries(flags).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(", ")}}`;

/** The acts' order from (act, next) pairs: chains followed from those nothing leads to. @param {[string, string | null][]} pairs */
function chain(pairs) {
  /** @type {Map<string, string | null>} */
  const next = new Map();
  for (const [a, n] of pairs) if (!next.get(a)) next.set(a, n);
  const targets = new Set([...next.values()].filter(Boolean));
  /** @type {string[]} */
  const out = [];
  for (const a of [...next.keys()].filter((a) => !targets.has(a)).concat([...next.keys()])) {
    for (let c = /** @type {string | null | undefined} */ (a); c && !out.includes(c); c = next.get(c)) out.push(c);
  }
  return out;
}

/**
 * The report as lines of text (tools/handoff.mjs prints them).
 * @param {HandoffReport} r @returns {string[]}
 */
export function formatHandoff(r) {
  const out = [];
  for (const n of r.notes) out.push(`note   ${n}`);
  for (const a of r.acts) {
    const keeps = (a.index === 0 ? "the first act" : a.keep === null ? "not fresh: everything comes along" : a.keep.length ? `keeps ${a.keep.join(", ")}` : "keeps nothing") +
      (a.leave.length ? `; leaves ${a.leave.join(", ")}` : "");
    out.push(`act ${a.id} (${keeps}): ${a.runs.length ? `${a.runs.length} run${a.runs.length === 1 ? "" : "s"} ${a.runs.map((x) => x.label).join(" ")}, reads ${a.reads.length} flags, writes ${a.written.length}` : "no runs"}`);
    for (const p of a.problems) out.push(`  ${p.level === "error" ? "ERROR" : p.level === "warning" ? "warn " : "info "}  ${p.msg}${p.at?.length ? ` (${p.at.join("; ")})` : ""}`);
  }
  out.push(`handoff: ${r.acts.length} acts, ${r.acts.reduce((n, a) => n + a.runs.length, 0)} runs: ${r.errors} errors, ${r.warnings} warnings`);
  return out;
}
