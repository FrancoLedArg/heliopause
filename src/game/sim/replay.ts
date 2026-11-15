import { COMPONENTS } from './catalogue.ts';
import type { Choice, ChoiceLog } from './choiceLog.ts';
import type { ChassisId } from './data.ts';
import { HELIOPAUSE, launchHop } from './hop.ts';
import { install } from './install.ts';
import { remove } from './remove.ts';
import { startRun, type Run, type RunEnd } from './run.ts';
import { runEnd, score, type Score } from './score.ts';
import { SLOT_COUNT } from './spacecraft.ts';
import { findBody, type Seed } from './starSystem.ts';

/**
 * A replayed choice log either rebuilds the Run, or stops at the first choice the Run could not
 * have taken: a log that was not played, so its Score cannot be trusted.
 */
export type ReplayResult =
  | {
      readonly kind: 'replayed';
      readonly run: Run;
      readonly score: Score;
      /** How the Run ended; `undefined` when the log stops while it is still being played. */
      readonly end: RunEnd | undefined;
    }
  | {
      readonly kind: 'rejected';
      /** The index in the log of the first choice the Run could not take. */
      readonly at: number;
      readonly choice: Choice;
      /** Plain language: why the Run could not take it. */
      readonly why: string;
    };

/**
 * Rebuilds a Run from its seed, its Chassis and the choices its player made, by playing each choice
 * in order exactly as the game did. Every Hop draws its Burns from the seed and how many Hops came
 * before it, so the same log always flies the same Hops. A log the game could not have produced
 * (for instance, from a tampered record) is rejected, not thrown: a server replaying a submitted
 * Score must expect one.
 */
export function replay(seed: Seed, chassisId: ChassisId, log: ChoiceLog): ReplayResult {
  let run = startRun(seed, chassisId);
  for (const [at, choice] of log.entries()) {
    const taken = take(run, choice);
    if (taken.kind === 'impossible') return { kind: 'rejected', at, choice, why: taken.why };
    run = taken.run;
  }
  return { kind: 'replayed', run, score: score(run), end: runEnd(run) };
}

/** The Run after one choice, or why the Run could not take it. */
type Taken =
  | { readonly kind: 'taken'; readonly run: Run }
  | { readonly kind: 'impossible'; readonly why: string };

const impossible = (why: string): Taken => ({ kind: 'impossible', why });

function take(run: Run, choice: Choice): Taken {
  // The player chooses only while the Spacecraft is landed on a Body.
  if (run.status.kind !== 'landed') return impossible('The Spacecraft was not landed on a Body.');
  switch (choice.kind) {
    case 'install': {
      if (!isSlot(choice.slot))
        return impossible(`The Spacecraft has no Slot ${String(choice.slot)}.`);
      if (!Object.hasOwn(COMPONENTS, choice.componentId)) {
        return impossible(`There is no Component ${choice.componentId}.`);
      }
      const result = install(run, choice.slot, choice.componentId);
      return result.kind === 'installed'
        ? { kind: 'taken', run: result.run }
        : impossible(`The install was refused: ${result.reason.kind}.`);
    }
    case 'remove': {
      if (!isSlot(choice.slot))
        return impossible(`The Spacecraft has no Slot ${String(choice.slot)}.`);
      const result = remove(run, choice.slot);
      return result.kind === 'removed'
        ? { kind: 'taken', run: result.run }
        : impossible(`The removal was refused: ${result.reason.kind}.`);
    }
    case 'hop': {
      if (choice.target !== HELIOPAUSE && !findBody(run.starSystem, choice.target)) {
        return impossible(`The Star System has no Body ${choice.target}.`);
      }
      const result = launchHop(run, choice.target);
      return result.kind === 'flown' ? { kind: 'taken', run: result.run } : impossible(result.why);
    }
  }
}

function isSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT;
}
