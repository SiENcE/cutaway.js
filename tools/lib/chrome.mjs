// Headless Chrome over the DevTools protocol, for screenshots and playthroughs. No dependencies:
// Node 22's fetch and WebSocket talk to Chrome directly.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROMES = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Start Chrome with one page. Returns helpers; call close() at the end.
 * touch: emulate a phone (touch screen, mobile viewport); then tap() and hold() send finger events.
 * @param {{width?: number, height?: number, dpr?: number, touch?: boolean}} [o]
 */
export async function launch(o = {}) {
  const exe = CHROMES.find((p) => existsSync(p));
  if (!exe) throw new Error("no Chrome found; set CHROME=<path>");
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), "cutaway-chrome-"));
  const proc = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--mute-audio", "--hide-scrollbars", "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
    } catch { /* not up yet */ }
    if (!wsUrl) await sleep(100);
  }
  if (!wsUrl) { proc.kill(); throw new Error("Chrome did not start"); }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const pending = new Map(), errors = [];
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      errors.push("page error: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push("console.error: " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: o.width ?? 960, height: o.height ?? 540, deviceScaleFactor: o.dpr ?? 1, mobile: !!o.touch });
  if (o.touch) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  /** Evaluate an expression in the page (awaited) and return its value. @param {string} expr */
  async function ev(expr) {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(expr.slice(0, 120) + " -> " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }

  return {
    send, ev, errors,
    /** @param {string} url */
    async open(url) {
      await send("Page.navigate", { url });
      for (let i = 0; i < 200 && !(await ev("document.readyState === 'complete' && !!window.Cutaway")); i++) await sleep(50);
    },
    /** Mouse event at a logical pixel of the Cutaway screen. @param {"move" | "click" | "rclick"} kind */
    async mouse(kind, x, y) {
      const c = await ev(`Cutaway.display.toClient(${x}, ${y})`);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
      if (kind === "move") return;
      const button = kind === "rclick" ? "right" : "left", buttons = kind === "rclick" ? 2 : 1;
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button, buttons, clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button, buttons: 0, clickCount: 1 });
    },
    /** A finger on a logical pixel: a quick tap, or held for `ms` (a long press looks). */
    async tap(x, y, ms = 40) {
      const c = await ev(`Cutaway.display.toClient(${x}, ${y})`), pt = [{ x: c.x, y: c.y, id: 1 }];
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
      await sleep(ms);
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    async hold(x, y) { return this.tap(x, y, 650); },
    /** A key pressed and let go: "Escape", "Space", "Enter", "KeyH", ... (KeyboardEvent.code). */
    async key(code) {
      const named = { Escape: ["Escape", 27], Space: [" ", 32], Enter: ["Enter", 13], Tab: ["Tab", 9] }[code];
      const key = named ? named[0] : code.replace(/^Key|^Digit/, "").toLowerCase(), vk = named ? named[1] : key.toUpperCase().charCodeAt(0);
      for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, code, key, windowsVirtualKeyCode: vk, ...(type === "keyDown" && key.length === 1 ? { text: key } : {}) });
    },
    async screenshot() { return Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"); },
    async close() {
      try { ws.close(); } catch { /* ignore */ }
      proc.kill();
      await sleep(300);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
    },
  };
}
