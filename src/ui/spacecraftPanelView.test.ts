import { describe, expect, it } from 'vitest';
import {
  COMPONENT_IDS,
  COMPONENTS,
  install,
  materials,
  startRun,
  type Slot,
} from '../game/sim/index.ts';
import {
  describeEffect,
  describeRefusal,
  installTarget,
  massBar,
  panelRows,
} from './spacecraftPanelView.ts';

describe('a Component’s effect is shown as the Chassis scales it', () => {
  it('says a Fuel Tank’s capacity for this Chassis, not the catalogue’s base figure', () => {
    // Base capacity 6,000 kg; the Scout's Chassis factor makes it 21 t, the Hauler's 66 t.
    expect(describeEffect('scout', 'fuel-tank-1')).toBe('Holds 21.0 t of Fuel.');
    expect(describeEffect('hauler', 'fuel-tank-1')).toBe('Holds 66.0 t of Fuel.');
    expect(describeEffect('scout', 'fuel-tank-1')).not.toContain('6.0 t');
  });

  it('says an Engine’s Isp for this Chassis, not the base Isp', () => {
    expect(describeEffect('scout', 'engine-1')).toContain('1,230 s');
    expect(describeEffect('lancer', 'engine-1')).toContain('1,280 s');
    expect(describeEffect('scout', 'engine-1')).not.toContain('900');
    expect(describeEffect('scout', 'engine-2')).toContain('1,538 s');
  });

  it('says how much more a Drill yields', () => {
    expect(describeEffect('scout', 'drill-1')).toContain('1.5×');
    expect(describeEffect('scout', 'drill-2')).toContain('2×');
  });

  it('is one sentence for every Component on every Chassis', () => {
    for (const chassis of ['scout', 'hauler', 'lancer'] as const) {
      for (const id of COMPONENT_IDS) {
        const text = describeEffect(chassis, id);
        expect(text).toMatch(/^[A-Z](?!.*\. ).*\.$/);
        expect(text.length).toBeLessThanOrEqual(48);
      }
    }
  });
});

describe('a refusal says why in words', () => {
  const run = startRun(7, 'scout');

  it('names the Materials that are missing', () => {
    const poor = { ...run, materials: materials(10) };
    const result = install(poor, 2, 'engine-1');
    if (result.kind !== 'refused') throw new Error('expected a refusal');
    expect(describeRefusal(result.reason)).toBe(
      'Not enough Materials: it costs 30 and you have 10, 20 short.',
    );
  });

  it('says every Slot is full', () => {
    expect(describeRefusal({ kind: 'no-empty-slot' })).toBe(
      'Every Slot is full, so there is nowhere to install it.',
    );
  });

  it('says which Slot is taken, by Slot number and Component', () => {
    expect(describeRefusal({ kind: 'slot-taken', slot: 0, holds: 'engine-1' })).toBe(
      'Slot 1 already holds an Engine, level 1.',
    );
  });
});

describe('which Slot an install goes into', () => {
  const slots: readonly Slot[] = ['engine-1', null, 'fuel-tank-1', null];

  it('is the selected Slot when it is empty', () => {
    expect(installTarget(slots, 3)).toBe(3);
  });

  it('is the first empty Slot when the selected one is taken', () => {
    expect(installTarget(slots, 2)).toBe(1);
  });

  it('is nothing when every Slot is full', () => {
    expect(installTarget(['engine-1', 'engine-1', 'drill-1', 'drill-1'], 0)).toBeUndefined();
  });
});

describe('the catalogue rows', () => {
  const run = startRun(7, 'scout');

  it('list every Component with its mass, Materials cost and effect', () => {
    const rows = panelRows(run);
    expect(rows.map((row) => row.id)).toEqual(COMPONENT_IDS);
    const tank = rows.find((row) => row.id === 'fuel-tank-1');
    expect(tank).toMatchObject({
      name: 'Fuel Tank',
      level: 1,
      mass: '1.5 t',
      cost: '20 Materials',
      effect: 'Holds 21.0 t of Fuel.',
      affordable: true,
    });
  });

  it('say which Components the Run cannot afford yet', () => {
    const rows = panelRows(run);
    expect(rows.find((row) => row.id === 'engine-1')?.affordable).toBe(false);
    expect(rows.find((row) => row.id === 'drill-1')?.affordable).toBe(true);
    expect(COMPONENTS['engine-1'].cost).toBeGreaterThan(run.materials);
  });
});

describe('the Mass bar', () => {
  it('fills with the dry mass against the heaviest loadout the Chassis could carry', () => {
    const run = startRun(7, 'scout');
    const bar = massBar(run.spacecraft);
    expect(bar.label).toBe('Dry mass 4.0 t');
    expect(bar.fraction).toBeGreaterThan(0);
    expect(bar.fraction).toBeLessThan(1);
    const heavier = install({ ...run, materials: materials(500) }, 2, 'fuel-tank-2');
    if (heavier.kind !== 'installed') throw new Error('expected an install');
    expect(massBar(heavier.run.spacecraft).fraction).toBeGreaterThan(bar.fraction);
  });

  it('is full when every Slot holds the heaviest Component', () => {
    const run = startRun(7, 'scout');
    const heaviest = Object.values(COMPONENTS).reduce((a, b) => (a.mass >= b.mass ? a : b)).id;
    let rich = { ...run, materials: materials(1_000) };
    for (const slot of [2, 3]) {
      const result = install(rich, slot, heaviest);
      if (result.kind !== 'installed') throw new Error('expected an install');
      rich = result.run;
    }
    expect(massBar(rich.spacecraft).fraction).toBeLessThanOrEqual(1);
  });
});
