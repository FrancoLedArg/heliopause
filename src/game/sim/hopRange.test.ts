import { describe, expect, it } from 'vitest';
import { knowingEverything, landedOn, readyToJump, withDeltaV, withJumpDrive } from './testing.ts';
import {
  CHASSIS_IDS,
  HELIOPAUSE,
  hopRange,
  isInHopRange,
  listBodies,
  planHop,
  startRun,
  type Body,
  type Planet,
  type Run,
} from './index.ts';

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7_919 + 11);

/** A Run knowing everything, landed on `body`, with Δv to spare and a Jump Drive: only the range limits it. */
function standingOn(seed: number, pick: (planets: readonly Planet[]) => Body | undefined): Run {
  const start = withJumpDrive(knowingEverything(startRun(seed, 'scout')));
  const body = pick(start.starSystem.planets);
  if (!body) throw new Error('No such Body');
  return withDeltaV(landedOn(start, body.id), 1e6);
}

/** The planet a Body is or orbits, counted out from the star. */
function bandOf(run: Run, body: Body): number {
  const planetId = body.kind === 'moon' ? body.planetId : body.id;
  return run.starSystem.planets.findIndex((planet) => planet.id === planetId);
}

describe('the Hop range (#283)', () => {
  it('reaches the Bodies of the planet the Spacecraft is at and of the planets on either side, and no farther', () => {
    for (const seed of SEEDS) {
      const run = standingOn(seed, ([first]) => first?.moons[0]);
      for (const body of listBodies(run.starSystem)) {
        expect(isInHopRange(run, body.id), `${String(seed)} ${body.id}`).toBe(
          bandOf(run, body) <= 1,
        );
      }
    }
  });

  it('a Body out of range cannot be targeted, and the plan says so', () => {
    const run = standingOn(SEEDS[0] ?? 0, ([first]) => first);
    const far = listBodies(run.starSystem).find((body) => body.landable && bandOf(run, body) > 1);
    if (!far) throw new Error('Expected a landable Body two planets out');
    expect(planHop(run, far.id)).toMatchObject({ kind: 'invalid-target', reason: 'out-of-range' });
  });

  it('is the band of distances from the star between the neighbouring planets’ orbits', () => {
    const run = standingOn(SEEDS[0] ?? 0, (planets) => planets[1]);
    const [first, , third] = run.starSystem.planets;
    expect(hopRange(run)).toEqual({
      inner: first?.distanceFromStar,
      outer: third?.distanceFromStar,
    });
  });

  it('the Heliopause is in range only from the outermost planet and its Moons', () => {
    for (const seed of SEEDS) {
      const outer = standingOn(seed, (planets) => planets.at(-1)?.moons[0]);
      expect(isInHopRange(outer, HELIOPAUSE)).toBe(true);
      expect(hopRange(outer).outer).toBe(outer.starSystem.heliopauseRadius);
      expect(planHop(outer, HELIOPAUSE).kind).toBe('planned');

      const inner = standingOn(seed, (planets) => planets.at(-2)?.moons[0]);
      expect(isInHopRange(inner, HELIOPAUSE)).toBe(false);
      expect(planHop(inner, HELIOPAUSE)).toMatchObject({
        kind: 'invalid-target',
        reason: 'out-of-range',
      });
    }
  });
});

describe('the way out takes many Hops (#283)', () => {
  const SWEEP = Array.from({ length: 500 }, (_, i) => i * 7_919 + 11);

  it('no Run can Hop to the Heliopause from its Starting Moon, even knowing where it is', () => {
    for (const seed of SWEEP) {
      for (const chassisId of CHASSIS_IDS) {
        const start = withJumpDrive(startRun(seed, chassisId));
        const knowing = { ...start, knowledge: { ...start.knowledge, heliopauseFound: true } };
        expect(isInHopRange(knowing, HELIOPAUSE), `seed ${String(seed)}`).toBe(false);
      }
    }
  });

  it('a careful explorer takes a median of 10 to 15 Hops to reach the Heliopause, and never fewer than 5', () => {
    // 500 seeds × every Chassis, as measured for #283: 234 of 1,500 Runs get out (the rest run short
    // of Fuel, #280), in min 5, p10 7, median 10, p90 14, max 17 Hops.
    const hops = SWEEP.flatMap((seed) =>
      CHASSIS_IDS.flatMap((chassisId) => {
        const ready = readyToJump(seed, chassisId);
        return ready ? [ready.hopsFlown + 1] : [];
      }),
    ).sort((a, b) => a - b);
    expect(hops.length).toBeGreaterThan(100);
    expect(hops[0]).toBeGreaterThanOrEqual(5);
    const median = hops[Math.floor(hops.length / 2)] ?? 0;
    expect(median).toBeGreaterThanOrEqual(10);
    expect(median).toBeLessThanOrEqual(15);
  }, 60_000);
});
