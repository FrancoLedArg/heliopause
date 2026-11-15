import { COMPONENTS } from './catalogue.ts';
import { DISPERSION } from './data.ts';
import { planHop } from './hop.ts';
import { firstDetectedBody, maroon } from './opening.ts';
import { generateSystem, type Run } from './run.ts';
import { fuelForDeltaV, refit } from './spacecraft.ts';
import { endIfStranded } from './stranded.ts';
import { deepFreeze } from './starSystem.ts';
import { kilograms, metersPerSecond, type Kilograms } from './units.ts';

/**
 * The Jump, for a Run whose Hop has just reached the Heliopause: it always succeeds, carrying the
 * Spacecraft to the next Star System, one difficulty level up. The Jump Drive burns out; the
 * Spacecraft is marooned on the new Starting Moon knowing nothing but the opening (`maroon`), with
 * its other Components, its Materials and its Fuel, the Moon's yield collected, and the Fuel topped
 * up when it is still too low to reach the first Detected Body for sure (see `arrivalFuel`). Every
 * other part of the Run, its choice log included, carries over. Should no Hop be possible from there
 * even so, the Run ends Stranded (`endIfStranded`).
 */
export function jump(run: Run): Run {
  // The Jump Drive burns out: its Slot is emptied, and nothing is refunded for it.
  const slots = run.spacecraft.slots.map((slot) =>
    slot !== null && COMPONENTS[slot].kind === 'jump-drive' ? null : slot,
  );
  const starSystemNumber = run.starSystemNumber + 1;
  const arrived = maroon(
    {
      seed: run.seed,
      starSystemNumber,
      spacecraft: refit(run.spacecraft, slots),
      hopsFlown: run.hopsFlown,
      gameHours: run.gameHours,
      materials: run.materials,
      choices: run.choices,
    },
    generateSystem(run.seed, starSystemNumber),
  );
  // Landing on the new Starting Moon is judged like any landing: it ends the Run if no Hop is left.
  return endIfStranded(
    deepFreeze({
      ...arrived,
      spacecraft: { ...arrived.spacecraft, fuelMass: arrivalFuel(arrived) },
    }),
  );
}

/**
 * The Fuel the Spacecraft has after the Jump: what it kept and gathered, or, if more, enough for a Hop
 * with a 100% Success Chance from the new Starting Moon to the first Body Comms Detected there (which
 * always yields something), up to the Tank's capacity. A Run is never stranded by the Jump it earned
 * (gameplay tuning).
 */
function arrivalFuel(arrived: Run): Kilograms {
  const { spacecraft } = arrived;
  const planned = planHop(arrived, firstDetectedBody(arrived.starSystem).id);
  if (planned.kind !== 'planned') throw new Error(`No first Hop after the Jump: ${planned.reason}`);
  // A Hop is certain when the Fuel covers every Burn at the top of the dispersion range; a hair
  // over, so rounding never leaves it a fraction short of certain.
  const certain = metersPerSecond(planned.plan.totalEstimate * DISPERSION.max * (1 + 1e-9));
  const floor = fuelForDeltaV(spacecraft, certain);
  return kilograms(Math.min(spacecraft.fuelCapacity, Math.max(spacecraft.fuelMass, floor)));
}
