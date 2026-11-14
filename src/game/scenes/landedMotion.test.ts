import { SKY_WIDTH, SURFACE_WIDTH } from './landedView.ts';
import { describe, expect, it } from 'vitest';
import {
  DRIFT_PERIOD_MS,
  DRIFT_RANGE,
  DUST_SPAN,
  blowX,
  driftOffsets,
  driftSlack,
  newDriftOffsets,
  phaseAt,
} from './landedMotion.ts';

describe('driftSlack', () => {
  it('is the width a layer has to spare on each side once centred on the 640 px screen', () => {
    expect(driftSlack(SURFACE_WIDTH)).toBe(80);
    expect(driftSlack(SKY_WIDTH)).toBe(160);
  });
});

describe('driftOffsets', () => {
  it('starts with every layer centred', () => {
    const o = driftOffsets(0, newDriftOffsets());
    expect(o).toEqual({ stars: 0, sky: 0, ground: 0 });
  });

  it('sweeps each layer to its full range at a quarter cycle and back the other way at three quarters', () => {
    const right = driftOffsets(Math.PI / 2, newDriftOffsets());
    const left = driftOffsets((3 * Math.PI) / 2, newDriftOffsets());
    expect(right.ground).toBeCloseTo(DRIFT_RANGE.ground);
    expect(left.ground).toBeCloseTo(-DRIFT_RANGE.ground);
    expect(right.sky).toBeCloseTo(DRIFT_RANGE.sky);
  });

  it('moves nearer layers further than farther ones (parallax)', () => {
    const o = driftOffsets(Math.PI / 2, newDriftOffsets());
    expect(o.ground).toBeGreaterThan(o.sky);
    expect(o.sky).toBeGreaterThan(o.stars);
  });

  it('never moves a layer past the slack it has, so no edge shows', () => {
    expect(DRIFT_RANGE.ground).toBeLessThan(driftSlack(SURFACE_WIDTH));
    expect(DRIFT_RANGE.sky).toBeLessThan(driftSlack(SKY_WIDTH));
  });

  it('writes into the object it is given, so a frame allocates nothing', () => {
    const out = newDriftOffsets();
    expect(driftOffsets(1, out)).toBe(out);
  });
});

describe('blowX', () => {
  it('moves a mote along by its speed over the elapsed time', () => {
    expect(blowX(100, 20, 1000)).toBeCloseTo(120);
  });

  it('wraps a mote that leaves the right edge back to just off the left edge', () => {
    expect(blowX(DUST_SPAN.max - 1, 20, 1000)).toBeCloseTo(DUST_SPAN.min + 19);
  });
});

describe('phaseAt', () => {
  it('is one full turn per drift period', () => {
    expect(phaseAt(0)).toBe(0);
    expect(phaseAt(DRIFT_PERIOD_MS / 4)).toBeCloseTo(Math.PI / 2);
    expect(phaseAt(DRIFT_PERIOD_MS)).toBeCloseTo(2 * Math.PI);
  });
});
