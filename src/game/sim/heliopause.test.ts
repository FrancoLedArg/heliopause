import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng.ts';
import {
  astronomicalUnits,
  flyHop,
  HELIOPAUSE,
  launchHop,
  homePlanet,
  metersPerSecond,
  metersPerSecondSquared,
  plannedBurns,
  planHop,
  startRun,
  type Run,
} from './index.ts';
import { homeMoon, landedOn, plan, withBodies, withDeltaV, withJumpDrive } from './testing.ts';

const run: Run = startRun(2026, 'scout');

describe('the Heliopause as a Hop target', () => {
  it('the Heliopause cannot be targeted without a Jump Drive', () => {
    const result = planHop(run, HELIOPAUSE);
    expect(result).toMatchObject({ kind: 'invalid-target', reason: 'no-jump-drive' });
    if (result.kind !== 'invalid-target') return;
    expect(result.why).toMatch(/Jump Drive/);
    expect(planHop(withJumpDrive(run), HELIOPAUSE).kind).toBe('planned');
  });

  it('a Hop to the Heliopause has no Landing Burn', () => {
    const planned = plan(withJumpDrive(run), HELIOPAUSE);
    expect(plannedBurns(planned).map(({ burn }) => burn)).toEqual(['takeoff', 'transfer']);
    expect(planned.estimates.takeoff).toBeGreaterThan(0);
    expect(planned.estimates.transfer).toBeGreaterThan(0);
    expect(planned.totalEstimate).toBeCloseTo(
      planned.estimates.takeoff + planned.estimates.transfer,
    );
  });

  it('the Heliopause costs less Δv from farther out', () => {
    // The same Body, its gravity well unchanged, moved out from the star step by step.
    const moon = homeMoon(run);
    const transfers = [0.5, 1, 3, 10, 30].map((distance) => {
      const placed = withBodies(withJumpDrive(landedOn(run, moon.id)), {
        [homePlanet(run.starSystem).id]: { distanceFromStar: astronomicalUnits(distance) },
        [moon.id]: { distanceFromStar: astronomicalUnits(distance) },
      });
      return plan(placed, HELIOPAUSE).estimates.transfer;
    });
    for (let i = 1; i < transfers.length; i++) {
      expect(transfers[i]).toBeLessThan(transfers[i - 1] ?? 0);
    }
  });

  it('from 1 AU the Transfer is about a Hohmann boost to the Heliopause, out of a low orbit', () => {
    // Worked example: an Earth-like home (escape 11.2 km/s, 9.8 m/s²) at 1 AU, Heliopause at 120 AU.
    // Sun-centred: v1 = 29.8 km/s, boost to the 120 AU ellipse v1 (√(2·120/121) − 1) = 12.17 km/s.
    // Patched conics from a circular orbit at R = v²/2g = 6,400 km: √(12.17² + 11.2²) − 11.2/√2 =
    // 16.54 − 7.92 = 8.62 km/s.
    const home = homePlanet(run.starSystem);
    const earthLike = withJumpDrive(
      withBodies(
        { ...run, starSystem: { ...run.starSystem, heliopauseRadius: astronomicalUnits(120) } },
        {
          [home.id]: {
            escapeVelocity: metersPerSecond(11_200),
            surfaceGravity: metersPerSecondSquared(9.8),
            distanceFromStar: astronomicalUnits(1),
          },
        },
      ),
    );
    expect(plan(earthLike, HELIOPAUSE).estimates.transfer).toBeCloseTo(8_620, -1);
  });

  it('uses the same dispersion and Success Chance rules as any Hop', () => {
    const ready = withJumpDrive(run);
    const { totalEstimate } = plan(ready, HELIOPAUSE);
    // 50% when the Fuel gives exactly the estimate; none below the best case; certain above the worst.
    expect(plan(withDeltaV(ready, totalEstimate), HELIOPAUSE).successChance).toBeCloseTo(0.5, 6);
    expect(plan(withDeltaV(ready, totalEstimate * 0.89), HELIOPAUSE).successChance).toBe(0);
    expect(plan(withDeltaV(ready, totalEstimate * 1.11), HELIOPAUSE).successChance).toBe(1);
  });
});

describe('flying to the Heliopause', () => {
  const ready = withJumpDrive(run);
  const { estimates, totalEstimate } = plan(ready, HELIOPAUSE);
  /** The Run with exactly this much Δv, and its plan to the Heliopause. */
  const tight = (deltaV: number) => {
    const from = withDeltaV(ready, deltaV);
    return { from, plan: plan(from, HELIOPAUSE) };
  };

  it('a Hop to the Heliopause that the Fuel covers reaches it, with no Landing flown, and Jumps', () => {
    const { from, plan: covered } = tight(totalEstimate * 1.2);
    const { flight, run: next } = flyHop(from, covered, createRng(3));
    expect(flight.outcome).toEqual({ kind: 'reached-heliopause' });
    expect(flight.burns.map((burn) => [burn.burn, burn.status])).toEqual([
      ['takeoff', 'completed'],
      ['transfer', 'completed'],
    ]);
    expect(flight.collection).toBeNull();
    expect(flight.why).toMatch(/Reached the Heliopause/);
    // The Jump follows at once: the Run goes on, landed on the next Star System's Home Planet.
    expect(next.starSystemNumber).toBe(from.starSystemNumber + 1);
    expect(next.status).toEqual({ kind: 'landed', bodyId: next.starSystem.homePlanetId });
    expect(next.hopsFlown).toBe(from.hopsFlown + 1);
    expect(flight.fuelRemaining).toBeGreaterThan(0);
    expect(next.spacecraft.fuelMass).toBeGreaterThanOrEqual(flight.fuelRemaining);
  });

  it('running out of Fuel on the way to the Heliopause Falls Short', () => {
    const { from, plan: short } = tight(estimates.takeoff * 1.1 + estimates.transfer * 0.5);
    const { flight, run: next } = flyHop(from, short, createRng(1));
    expect(flight.outcome).toMatchObject({ kind: 'fell-short', burn: 'transfer' });
    expect(flight.burns.map((burn) => burn.status)).toEqual(['completed', 'ran-out']);
    expect(flight.why).toMatch(/Fuel ran out during the Transfer/);
    expect(next.status).toEqual({ kind: 'ended', end: { kind: 'fell-short', reason: flight.why } });
  });

  it('launching to the Heliopause replays from the Run seed', () => {
    const roomy = withDeltaV(ready, totalEstimate * 1.2);
    const launched = launchHop(roomy, HELIOPAUSE);
    expect(launched.kind).toBe('flown');
    expect(launchHop(roomy, HELIOPAUSE)).toEqual(launched);
    expect(launchHop(run, HELIOPAUSE)).toMatchObject({ kind: 'invalid-target' });
  });
});
