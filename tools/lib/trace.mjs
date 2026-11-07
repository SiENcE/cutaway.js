// Watch the moves the solver plays (solver.mjs, `trace`): what each read of the state before it changed
// anything, and what it changed. A step is a move with what it changed (the same click can open a box in
// one state and take what is in it in another: two steps); every play of a step adds to what it read, so
// a fact read in all of them is what the step needs. Plays that change nothing are no steps.
// A fact is a condition's words: "flag", "flag=3", "has:item", "state:room/id=open", "visited:room",
// "at:actor=room", and "hidden:room/id" / "shown:room/id" for what a script hid or showed (a thing as
// its room has it is no fact); a fact read as absent (a flag not set, an item not carried) counts apart
// (`neg`), and a change that takes one away is written "!fact". Dialogue's own once-marks (`~dlg.`) and
// the game's view flags are left out: they are no facts of the story. A move made in a room needs Juno
// (whoever plays) to have got there: "visited:room", brought about by the move that first led there.
import { describe } from "./solver.mjs";

/**
 * @typedef {{room: string, move: string, writes: string[], n: number, wins: number, reads: Record<string, number>,
 *   neg: Record<string, number>}} TracedMove
 *   a step: the move and what it changes; n: how often it was played; wins: how often it ended the game;
 *   what it read, each fact with how often
 */

/** @param {any} v a flag's value */
const truthy = (v) => v !== undefined && v !== null && v !== false && v !== 0 && v !== "";
/** A flag as a fact: "name" when it is plainly on, else "name=value". @param {string} name @param {any} v */
const flagFact = (name, v) => (v === true ? name : `${name}=${v}`);

/** @param {any} C the engine (Cutaway) @param {string[]} views the game's view flags */
export function makeTracer(C, views) {
  const skip = new Set(views);
  /** @type {Map<string, TracedMove>} */
  let acc = new Map();
  /** this move's reads: fact -> read as there (true) or absent (false) */
  let reads = new Map();
  let quiet = 0, before = /** @type {any} */ (null);

  // what is asked about every hotspot at once, by the hints, or by whoever listens to an event (names,
  // music, the screen following the state) is no move's own question
  for (const [mod, fn] of [[C.scene, "hotspots"], [C.hints, "currentIndex"], [C.events, "emit"]]) {
    const orig = mod[fn];
    mod[fn] = (/** @type {any[]} */ ...a) => { quiet++; try { return orig.apply(mod, a); } finally { quiet--; } };
  }

  /** Was this the value before the move? (a read after the move changed it is no condition of it) @param {string} kind @param {string} name @param {any} v */
  function asBefore(kind, name, v) {
    const st = before.state ?? {};
    if (kind === "flag") return typeof v === "boolean" ? truthy(st.flags?.[name]) === v : (st.flags?.[name] ?? undefined) === (v ?? undefined);
    if (kind === "item") return Object.values(st.inv ?? {}).some((l) => /** @type {string[]} */ (l).includes(name)) === v;
    if (kind === "obj") return (st.obj?.[name] ?? "") === v;
    if (kind === "hidden") return name in (st.hidden ?? {}) && st.hidden[name] === v;   // only what a script set
    if (kind === "visited") return !!st.visited?.[name] === v;
    if (kind === "at") return before.actors?.[name]?.room === v;
    return true;
  }

  /** @param {string} kind @param {string} name @param {any} v */
  function watch(kind, name, v) {
    if (quiet || (kind === "flag" && (skip.has(name) || name.startsWith("~dlg.")))) return;
    if (!asBefore(kind, name, v)) return;
    let fact, there = truthy(v);
    if (kind === "flag") fact = there ? flagFact(name, v) : name;
    else if (kind === "item") fact = `has:${name}`;
    else if (kind === "obj") fact = there ? `state:${name}=${v}` : `state:${name}`;
    else if (kind === "at") { fact = `at:${name}=${v ?? ""}`; there = true; }
    else if (kind === "hidden") { fact = `${v ? "hidden" : "shown"}:${name}`; there = true; }
    else fact = `${kind}:${name}`;
    if (!reads.has(fact)) reads.set(fact, there);
  }

  /** What a move changed, as facts. @param {any} a the state before @param {any} b after */
  function changes(a, b) {
    const out = [];
    const fa = a.flags ?? {}, fb = b.flags ?? {};
    for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
      if (skip.has(k) || k.startsWith("~dlg.") || JSON.stringify(fa[k]) === JSON.stringify(fb[k])) continue;
      out.push(truthy(fb[k]) ? flagFact(k, fb[k]) : "!" + k);
    }
    const held = (/** @type {any} */ s) => new Set(Object.values(s.inv ?? {}).flat());
    const ha = held(a), hb = held(b);
    for (const i of hb) if (!ha.has(i)) out.push(`has:${i}`);
    for (const i of ha) if (!hb.has(i)) out.push(`!has:${i}`);
    for (const [k, v] of Object.entries(b.obj ?? {})) if ((a.obj ?? {})[k] !== v) out.push(v ? `state:${k}=${v}` : `!state:${k}`);
    for (const [k, v] of Object.entries(b.hidden ?? {})) if ((a.hidden ?? {})[k] !== v) out.push(v ? `hidden:${k}` : `shown:${k}`);
    for (const k of Object.keys(b.visited ?? {})) if (!(a.visited ?? {})[k]) out.push(`visited:${k}`);
    return out.sort();
  }

  /** @param {Map<string, number> | Record<string, number>} into @param {string} k @param {number} [by] */
  const bump = (into, k, by = 1) => { /** @type {any} */ (into)[k] = (/** @type {any} */ (into)[k] ?? 0) + by; };

  /** A step's name: where, the move, what it changes. @param {string} room @param {string} move @param {string[]} writes */
  const stepKey = (room, move, writes) => `${room}|${move}|${writes.join(",")}`;
  /** Where a move counts: waiting, and items put together or looked at in the bag, are the same step in every room (""). @param {any} snap @param {any} m */
  const where = (snap, m) => (m.kind === "combine" || m.kind === "ilook" || m.kind === "wait" ? "" : snap.room);
  /** @param {string} room @param {string} move @param {string[]} writes */
  function entry(room, move, writes) {
    const key = stepKey(room, move, writes);
    let e = acc.get(key);
    if (!e) acc.set(key, (e = { room, move, writes, n: 0, wins: 0, reads: {}, neg: {} }));
    return e;
  }

  return {
    /** A move is about to be played from `snap` (already applied). @param {any} snap @param {any} m */
    begin(snap, m) {
      before = snap; reads = new Map(); quiet = 0;
      C.state.watch(watch);
      // the clicked hotspot's own condition: what made it there to click
      const def = m.id && !m.id.startsWith("@") ? C.scene.room?.hotspots?.[m.id] : null;
      if (def) { C.state.isHidden(m.id, !!def.hidden); C.state.test(def.if); }
      // what is used must be carried (the solver offers only what is), and where it is done must be reached
      for (const it of [m.item, m.a, m.b]) if (it) reads.set(`has:${it}`, true);
      if (m.kind !== "combine" && m.kind !== "ilook" && m.kind !== "wait" && snap.state?.visited?.[snap.room]) reads.set(`visited:${snap.room}`, true);
    },
    pause() { C.state.watch(null); },
    /** The move has been played. @param {any} snap before @param {any} m @param {any} after @param {boolean} ended */
    end(snap, m, after, ended) {
      const writes = changes(snap.state ?? {}, after.state ?? {});
      if (!writes.length && !ended) return;
      const e = entry(where(snap, m), describe(m), writes);
      e.n++;
      if (ended) e.wins++;
      for (const [f, there] of reads) bump(there ? e.reads : e.neg, f);
    },
    /** The step a move made between two states (the winning way's), or null if it changed nothing and didn't end the game.
     * @param {any} a @param {any} m @param {any} b @param {boolean} ended */
    stepOf(a, m, b, ended) { const w = changes(a.state ?? {}, b.state ?? {}); return w.length || ended ? stepKey(where(a, m), describe(m), w) : null; },
    /** Everything gathered since the last take, as plain data; starts afresh. @returns {Record<string, TracedMove>} */
    take() { const out = Object.fromEntries(acc); acc = new Map(); return out; },
    /** Add what another thread gathered. @param {Record<string, TracedMove>} other */
    merge(other) {
      for (const [k, o] of Object.entries(other)) {
        const e = entry(o.room, o.move, o.writes);
        e.n += o.n; e.wins += o.wins;
        for (const part of /** @type {const} */ (["reads", "neg"])) for (const [f, c] of Object.entries(o[part])) bump(e[part], f, c);
      }
    },
  };
}
