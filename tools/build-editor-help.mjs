// Copy the guides into the editor (src/editor-help.js), so its Help tab (and F1) has them without a
// server: docs/editor.md (the editor) and docs/reference.md (what a game's data can say).
// tests/editor-help.test.mjs fails while the copy and the guides differ.
//   node tools/build-editor-help.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOOKS = [["editor", "Editor", "editor.md"], ["reference", "Reference", "reference.md"]];
const read = (/** @type {string} */ f) => readFileSync(join(root, "docs", f), "utf8").replace(/\r\n/g, "\n");

export const helpFile = () => `// Generated from docs/editor.md and docs/reference.md by tools/build-editor-help.mjs. Do not edit:
// change the guides, then run the tool.
"use strict";

Cutaway.editorHelp = ${JSON.stringify(BOOKS.map(([id, title, file]) => ({ id, title, file: "docs/" + file, md: read(file) })), null, 1)};
`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(root, "src", "editor-help.js"), helpFile());
  console.log("wrote src/editor-help.js");
}
