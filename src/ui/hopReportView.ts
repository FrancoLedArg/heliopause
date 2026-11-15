// The Hop report as words and numbers: what each Burn cost against its estimate, the Margin left and
// the simulation's plain-language why. Every figure comes from the flight; nothing is recomputed here. The one exception is the Drill's
// factor, read from the Run before the Hop (a Hop never changes the Slots) to name it on the Collected line.
import {
  drillMultiplier,
  type Collection,
  findBody,
  marginShare,
  metersPerSecond,
  type Burn,
  type BurnResult,
  type HopFlight,
  type MetersPerSecond,
  type Run,
} from '../game/sim/index.ts';
import { formatFuel, formatMarginShare, formatPlanDeltaV as formatDeltaV } from './format.ts';

/** Shown the first time a Run collects Fuel: real missions, not a claim of NASA's (docs/research/ice-and-resources.md). */
const ICE_TO_PROPELLANT =
  'Real missions plan to split lunar water ice into hydrogen and oxygen, so rockets could refuel on the Moon.';

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
  readonly title: 'Arrived' | 'Reached the Heliopause' | 'Fell Short' | 'Crashed';
  /** One line saying what happened, before the table. */
  readonly headline: string;
  readonly rows: readonly ReportRow[];
  /** The Margin left after the Hop, or that none was left. */
  readonly margin: string;
  /** What landing collected, in words; absent when the Hop did not arrive. */
  readonly collected?: string;
  /** The ice-to-propellant line, the first time the Run collects Fuel. */
  readonly note?: string;
  /** The simulation's explanation, as written. */
  readonly why: string;
}

/** What the report shows for `flight`, flown from the Run `before`. */
export function describeReport(before: Run, flight: HopFlight): ReportView {
  const { outcome } = flight;
  const { plan } = flight;
  const targetName =
    plan.destination === 'body'
      ? (findBody(before.starSystem, plan.toId)?.name ?? plan.toId)
      : 'the Heliopause';
  const rows = flight.burns.map(row);
  const { margin } = flight.plan;
  // The same minus sign the Hop plan uses.
  const share = formatMarginShare(marginShare(flight.plan));
  const planned = `planned ${margin < 0 ? '−' : '+'}${formatDeltaV(metersPerSecond(Math.abs(margin)))}${share ? `, ${share}` : ''}`;
  switch (outcome.kind) {
    case 'arrived':
      return {
        title: 'Arrived',
        headline: `Landed on ${targetName}.`,
        rows,
        margin: `Margin left: ${formatDeltaV(flight.deltaVRemaining)} of Δv (${planned})`,
        ...(flight.collection && {
          collected: describeCollection(flight.collection, drillMultiplier(before.spacecraft)),
          ...(flight.collection.kind === 'fuel' &&
            !hadFuelBefore(before) && { note: ICE_TO_PROPELLANT }),
        }),
        why: flight.why,
      };
    // A placeholder until the Jump (#157) takes over from here.
    case 'reached-heliopause':
      return {
        title: 'Reached the Heliopause',
        headline: 'The Spacecraft reached the edge of the Star System.',
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

/** Whether an Icy Body has already given up its Fuel in `run`. */
function hadFuelBefore(run: Run): boolean {
  return run.depleted.some((id) => {
    const body = findBody(run.starSystem, id);
    return body?.landable && body.composition === 'icy';
  });
}

/**
 * What a landing collected, as one line for the player. The Drill, when there is one, is named
 * inside the "Collected" clause: the report has no room for another line.
 */
function describeCollection(collection: Collection, drill: number): string {
  // A Drill is only credited for a yield it produced: nothing collected, nothing to credit.
  const collectedSomething = collection.kind !== 'depleted' && collection.collected > 0;
  const by = drill > 1 && collectedSomething ? ` (Drill ×${String(drill)})` : '';
  switch (collection.kind) {
    case 'fuel':
      return collection.leftBehind > 0
        ? `Collected ${formatFuel(collection.collected)} of Fuel${by}; ${formatFuel(collection.leftBehind)} left behind: the Tank is full.`
        : `Collected ${formatFuel(collection.collected)} of Fuel${by}.`;
    case 'materials':
      return `Collected ${String(collection.collected)} Materials${by}.`;
    case 'depleted':
      return 'Nothing to collect: this Body is Depleted.';
  }
}
