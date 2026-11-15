import type { ChoiceLog } from './choiceLog.ts';
import type { ChassisId } from './data.ts';
import type { Collection } from './gather.ts';
import { generateStarSystem } from './generation.ts';
import type { Knowledge } from './knowledge.ts';
import { startingRun } from './opening.ts';
import type { Spacecraft } from './spacecraft.ts';
import {
  deepFreeze,
  findBody,
  type BodyId,
  type LandableBody,
  type Seed,
  type StarSystem,
} from './starSystem.ts';
import { stringSeed } from '../lib/stringSeed.ts';
import type { Materials } from './units.ts';

/**
 * How a Run ended, each with its plain-language reason. Fell Short and Crashed come from a flown Hop
 * (the reason is the Hop's why); Stranded is set when no Hop could have any Success Chance, on the
 * Body the Spacecraft is left standing on.
 */
export type RunEnd =
  | { readonly kind: 'fell-short'; readonly reason: string }
  | { readonly kind: 'crashed'; readonly reason: string }
  | { readonly kind: 'stranded'; readonly reason: string; readonly bodyId: BodyId };

/**
 * Where the Run stands: landed on a Body and free to plan a Hop, or ended by a failed Hop. A Hop
 * that reaches the Heliopause Jumps straight on and lands on the next Starting Moon.
 */
export type RunStatus =
  | { readonly kind: 'landed'; readonly bodyId: BodyId }
  | { readonly kind: 'ended'; readonly end: RunEnd };

/** One attempt from a fresh start. Replays identically from its seed. */
export interface Run {
  readonly seed: Seed;
  /** Which Star System the Run is in, from 1: it sets the difficulty level of generation. */
  readonly starSystemNumber: number;
  readonly starSystem: StarSystem;
  readonly spacecraft: Spacecraft;
  readonly status: RunStatus;
  /** How many Hops the Run has flown: each Hop draws its Burns from its own stream of the seed. */
  readonly hopsFlown: number;
  /**
   * The raw stock Components are paid in. `Materials` is also the unit of a Rocky Body's yield:
   * landing on one adds its yield here.
   */
  readonly materials: Materials;
  /** The Bodies the Spacecraft has landed on in this Run: each gave up its yield and yields no more. */
  readonly depleted: readonly BodyId[];
  /** The player's choices so far, in order: with the seed and the Chassis, they rebuild the Run. */
  readonly choices: ChoiceLog;
  /** What the Spacecraft knows of the Star System it is in: reset by the Jump, otherwise only growing. */
  readonly knowledge: Knowledge;
  /**
   * What the Starting Moon gave when the Spacecraft was marooned on it, at the start of this Star
   * System (a New Run, or the Jump's arrival): the Landed view plays it as it opens.
   */
  readonly startingYield: Collection;
}

/**
 * A New Run: the Star System its seed generates, and a Spacecraft on the chosen Chassis marooned on
 * its Starting Moon, the Moon's yield collected (see `startingRun`).
 */
export function startRun(seed: Seed, chassisId: ChassisId): Run {
  return deepFreeze(startingRun(generateSystem(seed, 1), chassisId, 1, seed));
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

/** The Star System number the Run is in, from 1. */
export function starSystemNumber(run: Run): number {
  return run.starSystemNumber;
}

/**
 * The seed a Run generates its Star System from. System 1 uses the Run's seed itself, so it is the
 * System that seed has always generated; later Systems draw from a stream of their own, so they
 * differ from System 1 and from each other, and replay identically.
 */
export function starSystemSeed(runSeed: Seed, systemNumber: number): Seed {
  if (systemNumber <= 1) return runSeed;
  return runSeed ^ stringSeed(`star-system:${systemNumber}`);
}

/**
 * The Star System a Run is in at a number: its seed stream and difficulty level together, so the two
 * can never be passed mismatched. The Jump generates System n + 1 with this.
 */
export function generateSystem(runSeed: Seed, systemNumber: number): StarSystem {
  return generateStarSystem(starSystemSeed(runSeed, systemNumber), systemNumber);
}
