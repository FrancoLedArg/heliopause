import { describe, expect, it } from 'vitest';
import { createRng } from '../game/lib/rng.ts';
import type { FlightMoment } from '../game/scenes/flightPlayback.ts';
import {
  findBody,
  flyHop,
  homePlanet,
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

const run = startRun(123, 'scout');
const moonId = homePlanet(run.starSystem).moons[0]?.id ?? run.starSystem.homePlanetId;
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
      estimate: '3,100 m/s',
      actual: '3,162 m/s',
      change: '+2%',
    });
    expect(view.log[1]).toMatchObject({ actual: '653 m/s', change: '−4%' });
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
      actual: '600 of 650 m/s',
      change: 'ran out',
    });
    expect(view.log[2]).toMatchObject({ state: 'waiting', actual: '—' });
  });

  it('reads every Δv in whole m/s, like the Hop plan, even above 10 km/s', () => {
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
      estimate: '14,100 m/s',
      actual: '13,923 of 14,812 m/s',
      change: 'ran out',
    });
    expect(view.log[2]).toMatchObject({ estimate: '1,580 m/s' });
  });

  it('reads the Fuel as tonnes of capacity, with the bar filled to the share left', () => {
    const half = kilograms(run.spacecraft.fuelCapacity / 2);
    const view = describeFlight(run, flight, moment({ fuel: half }));
    expect(view.fuel).toBe(
      `${(half / 1000).toFixed(1)} t of ${(run.spacecraft.fuelCapacity / 1000).toFixed(1)} t`,
    );
    expect(view.fuelShare).toBeCloseTo(0.5);
  });

  it('before the first moment arrives, shows the Fuel at launch with Takeoff about to burn', () => {
    const view = describeFlight(run, flight, undefined);
    expect(view.fuelShare).toBeCloseTo(run.spacecraft.fuelMass / run.spacecraft.fuelCapacity);
    expect(view.phases[0]?.state).toBe('current');
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
    const built = install({ ...startRun(1, 'lancer'), materials: materials(100) }, 2, 'jump-drive');
    if (built.kind !== 'installed') throw new Error('Expected an install');
    const launched = launchHop(built.run, HELIOPAUSE);
    if (launched.kind !== 'flown') throw new Error('Expected a flight');
    const view = describeFlight(built.run, launched.flight, moment({ burn: 'transfer', route: 1 }));
    expect(view.phases.map((phase) => phase.label)).toEqual(['Takeoff', 'Transfer']);
    expect(view.log.map((row) => row.label)).toEqual(['Takeoff', 'Transfer']);
    expect(view.route).toMatchObject({ to: 'Heliopause', toSprite: 'body_heliopause', share: 1 });
  });
});
