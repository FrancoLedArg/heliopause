import { describe, expect, it } from 'vitest';
import {
  CHASSIS_IDS,
  currentBody,
  generateStarSystem,
  homePlanet,
  listBodies,
  newSpacecraft,
  startRun,
} from './index.ts';

describe('a new Run', () => {
  it('starts in the Star System its seed generates', () => {
    expect(startRun(2026, 'scout').starSystem).toEqual(generateStarSystem(2026));
  });

  it('starts with the Spacecraft landed on the Home Planet', () => {
    for (const seed of [1, 2, 3, 99, 2026]) {
      const run = startRun(seed, 'hauler');
      expect(run.status).toEqual({ kind: 'landed', bodyId: run.starSystem.homePlanetId });
      expect(currentBody(run)).toEqual(homePlanet(run.starSystem));
    }
  });

  it('starts with a full Spacecraft on the chosen Chassis, whatever the seed', () => {
    for (const chassisId of CHASSIS_IDS) {
      for (const seed of [1, 2, 3, 99, 2026]) {
        expect(startRun(seed, chassisId).spacecraft).toEqual(newSpacecraft(chassisId));
      }
    }
  });

  it('Bodies do not move: their positions cannot change during a Run', () => {
    const run = startRun(31, 'lancer');
    for (const body of listBodies(run.starSystem)) {
      // Test fixture: a cast to attempt what the readonly types already forbid.
      const mutable = body as unknown as { distanceFromStar: number; orbitAngle: number };
      expect(() => (mutable.distanceFromStar = 99)).toThrow(TypeError);
      expect(() => (mutable.orbitAngle = 1)).toThrow(TypeError);
    }
    expect(listBodies(run.starSystem)).toEqual(listBodies(generateStarSystem(31)));
  });

  it("a Run's state cannot be changed in place", () => {
    const run = startRun(31, 'lancer');
    const mutable = run as unknown as { spacecraft: { fuelMass: number }; status: object };
    expect(() => (mutable.spacecraft.fuelMass = 1)).toThrow(TypeError);
    expect(() => (mutable.status = {})).toThrow(TypeError);
  });
});
