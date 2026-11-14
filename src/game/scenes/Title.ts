import { Scene } from 'phaser';
import { EventBus } from '../EventBus.ts';
import { createRng } from '../lib/rng.ts';
import { SceneKey } from './keys.ts';

const STAR_COUNT = 160;
const STARFIELD_SEED = 1977; // Voyager launch year: same sky on every load.

export class Title extends Scene {
  constructor() {
    super(SceneKey.Title);
  }

  create(): void {
    const { width, height } = this.scale;
    const rng = createRng(STARFIELD_SEED);

    // Stand-in art: primitives only until human-made assets land (see docs/agents/assets.md).
    for (let i = 0; i < STAR_COUNT; i++) {
      const radius = rng.next() < 0.9 ? 1 : 2;
      this.add.circle(
        rng.next() * width,
        rng.next() * height,
        radius,
        0xffffff,
        0.4 + rng.next() * 0.6,
      );
    }

    this.add
      .text(width / 2, height / 2 - 30, 'HELIOPAUSE', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 72,
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 40, 'Space Mission Design Game', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 24,
        color: '#9fb4ff',
      })
      .setOrigin(0.5);

    EventBus.emit('scene-ready', SceneKey.Title);
  }
}
