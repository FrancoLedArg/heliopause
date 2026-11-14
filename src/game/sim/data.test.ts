import { describe, expect, it } from 'vitest';
import { GENERATION_TUNING, SOURCED_RANGES, STARTER_SPACECRAFT_TUNING } from './index.ts';

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

  it('gameplay tuning is kept apart from sourced figures and claims no source', () => {
    for (const tuning of [GENERATION_TUNING, STARTER_SPACECRAFT_TUNING]) {
      expect(JSON.stringify(tuning)).not.toContain('"source"');
    }
  });
});
