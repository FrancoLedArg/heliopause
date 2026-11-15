import { describe, expect, it } from 'vitest';
import { startRun } from '../game/sim/index.ts';
import { describeEndOfRun, formatScore } from './endOfRunView.ts';

const none = { starSystemsEscaped: 0, hopsFlown: 0 };

describe('the End-of-Run screen text', () => {
  it('formats a Score with its units, singular for one', () => {
    expect(formatScore({ starSystemsEscaped: 2, hopsFlown: 5 })).toBe(
      '2 Star Systems escaped, 5 Hops flown',
    );
    expect(formatScore({ starSystemsEscaped: 1, hopsFlown: 1 })).toBe(
      '1 Star System escaped, 1 Hop flown',
    );
  });

  it('names each way a Run ends, in words, with its reason', () => {
    const score = { starSystemsEscaped: 0, hopsFlown: 3 };
    const ends = [
      { kind: 'fell-short', reason: 'Fuel ran out during the Transfer.', title: 'Fell Short' },
      { kind: 'crashed', reason: 'Not enough Δv for the Landing.', title: 'Crashed' },
      {
        kind: 'stranded',
        reason: 'Even the lightest Spacecraft has no Hop.',
        bodyId: startRun(5, 'scout').starSystem.homePlanetId,
        title: 'Stranded',
      },
    ] as const;
    for (const { title, ...end } of ends) {
      const view = describeEndOfRun(end, score, score, false);
      expect(view.title).toBe(title);
      expect(view.reason).toBe(end.reason);
      expect(view.summary.length).toBeGreaterThan(0);
    }
  });

  it('shows the Score and the Best Score', () => {
    const view = describeEndOfRun(
      { kind: 'crashed', reason: 'x' },
      { starSystemsEscaped: 1, hopsFlown: 4 },
      { starSystemsEscaped: 2, hopsFlown: 9 },
      false,
    );
    expect(view.score).toBe('1 Star System escaped, 4 Hops flown');
    expect(view.best).toBe('2 Star Systems escaped, 9 Hops flown');
    expect(view.newBest).toBe(false);
  });

  it('says so, in words, when the Run set the Best Score', () => {
    expect(describeEndOfRun({ kind: 'crashed', reason: 'x' }, none, none, true).newBest).toBe(true);
  });
});
