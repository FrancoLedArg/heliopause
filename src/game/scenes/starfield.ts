import type { GameObjects, Scene, Tweens } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { createRng } from '../lib/rng.ts';

const STAR_COLORS: readonly PaletteColor[] = ['wh0', 'wh1', 'wh1', 'wh2', 'wh3', 'cy3'];

export interface Star {
  x: number;
  y: number;
  /** Side length in pixels. */
  size: number;
  color: PaletteColor;
  alpha: number;
}

/** The stars of `seed`'s sky: the same list for the same seed. */
export function generateStars(
  seed: number,
  count: number,
  area: { width: number; height: number },
): Star[] {
  const rng = createRng(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const color = STAR_COLORS[rng.int(0, STAR_COLORS.length - 1)] ?? 'wh1';
    const size = rng.next() < 0.92 ? 1 : 2;
    const alpha = 0.5 + rng.next() * 0.5;
    stars.push({
      x: rng.int(0, area.width - 1),
      y: rng.int(0, area.height - 1),
      size,
      color,
      alpha,
    });
  }
  return stars;
}

/** Fills `area` (default: the whole screen) with single-pixel stars, the same sky for the same seed. Returns the drawing so a scene can move it. */
export function addStarfield(
  scene: Scene,
  seed: number,
  count: number,
  area = { width: scene.scale.width, height: scene.scale.height },
): GameObjects.Graphics {
  const graphics = scene.add.graphics();
  for (const star of generateStars(seed, count, area)) {
    graphics.fillStyle(paletteNumber(star.color), star.alpha);
    graphics.fillRect(star.x, star.y, star.size, star.size);
  }
  return graphics;
}

/** Every this-many-th single-pixel star twinkles. */
export const TWINKLE_EVERY = 14;

/** Pulses one star's alpha forever; `index` varies the pace and start so the stars do not blink together. */
export function twinkle(scene: Scene, star: GameObjects.Graphics, index: number): Tweens.Tween {
  return scene.tweens.add({
    targets: star,
    alpha: 0.15,
    duration: 1400 + (index % 7) * 300,
    delay: (index % 11) * 400,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });
}

export interface TwinklingStarfield {
  /** Holds the steady stars and every twinkler, so one offset moves the whole field. */
  readonly container: GameObjects.Container;
  /** One drawing per star that may pulse, with its star's index, so a tween can fade it on its own. */
  readonly twinklers: readonly { readonly star: GameObjects.Graphics; readonly index: number }[];
}

/** Like `addStarfield`, but every `every`-th single-pixel star is its own object so it can twinkle. */
export function addTwinklingStarfield(
  scene: Scene,
  seed: number,
  count: number,
  area: { width: number; height: number },
  every: number,
): TwinklingStarfield {
  const steady = scene.add.graphics();
  const container = scene.add.container(0, 0, [steady]);
  const twinklers: { star: GameObjects.Graphics; index: number }[] = [];
  generateStars(seed, count, area).forEach((star, index) => {
    const twinkles = star.size === 1 && index % every === 0;
    const target = twinkles ? scene.add.graphics() : steady;
    if (twinkles) {
      container.add(target);
      twinklers.push({ star: target, index });
    }
    target.fillStyle(paletteNumber(star.color), star.alpha);
    target.fillRect(star.x, star.y, star.size, star.size);
  });
  return { container, twinklers };
}

/** Depth layer of a star, 0 = farthest: dimmer stars are farther away, so they drift slower. */
export function starLayer(star: Star, layerCount: number): number {
  const depth = (star.alpha - 0.5) / 0.5; // 0 (dim) .. 1 (bright)
  return Math.min(layerCount - 1, Math.floor(depth * layerCount));
}
