import { createRng, type Rng } from '../lib/rng.ts';
import { stringSeed } from '../lib/stringSeed.ts';
import { recordChoice } from './choiceLog.ts';
import { DISPERSION, SOURCED_CONSTANTS } from './data.ts';
import { collectYield, type Collection } from './gather.ts';
import { currentBody, type Run, type RunStatus } from './run.ts';
import { endIfStranded } from './stranded.ts';
import { availableDeltaV, carriesJumpDrive, fuelAfterBurning } from './spacecraft.ts';
import {
  deepFreeze,
  findBody,
  type Body,
  type BodyId,
  type LandableBody,
  type Planet,
  type StarSystem,
} from './starSystem.ts';
import {
  kilograms,
  metersPerSecond,
  type AstronomicalUnits,
  type Kilograms,
  type MetersPerSecond,
} from './units.ts';

/** The three Burns of a Hop to a Body, in the order they are flown. */
export const BURNS = ['takeoff', 'transfer', 'landing'] as const;
export type Burn = (typeof BURNS)[number];

/** The Burns of a Hop to the Heliopause: there is nothing there to land on. */
const OPEN_SPACE_BURNS = ['takeoff', 'transfer'] as const;
type OpenSpaceBurn = (typeof OPEN_SPACE_BURNS)[number];

/** The Heliopause as a Hop target: the outer edge of the Star System, not a Body. */
export const HELIOPAUSE = 'heliopause' as const;
/** Where a Hop can go: another Body, or the Heliopause. */
export type HopTarget = BodyId | typeof HELIOPAUSE;

interface HopPlanBase {
  readonly fromId: BodyId;
  readonly totalEstimate: MetersPerSecond;
  /** The Δv the Spacecraft's Fuel provides before the Hop. */
  readonly availableDeltaV: MetersPerSecond;
  /** Available Δv minus the total estimate; negative when the Fuel cannot cover even the estimate. */
  readonly margin: MetersPerSecond;
  /**
   * The probability, from 0 to 1, that the Fuel covers the actual Δv of every Burn under the
   * dispersion rule. Exact, so the same plan always shows the same Success Chance.
   */
  readonly successChance: number;
}

/** A Hop to a Body: Takeoff, Transfer and Landing. */
export interface BodyHopPlan extends HopPlanBase {
  readonly destination: 'body';
  readonly toId: BodyId;
  /** The estimated Δv of each Burn. */
  readonly estimates: Readonly<Record<Burn, MetersPerSecond>>;
}

/** A Hop to the Heliopause: Takeoff and Transfer, and no Landing. */
export interface HeliopauseHopPlan extends HopPlanBase {
  readonly destination: 'heliopause';
  readonly toId: typeof HELIOPAUSE;
  /** The estimated Δv of each Burn. */
  readonly estimates: Readonly<Record<OpenSpaceBurn, MetersPerSecond>>;
}

/** A Hop worked out before launch: what each Burn should cost against what the Fuel provides. */
export type HopPlan = BodyHopPlan | HeliopauseHopPlan;

/** One Burn of a plan, with its estimated Δv. */
export interface PlannedBurn {
  readonly burn: Burn;
  readonly estimate: MetersPerSecond;
}

/** The Burns a plan flies, in the order they are flown, each with its estimate. */
export function plannedBurns(plan: HopPlan): readonly PlannedBurn[] {
  if (plan.destination === 'heliopause') {
    const { estimates } = plan;
    return OPEN_SPACE_BURNS.map((burn) => ({ burn, estimate: estimates[burn] }));
  }
  const { estimates } = plan;
  return BURNS.map((burn) => ({ burn, estimate: estimates[burn] }));
}

/** Why a Body, or the Heliopause, cannot be a Hop target. */
export type InvalidTargetReason = 'no-surface' | 'current-body' | 'no-jump-drive';

/** Planning a Hop either works out a plan, or explains why the target cannot be chosen. */
export type HopPlanResult<P extends HopPlan = HopPlan> =
  | { readonly kind: 'planned'; readonly plan: P }
  | {
      readonly kind: 'invalid-target';
      readonly reason: InvalidTargetReason;
      /** Plain language, for the player. */
      readonly why: string;
    };

/**
 * Plans a Hop from the Body the Spacecraft is on to `target`. A Gas Giant, the current Body, or the
 * Heliopause without a Jump Drive is an expected failure, returned as `invalid-target`. Throws for an
 * id the Star System does not have or a Run that is not on a Body: both are programmer errors.
 */
export function planHop(run: Run, target: BodyId): HopPlanResult<BodyHopPlan>;
export function planHop(run: Run, target: typeof HELIOPAUSE): HopPlanResult<HeliopauseHopPlan>;
export function planHop(run: Run, target: HopTarget): HopPlanResult;
export function planHop(run: Run, target: HopTarget): HopPlanResult {
  return target === HELIOPAUSE ? planToHeliopause(run) : planToBody(run, target);
}

function planToBody(run: Run, targetId: BodyId): HopPlanResult<BodyHopPlan> {
  const from = currentBody(run);
  const target = findBody(run.starSystem, targetId);
  if (!target) throw new Error(`Star System ${run.starSystem.name} has no Body ${targetId}`);
  if (!target.landable) {
    return {
      kind: 'invalid-target',
      reason: 'no-surface',
      why: `${target.name} is a Gas Giant: it has no surface to land on.`,
    };
  }
  if (target.id === from.id) {
    return {
      kind: 'invalid-target',
      reason: 'current-body',
      why: `The Spacecraft is already on ${target.name}.`,
    };
  }
  const estimates = {
    takeoff: surfaceBurn(from),
    transfer: transferBurn(run.starSystem, from, target),
    landing: surfaceBurn(target),
  };
  return {
    kind: 'planned',
    plan: {
      destination: 'body',
      fromId: from.id,
      toId: target.id,
      estimates,
      ...odds(run, Object.values(estimates)),
    },
  };
}

/**
 * The Hop to the Heliopause: Takeoff, then a Transfer out to the edge of the Star System, and no
 * Landing. Only a Spacecraft carrying a Jump Drive may target it: nothing else can use it.
 */
function planToHeliopause(run: Run): HopPlanResult<HeliopauseHopPlan> {
  const from = currentBody(run);
  if (!carriesJumpDrive(run.spacecraft)) {
    return {
      kind: 'invalid-target',
      reason: 'no-jump-drive',
      why: 'Only a Spacecraft with a Jump Drive can Hop to the Heliopause: install one first.',
    };
  }
  const estimates = {
    takeoff: surfaceBurn(from),
    transfer: heliopauseTransferBurn(run.starSystem, from),
  };
  return {
    kind: 'planned',
    plan: {
      destination: 'heliopause',
      fromId: from.id,
      toId: HELIOPAUSE,
      estimates,
      ...odds(run, Object.values(estimates)),
    },
  };
}

/** What the Spacecraft's Fuel makes of a Hop's Burn estimates: their total, the Margin and the Success Chance. */
function odds(run: Run, estimates: readonly MetersPerSecond[]): Omit<HopPlanBase, 'fromId'> {
  const totalEstimate = metersPerSecond(estimates.reduce((sum, estimate) => sum + estimate, 0));
  const available = availableDeltaV(run.spacecraft);
  return {
    totalEstimate,
    availableDeltaV: available,
    margin: metersPerSecond(available - totalEstimate),
    successChance: successChance(estimates, available, leastDeltaV({ totalEstimate })),
  };
}

/**
 * The least Δv that gives a plan any Success Chance: every Burn at the best case of the dispersion.
 * A plan's Success Chance is above 0% exactly when the Fuel gives more than this. It depends on the
 * Burns alone, so it holds for any Spacecraft flying the same Hop.
 */
export function leastDeltaV(plan: Pick<HopPlan, 'totalEstimate'>): MetersPerSecond {
  return metersPerSecond(plan.totalEstimate * DISPERSION.min);
}

/** What happened to one Burn of a flown Hop. */
export type BurnResult =
  | {
      readonly status: 'completed';
      readonly burn: Burn;
      readonly estimated: MetersPerSecond;
      readonly actual: MetersPerSecond;
      /** The Fuel left once this Burn ended. */
      readonly fuelAfter: Kilograms;
    }
  | {
      /** The Fuel ran out before this Burn was done: the Hop failed here. */
      readonly status: 'ran-out';
      readonly burn: Burn;
      readonly estimated: MetersPerSecond;
      /** The Δv the Burn needed. */
      readonly actual: MetersPerSecond;
      /** The Δv the last of the Fuel gave before it ran dry. */
      readonly delivered: MetersPerSecond;
    }
  | { readonly status: 'not-flown'; readonly burn: Burn; readonly estimated: MetersPerSecond };

/** How a Hop ended. */
export type HopOutcome =
  | { readonly kind: 'arrived' }
  /**
   * The Transfer carried the Spacecraft out to the Heliopause. The Jump (#157) follows it; until then
   * the Run waits there.
   */
  | { readonly kind: 'reached-heliopause' }
  /** Fuel ran out during Takeoff or Transfer. */
  | {
      readonly kind: 'fell-short';
      readonly burn: Exclude<Burn, 'landing'>;
      readonly shortfall: MetersPerSecond;
    }
  /** The Transfer was completed, but there was not enough Δv left to finish Landing. */
  | { readonly kind: 'crashed'; readonly shortfall: MetersPerSecond };

/** A flown Hop: everything the UI needs to play it back and report it. */
export interface HopFlight {
  readonly plan: HopPlan;
  readonly outcome: HopOutcome;
  /** Each Burn of the plan (Takeoff, Transfer, and Landing for a Body), in the order they are flown. */
  readonly burns: readonly BurnResult[];
  /** The Fuel on board before Takeoff. */
  readonly fuelAtLaunch: Kilograms;
  /** The Fuel left by the Hop itself: what landing then collected is in `collection`. */
  readonly fuelRemaining: Kilograms;
  /** What landing on the target collected; `null` when the Hop did not land on a Body. */
  readonly collection: Collection | null;
  readonly deltaVRemaining: MetersPerSecond;
  /** Plain language: what the Burns cost against their estimates, and why the Hop ended as it did. */
  readonly why: string;
}

/**
 * Flies a planned Hop: resolves the Burns in order, each costing its estimate times a factor drawn
 * from `rng` within the dispersion range. Arrived lands the Spacecraft on the target with the Fuel
 * left (or Stranded there, when no change could give any Hop a chance); a Hop to the Heliopause
 * that the Fuel covers leaves it there; Fell Short or Crashed ends the Run. Throws for a plan made for another Run state.
 */
export function flyHop(
  run: Run,
  plan: HopPlan,
  rng: Rng,
): { readonly flight: HopFlight; readonly run: Run } {
  const from = currentBody(run);
  const available = availableDeltaV(run.spacecraft);
  if (plan.fromId !== from.id || plan.availableDeltaV !== available) {
    throw new Error(`The plan to ${plan.toId} was made for another Run state; plan the Hop again`);
  }
  const target = plan.destination === 'body' ? findBody(run.starSystem, plan.toId) : undefined;
  if (plan.destination === 'body' && !target?.landable) {
    throw new Error(`${plan.toId} is not a Hop target`);
  }
  let remaining = available;
  /** Set when the Fuel runs out: the Burns after it are not flown. */
  let failure: Extract<HopOutcome, { kind: 'fell-short' | 'crashed' }> | undefined;
  const burns: BurnResult[] = [];
  for (const { burn, estimate: estimated } of plannedBurns(plan)) {
    // Every Burn draws its factor, flown or not, so a Hop always consumes the Rng the same way.
    const factor = DISPERSION.min + (DISPERSION.max - DISPERSION.min) * rng.next();
    if (failure) {
      burns.push({ status: 'not-flown', burn, estimated });
      continue;
    }
    const actual = metersPerSecond(estimated * factor);
    if (actual <= remaining) {
      remaining = metersPerSecond(remaining - actual);
      const fuelAfter = fuelAfterBurning(run.spacecraft, metersPerSecond(available - remaining));
      burns.push({ status: 'completed', burn, estimated, actual, fuelAfter });
      continue;
    }
    const shortfall = metersPerSecond(actual - remaining);
    failure =
      burn === 'landing' ? { kind: 'crashed', shortfall } : { kind: 'fell-short', burn, shortfall };
    burns.push({ status: 'ran-out', burn, estimated, actual, delivered: remaining });
    remaining = metersPerSecond(0);
  }

  const outcome: HopOutcome = failure ?? { kind: target ? 'arrived' : 'reached-heliopause' };
  const fuelRemaining = failure
    ? kilograms(0)
    : fuelAfterBurning(run.spacecraft, metersPerSecond(available - remaining));
  const flight: HopFlight = {
    plan,
    outcome,
    burns,
    fuelAtLaunch: run.spacecraft.fuelMass,
    fuelRemaining,
    collection: null,
    deltaVRemaining: remaining,
    why: explain(plan, outcome, burns, target?.name ?? 'the Heliopause'),
  };
  const flown = (status: RunStatus): Run => ({
    ...run,
    spacecraft: { ...run.spacecraft, fuelMass: fuelRemaining },
    status,
    hopsFlown: run.hopsFlown + 1,
  });
  switch (outcome.kind) {
    case 'fell-short':
    case 'crashed':
      return deepFreeze({
        flight,
        run: flown({ kind: 'ended', end: { kind: outcome.kind, reason: flight.why } }),
      });
    case 'reached-heliopause':
      return deepFreeze({ flight, run: flown({ kind: 'at-heliopause' }) });
    case 'arrived': {
      if (!target) throw new Error('Arrived on no Body');
      const landed = collectYield(flown({ kind: 'landed', bodyId: target.id }), target.id);
      // Landed where no change could give any Hop a chance: the Run ends there, as Stranded.
      return deepFreeze({
        flight: { ...flight, collection: landed.collection },
        run: endIfStranded(landed.run),
      });
    }
  }
}

/** Launching either flies the Hop, or explains why the target cannot be chosen. */
export type LaunchResult =
  | { readonly kind: 'flown'; readonly flight: HopFlight; readonly run: Run }
  | Extract<HopPlanResult, { kind: 'invalid-target' }>;

/**
 * Launches a Hop to `target`: plans it exactly as the player saw it, then flies it with Burns drawn
 * from the Run's seed and how many Hops it has flown, so the same Run always flies the same Hop and
 * a seed replays a whole Run. The outcome is settled here, before any playback.
 */
export function launchHop(run: Run, target: HopTarget): LaunchResult {
  const planned = planHop(run, target);
  if (planned.kind !== 'planned') return planned;
  const rng = createRng(run.seed ^ stringSeed(`hop:${String(run.hopsFlown)}`));
  const flown = flyHop(run, planned.plan, rng);
  return {
    kind: 'flown',
    flight: flown.flight,
    run: recordChoice(flown.run, { kind: 'hop', target }),
  };
}

const BURN_NAMES: Readonly<Record<Burn, string>> = {
  takeoff: 'Takeoff',
  transfer: 'Transfer',
  landing: 'Landing',
};

/** The plain-language why of a flown Hop. */
function explain(
  plan: HopPlan,
  outcome: HopOutcome,
  burns: readonly BurnResult[],
  targetName: string,
): string {
  switch (outcome.kind) {
    case 'arrived':
    case 'reached-heliopause': {
      const actual = burns.reduce(
        (sum, burn) => sum + (burn.status === 'not-flown' ? 0 : burn.actual),
        0,
      );
      const change = percent(actual / plan.totalEstimate - 1);
      const cost =
        change === 0
          ? 'about the estimated Δv'
          : `${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} Δv than estimated`;
      const arrival =
        outcome.kind === 'arrived' ? `Arrived on ${targetName}.` : 'Reached the Heliopause.';
      return `${arrival} The Burns took ${cost}; you had ${marginPhrase(plan)}.`;
    }
    case 'fell-short':
      return `Fuel ran out during the ${BURN_NAMES[outcome.burn]}. ${failureCause(plan, burns)}`;
    case 'crashed':
      return (
        'The Transfer was completed, but there was not enough Δv left to finish the Landing. ' +
        failureCause(plan, burns)
      );
  }
}

/** Why the Fuel did not cover the Burns: no Margin to begin with, or Burns that ran long. */
function failureCause(plan: HopPlan, burns: readonly BurnResult[]): string {
  if (plan.margin < 0) {
    const short = percent(-marginShare(plan));
    if (short < 50) {
      return `The Fuel gives ${short}% less Δv than the plan needs, so it had no Margin.`;
    }
    return (
      `This Hop needs ${formatDeltaV(plan.totalEstimate)} of Δv, but the Fuel gives only ` +
      `${formatDeltaV(plan.availableDeltaV)}, so it had no Margin.`
    );
  }
  const overruns = burns.flatMap((burn) =>
    burn.status !== 'not-flown' && burn.actual > burn.estimated
      ? [`${BURN_NAMES[burn.burn]} took ${percent(burn.actual / burn.estimated - 1)}%`]
      : [],
  );
  const list =
    overruns.length > 1
      ? `${overruns.slice(0, -1).join(', ')} and ${overruns.at(-1) ?? ''}`
      : overruns.join('');
  return `${list} more Δv than estimated; you had ${marginPhrase(plan)}.`;
}

/**
 * The Margin as the player reads it: a share of the estimate, or in km/s once it is as big as the
 * estimate itself (a percentage in the hundreds says little).
 */
function marginPhrase(plan: HopPlan): string {
  if (plan.margin < 0)
    return `no Margin (the Fuel gave ${percent(-marginShare(plan))}% less Δv than the plan needs)`;
  const share = percent(marginShare(plan));
  return share < 100 ? `${share}% Margin` : `${formatDeltaV(plan.margin)} of Margin`;
}

/**
 * The one definition of a Margin as a share: the Margin over the estimate, negative for a shortfall.
 * It shares its base with "the Burns took N% more Δv than estimated", so the two can be read against
 * each other, and a shortfall reads "the Fuel gives N% less Δv than the plan needs". The plan, the
 * why text and the report all use it.
 */
export function marginShare(plan: Pick<HopPlan, 'margin' | 'totalEstimate'>): number {
  return plan.margin / plan.totalEstimate;
}

/** Δv rounded for the player: m/s below 1 km/s, km/s to one decimal above. */
export function formatDeltaV(deltaV: MetersPerSecond): string {
  return deltaV < 1_000 ? `${Math.round(deltaV)} m/s` : `${(deltaV / 1_000).toFixed(1)} km/s`;
}

/** A share as a whole percentage, for the player. */
function percent(share: number): number {
  return Math.round(share * 100);
}

/**
 * The probability that `available` covers the sum of the actual Burns, each its estimate times a
 * factor drawn uniformly from the dispersion range. In closed form: the slack above the best case
 * must exceed a sum of independent uniforms on [0, wᵢ] (wᵢ the spread of Burn i), whose CDF is
 * Σ over subsets S of (−1)^|S| · max(0, x − Σ_S wⱼ)ⁿ / (n! · Π wᵢ). `bestCase` is the plan's
 * `leastDeltaV`, so the two agree on when a Hop has no chance at all.
 */
function successChance(
  estimates: readonly number[],
  available: number,
  bestCase: MetersPerSecond,
): number {
  const spread = DISPERSION.max - DISPERSION.min;
  const widths = estimates.map((estimate) => estimate * spread).filter((width) => width > 0);
  const slack = available - bestCase;
  if (slack >= widths.reduce((sum, width) => sum + width, 0)) return 1;
  if (slack <= 0) return 0;

  const n = widths.length;
  let cumulative = 0;
  for (let subset = 0; subset < 2 ** n; subset++) {
    let subsetWidth = 0;
    let sign = 1;
    widths.forEach((width, i) => {
      if (subset & (1 << i)) {
        subsetWidth += width;
        sign = -sign;
      }
    });
    cumulative += sign * Math.max(0, slack - subsetWidth) ** n;
  }
  const factorial = Array.from({ length: n }, (_, i) => i + 1).reduce((a, b) => a * b, 1);
  const denominator = widths.reduce((product, width) => product * width, factorial);
  return Math.min(1, Math.max(0, cumulative / denominator));
}

/**
 * Takeoff from, or Landing on, a Body's surface: in proportion to its escape velocity. The ratio is
 * Mars's (surface to low orbit, gravity losses included, over its escape velocity), about 0.835; it
 * fits Earth's commonly quoted 9.4 km/s to orbit too. Bodies have no atmosphere in this slice, so
 * Landing is Takeoff in reverse.
 */
function surfaceBurn(body: LandableBody): MetersPerSecond {
  const perEscapeVelocity =
    SOURCED_CONSTANTS.marsAscentDeltaV.value / SOURCED_CONSTANTS.marsEscapeVelocity.value;
  return metersPerSecond(perEscapeVelocity * body.escapeVelocity);
}

/**
 * The Transfer, Hohmann-like: the boost that puts the Spacecraft on an ellipse from its orbit to the
 * target's (matching the target is part of Landing). Between a planet and its own Moons, or two
 * Moons of one planet, the orbits are around that planet. Otherwise the ellipse is around the star
 * (see `starTransferBurn`).
 */
function transferBurn(system: StarSystem, from: Body, to: Body): MetersPerSecond {
  const fromPlanet = planetOf(system, from);
  if (fromPlanet.id === planetOf(system, to).id) {
    return departureBurn(
      gravitationalParameter(fromPlanet),
      orbitAroundPlanet(fromPlanet, from),
      orbitAroundPlanet(fromPlanet, to),
    );
  }
  return starTransferBurn(system, from, to.distanceFromStar);
}

/**
 * The Transfer to the Heliopause, escape-style: the boost onto the ellipse around the star whose far
 * end touches the Heliopause, climbing out of the departure planet's gravity on the way, exactly as a
 * Transfer between planets. Nothing waits there to be matched, so that is the whole cost. Around the
 * star the boost is v·(√(2R / (r + R)) − 1), v the circular speed at the departure distance r and R
 * the Heliopause's: for a Heliopause far beyond the planets, nearly the (√2 − 1)·v of escaping the
 * star outright. Circular speed falls as 1/√r, so the farther out the Spacecraft starts, the cheaper
 * the Hop: the game's lesson to climb outward before escaping.
 */
function heliopauseTransferBurn(system: StarSystem, from: Body): MetersPerSecond {
  return starTransferBurn(system, from, system.heliopauseRadius);
}

/**
 * The boost onto an ellipse around the star, from the departure Body's distance to `toDistance`. It
 * starts deep in the departure planet's gravity (its low orbit, where Takeoff ends, or the Moon's
 * orbit), so it must also climb out of that well. Farther orbits cost more, and the same climb costs
 * more the deeper in the star's gravity it starts.
 */
function starTransferBurn(
  system: StarSystem,
  from: Body,
  toDistance: AstronomicalUnits,
): MetersPerSecond {
  const fromPlanet = planetOf(system, from);
  const mu = gravitationalParameter(fromPlanet);
  const radius = orbitAroundPlanet(fromPlanet, from);
  // Every star is Sun-like in this slice: a circular orbit at 1 AU moves as fast as Earth's.
  const starGravitationalParameter = SOURCED_CONSTANTS.orbitalVelocityAt1Au.value ** 2; // (m/s)²·AU
  const excessSpeed = departureBurn(starGravitationalParameter, from.distanceFromStar, toDistance);
  // Patched conics: from a circular orbit of radius r, leaving with speed v∞ to spare takes
  // √(v∞² + 2μ/r) − √(μ/r).
  return metersPerSecond(Math.sqrt(excessSpeed ** 2 + (2 * mu) / radius) - Math.sqrt(mu / radius));
}

/**
 * The first burn of a Hohmann transfer between two circular orbits around a body with
 * gravitational parameter `mu`: the change from circular speed to the transfer ellipse's speed.
 * Any length unit works, as long as `mu` uses the same one.
 */
function departureBurn(mu: number, fromRadius: number, toRadius: number): MetersPerSecond {
  const circularSpeed = Math.sqrt(mu / fromRadius);
  const ellipseSpeed = circularSpeed * Math.sqrt((2 * toRadius) / (fromRadius + toRadius));
  return metersPerSecond(Math.abs(ellipseSpeed - circularSpeed));
}

/** The planet a Body is or orbits. */
function planetOf(system: StarSystem, body: Body): Planet {
  if (body.kind !== 'moon') return body;
  const planet = system.planets.find((p) => p.id === body.planetId);
  if (!planet)
    throw new Error(`Moon ${body.id} orbits ${body.planetId}, which is not in the system`);
  return planet;
}

/**
 * A planet's radius, from its surface gravity and escape velocity: g = GM/R² and v = √(2GM/R), so
 * R = v² / 2g. The Takeoff reaches a low orbit at about this radius.
 */
function planetRadius(planet: Planet): number {
  return planet.escapeVelocity ** 2 / (2 * planet.surfaceGravity);
}

/** GM = g R², in m³/s². */
function gravitationalParameter(planet: Planet): number {
  return planet.surfaceGravity * planetRadius(planet) ** 2;
}

/** In metres: a Moon's orbit, or the planet's own low orbit. */
function orbitAroundPlanet(planet: Planet, body: Body): number {
  return body.kind === 'moon' ? body.distanceFromPlanet * 1_000 : planetRadius(planet);
}
