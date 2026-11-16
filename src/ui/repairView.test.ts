import { describe, expect, it } from 'vitest';
import {
  advanceCruise,
  beginHop,
  firstDetectedBody,
  materials,
  startRepair,
  startRun,
  type Run,
} from '../game/sim/index.ts';
import { anyDamaged, repairAction, repairName, repairState } from './repairView.ts';

const FUEL_TANK = 1;
const opening = startRun(2026, 'scout');
const target = firstDetectedBody(opening.starSystem).id;

/** The opening Run's first Cruise, its Fuel Tank leaking from tick 100. */
function leaking(): Run {
  const begun = beginHop(opening, target, {
    schedule: [{ kind: 'fuel-leak', tick: 100, slot: FUEL_TANK }],
  });
  if (begun.kind !== 'cruising') throw new Error('Expected a Cruise');
  const struck = advanceCruise(begun.run, 100);
  if (struck.kind !== 'cruising') throw new Error('Expected to be cruising');
  return struck.run;
}

function repairing(run: Run, tick: number): Run {
  const started = startRepair(run, FUEL_TANK);
  if (started.kind !== 'repairing') throw new Error('Expected a Repair');
  const on = advanceCruise(started.run, tick);
  if (on.kind !== 'cruising') throw new Error('Expected to be cruising');
  return on.run;
}

describe('the Repair as the player sees it', () => {
  it('a sound Component has nothing to Repair', () => {
    expect(repairState(opening, FUEL_TANK)).toEqual({ kind: 'sound' });
    expect(repairAction(repairState(opening, FUEL_TANK))).toBeUndefined();
    expect(anyDamaged(opening)).toBe(false);
  });

  it('a Damaged Component starts its Repair first, then Rushes it, its price falling as the ring fills', () => {
    const run = leaking();
    expect(anyDamaged(run)).toBe(true);
    // A Fuel Tank's Repair is 30 s: 6 Materials to Rush before it starts.
    expect(repairState(run, FUEL_TANK)).toMatchObject({ progress: null, secondsLeft: 30, rush: 6 });
    expect(repairAction(repairState(run, FUEL_TANK))).toBe('repair');
    // 15 s in: half the ring, 3 Materials.
    const half = repairing(run, 250);
    expect(repairState(half, FUEL_TANK)).toMatchObject({ progress: 0.5, secondsLeft: 15, rush: 3 });
    expect(repairAction(repairState(half, FUEL_TANK))).toBe('rush');
  });

  it('a Rush is priced in Scrap when the Run has enough, else in Materials (#344)', () => {
    const scrappy = repairing({ ...leaking(), scrap: 6, materials: materials(0) }, 101);
    // 29.9 s left: still 6.
    expect(repairState(scrappy, FUEL_TANK)).toMatchObject({
      rush: 6,
      paidIn: 'scrap',
      affordable: true,
    });
    expect(repairName('fuel-tank-1', repairState(scrappy, FUEL_TANK))).toMatch(/Rush for 6 Scrap$/);
    const short = repairing({ ...leaking(), scrap: 5 }, 101);
    expect(repairState(short, FUEL_TANK)).toMatchObject({ paidIn: 'materials', affordable: true });
    expect(repairName('fuel-tank-1', repairState(short, FUEL_TANK))).toMatch(
      /Rush for 6 Materials$/,
    );
  });

  it('a Rush the Materials cannot pay for is not offered', () => {
    const broke = repairing({ ...leaking(), materials: materials(2) }, 101);
    expect(repairState(broke, FUEL_TANK)).toMatchObject({ affordable: false });
    expect(repairAction(repairState(broke, FUEL_TANK))).toBeUndefined();
  });

  it('the accessible name says what is Damaged and what Enter does', () => {
    const run = leaking();
    const id = 'fuel-tank-1';
    expect(repairName(id, repairState(opening, FUEL_TANK))).toBe('Fuel Tank 1: working');
    expect(repairName(id, repairState(run, FUEL_TANK))).toBe(
      'Fuel Tank 1: Damaged, leaking Fuel. Repair, 30 s',
    );
    expect(repairName(id, repairState(repairing(run, 250), FUEL_TANK))).toBe(
      'Fuel Tank 1: Repairing, 15 s left. Rush for 3 Materials',
    );
  });

  it('the accessible name says a burning Engine is on fire (#251)', () => {
    const begun = beginHop(opening, target, {
      schedule: [{ kind: 'engine-fire', tick: 100, slot: 0 }],
    });
    if (begun.kind !== 'cruising') throw new Error('Expected a Cruise');
    const struck = advanceCruise(begun.run, 100);
    if (struck.kind !== 'cruising') throw new Error('Expected to be cruising');
    expect(repairName('engine-1', repairState(struck.run, 0))).toBe(
      'Engine 1: Damaged, on fire. Repair, 40 s',
    );
  });
});
