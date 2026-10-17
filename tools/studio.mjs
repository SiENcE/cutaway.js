// The Cutaway studio: a small local server for working on a game with the editor. It serves the game's
// folder over http (on 127.0.0.1 only) and lets the in-game editor (F10, or ?edit) read and write the
// game's files and run its tasks (build the art, validate, solve). Development only: never shipped.
//   node tools/studio.mjs [index.html] [--port 7400] [--root dir] [--no-open]
// --root serves a folder above the page (the engine's demo loads ../src/: --root .).
// It opens <page>?edit&studio=<token> in the browser. Every API request must carry that token (a page
// from anywhere else can't use the server), and files are written only inside the folders the game
// lists. The game describes itself in studio.json next to its page (all optional):
//   { "write": ["game", "art", "assets"],              folders the editor may write into
//     "layers": { "room": "game/rooms/{id}.geo.js", "texts": "game/strings/{lang}.texts.js",
//                 "edits": "game/edits.js", "sounds": "game/sounds.edit.js",
//                 "art": "art/import", "artAtlas": "assets/imported.js", "audio": "assets/audio.js" },
//     "tasks": { "validate": ["node", "lib/cutaway/tools/validate.mjs", "index.html"], ... },
//     "palette": ["art/palette.px.js"] }               files whose "#rrggbb" colours are the paint view's game palette
// The editor's Art tab runs the task "art: imported" (when there is one) after it writes into the
// "art" layer: it should pack that folder into "artAtlas" (tools/build-atlas.mjs art/import assets/imported.js).
// API (under /__studio/, header x-studio-token):
//   GET config                 studio.json, filled in with the defaults
//   GET read?path=p            a file's bytes
//   PUT write?path=p           write the request's body (folders are made as needed)
//   DELETE remove?path=p       remove a file (only where write may write: a reverted import)
//   GET list?dir=d             [{ name, dir, size }]
//   POST run?task=t            run a task: { code, output }
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
  write: ["game", "art", "assets"],
  layers: { room: "game/rooms/{id}.geo.js", texts: "game/strings/{lang}.texts.js", edits: "game/edits.js", sounds: "game/sounds.edit.js",
    art: "art/import", artAtlas: "assets/imported.js", audio: "assets/audio.js" },
  tasks: {},
  palette: [],
};
/**
 * A studio for the game whose page this is. `start(port)` (0: any free port) resolves to the address
 * and the token.
 * @param {string} pagePath
 */
export function studio(pagePath, { quiet = false, root = "" } = {}) {
  const PAGE = resolve(pagePath), ROOT = root ? resolve(root) : dirname(PAGE);
  if (!existsSync(PAGE)) throw new Error(`no page ${PAGE}`);
  const log = (/** @type {string} */ m) => { if (!quiet) console.log(m); };
  /** The game's studio.json over the defaults (read again on every request: edits apply at once). */
  function config() {
    let c = {};
    try { c = JSON.parse(readFileSync(join(ROOT, "studio.json"), "utf8")); } catch { /* none: the defaults */ }
    return { ...DEFAULTS, ...c, layers: { ...DEFAULTS.layers, ...(c.layers ?? {}) }, tasks: { ...DEFAULTS.tasks, ...(c.tasks ?? {}) },
      page: relative(ROOT, PAGE).split(sep).join("/") };
  }

  /** A path inside the game's folder, or null. @param {string | null} p */
  function inside(p) {
    if (!p || isAbsolute(p) || p.includes("\0")) return null;
    const full = resolve(ROOT, p), rel = relative(ROOT, full);
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? full : null;
  }
  /** May the editor write there? Only inside the listed folders, only these kinds of files. @param {string} full */
  function writable(full) {
    const rel = relative(ROOT, full).split(sep).join("/");
    return config().write.some((d) => rel.startsWith(d.replace(/\/$/, "") + "/")) && /\.(js|json|png|wav|ogg|mp3|csv|txt|md)$/i.test(rel);
  }

  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png",
    ".gif": "image/gif", ".wav": "audio/wav", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".css": "text/css", ".txt": "text/plain", ".csv": "text/csv" };
  const TOKEN = randomBytes(12).toString("hex");

  /** @param {import("node:http").IncomingMessage} req */
  function body(req) {
    return new Promise((ok, fail) => { const parts = []; req.on("data", (d) => parts.push(d)); req.on("end", () => ok(Buffer.concat(parts))); req.on("error", fail); });
  }

  /** Run one of the game's tasks (an argv list), at most 10 minutes. @param {string[]} argv */
  function runTask(argv) {
    return new Promise((done) => {
      const p = spawn(argv[0], argv.slice(1), { cwd: ROOT, shell: process.platform === "win32" && !/\.(exe|com)$/i.test(argv[0]) && argv[0] !== "node" });
      let out = "";
      const add = (d) => { out += d; if (out.length > 400000) out = out.slice(-300000); };
      p.stdout.on("data", add); p.stderr.on("data", add);
      const timer = setTimeout(() => p.kill(), 600000);
      p.on("close", (code) => { clearTimeout(timer); done({ code, output: out }); });
      p.on("error", (e) => { clearTimeout(timer); done({ code: -1, output: String(e) }); });
    });
  }

  async function api(req, res, url) {
    if (req.headers["x-studio-token"] !== TOKEN) return send(res, 403, { error: "no studio token" });
    const what = url.pathname.slice("/__studio/".length), q = url.searchParams;
    if (what === "config" && req.method === "GET") return send(res, 200, config());
    if (what === "read" && req.method === "GET") {
      const f = inside(q.get("path"));
      if (!f || !existsSync(f) || !statSync(f).isFile()) return send(res, 404, { error: "no such file" });
      res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream", "cache-control": "no-store" }).end(readFileSync(f));
      return;
    }
    if (what === "write" && req.method === "PUT") {
      const f = inside(q.get("path"));
      if (!f || !writable(f)) return send(res, 403, { error: `not writable: ${q.get("path")} (studio.json "write" lists ${config().write.join(", ")})` });
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, await body(req));
      log(`wrote ${relative(ROOT, f)}`);
      return send(res, 200, { ok: true });
    }
    if (what === "remove" && req.method === "DELETE") {
      const f = inside(q.get("path"));
      if (!f || !writable(f)) return send(res, 403, { error: `not writable: ${q.get("path")} (studio.json "write" lists ${config().write.join(", ")})` });
      if (!existsSync(f) || !statSync(f).isFile()) return send(res, 404, { error: "no such file" });
      unlinkSync(f);
      log(`removed ${relative(ROOT, f)}`);
      return send(res, 200, { ok: true });
    }
    if (what === "list" && req.method === "GET") {
      const d = inside(q.get("dir") || ".") ?? (q.get("dir") === "." ? ROOT : null);
      if (!d || !existsSync(d)) return send(res, 200, []);
      return send(res, 200, readdirSync(d, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory(), size: e.isFile() ? statSync(join(d, e.name)).size : 0 })));
    }
    if (what === "run" && req.method === "POST") {
      const t = config().tasks[q.get("task") ?? ""];
      if (!Array.isArray(t) || !t.length) return send(res, 404, { error: `no task "${q.get("task")}" in studio.json` });
      log(`task ${q.get("task")}: ${t.join(" ")}`);
      return send(res, 200, await runTask(t.map(String)));
    }
    send(res, 404, { error: "unknown request" });
  }

  /** @param {import("node:http").ServerResponse} res @param {number} code @param {any} data */
  function send(res, code, data) { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(data)); }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname.startsWith("/__studio/")) return await api(req, res, url);
      if (req.method !== "GET") return send(res, 405, { error: "read only" });
      const f = inside(decodeURIComponent(url.pathname).replace(/^\/+/, "") || config().page);
      if (!f || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404).end("not found"); return; }
      res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream", "cache-control": "no-store" }).end(readFileSync(f));
    } catch (e) {
      send(res, 500, { error: String(e) });
    }
  });

  /** Start the server. @param {number} port @returns {Promise<{url: string, token: string, close: () => void}>} */
  function start(port) {
    return new Promise((ok) => server.listen(port, "127.0.0.1", () => {
      const a = /** @type {any} */ (server.address());
      ok({ url: `http://127.0.0.1:${a.port}/`, token: TOKEN, close: () => server.close() });
    }));
  }
  return { start, config, root: ROOT };
}

// the command line
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const page = args.find((a, i) => !a.startsWith("--") && !["--port", "--root"].includes(args[i - 1])) ?? "index.html";
  const st = studio(page, { root: opt("--root", "") }), s = await st.start(Number(opt("--port", "7400")));
  const open = `${s.url}${st.config().page}?edit&studio=${s.token}`;
  console.log(`Cutaway studio for ${st.root}
  ${open}
  (Ctrl+C stops it)`);
  if (!args.includes("--no-open")) {
    const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", open]] : process.platform === "darwin" ? ["open", [open]] : ["xdg-open", [open]];
    spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref();
  }
}
