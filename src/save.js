// Cutaway.js saves: versioned JSON in localStorage, one autosave (written on every room change) and
// numbered manual slots. A save holds the game state, every actor's room and position, the party
// and the current room. Games set an id and version, and a migrate hook for older saves:
//   Cutaway.save.configure({ id: "demo", version: 2, migrate: (data, from) => data })
"use strict";

/**
 * @typedef {object} SaveData
 * @property {number} format         save format of the engine
 * @property {number} version        the game's data version when saved
 * @property {number} time           Date.now() when saved
 * @property {string} room
 * @property {string | null} [act]  the act being played (games with acts)
 * @property {string | null} active
 * @property {Record<string, {room: string | null, x: number, y: number, facing: Facing}>} actors
 * @property {{members: string[], locked: string[]}} party
 * @property {StateData} state
 */

Cutaway.save = (function () {
  const FORMAT = 1;
  let gameId = "game", version = 1;
  /** @type {(data: SaveData, from: number) => SaveData} */
  let migrate = (d) => d;
  let loading = false, filming = false;

  /** @param {string | number} slot */
  function key(slot) { return `cutaway.${gameId}.save.${slot}`; }

  /** @returns {SaveData | null} */
  function capture() {
    const room = Cutaway.scene.room?.id;
    if (!room || Cutaway.scene.backdrop) return null;
    /** @type {SaveData["actors"]} */
    const actors = {};
    for (const a of Cutaway.actors.all()) actors[a.id] = { room: a.room, x: Math.round(a.x), y: Math.round(a.y), facing: a.facing };
    return { format: FORMAT, version, time: Date.now(), room, act: Cutaway.acts.current, active: Cutaway.scene.active?.id ?? null,
      actors, party: Cutaway.party.snapshot(), state: Cutaway.state.snapshot() };
  }

  /**
   * Store the current game in a slot ("auto" or a number).
   * @param {string | number} slot
   */
  function write(slot) {
    const d = capture();
    if (!d) return false;
    try { localStorage.setItem(key(slot), JSON.stringify(d)); } catch (e) { console.warn("Cutaway: save failed", e); return false; }
    Cutaway.events.emit("saved", { slot });
    return true;
  }

  /** @param {string | number} slot @returns {SaveData | null} */
  function read(slot) {
    try {
      const raw = localStorage.getItem(key(slot));
      if (!raw) return null;
      let d = /** @type {SaveData} */ (JSON.parse(raw));
      if (d.format !== FORMAT) return null;
      if (d.version !== version) d = migrate(d, d.version);
      return d;
    } catch (e) {
      console.warn("Cutaway: unreadable save in slot " + slot, e);
      return null;
    }
  }

  /**
   * Restore a saved game.
   * @param {SaveData} d
   */
  async function apply(d) {
    loading = true;
    try {
      Cutaway.ui.hold(null);
      Cutaway.state.restore(d.state);
      Cutaway.acts.restore(d.act);
      Cutaway.party.restore(d.party);
      for (const [id, p] of Object.entries(d.actors)) Cutaway.actors.get(id)?.place(p.room, p.x, p.y, p.facing);
      Cutaway.scene.setActive(d.active);
      await Cutaway.scene.load(d.room, { enter: false });
      Cutaway.events.emit("loaded", {});
    } finally {
      loading = false;
    }
  }

  return {
    write, read, capture, apply,
    /** @param {string | number} slot */
    async load(slot) { const d = read(slot); if (!d) return false; await apply(d); return true; },
    /** @param {string | number} slot */
    remove(slot) { localStorage.removeItem(key(slot)); },
    /** Slots with a save, newest first. @param {(string | number)[]} slots */
    list(slots) {
      return slots.map((slot) => ({ slot, data: read(slot) })).filter((s) => s.data)
        .sort((a, b) => (b.data?.time ?? 0) - (a.data?.time ?? 0));
    },
    /** The newest save of the autosave and the slots, or null. */
    newest() { return this.list(["auto", 1, 2, 3])[0] ?? null; },
    /** @param {{id?: string, version?: number, migrate?: (data: SaveData, from: number) => SaveData}} o */
    configure(o) {
      gameId = o.id ?? gameId; version = o.version ?? version; migrate = o.migrate ?? migrate;
    },
    init() {
      Cutaway.events.on("room.entered", () => { if (!loading && !filming) write("auto"); });
      // a sequence's shots aren't places to continue from
      Cutaway.events.on("sequence.start", () => { filming = true; });
      Cutaway.events.on("sequence.end", () => { filming = false; });
    },
  };
})();
