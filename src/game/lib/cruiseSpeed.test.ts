import { describe, expect, it } from 'vitest';
import { chooseCruiseSpeed } from './cruiseSpeed.ts';

describe('the test-only Cruise speed in the URL', () => {
  it('plays the Cruise at its real speed when the URL names none', () => {
    expect(chooseCruiseSpeed('')).toBe(1);
    expect(chooseCruiseSpeed('?seed=12&chassis=scout')).toBe(1);
  });

  it('speeds the Cruise up by the whole number `?cruiseSpeed=<n>` names', () => {
    expect(chooseCruiseSpeed('?seed=12&cruiseSpeed=40')).toBe(40);
  });

  it('ignores a speed that is not a whole number of at least 1, and caps a huge one', () => {
    for (const bad of [
      '?cruiseSpeed=0',
      '?cruiseSpeed=-3',
      '?cruiseSpeed=fast',
      '?cruiseSpeed=2.5',
    ]) {
      expect(chooseCruiseSpeed(bad)).toBe(1);
    }
    expect(chooseCruiseSpeed('?cruiseSpeed=100000')).toBe(240);
  });
});
