import { describe, expect, it } from 'vitest';
import {
  availableDeltaV,
  CHASSIS_IDS,
  COMPONENTS,
  newSpacecraft,
  type Component,
} from './index.ts';

describe('the Component catalogue', () => {
  it('holds an Engine, a Fuel Tank and a Drill, each at levels 1 and 2', () => {
    const kindsAndLevels = Object.values(COMPONENTS).map((c) => `${c.kind} ${String(c.level)}`);
    expect(kindsAndLevels.sort()).toEqual([
      'drill 1',
      'drill 2',
      'engine 1',
      'engine 2',
      'fuel-tank 1',
      'fuel-tank 2',
    ]);
  });

  it('every Component has a mass, a Materials cost, an effect and a one-sentence explanation', () => {
    for (const component of Object.values(COMPONENTS)) {
      expect(component.mass).toBeGreaterThan(0);
      expect(component.cost).toBeGreaterThan(0);
      expect(Number.isInteger(component.cost)).toBe(true);
      expect(effectOf(component)).toBeGreaterThan(0);
      expect(component.explanation).toMatch(/^[A-Z][^.!?]*\.$/);
    }
  });

  it('every Component cites the propulsion research or is marked gameplay tuning', () => {
    for (const { provenance } of Object.values(COMPONENTS)) {
      if (provenance.kind === 'sourced') {
        expect(provenance.source).toContain('docs/research/propulsion-trade-offs.md');
      } else {
        expect(provenance.kind).toBe('gameplay-tuning');
        expect(JSON.stringify(provenance)).not.toContain('"source"');
      }
    }
  });

  it('a level-2 Component weighs and costs more than its level-1 counterpart', () => {
    const levels = [
      [COMPONENTS['engine-1'], COMPONENTS['engine-2']],
      [COMPONENTS['fuel-tank-1'], COMPONENTS['fuel-tank-2']],
      [COMPONENTS['drill-1'], COMPONENTS['drill-2']],
    ] as const;
    for (const [one, two] of levels) {
      expect(two.mass).toBeGreaterThan(one.mass);
      expect(two.cost).toBeGreaterThan(one.cost);
      expect(effectOf(two)).toBeGreaterThan(effectOf(one));
    }
  });
});

/** The figure a Component changes: an Engine's Isp, a Fuel Tank's capacity, a Drill's multiplier. */
function effectOf(component: Component): number {
  switch (component.kind) {
    case 'engine':
      return component.isp;
    case 'fuel-tank':
      return component.fuelCapacity;
    case 'drill':
      return component.yieldMultiplier;
  }
}

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
