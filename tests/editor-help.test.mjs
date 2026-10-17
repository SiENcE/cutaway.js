// The editor's Help tab shows docs/editor.md: src/editor-help.js must be its copy
// (node tools/build-editor-help.mjs after changing the guide).
import { readFileSync } from "node:fs";
import { helpFile } from "../tools/build-editor-help.mjs";

export default async function (t) {
  t.ok("editor help: src/editor-help.js is docs/editor.md (run tools/build-editor-help.mjs)", readFileSync("src/editor-help.js", "utf8") === helpFile());
}
