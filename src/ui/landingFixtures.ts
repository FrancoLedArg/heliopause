// Test fixtures for the browser and e2e tests: Runs that reach the Stranded warning or Stranded
// itself in real play, from a seed. The game never imports this file.
import {
  install,
  launchHop,
  listBodies,
  materials,
  startRun,
  type ComponentId,
  type HopFlight,
  type Run,
} from '../game/sim/index.ts';

/** A Run before and after an Arrived Hop. */
export interface Landing {
  readonly before: Run;
  readonly flight: HopFlight;
  readonly run: Run;
}

/**
 * A Scout Run from `seed` that first installs `fit` in Slot 2 on the Home Planet (if given), then
 * Hops to the Body named `bodyName` and Arrives. `extraMaterials` are added at the start, as a tuned
 * fixture. Throws if the seed does not play out that way.
 */
export function landing(
  seed: number,
  bodyName: string,
  fit?: ComponentId,
  extraMaterials = 0,
): Landing {
  const start = startRun(seed, 'scout');
  let before: Run = { ...start, materials: materials(start.materials + extraMaterials) };
  if (fit) {
    const fitted = install(before, 2, fit);
    if (fitted.kind !== 'installed') throw new Error(`Seed ${String(seed)}: cannot fit ${fit}`);
    before = fitted.run;
  }
  const body = listBodies(before.starSystem).find(({ name }) => name === bodyName);
  if (!body) throw new Error(`Seed ${String(seed)} has no ${bodyName}`);
  const flown = launchHop(before, body.id);
  if (flown.kind !== 'flown' || flown.flight.outcome.kind !== 'arrived') {
    throw new Error(`Seed ${String(seed)}: the Hop to ${bodyName} should Arrive`);
  }
  return { before, flight: flown.flight, run: flown.run };
}

/**
 * Seed 45 with a level-1 Drill, landed on Mavar: no Hop as built, but removing the Drill saves the
 * Run. Re-pinned for #188 (was seed 1's Korli).
 */
export const SAVE_BY_REMOVING = { seed: 45, body: 'Mavar', fit: 'drill-1' } as const;

/**
 * Seed 305, landed on Lyquin after a 99% Hop: no change to the Spacecraft could give any Hop a
 * chance. Re-pinned for #188 (was seed 2's sure Hop to Quydril): no sure Hop from the start strands
 * a new Spacecraft now.
 */
export const STRANDED_ON_LANDING = { seed: 305, body: 'Lyquin' } as const;

/**
 * Seed 57, landed on Vekyr with 15 Materials more than it would have (60, not 45): only swapping in
 * the level-2 Engine (60) saves the Run, so spending any of them on another Component strands it.
 * Without the 15, the Landing itself strands it. Re-pinned for #188 (was seed 7's Quiolxaexis).
 */
export function saveByRefitting(): Run {
  return landing(57, 'Vekyr', undefined, 15).run;
}
