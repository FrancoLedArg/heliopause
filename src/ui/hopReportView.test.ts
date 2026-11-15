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
import { describeReport, type ReportView } from './hopReportView.ts';

/** The same Run as if a Radar had found the Heliopause (#191): only then is it a Hop target. */
const found = (run: Run): Run => ({
  ...run,
  knowledge: { ...run.knowledge, heliopauseFound: true },
});

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
    const built = install(found({ ...start, materials: materials(100) }), 2, 'jump-drive');
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

/** The simulation's explanation as written: a failure keeps it whole in `outcomeLine`. */
const whole = (view: ReportView): string =>
  view.title === 'Fell Short' || view.title === 'Crashed'
    ? (view.outcomeLine ?? '')
    : [view.outcomeLine, view.why].filter((part) => part !== undefined).join(' ');

describe('the Hop report', () => {
  it('says the Heliopause was reached, with no Landing row: a placeholder until the Jump', () => {
    const { run, flight } = heliopauseHopThatEnds('reached-heliopause', 1);
    const view = describeReport(run, flight);
    expect(view.title).toBe('Reached the Heliopause');
    expect(view.bar.label).toMatch(/^Δv: Takeoff .*Transfer /);
    expect(view.rows.map((row) => row.label)).toEqual(['Takeoff', 'Transfer']);
    expect(view.margin).toMatch(/^Margin left: /);
    expect(view.gains).toEqual([]);
    expect(whole(view)).toBe(flight.why);
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
    expect(whole(view)).toBe(flight.why);
  });

  it('draws the estimate against the actual of every flown Burn, in km/s, and leaves out Burns that never flew', () => {
    const arrived = hopThatEnds('arrived', 123, 'scout');
    const bar = describeReport(arrived.run, arrived.flight).bar;
    expect(bar.segments.map((s) => s.burn)).toEqual(['takeoff', 'transfer', 'landing']);
    expect(bar.segments.every((s) => s.estimateTick !== undefined)).toBe(true);
    expect(bar.label).toMatch(/Used [\d.]+ of [\d.]+ km\/s/);
    expect(bar.label).toMatch(/\(est\. [\d.]+\)/);

    const fell = hopThatEnds('fell-short', 123, 'hauler', 0.25);
    const short = describeReport(fell.run, fell.flight).bar;
    expect(short.segments.map((s) => s.burn)).toEqual(['takeoff', 'transfer']);
  });

  it('gives every outcome exactly one why sentence, with the whole explanation kept apart', () => {
    const flights = [
      hopThatEnds('arrived', 123, 'scout'),
      hopThatEnds('fell-short', 123, 'hauler', 0.25),
      // 0.45, not 0.5, since #189: from seed 123's innermost planet that is the share that Crashes.
      hopThatEnds('crashed', 123, 'scout', 0.45),
      heliopauseHopThatEnds('reached-heliopause', 1),
    ];
    for (const { run, flight } of flights) {
      const view = describeReport(run, flight);
      expect(view.why.split(/(?<=[.!?])\s+/)).toHaveLength(1);
      expect(view.why.length).toBeGreaterThan(10);
      expect(whole(view)).toBe(flight.why);
    }
  });

  it('names the Burn that ran out and the shortfall in the why line of each failure', () => {
    const fell = hopThatEnds('fell-short', 123, 'hauler', 0.25);
    const fellView = describeReport(fell.run, fell.flight);
    expect(fellView.why).toMatch(/^Fuel ran out in the Transfer: Δv short by [\d.]+ km\/s\.$/);
    expect(fellView.outcomeLine).toBe(fell.flight.why);

    // 0.45, not 0.5, since #189 (see the Crashed report test below).
    const crashed = hopThatEnds('crashed', 123, 'scout', 0.45);
    const crashedView = describeReport(crashed.run, crashed.flight);
    expect(crashedView.why).toMatch(/^Fuel ran out in the Landing: Δv short by [\d.]+ km\/s\.$/);
    expect(crashedView.outcomeLine).toBe(crashed.flight.why);
  });

  it('says during which Burn the Fuel ran out when a Hop Fell Short, and that the later Burns never flew', () => {
    // Re-pinned for #188: no first Hop of a full hauler falls short now, so it sets off low on Fuel
    // (a quarter since #231 gave the Hauler a second Tank: the same Fuel as half of one).
    const { run, flight } = hopThatEnds('fell-short', 123, 'hauler', 0.25);
    const view = describeReport(run, flight);
    expect(view.title).toBe('Fell Short');
    expect(view.outcomeLine).toMatch(/Fuel ran out during the Transfer/);
    const ranOut = view.rows.find((row) => row.change === 'ran out');
    expect(ranOut?.label).toBe('Transfer');
    expect(ranOut?.actual).toMatch(/^[\d.,]+ of [\d.,]+ (m|km)\/s$/);
    expect(view.rows.at(-1)?.change).toBe('not flown');
    expect(view.margin).toMatch(/^Margin: none left \(planned −[\d.]+ km\/s, \d+%\)$/);
    expect(whole(view)).toBe(flight.why);
  });

  it('gives the same Margin share in the report as in the why text: a hauler on seed 123', () => {
    // Re-pinned for #189: a half-fuelled hauler's Hop to Rexsio is short (was Sircer's).
    // #247's Isp leaves it less short. A quarter, not half, since #231 gave the Hauler two Tanks.
    const run = withFuelShare(123, 'hauler', 0.25);
    const rexsio = listBodies(run.starSystem).find((body) => body.name === 'Rexsio');
    if (!rexsio) throw new Error('seed 123 has no Rexsio');
    const launched = launchHop(run, rexsio.id);
    if (launched.kind !== 'flown') throw new Error('expected a flight');
    const view = describeReport(run, launched.flight);
    expect(view.margin).toBe('Margin: none left (planned −3.9 km/s, 19%)');
    expect(view.outcomeLine).toMatch(/The Fuel gives 19% less Δv/);
  });

  it('says a Crashed Hop completed the Transfer but ran out of Δv in the Landing', () => {
    // Re-pinned for #189 (was 0.5): no first Hop of a full scout crashes, so it sets off low on Fuel.
    const { run, flight } = hopThatEnds('crashed', 123, 'scout', 0.45);
    const view = describeReport(run, flight);
    expect(view.title).toBe('Crashed');
    expect(view.outcomeLine).toMatch(/Transfer was completed.*Landing/);
    expect(view.rows.map((row) => row.change).slice(0, 2)).toEqual([
      expect.stringMatching(/%$/),
      expect.stringMatching(/%$/),
    ]);
    expect(view.rows[2]?.change).toBe('ran out');
    expect(whole(view)).toBe(flight.why);
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

    it("the report's icon row shows what the landing collected and nothing when Depleted", () => {
      const { flight } = flown(run);
      const landedWith = (collection: NonNullable<HopFlight['collection']>) =>
        describeReport(run, { ...flight, collection }).gains;

      expect(
        landedWith({ kind: 'fuel', collected: kilograms(5_100), leftBehind: kilograms(0) }),
      ).toEqual([{ resource: 'fuel', amount: '+5.1 t', name: 'Collected 5.1 t of Fuel.' }]);
      expect(landedWith({ kind: 'materials', collected: materials(12) })).toEqual([
        { resource: 'materials', amount: '+12', name: 'Collected 12 Materials.' },
      ]);
      // A full Tank: what stayed on the ground is shown beside what came aboard.
      expect(
        landedWith({ kind: 'fuel', collected: kilograms(2_000), leftBehind: kilograms(5_700) }),
      ).toEqual([
        {
          resource: 'fuel',
          amount: '+2.0 t',
          leftBehind: '5.7 t',
          name: 'Collected 2.0 t of Fuel; 5.7 t left behind: the Tank is full.',
        },
      ]);
      expect(landedWith({ kind: 'depleted' })).toEqual([]);
    });

    it('says how much Fuel an Icy Body gave and explains ice-to-propellant the first time', () => {
      const view = describeReport(run, flown(run).flight);
      expect(view.gains[0]?.name).toMatch(/^Collected [\d.]+ t of Fuel\.$/);
      expect(view.fact).toBe(
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
      expect(view.gains[0]?.name).toMatch(/of Fuel/);
      expect(view.fact).toBeUndefined();
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
      expect(view.gains[0]?.name).toMatch(
        /^Collected [\d.]+ t of Fuel; [\d.]+ t left behind: the Tank is full\.$/,
      );
    });

    it('says how many Materials a Rocky Body gave', () => {
      const launched = launchHop(run, rocky.id);
      if (launched.kind !== 'flown') throw new Error('expected a flight');
      const view = describeReport(run, launched.flight);
      expect(view.gains[0]?.name).toMatch(/^Collected \d+ Materials\.$/);
      expect(view.fact).toBeUndefined();
    });

    it('names the Drill inside the Collected line, and nowhere else', () => {
      const installed = install(run, 2, 'drill-1');
      if (installed.kind !== 'installed') throw new Error('expected an install');
      const view = describeReport(installed.run, flown(installed.run).flight);
      expect(view.gains[0]?.name).toMatch(/^Collected [\d.]+ t of Fuel \(Drill ×1\.5\)\.$/);
      expect(view.gains[0]?.drill).toBe('×1.5');
      expect(view.fact).not.toMatch(/Drill/);
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
      expect(describeReport(installed.run, full).gains[0]?.name).not.toMatch(/Drill/);
    });

    it('names the Drill on a Rocky yield too', () => {
      const installed = install({ ...run, materials: materials(100) }, 2, 'drill-2');
      if (installed.kind !== 'installed') throw new Error('expected an install');
      const launched = launchHop(installed.run, rocky.id);
      if (launched.kind !== 'flown') throw new Error('expected a flight');
      expect(describeReport(installed.run, launched.flight).gains[0]?.name).toMatch(
        /^Collected \d+ Materials \(Drill ×2\)\.$/,
      );
    });

    it('shows nothing gathered on a Body visited before', () => {
      const visited = { ...collectYield(run, moon.id).run, status: run.status };
      expect(describeReport(visited, flown(visited).flight).gains).toEqual([]);
    });

    it('says nothing was collected after a failed Hop', () => {
      const { run: failedRun, flight } = hopThatEnds('fell-short', 123, 'hauler', 0.25);
      expect(describeReport(failedRun, flight).gains).toEqual([]);
    });
  });
});
