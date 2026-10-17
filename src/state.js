// Cutaway.js game state: flags, inventories, object states and visibility, visited rooms, and the
// conditions that scripts test. Everything here is plain JSON, so saves are a snapshot of it.
//
// Conditions (strings, or arrays of them meaning "all of"):
//   "flag"  "!flag"  "flag=3"  "has:item"  "visited:room"  "state:obj=value"  "is:actor"
//   "at:actor=room"  "hidden:obj"     and objects { and: [...] }, { or: [...] }, { not: cond }
// Object ids are "room/id"; a bare id means the current room.
// Inventories are per actor, or one shared bag for a group (Cutaway.state.share(["a", "b"]): the
// party's backpack); "has:item" then asks the bag of whoever is playing.
"use strict";

/**
 * @typedef {string | any[] | {and: any[]} | {or: any[]} | {not: any}} Cond   (arrays hold more Conds)
 * @typedef {{flags: Record<string, any>, inv: Record<string, string[]>, obj: Record<string, string>,
 *   hidden: Record<string, boolean>, visited: Record<string, boolean>, once: Record<string, boolean>}} StateData
 */

Cutaway.state = (function () {
  /** @returns {StateData} */
  function fresh() { return { flags: {}, inv: {}, obj: {}, hidden: {}, visited: {}, once: {} }; }
  let s = fresh();
  /** @type {Set<string>} actors who share one bag */
  let sharing = new Set();
  /** Whose inventory an actor uses. @param {string} who */
  function bag(who) { return sharing.has(who) ? "@shared" : who; }

  /** Full object key: "room/id" (a bare id belongs to the current room). @param {string} id */
  function key(id) { return id.includes("/") ? id : `${Cutaway.scene.room?.id ?? ""}/${id}`; }
  function activeId() { return Cutaway.scene.active?.id ?? ""; }

  /** @param {string} name */
  function flag(name) { return s.flags[name]; }

  /** @param {string} who @param {string} item */
  function has(item, who = activeId()) { return (s.inv[bag(who)] ?? []).includes(item); }

  /**
   * @param {Cond | undefined} c
   * @returns {boolean}
   */
  function test(c) {
    if (c === undefined || c === null) return true;
    if (Array.isArray(c)) return c.every(test);
    if (typeof c === "object") {
      if ("and" in c) return c.and.every(test);
      if ("or" in c) return c.or.some(test);
      if ("not" in c) return !test(c.not);
      throw new Error("Cutaway: unknown condition " + JSON.stringify(c));
    }
    const str = c.trim();
    if (str.startsWith("!")) return !test(str.slice(1));
    const colon = str.indexOf(":");
    if (colon < 0) {
      const eq = str.indexOf("=");
      if (eq < 0) return !!s.flags[str];
      return String(s.flags[str.slice(0, eq)] ?? "") === str.slice(eq + 1);
    }
    const kind = str.slice(0, colon), arg = str.slice(colon + 1);
    switch (kind) {
      case "has": return has(arg);
      case "visited": return !!s.visited[arg];
      case "is": return activeId() === arg;
      case "hidden": return isHidden(arg);
      case "state": { const [id, v] = arg.split("="); return objState(id) === v; }
      case "at": { const [who, room] = arg.split("="); return Cutaway.actors.get(who)?.room === room; }
    }
    throw new Error(`Cutaway: unknown condition "${str}"`);
  }

  /** @param {string} id */
  function objState(id) { return s.obj[key(id)] ?? ""; }
  /** Hidden by a script, or else by the room data (`fallback`). @param {string} id @param {boolean} [fallback] */
  function isHidden(id, fallback = false) { return s.hidden[key(id)] ?? fallback; }

  return {
    test, flag, has, key,
    /** @param {string} name @param {any} [value] */
    set(name, value = true) { s.flags[name] = value; Cutaway.events.emit("state.changed", { flag: name }); },
    /** @param {string} name */
    unset(name) { delete s.flags[name]; Cutaway.events.emit("state.changed", { flag: name }); },
    /** @param {string} name @param {number} [by] */
    inc(name, by = 1) { s.flags[name] = (Number(s.flags[name]) || 0) + by; Cutaway.events.emit("state.changed", { flag: name }); },
    /** Items carried by an actor (the active one by default). @param {string} [who] */
    items(who = activeId()) { return (s.inv[bag(who)] ?? []).slice(); },
    /** @param {string} item @param {string} [who] */
    give(item, who = activeId()) {
      const list = (s.inv[bag(who)] ??= []);
      if (!list.includes(item)) list.push(item);
      Cutaway.events.emit("inventory.changed", { who, item, added: true });
    },
    /** @param {string} item @param {string} [who] */
    remove(item, who = activeId()) {
      s.inv[bag(who)] = (s.inv[bag(who)] ?? []).filter((i) => i !== item);
      Cutaway.events.emit("inventory.changed", { who, item, added: false });
    },
    objState,
    /** @param {string} id @param {string} value */
    setObjState(id, value) { s.obj[key(id)] = value; },
    isHidden,
    /** @param {string} id @param {boolean} hidden */
    setHidden(id, hidden) { s.hidden[key(id)] = hidden; },
    /** @param {string} room */
    visited(room) { return !!s.visited[room]; },
    /** @param {string} room */
    visit(room) { s.visited[room] = true; },
    /** Has this once-only step run before? Marks it as run. @param {string} k */
    once(k) { if (s.once[k]) return false; s.once[k] = true; return true; },
    reset() { s = fresh(); },
    /** These actors share one bag from now on (the party's backpack). @param {string[]} ids */
    share(ids) { sharing = new Set(ids); },
    /** Do these two actors use the same bag? @param {string} a @param {string} b */
    sameBag(a, b) { return bag(a) === bag(b); },
    /** @returns {StateData} a deep copy, safe to store */
    snapshot() { return JSON.parse(JSON.stringify(s)); },
    /** @param {StateData} data */
    restore(data) { s = { ...fresh(), ...JSON.parse(JSON.stringify(data)) }; },
  };
})();
