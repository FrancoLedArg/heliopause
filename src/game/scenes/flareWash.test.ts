import { describe, expect, it } from 'vitest';
import { flareAlpha, flareDuration, radarFlicker } from './flareWash.ts';

describe('the solar flare wash', () => {
  it('is dark before the flare, rises to a peak, and fades to nothing', () => {
    expect(flareAlpha(-50, false)).toBe(0);
    expect(flareAlpha(220, false)).toBeCloseTo(0.5);
    expect(flareAlpha(700, false)).toBeGreaterThan(0);
    expect(flareAlpha(700, false)).toBeLessThan(0.5);
    expect(flareAlpha(flareDuration(false), false)).toBe(0);
  });

  it('stays a faint, slow tint under reduced motion', () => {
    for (let age = 0; age < flareDuration(true); age += 50) {
      expect(flareAlpha(age, true)).toBeLessThanOrEqual(0.2);
    }
    // No jump between frames: it never changes by more than a few percent in 50 ms.
    for (let age = 0; age < flareDuration(true); age += 50) {
      expect(Math.abs(flareAlpha(age + 50, true) - flareAlpha(age, true))).toBeLessThan(0.05);
    }
  });
});

describe('the flare-struck Radar', () => {
  it('flickers at full motion, deterministically, and holds steady when calm', () => {
    const levels = new Set(Array.from({ length: 40 }, (_, i) => radarFlicker(i * 110, false)));
    expect(levels.size).toBe(2);
    expect(radarFlicker(500, false)).toBe(radarFlicker(500, false));
    expect(new Set(Array.from({ length: 40 }, (_, i) => radarFlicker(i * 110, true))).size).toBe(1);
  });
});
