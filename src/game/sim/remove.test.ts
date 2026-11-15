import { describe, expect, it } from 'vitest';
import {
  availableDeltaV,
  COMPONENTS,
  install,
  materials,
  refit,
  remove,
  startRun,
  STARTING_MATERIALS,
  type Run,
} from './index.ts';

const run = startRun(2026, 'scout');

function removed(result: ReturnType<typeof remove>): Extract<typeof result, { kind: 'removed' }> {
  if (result.kind !== 'removed') throw new Error(`Expected a removal, got ${result.reason.kind}`);
  return result;
}

/** A Run with Slots `['engine-1', 'fuel-tank-1', 'fuel-tank-1', 'drill-1', null, null]`, back to the starting purse. */
function fitted(): Run {
  let rich: Run = { ...run, materials: materials(500) };
  for (const [slot, id] of [
    [2, 'fuel-tank-1'],
    [3, 'drill-1'],
  ] as const) {
    const result = install(rich, slot, id);
    if (result.kind !== 'installed') throw new Error('expected an install');
    rich = result.run;
  }
  return { ...rich, materials: materials(STARTING_MATERIALS) };
}

describe('removing an Instrument', () => {
  it('refunds half its Materials, rounded down, and leaves Stranded a lighter configuration', () => {
    const fit = install(run, 2, 'camera');
    if (fit.kind !== 'installed') throw new Error('expected an install');
    const result = removed(remove(fit.run, 2));
    expect(result.refund).toBe(Math.floor(COMPONENTS.camera.cost / 2));
    expect(result.run.spacecraft.slots).toEqual(run.spacecraft.slots);
    expect(result.run.spacecraft.dryMass).toBe(run.spacecraft.dryMass);
  });
});

describe('removing a Component', () => {
  it('removing a Component refunds half its Materials', () => {
    // Drill level 1 costs 25: half is 12.5, rounded down.
    expect(COMPONENTS['drill-1'].cost).toBe(25);
    const drill = removed(remove(fitted(), 3));
    expect(drill.refund).toBe(12);
    expect(drill.run.materials).toBe(STARTING_MATERIALS + 12);
    expect(drill.run.spacecraft.slots).toEqual([
      'engine-1',
      'fuel-tank-1',
      'fuel-tank-1',
      null,
      null,
      null,
    ]);
    const tank = removed(remove(fitted(), 2));
    expect(tank.refund).toBe(10);
    expect(tank.run.materials).toBe(STARTING_MATERIALS + 10);
  });

  it('refits the Spacecraft and leaves the rest of the Run as it was', () => {
    const before = fitted();
    const after = removed(remove(before, 3)).run;
    expect(after.spacecraft).toEqual(
      refit(before.spacecraft, ['engine-1', 'fuel-tank-1', 'fuel-tank-1', null, null, null]),
    );
    expect(availableDeltaV(after.spacecraft)).toBeGreaterThan(availableDeltaV(before.spacecraft));
    expect(after.status).toEqual(before.status);
    expect(before.spacecraft.slots[3]).toBe('drill-1');
  });

  it('the last Engine cannot be removed', () => {
    expect(remove(run, 0)).toEqual({ kind: 'refused', reason: { kind: 'last-engine' } });
  });

  it('removes an Engine when another one stays', () => {
    const rich: Run = { ...run, materials: materials(500) };
    const result = install(rich, 2, 'engine-2');
    if (result.kind !== 'installed') throw new Error('expected an install');
    expect(removed(remove(result.run, 0)).run.spacecraft.slots).toEqual([
      null,
      'fuel-tank-1',
      'engine-2',
      null,
      null,
      null,
    ]);
  });

  it('the last Fuel Tank cannot be removed', () => {
    expect(remove(run, 1)).toEqual({ kind: 'refused', reason: { kind: 'last-fuel-tank' } });
  });

  it('removing a Fuel Tank caps Fuel at the new capacity', () => {
    const before = fitted();
    // Fill both Tanks, then take one away: the Fuel it held no longer fits.
    const full: Run = {
      ...before,
      spacecraft: { ...before.spacecraft, fuelMass: before.spacecraft.fuelCapacity },
    };
    const after = removed(remove(full, 2));
    expect(after.run.spacecraft.fuelCapacity).toBeLessThan(full.spacecraft.fuelCapacity);
    expect(after.run.spacecraft.fuelMass).toBe(after.run.spacecraft.fuelCapacity);
    expect(after.fuelLost).toBe(full.spacecraft.fuelMass - after.run.spacecraft.fuelMass);
    expect(after.fuelLost).toBeGreaterThan(0);
  });

  it('loses no Fuel when the Fuel still fits', () => {
    // The Scout's Fuel fills one Tank; the second Tank is empty, so removing it loses nothing.
    expect(removed(remove(fitted(), 2)).fuelLost).toBe(0);
  });

  it('refuses an empty Slot', () => {
    expect(remove(run, 2)).toEqual({ kind: 'refused', reason: { kind: 'empty-slot', slot: 2 } });
  });

  it('throws for a Slot that does not exist', () => {
    expect(() => remove(run, 6)).toThrow(RangeError);
  });
});
