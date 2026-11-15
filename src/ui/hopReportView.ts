// The Hop report as words and numbers: what each Burn cost against its estimate, the Margin left and
// the simulation's plain-language why. Every figure comes from the flight; nothing is recomputed here. The one exception is the Drill's
// factor, read from the Run before the Hop (a Hop never changes the Slots) to credit it in the icon row.
import {
  COMPONENTS,
  drillMultiplier,
  type ComponentKind,
  type CruiseEventKind,
  FUEL_NOTE,
  type Collection,
  findBody,
  marginShare,
  metersPerSecond,
  type BurnResult,
  type HopFlight,
  type MetersPerSecond,
  type Run,
} from '../game/sim/index.ts';
import { BURN_LABEL, deltaVBar, type DeltaVBarBurn, type DeltaVBarView } from './deltaVBarView.ts';
import {
  formatDeltaVKmS as formatDeltaV,
  formatFuel,
  formatMarginShare,
  kmPerSecondFigure,
} from './format.ts';
import type { YieldResource } from './yieldIcon.ts';

export interface ReportRow {
  readonly label: string;
  readonly estimate: string;
  /** The Δv the Burn took; for the Burn that ran out, what was delivered of what it needed. */
  readonly actual: string;
  /** Against the estimate, "+2%"; "ran out" or "not flown" for the Burns the Fuel did not cover. */
  readonly change: string;
}

/**
 * One entry of the report's icon row (show, don't tell): what the Hop changed, as an icon and an
 * amount. Today only what landing gathered; Cruise events and Debris join the row later.
 */
export interface ReportGain {
  readonly resource: YieldResource;
  /** What came aboard, signed: "+5.1 t" of Fuel, "+12" Materials. */
  readonly amount: string;
  /** The Drill's factor when it multiplied the yield, "×1.5". */
  readonly drill?: string;
  /** The Fuel that stayed on the ground because the Tank was full, "5.7 t". */
  readonly leftBehind?: string;
  /** The whole entry in words, for its accessible name. */
  readonly name: string;
}

/**
 * One Cruise entry of the report's icon row (#250): an event, with a tick when its Damage was
 * Repaired in the Cruise, or the Fuel the leaks lost. Its words are its accessible name.
 */
export type CruiseMark =
  | {
      readonly kind: 'event';
      readonly event: CruiseEventKind;
      /** The kind of Component it Damaged. */
      readonly component: ComponentKind;
      readonly repaired: boolean;
      readonly name: string;
    }
  | { readonly kind: 'fuel-lost'; readonly amount: string; readonly name: string };

export interface ReportView {
  readonly title: 'Arrived' | 'Reached the Heliopause' | 'Fell Short' | 'Crashed';
  /** Each Burn's estimate against its actual Δv, as the bar draws them (a Burn that never flew is left out). */
  readonly bar: DeltaVBarView;
  /** The Burn table, behind "Tell me more". */
  readonly rows: readonly ReportRow[];
  /** The Margin left after the Hop, or that none was left; behind "Tell me more". */
  readonly margin: string;
  /** The icon row: what landing gathered. Empty when nothing came aboard (a Depleted Body, a failed Hop). */
  readonly gains: readonly ReportGain[];
  /** The same row's Cruise entries: what the Cruise did (#250). Empty when nothing happened in it. */
  readonly cruise: readonly CruiseMark[];
  /** The real-missions fact (ice to propellant), the first time the Run collects Fuel; behind "Tell me more". */
  readonly fact?: string;
  /** The one line the report shows: why the Hop ended as it did, a single sentence. */
  readonly why: string;
  /** What happened, the simulation's first sentence ("Fuel ran out during the Transfer."); behind "Tell me more". */
  readonly outcomeLine?: string;
}

/** What the report shows for `flight`, flown from the Run `before`. */
export function describeReport(before: Run, flight: HopFlight): ReportView {
  const { outcome } = flight;
  const { plan } = flight;
  const rows = flight.burns.map(row);
  const bar = deltaVBar(flown(flight.burns), plan.availableDeltaV, { verb: 'Used' });
  const { why, outcomeLine } = splitWhy(flight);
  const { margin } = flight.plan;
  // The same minus sign the Hop plan uses.
  const share = formatMarginShare(marginShare(flight.plan));
  const planned = `planned ${margin < 0 ? '−' : '+'}${formatDeltaV(metersPerSecond(Math.abs(margin)))}${share ? `, ${share}` : ''}`;
  const cruise = cruiseMarks(before, flight);
  switch (outcome.kind) {
    case 'arrived':
      return {
        title: 'Arrived',
        cruise,
        bar,
        rows,
        margin: `Margin left: ${formatDeltaV(flight.deltaVRemaining)} of Δv (${planned})`,
        gains: gains(flight.collection, drillMultiplier(before.spacecraft)),
        ...(flight.collection?.kind === 'fuel' &&
          !hadFuelBefore(before) && { fact: FUEL_NOTE.text }),
        why,
        ...(outcomeLine !== undefined && { outcomeLine }),
      };
    // The game plays the Jump instead of this report; kept so every outcome has one.
    case 'reached-heliopause':
      return {
        title: 'Reached the Heliopause',
        cruise,
        gains: [],
        bar,
        rows,
        margin: `Margin left: ${formatDeltaV(flight.deltaVRemaining)} of Δv (${planned})`,
        why,
        ...(outcomeLine !== undefined && { outcomeLine }),
      };
    case 'fell-short':
      return {
        title: 'Fell Short',
        cruise,
        gains: [],
        bar,
        rows,
        margin: `Margin: none left (${planned})`,
        why,
        ...(outcomeLine !== undefined && { outcomeLine }),
      };
    case 'crashed':
      return {
        title: 'Crashed',
        cruise,
        gains: [],
        bar,
        rows,
        margin: `Margin: none left (${planned})`,
        why,
        ...(outcomeLine !== undefined && { outcomeLine }),
      };
  }
}

/** The Burns the bar draws: each with what it cost, the Burn that ran out with what the Fuel gave it. */
function flown(burns: readonly BurnResult[]): DeltaVBarBurn[] {
  return burns.flatMap((result): DeltaVBarBurn[] => {
    switch (result.status) {
      case 'completed':
        return [{ burn: result.burn, estimate: result.estimated, actual: result.actual }];
      case 'ran-out':
        return [{ burn: result.burn, estimate: result.estimated, actual: result.delivered }];
      case 'not-flown':
        return [];
    }
  });
}

/**
 * The report's one why line, and what waits behind "Tell me more". An Arrived or Heliopause Hop drops
 * the simulation's first sentence (it repeats the title and bar) and keeps the rest. A failed Hop
 * names the Burn that ran out and by how much, from the flight's own figures, and keeps the whole
 * explanation behind the toggle.
 */
function splitWhy(flight: HopFlight): { why: string; outcomeLine?: string } {
  const { outcome } = flight;
  if (outcome.kind === 'fell-short' || outcome.kind === 'crashed') {
    const burn = outcome.kind === 'crashed' ? 'landing' : outcome.burn;
    return {
      why: `Fuel ran out in the ${BURN_LABEL[burn]}: Δv short by ${formatDeltaV(outcome.shortfall)}.`,
      outcomeLine: flight.why,
    };
  }
  const [first = flight.why, ...rest] = flight.why.split(/(?<=[.!?])\s+/);
  return rest.length > 0 ? { why: rest.join(' '), outcomeLine: first } : { why: first };
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

/** "13.9 of 14.3 km/s": what the last Fuel gave of what the Burn needed, the unit said once. */
function deliveredOf(delivered: MetersPerSecond, needed: MetersPerSecond): string {
  return `${kmPerSecondFigure(delivered)} of ${formatDeltaV(needed)}`;
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
 * What a landing gathered, as the icon row's entries. The words that used to be the Collected line
 * travel in the entry's accessible name, the Drill named inside it.
 */
function gains(collection: Collection | null, drill: number): ReportGain[] {
  if (collection === null || collection.kind === 'depleted') return [];
  // A Drill is only credited for a yield it produced: nothing collected, nothing to credit.
  const drilled = drill > 1 && collection.collected > 0;
  const by = drilled ? ` (Drill ×${String(drill)})` : '';
  const credit = drilled ? { drill: `×${String(drill)}` } : {};
  switch (collection.kind) {
    case 'fuel': {
      const got = formatFuel(collection.collected);
      if (collection.leftBehind > 0) {
        const left = formatFuel(collection.leftBehind);
        return [
          {
            resource: 'fuel',
            amount: `+${got}`,
            ...credit,
            leftBehind: left,
            name: `Collected ${got} of Fuel${by}; ${left} left behind: the Tank is full.`,
          },
        ];
      }
      return [
        { resource: 'fuel', amount: `+${got}`, ...credit, name: `Collected ${got} of Fuel${by}.` },
      ];
    }
    case 'materials': {
      const got = String(collection.collected);
      return [
        {
          resource: 'materials',
          amount: `+${got}`,
          ...credit,
          name: `Collected ${got} Materials${by}.`,
        },
      ];
    }
  }
}

const EVENT_NAMES: Readonly<Record<CruiseEventKind, string>> = {
  'fuel-leak': 'Fuel leak',
  'debris-field': 'Debris field',
  'engine-fire': 'Engine fire',
  'solar-flare': 'Solar flare',
};

const PART_NAMES: Readonly<Record<ComponentKind, string>> = {
  engine: 'Engine',
  'fuel-tank': 'Fuel Tank',
  drill: 'Drill',
  'jump-drive': 'Jump Drive',
  radar: 'Radar',
  instrument: 'Instrument',
};

/** What the Cruise did, as icon-row entries: each event that Damaged a part, then the Fuel lost. */
function cruiseMarks(before: Run, flight: HopFlight): CruiseMark[] {
  const marks: CruiseMark[] = flight.cruiseEvents.flatMap((event): CruiseMark[] => {
    const id = event.slot === null ? null : before.spacecraft.slots[event.slot];
    if (id === null || id === undefined) return [];
    const component = COMPONENTS[id].kind;
    const repaired = event.endedAt !== null;
    const state = repaired ? 'Repaired' : 'still Damaged';
    return [
      {
        kind: 'event',
        event: event.kind,
        component,
        repaired,
        name: `${EVENT_NAMES[event.kind]} in the ${PART_NAMES[component]}: ${state}.`,
      },
    ];
  });
  if (flight.fuelLost > 0) {
    const lost = formatFuel(flight.fuelLost);
    marks.push({
      kind: 'fuel-lost',
      amount: `−${lost}`,
      name: `Lost ${lost} of Fuel to the leak.`,
    });
  }
  return marks;
}
