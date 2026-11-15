import { describe, expect, it } from 'vitest';
import { CHASSIS_IDS, homePlanet, startRun, type Run, type Slot } from '../sim/index.ts';
import { standingExtent } from './chassisArt.ts';
import { shadowWidth } from './spacecraftArt.ts';
import {
  GROUND_HEIGHT,
  GROUND_TOP,
  SHIP_FOOTPRINT_HALF_WIDTH,
  SHIP_SHADOW,
  SHIP_PLACEMENT,
  SPRITE_SIZE,
  SURFACE_WIDTH,
  pebbles,
  skyBodies,
} from './landedView.ts';

const newRun = (seed: number): Run => startRun(seed, 'scout');

function runOnMoonOfHome(seed: number): Run {
  const run = newRun(seed);
  const moon = homePlanet(run.starSystem).moons[0];
  if (!moon) throw new Error('Home Planet has no Moon');
  return { ...run, status: { kind: 'landed', bodyId: moon.id } };
}

describe('the Landed ground', () => {
  it('has one level top edge, exactly at the Spacecraft base line', () => {
    expect(GROUND_TOP).toBe(SHIP_PLACEMENT.baseY);
  });

  it('lies below every sky Body, whatever the seed and wherever the Spacecraft stands', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const run of [newRun(seed), runOnMoonOfHome(seed)]) {
        for (const s of skyBodies(run)) {
          const bottom = s.y + (SPRITE_SIZE[s.kind] * s.scale) / 2;
          expect(bottom, `seed ${String(seed)}`).toBeLessThan(GROUND_TOP);
        }
      }
    }
  });

  it('fills the screen from its top edge to the bottom', () => {
    expect(GROUND_TOP + GROUND_HEIGHT).toBe(360);
  });
});

describe('the pebbles on the ground', () => {
  /** The strip's x where the Spacecraft stands: the Spacecraft rides the ground it stands on. */
  const shipOnStrip = SHIP_PLACEMENT.x - (640 - SURFACE_WIDTH) / 2;

  it('are the same for the same Body in the same Run, and differ between Bodies', () => {
    const a = pebbles(newRun(7));
    expect(a).toEqual(pebbles(newRun(7)));
    expect(a.length).toBeGreaterThan(0);
    expect(pebbles(runOnMoonOfHome(7))).not.toEqual(a);
  });

  it('never fall within the Spacecraft footprint, on any seed or Body', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const run of [newRun(seed), runOnMoonOfHome(seed)]) {
        for (const p of pebbles(run)) {
          const clear =
            p.x + p.width <= shipOnStrip - SHIP_FOOTPRINT_HALF_WIDTH ||
            p.x >= shipOnStrip + SHIP_FOOTPRINT_HALF_WIDTH;
          expect(clear, `seed ${String(seed)} pebble at ${String(p.x)}`).toBe(true);
        }
      }
    }
  });

  it('keep clear of every Chassis, shadow included', () => {
    for (const id of CHASSIS_IDS) {
      const half = standingExtent([id]).halfWidth;
      expect(SHIP_FOOTPRINT_HALF_WIDTH, id).toBeGreaterThan(half);
      // The widest Spacecraft: Drills reaching out on both sides and a second column of Fuel Tank pods.
      const wide: Slot[] = [
        'engine-1',
        'fuel-tank-1',
        'drill-2',
        'drill-2',
        'drill-2',
        'fuel-tank-1',
      ];
      expect(SHIP_FOOTPRINT_HALF_WIDTH, `${id} shadow`).toBeGreaterThanOrEqual(
        shadowWidth(id, wide) / 2,
      );
    }
    expect(SHIP_SHADOW.height).toBeGreaterThan(0);
  });

  it('rest on the surface line inside the strip', () => {
    for (const p of pebbles(newRun(3))) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(SURFACE_WIDTH);
      expect(p.height).toBeGreaterThan(0);
    }
  });
});
