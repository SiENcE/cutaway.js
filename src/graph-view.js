// Cutaway.js: the game's connections drawn, from the data tools/graph.mjs writes. Shared by tools/graph.html
// (a page of its own) and the editor's Connections tab (editor-graph.js); not in the engine's load order.
// create(data) gives the chart (an element to put where it should show), side(box) fills a box with what
// steers it (find, switches, rooms) and the selected node's details, and budget() the state budget's bars.
// The chart is the puzzle dependency chart: steps (a move with what it brings about) as boxes in their
// room's colour with its name, facts as pills, the winning way numbered; a click lights up what a node
// needs (to the left) and what it opens (to the right). Its layout is its own (no library): loops broken,
// layers by longest path, long edges through dummies, layers ordered by barycentres (the order with the
// fewest crossings kept), then placed towards their neighbours by isotonic regression (nothing drifts).
"use strict";

/**
 * A step of the data: a move in a room and what it brings about.
 * @typedef {{id: string, room: string, move: string, n: number, wins: number, reads: [string, number][], neg: [string, number][], writes: string[]}} GraphStep
 * @typedef {{page: string, act: string | null, set: string[], states: number, complete: boolean, moves: GraphStep[],
 *   facts: {id: string, by: string[], needs: string[], unless: string[]}[], quantities: string[], way: string[],
 *   factors: {part: string, values: number, factor: number}[]}} GraphData
 * @typedef {{id: string, kind: "step" | "fact", room: string, move: string, name: string, writes: string[], reads: [string, number][], neg: [string, number][],
 *   n: number, wins: number, variants: GraphStep[], by: string[], needs: string[], unless: string[], w: number, h: number, x: number, y: number,
 *   el: SVGGElement | null}} GraphNode
 * @typedef {{from: string, to: string, type: "needs" | "unless" | "brings" | "clears", share?: number, points?: number[][], el?: SVGPathElement}} GraphEdge
 * @typedef {{onChange?: () => void, actions?: (n: GraphNode) => (Node | string)[]}} GraphViewOptions
 *   onChange: the selection or a switch changed (the host shows side() again); actions: more under a selected node's details
 */

Cutaway.graphView = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const CHAR = 6.6, ROW = 22, STEP_H = 30, GAP_Y = 10, GAP_X = 70;
  // the rooms' colours (categorical, in a fixed order, checked for colour blindness on a dark ground);
  // what happens anywhere is grey
  const SLOTS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"], OTHER = "#6f6e66";
  const INK = "#f0efec", MUTED = "#8a897f", LINE = "#383835", BOX = "#242422", GROUND = "#1a1a19", ACCENT = "#3987e5", CRITICAL = "#d03b3b";
  const isClock = (/** @type {string} */ f) => /^(time|day)(=|$)/.test(f);
  const CSS = `
.cwg-chart { position: relative; overflow: hidden; background: ${GROUND}; cursor: grab; width: 100%; height: 100%; }
.cwg-chart.drag { cursor: grabbing; }
.cwg-chart svg { width: 100%; height: 100%; display: block; }
.cwg-chart .node text { font: 11px ui-monospace, Consolas, monospace; fill: ${INK}; pointer-events: none; }
.cwg-chart .node .room { fill: ${MUTED}; font-size: 9px; }
.cwg-chart .node { cursor: pointer; }
.cwg-chart .dim { opacity: .14; }
.cwg-chart .edge { fill: none; stroke-width: 1.2; }
.cwg-tip { position: fixed; pointer-events: none; background: ${BOX}; color: ${INK}; border: 1px solid ${LINE}; border-radius: 4px; padding: 6px 8px; font: 12px system-ui, sans-serif; max-width: 420px; display: none; z-index: 100000; }
.cwg-side { color: #c3c2b7; font: 12px/1.4 system-ui, sans-serif; }
.cwg-side h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: ${MUTED}; margin: 12px 0 4px; font-weight: 600; }
.cwg-side label { display: flex; gap: 6px; align-items: baseline; margin: 2px 0; cursor: pointer; }
.cwg-side input[type=search] { width: 100%; box-sizing: border-box; background: #121211; color: ${INK}; border: 1px solid ${LINE}; border-radius: 4px; padding: 4px 6px; font: inherit; }
.cwg-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.cwg-chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 7px; border: 1px solid ${LINE}; border-radius: 10px; cursor: pointer; color: #c3c2b7; background: none; font: inherit; }
.cwg-chip i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
.cwg-chip.off { opacity: .4; }
.cwg-detail .k { color: ${MUTED}; }
.cwg-detail .t { color: ${INK}; font-weight: 600; margin-bottom: 4px; }
.cwg-detail ul { margin: 2px 0 8px; padding-left: 16px; }
.cwg-detail li { margin: 1px 0; cursor: pointer; }
.cwg-detail li:hover { color: ${ACCENT}; }
.cwg-detail .share { color: ${MUTED}; font-size: 11px; }
.cwg-hint { color: ${MUTED}; }
.cwg-budget { overflow: auto; padding: 16px 22px; background: ${GROUND}; color: #c3c2b7; font: 13px/1.4 system-ui, sans-serif; width: 100%; height: 100%; box-sizing: border-box; }
.cwg-budget p { max-width: 760px; margin: 0 0 12px; }
.cwg-budget .row { display: grid; grid-template-columns: 280px 1fr; align-items: center; gap: 10px; height: 22px; }
.cwg-budget .row:hover { background: ${BOX}; }
.cwg-budget .name { font: 12px ui-monospace, Consolas, monospace; color: ${INK}; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cwg-budget .track { position: relative; height: 14px; }
.cwg-budget .bar { position: absolute; left: 0; top: 0; height: 14px; background: ${ACCENT}; border-radius: 0 4px 4px 0; }
.cwg-budget .val { position: absolute; top: -1px; font-size: 12px; white-space: nowrap; }
.cwg-budget .grid { position: absolute; top: 0; bottom: 0; width: 1px; background: ${LINE}; }
.cwg-budget .axis { display: grid; grid-template-columns: 280px 1fr; gap: 10px; color: ${MUTED}; font-size: 11px; margin-top: 4px; }
.cwg-budget .axis div { position: relative; height: 16px; border-top: 1px solid ${LINE}; }
.cwg-budget .axis span { position: absolute; transform: translateX(-50%); top: 2px; }
`;
  let styled = false;
  function style() {
    if (styled) return;
    styled = true;
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.append(s);
  }

  /** An SVG element. @param {string} tag @param {Record<string, string | number>} [attrs] @param {Element} [parent] @returns {any} */
  function svgEl(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }
  /** An HTML element. @param {string} tag @param {string} [cls] @param {string} [text] @returns {any} */
  function htmlEl(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** @param {GraphData} G @param {GraphViewOptions} [o] */
  function create(G, o = {}) {
    style();
    const byId = new Map(G.moves.map((m) => [m.id, m]));
    // rooms in the order the winning way meets them, then the rest
    /** @type {string[]} */
    const rooms = [];
    for (const id of G.way) { const r = byId.get(id)?.room; if (r !== undefined && !rooms.includes(r)) rooms.push(r); }
    for (const m of G.moves) if (!rooms.includes(m.room)) rooms.push(m.room);
    const placed = rooms.filter((r) => r !== "");
    const colour = (/** @type {string} */ r) => { const i = placed.indexOf(r); return i >= 0 && i < SLOTS.length ? SLOTS[i] : OTHER; };
    const roomName = (/** @type {string} */ r) => r || "(anywhere)";
    const shownRooms = new Set(rooms);
    const opts = { way: false, unused: false, neg: false, partial: false, clock: false, setup: false };
    // the flags the search began with (graph.mjs --set: one shutting a part of the game away) are its setup, no step's need
    const setup = new Set(G.set.map((f) => f.replace(/=.*$/, "")));
    let find = "";
    /** @type {string | null} */
    let selected = null;
    /** @type {{nodes: Map<string, GraphNode>, edges: GraphEdge[], way: string[]}} */
    let model = { nodes: new Map(), edges: [], way: [] };
    let fitted = false;
    const zoom = { x: 0, y: 0, k: 1 };

    const chart = htmlEl("div", "cwg-chart");
    const svg = svgEl("svg", {}, chart);
    const defs = svgEl("defs", {}, svg);
    const marker = svgEl("marker", { id: "cwg-arrow", viewBox: "0 0 8 8", refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: "auto" }, defs);
    svgEl("path", { d: "M0,0 L8,4 L0,8 z", fill: "context-stroke" }, marker);
    const view = svgEl("g", {}, svg);
    const tipEl = htmlEl("div", "cwg-tip");
    document.body.append(tipEl);
    const applyZoom = () => view.setAttribute("transform", `translate(${zoom.x},${zoom.y}) scale(${zoom.k})`);

    /** What is shown, from the data and the switches: steps merged when they bring about the same. */
    function build() {
      const keepRead = (/** @type {[string, number]} */ [f, s]) => (opts.partial || s >= 1) && (opts.clock || !isClock(f)) && (opts.setup || !setup.has(f.replace(/=.*$/, "")));
      const cand = G.moves.filter((m) => shownRooms.has(m.room));
      const needed = new Set();
      for (const m of cand) { for (const [f] of m.reads.filter(keepRead)) needed.add(f); if (opts.neg) for (const [f] of m.neg.filter(keepRead)) needed.add(f); }
      const keep = (/** @type {string} */ f) => { const b = f.replace(/^!/, ""); return (opts.clock || !isClock(b)) && (opts.unused || needed.has(b)); };
      /** @type {Map<string, any>} */
      const steps = new Map(), rename = new Map();
      for (const m of cand) {
        const writes = m.writes.filter(keep), brings = writes.filter((w) => !w.startsWith("!"));
        // one step per move and what it brings about that is needed: variants that differ in what nothing needs,
        // or only in what they take away (a switch turned back on the way), are one
        const id = `${m.room}|${m.move}|${brings.join(",")}`;
        rename.set(m.id, id);
        let st = steps.get(id);
        if (!st) steps.set(id, (st = { id, kind: "step", room: m.room, move: m.move, name: m.move, writes: [], n: 0, wins: 0, cnt: new Map(), ncnt: new Map(), variants: [], by: [], needs: [], unless: [], el: null }));
        st.n += m.n; st.wins += m.wins; st.variants.push(m);
        for (const w of writes) if (!st.writes.includes(w)) st.writes.push(w);
        for (const [f, sh] of m.reads.filter(keepRead)) st.cnt.set(f, (st.cnt.get(f) ?? 0) + sh * m.n);
        if (opts.neg) for (const [f, sh] of m.neg.filter(keepRead)) st.ncnt.set(f, (st.ncnt.get(f) ?? 0) + sh * m.n);
      }
      for (const st of [...steps.values()]) {
        const part = (/** @type {Map<string, number>} */ c) => [...c].map(([f, n]) => /** @type {[string, number]} */ ([f, n / st.n])).filter(([, sh]) => opts.partial || sh >= 0.999).sort();
        st.reads = part(st.cnt); st.neg = part(st.ncnt);
        st.writes.sort();
        // shown: what brings about something needed, what a condition holds back (a door that needs a key; being in
        // its room is no such condition: every step there needs that), the end
        const gated = st.reads.some((/** @type {[string, number]} */ [f]) => f !== `visited:${st.room}`) || st.neg.length;
        if (!st.writes.some((/** @type {string} */ w) => !w.startsWith("!")) && !gated && !st.wins) steps.delete(st.id);
      }
      /** @type {string[]} */
      const way = [];
      for (const id of G.way) { const r = rename.get(id); if (r && steps.has(r) && !way.includes(r)) way.push(r); }
      if (opts.way) {                                     // only the way's steps and what they need, all the way up
        /** @type {Map<string, string[]>} */
        const by = new Map();
        for (const st of steps.values()) for (const f of st.writes) { const b = f.replace(/^!/, ""); if (!by.has(b)) by.set(b, []); /** @type {string[]} */ (by.get(b)).push(st.id); }
        const want = new Set(way), todo = [...way];
        while (todo.length) {
          const st = steps.get(/** @type {string} */ (todo.pop()));
          for (const [f] of [...st.reads, ...st.neg]) for (const p of by.get(f) ?? []) if (!want.has(p)) { want.add(p); todo.push(p); }
        }
        for (const id of [...steps.keys()]) if (!want.has(id)) steps.delete(id);
      }
      /** @type {Map<string, any>} */
      const facts = new Map();
      const fact = (/** @type {string} */ f) => { let x = facts.get(f); if (!x) facts.set(f, (x = { id: "f:" + f, kind: "fact", room: "", move: "", name: f, writes: [], reads: [], neg: [], n: 0, wins: 0, variants: [], by: [], needs: [], unless: [], el: null })); return x; };
      /** @type {GraphEdge[]} */
      const edges = [];
      for (const st of steps.values()) {
        for (const [f, sh] of st.reads) { fact(f).needs.push(st.id); edges.push({ from: "f:" + f, to: st.id, type: "needs", share: sh }); }
        for (const [f, sh] of st.neg) { fact(f).unless.push(st.id); edges.push({ from: "f:" + f, to: st.id, type: "unless", share: sh }); }
        for (const w of st.writes) { const b = w.replace(/^!/, ""); fact(b).by.push(st.id); edges.push({ from: st.id, to: "f:" + b, type: w.startsWith("!") ? "clears" : "brings" }); }
      }
      /** @type {Map<string, GraphNode>} */
      const nodes = new Map([...steps.values(), ...facts.values()].map((n) => [n.id, n]));
      return { nodes, edges, way };
    }

    /** Lay out and draw again (a switch changed). */
    function draw() {
      model = build();
      for (const n of model.nodes.values()) {
        if (n.kind === "step") { n.w = Math.max(roomName(n.room).length * 5.6, n.move.length * CHAR) + 22; n.h = STEP_H; }
        else { n.w = n.name.length * CHAR + 18; n.h = ROW; }
      }
      // absence and taking away don't order the steps (they would make loops): only needs and brings lay them out
      layout([...model.nodes.values()], model.edges.filter((e) => e.type === "needs" || e.type === "brings"));
      render();
      if (selected && !model.nodes.has(selected)) selected = null;
      light();
    }

    /** @param {GraphNode[]} nodes @param {GraphEdge[]} edges */
    function layout(nodes, edges) {
      const idx = new Map(nodes.map((n, i) => [n.id, i])), count = nodes.length;
      const E = edges.filter((e) => idx.has(e.from) && idx.has(e.to)).map((e) => ({ e, u: /** @type {number} */ (idx.get(e.from)), v: /** @type {number} */ (idx.get(e.to)), rev: false }));
      /** @type {number[][]} */
      const out = nodes.map(() => []);
      E.forEach((x, i) => out[x.u].push(i));
      // loops: depth first, an edge back to a node on the stack is turned round
      const state = new Uint8Array(count);
      for (let r = 0; r < count; r++) {
        if (state[r]) continue;
        /** @type {number[][]} */
        const stack = [[r, 0]];
        state[r] = 1;
        while (stack.length) {
          const top = stack[stack.length - 1], [u, k] = top;
          if (k < out[u].length) {
            top[1]++;
            const x = E[out[u][k]];
            if (state[x.v] === 1) x.rev = true;
            else if (!state[x.v]) { state[x.v] = 1; stack.push([x.v, 0]); }
          } else { state[u] = 2; stack.pop(); }
        }
      }
      const pairs = E.map((x) => (x.rev ? [x.v, x.u] : [x.u, x.v]));
      const none = () => /** @type {number[]} */ ([]);
      const preds = nodes.map(none), succs = nodes.map(none);
      for (const [a, b] of pairs) if (a !== b) { succs[a].push(b); preds[b].push(a); }
      // layers by the longest path from the sources
      const layer = new Int32Array(count), indeg = preds.map((p) => p.length), queue = [];
      for (let i = 0; i < count; i++) if (!indeg[i]) queue.push(i);
      /** @type {number[]} */
      const topo = [];
      while (queue.length) {
        const u = /** @type {number} */ (queue.shift());
        topo.push(u);
        for (const v of succs[u]) { layer[v] = Math.max(layer[v], layer[u] + 1); if (!--indeg[v]) queue.push(v); }
      }
      // what nothing brings about (a fact from the start, a step that needs nothing) sits just before its first use
      for (const u of topo.slice().reverse()) if (!preds[u].length && succs[u].length) layer[u] = Math.max(0, Math.min(...succs[u].map((v) => layer[v])) - 1);
      let L = 1;
      for (let i = 0; i < count; i++) L = Math.max(L, layer[i] + 1);
      // long edges through dummies, one per layer crossed
      /** @type {{layer: number, w: number, h: number, dummy: boolean, x: number, y: number, colW: number}[]} */
      const all = nodes.map((n, i) => ({ layer: layer[i], w: n.w, h: n.h, dummy: false, x: 0, y: 0, colW: 0 }));
      const up = all.map(none), down = all.map(none);
      /** @type {number[][]} */
      const chains = [];
      for (const [a, b] of pairs) {
        if (a === b) { chains.push([a]); continue; }
        const chain = [a];
        let prev = a;
        for (let l = layer[a] + 1; l < layer[b]; l++) {
          const d = all.length;
          all.push({ layer: l, w: 0, h: 6, dummy: true, x: 0, y: 0, colW: 0 }); up.push([]); down.push([]);
          down[prev].push(d); up[d].push(prev); chain.push(d); prev = d;
        }
        down[prev].push(b); up[b].push(prev); chain.push(b);
        chains.push(chain);
      }
      /** @type {number[][]} */
      let layers = Array.from({ length: L }, () => []);
      for (const u of topo) layers[layer[u]].push(u);
      all.forEach((n, i) => { if (n.dummy) layers[n.layer].push(i); });
      const pos = new Float64Array(all.length);
      const index = () => layers.forEach((l) => l.forEach((u, j) => { pos[u] = j; }));
      index();
      const crossings = () => {
        let c = 0;
        for (let l = 0; l + 1 < L; l++) {
          /** @type {number[][]} */
          const segs = [];
          for (const u of layers[l]) for (const v of down[u]) segs.push([pos[u], pos[v]]);
          for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) c++;
        }
        return c;
      };
      let best = layers.map((l) => l.slice()), bestC = crossings();
      for (let it = 0; it < 24; it++) {
        const downward = it % 2 === 0, nb = downward ? up : down;
        const order = downward ? [...layers.keys()].slice(1) : [...layers.keys()].reverse().slice(1);
        for (const l of order) {
          const key = new Map(layers[l].map((u) => [u, nb[u].length ? nb[u].reduce((s, v) => s + pos[v], 0) / nb[u].length : pos[u]]));
          layers[l].sort((a, b) => /** @type {number} */ (key.get(a)) - /** @type {number} */ (key.get(b)));
          layers[l].forEach((u, j) => { pos[u] = j; });
        }
        const c = crossings();
        if (c < bestC) { bestC = c; best = layers.map((x) => x.slice()); }
      }
      layers = best;
      index();
      // x: columns as wide as their widest node
      /** @type {number[]} */
      const colX = [];
      /** @type {number[]} */
      const colW = [];
      let x = 0;
      for (let l = 0; l < L; l++) { const w = Math.max(20, ...layers[l].map((u) => all[u].w)); colX.push(x); colW.push(w); x += w + GAP_X; }
      // y: each layer centred, then drawn towards its neighbours: per layer the placement nearest to where each
      // node wants to be that keeps the order and the gaps (pool adjacent violators), so nothing drifts
      const y = new Float64Array(all.length);
      for (const l of layers) { const tot = l.reduce((s, u) => s + all[u].h + GAP_Y, -GAP_Y); let yy = -tot / 2; for (const u of l) { y[u] = yy; yy += all[u].h + GAP_Y; } }
      const centre = (/** @type {number} */ u) => y[u] + all[u].h / 2;
      /** @param {number[]} l @param {number[]} want */
      const place = (l, want) => {
        /** @type {number[]} */
        const off = [];
        let acc = 0;
        for (const u of l) { off.push(acc); acc += all[u].h + GAP_Y; }
        /** @type {number[][]} [sum, count, first] */
        const blocks = [];
        l.forEach((u, j) => {
          blocks.push([want[j] - off[j], 1, j]);
          while (blocks.length > 1 && blocks[blocks.length - 2][0] / blocks[blocks.length - 2][1] > blocks[blocks.length - 1][0] / blocks[blocks.length - 1][1]) {
            const b2 = /** @type {number[]} */ (blocks.pop()), b1 = blocks[blocks.length - 1];
            b1[0] += b2[0]; b1[1] += b2[1];
          }
        });
        for (let b = 0; b < blocks.length; b++) {
          const v = blocks[b][0] / blocks[b][1], end = b + 1 < blocks.length ? blocks[b + 1][2] : l.length;
          for (let j = blocks[b][2]; j < end; j++) y[l[j]] = v + off[j];
        }
      };
      for (let it = 0; it < 16; it++) {
        for (const l of it % 2 ? layers.slice().reverse() : layers) {
          place(l, l.map((u) => {
            const ns = it % 4 < 2 ? (it % 2 ? down[u] : up[u]) : [...up[u], ...down[u]];
            return ns.length ? ns.reduce((s, v) => s + centre(v), 0) / ns.length - all[u].h / 2 : y[u];
          }));
        }
      }
      let minY = Infinity;
      for (let i = 0; i < all.length; i++) minY = Math.min(minY, y[i]);
      all.forEach((n, i) => { n.x = colX[n.layer]; n.y = y[i] - minY; n.colW = colW[n.layer]; });
      nodes.forEach((n, i) => { n.x = all[i].x; n.y = all[i].y; });
      // each edge: out of its source's right side, through its dummies, into its target's left side
      E.forEach((x, k) => {
        const chain = x.rev ? chains[k].slice().reverse() : chains[k];
        x.e.points = chain.map((u, j) => {
          const n = all[u];
          if (n.dummy) return [n.x + n.colW / 2, n.y + 3];
          const right = j === 0 ? !x.rev : x.rev;
          return [n.x + (right ? n.w : 0), n.y + n.h / 2];
        });
      });
    }

    /** @param {number[][]} pts */
    function curve(pts) {
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], dx = Math.max(20, Math.abs(x1 - x0) / 2) * Math.sign(x1 - x0 || 1);
        d += ` C${x0 + dx},${y0} ${x1 - dx},${y1} ${x1},${y1}`;
      }
      return d;
    }

    function render() {
      view.textContent = "";
      const ge = svgEl("g", {}, view), gn = svgEl("g", {}, view);
      const wayNo = new Map(model.way.map((id, i) => [id, i + 1]));
      for (const e of model.edges) {
        const a = /** @type {GraphNode} */ (model.nodes.get(e.from)), b = /** @type {GraphNode} */ (model.nodes.get(e.to));
        if (!e.points) e.points = [[a.x + a.w, a.y + a.h / 2], [b.x, b.y + b.h / 2]];     // absence: straight, it takes no part in the layout
        const stroke = e.type === "unless" || e.type === "clears" ? CRITICAL : e.type === "brings" ? colour(a.room) : MUTED;
        e.el = svgEl("path", { class: "edge", d: curve(e.points), stroke, "marker-end": "url(#cwg-arrow)",
          "stroke-dasharray": e.type === "unless" ? "3 3" : e.share !== undefined && e.share < 0.999 ? "6 4" : "", opacity: e.type === "brings" ? 0.9 : 0.7 }, ge);
      }
      for (const n of model.nodes.values()) {
        const g = svgEl("g", { class: "node", transform: `translate(${n.x},${n.y})` }, gn);
        n.el = g;
        if (n.kind === "step") {
          svgEl("rect", { class: "box", width: n.w, height: n.h, rx: 4, fill: BOX }, g);
          svgEl("rect", { width: 5, height: n.h, rx: 2, fill: colour(n.room) }, g);
          if (n.wins) svgEl("rect", { x: -3, y: -3, width: n.w + 6, height: n.h + 6, rx: 6, fill: "none", stroke: INK, "stroke-width": 1 }, g);
          svgEl("text", { x: 11, y: 11, class: "room" }, g).textContent = roomName(n.room);
          svgEl("text", { x: 11, y: 24 }, g).textContent = n.move;
          const no = wayNo.get(n.id);
          if (no) {
            const s = String(no), bw = s.length * 6 + 8;
            svgEl("rect", { x: n.w - bw + 4, y: -8, width: bw, height: 14, rx: 7, fill: INK }, g);
            const t = svgEl("text", { x: n.w - bw / 2 + 4, y: 3, "text-anchor": "middle" }, g);
            t.textContent = s; t.style.fill = "#121211"; t.style.fontSize = "10px";
          }
        } else {
          svgEl("rect", { class: "box", width: n.w, height: n.h, rx: n.h / 2, fill: GROUND }, g);
          svgEl("text", { x: 9, y: 15 }, g).textContent = n.name;
        }
        g.addEventListener("click", (/** @type {MouseEvent} */ ev) => { ev.stopPropagation(); select(n.id); });
        g.addEventListener("mouseenter", (/** @type {MouseEvent} */ ev) => tip(n, ev));
        g.addEventListener("mousemove", (/** @type {MouseEvent} */ ev) => tip(n, ev));
        g.addEventListener("mouseleave", () => tip(null));
      }
      outline();
    }

    /** Each node's outline: found (accent), on the way (bright), from the start (dashed), else quiet. */
    function outline() {
      const q = find.trim().toLowerCase(), way = new Set(model.way);
      for (const n of model.nodes.values()) {
        const r = n.el?.querySelector(".box");
        if (!r) continue;
        const hit = !!q && (n.kind === "step" ? `${n.room} ${n.move}` : n.name).toLowerCase().includes(q);
        r.setAttribute("stroke", hit ? ACCENT : n.kind === "step" ? (way.has(n.id) ? INK : LINE) : n.by.length ? MUTED : "#5a5953");
        r.setAttribute("stroke-width", hit ? "2.5" : n.kind === "step" && way.has(n.id) ? "1.6" : "1");
        r.setAttribute("stroke-dasharray", n.kind === "fact" && !n.by.length && !hit ? "3 2" : "");
      }
    }

    /** @param {GraphNode | null} n @param {MouseEvent} [ev] */
    function tip(n, ev) {
      if (!n || !ev) { tipEl.style.display = "none"; return; }
      tipEl.textContent = n.kind === "step"
        ? `${roomName(n.room)}: ${n.move} · played ${n.n}×${n.wins ? " · ends the act" : ""}${n.variants.length > 1 ? ` · ${n.variants.length} variants` : ""}`
        : `${n.name} · brought about by ${n.by.length} · needed by ${n.needs.length}${n.by.length ? "" : " · from the start"}`;
      tipEl.style.display = "block";
      tipEl.style.left = ev.clientX + 14 + "px"; tipEl.style.top = ev.clientY + 12 + "px";
    }

    /** Light up the selected node with what it needs and what it opens; the rest dims. */
    function light() {
      if (!selected) {
        for (const n of model.nodes.values()) n.el?.classList.remove("dim");
        for (const e of model.edges) e.el?.classList.remove("dim");
        return;
      }
      const lit = new Set([selected]), litE = new Set();
      /** @param {string} start @param {boolean} forward */
      const walk = (start, forward) => {
        const todo = [start];
        while (todo.length) {
          const u = /** @type {string} */ (todo.pop());
          for (const e of model.edges) {
            if (e.type === "unless" || e.type === "clears") { if ((forward ? e.from : e.to) === u) litE.add(e); continue; }
            const [a, b] = forward ? [e.from, e.to] : [e.to, e.from];
            if (a !== u) continue;
            litE.add(e);
            if (!lit.has(b)) { lit.add(b); todo.push(b); }
          }
        }
      };
      walk(selected, false); walk(selected, true);
      for (const n of model.nodes.values()) n.el?.classList.toggle("dim", !lit.has(n.id));
      for (const e of model.edges) e.el?.classList.toggle("dim", !litE.has(e));
    }

    /** Select a node (null: none). @param {string | null} id */
    function select(id) {
      selected = id && model.nodes.has(id) ? id : null;
      light();
      o.onChange?.();
    }

    /** Bring a node to the middle, readable (scale k). @param {string} id @param {number} [k] */
    function focus(id, k = Math.max(zoom.k, 1)) {
      const n = model.nodes.get(id), r = svg.getBoundingClientRect();
      if (!n || !r.width) return;
      zoom.k = k; zoom.x = r.width / 2 - (n.x + n.w / 2) * k; zoom.y = r.height / 2 - (n.y + n.h / 2) * k;
      applyZoom();
    }

    /** Everything in view. */
    function fit() {
      const b = view.getBBox(), r = svg.getBoundingClientRect();
      if (!b.width || !r.width) return;
      zoom.k = Math.min(r.width / (b.width + 40), r.height / (b.height + 40), 1.5);
      zoom.x = (r.width - b.width * zoom.k) / 2 - b.x * zoom.k;
      zoom.y = (r.height - b.height * zoom.k) / 2 - b.y * zoom.k;
      applyZoom();
      fitted = true;
    }

    chart.addEventListener("wheel", (/** @type {WheelEvent} */ ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const r = svg.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, f = Math.exp(-ev.deltaY * 0.0015);
      zoom.x = mx - (mx - zoom.x) * f; zoom.y = my - (my - zoom.y) * f; zoom.k *= f;
      applyZoom();
    }, { passive: false });
    /** @type {{x: number, y: number, zx: number, zy: number, moved: boolean} | null} */
    let drag = null;
    chart.addEventListener("pointerdown", (/** @type {PointerEvent} */ ev) => { if (ev.button !== 0) return; drag = { x: ev.clientX, y: ev.clientY, zx: zoom.x, zy: zoom.y, moved: false }; chart.classList.add("drag"); });
    const onMove = (/** @type {PointerEvent} */ ev) => {
      if (!drag) return;
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 3) drag.moved = true;
      zoom.x = drag.zx + ev.clientX - drag.x; zoom.y = drag.zy + ev.clientY - drag.y; applyZoom();
    };
    const onUp = () => { chart.classList.remove("drag"); setTimeout(() => { drag = null; }, 0); };
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    chart.addEventListener("click", () => { if (!drag?.moved) select(null); });
    chart.addEventListener("dblclick", fit);

    /** Fill a box with the switches, the rooms and the selected node's details (again after onChange). @param {HTMLElement} box */
    function side(box) {
      const root = htmlEl("div", "cwg-side");
      root.append(htmlEl("h3", "", "Find"));
      const input = htmlEl("input");
      input.type = "search"; input.placeholder = "a fact, a move, a room"; input.value = find;
      input.addEventListener("input", () => { find = input.value; outline(); });
      root.append(input, htmlEl("h3", "", "Show"));
      /** @type {[keyof typeof opts, string][]} */
      const switches = [["way", "only what the winning way needs"], ["unused", "facts nothing needs"], ["neg", "conditions on absence (“not yet …”)"],
        ["partial", "facts read only sometimes"], ["clock", "the clock (time, day)"], ...(setup.size ? /** @type {[keyof typeof opts, string][]} */ ([["setup", `the search's own flags (${[...setup].join(", ")})`]]) : [])];
      for (const [k, text] of switches) {
        const label = htmlEl("label"), cb = htmlEl("input");
        cb.type = "checkbox"; cb.checked = opts[k];
        cb.addEventListener("change", () => { opts[k] = cb.checked; draw(); o.onChange?.(); });
        label.append(cb, text);
        root.append(label);
      }
      root.append(htmlEl("h3", "", "Rooms"));
      const chips = htmlEl("div", "cwg-chips");
      for (const r of rooms) {
        const b = htmlEl("button", "cwg-chip" + (shownRooms.has(r) ? "" : " off")), dot = htmlEl("i");
        dot.style.background = colour(r);
        b.append(dot, roomName(r));
        b.addEventListener("click", () => { if (shownRooms.has(r)) shownRooms.delete(r); else shownRooms.add(r); draw(); o.onChange?.(); });
        chips.append(b);
      }
      root.append(chips, htmlEl("h3", "", "Selected"), detail());
      box.append(root);
    }

    /** The selected node's details: what it needs, brings about, stops; each a link. */
    function detail() {
      const d = htmlEl("div", "cwg-detail");
      const n = selected ? model.nodes.get(selected) : null;
      if (!n) { d.append(htmlEl("span", "cwg-hint", "Click a step or a fact: what it needs lights up to the left, what it opens to the right. Wheel zooms, drag moves, double click fits.")); return d; }
      const k = (/** @type {string} */ t) => d.append(htmlEl("div", "k", t));
      /** @param {[string, string, number?][]} items label, target, share */
      const list = (items) => {
        const ul = htmlEl("ul");
        for (const [label, target, share] of items) {
          const li = htmlEl("li", "", label);
          if (share !== undefined && share < 0.999) li.append(htmlEl("span", "share", ` ${Math.round(share * 100)}%`));
          li.addEventListener("click", () => { select(target); focus(target); });
          ul.append(li);
        }
        if (!items.length) ul.append(htmlEl("li", "", "—"));
        d.append(ul);
      };
      const stepLabel = (/** @type {string} */ sid) => { const s = model.nodes.get(sid); return s ? `${roomName(s.room)}: ${s.move}` : sid; };
      if (n.kind === "step") {
        d.append(htmlEl("div", "t", `${roomName(n.room)}: ${n.move}`));
        k(`played ${n.n}× in the search${n.wins ? ", ends the act" : ""}${n.variants.length > 1 ? `; ${n.variants.length} variants merged (they differ only in what nothing needs)` : ""}`);
        k("needs"); list(n.reads.map(([f, sh]) => [f, "f:" + f, sh]));
        if (n.neg.length) { k("only while not"); list(n.neg.map(([f, sh]) => [f, "f:" + f, sh])); }
        k("brings about"); list(n.writes.map((w) => [w, "f:" + w.replace(/^!/, "")]));
      } else {
        d.append(htmlEl("div", "t", n.name));
        k("brought about by"); list(n.by.map((sid) => [stepLabel(sid), sid]));
        k("needed by"); list(n.needs.map((sid) => [stepLabel(sid), sid]));
        if (n.unless.length) { k("stops"); list(n.unless.map((sid) => [stepLabel(sid), sid])); }
      }
      if (o.actions) d.append(...o.actions(n));
      return d;
    }

    /** The state budget: how many times more states each part makes, on a log scale (×2 is one step). */
    function budget() {
      const box = htmlEl("div", "cwg-budget");
      box.append(htmlEl("p", "", `${G.states} states. Each bar says how many times more states there are because of this part of the state: ` +
        `left out, the search would find that many times fewer. ×2: it doubles them (a flag nobody asks about, set or not at any time); ` +
        `×1: it follows from the rest. Parts are flags, items carried (has:), object states (obj:), once-marks (once:, ~dlg.), visited rooms and where actors are (at:).`));
      const list = G.factors;
      const scale = Math.max(1, Math.ceil(Math.max(0, ...list.map((f) => Math.log2(f.factor)))));
      const ticks = Array.from({ length: scale + 1 }, (_, t) => t);
      for (const f of list) {
        const row = htmlEl("div", "row"), track = htmlEl("div", "track"), bar = htmlEl("div", "bar"), val = htmlEl("div", "val", `×${f.factor.toFixed(2)} · ${f.values} values`);
        row.title = `${f.part}: ×${f.factor} (${f.values} values seen)`;
        for (const t of ticks) { const gl = htmlEl("div", "grid"); gl.style.left = (t / scale) * 90 + "%"; track.append(gl); }
        const w = (Math.log2(f.factor) / scale) * 90;
        bar.style.width = `max(2px, ${w}%)`;
        val.style.left = `calc(${w}% + 6px)`;
        track.append(bar, val);
        row.append(htmlEl("div", "name", f.part), track);
        box.append(row);
      }
      const axis = htmlEl("div", "axis"), ax = htmlEl("div");
      for (const t of ticks) { const s = htmlEl("span", "", "×" + 2 ** t); s.style.left = (t / scale) * 90 + "%"; ax.append(s); }
      axis.append(htmlEl("i"), ax);                       // the names' column stays empty
      box.append(axis);
      if (!list.length) box.append(htmlEl("p", "", "Nothing multiplies the states."));
      return box;
    }

    draw();
    return {
      chart, side, budget, select, focus, fit,
      /** Say a line about the data (what was searched). */
      about: () => `${G.page}${G.act ? " · act " + G.act : ""}${G.set.length ? " · set " + G.set.join(",") : ""} · ${G.states} states${G.complete ? "" : " (the search stopped at its limit)"} · ${G.moves.length} steps · ${G.facts.length} facts`,
      /** The chart was put where it shows: the first time, everything comes into view. */
      shown() { if (!fitted) requestAnimationFrame(fit); },
      get model() { return model; },
      get selected() { return selected ? model.nodes.get(selected) ?? null : null; },
      /** Take the listeners away (the chart is gone for good). */
      destroy() { removeEventListener("pointermove", onMove); removeEventListener("pointerup", onUp); tipEl.remove(); },
    };
  }

  return { create, roomName: (/** @type {string} */ r) => r || "(anywhere)" };
})();
