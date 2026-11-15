import { describe, expect, it } from 'vitest';
import {
  launchHop,
  listBodies,
  parseChoiceLog,
  replay,
  score,
  startRun,
  type ChassisId,
  type Run,
  type Score,
} from '../sim/index.ts';
import { readBestScore, type ScoreStorage } from './bestScore.ts';
import { readDailyBest, recordDailyRun } from './dailyBest.ts';
import { dailySeed } from './dailyStarSystem.ts';

const TODAY = '2026-11-15';
const TOMORROW = '2026-11-16';
const BUILD = { version: '1.2.3', hash: 'abc1234' };

function memory(initial?: string): ScoreStorage & { value: string | undefined } {
  const store = {
    value: initial,
    getItem: () => store.value ?? null,
    setItem: (_key: string, value: string) => {
      store.value = value;
    },
  };
  return store;
}

const broken: ScoreStorage = {
  getItem: () => {
    throw new Error('storage blocked');
  },
  setItem: () => {
    throw new Error('storage blocked');
  },
};

/** A Daily Run on `day`'s seed that has flown `hops` Hops and escaped `escaped` Star Systems. */
function played(day: string, escaped: number, hops: number, chassis: ChassisId = 'scout'): Run {
  return {
    ...startRun(dailySeed(day), chassis),
    starSystemNumber: escaped + 1,
    hopsFlown: hops,
  };
}

describe('Daily Best', () => {
  it('is not played yet until a Daily Run has been recorded', () => {
    expect(readDailyBest(TODAY, memory())).toBeUndefined();
  });

  it('a better Score replaces today’s Daily Best, and fewer Hops breaks a tie', () => {
    const storage = memory();
    const first = recordDailyRun(TODAY, played(TODAY, 1, 8), BUILD, storage);
    expect(first.isNewBest).toBe(true);
    expect(first.best.score).toEqual({ starSystemsEscaped: 1, hopsFlown: 8 });

    const worse = recordDailyRun(TODAY, played(TODAY, 0, 2), BUILD, storage);
    expect(worse.isNewBest).toBe(false);
    expect(worse.best.score).toEqual({ starSystemsEscaped: 1, hopsFlown: 8 });

    const moreHops = recordDailyRun(TODAY, played(TODAY, 1, 9), BUILD, storage);
    expect(moreHops.isNewBest).toBe(false);
    const same = recordDailyRun(TODAY, played(TODAY, 1, 8), BUILD, storage);
    expect(same.isNewBest).toBe(false);

    const fewerHops = recordDailyRun(TODAY, played(TODAY, 1, 7), BUILD, storage);
    expect(fewerHops.isNewBest).toBe(true);
    expect(readDailyBest(TODAY, storage)?.score).toEqual({ starSystemsEscaped: 1, hopsFlown: 7 });

    const moreSystems = recordDailyRun(TODAY, played(TODAY, 2, 30), BUILD, storage);
    expect(moreSystems.isNewBest).toBe(true);
    expect(readDailyBest(TODAY, storage)?.score).toEqual({ starSystemsEscaped: 2, hopsFlown: 30 });
  });

  it('a Daily Best from another day reads as not played yet', () => {
    const storage = memory();
    recordDailyRun(TODAY, played(TODAY, 1, 4), BUILD, storage);
    expect(readDailyBest(TODAY, storage)).toBeDefined();
    expect(readDailyBest(TOMORROW, storage)).toBeUndefined();
  });

  it('the first finished Run of a new day replaces yesterday’s Daily Best, whatever its Score', () => {
    const storage = memory();
    recordDailyRun(TODAY, played(TODAY, 3, 10), BUILD, storage);
    const next = recordDailyRun(TOMORROW, played(TOMORROW, 0, 20), BUILD, storage);
    expect(next.isNewBest).toBe(true);
    expect(readDailyBest(TOMORROW, storage)?.score).toEqual({
      starSystemsEscaped: 0,
      hopsFlown: 20,
    });
    // Only one record is kept: yesterday's is gone.
    expect(readDailyBest(TODAY, storage)).toBeUndefined();
  });

  it('a Run that started yesterday and ends today does not replace today’s Daily Best', () => {
    const storage = memory();
    recordDailyRun(TOMORROW, played(TOMORROW, 1, 5), BUILD, storage);
    const late = recordDailyRun(TODAY, played(TODAY, 4, 5), BUILD, storage);
    expect(late.isNewBest).toBe(false);
    expect(readDailyBest(TOMORROW, storage)?.score).toEqual({
      starSystemsEscaped: 1,
      hopsFlown: 5,
    });
  });

  it('the Daily Best keeps the day, seed, Chassis, build, Score and choice log', () => {
    const storage = memory();
    const start = startRun(dailySeed(TODAY), 'hauler');
    const moon = listBodies(start.starSystem).find(
      (body) => body.id !== start.starSystem.homePlanetId,
    );
    if (!moon) throw new Error('no Body to Hop to');
    const hopped = launchHop(start, moon.id);
    if (hopped.kind !== 'flown') throw new Error('the Hop should fly');
    recordDailyRun(TODAY, hopped.run, BUILD, storage);

    const stored = readDailyBest(TODAY, storage);
    expect(stored).toBeDefined();
    expect(stored?.day).toBe(TODAY);
    expect(stored?.seed).toBe(dailySeed(TODAY));
    expect(stored?.chassisId).toBe('hauler');
    expect(stored?.build).toEqual(BUILD);
    expect(stored?.score).toEqual(score(hopped.run));
    // The log reads back and replays to the same Run: what a server would do to check the Score.
    const log = parseChoiceLog(stored?.choiceLog);
    expect(log).toEqual([{ kind: 'hop', target: moon.id }]);
    const replayed = replay(dailySeed(TODAY), 'hauler', log ?? []);
    expect(replayed.kind).toBe('replayed');
    if (replayed.kind === 'replayed') expect(replayed.score).toEqual(stored?.score);
  });

  it('a Daily Run also counts toward the Best Score', () => {
    // The Best Score is the caller's to record (see recordScore); the Daily Best never writes it.
    const storage = memory();
    recordDailyRun(TODAY, played(TODAY, 1, 4), BUILD, storage);
    expect(readBestScore(storage)).toBeUndefined();
  });

  it('a stored Daily Best that is not a valid record is ignored', () => {
    const good = (): Record<string, unknown> => {
      const storage = memory();
      recordDailyRun(TODAY, played(TODAY, 1, 4), BUILD, storage);
      return JSON.parse(storage.value ?? '') as Record<string, unknown>;
    };
    const junk: string[] = [
      '',
      'nope',
      '{}',
      '[]',
      'null',
      JSON.stringify({ ...good(), score: { starSystemsEscaped: -1, hopsFlown: 2 } }),
      JSON.stringify({ ...good(), seed: dailySeed(TODAY) + 1 }),
      JSON.stringify({ ...good(), chassisId: 'tractor' }),
      JSON.stringify({ ...good(), build: { version: 1 } }),
      JSON.stringify({ ...good(), choiceLog: { version: 99, choices: [] } }),
      JSON.stringify({ ...good(), choiceLog: { version: 1, choices: [{ kind: 'warp' }] } }),
      JSON.stringify({ ...good(), day: 'today' }),
    ];
    for (const raw of junk) expect(readDailyBest(TODAY, memory(raw))).toBeUndefined();
    // The good record itself is accepted, so the junk cases fail for their own reasons.
    expect(readDailyBest(TODAY, memory(JSON.stringify(good())))).toBeDefined();
  });

  it('a junk record is replaced by the first finished Run', () => {
    const storage = memory('garbage');
    const result = recordDailyRun(TODAY, played(TODAY, 0, 3), BUILD, storage);
    expect(result.isNewBest).toBe(true);
    expect(readDailyBest(TODAY, storage)?.score).toEqual({ starSystemsEscaped: 0, hopsFlown: 3 });
  });

  it('the Daily Star System works when storage is unavailable', () => {
    expect(readDailyBest(TODAY, broken)).toBeUndefined();
    expect(readDailyBest(TODAY, null)).toBeUndefined();
    const run = played(TODAY, 1, 4);
    const expected: Score = { starSystemsEscaped: 1, hopsFlown: 4 };
    for (const storage of [broken, null]) {
      const result = recordDailyRun(TODAY, run, BUILD, storage);
      expect(result.isNewBest).toBe(true);
      expect(result.best.score).toEqual(expected);
    }
  });
});
