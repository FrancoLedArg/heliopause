// Scrap's icon (#344), a code-drawn stand-in until the asset follow-up: a torn, riveted metal plate
// with a rusted edge, 16×16 pixels. The React icon and the Cruise's Rush price both draw from it, so
// the two always match.
import type { PaletteColor } from './kit/palette.ts';

/** The icon's size in pixels. */
export const SCRAP_PIXELS_SIZE = 16;

/** Each pixel's colour, by the letter the rows below use; `.` is clear. */
export const SCRAP_COLORS: Readonly<Record<string, PaletteColor>> = {
  o: 'gm1',
  l: 'wh2',
  m: 'gm5',
  h: 'gm1',
  r: 'am2',
};

/** The rows, top to bottom. */
export const SCRAP_ROWS: readonly string[] = [
  '................',
  '..oo......oo....',
  '.olmo....olmo...',
  '.olmmooooolmmo..',
  '..omlllllllmmo..',
  '..olmmmmmmmmmo..',
  '.olmmhmmmmhmmmo.',
  '.olmmmmmmmmmmro.',
  '..olmmmmmmmmrro.',
  '..olmmhmmmmrro..',
  '...olmmmmmrro...',
  '...ommrmmro.oo..',
  '..olmrro.oo.olo.',
  '..oorro.....oo..',
  '...oo...........',
  '................',
];

/** Each coloured pixel: its column, row and palette colour. */
export function scrapPixels(): {
  readonly x: number;
  readonly y: number;
  readonly color: PaletteColor;
}[] {
  return SCRAP_ROWS.flatMap((row, y) =>
    Array.from({ length: row.length }, (_, x) => row.charAt(x)).flatMap((letter, x) => {
      const color = SCRAP_COLORS[letter];
      return color === undefined ? [] : [{ x, y, color }];
    }),
  );
}
