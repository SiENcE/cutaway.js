// Cutaway.js editor, Handoffs tab: what each act hands over to the next. Statically, from the validator
// (tools/lib/validate.mjs) on the live data: what a fresh act keeps, each kept flag's values and where it is
// set and tested (a click opens the place, as in the Issues tab), what it leaves behind on purpose (`leave`),
// how many ways it can begin. From the runs:
// the traced searches in the studio's "graph" folder (tools/graph.mjs data, one per act and `--set`, made by
// the game's tasks whose names begin with "graph" or "handoff", which run from here), checked across the acts by
// tools/lib/handoff.mjs: what an act reads that an earlier one sets but it doesn't keep, what is kept for
// nothing, consequences that never arrive, runs of one act that touch, the ways each act ends for the next.
// Both modules load as modules from beside the engine, which a browser allows only over http: with the studio.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  /** @type {any} the validator's result */
  let checked = null;
  /** @type {any} the runs' report (tools/lib/handoff.mjs) */
  let report = null;
  /** @type {string[]} the runs read (their files) */
  let files = [];
  let running = "", failed = "", busy = false, started = false;

  /** The folder the runs are in: the studio's "graph" layer. */
  const folder = () => E.studio.layer("graph") || "out/graph";

  /** A tool's module from beside the engine (a game's pinned copy keeps them in lib/cutaway/tools). @param {string} name */
  async function tool(name) {
    for (const u of [Cutaway.base + "tools/lib/" + name, Cutaway.base + "../tools/lib/" + name]) {
      try { return await import(u); } catch { /* the next */ }
    }
    throw new Error(`tools/lib/${name} isn't beside the engine`);
  }

  /** The validator on the live data, then the runs in the graph folder checked across the acts. */
  async function check() {
    busy = true; failed = ""; E.refresh();
    try {
      const v = await tool("validate.mjs"), h = await tool("handoff.mjs");
      checked = v.validate(Cutaway, { ...(Cutaway.started ?? {}), languages: Cutaway.started?.languages ?? Cutaway.menu.languages });
      /** @type {any[]} */
      const graphs = [];
      files = [];
      if (E.studio.available) {
        /** @type {{name: string, dir: boolean}[]} */
        let list = [];
        try { list = (await E.studio.list(folder())).filter((f) => !f.dir && f.name.endsWith(".js")); } catch { /* no folder yet */ }
        for (const f of list) {
          try { graphs.push({ ...h.parseGraph(await E.studio.read(`${folder()}/${f.name}`)), file: f.name }); files.push(f.name); } catch { /* not a graph file */ }
        }
      }
      report = h.handoff(graphs, { acts: checked.acts, flags: checked.flags });
      const keeps = checked.issues.filter((/** @type {any} */ i) => /^act \S+\.(keep|leave)$/.test(i.where));
      const n = (/** @type {string} */ lv) => keeps.filter((/** @type {any} */ i) => i.level === lv).length;
      E.setStatus(`handoffs: ${report.errors + n("error")} errors, ${report.warnings + n("warning")} warnings (${graphs.length} runs)`);
    } catch (e) {
      checked = null; report = null;
      failed = `The tools didn't load here (${/** @type {any} */ (e)?.message ?? e}).\n` +
        (E.studio.available ? "Are lib/cutaway/tools/lib/validate.mjs and handoff.mjs there?" : "This tab needs the studio (http): node lib/cutaway/tools/studio.mjs.");
    }
    busy = false; E.refresh();
  }

  /** Run a task that makes runs, then check again. @param {string} task */
  async function make(task) {
    running = task; E.refresh();
    await E.runTask(task);
    running = "";
    await check();
  }

  const COLOR = { error: "#ff8a7a", warning: "#e6c86a", info: "#9ab8d8" };
  /** A place (a validator's where) to click. @param {string} w */
  const place = (w) => el("div", { title: "open it", onclick: () => { E.modules.issues?.go(w); },
    style: { cursor: "pointer", color: "#8a84a0", fontSize: "11px", paddingLeft: "10px" } }, [w]);

  /** One act: what it keeps, the ways it begins, its runs and what they found. @param {any} a the validator's act @param {number} i */
  function act(a, i) {
    const def = Cutaway.act.get(a.id), dyn = report?.acts.find((/** @type {any} */ x) => x.id === a.id);
    // the validator's word on its keep (a kept flag nothing sets or tests), then what the runs found
    const probs = [...(checked?.issues ?? []).filter((/** @type {any} */ x) => x.where === `act ${a.id}.keep` || x.where === `act ${a.id}.leave`), ...(dyn?.problems ?? [])];
    const n = (/** @type {string} */ lv) => probs.filter((/** @type {any} */ p) => p.level === lv).length;
    const note = [n("error") ? `${n("error")} errors` : "", n("warning") ? `${n("warning")} warnings` : ""].filter(Boolean).join(", ");
    return E.fold(`handoff.${a.id}`, `act ${a.id}${def?.title ? ` · ${Cutaway.i18n.t(def.title)}` : ""}`, () => {
      /** @type {(Node | string)[]} */
      const out = [];
      const keeps = i === 0 ? "keeps nothing: the first act, a new game begins it"
        : !a.fresh ? "not fresh: everything the act before leaves comes along"
        : a.keep.length ? `keeps ${a.keep.length} flag${a.keep.length === 1 ? "" : "s"}: up to ${a.variants ?? "many"} hand-over variants`
        : "keeps nothing: it begins clean";
      out.push(el("div", { style: { margin: "2px 0" } }, [keeps]));
      /** a kept or left flag: its values, where it is set and tested @param {any} k @param {boolean} left */
      const flag = (k, left) => {
        out.push(el("div", { style: { marginTop: "4px" } }, [el("b", {}, [k.flag]), el("span", { className: "cw-dim" }, [left ? "  left behind: always unset here"
          : `  ${k.values === null ? "counts (many values)" : k.values.length ? k.values.join(" | ") : "set nowhere"} or unset`])]));
        out.push(el("div", { className: "cw-dim", style: { fontSize: "11px" } }, [k.setAt.length ? "set at" : "set nowhere"]), ...k.setAt.map(place));
        out.push(el("div", { className: "cw-dim", style: { fontSize: "11px" } }, [k.testedAt.length ? "tested at" : "tested nowhere"]), ...k.testedAt.map(place));
      };
      for (const k of a.keep) flag(k, false);
      if (a.leave?.length) {
        out.push(el("div", { style: { marginTop: "6px" } }, [`leaves ${a.leave.length} flag${a.leave.length === 1 ? "" : "s"} behind on purpose`]));
        for (const k of a.leave) flag(k, true);
      }
      if (!dyn || !dyn.runs.length) out.push(el("div", { className: "cw-dim", style: { marginTop: "6px" } }, ["no runs of this act (make them with graph.mjs --act " + a.id + ")"]));
      else {
        out.push(el("div", { className: "cw-dim", style: { marginTop: "6px" } }, [`runs: ${dyn.runs.map((/** @type {any} */ r) => `${r.label}${r.states ? ` ${r.states} states` : ""}${r.complete ? "" : " (stopped at its limit)"}`).join(", ")}; reads ${dyn.reads.length} flags, writes ${dyn.written.length}`]));
        if (!dyn.problems.length) out.push(el("div", { style: { color: "#7a7" } }, ["the runs found nothing wrong"]));
      }
      for (const p of probs) {
        out.push(el("div", { style: { padding: "2px 4px", borderBottom: "1px solid #2a2340", color: /** @type {any} */ (COLOR)[p.level] } }, [p.msg,
          ...(p.writers ? [el("div", { className: "cw-dim", style: { fontSize: "11px" } }, [`set by ${p.writers.join(", ")}; read by ${p.runs.join(", ")}`])] : []),
          ...(p.at ?? []).map((/** @type {string} */ s) => el("div", { style: { color: "#8a84a0", fontSize: "11px", paddingLeft: "10px" } }, [s])),
          ...(p.flag && checked?.flags.setAt[p.flag] ? [el("div", { className: "cw-dim", style: { fontSize: "11px" } }, [`"${p.flag}" set at`]), ...checked.flags.setAt[p.flag].map(place)] : [])]));
      }
      return out;
    }, { note });
  }

  function build(/** @type {HTMLElement} */ box) {
    if (!started && !busy && E.studio.available) { started = true; check(); }
    const tasks = Object.keys(E.studio.config?.tasks ?? {}).filter((t) => /^(graph|handoff)/i.test(t));
    box.append(el("div", { style: { margin: "4px 0" } }, [
      button(busy ? "checking ..." : checked ? "Check again" : "Check", () => { if (!busy) check(); }, "the validator on the game as it is now, and the runs in the graph folder read again"),
      ...tasks.map((t) => button(running === t ? t + " ..." : t, () => { if (!running) make(t); }, (E.studio.config.tasks[t] ?? []).join(" ") + " (searches every state: it can take minutes)"))]));
    if (!E.studio.available) {
      box.append(el("div", { className: "cw-dim", style: { whiteSpace: "pre-wrap" } }, [
        "This tab needs the studio (node lib/cutaway/tools/studio.mjs): it loads the validator and reads the runs " +
        "in its \"graph\" folder. Without it, in the game's folder:\n" +
        "  node lib/cutaway/tools/graph.mjs index.html --act <act> --out out/graph/<act>.js\n" +
        "  node lib/cutaway/tools/handoff.mjs out/graph --page index.html"]));
      return;
    }
    if (failed) { box.append(el("div", { style: { color: "#c96", whiteSpace: "pre-wrap" } }, [failed])); return; }
    if (!checked) { box.append(el("div", { className: "cw-dim" }, ["Checks what each act hands over to the next."])); return; }
    box.append(el("div", { className: "cw-dim" }, [files.length ? `${files.length} run${files.length === 1 ? "" : "s"} in ${folder()}/: ${files.join(", ")}` : `no runs in ${folder()}/ yet: make them with a task above`]));
    if (!tasks.length) box.append(el("div", { className: "cw-dim" }, ['No tasks to make runs: add one to studio.json, e.g. "graph: act1": ["node", "lib/cutaway/tools/graph.mjs", "index.html", "--act", "act1", "--out", "out/graph/act1.js"].']));
    for (const n of report?.notes ?? []) box.append(el("div", { style: { color: "#c96" } }, [n]));
    if (!checked.acts.length) box.append(el("div", { className: "cw-dim" }, ["The game has no acts (Cutaway.act)."]));
    checked.acts.forEach((/** @type {any} */ a, /** @type {number} */ i) => box.append(el("div", { className: "cw-sec" }, [act(a, i)])));
  }

  E.tab({ id: "handoffs", label: "Handoffs", build });
  E.modules.handoffs = { check, get report() { return report; }, get checked() { return checked; } };
})();
