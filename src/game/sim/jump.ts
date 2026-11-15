import { COMPONENTS } from './catalogue.ts';
import { DISPERSION } from './data.ts';
import { planHop } from './hop.ts';
import { generateSystem, type Run } from './run.ts';
import { fuelForDeltaV, refit } from './spacecraft.ts';
import { deepFreeze, homePlanet } from './starSystem.ts';
import { kilograms, metersPerSecond, type Kilograms } from './units.ts';

/**
 * The Jump, for a Run whose Hop has just reached the Heliopause: it always succeeds, carrying the
 * Spacecraft to the next Star System, one difficulty level up. The Jump Drive burns out; the
 * Spacecraft lands on the new Home Planet with its other Components, its Materials and its Fuel,
 * topped up when it arrives too low to reach one of the Home Planet's Moons for sure (see
 * `arrivalFuel`). Every other part of the Run, its choice log included, carries over.
 */
export function jump(run: Run): Run {
  // The Jump Drive burns out: its Slot is emptied, and nothing is refunded for it.
  const slots = run.spacecraft.slots.map((slot) =>
    slot !== null && COMPONENTS[slot].kind === 'jump-drive' ? null : slot,
  );
  const starSystemNumber = run.starSystemNumber + 1;
  const starSystem = generateSystem(run.seed, starSystemNumber);
  const arrived: Run = {
    ...run,
    starSystemNumber,
    starSystem,
    spacecraft: refit(run.spacecraft, slots),
    status: { kind: 'landed', bodyId: starSystem.homePlanetId },
    // A new Star System: none of its Bodies has given up its yield yet (Body ids repeat between Systems).
    depleted: [],
  };
  return deepFreeze({
    ...arrived,
    spacecraft: { ...arrived.spacecraft, fuelMass: arrivalFuel(arrived) },
  });
}

/**
 * The Fuel the Spacecraft lands with after the Jump: what it kept, or, if more, enough for a Hop
 * with a 100% Success Chance from the new Home Planet to its nearest Moon (always Icy, so that Hop
 * refuels it), up to the Tank's capacity. A Run is never stranded by the Jump it earned (gameplay
 * tuning).
 */
function arrivalFuel(arrived: Run): Kilograms {
  const { spacecraft } = arrived;
  // A Hop is certain when the Fuel covers every Burn at the top of the dispersion range.
  const worstCases = homePlanet(arrived.starSystem).moons.flatMap((moon) => {
    const planned = planHop(arrived, moon.id);
    return planned.kind === 'planned' ? [planned.plan.totalEstimate * DISPERSION.max] : [];
  });
  // A hair over, so rounding never leaves the Hop a fraction short of certain.
  const certain = metersPerSecond(Math.min(...worstCases) * (1 + 1e-9));
  const floor = fuelForDeltaV(spacecraft, certain);
  return kilograms(Math.min(spacecraft.fuelCapacity, Math.max(spacecraft.fuelMass, floor)));
}
