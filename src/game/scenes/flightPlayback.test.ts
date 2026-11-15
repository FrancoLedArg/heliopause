import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng.ts';
import {
  advanceCruise,
  beginHop,
  BURNS,
  flyHop,
  HELIOPAUSE,
  firstDetectedBody,
  install,
  kilograms,
  launchHop,
  materials,
  planHop,
  startRepair,
  startRun,
  type BodyId,
  type HopFlight,
  type Run,
} from '../sim/index.ts';
import {
  advancePlayback,
  FAST_FORWARD,
  flightPlayback,
  SHOT_MS,
  systemsLit,
  type FlightPlayback,
  type Shot,
} from './flightPlayback.ts';

const run = startRun(123, 'scout');
/** The first Body Comms Detected: every Hop in these tests goes there. */
const moonId: BodyId = firstDetectedBody(run.starSystem).id;

/** Flies the Hop to the first Detected Body from `from`, with the first seed whose outcome is `kind`. */
function flightEnding(kind: HopFlight['outcome']['kind'], from: Run, burn?: string): HopFlight {
  const planned = planHop(from, moonId);
  if (planned.kind !== 'planned') throw new Error('no plan');
  for (let seed = 0; seed < 2000; seed++) {
    const { flight } = flyHop(from, planned.plan, createRng(seed));
    const outcome = flight.outcome;
    if (outcome.kind !== kind) continue;
    if (burn !== undefined && (outcome.kind !== 'fell-short' || outcome.burn !== burn)) continue;
    return flight;
  }
  throw new Error(`no seed ends as ${kind}`);
}

/** The same Run with only `share` of its Fuel. */
const withFuel = (share: number): Run => ({
  ...run,
  spacecraft: { ...run.spacecraft, fuelMass: kilograms(run.spacecraft.fuelMass * share) },
});

/** Samples the playback every 10 ms from start to end. */
const samples = (playback: FlightPlayback) =>
  Array.from({ length: Math.floor(playback.duration / 10) + 1 }, (_, i) => playback.at(i * 10));

const arrived = flightEnding('arrived', run);

/** The shots a playback shows, in order, each once. */
const shotsOf = (playback: FlightPlayback): Shot[] => {
  const order = samples(playback).map((moment) => moment.shot);
  return order.filter((shot, i) => shot !== order[i - 1]);
};

/** The real time (ms) the playback takes to cross `shot` at `rate(shot)` playback ms per real ms. */
function realTimeThrough(playback: FlightPlayback, shot: Shot, rate: (s: Shot) => number): number {
  const span = playback.shots.find((s) => s.shot === shot);
  if (!span) throw new Error(`no ${shot}`);
  let real = 0;
  let ms = span.start;
  while (ms < span.end) {
    ms = advancePlayback(playback, ms, 16, rate);
    real += 16;
  }
  return real;
}

/** The Run with just enough Fuel for `fraction` of the Hop's estimated Δv. */
/**
 * The share of the Hop's estimate that its Takeoff and Transfer take: Fuel for just that much runs
 * dry during the Transfer, whatever the Burns cost.
 */
function transferShare(): number {
  const planned = planHop(run, moonId);
  if (planned.kind !== 'planned') throw new Error('no plan');
  const { takeoff, transfer } = planned.plan.estimates;
  return (takeoff + transfer) / planned.plan.totalEstimate;
}

function shortRun(fraction: number): Run {
  const planned = planHop(run, moonId);
  if (planned.kind !== 'planned') throw new Error('no plan');
  // Bisect the Fuel share that gives `fraction` of the total estimate.
  let low = 0;
  let high = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const p = planHop(withFuel(mid), moonId);
    if (p.kind === 'planned' && p.plan.availableDeltaV < planned.plan.totalEstimate * fraction) {
      low = mid;
    } else high = mid;
  }
  return withFuel(high);
}

describe('Hop playback', () => {
  it('plays Takeoff, then Transfer, then Landing, in that order and each for a while', () => {
    const playback = flightPlayback(run.spacecraft, arrived, 'full');
    const order = samples(playback).map((moment) => moment.burn);
    const shown = order.filter((burn, i) => burn !== order[i - 1]);
    expect(shown).toEqual(['takeoff', 'transfer', 'landing']);
    for (const burn of BURNS) {
      expect(order.filter((b) => b === burn).length * 10).toBeGreaterThanOrEqual(1000);
    }
  });

  it('starts with the Fuel at launch and ends an Arrived Hop with the Fuel the simulation left', () => {
    const playback = flightPlayback(run.spacecraft, arrived, 'full');
    expect(playback.at(0).fuel).toBe(arrived.fuelAtLaunch);
    expect(playback.at(playback.duration).fuel).toBeCloseTo(arrived.fuelRemaining, 6);
    expect(playback.at(playback.duration).ended).toBe(true);
    expect(playback.at(playback.duration - 1).ended).toBe(false);
  });

  it('drains the Fuel during each Burn down to what that Burn left, never refilling it', () => {
    const playback = flightPlayback(run.spacecraft, arrived, 'full');
    const moments = samples(playback);
    moments.forEach((moment, i) => {
      const before = moments[i - 1];
      if (before) expect(moment.fuel).toBeLessThanOrEqual(before.fuel);
    });
    // When a Burn reaches the log, the Fuel bar shows exactly what the simulation says it left.
    arrived.burns.forEach((burn, index) => {
      if (burn.status !== 'completed') throw new Error('arrived');
      const logged = moments.find((moment) => moment.logged > index);
      expect(logged?.fuel).toBeCloseTo(burn.fuelAfter, 6);
    });
  });

  it('shows the engine thrusting during each Burn, and the Transfer coasting after its boost', () => {
    const moments = samples(flightPlayback(run.spacecraft, arrived, 'full'));
    for (const burn of BURNS) {
      expect(moments.some((m) => m.burn === burn && m.thrusting)).toBe(true);
    }
    expect(moments.some((m) => m.burn === 'transfer' && !m.thrusting)).toBe(true);
    // While coasting nothing burns, so the Fuel holds.
    const coasting = moments.filter((m) => m.burn === 'transfer' && !m.thrusting);
    expect(new Set(coasting.map((m) => m.fuel)).size).toBe(1);
  });

  it('the Landing engine cuts at touchdown, leaving a beat for the Spacecraft to settle before the hand-off', () => {
    const playback = flightPlayback(run.spacecraft, arrived, 'full');
    const landing = samples(playback).filter((m) => m.burn === 'landing');
    const lastThrust = landing.findLast((m) => m.thrusting);
    expect(lastThrust?.progress).toBeGreaterThan(0.7);
    expect(lastThrust?.progress).toBeLessThan(0.95);
    // The Fuel the simulation left is shown from touchdown on, and the Landing is logged there.
    const settled = landing.filter((m) => !m.thrusting);
    expect(settled.length * 10).toBeGreaterThanOrEqual(300);
    for (const moment of settled) {
      expect(moment.fuel).toBeCloseTo(arrived.fuelRemaining, 6);
      expect(moment.logged).toBe(3);
    }
  });

  it('adds each Burn to the flight log only once it is done', () => {
    const moments = samples(flightPlayback(run.spacecraft, arrived, 'full'));
    expect(moments[0]?.logged).toBe(0);
    for (const moment of moments) {
      const index = BURNS.indexOf(moment.burn);
      // The Burn on screen is never logged while it still burns.
      if (moment.thrusting) expect(moment.logged).toBe(index);
    }
    expect(moments.at(-1)?.logged).toBe(3);
  });

  it('reports how far along the route the Spacecraft is, from 0 to 1, never going back', () => {
    const moments = samples(flightPlayback(run.spacecraft, arrived, 'full'));
    expect(moments[0]?.route).toBe(0);
    expect(moments.at(-1)?.route).toBe(1);
    moments.forEach((moment, i) => {
      const before = moments[i - 1];
      if (before) expect(moment.route).toBeGreaterThanOrEqual(before.route);
    });
    // Each Burn is a third of the route.
    const transferStart = moments.find((m) => m.burn === 'transfer');
    expect(transferStart?.route).toBeCloseTo(1 / 3, 1);
  });

  it('a Hop that stops short holds its route progress where the engine cut out', () => {
    // Re-pinned for #188: was 0.97, before seed 123's Home Moon took a bigger share in Landing.
    const from = shortRun(transferShare());
    const flight = flightEnding('fell-short', from, 'transfer');
    const playback = flightPlayback(from.spacecraft, flight, 'full');
    const stop = playback.at(playback.stopsAt).route;
    expect(stop).toBeGreaterThan(1 / 3);
    expect(stop).toBeLessThan(2 / 3);
    expect(playback.at(playback.duration).route).toBe(stop);
  });

  it('a Hop that Fell Short in the Transfer stops when the Fuel runs dry, partway through it', () => {
    // Re-pinned for #188: was 0.97, before seed 123's Home Moon took a bigger share in Landing.
    const from = shortRun(transferShare());
    const flight = flightEnding('fell-short', from, 'transfer');
    const playback = flightPlayback(from.spacecraft, flight, 'full');
    expect(playback.stopsAt).toBeLessThan(playback.duration);
    const stop = playback.at(playback.stopsAt);
    expect(stop.burn).toBe('transfer');
    expect(stop.thrusting).toBe(false);
    expect(stop.fuel).toBeCloseTo(0, 6);
    expect(stop.logged).toBe(2); // Takeoff, and the Transfer that ran out
    expect(playback.at(playback.stopsAt - 20).thrusting).toBe(true);
    // It never goes on to the Landing.
    expect(samples(playback).some((moment) => moment.burn === 'landing')).toBe(false);
    expect(playback.at(playback.duration).ended).toBe(true);
  });

  it('a Hop that Fell Short at Takeoff never leaves the Takeoff', () => {
    // Fuel for most of the Takeoff alone. Re-pinned for #189 (was a fixed 0.2): from the Starting
    // Moon the Takeoff is a small share of the Hop.
    const planned = planHop(run, moonId);
    if (planned.kind !== 'planned') throw new Error('no plan');
    const from = shortRun((0.8 * planned.plan.estimates.takeoff) / planned.plan.totalEstimate);
    const flight = flightEnding('fell-short', from, 'takeoff');
    const playback = flightPlayback(from.spacecraft, flight, 'full');
    expect(playback.at(0).fuel).toBeCloseTo(from.spacecraft.fuelMass, 6);
    // The engine cuts out partway through the Takeoff, not at its end.
    expect(playback.stopsAt).toBeGreaterThan(0);
    expect(playback.stopsAt).toBeLessThan(SHOT_MS.full.takeoff);
    expect(playback.at(playback.stopsAt - 20).thrusting).toBe(true);
    expect(playback.at(playback.stopsAt).thrusting).toBe(false);
    expect(playback.at(playback.stopsAt).fuel).toBeCloseTo(0, 6);
    expect(samples(playback).every((moment) => moment.burn === 'takeoff')).toBe(true);
  });

  it('a Hop that Crashed stops partway through the Landing, with the Fuel spent', () => {
    // Re-pinned for #188: was 0.97, before seed 123's Home Moon took a bigger share in Landing.
    const from = shortRun(transferShare());
    const flight = flightEnding('crashed', from);
    const playback = flightPlayback(from.spacecraft, flight, 'full');
    const stop = playback.at(playback.stopsAt);
    expect(stop.burn).toBe('landing');
    expect(stop.fuel).toBeCloseTo(0, 6);
    expect(stop.logged).toBe(3);
  });

  it('an Arrived Hop plays through to its end without stopping early', () => {
    const playback = flightPlayback(run.spacecraft, arrived, 'full');
    expect(playback.stopsAt).toBe(playback.duration);
  });

  it('under reduced motion the Takeoff and Landing are shorter, the Cruise keeps its length, and all three Burns play', () => {
    const full = flightPlayback(run.spacecraft, arrived, 'full');
    const reduced = flightPlayback(run.spacecraft, arrived, 'reduced');
    expect(reduced.duration).toBeLessThan(full.duration - 3000);
    expect(reduced.cruise?.length).toBe(full.cruise?.length);
    const order = samples(reduced).map((moment) => moment.burn);
    expect(order.filter((burn, i) => burn !== order[i - 1])).toEqual([
      'takeoff',
      'transfer',
      'landing',
    ]);
  });
});

describe('the playback of a Hop to the Heliopause', () => {
  const built = install({ ...startRun(1, 'lancer'), materials: materials(100) }, 2, 'jump-drive');
  if (built.kind !== 'installed') throw new Error('Expected an install');
  const launched = launchHop(built.run, HELIOPAUSE);
  if (launched.kind !== 'flown') throw new Error('Expected a flight');
  const { flight } = launched;
  if (flight.fuelLost === 0) throw new Error('Expected a leak: real Runs have one in every Cruise');

  it('plays Takeoff then Transfer, never a Landing, and reaches the end of the route', () => {
    const playback = flightPlayback(built.run.spacecraft, flight, 'full');
    expect(flight.outcome.kind).toBe('reached-heliopause');
    expect(playback.duration).toBe(SHOT_MS.full.takeoff + SHOT_MS.full.cruise);
    const shown = [...new Set(samples(playback).map((moment) => moment.burn))];
    expect(shown).toEqual(['takeoff', 'transfer']);
    const end = playback.at(playback.duration);
    expect(end).toMatchObject({ burn: 'transfer', route: 1, logged: 2, ended: true });
    expect(end.fuel).toBeCloseTo(flight.fuelRemaining);
  });

  it('is shorter under reduced motion, and still has no Landing', () => {
    const playback = flightPlayback(built.run.spacecraft, flight, 'reduced');
    expect(playback.duration).toBe(SHOT_MS.reduced.takeoff + SHOT_MS.reduced.cruise);
    expect(samples(playback).some((moment) => moment.burn === 'landing')).toBe(false);
  });
});

describe('the shots of a Hop’s playback', () => {
  it('plays the shots in order: Takeoff, Cruise, Approach, then Landing', () => {
    for (const pace of ['full', 'reduced'] as const) {
      expect(shotsOf(flightPlayback(run.spacecraft, arrived, pace))).toEqual([
        'takeoff',
        'cruise',
        'approach',
        'landing',
      ]);
    }
  });

  it('the Approach lasts 2.2 s, 0.7 s under reduced motion, and comes straight after the Cruise', () => {
    for (const [pace, length] of [
      ['full', 2200],
      ['reduced', 700],
    ] as const) {
      const playback = flightPlayback(run.spacecraft, arrived, pace);
      const cruise = playback.shots.find((s) => s.shot === 'cruise');
      const approach = playback.shots.find((s) => s.shot === 'approach');
      expect(approach && approach.end - approach.start).toBe(length);
      expect(approach?.start).toBe(cruise?.end);
    }
  });

  it('the Approach is the end of the Transfer: the engine coasts through it and the Fuel holds', () => {
    const playback = flightPlayback(run.spacecraft, arrived, 'full');
    const approach = samples(playback).filter((m) => m.shot === 'approach');
    expect(approach.length).toBeGreaterThan(0);
    for (const moment of approach) {
      expect(moment.burn).toBe('transfer');
      expect(moment.thrusting).toBe(false);
      expect(moment.cruise).toBeUndefined();
    }
    expect(new Set(approach.map((m) => m.fuel)).size).toBe(1);
  });

  it('a Crashed Hop plays the whole Approach before its Landing', () => {
    const from = shortRun(transferShare());
    const flight = flightEnding('crashed', from);
    for (const pace of ['full', 'reduced'] as const) {
      const playback = flightPlayback(from.spacecraft, flight, pace);
      expect(shotsOf(playback)).toEqual(['takeoff', 'cruise', 'approach', 'landing']);
      const approach = playback.shots.find((s) => s.shot === 'approach');
      expect(approach && approach.end - approach.start).toBe(SHOT_MS[pace].approach);
      // It runs to its end: the engine dies only later, in the Landing.
      if (!approach) throw new Error('no Approach');
      expect(playback.at(approach.end - 1).shotProgress).toBeGreaterThan(0.99);
      expect(playback.stopsAt).toBeGreaterThan(approach.end);
    }
  });

  it('the Takeoff Burn is the Takeoff shot, the Transfer is the Cruise, and the Landing Burn is the Landing shot', () => {
    const burnOf: Record<Shot, string> = {
      takeoff: 'takeoff',
      cruise: 'transfer',
      approach: 'transfer',
      landing: 'landing',
    };
    for (const moment of samples(flightPlayback(run.spacecraft, arrived, 'full'))) {
      expect(moment.burn).toBe(burnOf[moment.shot]);
    }
  });

  it('the Takeoff and Landing are short: 2.8 s each, 1 s under reduced motion', () => {
    for (const [pace, length] of [
      ['full', 2800],
      ['reduced', 1000],
    ] as const) {
      const playback = flightPlayback(run.spacecraft, arrived, pace);
      for (const shot of ['takeoff', 'landing'] as const) {
        const span = playback.shots.find((s) => s.shot === shot);
        expect(span && span.end - span.start).toBe(length);
      }
    }
  });

  it('the Cruise lasts about 2 minutes at normal speed, at either pace, and about 30 s on fast-forward', () => {
    for (const pace of ['full', 'reduced'] as const) {
      const playback = flightPlayback(run.spacecraft, arrived, pace);
      const normal = realTimeThrough(playback, 'cruise', () => 1);
      expect(normal).toBeGreaterThanOrEqual(110_000);
      expect(normal).toBeLessThanOrEqual(130_000);
      const fast = realTimeThrough(playback, 'cruise', () => FAST_FORWARD);
      expect(fast).toBeGreaterThanOrEqual(27_000);
      expect(fast).toBeLessThanOrEqual(33_000);
    }
  });

  it('a speed for the Cruise alone (the test override) hurries the Cruise and leaves the Landing its length', () => {
    const playback = flightPlayback(run.spacecraft, arrived, 'full');
    const rate = (shot: Shot): number => (shot === 'cruise' ? 40 : 1);
    expect(realTimeThrough(playback, 'cruise', rate)).toBeLessThan(3200);
    expect(realTimeThrough(playback, 'landing', rate)).toBeGreaterThanOrEqual(SHOT_MS.full.landing);
    // Crossing from the Cruise into the Landing, the speed changes exactly where the shot does.
    const cruise = playback.shots.find((s) => s.shot === 'cruise');
    if (!cruise) throw new Error('no Cruise');
    expect(advancePlayback(playback, cruise.end - 40, 2, rate)).toBe(cruise.end + 1);
  });

  it('the Cruise window lies inside the Transfer, and the Transfer’s boost sits wholly inside the Cruise', () => {
    const playback = flightPlayback(run.spacecraft, arrived, 'full');
    const window = playback.cruise;
    if (!window) throw new Error('no Cruise');
    const moments = samples(playback);
    const transfer = moments.filter((m) => m.burn === 'transfer');
    const first = moments.findIndex((m) => m.burn === 'transfer') * 10;
    const last = first + (transfer.length - 1) * 10;
    expect(window.start).toBeGreaterThanOrEqual(first);
    expect(window.start + window.length).toBeLessThanOrEqual(last + 10);
    expect(transfer.some((m) => m.thrusting)).toBe(true);
    for (const moment of transfer.filter((m) => m.thrusting)) expect(moment.shot).toBe('cruise');
  });

  it('the Cruise clock reports the Cruise time elapsed and the Cruise’s total, in ms', () => {
    const playback = flightPlayback(run.spacecraft, arrived, 'full');
    const window = playback.cruise;
    if (!window) throw new Error('no Cruise');
    expect(window.length).toBe(SHOT_MS.full.cruise);
    expect(playback.at(window.start + 30_000).cruise).toEqual({
      elapsed: 30_000,
      total: window.length,
    });
    // Only the Cruise has a Cruise clock.
    expect(playback.at(window.start - 1).cruise).toBeUndefined();
    expect(playback.at(window.start + window.length + 1).cruise).toBeUndefined();
  });

  it('a Hop to the Heliopause has no Approach and no Landing: Takeoff, then the Cruise', () => {
    expect(SHOT_MS.full.approach).toBeGreaterThan(0);
    const built = install({ ...startRun(1, 'lancer'), materials: materials(100) }, 2, 'jump-drive');
    if (built.kind !== 'installed') throw new Error('Expected an install');
    const launched = launchHop(built.run, HELIOPAUSE);
    if (launched.kind !== 'flown') throw new Error('Expected a flight');
    expect(shotsOf(flightPlayback(built.run.spacecraft, launched.flight, 'full'))).toEqual([
      'takeoff',
      'cruise',
    ]);
  });

  it('a Spacecraft that Fell Short in the Transfer dies in the Cruise, never reaches the Approach, and the Cruise ends early', () => {
    const from = shortRun(transferShare());
    const flight = flightEnding('fell-short', from, 'transfer');
    const playback = flightPlayback(from.spacecraft, flight, 'full');
    expect(playback.at(playback.stopsAt).shot).toBe('cruise');
    expect(shotsOf(playback)).toEqual(['takeoff', 'cruise']);
    // Nobody waits two minutes behind a dead engine: the aftermath ends the playback soon after.
    expect(playback.duration).toBeLessThan(SHOT_MS.full.takeoff + 20_000);
    expect(playback.cruise?.start).toBe(SHOT_MS.full.takeoff);
    expect(playback.cruise && playback.cruise.start + playback.cruise.length).toBe(
      playback.duration,
    );
  });

  it('a Spacecraft that Fell Short in the Takeoff never reaches the Cruise', () => {
    // Fuel for most of the Takeoff alone (not a fixed 0.2: from the Starting Moon, #189, the Takeoff
    // is a small share of the Hop).
    const planned = planHop(run, moonId);
    if (planned.kind !== 'planned') throw new Error('no plan');
    const from = shortRun((0.8 * planned.plan.estimates.takeoff) / planned.plan.totalEstimate);
    const flight = flightEnding('fell-short', from, 'takeoff');
    const playback = flightPlayback(from.spacecraft, flight, 'full');
    expect(shotsOf(playback)).toEqual(['takeoff']);
    expect(playback.cruise).toBeUndefined();
  });

  it('the systems lights come on one after another early in the Cruise, then all hold steady', () => {
    expect(systemsLit(undefined, 3)).toBe(0);
    const lit = (elapsed: number): number => systemsLit({ elapsed, total: 120_000 }, 3);
    expect(lit(0)).toBe(0);
    const steps = Array.from({ length: 100 }, (_, i) => lit(i * 100));
    // Each light comes on by itself, in turn, and none goes out again.
    expect(new Set(steps)).toEqual(new Set([0, 1, 2, 3]));
    steps.forEach((n, i) => {
      expect(n).toBeGreaterThanOrEqual(steps[i - 1] ?? 0);
    });
    expect(lit(10_000)).toBe(3);
    expect(lit(119_000)).toBe(3);
  });
});

describe('Cruise events in the playback', () => {
  it('the Cruise events that struck play in Cruise time, until their Damage is cleared', () => {
    const fuelTank = 1;
    const begun = beginHop(run, moonId, {
      schedule: [
        { kind: 'fuel-leak', tick: 600, slot: fuelTank },
        { kind: 'debris-field', tick: 900, slot: null },
      ],
    });
    if (begun.kind !== 'cruising') throw new Error('Expected a Cruise');
    const repaired = startRepair(advanceCruise(begun.run, 600).run, fuelTank);
    if (repaired.kind !== 'repairing') throw new Error('Expected a Repair');
    const flown = advanceCruise(repaired.run, 1_200);
    if (flown.kind !== 'flown') throw new Error('Expected the Hop to be flown');
    const playback = flightPlayback(run.spacecraft, flown.flight, 'full');
    // The Cruise shot is 120 s for 1,200 ticks: tick 600 is 60 s in; the 30 s Repair ends on tick 900.
    expect(playback.events).toEqual([
      { kind: 'fuel-leak', slot: fuelTank, startsAt: 60_000, endsAt: 90_000 },
      { kind: 'debris-field', slot: null, startsAt: 90_000, endsAt: 120_000 },
    ]);
  });

  it('the Fuel shown drains by what the leaks lost, and the Landing starts from what the Cruise left', () => {
    const begun = beginHop(run, moonId, { schedule: [{ kind: 'fuel-leak', tick: 100, slot: 1 }] });
    if (begun.kind !== 'cruising') throw new Error('Expected a Cruise');
    const flown = advanceCruise(begun.run, 1_200);
    if (flown.kind !== 'flown') throw new Error('Expected the Hop to be flown');
    const { flight } = flown;
    expect(flight.fuelLost).toBeGreaterThan(0);
    const playback = flightPlayback(run.spacecraft, flight, 'full');
    const landing = playback.shots.find((shot) => shot.shot === 'landing');
    if (!landing) throw new Error('Expected a Landing');
    const transfer = flight.burns.find((burn) => burn.burn === 'transfer');
    if (transfer?.status !== 'completed') throw new Error('Expected a Transfer');
    expect(playback.at(landing.start).fuel).toBeCloseTo(transfer.fuelAfter - flight.fuelLost, 3);
    expect(playback.at(playback.duration).fuel).toBeCloseTo(flight.fuelRemaining, 3);
  });

  it('a Hop with no Cruise events has none to play', () => {
    const launched = launchHop(run, moonId, { schedule: [] });
    if (launched.kind !== 'flown') throw new Error('Expected a flight');
    expect(flightPlayback(run.spacecraft, launched.flight, 'full').events).toEqual([]);
  });
});
