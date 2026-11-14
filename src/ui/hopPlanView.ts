// The Hop plan as words and numbers for the player. Every figure comes from the simulation's `HopPlan`;
// this file only formats it and decides how loudly to flag a low Success Chance.
import { BURNS, metersPerSecond, type Burn, type HopPlan, type Run } from '../game/sim/index.ts';
import { formatDeltaV, formatFuel, formatMass, formatPercent } from './format.ts';

/** Below this Success Chance the plan is flagged as risky (presentation, not a game rule). */
export const LOW_SUCCESS_BELOW = 0.7;

const BURN_LABEL: Record<Burn, string> = {
  takeoff: 'Takeoff',
  transfer: 'Transfer',
  landing: 'Landing',
};

/** One line of plain language: what Δv is, and why a heavier craft gets less of it. */
export const DELTA_V_EXPLANATION =
  'Δv is how much your speed can change. A heavier craft gets less from the same Fuel.';

export interface HopPlanView {
  readonly burns: readonly { readonly label: string; readonly estimate: string }[];
  readonly needed: string;
  readonly available: string;
  /** What the available Δv is computed from, e.g. "4.0 t craft + 21.0 t Fuel". */
  readonly availableBasis: string;
  /** Signed, with its share of the Δv needed: "+220 m/s (4.6%)". */
  readonly margin: string;
  readonly marginIsShort: boolean;
  readonly successChance: string;
  readonly low: boolean;
  /** Words that flag a low Success Chance (so it is never colour alone); undefined when not low. */
  readonly warning: string | undefined;
}

export function describeHopPlan(run: Run, plan: HopPlan): HopPlanView {
  const short = plan.margin < 0;
  const share = Math.abs(plan.margin / plan.totalEstimate) * 100;
  const sign = short ? '−' : '+';
  const low = plan.successChance < LOW_SUCCESS_BELOW;
  return {
    burns: BURNS.map((burn) => ({
      label: BURN_LABEL[burn],
      estimate: formatDeltaV(plan.estimates[burn]),
    })),
    needed: formatDeltaV(plan.totalEstimate),
    available: formatDeltaV(plan.availableDeltaV),
    availableBasis: `${formatMass(run.spacecraft.dryMass)} craft + ${formatFuel(run.spacecraft.fuelMass)} Fuel`,
    margin: `${sign}${formatDeltaV(metersPerSecond(Math.abs(plan.margin)))} (${share.toFixed(1)}%)`,
    marginIsShort: short,
    successChance: formatPercent(plan.successChance),
    low,
    warning: low ? 'Low chance: may run dry' : undefined,
  };
}
