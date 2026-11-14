// What the Spacecraft panel says, as plain data: the catalogue rows, each Component's effect in one
// sentence, the Mass bar and the reasons an install is refused. No React here, so it is unit tested.
import {
  COMPONENT_IDS,
  COMPONENTS,
  componentEffect,
  SLOT_COUNT,
  type ChassisId,
  type ComponentId,
  type ComponentKind,
  type ComponentLevel,
  type InstallRefusal,
  type Run,
  type Slot,
  type Spacecraft,
} from '../game/sim/index.ts';
import { formatFuel, formatIsp, formatMass } from './format.ts';

const KIND_NAMES: Readonly<Record<ComponentKind, string>> = {
  engine: 'Engine',
  'fuel-tank': 'Fuel Tank',
  drill: 'Drill',
};

/** A Component's name without its level: "Engine", "Fuel Tank", "Drill". */
export function componentName(id: ComponentId): string {
  return KIND_NAMES[COMPONENTS[id].kind];
}

/** A Component with its level, as a phrase: "Fuel Tank, level 1". */
export function componentLabel(id: ComponentId): string {
  return `${componentName(id)}, level ${String(COMPONENTS[id].level)}`;
}

/**
 * What a Component does on this Chassis, in one short sentence. The figures come from
 * `componentEffect`, so they are what the Chassis makes of the Component, never the catalogue's base.
 */
export function describeEffect(chassisId: ChassisId, id: ComponentId): string {
  const effect = componentEffect(chassisId, id);
  switch (effect.kind) {
    case 'engine':
      return `Isp ${formatIsp(effect.isp)}: the best Engine sets your Isp.`;
    case 'fuel-tank':
      return `Holds ${formatFuel(effect.fuelCapacity)} of Fuel.`;
    case 'drill':
      return `Yields ${String(effect.yieldMultiplier)}× from each Body.`;
  }
}

/** Why an install was refused, for the player. */
export function describeRefusal(reason: InstallRefusal): string {
  switch (reason.kind) {
    case 'no-empty-slot':
      return 'Every Slot is full, so there is nowhere to install it.';
    case 'slot-taken': {
      const label = componentLabel(reason.holds);
      const article = /^[AEIOU]/.test(label) ? 'an' : 'a';
      return `Slot ${String(reason.slot + 1)} already holds ${article} ${label}.`;
    }
    case 'not-enough-materials':
      return `Not enough Materials: it costs ${String(reason.cost)} and you have ${String(reason.have)}, ${String(reason.short)} short.`;
  }
}

/** The Slot an install goes into: the selected one when it is empty, otherwise the first empty one. */
export function installTarget(slots: readonly Slot[], selected: number): number | undefined {
  if (slots[selected] === null) return selected;
  const first = slots.indexOf(null);
  return first === -1 ? undefined : first;
}

/** One catalogue entry as the panel shows it. */
export interface PanelRow {
  readonly id: ComponentId;
  readonly name: string;
  readonly level: ComponentLevel;
  readonly mass: string;
  readonly cost: string;
  /** The one-sentence effect on this Chassis. */
  readonly effect: string;
  /** The catalogue's plain explanation of why you might want it. */
  readonly explanation: string;
  /** Whether the Run's Materials cover the cost (the panel still says so in words). */
  readonly affordable: boolean;
  /** How many more Materials the Run needs to afford it; 0 when it can. */
  readonly short: number;
}

/** Every Component in the catalogue, in catalogue order, as it reads on this Run's Chassis. */
export function panelRows(run: Run): readonly PanelRow[] {
  return COMPONENT_IDS.map((id) => {
    const component = COMPONENTS[id];
    return {
      id,
      name: componentName(id),
      level: component.level,
      mass: formatMass(component.mass),
      cost: `${String(component.cost)} Materials`,
      effect: describeEffect(run.spacecraft.chassisId, id),
      explanation: component.explanation,
      affordable: run.materials >= component.cost,
      short: Math.max(0, component.cost - run.materials),
    };
  });
}

const HEAVIEST_COMPONENT = Math.max(...COMPONENT_IDS.map((id) => COMPONENTS[id].mass));

/**
 * The Mass bar: the Spacecraft's dry mass against the most it could weigh on its Chassis, every
 * Slot holding the heaviest Component. `label` is the same figure in words.
 */
export function massBar(spacecraft: Spacecraft): { fraction: number; label: string } {
  const installed = spacecraft.slots.reduce(
    (sum, slot) => sum + (slot === null ? 0 : COMPONENTS[slot].mass),
    0,
  );
  const chassisMass = spacecraft.dryMass - installed;
  const heaviest = chassisMass + SLOT_COUNT * HEAVIEST_COMPONENT;
  return {
    fraction: Math.min(1, spacecraft.dryMass / heaviest),
    label: `Dry mass ${formatMass(spacecraft.dryMass)}`,
  };
}
