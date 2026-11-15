import { describe, expect, it } from 'vitest';
import { stringSeed } from '../lib/stringSeed.ts';
import {
  BODY_TUNING,
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

  it("seed 123's Bodies keep their names, orbits and sizes (new rolls never shift the RNG)", () => {
    const system = generateStarSystem(123);
    const pinned = JSON.parse(
      '["Tothaexprae","planet-1","102.436756",[["planet-1","Mioquoxdru","0.434101","3.682326","5.868094","6752.434"],["planet-1-moon-1","Roxho Minor","0.434101","3.751611","0.145221","291.269"],["planet-2","Liltux","1.129603","3.336672","6.878600","7895.466"],["planet-2-moon-1","Tiosli","1.129603","5.613642","0.438914","718.774"],["planet-3","Hulxu","6.338748","3.164405","9.287885","22859.528"],["planet-3-moon-1","Ruxi","6.338748","3.516488","0.474599","770.718"],["planet-4","Quyzi Prime","8.208549","3.402418","10.320600","25599.091"],["planet-4-moon-1","Tyquesion","8.208549","0.564942","1.218963","1854.230"],["planet-4-moon-2","Zulthix-2","8.208549","1.548380","1.078617","1649.940"],["planet-4-moon-3","Thuri","8.208549","3.148021","0.317604","542.193"],["planet-4-moon-4","Venke","8.208549","5.224049","0.692915","1088.504"],["planet-5","Viosprixzul","12.556880","6.019771","16.331792","41545.448"],["planet-5-moon-1","Viormio","12.556880","4.047939","1.244971","1892.088"],["planet-5-moon-2","Thyhae","12.556880","5.446103","1.168266","1780.434"],["planet-5-moon-3","Hyrzethion","12.556880","4.218566","0.212536","389.254"],["planet-6","Caexisu","18.627722","1.667084","20.504913","52615.812"],["planet-6-moon-1","Mesprursin","18.627722","0.576598","0.364335","610.215"],["planet-6-moon-2","Maerprondro Nova","18.627722","1.518801","0.271552","475.159"],["planet-7","Raexthanho","23.252931","5.859746","12.472028","31306.352"],["planet-7-moon-1","Relhoxry","23.252931","0.845263","1.058425","1620.547"],["planet-7-moon-2","Thakyxy","23.252931","1.127325","1.112827","1699.736"]]]',
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

describe('Star System difficulty levels', () => {
  const at = (level: number) => SEEDS.map((seed) => generateStarSystem(seed, level));
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const landable = (all: readonly StarSystem[]) =>
    all.flatMap(listBodies).filter((body) => body.landable);

  it("difficulty level 1 generates exactly today's Star System", () => {
    // FNV-1a hash of these seeds' Systems as JSON, captured (and confirmed against a SHA-256)
    // before levels existed.
    expect(stringSeed(JSON.stringify(at(1)))).toBe(1599656541);
    expect(JSON.stringify(systems)).toBe(JSON.stringify(at(1)));
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

  it('generation is deterministic by seed at levels 1 to 3', () => {
    for (const level of [1, 2, 3]) {
      for (const seed of [1, 123, 2026]) {
        expect(generateStarSystem(seed, level)).toEqual(generateStarSystem(seed, level));
      }
    }
  });
});
