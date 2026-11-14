/** Pure helpers for the Landed scene's ambient life: no Phaser, so they run in Node. */

/** One full left-right-left cycle: each sweep takes half of it, calm and slow. */
export const DRIFT_PERIOD_MS = 100_000;

/** How far (px) each layer travels either side of centre at the peak of a sweep: the ground, nearest, travels furthest. */
export const DRIFT_RANGE = { stars: 3, sky: 8, ground: 48 } as const;

export type DriftLayer = keyof typeof DRIFT_RANGE;
export type DriftOffsets = Record<DriftLayer, number>;

/** A reusable offsets object: pass the same one to `driftOffsets` every frame. */
export function newDriftOffsets(): DriftOffsets {
  return { stars: 0, sky: 0, ground: 0 };
}

/** Pixels a layer `layerWidth` wide has to spare on each side once centred on the 640 px screen. */
export function driftSlack(layerWidth: number, screenWidth = 640): number {
  return (layerWidth - screenWidth) / 2;
}

/** Dust motes live between these x values: just past each edge of the screen, so wrapping is unseen. */
export const DUST_SPAN = { min: -8, max: 648 } as const;

/** A dust mote's x after `deltaMs` of wind at `speed` px per second, wrapped across the span. */
export function blowX(x: number, speed: number, deltaMs: number): number {
  const next = x + (speed * deltaMs) / 1000;
  return next > DUST_SPAN.max ? next - (DUST_SPAN.max - DUST_SPAN.min) : next;
}

/** The drift cycle's phase (radians) `elapsedMs` in. */
export function phaseAt(elapsedMs: number): number {
  return (elapsedMs / DRIFT_PERIOD_MS) * 2 * Math.PI;
}

/** Each layer's horizontal offset from centre at `phase`. Smooth: it eases to a stop at each end of the sweep. */
export function driftOffsets(phase: number, out: DriftOffsets): DriftOffsets {
  const s = Math.sin(phase);
  out.stars = DRIFT_RANGE.stars * s;
  out.sky = DRIFT_RANGE.sky * s;
  out.ground = DRIFT_RANGE.ground * s;
  return out;
}
