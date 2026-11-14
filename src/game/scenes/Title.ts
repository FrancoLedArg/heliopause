import { Scene, Scenes } from 'phaser';
import { EventBus } from '../EventBus.ts';
import { formatBuildLabel } from '../lib/buildLabel.ts';
import { createRng } from '../lib/rng.ts';
import { SceneKey } from './keys.ts';

const STAR_COUNT = 160;
const STARFIELD_SEED = 1977; // Voyager launch year: same sky on every load.
const BUILD_LABEL_MARGIN = 12;
// Muted blue-grey; contrast against the #05060f title background is 5.66:1 (WCAG AA needs 4.5:1).
const BUILD_LABEL_COLOR = '#7d86ad';

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

    const buildLabel = formatBuildLabel(BUILD_INFO);
    this.add
      .text(width - BUILD_LABEL_MARGIN, height - BUILD_LABEL_MARGIN, buildLabel, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        color: BUILD_LABEL_COLOR,
      })
      .setOrigin(1, 1);
    // Canvas text is invisible to the DOM; mirror it onto the canvas so e2e tests can read it.
    const canvas = this.game.canvas;
    canvas.dataset['buildLabel'] = buildLabel;
    this.events.once(Scenes.Events.SHUTDOWN, () => {
      delete canvas.dataset['buildLabel'];
    });

    EventBus.emit('scene-ready', SceneKey.Title);
  }
}
