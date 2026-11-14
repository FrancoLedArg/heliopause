import { describe, expect, it } from 'vitest';
import {
  kilograms,
  collectYield,
  install,
  materials,
  launchHop,
  listBodies,
  homePlanet,
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

  describe('what landing collected', () => {
    const run = startRun(2026, 'scout');
    const moon = homePlanet(run.starSystem).moons[0];
    if (!moon) throw new Error('The Home Planet has a Moon');
    const flown = (from: Run) => {
      const launched = launchHop(from, moon.id);
      if (launched.kind !== 'flown') throw new Error('expected a flight');
      return launched;
    };

    it('says how much Fuel an Icy Body gave and explains ice-to-propellant the first time', () => {
      const view = describeReport(run, flown(run).flight);
      expect(view.collected).toMatch(/^Collected [\d.]+ t of Fuel\.$/);
      expect(view.note).toBe(
        'Real missions plan to split lunar water ice into hydrogen and oxygen, so rockets could refuel on the Moon.',
      );
    });

    it('does not repeat the explanation once Fuel has been collected in the Run', () => {
      // Another Icy Body already gave its Fuel in this Run.
      const elsewhere = listBodies(run.starSystem).find(
        (body) => body.landable && body.composition === 'icy' && body.id !== moon.id,
      );
      if (!elsewhere) throw new Error('seed 2026 has a second Icy Body');
      const second = { ...run, depleted: [elsewhere.id] };
      const view = describeReport(second, flown(second).flight);
      expect(view.collected).toMatch(/of Fuel/);
      expect(view.note).toBeUndefined();
    });

    it('says how much Fuel was left behind when the Tank is full', () => {
      // The Hop itself burns Fuel, so a full Tank is arranged by the landing's report.
      const { flight } = flown(run);
      const full = {
        ...flight,
        collection: {
          kind: 'fuel' as const,
          collected: kilograms(2_000),
          leftBehind: kilograms(5_700),
        },
      };
      const view = describeReport(run, full);
      expect(view.collected).toMatch(
        /^Collected [\d.]+ t of Fuel; [\d.]+ t left behind: the Tank is full\.$/,
      );
    });

    it('says how many Materials a Rocky Body gave', () => {
      const away = { ...run, status: { kind: 'landed', bodyId: moon.id } as const };
      const launched = launchHop(away, run.starSystem.homePlanetId);
      if (launched.kind !== 'flown') throw new Error('expected a flight');
      const view = describeReport(away, launched.flight);
      expect(view.collected).toMatch(/^Collected \d+ Materials\.$/);
      expect(view.note).toBeUndefined();
    });

    it('names the Drill inside the Collected line, and nowhere else', () => {
      const installed = install(run, 2, 'drill-1');
      if (installed.kind !== 'installed') throw new Error('expected an install');
      const view = describeReport(installed.run, flown(installed.run).flight);
      expect(view.collected).toMatch(/^Collected [\d.]+ t of Fuel \(Drill ×1\.5\)\.$/);
      expect(view.headline).not.toMatch(/Drill/);
      expect(view.note).not.toMatch(/Drill/);
    });

    it('does not credit the Drill when nothing was collected', () => {
      const installed = install(run, 2, 'drill-1');
      if (installed.kind !== 'installed') throw new Error('expected an install');
      const { flight } = flown(installed.run);
      const full = {
        ...flight,
        collection: {
          kind: 'fuel' as const,
          collected: kilograms(0),
          leftBehind: kilograms(7_000),
        },
      };
      expect(describeReport(installed.run, full).collected).not.toMatch(/Drill/);
    });

    it('names the Drill on a Rocky yield too', () => {
      const installed = install({ ...run, materials: materials(100) }, 2, 'drill-2');
      if (installed.kind !== 'installed') throw new Error('expected an install');
      const away = { ...installed.run, status: { kind: 'landed', bodyId: moon.id } as const };
      const launched = launchHop(away, run.starSystem.homePlanetId);
      if (launched.kind !== 'flown') throw new Error('expected a flight');
      expect(describeReport(away, launched.flight).collected).toMatch(
        /^Collected \d+ Materials \(Drill ×2\)\.$/,
      );
    });

    it('says a Depleted Body had nothing left', () => {
      const visited = { ...collectYield(run, moon.id).run, status: run.status };
      const view = describeReport(visited, flown(visited).flight);
      expect(view.collected).toBe('Nothing to collect: this Body is Depleted.');
    });

    it('says nothing was collected after a failed Hop', () => {
      const { run: failedRun, flight } = hopThatEnds('fell-short', 123, 'hauler');
      expect(describeReport(failedRun, flight).collected).toBeUndefined();
    });
  });
});
