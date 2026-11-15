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
   * How far past the outermost planet the Heliopause lies, as a share of a level-1 Radar's range: a
   * little less than one range, so that Radar finds it from that planet's Moons and a Run reaches it
   * in about 10 to 15 Hops from the Starting Moon (#96). Gameplay tuning: the real heliopause is
   * about 4× Neptune's distance (Voyager 1 crossed at about 122 AU, §5), too far for the Radar to
   * reach from any Body.
   */
  heliopauseBeyondOutermostPlanet: { min: 0.75, max: 0.95 },
  /**
   * How far out a map of the Star System reaches, as a multiple of the outermost planet's distance:
   * where the Solar System's ratio puts a heliopause, Voyager 1 crossing at about 122 AU (§5) with
   * Neptune at 30.2 AU (§1), about 4×. The Nav Chart scales to it, as it did to the Heliopause
   * before #191 drew that in.
   */
  mapRadiusPerOutermostPlanet: { min: 3.5, max: 4.5 },
  /**
   * Gas Giants are home to 1 to 4 Moons. Every rocky planet has two, so a Spacecraft landed on any
   * of the three Bodies always has a short Hop onward within reach (#188: no early dead ends).
   */
  moonCount: {
    'rocky-planet': { min: 2, max: 2 },
    'gas-giant': { min: 1, max: 4 },
  },
  /**
   * Earth's Moon orbits at 0.384 ×10⁶ km (§1); the rest of the range is not in the research doc,
   * so the whole range is tuning.
   */
  moonDistanceFromPlanet: { min: kilometers(150_000), max: kilometers(1_900_000) },
} as const satisfies Record<string, TuningRange | Record<string, TuningRange>>;

/**
 * Gameplay tuning for a fair opening (#96): the first Body Comms Detects is In reach with room to
 * spare for every Chassis's new Spacecraft. Comfortable is a 100% Success Chance with a Margin of at
 * least a fifth of the Hop's estimate. Not real-world figures.
 */
export const OPENING_TUNING = {
  firstHop: { successChance: 1, marginShare: 0.2 },
} as const;

/** Real-world figure behind what landable Bodies are made of. */
export const ICE_LINE = {
  /**
   * The Solar System's ice line, about 2.7 AU. Only this figure is sourced; the chance of an Icy
   * Body, d / (d + ice line), is a gameplay curve (see `BODY_TUNING`).
   */
  distance: {
    value: astronomicalUnits(2.7),
    source:
      'Lecar et al. 2006, ApJ 640, 1115 https://doi.org/10.1086/500159; Martin & Livio 2013, MNRAS, "On the evolution of the snow line in protoplanetary discs II" https://arxiv.org/abs/1306.5243; see docs/research/ for the ice-line note from research PR #120',
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

/**
 * Where the in-game Fuel note ("real missions plan to split lunar water ice into hydrogen and oxygen")
 * comes from. Not a game figure, so it has no value.
 */
export const FUEL_NOTE = {
  /** Shown the first time a Run collects Fuel: real missions, not a claim of NASA's. */
  text: 'Real missions plan to split lunar water ice into hydrogen and oxygen, so rockets could refuel on the Moon.',
  source:
    'Sanders, Kleinhenz and Linne (NASA), "NASA Plans for In Situ Resource Utilization (ISRU) Development, Demonstration, and Implementation", NTRS 20220008799 https://ntrs.nasa.gov/citations/20220008799; docs/research/ice-and-resources.md',
} as const;

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
      'IAU 2012 Resolution B2 https://www.iau.org/Iau/Publications/List-of-Resolutions, NASA/JPL Solar System Dynamics "Astrodynamic Parameters" https://ssd.jpl.nasa.gov/astro_par.html',
  } satisfies SourcedValue<number>,
} as const;

/**
 * Gameplay tuning (#188): rocky planets are drawn from Mercury's size up to Mars's, the low end of
 * the sourced range, and never Earth's. Landing on an Earth-sized planet and taking off again costs
 * about 9.4 km/s each way, more than a starting Spacecraft has left once it gets there: the planet
 * would be a dead end that a 100% Hop leads straight into.
 */
export const ROCKY_PLANET_SIZE = {
  largestEscapeVelocity: SOURCED_CONSTANTS.marsEscapeVelocity.value,
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

/**
 * Gameplay tuning (#190): what a Hop's plan assumes of a Body the player has not Surveyed. The
 * Landing Burn is costed for the high end of the escape velocity a landable Body of that kind can
 * have, with a wider dispersion than a Surveyed Body's. The flight itself uses the Body's real values.
 */
export const UNSURVEYED = {
  /** The top of the dispersion a plan assumes for an Unsurveyed Landing (a Surveyed one: `DISPERSION.max`). */
  landingMax: 1.2,
  /** The escape velocity a plan assumes for the Landing: the high end of what a landable Body of its kind can have. */
  cautiousEscapeVelocity: {
    moon: SOURCED_RANGES.moon.escapeVelocity.max,
    'rocky-planet': ROCKY_PLANET_SIZE.largestEscapeVelocity,
  },
  /** The low end of it, for the plan's best case: so a plan shown at 0% is a Hop that has no chance for real. */
  leastEscapeVelocity: {
    moon: SOURCED_RANGES.moon.escapeVelocity.min,
    'rocky-planet': SOURCED_RANGES.rockyPlanet.escapeVelocity.min,
  },
} as const;

/**
 * Gameplay tuning (#190): the Success Chance at or above which a Hop is In reach. Below it, any
 * chance is Marginal; Out of reach means exactly 0%.
 */
export const REACH_VERDICT = { inReach: 0.7 } as const;

/** The three Chassis a New Run can pick from. */
export const CHASSIS_IDS = ['scout', 'hauler', 'lancer'] as const;
export type ChassisId = (typeof CHASSIS_IDS)[number];

/**
 * What a new Spacecraft on a Chassis starts with: everything that sets its Δv. Each Chassis's own
 * mass and its factors on Engine Isp and Fuel Tank capacity are calibrated from these, so the
 * starting Components give exactly these figures (ADR 0005).
 */
export interface ChassisTuning {
  /** Everything but Fuel: the Chassis plus its starting Components. */
  readonly dryMass: Kilograms;
  /** What its starting Fuel Tank holds; a new Spacecraft starts full. */
  readonly fuelCapacity: Kilograms;
  /** Its starting Engine's Isp on this Chassis. */
  readonly engineIsp: Seconds;
}

/**
 * Gameplay tuning for the Chassis. Not real-world figures: the engines are sci-fi, past any flown
 * engine's Isp (a hydrogen/LOX RL-10 makes 444 s, research doc §3, UNVERIFIED there), because the
 * Burns use real-world sized Δv. Calibrated so every Chassis reaches the first Detected Body (#96) with
 * comfortable Margin in every Star System, starter Fuel covers roughly 3 to 6 nearby Hops (2 to 4
 * before #188 gave every rocky planet two Moons), and their starting Δv differs noticeably. The
 * hauler carries the most Fuel yet has the least Δv: its dry mass costs it.
 *
 * The Isp is 30% above its first tuning (1,230, 1,210 and 1,280 s) since #247: a new Run felt out
 * of Fuel after its first Hop. The gauge reads Fuel mass, and the rocket equation spends the
 * heaviest Fuel first: the first Hop took about 40% of the tank, most of it for the Landing on the
 * Starting Moon's planet (about 4 km/s). A bigger tank cannot fix that, since the share a Burn
 * leaves can never top e^(−Δv / exhaust velocity), about 65% here; a better Engine raises that
 * ceiling. On average the first Hop now leaves at least 60% of the tank and the starting Fuel alone
 * lasts 3 nearby Hops.
 */
export const CHASSIS_TUNING = {
  scout: { dryMass: kilograms(4_000), fuelCapacity: kilograms(21_000), engineIsp: seconds(1_600) },
  hauler: {
    dryMass: kilograms(15_000),
    fuelCapacity: kilograms(66_000),
    engineIsp: seconds(1_575),
  },
  lancer: { dryMass: kilograms(6_000), fuelCapacity: kilograms(36_000), engineIsp: seconds(1_665) },
} as const satisfies Record<ChassisId, ChassisTuning>;

/**
 * Gameplay tuning: how each Star System after the first is harder. Every curve is a factor on the
 * System 1 value, `1 + perLevel * (level - 1)` clamped to `floor`, so level 1 is the identity and
 * the System 1 generation is untouched. Not real-world figures.
 */
export const DIFFICULTY_TUNING = {
  /** Surface gravity and escape velocity grow together: a heavier Body is harder to leave. */
  gravity: { perLevel: 0.06, floor: 1 },
  /** The ice line moves outward, so fewer Bodies are Icy: the chance is d / (d + ice line). */
  iceLineDistance: { perLevel: 0.25, floor: 1 },
  /** Base yields of both types shrink. */
  yield: { perLevel: -0.08, floor: 0.5 },
  /**
   * The Heliopause lies farther past the outermost planet, until only a level-2 Radar there finds it
   * (see `drawStarSystem`).
   */
  heliopauseRadius: { perLevel: 0.1, floor: 1 },
} as const satisfies Record<string, { perLevel: number; floor: number }>;

/** The factor a difficulty curve applies at a Star System number; exactly 1 for System 1. */
export function difficultyFactor(
  curve: { readonly perLevel: number; readonly floor: number },
  level: number,
): number {
  if (level < 1) throw new RangeError(`Star System number ${level} is below 1`);
  return Math.max(curve.floor, 1 + curve.perLevel * (level - 1));
}

/** The four kinds of Cruise event (#210). */
export const CRUISE_EVENT_KINDS = [
  'fuel-leak',
  'debris-field',
  'engine-fire',
  'solar-flare',
] as const;
export type CruiseEventKind = (typeof CRUISE_EVENT_KINDS)[number];

/** The kinds a mild Cruise can draw: a slow Fuel leak or a small Debris field. */
const MILD_KINDS: readonly CruiseEventKind[] = ['fuel-leak', 'debris-field'];

/**
 * Gameplay tuning for the Cruise and its events (#210 and its human amendment: every Cruise has 1–2
 * events from Hop 1, mild ones first, harsher ones later). Not real-world figures. Times are in
 * Cruise ticks of `tickMs`.
 */
export const CRUISE_TUNING = {
  /** One tick of the Cruise's deterministic clock, in ms of Cruise time. */
  tickMs: 100,
  /** The Cruise lasts 120 s: 1,200 ticks. */
  ticks: 1_200,
  /**
   * The kinds a real Run schedules: the Fuel leak since #250, the Debris field since #252 and the
   * solar flare since #253. The Engine fire switches on with #251.
   */
  enabledKinds: ['fuel-leak', 'debris-field', 'solar-flare'] as readonly CruiseEventKind[],
  /**
   * The first Hops of a Run are mild: only `mildKinds`. A mild Debris field never misses and hits any
   * part but the Jump Drive, rotating so the first Hops show several kinds of Damage (#320). A leak is slower and stops at the
   * Fuel the Landing needs at its worst plus a Hop back with a chance (`Cruise.fuelFloor`). So the
   * Engine fire, and with it Destroyed, never strikes on them, and no mild event can Crash or Strand a Hop the plan shows at 100% (#188).
   */
  mildHops: 3,
  mildKinds: MILD_KINDS,
  /** Every Cruise has one event; the chance of a second rises with the Star System. */
  secondEvent: { mild: 0.15, base: 0.25, perStarSystem: 0.1, max: 0.6 },
  /**
   * After the mild Hops, the chance an event is harsh (an Engine fire or a solar flare): it rises
   * with the Star System and the Hop count. The Engine fire is the rarer of the two.
   */
  harshChance: { base: 0.25, perStarSystem: 0.1, perHop: 0.02, max: 0.6 },
  engineFireShareOfHarsh: 0.4,
  /** Events start from 10 s to 100 s into the Cruise (an Engine fire by 80 s), 20 s apart. */
  startTicks: { min: 100, max: 1_000, engineFireMax: 800, apart: 200 },
  /** A Debris field hits one Component this often, and misses otherwise. */
  debrisHitChance: 0.6,
  /**
   * A leak loses this share of the Spacecraft's Fuel capacity per second: slower in a mild Cruise,
   * yet fast enough that one left alone visibly drains the Fuel gauge (#250).
   */
  leakPerSecond: { mild: 0.0015, harsh: 0.0025 },
  /** A Damaged Engine's Isp factor (#197). */
  damagedEngineIsp: 0.85,
  /** A burning Engine with no Repair started for this long explodes: 30 s. */
  fireTicks: 300,
  /** Repair times by Component kind, in ticks: Engine 40 s, Fuel Tank 30 s, Drill 20 s. */
  repairTicks: { engine: 400, 'fuel-tank': 300, drill: 200, radar: 250 },
  /** A Rush costs 1 Material per started 5 s of Repair time left. */
  rushTicksPerMaterial: 50,
} as const;
