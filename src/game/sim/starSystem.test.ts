import { describe, expect, it } from 'vitest';
import { stringSeed } from '../lib/stringSeed.ts';
import { earlyDeadEnds } from './testing.ts';
import {
  BODY_TUNING,
  CHASSIS_IDS,
  ICE_LINE,
  generateStarSystem,
  homePlanet,
  listBodies,
  type StarSystem,
} from './index.ts';

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

  it('every rocky planet has two Moons and every Gas Giant 1 to 4, which share its distance from the star', () => {
    const gasGiantMoonCounts = new Set<number>();
    for (const system of systems) {
      for (const planet of system.planets) {
        if (planet.kind === 'gas-giant') gasGiantMoonCounts.add(planet.moons.length);
        else expect(planet.moons.length).toBe(2);
        for (const moon of planet.moons) {
          expect(moon.kind).toBe('moon');
          expect(moon.planetId).toBe(planet.id);
          expect(moon.distanceFromStar).toBe(planet.distanceFromStar);
          expect(moon.distanceFromPlanet).toBeGreaterThan(0);
        }
      }
    }
    expect([...gasGiantMoonCounts].sort()).toEqual([1, 2, 3, 4]);
  });

  it('rocky planets are Mercury- to Mars-sized: none leaves faster than Mars (5.03 km/s)', () => {
    const rocky = systems.flatMap((system) =>
      system.planets.filter((planet) => planet.kind === 'rocky-planet'),
    );
    for (const planet of rocky) {
      expect(planet.escapeVelocity).toBeGreaterThanOrEqual(4_300);
      expect(planet.escapeVelocity).toBeLessThanOrEqual(5_030);
    }
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

  it("seed 123's Bodies keep their names, orbits and sizes (new rolls never shift the RNG)", () => {
    const system = generateStarSystem(123);
    const pinned = JSON.parse(
      // Re-pinned for #188: rocky planets are now Mars-sized at most and have two Moons each.
      '["Praenquiox","planet-2","93.822079",[["planet-1","Pryxzohan","0.685609","3.415343","3.729297","4333.139"],["planet-1-moon-1","Hynthon","0.685609","1.003739","1.434691","2168.249"],["planet-1-moon-2","Kexxy","0.685609","2.013320","0.709457","1112.582"],["planet-2","Tyhun","0.898983","2.886934","3.723038","4326.059"],["planet-2-moon-1","Synna","0.898983","4.668636","0.853400","1322.109"],["planet-2-moon-2","Thysaer","0.898983","1.095119","1.095552","1674.591"],["planet-3","Thedryl","6.835212","5.846628","15.812801","40168.682"],["planet-3-moon-1","Haenucux","6.835212","4.211735","1.028012","1576.277"],["planet-3-moon-2","Rulquyxlae","6.835212","0.274197","0.774162","1206.768"],["planet-3-moon-3","Xolior","6.835212","5.232701","1.267950","1925.536"],["planet-3-moon-4","Naepre","6.835212","1.596285","1.695097","2547.301"],["planet-4","Nutae","21.541544","2.919196","19.045821","48745.164"],["planet-4-moon-1","Sircer","21.541544","4.458915","1.733182","2602.739"],["planet-4-moon-2","Musuxlar","21.541544","6.066155","0.564591","901.712"],["planet-4-moon-3","Haexxunmix","21.541544","2.400970","0.462933","753.737"]]]',
    ) as unknown;
    expect([
      system.name,
      system.homePlanetId,
      system.heliopauseRadius.toFixed(6),
      listBodies(system).map((b) => [
        b.id,
        b.name,
        b.distanceFromStar.toFixed(6),
        b.orbitAngle.toFixed(6),
        b.surfaceGravity.toFixed(6),
        b.escapeVelocity.toFixed(3),
      ]),
    ]).toEqual(pinned);
  });
});

describe('Icy and Rocky Bodies', () => {
  const landable = systems.flatMap((system) => listBodies(system).filter((b) => b.landable));

  it('every landable Body is Icy or Rocky with a base yield inside the tuning range of its type', () => {
    for (const body of landable) {
      expect(['icy', 'rocky']).toContain(body.composition);
      const range = BODY_TUNING.baseYield[body.composition];
      expect(body.baseYield).toBeGreaterThanOrEqual(range.min);
      expect(body.baseYield).toBeLessThanOrEqual(range.max);
    }
  });

  it('an Icy yield is a meaningful share of the smallest Fuel tank (21,000 kg)', () => {
    const icy = landable.filter((b) => b.composition === 'icy');
    expect(Math.min(...icy.map((b) => b.baseYield))).toBeGreaterThanOrEqual(21_000 * 0.1);
    expect(Math.max(...icy.map((b) => b.baseYield))).toBeLessThan(21_000);
  });

  it('a Gas Giant has no resource type or yield', () => {
    for (const system of systems) {
      for (const planet of system.planets.filter((p) => p.kind === 'gas-giant')) {
        expect(planet).not.toHaveProperty('composition');
        expect(planet).not.toHaveProperty('baseYield');
      }
    }
  });

  it('the Home Planet is Rocky and its Moons are Icy', () => {
    for (const system of systems) {
      const home = homePlanet(system);
      expect(home.composition).toBe('rocky');
      expect(home.moons.length).toBeGreaterThan(0);
      for (const moon of home.moons) expect(moon.composition).toBe('icy');
    }
  });

  it('Icy Bodies are more common in the outer system', () => {
    const share = (bodies: typeof landable) =>
      bodies.filter((b) => b.composition === 'icy').length / bodies.length;
    const inner = landable.filter((b) => b.distanceFromStar < ICE_LINE.distance.value);
    const outer = landable.filter((b) => b.distanceFromStar >= ICE_LINE.distance.value);
    expect(inner.length).toBeGreaterThan(50);
    expect(outer.length).toBeGreaterThan(50);
    expect(share(outer)).toBeGreaterThan(share(inner) + 0.2);
  });

  it('both types turn up far from the Home Planet', () => {
    const away = landable.filter((b) => b.distanceFromStar > 5);
    expect(away.some((b) => b.composition === 'rocky')).toBe(true);
    expect(away.some((b) => b.composition === 'icy')).toBe(true);
  });
});

describe('no early dead ends (#188)', () => {
  it('generation leaves no early dead end: no 100% Hop from the start strands any Chassis, at levels 1 to 3', () => {
    const found: string[] = [];
    for (const level of [1, 2, 3]) {
      for (let i = 0; i < 500; i++) {
        const system = generateStarSystem(i * 7919 + 1, level);
        for (const chassis of CHASSIS_IDS) {
          for (const body of earlyDeadEnds(system, chassis, level)) {
            found.push(`seed ${system.seed} level ${level} ${chassis}: ${body.id}`);
          }
        }
      }
    }
    expect(found.slice(0, 10)).toEqual([]);
  }, 120_000);
});

// Generating 300 Star Systems at a level takes about 0.5 to 2 s (#188 redraws), so each level is
// generated once and the tests get room on a loaded machine.
describe('Star System difficulty levels', { timeout: 60_000 }, () => {
  const levels = new Map<number, StarSystem[]>();
  const at = (level: number): StarSystem[] => {
    const known = levels.get(level);
    if (known) return known;
    const generated = SEEDS.map((seed) => generateStarSystem(seed, level));
    levels.set(level, generated);
    return generated;
  };
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const landable = (all: readonly StarSystem[]) =>
    all.flatMap(listBodies).filter((body) => body.landable);

  it("difficulty level 1 generates exactly today's Star System", () => {
    // FNV-1a hash of these seeds' Systems as JSON, computed from main before levels existed.
    // Numbers are rounded to 9 significant digits: Math.log/exp differ in the last bit between
    // x64 and arm64, which 9 digits absorbs while still catching any tuning change.
    const json = JSON.stringify(at(1), (_key, value: unknown) =>
      typeof value === 'number' ? Number(value.toPrecision(9)) : value,
    );
    // Re-pinned for #188, which changed generation (no early dead ends).
    expect(stringSeed(json)).toBe(3995910413);
  });

  it('a higher difficulty level raises gravity', () => {
    for (const level of [2, 3, 5]) {
      const lower = at(level - 1).flatMap(listBodies);
      const higher = at(level).flatMap(listBodies);
      expect(mean(higher.map((b) => b.surfaceGravity))).toBeGreaterThan(
        mean(lower.map((b) => b.surfaceGravity)),
      );
      expect(mean(higher.map((b) => b.escapeVelocity))).toBeGreaterThan(
        mean(lower.map((b) => b.escapeVelocity)),
      );
    }
  });

  it('a higher difficulty level lowers the Icy share', () => {
    const share = (all: readonly StarSystem[]) => {
      const bodies = landable(all);
      return bodies.filter((b) => b.composition === 'icy').length / bodies.length;
    };
    expect(share(at(2))).toBeLessThan(share(at(1)));
    expect(share(at(3))).toBeLessThan(share(at(2)));
    expect(share(at(3))).toBeGreaterThan(0.2);
  });

  it('a higher difficulty level lowers yields', () => {
    for (const composition of ['icy', 'rocky'] as const) {
      const yields = (level: number) =>
        mean(
          landable(at(level))
            .filter((b) => b.composition === composition)
            .map((b) => b.baseYield),
        );
      expect(yields(2)).toBeLessThan(yields(1));
      expect(yields(3)).toBeLessThan(yields(2));
    }
  });

  it('a higher difficulty level pushes the Heliopause farther', () => {
    expect(mean(at(2).map((s) => s.heliopauseRadius))).toBeGreaterThan(
      mean(at(1).map((s) => s.heliopauseRadius)),
    );
    expect(mean(at(3).map((s) => s.heliopauseRadius))).toBeGreaterThan(
      mean(at(2).map((s) => s.heliopauseRadius)),
    );
  });

  it('a difficulty level below 1 is refused', () => {
    expect(() => generateStarSystem(1, 0)).toThrow(RangeError);
  });

  it('generation is deterministic by seed at levels 1 to 3', () => {
    for (const level of [1, 2, 3]) {
      for (const seed of [1, 123, 2026]) {
        expect(generateStarSystem(seed, level)).toEqual(generateStarSystem(seed, level));
      }
    }
  });
});
