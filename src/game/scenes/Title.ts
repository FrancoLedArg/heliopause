import { Scene, Scenes } from 'phaser';
import { EventBus } from '../EventBus.ts';
import { SceneKey } from './keys.ts';
import type { LandedData } from './Landed.ts';
import { addStarfield } from './starfield.ts';

const STAR_COUNT = 140;
const STARFIELD_SEED = 1977; // Voyager launch year: same sky on every load.

/** The title backdrop. Its menu (logo, New Run, build label) is React's, drawn over the canvas. */
export class Title extends Scene {
  constructor() {
    super(SceneKey.Title);
  }

  create(): void {
    addStarfield(this, STARFIELD_SEED, STAR_COUNT);
    this.add.image(84, 64, 'body_star');
    this.add.image(560, 372, 'body_gas_1').setScale(5);
    this.add.image(438, 262, 'body_moon_2').setScale(2);

    const offNewRun = EventBus.on('new-run-requested', (seed) => {
      const data: LandedData = { seed };
      this.scene.start(SceneKey.Landed, data);
    });
    // A destroyed game (React StrictMode remounts, tests) never shuts its scenes down, so unsubscribe on both.
    this.events.once(Scenes.Events.SHUTDOWN, offNewRun);
    this.events.once(Scenes.Events.DESTROY, offNewRun);

    EventBus.emit('scene-ready', SceneKey.Title);
  }
}
