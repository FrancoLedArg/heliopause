import { describe, expect, it } from 'vitest';
import { newSpacecraft, refit } from '../sim/index.ts';
import { chooseCruiseLeak } from './cruiseLeak.ts';

describe('the test-only Cruise leak from the URL', () => {
  const spacecraft = refit(newSpacecraft('scout'), [
    'engine-1',
    null,
    'fuel-tank-1',
    null,
    null,
    null,
  ]);

  it('puts one Fuel leak on the first Fuel Tank at the tick it names', () => {
    expect(chooseCruiseLeak('?seed=5&cruiseLeak=100', spacecraft)).toEqual([
      { kind: 'fuel-leak', tick: 100, slot: 2 },
    ]);
  });

  it("never touches a Daily Run: it keeps the seed's own schedule", () => {
    expect(chooseCruiseLeak('?cruiseLeak=100', spacecraft, true)).toBeUndefined();
    expect(chooseCruiseLeak('?cruiseLeak=none', spacecraft, true)).toBeUndefined();
  });

  it('gives every Cruise no events for `none`', () => {
    expect(chooseCruiseLeak('?cruiseLeak=none', spacecraft)).toEqual([]);
  });

  it('leaves the seed its own schedule when it names no tick the Cruise has', () => {
    for (const search of [
      '?seed=5',
      '?cruiseLeak=',
      '?cruiseLeak=0',
      '?cruiseLeak=1200',
      '?cruiseLeak=1.5',
    ]) {
      expect(chooseCruiseLeak(search, spacecraft)).toBeUndefined();
    }
  });
});
