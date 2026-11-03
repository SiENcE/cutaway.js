// Unit tests for src/post.js: the passes over a room's picture, as pure functions of the pixels and the clock.
import { load } from "./load.mjs";

export default async function (t) {
  const C = load(["post.js"]);
  const P = C.post;
  const pic = (w, h, f) => { const data = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { const [r, g, b] = f(i % w, Math.floor(i / w)); data.set([r, g, b, 255], i * 4); } return { data, w, h }; };
  const at = (px, x, y) => [...px.data.slice((y * px.w + x) * 4, (y * px.w + x) * 4 + 3)];

  const grey = pic(8, 4, (x) => [x * 32, x * 32, x * 32]);
  P.apply(grey, [{ palette: ["#000000", "#808080", "#ffffff"] }]);
  const used = new Set(); for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) used.add(at(grey, x, y).join(","));
  t.ok("palette: every pixel is one of the ramp's colours", [...used].every((c) => ["0,0,0", "128,128,128", "255,255,255"].includes(c)), [...used].join(" "));
  t.ok("palette: dark stays dark, bright goes bright", at(grey, 0, 0).join() === "0,0,0" && at(grey, 7, 0).join() === "255,255,255");

  const flat = () => pic(4, 4, () => [100, 100, 100]);
  const mid = flat(); P.apply(mid, [{ palette: ["#000000", "#ffffff"], dither: true }]);
  const whites = [...Array(16).keys()].filter((i) => mid.data[i * 4] === 255).length;
  t.ok("dither: a flat grey between two colours becomes a pattern of both", whites > 0 && whites < 16, `${whites} of 16 white`);

  const lines = flat(); P.apply(lines, [{ scanlines: 2, amount: 0.5 }]);
  t.ok("scanlines: every second row darker", at(lines, 0, 0)[0] === 100 && at(lines, 0, 1)[0] === 50);

  const n1 = flat(), n2 = flat(), n3 = flat();
  P.apply(n1, [{ noise: 0.1 }], 0); P.apply(n2, [{ noise: 0.1 }], 50); P.apply(n3, [{ noise: 0.1 }], 150);
  t.ok("noise: the same within 100 ms, new after", n1.data.join() === n2.data.join() && n1.data.join() !== n3.data.join());

  const v = pic(9, 9, () => [200, 200, 200]); P.apply(v, [{ vignette: 0.5 }]);
  t.ok("vignette: the middle kept, the corners darker", at(v, 4, 4)[0] === 200 && at(v, 0, 0)[0] < 150);

  P.add("invert", (px) => { for (let i = 0; i < px.data.length; i += 4) { px.data[i] = 255 - px.data[i]; } });
  const inv = flat(); P.apply(inv, [{ invert: true }]);
  t.ok("a game's own pass", at(inv, 0, 0)[0] === 155 && P.names().includes("invert"));
}
