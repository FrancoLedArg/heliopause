import { describe, expect, it } from 'vitest';
import {
  BODY_TUNING,
  CHASSIS_IDS,
  COMPONENTS,
  COMPONENT_IDS,
  kilograms,
  collectYield,
  depositLevel,
  launchHop,
  listBodies,
  materials,
  planHop,
  refit,
  startRun,
  STARTING_MATERIALS,
  type LandableBody,
  type Run,
  type Slot,
} from './index.ts';
import { knowingEverything, landedOn, onInnerPlanet } from './testing.ts';

/**
 * A Run standing on the innermost planet, knowing every Body and with none Depleted: for the rules
 * of gathering, apart from the opening (the Starting Moon's own yield is the opening's rule).
 */
function fresh(seed: number): Run {
  return { ...onInnerPlanet(startRun(seed, 'scout')), depleted: [] };
}

// Seed 2027, not 2026: from 2026's inner planet no Icy Body is in sure reach within the Hop range (#283).
const SEED = 2027;

/** A Body of `composition` that a Hop from `run` reaches for sure. */
function sureTarget(run: Run, composition: 'icy' | 'rocky'): LandableBody {
  const body = listBodies(run.starSystem).find((b): b is LandableBody => {
    if (!b.landable || b.composition !== composition) return false;
    const planned = planHop(run, b.id);
    return planned.kind === 'planned' && planned.plan.successChance === 1;
  });
  if (!body) throw new Error(`No ${composition} Body in sure reach`);
  return body;
}

function withFuel(run: Run, fuel: number): Run {
  return { ...run, spacecraft: { ...run.spacecraft, fuelMass: kilograms(fuel) } };
}

describe('landing collects a Body’s yield', () => {
  const run = fresh(SEED);
  const moon = sureTarget(run, 'icy');

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
    const home = sureTarget(run, 'rocky');
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

  it('starts with only its Starting Moon Depleted', () => {
    const run = startRun(7, 'scout');
    expect(run.depleted).toEqual([run.starSystem.startingMoonId]);
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
  const run = fresh(SEED);
  const moon = sureTarget(run, 'icy');

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
  // Re-pinned for #189 (was seed 5, Culmusu then Raertha): Runs open on a Starting Moon now.
  // Flown with no Cruise events (#250 turned the Fuel leak on): a leak would drain what is left behind.
  it('seed 98, scout: the Hop to Naeca after Ceprael leaves Fuel behind', () => {
    const start = startRun(98, 'scout');
    const named = (run: Run, name: string) => {
      const body = listBodies(run.starSystem).find((b) => b.name === name);
      if (!body) throw new Error(`no Body ${name}`);
      return body.id;
    };
    const first = launchHop(start, named(start, 'Ceprael'), { events: [] });
    if (first.kind !== 'flown') throw new Error('Expected a flown Hop');
    const second = launchHop(first.run, named(first.run, 'Naeca'), { events: [] });
    if (second.kind !== 'flown') throw new Error('Expected a flown Hop');
    const { collection } = second.flight;
    if (collection?.kind !== 'fuel') throw new Error('Expected Fuel collected');
    expect(collection.leftBehind).toBeGreaterThan(0);
    expect(second.run.spacecraft.fuelMass).toBe(second.run.spacecraft.fuelCapacity);
  });
});

describe('a Drill multiplies yields', () => {
  const base = fresh(SEED);
  const moon = sureTarget(base, 'icy');
  const home = sureTarget(base, 'rocky');
  const withSlots = (run: Run, slots: readonly Slot[]): Run => ({
    ...run,
    // A roomy Tank, so these tests see the multiplier and not the Tank's cap.
    spacecraft: {
      ...run.spacecraft,
      ...refit(run.spacecraft, slots),
      fuelCapacity: kilograms(100_000),
      fuelMass: kilograms(500),
    },
  });
  const drill1 = withSlots(base, ['engine-1', 'fuel-tank-1', 'drill-1', null, null, null]);

  it('a level-1 Drill yields 1.5 times the Fuel from an Icy Body', () => {
    const result = collectYield(drill1, moon.id);
    expect(result.collection).toEqual({
      kind: 'fuel',
      collected: kilograms(moon.baseYield * 1.5),
      leftBehind: kilograms(0),
    });
  });

  it('a Drill increases each Body’s yield', () => {
    const none = withSlots(base, ['engine-1', 'fuel-tank-1', null, null, null, null]);
    const fuelOf = (run: Run, id: typeof moon.id) => collectYield(run, id).collection;
    const without = fuelOf(none, moon.id);
    const withDrill = fuelOf(drill1, moon.id);
    if (without.kind !== 'fuel' || withDrill.kind !== 'fuel') throw new Error('The Moon is Icy');
    expect(withDrill.collected).toBeGreaterThan(without.collected);
    const rockyWithout = collectYield(landedOn(none, moon.id), home.id).collection;
    const rockyWith = collectYield(landedOn(drill1, moon.id), home.id).collection;
    if (rockyWithout.kind !== 'materials' || rockyWith.kind !== 'materials') {
      throw new Error('The Body is Rocky');
    }
    expect(rockyWith.collected).toBeGreaterThan(rockyWithout.collected);
  });

  it('a level-2 Drill yields more than a level-1 Drill', () => {
    const level2 = withSlots(base, ['engine-1', 'fuel-tank-1', 'drill-2', null, null, null]);
    const one = collectYield(drill1, moon.id).collection;
    const two = collectYield(level2, moon.id).collection;
    if (one.kind !== 'fuel' || two.kind !== 'fuel') throw new Error('The Moon is Icy');
    expect(two.collected).toBeGreaterThan(one.collected);
  });

  it('a Drill still stops at Tank capacity, and the rest is left behind', () => {
    const nearlyFull = {
      ...drill1,
      spacecraft: {
        ...drill1.spacecraft,
        fuelCapacity: kilograms(10_000),
        fuelMass: kilograms(9_000),
      },
    };
    const result = collectYield(nearlyFull, moon.id);
    expect(result.run.spacecraft.fuelMass).toBe(10_000);
    expect(result.collection).toEqual({
      kind: 'fuel',
      collected: kilograms(1_000),
      leftBehind: kilograms(moon.baseYield * 1.5 - 1_000),
    });
  });

  it('a Rocky yield multiplied to a fraction rounds to the nearest whole Material, a half up', () => {
    // 15 × 1.5 = 22.5 -> 23; 14 × 1.5 = 21 exactly; 11 × 1.5 = 16.5 -> 17.
    const rocky = (baseYield: number): Run => ({
      ...away(),
      starSystem: {
        ...base.starSystem,
        // The sure Rocky target may be a planet or a Moon.
        planets: base.starSystem.planets.map((planet) => ({
          ...(planet.id === home.id
            ? { ...planet, composition: 'rocky' as const, baseYield: materials(baseYield) }
            : planet),
          moons: planet.moons.map((m) =>
            m.id === home.id
              ? { ...m, composition: 'rocky' as const, baseYield: materials(baseYield) }
              : m,
          ),
        })),
      },
    });
    function away(): Run {
      return { ...landedOn(drill1, moon.id) };
    }
    for (const [yielded, expected] of [
      [15, 23],
      [14, 21],
      [11, 17],
    ] as const) {
      const result = collectYield(rocky(yielded), home.id);
      expect(result.collection).toEqual({ kind: 'materials', collected: materials(expected) });
    }
  });

  it('the best Drill sets the multiplier: a second Drill adds only mass', () => {
    const two = withSlots(base, ['engine-1', 'drill-1', 'drill-1', 'fuel-tank-1', null, null]);
    const mixed = withSlots(base, ['engine-1', 'drill-1', 'drill-2', 'fuel-tank-1', null, null]);
    const fuel = (run: Run) => collectYield(run, moon.id).collection;
    expect(fuel(two)).toMatchObject({ collected: kilograms(moon.baseYield * 1.5) });
    expect(fuel(mixed)).toMatchObject({ collected: kilograms(moon.baseYield * 2) });
  });

  it('with no Drill a yield is the Body’s base yield', () => {
    expect(
      collectYield(withSlots(base, ['engine-1', null, null, null, null, null]), moon.id).collection,
    ).toMatchObject({ collected: moon.baseYield });
  });

  it('a Drill does not change the Depleted rule', () => {
    const once = collectYield(drill1, moon.id).run;
    expect(collectYield(once, moon.id).collection).toEqual({ kind: 'depleted' });
  });
});

describe('the deposit level of a Body', () => {
  const run = fresh(SEED);
  const moon = sureTarget(run, 'icy');
  const known = knowingEverything(run);

  it('is full for an untouched Surveyed landable Body and empty after landing on it', () => {
    expect(depositLevel(known, moon.id)).toBe('full');
    expect(depositLevel(known, moon.id)).toBe('full');
    expect(depositLevel({ ...known, depleted: [moon.id] }, moon.id)).toBe('empty');
  });

  it('is undefined for a Detected Body', () => {
    const detected: Run = {
      ...known,
      knowledge: {
        ...known.knowledge,
        surveyed: known.knowledge.surveyed.filter((id) => id !== moon.id),
        detected: [...known.knowledge.detected, moon.id],
      },
    };
    expect(depositLevel(detected, moon.id)).toBeUndefined();
  });

  it('is undefined for a Gas Giant', () => {
    const giant = listBodies(known.starSystem).find((b) => !b.landable);
    if (!giant) throw new Error('No Gas Giant in this Star System');
    expect(depositLevel(known, giant.id)).toBeUndefined();
  });
});
