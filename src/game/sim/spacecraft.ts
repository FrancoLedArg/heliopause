import { COMPONENTS, type ComponentId } from './catalogue.ts';
import { CHASSIS_TUNING, SOURCED_CONSTANTS, type ChassisId, type ChassisTuning } from './data.ts';
import {
  kilograms,
  metersPerSecond,
  seconds,
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

/**
 * The player's one vehicle: a Chassis with Components in its Slots, and the Fuel it carries.
 *
 * `dryMass`, `fuelCapacity` and `engineIsp` are derived from the Chassis and the Slots whenever the
 * Slots change (`newSpacecraft`, `refit`), so every reader sees plain figures. Build a Spacecraft
 * through those, never by hand.
 */
export interface Spacecraft {
  readonly chassisId: ChassisId;
  /** Always `SLOT_COUNT` long. */
  readonly slots: readonly Slot[];
  /** Everything but Fuel: the Chassis's own mass plus every installed Component's. */
  readonly dryMass: Kilograms;
  readonly fuelMass: Kilograms;
  /** The sum of the Fuel Tanks, scaled by the Chassis. */
  readonly fuelCapacity: Kilograms;
  /** The best installed Engine's, scaled by the Chassis; 0 with no Engine installed. */
  readonly engineIsp: Seconds;
}

/** The Spacecraft a New Run starts with on this Chassis: its starting Components, Fuel full. */
export function newSpacecraft(chassisId: ChassisId): Spacecraft {
  const derived = figures(chassisId, STARTING_SLOTS);
  return { chassisId, slots: [...STARTING_SLOTS], ...derived, fuelMass: derived.fuelCapacity };
}

/**
 * The same Spacecraft with its Slots holding `slots`: dry mass, Fuel capacity and Isp derived anew
 * from the Chassis and the Components, and its Fuel kept up to the new capacity. Any rule about
 * which changes the player may make (Materials, the last Engine) belongs to the caller.
 */
export function refit(spacecraft: Spacecraft, slots: readonly Slot[]): Spacecraft {
  if (slots.length !== SLOT_COUNT) {
    throw new Error(`A Spacecraft has ${String(SLOT_COUNT)} Slots, not ${String(slots.length)}`);
  }
  const derived = figures(spacecraft.chassisId, slots);
  return {
    chassisId: spacecraft.chassisId,
    slots: [...slots],
    ...derived,
    fuelMass: kilograms(Math.min(spacecraft.fuelMass, derived.fuelCapacity)),
  };
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

/** The figures a set of Slots gives a Spacecraft on this Chassis. */
type Figures = Pick<Spacecraft, 'dryMass' | 'fuelCapacity' | 'engineIsp'>;

/**
 * A Chassis: its own mass, and factors on the Isp of its Engines and the capacity of its Fuel
 * Tanks (ADR 0005). Gameplay tuning, calibrated from Spec A's starting figures so a new Spacecraft
 * on each Chassis starts exactly as `CHASSIS_TUNING` says.
 */
interface Chassis {
  readonly mass: Kilograms;
  readonly engineIspFactor: number;
  readonly fuelCapacityFactor: number;
}

function figures(chassisId: ChassisId, slots: readonly Slot[]): Figures {
  const chassis = CHASSIS[chassisId];
  const loadout = components(slots);
  return {
    dryMass: kilograms(chassis.mass + loadout.mass),
    fuelCapacity: kilograms(chassis.fuelCapacityFactor * loadout.fuelCapacity),
    engineIsp: seconds(chassis.engineIspFactor * loadout.bestIsp),
  };
}

/** What the installed Components add up to, before the Chassis scales them. */
function components(slots: readonly Slot[]) {
  let mass = 0;
  let fuelCapacity = 0;
  let bestIsp = 0;
  for (const slot of slots) {
    if (slot === null) continue;
    const component = COMPONENTS[slot];
    mass += component.mass;
    switch (component.kind) {
      case 'engine':
        bestIsp = Math.max(bestIsp, component.isp);
        break;
      case 'fuel-tank':
        fuelCapacity += component.fuelCapacity;
        break;
      case 'drill':
        break;
    }
  }
  return { mass, fuelCapacity, bestIsp };
}

/** Each Chassis, calibrated so its starting Components give its Spec A starting figures. */
function calibrate(start: ChassisTuning): Chassis {
  const loadout = components(STARTING_SLOTS);
  const mass = start.dryMass - loadout.mass;
  if (mass <= 0) throw new Error('The starting Components outweigh a Chassis');
  return {
    mass: kilograms(mass),
    engineIspFactor: start.engineIsp / loadout.bestIsp,
    fuelCapacityFactor: start.fuelCapacity / loadout.fuelCapacity,
  };
}

const CHASSIS: Readonly<Record<ChassisId, Chassis>> = {
  scout: calibrate(CHASSIS_TUNING.scout),
  hauler: calibrate(CHASSIS_TUNING.hauler),
  lancer: calibrate(CHASSIS_TUNING.lancer),
};
