import { describe, expect, it } from 'vitest';
import {
  launchHop,
  listBodies,
  startRun,
  type ChassisId,
  type HopFlight,
  type HopOutcome,
  type Run,
} from '../game/sim/index.ts';
import { describeReport } from './hopReportView.ts';

/** The first Hop of a seeded Run that ends `kind`: Launch settles the outcome, so a seed can be searched. */
function hopThatEnds(
  kind: HopOutcome['kind'],
  seed: number,
  chassis: ChassisId,
): { run: Run; flight: HopFlight } {
  const run = startRun(seed, chassis);
  for (const body of listBodies(run.starSystem)) {
    const launched = launchHop(run, body.id);
    if (launched.kind === 'flown' && launched.flight.outcome.kind === kind) {
      return { run, flight: launched.flight };
    }
  }
  throw new Error(`Seed ${String(seed)} has no ${kind} Hop for the ${chassis}`);
}

describe('the Hop report', () => {
  it('names an Arrived Hop in words, lists each Burn estimate against actual, and the Margin left', () => {
    const { run, flight } = hopThatEnds('arrived', 123, 'scout');
    const view = describeReport(run, flight);
    expect(view.title).toBe('Arrived');
    expect(view.rows.map((row) => row.label)).toEqual(['Takeoff', 'Transfer', 'Landing']);
    for (const row of view.rows) {
      expect(row.estimate).toMatch(/m\/s|km\/s/);
      expect(row.actual).toMatch(/m\/s|km\/s/);
      expect(row.change).toMatch(/^[+−±]\d+%$/);
    }
    expect(view.margin).toMatch(/^Margin left: .*(m\/s|km\/s)/);
    expect(view.why).toBe(flight.why);
  });

  it('says during which Burn the Fuel ran out when a Hop Fell Short, and that the later Burns never flew', () => {
    const { run, flight } = hopThatEnds('fell-short', 123, 'hauler');
    const view = describeReport(run, flight);
    expect(view.title).toBe('Fell Short');
    expect(view.headline).toMatch(/Fuel ran out during the Transfer/);
    const ranOut = view.rows.find((row) => row.change === 'ran out');
    expect(ranOut?.label).toBe('Transfer');
    expect(ranOut?.actual).toMatch(/^[\d.,]+ of [\d.,]+ (m|km)\/s$/);
    expect(view.rows.at(-1)?.change).toBe('not flown');
    expect(view.margin).toMatch(/^Margin: none left \(planned −[\d,]+ m\/s, \d+%\)$/);
    expect(view.why).toBe(flight.why);
  });

  it('gives the same Margin share in the report as in the why text: a hauler on seed 123', () => {
    const run = startRun(123, 'hauler');
    const viormio = listBodies(run.starSystem).find((body) => body.name === 'Viormio');
    if (!viormio) throw new Error('seed 123 has no Viormio');
    const launched = launchHop(run, viormio.id);
    if (launched.kind !== 'flown') throw new Error('expected a flight');
    const view = describeReport(run, launched.flight);
    expect(view.margin).toBe('Margin: none left (planned −1,336 m/s, 6%)');
    expect(view.why).toMatch(/The Fuel gives 6% less Δv/);
  });

  it('says a Crashed Hop completed the Transfer but ran out of Δv in the Landing', () => {
    const { run, flight } = hopThatEnds('crashed', 123, 'scout');
    const view = describeReport(run, flight);
    expect(view.title).toBe('Crashed');
    expect(view.headline).toMatch(/Transfer succeeded.*Landing/);
    expect(view.rows.map((row) => row.change).slice(0, 2)).toEqual([
      expect.stringMatching(/%$/),
      expect.stringMatching(/%$/),
    ]);
    expect(view.rows[2]?.change).toBe('ran out');
    expect(view.why).toBe(flight.why);
  });
});
