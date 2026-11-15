import { describe, expect, it } from 'vitest';
import { createRng } from '../game/lib/rng.ts';
import type { FlightMoment } from '../game/scenes/flightPlayback.ts';
import {
  findBody,
  flyHop,
  firstDetectedBody,
  kilograms,
  metersPerSecond,
  planHop,
  startRun,
  HELIOPAUSE,
  install,
  launchHop,
  materials,
  type BodyHopPlan,
  type HopFlight,
} from '../game/sim/index.ts';
import { describeFlight } from './flightHudView.ts';
import { heliopauseFound } from '../game/sim/testing.ts';

/**
 * The same Run as if a Radar had found the Heliopause (#191): only then is it a Hop target, and
 * only within the Hop range (#283).
 */
const found = heliopauseFound;

const run = startRun(123, 'scout');
const moonId = firstDetectedBody(run.starSystem).id;
const planned = planHop(run, moonId);
if (planned.kind !== 'planned') throw new Error('no plan');
const plan: BodyHopPlan = planned.plan;
const { flight } = flyHop(run, plan, createRng(1));

const moment = (over: Partial<FlightMoment>): FlightMoment => ({
  burn: 'takeoff',
  progress: 0,
  shot: 'takeoff',
  shotProgress: 0,
  cruise: undefined,
  thrusting: true,
  fuel: run.spacecraft.fuelMass,
  logged: 0,
  ended: false,
  route: 0,
  ...over,
});

describe('the flight HUD', () => {
  it('highlights the Burn under way, marks the ones done, and leaves the rest to come', () => {
    const view = describeFlight(run, flight, moment({ burn: 'transfer', logged: 1 }));
    expect(view.phases.map((phase) => [phase.label, phase.state])).toEqual([
      ['Takeoff', 'done'],
      ['Transfer', 'current'],
      ['Landing', 'next'],
    ]);
  });

  it('logs a finished Burn with its estimate, its actual Δv and the difference', () => {
    const worked: HopFlight = {
      ...flight,
      burns: [
        {
          status: 'completed',
          burn: 'takeoff',
          estimated: metersPerSecond(3100),
          actual: metersPerSecond(3162),
          fuelAfter: kilograms(9000),
        },
        {
          status: 'completed',
          burn: 'transfer',
          estimated: metersPerSecond(680),
          actual: metersPerSecond(653),
          fuelAfter: kilograms(8000),
        },
        ...flight.burns.slice(2),
      ],
    };
    const view = describeFlight(run, worked, moment({ burn: 'landing', logged: 2 }));
    expect(view.log[0]).toMatchObject({
      state: 'done',
      estimate: '3.1 km/s',
      actual: '3.2 km/s',
      change: '+2%',
    });
    expect(view.log[1]).toMatchObject({ actual: '0.65 km/s', change: '−4%' });
  });

  it('shows the Burn under way as burning and the later ones by their estimate only', () => {
    const view = describeFlight(run, flight, moment({ burn: 'transfer', logged: 1 }));
    expect(view.log.map((row) => [row.label, row.state, row.actual])).toEqual([
      ['Takeoff', 'done', expect.stringMatching(/m\/s/)],
      ['Transfer', 'burning', 'burning…'],
      ['Landing', 'waiting', '—'],
    ]);
  });

  it('a Burn that ran out says so in words, with what the Fuel delivered of what it needed', () => {
    const failed: HopFlight = {
      ...flight,
      outcome: { kind: 'fell-short', burn: 'transfer', shortfall: metersPerSecond(50) },
      burns: [
        flight.burns[0] ?? { status: 'not-flown', burn: 'takeoff', estimated: metersPerSecond(1) },
        {
          status: 'ran-out',
          burn: 'transfer',
          estimated: metersPerSecond(600),
          actual: metersPerSecond(650),
          delivered: metersPerSecond(600),
        },
        { status: 'not-flown', burn: 'landing', estimated: metersPerSecond(300) },
      ],
    };
    const view = describeFlight(
      run,
      failed,
      moment({ burn: 'transfer', logged: 2, thrusting: false, fuel: kilograms(0) }),
    );
    expect(view.log[1]).toMatchObject({
      state: 'ran-out',
      actual: '0.60 of 0.65 km/s',
      change: 'ran out',
    });
    expect(view.log[2]).toMatchObject({ state: 'waiting', actual: '—' });
  });

  it('reads every Δv in km/s, like the Hop plan and report, even above 10 km/s', () => {
    const long: HopFlight = {
      ...flight,
      outcome: { kind: 'fell-short', burn: 'transfer', shortfall: metersPerSecond(889) },
      burns: [
        flight.burns[0] ?? { status: 'not-flown', burn: 'takeoff', estimated: metersPerSecond(1) },
        {
          status: 'ran-out',
          burn: 'transfer',
          estimated: metersPerSecond(14_100),
          actual: metersPerSecond(14_812),
          delivered: metersPerSecond(13_923),
        },
        { status: 'not-flown', burn: 'landing', estimated: metersPerSecond(1_580) },
      ],
    };
    const view = describeFlight(
      run,
      long,
      moment({ burn: 'transfer', logged: 2, thrusting: false, fuel: kilograms(0) }),
    );
    expect(view.log[1]).toMatchObject({
      estimate: '14.1 km/s',
      actual: '13.9 of 14.8 km/s',
      change: 'ran out',
    });
    expect(view.log[2]).toMatchObject({ estimate: '1.6 km/s' });
  });

  it('drains the Δv bar Burn by Burn: nothing at Launch, a Burn done, the next under way, then all', () => {
    const drained = (over: Partial<FlightMoment>): number =>
      describeFlight(run, flight, moment(over)).drained;
    const [a, b] = [flight.burns[0], flight.burns[1]];
    if (a?.status !== 'completed' || b?.status !== 'completed')
      throw new Error('expected a flown Hop');
    const scale = Math.max(
      describeFlight(run, flight, moment({})).bar.needed,
      flight.plan.availableDeltaV,
    );
    expect(drained({})).toBe(0);
    // Takeoff done, Transfer half through: the Δv those two took, as a share of the bar (worked by hand).
    expect(drained({ burn: 'transfer', logged: 1, progress: 0.5 })).toBeCloseTo(
      (a.actual + b.actual / 2) / scale,
      6,
    );
    expect(drained({ burn: 'landing', logged: 3 })).toBeGreaterThan(
      drained({ burn: 'transfer', logged: 1, progress: 0.5 }),
    );
  });

  it('marks flown Burns with their estimate tick and leaves the others bare', () => {
    const view = describeFlight(run, flight, moment({ burn: 'transfer', logged: 1 }));
    expect(view.bar.segments.map((segment) => segment.estimateTick !== undefined)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('holds the bar where the Fuel ran out: a Burn that ran out drains only what it delivered', () => {
    const failed: HopFlight = {
      ...flight,
      plan: { ...flight.plan, availableDeltaV: metersPerSecond(1000) },
      burns: [
        {
          status: 'ran-out',
          burn: 'takeoff',
          estimated: metersPerSecond(900),
          actual: metersPerSecond(1200),
          delivered: metersPerSecond(1000),
        },
        { status: 'not-flown', burn: 'transfer', estimated: metersPerSecond(600) },
        { status: 'not-flown', burn: 'landing', estimated: metersPerSecond(300) },
      ],
    };
    const view = describeFlight(run, failed, moment({ logged: 1, thrusting: false }));
    // Needs 2100 against 1000: the scale is 2100, and 1000 of it is drained.
    expect(view.drained).toBeCloseTo(1000 / 2100, 6);
    expect(view.deltaVLeft).toBe('0.00 of 1.0 km/s');
  });

  it('shows the route inset: the departure and the target Body by name, and how far along the Hop is', () => {
    const departure = findBody(run.starSystem, plan.fromId)?.name;
    const target = findBody(run.starSystem, plan.toId)?.name;
    const view = describeFlight(run, flight, moment({ burn: 'transfer', route: 0.5 }));
    expect(view.route).toMatchObject({ from: departure, to: target, share: 0.5 });
    expect(view.route.fromSprite).toMatch(/^body_/);
    expect(view.route.toSprite).toMatch(/^body_/);
    // Before the first moment the Spacecraft is still at the departure Body.
    expect(describeFlight(run, flight, undefined).route.share).toBe(0);
  });

  it('shows a Hop to the Heliopause as Takeoff and Transfer, with the Heliopause at the end of the route', () => {
    const built = install(
      found({ ...startRun(1, 'lancer'), materials: materials(100) }),
      2,
      'jump-drive',
    );
    if (built.kind !== 'installed') throw new Error('Expected an install');
    const launched = launchHop(built.run, HELIOPAUSE);
    if (launched.kind !== 'flown') throw new Error('Expected a flight');
    const view = describeFlight(built.run, launched.flight, moment({ burn: 'transfer', route: 1 }));
    expect(view.phases.map((phase) => phase.label)).toEqual(['Takeoff', 'Transfer']);
    expect(view.log.map((row) => row.label)).toEqual(['Takeoff', 'Transfer']);
    expect(view.route).toMatchObject({ to: 'Heliopause', toSprite: 'body_heliopause', share: 1 });
  });
});
