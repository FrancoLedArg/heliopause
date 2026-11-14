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
    expect(driftSlack(800)).toBe(80);
    expect(driftSlack(960)).toBe(160);
  });
});

describe('driftOffsets', () => {
  it('starts with every layer centred', () => {
    const o = driftOffsets(0, newDriftOffsets());
    expect(o).toEqual({ stars: 0, sky: 0, far: 0, mid: 0, near: 0 });
  });

  it('sweeps each layer to its full range at a quarter cycle and back the other way at three quarters', () => {
    const right = driftOffsets(Math.PI / 2, newDriftOffsets());
    const left = driftOffsets((3 * Math.PI) / 2, newDriftOffsets());
    expect(right.near).toBeCloseTo(DRIFT_RANGE.near);
    expect(left.near).toBeCloseTo(-DRIFT_RANGE.near);
    expect(right.far).toBeCloseTo(DRIFT_RANGE.far);
  });

  it('moves nearer layers further than farther ones (parallax)', () => {
    const o = driftOffsets(Math.PI / 2, newDriftOffsets());
    expect(o.near).toBeGreaterThan(o.mid);
    expect(o.mid).toBeGreaterThan(o.far);
    expect(o.far).toBeGreaterThan(o.sky);
    expect(o.sky).toBeGreaterThan(o.stars);
  });

  it('never moves a layer past the slack it has, so no edge shows', () => {
    expect(DRIFT_RANGE.near).toBeLessThan(driftSlack(800));
    expect(DRIFT_RANGE.mid).toBeLessThan(driftSlack(800));
    expect(DRIFT_RANGE.far).toBeLessThan(driftSlack(800));
    expect(DRIFT_RANGE.sky).toBeLessThan(driftSlack(960));
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
