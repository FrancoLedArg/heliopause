// The Hop playback's HUD as words and numbers: the phase strip, the Fuel bar and the flight log.
// Every figure comes from the simulation's flight; the playback's moment only says how far along it is.
import type { FlightMoment } from '../game/scenes/flightPlayback.ts';
import { BURNS, type Burn, type HopFlight, type Run } from '../game/sim/index.ts';
import { formatDeltaV, formatFuel } from './format.ts';

const BURN_LABEL: Record<Burn, string> = {
  takeoff: 'Takeoff',
  transfer: 'Transfer',
  landing: 'Landing',
};

const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

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

export interface FlightView {
  readonly phases: readonly PhaseView[];
  /** "10.4 t of 12.0 t". */
  readonly fuel: string;
  /** Fuel left as a share of capacity, 0 to 1, for the bar. */
  readonly fuelShare: number;
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
  const fuel = moment?.fuel ?? flight.fuelAtLaunch;
  const capacity = before.spacecraft.fuelCapacity;
  const currentIndex = BURNS.indexOf(current);
  return {
    phases: BURNS.map((burn, index) => ({
      label: BURN_LABEL[burn],
      state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'next',
    })),
    fuel: `${formatFuel(fuel)} of ${formatFuel(capacity)}`,
    fuelShare: Math.min(Math.max(fuel / capacity, 0), 1),
    log: flight.burns.map((result, index): LogRow => {
      const label = BURN_LABEL[result.burn];
      const estimate = formatDeltaV(result.estimated);
      if (index < logged && result.status === 'completed') {
        return {
          label,
          state: 'done',
          estimate,
          actual: formatDeltaV(result.actual),
          change: signedPercent(result.actual / result.estimated - 1),
        };
      }
      if (index < logged && result.status === 'ran-out') {
        return {
          label,
          state: 'ran-out',
          estimate,
          actual: `${WHOLE.format(result.delivered)} of ${formatDeltaV(result.actual)}`,
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

/** A change as a whole signed percentage: "+2%", "−4%", "±0%". */
function signedPercent(share: number): string {
  const percent = Math.round(share * 100);
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : '±';
  return `${sign}${String(Math.abs(percent))}%`;
}
