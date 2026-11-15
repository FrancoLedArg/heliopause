"""Heliopause VFX sprites: explosion, engine fire, takeoff plume, flash, Fuel vent, debris, solar flare.

AI-generated pixel art (see AI-USAGE.md): the game shows a visible "AI-generated art"
watermark wherever these sprites appear. Only kit palette colours are used (the helpers
come from `gen_sprites.py` beside this file). Light comes from the top-left. These are
particle-style sprites: no outline, like fx_dust.

  fx_explosion  384x48  8 frames of 48x48 (explode_0..explode_7): flash, fireball, smoke ring, embers
  fx_flame       64x24  4 looping frames of 16x24 (flicker_0..flicker_3): engine fire, base at the
                        bottom centre, tongues pointing up
  fx_plume       96x64  4 looping frames of 24x64 (flicker_0..flicker_3): takeoff exhaust,
                        nozzle at the top centre, pointing down
  fx_flash       64x64  single image: soft radial ignition / impact burst, for additive blending
  fx_vent        64x16  4 looping frames of 16x16 (spray_0..spray_3): Fuel spray, leak point at the
                        left centre (x 0, y 8), spraying right
  fx_debris      48x8   6 frames of 8x8 (chunk_0..chunk_5): scrap chunks; rotate at runtime to tumble
  fx_flare       64x16  single image: solar-flare wave front travelling right (head on the right)

Usage:  python3 -I gen_vfx.py <out_dir> [preview_png]
Needs Pillow and numpy. Run `pnpm exec prettier --write` on the atlas JSON afterwards.
"""
import importlib.util
import json
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# `python3 -I` leaves the script's folder off the import path, so load the helpers by file.
_spec = importlib.util.spec_from_file_location("gen_sprites", Path(__file__).with_name("gen_sprites.py"))
GS = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(GS)
Spr, col, hash01 = GS.Spr, GS.col, GS.hash01

BAYER4 = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))


def bayer(x, y):
    """Ordered-dither threshold in (0, 1)."""
    return (BAYER4[y % 4][x % 4] + 0.5) / 16.0


def dither_pick(ramp, v, x, y):
    """v in 0..1 over the ramp (0 = first key), dithered between neighbouring steps."""
    f = max(0.0, min(0.999, v)) * (len(ramp) - 1)
    i = int(f)
    if f - i > bayer(x, y) and i + 1 < len(ramp):
        i += 1
    return ramp[i]


def lumpy(theta, seed, amp=0.14):
    """An irregular radius factor around a blob, from a few seeded sines."""
    rng = random.Random(seed)
    p = [rng.uniform(0, math.tau) for _ in range(3)]
    return 1.0 + amp * (0.5 * math.sin(3 * theta + p[0]) + 0.35 * math.sin(5 * theta + p[1])
                        + 0.25 * math.sin(9 * theta + p[2]))


def topleft(dx, dy, d):
    """How much a point on a blob faces the top-left light, -1..1."""
    if d < 1e-6:
        return 0.0
    return (-dx - dy) / (d * math.sqrt(2.0))


def sheet_of(frames):
    w, h = frames[0][1].w, frames[0][1].h
    sheet = Spr(w * len(frames), h)
    rects = {}
    for n, (name, fr) in enumerate(frames):
        sheet.blit(fr, n * w, 0)
        rects[name] = (n * w, 0, w, h)
    return sheet, rects


def atlas_json(image_name, sheet, rects):
    data = json.loads(GS.chassis_atlas_json(image_name, sheet, rects))
    data["meta"]["app"] = "docs/design/sprites/gen_vfx.py"
    return json.dumps(data, indent=2) + "\n"


# ------------------------------------------------------------------ explosion
EXP = 48
FIRE = ("wh3", "am4", "am3", "am2", "rd2", "rd1", "rd0")
SMOKE = ("gm5", "gm4", "gm3", "gm2", "gm1")


def explosion_frame(n):
    s = Spr(EXP, EXP)
    c = EXP / 2.0
    seed = 40 + n
    for y in range(EXP):
        for x in range(EXP):
            dx, dy = x + 0.5 - c, y + 0.5 - c
            dist = math.hypot(dx, dy)
            th = math.atan2(dy, dx)
            lit = topleft(dx, dy, dist)
            nz = hash01(x, y, seed) - 0.5
            key = None
            if n == 0:  # pinpoint flash with a four-point glint
                d = dist / (6.5 * lumpy(th, seed, 0.1))
                if d < 1:
                    key = dither_pick(("wh3", "wh3", "am4", "am3"), d, x, y)
                elif (abs(dx) < 1 or abs(dy) < 1) and dist < 13:
                    key = "wh3" if dist < 9 else "am4"
            elif n == 1:  # white-hot burst
                d = dist / (13 * lumpy(th, seed, 0.16))
                if d < 1:
                    key = dither_pick(("wh3", "wh3", "am4", "am3", "am2"), d * 0.95 - lit * 0.08 + nz * 0.1, x, y)
            elif n == 2:  # fireball
                d = dist / (17 * lumpy(th, seed, 0.18))
                if d < 1:
                    key = dither_pick(FIRE[:6], d * 0.85 - lit * 0.18 + nz * 0.18, x, y)
            elif n == 3:  # fireball cooling, smoke at the rim
                d = dist / (19 * lumpy(th, seed, 0.2))
                if d < 0.78:
                    key = dither_pick(FIRE[1:], d * 1.05 - lit * 0.2 + nz * 0.2, x, y)
                elif d < 1:
                    key = dither_pick(SMOKE, (d - 0.78) * 2.2 - lit * 0.35 + nz * 0.2 + 0.2, x, y)
            elif n == 4:  # smoke shell around a dying core
                d = dist / (21 * lumpy(th, seed, 0.2))
                if d < 0.62:
                    key = dither_pick(("am3", "am2", "rd2", "rd1", "rd0"), 0.3 + d * 0.8 - lit * 0.15 + nz * 0.3, x, y)
                elif d < 1:
                    key = dither_pick(SMOKE, (d - 0.62) * 1.3 - lit * 0.45 + nz * 0.25 + 0.15, x, y)
            elif n == 5:  # smoke ring, embers inside
                d = dist / (22 * lumpy(th, seed, 0.18))
                if 0.55 < d < 1:
                    key = dither_pick(SMOKE, abs(d - 0.8) * 1.6 - lit * 0.45 + nz * 0.3 + 0.25, x, y)
                elif d <= 0.55 and hash01(x, y, seed + 7) > 0.86:
                    key = "am2" if hash01(x, y, seed + 8) > 0.5 else "rd2"
            elif n == 6:  # ring thins and breaks up
                d = dist / (23 * lumpy(th, seed, 0.2))
                if 0.72 < d < 1 and hash01(x, y, seed + 3) > 0.3:
                    key = dither_pick(SMOKE[1:], abs(d - 0.86) * 2.5 - lit * 0.4 + nz * 0.3 + 0.3, x, y)
                elif d <= 0.72 and hash01(x, y, seed + 7) > 0.95:
                    key = "rd2" if hash01(x, y, seed + 8) > 0.5 else "am1"
            if key:
                s.px(x, y, key)
    if n >= 5:  # embers flung outward
        rng = random.Random(77)
        count = (10, 14, 16)[n - 5]
        for k in range(16):
            ang = rng.uniform(0, math.tau)
            r0 = rng.uniform(12, 17)
            hot = rng.random()
            if k >= count:
                continue
            r = r0 + (n - 5) * 3.5
            x, y = int(c + math.cos(ang) * r), int(c + math.sin(ang) * r)
            if n == 7:  # last frame: embers only, a little cooler
                s.px(x, y, "am2" if hot > 0.5 else "rd2")
                if hot > 0.8:
                    s.px(x - int(math.copysign(1, math.cos(ang))), y, "rd1")
            else:
                s.px(x, y, "am3" if hot > 0.4 else "am2")
    if n == 7:  # faint smoke wisps left over
        for y in range(EXP):
            for x in range(EXP):
                dx, dy = x + 0.5 - c, y + 0.5 - c
                d = math.hypot(dx, dy) / (24 * lumpy(math.atan2(dy, dx), 47, 0.2))
                if 0.82 < d < 0.98 and hash01(x, y, 47) > 0.72 and not s.opaque(x, y):
                    s.px(x, y, "gm2")
    return s


def build_explosion():
    return sheet_of([(f"explode_{n}", explosion_frame(n)) for n in range(8)])


# ------------------------------------------------------------------ engine fire
FLAME_W, FLAME_H = 16, 24
FLAME_RAMP = ("wh3", "am4", "am3", "am2", "rd2", "rd1")
# (height, sway phase) per frame: the fire licks up and leans from side to side.
FLAME_FRAMES = ((20, 0.0), (17, 1.6), (22, 3.1), (18, 4.7))


def flame_frame(n):
    height, phase = FLAME_FRAMES[n]
    s = Spr(FLAME_W, FLAME_H)
    cx = FLAME_W / 2.0
    base = FLAME_H - 1
    for y in range(FLAME_H):
        t = (base - y) / height  # 0 at the base, 1 at the tip
        if t >= 1.0 or t < 0:
            continue
        half = 5.2 * math.sin(math.pi * min(1.0, 0.18 + t * 0.95)) * (1.0 - t) ** 0.35 + 0.7
        mid = cx + math.sin(t * 4.2 + phase) * 1.7 * t
        for x in range(FLAME_W):
            r = abs(x + 0.5 - mid) / half
            if r > 1.0:
                continue
            nz = hash01(x, y + n * 5, 11) * 0.3 - 0.15
            v = r * 0.6 + t * 0.75 + nz - (0.12 if x + 0.5 < mid else 0.0)
            if v > 1.0 and hash01(x, y, 20 + n) > 0.4:
                continue  # ragged tongues
            s.px(x, y, FLAME_RAMP[min(5, int(max(v, 0.0) * 5.4))])
    rng = random.Random(300 + n)  # loose flecks above the tips
    for _ in range(3):
        x = int(cx + rng.uniform(-4, 4))
        y = base - height - rng.randint(0, 3)
        if 0 <= y < FLAME_H:
            s.px(x, y, rng.choice(("am3", "am2", "rd2")))
    return s


def build_flame():
    return sheet_of([(f"flicker_{n}", flame_frame(n)) for n in range(4)])


# ------------------------------------------------------------------ takeoff plume
PLUME_W, PLUME_H = 24, 64
PLUME_RAMP = ("wh3", "wh3", "am4", "am3", "am2", "am1", "am0")
# (length, sway, seed, diamond offset) per frame.
PLUME_FRAMES = ((60, 0.0, 1, 0), (55, 0.5, 2, 2), (63, -0.4, 3, 4), (57, 0.3, 4, 6))


def plume_frame(n):
    length, sway, seed, doff = PLUME_FRAMES[n]
    s = Spr(PLUME_W, PLUME_H)
    cx = PLUME_W / 2.0
    for y in range(PLUME_H):
        t = y / length
        if t >= 1.0:
            continue
        # Bell at the nozzle, swells a little, then tapers to the tip.
        half = 6.0 + 4.5 * math.sin(math.pi * min(1.0, t * 1.6)) ** 0.8 * (1 - t) - 5.0 * t ** 2.2
        half = max(0.8, half)
        mid = cx + sway * t * 4.0
        # Shock diamonds: the core pinches and flares every 9 rows.
        diamond = 0.5 + 0.5 * math.cos((y + doff) / 9.0 * math.tau)
        core = (1.0 + 2.6 * diamond ** 1.5) * (1 - t * 0.9)
        for x in range(PLUME_W):
            dx = abs(x + 0.5 - mid)
            r = dx / half
            if r > 1.0:
                continue
            nz = hash01(x, y, seed) * 0.22 - 0.11
            if dx < core and t < 0.75:
                v = t * 0.3 + (1 - diamond) * 0.12
            else:
                v = 0.15 + r * 0.6 + t * 0.55 + nz - diamond * 0.08 * (1 - t)
            if v > 1.0 and hash01(x, y, seed + 9) > 0.45:
                continue
            s.px(x, y, dither_pick(PLUME_RAMP, v, x, y))
    rng = random.Random(500 + n)  # sparks shed off the plume
    for _ in range(6):
        y = rng.randint(length // 3, PLUME_H - 1)
        side = rng.choice((-1, 1))
        x = int(cx + side * rng.uniform(6, 11))
        if not s.opaque(x, y):
            s.px(x, y, rng.choice(("am4", "am3", "am2")))
    return s


def build_plume():
    return sheet_of([(f"flicker_{n}", plume_frame(n)) for n in range(4)])


# ------------------------------------------------------------------ flash
FLASH = 64
FLASH_RAMP = ("wh3", "wh3", "am4", "am4", "am3", "am2", "am1")


def build_flash():
    s = Spr(FLASH, FLASH)
    c = FLASH / 2.0
    for y in range(FLASH):
        for x in range(FLASH):
            dx, dy = x + 0.5 - c, y + 0.5 - c
            dist = math.hypot(dx, dy)
            th = math.atan2(dy, dx)
            # Eight soft rays, the four main ones longer.
            ray = max(0.0, math.cos(4 * th)) ** 10 * 0.55
            ray +=max(0.0, math.cos(4 * (th - math.pi / 8))) ** 16 * 0.22
            reach = 15.0 * (1.0 + ray * 1.15)
            d = dist / reach
            if d >= 1.0:
                continue
            v = d ** 0.8
            if v > 0.82 and bayer(x, y) > 1.0 - (1.0 - v) / 0.18 * 0.9:
                continue  # dithered fade at the edge
            s.px(x, y, dither_pick(FLASH_RAMP, v, x, y))
    return s


# ------------------------------------------------------------------ Fuel vent
VENT = 16
VENT_ORIGIN = (0.5, 8.0)


def vent_frame(n):
    s = Spr(VENT, VENT)
    ox, oy = VENT_ORIGIN
    rng = random.Random(9)
    droplets = [(rng.gauss(0.0, 0.16), rng.random(), rng.uniform(0.85, 1.1)) for _ in range(22)]
    # Mist: a sparse dithered fan at the far end.
    for y in range(VENT):
        for x in range(VENT):
            dx, dy = x + 0.5 - ox, y + 0.5 - oy
            if dx > 8 and abs(dy) < dx * 0.42 and hash01(x, y + n * 3, 61) > 0.86:
                s.px(x, y, "cy1")
    # Droplets stream outward; each is a short streak, bright head and darker tail.
    for ang, phase, speed in droplets:
        p = ((phase + n / 4.0) % 1.0) * speed
        dist = 4.0 + p * 12.0
        hx, hy = ox + math.cos(ang) * dist, oy + math.sin(ang) * dist
        head = "wh3" if dist < 7 else "cy4" if dist < 10 else "cy3" if dist < 13 else "cy2"
        tail = {"wh3": "cy4", "cy4": "cy3", "cy3": "cy2", "cy2": "cy1"}[head]
        s.px(int(hx - math.cos(ang) * 1.2), int(hy - math.sin(ang) * 1.2), tail)
        s.px(int(hx), int(hy), head)
    # The jet right at the leak: a white-hot core in a cyan sheath, pulsing in length.
    jet = (5, 4, 6, 4)[n]
    for x in range(jet):
        s.px(x, 8, "wh3")
        s.px(x, 7, "cy4" if x < jet - 1 else "cy3")
        s.px(x, 9, "cy3" if x < jet - 1 else "cy2")
    return s


def build_vent():
    return sheet_of([(f"spray_{n}", vent_frame(n)) for n in range(4)])


# ------------------------------------------------------------------ debris
DEB = 8
# Hand-placed silhouettes ('#' body, 'r' rivet, 'h' scorch glow), lit from the top-left in code.
DEBRIS = [
    ["........",
     "..###...",
     ".#####..",
     ".######.",
     "..####..",
     "...##...",
     "........",
     "........"],
    ["........",
     ".##.....",
     ".###....",
     "..###...",
     "..#r##..",
     "...####.",
     "....##..",
     "........"],
    ["........",
     "..####..",
     "..#..#..",
     "..#..#..",
     ".##..##.",
     "........",
     "........",
     "........"],
    ["........",
     "....##..",
     "...###..",
     "..####..",
     ".#####..",
     ".##h#...",
     "...#....",
     "........"],
    ["........",
     "........",
     ".######.",
     ".#r##r#.",
     ".######.",
     "........",
     "........",
     "........"],
    ["........",
     "...#....",
     "..###...",
     ".##h##..",
     "..####..",
     "..#..##.",
     "........",
     "........"],
]


def debris_frame(n):
    rows = DEBRIS[n]
    s = Spr(DEB, DEB)

    def solid(x, y):
        return 0 <= x < DEB and 0 <= y < DEB and rows[y][x] != "."

    for y in range(DEB):
        for x in range(DEB):
            ch = rows[y][x]
            if ch == ".":
                continue
            lit = not solid(x - 1, y) or not solid(x, y - 1)
            shade = not solid(x + 1, y) or not solid(x, y + 1)
            if ch == "r":
                key = "gm5"
            elif ch == "h":
                key = "am2"
            elif lit and not solid(x - 1, y - 1) and not solid(x - 1, y) and not solid(x, y - 1):
                key = "wh2"  # corner catching the light
            elif lit:
                key = "gm6"
            elif shade:
                key = "gm2"
            else:
                key = "gm4" if hash01(x, y, 90 + n) > 0.6 else "gm3"
            s.px(x, y, key)
    return s


def build_debris():
    return sheet_of([(f"chunk_{n}", debris_frame(n)) for n in range(6)])


# ------------------------------------------------------------------ solar flare
FLARE_W, FLARE_H = 64, 16
FLARE_RAMP = ("wh3", "am4", "am3", "vi4", "vi3", "vi2", "vi1", "vi0")


def build_flare():
    s = Spr(FLARE_W, FLARE_H)
    cy = FLARE_H / 2.0
    for x in range(FLARE_W):
        t = x / (FLARE_W - 1)  # 0 at the tail, 1 at the head
        mid = cy + 2.2 * math.sin(x * 0.21) * (1 - t) ** 0.5
        thick = 0.8 + 5.2 * t ** 1.6
        if t > 0.9:  # rounded leading edge
            thick *= math.sqrt(max(0.0, 1 - ((t - 0.9) / 0.1) ** 2))
        for y in range(FLARE_H):
            r = abs(y + 0.5 - mid) / max(thick, 0.5)
            if r > 1.0:
                continue
            heat = (1 - t) * 0.95 + r * 0.45 - (0.12 if y + 0.5 < mid else 0.0)
            if t < 0.35 and hash01(x, y, 70) > t * 2.2 + 0.25:
                continue  # the tail breaks up into streaks
            s.px(x, y, dither_pick(FLARE_RAMP, heat, x, y))
    rng = random.Random(71)  # motion streaks above and below
    for _ in range(7):
        y = rng.choice((rng.randint(1, 4), rng.randint(11, 14)))
        x0 = rng.randint(4, 40)
        ln = rng.randint(4, 10)
        for x in range(x0, min(FLARE_W, x0 + ln)):
            if not s.opaque(x, y):
                s.px(x, y, "vi2" if x > x0 + ln // 2 else "vi1")
    return s


# ------------------------------------------------------------------ build
def build_vfx():
    """{key: (Spr, frame rects or None)}; None marks a single image."""
    return {
        "fx_explosion": build_explosion(),
        "fx_flame": build_flame(),
        "fx_plume": build_plume(),
        "fx_flash": (build_flash(), None),
        "fx_vent": build_vent(),
        "fx_debris": build_debris(),
        "fx_flare": (build_flare(), None),
    }


def preview(assets, path, scale=4):
    pad, label_h, gap = 16, 14, 6
    width = 1600
    rows = []
    for key, (spr, rects) in assets.items():
        frames = [spr.image()] if rects is None else [GS._crop(spr, r) for r in rects.values()]
        label = key if rects is None else f"{key}: {len(rects)} frames of {frames[0].width}x{frames[0].height}"
        rows.append((label, frames))
    height = pad
    for _, frames in rows:
        height += label_h + max(f.height for f in frames) * scale + pad
    height += 20
    sheet = Image.new("RGBA", (width, height), col("void"))
    d = ImageDraw.Draw(sheet)
    y = pad
    for label, frames in rows:
        d.text((pad, y), label + "  (4x, then 1x)", fill=col("wh1"))
        y += label_h
        x = pad
        for f in frames:
            sheet.alpha_composite(f.resize((f.width * scale, f.height * scale), Image.NEAREST), (x, y))
            x += f.width * scale + gap
        x += pad
        for f in frames:
            sheet.alpha_composite(f, (x, y))
            x += f.width + 2
        y += max(f.height for f in frames) * scale + pad
    d.text((pad, height - 18), "HELIOPAUSE VFX sprites (shown at 4x)  -  AI-generated art", fill=col("cy3"))
    sheet.save(path)


if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    assets = build_vfx()
    for key, (spr, rects) in assets.items():
        spr.image().save(out / f"{key}.png")
        if rects is not None:
            (out / f"{key}.json").write_text(atlas_json(f"{key}.png", spr, rects))
    if len(sys.argv) > 2:
        preview(assets, sys.argv[2])
    print("\n".join(f"{k} {s.w}x{s.h}" + ("" if r is None else f" {len(r)} frames") for k, (s, r) in assets.items()))
