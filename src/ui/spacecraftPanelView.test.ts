import { describe, expect, it } from 'vitest';
import {
  COMPONENT_IDS,
  collectYield,
  COMPONENTS,
  install,
  listBodies,
  type Moon,
  kilograms,
  materials,
  newSpacecraft,
  refit,
  startRun,
  type Slot,
} from '../game/sim/index.ts';
import {
  describeEffect,
  describePreview,
  describeRefusal,
  describeRemoval,
  describeRemoveRefusal,
  describeSpacecraft,
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

  it('keeps its promise: the multiplier the panel says is the one a landing applies', () => {
    for (const id of ['drill-1', 'drill-2'] as const) {
      const run = startRun(2026, 'scout');
      const moon = listBodies(run.starSystem).find(
        (b): b is Moon =>
          b.kind === 'moon' && b.composition === 'icy' && !run.depleted.includes(b.id),
      );
      if (!moon) throw new Error('Seed 2026 has an Icy Moon to gather on');
      const said = /([\d.]+)×/.exec(describeEffect('scout', id))?.[1];
      const fitted = {
        ...run,
        spacecraft: {
          ...run.spacecraft,
          ...refit(run.spacecraft, ['engine-1', 'fuel-tank-1', id, null]),
          fuelCapacity: kilograms(1_000_000),
          fuelMass: kilograms(0),
        },
      };
      const landing = collectYield(fitted, moon.id).collection;
      if (landing.kind !== 'fuel') throw new Error('The Moon is Icy');
      expect(landing.collected / moon.baseYield).toBeCloseTo(Number(said), 9);
    }
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
  // Seed 5 opens on an Icy Starting Moon, so the Run has a New Run's 25 Materials (was seed 7, #189).
  const run = startRun(5, 'scout');

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
  const run = startRun(5, 'scout');

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
      short: 0,
    });
  });

  it('say which Components the Run cannot afford yet', () => {
    const rows = panelRows(run);
    expect(rows.find((row) => row.id === 'engine-1')).toMatchObject({
      affordable: false,
      short: 5,
    });
    expect(rows.find((row) => row.id === 'drill-1')?.affordable).toBe(true);
    expect(COMPONENTS['engine-1'].cost).toBeGreaterThan(run.materials);
  });
});

describe('the Mass bar', () => {
  it('fills with the dry mass against the heaviest loadout the Chassis could carry', () => {
    const run = startRun(5, 'scout');
    const bar = massBar(run.spacecraft);
    expect(bar.label).toBe('Dry mass 4.0 t');
    expect(bar.fraction).toBeGreaterThan(0);
    expect(bar.fraction).toBeLessThan(1);
    const heavier = install({ ...run, materials: materials(500) }, 2, 'fuel-tank-2');
    if (heavier.kind !== 'installed') throw new Error('expected an install');
    expect(massBar(heavier.run.spacecraft).fraction).toBeGreaterThan(bar.fraction);
  });

  it('never overflows, with the heaviest Components that fit in every free Slot', () => {
    const run = startRun(5, 'scout');
    // Heaviest first; a second Jump Drive is refused, so the next heaviest goes in after it.
    const byMass = Object.values(COMPONENTS).sort((a, b) => b.mass - a.mass);
    let rich = { ...run, materials: materials(1_000) };
    for (const slot of [2, 3]) {
      const fits = byMass
        .map((component) => install(rich, slot, component.id))
        .find((result) => result.kind === 'installed');
      if (!fits) throw new Error('expected an install');
      rich = fits.run;
    }
    expect(massBar(rich.spacecraft).fraction).toBeLessThanOrEqual(1);
  });
});

describe('removing a Component is explained in words', () => {
  it('says why the last Engine and the last Fuel Tank stay', () => {
    expect(describeRemoveRefusal({ kind: 'last-engine' })).toBe(
      'It is your last Engine, and without one you cannot fly.',
    );
    expect(describeRemoveRefusal({ kind: 'last-fuel-tank' })).toBe(
      'It is your last Fuel Tank, and without one you have no Fuel.',
    );
    expect(describeRemoveRefusal({ kind: 'empty-slot', slot: 2 })).toBe(
      'Slot 3 is empty, so there is nothing to remove.',
    );
  });

  it('asks before removing: the refund, and the Fuel that would be lost', () => {
    expect(
      describeRemoval({
        slot: 2,
        held: 'fuel-tank-1',
        refund: materials(10),
        fuelLost: kilograms(3000),
      }),
    ).toBe(
      'Remove Fuel Tank, level 1 from Slot 3? You get 10 Materials back. 3.0 t of Fuel will be lost.',
    );
  });

  it('does not mention Fuel when none would be lost', () => {
    expect(
      describeRemoval({ slot: 3, held: 'drill-1', refund: materials(12), fuelLost: kilograms(0) }),
    ).toBe('Remove Drill, level 1 from Slot 4? You get 12 Materials back.');
  });
});

describe('the preview before you pay', () => {
  const scout = startRun(123, 'scout').spacecraft;

  it('shows a Fuel Tank dropping Δv, in words as well as the numbers', () => {
    const preview = describePreview(scout, { kind: 'install', component: 'fuel-tank-1' });
    const dv = preview?.lines.find((line) => line.label === 'Δv');
    expect(preview?.heading).toBe('Install Fuel Tank 1');
    expect(dv).toEqual({
      label: 'Δv',
      kind: 'delta-v',
      before: '22.1 km/s',
      after: '19.0 km/s',
      change: 'Drops 3.1 km/s',
      trend: 'down',
    });
    expect(preview?.note).toBe(
      'Starts empty, so Δv drops. Filled up: 26.0\u00a0km/s, up from 22.1\u00a0km/s.',
    );
  });

  it('shows the mass and Fuel capacity as before → after with the difference', () => {
    const preview = describePreview(scout, { kind: 'install', component: 'fuel-tank-1' });
    expect(preview?.lines.slice(0, 2)).toEqual([
      {
        label: 'Dry mass',
        kind: 'mass',
        before: '4.0 t',
        after: '5.5 t',
        change: '+1.5 t',
        trend: 'up',
      },
      {
        label: 'Fuel cap.',
        kind: 'fuel',
        before: '21.0 t',
        after: '42.0 t',
        change: '+21.0 t',
        trend: 'up',
      },
    ]);
  });

  it('says no change when a figure does not move, and says a removal lowers mass', () => {
    const drill = describePreview(scout, { kind: 'install', component: 'drill-1' });
    expect(drill?.lines[1]?.change).toBe('No change');
    expect(drill?.note).toBe(COMPONENTS['drill-1'].explanation);
    const removal = describePreview(refit(scout, ['engine-1', 'fuel-tank-1', 'drill-1', null]), {
      kind: 'remove',
      slot: 2,
    });
    expect(removal?.heading).toBe('Remove Drill 1');
    expect(removal?.lines[0]?.change).toBe('−0.8 t');
    expect(removal?.lines[2]?.trend).toBe('up');
  });

  it('has nothing to preview with no empty Slot to install into', () => {
    const full = refit(scout, ['engine-1', 'fuel-tank-1', 'drill-1', 'drill-1']);
    expect(describePreview(full, { kind: 'install', component: 'drill-1' })).toBeUndefined();
  });
});

describe('the Jump Drive in the panel', () => {
  const run = startRun(5, 'scout');

  it('is listed from the first screen with its cost, and the Run cannot afford it yet', () => {
    const row = panelRows(run).find((r) => r.id === 'jump-drive');
    expect(row).toMatchObject({
      name: 'Jump Drive',
      title: 'Jump Drive',
      mass: '4.0 t',
      cost: '45 Materials',
      affordable: false,
      short: 20,
    });
  });

  it('previews a drop in Δv, with its one-sentence explanation as the note', () => {
    const shown = describePreview(run.spacecraft, { kind: 'install', component: 'jump-drive' });
    expect(shown?.heading).toBe('Install Jump Drive');
    expect(shown?.lines.find((line) => line.kind === 'delta-v')?.trend).toBe('down');
    expect(shown?.note).toBe(COMPONENTS['jump-drive'].explanation);
  });

  it('says in words that the Run is short of Materials when it cannot afford it', () => {
    expect(
      describeRefusal({
        kind: 'not-enough-materials',
        cost: materials(45),
        have: materials(25),
        short: materials(20),
      }),
    ).toBe('Not enough Materials: it costs 45 and you have 25, 20 short.');
  });
  it('greys out a second Jump Drive and says why, whatever the Materials', () => {
    const rich = { ...run, materials: materials(500) };
    expect(panelRows(rich).find((r) => r.id === 'jump-drive')?.unavailable).toBeUndefined();
    const result = install(rich, 2, 'jump-drive');
    if (result.kind !== 'installed') throw new Error('Expected an install');
    const row = panelRows(result.run).find((r) => r.id === 'jump-drive');
    expect(row?.unavailable).toBe('You already carry a Jump Drive.');
    expect(describeRefusal({ kind: 'jump-drive-installed' })).toBe(
      'You already carry a Jump Drive.',
    );
    // Every other Component stays on offer.
    expect(panelRows(result.run).filter((r) => r.unavailable !== undefined)).toHaveLength(1);
  });
});

describe('the drawn Spacecraft’s text alternative', () => {
  it('names the Chassis and every installed Component, counting repeats', () => {
    const hauler = refit(newSpacecraft('hauler'), [
      'engine-1',
      'fuel-tank-1',
      'fuel-tank-1',
      'drill-2',
    ]);
    expect(describeSpacecraft(hauler)).toBe('Hauler: Engine 1, Fuel Tank 1 ×2, Drill 2');
  });

  it('skips empty Slots and names the Jump Drive without a level', () => {
    const lancer = refit(newSpacecraft('lancer'), ['engine-2', null, 'fuel-tank-1', 'jump-drive']);
    expect(describeSpacecraft(lancer)).toBe('Lancer: Engine 2, Fuel Tank 1, Jump Drive');
  });
});
