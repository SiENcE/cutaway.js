// E5 presentation: the light model (matches pxl's baked light), lamp flicker and switching, effects
// that are pure functions of time, depth scaling in whole pixels, and the validator's new checks.
import { load } from "./load.mjs";
import { loadGame, boot } from "../tools/lib/game.mjs";
import { validate } from "../tools/lib/validate.mjs";

/** A canvas context that records what is drawn. */
function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(`${String(k)}(${a.map((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : typeof v)).join(",")})`); return { addColorStop() {} }; }),
    set: (t, k, v) => { t[k] = v; if (k === "fillStyle") calls.push("fill=" + v); return true; },
  });
  return { ctx, calls };
}

export default async function (t) {
  const C = load(["assets.js", "i18n.js", "state.js", "walk.js", "room.js", "light.js", "fx.js"]);
  C.display = { width: 320, height: 180 };
  C.room("lit", {
    light: { ambient: 0.8, color: "#ffffff", lamps: [
      { id: "bulb", at: [100, 50], r: 100, power: 1.2, color: "#ffffff" },
      { id: "torch", at: [250, 140], r: 30, power: 1, color: "#ff0000", flicker: 0.2, add: true, if: "torch_on" },
    ] },
    fx: [{ kind: "dust", rect: [0, 0, 100, 100], count: 20 }, { kind: "rain", rect: [0, 0, 320, 180], count: 30 },
      { kind: "sparkle", points: [[10, 10], [20, 20]] }, { kind: "drip", at: [50, 20], to: 60 }, { kind: "steam", at: [80, 80] }],
    scale: { far: [100, 0.8], near: [180, 1] },
  });
  C.scene.load("lit");
  const near = (a, b) => Math.abs(a - b) < 1e-6;

  // pxl's model: v = power - d / r, eased below 1; lamps and ambient combine by the max per channel
  const atBulb = C.light.sample(100, 50, { base: true });
  t.ok("light: at the source the power overexposes", near(atBulb[0], 1.2), String(atBulb));
  const mid = C.light.sample(150, 50, { base: true }), f = 1.2 - 0.5, v = 1 - (1 - f) ** 2;
  t.ok("light: half way the eased falloff", near(mid[0], Math.max(0.8, v)), `${mid[0]} vs ${v}`);
  const far = C.light.sample(300, 170, { base: true });
  t.ok("light: away from lamps only the ambient", near(far[0], 0.8) && near(far[2], 0.8), String(far));
  t.ok("light: a switched-off lamp gives nothing", near(C.light.sample(250, 140)[0], 0.8));
  C.state.set("torch_on");
  const torch = C.light.sample(250, 140, { t: 0 });
  t.ok("light: switched on, the added lamp lights (red only)", torch[0] > 0.8 && near(torch[1], 0.8), String(torch));
  t.ok("light: base light ignores added lamps", near(C.light.sample(250, 140, { base: true })[0], 0.8));
  const lamp = C.room.get("lit").light.lamps[1];
  const fl = [0, 100, 200, 300, 400, 500, 600, 700].map((ms) => C.light.flicker(lamp, 1, ms));
  t.ok("light: flicker stays within its range", fl.every((x) => x >= 0.8 - 1e-9 && x <= 1.2 + 1e-9), fl.join());
  t.ok("light: flicker steps on the 100 ms grid", C.light.flicker(lamp, 1, 100) === C.light.flicker(lamp, 1, 199) && new Set(fl).size > 3);
  t.ok("light: flicker repeats exactly", C.light.flicker(lamp, 1, 12345) === C.light.flicker(lamp, 1, 12345));

  t.ok("colours: #rgb and #rrggbb", JSON.stringify(C.light.rgb("#000")) === "[0,0,0]" && JSON.stringify(C.light.rgb("#ff0000")) === "[1,0,0]");
  let bad = false; try { C.light.rgb("black"); } catch { bad = true; }
  t.ok("colours: a name is an error, not white", bad);

  // effects are functions of time: the same moment draws the same pixels
  const draw = (ms) => {
    const r = recorder();
    for (const fx of C.room.get("lit").fx) C.fx.kinds[fx.kind](r.ctx, fx, ms, 1, 17);
    return r.calls.join(";");
  };
  t.ok("fx: the same time draws the same", draw(5000) === draw(5000));
  t.ok("fx: time moves the particles", draw(5000) !== draw(5300));
  const dustOnly = (ms) => { const r = recorder(); C.fx.kinds.dust(r.ctx, { kind: "dust", rect: [10, 10, 40, 40], count: 30 }, ms, 1, 3); return r.calls; };
  const inside = dustOnly(777).filter((c) => c.startsWith("fillRect")).every((c) => {
    const [x, y] = c.slice(9, -1).split(",").map(Number);
    return x >= 10 && x <= 50 && y >= 10 && y <= 50;
  });
  t.ok("fx: dust stays inside its area", inside);

  // depth scale and whole-pixel sizes
  t.ok("scale: far, near and between", near(C.scene.scaleAt(100), 0.8) && near(C.scene.scaleAt(180), 1) && near(C.scene.scaleAt(140), 0.9) && near(C.scene.scaleAt(20), 0.8));
  const s = C.assets.scaled({ w: 16, h: 36 }, 0.8);
  t.ok("scale: whole pixels, height first", s.h === 29 && s.w === 13 && s.ay === 29 && s.ax === 6, JSON.stringify(s));
  t.ok("scale: 1 keeps the frame", JSON.stringify(C.assets.scaled({ w: 16, h: 36 }, 1)) === JSON.stringify({ w: 16, h: 36, ax: 8, ay: 36 }));

  // scrolling props: copies one image width apart cover the room, move with the scene time, whole pixels
  C.assets.anim("hills", { image: "hills", frames: [[0, 0, 100, 20]], anchor: [0, 0] });
  const hills = { id: "hills", image: "hills", at: [0, 40], anchor: [0, 0], scroll: -30 };
  const xs0 = C.scene.scrollXs(hills, "hills", 320);
  t.ok("scroll: at time 0 the copies start at the left edge", JSON.stringify(xs0) === "[0,100,200,300]", JSON.stringify(xs0));
  C.actors ??= { all: () => [], get: () => null };
  C.scene.update(1000);
  const xs1 = C.scene.scrollXs(hills, "hills", 320);
  t.ok("scroll: a second later they moved 30 px left", JSON.stringify(xs1) === "[-30,70,170,270]", JSON.stringify(xs1));
  t.ok("scroll: whole pixels, covering 0..320", xs1.every((x) => Number.isInteger(x)) && xs1[0] <= 0 && xs1.at(-1) + 100 >= 320, JSON.stringify(xs1));

  // the validator knows light, effects, sounds and scale
  const errorsOf = async (patch) => {
    const g = loadGame("demo/index.html");
    patch(g.C);
    await boot(g, { instant: true });
    return validate(g.C, { languages: g.options.languages }).issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.msg}`);
  };
  const broken = [
    ["unknown effect", (C) => { C.room.get("hall").fx.push({ kind: "snow", rect: [0, 0, 10, 10] }); }, /unknown effect "snow"/],
    ["effect lamp", (C) => { C.room.get("yard").fx[0].lamp = "lamq"; }, /unknown lamp "lamq"/],
    ["lamp without reach", (C) => { C.room.get("yard").light.lamps[0].r = 0; }, /reach r > 0/],
    ["bad colour", (C) => { C.room.get("hall").light.lamps[0].color = "yellow"; }, /not #rrggbb/],
    ["unknown sound", (C) => { C.room.get("hall").hotspots.window.use = [{ sfx: "boing" }]; }, /unknown sound "boing"/],
    ["ambience is no loop", (C) => { C.room.get("yard").ambience = ["thump"]; }, /not a sound loop/],
    ["bad scale", (C) => { C.room.get("yard").scale = { far: [120], near: [170, 1] }; }, /scale is/],
  ];
  for (const [name, patch, re] of broken) {
    const errs = await errorsOf(patch);
    t.ok(`validate fails: ${name}`, errs.some((e) => re.test(e)), errs.join(" | ") || "no errors");
  }
}
