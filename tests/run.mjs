// Run every tests/*.test.mjs. Exits non-zero on any failure; ends with "all passed".
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const t = {
  ok(name, cond, detail = "") {
    if (cond) passed++; else failed++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? "  — " + detail : ""}`);
  },
};
for (const f of readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort()) {
  console.log(`# ${f}`);
  const mod = await import(pathToFileURL(path.join(dir, f)).href);
  await mod.default(t);
}
console.log(failed ? `${failed} failed, ${passed} passed` : `all passed (${passed})`);
process.exitCode = failed ? 1 : 0;
