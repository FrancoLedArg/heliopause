import { Scene, Scenes } from 'phaser';
import { EventBus } from '../EventBus.ts';
import { SceneKey } from './keys.ts';
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

    // A destroyed game (React StrictMode remounts, tests) never shuts its scenes down, so stop on
    // both; whichever fires first removes the other listener. New Run is the game's to answer (main.ts).
    const unsubscribe = (): void => {
      backdrop.dispose(); // every tween and timer of the backdrop stops with the scene
      this.events.off(Scenes.Events.SHUTDOWN, unsubscribe);
      this.events.off(Scenes.Events.DESTROY, unsubscribe);
    };
    this.events.once(Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Scenes.Events.DESTROY, unsubscribe);

    EventBus.emit('scene-ready', SceneKey.Title);
  }
}
