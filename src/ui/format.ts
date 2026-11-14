// How quantities read on screen: real units, rounded for readability (spec #12, story 23).

const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Above this, Δv reads better in km/s (gameplay tuning). */
const KM_PER_S_FROM = 10_000;

/** Surface gravity in m/s². */
export function formatGravity(metersPerSecondSquared: number): string {
  return `${metersPerSecondSquared.toFixed(1)} m/s²`;
}

/** Distance from the star in astronomical units. */
export function formatDistanceAu(au: number): string {
  return `${au >= 10 ? au.toFixed(1) : au.toFixed(2)} AU`;
}

/** Fuel mass (kg in) as tonnes. */
export function formatFuel(kilograms: number): string {
  return `${(kilograms / 1000).toFixed(1)} t`;
}

/** Δv in m/s or km/s; a dash while the Δv is not yet known. */
export function formatDeltaV(metersPerSecond: number | undefined): string {
  if (metersPerSecond === undefined) return '—';
  return metersPerSecond >= KM_PER_S_FROM
    ? `${(metersPerSecond / 1000).toFixed(1)} km/s`
    : `${WHOLE.format(metersPerSecond)} m/s`;
}
