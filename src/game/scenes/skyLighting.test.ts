import { describe, expect, it } from 'vitest';
import { SKY_LIGHT, skyLighting } from './skyLighting.ts';

describe('the sky light follows the local time of day', () => {
  it('is darkest at midnight and brightest at noon', () => {
    expect(skyLighting(0).shadeAlpha).toBeCloseTo(SKY_LIGHT.shadeMax, 6);
    expect(skyLighting(0).glowAlpha).toBeCloseTo(0, 6);
    expect(skyLighting(0.5).shadeAlpha).toBeCloseTo(0, 6);
    expect(skyLighting(0.5).glowAlpha).toBeCloseTo(SKY_LIGHT.glowMax, 6);
  });

  it('is brighter at 9 in the morning than at 3 at night', () => {
    expect(skyLighting(0.375).shadeAlpha).toBeLessThan(skyLighting(0.125).shadeAlpha);
  });

  it('never goes fully black or fully washed out', () => {
    for (let i = 0; i <= 100; i++) {
      const light = skyLighting(i / 100);
      expect(light.shadeAlpha).toBeLessThanOrEqual(0.6);
      expect(light.glowAlpha).toBeLessThanOrEqual(0.35);
    }
  });
});
