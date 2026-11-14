import { describe, expect, it } from 'vitest';
import {
  BODY_TUNING,
  CHASSIS_IDS,
  COMPONENTS,
  COMPONENT_IDS,
  homePlanet,
  kilograms,
  collectYield,
  launchHop,
  listBodies,
  materials,
  startRun,
  STARTING_MATERIALS,
  type Run,
} from './index.ts';
import { homeMoon, landedOn } from './testing.ts';

function withFuel(run: Run, fuel: number): Run {
  return { ...run, spacecraft: { ...run.spacecraft, fuelMass: kilograms(fuel) } };
}

describe('landing collects a Body’s yield', () => {
  const run = startRun(2026, 'scout');
  const moon = homeMoon(run);

  it('landing on an Icy Body adds Fuel up to Tank capacity', () => {
    expect(moon.composition).toBe('icy');
    const result = collectYield(withFuel(run, 1_000), moon.id);
    expect(result.collection).toEqual({
      kind: 'fuel',
      collected: moon.baseYield,
      leftBehind: kilograms(0),
    });
    expect(result.run.spacecraft.fuelMass).toBe(1_000 + moon.baseYield);
    expect(result.run.materials).toBe(run.materials);
  });

  it('Fuel beyond Tank capacity is reported as left behind', () => {
    const nearlyFull = withFuel(run, run.spacecraft.fuelCapacity - 1_000);
    const result = collectYield(nearlyFull, moon.id);
    expect(result.run.spacecraft.fuelMass).toBe(run.spacecraft.fuelCapacity);
    expect(result.collection).toEqual({
      kind: 'fuel',
      collected: kilograms(1_000),
      leftBehind: kilograms(moon.baseYield - 1_000),
    });
  });

  it('landing on a Rocky Body adds Materials', () => {
    const home = homePlanet(run.starSystem);
    expect(home.composition).toBe('rocky');
    const away = landedOn(run, moon.id);
    const result = collectYield(away, home.id);
    expect(result.collection).toEqual({ kind: 'materials', collected: home.baseYield });
    expect(result.run.materials).toBe(away.materials + home.baseYield);
    expect(result.run.spacecraft.fuelMass).toBe(away.spacecraft.fuelMass);
  });

  it('a Depleted Body yields nothing', () => {
    const first = collectYield(withFuel(run, 1_000), moon.id).run;
    const again = collectYield(withFuel(first, 1_000), moon.id);
    expect(again.collection).toEqual({ kind: 'depleted' });
    expect(again.run.spacecraft.fuelMass).toBe(1_000);
    expect(again.run.materials).toBe(first.materials);
  });

  it('only the Body landed on becomes Depleted', () => {
    expect(collectYield(run, moon.id).run.depleted).toEqual([moon.id]);
    expect(run.depleted).toEqual([]);
  });

  it('a Run’s Materials and Depleted Bodies cannot be changed in place', () => {
    const landed = collectYield(run, moon.id).run;
    const mutable = landed as unknown as { materials: number; depleted: string[] };
    expect(() => (mutable.materials = 1)).toThrow(TypeError);
    expect(() => mutable.depleted.push('x')).toThrow(TypeError);
  });
});

describe('a New Run', () => {
  it('a New Run starts with enough Materials for the cheapest Component', () => {
    const cheapest = Math.min(...COMPONENT_IDS.map((id) => COMPONENTS[id].cost));
    for (const chassisId of CHASSIS_IDS) {
      expect(startRun(7, chassisId).materials).toBeGreaterThanOrEqual(cheapest);
    }
  });

  it('starts with 25 Materials, so a Drill is affordable as well as a Fuel Tank', () => {
    expect(STARTING_MATERIALS).toBe(materials(25));
    expect(COMPONENTS['drill-1'].cost).toBeLessThanOrEqual(STARTING_MATERIALS);
    expect(COMPONENTS['fuel-tank-1'].cost).toBeLessThanOrEqual(STARTING_MATERIALS);
  });

  it('starts with no Body Depleted', () => {
    expect(startRun(7, 'scout').depleted).toEqual([]);
  });
});

describe('an Icy yield against Tank capacity', () => {
  it('is less than the smallest Tank holds, and a real refill for the largest', () => {
    const capacities = CHASSIS_IDS.map((id) => startRun(1, id).spacecraft.fuelCapacity);
    expect(BODY_TUNING.baseYield.icy.max).toBeLessThan(Math.min(...capacities));
    expect(BODY_TUNING.baseYield.icy.min).toBeGreaterThan(Math.max(...capacities) * 0.04);
  });
});

describe('collection on arrival', () => {
  const run = startRun(2026, 'scout');
  const moon = homeMoon(run);

  it('an arrived Hop collects the target’s yield and Depletes it', () => {
    const result = launchHop(run, moon.id);
    if (result.kind !== 'flown') throw new Error('Expected a flown Hop');
    expect(result.flight.outcome.kind).toBe('arrived');
    expect(result.flight.collection).toMatchObject({ kind: 'fuel' });
    expect(result.run.depleted).toEqual([moon.id]);
    expect(result.run.spacecraft.fuelMass).toBeGreaterThan(result.flight.fuelRemaining);
  });

  it('the flight reports the Fuel left by the Hop itself, before collection', () => {
    const result = launchHop(run, moon.id);
    if (result.kind !== 'flown') throw new Error('Expected a flown Hop');
    const { collection, fuelRemaining } = result.flight;
    if (collection?.kind !== 'fuel') throw new Error('Expected Fuel collected');
    expect(result.run.spacecraft.fuelMass).toBeCloseTo(fuelRemaining + collection.collected);
  });

  it('a failed Hop collects nothing', () => {
    const empty = withFuel(run, 1);
    const result = launchHop(empty, moon.id);
    if (result.kind !== 'flown') throw new Error('Expected a flown Hop');
    expect(result.flight.outcome.kind).not.toBe('arrived');
    expect(result.flight.collection).toBeNull();
    expect(result.run.depleted).toEqual([]);
    expect(result.run.materials).toBe(empty.materials);
  });
});

describe('Fuel left behind in a real Run', () => {
  it('seed 14, scout: the Hop to Konvin after Lydruthyx leaves Fuel behind', () => {
    const start = startRun(14, 'scout');
    const named = (run: Run, name: string) => {
      const body = listBodies(run.starSystem).find((b) => b.name === name);
      if (!body) throw new Error(`no Body ${name}`);
      return body.id;
    };
    const first = launchHop(start, named(start, 'Lydruthyx'));
    if (first.kind !== 'flown') throw new Error('Expected a flown Hop');
    const second = launchHop(first.run, named(first.run, 'Konvin'));
    if (second.kind !== 'flown') throw new Error('Expected a flown Hop');
    const { collection } = second.flight;
    if (collection?.kind !== 'fuel') throw new Error('Expected Fuel collected');
    expect(collection.leftBehind).toBeGreaterThan(0);
    expect(second.run.spacecraft.fuelMass).toBe(second.run.spacecraft.fuelCapacity);
  });
});
