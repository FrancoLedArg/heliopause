import { describe, expect, it } from 'vitest';
import {
  availableDeltaV,
  CHASSIS_IDS,
  componentEffect,
  COMPONENTS,
  fuelAfterBurning,
  kilograms,
  metersPerSecond,
  newSpacecraft,
  refit,
  type Component,
  type Spacecraft,
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

/** A Component's base figure: an Engine's Isp, a Fuel Tank's capacity, a Drill's multiplier. */
function effectOf(component: Component): number {
  switch (component.kind) {
    case 'engine':
      return component.baseIsp;
    case 'fuel-tank':
      return component.baseFuelCapacity;
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

describe('what the installed Components make of the Spacecraft', () => {
  it('Fuel capacity is the sum of the Fuel Tanks', () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      const levelOne = refit(start, ['engine-1', 'fuel-tank-1', null, null]).fuelCapacity;
      const levelTwo = refit(start, ['engine-1', 'fuel-tank-2', null, null]).fuelCapacity;
      expect(refit(start, ['engine-1', 'fuel-tank-1', 'fuel-tank-1', null]).fuelCapacity).toBe(
        levelOne * 2,
      );
      expect(refit(start, ['fuel-tank-2', 'engine-1', 'fuel-tank-1', null]).fuelCapacity).toBe(
        levelOne + levelTwo,
      );
    }
    // Worked example: the scout's 21 t level-1 Tank, twice.
    expect(
      refit(newSpacecraft('scout'), ['engine-1', 'fuel-tank-1', 'fuel-tank-1', null]).fuelCapacity,
    ).toBe(42_000);
  });

  it('a level-2 Engine gives more Δv from the same Fuel', () => {
    for (const id of CHASSIS_IDS) {
      for (const share of [1, 0.5, 0.05]) {
        const start = newSpacecraft(id);
        const levelOne = { ...start, fuelMass: kilograms(start.fuelCapacity * share) };
        const levelTwo = refit(levelOne, ['engine-2', 'fuel-tank-1', null, null]);
        expect(levelTwo.fuelMass).toBe(levelOne.fuelMass);
        expect(availableDeltaV(levelTwo)).toBeGreaterThan(availableDeltaV(levelOne));
      }
    }
  });

  it('adding an empty Fuel Tank lowers Δv', () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      for (const tank of ['fuel-tank-1', 'fuel-tank-2'] as const) {
        const withTank = refit(start, ['engine-1', 'fuel-tank-1', tank, null]);
        expect(withTank.fuelMass).toBe(start.fuelMass);
        expect(availableDeltaV(withTank)).toBeLessThan(availableDeltaV(start));
      }
    }
  });

  it('the best installed Engine sets the Isp', () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      const levelTwo = refit(start, ['engine-2', 'fuel-tank-1', null, null]);
      const both = refit(start, ['engine-1', 'fuel-tank-1', 'engine-2', null]);
      expect(levelTwo.engineIsp).toBeGreaterThan(start.engineIsp);
      expect(both.engineIsp).toBe(levelTwo.engineIsp);
    }
  });

  it('dry mass is the Chassis plus every installed Component', () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      const drilled = refit(start, ['engine-1', 'fuel-tank-1', 'drill-1', 'drill-2']);
      expect(drilled.dryMass).toBe(
        start.dryMass + COMPONENTS['drill-1'].mass + COMPONENTS['drill-2'].mass,
      );
      const bare = refit(start, [null, null, null, null]);
      expect(bare.dryMass).toBe(
        start.dryMass - COMPONENTS['engine-1'].mass - COMPONENTS['fuel-tank-1'].mass,
      );
      expect(bare.dryMass).toBeGreaterThan(0);
    }
  });

  it('a Drill changes neither Fuel capacity nor Isp', () => {
    const start = newSpacecraft('lancer');
    const drilled = refit(start, ['engine-1', 'fuel-tank-1', 'drill-2', null]);
    expect(drilled.fuelCapacity).toBe(start.fuelCapacity);
    expect(drilled.engineIsp).toBe(start.engineIsp);
  });

  it('removing a Fuel Tank keeps only the Fuel the remaining Tanks can hold', () => {
    const start = newSpacecraft('hauler');
    const twoTanks = refit(start, ['engine-1', 'fuel-tank-1', 'fuel-tank-2', null]);
    expect(twoTanks.fuelMass).toBe(start.fuelMass);
    const full = { ...twoTanks, fuelMass: twoTanks.fuelCapacity };
    const oneTank = refit(full, ['engine-1', null, 'fuel-tank-2', null]);
    expect(oneTank.fuelMass).toBe(oneTank.fuelCapacity);
    expect(oneTank.fuelCapacity).toBeLessThan(full.fuelCapacity);
  });

  it('with no Engine installed the Spacecraft has no Δv', () => {
    const start = newSpacecraft('scout');
    expect(availableDeltaV(refit(start, [null, 'fuel-tank-1', null, null]))).toBe(0);
  });

  it('with no Engine installed, burning no Δv leaves the Fuel as it was', () => {
    const noEngine = refit(newSpacecraft('scout'), [null, 'fuel-tank-1', null, null]);
    expect(fuelAfterBurning(noEngine, metersPerSecond(0))).toBe(noEngine.fuelMass);
  });

  it('the Slots change only through refit, so the figures cannot go stale', () => {
    const start = newSpacecraft('scout');
    // @ts-expect-error: new Slots spread into a copy would keep the old dry mass and Δv.
    const stale: Spacecraft = { ...start, slots: start.slots.with(2, 'drill-1') };
    expect(stale.dryMass).toBe(start.dryMass);
    expect(refit(start, start.slots.with(2, 'drill-1')).dryMass).toBeGreaterThan(start.dryMass);
  });

  it('a Spacecraft always has exactly 4 Slots', () => {
    const start = newSpacecraft('scout');
    expect(() => refit(start, ['engine-1', 'fuel-tank-1'])).toThrow(/4 Slots/);
  });
});

describe('the Chassis', () => {
  it("a Component's effect is scaled by the Chassis it is on", () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      expect(componentEffect(id, 'fuel-tank-1')).toEqual({
        kind: 'fuel-tank',
        fuelCapacity: start.fuelCapacity,
      });
      expect(componentEffect(id, 'engine-1')).toEqual({ kind: 'engine', isp: start.engineIsp });
      expect(componentEffect(id, 'drill-2')).toEqual({ kind: 'drill', yieldMultiplier: 2 });
    }
    // Worked example: the hauler's level-1 Tank holds 66 t, against the catalogue's 6 t.
    expect(componentEffect('hauler', 'fuel-tank-1')).toEqual({
      kind: 'fuel-tank',
      fuelCapacity: 66_000,
    });
  });

  it("installing a Fuel Tank raises Fuel capacity by exactly that Tank's effect", () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      const tank = componentEffect(id, 'fuel-tank-2');
      if (tank.kind !== 'fuel-tank') throw new Error('fuel-tank-2 is a Fuel Tank');
      const refitted = refit(start, ['engine-1', 'fuel-tank-1', 'fuel-tank-2', null]);
      expect(refitted.fuelCapacity).toBe(start.fuelCapacity + tank.fuelCapacity);
    }
  });

  it("the best Engine's effect is the Spacecraft's Isp", () => {
    for (const id of CHASSIS_IDS) {
      const refitted = refit(newSpacecraft(id), ['engine-1', 'fuel-tank-1', 'engine-2', null]);
      expect(componentEffect(id, 'engine-2')).toEqual({
        kind: 'engine',
        isp: refitted.engineIsp,
      });
    }
  });

  it('the same Component changes each Chassis differently', () => {
    const added = CHASSIS_IDS.map((id) => {
      const start = newSpacecraft(id);
      const refitted = refit(start, ['engine-2', 'fuel-tank-1', 'fuel-tank-1', null]);
      return {
        fuelCapacity: refitted.fuelCapacity - start.fuelCapacity,
        engineIsp: refitted.engineIsp - start.engineIsp,
      };
    });
    expect(new Set(added.map((a) => a.fuelCapacity)).size).toBe(CHASSIS_IDS.length);
    expect(new Set(added.map((a) => a.engineIsp)).size).toBe(CHASSIS_IDS.length);
  });

  it('a refit keeps the Chassis', () => {
    for (const id of CHASSIS_IDS) {
      expect(refit(newSpacecraft(id), ['engine-2', 'fuel-tank-2', null, null]).chassisId).toBe(id);
    }
  });
});
