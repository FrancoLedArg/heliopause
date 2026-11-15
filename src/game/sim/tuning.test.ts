import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng.ts';
import {
  CHASSIS_IDS,
  flyHop,
  knownBodies,
  planHop,
  startRun,
  type ChassisId,
  type HopPlan,
  type Run,
} from './index.ts';
import { firstTarget, plan } from './testing.ts';

/** Many Star Systems, so the tuning is checked across the generator's spread, not one lucky seed. */
const SEEDS = Array.from({ length: 2_000 }, (_, i) => i * 7_919 + 13);

/** Comfortable: certain to arrive, with at least a fifth more Δv than the estimate. */
function expectComfortable(hop: HopPlan) {
  expect(hop.successChance).toBe(1);
  expect(hop.margin / hop.totalEstimate).toBeGreaterThanOrEqual(0.2);
}

/**
 * How many Hops a cautious player gets from starter Fuel: always launching the cheapest known Body
 * not yet visited, as long as its Success Chance is at least 50%.
 */
function cautiousHops(start: Run, seed: number): number {
  const rng = createRng(seed);
  const visited = new Set<string>([start.starSystem.startingMoonId]);
  let run = start;
  for (let hops = 0; ; hops++) {
    const [next] = knownBodies(run)
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

// Each sweep generates up to 2,000 Star Systems: about 3 s, longer on a loaded machine (#188).
describe.each(CHASSIS_IDS)(
  'starter tuning for the %s',
  { timeout: 60_000 },
  (chassisId: ChassisId) => {
    it('reaches the first Detected Body with comfortable Margin, in every Star System', () => {
      for (const seed of SEEDS) {
        const run = startRun(seed, chassisId);
        expectComfortable(plan(run, firstTarget(run).id));
      }
    });

    it('starter Fuel covers roughly 3 to 6 nearby Hops for a cautious player', () => {
      const hops = SEEDS.slice(0, 400).map((seed) => cautiousHops(startRun(seed, chassisId), seed));
      // Was 2 to 4 until #188 gave every rocky planet two Moons: short Hops between them, some Icy.
      expect(median(hops)).toBeGreaterThanOrEqual(3);
      expect(median(hops)).toBeLessThanOrEqual(6);
      expect(Math.min(...hops)).toBeGreaterThanOrEqual(1);
      // Few Star Systems leave a cautious player with only the Moon.
      expect(hops.filter((count) => count === 1).length / hops.length).toBeLessThan(0.1);
    });
  },
);
