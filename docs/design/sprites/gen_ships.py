"""Interim upright Spacecraft art (tickets #135, #232), ported from the shipwright mockup.

AI-generated pixel art (see AI-USAGE.md). The drawing code is a Python port of the AI-written
mockup `docs/design/shipwright-bench.html` (cores, side propulsors, fins, main engines, crowns,
paints, and its Drill, Radar and Jump Drive drawings), plus one piece the mockup lacks: the Fuel
Tank pod, drawn with the same `hull` and `plate` primitives in the Chassis's paint.

    scout   Herald Mk II  Ogive  . Nacelles      . Swept fins    . Cluster . Antenna mast . Pulp
    hauler  Bastion       Tiered . Quad boosters . Buttress legs . Cluster . none         . Night
    lancer  Lancer        Needle . Nacelles      . Delta fins    . Twin    . none         . Steel

The drawn Spacecraft is composed at runtime from pieces (spec #230): the Chassis art (fins, side
propulsors, core, crown) and one Component art per installed Component, each attached at a mount
point. Every kind of Component has an ordered list of mount points (MOUNTS, or one for the Jump
Drive); the n-th installed Component of a kind, in Slot order, takes its kind's n-th mount point.

    Engine      level 1 the preset's cluster or twin at the tail, level 2 the mockup's single bell;
                extra Engines are booster pods low on the core
    Fuel Tank   capsule pods stacking up the core, alternating sides; level 2 is longer
    Drill       the mockup's drill arm; level 2 has a longer bit, level 3 a long, wide bit on a thicker shaft
    Radar       the mockup's dish on a boom; level 2 has a bigger dish (ids `radar-1`, `radar-2`)
    Jump Drive  the mockup's violet ring: a back layer behind the Chassis art, a front layer before it

Every piece is drawn on the 104x126 standing grid with the centre of the base at (52, 126) (the
lowest row of the Chassis art is the fin or leg tips, so the ship rests on the base line), in three
frames, each pre-rendered here so the game never turns or scales pixel art:

    landed      standing, lamps and windows off
    landed_lit  standing, lamps, windows and engine glow on
    flight      turned FLIGHT_ANGLE degrees clockwise about the base centre, so the nose points up
                and to the right along the Transfer

Each piece is cropped to its own box; its place, nozzle exits, lamps and anchors are returned as
data, in pixels from the base centre (x right, y down), for the game to import. A Component's
outline is left off where it lies on the Chassis art, so the pieces join as one drawing.

This module has no dependencies; `gen_sprites.py` turns its pieces into atlases and the JSON data.
"""
import math

# ------------------------------------------------------------------ size and pose
W, H = 104, 126  # the standing frame
CX = 52  # the ship's centre column; the base centre is (CX, H)
BASE = 102  # the row where the hull ends and the engines start
GROUND = H - 1  # the lowest row the fins and legs reach
FLIGHT_ANGLE = 66  # degrees clockwise from upright: 24 degrees above the horizontal, up and to the right
CANVAS = 320  # scratch size for the rotated pose, before it is cropped

R = {
    "white": ["gm3", "gm5", "gm6", "wh1", "wh2", "wh3"],
    "chrome": ["gm1", "gm2", "gm3", "gm4", "gm5", "gm6", "wh2"],
    "gun": ["ink", "gm1", "gm2", "gm3", "gm4", "gm5"],
    "red": ["rd0", "rd1", "rd2", "rd3", "rd4"],
    "amber": ["am0", "am1", "am2", "am3", "am4"],
    "cyan": ["cy0", "cy1", "cy2", "cy3", "cy4"],
    "tiles": ["ink", "gm0", "gm1", "gm2"],
}

PAINTS = {
    "pulp": {"hull": R["white"], "trim": R["red"], "rim": "cy2"},
    "steel": {"hull": R["chrome"], "trim": R["cyan"], "rim": "cy2"},
    "night": {"hull": R["gun"], "trim": R["amber"], "rim": "vi2"},
}

# chassis id -> the mockup preset; `engine` is the level-1 Engine's art (level 2 is the mockup's bell)
DESIGNS = {
    "scout": dict(core="ogive", sides="nacelles", fins="swept", engine="cluster", crown="mast", paint="pulp"),
    "hauler": dict(core="tiered", sides="quad", fins="buttress", engine="cluster", crown="none", paint="night"),
    "lancer": dict(core="needle", sides="nacelles", fins="delta", engine="twin", crown="none", paint="steel"),
}


def jround(v):
    """JavaScript's Math.round (halves go up), which the mockup's pixel placement relies on."""
    return math.floor(v + 0.5)


class Grid:
    """A grid of palette keys (None is clear) plus what the drawing records beside the pixels."""

    def __init__(self, w, h, lit=False):
        self.w, self.h, self.lit = w, h, lit
        self.g = [[None] * w for _ in range(h)]
        self.blink = []  # lamps: (x, y, on key, off key)
        self.nozzles = []  # exits: (x, y) in sprite pixels, y just below the nozzle's last row
        self.halo = []  # glow dither: (x, y, r, key)
        self.anchors = {}  # named effect points: (x, y) in sprite pixels, e.g. a Fuel Tank pod's vent
        self.clipped = 0  # pixels drawn outside the grid

    def px(self, x, y, k):
        x, y = jround(x), jround(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = k
        else:
            self.clipped += 1


def pick(ramp, l, x, y):
    """A ramp colour: clean bands, a checker only right at the band edge."""
    t = max(0, min(0.999, l)) * (len(ramp) - 1)
    i = math.floor(t)
    f = t - i
    if 0.4 < f < 0.6:
        return ramp[min(len(ramp) - 1, i + ((x + y) & 1))]
    return ramp[min(len(ramp) - 1, i + 1 if f >= 0.5 else i)]


def round_shade(u):
    """A round hull seen from the side, light from the upper left with a soft specular streak."""
    nz = math.sqrt(max(0, 1 - u * u))
    l = 0.12 + 0.88 * max(0, -0.55 * u + 0.83 * nz)
    if -0.62 < u < -0.4:
        l = min(1, l + 0.2)
    return l


def hull(s, cx, y0, y1, prof, ramp, rim=None, mat=None):
    """A body of revolution: prof(y) is its half-width at row y."""
    for y in range(y0, y1 + 1):
        w = prof(y)
        if w <= 0.35:
            if w > 0:
                s.px(cx - 0.5, y, ramp[len(ramp) - 2])
            continue
        for x in range(math.floor(cx - w), math.ceil(cx + w)):
            u = (x + 0.5 - cx) / w
            if abs(u) > 1:
                continue
            l, rp, key = round_shade(u), ramp, None
            if mat:
                m = mat(u, y, x)
                if m:
                    key = m.get("key", key)
                    rp = m.get("ramp", rp)
                    l += m.get("dl", 0)
            if not key:
                key = rim if rim and u > 0.8 else pick(rp, l, x, y)
            s.px(x, y, key)


def inside(pts, x, y):
    c = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def plate(s, pts, ramp, base):
    """A flat plate (fin, strut): beveled, lit on its top-left edges."""
    x0 = min(p[0] for p in pts)
    x1 = max(p[0] for p in pts)
    y0 = min(p[1] for p in pts)
    y1 = max(p[1] for p in pts)

    def inn(x, y):
        return inside(pts, x + 0.5, y + 0.5)

    for y in range(math.floor(y0), math.ceil(y1) + 1):
        for x in range(math.floor(x0), math.ceil(x1) + 1):
            if not inn(x, y):
                continue
            lv = base
            if not inn(x - 1, y) or not inn(x, y - 1):
                lv += 1
            elif not inn(x + 1, y) or not inn(x, y + 1):
                lv -= 1
            s.px(x, y, ramp[max(0, min(len(ramp) - 1, lv))])


def mirror(cx, pts):
    return [[2 * cx - x, y] for x, y in pts]


def line(s, x0, y0, x1, y1, k):
    n = max(abs(x1 - x0), abs(y1 - y0)) or 1
    for i in range(int(n) + 1):
        s.px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, k)


def disc(s, cx, cy, r, k):
    for y in range(math.floor(cy - r), math.floor(cy + r) + 1):
        for x in range(math.floor(cx - r), math.floor(cx + r) + 1):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                s.px(x, y, k)


def porthole(s, cx, cy):
    disc(s, cx, cy, 3, "gm3")
    disc(s, cx, cy, 2.1, "cy3" if s.lit else "cy1")
    s.px(cx - 1, cy - 1, "cy4" if s.lit else "cy2")
    if s.lit:
        s.halo.append((cx, cy, 4, "cy2"))


def nozzle(s, x, y, top, bot, h):
    plate(s, [[x - top, y], [x + top, y], [x + bot, y + h], [x - bot, y + h]], R["gun"], 2)
    line(s, x - bot + 1, y + h, x + bot - 1, y + h, "am1")
    s.nozzles.append((x, y + h + 1))


def lamp(s, x, y, on, off):
    s.px(x, y, off)
    s.blink.append((x, y, on, off))


def max_w(prof, y0, y1):
    return max(prof(y) for y in range(y0, y1 + 1))


# ------------------------------------------------------------------ cores: the silhouette
def core_ogive(s, P):
    def prof(y):
        if y < 10 or y > BASE:
            return 0
        t = (y - 10) / (BASE - 10)
        if t < 0.3:
            return 11 * math.sin((t / 0.3) * math.pi / 2) ** 0.85
        if t > 0.95:
            return 11 - (t - 0.95) * 50
        return 11 + 1.2 * math.sin(((t - 0.3) / 0.65) * math.pi)

    def mat(u, y, x):
        if 32 <= y <= 34 or 88 <= y <= 90:
            return {"ramp": P["trim"]}
        if y in (52, 76):
            return {"dl": -0.18}
        return None

    hull(s, CX, 10, BASE, prof, P["hull"], P["rim"], mat)
    line(s, CX, 2, CX, 10, "gm5")
    lamp(s, CX, 2, "rd3", "rd1")
    porthole(s, CX - 1, 45)
    porthole(s, CX - 1, 58)
    porthole(s, CX - 1, 69)
    return {"prof": prof, "top": 10}


def core_needle(s, P):
    def prof(y):
        if y < 2 or y > BASE:
            return 0
        t = (y - 2) / (BASE - 2)
        if t < 0.55:
            return 0.3 + (t / 0.55) * 4.9
        if t < 0.72:
            return 5.2 + ((t - 0.55) / 0.17) * 5.3
        return 10.5

    def mat(u, y, x):
        if 95 <= y <= 96:
            return {"key": P["trim"][4] if u < 0 else P["trim"][3]}
        if 15 <= y <= 18 and abs(u) < 0.55:
            return {"key": "cy4" if y == 15 else "cy3"}
        if u > 0.2:
            return {"ramp": R["tiles"], "dl": -0.3 if (x + (y >> 2)) % 4 == 0 or y % 4 == 0 else 0}
        if y in (36, 64, 82):
            return {"dl": -0.2}
        return None

    hull(s, CX, 2, BASE, prof, P["hull"], P["rim"], mat)
    if s.lit:
        s.halo.append((CX, 95, 13, P["trim"][1]))
    lamp(s, CX, 2, "rd3", "rd1")
    return {"prof": prof, "top": 2}


def core_tiered(s, P):
    def prof(y):
        if y < 4 or y > BASE:
            return 0
        if y < 20:
            return 0.4 + ((y - 4) / 16) * 3.2
        if y < 46:
            return 6 - max(0, 23 - y) * 0.8
        if y < 76:
            return 9 - max(0, 49 - y)
        return 12.5 - max(0, 79 - y)

    def mat(u, y, x):
        if y in (46, 76):
            return {"key": P["trim"][3] if u < 0.3 else P["trim"][1]}
        return None

    hull(s, CX, 4, BASE, prof, P["hull"], P["rim"], mat)
    slits = [
        (26, [-2, 1]), (32, [-2, 1]), (38, [-2, 1]),
        (53, [-5, -2, 1, 4]), (60, [-5, -2, 1, 4]), (67, [-5, -2, 1, 4]),
        (83, [-8, -5, -2, 1, 4, 7]), (89, [-8, -5, -2, 1, 4, 7]),
    ]
    for i, (y, xs) in enumerate(slits):
        for j, dx in enumerate(xs):
            on = s.lit and (i * 7 + j * 3) % 5 != 0
            s.px(CX + dx, y, "am3" if on else "gm1")
            s.px(CX + dx, y + 1, "am2" if on else "gm1")
    for y in range(92, BASE):
        for x in range(CX - 4, CX + 4):
            ay, ax = y - 96, x + 0.5 - CX
            if ay < 0 and (ax * ax) / 16 + (ay * ay) / 16 > 1:
                continue
            if s.lit:
                s.px(x, y, "am4" if y < 95 else "am3" if y < 98 else "am2")
            else:
                s.px(x, y, "am1" if y < 98 else "am0")
    if s.lit:
        s.halo.append((CX, 98, 7, "am1"))
    lamp(s, CX - 0.5, 4, "rd3", "rd1")
    return {"prof": prof, "top": 4}


CORES = {"ogive": core_ogive, "needle": core_needle, "tiered": core_tiered}


# ------------------------------------------------------------------ side propulsors: return their reach
def sides_nacelles(s, P, c):
    off = max_w(c["prof"], 58, 98) + 10

    def prof(y):
        if y < 60:
            return 3 + (y - 56) * 0.6
        if y > 92:
            return 5.4 - (y - 92) * 0.3
        return 5.4

    def mat(u, y, x):
        if y in (56, 57):
            return {"key": "cy4" if u < 0 else "cy3"}
        if y in (63, 89):
            return {"key": "cy3" if u < 0.2 else "cy2"}
        if y == 76:
            return {"dl": -0.2}
        return None

    for sd in (-1, 1):
        x = CX + sd * off
        plate(s, [[CX, 64], [x - sd * 2, 70], [x - sd * 2, 76], [CX, 76]], R["gun"], 3 if sd < 0 else 2)
        hull(s, x, 56, 96, prof, R["chrome"], "cy2" if sd > 0 else None, mat)
        if s.lit:
            s.halo.append((x, 57, 7, "cy1"))
        nozzle(s, x, 96, 4, 5, 5)
    return off + 5.5


def sides_quad(s, P, c):
    base = max_w(c["prof"], 60, BASE)

    def outer(y):
        return 2.8 * math.sin(((y - 70) / 6) * math.pi / 2) if y < 76 else 2.8

    def inner(y):
        return 3.2 * math.sin(((y - 56) / 7) * math.pi / 2) if y < 63 else 3.2

    for sd in (-1, 1):
        xi, xo = CX + sd * (base + 3.5), CX + sd * (base + 9.5)
        rim = P["rim"] if sd > 0 else None
        hull(s, xo, 70, 106, outer, P["hull"], rim, lambda u, y, x: {"ramp": P["trim"]} if y == 80 else None)
        nozzle(s, xo, 106, 2, 3, 4)
        hull(s, xi, 56, 104, inner, P["hull"], rim, lambda u, y, x: {"ramp": P["trim"]} if y in (66, 96) else None)
        nozzle(s, xi, 104, 2, 3, 5)
    return base + 12.5


SIDES = {"nacelles": sides_nacelles, "quad": sides_quad}


# ------------------------------------------------------------------ fins and legs
def fins_swept(s, P, o):
    ox = CX - o
    f = [[ox + 3, 72], [ox - 1, 74], [ox - 11, 98], [ox - 14, 120], [ox - 11, GROUND],
         [ox - 7, GROUND], [ox - 5, 112], [ox + 3, 104]]
    plate(s, f, P["trim"], 3)
    plate(s, mirror(CX, f), P["trim"], 1)
    lamp(s, ox - 13, 120, "am3", "am1")
    lamp(s, 2 * CX - ox + 13, 120, "cy4", "cy1")


def fins_delta(s, P, o):
    ox = CX - o
    f = [[ox + 3, 64], [ox - 1, 67], [ox - 15, 114], [ox - 15, GROUND], [ox - 9, GROUND], [ox + 2, 108]]
    plate(s, f, R["chrome"], 4)
    plate(s, mirror(CX, f), R["chrome"], 2)
    line(s, ox - 1, 68, ox - 14, 113, "cy3")
    line(s, 2 * CX - ox + 1, 68, 2 * CX - ox + 14, 113, "cy1")
    lamp(s, ox - 15, 115, "cy4", "cy1")
    lamp(s, 2 * CX - ox + 15, 115, "cy4", "cy1")


def fins_buttress(s, P, o):
    ox = CX - o
    f = [[ox + 3, 80], [ox - 2, 81], [ox - 14, 118], [ox - 14, GROUND], [ox - 8, GROUND], [ox + 3, 98]]
    plate(s, f, R["gun"], 4)
    plate(s, mirror(CX, f), R["gun"], 2)
    lamp(s, ox - 13, 121, "am3", "am0")
    lamp(s, 2 * CX - ox + 13, 121, "am3", "am0")


FINS = {"swept": fins_swept, "delta": fins_delta, "buttress": fins_buttress}


# ------------------------------------------------------------------ crowns
def crown_none(s, P, c):
    pass


def crown_mast(s, P, c):
    line(s, CX, 0, CX, c["top"], "gm4")
    line(s, CX - 3, c["top"] + 3, CX - 3, c["top"] - 4, "gm4")
    lamp(s, CX, 0, "rd3", "rd1")
    lamp(s, CX - 3, c["top"] - 4, "cy4", "cy1")


CROWNS = {"none": crown_none, "mast": crown_mast}


# ------------------------------------------------------------------ what Components know of their Chassis
class Ctx:
    """A ship's paint, its core (profile and top row) and how far its side propulsors reach."""

    def __init__(self, design):
        self.design = design
        self.P = PAINTS[design["paint"]]
        self.c = CORES[design["core"]](Grid(W, H), self.P)
        self.reach = SIDES[design["sides"]](Grid(W, H), self.P, self.c)

    def core_w(self, y0, y1):
        return max_w(self.c["prof"], y0, y1)


def side_x(sd, dx):
    """The column `dx` out from the centre on side `sd` (-1 left, 1 right)."""
    return CX + sd * dx


def side_pts(sd, pts):
    """Points drawn for the right side, placed on side `sd` (mirrored about the centre for the left)."""
    return [[CX + sd * (x - CX), y] for x, y in pts]


def strap(s, sd, inner, outer, y, rows=2):
    """A gunmetal strap from `inner` to `outer` columns out from the centre, `rows` tall."""
    a, b = side_x(sd, inner), side_x(sd, outer)
    plate(s, [[min(a, b), y], [max(a, b), y], [max(a, b), y + rows], [min(a, b), y + rows]], R["gun"], 2)


# ------------------------------------------------------------------ Component art: Engine
def engine_tail(s, x, level):
    """The main engine at the tail: the preset's cluster or twin at level 1, the mockup's single bell at level 2."""
    if level == 2:
        nozzle(s, CX, BASE, 6, 9, 7)
    elif x.design["engine"] == "twin":
        nozzle(s, CX - 5, BASE, 3, 4, 6)
        nozzle(s, CX + 5, BASE, 3, 4, 6)
    else:
        for dx in (-7, 0, 7):
            nozzle(s, CX + dx, BASE, 2, 3, 5)


def engine_side(s, x, mount, level):
    """An extra Engine: a gunmetal booster pod strapped low on the core, alternating sides, then a row higher."""
    sd = -1 if mount % 2 else 1
    tier = (mount - 1) // 2
    y1 = 98 - 16 * tier
    y0 = y1 - 12
    r = 2.5 if level == 1 else 3.2
    core = x.core_w(y0, y1)
    xc = side_x(sd, core + r + 0.5)

    def prof(y):
        d = y - y0 + 0.5
        return r * math.sqrt(max(0, 1 - (1 - d / r) ** 2)) if d < r else r

    strap(s, sd, core - 1, core + r, y0 + 4)
    hull(s, xc, y0, y1 - 1, prof, R["gun"], x.P["rim"] if sd > 0 else None,
         lambda u, y, _x: {"ramp": x.P["trim"]} if y == y0 + 3 else None)
    if level == 1:
        nozzle(s, xc, y1, 1.5, 2.5, 4)
    else:
        nozzle(s, xc, y1, 2, 3.5, 5)


def engine_art(s, x, mount, level):
    if mount == 0:
        engine_tail(s, x, level)
    else:
        engine_side(s, x, mount, level)


# ------------------------------------------------------------------ Component art: Fuel Tank
# (side, centre row, column out): pods stack up the core above the side propulsors, alternating
# sides; the fifth starts a second column outside the first.
TANK_MOUNTS = [(1, 44, 0), (-1, 44, 0), (1, 20, 0), (-1, 20, 0), (1, 44, 1)]
TANK_R = 4


def fuel_tank_art(s, x, mount, level):
    """A capsule pod in the Chassis's paint: trim band, rim light, a lamp, two straps. Level 2 is longer."""
    sd, yc, col = TANK_MOUNTS[mount]
    half = 8 if level == 1 else 11
    y0, y1 = yc - half, yc + half - 1
    core = x.core_w(y0, y1)
    out = core + TANK_R + 1 + col * (2 * TANK_R + 3)
    xc = side_x(sd, out)

    def prof(y):
        d = min(y - y0, y1 - y) + 0.5
        return TANK_R * math.sqrt(max(0, 1 - (1 - d / TANK_R) ** 2)) if d < TANK_R else TANK_R

    bands = (yc - 1, yc) if level == 1 else (yc - 5, yc - 4, yc + 3, yc + 4)

    def mat(u, y, _x):
        return {"ramp": x.P["trim"]} if y in bands else None

    for yy in (y0 + 3, y1 - 4):
        strap(s, sd, core - 1, out, yy)
    hull(s, xc, y0, y1, prof, x.P["hull"], x.P["rim"] if sd > 0 else None, mat)
    lamp(s, xc - 0.5, y0 + 2, "am3", "am1")
    s.anchors["vent"] = (xc, y0 - 1)


# ------------------------------------------------------------------ Component art: Drill
def drill_art(s, x, mount, level):
    """The mockup's drill arm: a strut out from the core, an amber shaft down (it reads on every paint),
    a banded steel bit. Level 2 has a longer bit; level 3 a longer, wider bit on a thicker shaft."""
    sd = 1 if mount % 2 == 0 else -1
    tier = mount // 2
    ya = 82 - 22 * tier
    w = x.c["prof"](ya + 2)
    shaft = w + 5 + 6 * tier
    plate(s, side_pts(sd, [[CX + w - 2, ya], [CX + shaft + 1, ya], [CX + shaft + 1, ya + 3], [CX + w - 2, ya + 3]]),
          R["gun"], 3)
    ex = 1 if level == 3 else 0  # level 3: a thicker shaft and a wider, longer bit
    plate(s, side_pts(sd, [[CX + shaft - 1 - ex, ya + 3], [CX + shaft + 2 + ex, ya + 3],
                           [CX + shaft + 2 + ex, ya + 24], [CX + shaft - 1 - ex, ya + 24]]), R["amber"], 2)
    bit = {1: 8, 2: 12, 3: 18}[level]
    mid = side_x(sd, shaft + 0.5)
    for k in range(bit):
        hw = max(0, 2.5 + 2 * ex - k * (2.8 + 2 * ex) / bit)
        line(s, mid - hw, ya + 25 + k, mid + hw, ya + 25 + k, "wh2" if k % 2 else "gm4")


# ------------------------------------------------------------------ Component art: Radar
RADAR_ROWS = [30, 30, 46, 46, 14]  # rows below the core's top, per mount


def radar_art(s, x, mount, level):
    """The mockup's dish on a boom; the first on the left, as the mockup draws it. Level 2 has a bigger dish."""
    sd = -1 if mount % 2 == 0 else 1
    y = x.c["top"] + RADAR_ROWS[mount]
    w = x.c["prof"](y)
    bx = side_x(sd, w + 6)
    line(s, side_x(sd, w), y, bx, y - 2, "gm4")
    k = 1 if level == 1 else 1.4
    dish = [[-5, -9], [-1, -7], [2, -2], [-2, -1], [-6, -5]]
    plate(s, [[bx - sd * dx * k, y + dy * k] for dx, dy in dish], R["white"], 3 if sd < 0 else 2)
    lamp(s, bx + sd * 2 * k, y - 5 * k, "cy4", "cy2")


# ------------------------------------------------------------------ Component art: Jump Drive
def ring(s, x, back):
    """The mockup's violet ring round the core: its far half behind the Chassis art, its near half in front."""
    y = 52
    rx, ry = x.c["prof"](y) + 7, 3.2
    for i in range(629):  # the mockup steps the angle by 0.01 rad
        a = i * 0.01
        px, py = CX + rx * math.cos(a), y + ry * math.sin(a)
        if (math.sin(a) < 0) == back:
            s.px(px, py, "vi2" if back else ("vi4" if math.cos(a) < 0 else "vi3"))
            s.px(px, py + 1, "vi1" if back else "vi2")
    if not back and s.lit:
        s.halo += [(CX - rx, y, 4, "vi1"), (CX + rx, y, 4, "vi1")]


def ring_back(s, x, mount, level):
    ring(s, x, True)


def ring_front(s, x, mount, level):
    ring(s, x, False)


# ------------------------------------------------------------------ the catalogue of art
MOUNTS = 5  # mount points per Component kind: Slots - 1 at the most Slots a Chassis has (6)

# kind -> (mount points, {layer: draw(s, ctx, mount, level)}). A `back` layer draws behind the
# Chassis art, a `front` one in front of it.
KINDS = {
    "engine": (MOUNTS, {"front": engine_art}),
    "fuel-tank": (MOUNTS, {"front": fuel_tank_art}),
    "drill": (MOUNTS, {"front": drill_art}),
    "radar": (MOUNTS, {"front": radar_art}),
    "jump-drive": (1, {"back": ring_back, "front": ring_front}),
}

# Component id -> (kind, level). The ids are the game's (`src/game/sim/catalogue.ts`); the Radar's
# (#191) are drawn ahead of it, so its art is ready when its Component lands.
ART = {
    "engine-1": ("engine", 1),
    "engine-2": ("engine", 2),
    "fuel-tank-1": ("fuel-tank", 1),
    "fuel-tank-2": ("fuel-tank", 2),
    "drill-1": ("drill", 1),
    "drill-2": ("drill", 2),
    "drill-3": ("drill", 3),
    "radar-1": ("radar", 1),
    "radar-2": ("radar", 2),
    "jump-drive": ("jump-drive", 1),
}
STANDING = ("landed", "landed_lit")
FRAMES = ("landed", "landed_lit", "flight")


# ------------------------------------------------------------------ finishing: lamps, outline, glow
def outline(g, mask=None):
    """A 1px `void` outline on every empty cell next to a filled one, except on cells `mask` (the
    Chassis art) fills, so a Component joins the hull as the one drawing did."""
    h, w = len(g), len(g[0])
    out = [row[:] for row in g]
    ys = [y for y, row in enumerate(g) if any(row)]
    if not ys:
        return out
    xs = [x for x in range(w) if any(g[y][x] for y in ys)]
    for y in range(max(0, ys[0] - 1), min(h, ys[-1] + 2)):
        for x in range(max(0, xs[0] - 1), min(w, xs[-1] + 2)):
            if g[y][x] or (mask and mask[y][x]):
                continue
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h and g[ny][nx]:
                    out[y][x] = "void"
                    break
    return out


def add_halos(g, halos, mask=None):
    """The dithered glow around lit parts, only on cells still empty (and clear of `mask`)."""
    h, w = len(g), len(g[0])
    for hx, hy, r, k in halos:
        for y in range(math.floor(hy - r), math.floor(hy + r) + 1):
            for x in range(math.floor(hx - r), math.floor(hx + r) + 1):
                if x < 0 or y < 0 or x >= w or y >= h or g[y][x] or (mask and mask[y][x]):
                    continue
                d = math.hypot(x - hx, y - hy)
                if r * 0.4 < d <= r and (x + y) % 2 == 0:
                    g[y][x] = k


def rotate_cw(vx, vy, deg):
    """A vector turned clockwise on screen (x right, y down) by `deg`."""
    a = math.radians(deg)
    return vx * math.cos(a) - vy * math.sin(a), vx * math.sin(a) + vy * math.cos(a)


PIVOT = CANVAS // 2  # the base centre on the scratch canvas of the flight pose


def _turn_map():
    """For every scratch-canvas cell of the flight pose, the standing cell it comes from (the inverse turn)."""
    a = math.radians(FLIGHT_ANGLE)
    ca, sa = math.cos(a), math.sin(a)
    out = []
    for dy in range(CANVAS):
        for dx in range(CANVAS):
            vx, vy = dx + 0.5 - PIVOT, dy + 0.5 - PIVOT
            ix, iy = math.floor(vx * ca + vy * sa + CX), math.floor(-vx * sa + vy * ca + H)
            if 0 <= ix < W and 0 <= iy < H:
                out.append((dy, dx, iy, ix))
    return out


TURN_MAP = _turn_map()


def turn_grid(g):
    """A standing W x H grid turned FLIGHT_ANGLE clockwise about the base centre, on the scratch canvas."""
    big = [[None] * CANVAS for _ in range(CANVAS)]
    for dy, dx, iy, ix in TURN_MAP:
        big[dy][dx] = g[iy][ix]
    return big


def bbox(*grids):
    ys = [y for g in grids for y, row in enumerate(g) if any(row)]
    xs = [x for g in grids for row in g if any(row) for x, k in enumerate(row) if k]
    if not ys:
        raise ValueError("an empty piece of art")
    return min(xs), min(ys), max(xs), max(ys)


class Img:
    """A cropped piece of art: its palette grid and where its top-left sits from the base centre."""

    def __init__(self, grid, x, y):
        self.grid, self.x, self.y = grid, x, y
        self.h, self.w = len(grid), len(grid[0])


def crop(g, box, px, py):
    x0, y0, x1, y1 = box
    return Img([row[x0:x1 + 1] for row in g[y0:y1 + 1]], x0 - px, y0 - py)


def lamps_on(s, on):
    for x, y, k_on, k_off in s.blink:
        s.px(x, y, k_on if on else k_off)


class Piece:
    """One piece of the drawn Spacecraft: the Chassis art, or one layer of one Component's art at one
    mount point. `imgs` holds its art per frame; `meta` its nozzle exits, lamps and anchors per pose."""

    def __init__(self, name, component, mount, layer, imgs, meta):
        self.name, self.component, self.mount, self.layer = name, component, mount, layer
        self.imgs, self.meta = imgs, meta


def points(pts, deg):
    """Points in pixels from the base centre, turned `deg` clockwise."""
    out = []
    for x, y in pts:
        vx, vy = rotate_cw(x - CX, y - H, deg)
        out.append((round(vx, 2), round(vy, 2)))
    return out


def finish(draw, mask, mask_turned):
    """A piece from `draw(lit)` (which returns its Grid): standing frames, lamps off and on, cropped
    alike; the lit flight frame turned FLIGHT_ANGLE about the base centre; and its data per pose."""
    standing = {}
    for name in STANDING:
        s = draw(name == "landed_lit")
        lamps_on(s, s.lit)
        g = outline(s.g, mask)
        if s.lit:
            add_halos(g, s.halo, mask)
        standing[name] = g
    box = bbox(*standing.values())
    imgs = {name: crop(g, box, CX, H) for name, g in standing.items()}
    s = draw(True)
    lamps_on(s, True)
    big = outline(turn_grid(s.g), mask_turned)
    halos = []
    for hx, hy, r, k in s.halo:
        vx, vy = rotate_cw(hx - CX, hy - H, FLIGHT_ANGLE)
        halos.append((PIVOT + vx, PIVOT + vy, r, k))
    add_halos(big, halos, mask_turned)
    box = bbox(big)
    if box[0] == 0 or box[1] == 0 or box[2] == CANVAS - 1 or box[3] == CANVAS - 1:
        raise ValueError("the flight pose does not fit the scratch canvas")
    imgs["flight"] = crop(big, box, PIVOT, PIVOT)
    lamp_px = [(jround(x) + 0.5, jround(y) + 0.5) for x, y, _, _ in s.blink]
    meta = {}
    for pose, deg in (("standing", 0), ("flight", FLIGHT_ANGLE)):
        meta[pose] = {
            "nozzles": points(s.nozzles, deg),
            "lamps": points(lamp_px, deg),
            "anchors": {k: points([v], deg)[0] for k, v in s.anchors.items()},
        }
    return imgs, meta


# ------------------------------------------------------------------ one ship
def draw_chassis(design, lit):
    """The Chassis art on a W x H grid, before its outline: fins, side propulsors, core and crown,
    back to front as the mockup builds them. No Components: those are drawn piece by piece."""
    s = Grid(W, H, lit)
    x = Ctx(design)
    FINS[design["fins"]](s, x.P, x.reach)
    SIDES[design["sides"]](s, x.P, x.c)
    CORES[design["core"]](s, x.P)
    CROWNS[design["crown"]](s, x.P, x.c)
    if s.clipped:
        raise ValueError(f"{design}: {s.clipped} pixels fall outside the {W}x{H} frame")
    return s


def draw_piece(ctx, kind, level, mount, layer, lit):
    s = Grid(W, H, lit)
    KINDS[kind][1][layer](s, ctx, mount, level)
    if s.clipped:
        raise ValueError(f"{kind} level {level} at mount {mount}: {s.clipped} pixels fall outside the frame")
    return s


def solid(g):
    return [[k is not None for k in row] for row in g]


def build_ship(design):
    """Every piece of one ship, Chassis art first, then each Component's art at each mount point."""
    ctx = Ctx(design)
    chassis = draw_chassis(design, True)
    mask = solid(chassis.g)
    mask_turned = solid(turn_grid(chassis.g))
    imgs, meta = finish(lambda lit: draw_chassis(design, lit), None, None)
    pieces = [Piece("chassis", None, None, None, imgs, meta)]
    for cid, (kind, level) in ART.items():
        mounts, layers = KINDS[kind]
        for mount in range(mounts):
            for layer in layers:
                def draw(lit, k=kind, lv=level, m=mount, ly=layer):
                    return draw_piece(ctx, k, lv, m, ly, lit)

                imgs, meta = finish(draw, mask, mask_turned)
                pieces.append(Piece(f"{cid}.{mount}.{layer}", cid, mount, layer, imgs, meta))
    return pieces


def frame_boxes(pieces):
    """The whole Spacecraft's box per frame, with any Components at any mount points: (w, h, pivot).
    Standing, it is the W x H frame every piece must fit; in flight, the box round every piece."""
    boxes = {}
    for name in FRAMES:
        x0 = min(p.imgs[name].x for p in pieces)
        y0 = min(p.imgs[name].y for p in pieces)
        x1 = max(p.imgs[name].x + p.imgs[name].w for p in pieces)
        y1 = max(p.imgs[name].y + p.imgs[name].h for p in pieces)
        if name in STANDING:
            if x0 < -CX or x1 > W - CX or y0 < -H or y1 > 0:
                raise ValueError("a piece falls outside the standing frame")
            x0, y0, x1, y1 = -CX, -H, W - CX, 0
        boxes[name] = (x1 - x0, y1 - y0, (-x0, -y0))
    return boxes


def build_ships():
    """{chassis id: {'pieces': [Piece], 'frames': {frame: (w, h, pivot)}}}."""
    out = {}
    for cid, design in DESIGNS.items():
        pieces = build_ship(design)
        chassis = pieces[0].imgs["landed"]
        if chassis.y + chassis.h != 0:
            raise ValueError(f"{cid}: the Chassis art's lowest row is not on the base line")
        out[cid] = {"pieces": pieces, "frames": frame_boxes(pieces)}
    return out


def frame_name(piece, frame):
    """The piece's frame in its Chassis's atlas: `chassis.landed`, `fuel-tank-1.0.front.flight`."""
    return f"{piece.name}.{frame}"


def art_data(ships):
    """The data the game imports (`src/game/assets/chassisArt.json`): per Chassis, the whole
    Spacecraft's box per frame, then the Chassis art and every Component art at every mount point,
    each with its rectangle from the base centre, its nozzle exits, lamps and anchors, per pose."""
    def pt(p):
        return {"x": p[0], "y": p[1]}

    def pose(piece, frame, name):
        img = piece.imgs[frame]
        m = piece.meta[name]
        return {
            "rect": {"x": img.x, "y": img.y, "w": img.w, "h": img.h},
            "nozzles": [pt(p) for p in m["nozzles"]],
            "lamps": [pt(p) for p in m["lamps"]],
            "anchors": {k: pt(v) for k, v in m["anchors"].items()},
        }

    def poses(piece):
        return {"standing": pose(piece, "landed", "standing"), "flight": pose(piece, "flight", "flight")}

    chassis = {}
    for cid, ship in ships.items():
        pieces = ship["pieces"]
        art = {}
        for p in pieces[1:]:
            mounts = art.setdefault(p.component, [])
            if len(mounts) <= p.mount:
                mounts.append({})
            mounts[p.mount][p.layer] = poses(p)
        chassis[cid] = {
            "frames": {name: {"w": w, "h": h, "pivot": pt(pv)} for name, (w, h, pv) in ship["frames"].items()},
            "chassis": poses(pieces[0]),
            "components": art,
        }
    return {
        "flightAngle": FLIGHT_ANGLE,
        "mounts": {kind: mounts for kind, (mounts, _) in KINDS.items()},
        "chassis": chassis,
    }
