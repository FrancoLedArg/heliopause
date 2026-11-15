import type { ComponentId } from './catalogue.ts';
import type { HopTarget } from './hop.ts';
import type { Run } from './run.ts';
import { deepFreeze } from './starSystem.ts';

/**
 * One player choice that changes a Run: install a Component in a Slot, remove one from a Slot, or
 * launch a Hop at a target. Plain data, so a log of them can be stored and sent as JSON.
 */
export type Choice =
  | { readonly kind: 'install'; readonly slot: number; readonly componentId: ComponentId }
  | { readonly kind: 'remove'; readonly slot: number }
  | { readonly kind: 'hop'; readonly target: HopTarget };

/**
 * Every choice a Run's player made, in order. With the seed and the Chassis it is all a replay
 * needs to rebuild the Run.
 */
export type ChoiceLog = readonly Choice[];

/** The Run a choice made, with the choice appended to its log. Only choices the Run accepted are recorded. */
export function recordChoice(run: Run, choice: Choice): Run {
  return deepFreeze({ ...run, choices: [...run.choices, choice] });
}
