import type { Scene } from 'phaser';
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

/** Fills `area` (default: the whole screen) with single-pixel stars, the same sky for the same seed. */
export function addStarfield(
  scene: Scene,
  seed: number,
  count: number,
  area = { width: scene.scale.width, height: scene.scale.height },
): void {
  const graphics = scene.add.graphics();
  for (const star of generateStars(seed, count, area)) {
    graphics.fillStyle(paletteNumber(star.color), star.alpha);
    graphics.fillRect(star.x, star.y, star.size, star.size);
  }
}

/** Depth layer of a star, 0 = farthest: dimmer stars are farther away, so they drift slower. */
export function starLayer(star: Star, layerCount: number): number {
  const depth = (star.alpha - 0.5) / 0.5; // 0 (dim) .. 1 (bright)
  return Math.min(layerCount - 1, Math.floor(depth * layerCount));
}
