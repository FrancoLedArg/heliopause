"""Generate Heliopause Body sprites in a Deep-Fold-like pixel style (dithered lighting, 3D noise).

Usage: python3 docs/design/sprites/gen_planets.py public/assets/sprites (supersedes the Body sections of gen_sprites.py, issue #308)
Writes body_{rocky,gas,moon}_N.png at native map size and body_*_N_approach.png at 256 px.
"""
import json
import os
import sys

import numpy as np
from PIL import Image



def hexc(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.uint8)


P = {
    "void": "#070a12", "ink": "#0c111c", "gm0": "#121826", "gm1": "#1c2434", "gm2": "#283246",
    "gm3": "#3a465c", "gm4": "#56647c", "gm5": "#8090a8", "gm6": "#b8c4d4",
    "cy0": "#0b3a4c", "cy1": "#11667e", "cy2": "#1ca4bc", "cy3": "#46dcec", "cy4": "#aaf6ff",
    "am0": "#5a2410", "am1": "#a2481a", "am2": "#e07a22", "am3": "#ffb43c", "am4": "#ffe696",
    "rd0": "#4a0e1c", "rd1": "#8e1c2c", "rd2": "#d23a44", "rd3": "#ff7a6e", "rd4": "#ffc0b0",
    "gr0": "#0e3a2c", "gr1": "#1a6e46", "gr2": "#34b26a", "gr3": "#7ceaa0", "gr4": "#d0ffd8",
    "vi0": "#2a1650", "vi1": "#4e2a8c", "vi2": "#8150d0", "vi3": "#b48cff", "vi4": "#e2d4ff",
    "wh0": "#6a7890", "wh1": "#9eacc0", "wh2": "#d2dce8", "wh3": "#f4f8ff",
}


def ramp(*names):
    return np.stack([hexc(P[n]) for n in names])


BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.5


def hash3(ix, iy, iz, seed):
    h = (ix * 374761393 + iy * 668265263 + iz * 1440670441 + seed * 2654435761) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFF) / 65535.0


def vnoise(x, y, z, seed):
    xi, yi, zi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64), np.floor(z).astype(np.int64)
    xf, yf, zf = x - xi, y - yi, z - zi
    u, v, w = (t * t * (3 - 2 * t) for t in (xf, yf, zf))
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                c = hash3(xi + dx, yi + dy, zi + dz, seed)
                wx = u if dx else 1 - u
                wy = v if dy else 1 - v
                wz = w if dz else 1 - w
                out = out + c * wx * wy * wz
    return out


def fbm(x, y, z, seed, octaves=4):
    total, amp, freq, norm = 0, 1.0, 1.0, 0
    for o in range(octaves):
        total = total + amp * vnoise(x * freq, y * freq, z * freq, seed + o * 101)
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm


LIGHT = np.array([-0.62, -0.5, 0.6])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def sphere(n, spin, tilt):
    c = (np.arange(n) + 0.5) / n * 2 - 1
    u, v = np.meshgrid(c, c)
    r2 = u * u + v * v
    inside = r2 <= 1.0
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    # light uses the view-space normal
    light = u * LIGHT[0] + v * LIGHT[1] + z * LIGHT[2]
    # texture space: tilt around view z, then spin around y
    ct, st = np.cos(tilt), np.sin(tilt)
    x1, y1 = u * ct - v * st, u * st + v * ct
    cs, ss = np.cos(spin), np.sin(spin)
    x2, z2 = x1 * cs + z * ss, -x1 * ss + z * cs
    iy, ix = np.indices((n, n))
    dith = BAYER[iy % 4, ix % 4]
    return inside, light, (x2, y1, z2), dith, np.sqrt(r2)


def shade_step(light, dith):
    """-3 night .. +1 highlight, with a dithered terminator."""
    l = light + dith * 0.22
    s = np.full(light.shape, -3)
    s[l > -0.25] = -2
    s[l > 0.05] = -1
    s[l > 0.35] = 0
    s[l > 0.78] = 1
    return s


def craters(pts, seed, count, rmin, rmax):
    rng = np.random.default_rng(seed)
    x, y, z = pts
    floor = np.zeros(x.shape, bool)
    lit_wall = np.zeros(x.shape, bool)
    for _ in range(count):
        c = rng.normal(size=3)
        c /= np.linalg.norm(c)
        r = rng.uniform(rmin, rmax)
        d = np.sqrt((x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2)
        inside = d < r
        # inner wall that faces the light: far side of the bowl from the light
        off = np.stack([x - c[0], y - c[1]])
        facing = (off[0] * LIGHT[0] + off[1] * LIGHT[1]) > 0
        ring = inside & (d > r * 0.6)
        lit_wall |= ring & facing
        floor |= inside & ~(ring & facing)
    return floor, lit_wall


def render(kind, variant, n):
    spec = SPECS[kind][variant]
    inside, light, pts, dith, rad = sphere(n, spec["spin"], spec["tilt"])
    x, y, z = pts
    seed = spec["seed"]
    step = shade_step(light, dith)
    pal = spec["ramp"]
    base = np.zeros((n, n), int)

    if kind == "gas":
        f = spec.get("freq", 1.6)
        turb = fbm(x * f + 10, y * f * 3, z * f, seed, 4)
        t = y * spec["bands"] + turb * spec["turb"]
        idx = np.floor(t).astype(int) % len(spec["band_levels"])
        base = np.array(spec["band_levels"])[idx]
        if "spot" in spec:
            sx, sy, sr = spec["spot"]
            spot = ((x - sx) ** 2 / 1.0 + (y - sy) ** 2 * 3.2) < sr ** 2
            base = np.where(spot, spec["spot_level"], base)
    else:
        f = spec.get("freq", 2.2)
        h = fbm(x * f, y * f, z * f, seed, 5)
        levels = spec["levels"]  # list of (threshold, base_level, ramp_key)
        base = np.full((n, n), levels[0][1])
        which = np.zeros((n, n), int)
        for i, (thr, lvl, _) in enumerate(levels):
            m = h > thr
            base = np.where(m, lvl, base)
            which = np.where(m, i, which)
        if spec.get("craters"):
            cnt, rmin, rmax = spec["craters"]
            fl, wall = craters(pts, seed + 7, cnt, rmin, rmax)
            base = np.where(fl, base - 1, base)
            base = np.where(wall, base + 1, base)
        if spec.get("caps"):
            cap = np.abs(y) + (fbm(x * 4, y * 4, z * 4, seed + 3, 3) - 0.5) * 0.25 > spec["caps"]
            base = np.where(cap, spec["cap_level"], base)

    lvl = np.clip(base + step, 0, len(pal) - 1)
    rgb = pal[lvl]
    img = np.zeros((n, n, 4), np.uint8)
    img[..., :3] = rgb
    img[..., 3] = np.where(inside, 255, 0)
    # atmosphere rim on the lit limb
    if spec.get("atmo") is not None:
        rim = inside & (rad > 0.9) & (light > -0.1)
        img[rim, :3] = hexc(P[spec["atmo"]])
    return Image.fromarray(img, "RGBA")


# Each ramp runs darkest -> lightest; base levels pick the lit colour, shading steps down the ramp.
SPECS = {
    "rocky": [
        # 0: grey cratered rock
        dict(seed=11, spin=0.4, tilt=0.3, ramp=ramp("gm0", "gm1", "gm2", "gm3", "gm4", "gm5", "gm6", "wh2"),
             levels=[(0, 4, "a"), (0.55, 5, "b")], craters=(14, 0.12, 0.3), freq=2.5),
        # 1: rust desert world
        dict(seed=23, spin=1.3, tilt=-0.2, ramp=ramp("gm0", "rd0", "am0", "rd1", "am1", "am2", "am3", "am4"),
             levels=[(0, 3, "a"), (0.48, 4, "b"), (0.62, 5, "c")], craters=(6, 0.1, 0.22), freq=2.8,
             caps=0.86, cap_level=7),
        # 2: ocean world with green continents and ice caps
        dict(seed=37, spin=2.1, tilt=0.35, ramp=None, terran=True),
        # 3: violet volcanic world
        dict(seed=51, spin=0.9, tilt=0.15, ramp=ramp("gm0", "vi0", "gm2", "vi1", "gm4", "vi2", "vi3", "vi4"),
             levels=[(0, 3, "a"), (0.5, 5, "b"), (0.66, 6, "c")], craters=(5, 0.1, 0.2), freq=2.4,
             atmo="vi3"),
    ],
    "gas": [
        dict(seed=61, spin=0.2, tilt=0.12, ramp=ramp("rd0", "am0", "rd1", "am1", "am2", "am3", "am4", "wh3"),
             bands=7.5, turb=2.2, band_levels=[5, 4, 6, 3, 5, 4], spot=(0.35, 0.42, 0.2), spot_level=2),
        dict(seed=71, spin=1.1, tilt=-0.25, ramp=ramp("gm0", "cy0", "gm3", "cy1", "cy2", "cy3", "cy4", "wh3"),
             bands=6.0, turb=1.6, band_levels=[5, 4, 5, 6, 3, 4]),
        dict(seed=81, spin=2.4, tilt=0.3, ramp=ramp("gm0", "vi0", "rd0", "vi1", "rd1", "vi2", "vi3", "rd4"),
             bands=8.5, turb=2.6, band_levels=[5, 3, 6, 4, 5, 2], spot=(-0.3, -0.25, 0.16), spot_level=7),
    ],
    "moon": [
        dict(seed=91, spin=0.5, tilt=0.0, ramp=ramp("gm0", "gm1", "gm2", "gm3", "gm4", "gm5", "gm6", "wh3"),
             levels=[(0, 5, "a"), (0.58, 4, "b")], craters=(10, 0.15, 0.32), freq=2.0),
        dict(seed=101, spin=1.4, tilt=0.2, ramp=ramp("gm1", "gm3", "cy1", "wh0", "wh1", "cy4", "wh2", "wh3"),
             levels=[(0, 6, "a"), (0.55, 5, "b")], craters=(6, 0.12, 0.25), freq=3.0),
        dict(seed=111, spin=2.2, tilt=-0.3, ramp=ramp("gm0", "am0", "gm2", "am1", "gm4", "am2", "gm5", "am3"),
             levels=[(0, 4, "a"), (0.52, 5, "b")], craters=(10, 0.12, 0.3), freq=2.4),
        dict(seed=121, spin=3.0, tilt=0.4, ramp=ramp("gm0", "rd0", "gm2", "rd1", "gm4", "rd2", "gm5", "rd3"),
             levels=[(0, 4, "a"), (0.5, 3, "b")], craters=(8, 0.12, 0.3), freq=2.6),
    ],
}

# The ocean world mixes two ramps, so it gets its own palette: water levels 0-4, land 5-9, ice 10-11.
TERRAN = ramp("gm0", "cy0", "cy1", "cy2", "cy3", "gr0", "gr1", "gr2", "gr3", "gr4", "wh2", "wh3")


def render_terran(n):
    spec = SPECS["rocky"][2]
    inside, light, pts, dith, rad = sphere(n, spec["spin"], spec["tilt"])
    x, y, z = pts
    h = fbm(x * 2.0, y * 2.0, z * 2.0, spec["seed"], 5)
    step = shade_step(light, dith)
    land = h > 0.52
    water_lvl = np.clip(3 + step, 0, 4)
    land_lvl = np.clip(np.where(h > 0.63, 8, 7) + step, 5, 9)
    lvl = np.where(land, land_lvl, water_lvl)
    cap = np.abs(y) + (fbm(x * 4, y * 4, z * 4, 5, 3) - 0.5) * 0.3 > 0.84
    lvl = np.where(cap, np.where(step >= 0, 11, np.where(step >= -1, 10, 3)), lvl)
    # clouds
    cl = fbm(x * 3 + 5, y * 6, z * 3, 77, 4)
    lvl = np.where((cl > 0.62) & (step >= -1), 11, lvl)
    rgb = TERRAN[lvl]
    img = np.zeros((n, n, 4), np.uint8)
    img[..., :3] = rgb
    img[..., 3] = np.where(inside, 255, 0)
    rim = inside & (rad > 0.9) & (light > -0.1)
    img[rim, :3] = hexc(P["cy3"])
    return Image.fromarray(img, "RGBA")


SIZES = {"rocky": 24, "gas": 48, "moon": 12}


def ringed(kind, v, n):
    """Gas Giant 2 wears a tilted ring: back half behind the planet, front half over it."""
    m = int(round(n * 0.6))
    planet = render(kind, v, m)
    c = (np.arange(n) + 0.5) - n / 2
    u, w = np.meshgrid(c, c)
    a = -0.32
    ru, rv = u * np.cos(a) - w * np.sin(a), u * np.sin(a) + w * np.cos(a)
    e_out = (ru / (0.49 * n)) ** 2 + (rv / (0.13 * n)) ** 2
    e_in = (ru / (0.37 * n)) ** 2 + (rv / (0.085 * n)) ** 2
    band = (e_out <= 1) & (e_in > 1)
    mid = (ru / (0.43 * n)) ** 2 + (rv / (0.107 * n)) ** 2
    rgb = np.where((np.abs(mid - 1) < 0.09)[..., None], hexc(P["vi1"]), hexc(P["rd4"]))
    rgb = np.where((ru > 0.25 * n)[..., None] & band[..., None], hexc(P["vi3"]), rgb)
    ring = np.zeros((n, n, 4), np.uint8)
    ring[..., :3] = rgb
    ring[..., 3] = np.where(band, 255, 0)
    back = ring.copy(); back[rv > 0, 3] = 0
    front = ring.copy(); front[rv <= 0, 3] = 0
    out = Image.fromarray(back, "RGBA")
    out.alpha_composite(planet, ((n - m) // 2, (n - m) // 2))
    out.alpha_composite(Image.fromarray(front, "RGBA"))
    return out


def make(kind, v, n):
    if kind == "rocky" and v == 2:
        return render_terran(n)
    if kind == "gas" and v == 2:
        return ringed(kind, v, n)
    return render(kind, v, n)


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for kind, specs in SPECS.items():
        for v in range(len(specs)):
            make(kind, v, SIZES[kind]).save(os.path.join(out, f"body_{kind}_{v}.png"))
            big = make(kind, v, 128).resize((256, 256), Image.NEAREST)
            big.save(os.path.join(out, f"body_{kind}_{v}_approach.png"))
    print("ok")


if __name__ == "__main__":
    main()
