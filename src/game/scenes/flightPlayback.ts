// The Hop playback's clock: what is on screen at each moment of a flown Hop. Pure, so the Flight
// scene (which draws it) and the React HUD (which reads it) agree, and the rules run in Node.
// The simulation has already settled the outcome; this only paces it.
import {
  fuelAfterBurning,
  metersPerSecond,
  type Burn,
  type HopFlight,
  type Kilograms,
  type Spacecraft,
} from '../sim/index.ts';

/** `full` playback, or the shorter one played when the player prefers reduced motion. */
export type Pace = 'full' | 'reduced';

/** How long each Burn's part of the playback lasts, in ms (presentation tuning). */
export const PHASE_MS: Readonly<Record<Pace, Readonly<Record<Burn, number>>>> = {
  full: { takeoff: 3800, transfer: 5200, landing: 3800 },
  reduced: { takeoff: 1300, transfer: 1500, landing: 1300 },
};

/**
 * The share of each Burn's part during which its engine fires. The Transfer boosts, then coasts
 * toward the target; Takeoff and Landing hover on their thrusters the whole way.
 */
const THRUST: Readonly<Record<Burn, { readonly from: number; readonly to: number }>> = {
  takeoff: { from: 0, to: 1 },
  transfer: { from: 0, to: 0.55 },
  landing: { from: 0, to: 1 },
};

/** After a failed Burn cuts out, the playback holds this long (ms) on what happened before it ends. */
export const AFTERMATH_MS: Readonly<Record<Pace, number>> = { full: 1600, reduced: 600 };

/** One moment of the playback. */
export interface FlightMoment {
  /** The Burn on screen. */
  readonly burn: Burn;
  /** How far through that Burn's part of the playback, 0 to 1. */
  readonly progress: number;
  /** Whether the engine is firing. */
  readonly thrusting: boolean;
  readonly fuel: Kilograms;
  /** How many Burns are done and in the flight log, in order. */
  readonly logged: number;
  /** The playback is over: hand off to the Landed view or the report. */
  readonly ended: boolean;
}

export interface FlightPlayback {
  /** ms from Launch to the end of the playback. */
  readonly duration: number;
  /** When the engine cut out for good: the Fuel ran dry, or (Arrived) the end. */
  readonly stopsAt: number;
  /** What is on screen `ms` after Launch; clamped to the playback. */
  readonly at: (ms: number) => FlightMoment;
}

interface Span {
  readonly burn: Burn;
  readonly start: number;
  readonly length: number;
  /** When the engine starts and stops in this span (ms from Launch). */
  readonly thrustStart: number;
  readonly thrustEnd: number;
  /** Δv spent before this Burn and by its end (what the Fuel delivered, if it ran out). */
  readonly spentBefore: number;
  readonly spentAfter: number;
}

/**
 * Paces a flown Hop. `spacecraft` is the Spacecraft at Launch: the Fuel shown at each moment is
 * what the rocket equation leaves after the Δv actually spent so far, so the bar drains with the
 * real cost of each Burn and reads exactly what the simulation left when the Burn ends.
 */
export function flightPlayback(
  spacecraft: Spacecraft,
  flight: HopFlight,
  pace: Pace,
): FlightPlayback {
  if (spacecraft.fuelMass !== flight.fuelAtLaunch) {
    throw new Error('flightPlayback needs the Spacecraft as it was at Launch');
  }
  const spans: Span[] = [];
  let clock = 0;
  let spent = 0;
  let stopsAt: number | undefined;
  for (const result of flight.burns) {
    if (result.status === 'not-flown') break;
    const length = PHASE_MS[pace][result.burn];
    const thrust = THRUST[result.burn];
    const thrustStart = clock + thrust.from * length;
    const fullThrust = (thrust.to - thrust.from) * length;
    if (result.status === 'completed') {
      spans.push({
        burn: result.burn,
        start: clock,
        length,
        thrustStart,
        thrustEnd: thrustStart + fullThrust,
        spentBefore: spent,
        spentAfter: spent + result.actual,
      });
      spent += result.actual;
      clock += length;
      continue;
    }
    // The Fuel ran dry partway: the engine cuts out when the Δv it delivered is spent.
    const share = result.delivered / result.actual;
    const thrustEnd = thrustStart + share * fullThrust;
    spans.push({
      burn: result.burn,
      start: clock,
      length,
      thrustStart,
      thrustEnd,
      spentBefore: spent,
      spentAfter: spent + result.delivered,
    });
    stopsAt = thrustEnd;
    clock = thrustEnd + AFTERMATH_MS[pace];
  }
  const duration = clock;
  const fuelAfter = (deltaV: number): Kilograms =>
    fuelAfterBurning(spacecraft, metersPerSecond(deltaV));

  const at = (ms: number): FlightMoment => {
    const t = Math.min(Math.max(ms, 0), duration);
    const index = Math.max(
      0,
      spans.findLastIndex((span) => span.start <= t),
    );
    const span = spans[index];
    if (!span) throw new Error('A flown Hop has at least its Takeoff');
    const thrustShare =
      span.thrustEnd > span.thrustStart
        ? Math.min(Math.max((t - span.thrustStart) / (span.thrustEnd - span.thrustStart), 0), 1)
        : 1;
    const done = t >= span.thrustEnd;
    return {
      burn: span.burn,
      progress: Math.min((t - span.start) / span.length, 1),
      thrusting: t >= span.thrustStart && !done,
      fuel: fuelAfter(span.spentBefore + thrustShare * (span.spentAfter - span.spentBefore)),
      logged: index + (done ? 1 : 0),
      ended: t >= duration,
    };
  };

  return { duration, stopsAt: stopsAt ?? duration, at };
}
