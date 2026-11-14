import { describe, expect, it } from 'vitest';
import {
  CHASSIS_TUNING,
  DISPERSION,
  GENERATION_TUNING,
  SOURCED_CONSTANTS,
  SOURCED_RANGES,
} from './index.ts';

describe('generation data', () => {
  it('every real-world range cites its source in the NASA research doc', () => {
    const ranges = Object.values(SOURCED_RANGES).flatMap((kind) => Object.values(kind));
    expect(ranges.length).toBeGreaterThan(0);
    for (const range of ranges) {
      expect(range.source).toContain('docs/research/nasa-data-for-generation.md');
      expect(range.source).toMatch(/https:\/\/nssdc\.gsfc\.nasa\.gov\//);
      expect(range.min).toBeLessThan(range.max);
    }
  });

  it('every real-world constant behind the Hop rules cites its source', () => {
    const constants = Object.values(SOURCED_CONSTANTS);
    expect(constants.length).toBeGreaterThan(0);
    for (const constant of constants) {
      expect(constant.source).toMatch(/https:\/\/[a-z0-9.]*nasa\.gov\//);
      expect(constant.value).toBeGreaterThan(0);
    }
  });

  it('gameplay tuning is kept apart from sourced figures and claims no source', () => {
    for (const tuning of [GENERATION_TUNING, CHASSIS_TUNING, DISPERSION]) {
      expect(JSON.stringify(tuning)).not.toContain('"source"');
    }
  });
});
