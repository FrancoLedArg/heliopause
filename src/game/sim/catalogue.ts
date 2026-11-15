// The Component catalogue: what each Component weighs, costs and does. Real-world-flavoured figures
// cite `docs/research/propulsion-trade-offs.md`; the rest is gameplay tuning. An Engine's Isp and a
// Fuel Tank's capacity here are base figures: the Chassis it is installed on scales them (ADR 0005),
// so what the player gets, and must be shown, comes from `componentEffect` in spacecraft.ts.
import {
  kilograms,
  materials,
  seconds,
  type Kilograms,
  type Materials,
  type Seconds,
} from './units.ts';

/**
 * Every Component the Spacecraft can carry: Engine, Fuel Tank and Drill at levels 1 and 2, and the
 * Jump Drive. These ids are stored in choice logs (see `choiceLog.ts`): never rename or reuse one,
 * or stored logs stop parsing or replay a different Component. Add new ids instead.
 */
export const COMPONENT_IDS = [
  'engine-1',
  'engine-2',
  'fuel-tank-1',
  'fuel-tank-2',
  'drill-1',
  'drill-2',
  'jump-drive',
] as const;
export type ComponentId = (typeof COMPONENT_IDS)[number];

export type ComponentLevel = 1 | 2;

/**
 * Where a Component's figures come from. A sourced Component's real-world-flavoured figure (its Isp
 * or its tank's share of mass) comes from `source`, which says which figure that is; its Materials
 * cost is always gameplay tuning. A tuning Component is chosen for play throughout.
 */
export type Provenance =
  { readonly kind: 'sourced'; readonly source: string } | { readonly kind: 'gameplay-tuning' };

interface ComponentEntry {
  readonly id: ComponentId;
  readonly level: ComponentLevel;
  /** Added to the Spacecraft's dry mass while installed. */
  readonly mass: Kilograms;
  /** What installing it costs. */
  readonly cost: Materials;
  /** One plain sentence for the player: what it does and what it costs in mass. */
  readonly explanation: string;
  readonly provenance: Provenance;
}

/** Turns Fuel into Δv. The best installed Engine sets the Spacecraft's Isp. */
export interface Engine extends ComponentEntry {
  readonly kind: 'engine';
  /** Before the Chassis scales it. Show the player `componentEffect`, never this. */
  readonly baseIsp: Seconds;
}

/** Holds Fuel. The Spacecraft's Fuel capacity is the sum of its Fuel Tanks. */
export interface FuelTank extends ComponentEntry {
  readonly kind: 'fuel-tank';
  /** Before the Chassis scales it. Show the player `componentEffect`, never this. */
  readonly baseFuelCapacity: Kilograms;
}

/**
 * Multiplies what a Body yields when the Spacecraft lands on it. Stacking: the best Drill sets the
 * multiplier and further Drills add only mass (see `drillMultiplier`). A multiplied Materials yield
 * rounds to the nearest whole Material, a half up; Fuel is still capped at the Tank's capacity.
 */
export interface Drill extends ComponentEntry {
  readonly kind: 'drill';
  readonly yieldMultiplier: number;
}

/**
 * The Jump Drive: carries the Spacecraft out of the Star System, and fires only at the Heliopause.
 * It is heavy, and its `cost` is the price in Star System 1: later Star Systems charge more (see
 * `componentCost`). It burns out on the Jump, so every Star System asks the player to build it again.
 */
export interface JumpDrive extends ComponentEntry {
  readonly kind: 'jump-drive';
}

export type Component = Engine | FuelTank | Drill | JumpDrive;
export type ComponentKind = Component['kind'];

/**
 * The Jump Drive's gameplay tuning, in one place. About two to three Rocky Bodies' yield (10 to 30 Materials
 * each, 20 on average, before any Drill) in Star System 1, and a Run starts with 25. The mass takes
 * about a fifth of the Δv of a full Spacecraft on every Chassis.
 */
export const JUMP_DRIVE_TUNING = {
  mass: kilograms(4_000),
  /** The Materials cost in Star System 1. */
  baseCost: materials(45),
  /** What each later Star System adds to the cost. */
  costPerStarSystem: materials(3),
} as const;

const PROPULSION = 'docs/research/propulsion-trade-offs.md';
const BOROWSKI = 'Borowski et al., NTRS 20120003776 https://ntrs.nasa.gov/citations/20120003776';
const CHASSIS_SCALES = 'Mass and cost are gameplay tuning; the Chassis scales the';

/** The catalogue, keyed by id. */
export const COMPONENTS = {
  'engine-1': {
    id: 'engine-1',
    kind: 'engine',
    level: 1,
    mass: kilograms(1_000),
    cost: materials(30),
    baseIsp: seconds(900),
    explanation: 'Burns Fuel to push you, and your best Engine sets how far it goes.',
    provenance: {
      kind: 'sourced',
      source: `Isp about 900 s, a nuclear thermal engine: ${PROPULSION} §5 and §1.2, ${BOROWSKI}. ${CHASSIS_SCALES} Isp.`,
    },
  },
  'engine-2': {
    id: 'engine-2',
    kind: 'engine',
    level: 2,
    mass: kilograms(1_500),
    cost: materials(60),
    // A quarter better than level 1, past any tested nuclear thermal engine.
    baseIsp: seconds(1_125),
    explanation: 'Goes farther on the same Fuel than level 1, but weighs more.',
    provenance: { kind: 'gameplay-tuning' },
  },
  'fuel-tank-1': {
    id: 'fuel-tank-1',
    kind: 'fuel-tank',
    level: 1,
    mass: kilograms(1_500),
    cost: materials(20),
    baseFuelCapacity: kilograms(6_000),
    explanation: 'Holds more Fuel, but its own mass costs Δv on every Hop, even while it is empty.',
    provenance: {
      kind: 'sourced',
      source: `Tank mass a fifth of tank plus Fuel (propellant fraction 0.80): for hydrogen the tank is about 18% of tank plus fuel, ${PROPULSION} §4 (the Copernicus drop tank, ${BOROWSKI}). Mass rounded for play; cost is gameplay tuning; the Chassis scales the capacity.`,
    },
  },
  'fuel-tank-2': {
    id: 'fuel-tank-2',
    kind: 'fuel-tank',
    level: 2,
    mass: kilograms(2_600),
    cost: materials(45),
    baseFuelCapacity: kilograms(12_000),
    explanation:
      'Holds twice the Fuel of the level-1 Tank in one Slot, and is a little lighter for what it holds.',
    provenance: {
      kind: 'sourced',
      source: `Propellant fraction 0.82, the Copernicus hydrogen drop tank (about 22 t of tank for 102.4 t of hydrogen): ${PROPULSION} §4, ${BOROWSKI}. Cost is gameplay tuning; the Chassis scales the capacity.`,
    },
  },
  'drill-1': {
    id: 'drill-1',
    kind: 'drill',
    level: 1,
    mass: kilograms(800),
    cost: materials(25),
    yieldMultiplier: 1.5,
    explanation: 'Makes every Body yield half as much again, but adds mass.',
    provenance: { kind: 'gameplay-tuning' },
  },
  'drill-2': {
    id: 'drill-2',
    kind: 'drill',
    level: 2,
    mass: kilograms(1_600),
    cost: materials(50),
    yieldMultiplier: 2,
    explanation: 'Makes every Body yield twice as much, but weighs more.',
    provenance: { kind: 'gameplay-tuning' },
  },
  'jump-drive': {
    id: 'jump-drive',
    kind: 'jump-drive',
    level: 1,
    mass: JUMP_DRIVE_TUNING.mass,
    cost: JUMP_DRIVE_TUNING.baseCost,
    explanation: 'Jumps you to the next Star System, but only at the Heliopause.',
    provenance: { kind: 'gameplay-tuning' },
  },
} as const satisfies { readonly [Id in ComponentId]: Component & { readonly id: Id } };

/**
 * What installing a Component costs in Star System number `starSystemNumber` (1 for the first).
 * Only the Jump Drive's price rises with it, by `JUMP_DRIVE_TUNING.costPerStarSystem` each time.
 */
export function componentCost(id: ComponentId, starSystemNumber: number): Materials {
  const component = COMPONENTS[id];
  if (component.kind !== 'jump-drive') return component.cost;
  return materials(
    JUMP_DRIVE_TUNING.baseCost + (starSystemNumber - 1) * JUMP_DRIVE_TUNING.costPerStarSystem,
  );
}
