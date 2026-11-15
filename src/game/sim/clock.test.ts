import { describe, expect, it } from 'vitest';
import {
  flightHours,
  localDayFraction,
  ROTATION_RANGES_HOURS,
  rotationPeriodHours,
  skyDay,
} from './clock.ts';
import { generateStarSystem } from './generation.ts';
import { launchHop } from './hop.ts';
import { knownBodies } from './knowledge.ts';
import { replay } from './replay.ts';
import { currentBody, startRun } from './run.ts';
import { listBodies } from './starSystem.ts';

const SEEDS = [1, 7, 42, 1234, 99999];

describe('rotation periods', () => {
  it('every Body has one inside the sourced range for what it is', () => {
    for (const seed of SEEDS) {
      const system = generateStarSystem(seed, 1);
      for (const body of listBodies(system)) {
        const range = ROTATION_RANGES_HOURS[body.landable ? body.composition : 'gas-giant'];
        const hours = rotationPeriodHours(system, body);
        expect(hours).toBeGreaterThanOrEqual(range.min);
        expect(hours).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it('the ranges are the research document figures', () => {
    expect(ROTATION_RANGES_HOURS.icy).toEqual({ min: 9, max: 85.2 });
    expect(ROTATION_RANGES_HOURS.rocky).toEqual({ min: 24.66, max: 4222.6 });
  });

  it('are settled by the seed', () => {
    const a = generateStarSystem(42, 1);
    const b = generateStarSystem(42, 1);
    for (const body of listBodies(a)) {
      expect(rotationPeriodHours(a, body)).toBe(rotationPeriodHours(b, body));
    }
  });
});

describe('generation', () => {
  it('is unchanged by the clock: asking for periods draws nothing from the generator', () => {
    const before = JSON.stringify(generateStarSystem(42, 1));
    const system = generateStarSystem(42, 1);
    for (const body of listBodies(system)) rotationPeriodHours(system, body);
    expect(JSON.stringify(generateStarSystem(42, 1))).toBe(before);
    expect(JSON.stringify(system)).toBe(before);
    expect(before).not.toContain('rotation');
  });
});

describe('game time', () => {
  it('a new Run starts at time zero', () => {
    expect(startRun(42, 'scout').gameHours).toBe(0);
  });

  it('a Hop to a known Body advances it by its flight time', () => {
    const run = startRun(42, 'scout');
    const from = currentBody(run);
    const target = knownBodies(run).find((body) => body.landable && body.id !== from.id);
    if (!target) throw new Error('no known Body to fly to');
    const launched = launchHop(run, target.id);
    if (launched.kind !== 'flown') throw new Error('Hop not flown');
    expect(launched.run.gameHours).toBeGreaterThanOrEqual(12);
    expect(launched.run.gameHours).toBeGreaterThan(run.gameHours);
  });

  it('a farther Hop takes longer', () => {
    expect(flightHours(2)).toBeGreaterThan(flightHours(1));
    expect(flightHours(0)).toBe(12);
  });

  it('replaying the choices gives the same time', () => {
    const run = startRun(42, 'scout');
    const target = knownBodies(run).find(
      (body) => body.landable && body.id !== currentBody(run).id,
    );
    if (!target) throw new Error('no known Body to fly to');
    const launched = launchHop(run, target.id);
    if (launched.kind !== 'flown') throw new Error('Hop not flown');
    const again = replay(42, 'scout', launched.run.choices);
    expect(again.kind).toBe('replayed');
    if (again.kind === 'replayed') expect(again.run.gameHours).toBe(launched.run.gameHours);
  });
});

describe('local time of day', () => {
  it('is a fraction of the day and turns once per rotation period', () => {
    const system = generateStarSystem(42, 1);
    const body = listBodies(system).find((b) => b.landable);
    if (!body) throw new Error('no landable Body');
    const period = rotationPeriodHours(system, body);
    const at = localDayFraction(system, body, 5);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(1);
    expect(localDayFraction(system, body, 5 + period)).toBeCloseTo(at, 6);
  });
});

describe('the sky light', () => {
  it('is dark at midnight and bright at noon', () => {
    expect(skyDay(0).daylight).toBeCloseTo(0, 6);
    expect(skyDay(0.5).daylight).toBeCloseTo(1, 6);
    expect(skyDay(0.25).daylight).toBeCloseTo(0.5, 6);
  });
});
