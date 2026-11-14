import type { MetersPerSecond, Spacecraft } from '../game/sim/index.ts';

/**
 * The Δv the Spacecraft's Fuel provides, or `undefined` while the simulation does not expose it.
 *
 * HOOK for #27: the simulation's Δv-from-Fuel function (the simplified rocket equation) belongs
 * here. The Landed view deliberately computes no Δv itself; until #27 lands the top bar shows a dash.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub until #27 supplies the Δv rule
export function availableDeltaV(_spacecraft: Spacecraft): MetersPerSecond | undefined {
  return undefined;
}
