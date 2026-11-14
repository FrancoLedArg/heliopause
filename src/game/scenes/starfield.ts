import type { GameObjects, Scene } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { createRng } from '../lib/rng.ts';

const STAR_COLORS: readonly PaletteColor[] = ['wh0', 'wh1', 'wh1', 'wh2', 'wh3', 'cy3'];

/** Fills `area` (default: the whole screen) with single-pixel stars, the same sky for the same seed. Returns the drawing so a scene can move it. */
export function addStarfield(
  scene: Scene,
  seed: number,
  count: number,
  area = { width: scene.scale.width, height: scene.scale.height },
): GameObjects.Graphics {
  const rng = createRng(seed);
  const graphics = scene.add.graphics();
  for (let i = 0; i < count; i++) {
    const color = STAR_COLORS[rng.int(0, STAR_COLORS.length - 1)] ?? 'wh1';
    const size = rng.next() < 0.92 ? 1 : 2;
    graphics.fillStyle(paletteNumber(color), 0.5 + rng.next() * 0.5);
    graphics.fillRect(rng.int(0, area.width - 1), rng.int(0, area.height - 1), size, size);
  }
  return graphics;
}
