// The Cruise (#210): the coast after the Transfer, on a deterministic clock of whole ticks. Its
// Cruise events come from a stream of the seed of their own, so every Burn of every seed is as it
// was; the player's Repairs and Rushes are the only other input.
import { createRng, type Rng } from '../lib/rng.ts';
import { stringSeed } from '../lib/stringSeed.ts';
import { COMPONENTS, type ComponentKind } from './catalogue.ts';
import { CRUISE_TUNING, type CruiseEventKind } from './data.ts';
import { withDamage, type Damage, type SlotDamage, type Spacecraft } from './spacecraft.ts';
import type { Seed } from './starSystem.ts';
import { kilograms, materials, type Kilograms, type Materials } from './units.ts';

/**
 * One Cruise event as scheduled at launch: its kind, the Cruise tick it strikes on, and the Slot it
 * hits, `null` for a miss (a Debris field that misses, or an event with nothing it can hit: it still
 * plays, harmlessly).
 */
export interface ScheduledEvent {
  readonly kind: CruiseEventKind;
  readonly tick: number;
  readonly slot: number | null;
}

/**
 * A Cruise event that has struck: the Slot it Damaged (`null` when it did no harm), and the tick that
 * Damage was cleared in this Cruise, `null` while it lasts.
 */
export interface StruckEvent extends ScheduledEvent {
  readonly endedAt: number | null;
}

/** Where a Cruise stands. */
export interface Cruise {
  /** The Cruise tick reached, from 0 up to `CRUISE_TUNING.ticks`. */
  readonly tick: number;
  /** A mild Cruise (the first Hops of a Run): a leak in it is slow. */
  readonly mild: boolean;
  readonly schedule: readonly ScheduledEvent[];
  /** The events struck so far, in order. */
  readonly struck: readonly StruckEvent[];
  /** The Fuel leaks have lost so far. */
  readonly fuelLost: Kilograms;
  /**
   * The Fuel a leak never drains below: on a mild Hop, what the Landing needs at its worst for the
   * Hop to end no worse than one flown at its estimates, so mild events never threaten #188's
   * opening; 0 on any other Hop.
   */
  readonly fuelFloor: Kilograms;
}

/** Whether a Hop of a Run, counted from 1, is one of its mild first Hops. */
export function isMildHop(hop: number): boolean {
  return hop <= CRUISE_TUNING.mildHops;
}

/**
 * The Cruise events of a Run's Hop, counted from 1 across the Run, drawn from a stream of the seed of
 * their own. Every Cruise has one or two events (the human amendment on #210): on the mild first Hops
 * only a slow Fuel leak or a small Debris field that never hits an Engine; later, harsher ones (an
 * Engine fire, a solar flare), more often in later Star Systems and on later Hops. Targets are chosen
 * from what is installed and sound at launch, never the Jump Drive. Only `kinds` are drawn: none at
 * all when it is empty, as it is for real Runs until #250 (`CRUISE_TUNING.enabledKinds`).
 */
export function cruiseSchedule(
  seed: Seed,
  hop: number,
  starSystemNumber: number,
  spacecraft: Spacecraft,
  kinds: readonly CruiseEventKind[],
): readonly ScheduledEvent[] {
  const mild = isMildHop(hop);
  const allowed = mild ? kinds.filter((kind) => CRUISE_TUNING.mildKinds.includes(kind)) : kinds;
  if (allowed.length === 0) return [];
  const rng = createRng(seed ^ stringSeed(`cruise:${String(hop)}`));
  const { secondEvent: second, harshChance: harsh, startTicks } = CRUISE_TUNING;
  const later = starSystemNumber - 1;
  const secondChance = mild
    ? second.mild
    : Math.min(second.max, second.base + second.perStarSystem * later);
  const count = rng.next() < secondChance ? 2 : 1;
  const harshness = Math.min(
    harsh.max,
    harsh.base + harsh.perStarSystem * later + harsh.perHop * (hop - CRUISE_TUNING.mildHops),
  );

  const drawn = Array.from({ length: count }, () => drawKind(rng, allowed, mild ? 0 : harshness));
  const ticks = drawn.map((kind) => rng.int(startTicks.min, latestStart(kind)));
  // Two events stay at least `apart` ticks apart: redraw the second until they are (always possible).
  while (ticks.length === 2 && Math.abs((ticks[0] ?? 0) - (ticks[1] ?? 0)) < startTicks.apart) {
    ticks[1] = rng.int(startTicks.min, latestStart(drawn[1] ?? 'fuel-leak'));
  }
  return drawn
    .map((kind, i) => ({
      kind,
      tick: ticks[i] ?? startTicks.min,
      slot: drawTarget(rng, kind, spacecraft, mild),
    }))
    .sort((a, b) => a.tick - b.tick);
}

function latestStart(kind: CruiseEventKind): number {
  const { startTicks } = CRUISE_TUNING;
  return kind === 'engine-fire' ? startTicks.engineFireMax : startTicks.max;
}

const HARSH_KINDS: readonly CruiseEventKind[] = ['engine-fire', 'solar-flare'];

/** A kind among `allowed`: harsh with chance `harshness`, falling back to the other class when it has none. */
function drawKind(
  rng: Rng,
  allowed: readonly CruiseEventKind[],
  harshness: number,
): CruiseEventKind {
  const harshAllowed = allowed.filter((kind) => HARSH_KINDS.includes(kind));
  const mildAllowed = allowed.filter((kind) => !HARSH_KINDS.includes(kind));
  const wantsHarsh = rng.next() < harshness;
  const pick = rng.next();
  if ((wantsHarsh && harshAllowed.length > 0) || mildAllowed.length === 0) {
    const fire = harshAllowed.includes('engine-fire');
    const flare = harshAllowed.includes('solar-flare');
    if (fire && flare) {
      return pick < CRUISE_TUNING.engineFireShareOfHarsh ? 'engine-fire' : 'solar-flare';
    }
    return fire ? 'engine-fire' : 'solar-flare';
  }
  return mildAllowed[Math.floor(pick * mildAllowed.length)] ?? 'fuel-leak';
}

/** The Component kinds each event can hit. A solar flare hits electronics: none exist before #96's Radar. */
const TARGETS: Readonly<Record<CruiseEventKind, readonly ComponentKind[]>> = {
  'fuel-leak': ['fuel-tank'],
  'engine-fire': ['engine'],
  'debris-field': ['engine', 'fuel-tank', 'drill'],
  'solar-flare': [],
};

function drawTarget(
  rng: Rng,
  kind: CruiseEventKind,
  spacecraft: Spacecraft,
  mild: boolean,
): number | null {
  if (kind === 'debris-field' && rng.next() >= CRUISE_TUNING.debrisHitChance) return null;
  // A mild Debris field only ever hits a Fuel Tank, whose leak stops at the Cruise's floor: a
  // Damaged Engine would cost Δv on the Landing, and a Damaged Drill yield on arrival.
  const hits = mild && kind === 'debris-field' ? ['fuel-tank'] : TARGETS[kind];
  const candidates = spacecraft.slots.flatMap((slot, i) =>
    slot !== null && !spacecraft.damage[i] && hits.includes(COMPONENTS[slot].kind) ? [i] : [],
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng.next() * candidates.length)] ?? null;
}

/** A Cruise about to start, with its schedule, and on a mild Hop the floor its leaks stop at. */
export function startCruise(
  schedule: readonly ScheduledEvent[],
  mild: boolean,
  fuelFloor: Kilograms,
): Cruise {
  const latestFire = CRUISE_TUNING.ticks - CRUISE_TUNING.fireTicks;
  for (const event of schedule) {
    const late = event.kind === 'engine-fire' ? latestFire : CRUISE_TUNING.ticks - 1;
    if (!Number.isInteger(event.tick) || event.tick < 1 || event.tick > late) {
      throw new RangeError(`A ${event.kind} cannot strike on Cruise tick ${String(event.tick)}`);
    }
  }
  return {
    tick: 0,
    mild,
    schedule: [...schedule].sort((a, b) => a.tick - b.tick),
    struck: [],
    fuelLost: kilograms(0),
    fuelFloor,
  };
}

/** The Repair time of a Component kind, in Cruise ticks. */
export function repairTicks(kind: ComponentKind): number {
  switch (kind) {
    case 'engine':
    case 'fuel-tank':
    case 'drill':
    case 'radar':
      return CRUISE_TUNING.repairTicks[kind];
    case 'jump-drive':
      throw new Error('The Jump Drive is never Damaged');
  }
}

/** The Repair ticks left on a Damaged Slot, or `null` when the Slot is sound or empty. */
export function repairTicksLeft(spacecraft: Spacecraft, slot: number): number | null {
  const id = spacecraft.slots[slot];
  const damage = spacecraft.damage[slot];
  if (id === null || id === undefined || !damage) return null;
  return repairTicks(COMPONENTS[id].kind) - (damage.repair ?? 0);
}

/**
 * What a Rush of a Damaged Slot costs: 1 Material per started 5 s of Repair time left (#210), or
 * `null` when there is nothing to Rush. It falls as the Repair runs.
 */
export function rushCost(spacecraft: Spacecraft, slot: number): Materials | null {
  const left = repairTicksLeft(spacecraft, slot);
  if (left === null) return null;
  return materials(Math.ceil(left / CRUISE_TUNING.rushTicksPerMaterial));
}

/** What stepping a Cruise did: it ran to the tick, or an Engine fire Destroyed the Spacecraft on one. */
export type CruiseSteps =
  | { readonly kind: 'cruising'; readonly cruise: Cruise; readonly spacecraft: Spacecraft }
  | {
      readonly kind: 'destroyed';
      readonly cruise: Cruise;
      readonly spacecraft: Spacecraft;
    };

/**
 * Steps the Cruise tick by tick up to `toTick`. On each tick, in this order: burning Engines burn on
 * (one that has burned `fireTicks` ticks after the one it caught fire on, with no Repair started,
 * explodes), scheduled events strike, leaking Fuel Tanks drain (never below `fuelFloor`), and running
 * Repairs advance (one that is done clears its Damage). The fixed order and whole ticks make a
 * replay match to the last kilogram.
 */
export function stepCruise(cruise: Cruise, spacecraft: Spacecraft, toTick: number): CruiseSteps {
  const damage: SlotDamage[] = [...spacecraft.damage];
  const struck: StruckEvent[] = [...cruise.struck];
  let fuel: number = spacecraft.fuelMass;
  let lost: number = cruise.fuelLost;
  const leakShare = cruise.mild
    ? CRUISE_TUNING.leakPerSecond.mild
    : CRUISE_TUNING.leakPerSecond.harsh;
  const leakPerTick = (leakShare * spacecraft.fuelCapacity * CRUISE_TUNING.tickMs) / 1_000;
  const kindAt = (slot: number) => {
    const id = spacecraft.slots[slot];
    return id === null || id === undefined ? undefined : COMPONENTS[id].kind;
  };
  const settle = (tick: number): Omit<Extract<CruiseSteps, { kind: 'cruising' }>, 'kind'> => ({
    cruise: { ...cruise, tick, struck, fuelLost: kilograms(lost) },
    spacecraft: { ...withDamage(spacecraft, damage), fuelMass: kilograms(fuel) },
  });

  // A Cruise with nothing Damaged and no event left to strike changes nothing tick by tick: every Hop
  // of a real Run until events are on, and every Hop the generator flies to check an opening.
  const quiet =
    damage.every((slotDamage) => slotDamage === null) &&
    !cruise.schedule.some((event) => event.tick > cruise.tick && event.tick <= toTick);
  if (quiet) return { kind: 'cruising', ...settle(Math.max(cruise.tick, toTick)) };

  for (let tick = cruise.tick + 1; tick <= toTick; tick++) {
    for (const [slot, slotDamage] of damage.entries()) {
      if (!slotDamage) continue;
      if (slotDamage.burning === null) continue;
      const burning = slotDamage.burning + 1;
      damage[slot] = { ...slotDamage, burning };
      if (burning >= CRUISE_TUNING.fireTicks) return { kind: 'destroyed', ...settle(tick) };
    }
    for (const event of cruise.schedule) {
      if (event.tick !== tick) continue;
      // An event never hits a Component that is already Damaged: the later of two on one part misses.
      const hits = event.slot !== null && kindAt(event.slot) !== undefined && !damage[event.slot];
      if (hits) damage[event.slot] = struckDamage(event.kind);
      struck.push({ ...event, slot: hits ? event.slot : null, endedAt: null });
    }
    damage.forEach((slotDamage, slot) => {
      if (!slotDamage || kindAt(slot) !== 'fuel-tank') return;
      const loss = Math.min(Math.max(0, fuel - cruise.fuelFloor), leakPerTick);
      fuel -= loss;
      lost += loss;
    });
    damage.forEach((slotDamage, slot) => {
      const kind = kindAt(slot);
      if (!kind || !slotDamage) return;
      if (slotDamage.repair === null) return;
      const repair = slotDamage.repair + 1;
      if (repair < repairTicks(kind)) {
        damage[slot] = { ...slotDamage, repair };
        return;
      }
      damage[slot] = null;
      endStruck(struck, slot, tick);
    });
  }
  return { kind: 'cruising', ...settle(Math.max(cruise.tick, toTick)) };
}

function struckDamage(kind: CruiseEventKind): Damage {
  return { repair: null, burning: kind === 'engine-fire' ? 0 : null };
}

/** Marks the events whose Damage on `slot` was just cleared. */
export function endStruck(struck: StruckEvent[], slot: number, tick: number): void {
  struck.forEach((event, i) => {
    if (event.slot === slot && event.endedAt === null) struck[i] = { ...event, endedAt: tick };
  });
}
