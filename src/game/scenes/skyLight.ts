// The Landed view's light through the local day (#192): a pale glow in the sky by day, and a dark
// shade over the whole landscape by night, painted from `skyLighting`'s numbers.
import type { GameObjects, Scene } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { EventBus } from '../EventBus.ts';
import { skyLighting } from './skyLighting.ts';
import { GROUND_TOP, SKY_WIDTH } from './landedView.ts';

export interface SkyLight {
  /** Moves the light to this fraction of the local day. */
  readonly set: (fraction: number) => void;
  /** The shade over the landscape and the glow in the sky: tests read their alpha. */
  readonly shade: GameObjects.Rectangle;
  readonly glow: GameObjects.Rectangle;
}

/**
 * Adds the light to the scene: the glow at the back of the sky layer, the shade above the ground
 * (so the sky and ground both dim) and below the Spacecraft, whose own lights stay lit.
 */
export function addSkyLight(
  scene: Scene,
  sky: GameObjects.Container,
  ground: GameObjects.Container,
): SkyLight {
  const glow = scene.add.rectangle(0, 0, SKY_WIDTH, GROUND_TOP, paletteNumber('cy1'));
  glow.setOrigin(0, 0);
  sky.addAt(glow, 0);
  const shade = scene.add.rectangle(
    0,
    0,
    scene.scale.width,
    scene.scale.height,
    paletteNumber('void'),
  );
  shade.setOrigin(0, 0);
  scene.children.moveTo(shade, scene.children.getIndex(ground) + 1);
  const set = (fraction: number): void => {
    const light = skyLighting(fraction);
    glow.setAlpha(light.glowAlpha);
    shade.setAlpha(light.shadeAlpha);
  };
  return { set, shade, glow };
}

/** The Landed scene's way to tell React the local time moved: only when it moved enough to turn the dial (1/96 of a day). */
export function localTimeAnnouncer(): (fraction: number) => void {
  let last: number | undefined;
  return (fraction) => {
    if (last !== undefined && Math.abs(fraction - last) < 1 / 96) return;
    last = fraction;
    EventBus.emit('local-time-changed', fraction);
  };
}
