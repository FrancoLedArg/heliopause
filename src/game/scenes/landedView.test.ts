import { describe, expect, it } from 'vitest';
import { currentBody, findBody, startRun, type Run } from '../sim/index.ts';
import { SKY_VISIBLE, SPRITE_SIZE, horizonY, skyBodies, surfaceKind } from './landedView.ts';

/** A New Run with the default Chassis: the view rules do not depend on which. */
const newRun = (seed: number): Run => startRun(seed, 'scout');

function runOnMoonOfHome(seed: number): Run {
  const run = newRun(seed);
  const home = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId);
  const moon = home?.moons[0];
  if (!moon) throw new Error('Home Planet has no Moon');
  return { ...run, status: { kind: 'landed', bodyId: moon.id } };
}

describe('the Landed surface', () => {
  it('looks like rock on a rocky planet and like a Moon on a Moon', () => {
    expect(surfaceKind(currentBody(newRun(5)))).toBe('rocky');
    expect(surfaceKind(currentBody(runOnMoonOfHome(5)))).toBe('moon');
  });
});

describe('the Landed sky', () => {
  it('shows the star and is the same for the same seed', () => {
    const a = skyBodies(newRun(11));
    expect(a).toEqual(skyBodies(newRun(11)));
    expect(a.some((s) => s.kind === 'star')).toBe(true);
  });

  it('never shows the Body the Spacecraft stands on', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const run = newRun(seed);
      const here = currentBody(run).id;
      expect(skyBodies(run).every((s) => s.bodyId !== here)).toBe(true);
    }
  });

  it('shows only Bodies that exist in the Star System', () => {
    for (const seed of [1, 2, 3]) {
      const run = newRun(seed);
      for (const sky of skyBodies(run)) {
        if (sky.bodyId !== undefined) expect(findBody(run.starSystem, sky.bodyId)).toBeDefined();
        expect(sky.scale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('keeps every sky Body inside the part of the sky the first screen shows', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const sky of skyBodies(newRun(seed))) {
        expect(sky.x).toBeGreaterThanOrEqual(SKY_VISIBLE.left);
        expect(sky.x).toBeLessThanOrEqual(SKY_VISIBLE.right);
      }
    }
  });

  it('from the Home Planet, its Moon is in view on the first screen (seeds 1 to 300)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const run = newRun(seed);
      const home = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId);
      const moon = skyBodies(run).find((s) => s.bodyId === home?.moons[0]?.id);
      expect(moon, `seed ${seed}`).toBeDefined();
    }
  });

  it('shows the Home Planet from its Moon', () => {
    const run = newRun(7);
    expect(
      skyBodies(runOnMoonOfHome(7)).some((s) => s.bodyId === run.starSystem.homePlanetId),
    ).toBe(true);
  });

  it('draws farther Bodies first so nearer ones sit in front of them', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const distances = skyBodies(newRun(seed)).map((s) => s.distanceAu);
      expect(distances).toEqual([...distances].sort((a, b) => b - a));
    }
  });

  it('gives a Body the same sprite whether seen from the Home Planet or from its Moon', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const fromMoon = skyBodies(runOnMoonOfHome(seed));
      for (const a of skyBodies(newRun(seed))) {
        const b = fromMoon.find((s) => s.bodyId === a.bodyId);
        if (a.bodyId !== undefined && b) expect(b.sprite).toBe(a.sprite);
      }
    }
  });

  it('a Moon whose planet is in the sky sits beside it, never over it', () => {
    let checked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const run = newRun(seed);
      const sky = skyBodies(run);
      for (const moon of sky.filter((s) => s.kind === 'moon')) {
        if (moon.bodyId === undefined) throw new Error('sky Moon has no Body');
        const body = findBody(run.starSystem, moon.bodyId);
        if (body?.kind !== 'moon') throw new Error('sky Moon is not a Moon');
        const planet = sky.find((s) => s.bodyId === body.planetId);
        if (!planet) continue;
        checked++;
        const half = (s: (typeof sky)[number]) => (SPRITE_SIZE[s.kind] * s.scale) / 2;
        const apart = Math.hypot(moon.x - planet.x, moon.y - planet.y);
        expect(apart, `seed ${seed}`).toBeGreaterThanOrEqual(half(moon) + half(planet));
        expect(apart).toBeLessThanOrEqual(half(moon) + half(planet) + 2 * 2 * half(moon) + 6);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('keeps planets above the horizon the art draws, and below the top bar', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const s of skyBodies(newRun(seed))) {
        if (s.kind === 'star' || s.kind === 'moon' || s.scale > 2) continue;
        const half = (SPRITE_SIZE[s.kind] * s.scale) / 2;
        expect(s.y + half, `seed ${seed}`).toBeLessThanOrEqual(horizonY(s.x));
        expect(s.y - half).toBeGreaterThanOrEqual(46);
      }
    }
  });
});
