import { Scenes, type Scene } from 'phaser';
import { EventBus } from '../EventBus.ts';
import { SceneKey } from './keys.ts';

/**
 * Lets the in-Run Menu send `scene` back to the Title. Call it from a Run scene's `create`: the
 * listener is removed when the scene shuts down (starting the Title does that) or is destroyed.
 */
export function onLeaveRun(scene: Scene): void {
  const off = EventBus.on('leave-run-requested', () => {
    scene.scene.start(SceneKey.Title);
  });
  const cleanup = (): void => {
    off();
    scene.events.off(Scenes.Events.SHUTDOWN, cleanup);
    scene.events.off(Scenes.Events.DESTROY, cleanup);
  };
  scene.events.once(Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Scenes.Events.DESTROY, cleanup);
}
