import { describe, expect, it } from 'vitest';
import {
  availableDeltaV,
  CHASSIS_IDS,
  kilograms,
  newSpacecraft,
  refit,
  seconds,
  type ChassisId,
  type Spacecraft,
} from './index.ts';

/** The Chassis with only the calibration loadout, a level-1 Engine and Fuel Tank (ADR 0005). */
function calibrated(id: ChassisId): Spacecraft {
  const start = newSpacecraft(id);
  return refit(
    start,
    start.slots.map((_, i) => (['engine-1', 'fuel-tank-1'] as const)[i] ?? null),
  );
}

describe('Δv from Fuel', () => {
  it('follows the rocket equation: Isp × g0 × ln(wet mass / dry mass)', () => {
    // Worked example: 450 s × 9.80665 m/s² × ln(10 t / 2 t) = 4,413 m/s × 1.6094 = 7,102.4 m/s.
    const spacecraft: Spacecraft = {
      chassisId: 'scout',
      slots: newSpacecraft('scout').slots,
      damage: newSpacecraft('scout').damage,
      dryMass: kilograms(2_000),
      fuelMass: kilograms(8_000),
      fuelCapacity: kilograms(8_000),
      engineIsp: seconds(450),
    };
    expect(availableDeltaV(spacecraft)).toBeCloseTo(7_102.4, 0);
  });

  it('a heavier Spacecraft gets less Δv from the same Fuel', () => {
    const light = newSpacecraft('scout');
    const heavy: Spacecraft = { ...light, dryMass: kilograms(light.dryMass * 2) };
    expect(availableDeltaV(heavy)).toBeLessThan(availableDeltaV(light));
  });

  it('a Spacecraft with no Fuel has no Δv', () => {
    expect(availableDeltaV({ ...newSpacecraft('hauler'), fuelMass: kilograms(0) })).toBe(0);
  });
});

describe('Chassis', () => {
  it('there are three Chassis: scout, hauler and lancer', () => {
    expect([...CHASSIS_IDS].sort()).toEqual(['hauler', 'lancer', 'scout']);
  });

  it('a new Spacecraft takes its dry mass, Fuel capacity and engine from its Chassis, Fuel full', () => {
    for (const id of CHASSIS_IDS) {
      const spacecraft = newSpacecraft(id);
      expect(spacecraft.chassisId).toBe(id);
      expect(spacecraft.dryMass).toBeGreaterThan(0);
      expect(spacecraft.engineIsp).toBeGreaterThan(0);
      expect(spacecraft.fuelCapacity).toBeGreaterThan(0);
      expect(spacecraft.fuelMass).toBe(spacecraft.fuelCapacity);
    }
  });

  it('on the calibration loadout, the Chassis differ in dry mass, Fuel capacity and engine', () => {
    const chassis = CHASSIS_IDS.map((id) => calibrated(id));
    for (const key of ['dryMass', 'fuelCapacity', 'engineIsp'] as const) {
      expect(new Set(chassis.map((spacecraft) => spacecraft[key])).size).toBe(3);
    }
  });

  it("on the calibration loadout, the Chassis' Δv differs noticeably: each at least 10% apart", () => {
    const deltaVs = CHASSIS_IDS.map((id) => availableDeltaV(calibrated(id))).sort((a, b) => a - b);
    for (let i = 1; i < deltaVs.length; i++) {
      expect(deltaVs[i]).toBeGreaterThanOrEqual((deltaVs[i - 1] ?? Infinity) * 1.1);
    }
  });

  it('on the calibration loadout, the Chassis with the most Fuel is not the one with the most Δv: mass matters', () => {
    const byFuel = [...CHASSIS_IDS].sort(
      (a, b) => calibrated(b).fuelCapacity - calibrated(a).fuelCapacity,
    );
    const byDeltaV = [...CHASSIS_IDS].sort(
      (a, b) => availableDeltaV(calibrated(b)) - availableDeltaV(calibrated(a)),
    );
    expect(byFuel[0]).not.toBe(byDeltaV[0]);
  });
});
