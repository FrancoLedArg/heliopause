// The Discovery log as data (#317): each Discovery's badge state and the way to the next blueprint.
// Every figure comes from the simulation and the device's progress; this only arranges it.
import {
  BLUEPRINT_THRESHOLDS,
  DISCOVERIES,
  DISCOVERY_IDS,
  type DiscoveryId,
} from '../game/sim/index.ts';
import type { ScienceProgress } from '../game/lib/scienceProgress.ts';

/** New = first found on this device this Run (star), found = made before (check), locked = never found (lock). */
export type DiscoveryState = 'new' | 'found' | 'locked';

export interface DiscoveryLogEntry {
  readonly id: DiscoveryId;
  readonly state: DiscoveryState;
  /** The plain name, or "Unknown" while locked. */
  readonly name: string;
  /** The accessible name: carries the state, so no word is shown on every row. */
  readonly label: string;
  /** Where the real find happened; only once found. */
  readonly source: string | undefined;
}

const HIDDEN_BY = {
  rocky: 'a rocky world',
  icy: 'an icy world',
  'gas-giant': 'a gas giant',
} as const;

/**
 * Every Discovery with its state. `known` is the Discoveries the device had when the Run began, so
 * New is derived by comparing: made on this device now (`progress`) but not then.
 */
export function describeDiscoveryLog(
  progress: ScienceProgress,
  known: readonly DiscoveryId[],
): readonly DiscoveryLogEntry[] {
  return DISCOVERY_IDS.map((id) => {
    const entry = DISCOVERIES[id];
    const found = progress.discoveries[id] !== undefined;
    if (!found) {
      return {
        id,
        state: 'locked',
        name: 'Unknown',
        label: `Not found yet: hidden on ${HIDDEN_BY[entry.bodyType]}`,
        source: undefined,
      };
    }
    const isNew = !known.includes(id);
    return {
      id,
      state: isNew ? 'new' : 'found',
      name: entry.name,
      label: `${entry.name}: ${isNew ? 'New, found this Run' : 'found before'}`,
      source: entry.source,
    };
  });
}

export interface NextBlueprint {
  /** 0 to 1: how far lifetime Science is toward the next threshold. */
  readonly progress: number;
  /** Science still needed; 0 when every blueprint is unlocked. */
  readonly remaining: number;
  readonly label: string;
}

/** The way to the next locked blueprint from `lifetimeScience`; full when none is left. */
export function nextBlueprint(lifetimeScience: number): NextBlueprint {
  const next = Math.min(
    ...Object.values<number>(BLUEPRINT_THRESHOLDS).filter((t) => t > lifetimeScience),
  );
  if (!Number.isFinite(next)) {
    return {
      progress: 1,
      remaining: 0,
      label: `${String(lifetimeScience)} Science: every blueprint unlocked`,
    };
  }
  return {
    progress: lifetimeScience / next,
    remaining: next - lifetimeScience,
    label: `${String(lifetimeScience)} Science: ${String(next - lifetimeScience)} more to the next blueprint`,
  };
}
