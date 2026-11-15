// Repair and Rush (#210): clearing a Damaged Component's Damage, over Cruise time for free, or at
// once for Materials. Both work while cruising and while landed, alongside install and remove.
import { recordChoice } from './choiceLog.ts';
import { endStruck, rushCost } from './cruise.ts';
import type { Run } from './run.ts';
import { withDamage, SLOT_COUNT, type Spacecraft } from './spacecraft.ts';
import { deepFreeze } from './starSystem.ts';
import { endIfStranded } from './stranded.ts';
import { materials, type Materials } from './units.ts';

/** Why a Repair or a Rush was refused: an expected result a player can cause, not an error. */
export type RepairRefusal =
  | { readonly kind: 'empty-slot'; readonly slot: number }
  | { readonly kind: 'not-damaged'; readonly slot: number }
  /** Only for starting a Repair: one is already running there. */
  | { readonly kind: 'already-repairing'; readonly slot: number }
  /** Only for a Rush. */
  | { readonly kind: 'not-enough-materials'; readonly cost: Materials; readonly have: Materials };

export type RepairResult =
  | { readonly kind: 'repairing'; readonly run: Run }
  | { readonly kind: 'refused'; readonly reason: RepairRefusal };

export type RushResult =
  | { readonly kind: 'rushed'; readonly run: Run; readonly cost: Materials }
  | { readonly kind: 'refused'; readonly reason: RepairRefusal };

/**
 * Starts a Repair of the Damaged Component in `slot`: it costs nothing, and puts out an Engine fire
 * at once (the Engine stays Damaged until the Repair is done). While cruising, it runs on the Cruise's
 * ticks from the next one; while landed, it waits for the next Cruise. Logged with the Cruise tick it
 * was started on (none while landed). Throws for a Slot the Spacecraft does not have or an ended Run.
 */
export function startRepair(run: Run, slot: number): RepairResult {
  const refusal = damagedRefusal(run, slot);
  if (refusal) return { kind: 'refused', reason: refusal };
  const damage = run.spacecraft.damage[slot];
  if (damage && damage.repair !== null) {
    return { kind: 'refused', reason: { kind: 'already-repairing', slot } };
  }
  const repaired = run.spacecraft.damage.with(slot, { repair: 0, burning: null });
  const changed = { ...run, spacecraft: withDamage(run.spacecraft, repaired) };
  return { kind: 'repairing', run: settle(changed, { kind: 'repair', slot, ...tickOf(run) }) };
}

/**
 * Rushes the Repair of the Damaged Component in `slot`, started or not: it is done at once, for
 * `rushCost` Materials. Refused when the Run has fewer. Logged like a Repair.
 */
export function rushRepair(run: Run, slot: number): RushResult {
  const refusal = damagedRefusal(run, slot);
  if (refusal) return { kind: 'refused', reason: refusal };
  const cost = rushCost(run.spacecraft, slot) ?? materials(0);
  if (cost > run.materials) {
    return { kind: 'refused', reason: { kind: 'not-enough-materials', cost, have: run.materials } };
  }
  const changed: Run = {
    ...run,
    spacecraft: rushed(run.spacecraft, slot),
    materials: materials(run.materials - cost),
    status: run.status.kind === 'cruising' ? endedInCruise(run.status, slot) : run.status,
  };
  return { kind: 'rushed', cost, run: settle(changed, { kind: 'rush', slot, ...tickOf(run) }) };
}

/** The Spacecraft with `slot`'s Damage cleared: what a Rush makes of it. */
export function rushed(spacecraft: Spacecraft, slot: number): Spacecraft {
  return withDamage(spacecraft, spacecraft.damage.with(slot, null));
}

function endedInCruise(
  status: Extract<Run['status'], { kind: 'cruising' }>,
  slot: number,
): Run['status'] {
  const struck = [...status.cruise.struck];
  endStruck(struck, slot, status.cruise.tick);
  return { ...status, cruise: { ...status.cruise, struck } };
}

function damagedRefusal(run: Run, slot: number): RepairRefusal | undefined {
  if (run.status.kind === 'ended') throw new Error(`Run ${String(run.seed)} has ended`);
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) {
    throw new RangeError(`A Spacecraft has Slots 0 to ${String(SLOT_COUNT - 1)}, not ${slot}`);
  }
  if (run.spacecraft.slots[slot] === null) return { kind: 'empty-slot', slot };
  if (!run.spacecraft.damage[slot]) return { kind: 'not-damaged', slot };
  return undefined;
}

/** The Cruise tick a choice is made on, for its log entry; none while landed. */
function tickOf(run: Run): { readonly tick?: number } {
  return run.status.kind === 'cruising' ? { tick: run.status.cruise.tick } : {};
}

/** Records the choice; one made while landed goes through `endIfStranded`, like install and remove. */
function settle(run: Run, choice: Parameters<typeof recordChoice>[1]): Run {
  return endIfStranded(deepFreeze(recordChoice(run, choice)));
}
