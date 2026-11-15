import { describe, expect, it } from 'vitest';
import { anchorFx } from './groundAnchor.ts';

/** Where a world point shows on screen for a camera at `scroll` and a game object with `factor`. */
const onScreen = (world: number, scroll: number, factor: number): number => world - scroll * factor;

describe('anchoring the dust and smoke to the ground', () => {
  it('puts the emitter where the ground edge shows on screen, whatever its scroll factor', () => {
    for (const factor of [1, 0.6, 0.4]) {
      for (const scroll of [
        { x: 0, y: 0 },
        { x: 0, y: 90 },
        { x: 14, y: -98 },
      ]) {
        const edge = { x: 525, y: 296 };
        const at = anchorFx(edge, scroll, factor);
        expect(onScreen(at.x, scroll.x, factor)).toBeCloseTo(edge.x - scroll.x, 9);
        expect(onScreen(at.y, scroll.y, factor)).toBeCloseTo(edge.y - scroll.y, 9);
      }
    }
  });

  it('leaves the spot alone for a full scroll factor', () => {
    expect(anchorFx({ x: 500, y: 296 }, { x: 5, y: 40 }, 1)).toEqual({ x: 500, y: 296 });
  });
});
