"""Interim upright Chassis art (ticket #135), ported from the shipwright mockup.

AI-generated pixel art (see AI-USAGE.md). The drawing code is a Python port of the AI-written
mockup `docs/design/shipwright-bench.html` (cores, side propulsors, fins, main engines, crowns,
paints): only the parts the three starting Chassis use are ported, and no Components are drawn.

    scout   Herald Mk II  Ogive  . Nacelles      . Swept fins    . Cluster . Antenna mast . Pulp
    hauler  Bastion       Tiered . Quad boosters . Buttress legs . Cluster . none         . Night
    lancer  Lancer        Needle . Nacelles      . Delta fins    . Twin    . none         . Steel

Every ship is drawn on a 104x126 grid with the centre of its base at (52, 126): the lowest row is
the fin or leg tips, so the art rests on the base line. Three poses:

    landed      standing, lamps and windows off
    landed_lit  standing, lamps, windows and engine glow on
    flight      the same ship turned FLIGHT_ANGLE degrees clockwise about the base centre, so the nose
                points up and to the right along the Transfer, cropped to its own bounding box

The nozzle exits (main engine and side propulsors) of the standing and the flight pose are returned
as data, in pixels from the base centre (x right, y down), for the game to import.

This module has no dependencies; `gen_sprites.py` turns its frames into atlases and the JSON data.
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

# chassis id -> the mockup preset (Components left off)
DESIGNS = {
    "scout": dict(core="ogive", sides="nacelles", fins="swept", engine="cluster", crown="mast", paint="pulp"),
    "hauler": dict(core="tiered", sides="quad", fins="buttress", engine="cluster", crown="none", paint="night"),
    "lancer": dict(core="needle", sides="nacelles", fins="delta", engine="twin", crown="none", paint="steel"),
}
# how many nozzles each main engine has
ENGINE_NOZZLES = {"cluster": 3, "twin": 2}


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


# ------------------------------------------------------------------ main engines and crowns
def engine_twin(s, P):
    nozzle(s, CX - 5, BASE, 3, 4, 6)
    nozzle(s, CX + 5, BASE, 3, 4, 6)


def engine_cluster(s, P):
    for dx in (-7, 0, 7):
        nozzle(s, CX + dx, BASE, 2, 3, 5)


ENGINES = {"twin": engine_twin, "cluster": engine_cluster}


def crown_none(s, P, c):
    pass


def crown_mast(s, P, c):
    line(s, CX, 0, CX, c["top"], "gm4")
    line(s, CX - 3, c["top"] + 3, CX - 3, c["top"] - 4, "gm4")
    lamp(s, CX, 0, "rd3", "rd1")
    lamp(s, CX - 3, c["top"] - 4, "cy4", "cy1")


CROWNS = {"none": crown_none, "mast": crown_mast}


# ------------------------------------------------------------------ one ship
def draw_ship(design, lit):
    """The ship on a W x H grid, before its outline: back to front, as the mockup builds it."""
    s = Grid(W, H, lit)
    P = PAINTS[design["paint"]]
    c = CORES[design["core"]](Grid(W, H, lit), P)  # the core decides how far the side parts reach
    reach = SIDES[design["sides"]](Grid(W, H, lit), P, c)
    FINS[design["fins"]](s, P, reach)
    SIDES[design["sides"]](s, P, c)
    CORES[design["core"]](s, P)
    CROWNS[design["crown"]](s, P, c)
    ENGINES[design["engine"]](s, P)
    if s.clipped:
        raise ValueError(f"{design}: {s.clipped} pixels fall outside the {W}x{H} frame")
    return s


def outline(g):
    """A 1px `void` outline on every empty cell next to a filled one."""
    h, w = len(g), len(g[0])
    out = [row[:] for row in g]
    for y in range(h):
        for x in range(w):
            if g[y][x]:
                continue
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h and g[ny][nx]:
                    out[y][x] = "void"
                    break
    return out


def add_halos(g, halos):
    """The dithered glow around lit parts, only on cells still empty."""
    h, w = len(g), len(g[0])
    for hx, hy, r, k in halos:
        for y in range(math.floor(hy - r), math.floor(hy + r) + 1):
            for x in range(math.floor(hx - r), math.floor(hx + r) + 1):
                if x < 0 or y < 0 or x >= w or y >= h or g[y][x]:
                    continue
                d = math.hypot(x - hx, y - hy)
                if r * 0.4 < d <= r and (x + y) % 2 == 0:
                    g[y][x] = k


def rotate_cw(vx, vy, deg):
    """A vector turned clockwise on screen (x right, y down) by `deg`."""
    a = math.radians(deg)
    return vx * math.cos(a) - vy * math.sin(a), vx * math.sin(a) + vy * math.cos(a)


class Frame:
    """One finished frame: its palette grid, where the base centre sits in it, and its nozzle exits."""

    def __init__(self, grid, pivot, nozzles):
        self.grid, self.pivot, self.nozzles = grid, pivot, nozzles
        self.h, self.w = len(grid), len(grid[0])


def exits(s, deg=0):
    """Nozzle exits in pixels from the base centre, turned `deg` clockwise."""
    out = []
    for x, y in s.nozzles:
        vx, vy = rotate_cw(x - CX, y - H, deg)
        out.append((round(vx, 2), round(vy, 2)))
    return out


def standing_frame(design, lit):
    s = draw_ship(design, lit)
    for x, y, on, off in s.blink:
        s.px(x, y, on if lit else off)
    g = outline(s.g)
    if lit:
        add_halos(g, s.halo)
    return Frame(g, (CX, H), exits(s))


def flight_frame(design):
    """The lit ship turned FLIGHT_ANGLE clockwise about the base centre, cropped to what it covers."""
    s = draw_ship(design, True)
    for x, y, on, off in s.blink:
        s.px(x, y, on)
    px_, py_ = CANVAS // 2, CANVAS // 2
    a = math.radians(FLIGHT_ANGLE)
    ca, sa = math.cos(a), math.sin(a)
    big = [[None] * CANVAS for _ in range(CANVAS)]
    for dy in range(CANVAS):
        for dx in range(CANVAS):
            vx, vy = dx + 0.5 - px_, dy + 0.5 - py_
            sx, sy = vx * ca + vy * sa + CX, -vx * sa + vy * ca + H  # the inverse turn: where this cell came from
            ix, iy = math.floor(sx), math.floor(sy)
            if 0 <= ix < W and 0 <= iy < H:
                big[dy][dx] = s.g[iy][ix]
    big = outline(big)
    halos = []
    for hx, hy, r, k in s.halo:
        vx, vy = rotate_cw(hx - CX, hy - H, FLIGHT_ANGLE)
        halos.append((px_ + vx, py_ + vy, r, k))
    add_halos(big, halos)
    ys = [y for y, row in enumerate(big) if any(row)]
    xs = [x for x in range(CANVAS) if any(row[x] for row in big)]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    if x0 == 0 or y0 == 0 or x1 == CANVAS - 1 or y1 == CANVAS - 1:
        raise ValueError("the flight pose does not fit the scratch canvas")
    crop = [row[x0:x1 + 1] for row in big[y0:y1 + 1]]
    return Frame(crop, (px_ - x0, py_ - y0), exits(s, FLIGHT_ANGLE))


def build_ships():
    """{chassis id: {'landed': Frame, 'landed_lit': Frame, 'flight': Frame, 'main': nozzle count}}."""
    out = {}
    for cid, design in DESIGNS.items():
        ship = {
            "landed": standing_frame(design, False),
            "landed_lit": standing_frame(design, True),
            "flight": flight_frame(design),
            "main": ENGINE_NOZZLES[design["engine"]],
        }
        low = max(y for y, row in enumerate(ship["landed"].grid) if any(row))
        if low != H - 1:
            raise ValueError(f"{cid}: the art's lowest row is {low}, not the base line {H - 1}")
        out[cid] = ship
    return out


def art_data(ships):
    """The data the game imports: frame sizes, base-centre pivots, and nozzle exits per pose.

    The drawing puts the side propulsors first and the main engine last."""
    chassis = {}
    for cid, ship in ships.items():
        def nozzles(frame):
            at = [{"x": x, "y": y} for x, y in frame.nozzles]
            return {"side": at[:-ship["main"]], "main": at[-ship["main"]:]}

        chassis[cid] = {
            "frames": {
                name: {"w": ship[name].w, "h": ship[name].h,
                       "pivot": {"x": ship[name].pivot[0], "y": ship[name].pivot[1]}}
                for name in ("landed", "landed_lit", "flight")
            },
            "nozzles": {"standing": nozzles(ship["landed"]), "flight": nozzles(ship["flight"])},
        }
    return {"flightAngle": FLIGHT_ANGLE, "chassis": chassis}
