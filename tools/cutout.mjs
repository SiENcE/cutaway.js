// Cut props out of a lit room render, so they keep the room's baked light and still sort with actors.
//   node tools/cutout.mjs --full room_full.png --layers room_cut/ --prefix room_ --out <pxl-out>/sprites
// `room_full.png` is the room lit with every prop; `room_cut/` holds one PNG per prop (the room's props
// drawn alone, e.g. a pxl scene with `layers: true`). For each layer: the prop's pixels are taken from
// the lit render and written as <prefix><layer>.png, cropped to the prop, with <prefix><layer>.anchor.json
// so the sprite knows its place in the room: build-atlas turns it into an anchor of [-x, -y], and the
// room places the prop at [0, 0] with an explicit baseline.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { decode, encode } from "./lib/png.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const full = opt("--full"), dir = opt("--layers"), prefix = opt("--prefix") ?? "", out = opt("--out");
if (!full || !dir || !out) { console.error("usage: node tools/cutout.mjs --full f.png --layers dir --prefix p_ --out dir"); process.exit(2); }

const lit = decode(readFileSync(full));
mkdirSync(out, { recursive: true });
for (const f of readdirSync(dir).filter((f) => f.endsWith(".png")).sort()) {
  const layer = decode(readFileSync(path.join(dir, f)));
  if (layer.width !== lit.width || layer.height !== lit.height) throw new Error(`${f}: size differs from the full render`);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < layer.height; y++) for (let x = 0; x < layer.width; x++) {
    if (layer.data[(y * layer.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) { console.warn(`${f}: empty, skipped`); continue; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const src = ((y0 + y) * lit.width + x0 + x) * 4, dst = (y * w + x) * 4;
    if (layer.data[src + 3] === 0) continue;
    data.set(lit.data.subarray(src, src + 3), dst);
    data[dst + 3] = 255;
  }
  const name = prefix + f.slice(0, -4);
  writeFileSync(path.join(out, name + ".png"), encode({ width: w, height: h, data }));
  writeFileSync(path.join(out, name + ".anchor.json"), JSON.stringify({ anchor: [-x0, -y0], room: [x0, y0, w, h] }));
  console.log(`${name}: ${w}x${h} at ${x0},${y0} (bottom ${y1 + 1})`);
}
