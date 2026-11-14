// Cutaway.js editor: the solver's ways played in the game, to watch (the Connections tab shows it under the
// picture). From a graph run's data (tools/graph.mjs, its `replay`): the winning way turn by turn, each with the
// state it begins from, so any turn can be jumped to; a soft-lock or a state without a fitting hint opened as it
// is, or reached by playing the way to it from the start. A move is played as the solver plays it (ui.interact,
// the bag's combine and look, the party's switch, the clock's wait), but on the game's own clock: the one played
// walks, the lines are said, a dialogue's choices show a moment before the solver's is taken, a card a moment
// before it goes; faster runs the clock on by more each frame. After each turn the game's state is compared with
// the solver's: where it went another way (the browser plays it otherwise than the tools' vm), it stops and says
// what differs.
"use strict";

/**
 * @typedef {{kind: string, id?: string, item?: string, a?: string, b?: string, choices?: number[]}} ReplayMove
 * @typedef {{moves: ReplayMove[], snap: any, step: string | null}} ReplayTurn
 * @typedef {{from: any, turns: ReplayTurn[], end: any, lost: {path: ReplayMove[], snap: any}[],
 *   unhinted: {hint: number, problem: string, path: ReplayMove[], snap: any}[]}} ReplayData
 * @typedef {{title: string, turns: ReplayTurn[], end: any, compareEnd: boolean}} ReplayPlan
 *   compareEnd: the state after the last move is compared with `end` too (not for the winning way: its end goes on to an
 *   act the search didn't play)
 */

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  /** game time a dialogue's choices, a card and a line that waits for a click show before they are taken (at 1x) */
  const CHOICE_MS = 900, CARD_MS = 1200, LINE_MS = 300, GAP_MS = 350, MOVE_MS = 10 * 60000;
  const SPEEDS = [1, 2, 4, 8];

  /** @type {ReplayPlan | null} */
  let plan = null;
  /** the next move: its turn and its place in the turn */
  let at = { turn: 0, move: 0 };
  let playing = false, stepOnce = false, busy = false, speed = 1, ended = false;
  /** bumped by every jump and stop: a move under way from before gives up */
  let gen = 0;
  let note = "";
  /** @type {(() => void) | null} what the host does when something changed (the tab builds its dock again) */
  let onChange = null;
  const CANCEL = new Error("cancelled");

  Cutaway.events.on("game.end", () => { ended = true; });

  /** The words for a move, as the solver says it (tools/lib/solver.mjs describe). @param {ReplayMove} m */
  function describe(m) {
    const c = m.choices?.length ? ` [choices ${m.choices.join(",")}]` : "";
    if (m.kind === "with") return `use ${m.item} on ${m.id}${c}`;
    if (m.kind === "combine") return `combine ${m.a} + ${m.b}${c}`;
    if (m.kind === "ilook") return `look at ${m.item}${c}`;
    if (m.kind === "switch") return `switch to ${m.id}`;
    if (m.kind === "wait") return "wait";
    return `${m.kind} ${m.id}${c}`;
  }

  const changed = () => onChange?.();
  /** The clock on by what a frame of `dt` ms adds at this speed (all of it on a manual clock, which doesn't run by itself). @param {number} dt */
  const tick = (dt) => { const k = Cutaway.clock.manual ? speed : speed - 1; if (k > 0 && dt) Cutaway.clock.advance(dt * k); };
  const frame = () => new Promise((r) => requestAnimationFrame(r));

  /** Everything the game does has come to rest (as Cutaway.debug.settle asks), nothing waits for the player. */
  const idle = () => !Cutaway.script.busy && !Cutaway.ui.line && !Cutaway.tween.count && !Cutaway.dialogs.choices && !Cutaway.menu.card &&
    Cutaway.scene.actorsHere().every((a) => (a.state !== "walk" || a.ambient) && !a.onceDone);

  /** Start the move (the solver's perform). @param {ReplayMove} m @returns {Promise<any>} */
  function perform(m) {
    if (m.kind === "act" || m.kind === "look" || m.kind === "with") {
      if (!Cutaway.scene.hotspots().some((h) => h.id === m.id)) throw new Error(`${describe(m)}: "${m.id}" is not here (${Cutaway.scene.room?.id ?? "no room"})`);
      if (m.kind === "with" && !Cutaway.state.items().includes(/** @type {string} */ (m.item))) throw new Error(`${describe(m)}: ${m.item} is not in the bag`);
      return Cutaway.ui.interact(/** @type {string} */ (m.id), m.kind === "look" ? "look" : "act", m.kind === "with" ? m.item : undefined);
    }
    if (m.kind === "combine") return Promise.resolve(Cutaway.inventory.combine(/** @type {string} */ (m.a), /** @type {string} */ (m.b)));
    if (m.kind === "ilook") return Promise.resolve(Cutaway.inventory.look(/** @type {string} */ (m.item)));
    if (m.kind === "switch") return Cutaway.party.switchTo(/** @type {string} */ (m.id));
    if (m.kind === "wait") return Cutaway.script.run([{ time: "next" }], { path: "wait" });
    throw new Error("unknown move " + m.kind);
  }

  /**
   * Play one move on the game's clock until all of it has come to rest: choices are taken as the solver took them,
   * cards closed and lines that wait for a click go on, each after a moment. @param {ReplayMove} m
   */
  async function playMove(m) {
    const my = gen, want = m.choices ?? [];
    let done = false, used = 0, last = -1;
    /** @type {any} */
    let failed = null;
    /** when the game began to wait for the player (choices, a card, a line): game time */
    let waitingSince = -1;
    Promise.resolve().then(() => perform(m)).then(() => { done = true; }, (e) => { failed = e; });
    const t0 = Cutaway.clock.time;
    for (let quiet = 0; ;) {
      const now = /** @type {number} */ (await frame());
      if (my !== gen || !E.isOpen) throw CANCEL;
      if (failed) throw failed;
      const dt = last < 0 ? 0 : Math.min(100, now - last);
      last = now;
      if (E.paused) continue;                                // held: nothing moves (a pause, or Ctrl+P)
      tick(dt);
      const t = Cutaway.clock.time;
      if (ended) return;                                     // the end card stays
      const waits = Cutaway.dialogs.choices ? "choices" : Cutaway.menu.card ? "card" : Cutaway.ui.line?.waiting ? "line" : "";
      if (waits) {
        if (waitingSince < 0) waitingSince = t;
        if (t - waitingSince < (waits === "choices" ? CHOICE_MS : waits === "card" ? CARD_MS : LINE_MS)) continue;
        waitingSince = -1;
        if (waits === "choices") {
          if (used >= want.length) throw new Error(`${describe(m)}: the game offers more choices than the solver took`);
          Cutaway.dialogs.pick(want[used++]);
        } else if (waits === "card") Cutaway.menu.closeCard();
        else Cutaway.ui.skip();
        continue;
      }
      if (t - t0 > MOVE_MS) throw new Error(`${describe(m)}: it doesn't come to rest`);
      quiet = done && idle() ? quiet + 1 : 0;
      if (quiet >= 3) break;
    }
    if (used !== want.length) throw new Error(`${describe(m)}: the solver took ${want.length} choices, the game offered ${used}`);
  }

  /** A moment between two moves, on the game's clock. */
  async function gap() {
    const my = gen, t0 = Cutaway.clock.time;
    for (let last = -1; Cutaway.clock.time - t0 < GAP_MS;) {
      const now = /** @type {number} */ (await frame());
      if (my !== gen || !E.isOpen) throw CANCEL;
      const dt = last < 0 ? 0 : Math.min(100, now - last);
      last = now;
      if (!E.paused) tick(dt);
    }
  }

  /** JSON with sorted keys. @param {any} v @returns {string} */
  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
    return JSON.stringify(v) ?? "null";
  }

  /**
   * What differs between the game now and a state of the solver's, as the solver tells states apart (the act, the
   * room, who plays, where everyone is, the party, the state; no positions, no view flags, bags as sets).
   * @param {any} game @param {any} solver @returns {string[]}
   */
  function differences(game, solver) {
    const views = new Set(Cutaway.state.views?.() ?? []);
    /** @param {any} s */
    const norm = (s) => {
      const state = { ...(s.state ?? {}) };
      if (state.flags) state.flags = Object.fromEntries(Object.entries(state.flags).filter(([k]) => !views.has(k)));
      if (state.inv) state.inv = Object.fromEntries(Object.entries(state.inv).filter(([, l]) => /** @type {any[]} */ (l).length).map(([w, l]) => [w, [.../** @type {any[]} */ (l)].sort()]));
      const party = { ...(s.party ?? {}), locked: [...(s.party?.locked ?? [])].sort(), staying: [...(s.party?.staying ?? [])].sort() };
      const rooms = Object.fromEntries(Object.entries(s.actors ?? {}).map(([id, a]) => [id, /** @type {any} */ (a).room]));
      return { act: s.act ?? null, room: s.room, active: s.active, rooms, party, ...Object.fromEntries(Object.entries(state).map(([k, v]) => ["state." + k, v])) };
    };
    const a = norm(game), b = norm(solver), out = [];
    /** @param {any} v */
    const say = (v) => (v === undefined ? "unset" : canon(v));
    for (const part of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
      const x = /** @type {any} */ (a)[part], y = /** @type {any} */ (b)[part];
      if (canon(x) === canon(y)) continue;
      const plain = (/** @type {any} */ v) => v === undefined || (v && typeof v === "object" && !Array.isArray(v));
      if (plain(x) && plain(y)) {
        for (const k of [...new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])].sort())
          if (canon(x?.[k]) !== canon(y?.[k])) out.push(`${part.replace(/^state\./, "")} ${k}: the game ${say(x?.[k])}, the solver ${say(y?.[k])}`);
      } else out.push(`${part}: the game ${say(x)}, the solver ${say(y)}`);
    }
    return out;
  }

  /** The game in a state of the solver's, held. @param {any} snap */
  async function enter(snap) {
    gen++;
    playing = false; stepOnce = false;
    E.pause(true);
    // a card that waits: it goes first; after the game's end it goes on to the title, which is let come before the state
    if (Cutaway.menu.card) {
      const toTitle = ended && Cutaway.acts.hasTitle;
      Cutaway.menu.closeCard();
      for (let i = 0; i < 100 && toTitle && !Cutaway.acts.titleOpen; i++) { Cutaway.clock.advance(100); await new Promise((r) => setTimeout(r, 0)); }
    }
    ended = false;
    await Cutaway.save.apply(snap);
    Cutaway.scene.cameraFollow?.();
  }

  /**
   * Take a plan and put the game at its start (or at a turn of it), held. @param {ReplayPlan} p @param {number} [turn]
   */
  async function load(p, turn = 0) {
    plan = p;
    await jump(turn);
  }

  /** To a turn's start (its state), held. @param {number} turn */
  async function jump(turn) {
    if (!plan) return;
    const t = Math.max(0, Math.min(turn, plan.turns.length - 1));
    await enter(plan.turns[t].snap);
    at = { turn: t, move: 0 };
    note = `${plan.title}: at move ${moveNumber()} of ${count()}`;
    changed();
  }

  /** Open a state as it is (a soft-lock, one without a fitting hint): no way to play on. @param {any} snap @param {string} title */
  async function open(snap, title) {
    plan = null;
    await enter(snap);
    note = title;
    changed();
  }

  /** The moves in the plan. */
  const count = () => (plan ? plan.turns.reduce((n, t) => n + t.moves.length, 0) : 0);
  /** The next move's number (1 for the first). */
  const moveNumber = () => (plan ? plan.turns.slice(0, at.turn).reduce((n, t) => n + t.moves.length, 0) + at.move + 1 : 0);

  /** Play on (until the end, a pause or a move that fails); one move with `one`. @param {boolean} [one] */
  function play(one = false) {
    if (!plan || at.turn >= plan.turns.length) return;
    playing = !one; stepOnce = one;
    E.pause(false);
    if (!busy) run();
    changed();
  }

  /** Stop where it is (a move under way stands still with the clock, and goes on with play). */
  function pause() {
    playing = false; stepOnce = false;
    E.pause(true);
    changed();
  }

  /** The moves, one after another, while it plays. */
  async function run() {
    busy = true;
    try {
      while (plan && (playing || stepOnce) && at.turn < plan.turns.length) {
        const turn = plan.turns[at.turn], m = turn.moves[at.move];
        note = `${plan.title}: move ${moveNumber()} of ${count()}, ${describe(m)}`;
        changed();
        await playMove(m);
        if (ended) { note = `${plan.title}: the game ended after move ${moveNumber()}`; at = { turn: plan.turns.length, move: 0 }; pause(); break; }
        if (++at.move >= turn.moves.length) {
          at = { turn: at.turn + 1, move: 0 };
          // the state now against the solver's: the next turn's start, or where the way ends (compareEnd)
          const next = plan.turns[at.turn]?.snap ?? (plan.compareEnd ? plan.end : null);
          const diff = next ? differences(Cutaway.save.capture({ live: true }), next) : [];
          if (diff.length) {
            note = `${plan.title}: after move ${moveNumber() - 1} the game went another way than the solver:\n  ${diff.slice(0, 8).join("\n  ")}${diff.length > 8 ? `\n  ... and ${diff.length - 8} more` : ""}`;
            pause();
            break;
          }
        }
        if (stepOnce) { stepOnce = false; pause(); note = `${plan.title}: at move ${moveNumber()} of ${count()}`; break; }
        if (at.turn < plan.turns.length) await gap();
      }
      if (plan && at.turn >= plan.turns.length && !ended) { note = `${plan.title}: all ${count()} moves played`; pause(); }
    } catch (e) {
      if (e !== CANCEL) { note = `${plan?.title ?? "the way"}: move ${moveNumber()} failed: ${/** @type {any} */ (e).message ?? e}`; pause(); }
    } finally {
      busy = false;
      changed();
    }
  }

  /** Stop playing and forget the plan (the game stays as it is, held). */
  function stop() {
    gen++;
    plan = null; playing = false; stepOnce = false; note = "";
    E.pause(true);
    changed();
  }

  // ---- the plans a graph run's data gives

  /** The winning way. @param {ReplayData} r @returns {ReplayPlan} */
  const wayPlan = (r) => ({ title: "the winning way", turns: r.turns, end: r.end, compareEnd: false });

  /**
   * The way from the start to a state (a soft-lock, one without a fitting hint): one turn, compared with the state at its end.
   * @param {ReplayData} r @param {ReplayMove[]} path @param {any} snap @param {string} title @returns {ReplayPlan}
   */
  const pathPlan = (r, path, snap, title) => ({ title, turns: [{ moves: path, snap: r.from, step: null }], end: snap, compareEnd: true });

  // ---- the dock under the picture

  let shownKey = "", scrolled = 0;
  const dock = el("div", { className: "cw-replay", style: { display: "flex", flexDirection: "column", height: "100%", padding: "4px 6px", boxSizing: "border-box" } });

  /** The dock's content again. @param {(step: string) => void} [toChart] */
  function render(toChart) {
    const row = el("div", { style: { display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" } });
    if (plan) {
      const done = at.turn >= plan.turns.length;
      row.append(
        button("⏮", () => { jump(0); }, "back to the start of the way"),
        button(playing ? "⏸ Pause" : "▶ Play", () => { if (playing) pause(); else play(); }, "play the moves one after another"),
        button("⏭ One move", () => { if (!busy || !playing) play(true); }, "play the next move, then stop"),
        ...SPEEDS.map((s) => button(s === speed ? `● ${s}x` : `${s}x`, () => { speed = s; changed(); }, "how fast the game's clock runs")),
        button("■ Stop", () => { stop(); }, "stop and let go of the way (the game stays as it is)"));
      if (toChart) {
        const step = currentStep();
        if (step) row.append(button("Show in chart", () => toChart(step), "the step of the move last played, in the chart"));
      }
      if (done) row.append(el("span", { className: "cw-dim" }, ["(at the end)"]));
    } else row.append(el("span", { className: "cw-dim" }, ["Pick a way in the inspector: the winning way, a soft-lock, a state without a fitting hint."]));
    const text = el("div", { style: { whiteSpace: "pre-wrap", margin: "4px 0", color: /another way|failed/.test(note) ? "#ff9b6b" : "" } }, [note]);
    /** @type {Node[]} */
    const kids = [row, text];
    if (plan) {
      /** @type {ListItem[]} */
      const items = [];
      let n = 0, room = "";
      plan.turns.forEach((t, ti) => t.moves.forEach((m, mi) => {
        n++;
        const past = ti < at.turn || (ti === at.turn && mi < at.move), now = ti === at.turn && mi === at.move;
        // the room, where it changes (the state a turn begins in)
        const where = mi === 0 && t.snap?.room !== room ? (room = t.snap?.room ?? "") : "";
        items.push({ key: `${ti}.${mi}`, label: `${String(n).padStart(3)}. ${describe(m)}${where ? `   (in ${where})` : ""}`, mark: now ? "▶" : "", dim: past,
          title: mi ? "a click into a view, on the way to the move after it (a pick jumps to the start of its turn)" : "jump here (the state before this move)" });
      }));
      const key = `${at.turn}.${at.move}`;
      const wrap = el("div", { style: { flex: "1", minHeight: "0", overflow: "auto" }, onscroll: () => { scrolled = wrap.scrollTop; } }, [E.list({ id: "replay.moves", items, selected: key,
        pick: (k) => { jump(Number(k.split(".")[0])); } })]);
      kids.push(wrap);
      requestAnimationFrame(() => { wrap.scrollTop = scrolled; });
      // the list follows the move that plays (only when it changes: a list scrolled by hand stays while nothing moves)
      if (key !== shownKey) { shownKey = key; requestAnimationFrame(() => wrap.querySelector(".row.on")?.scrollIntoView({ block: "nearest" })); }
    }
    dock.replaceChildren(...kids);
  }

  /** The chart step of the move last played (or the next one's), for the chart. */
  function currentStep() {
    if (!plan) return null;
    for (let i = at.turn - 1; i >= 0; i--) { const s = plan.turns[i]?.step; if (s) return s; }
    return plan.turns[at.turn]?.step ?? null;
  }

  E.modules.replay = {
    describe, differences, load, jump, open, play, pause, stop, wayPlan, pathPlan, render, dock,
    /** @param {(() => void) | null} fn */
    set onChange(fn) { onChange = fn; },
    get plan() { return plan; },
    get at() { return { ...at }; },
    get playing() { return playing || stepOnce; },
    get busy() { return busy; },
    get note() { return note; },
    get speed() { return speed; },
    /** @param {number} s */
    set speed(s) { speed = s; },
    get ended() { return ended; },
    get moveNumber() { return moveNumber(); },
    get count() { return count(); },
  };
})();
