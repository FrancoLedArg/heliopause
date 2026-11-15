// The Hop plan as words and numbers for the player. Every figure comes from the simulation's `HopPlan`;
// this file only formats it and decides how loudly to flag a low Success Chance.
import {
  arrivalDayFraction,
  astronomicalUnits,
  distanceBetween,
  findBody,
  timeOfDayWords,
  fuelAfterBurning,
  isDepleted,
  marginShare,
  metersPerSecond,
  plannedBurns,
  reachVerdict,
  REACH_VERDICT,
  BURNS,
  type Body,
  type Burn,
  type HopPlan,
  type Kilograms,
  type MetersPerSecond,
  type ReachVerdict,
  type Run,
} from '../game/sim/index.ts';
import {
  formatDistanceAu,
  formatFuel,
  formatGravity,
  formatMass,
  formatMarginShare,
  formatPercent,
  formatDeltaVKmS,
  kmPerSecondFigure,
} from './format.ts';
import { BURN_LABEL, deltaVBar, type DeltaVBarView } from './deltaVBarView.ts';

/** Below this Success Chance the plan is flagged as risky (presentation, not a game rule). */
export const LOW_SUCCESS_BELOW = REACH_VERDICT.inReach;

/** What Δv is, and why the plan's Available line shows the mass and Fuel behind it. Shown under the chart. */
export const DELTA_V_EXPLANATION =
  'Δv is how much your speed can change: every Burn spends some, and a heavier craft gets less from the same Fuel.';

/** The reach verdict as a short word and the kit badge whose shape says it (never colour alone). */
const VERDICTS: Readonly<
  Record<ReachVerdict, { word: string; frame: 'badge_ok' | 'badge_warning' | 'badge_alert' }>
> = {
  'in-reach': { word: 'In reach', frame: 'badge_ok' },
  marginal: { word: 'Marginal', frame: 'badge_warning' },
  'out-of-reach': { word: 'Out of reach', frame: 'badge_alert' },
};

/** Whether the Fuel on board reaches the target: the plan's one warning line (#190). */
export interface ReachView {
  readonly kind: ReachVerdict;
  readonly word: string;
  readonly frame: 'badge_ok' | 'badge_warning' | 'badge_alert';
  /** The accessible name: the word with what it is the verdict of. */
  readonly label: string;
}

/** The Transfer between two Bodies of one planet is a short climb within that planet's pull. */
const SAME_PLANET = "stay in one planet's pull";

/** The Fuel gauge: Fuel now and after the Hop, as masses and as shares of the Fuel capacity. */
export interface HopPlanFuel {
  readonly now: Kilograms;
  readonly after: Kilograms;
  readonly nowShare: number;
  readonly afterShare: number;
  readonly afterText: string;
  /** What the gauge shows, in words. */
  readonly label: string;
}

export interface HopPlanView {
  readonly burns: readonly {
    readonly label: string;
    readonly estimate: string;
    /** Why this Burn costs what it does, from the Bodies' own properties; one short line. */
    readonly reason: string;
  }[];
  /** The Burns against the available Δv, with the Margin as the gap. */
  readonly bar: DeltaVBarView;
  /** The Fuel on board now and after the Hop, if every Burn costs its estimate. */
  readonly fuel: HopPlanFuel;
  readonly needed: string;
  /** The needed Δv without its unit, for "7.8 of 22.1 km/s". */
  readonly neededFigure: string;
  readonly available: string;
  /** What the available Δv is computed from, e.g. "4.0 t craft + 36.0 t Fuel". */
  readonly availableBasis: string;
  /** Signed, with its share of the estimate while that share is under 100%: "+220 m/s (5%)". */
  readonly margin: string;
  readonly marginIsShort: boolean;
  readonly successChance: string;
  readonly low: boolean;
  /** Whether the Fuel reaches the target: an icon and a short word, never colour alone. */
  readonly reach: ReachView;
  /** True when the target is not Surveyed: the Landing estimate is cautious. */
  readonly unsurveyed: boolean;
  /** The target's local time on arrival (#334); none for the Heliopause. */
  readonly arrival: ArrivalView | undefined;
  /** The plan in one sentence, for a live region. */
  readonly summary: string;
}

/** The local day fraction at the target when the Spacecraft arrives, with its accessible name. */
export interface ArrivalView {
  readonly fraction: number;
  readonly label: string;
}

function arrivalView(run: Run, from: Body, to: Body | undefined): ArrivalView | undefined {
  if (!to) return undefined;
  const distance = distanceBetween(run.starSystem, from, to);
  const fraction = arrivalDayFraction(run.starSystem, to, run.gameHours, distance);
  return { fraction, label: `Arrives at ${timeOfDayWords(fraction)}` };
}

/** Why each Burn costs what it does: gravity of the Body you leave, the Transfer's distance, gravity of the target. */
function burnReasons(from: Body, to: Body): Record<Burn, string> {
  const gap = Math.abs(to.distanceFromStar - from.distanceFromStar);
  const transfer =
    gap === 0
      ? SAME_PLANET
      : `${to.distanceFromStar > from.distanceFromStar ? 'climb' : 'go'} ${formatDistanceAu(astronomicalUnits(gap))} ${
          to.distanceFromStar > from.distanceFromStar ? 'outward' : 'inward'
        }`;
  return {
    takeoff: leaveReason(from),
    transfer,
    landing: `land in ${formatGravity(to.surfaceGravity)} gravity`,
  };
}

const leaveReason = (from: Body): string => `leave ${formatGravity(from.surfaceGravity)} gravity`;

/** The Burns of a Hop to the Heliopause: leave the Body, then climb out to the edge of the Star System. */
function heliopauseReasons(run: Run, from: Body): Record<'takeoff' | 'transfer', string> {
  const gap = astronomicalUnits(run.starSystem.heliopauseRadius - from.distanceFromStar);
  return { takeoff: leaveReason(from), transfer: `climb ${formatDistanceAu(gap)} to the edge` };
}

/** One row of the plan: a Burn of the Hop, its estimate and its reason, both keyed by the same Burns. */
function burnRow<B extends Burn>(
  burn: B,
  estimates: Readonly<Record<B, MetersPerSecond>>,
  reasons: Readonly<Record<B, string>>,
): HopPlanView['burns'][number] {
  return {
    label: BURN_LABEL[burn],
    estimate: formatDeltaVKmS(estimates[burn]),
    reason: reasons[burn],
  };
}

/** The plan's Burn rows in the order they are flown: a Hop to the Heliopause has no Landing. */
function burnRows(run: Run, plan: HopPlan, from: Body, to: Body | undefined): HopPlanView['burns'] {
  if (plan.destination === 'heliopause') {
    const reasons = heliopauseReasons(run, from);
    return (['takeoff', 'transfer'] as const).map((burn) => burnRow(burn, plan.estimates, reasons));
  }
  if (!to) throw new Error(`Hop plan names unknown Body ${plan.toId}`);
  const reasons = burnReasons(from, to);
  return BURNS.map((burn) => burnRow(burn, plan.estimates, reasons));
}

/** The Fuel left if every Burn costs its estimate, the way the simulation burns it; none when short. */
function fuelGauge(run: Run, plan: HopPlan): HopPlanFuel {
  const { fuelMass: now, fuelCapacity } = run.spacecraft;
  const after = fuelAfterBurning(run.spacecraft, plan.totalEstimate);
  const share = (mass: Kilograms): number => (fuelCapacity > 0 ? mass / fuelCapacity : 0);
  return {
    now,
    after,
    nowShare: share(now),
    afterShare: share(after),
    afterText: formatFuel(after),
    label: `Fuel: ${formatFuel(now)} now, ${formatFuel(after)} after the Hop.`,
  };
}

function reachView(plan: HopPlan): ReachView {
  const kind = reachVerdict(plan);
  const { word, frame } = VERDICTS[kind];
  return { kind, word, frame, label: `Reach: ${word}` };
}

export function describeHopPlan(run: Run, plan: HopPlan): HopPlanView {
  const from = findBody(run.starSystem, plan.fromId);
  if (!from) throw new Error(`Hop plan names unknown Body ${plan.fromId}`);
  const to = plan.destination === 'body' ? findBody(run.starSystem, plan.toId) : undefined;
  if (plan.destination === 'body' && !to)
    throw new Error(`Hop plan names unknown Body ${plan.toId}`);
  const targetName = to?.name ?? 'the Heliopause';
  const short = plan.margin < 0;
  const depleted = to !== undefined && isDepleted(run, to.id);
  const share = formatMarginShare(marginShare(plan));
  const marginDeltaV = formatDeltaVKmS(metersPerSecond(Math.abs(plan.margin)));
  const unsurveyed = plan.destination === 'body' && plan.unsurveyed;
  const low = short || plan.successChance < LOW_SUCCESS_BELOW;
  const needed = formatDeltaVKmS(plan.totalEstimate);
  const available = formatDeltaVKmS(plan.availableDeltaV);
  const successChance = formatPercent(plan.successChance);
  const reach = reachView(plan);
  return {
    burns: burnRows(run, plan, from, to),
    bar: deltaVBar(plannedBurns(plan), plan.availableDeltaV),
    fuel: fuelGauge(run, plan),
    needed,
    neededFigure: kmPerSecondFigure(plan.totalEstimate),
    available,
    availableBasis: `${formatMass(run.spacecraft.dryMass)} craft + ${formatFuel(run.spacecraft.fuelMass)} Fuel`,
    // A share in the hundreds says little, so a Margin as big as the estimate shows only its Δv.
    margin: `${short ? '−' : '+'}${marginDeltaV}${share ? ` (${share})` : ''}`,
    marginIsShort: short,
    successChance,
    low,
    reach,
    unsurveyed,
    arrival: arrivalView(run, from, to),
    summary: `Hop plan for ${targetName}${unsurveyed ? ' (Unsurveyed)' : ''}: needs ${needed}, you have ${available}, success chance ${successChance}, ${reach.word}.${depleted ? ' It is Depleted and will yield nothing.' : ''}`,
  };
}
