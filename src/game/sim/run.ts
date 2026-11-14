import { STARTER_SPACECRAFT_TUNING } from './data.ts';
import {
  deepFreeze,
  findBody,
  generateStarSystem,
  type BodyId,
  type LandableBody,
  type Seed,
  type StarSystem,
} from './starSystem.ts';
import type { Kilograms, Seconds } from './units.ts';

/** The player's one vehicle. In this slice it has no Components: fixed masses and one engine. */
export interface Spacecraft {
  /** Everything but Fuel. */
  readonly dryMass: Kilograms;
  readonly fuelMass: Kilograms;
  readonly engineIsp: Seconds;
}

/** Where the Run stands. Hops add the ways a Run ends; until then the Spacecraft is always landed. */
export interface RunStatus {
  readonly kind: 'landed';
  readonly bodyId: BodyId;
}

/** One attempt from a fresh start. Replays identically from its seed. */
export interface Run {
  readonly seed: Seed;
  readonly starSystem: StarSystem;
  readonly spacecraft: Spacecraft;
  readonly status: RunStatus;
}

/** A New Run: the Star System its seed generates, the starter Spacecraft landed on the Home Planet. */
export function startRun(seed: Seed): Run {
  const starSystem = generateStarSystem(seed);
  return deepFreeze({
    seed,
    starSystem,
    spacecraft: { ...STARTER_SPACECRAFT_TUNING },
    status: { kind: 'landed', bodyId: starSystem.homePlanetId },
  });
}

/** The Body the Spacecraft is landed on. */
export function currentBody(run: Run): LandableBody {
  const body = findBody(run.starSystem, run.status.bodyId);
  if (!body?.landable) {
    throw new Error(`Run is landed on ${run.status.bodyId}, which is not a landable Body`);
  }
  return body;
}
