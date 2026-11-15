import { browserStorage, type ScoreStorage } from './bestScore.ts';

/** The key moments of a first Run that get a callout (#290). */
export const HINT_IDS = [
  'first-landing',
  'first-hop-plan',
  'first-gathering',
  'first-build',
  'heliopause-found',
] as const;

export type HintId = (typeof HINT_IDS)[number];

/** The longest a callout's line may be. */
export const HINT_MAX_LENGTH = 40;

/** One line per hint. */
export const HINT_TEXT: Readonly<Record<HintId, string>> = {
  'first-landing': 'Plan your next Hop',
  'first-hop-plan': 'Launch when the bar is green',
  'first-gathering': 'Fuel and Materials land here',
  'first-build': 'Spend Materials on parts',
  'heliopause-found': 'The way out. You need a Jump Drive',
};

const KEY = 'heliopause:first-run-hints';

const isHintId = (value: unknown): value is HintId =>
  typeof value === 'string' && (HINT_IDS as readonly string[]).includes(value);

/** The hints already dismissed or acted on, on this device; empty when none, or when storage cannot be read. */
export function readSeenHints(
  storage: ScoreStorage | null = browserStorage(),
): ReadonlySet<HintId> {
  try {
    const raw = storage?.getItem(KEY);
    if (raw === null || raw === undefined) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter(isHintId) : []);
  } catch {
    return new Set();
  }
}

/** Remembers `id` as seen. Storage that cannot be written is ignored: the game plays without it. */
export function markHintSeen(id: HintId, storage: ScoreStorage | null = browserStorage()): void {
  try {
    const seen = new Set(readSeenHints(storage));
    seen.add(id);
    storage?.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // Not remembered: the hint may come back next time.
  }
}

/** The hint to show: the first of `wanted` (in priority order) that has not been seen. */
export function nextHint(wanted: readonly HintId[], seen: ReadonlySet<HintId>): HintId | undefined {
  return wanted.find((id) => !seen.has(id));
}
