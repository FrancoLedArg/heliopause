import { describe, expect, it } from 'vitest';
import { DEBRIS_FIELD, debrisRocks } from './debrisField.ts';

const target = { x: 300, y: 150 };

describe('the Debris field drifting through the Cruise', () => {
  it('is not on screen before it comes in nor once it has gone by', () => {
    expect(debrisRocks(100, 100 - DEBRIS_FIELD.leadTicks - 1, target, true)).toEqual([]);
    expect(debrisRocks(100, 100 + DEBRIS_FIELD.tailTicks + 1, target, true)).toEqual([]);
  });

  it('a hit has a rock arrive on the Component at the strike tick, and that rock ends there', () => {
    const arriving = debrisRocks(100, 100, target, true).filter((rock) => rock.hits);
    expect(arriving).toHaveLength(1);
    expect(arriving[0]).toMatchObject({ x: 300, y: 150 });
    expect(debrisRocks(100, 101, target, true).some((rock) => rock.hits)).toBe(false);
    expect(debrisRocks(100, 90, target, true).find((rock) => rock.hits)?.x).toBeGreaterThan(300);
  });

  it('a miss has every rock pass clear of the Spacecraft', () => {
    for (let tick = 60; tick <= 140; tick++) {
      for (const rock of debrisRocks(100, tick, target, false)) {
        expect(rock.hits).toBe(false);
        // Across the line of travel, at least the clearance away at the closest approach.
        const dx = rock.x - target.x;
        const dy = rock.y - target.y;
        const heading = Math.hypot(1, 0.18);
        const across = Math.abs(dx * (0.18 / heading) + dy * (1 / heading)) * 1;
        expect(across).toBeGreaterThan(DEBRIS_FIELD.clearance - 1);
      }
    }
  });

  it('the same field is posed the same way every time', () => {
    expect(debrisRocks(250, 240, target, false)).toEqual(debrisRocks(250, 240, target, false));
  });

  it('under reduced motion the field holds still, without spin, until its strike tick', () => {
    const early = debrisRocks(100, 70, target, false, true);
    expect(early.length).toBeGreaterThan(0);
    expect(debrisRocks(100, 95, target, false, true)).toEqual(early);
    expect(early.every((rock) => rock.angle % 90 === 0)).toBe(true);
    expect(debrisRocks(100, 101, target, false, true)).toEqual([]);
  });
});
