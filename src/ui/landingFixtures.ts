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
 * Hops to the Body named `bodyName` and Arrives. Throws if the seed does not play out that way.
 */
export function landing(seed: number, bodyName: string, fit?: ComponentId): Landing {
  let before = startRun(seed, 'scout');
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

/** Seed 1 with a level-1 Drill, landed on Korli: no Hop as built, but removing the Drill saves the Run. */
export const SAVE_BY_REMOVING = { seed: 1, body: 'Korli', fit: 'drill-1' } as const;

/** Seed 2, landed on Quydril after a sure Hop: no change to the Spacecraft could give any Hop a chance. */
export const STRANDED_ON_LANDING = { seed: 2, body: 'Quydril' } as const;

/**
 * Seed 7, landed on Quiolxaexis with its 53 Materials tuned up to 60: only swapping in the level-2
 * Engine (60) saves the Run, so spending any of them on another Component strands it.
 */
export function saveByRefitting(): Run {
  const { run } = landing(7, 'Quiolxaexis');
  return { ...run, materials: materials(60) };
}
