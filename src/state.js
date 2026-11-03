// Cutaway.js game state: flags, inventories, object states and visibility, visited rooms, and the
// conditions that scripts test. Everything here is plain JSON, so saves are a snapshot of it.
//
// Conditions (strings, or arrays of them meaning "all of"):
//   "flag"  "!flag"  "flag=3"  "n>=80"  "n<3"  "n>0"  "n<=2"  "n!=a"  "time>=22:00"  "has:item"  "visited:room"  "state:obj=value"  "is:actor"
//   "at:actor=room"  "hidden:obj"  "moment:id"  "seen:id"  "setting:key=value"     and objects { and: [...] }, { or: [...] }, { not: cond }
// Object ids are "room/id"; a bare id means the current room.
// Inventories are per actor, or one shared bag for a group (Cutaway.state.share(["a", "b"]): the
// party's backpack); "has:item" then asks the bag of whoever is playing. A member of the group can carry
// a bag of their own for a while (`{ bag: "own", who }`, back with `{ bag: "shared", who }`): someone
// split off from the others. That is part of the state, so saves keep it.
"use strict";

/**
 * @typedef {string | any[] | {and: any[]} | {or: any[]} | {not: any}} Cond   (arrays hold more Conds)
 * @typedef {{flags: Record<string, any>, inv: Record<string, string[]>, obj: Record<string, string>,
 *   hidden: Record<string, boolean>, visited: Record<string, boolean>, once: Record<string, boolean>,
 *   own: Record<string, boolean>}} StateData
 */

Cutaway.state = (function () {
  /** @returns {StateData} */
  function fresh() { return { flags: {}, inv: {}, obj: {}, hidden: {}, visited: {}, once: {}, own: {} }; }
  let s = fresh();
  /** @type {Set<string>} actors who share one bag */
  let sharing = new Set();
  /** Whose inventory an actor uses. @param {string} who */
  function bag(who) { return sharing.has(who) && !s.own[who] ? "@shared" : who; }

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
    const cmp = compare(str);
    if (cmp) {
      // a flag against a number (names never hold a colon, so "state:door=open" isn't one)
      const v = number(cmp.value);
      // the game time's own flags read as the time module has them (day 1 and the day's start before they are set)
      const n = cmp.name === "time" && Cutaway.time ? Cutaway.time.now.minutes : cmp.name === "day" && Cutaway.time ? Cutaway.time.now.day : Number(s.flags[cmp.name]) || 0;
      switch (cmp.op) {
        case "=": return n === v;
        case ">=": return n >= v;
        case "<=": return n <= v;
        case ">": return n > v;
        case "<": return n < v;
        case "!=": return String(s.flags[cmp.name] ?? "") !== cmp.value;
      }
    }
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
      case "setting": { const [k, v] = arg.split("="); return String(Cutaway.settings?.get(k) ?? "") === v; }
      case "moment": return !!s.flags[`~moment.${arg}`];
      case "seen": return s.flags[`~moment.${arg}`] === "seen";
    }
    throw new Error(`Cutaway: unknown condition "${str}"`);
  }

  /**
   * A flag compared with a number: "chits>=80", "day<3", "tries>2", "n<=0"; "x!=a" compares as text,
   * like "=". Plain "flag=3" isn't matched here (it keeps comparing as text). Spaces round the operator
   * are allowed.
   * @param {string} str @returns {{name: string, op: string, value: string} | null}
   */
  function compare(str) {
    const m = /^([^<>!=\s:]+)\s*(>=|<=|!=|>|<|=)\s*(.*)$/.exec(str);
    if (!m) return null;
    const value = m[3].trim();
    // a plain "=" is a number comparison only against a clock time ("time=22:00") or for "day"; else it stays text
    if (m[2] === "=" && !/^\d{1,2}:\d{2}$/.test(value) && m[1] !== "day" && m[1] !== "time") return null;
    return { name: m[1], op: m[2], value };
  }
  /** A comparison's value as a number: a clock time ("22:00") as minutes on the game day. @param {string} v */
  function number(v) {
    return /^\d{1,2}:\d{2}$/.test(v) ? (Cutaway.time ? Cutaway.time.parse(v) : Number(v.slice(0, v.indexOf(":"))) * 60 + Number(v.slice(v.indexOf(":") + 1))) : Number(v);
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
    /**
     * Give a member of the shared group a bag of their own ("own", empty at first), or put them back into the
     * shared one ("shared": what they carried goes in with the rest). @param {string} who @param {"own" | "shared"} kind
     */
    setBag(who, kind) {
      if (kind === "own") { if (!s.own[who]) { s.own[who] = true; s.inv[who] = []; } }
      else if (s.own[who]) {
        const mine = s.inv[who] ?? [];
        delete s.own[who]; delete s.inv[who];
        const list = (s.inv[bag(who)] ??= []);
        for (const i of mine) if (!list.includes(i)) list.push(i);
      } else return;
      Cutaway.events.emit("inventory.changed", { who, item: "", added: kind === "own" });
    },
    /** Do these two actors use the same bag? @param {string} a @param {string} b */
    sameBag(a, b) { return bag(a) === bag(b); },
    /** @returns {StateData} a deep copy, safe to store */
    snapshot() { return JSON.parse(JSON.stringify(s)); },
    /** @param {StateData} data */
    restore(data) { s = { ...fresh(), ...JSON.parse(JSON.stringify(data)) }; },
  };
})();
