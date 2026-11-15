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
 * A Scout Run from `seed` that first installs `fit` in Slot 2 on the Starting Moon (if given), then
 * Hops through the Bodies named in `path`, in turn, Arriving each time: from the Starting Moon only
 * Bodies Comms has Detected can be reached (#96). `extraMaterials` are added at the start, as a tuned
 * fixture. `before` is the Run at the last Launch. Throws if the seed does not play out that way.
 */
export function landing(
  seed: number,
  path: readonly string[],
  fit?: ComponentId,
  extraMaterials = 0,
): Landing {
  const start = startRun(seed, 'scout');
  let run: Run = { ...start, materials: materials(start.materials + extraMaterials) };
  if (fit) {
    const fitted = install(run, 2, fit);
    if (fitted.kind !== 'installed') throw new Error(`Seed ${String(seed)}: cannot fit ${fit}`);
    run = fitted.run;
  }
  let last: Landing | undefined;
  for (const bodyName of path) {
    const body = listBodies(run.starSystem).find(({ name }) => name === bodyName);
    if (!body) throw new Error(`Seed ${String(seed)} has no ${bodyName}`);
    const flown = launchHop(run, body.id);
    if (flown.kind !== 'flown' || flown.flight.outcome.kind !== 'arrived') {
      throw new Error(`Seed ${String(seed)}: the Hop to ${bodyName} should Arrive`);
    }
    last = { before: run, flight: flown.flight, run: flown.run };
    run = flown.run;
  }
  if (!last) throw new Error('A landing needs at least one Hop');
  return last;
}

/**
 * Seed 156 with a level-1 Drill, landed on Rymoquox by way of Zuzin and Rama: no Hop as built, but
 * removing the Drill saves the Run. Re-pinned for #189 (was seed 45's Mavar, then seed 11 before a
 * Rocky opening stopped adding Materials over a New Run's) and for #247 (was seed 15's Pripro): the
 * Chassis Isp rose 30%, so seed 15's Run has a Hop there.
 */
export const SAVE_BY_REMOVING = {
  seed: 156,
  path: ['Zuzin', 'Rama', 'Rymoquox'],
  fit: 'drill-1',
} as const;

/**
 * Seed 27, back on Dryli after Dryli, Siolmel and Teskae: the last Hop's plan is sure, and no change
 * to the Spacecraft could give any Hop a chance. Re-pinned for #189 (was seed 305's Lyquin): Runs
 * open on a Starting Moon and Hop only to Bodies Comms Detected. Re-pinned for #247 (was seed 12's
 * Laquun): the Chassis Isp rose 30%, so that Run is no longer Stranded.
 */
export const STRANDED_ON_LANDING = {
  seed: 27,
  path: ['Dryli', 'Siolmel', 'Teskae', 'Dryli'],
} as const;

/**
 * Seed 27's same path with 1 Material more than it would have (60, not 59): only swapping in the
 * level-2 Engine (60) saves the Run, so spending any of them on another Component strands it.
 * Without it, the Landing itself strands it. Re-pinned for #189 (was seed 57's Vekyr).
 */
export function saveByRefitting(): Run {
  return landing(STRANDED_ON_LANDING.seed, STRANDED_ON_LANDING.path, undefined, 1).run;
}
