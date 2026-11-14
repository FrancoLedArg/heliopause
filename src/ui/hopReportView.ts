// The Hop report as words and numbers: what each Burn cost against its estimate, the Margin left and
// the simulation's plain-language why. Every figure comes from the flight; nothing is recomputed here.
import {
  BURNS,
  findBody,
  marginShare,
  metersPerSecond,
  type Burn,
  type BurnResult,
  type HopFlight,
  type MetersPerSecond,
  type Run,
} from '../game/sim/index.ts';
import { formatPlanDeltaV as formatDeltaV } from './format.ts';

const BURN_LABEL: Record<Burn, string> = {
  takeoff: 'Takeoff',
  transfer: 'Transfer',
  landing: 'Landing',
};

export interface ReportRow {
  readonly label: string;
  readonly estimate: string;
  /** The Δv the Burn took; for the Burn that ran out, what was delivered of what it needed. */
  readonly actual: string;
  /** Against the estimate, "+2%"; "ran out" or "not flown" for the Burns the Fuel did not cover. */
  readonly change: string;
}

export interface ReportView {
  readonly title: 'Arrived' | 'Fell Short' | 'Crashed';
  /** One line saying what happened, before the table. */
  readonly headline: string;
  readonly rows: readonly ReportRow[];
  /** The Margin left after the Hop, or that none was left. */
  readonly margin: string;
  /** The simulation's explanation, as written. */
  readonly why: string;
}

/** What the report shows for `flight`, flown from the Run `before`. */
export function describeReport(before: Run, flight: HopFlight): ReportView {
  const { outcome } = flight;
  const targetName = findBody(before.starSystem, flight.plan.toId)?.name ?? flight.plan.toId;
  const rows = BURNS.map((burn) => {
    const result = flight.burns.find((r) => r.burn === burn);
    if (!result) throw new Error(`Flight has no ${burn} Burn`);
    return row(result);
  });
  const { margin } = flight.plan;
  // The same minus sign the Hop plan uses.
  const share = Math.round(Math.abs(marginShare(flight.plan)) * 100);
  const planned = `planned ${margin < 0 ? '−' : ''}${formatDeltaV(metersPerSecond(Math.abs(margin)))}${share < 100 ? `, ${share}%` : ''}`;
  switch (outcome.kind) {
    case 'arrived':
      return {
        title: 'Arrived',
        headline: `Landed on ${targetName}.`,
        rows,
        margin: `Margin left: ${formatDeltaV(flight.deltaVRemaining)} of Δv (${planned})`,
        why: flight.why,
      };
    case 'fell-short':
      return {
        title: 'Fell Short',
        headline: `Fuel ran out during the ${BURN_LABEL[outcome.burn]}, short by ${formatDeltaV(outcome.shortfall)}.`,
        rows,
        margin: `Margin: none left (${planned})`,
        why: flight.why,
      };
    case 'crashed':
      return {
        title: 'Crashed',
        headline: `The Transfer succeeded, but the Landing lacked ${formatDeltaV(outcome.shortfall)} of Δv.`,
        rows,
        margin: `Margin: none left (${planned})`,
        why: flight.why,
      };
  }
}

function row(result: BurnResult): ReportRow {
  const label = BURN_LABEL[result.burn];
  const estimate = formatDeltaV(result.estimated);
  switch (result.status) {
    case 'completed':
      return {
        label,
        estimate,
        actual: formatDeltaV(result.actual),
        change: signedPercent(result.actual / result.estimated - 1),
      };
    case 'ran-out':
      return {
        label,
        estimate,
        actual: deliveredOf(result.delivered, result.actual),
        change: 'ran out',
      };
    case 'not-flown':
      return { label, estimate, actual: '—', change: 'not flown' };
  }
}

/** "13,889 of 14,311 m/s": what the last Fuel gave of what the Burn needed, the unit said once. */
function deliveredOf(delivered: MetersPerSecond, needed: MetersPerSecond): string {
  return `${formatDeltaV(delivered).replace(' m/s', '')} of ${formatDeltaV(needed)}`;
}

/** A change as a whole signed percentage: "+2%", "−4%", "±0%". */
function signedPercent(share: number): string {
  const percent = Math.round(share * 100);
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : '±';
  return `${sign}${String(Math.abs(percent))}%`;
}
