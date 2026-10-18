// Cutaway.js layers: what the editor changes, kept in files the game loads after its own data.
//   Cutaway.edits({
//     rooms: { attic: { light: { ambient: 0.8 }, hotspots: { print: { z: 1 } }, props: { lamp: { flip: true } } } },
//     items: { map: { icon: "inv_map_old" } },
//     actors: { robby: { color: "#ffd000", speed: [22, 11] } },
//   })
// Objects merge deeply; anything else (numbers, strings, arrays) replaces. A list of things with ids (a
// room's props, lamps, effects) takes an object keyed by those ids and merges into the matching ones.
// The layer as loaded is kept, so the editor can save it back with its own changes added.
// (Texts have their own layer, Cutaway.i18n.layer; shapes theirs, Cutaway.room.geometry.)
"use strict";

Cutaway.edits = (function () {
  /** @type {Record<string, any>} */
  let layer = { rooms: {}, items: {}, actors: {} };

  /** @param {any} v */
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  /**
   * Merge a patch into a target (in place).
   * @param {any} target @param {any} patch
   */
  function merge(target, patch) {
    for (const [k, v] of Object.entries(patch)) {
      const t = target[k];
      if (Array.isArray(t) && isObj(v)) {                      // things with ids, patched by id
        for (const [id, pv] of Object.entries(v)) {
          const thing = t.find((x) => isObj(x) && String(x.id) === id);
          if (thing && isObj(pv)) merge(thing, pv);
        }
      } else if (isObj(t) && isObj(v)) merge(t, v);
      else target[k] = JSON.parse(JSON.stringify(v));
    }
  }

  /**
   * Apply a patch to the game's data now.
   * @param {{rooms?: Record<string, any>, items?: Record<string, any>, actors?: Record<string, any>}} p
   */
  function apply(p) {
    for (const [id, r] of Object.entries(p.rooms ?? {})) if (Cutaway.room.has(id)) merge(Cutaway.room.get(id), r);
    for (const [id, it] of Object.entries(p.items ?? {})) { const d = Cutaway.item.get(id); if (d) merge(d, it); }
    for (const [id, a] of Object.entries(p.actors ?? {})) {
      const act = Cutaway.actors.get(id);
      if (!act) continue;
      merge(act.def, a);
      act.name = act.def.name ?? id; act.color = act.def.color ?? act.color;            // the actor keeps copies of these
      act.speed = act.def.speed ?? act.speed; act.costume = act.def.costume ?? act.costume;
    }
  }

  /** The game's edits layer (the file the editor writes calls this). @param {Record<string, any>} data */
  function edits(data) {
    layer = { rooms: {}, items: {}, actors: {}, ...JSON.parse(JSON.stringify(data)) };
    apply(data);
  }
  /** The layer as it stands (with what the editor changed since). */
  edits.data = () => JSON.parse(JSON.stringify(layer));
  /** Change something now and in the layer (the editor). @param {"rooms" | "items" | "actors"} kind @param {string} id @param {Record<string, any>} patch */
  edits.change = (kind, id, patch) => {
    layer[kind] = layer[kind] ?? {};
    layer[kind][id] = layer[kind][id] ?? {};
    merge(layer[kind][id], patch);
    apply({ [kind]: { [id]: patch } });
  };
  edits.merge = merge;
  return edits;
})();
