import { describe, expect, it } from 'vitest';
import {
  availableDeltaV,
  CHASSIS_IDS,
  COMPONENTS,
  install,
  materials,
  refit,
  startRun,
  STARTING_MATERIALS,
  type Run,
} from './index.ts';

const run = startRun(2026, 'scout');

function installed(result: ReturnType<typeof install>): Run {
  if (result.kind !== 'installed')
    throw new Error(`Expected an install, got ${result.reason.kind}`);
  return result.run;
}

describe('installing a Component', () => {
  it('installing a Component spends its Materials', () => {
    const after = installed(install(run, 2, 'fuel-tank-1'));
    expect(after.materials).toBe(STARTING_MATERIALS - COMPONENTS['fuel-tank-1'].cost);
    expect(after.materials).toBe(5);
  });

  it('puts the Component in the Slot and refits the Spacecraft, so the Δv changes', () => {
    const after = installed(install(run, 2, 'fuel-tank-1'));
    expect(after.spacecraft.slots).toEqual(['engine-1', 'fuel-tank-1', 'fuel-tank-1', null]);
    expect(after.spacecraft).toEqual(
      refit(run.spacecraft, ['engine-1', 'fuel-tank-1', 'fuel-tank-1', null]),
    );
    // Fuel stays what it was: the new Tank is empty until the Spacecraft refuels.
    expect(after.spacecraft.fuelMass).toBe(run.spacecraft.fuelMass);
    expect(availableDeltaV(after.spacecraft)).toBeLessThan(availableDeltaV(run.spacecraft));
  });

  it('leaves the rest of the Run as it was', () => {
    const after = installed(install(run, 3, 'drill-1'));
    expect(after.status).toEqual(run.status);
    expect(after.depleted).toEqual(run.depleted);
    expect(run.spacecraft.slots[3]).toBeNull();
  });

  it('installing needs an empty Slot', () => {
    const rich = { ...run, materials: materials(500) };
    const full = installed(install(installed(install(rich, 2, 'drill-1')), 3, 'drill-1'));
    expect(install(full, 0, 'fuel-tank-1')).toEqual({
      kind: 'refused',
      reason: { kind: 'no-empty-slot' },
    });
  });

  it('refuses a Slot that is already taken while another is empty', () => {
    expect(install(run, 0, 'fuel-tank-1')).toEqual({
      kind: 'refused',
      reason: { kind: 'slot-taken', slot: 0, holds: 'engine-1' },
    });
  });

  it('installing needs enough Materials', () => {
    const poor = { ...run, materials: materials(29) };
    expect(install(poor, 2, 'engine-1')).toEqual({
      kind: 'refused',
      reason: { kind: 'not-enough-materials', cost: 30, have: 29, short: 1 },
    });
    const exact = { ...run, materials: materials(30) };
    expect(installed(install(exact, 2, 'engine-1')).materials).toBe(0);
  });

  it('throws for a Slot that does not exist', () => {
    expect(() => install(run, 4, 'drill-1')).toThrow(RangeError);
  });

  it('accepts every Slot of the Chassis and refuses one past it', () => {
    const slotCounts = { scout: 4, lancer: 5, hauler: 6 };
    for (const id of CHASSIS_IDS) {
      const rich = { ...startRun(2026, id), materials: materials(500) };
      const last = slotCounts[id] - 1;
      expect(installed(install(rich, last, 'drill-1')).spacecraft.slots[last]).toBe('drill-1');
      expect(() => install(rich, last + 1, 'drill-1')).toThrow(RangeError);
    }
  });
});
