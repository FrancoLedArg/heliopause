import { Events } from 'phaser';
import type { SceneKey } from './scenes/keys.ts';
import type { ChartCommand, ChartState } from './scenes/navChartView.ts';
import type { FlightMoment, Pace } from './scenes/flightPlayback.ts';
import type { BodyId, ChassisId, HopFlight, Run, Seed } from './sim/index.ts';

/** Events crossing the React <-> Phaser boundary. Add an entry here before emitting a new event. */
export interface GameEvents {
  /** Phaser -> React: a scene finished creating and is now on screen. */
  'scene-ready': [sceneKey: SceneKey];
  /** Phaser -> React: the Run the Landed view shows (sent just before its `scene-ready`). */
  'run-started': [run: Run];
  /** React -> Phaser: the player launched a New Run; it starts from `seed` (see `chooseRunSeed`) on `chassisId`. */
  'new-run-requested': [seed: Seed, chassisId: ChassisId];
  /** React -> Phaser: the player asked to open the Nav Chart over the Landed view. */
  'nav-chart-open-requested': [];
  /** React -> Phaser: the player asked to close the Nav Chart. */
  'nav-chart-close-requested': [];
  /** React -> Phaser: a key press on the Nav Chart (move between Bodies, select). */
  'nav-chart-command': [command: ChartCommand];
  /**
   * Phaser -> React: what the Nav Chart shows now (focused Body, chosen target), or `undefined` once it
   * is closed. For drawing the chart panel.
   */
  'nav-chart-state': [state: ChartState | undefined];
  /**
   * Phaser -> React: the Hop target changed. A Hop target was chosen or cleared: it carries only valid
   * targets, and `undefined` when the target is cleared (the chart was closed). `nav-chart-state`'s
   * `selectedId` is the same value; the Hop plan (#30) reads `selectedId`, since it arrives with the rest of the panel's state.
   */
  'nav-target-selected': [targetId: BodyId | undefined];
  /**
   * React -> Phaser: the player pressed Launch on the Hop plan for `targetId`, at any Success Chance.
   * The Landed scene settles the Hop in the simulation and starts its playback.
   */
  'hop-launch-requested': [targetId: BodyId];
  /**
   * Phaser -> React: a Hop's playback begins (sent just before the Flight's `scene-ready`). `before`
   * is the Run at Launch; `flight` already holds the outcome; `pace` is how long each Burn plays.
   */
  'hop-flight-started': [before: Run, flight: HopFlight, pace: Pace];
  /** Phaser -> React: the playback moved on (Burn, thrust, Fuel, flight log); sent only on a visible change. */
  'hop-flight-moment': [moment: FlightMoment];
  /** React -> Phaser: the player turned the Hop playback's fast-forward on or off. It only scales the clock. */
  'hop-fast-forward-requested': [fast: boolean];
  /**
   * Phaser -> React: the playback of a Fell Short or Crashed Hop is over, and the Run with it. An
   * Arrived Hop goes on to the Landed view instead.
   */
  'hop-failed': [flight: HopFlight];
  /** React -> Phaser: the player confirmed leaving the Run from the in-Run Menu; go back to the Title scene. */
  'leave-run-requested': [];
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

  /** How many handlers are listening for `event`; tests use it to prove scenes clean up after themselves. */
  listenerCount(event: keyof GameEvents): number {
    return this.emitter.listenerCount(event);
  }
}

export const EventBus = new TypedEventBus();
