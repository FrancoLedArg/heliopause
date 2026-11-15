import { Scene, Scenes, type GameObjects } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { EventBus } from '../EventBus.ts';
import { install, launchHop, remove, type HopFlight, type Run } from '../sim/index.ts';
import { SHIP_PLACEMENT, SHIP_SHADOW } from './landedView.ts';
import { SceneKey } from './keys.ts';
import type { FlightData } from './Flight.ts';
import type { NavChartData } from './NavChart.ts';
import { createLandedAmbient, type LandedAmbient } from './landedAmbient.ts';
import { buildLandscape, LAYER_X, SKY_X } from './landscape.ts';
import { onLeaveRun } from './leaveRun.ts';
import { addSpacecraftArt, shadowWidth, spacecraftNozzles } from './spacecraftArt.ts';

export interface LandedData {
  /** The Run to show: the Spacecraft landed on its current Body. */
  readonly run: Run;
  /** Set when the view follows an Arrived Hop: its report is shown beside the landscape. */
  readonly report?: { readonly before: Run; readonly flight: HopFlight };
}

/** Landed view: the whole Spacecraft on the ground of the Body it stands on, under that Body's sky. */
export class Landed extends Scene {
  private run!: Run;
  private report: LandedData['report'];
  /** The layers, back to front: ambient motion (parallax drift) moves these. */
  layers!: Readonly<Record<'sky' | 'ground' | 'ship', GameObjects.Container>>;
  /** Whether the ambient life was left still; read once at create from `prefers-reduced-motion`. */
  reducedMotion = false;
  /** The ambient life: tests use it to seek the drift to a chosen moment. */
  ambient!: LandedAmbient;

  constructor() {
    super(SceneKey.Landed);
  }

  init(data: LandedData): void {
    this.run = data.run;
    this.report = data.report;
  }

  create(): void {
    const landscape = buildLandscape(this, standingOn(this.run));
    const ship = this.buildShip();
    this.layers = { ...landscape.layers, ship: ship.container };

    // The Nav Chart runs as its own scene over this one, which keeps running (dimmed) beneath it.
    const offOpen = EventBus.on('nav-chart-open-requested', () => {
      if (this.scene.isActive(SceneKey.NavChart) || this.run.status.kind !== 'landed') return;
      const data: NavChartData = { run: this.run };
      this.scene.launch(SceneKey.NavChart, data);
    });
    // Launch settles the Hop in the simulation, then hands it to the Flight to play back. Starting
    // the Flight shuts this scene down, and the Nav Chart with it.
    const offLaunch = EventBus.on('hop-launch-requested', (targetId) => {
      if (this.run.status.kind !== 'landed') return;
      const launched = launchHop(this.run, targetId);
      // The plan only offers Launch for a valid target; the chart already says why one is not.
      if (launched.kind !== 'flown') return;
      const data: FlightData = { before: this.run, flight: launched.flight, after: launched.run };
      this.scene.start(SceneKey.Flight, data);
    });
    // The Spacecraft panel asks for installs; the Run lives here, so this is where it changes.
    const offInstall = EventBus.on('component-install-requested', (slotIndex, componentId) => {
      const installed = install(this.run, slotIndex, componentId);
      // The panel checks an install before it asks, so a refusal here is a programmer error.
      if (installed.kind !== 'installed') {
        throw new Error(
          `Install of ${componentId} in Slot ${String(slotIndex)} refused: ${installed.reason.kind}`,
        );
      }
      this.changed(installed.run);
    });
    const offRemove = EventBus.on('component-remove-requested', (slotIndex) => {
      const removed = remove(this.run, slotIndex);
      // The panel checks a removal before it asks, so a refusal here is a programmer error.
      if (removed.kind !== 'removed') {
        throw new Error(`Removal from Slot ${String(slotIndex)} refused: ${removed.reason.kind}`);
      }
      this.changed(removed.run);
    });
    // A destroyed game never shuts its scenes down, so unsubscribe on both events.
    const unsubscribe = (): void => {
      offOpen();
      offInstall();
      offRemove();
      offLaunch();
      this.events.off(Scenes.Events.SHUTDOWN, unsubscribe);
      this.events.off(Scenes.Events.DESTROY, unsubscribe);
    };
    this.events.once(Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Scenes.Events.DESTROY, unsubscribe);
    // Leaving the Landed view takes an open Nav Chart with it (on destroy the chart is destroyed anyway).
    this.events.once(Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SceneKey.NavChart);
    });

    const ambient = createLandedAmbient(this, {
      layers: this.layers,
      rest: { sky: SKY_X, layer: LAYER_X, ship: SHIP_PLACEMENT.x },
      starfield: landscape.starfield,
      setShipLights: ship.setLights,
      nozzles: spacecraftNozzles(this.run.spacecraft.chassisId, 'standing').map(
        (nozzle) => nozzle.exit,
      ),
      dustColor: landscape.dustColor,
      seed: this.run.seed,
    });
    this.ambient = ambient;
    this.reducedMotion = ambient.reducedMotion;
    // A destroyed game never shuts its scenes down, so stop on both; whichever fires first removes the other.
    const stop = (): void => {
      ambient.dispose();
      this.events.off(Scenes.Events.SHUTDOWN, stop);
      this.events.off(Scenes.Events.DESTROY, stop);
    };
    this.events.once(Scenes.Events.SHUTDOWN, stop);
    this.events.once(Scenes.Events.DESTROY, stop);

    onLeaveRun(this);
    if (this.run.status.kind === 'ended') {
      // Landed Stranded (the simulation ended the Run on arrival): straight to its end, with no
      // Hop report, since that Hop is not what ended it.
      EventBus.emit('run-stranded', this.run);
    } else {
      EventBus.emit('run-started', this.run);
      if (this.report) EventBus.emit('hop-arrived', this.report.before, this.report.flight);
    }
    EventBus.emit('scene-ready', SceneKey.Landed);
  }

  /** An install or a removal changed the Run: it may have left the Spacecraft Stranded. */
  private changed(run: Run): void {
    this.run = run;
    if (run.status.kind === 'ended') EventBus.emit('run-stranded', run);
    else EventBus.emit('run-updated', run);
  }

  /** The whole Spacecraft standing in the foreground, with its shadow. */
  private buildShip(): {
    container: GameObjects.Container;
    setLights: (on: boolean) => void;
  } {
    const container = this.add.container(SHIP_PLACEMENT.x, SHIP_PLACEMENT.baseY);
    const { chassisId } = this.run.spacecraft;
    container.add(
      this.add.ellipse(
        0,
        SHIP_SHADOW.dy,
        shadowWidth(chassisId),
        SHIP_SHADOW.height,
        paletteNumber('void'),
        0.45,
      ),
    );
    const art = addSpacecraftArt(this, chassisId);
    container.add([...art.objects]);
    return {
      container,
      setLights: (on) => {
        art.show(on ? 'landed_lit' : 'landed');
      },
    };
  }
}

/** The Run as the Landed view draws it: a Stranded Run still stands on the Body it ended on. */
function standingOn(run: Run): Run {
  const { status } = run;
  if (status.kind !== 'ended' || status.end.kind !== 'stranded') return run;
  return { ...run, status: { kind: 'landed', bodyId: status.end.bodyId } };
}
