// What the Spacecraft panel says, as plain data: the catalogue rows, each Component's effect in one
// sentence, the Mass bar and the reasons an install is refused. No React here, so it is unit tested.
import {
  availableDeltaV,
  COMPONENT_IDS,
  COMPONENTS,
  componentCost,
  componentEffect,
  kilograms,
  metersPerSecond,
  preview,
  SLOT_COUNT,
  standingRefusal,
  starSystemNumber,
  type Preview,
  type ProposedChange,
  type ChassisId,
  type ComponentId,
  type ComponentKind,
  type ComponentLevel,
  type InstallRefusal,
  type Kilograms,
  type Materials,
  type RemoveRefusal,
  type Run,
  type Slot,
  type Spacecraft,
} from '../game/sim/index.ts';
import {
  chassisName,
  deltaVUnit,
  formatDeltaV,
  formatFuel,
  formatIsp,
  formatMass,
} from './format.ts';

const KIND_NAMES: Readonly<Record<ComponentKind, string>> = {
  engine: 'Engine',
  'fuel-tank': 'Fuel Tank',
  drill: 'Drill',
  'jump-drive': 'Jump Drive',
};

/** A Component's name without its level: "Engine", "Fuel Tank", "Drill". */
export function componentName(id: ComponentId): string {
  return KIND_NAMES[COMPONENTS[id].kind];
}

/** A Component with its level, as a short title: "Fuel Tank 1". The Jump Drive has no levels. */
export function componentTitle(id: ComponentId): string {
  const { kind, level } = COMPONENTS[id];
  return kind === 'jump-drive' ? componentName(id) : `${componentName(id)} ${String(level)}`;
}

/**
 * The drawn Spacecraft in words, for its text alternative: its Chassis, then each installed
 * Component in Slot order, a repeat counted once ("Hauler: Engine 1, Fuel Tank 1 ×2, Drill 2").
 */
export function describeSpacecraft(spacecraft: Pick<Spacecraft, 'chassisId' | 'slots'>): string {
  const counts = new Map<ComponentId, number>();
  for (const id of spacecraft.slots) if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
  const parts = [...counts].map(([id, n]) =>
    n > 1 ? `${componentTitle(id)} ×${String(n)}` : componentTitle(id),
  );
  return `${chassisName(spacecraft.chassisId)}: ${parts.join(', ')}`;
}

/** A Component with its level, as a phrase: "Fuel Tank, level 1". The Jump Drive has no levels. */
export function componentLabel(id: ComponentId): string {
  const { kind, level } = COMPONENTS[id];
  return kind === 'jump-drive' ? componentName(id) : `${componentName(id)}, level ${String(level)}`;
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
    case 'jump-drive':
      return 'Escapes the Star System, at the Heliopause only.';
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
    case 'jump-drive-installed':
      return 'You already carry a Jump Drive.';
    case 'not-enough-materials':
      return `Not enough Materials: it costs ${String(reason.cost)} and you have ${String(reason.have)}, ${String(reason.short)} short.`;
  }
}

/** Why a removal was refused, for the player. */
export function describeRemoveRefusal(reason: RemoveRefusal): string {
  switch (reason.kind) {
    case 'empty-slot':
      return `Slot ${String(reason.slot + 1)} is empty, so there is nothing to remove.`;
    case 'last-engine':
      return 'It is your last Engine, and without one you cannot fly.';
    case 'last-fuel-tank':
      return 'It is your last Fuel Tank, and without one you have no Fuel.';
  }
}

/** The question the panel asks before it removes: what comes back, and what Fuel is lost. */
export function describeRemoval(removal: {
  readonly slot: number;
  readonly held: ComponentId;
  readonly refund: Materials;
  readonly fuelLost: Kilograms;
}): string {
  const asked = `Remove ${componentLabel(removal.held)} from Slot ${String(removal.slot + 1)}? You get ${String(removal.refund)} Materials back.`;
  return removal.fuelLost > 0
    ? `${asked} ${formatFuel(removal.fuelLost)} of Fuel will be lost.`
    : asked;
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
  /** The name with its level, as the catalogue shows it: "Engine 1", "Jump Drive". */
  readonly title: string;
  readonly mass: string;
  readonly cost: string;
  /** The one-sentence effect on this Chassis. */
  readonly effect: string;
  /** Whether the Run's Materials cover the cost (the panel still says so in words). */
  readonly affordable: boolean;
  /** How many more Materials the Run needs to afford it; 0 when it can. */
  readonly short: number;
  /**
   * Why it cannot be installed whatever the Materials (a second Jump Drive); `undefined` when it can.
   * The panel greys the entry out and shows this.
   */
  readonly unavailable: string | undefined;
}

/** Every Component in the catalogue, in catalogue order, as it reads on this Run's Chassis. */
export function panelRows(run: Run): readonly PanelRow[] {
  return COMPONENT_IDS.map((id) => {
    const component = COMPONENTS[id];
    const cost = componentCost(id, starSystemNumber(run));
    // The simulation's own rule, so the panel and `install` never disagree.
    const standing = standingRefusal(run, id);
    return {
      id,
      name: componentName(id),
      level: component.level,
      title: componentTitle(id),
      mass: formatMass(component.mass),
      cost: `${String(cost)} Materials`,
      effect: describeEffect(run.spacecraft.chassisId, id),
      affordable: run.materials >= cost,
      short: Math.max(0, cost - run.materials),
      unavailable: standing ? describeRefusal(standing) : undefined,
    };
  });
}

/** Which way a figure moves in a preview. The panel says it in words, never by colour alone. */
export type Trend = 'up' | 'down' | 'same';

/** One figure in a preview: before → after, and the difference in words. */
export interface PreviewLine {
  readonly label: string;
  /** Which figure it is, so the panel need not read the label to treat Δv differently. */
  readonly kind: 'mass' | 'fuel' | 'delta-v';
  readonly before: string;
  readonly after: string;
  /** "+1.5 t", "−0.8 t", "Drops 3.1 km/s", "Rises 1.0 km/s" or "No change". */
  readonly change: string;
  readonly trend: Trend;
}

/** What the panel shows before the player pays for, or confirms, a change. */
export interface PanelPreview {
  readonly heading: string;
  /** Dry mass, Fuel capacity and Δv, in that order. */
  readonly lines: readonly PreviewLine[];
  /** The lesson the change teaches, or an empty string. */
  readonly note: string;
}

function trendOf(before: string, after: string, from: number, to: number): Trend {
  if (before === after) return 'same';
  return to > from ? 'up' : 'down';
}

function massLine(
  kind: 'mass' | 'fuel',
  label: string,
  from: Kilograms,
  to: Kilograms,
): PreviewLine {
  const [before, after] = [formatMass(from), formatMass(to)];
  const trend = trendOf(before, after, from, to);
  const size = formatMass(kilograms(Math.abs(to - from)));
  const change = { same: 'No change', up: `+${size}`, down: `−${size}` }[trend];
  return { label, kind, before, after, change, trend };
}

/**
 * The two lines under a preview. A Fuel Tank teaches the rocket equation both ways: its mass
 * costs Δv while it is empty, and it gives more Δv once the Spacecraft has refuelled. Any other
 * Component installed says in one sentence why you might want it. A removal says nothing more.
 */
function noteFor(
  spacecraft: Spacecraft,
  change: ProposedChange,
  after: Preview,
  component: (typeof COMPONENTS)[ComponentId],
): string {
  if (change.kind === 'remove') return '';
  if (component.kind !== 'fuel-tank') return component.explanation;
  const filledNow = availableDeltaV({ ...spacecraft, fuelMass: spacecraft.fuelCapacity });
  const direction = after.filledDeltaV >= filledNow ? 'up' : 'down';
  return `Starts empty, so Δv drops. Filled up: ${formatDeltaV(after.filledDeltaV)}, ${direction} from ${formatDeltaV(filledNow)}.`
    .replaceAll(' km/s', '\u00a0km/s')
    .replaceAll(' m/s', '\u00a0m/s');
}

/**
 * The Spacecraft's dry mass, Fuel capacity and Δv after `change`, as before → after with the
 * difference. The figures come from the simulation's `preview`, so they are what the change would
 * really do. A drop in Δv says "Drops". `undefined` when there is nothing to change.
 */
export function describePreview(
  spacecraft: Spacecraft,
  change: ProposedChange,
): PanelPreview | undefined {
  const after = preview(spacecraft, change);
  if (!after) return undefined;
  const [from, to] = [availableDeltaV(spacecraft), after.deltaV];
  const [deltaBefore, deltaAfter] = [formatDeltaV(from), formatDeltaV(to)];
  const trend = trendOf(deltaBefore, deltaAfter, from, to);
  // The difference reads in the unit of the figures beside it, so 22.1 → 19.0 km/s drops 3.1 km/s.
  const size = formatDeltaV(
    metersPerSecond(Math.abs(to - from)),
    deltaVUnit(metersPerSecond(Math.max(from, to))),
  );
  const deltaChange = { same: 'No change', up: `Rises ${size}`, down: `Drops ${size}` }[trend];
  const held = change.kind === 'remove' ? spacecraft.slots[change.slot] : change.component;
  if (!held) return undefined;
  const component = COMPONENTS[held];
  return {
    heading: `${change.kind === 'install' ? 'Install' : 'Remove'} ${componentTitle(held)}`,
    lines: [
      massLine('mass', 'Dry mass', spacecraft.dryMass, after.dryMass),
      massLine('fuel', 'Fuel cap.', spacecraft.fuelCapacity, after.fuelCapacity),
      {
        label: 'Δv',
        kind: 'delta-v',
        before: deltaBefore,
        after: deltaAfter,
        change: deltaChange,
        trend,
      },
    ],
    note: noteFor(spacecraft, change, after, component),
  };
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
