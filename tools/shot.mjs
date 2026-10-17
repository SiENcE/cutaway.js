// Screenshots of a Cutaway page in headless Chrome, over the DevTools protocol.
//   node tools/shot.mjs <page.html> [options] [--eval "js" --out file.png]...
// Options (in order; --eval, --out, --buffer, --move and --click may repeat and run in order):
//   --size 1280x720     window size in CSS pixels (default 960x540)
//   --dpr 1             device pixel ratio
//   --query "a=1&b"     URL query string (e.g. "manual" for a clock that only moves on advance())
//   --wait 300          ms to wait after load (and after each --eval)
//   --eval "js"         run in the page (awaited), e.g. "Cutaway.clock.advance(1000)"
//   --out file.png      screenshot of the window
//   --buffer file.png   the low-resolution (1x) buffer itself, read from the canvas
//   --move x,y          move the mouse to a logical pixel (hover labels, cursor)
//   --click x,y[,r]     click a logical pixel (r = right button)
// Every page error or console error is printed and makes the exit code non-zero.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "./lib/chrome.mjs";

const args = process.argv.slice(2);
if (!args.length) { console.error("usage: node tools/shot.mjs <page.html> [--size WxH] [--eval js] [--out f.png] ..."); process.exit(2); }
const pageFile = resolve(args.shift());
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const [W, H] = opt("--size", "960x540").split("x").map(Number);
const wait = Number(opt("--wait", "300"));
const query = opt("--query", "");

function save(file, buf) {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(file, buf);
  console.log("wrote " + file);
}

const chrome = await launch({ width: W, height: H, dpr: Number(opt("--dpr", "1")) });
let failed = false;
try {
  await chrome.open(pathToFileURL(pageFile).href + (query ? "?" + query : ""));
  await sleep(wait);
  for (let i = 0; i < args.length; i++) {
    const a = args[i], v = args[i + 1];
    if (a === "--eval") { i++; const r = await chrome.ev(`(async () => { ${v} })()`); if (r !== undefined) console.log(JSON.stringify(r)); await sleep(wait); }
    else if (a === "--out") { i++; save(v, await chrome.screenshot()); }
    else if (a === "--buffer") { i++; save(v, Buffer.from((await chrome.ev("Cutaway.display.buffer.toDataURL('image/png')")).split(",")[1], "base64")); }
    else if (a === "--move" || a === "--click") {
      i++;
      const [x, y, r] = v.split(",");
      await chrome.mouse(a === "--move" ? "move" : r ? "rclick" : "click", Number(x), Number(y));
      await chrome.ev("Cutaway.clock.advance(0)");
    }
    else if (["--size", "--dpr", "--wait", "--query"].includes(a)) i++;
  }
} catch (e) {
  console.error(String(e.stack || e)); failed = true;
} finally {
  for (const e of chrome.errors) console.error(e);
  await chrome.close();
}
process.exitCode = failed || chrome.errors.length ? 1 : 0;
