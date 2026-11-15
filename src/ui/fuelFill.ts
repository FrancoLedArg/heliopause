import type { Kilograms } from '../game/sim/index.ts';

/** How full the tank is, 0 to 1. A Spacecraft with no capacity reads empty. */
export function fuelFillShare(fuel: Kilograms, capacity: Kilograms): number {
  if (capacity <= 0) return 0;
  return Math.min(1, Math.max(0, fuel / capacity));
}
