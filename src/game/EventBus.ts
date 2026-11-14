import { Events } from 'phaser';
import type { SceneKey } from './scenes/keys.ts';
import type { ChassisId, Run, Seed } from './sim/index.ts';

/** Events crossing the React <-> Phaser boundary. Add an entry here before emitting a new event. */
export interface GameEvents {
  /** Phaser -> React: a scene finished creating and is now on screen. */
  'scene-ready': [sceneKey: SceneKey];
  /** Phaser -> React: the Run the Landed view shows (sent just before its `scene-ready`). */
  'run-started': [run: Run];
  /** React -> Phaser: the player launched a New Run; it starts from `seed` (see `chooseRunSeed`) on `chassisId`. */
  'new-run-requested': [seed: Seed, chassisId: ChassisId];
}

class TypedEventBus {
  private readonly emitter = new Events.EventEmitter();

  emit<K extends keyof GameEvents>(event: K, ...args: GameEvents[K]): void {
    this.emitter.emit(event, ...args);
  }

  on<K extends keyof GameEvents>(event: K, listener: (...args: GameEvents[K]) => void): () => void {
    this.emitter.on(event, listener);
    return () => {
      this.emitter.off(event, listener);
    };
  }
}

export const EventBus = new TypedEventBus();
