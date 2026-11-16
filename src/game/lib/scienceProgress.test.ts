import { describe, expect, it } from 'vitest';
import type { ScoreStorage } from './bestScore.ts';
import { readScienceProgress, recordDiscoveries } from './scienceProgress.ts';

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

const EMPTY = { lifetimeScience: 0, discoveries: {} };

describe('Science progress', () => {
  it('is empty until a Discovery has been recorded', () => {
    expect(readScienceProgress(memory())).toEqual(EMPTY);
  });

  it('adds up over Discoveries and Runs, keeping when each was first made', () => {
    const storage = memory();
    recordDiscoveries(10, ['river-delta'], 1_000, storage);
    const later = recordDiscoveries(35, ['river-delta', 'water-salt'], 2_000, storage);
    const expected = {
      lifetimeScience: 45,
      discoveries: { 'river-delta': 1_000, 'water-salt': 2_000 },
    };
    expect(later).toEqual(expected);
    expect(readScienceProgress(storage)).toEqual(expected);
  });

  it('ignores junk: bad totals read as none, unknown or bad Discoveries are dropped', () => {
    for (const junk of ['', 'nope', '[1]', '{"lifetimeScience":-5}', '{"lifetimeScience":2.5}']) {
      expect(readScienceProgress(memory(junk))).toEqual(EMPTY);
    }
    const mixed = JSON.stringify({
      lifetimeScience: 60,
      discoveries: { 'river-delta': 5, 'made-up': 1, 'giant-storm': -1, 'ice-geysers': 'x' },
    });
    expect(readScienceProgress(memory(mixed))).toEqual({
      lifetimeScience: 60,
      discoveries: { 'river-delta': 5 },
    });
  });

  it('with storage unavailable, nothing is read, nothing throws, and recording still returns progress', () => {
    expect(readScienceProgress(broken)).toEqual(EMPTY);
    expect(readScienceProgress(null)).toEqual(EMPTY);
    const kept = recordDiscoveries(10, ['six-sided-storm'], 7, broken);
    expect(kept.lifetimeScience).toBeGreaterThanOrEqual(10);
    expect(kept.discoveries['six-sided-storm']).toBeDefined();
  });
});
