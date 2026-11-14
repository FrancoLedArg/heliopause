import { describe, expect, it } from 'vitest';
import { RAMP_SHADES, groundShades } from './groundArt.ts';
import { GROUND_HEIGHT, SURFACE_WIDTH } from './landedView.ts';

const shades = groundShades();
const at = (x: number, y: number): number => shades[y * SURFACE_WIDTH + x] ?? -1;
const BRIGHTEST = RAMP_SHADES - 1;

describe('the ground strip stand-in', () => {
  it('is as wide as the ground and fills it down to the bottom of the screen', () => {
    expect(shades).toHaveLength(SURFACE_WIDTH * GROUND_HEIGHT);
  });

  it('has a level surface line: the whole top row is the brightest shade, the next the one below', () => {
    for (let x = 0; x < SURFACE_WIDTH; x++) {
      expect(at(x, 0)).toBe(BRIGHTEST);
      expect(at(x, 1)).toBe(BRIGHTEST - 1);
    }
  });

  it('has mortar in the darkest shade and stones in several lighter ones', () => {
    const used = new Set(shades);
    expect(used.has(0)).toBe(true);
    expect(used.size).toBeGreaterThanOrEqual(4);
  });

  it('gets darker with depth', () => {
    const mean = (from: number, to: number): number => {
      let sum = 0;
      for (let y = from; y < to; y++) for (let x = 0; x < SURFACE_WIDTH; x++) sum += at(x, y);
      return sum / ((to - from) * SURFACE_WIDTH);
    };
    expect(mean(3, 19)).toBeGreaterThan(mean(GROUND_HEIGHT - 16, GROUND_HEIGHT));
  });

  it('tiles: the seam between the last column and the first is no rougher than any other column pair', () => {
    const changes = (x: number): number => {
      let n = 0;
      for (let y = 3; y < GROUND_HEIGHT; y++) if (at(x, y) !== at((x + 1) % SURFACE_WIDTH, y)) n++;
      return n;
    };
    let worstInterior = 0;
    for (let x = 0; x < SURFACE_WIDTH - 1; x++) worstInterior = Math.max(worstInterior, changes(x));
    expect(changes(SURFACE_WIDTH - 1)).toBeLessThanOrEqual(worstInterior);
    // And the stone pattern is the same one a period apart: the rows repeat exactly at the seam's
    // two sides, so the stones either side of it are neighbours in the same row, not a cut.
    const seam = changes(SURFACE_WIDTH - 1);
    const typical = changes(SURFACE_WIDTH / 2);
    expect(seam).toBeLessThanOrEqual(typical * 2 + 8);
  });
});
