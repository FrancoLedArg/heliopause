import {
  astronomicalUnits,
  kilograms,
  kilometers,
  materials,
  metersPerSecond,
  metersPerSecondSquared,
  seconds,
  type AstronomicalUnits,
  type Kilograms,
  type Kilometers,
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

/** Real-world figure behind what landable Bodies are made of. */
export const ICE_LINE = {
  /**
   * The Solar System's ice line, about 2.7 AU. Only this figure is sourced; the chance of an Icy
   * Body, d / (d + ice line), is a gameplay curve (see `BODY_TUNING`).
   */
  distance: {
    value: astronomicalUnits(2.7),
    source:
      'Lecar et al. 2006, ApJ 640, 1115 https://doi.org/10.1086/500159; Martin & Livio 2013, MNRAS (ice line of the Solar System); see docs/research/ for the ice-line note from research PR #120',
  } satisfies SourcedValue<AstronomicalUnits>,
} as const;

/** Gameplay tuning for what a landable Body is made of. Not real-world figures. */
export const BODY_TUNING = {
  /**
   * Base yield by type, before any Drill multiplier. Icy is Fuel in kilograms, scaled to Chassis
   * Fuel capacity (21,000 to 66,000 kg) so one landing is a meaningful refill. Rocky is Materials,
   * in the unit of Component costs (#112).
   */
  baseYield: {
    icy: { min: kilograms(3_000), max: kilograms(9_000) },
    rocky: { min: materials(10), max: materials(30) },
  },
} as const satisfies Record<string, Record<string, TuningRange>>;

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
    value: metersPerSecond(5_030),
    source: `Mars, 5.03 km/s on the NSSDCA Mars fact sheet https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html (5.0 rounded in the research doc §1 table)`,
  } satisfies SourcedValue<MetersPerSecond>,
  /** A planet's speed on a circular orbit 1 AU from a Sun-like star: Earth's mean orbital velocity. */
  orbitalVelocityAt1Au: {
    value: metersPerSecond(29_800),
    source: `Earth, "Orbital Velocity" row. ${NSSDCA_PLANETS}`,
  } satisfies SourcedValue<MetersPerSecond>,
  /** The AU in kilometres: a defined constant (IAU 2012: 149,597,870,700 m exactly), not tuning. */
  kilometersPerAu: {
    value: 149_597_870.7,
    source:
      'IAU 2012 Resolution B2, NASA/JPL Solar System Dynamics "Astrodynamic Parameters" https://ssd.jpl.nasa.gov/astro_par.html',
  } satisfies SourcedValue<number>,
} as const;

/** A distance in kilometres, in astronomical units. */
export function kilometersToAu(distance: Kilometers): AstronomicalUnits {
  return astronomicalUnits(distance / SOURCED_CONSTANTS.kilometersPerAu.value);
}

/**
 * Gameplay tuning: every Burn's actual Δv is its estimate times a factor drawn uniformly from this
 * range. Real Burns never cost exactly what was planned; that is why missions carry Margin.
 */
export const DISPERSION = { min: 0.9, max: 1.1 } as const satisfies TuningRange;

/** The three Chassis a New Run can pick from. */
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
  scout: { dryMass: kilograms(4_000), fuelCapacity: kilograms(21_000), engineIsp: seconds(1_230) },
  hauler: {
    dryMass: kilograms(15_000),
    fuelCapacity: kilograms(66_000),
    engineIsp: seconds(1_210),
  },
  lancer: { dryMass: kilograms(6_000), fuelCapacity: kilograms(36_000), engineIsp: seconds(1_280) },
} as const satisfies Record<ChassisId, ChassisTuning>;
