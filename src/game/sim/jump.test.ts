import { describe, expect, it } from 'vitest';
import {
  carriesJumpDrive,
  componentCost,
  COMPONENTS,
  currentBody,
  generateSystem,
  HELIOPAUSE,
  homePlanet,
  install,
  isDepleted,
  launchHop,
  listBodies,
  materials,
  planHop,
  score,
  startRun,
  starSystemNumber,
  type HopFlight,
  type Run,
} from './index.ts';
import { homeMoon, plan, withDeltaV, withJumpDrive } from './testing.ts';

/**
 * `from` with a Jump Drive and Fuel for `share` of the Hop's estimate, flown out to the Heliopause:
 * the Run at Launch, the flight, and the Run the Jump left in the next Star System.
 */
function escape(from: Run, share = 1.3): { before: Run; flight: HopFlight; run: Run } {
  const ready = withJumpDrive(from);
  const before = withDeltaV(ready, plan(ready, HELIOPAUSE).totalEstimate * share);
  const launched = launchHop(before, HELIOPAUSE);
  if (launched.kind !== 'flown' || launched.flight.outcome.kind !== 'reached-heliopause') {
    throw new Error('Expected the Hop to reach the Heliopause');
  }
  return { before, flight: launched.flight, run: launched.run };
}

/** The best Success Chance of a Hop from the Home Planet to one of its (Icy) Moons. */
function bestHomeMoonChance(run: Run): number {
  return Math.max(
    ...homePlanet(run.starSystem).moons.map((moon) => {
      const planned = planHop(run, moon.id);
      return planned.kind === 'planned' ? planned.plan.successChance : 0;
    }),
  );
}

const start = startRun(2026, 'hauler');
const escaped = escape(start);

describe('the Jump', () => {
  it("the Jump lands on the next Star System's Home Planet", () => {
    const jumped = escaped.run;
    expect(jumped.starSystem).toEqual(generateSystem(2026, 2));
    expect(jumped.status).toEqual({ kind: 'landed', bodyId: jumped.starSystem.homePlanetId });
    expect(currentBody(jumped)).toEqual(homePlanet(jumped.starSystem));
  });

  it('the Jump raises the difficulty level', () => {
    const jumped = escaped.run;
    expect(starSystemNumber(escaped.before)).toBe(1);
    expect(starSystemNumber(jumped)).toBe(2);
    // One Star System escaped, and the next Jump Drive costs more.
    expect(score(jumped).starSystemsEscaped).toBe(1);
    expect(componentCost('jump-drive', starSystemNumber(jumped))).toBeGreaterThan(
      componentCost('jump-drive', starSystemNumber(escaped.before)),
    );
  });

  it('the Jump keeps Components except the Jump Drive', () => {
    // A Drill in Slot 3 and the Jump Drive in Slot 4: the Jump burns out only the Jump Drive.
    const drilled = install({ ...start, materials: materials(1_000) }, 2, 'drill-1');
    if (drilled.kind !== 'installed') throw new Error('Expected an install');
    const { before, run: jumped } = escape(drilled.run);
    expect(before.spacecraft.slots).toEqual(['engine-1', 'fuel-tank-1', 'drill-1', 'jump-drive']);
    expect(jumped.spacecraft.slots).toEqual(['engine-1', 'fuel-tank-1', 'drill-1', null]);
    expect(carriesJumpDrive(jumped.spacecraft)).toBe(false);
    // Burnt out, not removed: no Materials come back for it.
    expect(jumped.materials).toBe(before.materials);
    // Without the Jump Drive the Spacecraft is lighter by exactly its mass.
    expect(jumped.spacecraft.dryMass).toBeCloseTo(
      before.spacecraft.dryMass - COMPONENTS['jump-drive'].mass,
    );
  });

  it('the Jump keeps Fuel and Materials', () => {
    const { flight, run: jumped } = escape({ ...start, materials: materials(73) }, 2);
    expect(jumped.spacecraft.fuelMass).toBe(flight.fuelRemaining);
    expect(jumped.materials).toBe(materials(73));
    expect(jumped.hopsFlown).toBe(1);
  });

  it("the Jump leaves enough Fuel for a 100% Hop to the new Home Planet's Icy Moon", () => {
    // Fuel for the Heliopause's worst case and no more: the Spacecraft gets there nearly dry.
    const { flight, run: jumped } = escape(start, 1.105);
    expect(
      bestHomeMoonChance({
        ...jumped,
        spacecraft: { ...jumped.spacecraft, fuelMass: flight.fuelRemaining },
      }),
    ).toBe(0);
    expect(jumped.spacecraft.fuelMass).toBeGreaterThan(flight.fuelRemaining);
    expect(jumped.spacecraft.fuelMass).toBeLessThanOrEqual(jumped.spacecraft.fuelCapacity);
    expect(bestHomeMoonChance(jumped)).toBe(1);
  });

  it('a player who arrives with more Fuel keeps it', () => {
    const nearlyDry = escape(start, 1.105).run.spacecraft.fuelMass;
    const { flight, run: jumped } = escape(start, 2);
    expect(flight.fuelRemaining).toBeGreaterThan(nearlyDry);
    expect(jumped.spacecraft.fuelMass).toBe(flight.fuelRemaining);
  });

  it('every Body of the next Star System still has its yield, whatever was gathered before', () => {
    // Gather on the Home Planet's Moon first: its id is reused by a Body of the next Star System.
    const gathered = launchHop(start, homeMoon(start).id);
    if (gathered.kind !== 'flown') throw new Error('Expected a Hop to the Moon');
    expect(gathered.run.depleted).not.toEqual([]);
    const jumped = escape(gathered.run).run;
    for (const body of listBodies(jumped.starSystem)) {
      expect(isDepleted(jumped, body.id)).toBe(false);
    }
  });

  it('the next Home Planet keeps the Home Planet guarantees: Rocky, with Icy Moons', () => {
    const home = homePlanet(escaped.run.starSystem);
    expect(home.composition).toBe('rocky');
    expect(home.moons.length).toBeGreaterThan(0);
    for (const moon of home.moons) expect(moon.composition).toBe('icy');
  });

  it('a Run replays identically by seed across two Jumps', () => {
    /** Two Jumps, then a Hop to the third Home Planet's Moon. */
    const play = (seed: number) => {
      const second = escape(startRun(seed, 'lancer')).run;
      const third = escape(second).run;
      const hop = launchHop(third, homeMoon(third).id);
      return { second, third, hop };
    };
    const first = play(77);
    expect(play(77)).toEqual(first);
    expect(starSystemNumber(first.third)).toBe(3);
    expect(first.third.starSystem).toEqual(generateSystem(77, 3));
    expect(first.third.starSystem.name).not.toBe(first.second.starSystem.name);
    expect(play(78).third.starSystem.name).not.toBe(first.third.starSystem.name);
  });
});
