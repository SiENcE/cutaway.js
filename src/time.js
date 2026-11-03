// Cutaway.js game time: a day and a time of day, part of the saved state (the flags `day` and `time`,
// minutes), separate from the frame clock (Cutaway.clock). It moves only when a script moves it:
//   { time: "+15" }            on by 15 minutes
//   { time: "22:00" }          on to 22:00 (never back)
//   { time: "next" }           on to the next change: a routine's or a moment's start or end, a mark
//   { time: "18:00", day: "+1" }   the next day at 18:00 (sleeping); { time: "21:30", day: 1 } sets both (an act's start)
// A game day runs from `start` (Cutaway.time.configure({ start: "18:00", end: "04:00" })): a clock time
// earlier than the start is the next morning, so "01:00" comes after "23:00". Conditions compare it:
// "time>=22:00", "time<23:30", "day=2", "day>1".
//
// Routines put actors where they are at a time: Cutaway.routine("kessler", [{ day: 1, from: "22:00",
// to: "22:30", room: "cam03", at: [120, 140], face: "se", path: [[120, 140], [160, 120]] }, ...]);
// outside every entry the actor is in no room. An entry may have an `if`. A `path` is walked round and
// round while the actor is in the room shown (only for the look: positions aren't part of the state);
// it pauses while a script runs, and nobody waits for it (Cutaway.debug.settle).
//
// Moments are scenes in a room within a window of time: Cutaway.moment("ring", { room: "cam04", day: 1,
// from: "22:30", to: "22:45", play: [...], unseen: [...] }). Once the time is in the window, the moment
// plays its `play` script as soon as its room is the one shown (it waits for a watcher); if the window
// passes with nobody watching, it happens unseen (`unseen`, a script for what it leaves behind). Each
// happens once. Conditions: "moment:ring" (it happened), "seen:ring" (it was watched).
"use strict";

/**
 * @typedef {object} RoutineEntry
 * @property {number | number[]} [day]   the days it holds (default: every day)
 * @property {string} from               clock time, "22:00"
 * @property {string} to                 clock time, up to (not including)
 * @property {Cond} [if]
 * @property {string | null} room        where the actor is (null: nowhere)
 * @property {[number, number]} [at]
 * @property {Facing} [face]
 * @property {[number, number][]} [path] walked round and round while the room is shown
 */
/**
 * @typedef {object} MomentDef
 * @property {string} room
 * @property {number | number[]} [day]
 * @property {string} from
 * @property {string} to
 * @property {Cond} [if]
 * @property {Script} [play]     run when it is watched
 * @property {Script} [unseen]   run when its window passes unwatched
 */

Cutaway.time = (function () {
  /** @type {{start: number, end: number | null} | null} */
  let cfg = null;
  /** @type {Map<string, RoutineEntry[]>} */
  const routines = new Map();
  /** @type {Map<string, MomentDef>} */
  const moments = new Map();
  /** @type {(() => {x: number, y: number} | null) | null} where the game's button for waiting is (play.mjs clicks it) */
  let waitPoint = null;
  /** @type {string[]} extra times `next` stops at */
  const marks = [];
  /** which entry each actor was last put in (`day/index`), so a slot doesn't put them back while it lasts */
  const placed = new Map();
  /** where each actor is on its path */
  const legs = new Map();

  /** "22:00" as minutes after midnight (NaN if it isn't a clock time). @param {any} v */
  function clock(v) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v).trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  }
  /** A time on the game day, in minutes: a clock time before the day's start is the next morning (+24 h). @param {string | number} v */
  function parse(v) {
    if (typeof v === "number") return v;
    const m = clock(v);
    if (!Number.isFinite(m)) return NaN;
    return m < (cfg?.start ?? 0) ? m + 1440 : m;
  }
  /** Minutes as a clock time, "01:30". @param {number} min */
  function format(min) {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  function day() { return Number(Cutaway.state.flag("day")) || 1; }
  function minutes() {
    const t = Cutaway.state.flag("time");
    return t === undefined || t === "" || !Number.isFinite(Number(t)) ? cfg?.start ?? 0 : Number(t);
  }
  /** @param {number | number[] | undefined} d @param {number} today */
  function onDay(d, today) { return d === undefined || (Array.isArray(d) ? d.includes(today) : d === today); }

  /** The routine entry that holds for an actor now (its index), or -1. @param {RoutineEntry[]} list */
  function slotOf(list) {
    const d = day(), t = minutes();
    return list.findIndex((e) => onDay(e.day, d) && parse(e.from) <= t && t < parse(e.to) && Cutaway.state.test(e.if));
  }

  /** Put every actor with a routine where it is now. */
  function apply() {
    for (const [id, list] of routines) {
      const a = Cutaway.actors.get(id);
      if (!a) continue;
      const i = slotOf(list), e = list[i], k = `${day()}/${i}`, room = e ? e.room ?? null : null;
      if (placed.get(id) === k && a.room === room) continue;
      placed.set(id, k);
      legs.delete(id);
      const at = e?.at ?? e?.path?.[0];
      a.place(room, at ? at[0] : a.x, at ? at[1] : a.y, e?.face);
    }
  }

  /** Run a script now: inside the one running, or as its own (the player waits). @param {Script} s @param {string} path */
  function perform(s, path) {
    return Cutaway.script.busy ? Cutaway.script.exec(s, { path }) : Cutaway.script.run(s, { path });
  }

  /** Moments that are due: watched ones play, ones whose window passed happen unseen. */
  async function check() {
    const here = Cutaway.scene.backdrop ? null : Cutaway.scene.room?.id ?? null;
    for (const [id, m] of moments) {
      if (Cutaway.state.flag(`~moment.${id}`)) continue;
      const d = day(), t = minutes();
      const past = typeof m.day === "number" ? d > m.day || (d === m.day && t >= parse(m.to)) : onDay(m.day, d) && t >= parse(m.to);
      if (!Cutaway.state.test(m.if) && !past) continue;
      if (past) {
        Cutaway.state.set(`~moment.${id}`, "unseen");
        Cutaway.events.emit("moment", { id, seen: false });
        if (m.unseen) await perform(m.unseen, `moment.${id}.unseen`);
      } else if (onDay(m.day, d) && t >= parse(m.from) && here === m.room) {
        Cutaway.state.set(`~moment.${id}`, "seen");
        Cutaway.events.emit("moment", { id, seen: true });
        if (m.play) await perform(m.play, `moment.${id}.play`);
      }
    }
  }

  /** The next time something changes today (a routine's or a moment's start or end, a mark), or null. */
  function next() {
    const d = day(), t = minutes(), end = cfg?.end ?? null;
    /** @type {number[]} */
    const at = [];
    for (const list of routines.values()) for (const e of list) if (onDay(e.day, d)) at.push(parse(e.from), parse(e.to));
    for (const [id, m] of moments) if (onDay(m.day, d) && !Cutaway.state.flag(`~moment.${id}`)) at.push(parse(m.from), parse(m.to));
    for (const m of marks) at.push(parse(m));
    const later = at.filter((v) => Number.isFinite(v) && v > t && (end === null || v <= end));
    return later.length ? Math.min(...later) : null;
  }

  /**
   * Set the time (and the day), put the actors where their routines say, then play what is due.
   * @param {number} to minutes on the game day @param {number} [toDay]
   */
  async function set(to, toDay) {
    if (toDay !== undefined) Cutaway.state.set("day", toDay);
    Cutaway.state.set("time", to);
    apply();
    Cutaway.events.emit("time.changed", { day: day(), time: minutes(), text: format(minutes()) });
    await check();
  }

  /** The `time` action. @param {Record<string, any>} s */
  async function action(s) {
    const v = String(s.time).trim(), t = minutes();
    if (s.day !== undefined) {
      const d = String(s.day).trim(), n = /^\+\d+$/.test(d) ? day() + Number(d.slice(1)) : Number(d);
      return set(Number.isFinite(parse(v)) ? parse(v) : cfg?.start ?? 0, n);
    }
    if (v === "next") { const n = next(); if (n !== null) await set(n); return; }
    if (/^\+\d+$/.test(v)) return set(t + Number(v.slice(1)));
    const to = parse(v);
    if (Number.isFinite(to) && to > t) await set(to);
  }
  Cutaway.script.action("time", action);

  /** Routines' paths: an actor in the room shown walks round its path. @param {number} dt */
  function update(dt) {
    void dt;
    const room = Cutaway.scene.room?.id;
    // a running script has the scene: nobody starts a new leg (a scripted walk must arrive)
    if (!room || Cutaway.script.fast || Cutaway.script.busy) return;
    for (const [id, list] of routines) {
      const a = Cutaway.actors.get(id), e = list[slotOf(list)];
      if (!a || a.room !== room || !e?.path?.length || a.state === "walk") continue;
      if (a.onceDone) continue;                     // playing a one-shot animation
      const i = ((legs.get(id) ?? 0) + 1) % e.path.length, [x, y] = e.path[i];
      legs.set(id, i);
      a.walkTo(x, y, false, true);
      a.ambient = true;                             // background life: settle() and the tools don't wait for it
    }
  }
  Cutaway.clock.onUpdate(update);

  return {
    /**
     * @param {{start?: string, end?: string, waitPoint?: () => {x: number, y: number} | null}} o  the game day's start, its last
     *   time (`next` stops there) and where the game's own button for waiting is on the screen (for play.mjs)
     */
    configure(o) {
      cfg = { start: clock(o.start ?? "00:00") || 0, end: null };
      if (o.end !== undefined) cfg.end = parse(o.end);
      if (o.waitPoint) waitPoint = o.waitPoint;
    },
    /** Where the game's button for waiting is (null: it has none). */
    waitPoint() { return waitPoint ? waitPoint() : null; },
    /** @param {string} actor @param {RoutineEntry[]} entries */
    routine(actor, entries) { routines.set(actor, entries); placed.delete(actor); },
    /** @param {string} id @param {MomentDef} def */
    moment(id, def) { moments.set(id, def); },
    /** Extra times `next` stops at. @param {...string} times */
    mark(...times) { marks.push(...times); },
    parse, format, next, apply, check, set,
    /** Called by the scene once a room has been entered (its enter script done): watched moments play. @param {string} id */
    async entered(id) { void id; apply(); await check(); },
    /** Day and time now. */
    get now() { return { day: day(), minutes: minutes(), text: format(minutes()) }; },
    /** Is game time used at all (configured, or anything scheduled)? */
    get used() { return !!cfg || routines.size > 0 || moments.size > 0; },
    get routines() { return routines; },
    get moments() { return moments; },
    /** Forget which slot each actor was put in (a new game, a loaded save). */
    reset() { placed.clear(); legs.clear(); },
  };
})();

/** Define an actor's routine (Cutaway.time.routine). @param {string} actor @param {RoutineEntry[]} entries */
Cutaway.routine = (actor, entries) => Cutaway.time.routine(actor, entries);
/** Define a moment (Cutaway.time.moment). @param {string} id @param {MomentDef} def */
Cutaway.moment = (id, def) => Cutaway.time.moment(id, def);
