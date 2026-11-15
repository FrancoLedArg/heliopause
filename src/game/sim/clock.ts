// The game clock (#192, spec #96): every Body spins at its own rate, and game time passes as the
// Spacecraft flies. Day and night have no gameplay effect in 0.1 (#70 adds it); they only colour
// the Landed sky. All of it is derived from the seed, in streams of its own, so generation is
// untouched and the same Run always shows the same sky at the same time.
import { createRng } from '../lib/rng.ts';
import { stringSeed } from '../lib/stringSeed.ts';
import { TEMPERATURE_BANDS } from './data.ts';
import type { Body, StarSystem } from './starSystem.ts';

/** What a Body's rotation period is drawn from, in hours: the real extremes of Bodies like it. */
export interface RotationRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Rotation periods in hours, from `docs/research/day-night-and-temperature.md`: icy Bodies run from
 * Ceres (9 h) to Europa (85.2 h); rocky Bodies from Mars (24.66 h) to Mercury (solar day, 4222.6 h),
 * with the Moon (29.53 days) between; a Gas Giant has no surface to stand on, so it spins between
 * Ceres and Mars (it is never landed on, and is here only so every Body has a period).
 */
export const ROTATION_RANGES_HOURS = {
  icy: { min: 9, max: 85.2 },
  rocky: { min: 24.66, max: 4222.6 },
  'gas-giant': { min: 9, max: 24.66 },
} as const satisfies Record<string, RotationRange>;

/** Gameplay tuning: a Hop's flight time in hours is this plus the distance flown, in AU, times the rate. */
export const FLIGHT_HOURS = { base: 12, perAu: 240 } as const;

/** Gameplay tuning: while Landed, one local day passes in this many real seconds (the sky is never still). */
export const LANDED_DAY_SECONDS = 240;

/** The stream a Body's clock draws from: its own, so no other roll in the game moves. */
function clockRng(system: StarSystem, body: Body) {
  return createRng(system.seed ^ stringSeed(`rotation:${body.id}`));
}

/** How long a Body takes to turn once, in hours (its solar day). */
export function rotationPeriodHours(system: StarSystem, body: Body): number {
  const { min, max } = ROTATION_RANGES_HOURS[body.landable ? body.composition : 'gas-giant'];
  // Log-uniform: a short day and a long one are equally likely.
  const hours = min * (max / min) ** clockRng(system, body).next();
  return Math.min(max, Math.max(min, hours));
}

/** The fraction of its day (0 to 1, 0 = midnight, 0.5 = noon) the Body's surface is at, `gameHours` into the Run. */
export function localDayFraction(system: StarSystem, body: Body, gameHours: number): number {
  const rng = clockRng(system, body);
  rng.next();
  const phase = rng.next();
  const turns = phase + gameHours / rotationPeriodHours(system, body);
  return turns - Math.floor(turns);
}

/** The fraction of the day while Landed: the Run's own clock, plus the slow drift of the `elapsedSeconds` spent standing here. */
export function landedDayFraction(
  system: StarSystem,
  body: Body,
  gameHours: number,
  elapsedSeconds: number,
): number {
  const turns = localDayFraction(system, body, gameHours) + elapsedSeconds / LANDED_DAY_SECONDS;
  return turns - Math.floor(turns);
}

/** How the sky looks at a fraction of the local day. */
export interface SkyDay {
  /** 0 (full night) to 1 (full day). */
  readonly daylight: number;
  /** Whether it is the sun's half of the day. */
  readonly day: boolean;
}

export function skyDay(fraction: number): SkyDay {
  const daylight = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  return { daylight, day: daylight >= 0.5 };
}

/** The local time in words, for the plate's accessible name. */
export function timeOfDayWords(fraction: number): string {
  if (fraction < 0.15 || fraction >= 0.85) return 'night';
  if (fraction < 0.4) return 'morning';
  if (fraction < 0.6) return 'midday';
  return 'evening';
}

/** Game hours a Hop takes: farther is longer. `distanceAu` is how far the Spacecraft flies. */
export function flightHours(distanceAu: number): number {
  return FLIGHT_HOURS.base + FLIGHT_HOURS.perAu * Math.max(0, distanceAu);
}

/** The fraction of the target day when a Hop of `distanceAu` launched `gameHours` into the Run arrives (#334). */
export function arrivalDayFraction(
  system: StarSystem,
  target: Body,
  gameHours: number,
  distanceAu: number,
): number {
  return localDayFraction(system, target, gameHours + flightHours(distanceAu));
}

/** How hot or cold a Body's surface is, from its distance to the star (#335). */
export type TemperatureBand = 'scorching' | 'mild' | 'freezing';

export function temperatureBand(body: Body): TemperatureBand {
  if (body.distanceFromStar < TEMPERATURE_BANDS.scorchingBelow) return 'scorching';
  if (body.distanceFromStar > TEMPERATURE_BANDS.freezingBeyond) return 'freezing';
  return 'mild';
}

/** A Harsh Arrival: a Freezing night or a Scorching day. */
export function isHarshArrival(band: TemperatureBand, day: boolean): boolean {
  return (band === 'freezing' && !day) || (band === 'scorching' && day);
}
