import {
  CHASSIS_IDS,
  isBetterScore,
  parseChoiceLog,
  score,
  storedChoiceLog,
  type ChassisId,
  type Run,
  type Score,
  type Seed,
  type StoredChoiceLog,
} from '../sim/index.ts';
import { browserStorage, isScore, type ScoreStorage } from './bestScore.ts';
import type { BuildInfo } from './buildLabel.ts';
import { dailySeed } from './dailyStarSystem.ts';

const KEY = 'heliopause:daily-best';

/**
 * The best Score reached on one day's Daily Star System on this device, kept as a record a server
 * could replay: the seed and Chassis with the choice log rebuild the Run, and the build says which
 * rules it was played under.
 */
export interface DailyBest {
  /** The UTC day, `YYYY-MM-DD`. */
  readonly day: string;
  readonly seed: Seed;
  readonly chassisId: ChassisId;
  readonly build: BuildInfo;
  readonly score: Score;
  readonly choiceLog: StoredChoiceLog;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A stored value read back as a Daily Best, or `undefined` when it is not one. Nothing here replays
 * the log: the record may come from an earlier build whose rules played it differently, and on this
 * device the Daily Best is compared regardless (the leaderboard's server replays and decides). The
 * seed is checked against the day, since a Daily Star System's seed comes from its day alone.
 */
function parseDailyBest(value: unknown): DailyBest | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const {
    day,
    seed,
    chassisId,
    build,
    score: recorded,
    choiceLog,
  } = value as Record<string, unknown>;
  if (typeof day !== 'string' || !DAY.test(day) || seed !== dailySeed(day)) return undefined;
  const chassis = CHASSIS_IDS.find((known) => known === chassisId);
  if (!chassis || !isScore(recorded) || !isBuild(build)) return undefined;
  const log = parseChoiceLog(choiceLog);
  if (!log) return undefined;
  return { day, seed, chassisId: chassis, build, score: recorded, choiceLog: storedChoiceLog(log) };
}

function isBuild(value: unknown): value is BuildInfo {
  if (typeof value !== 'object' || value === null) return false;
  const { version, hash } = value as Record<string, unknown>;
  return typeof version === 'string' && typeof hash === 'string';
}

/** The record held in `storage`, whatever day it is for; `undefined` when none, junk, or unreadable. */
function readStored(storage: ScoreStorage | null): DailyBest | undefined {
  try {
    const raw = storage?.getItem(KEY);
    if (raw === null || raw === undefined) return undefined;
    return parseDailyBest(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/** The Daily Best for `day` on this device; `undefined` is "not played yet" (none, another day's, junk, or no storage). */
export function readDailyBest(
  day: string,
  storage: ScoreStorage | null = browserStorage(),
): DailyBest | undefined {
  const stored = readStored(storage);
  return stored?.day === day ? stored : undefined;
}

/**
 * Records a finished Daily Run, which counts for `day`, the day it started. It becomes the Daily
 * Best when none is kept for that day yet (the first finished Run of a new day replaces the old
 * day's, whatever its Score) or when its Score is better. A Run from an earlier day than the kept
 * record never replaces it. Storage that cannot be written is ignored: the game plays without it.
 */
export function recordDailyRun(
  day: string,
  run: Run,
  build: BuildInfo,
  storage: ScoreStorage | null = browserStorage(),
): { readonly best: DailyBest; readonly isNewBest: boolean } {
  const candidate: DailyBest = {
    day,
    seed: run.seed,
    chassisId: run.spacecraft.chassisId,
    build,
    score: score(run),
    choiceLog: storedChoiceLog(run.choices),
  };
  const kept = readStored(storage);
  if (kept !== undefined) {
    const keptIsLater = kept.day > day;
    if (keptIsLater || (kept.day === day && !isBetterScore(candidate.score, kept.score))) {
      return { best: kept, isNewBest: false };
    }
  }
  try {
    storage?.setItem(KEY, JSON.stringify(candidate));
  } catch {
    // Without storage the Daily Best is not kept: the game plays on without it.
  }
  return { best: candidate, isNewBest: true };
}
