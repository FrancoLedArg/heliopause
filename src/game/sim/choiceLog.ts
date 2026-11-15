import { COMPONENT_IDS, type ComponentId } from './catalogue.ts';
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

/**
 * The version of the stored choice log's shape. Bump it whenever a Choice gains, loses or renames a
 * field, or a field's meaning changes (for instance, Slots counted differently), so a log stored
 * before is refused rather than misread. A change to the game's rules is not a new version: the
 * stored record's build says which rules a log was played under.
 */
export const CHOICE_LOG_VERSION = 1;

/** A choice log as it is stored and sent: plain JSON, tagged with the version of its shape. */
export interface StoredChoiceLog {
  readonly version: typeof CHOICE_LOG_VERSION;
  readonly choices: ChoiceLog;
}

/** The choice log ready to store or send; `parseChoiceLog` reads it back. */
export function storedChoiceLog(log: ChoiceLog): StoredChoiceLog {
  return { version: CHOICE_LOG_VERSION, choices: log };
}

/**
 * Reads a stored choice log back: the one place stored or received data becomes a `ChoiceLog`.
 * Anything that is not a log of this version, with every choice well formed, is `undefined`. A log
 * that parses may still be one the game could not have played; `replay` rejects those. The seed and
 * the Chassis stored beside it are not checked here: `replay` rejects a seed that is not a safe
 * integer and an unknown Chassis.
 */
export function parseChoiceLog(value: unknown): ChoiceLog | undefined {
  if (!isRecord(value)) return undefined;
  const { version, choices: entries } = value;
  if (version !== CHOICE_LOG_VERSION || !Array.isArray(entries)) return undefined;
  const choices: Choice[] = [];
  for (const entry of entries as readonly unknown[]) {
    const choice = parseChoice(entry);
    if (!choice) return undefined;
    choices.push(choice);
  }
  return choices;
}

function parseChoice(value: unknown): Choice | undefined {
  if (!isRecord(value)) return undefined;
  const { kind } = value;
  switch (kind) {
    case 'install': {
      const { slot, componentId } = value;
      if (typeof slot !== 'number' || !Number.isInteger(slot)) return undefined;
      const id = COMPONENT_IDS.find((known) => known === componentId);
      return id && { kind: 'install', slot, componentId: id };
    }
    case 'remove': {
      const { slot } = value;
      if (typeof slot !== 'number' || !Number.isInteger(slot)) return undefined;
      return { kind: 'remove', slot };
    }
    case 'hop': {
      const { target } = value;
      // Parsing boundary: a Body id is any string; whether this Star System has it is replay's to check.
      return typeof target === 'string' ? { kind: 'hop', target: target as HopTarget } : undefined;
    }
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
