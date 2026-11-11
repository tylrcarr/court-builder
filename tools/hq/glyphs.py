# Reads the centre value of an HQ body-picker wheel (feet/inches) by template matching.
# usage:
#   glyphs.py read <screenshot.png> <centerX> [<centerX> ...]   -> prints one value per column
#   glyphs.py learn <screenshot.png> <centerX> <label>           -> adds digit templates from a known value
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(HERE, 'glyphs.json')
Y0, H, HALF_W, SIZE = 1924, 68, 92, (12, 20)


def components(img_path, cx):
    im = Image.open(img_path).convert('L').crop((cx - HALF_W, Y0, cx + HALF_W, Y0 + H))
    w, h = im.size
    px = im.load()
    on = [[px[x, y] > 170 for x in range(w)] for y in range(h)]
    cols = [any(on[y][x] for y in range(h)) for x in range(w)]
    parts, x = [], 0
    while x < w:
        if not cols[x]:
            x += 1
            continue
        start = x
        while x < w and cols[x]:
            x += 1
        ys = [y for y in range(h) if any(on[y][i] for i in range(start, x))]
        parts.append((start, x, min(ys), max(ys) + 1))
    if not parts:
        return [], on
    full = max(p[3] - p[2] for p in parts)
    return [(p, (p[3] - p[2]) < full * 0.55) for p in parts], on


def bitmap(on, part):
    x1, x2, y1, y2 = part
    bw, bh = SIZE
    return [1 if on[y1 + (r * (y2 - y1)) // bh][x1 + (c * (x2 - x1)) // bw] else 0
            for r in range(bh) for c in range(bw)]


def load():
    return json.load(open(STORE)) if os.path.exists(STORE) else {}


def read(img_path, cx, templates):
    parts, on = components(img_path, cx)
    text = ''
    for part, is_tick in parts:
        if is_tick:
            text += "'"
            continue
        bm = bitmap(on, part)
        best, best_d = '?', 10 ** 9
        for digit, samples in templates.items():
            for s in samples:
                d = sum(a != b for a, b in zip(bm, s))
                if d < best_d:
                    best, best_d = digit, d
        text += best if best_d <= 40 else '?'
    # ticks: first group separates feet/inches, trailing group is the inch mark
    feet, _, rest = text.partition("'")
    inches = rest.strip("'")
    return f"{feet}'{inches}\"" if feet and inches else text


def learn(img_path, cx, label, templates):
    parts, on = components(img_path, cx)
    digits = [p for p, tick in parts if not tick]
    chars = [c for c in label if c.isdigit()]
    if len(digits) != len(chars):
        raise SystemExit(f'segment mismatch for {label}: {len(digits)} glyphs')
    for part, ch in zip(digits, chars):
        templates.setdefault(ch, [])
        bm = bitmap(on, part)
        if bm not in templates[ch]:
            templates[ch].append(bm)


if __name__ == '__main__':
    cmd = sys.argv[1]
    t = load()
    if cmd == 'read':
        print(' '.join(read(sys.argv[2], int(cx), t) for cx in sys.argv[3:]))
    elif cmd == 'learn':
        learn(sys.argv[2], int(sys.argv[3]), sys.argv[4], t)
        json.dump(t, open(STORE, 'w'))
        print('digits known:', ''.join(sorted(t)))
