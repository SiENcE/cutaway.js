// Cutaway.js editor, Help tab (F1): the guides, docs/editor.md (the editor) and docs/reference.md (what a
// game's data can say), copied into editor-help.js by tools/build-editor-help.mjs. Each is cut into its
// sections (## headings): a list of them with a search (how often each has the words; the words marked
// in the text), the section with enough Markdown for the guides (headings, paragraphs, nested and
// numbered lists, tables, code blocks, `code`, **bold**, *italic*, links), and the one before and
// after. F1 opens it at the tab you are on; a link to the other guide opens it. (After Wickbound's.)
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  /** @typedef {{id: string, title: string, md: string}} Section */
  /** @typedef {{id: string, title: string, file: string, md: string, secs?: Section[]}} Book */
  let bookId = "editor", at = "intro", query = "";
  /** @type {Record<string, string>} the tabs and their sections in the editor's guide */
  const FOR_TAB = { room: "room-shapes", texts: "texts", things: "things", art: "art", paint: "paint", sound: "sound", dialogue: "dialogue",
    state: "state", issues: "issues", checks: "checks" };

  /** @param {string} s */
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  /** @param {string} s */
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  /** One line: `code` first (nothing in it is touched), then bold, italic, links. @param {string} s */
  function inline(s) {
    return String(s).split("`").map((part, i) => {
      if (i % 2) return "<code>" + esc(part) + "</code>";
      return esc(part)
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<i>$2</i>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, to) => `<span class="lnk" data-to="${esc(to)}" title="${esc(to)}">${t}</span>`);
    }).join("");
  }

  /** The Markdown the guides use, to HTML. @param {string} md */
  function markdown(md) {
    /** @type {string[]} */
    const para = [];
    const lines = md.split("\n"), out = [];
    const flush = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para.length = 0; } };
    const listRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
    let i = 0;
    while (i < lines.length) {
      const ln = lines[i];
      if (/^```/.test(ln)) {
        flush();
        const code = [];
        for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
        out.push("<pre>" + esc(code.join("\n")) + "</pre>");
        i++; continue;
      }
      const h = /^(#{1,4})\s+(.*)$/.exec(ln);
      if (h) { flush(); const n = Math.min(4, h[1].length + 1); out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
      if (/^\|/.test(ln)) {
        flush();
        const rows = [];
        for (; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(lines[i]);
        const cells = (/** @type {string} */ r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const head = cells(rows[0]), body = rows.slice(/^\|[\s:|-]+\|$/.test(rows[1] ?? "") ? 2 : 1);
        out.push("<table><thead><tr>" + head.map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>" +
          body.map((r) => "<tr>" + cells(r).map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>");
        continue;
      }
      if (listRe.test(ln)) {
        flush();
        /** @type {{ind: number, ord: boolean, text: string}[]} */
        const items = [];
        for (; i < lines.length; i++) {
          const m = listRe.exec(lines[i]);
          if (m) { items.push({ ind: m[1].length, ord: /\d/.test(m[2]), text: m[3] }); continue; }
          if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) { items[items.length - 1].text += " " + lines[i].trim(); continue; }
          break;
        }
        const base = items[0].ind;
        let html = "";
        /** @type {string[]} */
        const open = [];
        for (const it of items) {
          const lvl = it.ind > base ? 1 : 0;
          while (open.length > lvl + 1) html += "</li></" + open.pop() + ">";
          if (open.length === lvl + 1) html += "</li>";
          else { const tag = it.ord ? "ol" : "ul"; html += "<" + tag + ">"; open.push(tag); }
          html += "<li>" + inline(it.text);
        }
        while (open.length) html += "</li></" + open.pop() + ">";
        out.push(html);
        continue;
      }
      if (!ln.trim()) { flush(); i++; continue; }
      para.push(ln.trim());
      i++;
    }
    flush();
    return out.join("\n");
  }

  /** The guides, each cut into its sections (what comes before the first ## is the introduction). @returns {Book[]} */
  function books() {
    const list = /** @type {Book[]} */ (/** @type {any} */ (Cutaway).editorHelp ?? []);
    for (const b of list) {
      if (b.secs) continue;
      const parts = b.md.split(/\n(?=## )/), intro = /** @type {string} */ (parts.shift());
      b.secs = [{ id: "intro", title: (/^#\s+(.*)$/m.exec(intro) ?? [, b.title])[1], md: intro.replace(/^#\s+.*$/m, "").trim() }];
      for (const p of parts) { const t = (/^##\s+(.*)$/m.exec(p) ?? [, "?"])[1]; b.secs.push({ id: slug(t), title: t, md: p.replace(/^##\s+.*$/m, "").trim() }); }
    }
    return list;
  }

  const CSS = `
.cw-help .bar { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin: 4px 0; }
.cw-help .wrap { display: grid; grid-template-columns: var(--nav, 180px) 1fr; gap: 0; border-top: 1px solid #3a3350; }
.cw-help nav { border-right: 1px solid #3a3350; padding: 4px 0; max-height: 78vh; overflow: auto; }
.cw-help nav .row { padding: 2px 8px; cursor: pointer; color: #b8b0c8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cw-help nav .row:hover { color: #ffe14a; background: #221c30; }
.cw-help nav .row.on { color: #ffe14a; background: #221c30; border-left: 2px solid #ffe14a; }
.cw-help nav .n { color: #7a7090; font-size: 10px; margin-left: 4px; }
.cw-help .doc { padding: 4px 12px 30px; max-height: 78vh; overflow: auto; line-height: 1.45; white-space: normal; }
.cw-help .doc h1, .cw-help .doc h2 { color: #ffe14a; font-size: 14px; margin: 4px 0 8px; }
.cw-help .doc h3 { color: #ffe14a; font-size: 12px; margin: 14px 0 4px; }
.cw-help .doc h4 { color: #ffd890; margin: 10px 0 4px; }
.cw-help .doc p { margin: 5px 0; }
.cw-help .doc ul, .cw-help .doc ol { margin: 3px 0 6px; padding-left: 20px; }
.cw-help .doc li { margin: 2px 0; }
.cw-help .doc code { color: #9fe0c0; background: #100d18; padding: 0 3px; }
.cw-help .doc pre { background: #100d18; color: #e8e0f0; padding: 6px 8px; border-left: 2px solid #4a4066; overflow: auto; white-space: pre; }
.cw-help .doc b { color: #fff; }
.cw-help .doc i { color: #ffb070; font-style: normal; }
.cw-help .doc .lnk { color: #b68cff; cursor: pointer; text-decoration: underline; }
.cw-help .doc table { border-collapse: collapse; margin: 5px 0 8px; }
.cw-help .doc th { text-align: left; color: #ffe14a; border-bottom: 1px solid #4a4066; padding: 2px 8px 2px 3px; font-weight: normal; }
.cw-help .doc td { border-bottom: 1px solid #2a2340; padding: 2px 8px 2px 3px; vertical-align: top; }
.cw-help .doc mark { background: #8a5b27; color: #fff0b0; }
`;

  /** @param {HTMLElement} box */
  function build(box) {
    const doc = E.window?.document ?? box.ownerDocument;          // the inspector's own window has its own styles
    if (!doc.getElementById("cw-help-css")) { const st = doc.createElement("style"); st.id = "cw-help-css"; st.textContent = CSS; doc.head.append(st); }
    const all = books();
    if (!all.length) { box.append("The guides (editor-help.js) didn't load."); return; }
    const book = all.find((b) => b.id === bookId) ?? all[0], secs = /** @type {Section[]} */ (book.secs);
    const q = query.trim().toLowerCase();
    /** @param {Section} s */
    const hits = (s) => (q ? (s.title + "\n" + s.md).toLowerCase().split(q).length - 1 : 0);
    if (!secs.some((s) => s.id === at)) at = "intro";
    // a search shows the first section that has the words, unless the open one has them
    if (q && !hits(/** @type {Section} */ (secs.find((s) => s.id === at)))) { const first = secs.find(hits); if (first) at = first.id; }
    const sec = /** @type {Section} */ (secs.find((s) => s.id === at)), i = secs.indexOf(sec);
    const wide = !!E.window;

    const search = /** @type {HTMLInputElement} */ (el("input", { type: "search", placeholder: "search the guides", value: query,
      style: { font: "inherit", width: "150px", background: "#221c30", color: "#eee", border: "1px solid #4a4066" } }));
    search.addEventListener("input", () => {
      query = search.value;
      const pos = search.selectionStart ?? query.length;
      E.refresh();
      setTimeout(() => { const s2 = /** @type {HTMLInputElement | null} */ (box.ownerDocument.querySelector(".cw-help input[type=search]")); s2?.focus(); s2?.setSelectionRange(pos, pos); }, 30);
    });
    const help = el("div", { className: "cw-help" });
    help.append(el("div", { className: "bar" }, [
      ...all.map((b) => el("button", { textContent: b.title + (q ? ` (${(b.secs ?? []).reduce((n, s) => n + (s.title + "\n" + s.md).toLowerCase().split(q).length - 1, 0)})` : ""),
        onclick: () => { bookId = b.id; at = "intro"; E.refresh(); },
        style: { font: "inherit", padding: "2px 8px", cursor: "pointer", color: b === book ? "#1a1426" : "#ddd", background: b === book ? "#ffe14a" : "#2c2540", border: "1px solid #4a4066", borderRadius: "3px" } })),
      search,
      i > 0 ? button("< " + secs[i - 1].title, () => { at = secs[i - 1].id; E.refresh(); }) : "",
      i < secs.length - 1 ? button(secs[i + 1].title + " >", () => { at = secs[i + 1].id; E.refresh(); }) : "",
    ]));
    /** @type {HTMLElement} */
    let nav;
    if (wide) {
      nav = el("nav", {}, secs.filter((s) => !q || hits(s) || s === sec).map((s) => el("div", { className: "row" + (s === sec ? " on" : ""), onclick: () => { at = s.id; E.refresh(); } },
        [s.title, ...(q ? [el("span", { className: "n" }, [String(hits(s))])] : [])])));
    } else {
      nav = el("select", { style: { font: "inherit", background: "#2c2540", color: "#eee", margin: "4px 0", maxWidth: "100%" }, onchange: (/** @type {any} */ e) => { at = e.target.value; E.refresh(); } },
        secs.map((s) => el("option", { value: s.id, selected: s === sec, textContent: s.title + (q ? ` (${hits(s)})` : "") })));
    }
    const page = el("div", { className: "doc" });
    let html = `<h1>${inline(sec.id === "intro" ? sec.title : sec.title)}</h1>` + markdown(sec.md) + `<p style="color:#7a7090">${esc(book.file)}</p>`;
    if (q) {                                                   // the words marked in the text, never inside tags
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      html = html.replace(/>([^<]+)</g, (_m, t) => ">" + t.replace(re, (/** @type {string} */ x) => "<mark>" + x + "</mark>") + "<");
    }
    page.innerHTML = html;
    page.addEventListener("click", (e) => {                   // a link to the other guide (or one of its sections) opens it
      const to = /** @type {any} */ (e.target)?.closest?.(".lnk")?.dataset?.to ?? "";
      const target = all.find((b) => to.includes(b.file.split("/").pop() ?? "?"));
      if (target) { bookId = target.id; const hash = to.split("#")[1]; at = hash ? slug(hash) : "intro"; E.refresh(); }
    });
    if (wide) help.append(el("div", { className: "wrap" }, [nav, page]));
    else help.append(nav, page);
    box.append(help);
  }

  /** Open the help at the section for a tab (F1), or at a book's section. @param {string} [tab] @param {string} [book] @param {string} [section] */
  function open(tab, book, section) {
    if (book) { bookId = book; at = section ?? "intro"; }
    else if (tab === "art" && E.modules.art?.centre === "paint") { bookId = "editor"; at = FOR_TAB.paint; }   // painting: its section
    else if (tab && FOR_TAB[tab]) { bookId = "editor"; at = FOR_TAB[tab]; }
    E.show("help");
  }

  E.tab({ id: "help", label: "Help", build });
  E.modules.help = { open, markdown, books, get at() { return [bookId, at]; }, search(/** @type {string} */ s) { query = s; E.refresh(); } };
})();
