// Extras (src/extras.js): people who only make a room lively. They walk their paths and stand about; they make
// way for the one played and for each other, never walk into anybody and never hold the one played up; they
// are not actors and not saved.
import { loadGame, boot } from "../tools/lib/game.mjs";

export default async function (t) {
  const g = loadGame("demo/index.html");
  const realWalk = g.C.actor.Actor.prototype.walkTo;
  await boot(g, { instant: true });
  g.C.actor.Actor.prototype.walkTo = realWalk;        // the one played really walks here, on the clock
  const C = g.C;
  const pip = C.actors.get("pip");
  const bolt = C.actors.get("bolt");
  const costume = { idle: "bolt_idle_r", walk: "bolt_walk_r" };
  const step = 1000 / 60;

  /** A bare room with a walk area and these extras; Pip in it (Bolt away), played. */
  async function room(extras, walk = [[0, 100, 320, 100, 320, 180, 0, 180]], pipAt = [-100, -100]) {
    C.room("lane", { name: "Lane", walk: walk, extras });
    bolt.place("hall", 230, 150);
    await C.scene.load("lane");
    C.scene.setActive("pip");
    pip.place("lane", pipAt[0], pipAt[1], "right");
    C.extras.reset();
    C.extras.here();
  }
  /** How close two feet came, against their room (under 1: in each other). */
  const near = (p, q, sp = [7, 4], sq = [7, 4]) => Math.hypot((p.x - q.x) / (sp[0] + sq[0]), (p.y - q.y) / (sp[1] + sq[1]));
  /** Run the clock for ms; the closest anybody came to anybody else, and a callback each step. */
  function run(ms, each = () => {}) {
    let closest = Infinity;
    for (let s = 0; s < ms / step; s++) {
      C.clock.advance(step);
      const people = C.extras.here().concat(pip.room === "lane" && pip.x > 0 ? [pip] : []);
      for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) closest = Math.min(closest, near(people[i], people[j]));
      each();
    }
    return closest;
  }

  // ---- along a path and back
  await room([{ costume, at: [40, 140], path: [[280, 140]], loop: "back" }]);
  let far = 0, back = 999, turned = false;
  run(30000, () => { const e = C.extras.here()[0]; far = Math.max(far, e.x); if (far > 279) { back = Math.min(back, e.x); turned ||= e.facing === "left"; } });
  t.ok("a walking extra goes its path to the end and the same way back", far > 279 && back < 50 && turned, `far ${far}, back ${back}`);

  // ---- Pip stands on its path: it steps aside, gets by, never walks into her; she isn't moved
  await room([{ costume, at: [40, 140], path: [[280, 140]], loop: "back" }], undefined, [160, 140]);
  let past = false;
  const c1 = run(16000, () => { past ||= C.extras.here()[0].x > 200; });
  t.ok("someone standing on its path: it steps aside and gets by", past);
  t.ok("... never walking into her", c1 >= 0.95, `closest ${c1.toFixed(2)}`);
  t.ok("... and she isn't moved", pip.x === 160 && pip.y === 140);

  // ---- Pip is never held up: her walk through a walker coming the other way takes as long as without it
  const walkTime = async (extras) => {
    await room(extras, undefined, [40, 140]);
    let n = 0, done = false;
    pip.walkTo(280, 140).then(() => { done = true; });
    const c = run(30000, () => { if (!done) n++; });
    return { n, c };
  };
  const alone = await walkTime([]), met = await walkTime([{ costume, at: [280, 140], facing: "left", path: [[40, 140]], loop: "back" }]);
  t.ok("the one played is never held up by an extra", met.n === alone.n, `${met.n} steps, alone ${alone.n}`);
  t.ok("... the extra makes way for her", met.c >= 0.95, `closest ${met.c.toFixed(2)}`);

  // ---- two coming towards each other pass, each to its right
  await room([{ costume, at: [40, 140], path: [[280, 140]], loop: "back" }, { costume, at: [280, 140], facing: "left", path: [[40, 140]], loop: "back" }]);
  let a0 = 0, b0 = 999;
  const c2 = run(14000, () => { const [a, b] = C.extras.here(); a0 = Math.max(a0, a.x); b0 = Math.min(b0, b.x); });
  t.ok("two extras coming towards each other pass", a0 > 200 && b0 < 120, `a ${a0}, b ${b0}`);
  t.ok("... without walking into each other", c2 >= 0.95, `closest ${c2.toFixed(2)}`);

  // ---- no room to step aside: it waits, and then goes back the way it came
  await room([{ costume, at: [40, 140], path: [[280, 140]], loop: "back" }], [[0, 136, 320, 136, 320, 144, 0, 144]], [160, 140]);
  let maxX = 0, after = 0;
  const c3 = run(20000, () => { const e = C.extras.here()[0]; maxX = Math.max(maxX, e.x); after = e.x; });
  t.ok("no room to pass: it waits and turns back, never into her", c3 >= 0.95 && maxX < 160 && after < maxX - 20, `closest ${c3.toFixed(2)}, max ${maxX}, now ${after}`);

  // ---- standing: it idles in its own time, turns now and then, looks at Pip near, leans away as she passes
  await room([{ costume, at: [100, 150], facing: "right" }, { costume, at: [200, 150], facing: "right" }]);
  const ways = new Set();
  run(30000, () => ways.add(C.extras.here()[0].facing));
  t.ok("a standing extra turns now and then", ways.has("left") && ways.has("right"));
  const [s0, s1] = C.extras.here();
  t.ok("... each idles in its own time", s0.t !== s1.t);
  t.ok("... and stays where it stands", s0.x === 100 && s0.y === 150);
  pip.place("lane", 80, 152, "right");
  run(500);
  t.ok("the one played comes close: it looks at her", s0.facing === "left");
  pip.place("lane", 94, 150, "right");
  run(600);
  t.ok("... closer still: it leans away, a few pixels", s0.x > 100 && s0.x <= 103, `x ${s0.x}`);
  pip.place("lane", 20, 120, "right");
  run(1000);
  t.ok("... she goes: it stands where it stood again", Math.abs(s0.x - 100) < 0.01);

  // ---- the scene's, not the game's
  t.ok("extras are not actors", !C.actors.all().some((a) => a.id.startsWith("extra:")));
  t.ok("... and not saved", !JSON.stringify(C.save.capture()).includes("extra:"));

  // ---- only while a condition holds; blocking ones in the walk map
  await room([{ costume, at: [100, 150], if: "crowded" }, { costume, at: [200, 150], block: true }]);
  t.ok("an extra with if: not there while it doesn't hold", C.extras.here().length === 1);
  C.state.set("crowded", true);
  t.ok("... there once it holds", C.extras.here().length === 2);
  C.state.set("crowded", false);
  t.ok("a blocking extra is cut out of the walk map", !C.scene.walkMap.inside({ x: 200, y: 150 }) && C.scene.walkMap.inside({ x: 100, y: 150 }));
  const way = C.scene.walkMap.path({ x: 180, y: 150 }, { x: 220, y: 150 });
  t.ok("... the one played walks round it", way.length > 1 && way.some((p) => Math.abs(p.y - 150) > 3));

  // ---- a crowd costs little
  // (a market of 2x2 screens: 120 people, a third of them walking)
  const crowd = [];
  for (let i = 0; i < 120; i++) {
    const x = 10 + (i * 151) % 620, y = 10 + (i * 67) % 340;
    crowd.push(i % 3 ? { costume, at: [x, y] } : { costume, at: [x, y], path: [[(x + 300) % 620 + 10, y]], loop: "back" });
  }
  await room(crowd, [[0, 0, 640, 0, 640, 360, 0, 360]]);
  const t0 = performance.now();
  for (let s = 0; s < 600; s++) C.clock.advance(step);
  const ms = performance.now() - t0;
  t.ok("120 extras over 2x2 screens (40 walking): 10 s of play in under 0.4 s (in the vm; a browser is quicker)", ms < 400, `${ms.toFixed(0)} ms`);
}
