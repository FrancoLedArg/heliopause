import { describe, expect, it } from 'vitest';
import type { Slot } from '../sim/index.ts';
import { FLIGHT_ANGLE, turn } from './chassisArt.ts';
import { componentLayout, type Rect } from './componentBounds.ts';

const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

describe('where each installed Component sits on the drawn Spacecraft', () => {
  const full: Slot[] = ['engine-1', 'fuel-tank-1', 'drill-1', 'jump-drive'];

  it('has bounds for every installed Component, keyed by its Slot, and none for an empty Slot', () => {
    const slots: Slot[] = ['engine-1', null, 'drill-1', null];
    expect([...componentLayout(slots, 'flight').keys()]).toEqual([0, 2]);
    expect(componentLayout([null, null, null, null], 'flight').size).toBe(0);
  });

  it('keeps the Components apart, so each can be clicked on its own', () => {
    for (const frame of ['landed', 'flight'] as const) {
      const rects = [...componentLayout(full, frame).values()];
      expect(rects).toHaveLength(4);
      rects.forEach((a, i) => {
        rects.slice(i + 1).forEach((b) => {
          expect(overlap(a, b)).toBe(false);
        });
      });
    }
  });

  it('stands them up the hull from the engine to the nose, and turns them with the flying Spacecraft', () => {
    const standing = componentLayout(full, 'landed');
    const flying = componentLayout(full, 'flight');
    for (const [slot, rect] of standing) {
      const { x, y } = centre(rect);
      // On the hull's centre line, above the base (the sky is negative y).
      expect(x).toBeCloseTo(0, 0);
      expect(y).toBeLessThan(-10);
      const turned = turn({ x, y }, FLIGHT_ANGLE);
      const flown = flying.get(slot);
      expect(flown && centre(flown).x).toBeCloseTo(turned.x, 0);
      expect(flown && centre(flown).y).toBeCloseTo(turned.y, 0);
    }
  });
});
