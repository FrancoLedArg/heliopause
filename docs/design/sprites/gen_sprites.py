"""Heliopause v1 game sprites, in the style of the Heliopause UI kit v1.

AI-generated pixel art (see AI-USAGE.md): the game shows a visible
"AI-generated art" watermark wherever these sprites appear.

Native 640x360, nearest-neighbour. Only kit palette colours are used.
Light comes from the top-left; every sprite gets a 1px `void` outline.

Usage:  python3 gen_sprites.py <out_dir> [preview_png]
Needs Pillow and numpy.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# ------------------------------------------------------------------ palette
PALETTE = {
    "void": "070a12", "ink": "0c111c",
    "gm0": "121826", "gm1": "1c2434", "gm2": "283246", "gm3": "3a465c",
    "gm4": "56647c", "gm5": "8090a8", "gm6": "b8c4d4",
    "cy0": "0b3a4c", "cy1": "11667e", "cy2": "1ca4bc", "cy3": "46dcec", "cy4": "aaf6ff",
    "am0": "5a2410", "am1": "a2481a", "am2": "e07a22", "am3": "ffb43c", "am4": "ffe696",
    "rd0": "4a0e1c", "rd1": "8e1c2c", "rd2": "d23a44", "rd3": "ff7a6e", "rd4": "ffc0b0",
    "gr0": "0e3a2c", "gr1": "1a6e46", "gr2": "34b26a", "gr3": "7ceaa0", "gr4": "d0ffd8",
    "vi0": "2a1650", "vi1": "4e2a8c", "vi2": "8150d0", "vi3": "b48cff", "vi4": "e2d4ff",
    "wh0": "6a7890", "wh1": "9eacc0", "wh2": "d2dce8", "wh3": "f4f8ff",
}


def col(key):
    h = PALETTE[key]
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


CLEAR = (0, 0, 0, 0)
LIGHT = np.array([-0.55, -0.65, 0.52])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


class Spr:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), dtype=np.uint8)

    def px(self, x, y, key):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x] = col(key) if key else CLEAR

    def get(self, x, y):
        return tuple(int(v) for v in self.a[y, x])

    def opaque(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h and self.a[y, x, 3] > 0

    def pattern(self, x0, y0, rows, cmap):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in cmap:
                    self.px(x0 + i, y0 + j, cmap[ch])

    def outline(self, key="void", diag=False):
        hits = []
        for y in range(self.h):
            for x in range(self.w):
                if self.opaque(x, y):
                    continue
                n = [(1, 0), (-1, 0), (0, 1), (0, -1)]
                if diag:
                    n += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
                if any(self.opaque(x + dx, y + dy) for dx, dy in n):
                    hits.append((x, y))
        for x, y in hits:
            self.px(x, y, key)
        return self

    def blit(self, other, ox=0, oy=0):
        for y in range(other.h):
            for x in range(other.w):
                if other.a[y, x, 3] > 0:
                    tx, ty = x + ox, y + oy
                    if 0 <= tx < self.w and 0 <= ty < self.h:
                        self.a[ty, tx] = other.a[y, x]
        return self

    def image(self):
        return Image.fromarray(self.a, "RGBA")


# ------------------------------------------------------------------ spheres
def hash01(x, y, seed):
    """Deterministic per-pixel noise in [0, 1)."""
    v = math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return v - math.floor(v)


def sphere(s, cx, cy, r, shade_fn):
    """Fill a disc; shade_fn(x, y, light 0..1, nx, ny) returns a palette key."""
    for y in range(s.h):
        for x in range(s.w):
            dx, dy = (x + 0.5 - cx) / r, (y + 0.5 - cy) / r
            d2 = dx * dx + dy * dy
            if d2 > 1.0:
                continue
            nz = math.sqrt(1.0 - d2)
            lum = max(0.0, dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2])
            key = shade_fn(x, y, lum, dx, dy)
            if key:
                s.px(x, y, key)


def ramp_pick(ramp, lum, cuts):
    """cuts: ascending luminance thresholds, len(ramp) - 1 of them."""
    i = 0
    for c in cuts:
        if lum > c:
            i += 1
    return ramp[min(i, len(ramp) - 1)]


CUTS5 = (0.18, 0.42, 0.68, 0.9)


def in_disc(x, y, cx, cy, r):
    return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r


# ------------------------------------------------------------------ star
def star():
    s = Spr(64, 64)
    cx = cy = 32
    # corona: soft rings of sparse pixels and eight pixel rays
    for y in range(64):
        for x in range(64):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            n = hash01(x, y, 3)
            if 20 < d <= 23 and n < 0.55:
                s.px(x, y, "am2")
            elif 23 < d <= 26 and n < 0.28:
                s.px(x, y, "am1")
            elif 26 < d <= 29 and n < 0.1:
                s.px(x, y, "am0")
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        long = 30 if k % 2 == 0 else 26
        for t in range(21, long):
            x = int(cx + math.cos(a) * t)
            y = int(cy + math.sin(a) * t)
            s.px(x, y, "am3" if t < 24 else ("am2" if t < 27 else "am1"))
    # photosphere: brighter towards the centre (no outline: it glows)
    for y in range(64):
        for x in range(64):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if d > 20:
                continue
            n = hash01(x, y, 9)
            if d <= 7:
                k = "wh3"
            elif d <= 11:
                k = "am4" if n > 0.15 else "wh3"
            elif d <= 15.5:
                k = "am3" if n > 0.2 else "am4"
            elif d <= 18.5:
                k = "am2" if n > 0.25 else "am3"
            else:
                k = "am1" if n > 0.4 else "am2"
            s.px(x, y, k)
    return s


# ------------------------------------------------------------------ rocky planets (24x24)
def crater_layer(s, cx, cy, r, craters, dark, rim):
    for (kx, ky, kr) in craters:
        for y in range(s.h):
            for x in range(s.w):
                if not in_disc(x, y, cx, cy, r - 0.6):
                    continue
                if in_disc(x, y, kx, ky, kr):
                    # lower-right inner wall catches the light
                    if not in_disc(x - 1, y - 1, kx, ky, kr):
                        s.px(x, y, dark)
                    elif not in_disc(x + 1, y + 1, kx, ky, kr):
                        s.px(x, y, rim)


def seams(s, cx, cy, r, polylines, key_fn, glow=None):
    """Draw crack/lava polylines clipped inside the disc; key_fn(lit) picks the colour."""
    pts = []
    for line in polylines:
        for (x0, y0), (x1, y1) in zip(line, line[1:]):
            n = max(abs(x1 - x0), abs(y1 - y0))
            for i in range(n + 1):
                pts.append((round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)))
    for x, y in pts:
        if in_disc(x, y, cx, cy, r - 1.0):
            lit = (x + y) < (cx + cy) + 4
            if glow:
                for dx, dy in ((1, 0), (0, 1)):
                    if in_disc(x + dx, y + dy, cx, cy, r - 1.0) and (x + dx, y + dy) not in pts:
                        s.px(x + dx, y + dy, glow)
            s.px(x, y, key_fn(lit))


def rocky(kind):
    s = Spr(24, 24)
    cx = cy = 12
    r = 10.5
    if kind == 0:  # grey, cratered
        ramp = ["gm1", "gm2", "gm4", "gm5", "gm6"]
        sphere(s, cx, cy, r, lambda x, y, l, nx, ny: ramp_pick(ramp, l, CUTS5))
        crater_layer(s, cx, cy, r, [(9, 9, 2.2), (15, 13, 2.8), (10, 16, 1.6), (16, 7, 1.4)], "gm2", "gm5")
    elif kind == 1:  # rust desert with dark maria and a pale polar cap
        ramp = ["rd0", "am0", "am1", "am2", "am3"]

        def f(x, y, l, nx, ny):
            k = ramp_pick(ramp, l, CUTS5)
            if ny < -0.82 and l > 0.25:
                return "rd4" if l > 0.6 else "wh1"
            band = math.sin(nx * 4.0 + ny * 6.5) + 0.6 * math.sin(nx * 9 - ny * 3)
            if band > 0.95 and k not in ("rd0",):
                return {"am3": "am2", "am2": "am1", "am1": "am0", "am0": "rd0"}[k]
            return k
        sphere(s, cx, cy, r, f)
    elif kind == 2:  # icy blue-white with cracks
        ramp = ["cy0", "cy1", "wh1", "wh2", "wh3"]
        sphere(s, cx, cy, r, lambda x, y, l, nx, ny: ramp_pick(ramp, l, CUTS5))
        seams(s, cx, cy, r, [[(4, 9), (9, 11), (13, 10), (19, 13)], [(9, 11), (11, 16), (10, 20)],
                             [(13, 4), (14, 8), (13, 10)]], lambda l: "cy2" if l else "cy1")
    else:  # dark volcanic with lava seams
        ramp = ["ink", "gm0", "gm1", "gm2", "gm3"]
        sphere(s, cx, cy, r, lambda x, y, l, nx, ny: ramp_pick(ramp, l, CUTS5))
        seams(s, cx, cy, r, [[(3, 13), (7, 12), (10, 14), (14, 13), (17, 15), (21, 14)],
                             [(10, 14), (11, 18), (9, 21)], [(8, 4), (10, 7), (9, 10)],
                             [(15, 5), (16, 9)]], lambda l: "am3" if l else "rd2", glow="am1")
    return s.outline()


# ------------------------------------------------------------------ gas giants (48x48)
def banded(s, cx, cy, r, bands, storm=None):
    """bands: list of (ny_upper_limit, ramp); ramps are dark->light, 4 long."""
    cuts = (0.2, 0.48, 0.78)

    def f(x, y, l, nx, ny):
        wob = 0.05 * math.sin(nx * 9.0 + ny * 3.0)
        ramp = bands[-1][1]
        for lim, rmp in bands:
            if ny + wob < lim:
                ramp = rmp
                break
        if storm is not None:
            sx, sy, rx, ry = storm
            e = ((nx - sx) / rx) ** 2 + ((ny - sy) / ry) ** 2
            if e <= 1.0:
                ramp = ["rd0", "rd1", "rd2", "rd3"] if e > 0.35 else ["rd1", "rd2", "rd3", "rd4"]
        return ramp_pick(ramp, l, cuts)
    sphere(s, cx, cy, r, f)


def gas(kind):
    s = Spr(48, 48)
    if kind == 0:  # amber/brown bands, red storm
        light = ["am1", "am2", "am3", "am4"]
        dark = ["am0", "am1", "am2", "am3"]
        brown = ["rd0", "am0", "am1", "am2"]
        bands = [(-0.7, dark), (-0.45, light), (-0.25, brown), (0.0, light),
                 (0.22, dark), (0.45, light), (0.7, brown), (1.1, dark)]
        banded(s, 24, 24, 19.5, bands, storm=(0.25, 0.32, 0.22, 0.11))
        return s.outline()
    if kind == 1:  # cyan ice giant, soft bands
        a = ["cy0", "cy1", "cy2", "cy3"]
        b = ["cy0", "cy1", "cy3", "cy4"]
        bands = [(-0.55, a), (-0.15, b), (0.25, a), (0.6, b), (1.1, a)]
        banded(s, 24, 24, 18.5, bands)
        return s.outline()
    # ringed, pale gold/white, ring tilted
    body = Spr(48, 48)
    pale = ["am1", "am2", "am3", "am4"]
    white = ["wh0", "wh1", "wh2", "wh3"]
    cream = ["am0", "am2", "am4", "wh3"]
    bands = [(-0.6, pale), (-0.3, white), (0.05, cream), (0.35, white), (0.65, pale), (1.1, cream)]
    banded(body, 24, 24, 13.5, bands)
    body.outline()
    tilt = math.radians(-18)

    def ring_layer(front):
        ring = Spr(48, 48)
        for y in range(48):
            for x in range(48):
                dx, dy = x + 0.5 - 24, y + 0.5 - 24
                u = dx * math.cos(tilt) + dy * math.sin(tilt)
                v = -dx * math.sin(tilt) + dy * math.cos(tilt)
                e = (u / 22.5) ** 2 + (v / 6.0) ** 2
                e_in = (u / 17.0) ** 2 + (v / 4.3) ** 2
                if e <= 1.0 and e_in > 1.0:
                    if (v > 0) != front:
                        continue
                    t = math.sqrt(e)
                    k = "wh2" if t > 0.93 else ("gm5" if t > 0.86 else ("wh1" if t > 0.8 else "gm4"))
                    if not front and in_disc(x, y, 24, 24, 14.5):
                        continue
                    ring.px(x, y, k)
        return ring
    back = ring_layer(False).outline()
    s.blit(back)
    s.blit(body)
    front = ring_layer(True)
    # shadow of the planet on the front ring stays dark (right/below side)
    s.blit(front.outline())
    return s


# ------------------------------------------------------------------ moons (12x12)
def moon(kind):
    s = Spr(12, 12)
    cuts = (0.22, 0.55, 0.85)
    ramps = [
        ["gm2", "gm4", "gm5", "gm6"],      # grey
        ["cy1", "wh1", "wh2", "wh3"],      # icy
        ["am1", "am2", "am3", "am4"],      # sulfur
        ["rd0", "am0", "am1", "am2"],      # brown
    ]
    ramp = ramps[kind]

    def f(x, y, l, nx, ny):
        k = ramp_pick(ramp, l, cuts)
        if kind == 2 and hash01(x, y, 5) < 0.18 and l > 0.3:
            return "gr3" if hash01(x, y, 6) < 0.3 else "am1"
        if kind in (0, 3) and hash01(x, y, 11 + kind) < 0.14 and l > 0.25:
            return ramp[max(0, ramp.index(k) - 1)]
        if kind == 1 and abs(nx - ny * 0.6) < 0.1 and l > 0.3:
            return "cy2"
        return k
    sphere(s, 6, 6, 4.6, f)
    return s.outline()


# ------------------------------------------------------------------ spacecraft (16x16, faces right)
SHIP = [
    "................",
    "................",
    "................",
    "................",
    "......fF........",
    "......fFf.......",
    ".....ehhhhhhh...",
    "....EeLLLLLLLcC.",
    "....EeMMMMMMMcc.",
    ".....ehhhhhhh...",
    "......fFf.......",
    "......fF........",
    "................",
    "................",
    "................",
    "................",
]
SHIP_MAP = {"f": "am2", "F": "am3", "e": "gm2", "E": "gm3", "h": "gm5",
            "L": "gm6", "M": "gm4", "c": "cy2", "C": "cy4"}

FLAME = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "..rro...........",
    "rooayY..........",
    ".rooaY..........",
    "..rro...........",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
]
FLAME_MAP = {"r": "rd2", "o": "am2", "a": "am3", "y": "am4", "Y": "wh3"}


def spacecraft():
    s = Spr(16, 16)
    s.pattern(0, 0, SHIP, SHIP_MAP)
    return s.outline()


def flame():
    s = Spr(16, 16)
    s.pattern(0, 0, FLAME, FLAME_MAP)
    return s


# ------------------------------------------------------------------ Materials icon (32x32)
def crystal(s, x0, base_y, w, h, ramp):
    """Faceted crystal standing on base_y: left face light, right face dark, pointed top."""
    half = w // 2
    for j in range(h):
        y = base_y - j
        tip = j >= h - half
        for i in range(w):
            if tip and abs(i - (w - 1) / 2) > (h - 1 - j) + 0.01:
                continue
            k = ramp[2] if i < half else ramp[1]
            if i == 0 or (tip and abs(i - (w - 1) / 2) > (h - 2 - j)):
                k = ramp[3] if i < half else ramp[1]
            s.px(x0 + i, y, k)
    # bright ridge down the middle-left
    for j in range(h - 1):
        s.px(x0 + half - 1, base_y - j, ramp[3])


def materials():
    s = Spr(32, 32)
    # rock base
    rock = Spr(32, 32)
    for y in range(32):
        for x in range(32):
            dx, dy = (x + 0.5 - 16) / 13.5, (y + 0.5 - 24.5) / 5.5
            if dx * dx + dy * dy <= 1.0 and y >= 19:
                l = 0.5 - dy * 0.35 - dx * 0.25
                k = "gm5" if l > 0.75 else ("gm4" if l > 0.5 else ("gm3" if l > 0.3 else "gm2"))
                if hash01(x, y, 21) < 0.12:
                    k = "gm2"
                rock.px(x, y, k)
    rock.outline()
    s.blit(rock)
    amber = ["am0", "am1", "am2", "am4"]
    cyan = ["cy0", "cy1", "cy2", "cy4"]
    shards = Spr(32, 32)
    crystal(shards, 12, 22, 8, 17, amber)   # tall centre
    crystal(shards, 6, 24, 6, 10, amber)    # left
    crystal(shards, 20, 24, 6, 12, cyan)    # right, cyan vein
    shards.outline()
    s.blit(shards)
    # sparkle
    for x, y, k in [(26, 6, "wh3"), (25, 6, "am4"), (27, 6, "am4"), (26, 5, "am4"), (26, 7, "am4")]:
        s.px(x, y, k)
    return s


# ------------------------------------------------------------------ build
def build():
    sprites = {"body_star": star()}
    for i in range(4):
        sprites[f"body_rocky_{i}"] = rocky(i)
    for i in range(3):
        sprites[f"body_gas_{i}"] = gas(i)
    for i in range(4):
        sprites[f"body_moon_{i}"] = moon(i)
    sprites["spacecraft"] = spacecraft()
    sprites["spacecraft_flame"] = flame()
    sprites["res_materials"] = materials()
    return sprites


def preview(sprites, path, scale=4):
    pad, label_h = 16, 14
    cells = []
    for name, spr in sprites.items():
        cells.append((name, spr.image().resize((spr.w * scale, spr.h * scale), Image.NEAREST)))
    # extra cell: ship with flame overlay
    combo = Spr(16, 16).blit(sprites["spacecraft"]).blit(sprites["spacecraft_flame"])
    cells.append(("spacecraft + flame", combo.image().resize((64, 64), Image.NEAREST)))
    width = 1200
    x = y = pad
    row_h = 0
    placed = []
    for name, img in cells:
        cw = max(img.width, 7 * len(name)) + pad
        if x + cw > width:
            x = pad
            y += row_h + label_h + pad
            row_h = 0
        placed.append((x, y, name, img))
        x += cw
        row_h = max(row_h, img.height)
    height = y + row_h + label_h + pad + 24
    sheet = Image.new("RGBA", (width, height), col("void"))
    d = ImageDraw.Draw(sheet)
    d.text((pad, height - 20), "HELIOPAUSE v1 game sprites (shown at 4x)  -  AI-generated art", fill=col("cy3"))
    for x, y, name, img in placed:
        sheet.alpha_composite(img, (x, y))
        d.text((x, y + img.height + 2), name, fill=col("wh1"))
    sheet.save(path)


if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    sprites = build()
    for name, spr in sprites.items():
        spr.image().save(out / f"{name}.png")
    if len(sys.argv) > 2:
        preview(sprites, sys.argv[2])
    print("\n".join(f"{n} {s.w}x{s.h}" for n, s in sprites.items()))
