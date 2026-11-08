// tools/new-game.mjs: a new game in an empty folder, with the engine copied in, that passes its checks at once:
// validate (no errors, no warnings), solve --full (finished, no soft-locks, a hint in every state), play (clicked
// through in headless Chrome); a folder that isn't empty is refused.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export default async function (t) {
  const base = mkdtempSync(join(tmpdir(), "cutaway-newgame-")), dir = join(base, "game");
  const run = (/** @type {string} */ cmd, /** @type {string[]} */ a, /** @type {string} */ cwd) => {
    try { return { code: 0, out: execFileSync(cmd, a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
    catch (e) { return { code: /** @type {any} */ (e).status ?? 1, out: String(/** @type {any} */ (e).stdout ?? "") + String(/** @type {any} */ (e).stderr ?? "") }; }
  };
  const made = run("node", [resolve("tools/new-game.mjs"), dir, "--title", "Small Test"], resolve("."));
  t.ok("new-game: made", made.code === 0 && ["index.html", "game/game.js", "assets/art.js", "studio.json", "lib/cutaway/core.js", "lib/cutaway/tools/studio.mjs", "lib/cutaway/VERSION.txt", "tools/sync-engine.sh"].every((f) => existsSync(join(dir, f))), made.out);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  t.ok("new-game: the page loads the engine in its order, then the art, the game, the editor's layer",
    /lib\/cutaway\/core\.js[\s\S]*lib\/cutaway\/engine\.js[\s\S]*assets\/art\.js[\s\S]*game\/game\.js[\s\S]*game\/edits\.js/.test(html));
  const v = run("node", ["lib/cutaway/tools/validate.mjs", "index.html"], dir);
  t.ok("new-game: validate, 0 errors and 0 warnings", v.code === 0 && /0 errors, 0 warnings/.test(v.out), v.out.slice(-300));
  const s = run("node", ["lib/cutaway/tools/solve.mjs", "index.html", "--full"], dir);
  t.ok("new-game: solve --full: no soft-locks, every state has a hint", s.code === 0 && /no soft-locks/.test(s.out) && /every state on the way has one/.test(s.out), s.out.slice(-300));
  const p = run("node", ["lib/cutaway/tools/play.mjs", "index.html"], dir);
  t.ok("new-game: played through with real clicks", p.code === 0 && /all passed/.test(p.out), p.out.slice(-400));
  writeFileSync(join(base, "other.txt"), "x");
  const again = run("node", [resolve("tools/new-game.mjs"), base], resolve("."));
  t.ok("new-game: a folder that isn't empty is refused", again.code !== 0 && /not empty/.test(again.out), again.out);
}
