// Blueprints (#171, #319): Components a device unlocks with lifetime Science, never stored apart.
import type { ComponentId } from './catalogue.ts';
import type { Run } from './run.ts';

/** The Components that start locked, and the lifetime Science that unlocks each. */
export const BLUEPRINT_THRESHOLDS = {
  /**
   * Low: a Camera finds 10 Science a Discovery and a Chemistry scanner 25, so one or two Runs of
   * landing with an Instrument reach it.
   */
  'sample-lab': 40,
  /** Higher: about 3 to 5 Runs of steady discovering. */
  'drill-3': 200,
} as const satisfies Partial<Record<ComponentId, number>>;

export type BlueprintId = keyof typeof BLUEPRINT_THRESHOLDS;

export const BLUEPRINT_IDS = Object.keys(BLUEPRINT_THRESHOLDS) as readonly BlueprintId[];

/**
 * Lifetime Science that unlocks every blueprint. A Run started without the device's Science (a
 * replay, a test) carries this in: a choice log only proves choices, and a blueprint only ever
 * refuses, so a log played under any locks replays the same with none.
 */
export const EVERY_BLUEPRINT = Math.max(...Object.values(BLUEPRINT_THRESHOLDS));

export function isBlueprint(id: ComponentId): id is BlueprintId {
  return Object.hasOwn(BLUEPRINT_THRESHOLDS, id);
}

/** The Science behind a Run's blueprints: what it carried in from the device, plus what it earned. */
export function lifetimeScience(run: Pick<Run, 'scienceCarriedIn' | 'science'>): number {
  return run.scienceCarriedIn + run.science;
}

/** How much more lifetime Science unlocks `id`: 0 when it is unlocked, or not a blueprint. */
export function scienceStillNeeded(
  run: Pick<Run, 'scienceCarriedIn' | 'science'>,
  id: ComponentId,
): number {
  if (!isBlueprint(id)) return 0;
  return Math.max(0, BLUEPRINT_THRESHOLDS[id] - lifetimeScience(run));
}

/** The blueprints `after` has unlocked that `before` had not: a threshold crossed mid-Run. */
export function newlyUnlocked(
  before: Pick<Run, 'scienceCarriedIn' | 'science'>,
  after: Pick<Run, 'scienceCarriedIn' | 'science'>,
): readonly BlueprintId[] {
  return BLUEPRINT_IDS.filter(
    (id) => scienceStillNeeded(before, id) > 0 && scienceStillNeeded(after, id) === 0,
  );
}
