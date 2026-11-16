import { describe, expect, it } from 'vitest';
import {
  arrivalDayFraction,
  flightHours,
  isHarshArrival,
  temperatureBand,
  localDayFraction,
  ROTATION_RANGES_HOURS,
  rotationPeriodHours,
  skyDay,
  timeOfDayWords,
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

describe('the local time on arrival (#334)', () => {
  const system = generateStarSystem(42, 1);
  const body = listBodies(system).find((b) => b.landable) ?? listBodies(system)[0];
  if (!body) throw new Error('A Star System has Bodies');

  it('is the target clock at the game clock plus the flight time', () => {
    expect(arrivalDayFraction(system, body, 100, 1.5)).toBe(
      localDayFraction(system, body, 100 + flightHours(1.5)),
    );
  });

  it('is the same for the same inputs', () => {
    expect(arrivalDayFraction(system, body, 7, 0.4)).toBe(arrivalDayFraction(system, body, 7, 0.4));
  });

  it('a longer Transfer can turn a day arrival into a night one', () => {
    const seen = new Set<boolean>();
    for (let au = 0; au < 5; au += 0.05) {
      seen.add(timeOfDayWords(arrivalDayFraction(system, body, 0, au)) === 'night');
    }
    expect(seen.size).toBe(2);
  });
});

describe('temperature bands and the Harsh Arrival (#335)', () => {
  const at = (distanceFromStar: number) =>
    temperatureBand({ distanceFromStar } as unknown as Parameters<typeof temperatureBand>[0]);

  it('is Scorching inside 0.7 AU, Freezing beyond the 2.7 AU ice line, Mild between', () => {
    expect(at(0.4)).toBe('scorching');
    expect(at(0.7)).toBe('mild');
    expect(at(1)).toBe('mild');
    expect(at(2.7)).toBe('mild');
    expect(at(3.5)).toBe('freezing');
  });

  it('is harsh only for a Freezing night or a Scorching day', () => {
    expect(isHarshArrival('freezing', false)).toBe(true);
    expect(isHarshArrival('scorching', true)).toBe(true);
    expect(isHarshArrival('freezing', true)).toBe(false);
    expect(isHarshArrival('scorching', false)).toBe(false);
    expect(isHarshArrival('mild', true)).toBe(false);
    expect(isHarshArrival('mild', false)).toBe(false);
  });
});
