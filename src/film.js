// Cutaway.js film: a sequence as a film to look at, for the editor's Film tab (not in a game's load order;
// the editor loads it). A film run plays the sequence silently on the game's clock, stepped by hand: one
// logic step, then the promise chains go on, then the next, so where it stands is a pure function of the
// time since its start. The game is put back as it was before each run, and the clock set back to the
// same start, so whatever draws by the clock looks the same at the same moment.
//   await Cutaway.film.trace("intro")      // runs it to the end: when each step starts and ends, the rooms, the shots
//   await Cutaway.film.seek("intro", 7250) // the picture 7.25 s in, held there
//   Cutaway.film.play() / pause()          // on from there in real time (the sound too), and held again
//   await Cutaway.film.close()             // the game as it was before
// Seeking on from where a run stands only plays on; back, it runs again from the start (a film of two
// minutes is some 7200 logic steps with nothing drawn). While it seeks the sound is quiet (Cutaway.audio
// .quiet): the music and the rooms' loops follow what they are told, so playing from there sounds close.
// What waits for the player counts as if read: a line waiting for a click goes on when its time is up, a
// card after CARD_MS; a dialogue's choices end the run there (`waits`). A run stops at `cap` at the latest.
"use strict";

/**
 * A step as the film saw it run.
 * @typedef {object} FilmStep
 * @property {string} path      the script runner's path ("sequence.intro.7"; inside an if: "sequence.intro.7.0")
 * @property {any} step         the step itself
 * @property {string} kind      the action it runs ("wait", "camera", "say" for a line, "if", "once", a game's own)
 * @property {number} start     ms from the film's start
 * @property {number} end       when the film went on after it
 * @property {number} until     when what it started (a tween, a walk that goes on) had finished: at least `end`
 * @property {string} [branch]  an if's or a once's: the branch it took ("then", "else", "once")
 * @property {number} depth     how deep in branches it is (0: the sequence's own list)
 */
/**
 * @typedef {object} FilmTrace
 * @property {string} id
 * @property {number} ms                      how long it runs
 * @property {FilmStep[]} steps               in the order they started
 * @property {{t: number, name: string}[]} shots
 * @property {{t: number, id: string, path: string}[]} rooms   each room shown (path: the step that showed it)
 * @property {{t: number, music: any, path: string}[]} music   what the music was told (the rooms' music too)
 * @property {string} waits                   "" when it ran to its end; "choice" (a dialogue waits), "cap" (too long)
 */

Cutaway.film = (function () {
  const STEP = Cutaway.clock.STEP, CARD_MS = 3000;
  /**
   * The game as it was before the film (put back before each run and at the end), and the clock's start.
   * @type {{state: StateData, party: any, active: string | null, actors: Record<string, {room: string | null, x: number, y: number, facing: Facing}>,
   *   room: string | null, backdrop: [number, number] | null, fade: number, base: number, quiet: boolean} | null}
   */
  let before = null;
  /**
   * The run under way: its sequence, the time it stands at (ms from its start), whether it has ended, what it saw.
   * @type {{id: string, t: number, ended: boolean, trace: FilmTrace, open: Map<string, FilmStep[]>, stop: () => void, done: Promise<boolean>} | null}
   */
  let run = null;
  let busy = 0, playing = false, raf = 0, lastFrame = -1, cap = 600000;
  /** @type {((t: number) => void)[]} told the time while it plays */
  const listeners = [];
  /** @type {Promise<void>} seeks one after another (a drag asks faster than they go) */
  let queue = Promise.resolve();
  let cardSince = -1;

  /** Let promise chains go on after a logic step (the same number of turns every time: the runs repeat). */
  async function flush() { for (let i = 0; i < 48; i++) await null; }

  /** The game as it is now (before the first run). */
  function freeze() {
    /** @type {Record<string, {room: string | null, x: number, y: number, facing: Facing}>} */
    const actors = {};
    for (const a of Cutaway.actors.all()) actors[a.id] = { room: a.room, x: a.x, y: a.y, facing: a.facing };
    return { state: Cutaway.state.snapshot(), party: Cutaway.party.snapshot(), active: Cutaway.scene.active?.id ?? null, actors,
      room: Cutaway.scene.room?.id ?? null, backdrop: Cutaway.scene.view, fade: Cutaway.fx.level(), base: Cutaway.clock.time, quiet: Cutaway.audio.quiet };
  }

  /** Put the game back as it was (no enter script, no visit, no autosave: the room is shown as a shot is). */
  async function thaw() {
    const b = before;
    if (!b) return;
    Cutaway.tween.finish();
    Cutaway.cinema.reset();
    Cutaway.state.restore(b.state);
    Cutaway.party.restore(b.party);
    for (const [id, p] of Object.entries(b.actors)) Cutaway.actors.get(id)?.place(p.room, p.x, p.y, p.facing);
    Cutaway.scene.setActive(b.active);
    if (b.room) await Cutaway.scene.load(b.room, b.backdrop ? { enter: false, backdrop: b.backdrop } : { enter: false, shot: true });
    else Cutaway.scene.unload();
    Cutaway.scene.cameraFollow();
    Cutaway.fx.fade(b.fade, 0);
    Cutaway.clock.rewind(b.base);
  }

  /** The kind of a step: its first key that names an action (a plain string: a line). @param {any} s */
  function kindOf(s) {
    if (typeof s === "string") return "say";
    if (!s || typeof s !== "object") return "?";
    if ("if" in s) return "if";
    if ("once" in s) return "once";
    const names = new Set(Cutaway.script.names());
    return Object.keys(s).find((k) => names.has(k)) ?? "?";
  }

  /** Stop the run under way (its steps stop, what waited finishes at once) and forget it. */
  async function stopRun() {
    const r = run;
    if (!r) return;
    pause();
    r.stop();
    run = null;
    if (!r.ended) await Cutaway.sequence.abort();
    await r.done.catch(() => false);
  }

  /** Begin a run of a sequence from its start, the game put back as it was first. @param {string} id */
  async function begin(id) {
    if (!Cutaway.sequence.get(id)) throw new Error(`Cutaway: no sequence "${id}"`);
    await stopRun();
    if (!before) {
      if (Cutaway.sequence.playing()) throw new Error(`Cutaway: "${Cutaway.sequence.playing()}" is playing`);
      // a script of the game under way (a line, a walk) runs to its end first: the film can't run beside it
      if (Cutaway.script.busy) await Cutaway.debug.settle(60000);
      if (Cutaway.script.busy) throw new Error("Cutaway: a script of the game is still running (the film begins when it is done)");
      before = freeze();
    }
    Cutaway.audio.quiet = true;
    await thaw();
    const base = Cutaway.clock.time, now = () => Cutaway.clock.time - base;
    /** @type {FilmTrace} */
    const trace = { id, ms: 0, steps: [], shots: [], rooms: [], music: [], waits: "" };
    /** @type {Map<string, FilmStep[]>} steps begun and not ended, by path */
    const open = new Map();
    /** @type {Map<string, number>} how deep each running path is */
    const depth = new Map();
    const unwatch = Cutaway.script.watch((e) => {
      if (e.phase === "start") {
        const parent = [...open.keys()].filter((p) => e.path.startsWith(p + ".")).sort((a, b) => b.length - a.length)[0];
        const d = parent !== undefined ? (depth.get(parent) ?? 0) + 1 : 0;
        /** @type {FilmStep} */
        const st = { path: e.path, step: e.step, kind: kindOf(e.step), start: now(), end: now(), until: now(), depth: d };
        trace.steps.push(st);
        open.set(e.path, [...(open.get(e.path) ?? []), st]);
        depth.set(e.path, d);
      } else {
        const list = open.get(e.path), st = list?.[list.length - 1];
        if (!st) return;
        if (e.phase === "branch") st.branch = e.branch;
        else if (e.phase === "runs") e.done?.then(() => { if (run?.trace === trace) st.until = Math.max(st.until, now()); });
        else {
          st.end = now(); st.until = Math.max(st.until, st.end);
          list?.pop();
          if (!list?.length) open.delete(e.path);
        }
      }
    });
    const offs = [
      Cutaway.events.on("sequence.shot", (e) => { trace.shots.push({ t: now(), name: e.shot }); }),
      Cutaway.events.on("room.enter", (e) => { trace.rooms.push({ t: now(), id: e.id, path: Cutaway.script.current }); if (e.music) trace.music.push({ t: now(), music: e.music, path: "" }); }),
      Cutaway.events.on("music", (m) => { trace.music.push({ t: now(), music: m, path: Cutaway.script.current }); }),
    ];
    const stop = () => { unwatch(); for (const off of offs) off(); };
    const r = { id, t: 0, ended: false, trace, open, stop, done: Promise.resolve(false) };
    run = r;
    r.done = Cutaway.sequence.play(id, { restore: false }).finally(() => { r.ended = true; trace.ms = Math.max(trace.ms, r.t); });
    await flush();
    return r;
  }

  /**
   * Drive the run on to `ms` from its start (or its end), one logic step at a time; lines and cards that wait
   * for the player go on as if read. @param {number} ms
   */
  async function drive(ms) {
    const r = run;
    if (!r) return;
    const target = Math.min(ms, cap);
    while (run === r && !r.ended && r.t + STEP / 2 < target) {
      Cutaway.clock.advance(STEP, false);
      r.t += STEP;
      if (Cutaway.ui.line?.waiting) Cutaway.ui.skip();
      if (Cutaway.menu.card) { if (cardSince < 0) cardSince = r.t; else if (r.t - cardSince >= CARD_MS) { Cutaway.menu.closeCard(); cardSince = -1; } }
      else cardSince = -1;
      await flush();
      if (Cutaway.dialogs.choices) { r.trace.waits = "choice"; break; }
    }
    if (r.t >= cap && !r.ended) r.trace.waits = "cap";
    r.trace.ms = Math.max(r.trace.ms, r.t);
  }

  /** Run a job after the ones asked for before (seeks and traces don't overlap). @template T @param {() => Promise<T>} job @returns {Promise<T>} */
  function queued(job) {
    const p = queue.then(async () => { busy++; try { return await job(); } finally { busy--; } });
    queue = p.then(() => undefined, () => undefined);
    return p;
  }

  /**
   * Run a sequence to its end (or to where it waits for the player, or the cap) and say what ran when. The
   * picture stays at its end; seek to look at a moment.
   * @param {string} id @returns {Promise<FilmTrace>}
   */
  function trace(id) {
    return queued(async () => {
      const r = await begin(id);
      await drive(Infinity);
      // what it started and the run's end let finish (tweens, a dissolve) is counted to the end
      await flush();
      r.trace.ms = r.t;
      for (const s of r.trace.steps) s.until = Math.min(Math.max(s.until, s.end), r.t);
      return r.trace;
    });
  }

  /**
   * Show the film at `ms` from its start, held there (on from where the run stands, else from the start).
   * @param {string} id @param {number} ms @returns {Promise<number>} the time it stands at
   */
  function seek(id, ms) {
    return queued(async () => {
      pause();
      const target = Math.max(0, ms);
      if (!run || run.id !== id || run.t > target + STEP / 2) await begin(id);
      await drive(target);
      Cutaway.clock.advance(0);                         // draw it
      return run?.t ?? 0;
    });
  }

  /** Play on from where the run stands, in real time, with its sound. */
  function play() {
    if (playing || !run || run.ended || typeof requestAnimationFrame === "undefined") return;
    playing = true;
    Cutaway.audio.quiet = before?.quiet ?? false;
    lastFrame = -1;
    let ahead = 0;
    const frame = (/** @type {number} */ now) => {
      if (!playing) return;
      raf = requestAnimationFrame(frame);
      if (lastFrame < 0) lastFrame = now;
      ahead += Math.min(250, now - lastFrame);
      lastFrame = now;
      if (busy) return;
      const r = run;
      if (!r || r.ended) { pause(); return; }
      const to = r.t + Math.floor(ahead / STEP) * STEP;
      ahead -= Math.floor(ahead / STEP) * STEP;
      if (to <= r.t) return;
      queued(() => drive(to)).then(() => {
        Cutaway.clock.advance(0);
        for (const fn of listeners) fn(run?.t ?? 0);
        if (run?.ended) pause();
      });
    };
    raf = requestAnimationFrame(frame);
  }

  /** Hold it where it is (and quiet again). */
  function pause() {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(raf);
    Cutaway.audio.quiet = true;
  }

  /** Put the game back as it was before the film and end it. */
  function close() {
    return queued(async () => {
      await stopRun();
      await thaw();
      Cutaway.audio.quiet = before?.quiet ?? false;
      before = null;
      Cutaway.clock.advance(0);
    });
  }

  // ---- changing a film's timing: pure functions on a copy of its steps, guided by a trace. Each takes the
  // steps, the trace and a step's path (the trace's), and gives the changed steps (or null: it can't).

  /** @param {any} v */
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const isWait = (/** @type {any} */ s) => !!s && typeof s === "object" && Object.keys(s).length === 1 && typeof s.wait === "number";
  /** The steps of the trace by path (the last run of each). @param {FilmTrace} tr */
  function byPath(tr) { const m = new Map(); for (const s of tr.steps) m.set(s.path, s); return /** @type {Map<string, FilmStep>} */ (m); }

  /**
   * Where a path's step is in a sequence's steps: its list (a branch's, as the trace saw it taken) and index.
   * @param {any[]} steps @param {FilmTrace} tr @param {string} path
   * @returns {{list: any[], index: number, base: string} | null}  base: the list's own path
   */
  function locate(steps, tr, path) {
    const prefix = `sequence.${tr.id}`;
    if (!path.startsWith(prefix + ".")) return null;
    const idx = path.slice(prefix.length + 1).split(".").map(Number);
    if (idx.some((n) => !Number.isInteger(n) || n < 0)) return null;
    const m = byPath(tr);
    let list = steps, base = prefix;
    for (let k = 0; k < idx.length - 1; k++) {
      const st = list[idx[k]];
      base = `${base}.${idx[k]}`;
      const br = m.get(base)?.branch;
      if (!st || typeof st !== "object" || !br) return null;
      const key = br === "then" ? "then" : br === "else" ? "else" : "once";
      if (!Array.isArray(st[key])) st[key] = st[key] === undefined ? [] : [st[key]];
      list = st[key];
    }
    const index = idx[idx.length - 1];
    return index < list.length ? { list, index, base } : null;
  }

  /** The key that holds how long a step is (wait's own, a dissolve's, else `ms`), or null. @param {any} s */
  function lengthKey(s) {
    if (!s || typeof s !== "object") return null;
    if ("wait" in s && typeof s.wait === "number") return "wait";
    if ("dissolve" in s) return typeof s.dissolve === "number" ? "dissolve" : null;
    if ("goto" in s) return s.transition === "dissolve" || s.dissolve !== undefined ? "dissolve" : null;
    if ("ms" in s) return typeof s.ms === "number" ? "ms" : null;
    return ["camera", "move", "letterbox", "caption", "fade", "tape"].some((k) => k in s) ? "ms" : null;
  }
  /** How long it is now (by its key; the defaults the actions use). @param {any} s @param {string} key */
  const lengthOf = (s, key) => (typeof s[key] === "number" ? s[key] : key === "dissolve" ? 800 : "fade" in s ? 400 : 0);

  /** Join waits that now stand side by side around index i (and drop waits of nothing). @param {any[]} list @param {number} i */
  function join(list, i) {
    if (i > 0 && i < list.length && isWait(list[i - 1]) && isWait(list[i])) { list[i - 1].wait += list[i].wait; list.splice(i, 1); }
    for (let j = list.length - 1; j >= 0; j--) if (isWait(list[j]) && list[j].wait <= 0) list.splice(j, 1);
  }

  /**
   * Put a step into a list at the film's time T: in the middle of a wait it splits the wait, between steps it
   * goes between them, after the last a wait leads up to it. Times are the trace's (nothing before it moves).
   * @param {any[]} list @param {string} base @param {Map<string, FilmStep>} m @param {number} T @param {any} step @param {number} [skip] an index whose step isn't counted (it is moving)
   * @returns {number} where it went
   */
  function putAt(list, base, m, T, step, skip = -1) {
    let end = m.get(base)?.start ?? 0;
    for (let j = 0; j < list.length; j++) {
      if (j === skip) continue;
      const r = m.get(`${base}.${j}`);
      if (!r) break;
      if (isWait(list[j]) && T > r.start && T < r.end) {
        const a = Math.round(T - r.start), b = list[j].wait - a;
        list.splice(j, 1, { wait: a }, step, { wait: b });
        return j + 1;
      }
      if (T <= r.start + 0.5) { list.splice(j, 0, step); return j; }
      // inside a step the film waits for (a drive, a line): before it or after it, whichever is nearer
      if (T < r.end - 0.5) { const k = T - r.start < r.end - T ? j : j + 1; list.splice(k, 0, step); return k; }
      end = r.end;
    }
    let at = skip >= 0 ? list.length : list.length;
    if (T > end + 0.5) { list.splice(at, 0, { wait: Math.round(T - end) }); at++; }
    list.splice(at, 0, step);
    return at;
  }

  const edits = {
    locate, lengthKey,
    /**
     * Its length: a wait's, a tween's `ms`, a dissolve's (ms, whole; the steps after it move with it).
     * @param {any[]} steps @param {FilmTrace} tr @param {string} path @param {number} ms
     */
    length(steps, tr, path, ms) {
      const out = clone(steps), at = locate(out, tr, path), s = at?.list[at.index];
      const key = lengthKey(s);
      if (!at || !key) return null;
      s[key] = Math.max(0, Math.round(ms));
      if (key === "dissolve" && "goto" in s && s.transition === "dissolve") delete s.transition;
      return out;
    },
    /**
     * Move a step that takes no time in the film's flow (it goes on at once: wait: false, a sound, a flag) to
     * the time T: the waits round where it was join, the wait where it goes splits, so nothing else moves.
     * @param {any[]} steps @param {FilmTrace} tr @param {string} path @param {number} T
     */
    move(steps, tr, path, T) {
      const out = clone(steps), at = locate(out, tr, path), m = byPath(tr), r = m.get(path);
      if (!at || !r) return null;
      const [step] = at.list.splice(at.index, 1);
      // the times the trace gave the rest of the list: with this step taken out, the indices after it shift
      /** @type {Map<string, FilmStep>} */
      const shifted = new Map(m);
      for (let j = at.index; j < at.list.length; j++) { const q = m.get(`${at.base}.${j + 1}`); if (q) shifted.set(`${at.base}.${j}`, q); else shifted.delete(`${at.base}.${j}`); }
      shifted.delete(`${at.base}.${at.list.length}`);
      // two waits that met where it stood are one now (and so are their times)
      if (at.index > 0 && at.index < at.list.length && isWait(at.list[at.index - 1]) && isWait(at.list[at.index])) {
        const a = shifted.get(`${at.base}.${at.index - 1}`), b = shifted.get(`${at.base}.${at.index}`);
        at.list[at.index - 1].wait += at.list[at.index].wait;
        at.list.splice(at.index, 1);
        if (a && b) shifted.set(`${at.base}.${at.index - 1}`, { ...a, end: b.end });
        for (let j = at.index; j < at.list.length; j++) { const q = shifted.get(`${at.base}.${j + 1}`); if (q) shifted.set(`${at.base}.${j}`, q); }
        shifted.delete(`${at.base}.${at.list.length}`);
      }
      const where = putAt(at.list, at.base, shifted, Math.max(m.get(at.base)?.start ?? 0, Math.round(T)), step);
      join(at.list, where + 1); join(at.list, where);
      return out;
    },
    /**
     * Move a step and everything after it in its list by d ms (ripple): the wait before it grows or shrinks
     * (one is made when there is none; it can't shrink below nothing).
     * @param {any[]} steps @param {FilmTrace} tr @param {string} path @param {number} d
     */
    ripple(steps, tr, path, d) {
      const out = clone(steps), at = locate(out, tr, path);
      if (!at) return null;
      d = Math.round(d);
      const prev = at.list[at.index - 1];
      if (isWait(prev)) prev.wait = Math.max(0, prev.wait + d);
      else if (d > 0) at.list.splice(at.index, 0, { wait: d });
      else return null;
      join(at.list, at.index);
      return out;
    },
    /**
     * A new step at the film's time T, in the sequence's own list: in a wait it splits the wait (nothing after
     * moves), else it goes after the step running then.
     * @param {any[]} steps @param {FilmTrace} tr @param {number} T @param {any} step
     */
    insert(steps, tr, T, step) {
      const out = clone(steps), m = byPath(tr), base = `sequence.${tr.id}`;
      // inside a step that runs on at T (not a wait): after it
      for (let j = 0; j < out.length; j++) {
        const r = m.get(`${base}.${j}`);
        if (r && !isWait(out[j]) && T > r.start && T < r.end) { out.splice(j + 1, 0, step); return out; }
      }
      putAt(out, base, m, Math.max(0, Math.round(T)), step);
      return out;
    },
    /**
     * Take a step out. The time it took in the flow stays as a wait, so what comes after doesn't jump.
     * @param {any[]} steps @param {FilmTrace} tr @param {string} path
     */
    remove(steps, tr, path) {
      const out = clone(steps), at = locate(out, tr, path), r = byPath(tr).get(path);
      if (!at) return null;
      const took = r ? Math.round(r.end - r.start) : 0;
      if (isWait(at.list[at.index]) || took <= 0) at.list.splice(at.index, 1);
      else at.list.splice(at.index, 1, { wait: took });
      join(at.list, at.index); join(at.list, at.index + 1);
      return out;
    },
  };

  return {
    trace, seek, play, pause, close, kindOf, edits,
    /** The time the run stands at (ms from its start), or null without one. */
    get time() { return run ? run.t : null; },
    /** The sequence of the run under way, or null. */
    get id() { return run?.id ?? null; },
    /** Has the run under way come to its end? */
    get ended() { return !!run?.ended; },
    /** What the run under way has seen so far (a trace while it is made). */
    get seen() { return run?.trace ?? null; },
    /** Is a film on (the game waits to be put back)? */
    get active() { return !!before; },
    /** Is it seeking or tracing now (the editor ignores the rooms it shows meanwhile)? */
    get busy() { return busy > 0; },
    get playing() { return playing; },
    /** The longest a run may go (ms; 10 minutes). @param {number} ms */
    set cap(ms) { cap = ms; },
    get cap() { return cap; },
    /** Be told the time while it plays. @param {(t: number) => void} fn */
    onTime(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
  };
})();
