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

  it('reads each flown Burn with its estimate, and lets a report say what was used', () => {
    const burns = [
      { burn: 'takeoff', estimate: mps(1000), actual: mps(1200) },
      { burn: 'transfer', estimate: mps(4000), actual: mps(3800) },
    ] as const;
    expect(deltaVBar(burns, mps(8000), { verb: 'Used' }).label).toBe(
      'Δv: Takeoff 1.2 km/s (est. 1.0), Transfer 3.8 km/s (est. 4.0). Used 5.0 of 8.0 km/s, Margin +3.0 km/s.',
    );
    // A plan, with no actual costs yet, reads its estimates and what it needs.
    expect(deltaVBar([{ burn: 'takeoff', estimate: mps(800) }], mps(8000)).label).toBe(
      'Δv: Takeoff 0.80 km/s. Needs 0.80 of 8.0 km/s, Margin +7.2 km/s.',
    );
  });
});
