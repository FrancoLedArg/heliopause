import { DISCOVERY_IDS, type DiscoveryId } from '../sim/index.ts';
import { browserStorage, type ScoreStorage } from './bestScore.ts';

/** What this device has learned, over every Run (#319): never spent, only growing. */
export interface ScienceProgress {
  /** Every Science point ever earned on this device. */
  readonly lifetimeScience: number;
  /** Every Discovery ever made here, with when it was first made (ms since the epoch). */
  readonly discoveries: Readonly<Partial<Record<DiscoveryId, number>>>;
}

const KEY = 'heliopause:science-progress';

const EMPTY: ScienceProgress = { lifetimeScience: 0, discoveries: {} };

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isDiscoveryId = (value: string): value is DiscoveryId =>
  (DISCOVERY_IDS as readonly string[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keeps what is valid of a stored record: a bad total reads as 0, unknown or bad entries are dropped. */
function sanitise(value: unknown): ScienceProgress {
  if (!isRecord(value)) return EMPTY;
  const { lifetimeScience, discoveries } = value;
  const kept: Partial<Record<DiscoveryId, number>> = {};
  if (isRecord(discoveries)) {
    for (const [id, firstFound] of Object.entries(discoveries)) {
      if (isDiscoveryId(id) && isCount(firstFound)) kept[id] = firstFound;
    }
  }
  return { lifetimeScience: isCount(lifetimeScience) ? lifetimeScience : 0, discoveries: kept };
}

/** This device's Science progress; empty when none is stored, or when storage cannot be read. */
export function readScienceProgress(
  storage: ScoreStorage | null = browserStorage(),
): ScienceProgress {
  try {
    const raw = storage?.getItem(KEY);
    if (raw === null || raw === undefined) return EMPTY;
    return sanitise(JSON.parse(raw));
  } catch {
    return EMPTY;
  }
}

/** What this page has recorded, for storage that cannot keep it: progress lasts until reload. */
let session: ScienceProgress = EMPTY;

/** The stored progress, or this page's own when storage has lost it (blocked, or none). */
function carried(stored: ScienceProgress): ScienceProgress {
  return stored.lifetimeScience >= session.lifetimeScience ? stored : session;
}

/**
 * Records Discoveries the moment they are made: `science` is added to the lifetime total, and each
 * Discovery not made on this device before is remembered with `now`. Storage that cannot be written
 * is ignored: the returned progress still counts, and lasts until the page reloads.
 */
export function recordDiscoveries(
  science: number,
  discoveryIds: readonly DiscoveryId[],
  now: number,
  storage: ScoreStorage | null = browserStorage(),
): ScienceProgress {
  const previous = carried(readScienceProgress(storage));
  const discoveries = { ...previous.discoveries };
  for (const id of discoveryIds) discoveries[id] ??= now;
  const next: ScienceProgress = {
    lifetimeScience: previous.lifetimeScience + Math.max(0, Math.floor(science)),
    discoveries,
  };
  session = next;
  try {
    storage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Without storage, progress lasts until reload: the game plays on without it.
  }
  return next;
}

/** The lifetime Science a New Run carries in: the device's, or this page's when storage is gone. */
export function scienceToCarryIn(storage: ScoreStorage | null = browserStorage()): number {
  return carried(readScienceProgress(storage)).lifetimeScience;
}

/** The Discoveries this device had when the current Run began (#317): New is what the Run adds to it. */
let knownAtRunStart: readonly DiscoveryId[] = [];

/** Notes what the device knows now; called as a Run starts. */
export function markRunStart(storage: ScoreStorage | null = browserStorage()): void {
  knownAtRunStart = Object.keys(carried(readScienceProgress(storage)).discoveries).filter(
    isDiscoveryId,
  );
}

/** The Discoveries the device had at the current Run's start. */
export function discoveriesAtRunStart(): readonly DiscoveryId[] {
  return knownAtRunStart;
}
