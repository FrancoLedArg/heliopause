import { COMPONENTS, componentCost, type ComponentId } from './catalogue.ts';
import type { Run } from './run.ts';
import { carriesJumpDrive, refit, SLOT_COUNT } from './spacecraft.ts';
import { deepFreeze } from './starSystem.ts';
import { assertNotEnded, endIfStranded } from './stranded.ts';
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
 * What a refit reads and changes of a Run: the Spacecraft, the Materials, and the Star System
 * number that prices the Jump Drive. The rules of installing and removing work on this alone, so
 * the Stranded rule can try changes without building whole Runs.
 */
export type Outfit = Pick<Run, 'spacecraft' | 'materials' | 'starSystemNumber'>;

/**
 * Why `componentId` cannot be installed on this Spacecraft whatever its Slots and Materials, or
 * `undefined` when nothing stands in the way: today only a second Jump Drive. `install` refuses
 * with it first, and the Spacecraft panel greys the entry out with it.
 */
export function standingRefusal(
  run: Pick<Run, 'spacecraft'>,
  componentId: ComponentId,
): StandingRefusal | undefined {
  return COMPONENTS[componentId].kind === 'jump-drive' && carriesJumpDrive(run.spacecraft)
    ? { kind: 'jump-drive-installed' }
    : undefined;
}

/**
 * Installs `componentId` in Slot `slotIndex` (0-based) by paying its Materials, and refits the
 * Spacecraft so its mass, Fuel capacity and Isp follow. Refuses for a standing reason (a second
 * Jump Drive), when no Slot is empty, when the chosen Slot is taken, or when the Run cannot afford
 * it. Ends the Run as Stranded when the install leaves no way out (see `endIfStranded`). Throws for
 * a Slot that does not exist, or a Run that has ended: programmer errors.
 */
export function install(run: Run, slotIndex: number, componentId: ComponentId): InstallResult {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT) {
    throw new RangeError(`A Spacecraft has Slots 0 to ${String(SLOT_COUNT - 1)}, not ${slotIndex}`);
  }
  assertNotEnded(run);
  const refusal = installRefusal(run, slotIndex, componentId);
  if (refusal) return { kind: 'refused', reason: refusal };
  return {
    kind: 'installed',
    run: endIfStranded(deepFreeze({ ...run, ...withInstalled(run, slotIndex, componentId) })),
  };
}

/** Why `install` would refuse, or `undefined` when it would install. */
export function installRefusal(
  outfit: Outfit,
  slotIndex: number,
  componentId: ComponentId,
): InstallRefusal | undefined {
  const slots = outfit.spacecraft.slots;
  const standing = standingRefusal(outfit, componentId);
  if (standing) return standing;
  if (!slots.includes(null)) return { kind: 'no-empty-slot' };
  const holds = slots[slotIndex];
  if (holds !== null && holds !== undefined) return { kind: 'slot-taken', slot: slotIndex, holds };
  const cost = componentCost(componentId, outfit.starSystemNumber);
  if (outfit.materials < cost) {
    return {
      kind: 'not-enough-materials',
      cost,
      have: outfit.materials,
      short: materials(cost - outfit.materials),
    };
  }
  return undefined;
}

/** The Spacecraft and Materials after an install that `installRefusal` allows. */
export function withInstalled(
  outfit: Outfit,
  slotIndex: number,
  componentId: ComponentId,
): Pick<Outfit, 'spacecraft' | 'materials'> {
  const slots = outfit.spacecraft.slots;
  return {
    spacecraft: refit(
      outfit.spacecraft,
      slots.map((slot, index) => (index === slotIndex ? componentId : slot)),
    ),
    materials: materials(outfit.materials - componentCost(componentId, outfit.starSystemNumber)),
  };
}
