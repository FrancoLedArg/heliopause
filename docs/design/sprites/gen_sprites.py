"""Heliopause v1 game sprites, in the style of the Heliopause UI kit v1.

AI-generated pixel art (see AI-USAGE.md): the game shows a visible
"AI-generated art" watermark wherever these sprites appear.

Native 640x360, nearest-neighbour. Only kit palette colours are used.
Light comes from the top-left; every sprite gets a 1px `void` outline.

Usage:  python3 gen_sprites.py <out_dir> [preview_png [surfaces_preview_png]]
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


# ------------------------------------------------------------------ surfaces
# Landscape surface layers (ticket #22), three parallax layers per Body kind:
#   surface_<kind>_far  800x200  limb: curved edge against black space
#   surface_<kind>_mid  800x160  rolling terrain and crater rims
#   surface_<kind>      800x120  near ground with stones and texture
# Each layer is opaque below its skyline and transparent above it. The
# horizon rises lower-left to upper right (the human's Landed sketch).
# Everything in this section is self-contained (prefix `_surf`/`surface`).
import random

SURFACE_W = 800
# Where the layers sit in the 640x360 Landed scene (top-left y of each layer).
SURFACE_SCENE_Y = {"far": 90, "mid": 180, "near": 240}


def _arc(x, left_y, right_y, apex_x=SURFACE_W):
    """Circular-arc skyline: y = right_y at apex_x, falling toward left_y at x=0."""
    drop = left_y - right_y
    r = (apex_x * apex_x) / (2.0 * drop) + drop / 2.0
    dx = x - apex_x
    return right_y + (r - math.sqrt(max(r * r - dx * dx, 0.0)))


def _vnoise(x, seed, scale):
    """Smooth 1-D value noise in [0, 1)."""
    t = x / scale
    i = math.floor(t)
    f = t - i
    f = f * f * (3 - 2 * f)
    return hash01(i, 0, seed) * (1 - f) + hash01(i + 1, 0, seed) * f


def _fbm(x, seed, scales):
    amp, tot, norm = 1.0, 0.0, 0.0
    for k, sc in enumerate(scales):
        tot += amp * _vnoise(x, seed + k * 13, sc)
        norm += amp
        amp *= 0.5
    return tot / norm - 0.5


def _skyline(w, left_y, right_y, rough, seed, scales):
    return [int(round(_arc(x, left_y, right_y) + _fbm(x, seed, scales) * rough)) for x in range(w)]


def _fill_terrain(s, sky, bands, edge_hi, edge_lo):
    """Fill below the skyline. bands: [(max_depth, key), ...] top to bottom;
    two-pixel dither where one band meets the next."""
    for x in range(s.w):
        y0 = sky[x]
        slope = sky[min(x + 2, s.w - 1)] - sky[max(x - 2, 0)]
        for y in range(max(y0, 0), s.h):
            dy = y - y0
            if dy == 0:
                s.px(x, y, edge_hi if slope < 0 else edge_lo)
                continue
            for i, (limit, key) in enumerate(bands):
                if dy <= limit:
                    if i + 1 < len(bands) and limit - dy < 2 and (x + y) % 2 == 0:
                        key = bands[i + 1][1]
                    s.px(x, y, key)
                    break


def _crater(s, sky, cx, cy, rx, ry, floor, shade, rim_hi, rim_lo):
    """Flattened (perspective) crater: lit rim top-left, shadowed floor."""
    for y in range(cy - ry - 1, cy + ry + 2):
        for x in range(cx - rx - 1, cx + rx + 2):
            if not (0 <= x < s.w and 0 <= y < s.h) or y <= sky[x]:
                continue
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if d > 1.0:
                continue
            side = (x - cx) / rx + (y - cy) / ry
            if d > 0.62:
                s.px(x, y, rim_hi if side < 0 else rim_lo)
            else:
                s.px(x, y, shade if (side < -0.3 or (x + y) % 3 == 0) else floor)


def _stone(s, x, y, w, h, hi, mid, lo):
    """Small lit boulder with a cast shadow to the lower right."""
    for j in range(h):
        for i in range(w):
            ex = ((i + 0.5) / w - 0.5) * 2
            ey = ((j + 0.5) / h - 0.5) * 2
            if ex * ex + ey * ey > 1.0:
                continue
            s.px(x + i, y + j, hi if ex + ey < -0.55 else lo if ex + ey > 0.5 else mid)
    for i in range(1, w + 1):
        s.px(x + i, y + h, lo)


def _hatch(s, rng, sky, n, key, length, top_margin):
    """Diagonal hatch strokes like the human's sketch; denser toward the camera."""
    for _ in range(n):
        x = rng.randrange(0, s.w)
        t = rng.random() ** 0.6
        y = int(sky[x] + top_margin + t * max(s.h - sky[x] - top_margin - 1, 1))
        for k in range(rng.randint(*length)):
            if x + k < s.w and y - k > sky[x + k] + 2:
                s.px(x + k, y - k, key)


def _scatter_craters(s, sky, rng, n, rx_range, squash, y_lo, palette):
    for _ in range(n):
        rx = rng.randint(*rx_range)
        ry = max(2, int(rx * squash))
        cx = rng.randrange(rx, s.w - rx)
        lo = max(sky[cx] + ry + 3, y_lo)
        hi = s.h - ry - 2
        if lo >= hi:
            continue
        _crater(s, sky, cx, rng.randint(lo, hi), rx, ry, *palette)


def _cracks(s, rng, sky, n, dark, light):
    """Random-walk ice cracks with a pale highlight above them."""
    for _ in range(n):
        x = rng.randrange(20, s.w - 20)
        y = rng.randint(sky[x] + 14, s.h - 4)
        for _ in range(rng.randint(14, 40)):
            if 0 <= x < s.w and 0 <= y < s.h and y > sky[x] + 4:
                s.px(x, y, dark)
                if rng.random() < 0.5 and s.opaque(x, y - 1):
                    s.px(x, y - 1, light)
            x += rng.choice((1, 1, 1, 2, -1))
            y += rng.choice((-1, 0, 0, 1, 1))


def _frost(s, rng, sky, n, key):
    for _ in range(n):
        x = rng.randrange(s.w)
        y = rng.randint(sky[x] + 3, s.h - 1)
        s.px(x, y, key)
        if rng.random() < 0.3:
            s.px(x + 1, y, key)


# Per-kind look: skyline (left_y, right_y, roughness), edge keys (lit, shaded),
# depth bands. Palette names only.
SURFACE_LOOK = {
    "rocky": dict(  # rust and grey rock, craters, scattered stones
        far=dict(sky=(172, 32, 6), edge=("am2", "am1"),
                 bands=[(3, "am1"), (14, "am0"), (40, "rd0"), (9999, "rd0")]),
        mid=dict(sky=(100, 42, 9), edge=("am2", "am1"),
                 bands=[(4, "am1"), (30, "am0"), (70, "rd0"), (9999, "rd0")]),
        near=dict(sky=(84, 40, 5), edge=("am3", "am2"),
                  bands=[(3, "am2"), (24, "am1"), (60, "am0"), (9999, "rd0")]),
        crater=("rd0", "am0", "am2", "am1"), crater_near=("am0", "rd0", "am2", "am1"),
        stone=("gm5", "gm4", "gm2"), hatch="am0", hatch2="am2",
        n_stone=26, n_crater_mid=7, n_crater_near=4, n_hatch=190,
    ),
    "moon": dict(  # grey dust, low and smooth
        far=dict(sky=(176, 38, 2), edge=("gm6", "gm5"),
                 bands=[(3, "gm4"), (16, "gm3"), (44, "gm2"), (9999, "gm1")]),
        mid=dict(sky=(104, 46, 3), edge=("gm6", "gm5"),
                 bands=[(4, "gm5"), (28, "gm4"), (66, "gm3"), (9999, "gm2")]),
        near=dict(sky=(86, 44, 2), edge=("gm6", "gm5"),
                  bands=[(3, "gm5"), (26, "gm4"), (64, "gm3"), (9999, "gm2")]),
        crater=("gm2", "gm3", "gm6", "gm4"), crater_near=("gm2", "gm3", "gm6", "gm5"),
        stone=("gm6", "gm5", "gm3"), hatch="gm3", hatch2="gm5",
        n_stone=7, n_crater_mid=9, n_crater_near=5, n_hatch=90,
    ),
    "icy": dict(  # pale blue ice, cracks, frost
        far=dict(sky=(170, 34, 5), edge=("cy4", "cy3"),
                 bands=[(3, "cy2"), (14, "cy1"), (40, "cy0"), (9999, "gm2")]),
        mid=dict(sky=(98, 44, 7), edge=("wh3", "cy4"),
                 bands=[(4, "cy3"), (28, "cy2"), (66, "cy1"), (9999, "cy0")]),
        near=dict(sky=(82, 42, 4), edge=("wh3", "cy4"),
                  bands=[(3, "wh2"), (24, "cy4"), (60, "cy3"), (9999, "cy2")]),
        crater=("cy1", "cy2", "wh3", "cy3"), crater_near=("cy1", "cy2", "wh3", "cy4"),
        stone=("wh3", "wh2", "cy2"), hatch="cy2", hatch2="wh3",
        n_stone=9, n_crater_mid=3, n_crater_near=2, n_hatch=70,
    ),
}


def surface_layer(kind, layer):
    """One 800-wide parallax layer; layer is 'far', 'mid' or 'near'."""
    look = SURFACE_LOOK[kind]
    spec = look[layer]
    h = {"far": 200, "mid": 160, "near": 120}[layer]
    seed = {"rocky": 11, "moon": 23, "icy": 37}[kind] + {"far": 0, "mid": 100, "near": 200}[layer]
    rng = random.Random(seed)
    s = Spr(SURFACE_W, h)
    left, right, rough = spec["sky"]
    scales = (200, 90, 40) if kind == "moon" else (120, 47, 19)
    sky = _skyline(SURFACE_W, left, right, rough, seed, scales)
    _fill_terrain(s, sky, spec["bands"], *spec["edge"])

    if layer == "far":
        for _ in range(14):  # distant ridge lines on the limb face
            x = rng.randrange(40, SURFACE_W - 40)
            y = sky[x] + rng.randint(8, 30)
            for k in range(rng.randint(10, 26)):
                if s.opaque(x + k, y):
                    s.px(x + k, y, spec["bands"][1][1])
    elif layer == "mid":
        _scatter_craters(s, sky, rng, look["n_crater_mid"], (14, 34), 0.22, 30, look["crater"])
        _hatch(s, rng, sky, look["n_hatch"] // 3, look["hatch"], (3, 5), 10)
        if kind == "icy":
            _cracks(s, rng, sky, 10, "cy0", "wh2")
    else:
        _scatter_craters(s, sky, rng, look["n_crater_near"], (26, 60), 0.2, 24, look["crater_near"])
        _hatch(s, rng, sky, look["n_hatch"], look["hatch"], (3, 7), 8)
        _hatch(s, rng, sky, look["n_hatch"] // 4, look["hatch2"], (2, 4), 8)
        for _ in range(look["n_stone"]):
            w = rng.choice((3, 3, 4, 5, 6, 8))
            x = rng.randrange(4, SURFACE_W - 12)
            _stone(s, x, rng.randint(sky[x] + 10, h - 8), w, max(2, w // 2 + 1), *look["stone"])
        if kind == "icy":
            _cracks(s, rng, sky, 16, "cy1", "wh3")
            _frost(s, rng, sky, 90, "wh3")
        elif kind == "moon":
            for _ in range(60):  # fine dust speckle
                x = rng.randrange(SURFACE_W)
                s.px(x, rng.randint(sky[x] + 4, h - 1), "gm5")
    return s


def build_surfaces(kinds=("rocky", "moon", "icy")):
    out = {}
    for kind in kinds:
        out[f"surface_{kind}_far"] = surface_layer(kind, "far")
        out[f"surface_{kind}_mid"] = surface_layer(kind, "mid")
        out[f"surface_{kind}"] = surface_layer(kind, "near")
    return out


def surface_preview(surfaces, ship, path):
    """Each kind stacked into the 640x360 Landed scene (camera 100px in), the
    16x16 Spacecraft sprite at 3x (stand-in until the 3/4 Chassis lands) in
    front, side by side over a star field."""
    kinds = [k for k in ("rocky", "moon", "icy") if f"surface_{k}" in surfaces]
    w, h, gap = 640, 360, 8
    sheet = Image.new("RGBA", (w * len(kinds) + gap * (len(kinds) + 1), h + 36), col("void"))
    d = ImageDraw.Draw(sheet)
    for n, kind in enumerate(kinds):
        stars = Spr(w, h)
        for i in range(w * h // 700):
            x, y = int(hash01(i, 1, 5) * w), int(hash01(i, 2, 5) * h)
            stars.px(x, y, "wh1" if hash01(i, 3, 5) > 0.7 else "gm4")
        bg = Image.new("RGBA", (w, h), col("void"))
        bg.alpha_composite(stars.image())
        for layer, suffix, off in (("far", "_far", 40), ("mid", "_mid", 70), ("near", "", 100)):
            spr = surfaces[f"surface_{kind}{suffix}"]
            bg.alpha_composite(spr.image().crop((off, 0, off + w, spr.h)), (0, SURFACE_SCENE_Y[layer]))
        bg.alpha_composite(ship.image().resize((ship.w * 3, ship.h * 3), Image.NEAREST), (296, 262))
        sheet.alpha_composite(bg, (gap + n * (w + gap), 8))
        d.text((gap + n * (w + gap), h + 14), f"{kind}: far / mid / near layers, stand-in ship", fill=col("wh1"))
    d.text((gap, h + 24), "HELIOPAUSE landscape surface layers - AI-generated art", fill=col("cy3"))
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
    surfaces = build_surfaces()
    for name, spr in surfaces.items():
        spr.image().save(out / f"{name}.png")
    if len(sys.argv) > 3:
        surface_preview(surfaces, sprites["spacecraft"], sys.argv[3])
    print("\n".join(f"{n} {s.w}x{s.h}" for n, s in surfaces.items()))
