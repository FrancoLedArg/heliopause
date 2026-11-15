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
  panelRows,
  statBars,
} from './spacecraftPanelView.ts';

describe('a Component’s effect is shown as the Chassis scales it', () => {
  it('says a Fuel Tank’s capacity for this Chassis, not the catalogue’s base figure', () => {
    // Base capacity 6,000 kg; the Scout's Chassis factor makes it 21 t, the Hauler's 66 t.
    expect(describeEffect('scout', 'fuel-tank-1')).toBe('Holds 21.0 t of Fuel.');
    expect(describeEffect('hauler', 'fuel-tank-1')).toBe('Holds 66.0 t of Fuel.');
    expect(describeEffect('scout', 'fuel-tank-1')).not.toContain('6.0 t');
  });

  it('says an Engine’s Isp for this Chassis, not the base Isp', () => {
    expect(describeEffect('scout', 'engine-1')).toContain('1,600 s');
    expect(describeEffect('lancer', 'engine-1')).toContain('1,665 s');
    expect(describeEffect('scout', 'engine-1')).not.toContain('900');
    expect(describeEffect('scout', 'engine-2')).toContain('2,000 s');
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
  // Re-pinned for #247 (was seed 5): seed 5 now opens on a Rocky Moon that yields 26, over a New
  // Run's 25 Materials; seed 3's Icy opening keeps exactly 25.
  const run = startRun(3, 'scout');

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

  it('says in one short line why Δv moves, with the lesson behind "Tell me more"', () => {
    const preview = describePreview(scout, { kind: 'install', component: 'fuel-tank-1' });
    expect(preview?.heading).toBe('Install Fuel Tank 1');
    expect(preview?.note).toBe('Starts empty, so Δv drops.');
    expect(preview?.more).toEqual([
      COMPONENTS['fuel-tank-1'].explanation,
      'Filled up: 33.8\u00a0km/s, up from 28.8\u00a0km/s.',
    ]);
  });

  it('says mass costs Δv for a Drill, and a removal that sheds mass gives Δv back', () => {
    const drill = describePreview(scout, { kind: 'install', component: 'drill-1' });
    expect(drill?.note).toBe('More mass, so Δv drops.');
    expect(drill?.more).toEqual([COMPONENTS['drill-1'].explanation]);
    const removal = describePreview(refit(scout, ['engine-1', 'fuel-tank-1', 'drill-1', null]), {
      kind: 'remove',
      slot: 2,
    });
    expect(removal?.heading).toBe('Remove Drill 1');
    expect(removal?.note).toBe('Less mass, so Δv rises.');
  });

  it('says a better Engine raises Δv despite its mass', () => {
    const engine = describePreview(scout, { kind: 'install', component: 'engine-2' });
    expect(engine?.note).toBe('Better Isp, so Δv rises.');
  });

  it('has nothing to preview with no empty Slot to install into', () => {
    const full = refit(scout, ['engine-1', 'fuel-tank-1', 'drill-1', 'drill-1']);
    expect(describePreview(full, { kind: 'install', component: 'drill-1' })).toBeUndefined();
  });
});

describe('the stat bars', () => {
  const scout = startRun(123, 'scout').spacecraft;

  it('show the dry mass, Fuel capacity and Δv, in km/s as the top bar shows it', () => {
    const bars = statBars(scout);
    expect(bars.map((bar) => [bar.kind, bar.label, bar.value])).toEqual([
      ['mass', 'Mass', '4.0 t'],
      ['fuel', 'Fuel', '21.0 t'],
      ['delta-v', 'Δv', '28.8 km/s'],
    ]);
    for (const bar of bars) {
      expect(bar.share).toBeGreaterThan(0);
      expect(bar.share).toBeLessThanOrEqual(1);
      expect(bar.after).toBeUndefined();
    }
    expect(bars[2]?.name).toBe('Δv: 28.8 km/s');
  });

  it('show an install as before and after, with the change, as the simulation previews it', () => {
    const bars = statBars(scout, { kind: 'install', component: 'fuel-tank-1' });
    expect(bars.map((bar) => [bar.value, bar.after?.value, bar.after?.change])).toEqual([
      ['4.0 t', '5.5 t', '+1.5'],
      ['21.0 t', '42.0 t', '+21.0'],
      ['28.8 km/s', '24.7 km/s', '−4.1'],
    ]);
    const [mass, fuel, dv] = bars;
    expect(mass?.after?.share).toBeGreaterThan(mass?.share ?? 1);
    expect(fuel?.after?.share).toBeGreaterThan(fuel?.share ?? 1);
    expect(dv?.after?.share).toBeLessThan(dv?.share ?? 0);
    // More mass is worse, more Fuel is better: the bar says which way is good.
    expect([mass?.after?.good, fuel?.after?.good, dv?.after?.good]).toEqual([false, true, false]);
    expect(dv?.name).toBe('Δv: 28.8 km/s now, 24.7 km/s after. Drops 4.1 km/s.');
  });

  it('say no change when a figure does not move', () => {
    const [, fuel] = statBars(scout, { kind: 'install', component: 'drill-1' });
    expect(fuel?.after).toMatchObject({ value: '21.0 t', change: '±0', trend: 'same' });
    expect(fuel?.name).toBe('Fuel capacity: 21.0 t now, 21.0 t after. No change.');
  });

  it('never overflow, with the heaviest Components and the largest Fuel Tanks fitted', () => {
    for (const slots of [
      ['engine-2', 'fuel-tank-2', 'fuel-tank-2', 'fuel-tank-2'],
      ['engine-2', 'fuel-tank-2', 'jump-drive', 'drill-2'],
    ] as const) {
      const full = refit(scout, slots);
      for (const bar of statBars({ ...full, fuelMass: full.fuelCapacity })) {
        expect(bar.share, bar.kind).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the Jump Drive in the panel', () => {
  // Seed 3 starts with exactly a New Run's 25 Materials (re-pinned for #247, was seed 5).
  const run = startRun(3, 'scout');

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

  it('previews a drop in Δv, with its one-sentence explanation behind "Tell me more"', () => {
    const shown = describePreview(run.spacecraft, { kind: 'install', component: 'jump-drive' });
    expect(shown?.heading).toBe('Install Jump Drive');
    expect(shown?.note).toBe('More mass, so Δv drops.');
    expect(shown?.more).toEqual([COMPONENTS['jump-drive'].explanation]);
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
      null,
      null,
    ]);
    expect(describeSpacecraft(hauler)).toBe('Hauler: Engine 1, Fuel Tank 1 ×2, Drill 2');
  });

  it('skips empty Slots and names the Jump Drive without a level', () => {
    const lancer = refit(newSpacecraft('lancer'), [
      'engine-2',
      null,
      'fuel-tank-1',
      'jump-drive',
      null,
    ]);
    expect(describeSpacecraft(lancer)).toBe('Lancer: Engine 2, Fuel Tank 1, Jump Drive');
  });
});
