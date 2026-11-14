import { describe, expect, it } from 'vitest';
import { currentBody, findBody, startRun, type Run } from '../sim/index.ts';
import { SKY_WIDTH, skyBodies, surfaceKind } from './landedView.ts';

function runOnMoonOfHome(seed: number): Run {
  const run = startRun(seed);
  const home = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId);
  const moon = home?.moons[0];
  if (!moon) throw new Error('Home Planet has no Moon');
  return { ...run, status: { kind: 'landed', bodyId: moon.id } };
}

describe('the Landed surface', () => {
  it('looks like rock on a rocky planet and like a Moon on a Moon', () => {
    expect(surfaceKind(currentBody(startRun(5)))).toBe('rocky');
    expect(surfaceKind(currentBody(runOnMoonOfHome(5)))).toBe('moon');
  });
});

describe('the Landed sky', () => {
  it('shows the star and is the same for the same seed', () => {
    const a = skyBodies(startRun(11));
    expect(a).toEqual(skyBodies(startRun(11)));
    expect(a.some((s) => s.kind === 'star')).toBe(true);
  });

  it('never shows the Body the Spacecraft stands on', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const run = startRun(seed);
      const here = currentBody(run).id;
      expect(skyBodies(run).every((s) => s.bodyId !== here)).toBe(true);
    }
  });

  it("shows the Home Planet's Moon from the Home Planet, and the Home Planet from its Moon", () => {
    const run = startRun(7);
    const home = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId);
    expect(skyBodies(run).some((s) => s.bodyId === home?.moons[0]?.id)).toBe(true);
    expect(
      skyBodies(runOnMoonOfHome(7)).some((s) => s.bodyId === run.starSystem.homePlanetId),
    ).toBe(true);
  });

  it('shows only Bodies that exist in the Star System, within the sky layer', () => {
    for (const seed of [1, 2, 3]) {
      const run = startRun(seed);
      for (const sky of skyBodies(run)) {
        if (sky.bodyId !== undefined) expect(findBody(run.starSystem, sky.bodyId)).toBeDefined();
        expect(sky.x).toBeGreaterThanOrEqual(0);
        expect(sky.x).toBeLessThanOrEqual(SKY_WIDTH);
        expect(sky.scale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('draws the Moon’s parent planet at least as large as any farther Gas Giant', () => {
    const sky = skyBodies(runOnMoonOfHome(7));
    const parent = sky.find((s) => s.kind === 'rocky-planet');
    for (const far of sky.filter((s) => s.kind === 'gas-giant')) {
      expect(parent?.scale).toBeGreaterThanOrEqual(far.scale);
    }
  });
});
