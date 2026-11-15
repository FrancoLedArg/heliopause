import { Events } from 'phaser';
import type { SceneKey } from './scenes/keys.ts';
import type { ChartCommand, ChartState } from './scenes/navChartView.ts';
import type { FlightMoment, Pace } from './scenes/flightPlayback.ts';
import type { Gathering, GatheringReadout } from './scenes/gathering.ts';
import type { JumpStage } from './scenes/jumpPlayback.ts';
import type {
  ChassisId,
  ComponentId,
  HopFlight,
  HopTarget,
  Reveal,
  Run,
  Seed,
} from './sim/index.ts';

/** Events crossing the React <-> Phaser boundary. Add an entry here before emitting a new event. */
export interface GameEvents {
  /** Phaser -> React: a scene finished creating and is now on screen. */
  'scene-ready': [sceneKey: SceneKey];
  /** Phaser -> React: the Run the Landed view shows (sent just before its `scene-ready`). */
  'run-started': [run: Run];
  /**
   * Phaser -> React: the Comms ping is playing on the Landed view after a landing that taught the
   * player something (`reveal`: the Body Surveyed, and what Comms Detected). React announces it in a
   * polite live region; the ping itself is the visual.
   */
  'comms-revealed': [run: Run, reveal: Reveal];
  /**
   * Phaser -> React: the Run changed while the Landed view stays up (a Component was installed). Unlike
   * `run-started` it is not a new view: reports and focus stay as they are.
   */
  'run-updated': [run: Run];
  /**
   * React -> Phaser: the player installed `componentId` in Slot `slotIndex` (0-based) from the Spacecraft
   * panel, which has already checked the install is allowed. The Landed scene applies it to its Run and
   * answers with `run-updated`.
   */
  'component-install-requested': [slotIndex: number, componentId: ComponentId];
  /**
   * React -> Phaser: the player confirmed removing the Component in Slot `slotIndex` (0-based) from the
   * Spacecraft panel, which has already checked the removal is allowed. The Landed scene applies it to
   * its Run, refunds half the cost and answers with `run-updated`.
   */
  'component-remove-requested': [slotIndex: number];
  /** React -> Phaser: the player launched a New Run; it starts from `seed` (see `chooseRunSeed`) on `chassisId`. */
  'new-run-requested': [seed: Seed, chassisId: ChassisId];
  /** React -> Phaser: the player asked to open the Nav Chart over the Landed view. */
  'nav-chart-open-requested': [];
  /** React -> Phaser: the Spacecraft panel closed over the Landed view. */
  'spacecraft-panel-closed': [];
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
  'nav-target-selected': [target: HopTarget | undefined];
  /**
   * React -> Phaser: the player pressed Launch on the Hop plan for `target` (a Body or the
   * Heliopause), at any Success Chance. The Landed scene settles the Hop in the simulation and starts
   * its playback.
   * `daily` is set for a Daily Run, which never takes the test-only Cruise leak (`?cruiseLeak=`).
   */
  'hop-launch-requested': [target: HopTarget, daily?: boolean];
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
   * Phaser -> React: the Run in its Cruise changed (a Cruise event struck, a leak drained Fuel, a
   * Repair ran on, a Repair or Rush was made). The HUD draws the Damage, the Fuel and the Materials
   * from it (#250). Sent while the Cruise runs, at most once per Cruise tick.
   */
  'cruise-updated': [run: Run];
  /** Phaser -> React: a Cruise event struck, so the fast-forward dropped back to normal speed (#210). */
  'cruise-event-struck': [];
  /**
   * Phaser -> React: the Cruise reached its end and the Hop is settled: the Landing plays from this
   * result (`after` is the Run after the Hop), which the Cruise's Repairs may have changed.
   */
  'hop-flight-settled': [flight: HopFlight, after: Run];
  /**
   * React -> Phaser: start the Repair of the Damaged Component in Slot `slot` (0-based), from its
   * systems light or the Spacecraft panel. The scene that owns the Run (the Flight in the Cruise, the
   * Landed view between Hops) applies it and answers with `cruise-updated` or `run-updated`.
   */
  'repair-requested': [slot: number];
  /** React -> Phaser: Rush the Repair in Slot `slot`, paying its Materials; answered like a Repair. */
  'rush-requested': [slot: number];
  /**
   * Phaser -> React: the playback of a Fell Short or Crashed Hop is over, and the Run with it. An
   * Arrived Hop goes on to the Landed view instead.
   */
  'hop-failed': [flight: HopFlight, ended: Run];
  /**
   * Phaser -> React: the playback of a Hop that reached the Heliopause is over and the Jump moment
   * plays, one stage at a time (sent once as each stage begins). Once `dark`, the HUD gives way to
   * the flavour text; the Landed view of the next Starting Moon follows with its own `run-started`.
   */
  'jump-stage': [stage: JumpStage];
  /**
   * Phaser -> React: the Landed view on the new Body follows an Arrived Hop, so its report is shown beside
   * it (sent after the Landed view's `run-started`, before its `scene-ready`). `before` is the Run at Launch.
   */
  'hop-arrived': [before: Run, flight: HopFlight];
  /**
   * Phaser -> React: the gathering moment begins in the Landed view (sent after `hop-arrived`, before
   * `scene-ready`). Until `gathering-ended`, the top bar's readout for `gathering.resource` shows
   * `gathering.from` and then each `gathering-readout`, and the Hop report waits. Never sent under
   * reduced motion: the view shows the end state at once.
   */
  'gathering-started': [gathering: Gathering];
  /** Phaser -> React: the readout counted up as the resource reached the top bar; sent only on a change. */
  'gathering-readout': [readout: GatheringReadout];
  /** Phaser -> React: the gathering moment is over, played out or skipped; the top bar shows the Run's own values. */
  'gathering-ended': [];
  /** React -> Phaser: the player pressed a key or clicked during the gathering moment: skip to its end. */
  'gathering-skip-requested': [];
  /**
   * Phaser -> React: the simulation ended the Run as Stranded (`ended`) on the Body the Landed view
   * shows: no change to the Spacecraft could give any Hop a chance. Sent when the view comes up on a
   * Run that ended on arrival (instead of `run-started` and `hop-arrived`), or after an install or a
   * removal that strands it (instead of `run-updated`).
   */
  'run-stranded': [ended: Run];
  /** Phaser -> React: the local time of day on the Body the Landed view shows moved (0 to 1, 0 = midnight, 0.5 = noon). */
  'local-time-changed': [fraction: number];
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
