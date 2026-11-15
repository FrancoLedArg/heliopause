import { COMPONENTS, componentCost } from './catalogue.ts';
import { starSystemNumber, type Run } from './run.ts';
import { refit, SLOT_COUNT } from './spacecraft.ts';
import { deepFreeze } from './starSystem.ts';
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
 * at the new capacity. Refuses an empty Slot, the last Engine and the last Fuel Tank. Throws for a
 * Slot that does not exist: a programmer error.
 */
export function remove(run: Run, slotIndex: number): RemoveResult {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT) {
    throw new RangeError(`A Spacecraft has Slots 0 to ${String(SLOT_COUNT - 1)}, not ${slotIndex}`);
  }
  const slots = run.spacecraft.slots;
  const held = slots[slotIndex];
  if (held === null || held === undefined) {
    return { kind: 'refused', reason: { kind: 'empty-slot', slot: slotIndex } };
  }
  const { kind } = COMPONENTS[held];
  const another = slots.some(
    (slot, index) => index !== slotIndex && slot !== null && COMPONENTS[slot].kind === kind,
  );
  if (!another) {
    if (kind === 'engine') return { kind: 'refused', reason: { kind: 'last-engine' } };
    if (kind === 'fuel-tank') return { kind: 'refused', reason: { kind: 'last-fuel-tank' } };
  }
  const spacecraft = refit(
    run.spacecraft,
    slots.map((slot, index) => (index === slotIndex ? null : slot)),
  );
  const refund = materials(Math.floor(componentCost(held, starSystemNumber(run)) / 2));
  return {
    kind: 'removed',
    run: deepFreeze({ ...run, spacecraft, materials: materials(run.materials + refund) }),
    refund,
    fuelLost: kilograms(run.spacecraft.fuelMass - spacecraft.fuelMass),
  };
}
