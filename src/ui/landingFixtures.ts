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
  preSurvey = true,
): Landing {
  const start = startRun(seed, 'scout');
  // Stranded follows the plans the player sees (#190): every Body off the path is pre-Surveyed, so
  // its plan is the real one and the fixtures strand (or warn) as they did before Unsurveyed plans.
  const surveyed = [
    ...start.knowledge.surveyed,
    ...(preSurvey
      ? listBodies(start.starSystem)
          .filter(({ name }) => !path.includes(name))
          .map(({ id }) => id)
      : []),
  ];
  let run: Run = {
    ...start,
    materials: materials(start.materials + extraMaterials),
    knowledge: { ...start.knowledge, surveyed },
  };
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
 * Seed 78 with a level-1 Drill, back on Quesrol after Quesrol, Tudru and Lioxex: no Hop as built,
 * but removing the Drill saves the Run, with every Body Unsurveyed until landed on as in real play
 * (pass `preSurvey` false). Re-pinned for #190 (was seed 156's Rymoquox), #283 (was seed 105's
 * Verpry) and #280/#298 (was seed 14's Hunce): Comms Detects a Fuel source first, and every Chassis
 * now flies with one shared tuning.
 */
export const SAVE_BY_REMOVING = {
  seed: 78,
  path: ['Quesrol', 'Tudru', 'Lioxex', 'Quesrol'],
  fit: 'drill-1',
} as const;

/**
 * Seed 47, back on Noxiol after Noxiol, Kyrtio and Lanpraer: every plan sure, yet no change to the
 * Spacecraft could give any Hop a chance after the last, in real play as well as with the Bodies off
 * the path pre-Surveyed. Re-pinned for #189 (was seed 305's Lyquin), #247 (was seed 12's Laquun),
 * #283 (was seed 27's Dryli) and #280/#298 (was seed 5's Driovae): Comms Detects a Fuel source
 * first, and every Chassis now flies with one shared tuning.
 */
export const STRANDED_ON_LANDING = {
  seed: 47,
  path: ['Noxiol', 'Kyrtio', 'Lanpraer', 'Noxiol'],
} as const;

/**
 * Seed 97, back on Risrol after Risrol, Harzo and Violios, with 11 Materials more than it would
 * have, landing with 60: only swapping in the level-2 Engine (60) saves the Run, so spending any of
 * them on another Component strands it. With one fewer, the Landing itself strands it. Its own seed
 * since #280/#298 (was `STRANDED_ON_LANDING`'s path with extra Materials): no path strands both in
 * real play and one Material short of the Engine swap.
 */
export const SAVE_BY_REFITTING = {
  seed: 97,
  path: ['Risrol', 'Harzo', 'Risrol', 'Violios'],
} as const;

export function saveByRefitting(): Run {
  return landing(SAVE_BY_REFITTING.seed, SAVE_BY_REFITTING.path, undefined, 11).run;
}
