import { describe, expect, it } from 'vitest';
import { landedOn } from './testing.ts';
import {
  BLUEPRINT_THRESHOLDS,
  COMPONENTS,
  DISCOVERIES,
  discoveriesOn,
  install,
  listBodies,
  materials,
  newlyUnlocked,
  SCIENCE_BY_INSTRUMENT,
  startRun,
  type ComponentId,
  type Run,
} from './index.ts';
import { revealDiscoveries } from './discoveries.ts';

const rich = (run: Run): Run => ({ ...run, materials: materials(1_000) });

function installed(run: Run, id: ComponentId): Run {
  const result = install(run, run.spacecraft.slots.indexOf(null), id);
  if (result.kind !== 'installed') throw new Error(`Expected an install: ${result.reason.kind}`);
  return result.run;
}

describe('blueprints', () => {
  it('a locked blueprint cannot be installed and says how much Science it needs', () => {
    const fresh = rich(startRun(2026, 'scout', 0));
    expect(install(fresh, 2, 'sample-lab')).toEqual({
      kind: 'refused',
      reason: { kind: 'blueprint-locked', scienceNeeded: 40 },
    });
    const some = rich(startRun(2026, 'scout', 15));
    expect(install(some, 2, 'drill-3')).toEqual({
      kind: 'refused',
      reason: { kind: 'blueprint-locked', scienceNeeded: 185 },
    });
  });

  it('a blueprint is unlocked once the lifetime Science carried in reaches its threshold', () => {
    const veteran = rich(startRun(2026, 'scout', 40));
    expect(installed(veteran, 'sample-lab').spacecraft.slots).toContain('sample-lab');
    expect(install(veteran, 2, 'drill-3')).toMatchObject({ kind: 'refused' });
  });

  it('a blueprint unlocks the moment lifetime Science reaches its threshold, mid-Run', () => {
    for (let seed = 1; seed < 400; seed += 1) {
      const start = startRun(seed, 'scout', 30);
      const body = listBodies(start.starSystem).find(
        (b) =>
          b.landable &&
          discoveriesOn(start.starSystem, b.id).some(
            (id) => DISCOVERIES[id].instrument === 'camera',
          ),
      );
      const withCamera = installed(rich(start), 'camera');
      // A seed whose Starting Moon shows the Camera nothing, so the Science comes from `body`.
      if (!body || withCamera.science > 0) continue;
      const before = landedOn(withCamera, body.id);
      expect(install(before, 3, 'sample-lab')).toMatchObject({ kind: 'refused' });
      const after = revealDiscoveries(before, body.id).run;
      expect(after.science).toBeGreaterThanOrEqual(SCIENCE_BY_INSTRUMENT.camera);
      expect(newlyUnlocked(before, after)).toEqual(['sample-lab']);
      expect(installed(after, 'sample-lab').spacecraft.slots).toContain('sample-lab');
      return;
    }
    throw new Error('No seed hides a Camera Discovery');
  });

  it('a Run started without the device’s Science, as a replay starts one, has every blueprint unlocked', () => {
    const start = rich(startRun(2026, 'scout'));
    const built = installed(installed(start, 'drill-3'), 'sample-lab');
    expect(built.spacecraft.slots).toEqual(expect.arrayContaining(['drill-3', 'sample-lab']));
  });

  it('the Sample lab unlocks within a Run or two, Drill 3 only after several', () => {
    // A Camera Discovery is the smallest Science there is: a handful of them unlock the Sample lab.
    expect(BLUEPRINT_THRESHOLDS['sample-lab'] / SCIENCE_BY_INSTRUMENT.camera).toBeLessThanOrEqual(
      4,
    );
    expect(BLUEPRINT_THRESHOLDS['drill-3']).toBeGreaterThanOrEqual(
      3 * BLUEPRINT_THRESHOLDS['sample-lab'],
    );
  });

  it('Drill 3 yields more than Drill 2, at more mass and cost and less yield for its mass', () => {
    const two = COMPONENTS['drill-2'];
    const three = COMPONENTS['drill-3'];
    expect(three.yieldMultiplier).toBeGreaterThan(two.yieldMultiplier);
    expect(three.mass).toBeGreaterThan(two.mass);
    expect(three.cost).toBeGreaterThan(two.cost);
    expect((three.yieldMultiplier - 1) / three.mass).toBeLessThan(
      (two.yieldMultiplier - 1) / two.mass,
    );
  });
});
