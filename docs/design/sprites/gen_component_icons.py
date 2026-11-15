"""Heliopause Component icons: Engine, Fuel Tank, Drill, Radar, Jump Drive, 16x16 each.

AI-generated pixel art (see AI-USAGE.md): the game shows a visible "AI-generated art"
watermark wherever these sprites appear. Only kit palette colours are used (the table
comes from `gen_sprites.py` beside this file). Light comes from the top-left. Gunmetal
bodies, cyan for the interactive parts, amber for Fuel, violet for the Jump Drive. The
shapes and meanings match the code-drawn stand-ins in `src/ui/componentIcons/componentIconSet.ts`,
which the preview sheet shows beside each icon (it reads the stand-in grids from that file).

  comp_engine  comp_fuel_tank  comp_drill  comp_radar  comp_jump_drive   16x16 each, transparent

Usage:  python3 -I gen_component_icons.py <out_dir> [preview_png]
Needs Pillow and numpy.
"""
import importlib.util
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# `python3 -I` leaves the script's folder off the import path, so load the helpers by file.
_spec = importlib.util.spec_from_file_location("gen_sprites", Path(__file__).with_name("gen_sprites.py"))
GS = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(GS)
Spr, col = GS.Spr, GS.col

SIZE = 16
STANDINS = Path(__file__).resolve().parents[3] / "src/ui/componentIcons/componentIconSet.ts"

# One character per pixel; '.' is clear.
LEGEND = {
    "o": "gm2",  # outline
    "s": "gm3",  # shadow side of the metal
    "g": "gm4",  # metal
    "h": "gm6",  # highlight
    "c": "cy3",  # cyan
    "d": "cy1",  # dark cyan
    "e": "cy4",  # cyan glint
    "a": "am3",  # amber
    "b": "am1",  # dark amber
    "w": "am4",  # flame core
    "v": "vi3",  # jump violet
    "u": "vi1",  # dark violet
    "k": "vi4",  # violet glint
}

ICONS = {
    # Bell nozzle over a gunmetal thruster body, a cyan control collar, amber flame below.
    "engine": [
        "................",
        ".....oooooo.....",
        "....ohhgggso....",
        "....ohgggggo....",
        ".....ogggso.....",
        "....oooooooo....",
        "...ohgccccgsso..",
        "...ohgddddgsso..",
        "..ohggggggggsso.",
        "..ohgggggggggso.",
        ".oohggggggggssoo",
        ".oabbbbbbbbbbao.",
        "..aaawwwwwwaaa..",
        "...baawwwwaab...",
        "....bbawwabb....",
        ".....bbaabb.....",
    ],
    # Rounded gunmetal cylinder, two bands, an amber Fuel window.
    "fuel-tank": [
        "................",
        ".....oooooo.....",
        "....ohhgggso....",
        "...ohhgggggso...",
        "...ohgggggggo...",
        "..oooooooooooo..",
        "..ohgggggggsso..",
        "..ohgggaagggso..",
        "..ohggaaaaggbo..",
        "..ohggaaaaggbo..",
        "..ohgggaagggso..",
        "..ohgggggggsso..",
        "..oooooooooooo..",
        "...ohggggggsso..",
        "....oooooooo....",
        "................",
    ],
    # A drill bit over a cyan-lit housing and a gunmetal mast.
    "drill": [
        "................",
        ".......oo.......",
        "......ohgo......",
        ".....ohggo......",
        "......oggso.....",
        ".....ohggo......",
        "......oggso.....",
        "..oooooggooooo..",
        "..ohgeccccggso..",
        "..ohgccccddgso..",
        "..oooooooooooo..",
        ".....ohggso.....",
        "......ogo.......",
        "......ogo.......",
        ".......o........",
        "................",
    ],
    # A gunmetal dish with a cyan signal arc and a base.
    "radar": [
        "................",
        "..cc........cc..",
        ".c..c......c..c.",
        ".c.cc.cccc.cc.c.",
        ".c.c........c.c.",
        "..c..oooooo..c..",
        ".....ohhggo.....",
        "......ogso......",
        ".......oo.......",
        "....oooooooo....",
        "...ohggggggso...",
        "...ohgddddgso...",
        "...ohggggggso...",
        "...oooooooooo...",
        "................",
        "................",
    ],
    # A violet ring round a dark core, with cyan sparks at the sides.
    "jump-drive": [
        "................",
        ".......vv.......",
        ".....vvkuvv.....",
        "....vkuccuuv....",
        "...vuccvvccuv...",
        "...vucvooovuv...",
        "..vuucvooovuuv..",
        "..vuucvooovuuv..",
        "...vucvooovuv...",
        "...vuccvvccuv...",
        "....vuuccuuv....",
        ".....vvuuvv.....",
        ".......vv.......",
        "................",
        "................",
        "................",
    ],
}
KINDS = ["engine", "fuel-tank", "drill", "radar", "jump-drive"]


def key_of(kind):
    return "comp_" + kind.replace("-", "_")


def build_icon(kind):
    rows = ICONS[kind]
    assert len(rows) == SIZE and all(len(r) == SIZE for r in rows), kind
    spr = Spr(SIZE, SIZE)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                spr.px(x, y, LEGEND[ch])
    return spr


def standin(kind):
    """The stand-in's pixels, parsed from the TS source so the preview never drifts from it."""
    src = STANDINS.read_text()
    legend = dict(re.findall(r"^\s+(\w): '(\w+)',", src.split("const LEGEND")[1].split("};")[0], re.M))
    block = src.split("const PIXELS")[1]
    name = f"'{kind}'" if "-" in kind else kind
    rows = re.search(re.escape(name) + r": \[(.*?)\]", block, re.S).group(1)
    grid = re.findall(r"'([.\w]{16})'", rows)
    spr = Spr(SIZE, SIZE)
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch in legend:
                spr.px(x, y, legend[ch])
    return spr


def preview(icons, path, scale=4):
    pad, cell = 16, 16 * scale
    step = cell + 6 + SIZE + 14
    width = pad * 2 + len(KINDS) * (step * 2 + 14)
    sheet = Image.new("RGBA", (width, pad * 4 + cell + 40), col("void"))
    d = ImageDraw.Draw(sheet)
    d.text((pad, pad), "Component icons: final art then code stand-in, each at 4x and 1x", fill=col("wh1"))
    x, y = pad, pad * 3
    for kind in KINDS:
        d.text((x, y - 14), key_of(kind), fill=col("wh1"))
        for spr in (icons[kind], standin(kind)):
            img = spr.image()
            sheet.alpha_composite(img.resize((cell, cell), Image.NEAREST), (x, y))
            sheet.alpha_composite(img, (x + cell + 6, y + cell - SIZE))
            x += step
        x += 14
    d.text((pad, sheet.height - 22), "HELIOPAUSE Component icons  -  AI-generated art", fill=col("cy3"))
    sheet.save(path)


if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    icons = {kind: build_icon(kind) for kind in KINDS}
    for kind, spr in icons.items():
        spr.image().save(out / f"{key_of(kind)}.png")
    if len(sys.argv) > 2:
        preview(icons, sys.argv[2])
    print("\n".join(f"{key_of(k)} {s.w}x{s.h}" for k, s in icons.items()))
