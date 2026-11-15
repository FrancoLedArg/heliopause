"""Generates public/assets/sprites/res_science.png: a 16x16 pixel-art flask in kit palette colours.
Run: python3 scripts/assets/genScienceIcon.py (needs Pillow). Pixels are fully opaque or fully transparent."""
import json
from PIL import Image

pal = json.load(open('public/assets/ui/palette.json'))
key = {'O': 'wh2', 'L': 'cy3', 'l': 'cy2', 'd': 'cy1', 'h': 'cy4', 'b': 'vi3'}
rows = [
    '................',
    '.....OOOOOO.....',
    '......O..O......',
    '......O..O......',
    '......O..O......',
    '.....O....O.....',
    '....O..hh..O....',
    '...O........O...',
    '...O..b.....O...',
    '..O..bLLLLLl.O..',
    '..O.LLLLLLLLl.O.',
    '.O..LLLLLLLLll.O',
    '.O..lLLLLLLLld.O',
    '.OOllllllllllddO',
    '..OOOOOOOOOOOOO.',
    '................',
]
img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
for y, r in enumerate(rows):
    assert len(r) == 16, (y, len(r))
    for x, c in enumerate(r):
        if c in key:
            h = pal[key[c]].lstrip('#')
            img.putpixel((x, y), tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,))
img.save('public/assets/sprites/res_science.png')
