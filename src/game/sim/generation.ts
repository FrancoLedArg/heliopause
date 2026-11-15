// The generator Runs use: a Star System with no early dead end (#188).
import { stringSeed } from '../lib/stringSeed.ts';
import type { Rng } from '../lib/rng.ts';
import { CHASSIS_IDS, type ChassisId } from './data.ts';
import { flyHop, planHop } from './hop.ts';
import { STARTING_MATERIALS, type Run } from './run.ts';
import { newSpacecraft } from './spacecraft.ts';
import {
  deepFreeze,
  drawStarSystem,
  listBodies,
  type Seed,
  type StarSystem,
} from './starSystem.ts';

/**
 * How many draws a seed may take before generation settles for the last one: only a bound that
 * keeps generation fast. Measured over 500 seeds, Star Systems 1 to 3 need at most 17 draws (1.7 to
 * 3.1 on average). Deep into a Run a new Spacecraft's starting Δv is no longer what arrives there,
 * and its draws seldom pass; those Star Systems take the last draw.
 */
const MAX_DRAWS = 32;

/**
 * The Star System a seed generates at a difficulty level (the Star System number, from 1): the first
 * of the seed's draws with no early dead end, so no Hop from the start that the plan shows at 100%
 * leaves a Chassis's new Spacecraft Stranded. The first draw uses the seed itself; each further
 * draw comes from a stream of the seed's own, so the same seed always generates the same Star
 * System. A draw keeps the seed it was asked for.
 */
export function generateStarSystem(seed: Seed, level = 1): StarSystem {
  let system = drawStarSystem(seed, level);
  for (let draw = 1; draw < MAX_DRAWS && hasEarlyDeadEnd(system, level); draw++) {
    system = drawStarSystem(seed ^ stringSeed(`redraw:${String(draw)}`), level);
  }
  return system.seed === seed ? system : deepFreeze({ ...system, seed });
}

/** Every Burn at its estimate: the dispersion factor drawn is exactly 1. */
const AT_ESTIMATE: Rng = { next: () => 0.5, int: (min) => min };

/**
 * Whether some Chassis's new Spacecraft, landed on the Home Planet, has a Hop with a 100% Success
 * Chance that, flown at its estimate, Arrives Stranded: the yield collected and every install or
 * removal weighed (`endIfStranded`, through `flyHop`).
 */
function hasEarlyDeadEnd(system: StarSystem, level: number): boolean {
  return CHASSIS_IDS.some((chassisId) => {
    const start = startingRun(system, chassisId, level);
    return listBodies(system).some((body) => {
      if (!body.landable || body.id === system.homePlanetId) return false;
      const planned = planHop(start, body.id);
      if (planned.kind !== 'planned' || planned.plan.successChance < 1) return false;
      return flyHop(start, planned.plan, AT_ESTIMATE).run.status.kind === 'ended';
    });
  });
}

/** A new Spacecraft on `chassisId`, landed on the Home Planet of `system` with a New Run's Materials. */
function startingRun(system: StarSystem, chassisId: ChassisId, level: number): Run {
  return {
    seed: system.seed,
    starSystemNumber: level,
    starSystem: system,
    spacecraft: newSpacecraft(chassisId),
    status: { kind: 'landed', bodyId: system.homePlanetId },
    hopsFlown: 0,
    materials: STARTING_MATERIALS,
    depleted: [],
    choices: [],
  };
}
