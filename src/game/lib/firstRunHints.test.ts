import { describe, expect, it } from 'vitest';
import {
  HINT_IDS,
  HINT_MAX_LENGTH,
  HINT_TEXT,
  markHintSeen,
  nextHint,
  readSeenHints,
} from './firstRunHints.ts';
import type { ScoreStorage } from './bestScore.ts';

function memoryStorage(initial?: string): ScoreStorage {
  let stored = initial ?? null;
  return {
    getItem: () => stored,
    setItem: (_key, value) => {
      stored = value;
    },
  };
}

describe('first-run hints', () => {
  it('shows a hint once and never again after it is dismissed', () => {
    const storage = memoryStorage();
    expect(nextHint(['first-landing'], readSeenHints(storage))).toBe('first-landing');
    markHintSeen('first-landing', storage);
    expect(nextHint(['first-landing'], readSeenHints(storage))).toBeUndefined();
  });

  it('offers the first unseen hint when several apply', () => {
    const storage = memoryStorage();
    markHintSeen('first-landing', storage);
    expect(nextHint(['first-landing', 'first-build'], readSeenHints(storage))).toBe('first-build');
  });

  it('remembers what was seen across reads, one hint at a time', () => {
    const storage = memoryStorage();
    markHintSeen('first-landing', storage);
    markHintSeen('first-build', storage);
    expect([...readSeenHints(storage)].sort()).toEqual(['first-build', 'first-landing']);
  });

  it('treats unreadable, garbled or blocked storage as nothing seen', () => {
    expect(readSeenHints(memoryStorage('not json')).size).toBe(0);
    expect(readSeenHints(memoryStorage('{"a":1}')).size).toBe(0);
    expect(readSeenHints(null).size).toBe(0);
    const throwing: ScoreStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSeenHints(throwing).size).toBe(0);
    expect(() => {
      markHintSeen('first-landing', throwing);
    }).not.toThrow();
  });

  it('keeps every hint to one short line', () => {
    for (const id of HINT_IDS) expect(HINT_TEXT[id].length).toBeLessThanOrEqual(HINT_MAX_LENGTH);
  });
});
