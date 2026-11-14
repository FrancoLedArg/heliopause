import { describe, expect, it } from 'vitest';
import { currentBody, generateStarSystem, homePlanet, listBodies, startRun } from './index.ts';

describe('a new Run', () => {
  it('starts in the Star System its seed generates', () => {
    expect(startRun(2026).starSystem).toEqual(generateStarSystem(2026));
  });

  it('starts with the Spacecraft landed on the Home Planet', () => {
    for (const seed of [1, 2, 3, 99, 2026]) {
      const run = startRun(seed);
      expect(run.status).toEqual({ kind: 'landed', bodyId: run.starSystem.homePlanetId });
      expect(currentBody(run)).toEqual(homePlanet(run.starSystem));
    }
  });

  it('starts with the same starter Spacecraft whatever the seed', () => {
    const [first, ...others] = [1, 2, 3, 99, 2026].map((seed) => startRun(seed).spacecraft);
    for (const spacecraft of others) expect(spacecraft).toEqual(first);
    expect(first?.dryMass).toBeGreaterThan(0);
    expect(first?.fuelMass).toBeGreaterThan(0);
    expect(first?.engineIsp).toBeGreaterThan(0);
  });

  it('Bodies do not move: their positions cannot change during a Run', () => {
    const run = startRun(31);
    for (const body of listBodies(run.starSystem)) {
      // Test fixture: a cast to attempt what the readonly types already forbid.
      const mutable = body as unknown as { distanceFromStar: number; orbitAngle: number };
      expect(() => (mutable.distanceFromStar = 99)).toThrow(TypeError);
      expect(() => (mutable.orbitAngle = 1)).toThrow(TypeError);
    }
    expect(listBodies(run.starSystem)).toEqual(listBodies(generateStarSystem(31)));
  });

  it("a Run's state cannot be changed in place", () => {
    const run = startRun(31);
    const mutable = run as unknown as { spacecraft: { fuelMass: number }; status: object };
    expect(() => (mutable.spacecraft.fuelMass = 1)).toThrow(TypeError);
    expect(() => (mutable.status = {})).toThrow(TypeError);
  });
});
