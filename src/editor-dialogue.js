// Cutaway.js editor, Dialogue tab: the dialogues and their structure. The inspector lists them (who talks
// each one) and the nodes of the one picked; the centre edits it: nodes (rename: the gotos follow; move;
// make one the start; remove), their "on entering" script, and their choices: the text, when it shows
// (`if`), once only, silent, where it leads (stay, a node, end) and what it does (`then`, as blocks:
// editor-script.js). What the game would offer now is marked (a choice's `if` tested on the state in
// play), so are gotos to nowhere and nodes nothing leads to. Test plays it; changes go into the game at
// once and into the edits layer (a dialogue is kept whole there; Save in the Things tab writes the same
// file). Texts can be reworded in the Texts tab too (a text changed here becomes a new text there).
// Keys on a choice row: Up and Down pick a row, Alt+Up and Alt+Down move it, Insert adds one after it,
// Delete removes it, Ctrl+D doubles it, Enter edits its text (Esc back).
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  let sel = "";
  /** @type {string[]} the dialogue's undo (JSON of the tree) */
  let undo = [];
  /** @type {string[]} */
  let redo = [];
  let changed = 0;
  /** @type {EditorView | null} */
  let view = null;
  let viewOf = "";
  /** @type {any} the tree being edited (a copy; the game gets it after each change) */
  let model = null;
  let selRow = "";

  /** Who talks it: the actor whose talk script opens it, if any. @param {string} id */
  function speaker(id) {
    const opens = (/** @type {any} */ s) => JSON.stringify(s ?? null).includes(`"dialog":${JSON.stringify(id)}`);
    return Cutaway.actors.all().find((a) => opens(a.def.talk))?.id ?? "";
  }

  /** @param {Cond | undefined} c */
  const holds = (c) => { try { return Cutaway.state.test(c); } catch { return false; } };
  /** @param {any} n @returns {any[]} */
  const choicesOf = (n) => (Array.isArray(n) ? n : n?.choices ?? []);
  const clone = (/** @type {any} */ v) => JSON.parse(JSON.stringify(v));

  /** Which choices lead to each node, and which nodes nothing reaches. @param {any} tree */
  function links(tree) {
    const nodes = Object.keys(tree), start = nodes[0];
    /** @type {Record<string, string[]>} */
    const from = Object.fromEntries(nodes.map((n) => [n, []]));
    /** @param {any} s @param {string} at */
    const scan = (s, at) => { const t = JSON.stringify(s ?? null); for (const m of t.matchAll(/"dialog":"[^"]*","node":"([^"]+)"/g)) from[m[1]]?.push(at); };
    for (const [n, node] of Object.entries(tree)) {
      choicesOf(node).forEach((c, i) => { if (c.goto && c.goto !== "end" && from[c.goto]) from[c.goto].push(`${n} #${i + 1}`); scan(c.then, `${n} #${i + 1}`); });
      if (!Array.isArray(node)) scan(node.enter, n);
    }
    const reach = new Set([start]), todo = [start];
    while (todo.length) {
      const n = /** @type {string} */ (todo.pop());
      for (const c of choicesOf(tree[n])) if (c.goto && tree[c.goto] && !reach.has(c.goto)) { reach.add(c.goto); todo.push(c.goto); }
    }
    return { from, reach };
  }

  // ------------------------------------------------------------------ changes

  function before() { undo.push(JSON.stringify(model)); if (undo.length > 200) undo.shift(); redo = []; }
  /** The game gets the tree; the view is built again (unless a field changed in place). @param {boolean} [again] */
  function commit(again = true) {
    Cutaway.edits.change("dialogs", sel, clone(model));
    E.modules.things?.touch();
    changed++;
    if (again) render();
    E.refresh();
  }
  /** @param {() => void} fn @param {boolean} [again] */
  function edit(fn, again = true) { before(); fn(); commit(again); }
  /** @param {string[]} from @param {string[]} to */
  function step(from, to) {
    const s = from.pop();
    if (s === undefined) return;
    to.push(JSON.stringify(model));
    model = JSON.parse(s);
    commit();
  }

  /** The node as an object (when it gets an "on entering" script). @param {string} n */
  function asObject(n) { if (Array.isArray(model[n])) model[n] = { choices: model[n] }; return model[n]; }
  /** Nodes in a new order (or renamed), the gotos following. @param {string[]} order @param {Record<string, string>} [renamed] */
  function reorder(order, renamed = {}) {
    /** @type {Record<string, any>} */
    const t = {};
    for (const n of order) t[renamed[n] ?? n] = model[n];
    for (const node of Object.values(t)) for (const c of choicesOf(node)) if (c.goto && renamed[c.goto]) c.goto = renamed[c.goto];
    model = t;
  }

  // ------------------------------------------------------------------ the centre

  /** The choice rows and what they do. @param {string} n @param {any} c @param {number} i @param {string[]} nodes */
  function choiceRow(n, c, i, nodes) {
    const S = E.modules.script, key = `${n}#${i}`, now = holds(c.if) && !(c.once && Cutaway.state.flag(`~dlg.${sel}.${n}.${i}`));
    /** @param {string} k @param {any} v */
    const set = (k, v) => edit(() => { const ch = choicesOf(model[n])[i]; if (v === undefined || v === "" || v === false) delete ch[k]; else ch[k] = v; }, false);
    const text = /** @type {HTMLInputElement} */ (el("input", { className: "text", value: c.text ?? "", spellcheck: false, onchange: () => set("text", text.value) }));
    const cond = /** @type {HTMLInputElement} */ (el("input", { value: S ? S.condText(c.if) : "", spellcheck: false, style: { width: "140px" }, title: 'when it shows: a flag, "!flag", "has:item", "a, b" (all), JSON',
      onchange: () => { try { const v = S ? S.condOf(cond.value) : cond.value; cond.classList.remove("bad"); set("if", v || undefined); } catch { cond.classList.add("bad"); } } }));
    cond.setAttribute("list", "cw-sc-flags");
    const go = /** @type {HTMLSelectElement} */ (el("select", { title: "where it leads", onchange: () => set("goto", go.value || undefined) },
      [el("option", { value: "", textContent: "(stay here)" }), el("option", { value: "end", textContent: "end", selected: c.goto === "end" }),
        ...nodes.map((x) => el("option", { value: x, textContent: "-> " + x, selected: c.goto === x }))]));
    if (c.goto && c.goto !== "end" && !nodes.includes(c.goto)) { go.append(el("option", { value: c.goto, textContent: `-> ${c.goto} (no such node)`, selected: true })); go.classList.add("bad"); }
    const r = el("div", { className: "cw-step cw-ch" + (key === selRow ? " sel" : ""), tabIndex: 0, title: now ? "offered now" : "not now (its condition doesn't hold)",
      onfocusin: () => { selRow = key; } }, [
      el("span", { className: "fold", style: { color: now ? "#7c7" : "#5c5470" } }, [now ? "▸" : "·"]),
      text, el("span", { className: "fd" }, ["if ", cond]),
      el("label", { className: "fd" }, [el("input", { type: "checkbox", checked: !!c.once, onchange: (/** @type {any} */ e) => set("once", e.target.checked) }), "once"]),
      el("label", { className: "fd", title: "don't say the line, just do what follows" }, [el("input", { type: "checkbox", checked: !!c.silent, onchange: (/** @type {any} */ e) => set("silent", e.target.checked) }), "silent"]),
      go,
      el("span", { className: "acts" }, [button("↑", () => moveChoice(key, -1), "Alt+Up"), button("↓", () => moveChoice(key, 1), "Alt+Down"),
        button("⧉", () => dupChoice(key), "Ctrl+D"), button("✕", () => delChoice(key), "Delete")]),
    ]);
    text.dataset.f = key + ":text";
    r.dataset.row = key;
    const out = [r];
    if (S) {
      const b = S.blocks({ id: `${sel}:${key}`, value: c.then, before,
        change: (/** @type {any[]} */ v) => { const ch = choicesOf(model[n])[i]; if (v.length) ch.then = v; else delete ch.then; commit(false); } });
      inner.push(b);
      out.push(el("div", { className: "cw-blk" }, [E.fold(`dlg.then.${sel}.${key}`, "then", [b.el], { folded: !c.then, note: c.then ? S.summary(c.then) : "nothing" })]));
    }
    return out;
  }

  /** @type {ReturnType<NonNullable<typeof E.modules.script>["blocks"]>[]} the blocks in the view (their keys) */
  let inner = [];
  /** @type {HTMLElement | null} */
  let root = null;

  function render() {
    if (!root) return;
    const keepScroll = root.scrollTop;
    inner = [];
    const d = model, S = E.modules.script;
    if (!d) { root.replaceChildren(el("div", { className: "cw-dim" }, ["No dialogue picked."])); return; }
    const nodes = Object.keys(d), { from, reach } = links(d);
    const kids = [el("div", { className: "head" }, [el("span", { className: "t" }, [`dialogue ${sel}`]),
      button("▶ Test", () => test(), "close the editor and start it"),
      button("Revert", () => { if (!confirm(`Back to the game's own "${sel}"?`)) return; Cutaway.edits.revert("dialogs", sel); load(); E.refresh(); }, "the game's own dialogue again (the edits layer forgets it)"),
      button("+ Node", () => addNode()), button("Close", () => close()),
      el("span", { className: "cw-dim" }, [Cutaway.edits.changed("dialogs", sel) ? "changed (File > Save)" : "the game's own"])])];
    nodes.forEach((n, ni) => {
      const node = d[n], choices = choicesOf(node), lost = !reach.has(n);
      const name = /** @type {HTMLInputElement} */ (el("input", { value: n, spellcheck: false, style: { width: "120px", color: "#ffe14a" }, title: "the node's name (the gotos follow)",
        onchange: () => { const v = name.value.trim(); if (!v || v === n || v === "end" || d[v]) { name.value = n; return; } edit(() => reorder(Object.keys(model), { [n]: v })); } }));
      name.dataset.f = `node:${n}`;
      const head = el("div", { className: "cw-step", style: { background: "#221c30" } }, [name,
        el("span", { className: "fd" }, [ni === 0 ? "★ start" : lost ? "⚠ nothing leads here" : `from ${from[n].join(", ")}`]),
        el("span", { className: "acts" }, [
          ...(ni > 0 ? [button("★", () => edit(() => reorder([n, ...nodes.filter((x) => x !== n)])), "make it the start")] : []),
          button("↑", () => { if (ni > 0) edit(() => { const o = nodes.slice(); [o[ni - 1], o[ni]] = [o[ni], o[ni - 1]]; reorder(o); }); }, "move the node up"),
          button("↓", () => { if (ni < nodes.length - 1) edit(() => { const o = nodes.slice(); [o[ni + 1], o[ni]] = [o[ni], o[ni + 1]]; reorder(o); }); }, "move the node down"),
          button("▶", () => test(n), "test from this node"),
          button("✕", () => { if (nodes.length > 1 && confirm(`Remove the node "${n}"?`)) edit(() => { delete model[n]; }); }, "remove the node")])]);
      if (lost && ni > 0) head.style.borderColor = "#c96";
      const body = [];
      if (S) {
        const enter = Array.isArray(node) ? undefined : node.enter;
        const b = S.blocks({ id: `${sel}:${n}:enter`, value: enter, before,
          change: (/** @type {any[]} */ v) => { const o = asObject(n); if (v.length) o.enter = v; else delete o.enter; commit(false); } });
        inner.push(b);
        body.push(E.fold(`dlg.enter.${sel}.${n}`, "on entering", [b.el], { folded: !enter, note: enter ? S.summary(enter) : "nothing" }));
      }
      choices.forEach((c, i) => body.push(...choiceRow(n, c, i, nodes)));
      body.push(el("div", { className: "cw-add" }, [button("+ choice", () => addChoice(n), "a new choice at the end (Insert on a row: after it)")]));
      kids.push(el("div", { style: { margin: "6px 0 10px", border: "1px solid #3a3350", padding: "4px" } }, [E.fold(`dlg.node.${sel}.${n}`, `node ${n}`, [head, ...body],
        { note: `${choices.length} choice${choices.length === 1 ? "" : "s"}` })]));
    });
    kids.push(el("div", { className: "cw-dim", style: { whiteSpace: "pre-wrap" } }, [
      "▸ offered now   · not now.  A choice: Up/Down pick, Alt+Up/Down move, Insert new, Del remove, Ctrl+D double, Enter its text.\n" +
      "Who talks it: an actor's talk script with a dialogue step (Things tab). Texts: also in the Texts tab."]));
    root.replaceChildren(...kids);
    root.scrollTop = keepScroll;
    const f = /** @type {HTMLElement | undefined} */ ([...root.querySelectorAll(".cw-ch")].find((x) => /** @type {HTMLElement} */ (x).dataset.row === selRow));
    if (f && document.activeElement === document.body) f.focus({ preventScroll: true });
  }

  /** @param {string} key @returns {[string, number]} */
  const split = (key) => [key.slice(0, key.lastIndexOf("#")), Number(key.slice(key.lastIndexOf("#") + 1))];
  /** @param {string} key @param {number} d */
  function moveChoice(key, d) {
    const [n, i] = split(key), l = choicesOf(model[n]), j = i + d;
    if (j < 0 || j >= l.length) return;
    edit(() => { [l[i], l[j]] = [l[j], l[i]]; selRow = `${n}#${j}`; });
    focusRow();
  }
  /** @param {string} key */
  function dupChoice(key) { const [n, i] = split(key), l = choicesOf(model[n]); edit(() => { l.splice(i + 1, 0, clone(l[i])); selRow = `${n}#${i + 1}`; }); focusRow(); }
  /** @param {string} key */
  function delChoice(key) {
    const [n, i] = split(key), l = choicesOf(model[n]);
    edit(() => { l.splice(i, 1); selRow = l.length ? `${n}#${Math.min(i, l.length - 1)}` : ""; });
    focusRow();
  }
  /** @param {string} n @param {number} [after] */
  function addChoice(n, after) {
    const l = choicesOf(model[n]), at = after === undefined ? l.length : after + 1;
    edit(() => { l.splice(at, 0, { text: "..." }); selRow = `${n}#${at}`; });
    focusRow(true);
  }
  function addNode() {
    const n = (prompt("Name of the new node:", "node" + (Object.keys(model).length + 1)) ?? "").trim();
    if (!n || n === "end" || model[n]) return;
    edit(() => { model[n] = [{ text: "...", goto: Object.keys(model)[0] }]; });
  }
  /** Give the picked choice the keyboard (or its text). @param {boolean} [text] */
  function focusRow(text = false) {
    const r = /** @type {HTMLElement | undefined} */ ([...(root?.querySelectorAll(".cw-ch") ?? [])].find((x) => /** @type {HTMLElement} */ (x).dataset.row === selRow));
    if (!r) return;
    (text ? /** @type {HTMLElement} */ (r.querySelector("input.text")) : r).focus();
    r.scrollIntoView({ block: "nearest" });
  }

  /** Keys on a choice row (the blocks have theirs). @param {KeyboardEvent} e */
  function keys(e) {
    for (const b of inner) if (b.keys(e)) return true;
    const t = /** @type {HTMLElement} */ (e.target), r = /** @type {HTMLElement | null} */ (t.closest?.(".cw-ch"));
    if (!r?.dataset.row) return false;
    selRow = r.dataset.row;
    const rows = /** @type {HTMLElement[]} */ ([...(root?.querySelectorAll(".cw-ch") ?? [])]), i = rows.indexOf(r);
    const mod = e.ctrlKey || e.metaKey;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { moveChoice(selRow, e.key === "ArrowUp" ? -1 : 1); return true; }
    if (mod && e.code === "KeyD") { dupChoice(selRow); return true; }
    if (mod) return false;
    const go = (/** @type {number} */ j) => { const x = rows[Cutaway.util.clamp(j, 0, rows.length - 1)]; if (x) { selRow = x.dataset.row ?? ""; x.focus(); x.scrollIntoView({ block: "nearest" }); } };
    switch (e.key) {
      case "ArrowDown": go(i + 1); return true;
      case "ArrowUp": go(i - 1); return true;
      case "Enter": focusRow(true); return true;
      case "Delete": case "Backspace": delChoice(selRow); return true;
      case "Insert": case "+": { const [n, k] = split(selRow); addChoice(n, k); return true; }
    }
    return false;
  }

  function load() {
    const d = Cutaway.dialog.get(sel);
    model = d ? clone(d) : null;
    undo = []; redo = [];
    render();
  }

  function close() { viewOf = ""; E.refresh(); }

  /** The centre view for the picked dialogue (made again when another is picked). */
  function current() {
    if (!viewOf) return null;
    if (view && viewOf === sel) return view;
    viewOf = sel;
    E.modules.script?.datalists();
    root = el("div", { className: "cw-sc" });
    root.addEventListener("keydown", (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (e.key === "Escape" && t.dataset.f) { e.preventDefault(); e.stopPropagation(); /** @type {HTMLElement | null} */ (t.closest(".cw-step"))?.focus(); }
    });
    view = { el: root, key: keys, undo: () => step(undo, redo), redo: () => step(redo, undo), selectNone: close };
    load();
    return view;
  }

  // ------------------------------------------------------------------ the inspector

  function build(/** @type {HTMLElement} */ box) {
    const ids = Cutaway.dialog.ids();
    if (ids.length && !ids.includes(sel)) sel = ids[0];
    box.append(el("div", { style: { margin: "4px 0" } }, [
      button("Edit", () => { viewOf = sel; view = null; E.refresh(); }, "the dialogue in the centre"),
      button("▶ Test", () => test(), "close the editor and start it"),
      button("New dialogue", () => {
        const id = (prompt("Id of the new dialogue:", "talk_" + (ids.length + 1)) ?? "").trim();
        if (!id || Cutaway.dialog.get(id)) return;
        Cutaway.edits.change("dialogs", id, { main: [{ text: "Hello.", then: [], goto: "end" }] });
        E.modules.things?.touch(); changed++;
        sel = id; viewOf = id; view = null; E.refresh();
      }, "a new dialogue (an actor's talk script starts it: { dialog: id })")]));
    if (!ids.length) { box.append(el("div", { className: "cw-dim" }, ["No dialogues yet."])); return; }
    box.append(E.list({ id: "dialogues", selected: sel, filter: ids.length > 8, height: "160px",
      pick: (id) => { sel = id; if (viewOf) { viewOf = id; view = null; } E.refresh(); }, open: (id) => { sel = id; viewOf = id; view = null; E.refresh(); },
      items: ids.map((id) => { const who = speaker(id); return { key: id, label: id + (who ? `  (${who})` : ""), mark: Cutaway.edits.changed("dialogs", id) ? "●" : "" }; }) }));
    const d = Cutaway.dialog.get(sel) ?? {}, who = speaker(sel), { from, reach } = links(d);
    if (who) box.append(el("div", { className: "cw-dim" }, [`${who} opens it when talked to`]));
    const nodes = Object.keys(d);
    box.append(el("div", { className: "cw-sec" }, [E.fold("dlg.nodes", "nodes", () => [E.list({ id: "dialogue.nodes", height: "180px",
      pick: (n) => { viewOf = sel; E.refresh(); requestAnimationFrame(() => /** @type {HTMLElement | undefined} */ ([...document.querySelectorAll("[data-f]")].find((x) => /** @type {HTMLElement} */ (x).dataset.f === `node:${n}`))?.scrollIntoView({ block: "start" })); },
      items: nodes.map((n, i) => ({ key: n, label: `${i === 0 ? "★ " : ""}${n}  (${choicesOf(d[n]).length})`, color: reach.has(n) ? undefined : "#c96",
        title: i === 0 ? "the start" : reach.has(n) ? `from ${from[n].join(", ")}` : "nothing leads here" })) })], { note: String(nodes.length) })]));
    box.append(el("div", { className: "cw-dim", style: { marginTop: "4px" } }, ["Pick one and Edit (or Enter, a double click): its nodes and choices in the centre."]));
  }

  /** Close the editor and start a dialogue (the one picked here). @param {string} [node] */
  function test(node) {
    const d = Cutaway.dialog.ids().includes(sel) ? sel : Cutaway.dialog.ids()[0];
    if (!d) return;
    E.close();
    Cutaway.script.run({ dialog: d, ...(node ? { node } : {}) });
  }

  E.tab({ id: "dialogue", label: "Dialogue", build, view: current, save: () => E.modules.things?.save(),
    undo: () => step(undo, redo), redo: () => step(redo, undo), get unsaved() { return E.modules.things?.unsaved ? changed : 0; } });
  E.modules.dialogue = { test, get selected() { return sel || Cutaway.dialog.ids()[0] || ""; },
    /** Edit a dialogue in the centre. @param {string} id */
    edit(id) { sel = id; viewOf = id; view = null; E.show("dialogue"); },
    get model() { return model; }, links };
})();
