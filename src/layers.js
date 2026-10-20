// Cutaway.js layers: what the editor changes, kept in files the game loads after its own data.
//   Cutaway.edits({
//     rooms: { attic: { light: { ambient: 0.8 }, hotspots: { print: { z: 1, use: ["Fest verklebt."] } }, props: { lamp: { flip: true } } } },
//     items: { map: { icon: "inv_map_old" } },
//     actors: { robby: { color: "#ffd000", speed: [22, 11] } },
//     dialogs: { bolt: { main: [{ text: "Hi.", goto: "end" }] } },
//     sequences: { intro: { steps: [{ shot: "sea" }, { goto: "sea" }], after: [{ set: "intro_seen" }] } },
//   })
// Objects merge deeply; anything else (numbers, strings, arrays: scripts too) replaces; null removes. A
// list of things with ids (a room's props, lamps, effects) takes an object keyed by those ids and merges
// into the matching ones; a thing without an id goes by its place in the list ("0", "1", ...), as the
// editor names it. A dialogue is kept whole (its nodes in order): the layer's tree replaces the game's.
// A sequence's `steps` and `after` are scripts: they replace the game's. The layer as loaded is kept, so the editor can save it back with its own changes added, and
// what the game's own data said before is kept too, so the editor can go back to it (revert).
// (Texts have their own layer, Cutaway.i18n.layer; shapes theirs, Cutaway.room.geometry.)
"use strict";

/** @typedef {"rooms" | "items" | "actors" | "dialogs" | "sequences"} EditKind */

Cutaway.edits = (function () {
  /** @type {Record<string, any>} */
  let layer = { rooms: {}, items: {}, actors: {}, dialogs: {}, sequences: {} };
  /** @type {Record<string, Record<string, any>>} what each thing was before the first edit (for revert) */
  const before = { rooms: {}, items: {}, actors: {}, dialogs: {}, sequences: {} };

  /** @param {any} v */
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  /** @param {any} v */
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  /**
   * Merge a patch into a target (in place). null (or undefined) removes the key, unless `keep`: the
   * layer's own record keeps the null, so the removal is saved.
   * @param {any} target @param {any} patch @param {boolean} [keep]
   */
  function merge(target, patch, keep = false) {
    for (const [k, v] of Object.entries(patch)) {
      const t = target[k];
      if (v === null || v === undefined) { if (keep) target[k] = null; else delete target[k]; }
      else if (Array.isArray(t) && isObj(v)) {                 // things with ids, patched by id (or by place, without one)
        for (const [id, pv] of Object.entries(v)) {
          const thing = t.find((x) => isObj(x) && String(x.id) === id) ?? (/^\d+$/.test(id) && isObj(t[Number(id)]) && t[Number(id)].id === undefined ? t[Number(id)] : undefined);
          if (thing && isObj(pv)) merge(thing, pv, keep);
        }
      } else if (isObj(t) && isObj(v)) merge(t, v, keep);
      else target[k] = clone(v);
    }
  }

  /** The live data of a thing. @param {EditKind} kind @param {string} id @returns {any} */
  function live(kind, id) {
    if (kind === "rooms") return Cutaway.room.has(id) ? Cutaway.room.get(id) : null;
    if (kind === "items") return Cutaway.item.get(id) ?? null;
    if (kind === "actors") return Cutaway.actors.get(id)?.def ?? null;
    if (kind === "sequences") return Cutaway.sequence?.get(id) ?? null;
    return Cutaway.dialog.get(id);
  }

  /** Keep what a thing was before its first edit. @param {EditKind} kind @param {string} id */
  function remember(kind, id) {
    if (id in before[kind]) return;
    const d = live(kind, id);
    before[kind][id] = d ? clone(d) : null;
  }

  /**
   * Apply a patch to the game's data now.
   * @param {{rooms?: Record<string, any>, items?: Record<string, any>, actors?: Record<string, any>, dialogs?: Record<string, any>, sequences?: Record<string, any>}} p
   */
  function apply(p) {
    for (const [id, r] of Object.entries(p.rooms ?? {})) if (Cutaway.room.has(id)) { remember("rooms", id); merge(Cutaway.room.get(id), r); }
    for (const [id, it] of Object.entries(p.items ?? {})) { const d = Cutaway.item.get(id); if (d) { remember("items", id); merge(d, it); } }
    for (const [id, a] of Object.entries(p.actors ?? {})) {
      const act = Cutaway.actors.get(id);
      if (!act) continue;
      remember("actors", id);
      merge(act.def, a);
      sync(act);
    }
    for (const [id, tree] of Object.entries(p.dialogs ?? {})) {
      remember("dialogs", id);
      if (tree) Cutaway.dialog(id, clone(tree));
    }
    for (const [id, s] of Object.entries(p.sequences ?? {})) { const d = live("sequences", id); if (d) { remember("sequences", id); merge(d, s); } }
  }

  /** The actor keeps copies of these. @param {any} act */
  function sync(act) {
    act.name = act.def.name ?? act.id; act.color = act.def.color ?? act.color;
    act.speed = act.def.speed ?? act.speed; act.costume = act.def.costume ?? act.costume;
  }

  /** The game's edits layer (the file the editor writes calls this). @param {Record<string, any>} data */
  function edits(data) {
    layer = { rooms: {}, items: {}, actors: {}, dialogs: {}, sequences: {}, ...clone(data) };
    apply(data);
  }
  /** The layer as it stands (with what the editor changed since). */
  edits.data = () => clone(layer);
  /**
   * Change something now and in the layer (the editor). A dialogue's patch is its whole tree.
   * @param {EditKind} kind @param {string} id @param {Record<string, any>} patch
   */
  edits.change = (kind, id, patch) => {
    layer[kind] = layer[kind] ?? {};
    if (kind === "dialogs") layer.dialogs[id] = clone(patch);
    else { layer[kind][id] = layer[kind][id] ?? {}; merge(layer[kind][id], patch, true); }
    apply({ [kind]: { [id]: patch } });
  };

  /** A value at a path in a thing's data (lists of things with ids are walked by id). @param {any} o @param {string[]} path */
  function at(o, path) {
    for (const k of path) {
      if (o == null) return undefined;
      o = Array.isArray(o) && isNaN(Number(k)) ? o.find((x) => isObj(x) && String(x.id) === k) : o[k];
    }
    return o;
  }

  /**
   * Is something changed by the layer? (a path in the thing; none: anything of it)
   * @param {EditKind} kind @param {string} id @param {string[]} [path]
   */
  edits.changed = (kind, id, path = []) => at(layer[kind]?.[id], path) !== undefined;

  /**
   * What the game's own data said before the editor (or the layer file) changed it.
   * @param {EditKind} kind @param {string} id @param {string[]} [path]
   */
  edits.original = (kind, id, path = []) => clone(at(id in before[kind] ? before[kind][id] : live(kind, id), path));

  /**
   * Go back to the game's own data: for a path in a thing (none: all of it). The layer forgets it.
   * @param {EditKind} kind @param {string} id @param {string[]} [path]
   */
  edits.revert = (kind, id, path = []) => {
    const mine = layer[kind] ?? {};
    if (!(id in mine)) return;
    if (kind === "dialogs" || !path.length) {
      delete mine[id];
      const was = before[kind][id];
      if (kind === "dialogs") { if (was) Cutaway.dialog(id, clone(was)); return; }
      const d = live(kind, id);
      if (d && was) { for (const k of Object.keys(d)) if (!(k in was)) delete d[k]; merge(d, was); if (kind === "actors") sync(Cutaway.actors.get(id)); }
      return;
    }
    // the path: back to the original value in the live data, out of the layer (and empty objects with it)
    const parent = at(live(kind, id), path.slice(0, -1)), last = path[path.length - 1], was = at(before[kind][id], path);
    if (parent && typeof parent === "object") { if (was === undefined) delete parent[last]; else parent[last] = clone(was); }
    /** @param {any} o @param {number} i @returns {boolean} empty now */
    const drop = (o, i) => {
      if (!isObj(o)) return false;
      if (i === path.length - 1) delete o[path[i]];
      else if (drop(o[path[i]], i + 1) && path[i] in o) delete o[path[i]];
      return Object.keys(o).length === 0;
    };
    if (drop(mine[id], 0)) delete mine[id];
  };
  edits.merge = merge;
  return edits;
})();
