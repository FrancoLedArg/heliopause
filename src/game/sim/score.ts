import type { Run, RunEnd } from './run.ts';

/** A Run's Score: Star Systems escaped first, and with those equal, fewer Hops flown is better. */
export interface Score {
  readonly starSystemsEscaped: number;
  readonly hopsFlown: number;
}

/**
 * The Run's Score so far. A Run in Star System n has escaped the n - 1 before it (the Jump, #157,
 * is what moves a Run to the next one).
 */
export function score(run: Run): Score {
  return { starSystemsEscaped: run.starSystemNumber - 1, hopsFlown: run.hopsFlown };
}

/** Whether `a` beats `b`: more Star Systems escaped, then fewer Hops flown. Equal Scores beat nothing. */
export function isBetterScore(a: Score, b: Score): boolean {
  if (a.starSystemsEscaped !== b.starSystemsEscaped) {
    return a.starSystemsEscaped > b.starSystemsEscaped;
  }
  return a.hopsFlown < b.hopsFlown;
}

/** How the Run ended; `undefined` while it is still being played. */
export function runEnd(run: Run): RunEnd | undefined {
  return run.status.kind === 'ended' ? run.status.end : undefined;
}
