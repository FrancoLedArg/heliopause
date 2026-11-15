import type { Seed } from '../sim/index.ts';
import { stringSeed } from './stringSeed.ts';

/** The clock the Daily Star System reads: milliseconds since the epoch, like `Date.now`. */
export type Clock = () => number;

/** Fixed text in front of the date, so the Daily seed is its own stream and not a hash of a bare date. */
const DAILY_SEED_PREFIX = 'heliopause-daily:';

/** The UTC calendar date of the clock's instant, `YYYY-MM-DD`: the day the Daily Star System is for. */
export function utcDay(now: Clock): string {
  return new Date(now()).toISOString().slice(0, 10);
}

/** The seed of the Daily Star System for `day` (a `utcDay`): the same on every device. */
export function dailySeed(day: string): Seed {
  return stringSeed(`${DAILY_SEED_PREFIX}${day}`);
}
