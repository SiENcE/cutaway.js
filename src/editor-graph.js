// Cutaway.js editor, Connections tab: the game's connections (tools/graph.mjs: every state searched, every
// move watched) as the puzzle dependency chart in the centre, or the state budget's bars, drawn by
// graph-view.js. The inspector picks the data (the files in the studio's "graph" folder, made by the game's
// tasks whose names begin with "graph", which run from here; without the studio a file is loaded by hand)
// and holds the chart's switches and the selected node. From the chart to the data: a step opens its
// hotspot, actor or item in the Things tab with the script the move runs, in the centre as blocks; a fact
// lists every place in the data that sets or asks it (rooms, hotspots, actors, items, dialogues), each
// opening there. The other way, the Things tab shows the steps of the hotspot or actor picked.
// Watching the solver (editor-replay.js, from the data's `replay`): the winning way played in the game, a soft-lock
// or a state without a fitting hint opened or reached by its way; the game picture in the centre ("Game"), the
// moves and what plays them in the dock under it.
"use strict";

/** A data file in the folder: what its place in the order needs. @typedef {{name: string, act: string | null, set: string[], ways: boolean}} RunFile */

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  /** @type {ReturnType<typeof Cutaway.graphView.create> | null} */
  let g = null;
  /** @type {GraphData | null} */
  let data = null;
  let source = "", mode = "chart", running = "", listed = false;
  /** the folder's data files, in the order "Play all runs" plays them (those without ways at the end) @type {RunFile[]} */
  let files = [];
  /** @type {EditorView | null} */
  let chartView = null;
  /** @type {EditorView | null} */
  let budgetView = null;

  /** The folder the data files are in: the studio's "graph" layer. */
  const folder = () => E.studio.layer("graph") || "out/graph";

  /** graph-view.js, loaded once from beside the editor. */
  function loadView() {
    if (Cutaway.graphView) return Promise.resolve();
    return new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = Cutaway.base + "graph-view.js";
      s.onload = () => ok(undefined);
      s.onerror = () => fail(new Error("no graph-view.js beside the editor"));
      document.head.append(s);
    });
  }

  /** The data from a data file's text (a script: window.CUTAWAY_GRAPH = {...};). @param {string} text @returns {GraphData} */
  function parse(text) {
    const a = text.indexOf("="), b = text.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("not a graph data file (tools/graph.mjs writes them)");
    return JSON.parse(text.slice(a + 1, b + 1));
  }

  /** Show data (a file's text) in the chart. @param {string} text @param {string} name */
  async function show(text, name) {
    await loadView();
    g?.destroy();
    data = parse(text);
    source = name;
    g = Cutaway.graphView.create(data, { onChange: () => E.refresh(), actions });
    chartView = { el: g.chart, shown: () => g?.shown(), selectNone: () => g?.select(null) };
    budgetView = { el: g.budget() };
    E.setStatus(`connections: ${g.about()}`);
    E.refresh();
  }

  /** The data files in the studio's folder. */
  async function listFiles() {
    if (!E.studio.available) return;
    /** @type {RunFile[]} */
    const found = [];
    try {
      for (const f of (await E.studio.list(folder())).filter((/** @type {any} */ f) => !f.dir && f.name.endsWith(".js")))
        found.push(about(f.name, await E.studio.read(`${folder()}/${f.name}`)));
    } catch { /* a folder that isn't there yet: no files */ }
    files = ordered(found);
    E.refresh();
  }

  /**
   * What the order needs of a data file, read from its text without parsing all of it (the act and --set are among
   * its first keys; whether it keeps the ways: a replay with turns). @param {string} name @param {string} text
   * @returns {RunFile}
   */
  function about(name, text) {
    let act = null, set = [];
    try { act = JSON.parse(/"act":(null|"[^"]*")/.exec(text)?.[1] ?? "null"); set = JSON.parse(/"set":(\[[^\]]*\])/.exec(text)?.[1] ?? "[]"); } catch { /* not a data file: last */ }
    return { name, act, set, ways: /"replay":\{/.test(text) && !/"replay":\{[^]*?"turns":\[\]/.test(text) };
  }

  /** Load one of the folder's files. @param {string} name */
  async function open(name) {
    try { await show(await E.studio.read(`${folder()}/${name}`), name); } catch (e) { E.setStatus(`connections: ${/** @type {any} */ (e).message}`); }
  }

  /** Run a task that makes data, then load what it made. @param {string} task */
  async function make(task) {
    running = task; E.refresh();
    const r = await E.runTask(task);
    running = "";
    const made = /wrote (.+\.js)/.exec(r.output)?.[1]?.split(/[\\/]/).pop();
    await listFiles();
    if (made && files.some((f) => f.name === made)) await open(made);
    else E.refresh();
  }

  // ---- from the chart to the data

  /**
   * The move a step makes, read back from its words (tools/lib/solver.mjs describe): what was clicked,
   * how, with what. @param {string} move
   */
  function moveOf(move) {
    const m = move.replace(/ \[choices [\d,]+\]$/, "");
    let r;
    if ((r = /^use (\S+) on (\S+)$/.exec(m))) return { kind: "with", item: r[1], id: r[2] };
    if ((r = /^combine (\S+) \+ (\S+)$/.exec(m))) return { kind: "combine", a: r[1], b: r[2] };
    if ((r = /^look at (\S+)$/.exec(m))) return { kind: "ilook", item: r[1] };
    if ((r = /^(act|look) (\S+)$/.exec(m))) return { kind: r[1], id: r[2] };
    return { kind: m };
  }

  /** Open a thing in the Things tab, and a script of it in the centre. @param {string} room @param {string} key @param {string[]} [path] */
  const openThing = (room, key, path) => E.modules.things?.reveal(room, key, path);

  /** Open where a step happens: its hotspot, actor or item with the script the move runs. @param {GraphNode} n */
  function openStep(n) {
    const m = /** @type {any} */ (moveOf(n.move));
    if (m.kind === "combine") {
      const a = Cutaway.item.get(m.a);
      return a?.combine?.[m.b] !== undefined ? openThing("", `item:${m.a}`, ["combine", m.b]) : openThing("", `item:${m.b}`, ["combine", m.a]);
    }
    if (m.kind === "ilook") return openThing("", `item:${m.item}`, ["look"]);
    if (!m.id) { E.setStatus(`connections: "${n.move}" has no place in the data (it is the game's time going on)`); return; }
    const actor = m.id.startsWith("@") ? m.id.slice(1) : "";
    const key = actor ? `actor:${actor}` : `hot:${m.id}`;
    const def = actor ? Cutaway.actors.get(actor)?.def : Cutaway.room.get(n.room)?.hotspots?.[m.id];
    const verb = m.kind === "look" ? "look" : m.kind === "with" ? "" : actor ? "talk" : def ? Cutaway.ui.verbOf(def) : "use";
    return openThing(n.room, key, m.kind === "with" ? ["with", m.item] : verb === "exit" ? [] : [verb]);
  }

  /** The word a fact is about, as it stands in the data (a flag's name, an item, a room, a thing's id). @param {string} f */
  function wordOf(f) {
    const b = f.replace(/^!/, "");
    let r;
    if ((r = /^(?:has|visited):(.+)$/.exec(b))) return r[1];
    if ((r = /^(?:state|hidden|shown):(?:[^/]+\/)?([^=]+)/.exec(b))) return r[1];
    if ((r = /^at:([^=]+)/.exec(b))) return r[1];
    if ((r = /^~moment\.([^=]+)/.exec(b))) return r[1];
    return b.replace(/=.*$/, "");
  }

  /**
   * Every place in the data that names a word: the scripts and conditions of rooms, hotspots, actors, items
   * and dialogues. @param {string} word
   * @returns {{label: string, go: () => void}[]}
   */
  function placesOf(word) {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), re = new RegExp(`(^|[^A-Za-z0-9_])${esc}([^A-Za-z0-9_]|$)`);
    const says = (/** @type {any} */ v) => v !== undefined && re.test(JSON.stringify(v));
    /** @type {{label: string, go: () => void}[]} */
    const out = [];
    const VERBS = ["look", "use", "talk", "take"];
    for (const id of Cutaway.room.ids()) {
      const r = Cutaway.room.get(id);
      if (says(r.enter)) out.push({ label: `${id}: entering`, go: () => { openThing(id, "room", ["enter"]); } });
      for (const [hid, h] of Object.entries(/** @type {Record<string, any>} */ (r.hotspots ?? {}))) {
        if (says(h.if)) out.push({ label: `${id}/${hid}: shown if`, go: () => { openThing(id, `hot:${hid}`); } });
        for (const v of VERBS) if (says(h[v])) out.push({ label: `${id}/${hid}: ${v}`, go: () => { openThing(id, `hot:${hid}`, [v]); } });
        for (const [it, s] of Object.entries(/** @type {Record<string, any>} */ (h.with ?? {}))) if (says(s)) out.push({ label: `${id}/${hid}: with ${it}`, go: () => { openThing(id, `hot:${hid}`, ["with", it]); } });
      }
      for (const p of /** @type {any[]} */ (r.props ?? [])) if (p.id && says(p.if)) out.push({ label: `${id}/${p.id}: prop there if`, go: () => { openThing(id, `prop:${p.id}`); } });
    }
    for (const a of Cutaway.actors.all()) {
      for (const v of /** @type {const} */ (["look", "talk"])) if (says(a.def[v])) out.push({ label: `${a.id}: ${v}`, go: () => { openThing("", `actor:${a.id}`, [v]); } });
      for (const [it, s] of Object.entries(/** @type {Record<string, any>} */ (a.def.with ?? {}))) if (says(s)) out.push({ label: `${a.id}: with ${it}`, go: () => { openThing("", `actor:${a.id}`, ["with", it]); } });
    }
    for (const id of Cutaway.item.ids()) {
      const it = Cutaway.item.get(id);
      if (says(it?.look)) out.push({ label: `item ${id}: look`, go: () => { openThing("", `item:${id}`, ["look"]); } });
      for (const [b, s] of Object.entries(/** @type {Record<string, any>} */ (it?.combine ?? {}))) if (says(s)) out.push({ label: `item ${id}: combine ${b}`, go: () => { openThing("", `item:${id}`, ["combine", b]); } });
    }
    for (const id of Cutaway.dialog.ids()) if (says(Cutaway.dialog.get(id))) out.push({ label: `dialogue ${id}`, go: () => { E.modules.dialogue?.edit(id); } });
    for (const id of Cutaway.sequence?.ids() ?? []) {
      const q = Cutaway.sequence.get(id);
      for (const part of /** @type {const} */ (["steps", "after"])) if (says(q?.[part])) out.push({ label: `sequence ${id}: ${part}`, go: () => { openThing("", `seq:${id}`, [part]); } });
    }
    // an act's start is in no tab: it says so
    for (const id of Cutaway.act.ids()) if (says(Cutaway.act.get(id)?.start)) out.push({ label: `act ${id}: its start`, go: () => { E.setStatus(`act ${id}: its start (in the game's code, where Cutaway.act("${id}", ...) is)`); } });
    return out;
  }

  // ---- watching the solver: its ways played in the game (editor-replay.js)

  const R = () => E.modules.replay;

  /** Show the game picture with the dock, the way loaded at a turn. @param {number} [turn] */
  async function watchWay(turn = 0) {
    if (!data?.replay?.turns?.length) return;
    mode = "game";
    E.refresh();
    await R().load(R().wayPlan(data.replay), turn);
  }

  /** A state of the solver's: opened as it is, or reached by playing its way. @param {{path: any[], snap: any}} s @param {string} title @param {boolean} playIt */
  async function watchState(s, title, playIt) {
    if (!data?.replay) return;
    mode = "game";
    E.refresh();
    if (playIt) await R().load(R().pathPlan(data.replay, s.path, s.snap, title));
    else await R().open(s.snap, `${title} (as the solver found it; "Play the way there" plays the moves to it)`);
  }

  /** From the dock to the chart: the step of the move last played (in a list of runs, that run's data). @param {string} step @param {string} [run] */
  async function toChart(step, run) {
    R().pause();
    if (run && run !== source) await open(run);
    mode = "chart";
    E.refresh();
    g?.select(step);
    requestAnimationFrame(() => g?.focus(step, 1));
  }

  /**
   * The runs in the order "Play all runs" plays them: by act as the game has them (a run of the whole game first),
   * in an act the run that shuts least away (its --set: the main way before the threads, which shut the rest), then
   * by name; files made before the ways were kept at the end (not played). @param {RunFile[]} runs
   */
  function ordered(runs) {
    const acts = Cutaway.act.ids();
    return [...runs].sort((a, b) => Number(b.ways) - Number(a.ways)
      || (a.act ? acts.indexOf(a.act) : -1) - (b.act ? acts.indexOf(b.act) : -1)
      || a.set.length - b.set.length || a.name.localeCompare(b.name));
  }

  /** Every run in the folder, its winning way, one after another (each from its own start). */
  async function watchAll() {
    if (running) return;
    running = "all runs"; E.refresh();
    await listFiles();
    /** @type {{name: string, data: GraphData}[]} */
    const list = [];
    try {
      for (const f of files.filter((f) => f.ways)) list.push({ name: f.name, data: parse(await E.studio.read(`${folder()}/${f.name}`)) });
    } catch (e) { E.setStatus(`connections: ${/** @type {any} */ (e).message}`); }
    running = "";
    const left = files.filter((f) => !f.ways).map((f) => f.name);
    if (!list.length) { E.setStatus("connections: no run in the folder keeps its ways: make them again"); E.refresh(); return; }
    mode = "game";
    E.refresh();
    await R().load(R().listPlan(list.map((r) => ({ name: r.name, replay: r.data.replay }))));
    E.setStatus(`connections: ${list.length} runs in turn: ${list.map((r) => r.name).join(", ")}${left.length ? `; left out (made before the ways were kept): ${left.join(", ")}` : ""}`);
  }

  /** The inspector's part for watching the solver: the winning way, the soft-locks, the states without a fitting hint. */
  function watchSection() {
    const r = data?.replay;
    if (!r) return el("div", { className: "cw-dim", style: { margin: "4px 0" } }, ["This data was made before the solver could be watched: make it again to play its ways in the game."]);
    const moves = (/** @type {any[]} */ p) => p.map((m) => R().describe(m));
    /** @param {any[]} path */
    const tail = (path) => (path.length > 3 ? "... > " : "") + moves(path.slice(-3)).join(" > ");
    /** A row: what it is, Open, Play the way there. @param {string} label @param {string} title @param {{path: any[], snap: any}} s @param {string} name */
    const row = (label, title, s, name) => el("div", { style: { margin: "3px 0" } }, [
      el("div", { title }, [label]),
      el("div", {}, [button("Open", () => { watchState(s, name, false); }, "the game in this state, as the solver found it"),
        button("Play the way there", () => { watchState(s, name, true); }, "from the start, the moves to it, in the game")])]);
    const way = r.turns.reduce((/** @type {number} */ n, /** @type {any} */ t) => n + t.moves.length, 0);
    return el("div", { className: "cw-sec" }, [E.fold("graph.watch", "watch the solver", () => [
      el("div", {}, [button(r.turns.length ? `▶ The winning way (${way} moves)` : "no winning way", () => { watchWay(); }, "the solver's shortest way, played in the game: the moves one after another, or jump to one")]),
      E.fold("graph.watch.lost", "soft-locks", () => r.lost.length ? r.lost.map((/** @type {any} */ l, /** @type {number} */ i) =>
        row(`${i + 1}. after ${l.path.length} moves: ${tail(l.path)}`, moves(l.path).join(" > "), l, `soft-lock ${i + 1}`))
        : [el("div", { className: "cw-dim" }, ["none"])], { note: String(r.lost.length) }),
      E.fold("graph.watch.hints", "no fitting hint", () => r.unhinted.length ? r.unhinted.map((/** @type {any} */ h, /** @type {number} */ i) =>
        row(`${i + 1}. ${h.hint >= 0 ? `hint ${h.hint}: ` : ""}${h.problem}; after ${h.path.length} moves: ${tail(h.path) || "(the start)"}`, moves(h.path).join(" > "), h, `no fitting hint ${i + 1}`))
        : [el("div", { className: "cw-dim" }, ["none"])], { note: String(r.unhinted.length) }),
    ])]);
  }

  /** What shows under a selected node's details: Open for a step, the places for a fact. @param {GraphNode} n */
  function actions(n) {
    if (n.kind === "step") {
      const turn = data?.replay?.turns?.findIndex((/** @type {any} */ t) => t.step === n.id) ?? -1;
      return [el("div", { style: { margin: "6px 0" } }, [button("Open in Things", () => { openStep(n); }, "the hotspot, actor or item with the script this move runs, in the centre"),
        ...(turn >= 0 ? [button("Play the way from here", () => { watchWay(turn); }, "the winning way in the game, from the state before this step")] : [])])];
    }
    const word = wordOf(n.name), places = placesOf(word);
    return [el("div", { className: "k", style: { marginTop: "6px" } }, [`“${word}” in the data`]),
      el("ul", {}, places.length ? places.map((p) => el("li", { textContent: p.label, onclick: p.go, title: "open it" }))
        : [el("li", { textContent: "nowhere in the data: the game's own code sets or asks it", style: { cursor: "default" } })])];
  }

  /** Chart, budget or the game (leaving the game pauses a way that plays). @param {string} m */
  function setMode(m) {
    if (mode === "game" && m !== "game" && R()?.playing) R().pause();
    mode = m;
    E.refresh();
  }

  // ---- the inspector

  function build(/** @type {HTMLElement} */ box) {
    const tasks = Object.keys(E.studio.config?.tasks ?? {}).filter((t) => /^graph/i.test(t));
    const sec = el("div", { className: "cw-sec" });
    if (E.studio.available && !listed) { listed = true; listFiles(); }
    if (E.studio.available) {
      sec.append(el("div", { className: "cw-dim" }, [`data in ${folder()}/ (the studio's "graph" layer)`]));
      // in the order "Play all runs" plays them, numbered; those without ways after them, dim
      if (files.length) sec.append(E.list({ id: "graph.files", items: files.map((f, i) => ({ key: f.name, label: f.ways ? `${i + 1}. ${f.name}` : `${f.name} (no ways: make it again)`,
        dim: !f.ways, mark: f.name === source ? "●" : "", title: `${f.act ?? "the whole game"}${f.set.length ? ` · set ${f.set.join(",")}` : ""}` })),
        selected: source, height: "110px", pick: (k) => { open(k); } }));
      else sec.append(el("div", { className: "cw-dim" }, ["no data yet: make it with a task below"]));
      sec.append(el("div", { style: { margin: "4px 0" } }, [
        ...tasks.map((t) => button(running === t ? t + " ..." : t, () => { if (!running) make(t); }, (E.studio.config.tasks[t] ?? []).join(" ") + " (searches every state: it can take minutes)")),
        button("↻", () => { listFiles(); }, "list the folder again")]));
      if (files.length > 1) sec.append(el("div", { style: { margin: "4px 0" } }, [button(running === "all runs" ? "▶ All runs ..." : `▶ Play all runs (${files.length})`, () => { watchAll(); },
        "every run's winning way in the game, one after another, each from its own start, in the order of the list above: by act, then the run that shuts least away (its --set), then by name")]));
      if (!tasks.length) sec.append(el("div", { className: "cw-dim" }, ['No tasks to make it: add one to studio.json, e.g. "graph": ["node", "lib/cutaway/tools/graph.mjs", "index.html"].']));
    } else {
      // without the studio this page can't run a task nor list a folder: it says how to make a file, and where it goes
      sec.append(el("div", { className: "cw-dim", style: { whiteSpace: "pre-wrap" } }, [
        "Without the studio: load a data file. Make one in the game's folder:\n" +
        "  node lib/cutaway/tools/graph.mjs index.html --act <act>\n" +
        "(in the engine's own folder: tools/graph.mjs). It searches every state (minutes in a big game), " +
        "writes out/graph/<act>.js (--out another file) and prints a link that opens the chart as a page.\n" +
        "With the studio (node lib/cutaway/tools/studio.mjs) this tab lists the files of its \"graph\" folder " +
        "and runs the game's \"graph\" tasks itself."]));
    }
    const input = /** @type {HTMLInputElement} */ (el("input", { type: "file", accept: ".js", style: { display: "none" }, onchange: async () => {
      const f = input.files?.[0];
      if (f) { try { await show(await f.text(), f.name); } catch (e) { E.setStatus(`connections: ${/** @type {any} */ (e).message}`); } }
    } }));
    sec.append(input, button("Load a file …", () => input.click(), "a data file from anywhere"));
    box.append(sec);
    if (!g) return;
    box.append(el("div", { className: "cw-dim", style: { margin: "4px 0" } }, [g.about()]),
      el("div", { style: { margin: "4px 0" } }, [
        button(mode === "chart" ? "● Chart" : "Chart", () => { setMode("chart"); }, "the puzzle dependency chart"),
        button(mode === "budget" ? "● Budget" : "Budget", () => { setMode("budget"); }, "how much each part of the state multiplies the states"),
        ...(data?.replay ? [button(mode === "game" ? "● Game" : "Game", () => { setMode("game"); }, "the game picture, to watch the solver's ways in it")] : []),
        ...(mode === "chart" ? [button("Fit", () => g?.fit(), "everything in view (or a double click on the chart)")] : [])]));
    box.append(watchSection());
    if (mode === "chart") g.side(box);
  }

  // ---- the other way: a thing's steps (the Things tab asks)

  /**
   * The steps made on a hotspot ("id") or an actor ("@id") in a room, from the data loaded; null when none is.
   * @param {string} room @param {string} id
   */
  function stepsAt(room, id) {
    if (!data || !g) return null;
    return g.model ? [...g.model.nodes.values()].filter((n) => n.kind === "step" && (n.room === room || id.startsWith("@")) && moveOf(n.move).id === id) : [];
  }

  /** A section for the Things tab: the picked thing's steps, each opening the chart there. @param {string} room @param {string} id */
  function section(room, id) {
    const list = stepsAt(room, id);
    if (!list) return null;
    return el("div", { className: "cw-sec" }, [E.fold("things.graph", "connections", () => list.length ? list.map((n) => el("div", { style: { margin: "2px 0", cursor: "pointer" },
      title: "show it in the Connections tab", onclick: () => { E.show("connections"); mode = "chart"; g?.select(n.id); requestAnimationFrame(() => g?.focus(n.id, 1)); } }, [
      el("span", { style: { color: "#7ad8ff" } }, [n.move]),
      el("div", { className: "cw-dim", style: { paddingLeft: "10px" } }, [`needs ${n.reads.map(([f]) => f).join(", ") || "nothing"}; brings ${n.writes.join(", ") || "the end"}`])]))
      : [el("div", { className: "cw-dim" }, ["no step here changes anything (in the data loaded)"])], { note: String(list.length) })]);
  }

  if (E.modules.replay) E.modules.replay.onChange = () => E.modules.replay.render(toChart);
  E.modules.replay?.render(toChart);
  E.tab({ id: "connections", label: "Connections", build, view: () => (g && mode !== "game" ? (mode === "budget" ? budgetView : chartView) : null),
    dock: () => (mode === "game" ? E.modules.replay?.dock ?? null : null), selectNone: () => g?.select(null) });
  E.modules.graph = { show, open, listFiles, openStep, placesOf, wordOf, moveOf, stepsAt, section, watchWay, watchState, watchAll, ordered, setMode,
    get mode() { return mode; }, get view() { return g; }, get data() { return data; } };
})();
