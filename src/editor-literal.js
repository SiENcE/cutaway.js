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

  E.modules.literal = { skip, value, field, lineOf, lineStart, call, put, setKey, removeKey };
})();
