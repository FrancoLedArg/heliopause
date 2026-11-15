import { describe, expect, it } from 'vitest';
import { CHASSIS_IDS } from '../sim/index.ts';
import { frameGeometry, standingExtent, turn } from './chassisArt.ts';

// The nozzles, lamps and pieces of the drawn Spacecraft are the composition's: spacecraftComposition.test.ts.
describe.each(CHASSIS_IDS)('the %s frames', (id) => {
  it('put the flight frame origin at the base centre, so the turn swaps frames unseen', () => {
    const standing = frameGeometry(id, 'landed');
    expect(standing.pivot).toEqual({ x: standing.width / 2, y: standing.height });
    expect(frameGeometry(id, 'landed_lit')).toEqual(standing);
    const flight = frameGeometry(id, 'flight');
    expect(flight.pivot.x).toBeGreaterThan(0);
    expect(flight.pivot.x).toBeLessThan(flight.width);
    expect(flight.pivot.y).toBeGreaterThan(0);
    expect(flight.pivot.y).toBeLessThan(flight.height);
  });
});

describe('turn', () => {
  it('turns a point clockwise on the screen: straight down at 66 degrees points down and to the left', () => {
    const at = turn({ x: 0, y: 1 }, 66);
    expect(at.x).toBeLessThan(0);
    expect(at.y).toBeGreaterThan(0);
    expect(turn({ x: 0, y: -1 }, 90).x).toBeCloseTo(1);
  });
});

describe('the standing Spacecraft extent', () => {
  it('is the widest and tallest standing frame of the Chassis', () => {
    const extent = standingExtent(CHASSIS_IDS);
    for (const id of CHASSIS_IDS) {
      const { width, height } = frameGeometry(id, 'landed');
      expect(width / 2).toBeLessThanOrEqual(extent.halfWidth);
      expect(height).toBeLessThanOrEqual(extent.height);
    }
    // The upright ships are taller than the old 96x64 landers.
    expect(extent.height).toBeGreaterThan(100);
  });
});
