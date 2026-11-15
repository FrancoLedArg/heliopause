import { COMPONENTS } from './catalogue.ts';
import type { Choice, ChoiceLog } from './choiceLog.ts';
import { CHASSIS_IDS, type ChassisId } from './data.ts';
import { CRUISE_TUNING } from './data.ts';
import { advanceCruise, beginHop, HELIOPAUSE, type HopOptions } from './hop.ts';
import { install, type InstallRefusal } from './install.ts';
import { remove, type RemoveRefusal } from './remove.ts';
import { rushRepair, startRepair, type RepairRefusal } from './repair.ts';
import { startRun, type Run, type RunEnd } from './run.ts';
import { runEnd, score, type Score } from './score.ts';
import { SLOT_COUNT } from './spacecraft.ts';
import { findBody, type Seed } from './starSystem.ts';

/**
 * A replayed choice log either rebuilds the Run, or stops at the first choice the Run could not
 * have taken: a log that was not played, so its Score cannot be trusted. A seed or Chassis no Run
 * can start from is unplayable.
 */
export type ReplayResult =
  | {
      readonly kind: 'replayed';
      readonly run: Run;
      readonly score: Score;
      /** How the Run ended; `undefined` when the log stops while it is still being played. */
      readonly end: RunEnd | undefined;
    }
  | {
      readonly kind: 'rejected';
      /** The index in the log of the first choice the Run could not take. */
      readonly at: number;
      readonly choice: Choice;
      /** Plain language: why the Run could not take it. */
      readonly why: string;
    }
  | {
      readonly kind: 'unplayable';
      /** Plain language: why no Run starts from this seed and Chassis. */
      readonly why: string;
    };

/**
 * Rebuilds a Run from its seed, its Chassis and the choices its player made, by playing each choice
 * in order exactly as the game did. Every Hop draws its Burns from the seed and how many Hops came
 * before it, so the same log always flies the same Hops.
 *
 * A stored or received log must come through `parseChoiceLog` first: that is where malformed data
 * is turned away. A well-formed log the game could not have played (for instance, from a tampered
 * record) is rejected here, and a seed or Chassis from such a record is unplayable; neither throws,
 * since a server replaying a submitted Score must expect both.
 *
 * A Repair or Rush made in the Cruise is taken at its tick: the Cruise is advanced to it first, with
 * no player actions. Before any other choice, and at the end of the log, a Cruise still running is
 * flown to its last tick. `options` is test only (`HopOptions.events`), as it is for `beginHop`.
 */
export function replay(
  seed: Seed,
  chassisId: ChassisId,
  log: ChoiceLog,
  options: Pick<HopOptions, 'events'> = {},
): ReplayResult {
  if (!Number.isSafeInteger(seed)) {
    return { kind: 'unplayable', why: `The seed ${String(seed)} is not a whole number.` };
  }
  if (!CHASSIS_IDS.includes(chassisId)) {
    return { kind: 'unplayable', why: `There is no Chassis ${chassisId}.` };
  }
  let run = startRun(seed, chassisId);
  for (const [at, choice] of log.entries()) {
    const taken = take(run, choice, options);
    if (taken.kind === 'impossible') return { kind: 'rejected', at, choice, why: taken.why };
    run = taken.run;
  }
  run = cruiseTo(run, CRUISE_TUNING.ticks);
  return { kind: 'replayed', run, score: score(run), end: runEnd(run) };
}

/** The Run with its Cruise, if it is cruising, advanced to `tick`: flown to its end at the last. */
function cruiseTo(run: Run, tick: number): Run {
  return run.status.kind === 'cruising' ? advanceCruise(run, tick).run : run;
}

/** The Run after one choice, or why the Run could not take it. */
type Taken =
  | { readonly kind: 'taken'; readonly run: Run }
  | { readonly kind: 'impossible'; readonly why: string };

const impossible = (why: string): Taken => ({ kind: 'impossible', why });

function take(run: Run, choice: Choice, options: Pick<HopOptions, 'events'>): Taken {
  if ((choice.kind === 'repair' || choice.kind === 'rush') && choice.tick !== undefined) {
    return takeInCruise(run, choice, choice.tick);
  }
  const landed = cruiseTo(run, CRUISE_TUNING.ticks);
  // Every other choice is made while the Spacecraft is landed on a Body.
  if (landed.status.kind !== 'landed')
    return impossible('The Spacecraft was not landed on a Body.');
  return takeLanded(landed, choice, options);
}

/** A Repair or Rush made in the Cruise, at its tick. */
function takeInCruise(
  run: Run,
  choice: Extract<Choice, { kind: 'repair' | 'rush' }>,
  tick: number,
): Taken {
  if (run.status.kind !== 'cruising') return impossible('The Spacecraft was not in a Cruise.');
  if (tick < run.status.cruise.tick || tick >= CRUISE_TUNING.ticks) {
    return impossible(`Cruise tick ${String(tick)} was not ahead in the Cruise.`);
  }
  const cruised = advanceCruise(run, tick);
  if (cruised.kind !== 'cruising') return impossible('The Spacecraft was Destroyed before then.');
  return repaired(cruised.run, choice);
}

function repaired(run: Run, choice: Extract<Choice, { kind: 'repair' | 'rush' }>): Taken {
  if (!isSlot(choice.slot)) return impossible(`The Spacecraft has no Slot ${String(choice.slot)}.`);
  const result =
    choice.kind === 'repair' ? startRepair(run, choice.slot) : rushRepair(run, choice.slot);
  return result.kind === 'refused'
    ? impossible(repairRefused(result.reason))
    : { kind: 'taken', run: result.run };
}

function takeLanded(run: Run, choice: Choice, options: Pick<HopOptions, 'events'>): Taken {
  switch (choice.kind) {
    case 'repair':
    case 'rush':
      return repaired(run, choice);
    case 'install': {
      if (!isSlot(choice.slot))
        return impossible(`The Spacecraft has no Slot ${String(choice.slot)}.`);
      if (!Object.hasOwn(COMPONENTS, choice.componentId)) {
        return impossible(`There is no Component ${choice.componentId}.`);
      }
      const result = install(run, choice.slot, choice.componentId);
      return result.kind === 'installed'
        ? { kind: 'taken', run: result.run }
        : impossible(installRefused(result.reason));
    }
    case 'remove': {
      if (!isSlot(choice.slot))
        return impossible(`The Spacecraft has no Slot ${String(choice.slot)}.`);
      const result = remove(run, choice.slot);
      return result.kind === 'removed'
        ? { kind: 'taken', run: result.run }
        : impossible(removeRefused(result.reason));
    }
    case 'hop': {
      if (choice.target !== HELIOPAUSE && !findBody(run.starSystem, choice.target)) {
        return impossible(`The Star System has no Body ${choice.target}.`);
      }
      const result = beginHop(run, choice.target, options);
      return result.kind === 'invalid-target'
        ? impossible(result.why)
        : { kind: 'taken', run: result.run };
    }
  }
}

function isSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT;
}

/** Why the Run refused an install, in plain language. */
function installRefused(reason: InstallRefusal): string {
  switch (reason.kind) {
    case 'no-empty-slot':
      return 'Every Slot already held a Component.';
    case 'slot-taken':
      return `Slot ${String(reason.slot)} already held a Component (${reason.holds}).`;
    case 'jump-drive-installed':
      return 'A Jump Drive was already installed.';
    case 'blueprint-locked':
      return `Its blueprint needed ${String(reason.scienceNeeded)} more Science.`;
    case 'not-enough-materials':
      return `It cost ${String(reason.cost)} Materials and the Run had ${String(reason.have)}.`;
  }
}

/** Why the Run refused a Repair or a Rush, in plain language. */
function repairRefused(reason: RepairRefusal): string {
  switch (reason.kind) {
    case 'empty-slot':
      return `Slot ${String(reason.slot)} was empty.`;
    case 'not-damaged':
      return `Slot ${String(reason.slot)} was not Damaged.`;
    case 'already-repairing':
      return `Slot ${String(reason.slot)} was already being Repaired.`;
    case 'not-enough-materials':
      return `It cost ${String(reason.cost)} Materials and the Run had ${String(reason.have)}.`;
  }
}

/** Why the Run refused a removal, in plain language. */
function removeRefused(reason: RemoveRefusal): string {
  switch (reason.kind) {
    case 'empty-slot':
      return `Slot ${String(reason.slot)} was empty.`;
    case 'last-engine':
      return 'It was the only Engine.';
    case 'last-fuel-tank':
      return 'It was the only Fuel Tank.';
  }
}
