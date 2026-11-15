import { describe, expect, it } from 'vitest';
import { stringSeed } from '../lib/stringSeed.ts';
import { earlyDeadEnds, startingRun } from './testing.ts';
import {
  BODY_TUNING,
  CHASSIS_IDS,
  ICE_LINE,
  findBody,
  firstDetectedBody,
  generateStarSystem,
  install,
  listBodies,
  marginShare,
  OPENING_TUNING,
  planHop,
  startingMoon,
  startRun,
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

  it('the Starting Moon orbits a planet in the inner half of the Star System', () => {
    for (const system of systems) {
      const moon = startingMoon(system);
      const index = system.planets.findIndex((planet) => planet.id === moon.planetId);
      expect(index).toBeGreaterThanOrEqual(0);
      // Planets counted out from the star: 4 planets give an inner half of 2, 5 give 3.
      expect(index).toBeLessThan(Math.ceil(system.planets.length / 2));
    }
  });

  it("a Gas Giant's Starting Moon has a sibling Moon, so Comms has a landable Body to Detect", () => {
    for (const system of systems) {
      const moon = startingMoon(system);
      const planet = findBody(system, moon.planetId);
      if (planet?.kind === 'gas-giant') expect(planet.moons.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('the Starting Moon is picked from the seed: rocky planets and Gas Giants both have Runs start on their Moons', () => {
    const kinds = new Set(
      systems.map((system) => findBody(system, startingMoon(system).planetId)?.kind),
    );
    expect([...kinds].sort()).toEqual(['gas-giant', 'rocky-planet']);
    const moonIndexes = new Set(systems.map((system) => startingMoon(system).id.slice(-1)));
    expect(moonIndexes.size).toBeGreaterThan(1);
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
      // Re-pinned for #189: generation keeps the first draw with a fair opening on its Starting Moon.
      '["Tothaexprae","planet-4-moon-3","28.484496",[["planet-1","Mioquoxdru","0.434101","3.682326","3.929378","4559.460"],["planet-1-moon-1","Draeldri","0.434101","3.751611","0.145221","291.269"],["planet-1-moon-2","Draeprer","0.434101","1.871768","1.007471","1546.378"],["planet-2","Tiosli","1.129603","5.613642","4.036287","4680.390"],["planet-2-moon-1","Hulxu","1.129603","3.164405","1.764707","2648.627"],["planet-2-moon-2","Ruxi","1.129603","3.516488","0.474599","770.718"],["planet-3","Quyzi Prime","6.338748","3.402418","9.287885","22859.528"],["planet-3-moon-1","Tyquesion","6.338748","0.564942","1.218963","1854.230"],["planet-3-moon-2","Zulthix-2","6.338748","1.548380","1.078617","1649.940"],["planet-3-moon-3","Thuri","6.338748","3.148021","0.317604","542.193"],["planet-3-moon-4","Venke","6.338748","5.224049","0.692915","1088.504"],["planet-4","Viosprixzul","8.208549","6.019771","10.320600","25599.091"],["planet-4-moon-1","Viormio","8.208549","4.047939","1.244971","1892.088"],["planet-4-moon-2","Thyhae","8.208549","5.446103","1.168266","1780.434"],["planet-4-moon-3","Hyrzethion","8.208549","4.218566","0.212536","389.254"],["planet-5","Caexisu","12.556880","1.667084","16.331792","41545.448"],["planet-5-moon-1","Mesprursin","12.556880","0.576598","0.364335","610.215"],["planet-5-moon-2","Maerprondro Nova","12.556880","1.518801","0.271552","475.159"],["planet-6","Raexthanho","18.627722","5.859746","20.504913","52615.812"],["planet-6-moon-1","Relhoxry","18.627722","0.845263","1.058425","1620.547"],["planet-6-moon-2","Thakyxy","18.627722","1.127325","1.112827","1699.736"],["planet-7","Narsexdros","23.252931","4.579620","12.472028","31306.352"],["planet-7-moon-1","Rexsio","23.252931","5.402485","1.215491","1849.176"],["planet-7-moon-2","Niovy","23.252931","3.856455","1.174568","1789.608"],["planet-7-moon-3","Xydraes","23.252931","3.337050","0.137052","279.378"],["planet-7-moon-4","Xezix","23.252931","4.000847","1.399849","2117.531"]]]',
    ) as unknown;
    expect([
      system.name,
      system.startingMoonId,
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

  it('Icy Bodies are more common in the outer system', () => {
    const share = (bodies: typeof landable) =>
      bodies.filter((b) => b.composition === 'icy').length / bodies.length;
    const inner = landable.filter((b) => b.distanceFromStar < ICE_LINE.distance.value);
    const outer = landable.filter((b) => b.distanceFromStar >= ICE_LINE.distance.value);
    expect(inner.length).toBeGreaterThan(50);
    expect(outer.length).toBeGreaterThan(50);
    expect(share(outer)).toBeGreaterThan(share(inner) + 0.2);
  });

  it('both types turn up far from the inner Star System', () => {
    const away = landable.filter((b) => b.distanceFromStar > 5);
    expect(away.some((b) => b.composition === 'rocky')).toBe(true);
    expect(away.some((b) => b.composition === 'icy')).toBe(true);
  });
});

describe('a fair opening (#96), with no early dead ends (#188)', () => {
  it('a new Run cannot afford a Jump Drive before its first Hop', () => {
    // Otherwise a Rocky opening could pay for one on the Starting Moon and Jump on Hop 1 (#189 review).
    const affords: string[] = [];
    for (let i = 0; i < 500; i++) {
      const seed = i * 7919 + 1;
      for (const chassis of CHASSIS_IDS) {
        const run = startRun(seed, chassis);
        const slot = run.spacecraft.slots.indexOf(null);
        if (install(run, slot, 'jump-drive').kind === 'installed')
          affords.push(`${seed} ${chassis}`);
      }
    }
    expect(affords.slice(0, 10)).toEqual([]);
  });

  it('the first Detected Body yields something and is In reach with comfortable Margin for every Chassis, and no 100% Hop from the Starting Moon strands any Chassis, at levels 1 to 3', () => {
    const found: string[] = [];
    for (const level of [1, 2, 3]) {
      for (let i = 0; i < 500; i++) {
        const system = generateStarSystem(i * 7919 + 1, level);
        const first = firstDetectedBody(system);
        const at = `seed ${system.seed} level ${level}`;
        if (first.baseYield <= 0) found.push(`${at}: ${first.id} yields nothing`);
        for (const chassis of CHASSIS_IDS) {
          const start = startingRun(system, chassis, level);
          const planned = planHop(start, first.id);
          if (planned.kind !== 'planned') {
            found.push(`${at} ${chassis}: no Hop to ${first.id}`);
            continue;
          }
          const { plan } = planned;
          if (plan.successChance < 1 || marginShare(plan) < OPENING_TUNING.firstHop.marginShare) {
            found.push(`${at} ${chassis}: ${first.id} is not comfortably In reach`);
          }
          for (const body of earlyDeadEnds(system, chassis, level, start)) {
            found.push(`${at} ${chassis}: dead end ${body.id}`);
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
    // Re-pinned for #189: the Starting Moon replaces the Home Planet, and generation checks its opening.
    // Re-pinned for #191: the Heliopause lies just past the outermost planet, where the Radar finds it.
    expect(stringSeed(json)).toBe(3779818511);
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
