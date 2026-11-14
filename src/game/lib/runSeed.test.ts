import { describe, expect, it } from 'vitest';
import { chooseRunSeed } from './runSeed.ts';

const neverRandom = (): number => {
  throw new Error('a seed from the URL must not draw a random one');
};

describe('chooseRunSeed', () => {
  it('uses the seed given in the page URL', () => {
    expect(chooseRunSeed('?seed=123', neverRandom)).toBe(123);
  });

  it('finds the seed among other URL parameters', () => {
    expect(chooseRunSeed('?debug=1&seed=4000000000', neverRandom)).toBe(4_000_000_000);
  });

  it('picks a random seed when the URL has none', () => {
    expect(chooseRunSeed('', () => 0.5)).toBe(2_147_483_648);
  });

  it.each(['?seed=abc', '?seed=', '?seed=-1', '?seed=1.5', '?seed=4294967296', '?seed=1e3'])(
    'ignores an unusable seed (%s) and picks a random one',
    (search) => {
      expect(chooseRunSeed(search, () => 0)).toBe(0);
    },
  );

  describe('after a Run that already used a seed', () => {
    it('moves a URL seed on, so New Run makes a different Star System yet stays replayable', () => {
      expect(chooseRunSeed('?seed=123', neverRandom, 123)).toBe(124);
    });

    it('wraps at the top of the seed range', () => {
      expect(chooseRunSeed('?seed=4294967295', neverRandom, 4_294_967_295)).toBe(0);
    });

    it('still draws a random seed when the URL has none', () => {
      expect(chooseRunSeed('', () => 0.5, 123)).toBe(2_147_483_648);
    });
  });
});
