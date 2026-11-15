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

declare const loadout: unique symbol;

/**
 * The Slots installed on a Spacecraft, `SLOT_COUNT` long. Only `newSpacecraft` and `refit` make
 * one, because they also derive the figures that go with it: Slots changed any other way (a spread
 * with `slots.with(...)`) do not typecheck as a Spacecraft's, so its figures cannot go stale.
 */
export type Loadout = readonly Slot[] & { readonly [loadout]: true };

/** What a New Run's Spacecraft carries: a level-1 Engine and a level-1 Fuel Tank, 2 Slots empty. */
export const STARTING_SLOTS: readonly Slot[] = ['engine-1', 'fuel-tank-1', null, null];

/**
 * The player's one vehicle: a Chassis with Components in its Slots, and the Fuel it carries.
 *
 * `dryMass`, `fuelCapacity` and `engineIsp` are derived from the Chassis and the Slots whenever the
 * Slots change, so every reader sees plain figures. The `Loadout` type makes `newSpacecraft` and
 * `refit` the only ways to change the Slots.
 */
export interface Spacecraft {
  readonly chassisId: ChassisId;
  readonly slots: Loadout;
  /** Everything but Fuel: the Chassis's own mass plus every installed Component's. */
  readonly dryMass: Kilograms;
  readonly fuelMass: Kilograms;
  /** The sum of the Fuel Tanks' effects on this Chassis (`componentEffect`). */
  readonly fuelCapacity: Kilograms;
  /** The best installed Engine's effect on this Chassis (`componentEffect`); 0 with no Engine. */
  readonly engineIsp: Seconds;
}

/** The Spacecraft a New Run starts with on this Chassis: its starting Components, Fuel full. */
export function newSpacecraft(chassisId: ChassisId): Spacecraft {
  const derived = figures(chassisId, STARTING_SLOTS);
  return {
    chassisId,
    slots: asLoadout(STARTING_SLOTS),
    ...derived,
    fuelMass: derived.fuelCapacity,
  };
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
    slots: asLoadout(slots),
    ...derived,
    fuelMass: kilograms(Math.min(spacecraft.fuelMass, derived.fuelCapacity)),
  };
}

/** The Δv the Spacecraft's Fuel provides: the rocket equation, Isp × g0 × ln(wet mass / dry mass). */
export function availableDeltaV(spacecraft: Spacecraft): MetersPerSecond {
  const wetMass = spacecraft.dryMass + spacecraft.fuelMass;
  return metersPerSecond(exhaustVelocity(spacecraft) * Math.log(wetMass / spacecraft.dryMass));
}

/**
 * The Fuel left after spending `deltaV`: the rocket equation solved for the final mass. With no
 * Engine, no Δv costs no Fuel and any Δv is out of reach, so all of it is gone.
 */
export function fuelAfterBurning(spacecraft: Spacecraft, deltaV: MetersPerSecond): Kilograms {
  const velocity = exhaustVelocity(spacecraft);
  if (velocity === 0) return deltaV > 0 ? kilograms(0) : spacecraft.fuelMass;
  const wetMass = spacecraft.dryMass + spacecraft.fuelMass;
  const finalMass = wetMass * Math.exp(-(deltaV / velocity));
  return kilograms(Math.max(0, finalMass - spacecraft.dryMass));
}

function exhaustVelocity(spacecraft: Spacecraft): number {
  return spacecraft.engineIsp * SOURCED_CONSTANTS.standardGravity.value;
}

/** What a Component gives a Spacecraft on a given Chassis, the Chassis factor applied. */
export type ComponentEffect =
  | { readonly kind: 'engine'; readonly isp: Seconds }
  | { readonly kind: 'fuel-tank'; readonly fuelCapacity: Kilograms }
  | { readonly kind: 'drill'; readonly yieldMultiplier: number }
  | { readonly kind: 'jump-drive' };

/**
 * What a Component gives on this Chassis: an Engine's Isp and a Fuel Tank's capacity scaled by the
 * Chassis (ADR 0005), a Drill's yield multiplier as it is. Show the player this, never the
 * catalogue's base figures; the Spacecraft's own figures are derived from it.
 */
export function componentEffect(chassisId: ChassisId, id: ComponentId): ComponentEffect {
  const chassis = CHASSIS[chassisId];
  const component = COMPONENTS[id];
  switch (component.kind) {
    case 'engine':
      return { kind: 'engine', isp: seconds(chassis.engineIspFactor * component.baseIsp) };
    case 'fuel-tank':
      return {
        kind: 'fuel-tank',
        fuelCapacity: kilograms(chassis.fuelCapacityFactor * component.baseFuelCapacity),
      };
    case 'drill':
      return { kind: 'drill', yieldMultiplier: component.yieldMultiplier };
    case 'jump-drive':
      return { kind: 'jump-drive' };
  }
}

/**
 * The factor on every Body's yield from the Drills on this Spacecraft: 1 with none. The best Drill
 * sets it and further Drills add only mass (the same rule as the Engine, so a Slot spent on a second
 * Drill is a choice with a price, not a way to multiply without limit).
 */
export function drillMultiplier(spacecraft: Spacecraft): number {
  let best = 1;
  for (const slot of spacecraft.slots) {
    if (slot === null) continue;
    const effect = componentEffect(spacecraft.chassisId, slot);
    if (effect.kind === 'drill') best = Math.max(best, effect.yieldMultiplier);
  }
  return best;
}

/** Whether a Jump Drive is installed: the only way to target the Heliopause and make the Jump. */
export function carriesJumpDrive(spacecraft: Pick<Spacecraft, 'slots'>): boolean {
  return spacecraft.slots.some((slot) => slot !== null && COMPONENTS[slot].kind === 'jump-drive');
}

/**
 * The boundary where a list of Slots becomes a Spacecraft's Loadout, the only cast: callers are
 * `newSpacecraft` and `refit`, which derive the figures that go with it.
 */
function asLoadout(slots: readonly Slot[]): Loadout {
  return [...slots] as readonly Slot[] as Loadout;
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
  let dryMass: number = CHASSIS[chassisId].mass;
  let fuelCapacity = 0;
  let engineIsp = 0;
  for (const slot of slots) {
    if (slot === null) continue;
    dryMass += COMPONENTS[slot].mass;
    const effect = componentEffect(chassisId, slot);
    switch (effect.kind) {
      case 'engine':
        engineIsp = Math.max(engineIsp, effect.isp);
        break;
      case 'fuel-tank':
        fuelCapacity += effect.fuelCapacity;
        break;
      case 'drill':
      case 'jump-drive':
        break;
    }
  }
  return {
    dryMass: kilograms(dryMass),
    fuelCapacity: kilograms(fuelCapacity),
    engineIsp: seconds(engineIsp),
  };
}

/** The starting Components' mass, base Fuel capacity and best base Isp, before any Chassis. */
function loadoutTotals(slots: readonly Slot[]) {
  let mass = 0;
  let baseFuelCapacity = 0;
  let bestBaseIsp = 0;
  for (const slot of slots) {
    if (slot === null) continue;
    const component = COMPONENTS[slot];
    mass += component.mass;
    switch (component.kind) {
      case 'engine':
        bestBaseIsp = Math.max(bestBaseIsp, component.baseIsp);
        break;
      case 'fuel-tank':
        baseFuelCapacity += component.baseFuelCapacity;
        break;
      case 'drill':
      case 'jump-drive':
        break;
    }
  }
  return { mass, baseFuelCapacity, bestBaseIsp };
}

/** Each Chassis, calibrated so its starting Components give its Spec A starting figures. */
function calibrate(start: ChassisTuning): Chassis {
  const loadout = loadoutTotals(STARTING_SLOTS);
  const mass = start.dryMass - loadout.mass;
  if (mass <= 0) throw new Error('The starting Components outweigh a Chassis');
  return {
    mass: kilograms(mass),
    engineIspFactor: start.engineIsp / loadout.bestBaseIsp,
    fuelCapacityFactor: start.fuelCapacity / loadout.baseFuelCapacity,
  };
}

const CHASSIS: Readonly<Record<ChassisId, Chassis>> = {
  scout: calibrate(CHASSIS_TUNING.scout),
  hauler: calibrate(CHASSIS_TUNING.hauler),
  lancer: calibrate(CHASSIS_TUNING.lancer),
};
