// What the Spacecraft panel says, as plain data: the catalogue rows, each Component's effect in one
// sentence, the stat bars and the reasons an install is refused. No React here, so it is unit tested.
import {
  availableDeltaV,
  COMPONENT_IDS,
  COMPONENTS,
  componentCost,
  componentEffect,
  kilograms,
  metersPerSecond,
  preview,
  seconds,
  standingRefusal,
  starSystemNumber,
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
  formatDeltaVKmS,
  formatDistanceAu,
  formatFuel,
  formatIsp,
  formatMass,
  kmPerSecondFigure,
} from './format.ts';

const KIND_NAMES: Readonly<Record<ComponentKind, string>> = {
  engine: 'Engine',
  'fuel-tank': 'Fuel Tank',
  drill: 'Drill',
  radar: 'Radar',
  'jump-drive': 'Jump Drive',
  instrument: 'Instrument',
};

/** A Component's name without its level: "Engine", "Fuel Tank", "Drill". */
export function componentName(id: ComponentId): string {
  return KIND_NAMES[COMPONENTS[id].kind];
}

/** A Component with its level, as a short title: "Fuel Tank 1". The Jump Drive has no levels. */
export function componentTitle(id: ComponentId): string {
  const { kind, level } = COMPONENTS[id];
  return kind === 'jump-drive' || kind === 'instrument'
    ? componentName(id)
    : `${componentName(id)} ${String(level)}`;
}

/**
 * The drawn Spacecraft in words, for its text alternative: its Chassis, then each installed
 * Component in Slot order, a repeat counted once ("Hauler: Engine 1, Fuel Tank 1 ×2, Drill 2").
 */
export function describeSpacecraft(spacecraft: {
  readonly chassisId: ChassisId;
  readonly slots: readonly Slot[];
}): string {
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
    case 'instrument':
      return COMPONENTS[id].explanation;
    case 'radar':
      return effect.surveys
        ? `Range ${formatDistanceAu(effect.range)}: finds and Surveys Bodies.`
        : `Range ${formatDistanceAu(effect.range)}: finds Bodies and the Heliopause.`;
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
  /** The cost as a bare number, for beside the Materials icon. */
  readonly costAmount: number;
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
      costAmount: cost,
      effect: describeEffect(run.spacecraft.chassisId, id),
      affordable: run.materials >= cost,
      short: Math.max(0, cost - run.materials),
      unavailable: standing ? describeRefusal(standing) : undefined,
    };
  });
}

/** Which way a figure moves in a preview. The panel says it in words, never by colour alone. */
export type Trend = 'up' | 'down' | 'same';

/** What the panel shows above the stat bars before the player pays for, or confirms, a change. */
export interface PanelPreview {
  readonly heading: string;
  /** Why Δv moves, in one short line beside the bars; an empty string when it does not. */
  readonly note: string;
  /** The rest of the lesson, behind "Tell me more": one sentence per entry. */
  readonly more: readonly string[];
}

const nbsp = (text: string): string =>
  text.replaceAll(' km/s', '\u00a0km/s').replaceAll(' m/s', '\u00a0m/s');

/**
 * Why Δv moves, in one short line: the rocket equation in the player's words. A Fuel Tank starts
 * empty, so its mass costs Δv at once; a better Engine gains more Δv than its mass costs.
 */
function whyLine(change: ProposedChange, kind: ComponentKind, trend: Trend): string {
  if (trend === 'same') return '';
  if (change.kind === 'install') {
    if (kind === 'fuel-tank') return 'Starts empty, so Δv drops.';
    return trend === 'up' ? 'Better Isp, so Δv rises.' : 'More mass, so Δv drops.';
  }
  if (trend === 'up') return 'Less mass, so Δv rises.';
  return kind === 'fuel-tank' ? 'Its Fuel is lost, so Δv drops.' : 'Lower Isp, so Δv drops.';
}

/**
 * What a change would do, as a heading, one short line saying why Δv moves, and the rest of the
 * lesson for "Tell me more". A Fuel Tank teaches the rocket equation both ways: its mass costs Δv
 * while it is empty, and it gives more Δv once the Spacecraft has refuelled. `undefined` when there
 * is nothing to change.
 */
export function describePreview(
  spacecraft: Spacecraft,
  change: ProposedChange,
): PanelPreview | undefined {
  const after = preview(spacecraft, change);
  if (!after) return undefined;
  const held = change.kind === 'remove' ? spacecraft.slots[change.slot] : change.component;
  if (!held) return undefined;
  const component = COMPONENTS[held];
  const [from, to] = [formatDeltaVKmS(availableDeltaV(spacecraft)), formatDeltaVKmS(after.deltaV)];
  const trend = trendOf(from, to, availableDeltaV(spacecraft), after.deltaV);
  const more: string[] = change.kind === 'install' ? [component.explanation] : [];
  if (change.kind === 'install' && component.kind === 'fuel-tank') {
    const filledNow = availableDeltaV({ ...spacecraft, fuelMass: spacecraft.fuelCapacity });
    const direction = after.filledDeltaV >= filledNow ? 'up' : 'down';
    more.push(
      nbsp(
        `Filled up: ${formatDeltaVKmS(after.filledDeltaV)}, ${direction} from ${formatDeltaVKmS(filledNow)}.`,
      ),
    );
  }
  return {
    heading: `${change.kind === 'install' ? 'Install' : 'Remove'} ${componentTitle(held)}`,
    note: whyLine(change, component.kind, trend),
    more,
  };
}

function trendOf(before: string, after: string, from: number, to: number): Trend {
  if (before === after) return 'same';
  return to > from ? 'up' : 'down';
}

export type StatKind = 'mass' | 'fuel' | 'delta-v';

/** A figure after a proposed change, as its bar shows it. */
export interface StatChange {
  readonly value: string;
  readonly share: number;
  /** The difference as a signed number in the unit of the value: "+1.5", "−3.1", "±0". */
  readonly change: string;
  readonly trend: Trend;
  /** Whether the change helps: more Fuel or Δv, or less mass. */
  readonly good: boolean;
}

/** One of the panel's three stat bars: dry mass, Fuel capacity or Δv. */
export interface StatBar {
  readonly kind: StatKind;
  /** The short word beside the bar. */
  readonly label: string;
  readonly value: string;
  /** How full the bar is, 0 to 1, against the most this Chassis could reach. */
  readonly share: number;
  /** The same figure after the change being previewed; `undefined` with nothing previewed. */
  readonly after?: StatChange | undefined;
  /** Everything the bar shows, in words, for a screen reader. */
  readonly name: string;
}

const STAT_NAMES: Readonly<Record<StatKind, string>> = {
  mass: 'Dry mass',
  fuel: 'Fuel capacity',
  'delta-v': 'Δv',
};
const STAT_LABELS: Readonly<Record<StatKind, string>> = {
  mass: 'Mass',
  fuel: 'Fuel',
  'delta-v': 'Δv',
};

const HEAVIEST_COMPONENT = Math.max(...COMPONENT_IDS.map((id) => COMPONENTS[id].mass));

/**
 * What each bar is measured against: the most this Chassis could reach with every Slot used for it.
 * Mass: the heaviest Component in every Slot. Fuel: the largest Fuel Tank in every Slot but the
 * Engine's. Δv: the best Engine and those Tanks, full.
 */
function ceilings(spacecraft: Spacecraft): Record<StatKind, number> {
  const { chassisId, slots } = spacecraft;
  const installed = slots.reduce(
    (sum, slot) => sum + (slot === null ? 0 : COMPONENTS[slot].mass),
    0,
  );
  const chassisMass = spacecraft.dryMass - installed;
  const of = (kind: ComponentKind) => COMPONENT_IDS.filter((id) => COMPONENTS[id].kind === kind);
  const tank = Math.max(
    ...of('fuel-tank').map((id) => {
      const effect = componentEffect(chassisId, id);
      return effect.kind === 'fuel-tank' ? effect.fuelCapacity : 0;
    }),
  );
  const tankMass = Math.max(...of('fuel-tank').map((id) => COMPONENTS[id].mass));
  const isp = Math.max(
    ...of('engine').map((id) => {
      const effect = componentEffect(chassisId, id);
      return effect.kind === 'engine' ? effect.isp : 0;
    }),
  );
  const engineMass = Math.max(...of('engine').map((id) => COMPONENTS[id].mass));
  const tanks = Math.max(1, slots.length - 1);
  return {
    mass: chassisMass + slots.length * HEAVIEST_COMPONENT,
    fuel: tanks * tank,
    'delta-v': availableDeltaV({
      ...spacecraft,
      engineIsp: seconds(isp),
      dryMass: kilograms(chassisMass + engineMass + tanks * tankMass),
      fuelMass: kilograms(tanks * tank),
    }),
  };
}

const figure = (kind: StatKind, amount: number): string =>
  kind === 'delta-v' ? formatDeltaVKmS(metersPerSecond(amount)) : formatMass(kilograms(amount));

const signed = (kind: StatKind, size: number): string =>
  kind === 'delta-v'
    ? kmPerSecondFigure(metersPerSecond(size))
    : formatMass(kilograms(size)).replace(' t', '');

/**
 * The dry mass, Fuel capacity and Δv as bars, Δv in km/s as the top bar shows it. With a `change`,
 * each bar also carries the figure after it, from the simulation's `preview`, so the bars show what
 * the change would really do.
 */
export function statBars(spacecraft: Spacecraft, change?: ProposedChange): readonly StatBar[] {
  const now: Record<StatKind, number> = {
    mass: spacecraft.dryMass,
    fuel: spacecraft.fuelCapacity,
    'delta-v': availableDeltaV(spacecraft),
  };
  const previewed = change && preview(spacecraft, change);
  const then: Record<StatKind, number> | undefined = previewed && {
    mass: previewed.dryMass,
    fuel: previewed.fuelCapacity,
    'delta-v': previewed.deltaV,
  };
  const ceiling = ceilings(spacecraft);
  const kinds: readonly StatKind[] = ['mass', 'fuel', 'delta-v'];
  return kinds.map((kind): StatBar => {
    const scale = Math.max(ceiling[kind], now[kind], then?.[kind] ?? 0);
    const share = (amount: number): number => (scale > 0 ? amount / scale : 0);
    const value = figure(kind, now[kind]);
    if (!then) {
      return {
        kind,
        label: STAT_LABELS[kind],
        value,
        share: share(now[kind]),
        name: `${STAT_NAMES[kind]}: ${value}`,
      };
    }
    const afterValue = figure(kind, then[kind]);
    const trend = trendOf(value, afterValue, now[kind], then[kind]);
    const size = signed(kind, Math.abs(then[kind] - now[kind]));
    const words =
      kind === 'delta-v'
        ? { same: 'No change', up: `Rises ${size} km/s`, down: `Drops ${size} km/s` }[trend]
        : { same: 'No change', up: `Up ${size} t`, down: `Down ${size} t` }[trend];
    return {
      kind,
      label: STAT_LABELS[kind],
      value,
      share: share(now[kind]),
      after: {
        value: afterValue,
        share: share(then[kind]),
        change: { same: '±0', up: `+${size}`, down: `−${size}` }[trend],
        trend,
        good: kind === 'mass' ? trend === 'down' : trend === 'up',
      },
      name: `${STAT_NAMES[kind]}: ${value} now, ${afterValue} after. ${words}.`,
    };
  });
}
