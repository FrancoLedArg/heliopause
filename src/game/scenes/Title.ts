import { Scene, Scenes } from 'phaser';
import { startRun } from '../sim/index.ts';
import { EventBus } from '../EventBus.ts';
import { SceneKey } from './keys.ts';
import type { LandedData } from './Landed.ts';
import { createTitleBackdrop } from './titleBackdrop.ts';

/** The title backdrop. Its menu (logo, New Run, Chassis picker, build label) is React's, drawn over the canvas. */
export class Title extends Scene {
  constructor() {
    super(SceneKey.Title);
  }

  /** Whether the backdrop was drawn held still; read once at create from `prefers-reduced-motion`. */
  reducedMotion = false;

  create(): void {
    const backdrop = createTitleBackdrop(this);
    this.reducedMotion = backdrop.reducedMotion;

    const offNewRun = EventBus.on('new-run-requested', (seed, chassisId) => {
      const data: LandedData = { run: startRun(seed, chassisId) };
      this.scene.start(SceneKey.Landed, data);
    });
    // A destroyed game (React StrictMode remounts, tests) never shuts its scenes down, so unsubscribe on
    // both; whichever fires first removes the other listener.
    const unsubscribe = (): void => {
      offNewRun();
      backdrop.dispose(); // every tween and timer of the backdrop stops with the scene
      this.events.off(Scenes.Events.SHUTDOWN, unsubscribe);
      this.events.off(Scenes.Events.DESTROY, unsubscribe);
    };
    this.events.once(Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Scenes.Events.DESTROY, unsubscribe);

    EventBus.emit('scene-ready', SceneKey.Title);
  }
}
