import { isBetterScore, type Score } from '../sim/index.ts';

/** The part of `Storage` the Best Score needs, so tests can stand in for the browser's. */
export interface ScoreStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'heliopause:best-score';

/**
 * The browser's `localStorage`; `null` where reaching it throws (blocked or disabled storage). Callers
 * may also pass `null` to mean "no storage".
 */
export function browserStorage(): ScoreStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isScore(value: unknown): value is Score {
  if (typeof value !== 'object' || value === null) return false;
  const { starSystemsEscaped: escaped, hopsFlown: hops } = value as Record<string, unknown>;
  return (
    typeof escaped === 'number' &&
    typeof hops === 'number' &&
    Number.isInteger(escaped) &&
    Number.isInteger(hops) &&
    escaped >= 0 &&
    hops >= 0
  );
}

/** The best Score remembered on this device; `undefined` when none, or when storage cannot be read. */
export function readBestScore(storage: ScoreStorage | null = browserStorage()): Score | undefined {
  try {
    const raw = storage?.getItem(KEY);
    if (raw === null || raw === undefined) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isScore(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Records a finished Run's Score: it becomes the Best Score only when better than the one remembered.
 * Storage that cannot be written is ignored: the game plays without it.
 */
export function recordScore(
  score: Score,
  storage: ScoreStorage | null = browserStorage(),
): { readonly best: Score; readonly isNewBest: boolean } {
  const previous = readBestScore(storage);
  if (previous !== undefined && !isBetterScore(score, previous)) {
    return { best: previous, isNewBest: false };
  }
  try {
    storage?.setItem(KEY, JSON.stringify(score));
  } catch {
    // Without storage the Best Score lasts only as long as the page.
  }
  return { best: score, isNewBest: true };
}
