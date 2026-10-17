// pxl launcher for Node < 22.18 (the skill's bin/pxl.js refuses those versions).
// Usage: node --experimental-strip-types --no-warnings tools/pxl.mjs build art/<file>.px.js
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, ".claude", "skills", "claude-pxl", "src", "node", "cli.ts");
const { main } = await import(pathToFileURL(cli).href);
process.exitCode = await main(process.argv.slice(2));
