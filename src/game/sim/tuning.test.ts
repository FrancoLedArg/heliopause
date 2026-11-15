import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng.ts';
import {
  availableDeltaV,
  CHASSIS_IDS,
  flyHop,
  homePlanet,
  kilometers,
  listBodies,
  metersPerSecond,
  metersPerSecondSquared,
  newSpacecraft,
  planHop,
  startRun,
  type ChassisId,
  type HopPlan,
  type Run,
} from './index.ts';
import { homeMoon, plan, withBodies } from './testing.ts';

/** Many Star Systems, so the tuning is checked across the generator's spread, not one lucky seed. */
const SEEDS = Array.from({ length: 2_000 }, (_, i) => i * 7_919 + 13);

/** Comfortable: certain to arrive, with at least a fifth more Δv than the estimate. */
function expectComfortable(hop: HopPlan) {
  expect(hop.successChance).toBe(1);
  expect(hop.margin / hop.totalEstimate).toBeGreaterThanOrEqual(0.2);
}

/**
 * How many Hops a cautious player gets from starter Fuel: always launching the cheapest Body not
 * yet visited, as long as its Success Chance is at least 50%.
 */
function cautiousHops(start: Run, seed: number): number {
  const rng = createRng(seed);
  const visited = new Set<string>([start.starSystem.homePlanetId]);
  let run = start;
  for (let hops = 0; ; hops++) {
    const [next] = listBodies(run.starSystem)
      .filter((body) => !visited.has(body.id))
      .flatMap((body) => {
        const result = planHop(run, body.id);
        return result.kind === 'planned' && result.plan.successChance >= 0.5 ? [result.plan] : [];
      })
      .sort((a, b) => a.totalEstimate - b.totalEstimate);
    if (!next) return hops;
    const { flight, run: after } = flyHop(run, next, rng);
    if (flight.outcome.kind !== 'arrived') return hops;
    // Arrived, but Stranded there: that Hop counts, and no other follows.
    if (after.status.kind !== 'landed') return hops + 1;
    visited.add(next.toId);
    run = after;
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? NaN;
}

describe.each(CHASSIS_IDS)('starter tuning for the %s', (chassisId: ChassisId) => {
  it("reaches every one of the Home Planet's Moons with comfortable Margin, in every Star System", () => {
    for (const seed of SEEDS) {
      const run = startRun(seed, chassisId);
      for (const moon of homePlanet(run.starSystem).moons) expectComfortable(plan(run, moon.id));
    }
  });

  it('reaches the Moon comfortably even from the heaviest Home Planet the generator allows', () => {
    // The generator's extremes, from docs/research/nasa-data-for-generation.md §1: an Earth-sized
    // Home Planet (9.8 m/s², 11.2 km/s), and a Ganymede-sized Moon (2.7 km/s) on the farthest orbit.
    const run = startRun(2026, chassisId);
    const moon = homeMoon(run);
    const extreme = withBodies(run, {
      [run.starSystem.homePlanetId]: {
        surfaceGravity: metersPerSecondSquared(9.8),
        escapeVelocity: metersPerSecond(11_200),
      },
      [moon.id]: {
        escapeVelocity: metersPerSecond(2_700),
        distanceFromPlanet: kilometers(1_900_000),
      },
    });
    expectComfortable(plan(extreme, moon.id));
  });

  it('is never trivial: the Moon Hop always takes at least a fifth of the starting Δv', () => {
    const startingDeltaV = availableDeltaV(newSpacecraft(chassisId));
    for (const seed of SEEDS) {
      const run = startRun(seed, chassisId);
      for (const moon of homePlanet(run.starSystem).moons) {
        expect(plan(run, moon.id).totalEstimate / startingDeltaV).toBeGreaterThanOrEqual(0.2);
      }
    }
  });

  it('starter Fuel covers roughly 2 to 4 nearby Hops for a cautious player', () => {
    const hops = SEEDS.slice(0, 400).map((seed) => cautiousHops(startRun(seed, chassisId), seed));
    expect(median(hops)).toBeGreaterThanOrEqual(2);
    expect(median(hops)).toBeLessThanOrEqual(4);
    expect(Math.min(...hops)).toBeGreaterThanOrEqual(1);
    // Few Star Systems leave a cautious player with only the Moon.
    expect(hops.filter((count) => count === 1).length / hops.length).toBeLessThan(0.1);
  });
});
