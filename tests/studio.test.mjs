// The studio server (tools/studio.mjs) on a throwaway game folder: it serves the page, wants its token,
// reads and writes only inside the folders the game allows, lists folders and runs the game's tasks.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { studio } from "../tools/studio.mjs";

export default async function (t) {
  const dir = mkdtempSync(join(tmpdir(), "cutaway-studio-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>game</title>");
  mkdirSync(join(dir, "game"));
  writeFileSync(join(dir, "game", "a.js"), "// a");
  writeFileSync(join(dir, "studio.json"), JSON.stringify({ write: ["game"], tasks: { hello: ["node", "-e", "console.log(6 * 7)"] } }));
  const s = await studio(join(dir, "index.html"), { quiet: true }).start(0);
  const call = (path, o = {}) => fetch(s.url + "__studio/" + path, { ...o, headers: { "x-studio-token": s.token, ...(o.headers ?? {}) } });
  try {
    t.ok("studio: serves the game", (await (await fetch(s.url)).text()).includes("<title>game"));
    t.ok("studio: no token, no access", (await fetch(s.url + "__studio/config")).status === 403);
    const cfg = await (await call("config")).json();
    t.ok("studio: config with the defaults", cfg.page === "index.html" && cfg.layers.room === "game/rooms/{id}.geo.js" && cfg.write[0] === "game");
    t.ok("studio: writes inside an allowed folder", (await call("write?path=game/rooms/b.geo.js", { method: "PUT", body: "// b" })).ok && readFileSync(join(dir, "game", "rooms", "b.geo.js"), "utf8") === "// b");
    const refused = await Promise.all(["../evil.js", "index.html", "art/x.js", "game/x.exe", "/etc/passwd"].map(async (p) => (await call("write?path=" + encodeURIComponent(p), { method: "PUT", body: "x" })).status));
    t.ok("studio: refuses to write elsewhere", refused.every((c) => c === 403) && !existsSync(join(dir, "..", "evil.js")), refused.join(" "));
    t.ok("studio: reads", (await (await call("read?path=game/a.js")).text()) === "// a" && (await call("read?path=../x")).status === 404);
    const list = await (await call("list?dir=game")).json();
    t.ok("studio: lists a folder", list.some((e) => e.name === "rooms" && e.dir) && list.some((e) => e.name === "a.js"));
    const r = await (await call("run?task=hello", { method: "POST" })).json();
    t.ok("studio: runs a task", r.code === 0 && r.output.trim() === "42", JSON.stringify(r));
    t.ok("studio: unknown tasks are refused", (await call("run?task=rm", { method: "POST" })).status === 404);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
