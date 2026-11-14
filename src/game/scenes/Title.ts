import { Scene, Scenes } from 'phaser';
import { startRun } from '../sim/index.ts';
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
      const data: LandedData = { run: startRun(seed) };
      this.scene.start(SceneKey.Landed, data);
    });
    // A destroyed game (React StrictMode remounts, tests) never shuts its scenes down, so unsubscribe on
    // both; whichever fires first removes the other listener.
    const unsubscribe = (): void => {
      offNewRun();
      this.events.off(Scenes.Events.SHUTDOWN, unsubscribe);
      this.events.off(Scenes.Events.DESTROY, unsubscribe);
    };
    this.events.once(Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Scenes.Events.DESTROY, unsubscribe);

    EventBus.emit('scene-ready', SceneKey.Title);
  }
}
