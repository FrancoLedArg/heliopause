import {
  astronomicalUnits,
  kilograms,
  kilometers,
  metersPerSecond,
  metersPerSecondSquared,
  seconds,
  type AstronomicalUnits,
  type Kilograms,
  type MetersPerSecond,
  type MetersPerSecondSquared,
  type Seconds,
} from './units.ts';

const RESEARCH = 'docs/research/nasa-data-for-generation.md §1';
const NSSDCA_PLANETS = `${RESEARCH}, NSSDCA planetary fact sheet https://nssdc.gsfc.nasa.gov/planetary/factsheet/`;
const NSSDCA_MOONS = `${RESEARCH}, NSSDCA planetary fact sheet (Moon) https://nssdc.gsfc.nasa.gov/planetary/factsheet/ and Galilean satellite fact sheet https://nssdc.gsfc.nasa.gov/planetary/factsheet/galileanfact_table.html; low end derived from the NSSDCA Saturnian satellite sheet's mass and radius (Enceladus) https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html`;

/** An inclusive range of values. Neutral: says nothing about where the values came from. */
export interface Range<U extends number = number> {
  readonly min: U;
  readonly max: U;
}

/** A real-world range the generator samples within, traceable to its source. */
export interface SourcedRange<U extends number> extends Range<U> {
  readonly source: string;
}

/** A gameplay tuning range: chosen for play, not a real-world figure. */
export type TuningRange<U extends number = number> = Range<U>;

/** A single real-world figure, traceable to its source. */
export interface SourcedValue<U extends number> {
  readonly value: U;
  readonly source: string;
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

/** Real-world figures behind the Hop rules. Each cites its source. */
export const SOURCED_CONSTANTS = {
  /** g0 in the rocket equation: Δv = Isp × g0 × ln(wet mass / dry mass). */
  standardGravity: {
    value: metersPerSecondSquared(9.80665),
    source:
      'docs/research/nasa-data-for-generation.md §3, NASA Glenn "Specific Impulse" https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/ and "Ideal Rocket Equation" https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/',
  } satisfies SourcedValue<MetersPerSecondSquared>,
  /** Mars surface to 100 km low Mars orbit, gravity losses included. */
  marsAscentDeltaV: {
    value: metersPerSecond(4_200),
    source:
      'docs/research/nasa-data-for-generation.md §3, NASA NTRS Palaszewski, "Mars Landing Vehicles: Descent and Ascent Propulsion Design Issues" https://ntrs.nasa.gov/citations/20210026187',
  } satisfies SourcedValue<MetersPerSecond>,
  marsEscapeVelocity: {
    value: metersPerSecond(5_000),
    source: `Mars. ${NSSDCA_PLANETS}`,
  } satisfies SourcedValue<MetersPerSecond>,
  /** A planet's speed on a circular orbit 1 AU from a Sun-like star: Earth's mean orbital velocity. */
  orbitalVelocityAt1Au: {
    value: metersPerSecond(29_800),
    source: `Earth, "Orbital Velocity" row. ${NSSDCA_PLANETS}`,
  } satisfies SourcedValue<MetersPerSecond>,
} as const;

/**
 * Gameplay tuning: every Burn's actual Δv is its estimate times a factor drawn uniformly from this
 * range. Real Burns never cost exactly what was planned; that is why missions carry Margin.
 */
export const DISPERSION = { min: 0.9, max: 1.1 } as const satisfies TuningRange;

/** The three starting hulls a New Run can take. */
export const CHASSIS_IDS = ['scout', 'hauler', 'lancer'] as const;
export type ChassisId = (typeof CHASSIS_IDS)[number];

/** What a Chassis gives a new Spacecraft: everything that sets its Δv. */
export interface ChassisTuning {
  /** Everything but Fuel. */
  readonly dryMass: Kilograms;
  /** The most Fuel it can carry; a new Spacecraft starts full. */
  readonly fuelCapacity: Kilograms;
  readonly engineIsp: Seconds;
}

/**
 * Gameplay tuning for the Chassis. Not real-world figures: the engines are sci-fi, past any flown
 * engine's Isp (a hydrogen/LOX RL-10 makes 444 s, research doc §3, UNVERIFIED there), because the
 * Burns use real-world sized Δv. Calibrated so every Chassis reaches the Home Planet's Moon with
 * comfortable Margin in every Star System, starter Fuel covers roughly 2 to 4 nearby Hops, and
 * their starting Δv differs noticeably. The hauler carries the most Fuel yet has the least Δv: its
 * dry mass costs it.
 */
export const CHASSIS_TUNING = {
  scout: { dryMass: kilograms(4_000), fuelCapacity: kilograms(20_000), engineIsp: seconds(1_150) },
  hauler: {
    dryMass: kilograms(16_000),
    fuelCapacity: kilograms(64_000),
    engineIsp: seconds(1_160),
  },
  lancer: { dryMass: kilograms(6_000), fuelCapacity: kilograms(36_000), engineIsp: seconds(1_250) },
} as const satisfies Record<ChassisId, ChassisTuning>;
