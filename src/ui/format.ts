// How quantities read on screen: real units, rounded for readability (spec #12, story 23).
// Parameters take the simulation's unit types, so one unit cannot be shown where another is meant.
import type {
  AstronomicalUnits,
  Kilograms,
  MetersPerSecond,
  MetersPerSecondSquared,
} from '../game/sim/index.ts';

const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Above this, Δv reads better in km/s (gameplay tuning). */
const KM_PER_S_FROM = 10_000;

/** Surface gravity in m/s². */
export function formatGravity(gravity: MetersPerSecondSquared): string {
  return `${gravity.toFixed(1)} m/s²`;
}

/** Distance from the star in astronomical units. */
export function formatDistanceAu(distance: AstronomicalUnits): string {
  return `${distance >= 10 ? distance.toFixed(1) : distance.toFixed(2)} AU`;
}

/** Fuel mass as tonnes. */
export function formatFuel(mass: Kilograms): string {
  return `${(mass / 1000).toFixed(1)} t`;
}

/** Δv in m/s or km/s; a dash while the Δv is not yet known. */
export function formatDeltaV(deltaV: MetersPerSecond | undefined): string {
  if (deltaV === undefined) return '—';
  return deltaV >= KM_PER_S_FROM
    ? `${(deltaV / 1000).toFixed(1)} km/s`
    : `${WHOLE.format(deltaV)} m/s`;
}
