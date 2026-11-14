import { createRng, type Rng } from '../lib/rng.ts';
import { stringSeed } from '../lib/stringSeed.ts';
import { DISPERSION, SOURCED_CONSTANTS } from './data.ts';
import { currentBody, type Run, type RunStatus } from './run.ts';
import { availableDeltaV, fuelAfterBurning } from './spacecraft.ts';
import {
  deepFreeze,
  findBody,
  type Body,
  type BodyId,
  type LandableBody,
  type Planet,
  type StarSystem,
} from './starSystem.ts';
import { kilograms, metersPerSecond, type Kilograms, type MetersPerSecond } from './units.ts';

/** The three Burns of a Hop, in the order they are flown. */
export const BURNS = ['takeoff', 'transfer', 'landing'] as const;
export type Burn = (typeof BURNS)[number];

/** A Hop worked out before launch: what each Burn should cost against what the Fuel provides. */
export interface HopPlan {
  readonly fromId: BodyId;
  readonly toId: BodyId;
  /** The estimated Δv of each Burn. */
  readonly estimates: Readonly<Record<Burn, MetersPerSecond>>;
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

/** Why a Body cannot be a Hop target. */
export type InvalidTargetReason = 'no-surface' | 'current-body';

/** Planning a Hop either works out a plan, or explains why the target cannot be chosen. */
export type HopPlanResult =
  | { readonly kind: 'planned'; readonly plan: HopPlan }
  | {
      readonly kind: 'invalid-target';
      readonly reason: InvalidTargetReason;
      /** Plain language, for the player. */
      readonly why: string;
    };

/**
 * Plans a Hop from the Body the Spacecraft is on to `targetId`. A Gas Giant or the current Body is
 * an expected failure, returned as `invalid-target`. Throws for an id the Star System does not have
 * or a Run that has ended: both are programmer errors.
 */
export function planHop(run: Run, targetId: BodyId): HopPlanResult {
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
  const totalEstimate = metersPerSecond(estimates.takeoff + estimates.transfer + estimates.landing);
  const available = availableDeltaV(run.spacecraft);
  return {
    kind: 'planned',
    plan: {
      fromId: from.id,
      toId: target.id,
      estimates,
      totalEstimate,
      availableDeltaV: available,
      margin: metersPerSecond(available - totalEstimate),
      successChance: successChance(Object.values(estimates), available),
    },
  };
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
  /** Takeoff, Transfer and Landing, in the order they are flown. */
  readonly burns: readonly BurnResult[];
  /** The Fuel on board before Takeoff. */
  readonly fuelAtLaunch: Kilograms;
  readonly fuelRemaining: Kilograms;
  readonly deltaVRemaining: MetersPerSecond;
  /** Plain language: what the Burns cost against their estimates, and why the Hop ended as it did. */
  readonly why: string;
}

/**
 * Flies a planned Hop: resolves the Burns in order, each costing its estimate times a factor drawn
 * from `rng` within the dispersion range. Arrived lands the Spacecraft on the target with the Fuel
 * left; Fell Short or Crashed ends the Run. Throws for a plan made for another Run state.
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
  const target = findBody(run.starSystem, plan.toId);
  if (!target?.landable) throw new Error(`${plan.toId} is not a Hop target`);

  let remaining = available;
  let outcome: HopOutcome = { kind: 'arrived' };
  const burns: BurnResult[] = [];
  for (const burn of BURNS) {
    // Every Burn draws its factor, flown or not, so a Hop always consumes the Rng the same way.
    const factor = DISPERSION.min + (DISPERSION.max - DISPERSION.min) * rng.next();
    const estimated = plan.estimates[burn];
    if (outcome.kind !== 'arrived') {
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
    outcome =
      burn === 'landing' ? { kind: 'crashed', shortfall } : { kind: 'fell-short', burn, shortfall };
    burns.push({ status: 'ran-out', burn, estimated, actual, delivered: remaining });
    remaining = metersPerSecond(0);
  }

  const fuelRemaining =
    outcome.kind === 'arrived'
      ? fuelAfterBurning(run.spacecraft, metersPerSecond(available - remaining))
      : kilograms(0);
  const flight: HopFlight = {
    plan,
    outcome,
    burns,
    fuelAtLaunch: run.spacecraft.fuelMass,
    fuelRemaining,
    deltaVRemaining: remaining,
    why: explain(plan, outcome, burns, target.name),
  };
  const status: RunStatus =
    outcome.kind === 'arrived'
      ? { kind: 'landed', bodyId: target.id }
      : { kind: 'ended', outcome: outcome.kind };
  return deepFreeze({
    flight,
    run: {
      ...run,
      spacecraft: { ...run.spacecraft, fuelMass: fuelRemaining },
      status,
      hopsFlown: run.hopsFlown + 1,
    },
  });
}

/** Launching either flies the Hop, or explains why the target cannot be chosen. */
export type LaunchResult =
  | { readonly kind: 'flown'; readonly flight: HopFlight; readonly run: Run }
  | Extract<HopPlanResult, { kind: 'invalid-target' }>;

/**
 * Launches a Hop to `targetId`: plans it exactly as the player saw it, then flies it with Burns drawn
 * from the Run's seed and how many Hops it has flown, so the same Run always flies the same Hop and
 * a seed replays a whole Run. The outcome is settled here, before any playback.
 */
export function launchHop(run: Run, targetId: BodyId): LaunchResult {
  const planned = planHop(run, targetId);
  if (planned.kind !== 'planned') return planned;
  const rng = createRng(run.seed ^ stringSeed(`hop:${String(run.hopsFlown)}`));
  return { kind: 'flown', ...flyHop(run, planned.plan, rng) };
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
    case 'arrived': {
      const actual = burns.reduce(
        (sum, burn) => sum + (burn.status === 'not-flown' ? 0 : burn.actual),
        0,
      );
      const change = percent(actual / plan.totalEstimate - 1);
      const cost =
        change === 0
          ? 'about the estimated Δv'
          : `${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} Δv than estimated`;
      return `Arrived on ${targetName}. The Burns took ${cost}; you had ${marginPhrase(plan)}.`;
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
    const needed = percent(plan.totalEstimate / plan.availableDeltaV - 1);
    if (needed < 50) {
      return `The plan needed ${needed}% more Δv than the Fuel provides, so it had no Margin.`;
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
  const share = percent(plan.margin / plan.totalEstimate);
  return share < 100 ? `${share}% Margin` : `${formatDeltaV(plan.margin)} of Margin`;
}

/** Δv rounded for the player: m/s below 1 km/s, km/s to one decimal above. */
function formatDeltaV(deltaV: MetersPerSecond): string {
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
 * Σ over subsets S of (−1)^|S| · max(0, x − Σ_S wⱼ)ⁿ / (n! · Π wᵢ).
 */
function successChance(estimates: readonly number[], available: number): number {
  const spread = DISPERSION.max - DISPERSION.min;
  const bestCase = estimates.reduce((sum, estimate) => sum + estimate * DISPERSION.min, 0);
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
 * Moons of one planet, the orbits are around that planet. Otherwise the ellipse is around the star,
 * and the boost starts deep in the departure planet's gravity (its low orbit, where Takeoff ends, or
 * the Moon's orbit), so it must also climb out of that well. Farther orbits cost more, and the same
 * climb costs more the deeper in the star's gravity it starts.
 */
function transferBurn(system: StarSystem, from: Body, to: Body): MetersPerSecond {
  const fromPlanet = planetOf(system, from);
  const toPlanet = planetOf(system, to);
  const mu = gravitationalParameter(fromPlanet);
  const radius = orbitAroundPlanet(fromPlanet, from);
  if (fromPlanet.id === toPlanet.id) {
    return departureBurn(mu, radius, orbitAroundPlanet(fromPlanet, to));
  }
  // Every star is Sun-like in this slice: a circular orbit at 1 AU moves as fast as Earth's.
  const starGravitationalParameter = SOURCED_CONSTANTS.orbitalVelocityAt1Au.value ** 2; // (m/s)²·AU
  const excessSpeed = departureBurn(
    starGravitationalParameter,
    from.distanceFromStar,
    to.distanceFromStar,
  );
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
