import { createRng, type Rng } from '../lib/rng.ts';
import { stringSeed } from '../lib/stringSeed.ts';
import {
  BODY_TUNING,
  DIFFICULTY_TUNING,
  GENERATION_TUNING,
  ICE_LINE,
  SOURCED_RANGES,
  difficultyFactor,
  type Range,
} from './data.ts';
import {
  astronomicalUnits,
  kilograms,
  kilometers,
  materials,
  type Kilograms,
  type Materials,
  metersPerSecond,
  metersPerSecondSquared,
  radians,
  type AstronomicalUnits,
  type Kilometers,
  type MetersPerSecond,
  type MetersPerSecondSquared,
  type Radians,
} from './units.ts';

/** A Run's seed: any integer; the same seed always generates the same Star System. */
export type Seed = number;

declare const bodyIdBrand: unique symbol;

/**
 * Identifies a Body within its Star System. Branded so an arbitrary string (a name, a seed) cannot
 * be passed where a Body is meant; only the generator makes them.
 */
export type BodyId = string & { readonly [bodyIdBrand]: 'BodyId' };

const bodyId = (value: string) => value as BodyId;

export interface Star {
  readonly name: string;
}

interface BodyBase {
  readonly id: BodyId;
  readonly name: string;
  /** For a Gas Giant, at its 1 bar reference level: it has no surface. */
  readonly surfaceGravity: MetersPerSecondSquared;
  readonly escapeVelocity: MetersPerSecond;
  /** A Moon's is its planet's. */
  readonly distanceFromStar: AstronomicalUnits;
}

/** What a landable Body is made of: an Icy Body yields Fuel, a Rocky Body yields Materials. */
export type BodyComposition = 'icy' | 'rocky';

/**
 * What a landable Body is made of and what its first landing yields, before any Drill multiplier:
 * Fuel for an Icy Body, Materials for a Rocky one.
 */
export type Resource =
  | { readonly composition: 'icy'; readonly baseYield: Kilograms }
  | { readonly composition: 'rocky'; readonly baseYield: Materials };

type LandableBase = BodyBase & Resource & { readonly landable: true };

interface PlanetBase extends BodyBase {
  /** Fixed position on its orbit around the star: Bodies do not move. */
  readonly orbitAngle: Radians;
  /** Nearest first. */
  readonly moons: readonly Moon[];
}

export type RockyPlanet = PlanetBase & LandableBase & { readonly kind: 'rocky-planet' };

/** A planet with no surface: never landable, but home to Moons. */
export interface GasGiant extends PlanetBase {
  readonly kind: 'gas-giant';
  readonly landable: false;
}

export type Moon = LandableBase & {
  readonly kind: 'moon';
  readonly planetId: BodyId;
  readonly distanceFromPlanet: Kilometers;
  /** Fixed position on its orbit around its planet: Bodies do not move. */
  readonly orbitAngle: Radians;
};

export type Planet = RockyPlanet | GasGiant;

/** A planet or Moon. */
export type Body = Planet | Moon;

/** A Body the Spacecraft can stand on. */
export type LandableBody = RockyPlanet | Moon;

export interface StarSystem {
  readonly seed: Seed;
  readonly name: string;
  readonly star: Star;
  /** From the star outward. */
  readonly planets: readonly Planet[];
  /** A small, inner rocky planet with at least one Moon: where the Spacecraft starts. */
  readonly homePlanetId: BodyId;
  /** The outer edge of the Star System. */
  readonly heliopauseRadius: AstronomicalUnits;
}

/**
 * The Star System a seed generates at a difficulty level (the Star System number, from 1). Level 1
 * is the baseline and every higher level only scales its values, so the same seed gives the same
 * layout, names and rolls at every level, just harder.
 */
export function generateStarSystem(seed: Seed, level = 1): StarSystem {
  const gravityFactor = difficultyFactor(DIFFICULTY_TUNING.gravity, level);
  const rng = createRng(seed);
  const nextName = createNamer(rng);
  const name = nextName();

  const planetCount = sampleInt(rng, GENERATION_TUNING.planetCount);
  const rockyCount = rng.int(
    GENERATION_TUNING.rockyPlanetCount.min,
    Math.min(GENERATION_TUNING.rockyPlanetCount.max, planetCount - 1),
  );
  const rockyPlanets = spreadOrbits(
    rng,
    rockyCount,
    SOURCED_RANGES.rockyPlanet.distanceFromStar,
  ).map((distance) => ({
    kind: 'rocky-planet' as const,
    landable: true as const,
    distanceFromStar: astronomicalUnits(distance),
    ...sampleBodySize(rng, SOURCED_RANGES.rockyPlanet, gravityFactor),
  }));
  const gasGiants = spreadOrbits(
    rng,
    planetCount - rockyCount,
    SOURCED_RANGES.gasGiant.distanceFromStar,
  ).map((distance) => ({
    kind: 'gas-giant' as const,
    landable: false as const,
    distanceFromStar: astronomicalUnits(distance),
    ...sampleBodySize(rng, SOURCED_RANGES.gasGiant, gravityFactor),
  }));

  // The Home Planet is the smallest rocky planet: close to its star and easy to leave.
  const homeIndex = rockyPlanets.reduce(
    (smallest, planet, index) =>
      planet.surfaceGravity < (rockyPlanets[smallest]?.surfaceGravity ?? Infinity)
        ? index
        : smallest,
    0,
  );

  const planets: Planet[] = [...rockyPlanets, ...gasGiants].map((planet, index) => {
    const id = bodyId(`planet-${index + 1}`);
    const isHome = index === homeIndex;
    const moonCount = sampleInt(rng, GENERATION_TUNING.moonCount[planet.kind]);
    const shared = {
      id,
      name: nextName(),
      orbitAngle: randomAngle(rng),
    };
    // The Home Planet always has a Moon: the obvious first Hop.
    const moonsFor = (forced: BodyComposition | undefined) =>
      generateMoons(
        rng,
        nextName,
        id,
        planet.distanceFromStar,
        isHome ? Math.max(1, moonCount) : moonCount,
        gravityFactor,
        (moonId) => rollResource(seed, moonId, planet.distanceFromStar, forced, level),
      );
    if (planet.kind === 'gas-giant') return { ...planet, ...shared, moons: moonsFor(undefined) };
    return {
      ...planet,
      ...shared,
      ...rollResource(seed, id, planet.distanceFromStar, isHome ? 'rocky' : undefined, level),
      // The Home Planet's Moons are Icy, so the first Hop pays off with Fuel.
      moons: moonsFor(isHome ? 'icy' : undefined),
    };
  });

  // The Heliopause is anchored on the outermost planet, always a Gas Giant.
  const outermostGasGiant = gasGiants.at(-1);
  if (!outermostGasGiant) throw new Error(`Star System ${name} generated no Gas Giant`);
  const outermost = outermostGasGiant.distanceFromStar;
  const heliopauseRadius = astronomicalUnits(
    outermost *
      sampleFloat(rng, GENERATION_TUNING.heliopausePerOutermostPlanet) *
      difficultyFactor(DIFFICULTY_TUNING.heliopauseRadius, level),
  );

  // Frozen: Bodies do not move, and nothing outside the rules can change them.
  return deepFreeze({
    seed,
    name,
    star: { name },
    planets,
    homePlanetId: bodyId(`planet-${homeIndex + 1}`),
    heliopauseRadius,
  });
}

function generateMoons(
  rng: Rng,
  nextName: Namer,
  planetId: BodyId,
  distanceFromStar: AstronomicalUnits,
  count: number,
  gravityFactor: number,
  roll: (id: BodyId) => Resource,
): Moon[] {
  return spreadOrbits(rng, count, GENERATION_TUNING.moonDistanceFromPlanet).map(
    (distanceFromPlanet, index): Moon => {
      const id = bodyId(`${planetId}-moon-${index + 1}`);
      return {
        id,
        kind: 'moon',
        landable: true,
        name: nextName(),
        planetId,
        distanceFromStar,
        distanceFromPlanet: kilometers(distanceFromPlanet),
        orbitAngle: randomAngle(rng),
        ...sampleBodySize(rng, SOURCED_RANGES.moon, gravityFactor),
        ...roll(id),
      };
    },
  );
}

/**
 * A landable Body's type and base yield. Drawn from a stream of its own (seed and Body id), so adding
 * or tuning it never shifts the sequence that names, orbits and sizes come from.
 */
function rollResource(
  seed: Seed,
  id: BodyId,
  distanceFromStar: AstronomicalUnits,
  forced: BodyComposition | undefined,
  level: number,
): Resource {
  const rng = createRng(seed ^ stringSeed(`${id}:resource`));
  const roll = rng.next();
  const iceLine =
    ICE_LINE.distance.value * difficultyFactor(DIFFICULTY_TUNING.iceLineDistance, level);
  const icyChance = distanceFromStar / (distanceFromStar + iceLine);
  const yieldFactor = difficultyFactor(DIFFICULTY_TUNING.yield, level);
  const composition = forced ?? (roll < icyChance ? 'icy' : 'rocky');
  return composition === 'icy'
    ? {
        composition,
        baseYield: kilograms(Math.round(sampleFloat(rng, BODY_TUNING.baseYield.icy) * yieldFactor)),
      }
    : {
        composition,
        baseYield: materials(
          Math.round(sampleFloat(rng, BODY_TUNING.baseYield.rocky) * yieldFactor),
        ),
      };
}

/** The Body with this id, or `undefined` when the Star System has none (e.g. a stale selection). */
export function findBody(system: StarSystem, id: BodyId): Body | undefined {
  return listBodies(system).find((body) => body.id === id);
}

/** The rocky planet where every Run in this Star System starts. */
export function homePlanet(system: StarSystem): RockyPlanet {
  const home = system.planets.find((planet) => planet.id === system.homePlanetId);
  if (home?.kind !== 'rocky-planet') {
    throw new Error(`Star System ${system.name} has no rocky Home Planet ${system.homePlanetId}`);
  }
  return home;
}

/** Every Body in the Star System: each planet followed by its Moons. */
export function listBodies(system: StarSystem): Body[] {
  return system.planets.flatMap((planet) => [planet, ...planet.moons]);
}

/**
 * Surface gravity and escape velocity from one size draw, so a Body with stronger gravity also has
 * a higher escape velocity, both inside their sourced ranges.
 */
function sampleBodySize(
  rng: Rng,
  ranges: {
    readonly surfaceGravity: Range<MetersPerSecondSquared>;
    readonly escapeVelocity: Range<MetersPerSecond>;
  },
  gravityFactor: number,
): { surfaceGravity: MetersPerSecondSquared; escapeVelocity: MetersPerSecond } {
  const size = rng.next();
  return {
    surfaceGravity: metersPerSecondSquared(lerp(ranges.surfaceGravity, size) * gravityFactor),
    escapeVelocity: metersPerSecond(lerp(ranges.escapeVelocity, size) * gravityFactor),
  };
}

/** Freezes a simulation value and everything it holds, so state only changes through the rules. */
export function deepFreeze<T extends object>(value: T): T {
  for (const key of Reflect.ownKeys(value)) {
    const child: unknown = Reflect.get(value, key);
    if (typeof child === 'object' && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
}

function lerp(range: Range, t: number): number {
  return range.min + (range.max - range.min) * t;
}

/**
 * Distances for `count` orbits inside `range`, in increasing order. The range is split into equal
 * slices on a log scale (orbits widen outward, as in the Solar System) and each orbit is placed
 * well inside its own slice, so no two orbits crowd each other.
 */
function spreadOrbits(rng: Rng, count: number, range: Range): number[] {
  const logMin = Math.log(range.min);
  const slice = (Math.log(range.max) - logMin) / count;
  return Array.from({ length: count }, (_, i) =>
    Math.exp(logMin + slice * (i + 0.15 + 0.7 * rng.next())),
  );
}

function randomAngle(rng: Rng): Radians {
  return radians(rng.next() * 2 * Math.PI);
}

function sampleInt(rng: Rng, range: Range): number {
  return rng.int(range.min, range.max);
}

function sampleFloat(rng: Rng, range: Range): number {
  return lerp(range, rng.next());
}

/** Hands out generated sci-fi names, never the same one twice within a Star System. */
type Namer = () => string;

// Name parts are flavour, not data: change them freely.
const ONSETS = ['k', 'v', 't', 'z', 's', 'r', 'th', 'dr', 'x', 'qu', 'n', 'm', 'l', 'c', 'pr', 'h'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'y', 'ae', 'io'];
const CODAS = ['', '', '', '', 'n', 'r', 's', 'x', 'l'];
const EPITHETS = ['Prime', 'Minor', 'Tau', 'Nova', 'Rho'];

function createNamer(rng: Rng): Namer {
  const used = new Set<string>();
  return () => {
    let name = generateName(rng);
    for (let attempt = 0; used.has(name) && attempt < 20; attempt++) name = generateName(rng);
    // A run of collisions is astronomically unlikely; a numbered suffix still keeps names unique.
    const base = name;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
    used.add(name);
    return name;
  };
}

function generateName(rng: Rng): string {
  const syllableCount = rng.next() < 0.75 ? 2 : 3;
  let word = '';
  for (let i = 0; i < syllableCount; i++) {
    word += pick(rng, ONSETS) + pick(rng, VOWELS) + pick(rng, CODAS);
  }
  const name = word.charAt(0).toUpperCase() + word.slice(1);
  const suffix = rng.next();
  if (suffix < 0.1) return `${name} ${pick(rng, EPITHETS)}`;
  if (suffix < 0.2) return `${name}-${rng.int(2, 9)}`;
  return name;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.int(0, items.length - 1)];
  if (item === undefined) throw new RangeError('Cannot pick from an empty list');
  return item;
}
