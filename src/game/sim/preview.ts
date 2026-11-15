import type { ComponentId } from './catalogue.ts';
import { availableDeltaV, refit, type Slot, type Spacecraft } from './spacecraft.ts';
import type { Kilograms, MetersPerSecond } from './units.ts';

/** A change the player is weighing: a Component into a Slot (the first empty one by default), or out of one. */
export type ProposedChange =
  | { readonly kind: 'install'; readonly component: ComponentId; readonly slot?: number }
  | { readonly kind: 'remove'; readonly slot: number };

/** What the Spacecraft would be after a change: the figures the Spacecraft panel shows before you pay. */
export interface Preview {
  readonly dryMass: Kilograms;
  readonly fuelCapacity: Kilograms;
  readonly deltaV: MetersPerSecond;
  /** The Δv after the change with every Tank full: what the Spacecraft gives once it has refuelled. */
  readonly filledDeltaV: MetersPerSecond;
}

/**
 * The dry mass, Fuel capacity and Δv the Spacecraft would have after `change`, from `refit` and
 * `availableDeltaV`, so a preview can never disagree with the real thing. It changes nothing and
 * ignores Materials and the last-Engine rules: those are the caller's to say. `undefined` when
 * there is nothing to change: no empty Slot to install into, or an empty Slot to remove from.
 */
export function preview(spacecraft: Spacecraft, change: ProposedChange): Preview | undefined {
  const slots: Slot[] = [...spacecraft.slots];
  if (change.kind === 'install') {
    const slot = change.slot ?? slots.indexOf(null);
    if (slots[slot] !== null) return undefined;
    slots[slot] = change.component;
  } else {
    if (slots[change.slot] === null || slots[change.slot] === undefined) return undefined;
    slots[change.slot] = null;
  }
  const after = refit(spacecraft, slots);
  return {
    dryMass: after.dryMass,
    fuelCapacity: after.fuelCapacity,
    deltaV: availableDeltaV(after),
    filledDeltaV: availableDeltaV({ ...after, fuelMass: after.fuelCapacity }),
  };
}
