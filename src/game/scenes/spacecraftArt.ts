import type { GameObjects, Scene } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';
import type { ChassisId } from '../sim/index.ts';
import { FLIGHT_ANGLE, frameGeometry, type ShipFrame } from './chassisArt.ts';

export type { ShipFrame } from './chassisArt.ts';

const STAND_IN_SCALE = 4;
// The `spacecraft` stand-in points right; its tail sits 5px past the centre, so stood upright
// (rotated -90°) its base is 5px below its middle.
const STAND_IN_BASE_OFFSET = 5 * STAND_IN_SCALE;
/** The stand-in in flight: nose up-right, along the same heading as the Chassis art's `flight` frame. */
const STAND_IN_FLIGHT_ANGLE = FLIGHT_ANGLE - 90;
/** The stand-in's shadow on the ground (px wide). */
const STAND_IN_SHADOW_WIDTH = 72;
/** The share of the standing Spacecraft's width its shadow covers: it sits under the fins or legs, not the tips. */
const SHADOW_SHARE = 0.75;

/** How wide the Spacecraft's shadow on the ground is (px). */
export function shadowWidth(chassisId: ChassisId): number {
  if (!hasAsset(`chassis_${chassisId}`)) return STAND_IN_SHADOW_WIDTH;
  return Math.round(frameGeometry(chassisId, 'landed').width * SHADOW_SHARE);
}

export interface SpacecraftArt {
  /** Add these to the ship's container, whose origin is the centre of the Spacecraft's base. */
  readonly objects: readonly GameObjects.GameObject[];
  readonly show: (frame: ShipFrame) => void;
}

/**
 * The whole Spacecraft: its Chassis art (`chassis_<id>`, frames `landed`, `landed_lit`, `flight`;
 * sizes and origins from the generator's data) when the manifest has it, otherwise the 4x
 * `spacecraft` stand-in with a red lamp for its lights.
 * Drawn with the centre of its base at (0, 0).
 */
export function addSpacecraftArt(scene: Scene, chassisId: ChassisId): SpacecraftArt {
  const chassis = `chassis_${chassisId}`;
  if (hasAsset(chassis)) {
    const art = scene.add.image(0, 0, chassis, 'landed');
    const show = (frame: ShipFrame): void => {
      // Every frame's origin is the centre of the Spacecraft's base, so a turn about it swaps frames unseen.
      const { width, height, pivot } = frameGeometry(chassisId, frame);
      art.setFrame(frame).setOrigin(pivot.x / width, pivot.y / height);
    };
    show('landed');
    return { objects: [art], show };
  }
  const art = scene.add
    .image(0, -STAND_IN_BASE_OFFSET, 'spacecraft')
    .setScale(STAND_IN_SCALE)
    .setAngle(-90);
  // The stand-in has no lit frame: a single red pixel-lamp shows on its hull instead.
  const lamp = scene.add.rectangle(0, -60, 4, 4, paletteNumber('rd2')).setVisible(false);
  return {
    objects: [art, lamp],
    show: (frame) => {
      art.setAngle(frame === 'flight' ? STAND_IN_FLIGHT_ANGLE : -90);
      lamp.setVisible(frame === 'landed_lit');
    },
  };
}
