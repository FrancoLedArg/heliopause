"""Heliopause blueprint lock icons (#332): a padlock, closed and open, 16x16 each, transparent.

AI-generated pixel art (see AI-USAGE.md): the game shows a visible "AI-generated art" watermark
wherever these appear. Only kit palette colours (the table in `gen_sprites.py` beside this file).
Gunmetal shackle and body, an amber keyhole. Light comes from the top-left.

  ui_lock  ui_lock_open

Usage:  python3 gen_lock_icon.py <out_dir>
Needs Pillow and numpy.
"""
import importlib.util
import sys
from pathlib import Path

_spec = importlib.util.spec_from_file_location("gen_sprites", Path(__file__).with_name("gen_sprites.py"))
GS = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(GS)

LEGEND = {"o": "gm1", "s": "gm3", "g": "gm4", "h": "gm6", "k": "am3", "d": "am1"}

CLOSED = [
    "................",
    "....oooooooo....",
    "...ohhggggsso...",
    "...ohoooooosso..",
    "...ohoooooosso..",
    "...ohoo..oosso..",
    "..oooooooooooo..",
    ".ohhhhhhhhggggso",
    ".ohgggggggggssso",
    ".ohggggkkgggssso",
    ".ohgggkddkggssso",
    ".ohggggkkgggssso",
    ".ohgggggggggssso",
    ".ohgggggggggssso",
    ".osssssssssssso.",
    "..oooooooooooo..",
]

# The shackle lifted and swung clear of the left post.
OPEN = [
    "................",
    "......oooooo....",
    ".....ohhggsso...",
    ".....ohooosso...",
    ".....oho..ooo...",
    ".....oho........",
    "..oooooo.oooo...",
    ".ohhhhhhhhggggso",
    ".ohgggggggggssso",
    ".ohggggkkgggssso",
    ".ohgggkddkggssso",
    ".ohggggkkgggssso",
    ".ohgggggggggssso",
    ".ohgggggggggssso",
    ".osssssssssssso.",
    "..oooooooooooo..",
]

if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for key, rows in (("ui_lock", CLOSED), ("ui_lock_open", OPEN)):
        assert len(rows) == 16 and all(len(r) == 16 for r in rows), key
        s = GS.Spr(16, 16)
        s.pattern(0, 0, rows, LEGEND)
        s.image().save(out / f"{key}.png")
