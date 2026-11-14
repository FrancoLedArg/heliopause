import { describe, expect, it } from 'vitest';
import { generateStarSystem, homePlanet, listBodies, type StarSystem } from './index.ts';

/** Many seeds, so rules are checked across the generator's spread, not one lucky system. */
const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const systems: readonly StarSystem[] = SEEDS.map((seed) => generateStarSystem(seed));

describe('Star System generation', () => {
  it('a Star System has a star and 4 to 7 planets', () => {
    for (const system of systems) {
      expect(system.star.name).not.toBe('');
      expect(system.planets.length).toBeGreaterThanOrEqual(4);
      expect(system.planets.length).toBeLessThanOrEqual(7);
    }
    const counts = new Set(systems.map((system) => system.planets.length));
    expect([...counts].sort()).toEqual([4, 5, 6, 7]);
  });

  it('every Star System has rocky planets and Gas Giants, the rocky ones inside the Gas Giants', () => {
    for (const system of systems) {
      const rocky = system.planets.filter((planet) => planet.kind === 'rocky-planet');
      const gasGiants = system.planets.filter((planet) => planet.kind === 'gas-giant');
      expect(rocky.length).toBeGreaterThan(0);
      expect(gasGiants.length).toBeGreaterThan(0);
      const outermostRocky = Math.max(...rocky.map((planet) => planet.distanceFromStar));
      const innermostGasGiant = Math.min(...gasGiants.map((planet) => planet.distanceFromStar));
      expect(outermostRocky).toBeLessThan(innermostGasGiant);
    }
  });

  it('planets are listed from the star outward, each on its own orbit', () => {
    for (const system of systems) {
      const distances = system.planets.map((planet) => planet.distanceFromStar);
      for (let i = 1; i < distances.length; i++) {
        expect(distances[i]).toBeGreaterThan(distances[i - 1] ?? Infinity);
      }
    }
  });

  it('every planet has 0 to 4 Moons, which share its distance from the star', () => {
    const moonCounts = new Set<number>();
    for (const system of systems) {
      for (const planet of system.planets) {
        moonCounts.add(planet.moons.length);
        for (const moon of planet.moons) {
          expect(moon.kind).toBe('moon');
          expect(moon.planetId).toBe(planet.id);
          expect(moon.distanceFromStar).toBe(planet.distanceFromStar);
          expect(moon.distanceFromPlanet).toBeGreaterThan(0);
        }
      }
    }
    expect([...moonCounts].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('Gas Giants are never landable; rocky planets and Moons always are', () => {
    for (const body of systems.flatMap(listBodies)) {
      expect(body.landable).toBe(body.kind !== 'gas-giant');
    }
  });

  it('generated values stay within their sourced ranges', () => {
    // Expected ranges written out from docs/research/nasa-data-for-generation.md §1, "Sampling
    // ranges for the generator", in the module's units (m/s², m/s, AU).
    const ranges = {
      'rocky-planet': { gravity: [3.7, 9.8], escape: [4300, 11200], distance: [0.39, 1.52] },
      'gas-giant': { gravity: [8.7, 23.1], escape: [21300, 59500], distance: [5.2, 30.2] },
      moon: { gravity: [0.11, 1.8], escape: [240, 2700], distance: [0.39, 30.2] },
    } as const;
    for (const body of systems.flatMap(listBodies)) {
      const range = ranges[body.kind];
      expect(body.surfaceGravity).toBeGreaterThanOrEqual(range.gravity[0]);
      expect(body.surfaceGravity).toBeLessThanOrEqual(range.gravity[1]);
      expect(body.escapeVelocity).toBeGreaterThanOrEqual(range.escape[0]);
      expect(body.escapeVelocity).toBeLessThanOrEqual(range.escape[1]);
      expect(body.distanceFromStar).toBeGreaterThanOrEqual(range.distance[0]);
      expect(body.distanceFromStar).toBeLessThanOrEqual(range.distance[1]);
    }
  });

  it('stronger surface gravity comes with higher escape velocity within each kind of Body', () => {
    for (const kind of ['rocky-planet', 'gas-giant', 'moon'] as const) {
      const bodies = systems
        .flatMap(listBodies)
        .filter((body) => body.kind === kind)
        .sort((a, b) => a.surfaceGravity - b.surfaceGravity);
      for (let i = 1; i < bodies.length; i++) {
        expect(bodies[i]?.escapeVelocity).toBeGreaterThanOrEqual(
          bodies[i - 1]?.escapeVelocity ?? 0,
        );
      }
    }
  });

  it('the Home Planet is rocky, inner and has a Moon', () => {
    for (const system of systems) {
      const home = homePlanet(system);
      expect(home.kind).toBe('rocky-planet');
      expect(home.landable).toBe(true);
      expect(home.moons.length).toBeGreaterThanOrEqual(1);
      for (const planet of system.planets.filter((p) => p.kind === 'gas-giant')) {
        expect(home.distanceFromStar).toBeLessThan(planet.distanceFromStar);
      }
      expect(system.planets).toContain(home);
    }
  });

  it('the Home Planet is the smallest rocky planet', () => {
    for (const system of systems) {
      const rockyGravities = system.planets
        .filter((planet) => planet.kind === 'rocky-planet')
        .map((planet) => planet.surfaceGravity);
      expect(homePlanet(system).surfaceGravity).toBe(Math.min(...rockyGravities));
    }
  });

  it('the Star System and every Body have their own generated name', () => {
    for (const system of systems) {
      const names = [system.name, ...listBodies(system).map((body) => body.name)];
      for (const name of names) expect(name).toMatch(/^[A-Z][a-z]+(?:[ -][A-Z0-9][a-z0-9]*)?$/);
      expect(new Set(names).size).toBe(names.length);
    }
    const systemNames = new Set(systems.map((system) => system.name));
    expect(systemNames.size).toBeGreaterThan(systems.length * 0.9);
  });

  it('the Heliopause lies beyond the outermost planet', () => {
    for (const system of systems) {
      const outermost = Math.max(...system.planets.map((planet) => planet.distanceFromStar));
      expect(system.heliopauseRadius).toBeGreaterThan(outermost);
    }
  });

  it('the same seed generates the same Star System', () => {
    expect(generateStarSystem(1234)).toEqual(generateStarSystem(1234));
  });

  it('different seeds generate different Star Systems', () => {
    expect(generateStarSystem(1)).not.toEqual(generateStarSystem(2));
  });
});
