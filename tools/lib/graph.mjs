// The game's connections as data, from a traced search (solver.mjs with `trace`): which moves need which
// facts and which facts they bring about (the puzzle dependency chart), and how much each part of the
// state multiplies the states (the state budget). tools/graph.mjs writes it; tools/graph.html shows it.
import { unpack } from "./solver.mjs";

/** A flag with more values than this is a quantity (money, the time): its values are one fact, "name=…". */
const MANY = 6;

/**
 * @param {{trace: Record<string, import("./trace.mjs").TracedMove>, snaps: Uint8Array[], way: string[],
 *   states: number, complete: boolean}} r a traced search's result
 * @param {string[]} views the game's view flags (no part of a state)
 */
export function buildGraph(r, views) {
  // quantities: a flag seen with many values
  /** @type {Map<string, Set<string>>} */
  const values = new Map();
  const split = (/** @type {string} */ f) => { const m = /^!?([^:=!]+)=(.*)$/.exec(f); return m ? [m[1], m[2]] : null; };
  for (const t of Object.values(r.trace))
    for (const f of [...Object.keys(t.reads), ...Object.keys(t.neg), ...t.writes]) {
      const s = split(f);
      if (s) { let v = values.get(s[0]); if (!v) values.set(s[0], (v = new Set())); v.add(s[1]); }
    }
  // the clock's time is always a quantity (time.js): what matters of it is said by a moment or a routine
  const many = new Set([...values].filter(([k, v]) => v.size > MANY || k === "time").map(([k]) => k));
  const fold = (/** @type {string} */ f) => { const s = split(f); return s && many.has(s[0]) ? `${f.startsWith("!") ? "!" : ""}${s[0]}=…` : f; };
  const foldAll = (/** @type {string[]} */ l) => [...new Set(l.map(fold))].sort();
  const stepId = (/** @type {string} */ room, /** @type {string} */ move, /** @type {string[]} */ writes) => `${room}|${move}|${writes.join(",")}`;

  // steps again with quantities folded: the waits from 18:00 and from 18:15 are one step
  /** @type {Map<string, {id: string, room: string, move: string, writes: string[], n: number, wins: number, reads: Map<string, number>, neg: Map<string, number>}>} */
  const steps = new Map();
  /** @type {Map<string, string>} a traced step's name -> its folded one */
  const renamed = new Map();
  for (const [k, t] of Object.entries(r.trace)) {
    const writes = foldAll(t.writes), id = stepId(t.room, t.move, writes);
    renamed.set(k, id);
    let s = steps.get(id);
    if (!s) steps.set(id, (s = { id, room: t.room, move: t.move, writes, n: 0, wins: 0, reads: new Map(), neg: new Map() }));
    s.n += t.n; s.wins += t.wins;
    for (const [part, into] of /** @type {const} */ ([[t.reads, s.reads], [t.neg, s.neg]]))
      for (const [f, c] of Object.entries(part)) { const ff = fold(f); into.set(ff, (into.get(ff) ?? 0) + c); }
  }

  /** @type {Map<string, {id: string, by: Set<string>, needs: Set<string>, unless: Set<string>}>} */
  const facts = new Map();
  const fact = (/** @type {string} */ id) => { let f = facts.get(id); if (!f) facts.set(id, (f = { id, by: new Set(), needs: new Set(), unless: new Set() })); return f; };
  const moves = [];
  for (const s of steps.values()) {
    /** each fact with the share of the step's plays that read it @param {Map<string, number>} m @returns {[string, number][]} */
    const share = (m) => [...m].map(([f, c]) => /** @type {[string, number]} */ ([f, Math.min(1, Math.round((c / s.n) * 100) / 100)])).sort();
    const reads = share(s.reads), neg = share(s.neg);
    moves.push({ id: s.id, room: s.room, move: s.move, n: s.n, wins: s.wins, reads, neg, writes: s.writes });
    for (const [f] of reads) fact(f).needs.add(s.id);
    for (const [f] of neg) fact(f).unless.add(s.id);
    for (const f of s.writes) fact(f.replace(/^!/, "")).by.add(s.id);
  }
  const way = [];
  for (const k of r.way) { const id = renamed.get(k); if (id && way[way.length - 1] !== id) way.push(id); }
  return {
    states: r.states, complete: r.complete,
    moves: moves.sort((a, b) => a.id.localeCompare(b.id)),
    facts: [...facts.values()].map((f) => ({ id: f.id, by: [...f.by].sort(), needs: [...f.needs].sort(), unless: [...f.unless].sort() })).sort((a, b) => a.id.localeCompare(b.id)),
    quantities: [...many].sort(),
    way,
    factors: stateFactors(r.snaps, views),
  };
}

/** Two 32-bit hashes of a text (FNV-1a with two seeds). @param {string} s @returns {[number, number]} */
function hash2(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 0x01000193 + 2); }
  return [a >>> 0, b >>> 0];
}

/**
 * How much each part of the state multiplies the states: with it left out, how many states would be
 * left (factor = all states / those). A part that follows from the others has factor 1; a flag
 * nobody asks about that is set or not at any time has about 2. A state's identity is a sum of one
 * hash per part, so leaving one out is a subtraction (no state is built twice).
 * @param {Uint8Array[]} snaps packed states @param {string[]} views
 * @returns {{part: string, values: number, factor: number}[]} the parts with factor > 1, biggest first
 */
export function stateFactors(snaps, views) {
  const skip = new Set(views);
  /** @type {Map<string, number>} */
  const index = new Map();
  /** @type {string[]} */
  const names = [];
  /** @type {Map<number, Set<string>>} */
  const seenValues = new Map();
  const id = (/** @type {string} */ n) => { let i = index.get(n); if (i === undefined) { index.set(n, (i = names.length)); names.push(n); seenValues.set(i, new Set()); } return i; };
  let vi = new Int32Array(1 << 20), va = new Uint32Array(1 << 20), vb = new Uint32Array(1 << 20), len = 0;
  const starts = new Int32Array(snaps.length + 1), sa = new Uint32Array(snaps.length), sb = new Uint32Array(snaps.length);
  const add = (/** @type {string} */ part, /** @type {any} */ value) => {
    const v = JSON.stringify(value) ?? "null", i = id(part), [a, b] = hash2(part + "\u0000" + v);
    const sv = /** @type {Set<string>} */ (seenValues.get(i));
    if (sv.size < 64) sv.add(v);
    if (len === vi.length) {
      const grow = (/** @type {any} */ t) => { const n = new t.constructor(t.length * 2); n.set(t); return n; };
      vi = grow(vi); va = grow(va); vb = grow(vb);
    }
    vi[len] = i; va[len] = a; vb[len] = b; len++;
  };
  snaps.forEach((p, s) => {
    starts[s] = len;
    const snap = unpack(p), st = snap.state ?? {};
    add("room", snap.room);
    add("active", snap.active);
    for (const [a, d] of Object.entries(snap.actors ?? {})) add(`at:${a}`, /** @type {any} */ (d).room);
    add("party", { ...snap.party, locked: [...(snap.party?.locked ?? [])].sort(), staying: [...(snap.party?.staying ?? [])].sort() });
    for (const [k, v] of Object.entries(st.flags ?? {})) if (!skip.has(k)) add(k, v);
    for (const [who, l] of Object.entries(st.inv ?? {})) for (const it of /** @type {string[]} */ (l)) add(`has:${it}${who === snap.active ? "" : "@" + who}`, true);
    for (const kind of ["obj", "hidden", "visited", "once", "own"]) for (const [k, v] of Object.entries(st[kind] ?? {})) add(`${kind}:${k}`, v);
    let a = 0, b = 0;
    for (let j = starts[s]; j < len; j++) { a = (a + va[j]) >>> 0; b = (b + vb[j]) >>> 0; }
    sa[s] = a; sb[s] = b;
  });
  starts[snaps.length] = len;
  const n = snaps.length, out = [];
  // per part: every state's identity without it (a state without the part keeps its own)
  /** @type {Map<number, number[]>} where each part occurs: state, entry */
  const at = new Map();
  for (let s = 0; s < n; s++) for (let j = starts[s]; j < starts[s + 1]; j++) { let l = at.get(vi[j]); if (!l) at.set(vi[j], (l = [])); l.push(s, j); }
  const whole = new Set();
  for (let s = 0; s < n; s++) whole.add((sa[s] & 0x1fffff) * 4294967296 + sb[s]);
  for (const [i, occ] of at) {
    const vals = /** @type {Set<string>} */ (seenValues.get(i)).size + (occ.length / 2 < n ? 1 : 0);   // absent is a value too
    if (vals < 2) continue;
    const proj = new Float64Array(n), done = new Uint8Array(n);
    for (let k = 0; k < occ.length; k += 2) {
      const s = occ[k], j = occ[k + 1];
      proj[s] = (((sa[s] - va[j]) >>> 0) & 0x1fffff) * 4294967296 + ((sb[s] - vb[j]) >>> 0); done[s] = 1;
    }
    const left = new Set();
    for (let s = 0; s < n; s++) left.add(done[s] ? proj[s] : (sa[s] & 0x1fffff) * 4294967296 + sb[s]);
    const factor = whole.size / left.size;
    if (factor > 1.0001) out.push({ part: names[i], values: vals, factor: Math.round(factor * 1000) / 1000 });
  }
  return out.sort((a, b) => b.factor - a.factor || a.part.localeCompare(b.part));
}
