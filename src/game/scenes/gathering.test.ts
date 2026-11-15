import { describe, expect, it } from 'vitest';
import {
  install,
  kilograms,
  launchHop,
  listBodies,
  materials,
  startRun,
  type Run,
} from '../sim/index.ts';
import { describeGathering } from './gathering.ts';

const run = startRun(2046, 'scout');
// The innermost planet's first Moon (seed 2046's is Icy), as the Home Planet's was before #189.
// Re-pinned for #247 (was seed 2026): the Isp rise settles seed 2026 on another Star System.
const moon = run.starSystem.planets[0]?.moons[0];
if (!moon) throw new Error('The innermost planet has a Moon');
const onMoon: Run = { ...run, status: { kind: 'landed', bodyId: moon.id } };

describe('the gathering moment', () => {
  it('counts the Fuel readout up from what the Hop left to what landing brought aboard', () => {
    const after: Run = {
      ...onMoon,
      spacecraft: { ...onMoon.spacecraft, fuelMass: kilograms(9_000) },
    };
    expect(
      describeGathering(after, {
        kind: 'fuel',
        collected: kilograms(5_100),
        leftBehind: kilograms(0),
      }),
    ).toEqual({ resource: 'fuel', from: 3_900, to: 9_000, leftBehind: 0, drill: false });
  });

  it('counts the Materials readout up by what a Rocky Body gave', () => {
    const after: Run = { ...onMoon, materials: materials(20) };
    expect(describeGathering(after, { kind: 'materials', collected: materials(12) })).toEqual({
      resource: 'materials',
      from: 8,
      to: 20,
      drill: false,
    });
  });

  it('spills what a full Tank left behind, even when nothing more came aboard', () => {
    expect(
      describeGathering(onMoon, {
        kind: 'fuel',
        collected: kilograms(0),
        leftBehind: kilograms(700),
      }),
    ).toMatchObject({ resource: 'fuel', leftBehind: 700 });
  });

  it('pulses the Drill when one is installed', () => {
    const drilled = install(onMoon, 2, 'drill-1');
    if (drilled.kind !== 'installed') throw new Error('expected an install');
    expect(
      describeGathering(drilled.run, { kind: 'materials', collected: materials(3) }),
    ).toMatchObject({ drill: true });
  });

  it('plays nothing for a Depleted Body or a Hop that did not land', () => {
    expect(describeGathering(onMoon, { kind: 'depleted' })).toBeUndefined();
    expect(describeGathering(onMoon, null)).toBeUndefined();
  });

  it('reads the Arrived Hop it follows without recomputing it', () => {
    // From the innermost planet, knowing every Body (Runs open on a Starting Moon since #189).
    const ids = listBodies(run.starSystem).map((body) => body.id);
    const onPlanet: Run = {
      ...run,
      status: { kind: 'landed', bodyId: moon.planetId },
      knowledge: { detected: ids, surveyed: ids, heliopauseFound: true },
    };
    const launched = launchHop(onPlanet, moon.id);
    if (launched.kind !== 'flown' || launched.flight.collection?.kind !== 'fuel') {
      throw new Error('seed 2046: the Hop to the first Moon should Arrive with Fuel');
    }
    const gathering = describeGathering(launched.run, launched.flight.collection);
    expect(gathering?.from).toBeCloseTo(launched.flight.fuelRemaining, 6);
    expect(gathering?.to).toBe(launched.run.spacecraft.fuelMass);
  });
});
