// The solver: a breadth-first search over game states, driven by the engine's own interaction code
// in Node (instant speech and walking). A state is a save snapshot; a move is one player action:
//   act (default action on a hotspot or actor), look, with (item on a hotspot or actor),
//   combine (item on item), ilook (look at an item), switch (to another party member).
// Dialogue choices branch: a move that opens choices is replayed once per choice (choice points
// already seen with the same state and node are skipped, so dialogue loops end).
// With `full`, the game's hints (Cutaway.hints) are checked in every state that can still be won: one
// must hold there, and what it is `about` must still be on a shortest way to the end.
import { boot } from "./game.mjs";

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
 * @param {{C: any, options: any}} g a loaded game (loadGame)
 */
export async function makeSolver(g) {
  const run = await boot(g, { instant: true });
  const C = g.C;
  const start = C.save.capture();

  /**
   * A state's identity: rooms (not positions), who plays, the party and the game state. Canonical:
   * object keys sorted and inventories as sets, so the same state reached in a different order (flags
   * set the other way round, items picked up in another order) is one state, not many.
   * @param {any} snap
   */
  function key(snap) {
    const actors = Object.fromEntries(Object.entries(snap.actors).map(([id, a]) => [id, a.room]));
    const inv = Object.fromEntries(Object.entries(snap.state.inv ?? {}).filter(([, l]) => l.length).map(([who, l]) => [who, [...l].sort()]));
    const party = { ...snap.party, locked: [...(snap.party.locked ?? [])].sort(), staying: [...(snap.party.staying ?? [])].sort() };
    return canon([snap.room, snap.active, actors, party, { ...snap.state, inv }]);
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
   * @param {{from?: any, maxStates?: number, full?: boolean}} [o]
   */
  async function search(o = {}) {
    const from = o.from ?? start, maxStates = o.maxStates ?? 100000;
    /** @type {Map<string, {snap: any, parent: string | null, move: Move | null, next: Map<string, Move>, win: boolean}>} */
    const nodes = new Map();
    const k0 = key(from);
    nodes.set(k0, { snap: from, parent: null, move: null, next: new Map(), win: false });
    const queue = [k0];
    let winKey = null, complete = true;
    while (queue.length) {
      if (nodes.size >= maxStates) { complete = false; break; }
      const k = /** @type {string} */ (queue.shift()), node = /** @type {any} */ (nodes.get(k));
      for (const m of await moves(node.snap)) {
        for (const r of await play(node.snap, m)) {
          const rk = r.ended ? "WIN:" + key(r.snap) : key(r.snap);
          if (!node.next.has(rk)) node.next.set(rk, r.move);
          if (nodes.has(rk)) continue;
          nodes.set(rk, { snap: r.snap, parent: k, move: r.move, next: new Map(), win: r.ended });
          if (r.ended) { winKey ??= rk; if (!o.full) { queue.length = 0; break; } continue; }
          queue.push(rk);
        }
        if (winKey && !o.full) break;
      }
    }
    /** @param {string | null} k */
    const pathTo = (k) => { const p = []; for (let n = k ? nodes.get(k) : null; n && n.move; n = n.parent ? nodes.get(n.parent) : null) p.unshift(n.move); return p; };
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
      if (C.hints.any()) hints = await checkHints(nodes, dist, pathTo);
    }
    return { solved: !!winKey, path: pathTo(winKey), states: nodes.size, complete, softlocks, hints };
  }

  /**
   * Every state that can still be won needs a hint, and the hint's `about` must be on a shortest way
   * from there to the end.
   * @param {Map<string, {snap: any, next: Map<string, Move>, win: boolean}>} nodes
   * @param {Map<string, number>} dist
   * @param {(k: string) => Move[]} pathTo
   */
  async function checkHints(nodes, dist, pathTo) {
    const list = C.hints.all(), uses = list.map(() => 0);
    /** @type {{path: Move[], hint: number, problem: string}[]} */
    const problems = [];
    for (const [k, n] of nodes) {
      const d = dist.get(k);
      if (n.win || d === undefined) continue;
      await C.save.apply(n.snap);
      const i = C.hints.currentIndex();
      if (i < 0) { problems.push({ path: pathTo(k), hint: -1, problem: "no hint holds here" }); continue; }
      uses[i]++;
      const about = list[i].about === undefined ? [] : [].concat(list[i].about);
      if (!about.length) continue;
      // one shortest way on: the names its moves touch (hotspots bare and as room/id, actors, items)
      const names = new Set();
      for (let cur = k, left = d; left > 0;) {
        const node = /** @type {any} */ (nodes.get(cur)), room = node.snap.room;
        const [c, m] = /** @type {[string, Move]} */ ([...node.next].find(([c]) => dist.get(c) === left - 1));
        for (const x of [m.id, m.item, m.a, m.b]) if (x) { const id = x.replace(/^@/, ""); names.add(id); names.add(`${room}/${id}`); }
        cur = c; left--;
      }
      if (!about.some((a) => names.has(a))) problems.push({ path: pathTo(k), hint: i, problem: `about ${about.join(", ")}, which the way to the end no longer needs` });
    }
    problems.sort((a, b) => a.path.length - b.path.length);
    return { uses, problems };
  }

  return { C, start, moves, play, search, key };
}
