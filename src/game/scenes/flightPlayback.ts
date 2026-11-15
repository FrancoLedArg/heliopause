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

/** `full` playback, or the one played when the player prefers reduced motion (shorter cuts, same Cruise). */
export type Pace = 'full' | 'reduced';

/**
 * The shots of a Hop's playback, like a short film (spec #200). The Takeoff Burn is the Takeoff shot,
 * the Transfer Burn is the Cruise then the Approach, and the Landing Burn is the Landing shot. These
 * are names for what is on screen, not domain terms: the Burns are unchanged.
 */
export type Shot = 'takeoff' | 'cruise' | 'approach' | 'landing';

/**
 * How long each shot lasts, in ms at normal speed (presentation tuning; the 2-minute Cruise is the
 * human's amendment on #200). The Cruise is gameplay time, where Cruise events will play (#210), so
 * it keeps its real length under reduced motion. The Approach has no length until #205 draws it:
 * until then the Cruise hands straight to the Landing.
 */
export const SHOT_MS: Readonly<Record<Pace, Readonly<Record<Shot, number>>>> = {
  full: { takeoff: 2800, cruise: 120_000, approach: 0, landing: 2800 },
  reduced: { takeoff: 1000, cruise: 120_000, approach: 0, landing: 1000 },
};

/**
 * The share of the Landing at which the Spacecraft touches down and its engine cuts: the rest is the
 * smoke settling round it before the Landed view (presentation tuning).
 */
export const TOUCHDOWN = 0.86;

/**
 * The Transfer's boost: the engine fires for this long (ms) at the start of the Cruise, then the
 * Spacecraft coasts the rest of the way. The whole engine window sits inside the Cruise, so a Hop that
 * Fell Short in the Transfer always cuts out in the Cruise and never reaches the Approach.
 */
export const CRUISE_BOOST_MS = 8000;

/** How much faster the fast-forward plays the Hop. It only scales the clock: the outcome is settled already. */
export const FAST_FORWARD = 4;

/** After a failed Burn cuts out, the playback holds this long (ms) on what happened before it ends. */
export const AFTERMATH_MS: Readonly<Record<Pace, number>> = { full: 1600, reduced: 600 };

/**
 * The systems check (presentation tuning, ms of Cruise time): the first light comes on this long into
 * the Cruise, and each next one this long after the one before.
 */
const SYSTEMS_CHECK = { first: 1200, step: 650 } as const;

/** The Cruise clock: real Cruise time, the hook Cruise events read (#210). */
export interface CruiseClock {
  /** ms of Cruise played so far. */
  readonly elapsed: number;
  /** ms the Cruise lasts (shorter than planned when the engine died in it). */
  readonly total: number;
}

/** A window of the playback, in ms from Launch. */
export interface PlaybackWindow {
  readonly start: number;
  readonly length: number;
}

/** One shot as played: where it starts and ends, in ms from Launch. */
export interface ShotSpan {
  readonly shot: Shot;
  readonly start: number;
  readonly end: number;
}

/** One moment of the playback. */
export interface FlightMoment {
  /** The Burn on screen. */
  readonly burn: Burn;
  /** How far through that Burn's part of the playback, 0 to 1. */
  readonly progress: number;
  /** The shot on screen, and how far through it, 0 to 1. */
  readonly shot: Shot;
  readonly shotProgress: number;
  /** The Cruise clock while the Cruise is on screen; `undefined` in every other shot. */
  readonly cruise: CruiseClock | undefined;
  /** Whether the engine is firing. */
  readonly thrusting: boolean;
  readonly fuel: Kilograms;
  /** How many Burns are done and in the flight log, in order. */
  readonly logged: number;
  /** How far along the whole route, 0 to 1 (each Burn an equal share); holds where the engine cut out. */
  readonly route: number;
  /** The playback is over: hand off to the Landed view or the report. */
  readonly ended: boolean;
}

export interface FlightPlayback {
  /** ms from Launch to the end of the playback. */
  readonly duration: number;
  /** When the engine cut out for good: the Fuel ran dry, or (Arrived) the end. */
  readonly stopsAt: number;
  /** The shots as played, in order; a shot the Hop never reaches is left out. */
  readonly shots: readonly ShotSpan[];
  /**
   * The Cruise window, in ms from Launch, as played: it ends early when the engine died in it.
   * `undefined` when the Hop never reached the Cruise. Cruise events (#210, #197) play inside it.
   */
  readonly cruise: PlaybackWindow | undefined;
  /**
   * The Cruise events to draw in the Cruise's event layer, in Cruise time. Always empty for now: #210
   * brings the kinds and their schedule (from the Run's Cruise state) and plugs them in here.
   */
  readonly events: readonly CruiseEvent[];
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

/** The shots each Burn is played as, and how long each is, for this Hop. */
function shotsOfBurn(burn: Burn, pace: Pace, flight: HopFlight): readonly [Shot, number][] {
  const lengths = SHOT_MS[pace];
  switch (burn) {
    case 'takeoff':
      return [['takeoff', lengths.takeoff]];
    case 'transfer':
      // A Hop to the Heliopause has no Approach: the Jump follows the Cruise.
      return flight.plan.destination === 'heliopause'
        ? [['cruise', lengths.cruise]]
        : [
            ['cruise', lengths.cruise],
            ['approach', lengths.approach],
          ];
    case 'landing':
      return [['landing', lengths.landing]];
  }
}

/** When the engine fires in a Burn's span of `length` ms, as ms from the span's start. */
function thrustWindow(burn: Burn, length: number): { readonly from: number; readonly to: number } {
  switch (burn) {
    case 'takeoff':
      return { from: 0, to: length };
    case 'transfer':
      return { from: 0, to: Math.min(CRUISE_BOOST_MS, length) };
    case 'landing':
      return { from: 0, to: TOUCHDOWN * length };
  }
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
  const planned: ShotSpan[] = [];
  let clock = 0;
  let spent = 0;
  let stopsAt: number | undefined;
  for (const result of flight.burns) {
    if (result.status === 'not-flown') break;
    let shotStart = clock;
    for (const [shot, length] of shotsOfBurn(result.burn, pace, flight)) {
      if (length > 0) planned.push({ shot, start: shotStart, end: shotStart + length });
      shotStart += length;
    }
    const length = shotStart - clock;
    const thrust = thrustWindow(result.burn, length);
    const thrustStart = clock + thrust.from;
    const fullThrust = thrust.to - thrust.from;
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
  // A failed Burn's aftermath ends the playback: the shots it never reached are left out.
  const shots = planned
    .filter((span) => span.start < duration)
    .map((span) => ({ ...span, end: Math.min(span.end, duration) }));
  const cruiseSpan = shots.find((span) => span.shot === 'cruise');
  const cruise = cruiseSpan && {
    start: cruiseSpan.start,
    length: cruiseSpan.end - cruiseSpan.start,
  };
  const fuelAfter = (deltaV: number): Kilograms =>
    fuelAfterBurning(spacecraft, metersPerSecond(deltaV));

  const at = (ms: number): FlightMoment => {
    const t = Math.min(Math.max(ms, 0), duration);
    const index = Math.max(
      0,
      spans.findLastIndex((span) => span.start <= t),
    );
    const span = spans[index];
    const shot =
      shots[
        Math.max(
          0,
          shots.findLastIndex((s) => s.start <= t),
        )
      ];
    if (!span || !shot) throw new Error('A flown Hop has at least its Takeoff');
    const thrustShare =
      span.thrustEnd > span.thrustStart
        ? Math.min(Math.max((t - span.thrustStart) / (span.thrustEnd - span.thrustStart), 0), 1)
        : 1;
    const done = t >= span.thrustEnd;
    // A failed Burn's aftermath is not travel: the route holds where the engine cut out.
    const travelled = Math.min(t, stopsAt ?? duration);
    const share = Math.min((travelled - span.start) / span.length, 1);
    const shotLength = shot.end - shot.start;
    return {
      burn: span.burn,
      progress: Math.min((t - span.start) / span.length, 1),
      shot: shot.shot,
      shotProgress: shotLength > 0 ? Math.min((t - shot.start) / shotLength, 1) : 1,
      cruise:
        shot.shot === 'cruise' && cruise
          ? { elapsed: t - cruise.start, total: cruise.length }
          : undefined,
      thrusting: t >= span.thrustStart && !done,
      fuel: fuelAfter(span.spentBefore + thrustShare * (span.spentAfter - span.spentBefore)),
      logged: index + (done ? 1 : 0),
      route: (index + share) / flight.burns.length,
      ended: t >= duration,
    };
  };

  return { duration, stopsAt: stopsAt ?? duration, shots, cruise, events: [], at };
}

/**
 * Moves the playback on from `fromMs` by `realMs` of real time, at `rate(shot)` ms of playback per
 * real ms (fast-forward, and the test-only Cruise speed). The rate changes exactly where the shot
 * does, so a fast Cruise never skips into the Landing. Stops at the end of the playback.
 */
export function advancePlayback(
  playback: FlightPlayback,
  fromMs: number,
  realMs: number,
  rate: (shot: Shot) => number,
): number {
  let ms = fromMs;
  let left = realMs;
  while (left > 0 && ms < playback.duration) {
    const span = playback.shots.find((s) => s.start <= ms && ms < s.end);
    const end = span?.end ?? playback.duration;
    const speed = rate(span?.shot ?? 'takeoff');
    const needed = (end - ms) / speed;
    if (left < needed) return ms + left * speed;
    ms = end;
    left -= needed;
  }
  return Math.min(ms, playback.duration);
}

/** How many of `count` systems lights are lit at a moment of the Cruise: one after another early on, then all of them. */
export function systemsLit(cruise: CruiseClock | undefined, count: number): number {
  if (!cruise || cruise.elapsed < SYSTEMS_CHECK.first) return 0;
  return Math.min(
    count,
    1 + Math.floor((cruise.elapsed - SYSTEMS_CHECK.first) / SYSTEMS_CHECK.step),
  );
}

/**
 * A timed event drawn in the Cruise's event layer, between the starfield and the Spacecraft: the hook
 * for Cruise events (#210) and Debris fields (#197). Its times are ms of Cruise time.
 */
export interface CruiseEvent {
  readonly startsAt: number;
  readonly endsAt: number;
}
