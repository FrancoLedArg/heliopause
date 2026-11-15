import { describe, expect, it } from 'vitest';
import {
  assessStranding,
  carriesJumpDrive,
  CHASSIS_IDS,
  componentCost,
  COMPONENTS,
  currentBody,
  generateSystem,
  HELIOPAUSE,
  install,
  isDepleted,
  launchHop,
  listBodies,
  materials,
  planHop,
  score,
  startRun,
  startingMoon,
  starSystemNumber,
  type HopFlight,
  type Run,
} from './index.ts';
import {
  firstTarget,
  heliopauseFound,
  landedOn,
  plan,
  withDeltaV,
  withJumpDrive,
} from './testing.ts';

/**
 * `from` with a Jump Drive and Fuel for `share` of the Hop's estimate, flown out to the Heliopause:
 * the Run at Launch, the flight, and the Run the Jump left in the next Star System.
 */
function escape(from: Run, share = 1.3): { before: Run; flight: HopFlight; run: Run } {
  const ready = heliopauseFound(withJumpDrive(from));
  const before = withDeltaV(ready, plan(ready, HELIOPAUSE).totalEstimate * share);
  const launched = launchHop(before, HELIOPAUSE);
  if (launched.kind !== 'flown' || launched.flight.outcome.kind !== 'reached-heliopause') {
    throw new Error('Expected the Hop to reach the Heliopause');
  }
  return { before, flight: launched.flight, run: launched.run };
}

/** The Success Chance of the Hop from the Starting Moon to the first Body Comms Detected there. */
function firstHopChance(run: Run): number {
  const planned = planHop(run, firstTarget(run).id);
  return planned.kind === 'planned' ? planned.plan.successChance : 0;
}

/** The Fuel and Materials the new Starting Moon gave on arrival. */
function gathered(run: Run): { fuel: number; materials: number } {
  const { startingYield } = run;
  return {
    fuel: startingYield.kind === 'fuel' ? startingYield.collected : 0,
    materials: startingYield.kind === 'materials' ? startingYield.collected : 0,
  };
}

/** The Fuel kept from the Hop plus what the new Starting Moon gave, up to the Tank's capacity. */
function keptAndGathered(flight: HopFlight, jumped: Run): number {
  return Math.min(jumped.spacecraft.fuelCapacity, flight.fuelRemaining + gathered(jumped).fuel);
}

const start = startRun(2026, 'hauler');
const escaped = escape(start);

describe('the Jump', () => {
  it("the Jump maroons the Spacecraft on the next Star System's Starting Moon", () => {
    const jumped = escaped.run;
    expect(jumped.starSystem).toEqual(generateSystem(2026, 2));
    expect(jumped.status).toEqual({ kind: 'landed', bodyId: jumped.starSystem.startingMoonId });
    expect(currentBody(jumped)).toEqual(startingMoon(jumped.starSystem));
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
    expect(jumped.materials).toBe(before.materials + gathered(jumped).materials);
    // Without the Jump Drive the Spacecraft is lighter by exactly its mass.
    expect(jumped.spacecraft.dryMass).toBeCloseTo(
      before.spacecraft.dryMass - COMPONENTS['jump-drive'].mass,
    );
  });

  it('the Jump keeps Fuel and Materials, and adds what the new Starting Moon gives', () => {
    const { flight, run: jumped } = escape({ ...start, materials: materials(73) }, 2);
    expect(jumped.spacecraft.fuelMass).toBeCloseTo(keptAndGathered(flight, jumped));
    expect(jumped.materials).toBe(materials(73 + gathered(jumped).materials));
    expect(jumped.hopsFlown).toBe(1);
  });

  it('the Jump leaves enough Fuel for a 100% Hop to the first Body Comms Detects there', () => {
    // Fuel for the Heliopause's worst case and no more: the Spacecraft gets there nearly dry.
    const { flight, run: jumped } = escape(start, 1.105);
    expect(
      firstHopChance({
        ...jumped,
        spacecraft: { ...jumped.spacecraft, fuelMass: flight.fuelRemaining },
      }),
    ).toBe(0);
    expect(jumped.spacecraft.fuelMass).toBeGreaterThan(flight.fuelRemaining);
    expect(jumped.spacecraft.fuelMass).toBeLessThanOrEqual(jumped.spacecraft.fuelCapacity);
    expect(firstHopChance(jumped)).toBe(1);
  });

  it('a player who arrives with more Fuel keeps it', () => {
    const nearlyDry = escape(start, 1.105).run.spacecraft.fuelMass;
    const { flight, run: jumped } = escape(start, 2);
    expect(flight.fuelRemaining).toBeGreaterThan(nearlyDry);
    expect(jumped.spacecraft.fuelMass).toBeCloseTo(keptAndGathered(flight, jumped));
  });

  it('every Body of the next Star System but its Starting Moon still has its yield, whatever was gathered before', () => {
    // Gather on the first target first: its id may be reused by a Body of the next Star System.
    const hopped = launchHop(start, firstTarget(start).id);
    if (hopped.kind !== 'flown') throw new Error('Expected a Hop to the first target');
    expect(hopped.run.depleted.length).toBe(2);
    const jumped = escape(hopped.run).run;
    for (const body of listBodies(jumped.starSystem)) {
      expect(isDepleted(jumped, body.id)).toBe(body.id === jumped.starSystem.startingMoonId);
    }
  });

  it('a Run replays identically by seed across two Jumps', () => {
    /** Two Jumps, then a Hop to the third Star System's first target. */
    const play = (seed: number) => {
      const second = escape(startRun(seed, 'lancer')).run;
      const third = escape(second).run;
      const hop = launchHop(third, firstTarget(third).id);
      return { second, third, hop };
    };
    const first = play(77);
    expect(play(77)).toEqual(first);
    expect(starSystemNumber(first.third)).toBe(3);
    expect(first.third.starSystem).toEqual(generateSystem(77, 3));
    expect(first.third.starSystem.name).not.toBe(first.second.starSystem.name);
    expect(play(78).third.starSystem.name).not.toBe(first.third.starSystem.name);
  });

  it('with the Fuel floor, an escape never lands where no Hop has a chance', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const chassisId of CHASSIS_IDS) {
        // Fuel for the Heliopause's worst case only: the Spacecraft gets there nearly dry.
        const { run } = escape(startRun(seed, chassisId), 1.105);
        expect(run.status.kind).toBe('landed');
        expect(assessStranding(run)).toEqual({ kind: 'clear' });
      }
    }
  });

  it('a Jump that lands where no Hop could ever have a chance ends the Run as Stranded', () => {
    // Test fixture: deep into a Run, at difficulty level 41, with no Materials left to change the
    // Spacecraft. Level 42's gravity puts every Hop out of reach even with a full Tank. Re-pinned
    // for #189 (was level 40): a Starting Moon is easier to leave than the Home Planet was.
    const deep = (() => {
      const starSystem = generateSystem(2026, 41);
      const at = landedOn(
        { ...start, starSystemNumber: 41, starSystem },
        starSystem.startingMoonId,
      );
      return { ...escape(at).before, materials: materials(0) };
    })();
    const launched = launchHop(deep, HELIOPAUSE);
    if (launched.kind !== 'flown') throw new Error('Expected the Hop to the Heliopause');
    expect(launched.flight.outcome.kind).toBe('reached-heliopause');
    const { run } = launched;
    expect(run.starSystemNumber).toBe(42);
    expect(run.status).toMatchObject({
      kind: 'ended',
      end: { kind: 'stranded', bodyId: run.starSystem.startingMoonId },
    });
    expect(score(run).starSystemsEscaped).toBe(41);
  });
});
