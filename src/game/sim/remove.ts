import { COMPONENTS, componentCost, type ComponentId } from './catalogue.ts';
import type { Outfit } from './install.ts';
import type { Run } from './run.ts';
import { refit, SLOT_COUNT, type Slot } from './spacecraft.ts';
import { deepFreeze } from './starSystem.ts';
import { assertNotEnded, endIfStranded } from './stranded.ts';
import { kilograms, materials, type Kilograms, type Materials } from './units.ts';

/** Why a Component cannot be removed: expected outcomes a player causes, so results, not exceptions. */
export type RemoveRefusal =
  /** The chosen Slot holds nothing. */
  | { readonly kind: 'empty-slot'; readonly slot: number }
  /** It is the only Engine: a Spacecraft with none cannot fly. */
  | { readonly kind: 'last-engine' }
  /** It is the only Fuel Tank: a Spacecraft with none holds no Fuel. */
  | { readonly kind: 'last-fuel-tank' };

export type RemoveResult =
  | {
      readonly kind: 'removed';
      readonly run: Run;
      /** The Materials given back: half the Component's cost, rounded down. */
      readonly refund: Materials;
      /** The Fuel that no longer fits once a Fuel Tank is gone; 0 for any other Component. */
      readonly fuelLost: Kilograms;
    }
  | { readonly kind: 'refused'; readonly reason: RemoveRefusal };

/**
 * Removes the Component in Slot `slotIndex` (0-based), refunds half its Materials cost rounded
 * down, and refits the Spacecraft so its mass, Fuel capacity and Isp follow and its Fuel is capped
 * at the new capacity. Refuses an empty Slot, the last Engine and the last Fuel Tank. Ends the Run as
 * Stranded when the removal leaves no way out (see `endIfStranded`). Throws for a Slot that does not
 * exist, or a Run that has ended: programmer errors.
 */
export function remove(run: Run, slotIndex: number): RemoveResult {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT) {
    throw new RangeError(`A Spacecraft has Slots 0 to ${String(SLOT_COUNT - 1)}, not ${slotIndex}`);
  }
  assertNotEnded(run);
  const refusal = removalRefusal(run.spacecraft.slots, slotIndex);
  if (refusal) return { kind: 'refused', reason: refusal };
  const after = withRemoved(run, slotIndex);
  return {
    kind: 'removed',
    run: endIfStranded(deepFreeze({ ...run, ...after })),
    refund: materials(after.materials - run.materials),
    fuelLost: kilograms(run.spacecraft.fuelMass - after.spacecraft.fuelMass),
  };
}

/** Why `remove` would refuse to empty Slot `slotIndex` of these Slots, or `undefined` when it would not. */
export function removalRefusal(
  slots: readonly Slot[],
  slotIndex: number,
): RemoveRefusal | undefined {
  const held = slots[slotIndex];
  if (held === null || held === undefined) return { kind: 'empty-slot', slot: slotIndex };
  const { kind } = COMPONENTS[held];
  const another = slots.some(
    (slot, index) => index !== slotIndex && slot !== null && COMPONENTS[slot].kind === kind,
  );
  if (another) return undefined;
  if (kind === 'engine') return { kind: 'last-engine' };
  if (kind === 'fuel-tank') return { kind: 'last-fuel-tank' };
  return undefined;
}

/** The Spacecraft and Materials after a removal that `removalRefusal` allows. */
export function withRemoved(
  outfit: Outfit,
  slotIndex: number,
): Pick<Outfit, 'spacecraft' | 'materials'> {
  const slots = outfit.spacecraft.slots;
  const held = slots[slotIndex];
  if (held === null || held === undefined) throw new Error(`Slot ${String(slotIndex)} is empty`);
  return {
    spacecraft: refit(
      outfit.spacecraft,
      slots.map((slot, index) => (index === slotIndex ? null : slot)),
    ),
    materials: materials(outfit.materials + removalRefund(held, outfit.starSystemNumber)),
  };
}

/** What removing `id` gives back in Star System `starSystemNumber`: half its cost, rounded down. */
export function removalRefund(id: ComponentId, starSystemNumber: number): Materials {
  return materials(Math.floor(componentCost(id, starSystemNumber) / 2));
}
