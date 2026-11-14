// Pure pixel rules for the painted stand-in of the ground strip: no Phaser, so they run in Node.
import { createRng } from '../lib/rng.ts';
import { GROUND_HEIGHT, SURFACE_WIDTH } from './landedView.ts';

/** Number of shades in a surface's colour ramp: 0 is the darkest (mortar), 6 the brightest (surface line). */
export const RAMP_SHADES = 7;

/** One stone cell is this wide and tall (px). The width divides the strip so the pattern repeats exactly. */
const CELL = { width: 16, height: 8 } as const;
/** A pixel this close to the border between two stones (in distance units) is mortar. */
const MORTAR = 1.3;
/** How much taller than wide a stone reads: distances are stretched vertically by this much. */
const STONE_SQUASH = 1.4;

const COLUMNS = SURFACE_WIDTH / CELL.width;
const ROWS = Math.ceil(GROUND_HEIGHT / CELL.height);

interface Stone {
  /** Centre, in strip pixels; `x` for column `i` before wrapping. */
  readonly x: number;
  readonly y: number;
  /** A fixed random brightness for this stone, 0 to 1. */
  readonly tone: number;
}

/** The stones of rows -1 to ROWS (a row beyond each edge, so edge pixels see their neighbours). */
function layStones(): Stone[][] {
  const rng = createRng(0x57a4e);
  const rows: Stone[][] = [];
  for (let j = -1; j <= ROWS; j++) {
    const shift = ((j & 1) * CELL.width) / 2;
    // Each row draws its stones once; column `i` and `i + COLUMNS` are the same stone, so the strip tiles.
    const row: Stone[] = [];
    for (let i = 0; i < COLUMNS; i++) {
      row.push({
        x: i * CELL.width + shift + 2 + rng.next() * (CELL.width - 4),
        y: j * CELL.height + 1 + rng.next() * (CELL.height - 2),
        tone: rng.next(),
      });
    }
    rows.push(row);
  }
  return rows;
}

/**
 * The stand-in strip, `SURFACE_WIDTH` by `GROUND_HEIGHT` pixels, as ramp shades row by row: stones
 * packed in offset rows seen in cross-section, mortar in shade 0, each stone lit on its upper left
 * and darker with depth. The top three pixel rows are the surface line, the brightest shades. The
 * left and right edges continue into each other, so the strip repeats without a seam.
 */
export function groundShades(): Uint8Array {
  const stones = layStones();
  const out = new Uint8Array(SURFACE_WIDTH * GROUND_HEIGHT);
  for (let y = 0; y < GROUND_HEIGHT; y++) {
    const row = Math.floor(y / CELL.height);
    for (let x = 0; x < SURFACE_WIDTH; x++) {
      let nearest = Infinity;
      let second = Infinity;
      let best: Stone | undefined;
      let bestOffset = 0;
      for (let j = row - 1; j <= row + 1; j++) {
        const stonesOfRow = stones[j + 1];
        if (!stonesOfRow) continue;
        // Wrapped copies of the row's stones: one period left, in place, and one right.
        for (const wrap of [-SURFACE_WIDTH, 0, SURFACE_WIDTH]) {
          const first = Math.max(0, Math.floor((x - wrap) / CELL.width) - 2);
          for (let i = first; i < Math.min(COLUMNS, first + 5); i++) {
            const stone = stonesOfRow[i];
            if (!stone) continue;
            const dx = x + 0.5 - (stone.x + wrap);
            const dy = y + 0.5 - stone.y;
            const d = Math.hypot(dx, dy * STONE_SQUASH);
            if (d < nearest) {
              second = nearest;
              nearest = d;
              best = stone;
              bestOffset = dx + dy;
            } else if (d < second) {
              second = d;
            }
          }
        }
      }
      const mortar = second - nearest < MORTAR;
      let shade = 0;
      if (best && !mortar) {
        const depth = y / GROUND_HEIGHT;
        // Lit on the upper left: brighter where the pixel lies up and left of the stone's centre.
        const lit = Math.max(-0.15, Math.min(0.2, -0.035 * bestOffset));
        const lum = 0.36 + 0.26 * best.tone - depth * 0.3 + lit;
        shade = Math.max(0, Math.min(RAMP_SHADES - 2, Math.round(lum * (RAMP_SHADES - 1))));
      }
      if (y === 0) shade = RAMP_SHADES - 1;
      else if (y === 1) shade = RAMP_SHADES - 2;
      else if (y === 2 && !mortar) shade = RAMP_SHADES - 3;
      out[y * SURFACE_WIDTH + x] = shade;
    }
  }
  return out;
}
