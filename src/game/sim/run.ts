import type { ChassisId } from './data.ts';
import { newSpacecraft, type Spacecraft } from './spacecraft.ts';
import {
  deepFreeze,
  findBody,
  generateStarSystem,
  type BodyId,
  type LandableBody,
  type Seed,
  type StarSystem,
} from './starSystem.ts';

/** Where the Run stands: landed on a Body and free to plan a Hop, or ended by a failed Hop. */
export type RunStatus =
  | { readonly kind: 'landed'; readonly bodyId: BodyId }
  | { readonly kind: 'ended'; readonly outcome: 'fell-short' | 'crashed' };

/** One attempt from a fresh start. Replays identically from its seed. */
export interface Run {
  readonly seed: Seed;
  readonly starSystem: StarSystem;
  readonly spacecraft: Spacecraft;
  readonly status: RunStatus;
}

/**
 * A New Run: the Star System its seed generates, and a full Spacecraft on the chosen Chassis landed
 * on the Home Planet.
 */
export function startRun(seed: Seed, chassisId: ChassisId): Run {
  const starSystem = generateStarSystem(seed);
  return deepFreeze({
    seed,
    starSystem,
    spacecraft: newSpacecraft(chassisId),
    status: { kind: 'landed', bodyId: starSystem.homePlanetId },
  });
}

/** The Body the Spacecraft is landed on. Throws for a Run that has ended: it is on no Body. */
export function currentBody(run: Run): LandableBody {
  if (run.status.kind === 'ended') throw new Error(`Run ${run.seed} has ended`);
  const body = findBody(run.starSystem, run.status.bodyId);
  if (!body?.landable) {
    throw new Error(`Run is landed on ${run.status.bodyId}, which is not a landable Body`);
  }
  return body;
}
