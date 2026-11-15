// The generator Runs use: a Star System with a fair opening (#96) and no early dead end (#188).
import { stringSeed } from '../lib/stringSeed.ts';
import type { Rng } from '../lib/rng.ts';
import { CHASSIS_IDS, OPENING_TUNING } from './data.ts';
import { flyHop, marginShare, planHopAtRealValues } from './hop.ts';
import { firstDetectedBody, startingRun } from './opening.ts';
import type { Run } from './run.ts';
import {
  deepFreeze,
  drawStarSystem,
  listBodies,
  type Body,
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
 * of the seed's draws whose opening is fair for every Chassis's new Spacecraft marooned on its
 * Starting Moon: the first Body Comms Detects is In reach with comfortable Margin and yields
 * something, and no Hop from there that the plan shows at 100% leaves it Stranded. The first draw
 * uses the seed itself; each further draw comes from a stream of the seed's own, so the same seed
 * always generates the same Star System. A draw keeps the seed it was asked for.
 */
export function generateStarSystem(seed: Seed, level = 1): StarSystem {
  let system = drawStarSystem(seed, level);
  for (let draw = 1; draw < MAX_DRAWS && !opensFairly(system, level); draw++) {
    system = drawStarSystem(seed ^ stringSeed(`redraw:${String(draw)}`), level);
  }
  return system.seed === seed ? system : deepFreeze({ ...system, seed });
}

/**
 * Every Burn at its estimate: the dispersion factor drawn is exactly 1. Exported only for the sim's
 * test fixtures (testing.ts), so `earlyDeadEnds` weighs a Hop exactly as the generator does.
 */
export const AT_ESTIMATE: Rng = { next: () => 0.5, int: (min) => min };

/** Whether every Chassis's new Spacecraft opens `system` fairly (see `generateStarSystem`). */
function opensFairly(system: StarSystem, level: number): boolean {
  const first = firstDetectedBody(system);
  if (first.baseYield <= 0) return false;
  return CHASSIS_IDS.every((chassisId) => {
    const start = startingRun(system, chassisId, level);
    const planned = planHopAtRealValues(start, first.id);
    if (planned.kind !== 'planned') return false;
    const { plan } = planned;
    if (plan.successChance < OPENING_TUNING.firstHop.successChance) return false;
    if (marginShare(plan) < OPENING_TUNING.firstHop.marginShare) return false;
    return !listBodies(system).some((body) => isDeadEnd(start, body));
  });
}

/**
 * Whether a Hop from `start` to `body` would be an early dead end (#188): the plan shows it at 100%
 * but, flown at its estimate, it Arrives Stranded (the yield collected and every install or removal
 * weighed, through `flyHop`). Every landable Body is weighed as if Detected, so no future way of
 * finding one (the Radar) can lead into a dead end either.
 */
function isDeadEnd(start: Run, body: Body): boolean {
  if (!body.landable || start.status.kind !== 'landed' || body.id === start.status.bodyId) {
    return false;
  }
  const knowing = withDetected(start, body);
  const planned = planHopAtRealValues(knowing, body.id);
  if (planned.kind !== 'planned' || planned.plan.successChance < 1) return false;
  return flyHop(knowing, planned.plan, AT_ESTIMATE).run.status.kind === 'ended';
}

/** The same Run, with `body` Detected too. Exported only for the sim's test fixtures (testing.ts). */
export function withDetected(run: Run, body: Body): Run {
  if (run.knowledge.detected.includes(body.id)) return run;
  return {
    ...run,
    knowledge: { ...run.knowledge, detected: [...run.knowledge.detected, body.id] },
  };
}
