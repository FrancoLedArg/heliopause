"""Heliopause browser favicon: a 16x16 pixel-art ringed planet, in the UI kit palette.

AI-generated pixel art (see AI-USAGE.md). It only appears in the tab of the game
page, whose permanent "AI-generated art" label covers it like every other
generated sprite. Drawn from the ASCII grid below, so edit the grid and re-run
rather than hand-editing public/favicon.svg.

Usage:  python3 -I gen_favicon.py <out_svg>
"""
import sys
from pathlib import Path

# Kit palette (public/assets/ui/palette.json). '.' is the void background.
PALETTE = {
    ".": "#070a12",  # void
    "k": "#46dcec",  # cy3, lit edge
    "c": "#1ca4bc",  # cy2, planet body
    "d": "#11667e",  # cy1, shadow
    "r": "#ffb43c",  # am3, ring
}

GRID = [
    "................",
    "................",
    "................",
    "......cccc......",
    ".....kkcccc.....",
    "....kkccccdd....",
    "....kcccccdd....",
    "...kkccccccdd...",
    "...kccccccddd...",
    "rrrccccccddddrrr",
    "...ccccccdddd...",
    "....ccccdddd....",
    ".....cccddd.....",
    "......ccdd......",
    "................",
    "................",
]


def build_svg(grid: list[str]) -> str:
    assert len(grid) == 16 and all(len(row) == 16 for row in grid), "grid must be 16x16"
    rects: list[str] = []
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{PALETTE[ch]}"/>')
    body = "\n  ".join(rects)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" '
        'shape-rendering="crispEdges">\n'
        f'  <rect width="16" height="16" fill="{PALETTE["."]}"/>\n'
        f"  {body}\n"
        "</svg>\n"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 -I gen_favicon.py <out_svg>")
    Path(sys.argv[1]).write_text(build_svg(GRID), encoding="utf-8")
