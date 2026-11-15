// The Hop plan as words and numbers for the player. Every figure comes from the simulation's `HopPlan`;
// this file only formats it and decides how loudly to flag a low Success Chance.
import {
  astronomicalUnits,
  findBody,
  isDepleted,
  marginShare,
  metersPerSecond,
  BURNS,
  type Body,
  type Burn,
  type HopPlan,
  type MetersPerSecond,
  type Run,
} from '../game/sim/index.ts';
import {
  formatDistanceAu,
  formatFuel,
  formatGravity,
  formatMass,
  formatMarginShare,
  formatPercent,
  formatPlanDeltaV,
} from './format.ts';

/** Below this Success Chance the plan is flagged as risky (presentation, not a game rule). */
export const LOW_SUCCESS_BELOW = 0.7;

const BURN_LABEL: Record<Burn, string> = {
  takeoff: 'Takeoff',
  transfer: 'Transfer',
  landing: 'Landing',
};

/** What Δv is, and why the plan's Available line shows the mass and Fuel behind it. Shown under the chart. */
export const DELTA_V_EXPLANATION =
  'Δv is how much your speed can change: every Burn spends some, and a heavier craft gets less from the same Fuel.';

/** Warning when the Fuel cannot cover even the estimated Δv. */
const NOT_ENOUGH = 'Not enough Δv for this Hop';

/** The Transfer between two Bodies of one planet is a short climb within that planet's pull. */
const SAME_PLANET = "stay in one planet's pull";

export interface HopPlanView {
  readonly burns: readonly {
    readonly label: string;
    readonly estimate: string;
    /** Why this Burn costs what it does, from the Bodies' own properties; one short line. */
    readonly reason: string;
  }[];
  readonly needed: string;
  readonly available: string;
  /** What the available Δv is computed from, e.g. "4.0 t craft + 21.0 t Fuel". */
  readonly availableBasis: string;
  /** Signed, with its share of the estimate while that share is under 100%: "+220 m/s (5%)". */
  readonly margin: string;
  readonly marginIsShort: boolean;
  readonly successChance: string;
  readonly low: boolean;
  /**
   * Words that flag a low Success Chance, or stronger a Margin below zero (so it is never colour
   * alone); undefined when neither.
   */
  readonly warning: string | undefined;
  /** Says in words that the target gives nothing more, when it is Depleted. */
  readonly yieldNote: string | undefined;
  /** The plan in one sentence, for a live region. */
  readonly summary: string;
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
    estimate: formatPlanDeltaV(estimates[burn]),
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
  const marginDeltaV = formatPlanDeltaV(metersPerSecond(Math.abs(plan.margin)));
  const low = short || plan.successChance < LOW_SUCCESS_BELOW;
  const needed = formatPlanDeltaV(plan.totalEstimate);
  const available = formatPlanDeltaV(plan.availableDeltaV);
  const successChance = formatPercent(plan.successChance);
  return {
    burns: burnRows(run, plan, from, to),
    needed,
    available,
    availableBasis: `${formatMass(run.spacecraft.dryMass)} craft + ${formatFuel(run.spacecraft.fuelMass)} Fuel`,
    // A share in the hundreds says little, so a Margin as big as the estimate shows only its Δv.
    margin: `${short ? '−' : '+'}${marginDeltaV}${share ? ` (${share})` : ''}`,
    marginIsShort: short,
    successChance,
    low,
    warning: short ? NOT_ENOUGH : low ? 'Low chance: may run dry' : undefined,
    yieldNote: depleted ? 'Depleted: this Hop will yield nothing.' : undefined,
    summary: `Hop plan for ${targetName}: needs ${needed}, you have ${available}, success chance ${successChance}.${depleted ? ' It is Depleted and will yield nothing.' : ''}`,
  };
}
