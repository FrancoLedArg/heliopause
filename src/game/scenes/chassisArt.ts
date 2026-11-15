import art from '../assets/chassisArt.json' with { type: 'json' };
import type { ChassisId } from '../sim/index.ts';

/** How the Spacecraft is drawn: standing on its legs (lights off or on), or flying nose up-right. */
export type ShipFrame = 'landed' | 'landed_lit' | 'flight';

/** The two poses the plumes care about: standing on the ground, or turned to the Transfer heading. */
export type ShipPose = 'standing' | 'flight';

/** A point in pixels from the centre of the Spacecraft's base: x to the right, y down (the sky is negative). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** One frame of the drawn Spacecraft: its size, and where the centre of the base sits inside it. */
export interface FrameGeometry {
  readonly width: number;
  readonly height: number;
  readonly pivot: Point;
}

/** A nozzle of an Engine, or of a side propulsor (nacelle or booster) of the Chassis art. */
export type NozzleKind = 'main' | 'side';

/** One nozzle the Spacecraft fires from: what kind it is, and where its exit sits from the centre of the base. */
export interface Nozzle {
  readonly kind: NozzleKind;
  readonly exit: Point;
}

/** One piece of art in one pose, as the generator wrote it: its box and points from the centre of the base. */
export interface PoseArt {
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly nozzles: readonly Point[];
  readonly lamps: readonly Point[];
  readonly anchors: { readonly vent?: Point };
}

/** One piece of art (the Chassis art, or one layer of a Component art at one mount point) in both poses. */
export type PieceArt = Readonly<Record<ShipPose, PoseArt>>;

/** Everything the generator drew for one Chassis. */
export interface ChassisArtData {
  readonly frames: Readonly<
    Record<ShipFrame, { readonly w: number; readonly h: number; readonly pivot: Point }>
  >;
  readonly chassis: PieceArt;
  /** Per Component id, per mount point, its art's layers. */
  readonly components: Readonly<
    Partial<Record<string, readonly Readonly<Partial<Record<'back' | 'front', PieceArt>>>[]>>
  >;
}

/**
 * The Spacecraft art's data, written by the sprite generator (`docs/design/sprites/gen_ships.py`)
 * beside the atlases: nothing here is typed in by hand, so new art only needs a regeneration.
 */
const DATA: {
  readonly flightAngle: number;
  readonly chassis: Readonly<Record<ChassisId, ChassisArtData>>;
} = art;

/** How far the flight pose is turned clockwise from upright: the Transfer's heading, up and to the right (°). */
export const FLIGHT_ANGLE: number = DATA.flightAngle;

/** Everything the generator drew for the Chassis: read by the composition (`spacecraftComposition.ts`). */
export function chassisArtData(chassisId: ChassisId): ChassisArtData {
  return DATA.chassis[chassisId];
}

/** The pose a frame is drawn in. */
export function poseOf(frame: ShipFrame): ShipPose {
  return frame === 'flight' ? 'flight' : 'standing';
}

/**
 * The size of a frame of the drawn Spacecraft, and where its origin (the centre of the base) sits
 * in it: the box every piece of this Chassis's art fits in, whatever is installed.
 */
export function frameGeometry(chassisId: ChassisId, frame: ShipFrame): FrameGeometry {
  const { w, h, pivot } = DATA.chassis[chassisId].frames[frame];
  return { width: w, height: h, pivot };
}

/** A point turned clockwise on the screen about the origin (`degrees`), as Phaser's `angle` turns an object. */
export function turn(point: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

/** The standing Spacecraft's box, from the centre of its base: the widest and tallest of the Chassis' standing frames. */
export function standingExtent(chassisIds: readonly ChassisId[]): {
  readonly halfWidth: number;
  readonly height: number;
} {
  let halfWidth = 0;
  let height = 0;
  for (const id of chassisIds) {
    for (const frame of ['landed', 'landed_lit'] as const) {
      const { width, pivot } = frameGeometry(id, frame);
      halfWidth = Math.max(halfWidth, pivot.x, width - pivot.x);
      height = Math.max(height, pivot.y);
    }
  }
  return { halfWidth, height };
}
