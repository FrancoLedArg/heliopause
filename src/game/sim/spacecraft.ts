import type { ComponentId } from './catalogue.ts';
import { CHASSIS_TUNING, SOURCED_CONSTANTS, type ChassisId } from './data.ts';
import {
  kilograms,
  metersPerSecond,
  type Kilograms,
  type MetersPerSecond,
  type Seconds,
} from './units.ts';

/** A place on the Spacecraft that holds one Component, or `null` while it is empty. */
export type Slot = ComponentId | null;

/** How many Slots every Spacecraft has. */
export const SLOT_COUNT = 4;

/** What a New Run's Spacecraft carries: a level-1 Engine and a level-1 Fuel Tank, 2 Slots empty. */
export const STARTING_SLOTS: readonly Slot[] = ['engine-1', 'fuel-tank-1', null, null];

/** The player's one vehicle: a Chassis with Components in its Slots, and the Fuel it carries. */
export interface Spacecraft {
  readonly chassisId: ChassisId;
  /** Always `SLOT_COUNT` long. */
  readonly slots: readonly Slot[];
  /** Everything but Fuel. */
  readonly dryMass: Kilograms;
  readonly fuelMass: Kilograms;
  readonly fuelCapacity: Kilograms;
  readonly engineIsp: Seconds;
}

/** The Spacecraft a New Run starts with on this Chassis, Fuel full. */
export function newSpacecraft(chassisId: ChassisId): Spacecraft {
  const chassis = CHASSIS_TUNING[chassisId];
  return { chassisId, slots: STARTING_SLOTS, ...chassis, fuelMass: chassis.fuelCapacity };
}

/** The Δv the Spacecraft's Fuel provides: the rocket equation, Isp × g0 × ln(wet mass / dry mass). */
export function availableDeltaV(spacecraft: Spacecraft): MetersPerSecond {
  const wetMass = spacecraft.dryMass + spacecraft.fuelMass;
  return metersPerSecond(exhaustVelocity(spacecraft) * Math.log(wetMass / spacecraft.dryMass));
}

/** The Fuel left after spending `deltaV`: the rocket equation solved for the final mass. */
export function fuelAfterBurning(spacecraft: Spacecraft, deltaV: MetersPerSecond): Kilograms {
  const wetMass = spacecraft.dryMass + spacecraft.fuelMass;
  const finalMass = wetMass * Math.exp(-(deltaV / exhaustVelocity(spacecraft)));
  return kilograms(Math.max(0, finalMass - spacecraft.dryMass));
}

function exhaustVelocity(spacecraft: Spacecraft): number {
  return spacecraft.engineIsp * SOURCED_CONSTANTS.standardGravity.value;
}
