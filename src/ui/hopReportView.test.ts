import { describe, expect, it } from 'vitest';
import {
  kilograms,
  collectYield,
  install,
  materials,
  launchHop,
  listBodies,
  planHop,
  HELIOPAUSE,
  startRun,
  type ChassisId,
  type HopFlight,
  type HopOutcome,
  type Run,
} from '../game/sim/index.ts';
import { describeReport } from './hopReportView.ts';

/**
 * A New Run on `chassis` with only `share` of its Fuel left, stood on its innermost planet knowing
 * every Body (where Runs opened before #96), so any Hop can be reported.
 */
function withFuelShare(seed: number, chassis: ChassisId, share: number): Run {
  const run = startRun(seed, chassis);
  const ids = listBodies(run.starSystem).map((body) => body.id);
  const inner = run.starSystem.planets[0];
  if (!inner) throw new Error('A Star System has planets');
  const fuelMass = kilograms(run.spacecraft.fuelMass * share);
  return {
    ...run,
    status: { kind: 'landed', bodyId: inner.id },
    knowledge: { detected: ids, surveyed: ids, heliopauseFound: true },
    spacecraft: { ...run.spacecraft, fuelMass },
  };
}

/**
 * The first Hop of a seeded Run, with `share` of its Fuel, that ends `kind`: Launch settles the
 * outcome, so a seed can be searched.
 */
function hopThatEnds(
  kind: HopOutcome['kind'],
  seed: number,
  chassis: ChassisId,
  share = 1,
): { run: Run; flight: HopFlight } {
  const run = withFuelShare(seed, chassis, share);
  for (const body of listBodies(run.starSystem)) {
    const launched = launchHop(run, body.id);
    if (launched.kind === 'flown' && launched.flight.outcome.kind === kind) {
      return { run, flight: launched.flight };
    }
  }
  throw new Error(`Seed ${String(seed)} has no ${kind} Hop for the ${chassis}`);
}

/** A Hop to the Heliopause that ends `kind`, flown by a lancer carrying a Jump Drive. */
function heliopauseHopThatEnds(
  kind: HopOutcome['kind'],
  fuelShare: number,
): { run: Run; flight: HopFlight } {
  for (let seed = 1; seed < 200; seed++) {
    const start = startRun(seed, 'lancer');
    const built = install({ ...start, materials: materials(100) }, 2, 'jump-drive');
    if (built.kind !== 'installed') throw new Error('Expected an install');
    const { spacecraft } = built.run;
    const run = {
      ...built.run,
      spacecraft: { ...spacecraft, fuelMass: kilograms(spacecraft.fuelMass * fuelShare) },
    };
    const launched = launchHop(run, HELIOPAUSE);
    if (launched.kind === 'flown' && launched.flight.outcome.kind === kind) {
      return { run, flight: launched.flight };
    }
  }
  throw new Error(`No seed has a ${kind} Hop to the Heliopause`);
}

describe('the Hop report', () => {
  it('says the Heliopause was reached, with no Landing row: a placeholder until the Jump', () => {
    const { run, flight } = heliopauseHopThatEnds('reached-heliopause', 1);
    const view = describeReport(run, flight);
    expect(view.title).toBe('Reached the Heliopause');
    expect(view.headline).toMatch(/edge of the Star System/);
    expect(view.rows.map((row) => row.label)).toEqual(['Takeoff', 'Transfer']);
    expect(view.margin).toMatch(/^Margin left: /);
    expect(view.collected).toBeUndefined();
    expect(view.why).toBe(flight.why);
  });

  it('reports a Hop to the Heliopause that ran out of Fuel as Fell Short', () => {
    const { run, flight } = heliopauseHopThatEnds('fell-short', 0.3);
    const view = describeReport(run, flight);
    expect(view.title).toBe('Fell Short');
    expect(view.rows.map((row) => row.label)).toEqual(['Takeoff', 'Transfer']);
  });

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
    // Re-pinned for #188: no first Hop of a full hauler falls short now, so it sets off half-fuelled.
    const { run, flight } = hopThatEnds('fell-short', 123, 'hauler', 0.5);
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
    // Re-pinned for #189: a half-fuelled hauler's Hop to Rexsio is short (was Sircer's).
    const run = withFuelShare(123, 'hauler', 0.5);
    const rexsio = listBodies(run.starSystem).find((body) => body.name === 'Rexsio');
    if (!rexsio) throw new Error('seed 123 has no Rexsio');
    const launched = launchHop(run, rexsio.id);
    if (launched.kind !== 'flown') throw new Error('expected a flight');
    const view = describeReport(run, launched.flight);
    expect(view.margin).toBe('Margin: none left (planned −7,035 m/s, 34%)');
    expect(view.why).toMatch(/The Fuel gives 34% less Δv/);
  });

  it('says a Crashed Hop completed the Transfer but ran out of Δv in the Landing', () => {
    // Re-pinned for #189 (was 0.5): no first Hop of a full scout crashes, so it sets off low on Fuel.
    const { run, flight } = hopThatEnds('crashed', 123, 'scout', 0.45);
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
    // Seed 2027's Scout stood on its innermost planet, knowing every Body and with none Depleted,
    // so Hops to an Icy and a Rocky Body can be reported apart from the opening (#96).
    const start = startRun(2027, 'scout');
    const ids = listBodies(start.starSystem).map((body) => body.id);
    const run: Run = {
      ...start,
      status: {
        kind: 'landed',
        bodyId: start.starSystem.planets[0]?.id ?? start.starSystem.startingMoonId,
      },
      knowledge: { detected: ids, surveyed: ids, heliopauseFound: true },
      depleted: [],
    };
    /** The first Body of `composition` a Hop from `run` reaches for sure. */
    const sure = (composition: 'icy' | 'rocky') => {
      const body = listBodies(run.starSystem).find((b) => {
        if (!b.landable || b.composition !== composition) return false;
        const planned = planHop(run, b.id);
        return planned.kind === 'planned' && planned.plan.successChance === 1;
      });
      if (!body) throw new Error(`seed 2027 has a ${composition} Body in sure reach`);
      return body;
    };
    const moon = sure('icy');
    const rocky = sure('rocky');
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
      if (!elsewhere) throw new Error('seed 2027 has a second Icy Body');
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
      const launched = launchHop(run, rocky.id);
      if (launched.kind !== 'flown') throw new Error('expected a flight');
      const view = describeReport(run, launched.flight);
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
      const launched = launchHop(installed.run, rocky.id);
      if (launched.kind !== 'flown') throw new Error('expected a flight');
      expect(describeReport(installed.run, launched.flight).collected).toMatch(
        /^Collected \d+ Materials \(Drill ×2\)\.$/,
      );
    });

    it('says a Depleted Body had nothing left', () => {
      const visited = { ...collectYield(run, moon.id).run, status: run.status };
      const view = describeReport(visited, flown(visited).flight);
      expect(view.collected).toBe('Nothing to collect: this Body is Depleted.');
    });

    it('says nothing was collected after a failed Hop', () => {
      const { run: failedRun, flight } = hopThatEnds('fell-short', 123, 'hauler', 0.5);
      expect(describeReport(failedRun, flight).collected).toBeUndefined();
    });
  });
});
