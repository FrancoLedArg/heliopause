import { describe, expect, it } from 'vitest';
import { metersPerSecond as mps } from '../game/sim/index.ts';
import { deltaVBar } from './deltaVBarView.ts';

describe('the Δv bar once Burns are flown', () => {
  it('draws a flown Burn at its actual cost and ticks where its estimate ended', () => {
    // Takeoff ran 20% over its 1.0 km/s estimate; the Transfer is not flown yet.
    const bar = deltaVBar(
      [
        { burn: 'takeoff', estimate: mps(1000), actual: mps(1200) },
        { burn: 'transfer', estimate: mps(4000) },
      ],
      mps(8000),
    );
    expect(bar.segments.map((s) => s.deltaV)).toEqual([1200, 4000]);
    expect(bar.segments.map((s) => s.width)).toEqual([0.15, 0.5]);
    expect(bar.segments[0]?.estimateTick).toBe(0.125);
    expect(bar.segments[1]?.estimateTick).toBeUndefined();
    expect(bar.margin).toBe(2800);
  });
});
