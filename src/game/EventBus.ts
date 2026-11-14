import { Events } from 'phaser';
import type { SceneKey } from './scenes/keys.ts';
import type { ChartCommand, ChartState } from './scenes/navChartView.ts';
import type { BodyId, Run, Seed } from './sim/index.ts';

/** Events crossing the React <-> Phaser boundary. Add an entry here before emitting a new event. */
export interface GameEvents {
  /** Phaser -> React: a scene finished creating and is now on screen. */
  'scene-ready': [sceneKey: SceneKey];
  /** Phaser -> React: the Run the Landed view shows (sent just before its `scene-ready`). */
  'run-started': [run: Run];
  /** React -> Phaser: the player chose New Run; the Run starts from `seed` (see `chooseRunSeed`). */
  'new-run-requested': [seed: Seed];
  /** React -> Phaser: the player asked to open the Nav Chart over the Landed view. */
  'nav-chart-open-requested': [];
  /** React -> Phaser: the player asked to close the Nav Chart. */
  'nav-chart-close-requested': [];
  /** React -> Phaser: a key press on the Nav Chart (move between Bodies, select). */
  'nav-chart-command': [command: ChartCommand];
  /** Phaser -> React: what the Nav Chart shows now (focused Body, chosen target), or `undefined` once it is closed. */
  'nav-chart-state': [state: ChartState | undefined];
  /**
   * Phaser -> React: the Hop target changed. `undefined` when the target is cleared (the chart was
   * closed). Only valid targets are ever sent. The Hop plan panel (#30) listens to this.
   */
  'nav-target-selected': [targetId: BodyId | undefined];
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
