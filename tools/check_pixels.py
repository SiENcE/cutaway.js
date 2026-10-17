"""Check that a screenshot shows the 1x buffer exactly: every logical pixel is a uniform s x s block
of the same colour. Usage: python tools/check_pixels.py shot.png buffer_1x.png"""
import sys
from PIL import Image

shot = Image.open(sys.argv[1]).convert("RGB")
buf = Image.open(sys.argv[2]).convert("RGB")
W, H = buf.size
s = min(shot.width // W, shot.height // H)
ox, oy = (shot.width - W * s) // 2, (shot.height - H * s) // 2
sp, bp = shot.load(), buf.load()
bad = 0
for y in range(H):
    for x in range(W):
        c = bp[x, y]
        for dy in range(s):
            for dx in range(s):
                if sp[ox + x * s + dx, oy + y * s + dy] != c:
                    bad += 1
                    break
            else:
                continue
            break
print(f"{sys.argv[1]}: scale {s}, offset {ox},{oy}, {bad} of {W*H} pixels differ")
sys.exit(1 if bad else 0)
