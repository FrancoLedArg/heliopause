import { Math as PhaserMath, Scene } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { EventBus } from '../EventBus.ts';
import { createRng } from '../lib/rng.ts';
import { SceneKey } from './keys.ts';
import { addStarfield } from './starfield.ts';

export interface LandedData {
  /** The Run's seed (see `chooseRunSeed`). */
  readonly seed: number;
}

const GROUND_Y = 300;
const RIDGE_STEP = 32;
const SPECK_COUNT = 90;
const STAR_COUNT = 110;
const SHIP_SCALE = 4;
// The `spacecraft` sprite points right; its tail sits 5px past the centre, so stood upright
// (rotated -90°) its base is 5px below its middle.
const SHIP_BASE_OFFSET = 5 * SHIP_SCALE;

/**
 * Placeholder for the Landed view: the Spacecraft standing on stand-in ground under a sky drawn
 * from the Run's seed. The real Body, its surface and the sky's Bodies arrive with the Star System.
 */
export class Landed extends Scene {
  private seed = 0;

  constructor() {
    super(SceneKey.Landed);
  }

  init(data: LandedData): void {
    this.seed = data.seed;
  }

  create(): void {
    const { width, height } = this.scale;
    addStarfield(this, this.seed, STAR_COUNT, { width, height: GROUND_Y });
    this.drawGround(width, height);
    this.add
      .image(width / 2, GROUND_Y - SHIP_BASE_OFFSET, 'spacecraft')
      .setScale(SHIP_SCALE)
      .setAngle(-90);

    EventBus.emit('scene-ready', SceneKey.Landed);
  }

  /** Stand-in surface painted from the palette: a far ridge, then ground with specks. */
  private drawGround(width: number, height: number): void {
    const rng = createRng(this.seed ^ 0x9e3779b9);
    const graphics = this.add.graphics();

    const ridge = [new PhaserMath.Vector2(0, GROUND_Y)];
    for (let x = 0; x <= width; x += RIDGE_STEP) {
      ridge.push(new PhaserMath.Vector2(x, GROUND_Y - rng.int(6, 22)));
    }
    ridge.push(new PhaserMath.Vector2(width, GROUND_Y));
    graphics.fillStyle(paletteNumber('gm1'));
    graphics.fillPoints(ridge, true);

    graphics.fillStyle(paletteNumber('gm2'));
    graphics.fillRect(0, GROUND_Y, width, height - GROUND_Y);
    graphics.fillStyle(paletteNumber('gm3'));
    graphics.fillRect(0, GROUND_Y, width, 1);
    for (let i = 0; i < SPECK_COUNT; i++) {
      graphics.fillStyle(paletteNumber(rng.next() < 0.5 ? 'gm3' : 'gm1'));
      graphics.fillRect(rng.int(0, width - 2), rng.int(GROUND_Y + 3, height - 2), rng.int(1, 2), 1);
    }
  }
}
