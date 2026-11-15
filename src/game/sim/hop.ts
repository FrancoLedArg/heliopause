import { createRng, type Rng } from '../lib/rng.ts';
import { stringSeed } from '../lib/stringSeed.ts';
import { recordChoice } from './choiceLog.ts';
import {
  cruiseSchedule,
  isMildHop,
  startCruise,
  stepCruise,
  type Cruise,
  type ScheduledEvent,
  type StruckEvent,
} from './cruise.ts';
import {
  CRUISE_TUNING,
  DIFFICULTY_TUNING,
  difficultyFactor,
  DISPERSION,
  REACH_VERDICT,
  SOURCED_CONSTANTS,
  UNSURVEYED,
  type CruiseEventKind,
} from './data.ts';
import { collectYield, type Collection } from './gather.ts';
import { jump } from './jump.ts';
import { bodyKnowledge, revealOnLanding, type Reveal } from './knowledge.ts';
import { currentBody, type Run, type RunStatus } from './run.ts';
import { endIfStranded } from './stranded.ts';
import {
  availableDeltaV,
  carriesJumpDrive,
  fuelAfterBurning,
  fuelForDeltaV,
  type Spacecraft,
} from './spacecraft.ts';
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
  /** The Δv below which the plan has no chance: every Burn at its best case. */
  readonly bestCase: MetersPerSecond;
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
  /**
   * True when the target is not Surveyed: the Landing estimate is then a cautious one, with a wider
   * dispersion, while the flight uses the Body's real values.
   */
  readonly unsurveyed: boolean;
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

/**
 * Why a Body, or the Heliopause, cannot be a Hop target. A Body the player has not Detected, and the
 * Heliopause before it is found, are not on the chart: only a forged choice could name them.
 */
export type InvalidTargetReason =
  'no-surface' | 'current-body' | 'no-jump-drive' | 'not-detected' | 'not-found';

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

/**
 * `planHop` at the Body's real values, as if it were Surveyed: for the rules that weigh what is
 * possible (fairness of a Star System, Stranded), which must not depend on what the player knows.
 */
export function planHopAtRealValues(run: Run, target: HopTarget): HopPlanResult {
  if (target === HELIOPAUSE || run.knowledge.surveyed.includes(target)) return planHop(run, target);
  const { knowledge } = run;
  return planHop(
    { ...run, knowledge: { ...knowledge, surveyed: [...knowledge.surveyed, target] } },
    target,
  );
}

function planToBody(run: Run, targetId: BodyId): HopPlanResult<BodyHopPlan> {
  const from = currentBody(run);
  const target = findBody(run.starSystem, targetId);
  if (!target) throw new Error(`Star System ${run.starSystem.name} has no Body ${targetId}`);
  if (!run.knowledge.detected.includes(target.id)) {
    return {
      kind: 'invalid-target',
      reason: 'not-detected',
      why: 'Comms has not Detected that Body: the Spacecraft does not know where it is.',
    };
  }
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
  const unsurveyed = bodyKnowledge(run, target.id) !== 'surveyed';
  const estimates = {
    takeoff: surfaceBurn(from),
    transfer: transferBurn(run.starSystem, from, target),
    landing: unsurveyed ? cautiousLandingBurn(run, target) : surfaceBurn(target),
  };
  return {
    kind: 'planned',
    plan: {
      destination: 'body',
      fromId: from.id,
      toId: target.id,
      unsurveyed,
      estimates,
      ...odds(
        run,
        BURNS.map((burn) =>
          unsurveyed && burn === 'landing'
            ? {
                estimate: estimates.landing,
                max: UNSURVEYED.landingMax,
                best: leastLandingBurn(run, target) * DISPERSION.min,
              }
            : evenBurn(estimates[burn]),
        ),
      ),
    },
  };
}

/**
 * The Hop to the Heliopause: Takeoff, then a Transfer out to the edge of the Star System, and no
 * Landing. Only a Spacecraft carrying a Jump Drive may target it: nothing else can use it.
 */
function planToHeliopause(run: Run): HopPlanResult<HeliopauseHopPlan> {
  const from = currentBody(run);
  if (!run.knowledge.heliopauseFound) {
    return {
      kind: 'invalid-target',
      reason: 'not-found',
      why: 'The Heliopause has not been found yet: the Spacecraft does not know where it is.',
    };
  }
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
      ...odds(run, Object.values(estimates).map(evenBurn)),
    },
  };
}

/** What the Spacecraft's Fuel makes of a Hop's Burn estimates: their total, the Margin and the Success Chance. */
function odds(run: Run, burns: readonly EstimatedBurn[]): Omit<HopPlanBase, 'fromId'> {
  const totalEstimate = metersPerSecond(burns.reduce((sum, burn) => sum + burn.estimate, 0));
  const available = availableDeltaV(run.spacecraft);
  const bestCase = metersPerSecond(
    totalEstimate * DISPERSION.min - burns.reduce((sum, burn) => sum + lowerBest(burn), 0),
  );
  return {
    totalEstimate,
    availableDeltaV: available,
    margin: metersPerSecond(available - totalEstimate),
    bestCase,
    successChance: successChance(burns, available, bestCase),
  };
}

/**
 * The least Δv that makes a plan certain: every Burn at the top of its dispersion, wider for the
 * Landing of an Unsurveyed plan. A hair over, so rounding never leaves it short of certain.
 */
export function certainDeltaV(plan: HopPlan): MetersPerSecond {
  const total = plannedBurns(plan).reduce((sum, { burn, estimate }) => {
    const unsurveyedLanding = plan.destination === 'body' && plan.unsurveyed && burn === 'landing';
    return sum + estimate * (unsurveyedLanding ? UNSURVEYED.landingMax : DISPERSION.max);
  }, 0);
  return metersPerSecond(total * (1 + 1e-9));
}

/** A Burn's estimate, the top of its dispersion, and the Δv of its best case. */
interface EstimatedBurn {
  readonly estimate: MetersPerSecond;
  readonly max: number;
  readonly best: number;
}

/** A Burn whose estimate is as sure as its dispersion: best and worst case are the usual ones. */
function evenBurn(estimate: MetersPerSecond): EstimatedBurn {
  return { estimate, max: DISPERSION.max, best: estimate * DISPERSION.min };
}

/** How far below `estimate × DISPERSION.min` a Burn's best case lies: 0 unless it is an Unsurveyed Landing. */
const lowerBest = ({ estimate, best }: EstimatedBurn): number => estimate * DISPERSION.min - best;

/**
 * The least Δv that gives a plan any Success Chance: every Burn at the best case of the dispersion.
 * A plan's Success Chance is above 0% exactly when the Fuel gives more than this. It depends on the
 * Burns alone, so it holds for any Spacecraft flying the same Hop.
 */
export function leastDeltaV(plan: Pick<HopPlan, 'bestCase'>): MetersPerSecond {
  return plan.bestCase;
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
   * The Transfer carried the Spacecraft out to the Heliopause, and the Jump carried it on to the
   * next Star System's Starting Moon.
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
  /** What landing on the target taught the player; `null` when the Hop did not land on a Body. */
  readonly reveal: Reveal | null;
  readonly deltaVRemaining: MetersPerSecond;
  /** The Cruise events that struck, in order; empty when the Hop Fell Short before the Cruise. */
  readonly cruiseEvents: readonly StruckEvent[];
  /** The Fuel leaks lost in the Cruise. */
  readonly fuelLost: Kilograms;
  /** Plain language: what the Burns cost against their estimates, and why the Hop ended as it did. */
  readonly why: string;
}

/**
 * What a Hop flew before its Cruise, kept on the cruising Run for the arrival: the plan, the
 * Takeoff and Transfer as flown, the Landing factor drawn at launch, and the Spacecraft at launch.
 */
export interface Departure {
  readonly plan: HopPlan;
  readonly burns: readonly BurnResult[];
  /** The Landing Burn's factor, drawn at launch with the others; `null` for a Hop to the Heliopause. */
  readonly landingFactor: number | null;
  /** The Δv left after the Transfer, by the Spacecraft at launch. */
  readonly deltaVRemaining: MetersPerSecond;
  readonly launchSpacecraft: Spacecraft;
  /** The Fuel left after the Transfer, before anything the Cruise did. */
  readonly fuelAfterTransfer: Kilograms;
}

/** A Hop settled: flown to its end, with the Run it left. */
export interface FlownHop {
  readonly flight: HopFlight;
  readonly run: Run;
}

/**
 * Flies a planned Hop with no Cruise events and no choices in its Cruise: resolves the Burns in
 * order, each costing its estimate times a factor drawn from `rng` within the dispersion range.
 * Arrived lands the Spacecraft on the target with the Fuel left (or Stranded there, when no change
 * could give any Hop a chance); a Hop to the Heliopause that the Fuel covers Jumps; Fell Short or
 * Crashed ends the Run. Throws for a plan made for another Run state.
 */
export function flyHop(run: Run, plan: HopPlan, rng: Rng): FlownHop {
  const departed = depart(run, plan, rng, []);
  if (departed.kind === 'flown') return departed;
  const cruised = advanceCruise(departed.run, CRUISE_TUNING.ticks);
  // With no events, nothing burns: only a Cruise with an Engine fire can end Destroyed.
  if (cruised.kind !== 'flown') throw new Error('A Cruise with no events ended before its arrival');
  return cruised;
}

/**
 * Launch: flies the Takeoff and the Transfer, every Burn factor drawn from `rng` in order (the
 * Landing's too, so a Hop always consumes the Rng the same way). A Fell Short ends the Run there, with
 * no Cruise. Otherwise the Run is cruising, with `schedule` as its Cruise events.
 */
function depart(
  run: Run,
  plan: HopPlan,
  rng: Rng,
  schedule: readonly ScheduledEvent[],
): BeginResult {
  const from = currentBody(run);
  const available = availableDeltaV(run.spacecraft);
  if (plan.fromId !== from.id || plan.availableDeltaV !== available) {
    throw new Error(`The plan to ${plan.toId} was made for another Run state; plan the Hop again`);
  }
  const target = plan.destination === 'body' ? findBody(run.starSystem, plan.toId) : undefined;
  if (plan.destination === 'body' && !target?.landable) {
    throw new Error(`${plan.toId} is not a Hop target`);
  }
  const planned = plannedBurns(plan);
  const factors = planned.map(
    () => DISPERSION.min + (DISPERSION.max - DISPERSION.min) * rng.next(),
  );
  let remaining = available;
  let failure: Extract<HopOutcome, { kind: 'fell-short' }> | undefined;
  const burns: BurnResult[] = [];
  for (const [i, { burn, estimate: estimated }] of planned.entries()) {
    if (burn === 'landing') break;
    if (failure) {
      burns.push({ status: 'not-flown', burn, estimated });
      continue;
    }
    const actual = metersPerSecond(estimated * (factors[i] ?? 1));
    if (actual <= remaining) {
      remaining = metersPerSecond(remaining - actual);
      const fuelAfter = fuelAfterBurning(run.spacecraft, metersPerSecond(available - remaining));
      burns.push({ status: 'completed', burn, estimated, actual, fuelAfter });
      continue;
    }
    failure = { kind: 'fell-short', burn, shortfall: metersPerSecond(actual - remaining) };
    burns.push({ status: 'ran-out', burn, estimated, actual, delivered: remaining });
    remaining = metersPerSecond(0);
  }
  const hopsFlown = run.hopsFlown + 1;

  if (failure) {
    const landing = planned.find((burn) => burn.burn === 'landing');
    if (landing) burns.push({ status: 'not-flown', burn: 'landing', estimated: landing.estimate });
    const flight: HopFlight = {
      plan,
      outcome: failure,
      burns,
      fuelAtLaunch: run.spacecraft.fuelMass,
      fuelRemaining: kilograms(0),
      collection: null,
      reveal: null,
      deltaVRemaining: remaining,
      cruiseEvents: [],
      fuelLost: kilograms(0),
      why: explain(plan, failure, burns, target?.name ?? 'the Heliopause'),
    };
    const end = { kind: 'fell-short', reason: flight.why } as const;
    return deepFreeze({
      kind: 'flown',
      flight,
      run: {
        ...run,
        spacecraft: { ...run.spacecraft, fuelMass: kilograms(0) },
        status: { kind: 'ended', end },
        hopsFlown,
      },
    });
  }

  const fuelAfterTransfer = fuelAfterBurning(
    run.spacecraft,
    metersPerSecond(available - remaining),
  );
  const landingAt = planned.findIndex((burn) => burn.burn === 'landing');
  const departure: Departure = {
    plan,
    burns,
    landingFactor: landingAt < 0 ? null : (factors[landingAt] ?? null),
    deltaVRemaining: remaining,
    launchSpacecraft: run.spacecraft,
    fuelAfterTransfer,
  };
  const mild = isMildHop(hopsFlown);
  const cruise = startCruise(schedule, mild, mild ? mildFuelFloor(run, plan) : kilograms(0));
  return deepFreeze({
    kind: 'cruising',
    run: {
      ...run,
      spacecraft: { ...run.spacecraft, fuelMass: fuelAfterTransfer },
      status: { kind: 'cruising', cruise, departure },
      hopsFlown,
    },
  });
}

/**
 * The Fuel a mild Cruise's leaks stop at (#250): what the Landing needs at the worst of the
 * dispersion, plus the Fuel for a Hop back to the departure Body with some chance once landed. So a
 * mild event never Crashes a Hop the plan shows at 100%, and never Strands it (#188): the Body it
 * came from is always known and always within reach. It is never above #249's floor (the worst
 * Landing leaving the at-estimate arrival), and well below it on most Hops, so a mild leak left
 * alone visibly drains the tank. A Hop to the
 * Heliopause has no Landing: its floor is the at-estimate Fuel.
 */
function mildFuelFloor(run: Run, plan: HopPlan): Kilograms {
  const launch = run.spacecraft;
  const atEstimate = fuelAfterBurning(launch, plan.totalEstimate);
  if (plan.destination === 'heliopause') return atEstimate;
  const back = planHop({ ...run, status: { kind: 'landed', bodyId: plan.toId } }, plan.fromId);
  if (back.kind !== 'planned') return atEstimate;
  const empty = { ...launch, fuelMass: kilograms(0) };
  const backNeed = metersPerSecond(leastDeltaV(back.plan) * MILD_RESERVE_MARGIN);
  // What the worst Landing must leave: the Hop back, never more than the at-estimate arrival.
  const reserve = Math.min(atEstimate, fuelForDeltaV(empty, backNeed));
  const worstLanding = metersPerSecond(plan.estimates.landing * DISPERSION.max);
  const landed = { ...launch, dryMass: kilograms(launch.dryMass + reserve) };
  return kilograms(reserve + fuelForDeltaV(landed, worstLanding));
}

/** The Hop back a mild floor keeps in reach gets a little more than the least Δv: some chance, not 0%. */
const MILD_RESERVE_MARGIN = 1.02;

/** What a step of the Cruise left: still cruising, settled at the arrival, or Destroyed. */
export type CruiseResult =
  | { readonly kind: 'cruising'; readonly run: Run }
  | ({ readonly kind: 'flown' } & FlownHop)
  | {
      readonly kind: 'destroyed';
      readonly run: Run;
      /** The Cruise as it stood when the Spacecraft exploded. */
      readonly cruise: Cruise;
      /** The Takeoff and Transfer the Hop flew before its Cruise, for the playback. */
      readonly departure: Departure;
    };

/** The reason a Destroyed Run ends with: one plain line (#210's "Show, don't tell" amendment). */
export const DESTROYED_REASON = 'The Engine fire reached the Fuel.';

/**
 * Advances a cruising Run's Cruise to `tick` (see `stepCruise` for what each tick does). An Engine
 * fire left burning ends the Run as Destroyed on its tick; reaching the Cruise's last tick flies the
 * arrival. The Flight scene turns real time into ticks and calls this; replay calls it before each
 * Cruise choice. Throws for a Run that is not cruising, or a tick behind the Cruise's.
 */
export function advanceCruise(run: Run, tick: number): CruiseResult {
  if (run.status.kind !== 'cruising') throw new Error(`Run ${String(run.seed)} is not cruising`);
  const { cruise, departure } = run.status;
  if (!Number.isInteger(tick) || tick < cruise.tick) {
    throw new RangeError(
      `The Cruise is at tick ${String(cruise.tick)}, not before ${String(tick)}`,
    );
  }
  const stepped = stepCruise(cruise, run.spacecraft, Math.min(tick, CRUISE_TUNING.ticks));
  if (stepped.kind === 'destroyed') {
    const end = { kind: 'destroyed', reason: DESTROYED_REASON } as const;
    return deepFreeze({
      kind: 'destroyed',
      cruise: stepped.cruise,
      departure,
      run: { ...run, spacecraft: stepped.spacecraft, status: { kind: 'ended', end } },
    });
  }
  const cruising: Run = {
    ...run,
    spacecraft: stepped.spacecraft,
    status: { kind: 'cruising', cruise: stepped.cruise, departure },
  };
  if (stepped.cruise.tick < CRUISE_TUNING.ticks) {
    return deepFreeze({ kind: 'cruising', run: cruising });
  }
  return { kind: 'flown', ...arrive(cruising, departure, stepped.cruise) };
}

/**
 * Arrival: the Landing Burn flown with the factor drawn at launch, against the Spacecraft the Cruise
 * left (its Fuel, and its Engine with any Damage). A Hop to the Heliopause Jumps. When the Cruise
 * changed nothing, the arithmetic is launch's own, so every existing seed flies exactly as before.
 */
function arrive(run: Run, departure: Departure, cruise: Cruise): FlownHop {
  const { plan, launchSpacecraft } = departure;
  const spacecraft = run.spacecraft;
  const unchanged =
    spacecraft.fuelMass === departure.fuelAfterTransfer &&
    spacecraft.engineIsp === launchSpacecraft.engineIsp;
  const target = plan.destination === 'body' ? findBody(run.starSystem, plan.toId) : undefined;
  let remaining = unchanged ? departure.deltaVRemaining : availableDeltaV(spacecraft);
  const fuelLeft = (spent: MetersPerSecond): Kilograms =>
    unchanged
      ? fuelAfterBurning(launchSpacecraft, metersPerSecond(plan.availableDeltaV - spent))
      : fuelAfterBurning(spacecraft, spent);
  const burns = [...departure.burns];
  let outcome: HopOutcome = { kind: target ? 'arrived' : 'reached-heliopause' };
  let fuelRemaining = unchanged ? fuelLeft(remaining) : spacecraft.fuelMass;

  if (plan.destination === 'body' && departure.landingFactor !== null) {
    const estimated = plan.estimates.landing;
    // An Unsurveyed Landing was planned cautiously; it is flown at the Body's real cost.
    const real = target?.landable ? surfaceBurn(target) : estimated;
    const actual = metersPerSecond(real * departure.landingFactor);
    if (actual <= remaining) {
      remaining = metersPerSecond(remaining - actual);
      fuelRemaining = unchanged ? fuelLeft(remaining) : fuelLeft(actual);
      burns.push({
        status: 'completed',
        burn: 'landing',
        estimated,
        actual,
        fuelAfter: fuelRemaining,
      });
    } else {
      outcome = { kind: 'crashed', shortfall: metersPerSecond(actual - remaining) };
      burns.push({ status: 'ran-out', burn: 'landing', estimated, actual, delivered: remaining });
      remaining = metersPerSecond(0);
      fuelRemaining = kilograms(0);
    }
  }
  const why = explain(plan, outcome, burns, target?.name ?? 'the Heliopause');
  const flight: HopFlight = {
    plan,
    outcome,
    burns,
    fuelAtLaunch: launchSpacecraft.fuelMass,
    fuelRemaining,
    collection: null,
    reveal: null,
    deltaVRemaining: remaining,
    cruiseEvents: cruise.struck,
    fuelLost: cruise.fuelLost,
    why: outcome.kind === 'crashed' && !unchanged ? `${why} ${CRUISE_COST}` : why,
  };
  const settled = (status: RunStatus): Run => ({
    ...run,
    spacecraft: { ...spacecraft, fuelMass: fuelRemaining },
    status,
  });
  switch (outcome.kind) {
    case 'fell-short':
      throw new Error('A Hop that reached its Cruise cannot Fall Short');
    case 'crashed':
      return deepFreeze({
        flight,
        run: settled({ kind: 'ended', end: { kind: 'crashed', reason: flight.why } }),
      });
    case 'reached-heliopause':
      // The Jump always succeeds: the Run goes on in the next Star System, its Damage with it.
      return deepFreeze({ flight, run: jump(settled({ kind: 'landed', bodyId: plan.fromId })) });
    case 'arrived': {
      if (!target) throw new Error('Arrived on no Body');
      const landed = collectYield(settled({ kind: 'landed', bodyId: target.id }), target.id);
      // The landing Surveys the target, then Comms Detects one more Body.
      const learned = revealOnLanding(landed.run, target.id);
      // Stranded is judged after the Cruise, on the Spacecraft as it landed.
      return deepFreeze({
        flight: { ...flight, collection: landed.collection, reveal: learned.reveal },
        run: endIfStranded(learned.run),
      });
    }
  }
}

/** Added to a Crash's why when the Cruise's Damage or leaks took Δv from the Landing. */
const CRUISE_COST = 'Damage in the Cruise left less Δv for the Landing.';

/**
 * A started Hop: the Run in its Cruise, or settled at once when it Fell Short before reaching one.
 * (`beginHop` also returns `invalid-target` for a target that cannot be chosen.)
 */
export type BeginResult =
  { readonly kind: 'cruising'; readonly run: Run } | ({ readonly kind: 'flown' } & FlownHop);

/** Options for starting a Hop. */
export interface HopOptions {
  /**
   * Test only (#210): a fixed Cruise schedule in place of the seed's. Production Runs never pass it,
   * so a Daily or replayed Run cannot be forged with it.
   */
  readonly schedule?: readonly ScheduledEvent[];
  /**
   * Test only: the kinds the seed schedules, in place of `CRUISE_TUNING.enabledKinds`, so the rules of
   * kinds not yet switched on in real Runs can be played and replayed.
   */
  readonly events?: readonly CruiseEventKind[];
}

/**
 * Launches a Hop to `target` and stops at its Cruise: plans it exactly as the player saw it, flies
 * the Takeoff and the Transfer with Burns drawn from the Run's seed and how many Hops it has flown,
 * and draws the Cruise's events from a stream of the seed of their own (`cruiseSchedule`, only the
 * kinds `CRUISE_TUNING.enabledKinds` switches on). Records the `hop` choice. The Cruise then runs
 * through `advanceCruise`, with `startRepair` and `rushRepair` as the player's inputs.
 */
export function beginHop(
  run: Run,
  target: HopTarget,
  options: HopOptions = {},
): BeginResult | Extract<HopPlanResult, { kind: 'invalid-target' }> {
  const planned = planHop(run, target);
  if (planned.kind !== 'planned') return planned;
  const rng = createRng(run.seed ^ stringSeed(`hop:${String(run.hopsFlown)}`));
  const schedule =
    options.schedule ??
    cruiseSchedule(
      run.seed,
      run.hopsFlown + 1,
      run.starSystemNumber,
      run.spacecraft,
      options.events ?? CRUISE_TUNING.enabledKinds,
    );
  const begun = depart(run, planned.plan, rng, schedule);
  const recorded = recordChoice(begun.run, { kind: 'hop', target });
  return begun.kind === 'flown'
    ? { kind: 'flown', flight: begun.flight, run: recorded }
    : { kind: 'cruising', run: recorded };
}

/** Launching either flies the Hop, or explains why the target cannot be chosen. */
export type LaunchResult =
  | { readonly kind: 'flown'; readonly flight: HopFlight; readonly run: Run }
  | Extract<HopPlanResult, { kind: 'invalid-target' }>;

/**
 * Launches a Hop to `target` and flies it to its end with no choices in its Cruise (`beginHop`, then
 * `advanceCruise` to the last tick), so the same Run always flies the same Hop and a seed replays a
 * whole Run. The outcome is settled here, before any playback. Only for a Cruise no Engine fire
 * strikes: one left to burn ends Destroyed, which only `beginHop` and `advanceCruise` report (throws).
 */
export function launchHop(run: Run, target: HopTarget, options: HopOptions = {}): LaunchResult {
  const begun = beginHop(run, target, options);
  if (begun.kind !== 'cruising') return begun;
  const cruised = advanceCruise(begun.run, CRUISE_TUNING.ticks);
  if (cruised.kind !== 'flown') {
    throw new Error('An Engine fire Destroyed the Spacecraft: fly this Cruise with advanceCruise');
  }
  return cruised;
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
 * the sum of every Burn at its best case, so a Hop has a chance exactly when the Fuel gives more.
 */
function successChance(
  burns: readonly EstimatedBurn[],
  available: number,
  bestCase: MetersPerSecond,
): number {
  const widths = burns
    .map((burn) => burn.estimate * (burn.max - DISPERSION.min) + lowerBest(burn))
    .filter((width) => width > 0);
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
  return escapeBurn(body.escapeVelocity);
}

/** A Burn to or from a surface with this escape velocity (see `surfaceBurn`). */
function escapeBurn(escapeVelocity: MetersPerSecond): MetersPerSecond {
  const perEscapeVelocity =
    SOURCED_CONSTANTS.marsAscentDeltaV.value / SOURCED_CONSTANTS.marsEscapeVelocity.value;
  return metersPerSecond(perEscapeVelocity * escapeVelocity);
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

/** How far a Hop is within reach of the Fuel on board: from its Success Chance, thresholds in `REACH_VERDICT`. */
export type ReachVerdict = 'in-reach' | 'marginal' | 'out-of-reach';

export function reachVerdict(plan: Pick<HopPlan, 'successChance'>): ReachVerdict {
  if (plan.successChance >= REACH_VERDICT.inReach) return 'in-reach';
  return plan.successChance > 0 ? 'marginal' : 'out-of-reach';
}

/**
 * The Landing Burn a plan assumes for a Body that is not Surveyed: for the high end of the escape
 * velocity a landable Body of its kind can have, since its real gravity is not yet known. The range
 * is scaled by the Star System's gravity factor, which is public: gravity grows with the level.
 */
function cautiousLandingBurn(run: Run, target: LandableBody): MetersPerSecond {
  return escapeBurn(
    metersPerSecond(UNSURVEYED.cautiousEscapeVelocity[target.kind] * gravityFactor(run)),
  );
}

function gravityFactor(run: Run): number {
  return difficultyFactor(DIFFICULTY_TUNING.gravity, run.starSystemNumber);
}

/** The Landing Burn at the low end of that, before dispersion: the plan's best case. */
function leastLandingBurn(run: Run, target: LandableBody): MetersPerSecond {
  return escapeBurn(
    metersPerSecond(UNSURVEYED.leastEscapeVelocity[target.kind] * gravityFactor(run)),
  );
}
