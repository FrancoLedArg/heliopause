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
  it('holds an Engine, a Fuel Tank, a Drill and a Radar, each at levels 1 and 2, the Jump Drive and three Instruments', () => {
    const kindsAndLevels = Object.values(COMPONENTS).map((c) => `${c.kind} ${String(c.level)}`);
    expect(kindsAndLevels.sort()).toEqual([
      'drill 1',
      'drill 2',
      'engine 1',
      'engine 2',
      'fuel-tank 1',
      'fuel-tank 2',
      'instrument 1',
      'instrument 1',
      'instrument 1',
      'jump-drive 1',
      'radar 1',
      'radar 2',
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

  it('every Component cites its research (propulsion, or sensors for the Radar) or is marked gameplay tuning', () => {
    for (const { kind, provenance } of Object.values(COMPONENTS)) {
      if (provenance.kind === 'sourced') {
        expect(provenance.source).toContain(
          kind === 'radar'
            ? 'docs/research/sensors-and-communication.md'
            : 'docs/research/propulsion-trade-offs.md',
        );
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
      [COMPONENTS['radar-1'], COMPONENTS['radar-2']],
    ] as const;
    for (const [one, two] of levels) {
      expect(two.mass).toBeGreaterThan(one.mass);
      expect(two.cost).toBeGreaterThan(one.cost);
      expect(effectOf(two)).toBeGreaterThan(effectOf(one));
    }
  });
});

/** A Component's base figure: an Engine's Isp, a Fuel Tank's capacity, a Drill's multiplier, a Radar's range. */
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
    case 'radar':
      return component.range;
    case 'instrument':
      return component.mass;
  }
}

describe('Slots', () => {
  it('a new Spacecraft has 6 Slots: a level-1 Engine, a level-1 Fuel Tank and 4 empty', () => {
    for (const id of CHASSIS_IDS) {
      expect(newSpacecraft(id).slots).toEqual(['engine-1', 'fuel-tank-1', null, null, null, null]);
    }
  });

  it("a new Spacecraft's starting Components give exactly the shared tuning's dry mass, Fuel capacity and Δv", () => {
    // One tuning for every Chassis since #298 (ADR 0006): 4 t dry, a 36 t Tank started full and a
    // 1,600 s Engine. The Δv is Isp × g0 × ln(wet mass / dry mass) = 1,600 × 9.80665 × ln(10).
    for (const id of CHASSIS_IDS) {
      const spacecraft = newSpacecraft(id);
      expect(spacecraft.dryMass).toBe(4_000);
      expect(spacecraft.fuelCapacity).toBe(36_000);
      expect(spacecraft.fuelMass).toBe(36_000);
      expect(spacecraft.engineIsp).toBe(1_600);
      expect(availableDeltaV(spacecraft)).toBeCloseTo(36_129.03, 2);
    }
  });
});

describe('what the installed Components make of the Spacecraft', () => {
  it('Fuel capacity is the sum of the Fuel Tanks', () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      const levelOne = refit(start, [
        'engine-1',
        'fuel-tank-1',
        null,
        null,
        null,
        null,
      ]).fuelCapacity;
      const levelTwo = refit(start, [
        'engine-1',
        'fuel-tank-2',
        null,
        null,
        null,
        null,
      ]).fuelCapacity;
      expect(
        refit(start, ['engine-1', 'fuel-tank-1', 'fuel-tank-1', null, null, null]).fuelCapacity,
      ).toBe(levelOne * 2);
      expect(
        refit(start, ['fuel-tank-2', 'engine-1', 'fuel-tank-1', null, null, null]).fuelCapacity,
      ).toBe(levelOne + levelTwo);
    }
    // Worked example: the 36 t level-1 Tank every Chassis starts with (#298), twice.
    expect(
      refit(newSpacecraft('scout'), ['engine-1', 'fuel-tank-1', 'fuel-tank-1', null, null, null])
        .fuelCapacity,
    ).toBe(72_000);
  });

  it('a level-2 Engine gives more Δv from the same Fuel', () => {
    for (const id of CHASSIS_IDS) {
      for (const share of [1, 0.5, 0.05]) {
        const start = newSpacecraft(id);
        const levelOne = { ...start, fuelMass: kilograms(start.fuelCapacity * share) };
        const levelTwo = refit(levelOne, ['engine-2', 'fuel-tank-1', null, null, null, null]);
        expect(levelTwo.fuelMass).toBe(levelOne.fuelMass);
        expect(availableDeltaV(levelTwo)).toBeGreaterThan(availableDeltaV(levelOne));
      }
    }
  });

  it('adding an empty Fuel Tank lowers Δv', () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      for (const tank of ['fuel-tank-1', 'fuel-tank-2'] as const) {
        const withTank = refit(start, ['engine-1', 'fuel-tank-1', tank, null, null, null]);
        expect(withTank.fuelMass).toBe(start.fuelMass);
        expect(availableDeltaV(withTank)).toBeLessThan(availableDeltaV(start));
      }
    }
  });

  it('the best installed Engine sets the Isp', () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      const levelTwo = refit(start, ['engine-2', 'fuel-tank-1', null, null, null, null]);
      const both = refit(start, ['engine-1', 'fuel-tank-1', 'engine-2', null, null, null]);
      expect(levelTwo.engineIsp).toBeGreaterThan(start.engineIsp);
      expect(both.engineIsp).toBe(levelTwo.engineIsp);
    }
  });

  it('dry mass is the Chassis plus every installed Component', () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      const drilled = refit(start, ['engine-1', 'fuel-tank-1', 'drill-1', 'drill-2', null, null]);
      expect(drilled.dryMass).toBe(
        start.dryMass + COMPONENTS['drill-1'].mass + COMPONENTS['drill-2'].mass,
      );
      const bare = refit(start, [null, null, null, null, null, null]);
      expect(bare.dryMass).toBe(
        start.dryMass - COMPONENTS['engine-1'].mass - COMPONENTS['fuel-tank-1'].mass,
      );
      expect(bare.dryMass).toBeGreaterThan(0);
    }
  });

  it('a Drill changes neither Fuel capacity nor Isp', () => {
    const start = newSpacecraft('lancer');
    const drilled = refit(start, ['engine-1', 'fuel-tank-1', 'drill-2', null, null, null]);
    expect(drilled.fuelCapacity).toBe(start.fuelCapacity);
    expect(drilled.engineIsp).toBe(start.engineIsp);
  });

  it('removing a Fuel Tank keeps only the Fuel the remaining Tanks can hold', () => {
    const start = newSpacecraft('hauler');
    const twoTanks = refit(start, ['engine-1', 'fuel-tank-1', 'fuel-tank-2', null, null, null]);
    expect(twoTanks.fuelMass).toBe(start.fuelMass);
    const full = { ...twoTanks, fuelMass: twoTanks.fuelCapacity };
    const oneTank = refit(full, ['engine-1', null, 'fuel-tank-2', null, null, null]);
    expect(oneTank.fuelMass).toBe(oneTank.fuelCapacity);
    expect(oneTank.fuelCapacity).toBeLessThan(full.fuelCapacity);
  });

  it('with no Engine installed the Spacecraft has no Δv', () => {
    const start = newSpacecraft('scout');
    expect(availableDeltaV(refit(start, [null, 'fuel-tank-1', null, null, null, null]))).toBe(0);
  });

  it('with no Engine installed, burning no Δv leaves the Fuel as it was', () => {
    const noEngine = refit(newSpacecraft('scout'), [null, 'fuel-tank-1', null, null, null, null]);
    expect(fuelAfterBurning(noEngine, metersPerSecond(0))).toBe(noEngine.fuelMass);
  });

  it('the Slots change only through refit, so the figures cannot go stale', () => {
    const start = newSpacecraft('scout');
    // @ts-expect-error: new Slots spread into a copy would keep the old dry mass and Δv.
    const stale: Spacecraft = { ...start, slots: start.slots.with(2, 'drill-1') };
    expect(stale.dryMass).toBe(start.dryMass);
    expect(refit(start, start.slots.with(2, 'drill-1')).dryMass).toBeGreaterThan(start.dryMass);
  });

  it('a Spacecraft always has exactly 6 Slots', () => {
    const start = newSpacecraft('scout');
    expect(() => refit(start, ['engine-1', 'fuel-tank-1'])).toThrow(/6 Slots/);
  });
});

describe('Instruments', () => {
  const ORDER = ['camera', 'chemistry-scanner', 'sample-lab'] as const;

  it('are ordered Camera < Chemistry scanner < Sample lab in mass and cost', () => {
    for (const [a, b] of [
      [ORDER[0], ORDER[1]],
      [ORDER[1], ORDER[2]],
    ] as const) {
      expect(COMPONENTS[a].mass).toBeLessThan(COMPONENTS[b].mass);
      expect(COMPONENTS[a].cost).toBeLessThan(COMPONENTS[b].cost);
    }
  });

  it("keep the Camera affordable from a Run's starting Materials, and the Sample lab near a level-2 Drill in mass", () => {
    expect(COMPONENTS.camera.cost).toBeLessThanOrEqual(25);
    expect(COMPONENTS['sample-lab'].mass).toBeGreaterThanOrEqual(COMPONENTS['drill-2'].mass * 0.75);
    expect(COMPONENTS['sample-lab'].mass).toBeLessThanOrEqual(COMPONENTS['drill-2'].mass * 1.25);
  });

  it('say so in the catalogue when they are idle without a Drill, and give a real name', () => {
    for (const id of ORDER) {
      const entry = COMPONENTS[id];
      expect(entry.realName.length).toBeGreaterThan(0);
      expect(entry.provenance.kind).toBe('gameplay-tuning');
    }
    expect(COMPONENTS['sample-lab'].needsDrill).toBe(true);
    expect(COMPONENTS['sample-lab'].explanation).toMatch(/idle without a Drill/);
    expect(COMPONENTS.camera.needsDrill).toBe(false);
  });

  it('add their mass to the Spacecraft and change neither Fuel capacity nor Isp', () => {
    const start = newSpacecraft('scout');
    const fitted = refit(start, start.slots.with(2, 'sample-lab'));
    expect(fitted.dryMass).toBe(start.dryMass + COMPONENTS['sample-lab'].mass);
    expect(fitted.fuelCapacity).toBe(start.fuelCapacity);
    expect(fitted.engineIsp).toBe(start.engineIsp);
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
    // Worked example: a level-1 Tank holds 36 t on every Chassis (#298), against the catalogue's 6 t.
    expect(componentEffect('hauler', 'fuel-tank-1')).toEqual({
      kind: 'fuel-tank',
      fuelCapacity: 36_000,
    });
  });

  it("installing a Fuel Tank raises Fuel capacity by exactly that Tank's effect", () => {
    for (const id of CHASSIS_IDS) {
      const start = newSpacecraft(id);
      const tank = componentEffect(id, 'fuel-tank-2');
      if (tank.kind !== 'fuel-tank') throw new Error('fuel-tank-2 is a Fuel Tank');
      const refitted = refit(start, ['engine-1', 'fuel-tank-1', 'fuel-tank-2', null, null, null]);
      expect(refitted.fuelCapacity).toBe(start.fuelCapacity + tank.fuelCapacity);
    }
  });

  it("the best Engine's effect is the Spacecraft's Isp", () => {
    for (const id of CHASSIS_IDS) {
      const refitted = refit(newSpacecraft(id), [
        'engine-1',
        'fuel-tank-1',
        'engine-2',
        null,
        null,
        null,
      ]);
      expect(componentEffect(id, 'engine-2')).toEqual({
        kind: 'engine',
        isp: refitted.engineIsp,
      });
    }
  });

  // #298, ADR 0006: was "the same Component changes each Chassis differently".
  it('the same Component changes every Chassis alike', () => {
    const added = CHASSIS_IDS.map((id) => {
      const start = newSpacecraft(id);
      const refitted = refit(start, ['engine-2', 'fuel-tank-1', 'fuel-tank-1', null, null, null]);
      return {
        fuelCapacity: refitted.fuelCapacity - start.fuelCapacity,
        engineIsp: refitted.engineIsp - start.engineIsp,
      };
    });
    expect(new Set(added.map((a) => a.fuelCapacity)).size).toBe(1);
    expect(new Set(added.map((a) => a.engineIsp)).size).toBe(1);
  });

  it('a refit keeps the Chassis', () => {
    for (const id of CHASSIS_IDS) {
      expect(
        refit(newSpacecraft(id), ['engine-2', 'fuel-tank-2', null, null, null, null]).chassisId,
      ).toBe(id);
    }
  });
});
