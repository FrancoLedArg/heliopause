import {
  astronomicalUnits,
  kilograms,
  kilometers,
  metersPerSecond,
  metersPerSecondSquared,
  seconds,
  type AstronomicalUnits,
  type MetersPerSecond,
  type MetersPerSecondSquared,
} from './units.ts';

const RESEARCH = 'docs/research/nasa-data-for-generation.md §1';
const NSSDCA_PLANETS = `${RESEARCH}, NSSDCA planetary fact sheet https://nssdc.gsfc.nasa.gov/planetary/factsheet/`;
const NSSDCA_MOONS = `${RESEARCH}, NSSDCA planetary fact sheet (Moon) https://nssdc.gsfc.nasa.gov/planetary/factsheet/ and Galilean satellite fact sheet https://nssdc.gsfc.nasa.gov/planetary/factsheet/galileanfact_table.html; low end derived from the NSSDCA Saturnian satellite sheet's mass and radius (Enceladus) https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html`;

/** A real-world range the generator samples within, traceable to its source. */
export interface SourcedRange<U extends number> {
  readonly min: U;
  readonly max: U;
  readonly source: string;
}

/** A gameplay tuning range: chosen for play, not a real-world figure. */
export interface TuningRange<T extends number = number> {
  readonly min: T;
  readonly max: T;
}

/** Real-world ranges behind Star System generation. Verified figures only; each cites its source. */
export const SOURCED_RANGES = {
  rockyPlanet: {
    surfaceGravity: {
      min: metersPerSecondSquared(3.7),
      max: metersPerSecondSquared(9.8),
      source: `Mercury/Mars to Earth. ${NSSDCA_PLANETS}`,
    } satisfies SourcedRange<MetersPerSecondSquared>,
    escapeVelocity: {
      min: metersPerSecond(4_300),
      max: metersPerSecond(11_200),
      source: `Mercury to Earth. ${NSSDCA_PLANETS}`,
    } satisfies SourcedRange<MetersPerSecond>,
    distanceFromStar: {
      min: astronomicalUnits(0.39),
      max: astronomicalUnits(1.52),
      source: `Mercury to Mars. ${NSSDCA_PLANETS}`,
    } satisfies SourcedRange<AstronomicalUnits>,
  },
  gasGiant: {
    surfaceGravity: {
      min: metersPerSecondSquared(8.7),
      max: metersPerSecondSquared(23.1),
      source: `Uranus to Jupiter, at the 1 bar reference level. ${NSSDCA_PLANETS}`,
    } satisfies SourcedRange<MetersPerSecondSquared>,
    escapeVelocity: {
      min: metersPerSecond(21_300),
      max: metersPerSecond(59_500),
      source: `Uranus to Jupiter. ${NSSDCA_PLANETS}`,
    } satisfies SourcedRange<MetersPerSecond>,
    distanceFromStar: {
      min: astronomicalUnits(5.2),
      max: astronomicalUnits(30.2),
      source: `Jupiter to Neptune. ${NSSDCA_PLANETS}`,
    } satisfies SourcedRange<AstronomicalUnits>,
  },
  moon: {
    surfaceGravity: {
      min: metersPerSecondSquared(0.11),
      max: metersPerSecondSquared(1.8),
      source: `Enceladus (derived) to Io. ${NSSDCA_MOONS}`,
    } satisfies SourcedRange<MetersPerSecondSquared>,
    escapeVelocity: {
      min: metersPerSecond(240),
      max: metersPerSecond(2_700),
      source: `Enceladus (derived) to Ganymede. ${NSSDCA_MOONS}`,
    } satisfies SourcedRange<MetersPerSecond>,
  },
} as const;

/** Gameplay tuning for Star System generation. Not real-world figures. */
export const GENERATION_TUNING = {
  planetCount: { min: 4, max: 7 },
  /** At least two rocky planets, and always at least one Gas Giant. */
  rockyPlanetCount: { min: 2, max: 4 },
  /**
   * The Heliopause as a multiple of the outermost planet's distance. Centred on the Solar System's
   * ratio: Voyager 1 crossed at about 122 AU (§5) and Neptune orbits at 30.2 AU (§1), about 4×.
   */
  heliopausePerOutermostPlanet: { min: 3.5, max: 4.5 },
  /** Gas Giants are home to Moons; rocky planets have few. Spans 0 to 4 Moons per planet. */
  moonCount: {
    'rocky-planet': { min: 0, max: 2 },
    'gas-giant': { min: 1, max: 4 },
  },
  /**
   * Earth's Moon orbits at 0.384 ×10⁶ km (§1); the rest of the range is not in the research doc,
   * so the whole range is tuning.
   */
  moonDistanceFromPlanet: { min: kilometers(150_000), max: kilometers(1_900_000) },
} as const satisfies Record<string, TuningRange | Record<string, TuningRange>>;

/**
 * Gameplay tuning for the starter Spacecraft every Run begins with. Not real-world figures: the Hop
 * rules calibrate them so the Home Planet's Moon is comfortably reachable and starter Fuel covers a
 * few nearby Hops. The Isp sits near a hydrogen/LOX engine's (RL-10 444 s, research doc §3, itself
 * UNVERIFIED there).
 */
export const STARTER_SPACECRAFT_TUNING = {
  dryMass: kilograms(2_000),
  fuelMass: kilograms(8_000),
  engineIsp: seconds(450),
} as const;
