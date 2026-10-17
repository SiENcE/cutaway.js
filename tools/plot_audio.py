"""Plot a WAV: spectrogram over a loudness curve, with a grid line every bar.
Usage: python tools/plot_audio.py music.wav out.png [--bar 2.5] [--marks 6,13.1]"""
import sys, wave
import numpy as np
from PIL import Image, ImageDraw

args = sys.argv[1:]
src, dst = args[0], args[1]
bar = float(args[args.index("--bar") + 1]) if "--bar" in args else 0
marks = [float(x) for x in args[args.index("--marks") + 1].split(",")] if "--marks" in args else []
w = wave.open(src)
sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
x = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, ch).mean(axis=1) / 32768
win, hop = 2048, 512
frames = 1 + (len(x) - win) // hop
spec = np.empty((win // 2, frames), dtype=np.float32)
hann = np.hanning(win)
for i in range(frames):
    seg = x[i * hop:i * hop + win] * hann
    spec[:, i] = np.abs(np.fft.rfft(seg))[:win // 2]
db = 20 * np.log10(spec + 1e-6)
db = np.clip((db + 80) / 80, 0, 1)
# log frequency axis, 40 Hz .. 12 kHz -> 300 rows
H, W = 300, 1400
freqs = np.fft.rfftfreq(win, 1 / sr)[:win // 2]
rows = np.geomspace(40, 12000, H)[::-1]
idx = np.clip(np.searchsorted(freqs, rows), 0, len(freqs) - 1)
img = db[idx, :]
cols = np.linspace(0, frames - 1, W).astype(int)
img = img[:, cols]
rgb = np.stack([img ** 0.6 * 255, img ** 1.2 * 200, img ** 2.5 * 255], axis=-1).astype(np.uint8)
out = Image.new("RGB", (W, H + 120), (12, 10, 20))
out.paste(Image.fromarray(rgb), (0, 0))
d = ImageDraw.Draw(out)
dur = len(x) / sr
rms = [np.sqrt(np.mean(x[int(t * sr):int((t + 0.05) * sr)] ** 2)) for t in np.arange(0, dur, 0.05)]
peak = max(rms) or 1
pts = [(int(i * 0.05 / dur * W), H + 115 - int(r / peak * 105)) for i, r in enumerate(rms)]
d.line(pts, fill=(255, 220, 90), width=1)
if bar:
    t = 0.0
    while t < dur:
        X = int(t / dur * W); d.line([(X, 0), (X, H + 120)], fill=(70, 70, 110)); t += bar
for m in marks:
    X = int(m / dur * W); d.line([(X, 0), (X, H + 120)], fill=(255, 80, 80))
out.save(dst)
print(f"{dst}: {dur:.1f} s, rms peak {peak:.3f}")
