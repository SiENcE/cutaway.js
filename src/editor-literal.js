// Cutaway.js editor: a game's data as written, to change one value in its file. A game's data is JavaScript
// (objects, arrays, strings, numbers, comments, now and then code: a computed list, a variable); this reads the
// literal parts of an expression with where each value stands in the text, so a tab can replace just that value
// and leave the rest of the file (its comments, its layout) as it is. Parts that are code are marked as such and
// left alone: a tab says "computed in code" and opens the file there.
//   const L = Cutaway.editor.modules.literal
//   const n = L.value(src, at)          // the literal starting at `at` (after spaces and comments)
//   L.field(n, "from")                  // a key's node in an object node
//   L.call(src, line, /Cutaway\.routine\s*\(/)   // the arguments of the call on that line (1-based)
"use strict";

/**
 * A literal's node: its kind, where it starts and ends in the text, its value (strings, numbers), its keys
 * (objects: each with where its key begins) or items (arrays).
 * @typedef {{t: "obj" | "arr" | "str" | "num" | "lit" | "code", s: number, e: number, v?: any,
 *   props?: {key: string | null, ks?: number, node: Lit}[], items?: Lit[]}} Lit
 */

(function () {
  const E = Cutaway.editor;

  /** Past spaces and comments. @param {string} src @param {number} i */
  function skip(src, i) {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("//", i)) { const n = src.indexOf("\n", i); i = n < 0 ? src.length : n + 1; continue; }
      if (src.startsWith("/*", i)) { const n = src.indexOf("*/", i + 2); i = n < 0 ? src.length : n + 2; continue; }
      return i;
    }
  }
  /** The end of a string starting at i (its quote). @param {string} src @param {number} i */
  function strEnd(src, i) {
    const q = src[i];
    for (let j = i + 1; j < src.length; j++) { if (src[j] === "\\") j++; else if (src[j] === q) return j + 1; }
    return src.length;
  }
  /** An expression that isn't a literal: to the next , ] } ) at its own depth. @param {string} src @param {number} i */
  function exprEnd(src, i) {
    let d = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") { i = strEnd(src, i); continue; }
      if (src.startsWith("//", i) || src.startsWith("/*", i)) { i = skip(src, i); continue; }
      if (c === "(" || c === "[" || c === "{") d++;
      else if (c === ")" || c === "]" || c === "}") { if (d === 0) return i; d--; }
      else if (c === "," && d === 0) return i;
      i++;
    }
    return i;
  }
  /** The literal starting at i. @param {string} src @param {number} i @returns {Lit} */
  function value(src, i) {
    i = skip(src, i);
    const start = i, c = src[i];
    /** @type {Lit} */
    let n;
    if (c === "{") {
      /** @type {NonNullable<Lit["props"]>} */
      const props = [];
      n = { t: "obj", s: start, e: 0, props };
      i = skip(src, i + 1);
      while (src[i] !== "}" && i < src.length) {
        if (src.startsWith("...", i)) { const e = exprEnd(src, i); props.push({ key: null, node: { t: "code", s: i, e } }); i = e; }
        else {
          let key;
          const ks = i;
          if (src[i] === '"' || src[i] === "'") { const e = strEnd(src, i); key = src.slice(i + 1, e - 1); i = e; }
          else { const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i)); if (!m) return { t: "code", s: start, e: exprEnd(src, start) }; key = m[0]; i += key.length; }
          i = skip(src, i);
          // a shorthand key ({ day, from }) is a variable: code
          if (src[i] === "," || src[i] === "}") { props.push({ key, ks, node: { t: "code", s: ks, e: i } }); }
          else {
            if (src[i] !== ":") return { t: "code", s: start, e: exprEnd(src, start) };
            const v = value(src, i + 1);
            props.push({ key, ks, node: v });
            i = v.e;
          }
        }
        i = skip(src, i);
        if (src[i] === ",") i = skip(src, i + 1);
      }
      n.e = i + 1;
    } else if (c === "[") {
      /** @type {Lit[]} */
      const items = [];
      n = { t: "arr", s: start, e: 0, items };
      i = skip(src, i + 1);
      while (src[i] !== "]" && i < src.length) {
        const v = value(src, i);
        items.push(v);
        i = skip(src, v.e);
        if (src[i] === ",") i = skip(src, i + 1);
      }
      n.e = i + 1;
    } else if (c === '"' || c === "'" || (c === "`" && !src.slice(i, strEnd(src, i)).includes("${"))) {
      const e = strEnd(src, i);
      n = { t: "str", s: start, e, v: src.slice(i + 1, e - 1) };
    } else if (/[-\d.]/.test(c)) {
      const m = /^-?\d*\.?\d+(?:e[+-]?\d+)?/i.exec(src.slice(i));
      n = m ? { t: "num", s: start, e: i + m[0].length, v: Number(m[0]) } : { t: "code", s: start, e: exprEnd(src, start) };
    } else {
      const m = /^(true|false|null|undefined)\b/.exec(src.slice(i));
      n = m ? { t: "lit", s: start, e: i + m[0].length } : { t: "code", s: start, e: exprEnd(src, start) };
    }
    // a literal followed by more (a call on a list, a sum): the whole is code
    const after = skip(src, n.e);
    if (n.t !== "code" && after < src.length && !",]});".includes(src[after])) return { t: "code", s: start, e: exprEnd(src, start) };
    return n;
  }
  /** A key's node in an object node. @param {Lit | null | undefined} o @param {string} key */
  const field = (o, key) => o?.props?.find((p) => p.key === key)?.node;
  /** The line (1-based) a place in the text is on. @param {string} src @param {number} at */
  const lineOf = (src, at) => src.slice(0, at).split("\n").length;
  /** Where a line (1-based) begins. @param {string} src @param {number} line */
  function lineStart(src, line) {
    let i = 0;
    for (let k = 1; k < line && i >= 0; k++) i = src.indexOf("\n", i) + 1;
    return Math.max(0, i);
  }
  /**
   * The arguments of a call on a line: the first match of `re` (ending at its opening bracket) on that line,
   * or on the next lines when a call begins further up (a call in a loop names the line of its own text).
   * @param {string} src @param {number} line @param {RegExp} re @returns {{at: number, args: Lit[]} | null}
   */
  function call(src, line, re) {
    const from = lineStart(src, line), end = src.indexOf("\n", from);
    const g = new RegExp(re.source, "g");
    g.lastIndex = from;
    const m = g.exec(src);
    if (!m || (end >= 0 && m.index > end)) return null;
    /** @type {Lit[]} */
    const args = [];
    let i = skip(src, m.index + m[0].length);
    while (i < src.length && src[i] !== ")") {
      const v = value(src, i);
      args.push(v);
      i = skip(src, v.e);
      if (src[i] === ",") i = skip(src, i + 1); else break;
    }
    return { at: m.index, args };
  }
  /** Replace a node's text. @param {string} src @param {Lit} n @param {string} text */
  const put = (src, n, text) => src.slice(0, n.s) + text + src.slice(n.e);
  /** Set a key of an object node (added before its closing brace if it has none). @param {string} src @param {Lit} o @param {string} key @param {string} text */
  function setKey(src, o, key, text) {
    const f = field(o, key);
    if (f) return put(src, f, text);
    const last = o.props?.[o.props.length - 1]?.node, at = last ? last.e : o.s + 1;
    return src.slice(0, at) + `${last ? ", " : " "}${key}: ${text}` + src.slice(at);
  }
  /** Take a key out of an object node (with its comma). @param {string} src @param {Lit} o @param {string} key */
  function removeKey(src, o, key) {
    const props = o.props ?? [], k = props.findIndex((p) => p.key === key), it = props[k], prev = props[k - 1], next = props[k + 1];
    if (!it || it.ks === undefined) return src;
    if (prev) return src.slice(0, prev.node.e) + src.slice(it.node.e);
    if (next && next.ks !== undefined) return src.slice(0, it.ks) + src.slice(next.ks);
    return put(src, o, "{}");
  }


  // ---- whole lists changed: a list written in a file (a sequence's steps, a moment's script) turned into another
  // value step by step: the items kept stay as written, an item changed in a few keys gets those keys (an if's branches
  // the same way, deeper), others are put in or taken out on lines of their own; the file's comments and layout stay.

  /** The value a literal's node writes (an Error for code: computed there). @param {string} src @param {Lit} n @returns {any} */
  function valueOf(src, n) {
    const raw = src.slice(n.s, n.e);
    switch (n.t) {
      case "num": return n.v;
      case "lit": return raw === "true" ? true : raw === "false" ? false : raw === "null" ? null : undefined;
      case "str": return raw[0] === '"' ? JSON.parse(raw) : raw[0] === "'" ? JSON.parse(`"${raw.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) : raw.slice(1, -1);
      case "arr": return (n.items ?? []).map((x) => valueOf(src, x));
      case "obj": {
        /** @type {Record<string, any>} */
        const o = {};
        for (const p of n.props ?? []) { if (p.key === null || p.node.t === "code") throw new Error("computed"); o[p.key] = valueOf(src, p.node); }
        return o;
      }
      default: throw new Error("computed");
    }
  }
  /** A value written as the game writes its data ({ wait: 500 }, "text", [0, 120]). @param {any} v @returns {string} */
  function lit(v) {
    if (Array.isArray(v)) return `[${v.map(lit).join(", ")}]`;
    if (v && typeof v === "object") {
      const e = Object.entries(v).filter(([, x]) => x !== undefined);
      return e.length ? `{ ${e.map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${lit(x)}`).join(", ")} }` : "{}";
    }
    return typeof v === "string" ? JSON.stringify(v) : String(v);
  }
  /** The spaces a line begins with. @param {string} src @param {number} at */
  function indentAt(src, at) { const ls = src.lastIndexOf("\n", at - 1) + 1; return /^[ \t]*/.exec(src.slice(ls))?.[0] ?? ""; }
  /** Is a node alone on its line (only spaces before it)? @param {string} src @param {Lit} n */
  const alone = (src, n) => /^[ \t]*$/.test(src.slice(src.lastIndexOf("\n", n.s - 1) + 1, n.s));

  /**
   * The edits (text ranges replaced) that turn an array's items from old into new: items kept stay as written, an
   * item changed in a few keys gets those keys (an if's branches the same way, deeper), others are put or taken.
   * @param {string} src @param {Lit} arr @param {any[]} ov @param {any[]} nv @param {{s: number, e: number, text: string}[]} out
   */
  function patchArr(src, arr, ov, nv, out) {
    const items = arr.items ?? [], J = (/** @type {any} */ x) => JSON.stringify(x);
    // a list spread into it (...steps): its items aren't these
    if (items.length !== ov.length || items.some((x) => x.t === "code" && src.startsWith("...", x.s))) throw new Error("computed");
    if (!items.length) { out.push({ s: arr.s, e: arr.e, text: lit(nv) }); return; }
    // the longest run kept, in order
    const n = ov.length, m = nv.length, dp = [...Array(n + 1)].map(() => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = J(ov[i]) === J(nv[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    /** @type {[number, number][]} */
    const keep = [];
    for (let i = 0, j = 0; i < n && j < m;) { if (J(ov[i]) === J(nv[j])) { keep.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
    keep.push([n, m]);
    let oi = 0, ni = 0;
    for (const [ko, kn] of keep) {
      const pairs = Math.min(ko - oi, kn - ni);
      for (let p = 0; p < pairs; p++) patchItem(src, items[oi + p], ov[oi + p], nv[ni + p], out);
      for (let o = oi + pairs; o < ko; o++) out.push(takeOut(src, items, o));
      if (kn - ni > pairs) {
        const add = nv.slice(ni + pairs, kn), after = oi + pairs - 1;
        if (after >= 0) { const ref = items[after], ind = indentAt(src, ref.s); out.push({ s: ref.e, e: ref.e, text: add.map((x) => `,\n${ind}${lit(x)}`).join("") }); }
        else { const ref = items[0], ind = indentAt(src, ref.s); out.push({ s: ref.s, e: ref.s, text: add.map((x) => `${lit(x)},${alone(src, ref) ? "\n" + ind : " "}`).join("") }); }
      }
      oi = ko + 1; ni = kn + 1;
    }
  }
  /** The edit that takes item i out of a list (its line with it, when it is alone there). @param {string} src @param {Lit[]} items @param {number} i */
  function takeOut(src, items, i) {
    const it = items[i];
    let e = skip(src, it.e);
    if (src[e] === ",") e++;
    const rest = src.slice(e, src.indexOf("\n", e) < 0 ? src.length : src.indexOf("\n", e));
    const ls = src.lastIndexOf("\n", it.s - 1) + 1;
    // alone on its line (perhaps with a comment after it): the line goes
    if (alone(src, it) && /^[ \t]*(\/\/.*)?$/.test(rest) && !(items[i + 1] && items[i + 1].s < e + rest.length)) return { s: ls, e: e + rest.length + 1, text: "" };
    while (src[e] === " ") e++;
    return { s: it.s, e, text: "" };
  }
  /** @param {string} src @param {Lit} node @param {any} ov @param {any} nv @param {{s: number, e: number, text: string}[]} out */
  function patchItem(src, node, ov, nv, out) {
    const plain = (/** @type {any} */ x) => x && typeof x === "object" && !Array.isArray(x);
    // written over whole: only what holds no code (a value the code computes isn't put over with a number)
    const whole = () => { if (hasCode(node)) throw new Error("computed"); out.push({ s: node.s, e: node.e, text: lit(nv) }); };
    if (!(node.t === "obj" && plain(ov) && plain(nv))) { whole(); return; }
    const gone = Object.keys(ov).filter((k) => !(k in nv)), added = Object.keys(nv).filter((k) => !(k in ov));
    if (gone.length && added.length) { whole(); return; }
    for (const k of Object.keys(nv)) {
      if (k in ov && JSON.stringify(ov[k]) === JSON.stringify(nv[k])) continue;
      const f = field(node, k);
      if (f && ["then", "else", "once"].includes(k) && f.t === "arr" && Array.isArray(ov[k]) && Array.isArray(nv[k])) { patchArr(src, f, ov[k], nv[k], out); continue; }
      if (f && hasCode(f)) throw new Error("computed");
      if (f) out.push({ s: f.s, e: f.e, text: lit(nv[k]) });
    }
    if (added.length) { const last = node.props?.[node.props.length - 1]?.node, at = last ? last.e : node.s + 1; out.push({ s: at, e: at, text: added.map((k) => `${last ? ", " : " "}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${lit(nv[k])}`).join("") }); }
    for (const k of gone) {
      const props = node.props ?? [], i = props.findIndex((p) => p.key === k), it = props[i], prev = props[i - 1], next = props[i + 1];
      if (prev) out.push({ s: prev.node.e, e: it.node.e, text: "" });
      else if (next && next.ks !== undefined && it.ks !== undefined) out.push({ s: it.ks, e: next.ks, text: "" });
      else whole();
    }
  }
  /** Does a node hold code anywhere (a variable, a call, a spread, a shorthand key)? @param {Lit} n @returns {boolean} */
  function hasCode(n) {
    if (n.t === "code") return true;
    if (n.t === "arr") return (n.items ?? []).some(hasCode);
    if (n.t === "obj") return (n.props ?? []).some((p) => p.key === null || hasCode(p.node));
    return false;
  }
  /**
   * Does what a node writes agree with a value, as far as it is written out? Code is taken as agreeing (what the file
   * computes is what the game holds), but a list must have as many items (a spread: not), an object no keys more.
   * @param {string} src @param {Lit} n @param {any} v @returns {boolean}
   */
  function agrees(src, n, v) {
    if (n.t === "code") return true;
    if (n.t === "arr") {
      const it = n.items ?? [];
      // a list spread into it (...steps) holds as many as it holds: never the items' own
      if (it.some((x) => x.t === "code" && src.startsWith("...", x.s))) return false;
      return Array.isArray(v) && it.length === v.length && it.every((x, i) => agrees(src, x, v[i]));
    }
    if (n.t === "obj") {
      if (!v || typeof v !== "object" || Array.isArray(v)) return false;
      const props = n.props ?? [];
      if (props.some((p) => p.key === null)) return true;                                       // ...spread: what it adds isn't written here
      const keys = props.map((p) => /** @type {string} */ (p.key));
      return Object.keys(v).filter((k) => v[k] !== undefined).every((k) => keys.includes(k)) && props.every((p) => agrees(src, p.node, v[/** @type {string} */ (p.key)]));
    }
    try { return JSON.stringify(valueOf(src, n)) === JSON.stringify(v); } catch { return false; }
  }
  /** The text with the edits made (from the end, so the places stay right); null if two of them meet. @param {string} src @param {{s: number, e: number, text: string}[]} ed */
  function applyEdits(src, ed) {
    const list = ed.slice().sort((a, b) => b.s - a.s || b.e - a.e);
    for (let i = 1; i < list.length; i++) if (list[i].e > list[i - 1].s) return null;
    for (const x of list) src = src.slice(0, x.s) + x.text + src.slice(x.e);
    return src;
  }
  /**
   * A list's text changed from what it holds to `next`, or why not (computed in the code, not what `now` says, edits that meet).
   * @param {string} src @param {Lit} arr the list's node @param {any[]} now what the game holds (the file must say the same)
   * @param {any[]} next @param {(text: string) => Lit | null} again finds the list again in the new text (to check it)
   * @returns {{text: string} | {why: string}}
   */
  function replaceList(src, arr, now, next, again) {
    if (arr.t !== "arr") return { why: "it isn't a list written in the file" };
    // steps that hold code (a place from a table, `A.stairs`) stay as written while they aren't changed
    if (!agrees(src, arr, now)) return { why: (arr.items ?? []).some((x) => x.t === "code") ? "it is put together in the code (a list spread into it)" : "the file doesn't say what the game holds (changed elsewhere)" };
    /** @type {{s: number, e: number, text: string}[]} */
    const ed = [];
    try { patchArr(src, arr, now, next, ed); } catch { return { why: "a value it changes is computed in the code: change that in the file" }; }
    const text = applyEdits(src, ed);
    if (text === null) return { why: "two changes meet" };
    const back = again(text);
    if (!back || !agrees(text, back, next)) return { why: "the text wouldn't read back the same" };
    return { text };
  }

  E.modules.literal = { skip, value, field, lineOf, lineStart, call, put, setKey, removeKey, valueOf, lit, patchArr, applyEdits, replaceList, hasCode, agrees };
})();
