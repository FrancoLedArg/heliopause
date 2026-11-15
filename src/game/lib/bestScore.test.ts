import { describe, expect, it } from 'vitest';
import { readBestScore, recordScore, type ScoreStorage } from './bestScore.ts';

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

describe('Best Score', () => {
  it('is none until a Run has been recorded', () => {
    expect(readBestScore(memory())).toBeUndefined();
  });

  it('the first Score recorded is the Best Score, and a new one', () => {
    const storage = memory();
    const first = { starSystemsEscaped: 0, hopsFlown: 3 };
    expect(recordScore(first, storage)).toEqual({ best: first, isNewBest: true });
    expect(readBestScore(storage)).toEqual(first);
  });

  it('a better Score replaces the Best Score', () => {
    const storage = memory();
    const good = { starSystemsEscaped: 2, hopsFlown: 5 };
    recordScore(good, storage);
    expect(recordScore({ starSystemsEscaped: 1, hopsFlown: 30 }, storage)).toEqual({
      best: good,
      isNewBest: false,
    });
    expect(recordScore({ starSystemsEscaped: 2, hopsFlown: 6 }, storage).isNewBest).toBe(false);
    expect(recordScore({ ...good }, storage).isNewBest).toBe(false);
    expect(readBestScore(storage)).toEqual(good);
    const better = { starSystemsEscaped: 2, hopsFlown: 4 };
    expect(recordScore(better, storage)).toEqual({ best: better, isNewBest: true });
    expect(readBestScore(storage)).toEqual(better);
  });

  it('ignores a stored value that is not a Score', () => {
    for (const junk of ['', 'nope', '{}', '{"starSystemsEscaped":-1,"hopsFlown":2}', '[1,2]']) {
      expect(readBestScore(memory(junk))).toBeUndefined();
    }
  });

  it('works with storage unavailable: nothing is read, nothing throws, the Score still counts', () => {
    expect(readBestScore(broken)).toBeUndefined();
    const score = { starSystemsEscaped: 1, hopsFlown: 4 };
    expect(recordScore(score, broken)).toEqual({ best: score, isNewBest: true });
  });

  it('works when the browser has no storage at all', () => {
    expect(readBestScore(null)).toBeUndefined();
    const score = { starSystemsEscaped: 0, hopsFlown: 1 };
    expect(recordScore(score, null).best).toEqual(score);
  });
});
