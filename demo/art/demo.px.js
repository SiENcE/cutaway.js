// Cutaway.js demo art (original placeholder art for the engine's own demo; no game content).
// Build: node --experimental-strip-types --no-warnings tools/pxl.mjs build demo/art/demo.px.js --out out/demo-art
// then: node tools/build-atlas.mjs out/demo-art demo/assets.js
pal({
  k: "#241a2e",                                         // outline
  W: "#d08a4a", w: "#e8a860", V: "#a8663a",             // wall: ochre, shade, wainscot
  F: "#7a4a32", f: "#9a6040", d: "#5e3626",             // floor boards, light, joints
  s: "#8ad0f8", S: "#5aa8e8", c: "#f8f4ec",             // sky, cloud
  h: "#c87a3a", H: "#8a4e26",                           // crate wood
  m: "#b8c2d0", M: "#7a8498", n: "#e8eef6",             // robot metal
  e: "#5af0c0", r: "#f05a5a", y: "#f8d050",             // eye glow, antenna bulb, brass
  g: "#5ab04a", G: "#3a7a3a", p: "#c85a3a", P: "#8a3a2a", // plant, pot
  b: "#3a2a44",                                         // dark visor
})
ramps("kVWw", "kdFf", "kHh", "kMmn", "kGg", "kPp")

// ---------------------------------------------------------------- the hall (320x180)
scene("hall_bg", { w: 320, h: 180, bg: "W" },
  rect(0, 0, 320, 8, "V"),                              // ceiling beam
  rect(0, 92, 320, 26, "V"), hline(0, 92, 320, "w"),    // wainscot with a lit top edge
  (c) => { for (let x = 12; x < 320; x += 24) c.vline(x, 96, 20, "W") },
  rect(0, 118, 320, 62, "F"),                           // floor
  (c) => {                                              // boards: long lines with offset joints
    for (let y = 118, i = 0; y < 180; y += 8 + i, i++) {
      c.hline(0, y, 320, "d")
      for (let x = (i * 37) % 60; x < 320; x += 60) c.vline(x, y + 1, 7 + i, "d")
    }
    c.hline(0, 119, 320, "f")
  },
  // window with sky and a cloud
  rect(118, 20, 64, 52, "k"), rect(120, 22, 60, 48, "s"), rect(120, 52, 60, 18, "S"),
  ellipse(140, 40, 10, 5, "c"), ellipse(150, 37, 8, 5, "c"),
  rect(149, 22, 2, 48, "k"), rect(120, 45, 60, 2, "k"), rect(114, 72, 72, 4, "V"), hline(114, 72, 72, "w"),
  // door on the right
  rect(262, 30, 44, 89, "k"), rect(264, 32, 40, 87, "H"), rect(268, 36, 32, 34, "h"), rect(268, 76, 32, 38, "h"),
  rect(296, 76, 3, 3, "y"),
  // a shelf on the left with jars
  rect(28, 52, 60, 3, "H"), hline(28, 52, 60, "h"),
  rect(34, 40, 8, 12, "S"), rect(46, 44, 6, 8, "r"), rect(56, 38, 10, 14, "g"), rect(72, 42, 8, 10, "y"),
)

// ---------------------------------------------------------------- props
sprite("crate", { w: 34, h: 34, outline: "k" },             // a big crate with a small box on top
  rect(0, 10, 34, 24, "h"), box(0, 10, 34, 24, "H"), line(1, 11, 32, 32, "H"), line(32, 11, 1, 32, "H"),
  rect(4, 0, 18, 10, "h"), box(4, 0, 18, 10, "H"), hline(5, 1, 16, "y"),
)
sprite("plant", { outline: "k" }, `
  ...g.....g..
  ..ggg...gg..
  .gGgg..gGg..
  ..gGgg.gg...
  ...gGggg..g.
  .g..gGgg.gg.
  .gg.gGggGg..
  ..ggGgGGg...
  ...GggGg....
  ....GGG.....
  ..pppppppp..
  ..PPPPPPPP..
  ...pppppp...
  ...pppppp...
  ...pPppppp..
  ....PPPPP...`)

// ---------------------------------------------------------------- Pip, a small robot (side view, facing right)
sprite("_pip_top", `
  ......r.....
  ......M.....
  ...mmmmmmm..
  ..mnnnnnnmm.
  ..mnmmmbbbbm
  ..mnmmmbeebm
  ..mmmmmbbbbm
  ..mmmmmmmmm.
  ...MMMMMMM..
  .....yy.....
  ...gggggg...
  ..gggggggg..
  ..ggyygggg..
  ..ggyygggg..
  ..gggggggg..
  ...GGGGGG...`)
// Bolt, Pip's taller friend: same build, orange body, red eye (a recolour plus a longer neck)
pal({ q: "#f0903a", Q: "#b0582a", R: "#ff6a5a" })
sprite("_bolt_top", { base: "_pip_top", swap: { g: "q", G: "Q", e: "R" } })

// legs: [near foot dx, near lift, far foot dx, far lift] per frame; the body bobs on lifts
const PIP_WALK = [[2, 0, -2, 0], [0, 1, 0, 0], [-2, 0, 2, 0], [0, 0, 0, 1]]   // 4 frames x 200 ms
const robot = (top, legLen) => (c, [nx, nl, fx, fl], talk) => {
  const bob = nl || fl ? 1 : 0, hip = 16 + legLen - 5, foot = 22 + legLen - 5
  const leg = (x, dx, lift, key) => {                  // a 2 px leg leaning towards its foot
    for (let y = hip; y <= foot - 1 - lift; y++) c.rect(x + Math.round(dx * (y - hip) / (foot - 1 - hip - lift || 1)), y, 2, 1, key)
    c.rect(x + dx - 1, foot - lift, 4, 1, "M")
  }
  leg(3, fx, fl, "M")
  c.stamp(top, 0, bob + legLen - 5)
  if (talk) c.rect(9, 6 + bob + legLen - 5, 2, 1, "y")
  leg(7, nx, nl, "m")
}
for (const [name, top, legLen] of [["pip", "_pip_top", 5], ["bolt", "_bolt_top", 9]]) {
  const draw = robot(top, legLen), h = 23 + legLen - 5
  anim(name + "_walk_r", { w: 12, h, frames: 4, fps: 5, outline: "k" }, (c) => draw(c, PIP_WALK[c.frame]))
  sprite(name + "_idle_r", { w: 12, h, outline: "k" }, (c) => draw(c, [0, 0, 0, 0]))
  anim(name + "_talk_r", { w: 12, h, frames: 2, fps: 5, outline: "k" }, (c) => draw(c, [0, 0, 0, 0], c.frame === 1))
  sprite(name + "_portrait", { w: 18, h: 18 }, rect(0, 0, 18, 18, "S"), stamp(top, 3, 3))
}

// ---------------------------------------------------------------- inventory icons (about 20x14)
sprite("inv_key", { w: 20, h: 9, outline: "k" },
  circ(4, 4, 4, "y"), circ(4, 4, 1, "_"), rect(8, 3, 11, 3, "y"), rect(14, 6, 2, 2, "y"), rect(17, 6, 2, 2, "y"), hline(9, 3, 10, "c"))
sprite("inv_leaf", { w: 16, h: 12, outline: "k" },
  ellipse(8, 6, 7, 4, "g"), line(2, 9, 14, 3, "G"), line(0, 11, 3, 9, "G"))
sprite("inv_bulb", { w: 12, h: 16, outline: "k" },
  circ(6, 5, 5, "m"), rect(3, 9, 6, 3, "m"), rect(3, 12, 6, 3, "M"), hline(3, 13, 6, "n"), px(4, 3, "n"),
  px(7, 4, "M"), px(5, 7, "M"), px(8, 6, "M"))
sprite("inv_bulb_clean", { w: 12, h: 16, outline: "k" },
  circ(6, 5, 5, "c"), rect(3, 9, 6, 3, "c"), rect(4, 3, 4, 4, "y"), rect(3, 12, 6, 3, "M"), hline(3, 13, 6, "n"), px(3, 3, "n"))

// ---------------------------------------------------------------- the yard (320x180), outside the hall's door
pal({
  A: "#9ad8f8", a: "#c8ecfc",                           // sky, light sky near the horizon
  L: "#6ab86a", l: "#8ad07a", D: "#4a8a5a",             // hills, grass, far hill
  t: "#d8b880", T: "#b8945c",                           // path
  i: "#e8e0d0", I: "#b8ac98",                           // fence
  o: "#e0604a", O: "#a8402e",                           // mailbox red
  j: "#3a3a4a", J: "#5a5a6e",                           // lamp post iron
})
ramps("kTt", "kIi", "kOo", "kjJ", "kDLl")

scene("yard_bg", { w: 320, h: 180, bg: "A" },
  rect(0, 60, 320, 30, "a"),
  ellipse(250, 30, 16, 7, "c"), ellipse(262, 26, 12, 6, "c"), ellipse(70, 22, 12, 5, "c"),
  ellipse(80, 108, 120, 30, "D"), ellipse(250, 112, 110, 26, "L"),
  rect(0, 112, 320, 68, "l"),
  // the house wall on the left with the back door
  rect(0, 20, 54, 116, "W"), rect(0, 20, 54, 6, "V"), vline(54, 20, 116, "V"),
  rect(10, 62, 34, 70, "k"), rect(12, 64, 30, 68, "H"), rect(15, 68, 24, 26, "h"), rect(15, 98, 24, 30, "h"),
  rect(36, 98, 3, 3, "y"),
  // fence along the back
  (c) => { for (let x = 66; x < 320; x += 12) { c.rect(x, 96, 6, 26, "i"); c.px(x, 96, "_"); c.px(x + 5, 96, "_"); c.vline(x + 5, 97, 25, "I") } },
  rect(60, 102, 260, 3, "I"), rect(60, 114, 260, 3, "I"),
  // the path from the door
  poly([12, 134, 44, 134, 120, 180, 40, 180], "t"),
  (c) => { for (const [x, y] of [[30, 142], [52, 152], [66, 166], [44, 170]]) c.hline(x, y, 6, "T") },
  // grass tufts with a cause: along the fence foot and the path's edges
  (c) => { for (let x = 70; x < 320; x += 23) { c.px(x, 121, "D"); c.px(x + 1, 120, "D"); c.px(x + 2, 121, "D") } },
)

sprite("mailbox", { w: 14, h: 34, outline: "k" },
  rect(6, 12, 2, 22, "J"), rect(0, 2, 14, 11, "o"), rect(0, 10, 14, 3, "O"), rect(2, 0, 10, 2, "o"),
  rect(14, 4, 1, 1, "."), rect(11, 3, 2, 6, "y"))
sprite("mailbox_open", { base: "mailbox" }, rect(0, 2, 2, 9, "k"), rect(2, 4, 10, 7, "b"))
sprite("lamppost", { w: 12, h: 64, outline: "k" },
  rect(5, 12, 2, 50, "j"), rect(3, 60, 6, 4, "j"), rect(1, 2, 10, 9, "J"), rect(3, 4, 6, 5, "b"), rect(4, 0, 4, 2, "j"))
sprite("lamppost_lit", { base: "lamppost" }, rect(4, 5, 6, 5, "y"), rect(5, 6, 2, 2, "c"))
sprite("hall_door_open", { w: 40, h: 87 }, rect(0, 0, 40, 87, "A"), rect(0, 50, 40, 37, "l"), rect(0, 44, 40, 6, "L"),
  rect(30, 0, 10, 87, "H"), rect(30, 0, 2, 87, "h"))
