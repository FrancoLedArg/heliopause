import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng.ts';
import {
  BURNS,
  flyHop,
  HELIOPAUSE,
  homePlanet,
  install,
  kilograms,
  launchHop,
  materials,
  planHop,
  startRun,
  type BodyId,
  type HopFlight,
  type Run,
} from '../sim/index.ts';
import { flightPlayback, PHASE_MS, type FlightPlayback } from './flightPlayback.ts';

const run = startRun(123, 'scout');
const moon = homePlanet(run.starSystem).moons[0];
if (!moon) throw new Error('The Home Planet has a Moon');
/** The Home Planet's Moon: every Hop in these tests goes there. */
const moonId: BodyId = moon.id;

/** Flies the Hop to the Home Planet's Moon from `from`, with the first seed whose outcome is `kind`. */
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
    const from = shortRun(0.2);
    const flight = flightEnding('fell-short', from, 'takeoff');
    const playback = flightPlayback(from.spacecraft, flight, 'full');
    expect(playback.at(0).fuel).toBeCloseTo(from.spacecraft.fuelMass, 6);
    // The engine cuts out partway through the Takeoff, not at its end.
    expect(playback.stopsAt).toBeGreaterThan(0);
    expect(playback.stopsAt).toBeLessThan(PHASE_MS.full.takeoff);
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

  it('under reduced motion the playback is shorter but still plays all three Burns', () => {
    const full = flightPlayback(run.spacecraft, arrived, 'full');
    const reduced = flightPlayback(run.spacecraft, arrived, 'reduced');
    expect(reduced.duration).toBeLessThan(full.duration / 2);
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

  it('plays Takeoff then Transfer, never a Landing, and reaches the end of the route', () => {
    const playback = flightPlayback(built.run.spacecraft, flight, 'full');
    expect(flight.outcome.kind).toBe('reached-heliopause');
    expect(playback.duration).toBe(PHASE_MS.full.takeoff + PHASE_MS.full.transfer);
    const shown = [...new Set(samples(playback).map((moment) => moment.burn))];
    expect(shown).toEqual(['takeoff', 'transfer']);
    const end = playback.at(playback.duration);
    expect(end).toMatchObject({ burn: 'transfer', route: 1, logged: 2, ended: true });
    expect(end.fuel).toBeCloseTo(flight.fuelRemaining);
  });

  it('is shorter under reduced motion, and still has no Landing', () => {
    const playback = flightPlayback(built.run.spacecraft, flight, 'reduced');
    expect(playback.duration).toBe(PHASE_MS.reduced.takeoff + PHASE_MS.reduced.transfer);
    expect(samples(playback).some((moment) => moment.burn === 'landing')).toBe(false);
  });
});
