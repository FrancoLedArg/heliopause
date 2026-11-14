import type { GameObjects, Scene } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';
import type { ChassisId } from '../sim/index.ts';

/** How the Spacecraft is drawn: standing on its legs (lights off or on), or flying nose up-right. */
export type ShipFrame = 'landed' | 'landed_lit' | 'flight';

const STAND_IN_SCALE = 4;
// The `spacecraft` stand-in points right; its tail sits 5px past the centre, so stood upright
// (rotated -90°) its base is 5px below its middle.
const STAND_IN_BASE_OFFSET = 5 * STAND_IN_SCALE;
/** The stand-in in flight: nose up-right, pitched like the Chassis art's `flight` frame. */
const STAND_IN_FLIGHT_ANGLE = -30;

export interface SpacecraftArt {
  /** Add these to the ship's container, whose origin is the centre of the Spacecraft's base. */
  readonly objects: readonly GameObjects.GameObject[];
  readonly show: (frame: ShipFrame) => void;
}

/**
 * The whole Spacecraft: its Chassis art (`chassis_<id>`, frames `landed`, `landed_lit`, `flight`)
 * when the manifest has it, otherwise the 4x `spacecraft` stand-in with a red lamp for its lights.
 * Drawn with the centre of its base at (0, 0).
 */
export function addSpacecraftArt(scene: Scene, chassisId: ChassisId): SpacecraftArt {
  const chassis = `chassis_${chassisId}`;
  if (hasAsset(chassis)) {
    const art = scene.add.image(0, 0, chassis, 'landed').setOrigin(0.5, 1);
    return {
      objects: [art],
      show: (frame) => {
        art.setFrame(frame);
      },
    };
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
