import { describe, expect, it } from 'vitest';
import { currentBody, findBody, startRun, type Run } from '../sim/index.ts';
import { SKY_VISIBLE, skyBodies, surfaceKind } from './landedView.ts';

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

  it('shows only Bodies that exist in the Star System', () => {
    for (const seed of [1, 2, 3]) {
      const run = startRun(seed);
      for (const sky of skyBodies(run)) {
        if (sky.bodyId !== undefined) expect(findBody(run.starSystem, sky.bodyId)).toBeDefined();
        expect(sky.scale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('keeps every sky Body inside the part of the sky the first screen shows', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const sky of skyBodies(startRun(seed))) {
        expect(sky.x).toBeGreaterThanOrEqual(SKY_VISIBLE.left);
        expect(sky.x).toBeLessThanOrEqual(SKY_VISIBLE.right);
      }
    }
  });

  it('from the Home Planet, its Moon is in view on the first screen (seeds 1 to 300)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const run = startRun(seed);
      const home = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId);
      const moon = skyBodies(run).find((s) => s.bodyId === home?.moons[0]?.id);
      expect(moon, `seed ${seed}`).toBeDefined();
    }
  });

  it('shows the Home Planet from its Moon', () => {
    const run = startRun(7);
    expect(
      skyBodies(runOnMoonOfHome(7)).some((s) => s.bodyId === run.starSystem.homePlanetId),
    ).toBe(true);
  });

  it('draws farther Bodies first so nearer ones sit in front of them', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const distances = skyBodies(startRun(seed)).map((s) => s.distanceAu);
      expect(distances).toEqual([...distances].sort((a, b) => b - a));
    }
  });

  it('gives a Body the same sprite whether seen from the Home Planet or from its Moon', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const fromMoon = skyBodies(runOnMoonOfHome(seed));
      for (const a of skyBodies(startRun(seed))) {
        const b = fromMoon.find((s) => s.bodyId === a.bodyId);
        if (a.bodyId !== undefined && b) expect(b.sprite).toBe(a.sprite);
      }
    }
  });

  it("keeps a distant planet's Moons within a few pixels of it", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const sky = skyBodies(startRun(seed));
      for (const moon of sky.filter((s) => s.kind === 'moon' && s.scale === 1)) {
        const planet = sky.find((s) => s.bodyId === moon.bodyId?.replace(/-moon-\d+$/, ''));
        if (planet) expect(Math.abs(moon.y - planet.y)).toBeLessThanOrEqual(8);
      }
    }
  });
});
