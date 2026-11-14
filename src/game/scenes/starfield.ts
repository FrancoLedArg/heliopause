import type { GameObjects, Scene } from 'phaser';
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

export interface TwinklingStarfield {
  /** Every star that stays steady, in one drawing. */
  readonly stars: GameObjects.Graphics;
  /** One drawing per star that may pulse, so a tween can fade it on its own. */
  readonly twinklers: GameObjects.Graphics[];
}

/** Like `addStarfield`, but every `every`-th single-pixel star is its own object so it can twinkle. */
export function addTwinklingStarfield(
  scene: Scene,
  seed: number,
  count: number,
  area: { width: number; height: number },
  every: number,
): TwinklingStarfield {
  const stars = scene.add.graphics();
  const twinklers: GameObjects.Graphics[] = [];
  generateStars(seed, count, area).forEach((star, index) => {
    const twinkles = star.size === 1 && index % every === 0;
    const target = twinkles ? scene.add.graphics() : stars;
    if (twinkles) twinklers.push(target);
    target.fillStyle(paletteNumber(star.color), star.alpha);
    target.fillRect(star.x, star.y, star.size, star.size);
  });
  return { stars, twinklers };
}

/** Depth layer of a star, 0 = farthest: dimmer stars are farther away, so they drift slower. */
export function starLayer(star: Star, layerCount: number): number {
  const depth = (star.alpha - 0.5) / 0.5; // 0 (dim) .. 1 (bright)
  return Math.min(layerCount - 1, Math.floor(depth * layerCount));
}
