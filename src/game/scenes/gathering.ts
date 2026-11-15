// The gathering moment (#220, spec #217) as data: what the Landed scene shows flowing from the ground
// into the Spacecraft and on into the top bar. No Phaser here; the renderer is `gatheringMoment.ts`.
// It reads only the landing's collection and the Run after it, so it never recomputes a rule.
import {
  drillMultiplier,
  kilograms,
  materials,
  type Collection,
  type Kilograms,
  type Materials,
  type Run,
} from '../sim/index.ts';

/** Which top-bar readout the moment fills: Fuel from an Icy Body, Materials from a Rocky one. */
export type GatheredResource = Exclude<Collection['kind'], 'depleted'>;

/**
 * One gathering moment. Also the hook other Run starts use (#189's Starting Moon): build one with
 * `describeGathering` and pass it as `LandedData.gathering`, and the Landed view plays it.
 */
export type Gathering =
  | {
      readonly resource: 'fuel';
      /** The Fuel readout before the resource arrives (what the Hop left). */
      readonly from: Kilograms;
      /** The Fuel readout once it has all arrived: the Run's own value. */
      readonly to: Kilograms;
      /** Fuel the full Tank could not hold: it spills back onto the ground. */
      readonly leftBehind: Kilograms;
      /** A Drill multiplied the yield: it pulses during the flow. */
      readonly drill: boolean;
    }
  | {
      readonly resource: 'materials';
      readonly from: Materials;
      readonly to: Materials;
      readonly drill: boolean;
    };

/** What a top-bar readout shows partway through the moment, in its own unit. */
export type GatheringReadout =
  | { readonly resource: 'fuel'; readonly value: Kilograms }
  | { readonly resource: 'materials'; readonly value: Materials };

/** The readout `share` (0 to 1) of the way from `from` to `to`; Materials are whole units, so they step. */
export function readoutAt(gathering: Gathering, share: number): GatheringReadout {
  const t = Math.min(Math.max(share, 0), 1);
  if (gathering.resource === 'fuel') {
    return {
      resource: 'fuel',
      value: kilograms(gathering.from + (gathering.to - gathering.from) * t),
    };
  }
  return {
    resource: 'materials',
    value: materials(Math.round(gathering.from + (gathering.to - gathering.from) * t)),
  };
}

/**
 * The moment for a landing that collected `collection`, leaving the Run `after`; `undefined` when
 * nothing flows (a Depleted Body, or no landing at all).
 */
export function describeGathering(
  after: Run,
  collection: Collection | null,
): Gathering | undefined {
  if (collection === null || collection.kind === 'depleted') return undefined;
  const drill = drillMultiplier(after.spacecraft) > 1;
  if (collection.kind === 'materials') {
    return {
      resource: 'materials',
      from: materials(after.materials - collection.collected),
      to: after.materials,
      drill,
    };
  }
  if (collection.collected <= 0 && collection.leftBehind <= 0) return undefined;
  return {
    resource: 'fuel',
    from: kilograms(after.spacecraft.fuelMass - collection.collected),
    to: after.spacecraft.fuelMass,
    leftBehind: collection.leftBehind,
    drill,
  };
}

/** The moment's beats (ms from its start; presentation tuning). About 1.5 s in all, as the human approved. */
export const GATHERING_TIMING = {
  /** The resource rises out of the ground into the Spacecraft. */
  rise: { start: 0, end: 950 },
  /** A short stream of icons flies to the top bar, which counts up as they land. */
  fly: { start: 700, end: 1400 },
  /** A full Tank's leftover spills back down. */
  spill: { start: 700 },
  /** The Drill pulses this often while the resource rises. */
  drillEvery: 280,
  /** Everything has settled; the Hop report may open. */
  end: 1500,
} as const;

/**
 * The centre of each top-bar readout's icon in the 640×360 stage: where the flying icons land. The top
 * bar sits at (8, 6) with its 32 px icons at x 210 and 406, 4 px down (`style.css`, `.top-bar__*-icon`).
 */
export const READOUT_ICON: Record<GatheredResource, { readonly x: number; readonly y: number }> = {
  fuel: { x: 8 + 210 + 16, y: 6 + 4 + 16 },
  materials: { x: 8 + 406 + 16, y: 6 + 4 + 16 },
};
