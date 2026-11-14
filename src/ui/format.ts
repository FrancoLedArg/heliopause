// How quantities read on screen: real units, rounded for readability (spec #12, story 23).
// Parameters take the simulation's unit types, so one unit cannot be shown where another is meant.
import { findBody, type Body, type Run } from '../game/sim/index.ts';
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

/** A mass as tonnes. */
export function formatMass(mass: Kilograms): string {
  return `${(mass / 1000).toFixed(1)} t`;
}

/** Fuel mass as tonnes. */
export function formatFuel(mass: Kilograms): string {
  return formatMass(mass);
}

/** Δv in m/s or km/s; a dash while the Δv is not yet known. */
export function formatDeltaV(deltaV: MetersPerSecond | undefined): string {
  if (deltaV === undefined) return '—';
  return deltaV >= KM_PER_S_FROM
    ? `${(deltaV / 1000).toFixed(1)} km/s`
    : `${WHOLE.format(deltaV)} m/s`;
}

/** Δv in the Hop plan: always whole m/s, so Burns, Needed, Available and Margin add up by eye. */
export function formatPlanDeltaV(deltaV: MetersPerSecond): string {
  return `${WHOLE.format(deltaV)} m/s`;
}

/** A probability (0 to 1) as a whole percent; never 100% unless certain, never 0% unless impossible. */
export function formatPercent(probability: number): string {
  const percent = Math.round(probability * 100);
  if (probability > 0 && percent < 1) return '<1%';
  if (probability < 1 && percent > 99) return '>99%';
  return `${percent}%`;
}

/** What kind of Body this is, in the player's words: "Moon of Cinder", "Home Planet · Rocky", "Gas Giant". */
export function bodyTypeLabel(run: Run, body: Body): string {
  switch (body.kind) {
    case 'moon': {
      const planet = findBody(run.starSystem, body.planetId);
      if (!planet) throw new Error(`Moon ${body.id} has no planet`);
      return `Moon of ${planet.name}`;
    }
    case 'gas-giant':
      return 'Gas Giant';
    case 'rocky-planet':
      return body.id === run.starSystem.homePlanetId ? 'Home Planet · Rocky' : 'Rocky planet';
  }
}
