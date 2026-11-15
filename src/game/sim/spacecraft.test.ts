import { describe, expect, it } from 'vitest';
import {
  availableDeltaV,
  CHASSIS_IDS,
  kilograms,
  newSpacecraft,
  refit,
  seconds,
  type Spacecraft,
} from './index.ts';
import { radarReach, withDamage } from './spacecraft.ts';

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

  it('the Chassis differ in dry mass, Fuel capacity and engine', () => {
    const chassis = CHASSIS_IDS.map((id) => newSpacecraft(id));
    for (const key of ['dryMass', 'fuelCapacity', 'engineIsp'] as const) {
      expect(new Set(chassis.map((spacecraft) => spacecraft[key])).size).toBe(3);
    }
  });

  it("the Chassis' starting Δv differs noticeably: each at least 10% apart", () => {
    const deltaVs = CHASSIS_IDS.map((id) => availableDeltaV(newSpacecraft(id))).sort(
      (a, b) => a - b,
    );
    for (let i = 1; i < deltaVs.length; i++) {
      expect(deltaVs[i]).toBeGreaterThanOrEqual((deltaVs[i - 1] ?? Infinity) * 1.1);
    }
  });

  it('the Chassis with the most Fuel is not the one with the most Δv: mass matters', () => {
    const byFuel = [...CHASSIS_IDS].sort(
      (a, b) => newSpacecraft(b).fuelCapacity - newSpacecraft(a).fuelCapacity,
    );
    const byDeltaV = [...CHASSIS_IDS].sort(
      (a, b) => availableDeltaV(newSpacecraft(b)) - availableDeltaV(newSpacecraft(a)),
    );
    expect(byFuel[0]).not.toBe(byDeltaV[0]);
  });
});

describe('a Damaged Radar', () => {
  it('sees half as far, and a sound one sees its full range', () => {
    const sound = refit(newSpacecraft('scout'), [
      'engine-1',
      'fuel-tank-1',
      'radar-1',
      null,
      null,
      null,
    ]);
    const damaged = withDamage(
      sound,
      sound.damage.map((_, i) => (i === 2 ? { repair: null, burning: null } : null)),
    );
    expect(radarReach(sound)?.range).toBe(6);
    expect(radarReach(damaged)?.range).toBe(3);
  });
});
