// The paint view (src/editor-paint.js): its painting functions in Node (fill, replace, line, rect,
// mirror, flips, crop and paste, resize at the bottom centre, palettes), then in headless Chrome on the
// demo: the editor's layout (the picture fits into the centre, the menus), a sprite opened in the paint
// view, painted with the mouse, undone and redone, filled, applied: the game's asset has the new pixels;
// a room background opens too; closing the editor gives the display its whole window back.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "../tools/lib/chrome.mjs";
import { load } from "./load.mjs";

export default async function (t) {
  const P = load(["editor-paint.js"]).paint;
  const RED = P.parse("#ff0000"), BLUE = P.parse("#0000ff");
  t.ok("paint: colours in and out", P.hex(RED) === "#ff0000" && P.parse("") === 0 && P.hex(0) === "" && P.solid(0xff000080) === RED);
  // a 6x5 box: a blue ring with a hole at the top right corner of the ring... and a red inside
  const box = P.make(6, 5);
  for (const [x, y] of P.rect(0, 0, 4, 4)) P.set(box, x, y, BLUE);
  t.ok("paint: rect outline and filled", P.rect(0, 0, 4, 4).length === 16 && P.rect(0, 0, 4, 4, true).length === 25 && P.get(box, 0, 0) === BLUE && P.get(box, 2, 2) === 0);
  const n = P.fill(box, 2, 2, RED);
  t.ok("paint: fill stays inside (4 neighbours)", n === 9 && P.get(box, 2, 2) === RED && P.get(box, 5, 2) === 0 && P.get(box, 0, 2) === BLUE, String(n));
  const outside = P.fill(P.clone(box), 5, 0, RED);
  t.ok("paint: fill outside the ring", outside === 5);
  const rep = P.clone(box), m = P.replace(rep, BLUE, RED);
  t.ok("paint: replace a colour everywhere", m === 16 && P.colors(rep).length === 1 && P.colors(rep)[0] === "#ff0000");
  t.ok("paint: fill with the same colour changes nothing", P.fill(box, 2, 2, RED) === 0 && P.get(box, -1, 0) === -1);
  t.ok("paint: line (Bresenham)", JSON.stringify(P.line(0, 0, 3, 1)) === "[[0,0],[1,0],[2,1],[3,1]]" && P.line(2, 2, 2, 2).length === 1);
  t.ok("paint: mirror around the centre column", P.mirror(6, 0) === 5 && JSON.stringify(P.mirrored([[1, 0], [4, 0]], 6)) === "[[1,0],[4,0]]" && P.mirrored([[0, 1]], 5).length === 2);
  const strip = P.make(4, 2);
  P.set(strip, 0, 0, RED); P.set(strip, 1, 1, BLUE);
  const h = P.clone(strip); P.flipH(h);
  const v = P.clone(strip); P.flipV(v);
  t.ok("paint: flip H and V", P.get(h, 3, 0) === RED && P.get(h, 2, 1) === BLUE && P.get(v, 0, 1) === RED && P.get(v, 1, 0) === BLUE);
  const part = P.clone(strip); P.flipH(part, { x: 0, y: 0, w: 2, h: 2 });
  t.ok("paint: flip a part", P.get(part, 1, 0) === RED && P.get(part, 0, 1) === BLUE && P.get(part, 3, 0) === 0);
  const piece = P.crop(strip, { x: 0, y: 0, w: 2, h: 2 }), dst = P.make(4, 2);
  P.set(dst, 3, 1, BLUE);
  P.paste(dst, piece, 2, 0);
  t.ok("paint: crop and paste (transparent pixels leave what is below)", piece.w === 2 && P.get(dst, 2, 0) === RED && P.get(dst, 3, 1) === BLUE);
  const clr = P.clone(strip); P.clear(clr, { x: 0, y: 0, w: 1, h: 1 });
  t.ok("paint: clear a part", P.get(clr, 0, 0) === 0 && P.get(clr, 1, 1) === BLUE);
  const r = P.resize(strip, 8, 4);
  t.ok("paint: resize keeps the bottom centre", r.dx === 2 && r.dy === 2 && P.get(r.pix, 2, 2) === RED && P.get(r.pix, 3, 3) === BLUE && P.same(P.crop(r.pix, { x: 2, y: 2, w: 4, h: 2 }), strip));
  const pal = P.colors([box, strip]);
  t.ok("paint: a picture's colours, the most used first", pal[0] === "#0000ff" && pal.includes("#ff0000") && pal.length === 2, pal.join(" "));
  t.ok("paint: palette colours from a text", JSON.stringify(P.scanHex('const a = "#FFAA00", b = "#ffaa00", c = "#12345", d = "#123456ff", e = "#0a0B0c";')) === '["#ffaa00","#0a0b0c"]');

  // ------------------------------------------------------------------ in the browser
  const chrome = await launch({ width: 1400, height: 800 });
  try {
    await chrome.open(pathToFileURL(resolve("demo/index.html")).href + "?manual&edit&act=act1");
    for (let i = 0; i < 60 && !(await chrome.ev("!!(Cutaway.editor && Cutaway.editor.modules.paint && Cutaway.editor.modules.help)")); i++) await sleep(100);
    t.ok("paint: the module loads with the editor", await chrome.ev("!!Cutaway.editor.modules.paint && !!Cutaway.paint"));
    // the layout: menu bar, left 200, inspector 360, status bar; the picture centred in what is left
    const res = await chrome.ev("Cutaway.display.reserved");
    const c0 = await chrome.ev("Cutaway.display.toClient(0, 0)");
    t.ok("layout: the display keeps the panels free, the picture centred between them", res.left === 200 && res.top === 24 && res.right === 360 && res.bottom === 22
      && c0.x === 301 && c0.y === 222 && await chrome.ev("Cutaway.display.scale") === 2, JSON.stringify([res, c0]));
    t.ok("layout: toLogical and toClient agree", JSON.stringify(await chrome.ev("(() => { const c = Cutaway.display.toClient(37, 91); const l = Cutaway.display.toLogical(c.x, c.y); return [l.x, l.y, l.inside]; })()")) === "[37,91,true]");
    const titles = await chrome.ev("Cutaway.editor.menus().map((m) => m[0]).join(' ')");
    t.ok("menus: File Edit View Room Art Play Tools Help", titles === "File Edit View Room Art Play Tools Help", titles);
    const art = await chrome.ev("Cutaway.editor.menus().find((m) => m[0] === 'Art')[1].map((i) => i.label ?? i.head ?? '-').join('|')");
    t.ok("menus: the Art menu (the module's items)", /Edit pixels/.test(art) && /New sprite/.test(art) && /Import PNG/.test(art) && /Export PNG/.test(art) && /pxl sources/.test(art), art);
    const head = await chrome.ev("(() => { const r = document.querySelector('.cw-bar [data-menu=Edit]').getBoundingClientRect(); return { x: r.left + 8, y: r.top + 8 }; })()");
    await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: head.x, y: head.y });
    await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: head.x, y: head.y, button: "left", buttons: 1, clickCount: 1 });
    await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: head.x, y: head.y, button: "left", buttons: 0, clickCount: 1 });
    const menu = await chrome.ev("[...document.querySelectorAll('.cw-menu .it')].map((e) => e.textContent + (e.classList.contains('off') ? '(off)' : '')).join('|')");
    t.ok("menus: a click opens a dropdown with the shortcuts", /UndoCtrl\+Z/.test(menu) && /RedoCtrl\+Y/.test(menu), menu);
    await chrome.ev("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); 1");
    t.ok("menus: Esc closes it", await chrome.ev("!document.querySelector('.cw-menu')"));

    // a sprite in the paint view: paint a line with the mouse
    t.ok("paint: a sprite opens in the centre", await chrome.ev("Cutaway.editor.modules.paint.open('crate')"));
    await sleep(300);
    t.ok("paint: the paint view is in the centre", await chrome.ev("!!Cutaway.editor.centre.querySelector('.cw-paint canvas') && Cutaway.editor.centre.style.display !== 'none' && Cutaway.editor.activeTab === 'art'"));
    const orig = await chrome.ev("[2, 3, 4, 5, 6].map((x) => Cutaway.editor.modules.paint.pixel(x, 5))");
    await chrome.ev("Cutaway.editor.modules.paint.setTool('pencil'); Cutaway.editor.modules.paint.setColors('#ff0000', ''); 1");
    const at = (x, y) => chrome.ev(`Cutaway.editor.modules.paint.clientOf(${x}, ${y})`);
    const mouse = async (type, x, y, button = "left", buttons = 1) => { const c = await at(x, y); await chrome.send("Input.dispatchMouseEvent", { type, x: c.x, y: c.y, button, buttons, clickCount: 1 }); };
    await mouse("mouseMoved", 2, 5, "none", 0); await mouse("mousePressed", 2, 5); await mouse("mouseMoved", 4, 5); await mouse("mouseMoved", 6, 5); await mouse("mouseReleased", 6, 5, "left", 0);
    const row = () => chrome.ev("[2, 3, 4, 5, 6].map((x) => Cutaway.editor.modules.paint.pixel(x, 5))");
    t.ok("paint: a stroke with the mouse paints every pixel on its way", (await row()).every((c) => c === "#ff0000"), JSON.stringify(await row()));
    await mouse("mouseMoved", 4, 5, "none", 0); await mouse("mousePressed", 4, 5, "right", 2); await mouse("mouseReleased", 4, 5, "right", 0);
    t.ok("paint: the right button paints the 2nd colour (transparent)", (await row())[2] === "");
    const key = (code, o = {}) => chrome.ev(`window.dispatchEvent(new KeyboardEvent("keydown", ${JSON.stringify({ code, ...o })})); 1`);
    await key("KeyZ", { ctrlKey: true });
    t.ok("paint: Ctrl+Z undoes the last stroke", (await row()).every((c) => c === "#ff0000"));
    await key("KeyZ", { ctrlKey: true });
    t.ok("paint: and the one before", JSON.stringify(await row()) === JSON.stringify(orig), JSON.stringify(await row()));
    await key("KeyY", { ctrlKey: true });
    t.ok("paint: Ctrl+Y redoes", (await row()).every((c) => c === "#ff0000"));
    await chrome.ev("Cutaway.editor.menus().find((m) => m[0] === 'Edit')[1][0].run(); 1");
    t.ok("paint: Edit > Undo goes to the paint view", JSON.stringify(await row()) === JSON.stringify(orig));
    await key("KeyY", { ctrlKey: true });
    // the fill tool (key G), then the mirror
    await key("KeyG");
    t.ok("paint: G picks the fill tool", await chrome.ev("Cutaway.editor.modules.paint.tool") === "fill");
    await chrome.ev("Cutaway.editor.modules.paint.setColors('#00ff00'); 1");
    const before = await chrome.ev("Cutaway.editor.modules.paint.pixel(2, 5)");
    await mouse("mouseMoved", 2, 5, "none", 0); await mouse("mousePressed", 2, 5); await mouse("mouseReleased", 2, 5, "left", 0);
    t.ok("paint: fill paints the area of one colour", before === "#ff0000" && (await row()).every((c) => c === "#00ff00"), JSON.stringify(await row()));
    await key("KeyB");
    await chrome.ev("Cutaway.editor.modules.paint.setMirror(true); Cutaway.editor.modules.paint.setColors('#0000ff'); 1");
    const w = await chrome.ev("Cutaway.editor.modules.paint.doc.w");
    await mouse("mouseMoved", 1, 1, "none", 0); await mouse("mousePressed", 1, 1); await mouse("mouseReleased", 1, 1, "left", 0);
    t.ok("paint: Mirror paints both sides", await chrome.ev(`Cutaway.editor.modules.paint.pixel(1, 1) === "#0000ff" && Cutaway.editor.modules.paint.pixel(${w - 2}, 1) === "#0000ff"`));
    await chrome.ev("Cutaway.editor.modules.paint.setMirror(false); 1");
    // apply: the game's crate has the new pixels
    await chrome.ev("Cutaway.editor.modules.paint.apply(); 1");
    const game = await chrome.ev(`(() => {
      const a = Cutaway.assets.get("crate"), img = Cutaway.assets.img(a.image), f = a.frames[0], c = document.createElement("canvas");
      c.width = f.w; c.height = f.h; const g = c.getContext("2d"); g.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data).join(",");
      return { image: a.image, a: px(3, 5), b: px(1, 1), w: f.w };
    })()`);
    t.ok("paint: Apply puts the painting into the game's asset", game.image === "crate__import" && game.a === "0,255,0,255" && game.b === "0,0,255,255" && game.w === w, JSON.stringify(game));
    t.ok("paint: what isn't saved shows", (await chrome.ev("Cutaway.editor.unsaved().join(',')")).includes("Art"));
    // frames: a copy, then undo takes it away again
    await chrome.ev("Cutaway.editor.modules.paint.addFrame(); 1");
    const frames = await chrome.ev("Cutaway.editor.modules.paint.doc.frames.length");
    await key("KeyZ", { ctrlKey: true });
    t.ok("paint: a frame added, and undone", frames === 2 && await chrome.ev("Cutaway.editor.modules.paint.doc.frames.length") === 1);
    // a room background opens the same way, and fills fast
    t.ok("paint: a room background opens", await chrome.ev("Cutaway.editor.modules.paint.open('hall_bg') && Cutaway.editor.modules.paint.doc.w === 320 && Cutaway.editor.modules.paint.doc.h === 180"));
    await sleep(200);
    await key("KeyG");
    await chrome.ev(`Cutaway.editor.modules.paint.setColors("#123456"); 1`);
    const ms = await chrome.ev(`(() => { const p = Cutaway.paint.clone(Cutaway.editor.modules.paint.doc.frames[0].pix); const t0 = performance.now(); Cutaway.paint.replace(p, Cutaway.paint.get(p, 0, 0), 0); Cutaway.paint.fill(p, 0, 0, Cutaway.paint.parse("#123456")); return performance.now() - t0; })()`);
    await mouse("mouseMoved", 10, 170, "none", 0); await mouse("mousePressed", 10, 170); await mouse("mouseReleased", 10, 170, "left", 0);
    t.ok("paint: a fill on the background (and fills are quick there)", await chrome.ev("Cutaway.editor.modules.paint.pixel(10, 170)") === "#123456" && ms < 500, ms + " ms");
    await key("KeyZ", { ctrlKey: true });
    t.ok("paint: the paint view takes the centre only in Art", await chrome.ev("Cutaway.editor.show('room'); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(Cutaway.editor.centre.style.display === 'none'))))"));
    // closing the editor gives the display its whole window back
    await chrome.ev("Cutaway.editor.close(); 1");
    const c1 = await chrome.ev("Cutaway.display.toClient(0, 0)"), res1 = await chrome.ev("Cutaway.display.reserved");
    t.ok("layout: closed, the display is as without the editor", c1.x === 62 && c1.y === 42 && await chrome.ev("Cutaway.display.scale") === 4 && !res1.left && !res1.top && !res1.right && !res1.bottom
      && await chrome.ev("!document.querySelector('.cw-ed')"), JSON.stringify([c1, res1]));
    t.ok("paint: no page errors", chrome.errors.length === 0, chrome.errors.join(" | "));
  } finally {
    await chrome.close();
  }
}
