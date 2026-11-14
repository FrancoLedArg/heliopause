import { describe, expect, it } from 'vitest';
import { availableDeltaV, CHASSIS_IDS, newSpacecraft } from './index.ts';

describe('Slots', () => {
  it('a new Spacecraft has 4 Slots: a level-1 Engine, a level-1 Fuel Tank and 2 empty', () => {
    for (const id of CHASSIS_IDS) {
      expect(newSpacecraft(id).slots).toEqual(['engine-1', 'fuel-tank-1', null, null]);
    }
  });

  it("a new Spacecraft's starting Components give exactly Spec A's dry mass, Fuel capacity and Δv", () => {
    // Spec A's CHASSIS_TUNING, before Components: the Δv is Isp × g0 × ln(wet mass / dry mass).
    const specA = {
      scout: { dryMass: 4_000, fuelCapacity: 21_000, engineIsp: 1_230, deltaV: 22_104.93 },
      hauler: { dryMass: 15_000, fuelCapacity: 66_000, engineIsp: 1_210, deltaV: 20_010.89 },
      lancer: { dryMass: 6_000, fuelCapacity: 36_000, engineIsp: 1_280, deltaV: 24_426.06 },
    };
    for (const id of CHASSIS_IDS) {
      const spacecraft = newSpacecraft(id);
      expect(spacecraft.dryMass).toBe(specA[id].dryMass);
      expect(spacecraft.fuelCapacity).toBe(specA[id].fuelCapacity);
      expect(spacecraft.fuelMass).toBe(specA[id].fuelCapacity);
      expect(spacecraft.engineIsp).toBe(specA[id].engineIsp);
      expect(availableDeltaV(spacecraft)).toBeCloseTo(specA[id].deltaV, 2);
    }
  });
});
