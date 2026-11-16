// What a Damaged Component looks like to the player (#210, #250): whether it is Damaged, how far its
// Repair has run, and what a Rush costs now. Shared by the Cruise's ring, the systems lights, the
// Landed view and the Spacecraft panel, so they all show the same truth. Words are only for
// accessible names: the screen shows the ring, the colour and a Scrap or Materials icon with a number.
import {
  COMPONENTS,
  CRUISE_TUNING,
  repairTicksLeft,
  rushCost,
  rushResource,
  type ComponentId,
  type Run,
  type RushResource,
} from '../game/sim/index.ts';
import { componentTitle } from './spacecraftPanelView.ts';

/** A Slot's Repair state, as the player sees it. */
export type RepairState =
  | { readonly kind: 'sound' }
  | {
      readonly kind: 'damaged';
      /** How much of the Repair is done, 0 to 1; `null` while no Repair has started. */
      readonly progress: number | null;
      /** Cruise seconds of Repair left, rounded up. */
      readonly secondsLeft: number;
      /** What a Rush costs now, in Scrap or Materials (`paidIn`): it falls as the Repair runs. */
      readonly rush: number;
      /** What the Rush is paid in (#344): Scrap when the Run has enough, else Materials. */
      readonly paidIn: RushResource;
      /** Whether an Engine fire is burning in it (#251): put out the moment a Repair starts. */
      readonly burning: boolean;
      /** Whether the Run has the Scrap or the Materials for the Rush: when not, the Rush is dimmed. */
      readonly affordable: boolean;
    };

/** The Repair state of the Component in `slot`; `sound` for an empty Slot or a sound Component. */
export function repairState(run: Run, slot: number): RepairState {
  const left = repairTicksLeft(run.spacecraft, slot);
  const rush = rushCost(run.spacecraft, slot);
  const damage = run.spacecraft.damage[slot];
  if (left === null || rush === null || !damage) return { kind: 'sound' };
  const total = left + (damage.repair ?? 0);
  const paidIn = rushResource(run, rush);
  return {
    kind: 'damaged',
    progress: damage.repair === null ? null : damage.repair / total,
    secondsLeft: Math.ceil((left * CRUISE_TUNING.tickMs) / 1000),
    rush,
    paidIn: paidIn ?? 'materials',
    affordable: paidIn !== undefined,
    burning: damage.burning !== null,
  };
}

/** The words for what a Rush is paid in. */
export const RESOURCE_WORD: Readonly<Record<RushResource, string>> = {
  scrap: 'Scrap',
  materials: 'Materials',
};

/** Whether anything aboard is Damaged: the Cruise's music turns tense while it is (#208). */
export function anyDamaged(run: Run): boolean {
  return run.spacecraft.damage.some((damage) => damage !== null);
}

/** What activating a Damaged Component does now: start its Repair, or Rush the one under way. */
export function repairAction(state: RepairState): 'repair' | 'rush' | undefined {
  if (state.kind === 'sound') return undefined;
  if (state.progress === null) return 'repair';
  return state.affordable ? 'rush' : undefined;
}

/**
 * A Component's accessible name with its Repair state: what it is, whether it is Damaged, and what
 * Enter does (the Repair time, or the Rush price).
 */
export function repairName(componentId: ComponentId, state: RepairState): string {
  const title = componentTitle(componentId);
  if (state.kind === 'sound') return `${title}: working`;
  const what = state.burning
    ? 'Damaged, on fire'
    : COMPONENTS[componentId].kind === 'fuel-tank'
      ? 'Damaged, leaking Fuel'
      : 'Damaged';
  const seconds = `${String(state.secondsLeft)} s`;
  if (state.progress === null) return `${title}: ${what}. Repair, ${seconds}`;
  const rush = `${String(state.rush)} ${RESOURCE_WORD[state.paidIn]}`;
  return state.affordable
    ? `${title}: Repairing, ${seconds} left. Rush for ${rush}`
    : `${title}: Repairing, ${seconds} left. Rush needs ${rush}`;
}
