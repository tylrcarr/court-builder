# usage: crop.py in.png out.png x y w h scale [invert] [threshold]
import sys
from PIL import Image, ImageOps
src, dst = sys.argv[1], sys.argv[2]
x, y, w, h = map(int, sys.argv[3:7]); s = float(sys.argv[7])
invert = len(sys.argv) > 8 and sys.argv[8] == '1'
threshold = int(sys.argv[9]) if len(sys.argv) > 9 else 0
im = Image.open(src).convert('L').crop((x, y, x + w, y + h))
im = im.resize((int(w * s), int(h * s)), Image.LANCZOS)
im = ImageOps.autocontrast(im)
if threshold:
    im = im.point(lambda p: 255 if p >= threshold else 0)
if invert:
    im = ImageOps.invert(im)
ImageOps.expand(im, border=int(40 * s), fill=255 if invert else 0).save(dst)
