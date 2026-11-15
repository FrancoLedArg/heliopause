import { COMPONENTS, componentCost, type ComponentId } from './catalogue.ts';
import { starSystemNumber, type Run } from './run.ts';
import { carriesJumpDrive, refit, SLOT_COUNT } from './spacecraft.ts';
import { deepFreeze } from './starSystem.ts';
import { materials, type Materials } from './units.ts';

/** Why a Component cannot be installed: expected outcomes a player causes, so results, not exceptions. */
export type InstallRefusal =
  /** Every Slot holds a Component. */
  | { readonly kind: 'no-empty-slot' }
  /** The chosen Slot is taken while another is empty. */
  | { readonly kind: 'slot-taken'; readonly slot: number; readonly holds: ComponentId }
  /** A Jump Drive is already installed: one is all the Jump needs, and it burns out only one. */
  | { readonly kind: 'jump-drive-installed' }
  /** The Run's Materials do not cover the cost. */
  | {
      readonly kind: 'not-enough-materials';
      readonly cost: Materials;
      readonly have: Materials;
      readonly short: Materials;
    };

export type InstallResult =
  | { readonly kind: 'installed'; readonly run: Run }
  | { readonly kind: 'refused'; readonly reason: InstallRefusal };

/** A refusal that no free Slot or Materials can lift. */
export type StandingRefusal = Extract<InstallRefusal, { kind: 'jump-drive-installed' }>;

/**
 * Why `componentId` cannot be installed on this Spacecraft whatever its Slots and Materials, or
 * `undefined` when nothing stands in the way: today only a second Jump Drive. `install` refuses
 * with it first, and the Spacecraft panel greys the entry out with it.
 */
export function standingRefusal(run: Run, componentId: ComponentId): StandingRefusal | undefined {
  return COMPONENTS[componentId].kind === 'jump-drive' && carriesJumpDrive(run.spacecraft)
    ? { kind: 'jump-drive-installed' }
    : undefined;
}

/**
 * Installs `componentId` in Slot `slotIndex` (0-based) by paying its Materials, and refits the
 * Spacecraft so its mass, Fuel capacity and Isp follow. Refuses for a standing reason (a second
 * Jump Drive), when no Slot is empty, when the chosen Slot is taken, or when the Run cannot afford
 * it. Throws for a Slot that does not exist: a programmer error.
 */
export function install(run: Run, slotIndex: number, componentId: ComponentId): InstallResult {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT) {
    throw new RangeError(`A Spacecraft has Slots 0 to ${String(SLOT_COUNT - 1)}, not ${slotIndex}`);
  }
  const slots = run.spacecraft.slots;
  const standing = standingRefusal(run, componentId);
  if (standing) return refused(standing);
  if (!slots.includes(null)) return refused({ kind: 'no-empty-slot' });
  const holds = slots[slotIndex];
  if (holds !== null && holds !== undefined) {
    return refused({ kind: 'slot-taken', slot: slotIndex, holds });
  }
  const cost = componentCost(componentId, starSystemNumber(run));
  if (run.materials < cost) {
    return refused({
      kind: 'not-enough-materials',
      cost,
      have: run.materials,
      short: materials(cost - run.materials),
    });
  }
  return {
    kind: 'installed',
    run: deepFreeze({
      ...run,
      spacecraft: refit(
        run.spacecraft,
        slots.map((slot, index) => (index === slotIndex ? componentId : slot)),
      ),
      materials: materials(run.materials - cost),
    }),
  };
}

function refused(reason: InstallRefusal): InstallResult {
  return { kind: 'refused', reason };
}
