// Load engine source files into a fresh Node vm context (no DOM). Returns the Cutaway namespace.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string[]} files paths relative to src/ */
export function load(files) {
  const ctx = vm.createContext({ console, Math, performance, setTimeout, Promise, JSON, atob, btoa, TextDecoder });
  for (const f of ["core.js", ...files]) {
    vm.runInContext(readFileSync(path.join(root, "src", f), "utf8"), ctx, { filename: f });
  }
  return vm.runInContext("Cutaway", ctx);
}
