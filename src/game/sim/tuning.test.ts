import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng.ts';
import {
  CHASSIS_IDS,
  currentBody,
  flyHop,
  generateSystem,
  isDepleted,
  knownBodies,
  launchHop,
  listBodies,
  planHop,
  startRun,
  type Body,
  type ChassisId,
  type HopPlan,
  type Run,
} from './index.ts';
import { firstTarget, plan, startingRun } from './testing.ts';

/** Many Star Systems, so the tuning is checked across the generator's spread, not one lucky seed. */
const SEEDS = Array.from({ length: 2_000 }, (_, i) => i * 7_919 + 13);

/** Comfortable: certain to arrive, with at least a fifth more Δv than the estimate. */
function expectComfortable(hop: HopPlan) {
  expect(hop.successChance).toBe(1);
  expect(hop.margin / hop.totalEstimate).toBeGreaterThanOrEqual(0.2);
}

/** Star Systems 1 to 3, where a Run's opening plays out. */
const LEVELS = [1, 2, 3] as const;

/** Fewer seeds per level for the first-Hop sweeps, which generate every level: 500 Star Systems each. */
const FIRST_HOP_SEEDS = SEEDS.slice(0, 500);

/**
 * The share of the tank the first Hop leaves, as the Fuel gauge then reads before any yield: the
 * new Spacecraft launched, the way the game flies it, to the one Body Comms has Detected.
 */
function firstHopFuelShare(seed: number, chassisId: ChassisId, level: number): number {
  const start = startingRun(generateSystem(seed, level), chassisId, level, seed);
  const launched = launchHop(start, firstTarget(start).id);
  if (launched.kind !== 'flown') throw new Error(`Seed ${String(seed)}: ${launched.why}`);
  return launched.flight.fuelRemaining / start.spacecraft.fuelCapacity;
}

/**
 * How many Hops a cautious player gets from starter Fuel: always launching the cheapest known Body
 * not yet visited, as long as its Success Chance is at least 50%. Without `gather`, the Fuel an
 * Icy Body yields is left behind, so only the starting Fuel counts.
 */
function cautiousHops(start: Run, seed: number, { gather = true } = {}): number {
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
    run = gather
      ? after
      : { ...after, spacecraft: { ...after.spacecraft, fuelMass: flight.fuelRemaining } };
  }
}

function quantile(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(share * (sorted.length - 1))] ?? NaN;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? NaN;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

    // #247: a new Run felt out of Fuel after its first Hop. Measured over 500 seeds the Hop left
    // 54% to 61% of the tank on average, as a gauge reading "half gone"; the Landing on the
    // Starting Moon's planet is most of the cost.
    it.each(LEVELS)(
      'the first Hop leaves a healthy Fuel gauge in Star System %i',
      { timeout: 60_000 },
      (level) => {
        const left = FIRST_HOP_SEEDS.map((seed) => firstHopFuelShare(seed, chassisId, level));
        expect(mean(left)).toBeGreaterThanOrEqual(0.6);
        // Nine Runs in ten keep more than half the tank.
        expect(quantile(left, 0.1)).toBeGreaterThanOrEqual(0.5);
      },
    );

    it.each(LEVELS)(
      'the starting Fuel alone carries a cautious player 3 nearby Hops in Star System %i',
      { timeout: 60_000 },
      (level) => {
        const hops = FIRST_HOP_SEEDS.map((seed) => {
          const start = startingRun(generateSystem(seed, level), chassisId, level, seed);
          return cautiousHops(start, seed, { gather: false });
        });
        expect(median(hops)).toBeGreaterThanOrEqual(3);
      },
    );

    it('starter Fuel, and the Fuel it gathers, covers roughly 3 to 12 nearby Hops for a cautious player', () => {
      const hops = SEEDS.slice(0, 400).map((seed) => cautiousHops(startRun(seed, chassisId), seed));
      // Was 2 to 4 until #188 gave every rocky planet two Moons: short Hops between them, some Icy.
      // Was 3 to 6 until #280: Comms Detects a Fuel source In reach, so the medians rose to 10 and 11.
      expect(median(hops)).toBeGreaterThanOrEqual(3);
      expect(median(hops)).toBeLessThanOrEqual(12);
      expect(Math.min(...hops)).toBeGreaterThanOrEqual(1);
      // Few Star Systems leave a cautious player with only the Moon.
      expect(hops.filter((count) => count === 1).length / hops.length).toBeLessThan(0.1);
    });
  },
);

/**
 * Whether `body` is a Fuel source In reach of the landed Run: an Icy Body with Fuel left that a Hop
 * shows In reach (at least 70%, #190), Detected or not.
 */
function fuelSourceInReach(run: Run, body: Body): boolean {
  if (!body.landable || body.composition !== 'icy' || body.baseYield <= 0) return false;
  if (isDepleted(run, body.id) || body.id === currentBody(run).id) return false;
  const knowing = { ...run, knowledge: { ...run.knowledge, detected: [body.id] } };
  const planned = planHop(knowing, body.id);
  return planned.kind === 'planned' && planned.plan.successChance >= 0.7;
}

/** After one landing: whether a Fuel source is Detected and In reach, and whether one is In reach at all. */
interface Lifeline {
  readonly detected: boolean;
  readonly any: boolean;
}

/** What the cautious player of `cautiousHops` finds after each landing in Star System 1. */
function lifelinesAfterLandings(start: Run, seed: number): Lifeline[] {
  const rng = createRng(seed);
  const visited = new Set<string>([start.starSystem.startingMoonId]);
  const found: Lifeline[] = [];
  let run = start;
  for (;;) {
    const [next] = knownBodies(run)
      .filter((body) => !visited.has(body.id))
      .flatMap((body) => {
        const result = planHop(run, body.id);
        return result.kind === 'planned' && result.plan.successChance >= 0.5 ? [result.plan] : [];
      })
      .sort((a, b) => a.totalEstimate - b.totalEstimate);
    if (!next) return found;
    run = flyHop(run, next, rng).run;
    if (run.status.kind !== 'landed') return found;
    visited.add(next.toId);
    const landed = run;
    found.push({
      detected: knownBodies(landed).some((body) => fuelSourceInReach(landed, body)),
      any: listBodies(landed.starSystem).some((body) => fuelSourceInReach(landed, body)),
    });
  }
}

// #280, the Fuel lifeline: after a landing, a Fuel source In reach is Detected whenever one exists,
// and generation makes sure one does after the first Hop.
describe.each(CHASSIS_IDS)('the Fuel lifeline for the %s', { timeout: 60_000 }, (chassisId) => {
  it('after every landing of a cautious player, a Fuel source In reach is Detected whenever one exists', () => {
    const landings = FIRST_HOP_SEEDS.flatMap((seed) =>
      lifelinesAfterLandings(startRun(seed, chassisId), seed).map((landing, hop) => ({
        ...landing,
        seed,
        hop,
      })),
    );
    expect(landings.filter((landing) => landing.any && !landing.detected)).toEqual([]);
    // The first landing always has one.
    expect(landings.filter((landing) => landing.hop === 0 && !landing.detected)).toEqual([]);
  });
});
