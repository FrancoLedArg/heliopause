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
  type ChassisId,
  type Component,
  type Slot,
  type Spacecraft,
} from './index.ts';

describe('the Component catalogue', () => {
  it('holds an Engine, a Fuel Tank and a Drill, each at levels 1 and 2, and the Jump Drive', () => {
    const kindsAndLevels = Object.values(COMPONENTS).map((c) => `${c.kind} ${String(c.level)}`);
    expect(kindsAndLevels.sort()).toEqual([
      'drill 1',
      'drill 2',
      'engine 1',
      'engine 2',
      'fuel-tank 1',
      'fuel-tank 2',
      'jump-drive 1',
    ]);
  });

  it('every Component has a mass, a Materials cost, an effect and a one-sentence explanation', () => {
    for (const component of Object.values(COMPONENTS)) {
      expect(component.mass).toBeGreaterThan(0);
      expect(component.cost).toBeGreaterThan(0);
      expect(Number.isInteger(component.cost)).toBe(true);
      expect(effectOf(component)).toBeGreaterThan(0);
      expect(component.explanation).toMatch(/^[A-Z][^.!?]*\.$/);
      // The preview shows an Engine's or a Drill's explanation as one plain line, with no jargon
      // (a Fuel Tank's preview teaches with its own note).
      if (component.kind === 'fuel-tank') continue;
      expect(component.explanation.length).toBeLessThanOrEqual(70);
      expect(component.explanation).not.toMatch(/\bIsp\b/);
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
/** The Hauler's starting Components (spec #230): more room and a second Fuel Tank. */
const HAULER_START = ['engine-1', 'fuel-tank-1', 'fuel-tank-1', null, null, null];

/** The Spacecraft refitted with `components` in its first Slots and the rest of its Slots empty. */
function fit(start: Spacecraft, components: readonly Slot[]): Spacecraft {
  return refit(
    start,
    start.slots.map((_, i) => components[i] ?? null),
  );
}

/**
 * A Spacecraft on this Chassis with only the calibration loadout, Fuel full: the Scout's and the
 * Lancer's start, and the Hauler's figures before its extra starting Components (ADR 0005).
 */
function calibrated(id: ChassisId): Spacecraft {
  return fit(newSpacecraft(id), ['engine-1', 'fuel-tank-1']);
}

function effectOf(component: Component): number {
  switch (component.kind) {
    case 'engine':
      return component.baseIsp;
    case 'fuel-tank':
      return component.baseFuelCapacity;
    case 'drill':
      return component.yieldMultiplier;
    case 'jump-drive':
      // It has no figure to compare: its effect is the Jump itself.
      return 1;
  }
}

describe('Slots', () => {
  it('a Scout has 4 Slots, a Lancer 5 and a Hauler 6', () => {
    expect(newSpacecraft('scout').slots).toHaveLength(4);
    expect(newSpacecraft('lancer').slots).toHaveLength(5);
    expect(newSpacecraft('hauler').slots).toHaveLength(6);
  });

  it('each Chassis starts with its starting Components in order, the rest of its Slots empty, and its Fuel full', () => {
    expect(newSpacecraft('scout').slots).toEqual(['engine-1', 'fuel-tank-1', null, null]);
    expect(newSpacecraft('lancer').slots).toEqual(['engine-1', 'fuel-tank-1', null, null, null]);
    expect(newSpacecraft('hauler').slots).toEqual(HAULER_START);
    for (const id of CHASSIS_IDS) {
      const spacecraft = newSpacecraft(id);
      expect(spacecraft.fuelMass).toBe(spacecraft.fuelCapacity);
    }
  });

  // Spec A's CHASSIS_TUNING, before Components: the Δv is Isp × g0 × ln(wet mass / dry mass).
  // The Isp is 30% above Spec A's since #247, so the first Hop leaves a healthy Fuel gauge.
  const specA = {
    scout: { dryMass: 4_000, fuelCapacity: 21_000, engineIsp: 1_600, deltaV: 28_754.38 },
    hauler: { dryMass: 15_000, fuelCapacity: 66_000, engineIsp: 1_575, deltaV: 26_047.23 },
    lancer: { dryMass: 6_000, fuelCapacity: 36_000, engineIsp: 1_665, deltaV: 31_772.96 },
  };

  function expectSpecA(spacecraft: Spacecraft) {
    const figures = specA[spacecraft.chassisId];
    expect(spacecraft.dryMass).toBe(figures.dryMass);
    expect(spacecraft.fuelCapacity).toBe(figures.fuelCapacity);
    expect(spacecraft.fuelMass).toBe(figures.fuelCapacity);
    expect(spacecraft.engineIsp).toBe(figures.engineIsp);
    expect(availableDeltaV(spacecraft)).toBeCloseTo(figures.deltaV, 2);
  }

  it("the calibration loadout gives every Chassis Spec A's figures, bit for bit", () => {
    for (const id of CHASSIS_IDS) {
      expectSpecA(calibrated(id));
    }
  });

  it("the Scout and the Lancer start with Spec A's figures, bit for bit", () => {
    expectSpecA(newSpacecraft('scout'));
    expectSpecA(newSpacecraft('lancer'));
  });

  it("the Hauler starts with 16.5 t dry, 132 t of Fuel and Spec A's Isp", () => {
    const hauler = newSpacecraft('hauler');
    expect(hauler.dryMass).toBe(16_500);
    expect(hauler.fuelCapacity).toBe(132_000);
    expect(hauler.fuelMass).toBe(132_000);
    expect(hauler.engineIsp).toBe(1_575);
    // 1,575 s × g0 × ln(148.5 t / 16.5 t).
    expect(availableDeltaV(hauler)).toBeCloseTo(33_937.17, 1);
  });
});

describe('what the installed Components make of the Spacecraft', () => {
  it('Fuel capacity is the sum of the Fuel Tanks', () => {
    for (const id of CHASSIS_IDS) {
      const start = calibrated(id);
      const levelOne = fit(start, ['engine-1', 'fuel-tank-1', null, null]).fuelCapacity;
      const levelTwo = fit(start, ['engine-1', 'fuel-tank-2', null, null]).fuelCapacity;
      expect(fit(start, ['engine-1', 'fuel-tank-1', 'fuel-tank-1', null]).fuelCapacity).toBe(
        levelOne * 2,
      );
      expect(fit(start, ['fuel-tank-2', 'engine-1', 'fuel-tank-1', null]).fuelCapacity).toBe(
        levelOne + levelTwo,
      );
    }
    // Worked example: the scout's 21 t level-1 Tank, twice.
    expect(
      fit(newSpacecraft('scout'), ['engine-1', 'fuel-tank-1', 'fuel-tank-1', null]).fuelCapacity,
    ).toBe(42_000);
  });

  it('a level-2 Engine gives more Δv from the same Fuel', () => {
    for (const id of CHASSIS_IDS) {
      for (const share of [1, 0.5, 0.05]) {
        const start = calibrated(id);
        const levelOne = { ...start, fuelMass: kilograms(start.fuelCapacity * share) };
        const levelTwo = fit(levelOne, ['engine-2', 'fuel-tank-1', null, null]);
        expect(levelTwo.fuelMass).toBe(levelOne.fuelMass);
        expect(availableDeltaV(levelTwo)).toBeGreaterThan(availableDeltaV(levelOne));
      }
    }
  });

  it('adding an empty Fuel Tank lowers Δv', () => {
    for (const id of CHASSIS_IDS) {
      const start = calibrated(id);
      for (const tank of ['fuel-tank-1', 'fuel-tank-2'] as const) {
        const withTank = fit(start, ['engine-1', 'fuel-tank-1', tank, null]);
        expect(withTank.fuelMass).toBe(start.fuelMass);
        expect(availableDeltaV(withTank)).toBeLessThan(availableDeltaV(start));
      }
    }
  });

  it('the best installed Engine sets the Isp', () => {
    for (const id of CHASSIS_IDS) {
      const start = calibrated(id);
      const levelTwo = fit(start, ['engine-2', 'fuel-tank-1', null, null]);
      const both = fit(start, ['engine-1', 'fuel-tank-1', 'engine-2', null]);
      expect(levelTwo.engineIsp).toBeGreaterThan(start.engineIsp);
      expect(both.engineIsp).toBe(levelTwo.engineIsp);
    }
  });

  it('dry mass is the Chassis plus every installed Component', () => {
    for (const id of CHASSIS_IDS) {
      const start = calibrated(id);
      const drilled = fit(start, ['engine-1', 'fuel-tank-1', 'drill-1', 'drill-2']);
      expect(drilled.dryMass).toBe(
        start.dryMass + COMPONENTS['drill-1'].mass + COMPONENTS['drill-2'].mass,
      );
      const bare = fit(start, [null, null, null, null]);
      expect(bare.dryMass).toBe(
        start.dryMass - COMPONENTS['engine-1'].mass - COMPONENTS['fuel-tank-1'].mass,
      );
      expect(bare.dryMass).toBeGreaterThan(0);
    }
  });

  it('a Drill changes neither Fuel capacity nor Isp', () => {
    const start = calibrated('lancer');
    const drilled = fit(start, ['engine-1', 'fuel-tank-1', 'drill-2', null]);
    expect(drilled.fuelCapacity).toBe(start.fuelCapacity);
    expect(drilled.engineIsp).toBe(start.engineIsp);
  });

  it('removing a Fuel Tank keeps only the Fuel the remaining Tanks can hold', () => {
    const start = calibrated('hauler');
    const twoTanks = fit(start, ['engine-1', 'fuel-tank-1', 'fuel-tank-2', null]);
    expect(twoTanks.fuelMass).toBe(start.fuelMass);
    const full = { ...twoTanks, fuelMass: twoTanks.fuelCapacity };
    const oneTank = fit(full, ['engine-1', null, 'fuel-tank-2', null]);
    expect(oneTank.fuelMass).toBe(oneTank.fuelCapacity);
    expect(oneTank.fuelCapacity).toBeLessThan(full.fuelCapacity);
  });

  it('with no Engine installed the Spacecraft has no Δv', () => {
    const start = newSpacecraft('scout');
    expect(availableDeltaV(fit(start, [null, 'fuel-tank-1', null, null]))).toBe(0);
  });

  it('with no Engine installed, burning no Δv leaves the Fuel as it was', () => {
    const noEngine = fit(newSpacecraft('scout'), [null, 'fuel-tank-1', null, null]);
    expect(fuelAfterBurning(noEngine, metersPerSecond(0))).toBe(noEngine.fuelMass);
  });

  it('the Slots change only through refit, so the figures cannot go stale', () => {
    const start = newSpacecraft('scout');
    // @ts-expect-error: new Slots spread into a copy would keep the old dry mass and Δv.
    const stale: Spacecraft = { ...start, slots: start.slots.with(2, 'drill-1') };
    expect(stale.dryMass).toBe(start.dryMass);
    expect(refit(start, start.slots.with(2, 'drill-1')).dryMass).toBeGreaterThan(start.dryMass);
  });

  it("a Spacecraft always has exactly its Chassis's Slots", () => {
    expect(() => refit(newSpacecraft('scout'), ['engine-1', 'fuel-tank-1'])).toThrow(/4 Slots/);
    expect(() => refit(newSpacecraft('hauler'), ['engine-1', 'fuel-tank-1', null, null])).toThrow(
      /6 Slots/,
    );
  });
});

describe('the Chassis', () => {
  it("a Component's effect is scaled by the Chassis it is on", () => {
    for (const id of CHASSIS_IDS) {
      const start = calibrated(id);
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
      const start = calibrated(id);
      const tank = componentEffect(id, 'fuel-tank-2');
      if (tank.kind !== 'fuel-tank') throw new Error('fuel-tank-2 is a Fuel Tank');
      const refitted = fit(start, ['engine-1', 'fuel-tank-1', 'fuel-tank-2', null]);
      expect(refitted.fuelCapacity).toBe(start.fuelCapacity + tank.fuelCapacity);
    }
  });

  it("the best Engine's effect is the Spacecraft's Isp", () => {
    for (const id of CHASSIS_IDS) {
      const refitted = fit(calibrated(id), ['engine-1', 'fuel-tank-1', 'engine-2', null]);
      expect(componentEffect(id, 'engine-2')).toEqual({
        kind: 'engine',
        isp: refitted.engineIsp,
      });
    }
  });

  it('the same Component changes each Chassis differently', () => {
    const added = CHASSIS_IDS.map((id) => {
      const start = calibrated(id);
      const refitted = fit(start, ['engine-2', 'fuel-tank-1', 'fuel-tank-1', null]);
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
      expect(fit(calibrated(id), ['engine-2', 'fuel-tank-2', null, null]).chassisId).toBe(id);
    }
  });
});
