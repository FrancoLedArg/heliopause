import { Events } from 'phaser';

/** Events crossing the React <-> Phaser boundary. Add an entry here before emitting a new event. */
export interface GameEvents {
  'scene-ready': [sceneKey: string];
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
