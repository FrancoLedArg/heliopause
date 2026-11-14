import { Scene, Scenes } from 'phaser';
import { EventBus } from '../EventBus.ts';
import { SceneKey } from './keys.ts';
import type { LandedData } from './Landed.ts';
import { createTitleBackdrop } from './titleBackdrop.ts';

/** The title backdrop. Its menu (logo, New Run, build label) is React's, drawn over the canvas. */
export class Title extends Scene {
  constructor() {
    super(SceneKey.Title);
  }

  /** Whether the backdrop was drawn held still; read once at create from `prefers-reduced-motion`. */
  reducedMotion = false;

  create(): void {
    const backdrop = createTitleBackdrop(this);
    this.reducedMotion = backdrop.reducedMotion;
    // Every tween and timer of the backdrop stops with the scene (a destroyed game never shuts its scenes down).
    this.events.once(Scenes.Events.SHUTDOWN, backdrop.dispose);
    this.events.once(Scenes.Events.DESTROY, backdrop.dispose);

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
