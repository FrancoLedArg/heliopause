import { describe, expect, it } from 'vitest';
import { availableDeltaV, kilograms, preview, refit, startRun } from './index.ts';

const run = startRun(123, 'scout');

describe('previewing a change', () => {
  it('preview does not change the Run', () => {
    const before = structuredClone(run);
    preview(run.spacecraft, { kind: 'install', component: 'fuel-tank-1' });
    preview(run.spacecraft, { kind: 'remove', slot: 1 });
    expect(run).toEqual(before);
  });

  it('an Instrument previews the lower Δv its mass costs', () => {
    const result = preview(run.spacecraft, { kind: 'install', component: 'sample-lab' });
    expect(result?.deltaV).toBeLessThan(availableDeltaV(run.spacecraft));
  });

  it('a Fuel Tank added with little Fuel aboard previews lower Δv', () => {
    const little = { ...run.spacecraft, fuelMass: kilograms(run.spacecraft.fuelMass / 10) };
    const result = preview(little, { kind: 'install', component: 'fuel-tank-1' });
    if (result === undefined) throw new Error('Expected a preview');
    expect(result.deltaV).toBeLessThan(availableDeltaV(little));
    expect(result.fuelCapacity).toBeGreaterThan(little.fuelCapacity);
  });

  it('a Fuel Tank previews more Δv once filled', () => {
    const result = preview(run.spacecraft, { kind: 'install', component: 'fuel-tank-1' });
    const filledNow = availableDeltaV({ ...run.spacecraft, fuelMass: run.spacecraft.fuelCapacity });
    expect(result?.deltaV).toBeLessThan(filledNow);
    expect(result?.filledDeltaV).toBeGreaterThan(filledNow);
  });

  it('reads the same figures as a refit would give', () => {
    const result = preview(run.spacecraft, { kind: 'install', component: 'drill-1' });
    const refitted = refit(run.spacecraft, [
      'engine-1',
      'fuel-tank-1',
      'drill-1',
      null,
      null,
      null,
    ]);
    expect(result).toEqual({
      dryMass: refitted.dryMass,
      fuelCapacity: refitted.fuelCapacity,
      deltaV: availableDeltaV(refitted),
      filledDeltaV: availableDeltaV({ ...refitted, fuelMass: refitted.fuelCapacity }),
    });
  });

  it('previews an install into the Slot asked for, and none when every Slot is full', () => {
    const full = refit(run.spacecraft, [
      'engine-1',
      'fuel-tank-1',
      'drill-1',
      'drill-1',
      'drill-1',
      'drill-1',
    ]);
    expect(preview(full, { kind: 'install', component: 'drill-1' })).toBeUndefined();
    expect(preview(run.spacecraft, { kind: 'install', component: 'drill-1', slot: 3 })).toEqual(
      preview(run.spacecraft, { kind: 'install', component: 'drill-1' }),
    );
  });

  it('a removed Fuel Tank previews the lower Fuel capacity', () => {
    const two = refit(run.spacecraft, ['engine-1', 'fuel-tank-1', 'fuel-tank-1', null, null, null]);
    const result = preview(two, { kind: 'remove', slot: 2 });
    expect(result?.dryMass).toBeLessThan(two.dryMass);
    expect(result?.fuelCapacity).toBeLessThan(two.fuelCapacity);
  });

  it('previews nothing for an empty Slot', () => {
    expect(preview(run.spacecraft, { kind: 'remove', slot: 3 })).toBeUndefined();
  });
});
