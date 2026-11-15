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

/** One frame of a Chassis' atlas: its size, and where the centre of the base sits inside it. */
export interface FrameGeometry {
  readonly width: number;
  readonly height: number;
  readonly pivot: Point;
}

/**
 * The Chassis art's data, written by the sprite generator (`docs/design/sprites/gen_sprites.py`)
 * beside the atlases: nothing here is typed in by hand, so a new ship only needs a regeneration.
 */
const CHASSIS = art.chassis;

/** How far the flight pose is turned clockwise from upright: the Transfer's heading, up and to the right (°). */
export const FLIGHT_ANGLE: number = art.flightAngle;

/** The size of a frame, and where its origin (the centre of the Spacecraft's base) sits in it. */
export function frameGeometry(chassisId: ChassisId, frame: ShipFrame): FrameGeometry {
  const { w, h, pivot } = CHASSIS[chassisId].frames[frame];
  return { width: w, height: h, pivot };
}

/** A nozzle of the main engine, or of a side propulsor (nacelle or booster). */
export type NozzleKind = 'main' | 'side';

/** One nozzle the Spacecraft fires from: what kind it is, and where its exit sits from the centre of the base. */
export interface Nozzle {
  readonly kind: NozzleKind;
  readonly exit: Point;
}

/** Every nozzle of a pose, side propulsors first, then the main engine: Takeoff, Landing and the Transfer fire them all. */
export function nozzles(chassisId: ChassisId, pose: ShipPose): readonly Nozzle[] {
  const { side, main } = CHASSIS[chassisId].nozzles[pose];
  const of =
    (kind: NozzleKind) =>
    (exit: Point): Nozzle => ({ kind, exit });
  return [...side.map(of('side')), ...main.map(of('main'))];
}

/** Every nozzle exit (side propulsors, then the main engine) in a pose. */
export function nozzleExits(chassisId: ChassisId, pose: ShipPose): readonly Point[] {
  return nozzles(chassisId, pose).map((nozzle) => nozzle.exit);
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
