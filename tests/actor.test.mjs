// Unit tests for src/actor.js: running covers more ground than walking, and walking up or down the
// screen shows the back or front view only when the costume has them.
import { load } from "./load.mjs";

export default async function (t) {
  const C = load(["i18n.js", "state.js", "walk.js", "assets.js", "room.js", "actor.js"]);
  const side = { idle: "a_idle_r", walk: "a_walk_r" };
  const views = { idle: { right: "a_idle_r", up: "a_idle_u", down: "a_idle_d" }, walk: { right: "a_walk_r", up: "a_walk_u", down: "a_walk_d" } };
  const step = (a, ms) => { for (let i = 0; i < ms / 20; i++) a.update(20); };

  const walker = C.actor("w", { costume: side, speed: [20, 10] }), runner = C.actor("r", { costume: side, speed: [20, 10] });
  walker.walkTo(200, 0); runner.walkTo(200, 0, true);
  step(walker, 1000); step(runner, 1000);
  t.ok("running covers twice the ground", Math.abs(walker.x - 20) < 0.5 && Math.abs(runner.x - 40) < 0.5, `${walker.x} / ${runner.x}`);
  t.ok("a running stride is quicker", runner.t > walker.t);
  step(runner, 5000);
  t.ok("arriving ends the run", runner.x === 200 && !runner.running && runner.state === "idle");

  const plain = C.actor("p", { costume: side, at: [0, 0] }), turner = C.actor("v", { costume: views, at: [0, 0] });
  plain.walkTo(2, 40); turner.walkTo(2, 40); step(plain, 100); step(turner, 100);
  t.ok("down the screen: the front view, if there is one", turner.facing === "down" && turner.look().anim === "a_walk_d" && plain.facing === "right");
  turner.walkTo(-1, -40); step(turner, 100);
  t.ok("up the screen: the back view", turner.facing === "up" && turner.look().anim === "a_walk_u");
  turner.walkTo(-60, -42); step(turner, 100);
  t.ok("sideways again: the side view, mirrored", turner.facing === "left" && turner.look().anim === "a_walk_r" && turner.look().flip);

  // a pose that holds walks the pose's way: an isometric figure seen from above in one room turns up and down there, and goes
  // at the pose's speed; elsewhere the costume's diagonals and speed again
  const iso = { idle: { se: "i_idle_se", ne: "i_idle_ne" }, walk: { se: "i_walk_se", ne: "i_walk_ne" } };
  const top = C.actor("t", { costume: iso, speed: [20, 10], at: [0, 0], facing: "se",
    poses: [{ if: "above", idle: { down: "t_idle_d", up: "t_idle_u", right: "t_idle_r", left: "t_idle_l" },
      walk: { down: "t_walk_d", up: "t_walk_u", right: "t_walk_r", left: "t_walk_l" }, speed: [40, 40] }] });
  top.walkTo(2, 200); step(top, 100);
  t.ok("without the pose: the costume's diagonal", top.facing === "se" && top.look().anim === "i_walk_se");
  C.state.set("above");
  top.walkTo(top.x + 1, top.y + 200); step(top, 100);
  t.ok("with the pose: its view down the screen", top.facing === "down" && top.look().anim === "t_walk_d", top.facing);
  top.walkTo(top.x - 100, top.y + 2); step(top, 100);
  t.ok("with the pose: its own left, not a mirror", top.facing === "left" && top.look().anim === "t_walk_l" && !top.look().flip);
  const y0 = top.y; top.walkTo(top.x, top.y + 200); step(top, 1000);
  t.ok("with the pose: its speed", Math.abs(top.y - y0 - 40) < 0.5, String(top.y - y0));
  C.state.set("above", false);
  const y1 = top.y; top.walkTo(top.x, top.y + 200); step(top, 1000);
  t.ok("the pose gone: the actor's speed again", Math.abs(top.y - y1 - 10) < 0.5, String(top.y - y1));

  // release builds scramble embedded images; the engine gets the original bytes back
  C.assets.setKey("k3y!");
  const raw = "PNG and more bytes", scrambled = "~" + btoa([...raw].map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ "k3y!".charCodeAt(i % 4))).join(""));
  t.ok("scrambled data comes back as it was", atob(C.assets.unscramble(scrambled)) === raw);
  const text = "Grüß Gott, Kapitän!", utf8 = new TextEncoder().encode(text);
  const hidden = "" + btoa(String.fromCharCode(...utf8.map((b, i) => b ^ "k3y!".charCodeAt(i % 4))));
  t.ok("a scrambled text is revealed when shown", C.i18n.t(hidden) === text && C.i18n.t("plain") === "plain");
}
