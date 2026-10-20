// The solver: a breadth-first search over game states, driven by the engine's own interaction code
// in Node (instant speech and walking). A state is a save snapshot; a move is one player action:
//   act (default action on a hotspot or actor), look, with (item on a hotspot or actor),
//   combine (item on item), ilook (look at an item), switch (to another party member).
// Dialogue choices branch: a move that opens choices is replayed once per choice (choice points
// already seen with the same state and node are skipped, so dialogue loops end).
// With `full`, the game's hints (Cutaway.hints) are checked in every state that can still be won: one
// must hold there, and what it is `about` must still be on a shortest way to the end.
// With `workers` (and a `setup` to load the game again), worker threads expand the states
// (solver-worker.mjs), level by level, merged in a fixed order: the same states, paths and results as
// one thread, many times faster on a big game.
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { boot, loadGame } from "./game.mjs";

/** A snapshot packed for keeping (JSON, deflated: a big game has hundreds of thousands). @param {any} snap */
export const pack = (snap) => deflateRawSync(JSON.stringify(snap));
/** @param {Uint8Array} b */
export const unpack = (b) => JSON.parse(inflateRawSync(b).toString());

/**
 * Load a game for the solver from a description a worker thread can repeat: the page, extra scripts,
 * options over the page's own (`act`: the act to begin), and steps added to that act's start (a flag
 * kept from the act before).
 * @param {{page: string, scripts?: string[], options?: Record<string, any>, start?: any[]}} setup
 */
export function loadFor(setup) {
  const g = loadGame(setup.page, { scripts: setup.scripts });
  Object.assign(g.options, setup.options ?? {});
  if (setup.start?.length) {
    const a = g.C.act.get(g.options.act ?? g.C.acts.first());
    a.start = [...(a.start ?? []), ...setup.start];
  }
  return g;
}

/** @typedef {{kind: string, id?: string, item?: string, a?: string, b?: string, choices?: number[]}} Move */

/** Does a script do more than talk? (looks that only talk can't change the state) */
function acts(script) {
  if (script === undefined || script === null || typeof script === "string") return false;
  if (Array.isArray(script)) return script.some(acts);
  const keys = Object.keys(script).filter((k) => !["say", "text", "narrate", "id"].includes(k));
  return keys.length > 0;
}

export function describe(m) {
  const c = m.choices?.length ? ` [choices ${m.choices.join(",")}]` : "";
  if (m.kind === "with") return `use ${m.item} on ${m.id}${c}`;
  if (m.kind === "combine") return `combine ${m.a} + ${m.b}${c}`;
  if (m.kind === "ilook") return `look at ${m.item}${c}`;
  if (m.kind === "switch") return `switch to ${m.id}`;
  return `${m.kind} ${m.id}${c}`;
}

/**
 * @param {{C: any, options: any}} g a loaded game (loadGame, or loadFor(setup))
 * @param {{workers?: number, setup?: Parameters<typeof loadFor>[0]}} [opts]  workers: threads that
 *   expand states (each loads the game from `setup`, which must describe `g`); 0 or none: this thread
 */
export async function makeSolver(g, opts = {}) {
  const run = await boot(g, { instant: true });
  const C = g.C;
  const start = C.save.capture();

  /**
   * A state's identity: rooms (not positions), who plays, the party and the game state. Canonical:
   * object keys sorted and inventories as sets, so the same state reached in a different order (flags
   * set the other way round, items picked up in another order) is one state, not many. Hashed (SHA-1):
   * every edge of the search keeps one.
   * @param {any} snap
   */
  function key(snap) {
    const actors = Object.fromEntries(Object.entries(snap.actors).map(([id, a]) => [id, a.room]));
    const inv = Object.fromEntries(Object.entries(snap.state.inv ?? {}).filter(([, l]) => l.length).map(([who, l]) => [who, [...l].sort()]));
    const party = { ...snap.party, locked: [...(snap.party.locked ?? [])].sort(), staying: [...(snap.party.staying ?? [])].sort() };
    return createHash("sha1").update(canon([snap.room, snap.active, actors, party, { ...snap.state, inv }])).digest("base64");
  }

  /** JSON with sorted object keys. @param {any} v @returns {string} */
  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
    return JSON.stringify(v) ?? "null";
  }

  /** @param {any} snap @returns {Promise<Move[]>} */
  async function moves(snap) {
    await C.save.apply(snap);
    /** @type {Move[]} */
    const out = [];
    const items = C.state.items();
    for (const h of C.scene.hotspots()) {
      if (C.ui.verbOf(h.def) !== "look") out.push({ kind: "act", id: h.id });
      if (acts(h.def.look)) out.push({ kind: "look", id: h.id });
      for (const it of items) {
        const mate = h.actor && C.party.has(h.actor) && !C.state.sameBag(snap.active, h.actor);
        if (h.def.with?.[it] !== undefined || h.def.with?.["*"] !== undefined || mate) out.push({ kind: "with", id: h.id, item: it });
      }
    }
    for (let i = 0; i < items.length; i++) {
      const di = C.item.get(items[i]);
      if (acts(di?.look)) out.push({ kind: "ilook", item: items[i] });
      for (let j = i + 1; j < items.length; j++) {
        const dj = C.item.get(items[j]);
        if (di?.combine?.[items[j]] !== undefined || dj?.combine?.[items[i]] !== undefined) out.push({ kind: "combine", a: items[i], b: items[j] });
      }
    }
    for (const p of C.party.playable()) if (p !== snap.active) out.push({ kind: "switch", id: p });
    return out;
  }

  /** @param {Move} m */
  function perform(m) {
    if (m.kind === "act") return C.ui.interact(m.id, "act");
    if (m.kind === "look") return C.ui.interact(m.id, "look");
    if (m.kind === "with") return C.ui.interact(m.id, "act", m.item);
    if (m.kind === "combine") return C.inventory.combine(m.a, m.b);
    if (m.kind === "ilook") return C.inventory.look(m.item);
    if (m.kind === "switch") return C.party.switchTo(m.id);
    throw new Error("unknown move " + m.kind);
  }

  const flush = () => new Promise((r) => setImmediate(r));

  /**
   * Play a move from a state; one result per sequence of dialogue choices it can take.
   * @param {any} snap
   * @param {Move} m
   * @returns {Promise<{move: Move, snap: any, ended: boolean}[]>}
   */
  async function play(snap, m, choices = [], seen = new Set()) {
    await C.save.apply(snap);
    run.reset();
    let used = 0, need = 0, dup = false;
    C.dialogs.setChooser((texts, at) => {
      if (used < choices.length) return choices[used++];
      // a choice point already reached with the same state and node leads nowhere new
      const k = `${at.dialog}/${at.node}/${key(C.save.capture())}`;
      if (seen.has(k)) dup = true; else { seen.add(k); need = texts.length; }
      return -1;                                          // end the dialogue; this run is discarded
    });
    let error = null;
    const origError = console.error;
    console.error = (...a) => { error = a.map(String).join(" "); };
    try {
      await Promise.race([perform(m), flush().then(flush)]);
      await flush();
    } finally {
      console.error = origError;
      C.dialogs.setChooser(null);
    }
    if (error) throw new Error(`${describe({ ...m, choices })}: ${error}`);
    if (dup) return [];
    if (need) {
      const out = [];
      for (let i = 0; i < need && choices.length < 40; i++) out.push(...(await play(snap, m, [...choices, i], seen)));
      return out;
    }
    if (C.script.busy) throw new Error(`${describe({ ...m, choices })}: the script did not finish (waiting for something?)`);
    return [{ move: { ...m, choices }, snap: C.save.capture(), ended: run.ended }];
  }

  /**
   * Search from a state. Returns the shortest winning path, and with `full`, the soft-locks
   * (reachable states from which the end can't be reached any more).
   * @param {{from?: any, maxStates?: number, full?: boolean, progress?: (text: string) => void}} [o]  progress: how far it has got, after each level
   */
  async function search(o = {}) {
    const from = o.from ?? start, maxStates = o.maxStates ?? 100000;
    const pool = opts.workers && opts.workers > 0 ? await startPool(opts.workers) : null;
    try {
      return await searchWith(pool, from, maxStates, o);
    } finally {
      pool?.close();
    }
  }

  /**
   * Expand states here: every move from each, the states they lead to (one per key, the first move;
   * the snapshot only of a state the search doesn't have yet).
   * @param {Uint8Array[]} snaps packed
   * @param {(k: string) => boolean} known
   * @returns {Promise<{rk: string, move: Move, ended: boolean, room: string, snap: Uint8Array | null}[][]>}
   */
  async function expandHere(snaps, known) {
    const out = [];
    for (const packed of snaps) {
      const snap = unpack(packed), res = [], here = new Set();
      for (const m of await moves(snap)) {
        for (const r of await play(snap, m)) {
          const rk = r.ended ? "WIN:" + key(r.snap) : key(r.snap);
          if (here.has(rk)) continue;
          here.add(rk);
          res.push({ rk, move: r.move, ended: r.ended, room: r.snap.room, snap: known(rk) ? null : pack(r.snap) });
        }
      }
      out.push(res);
    }
    return out;
  }

  /** @param {Uint8Array[]} snaps */
  async function hintHere(snaps) {
    const out = [];
    for (const s of snaps) { await C.save.apply(unpack(s)); out.push(C.hints.currentIndex()); }
    return out;
  }

  /** Worker threads, each with the game loaded. @param {number} n */
  async function startPool(n) {
    if (!opts.setup) throw new Error("solver: workers need a setup to load the game");
    const url = new URL("./solver-worker.mjs", import.meta.url);
    let seq = 0;
    /** @type {Map<number, {resolve: (v: any) => void, reject: (e: any) => void}>} */
    const waiting = new Map();
    /** @type {Worker[]} */
    const workers = await Promise.all(Array.from({ length: n }, () => new Promise((resolve, reject) => {
      const w = new Worker(url, { workerData: { setup: opts.setup } });
      w.on("error", reject);
      w.on("message", (m) => {
        if (m.ready) { resolve(w); return; }
        const p = waiting.get(m.id);
        waiting.delete(m.id);
        if (m.error) p?.reject(new Error(m.error)); else p?.resolve(m.out);
      });
    })));
    const idle = [...workers];
    /** @type {(() => void)[]} */
    const queue = [];
    /** Run one job on the next idle worker (none if `halted` by then). @param {string} op @param {Uint8Array[]} states
     * @param {() => boolean} halted @returns {Promise<any[]>} */
    const job = (op, states, halted) => new Promise((resolve, reject) => {
      const go = () => {
        if (halted()) { queue.shift()?.(); resolve([]); return; }
        const w = /** @type {Worker} */ (idle.pop()), id = ++seq;
        const free = () => { idle.push(w); queue.shift()?.(); };
        waiting.set(id, { resolve: (v) => { free(); resolve(v); }, reject: (e) => { free(); reject(e); } });
        w.postMessage({ op, id, states });
      };
      if (idle.length) go(); else queue.push(go);
    });
    return { size: n, job, close: () => { for (const w of workers) w.terminate(); } };
  }

  /**
   * Run states through the pool (or here) in batches; `each` gets every batch's results in the order
   * of the batches, as soon as all before it are in.
   * @param {any} pool @param {"expand" | "hint"} op @param {Uint8Array[]} states @param {(out: any[], from: number) => void} each
   * @param {(k: string) => boolean} [known]  (here) a state the search already has
   * @param {() => boolean} [halted]  the search has stopped: the batches still to go are left out
   */
  async function batches(pool, op, states, each, known = () => false, halted = () => false) {
    const size = pool ? Math.max(8, Math.min(200, Math.ceil(states.length / (pool.size * 4)))) : 64;
    /** @type {Map<number, any[]>} */
    const done = new Map();
    let next = 0;
    const flush = () => { while (done.has(next)) { const out = /** @type {any[]} */ (done.get(next)); done.delete(next); each(out, next * size); next++; } };
    const jobs = [];
    for (let i = 0, b = 0; i < states.length; i += size, b++) {
      const part = states.slice(i, i + size), n = b;
      if (pool) jobs.push(pool.job(op, part, halted).then((out) => { done.set(n, out); flush(); }));
      else if (halted()) break;
      else { done.set(n, op === "expand" ? await expandHere(part, known) : await hintHere(part)); flush(); }   // one after another
    }
    await Promise.all(jobs);
  }

  /**
   * The search itself, level by level (breadth first).
   * @param {any} pool @param {any} from @param {number} maxStates @param {{full?: boolean, progress?: (text: string) => void}} o
   */
  async function searchWith(pool, from, maxStates, o) {
    /** @type {Map<string, {snap: Uint8Array, room: string, parent: string | null, move: Move | null, next: Map<string, Move>, win: boolean}>} */
    const nodes = new Map();
    const k0 = key(from), t0 = Date.now();
    const say = (/** @type {string} */ text) => o.progress?.(`${Math.round((Date.now() - t0) / 1000)}s ${text}`);
    nodes.set(k0, { snap: pack(from), room: from.room, parent: null, move: null, next: new Map(), win: false });
    /** @type {string | null} */
    let winKey = null;
    let level = [k0], complete = true, stop = false;
    while (level.length && !stop) {
      /** @type {string[]} */
      const nextLevel = [];
      const cur = level;
      await batches(pool, "expand", cur.map((k) => /** @type {any} */ (nodes.get(k)).snap), (out, at) => {
        out.forEach((res, j) => {
          if (stop) return;
          if (nodes.size >= maxStates) { complete = false; stop = true; return; }
          const k = cur[at + j], node = /** @type {any} */ (nodes.get(k));
          for (const r of res) {
            if (!node.next.has(r.rk)) node.next.set(r.rk, r.move);
            if (nodes.has(r.rk)) continue;
            if (r.snap === null) throw new Error("solver: a worker sent a state the search doesn't have");
            nodes.set(r.rk, { snap: r.snap, room: r.room, parent: k, move: r.move, next: new Map(), win: r.ended });
            if (r.ended) { winKey ??= r.rk; if (!o.full) { stop = true; return; } continue; }
            nextLevel.push(r.rk);
          }
        });
      }, (rk) => nodes.has(rk), () => stop);
      level = nextLevel;
      say(`${nodes.size} states, ${level.length} new`);
    }
    /** @param {string | null} k */
    const pathTo = (k) => { const p = []; for (let n = k ? nodes.get(k) : null; n && n.move; n = n.parent ? nodes.get(n.parent) : null) p.unshift(n.move); return p; };
    /** The moves to a state, counted. @param {string} k */
    const depthOf = (k) => { let d = 0; for (let n = nodes.get(k); n && n.move; n = n.parent ? nodes.get(n.parent) : null) d++; return d; };
    let softlocks = [], hints = null;
    if (o.full && complete) {
      // moves to the end from every state: a breadth-first search backwards from the wins
      /** @type {Map<string, number>} */
      const dist = new Map();
      /** @type {Map<string, string[]>} */
      const back = new Map();
      for (const [k, n] of nodes) for (const c of n.next.keys()) { let b = back.get(c); if (!b) back.set(c, (b = [])); b.push(k); }
      const todo = [...nodes].filter(([, n]) => n.win).map(([k]) => k);
      for (const k of todo) dist.set(k, 0);
      for (let i = 0; i < todo.length; i++) for (const p of back.get(todo[i]) ?? []) if (!dist.has(p)) { dist.set(p, /** @type {number} */ (dist.get(todo[i])) + 1); todo.push(p); }
      softlocks = [...nodes.keys()].filter((k) => !dist.has(k)).map((k) => pathTo(k)).sort((a, b) => a.length - b.length);
      say("the way back from the end done; the hints");
      if (C.hints.any()) hints = await checkHints(pool, nodes, dist, pathTo, depthOf);
      say("the hints done");
    }
    return { solved: !!winKey, path: pathTo(winKey), states: nodes.size, complete, softlocks, hints };
  }

  /**
   * Every state that can still be won needs a hint, and the hint's `about` must be on a shortest way
   * from there to the end.
   * @param {any} pool
   * @param {Map<string, {snap: Uint8Array, next: Map<string, Move>, win: boolean}>} nodes
   * @param {Map<string, number>} dist
   * @param {(k: string) => Move[]} pathTo
   * @param {(k: string) => number} depthOf
   */
  async function checkHints(pool, nodes, dist, pathTo, depthOf) {
    const list = C.hints.all(), uses = list.map(() => 0);
    /** @type {{path: Move[], depth: number, hint: number, problem: string}[]} */
    const problems = [];
    /** A problem; its path (the moves to it) is made when asked for: there may be very many. @param {string} k @param {number} hint @param {string} problem */
    const found = (k, hint, problem) => problems.push({ hint, problem, depth: depthOf(k), get path() { return pathTo(k); } });
    const keys = [...nodes].filter(([k, n]) => !n.win && dist.has(k)).map(([k]) => k);
    /** @type {Map<string, number>} */
    const current = new Map();
    await batches(pool, "hint", keys.map((k) => /** @type {any} */ (nodes.get(k)).snap), (out, at) => out.forEach((i, j) => current.set(keys[at + j], i)));
    for (const k of keys) {
      const d = /** @type {number} */ (dist.get(k));
      const i = /** @type {number} */ (current.get(k));
      if (i < 0) { found(k, -1, "no hint holds here"); continue; }
      uses[i]++;
      const about = new Set(list[i].about === undefined ? [] : [].concat(list[i].about));
      if (!about.size) continue;
      // along one shortest way on, until a move touches what it is about (hotspots bare and as
      // room/id, actors, items)
      let on = false;
      for (let cur = k, left = d; left > 0 && !on; left--) {
        const node = /** @type {any} */ (nodes.get(cur));
        const [c, m] = /** @type {[string, Move]} */ ([...node.next].find(([c]) => dist.get(c) === left - 1));
        for (const x of [m.id, m.item, m.a, m.b]) if (x) { const id = x.replace(/^@/, ""); if (about.has(id) || about.has(`${node.room}/${id}`)) on = true; }
        cur = c;
      }
      if (!on) found(k, i, `about ${[...about].join(", ")}, which the way to the end no longer needs`);
    }
    problems.sort((a, b) => a.depth - b.depth);
    return { uses, problems };
  }

  return { C, start, moves, play, search, key };
}
