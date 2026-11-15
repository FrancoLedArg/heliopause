// The Hop playback's HUD as words and numbers: the phase strip, the Fuel bar and the flight log.
// Every figure comes from the simulation's flight; the playback's moment only says how far along it is.
import type { FlightMoment } from '../game/scenes/flightPlayback.ts';
import { bodySprite, HELIOPAUSE_SPRITE } from '../game/scenes/landedView.ts';
import { findBody, metersPerSecond, type HopFlight, type Run } from '../game/sim/index.ts';
import { BURN_LABEL, deltaVBar, type DeltaVBarBurn, type DeltaVBarView } from './deltaVBarView.ts';
import { formatDeltaVKmS, kmPerSecondFigure } from './format.ts';

export interface PhaseView {
  readonly label: string;
  readonly state: 'done' | 'current' | 'next';
}

export interface LogRow {
  readonly label: string;
  readonly state: 'done' | 'ran-out' | 'burning' | 'waiting';
  readonly estimate: string;
  /** The Δv the Burn took; "burning…" while it runs, a dash before it starts. */
  readonly actual: string;
  /** Against the estimate, "+2%"; "ran out" for the Burn the Fuel ran dry in; empty until done. */
  readonly change: string;
}

/** The route inset: where the Hop starts and ends, and how far along it is. */
export interface RouteView {
  readonly from: string;
  readonly to: string;
  /**
   * Texture keys of the two ends' sprites (`public/assets/sprites/<key>.png`). The Heliopause's may
   * not be in the manifest yet: check `hasAsset` and draw its stand-in until it is.
   */
  readonly fromSprite: string;
  readonly toSprite: string;
  /** 0 at the departure Body, 1 at the target (a Body, or the Heliopause). */
  readonly share: number;
}

export interface FlightView {
  readonly route: RouteView;
  readonly phases: readonly PhaseView[];
  /** The Burns as the shared Δv bar: flown ones at their actual cost, with the estimate's tick. */
  readonly bar: DeltaVBarView;
  /** How much of the bar the Burns have used so far, as a fraction of its length, 0 to 1. */
  readonly drained: number;
  /** "5.2 of 12.4 km/s": the Δv left against the Δv at Launch. */
  readonly deltaVLeft: string;
  /** The exact figures, Burn by Burn: behind "Tell me more". */
  readonly log: readonly LogRow[];
}

/** What the HUD shows of `flight` at `moment` (undefined before the first moment: Takeoff about to burn). */
export function describeFlight(
  before: Run,
  flight: HopFlight,
  moment: FlightMoment | undefined,
): FlightView {
  const current = moment?.burn ?? 'takeoff';
  const logged = moment?.logged ?? 0;
  const currentIndex = flight.burns.findIndex((result) => result.burn === current);
  return {
    route: describeRoute(before, flight, moment),
    phases: flight.burns.map(({ burn }, index) => ({
      label: BURN_LABEL[burn],
      state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'next',
    })),
    ...describeBar(flight, moment),
    log: flight.burns.map((result, index): LogRow => {
      const label = BURN_LABEL[result.burn];
      // km/s throughout, like the Hop plan and the Hop report these rows are checked against.
      const estimate = formatDeltaVKmS(result.estimated);
      if (index < logged && result.status === 'completed') {
        return {
          label,
          state: 'done',
          estimate,
          actual: formatDeltaVKmS(result.actual),
          change: signedPercent(result.actual / result.estimated - 1),
        };
      }
      if (index < logged && result.status === 'ran-out') {
        return {
          label,
          state: 'ran-out',
          estimate,
          actual: `${kmPerSecondFigure(result.delivered)} of ${formatDeltaVKmS(result.actual)}`,
          change: 'ran out',
        };
      }
      if (index === logged && result.burn === current && moment?.thrusting !== false) {
        return { label, state: 'burning', estimate, actual: 'burning…', change: '' };
      }
      return { label, state: 'waiting', estimate, actual: '—', change: '' };
    }),
  };
}

/**
 * The Δv bar at this moment, and how much of it the Burns have drained. A Burn that is done (or ran
 * out) counts at what it took; the one under way drains as its part of the playback goes by, never
 * past what the Fuel delivers.
 */
function describeBar(
  flight: HopFlight,
  moment: FlightMoment | undefined,
): Pick<FlightView, 'bar' | 'drained' | 'deltaVLeft'> {
  const logged = moment?.logged ?? 0;
  const { availableDeltaV } = flight.plan;
  const burns = flight.burns.map((result, index): DeltaVBarBurn => {
    const flown = index < logged && result.status !== 'not-flown';
    return {
      burn: result.burn,
      estimate: result.estimated,
      actual: flown ? result.actual : undefined,
    };
  });
  const bar = deltaVBar(burns, availableDeltaV);
  let used = 0;
  flight.burns.forEach((result, index) => {
    if (result.status === 'not-flown') return;
    const took = result.status === 'ran-out' ? result.delivered : result.actual;
    if (index < logged) used += took;
    else if (index === logged && moment?.burn === result.burn && moment.thrusting) {
      used += Math.min(Math.max(moment.progress, 0), 1) * took;
    }
  });
  const scale = Math.max(bar.needed, availableDeltaV);
  const left = Math.max(availableDeltaV - used, 0);
  return {
    bar,
    drained: scale > 0 ? Math.min(used / scale, 1) : 0,
    deltaVLeft: `${kmPerSecondFigure(metersPerSecond(left))} of ${formatDeltaVKmS(availableDeltaV)}`,
  };
}

/** A change as a whole signed percentage: "+2%", "−4%", "±0%". */
function signedPercent(share: number): string {
  const percent = Math.round(share * 100);
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : '±';
  return `${sign}${String(Math.abs(percent))}%`;
}

function describeRoute(
  before: Run,
  flight: HopFlight,
  moment: FlightMoment | undefined,
): RouteView {
  const body = (id: typeof flight.plan.fromId) => {
    const found = findBody(before.starSystem, id);
    if (!found) throw new Error(`No Body ${id}`);
    return found;
  };
  const from = body(flight.plan.fromId);
  const to = flight.plan.destination === 'body' ? body(flight.plan.toId) : undefined;
  return {
    from: from.name,
    to: to?.name ?? 'Heliopause',
    fromSprite: bodySprite(before, from),
    toSprite: to ? bodySprite(before, to) : HELIOPAUSE_SPRITE,
    share: Math.min(Math.max(moment?.route ?? 0, 0), 1),
  };
}
