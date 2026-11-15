import { describe, expect, it } from 'vitest';
import { isBetterScore, runEnd, score, startRun, type Run } from './index.ts';

function inSystem(run: Run, starSystemNumber: number, hopsFlown: number): Run {
  return { ...run, starSystemNumber, hopsFlown };
}

describe('Score', () => {
  it('counts Star Systems escaped as the Systems before the one the Run is in', () => {
    const run = startRun(5, 'scout');
    expect(score(inSystem(run, 1, 0)).starSystemsEscaped).toBe(0);
    expect(score(inSystem(run, 3, 0)).starSystemsEscaped).toBe(2);
  });

  it('counts the Hops the Run has flown', () => {
    expect(score(inSystem(startRun(5, 'scout'), 1, 7)).hopsFlown).toBe(7);
  });

  it('a Score with more Star Systems escaped is better, however many Hops it took', () => {
    const more = { starSystemsEscaped: 2, hopsFlown: 2 };
    const fewer = { starSystemsEscaped: 1, hopsFlown: 40 };
    expect(isBetterScore(more, fewer)).toBe(true);
    expect(isBetterScore(fewer, more)).toBe(false);
  });

  it('fewer Hops breaks a tie in Star Systems escaped', () => {
    const more = { starSystemsEscaped: 1, hopsFlown: 9 };
    const fewer = { starSystemsEscaped: 1, hopsFlown: 4 };
    expect(isBetterScore(fewer, more)).toBe(true);
    expect(isBetterScore(more, fewer)).toBe(false);
  });

  it('an equal Score is not better', () => {
    const same = { starSystemsEscaped: 1, hopsFlown: 4 };
    expect(isBetterScore(same, { ...same })).toBe(false);
  });
});

describe('how a Run ended', () => {
  it('a Run that is still landed has not ended', () => {
    expect(runEnd(startRun(5, 'scout'))).toBeUndefined();
  });

  it('a Run that ended reports how, with its reason', () => {
    const run = startRun(5, 'scout');
    const stranded: Run = {
      ...run,
      status: { kind: 'ended', end: { kind: 'stranded', reason: 'No Hop is possible.' } },
    };
    expect(runEnd(stranded)).toEqual({ kind: 'stranded', reason: 'No Hop is possible.' });
  });
});
