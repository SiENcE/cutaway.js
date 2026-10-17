// The test card: draws straight into the buffer every frame (no room).
"use strict";
(function () {
  const BARS = ["#f2f2f2", "#f2d04a", "#5ad0e0", "#62c050", "#d070e0", "#e85a4a", "#4a6ae0", "#202028"];
  Cutaway.events.on("frame.ui", (/** @type {CanvasRenderingContext2D} */ ctx) => {
    const W = Cutaway.display.width, H = Cutaway.display.height, f = Cutaway.font.get();
    ctx.fillStyle = "#2a2440"; ctx.fillRect(0, 0, W, H);
    BARS.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(16 + i * 18, 96, 18, 24); });
    for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) {       // 1 px checkerboard
      ctx.fillStyle = (x + y) % 2 ? "#fff" : "#000"; ctx.fillRect(256 + x, 96 + y, 1, 1);
    }
    ctx.fillStyle = "#fff";                                            // 1 px frame on the edges
    ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, H - 1, W, 1); ctx.fillRect(0, 0, 1, H); ctx.fillRect(W - 1, 0, 1, H);
    ctx.fillStyle = "#ff4a5a";                                         // corner pixels
    for (const [x, y] of [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]]) ctx.fillRect(x, y, 1, 1);
    f.draw(ctx, "Cutaway.js " + Cutaway.version, 16, 14, { color: "#f2d04a", outline: "#1a1426" });
    f.draw(ctx, "ABCDEFGHIJKLMNOPQRSTUVWXYZ ÄÖÜ\nabcdefghijklmnopqrstuvwxyz äöüß\n0123456789 .,:;!? \"'()+-=*/% „“ …", 16, 30, { color: "#fff" });
    f.draw(ctx, "Größere Fässer? Übermäßig süß!", 16, 64, { color: "#9ce870", shadow: "#1a1426" });
    f.draw(ctx, `scale x${Cutaway.display.scale}  ${W}x${H}`, W - 16, 14, { color: "#fff", align: "right" });
    f.draw(ctx, "zentriert", 280, 134, { color: "#ff8ac0", outline: "#1a1426", align: "center" });
    const px = Cutaway.input.x, py = Cutaway.input.y;
    if (Cutaway.input.inside) { ctx.fillStyle = "#ff4a5a"; ctx.fillRect(px - 3, py, 7, 1); ctx.fillRect(px, py - 3, 1, 7); }
    f.draw(ctx, `pointer ${px},${py}`, 16, 134, { color: "#fff" });
  });
  Cutaway.start({ width: 320, height: 180, border: "#111" });
})();
