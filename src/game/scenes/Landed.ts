import { Scene, Scenes, type GameObjects } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { EventBus } from '../EventBus.ts';
import {
  currentBody,
  install,
  landedDayFraction,
  launchHop,
  remove,
  type HopFlight,
  type Run,
} from '../sim/index.ts';
import { addSkyLight, localTimeAnnouncer, type SkyLight } from './skyLight.ts';
import { standingExtent } from './chassisArt.ts';
import { describeGathering, type Gathering } from './gathering.ts';
import { playGatheringMoment } from './gatheringMoment.ts';
import { SHIP_PLACEMENT, SHIP_SHADOW } from './landedView.ts';
import { SceneKey } from './keys.ts';
import type { Point } from './chassisArt.ts';
import type { FlightData } from './Flight.ts';
import type { NavChartData } from './NavChart.ts';
import { createLandedAmbient, type LandedAmbient } from './landedAmbient.ts';
import { buildLandscape, LAYER_X, SKY_X } from './landscape.ts';
import { onLeaveRun } from './leaveRun.ts';
import {
  addSpacecraftArt,
  shadowWidth,
  spacecraftNozzles,
  type SpacecraftArt,
} from './spacecraftArt.ts';

/** The game root's attribute listing the drawn Spacecraft's pieces and Component bounds (a test hook). */
export const SPACECRAFT_ATTRIBUTE = 'data-spacecraft';

export interface LandedData {
  /** The Run to show: the Spacecraft landed on its current Body. */
  readonly run: Run;
  /** Set when the view follows an Arrived Hop: its report is shown beside the landscape. */
  readonly report?: { readonly before: Run; readonly flight: HopFlight };
  /** Set when the view follows the Jump: it comes up out of the black the Jump ended on. */
  readonly afterJump?: boolean;
  /**
   * A gathering moment to play as the view comes up (see `describeGathering`): the hook for a Run start
   * that collects a yield (#189's Starting Moon). After an Arrived Hop it is read from `report`'s
   * collection when absent, so the Flight need not pass it.
   */
  readonly gathering?: Gathering;
}

/** How long the Landed view takes to come up out of the black after the Jump (ms). Under reduced motion too: a fade is calm. */
const AFTER_JUMP_FADE_MS = 700;

/**
 * The Comms ping (gameplay tuning, ms and px): rings that grow out of the top of the Spacecraft and
 * fade, once the Landed view is up after a landing that Detected something. Under reduced motion one
 * ring shows still for `stillMs`, then goes.
 */
export const COMMS_PING = {
  delayMs: 500,
  rings: 3,
  staggerMs: 260,
  durationMs: 1_200,
  startRadius: 6,
  endScale: 7,
  stillMs: 1_400,
} as const;

/**
 * The Radar sweep (gameplay tuning, ms and px): one wide ring grows out of the Spacecraft and fades,
 * on a landing with a Radar aboard and when one is installed, so the Radar visibly does something
 * (#191). Reduced motion skips it; the live region still says what it found.
 */
export const RADAR_SWEEP = {
  durationMs: 1_400,
  startRadius: 8,
  endScale: 24,
} as const;

/** Landed view: the whole Spacecraft on the ground of the Body it stands on, under that Body's sky. */
export class Landed extends Scene {
  private run!: Run;
  private report: LandedData['report'];
  private afterJump = false;
  private gathering: Gathering | undefined;
  /** The layers, back to front: ambient motion (parallax drift) moves these. */
  layers!: Readonly<Record<'sky' | 'ground' | 'ship', GameObjects.Container>>;
  /** Whether the ambient life was left still; read once at create from `prefers-reduced-motion`. */
  reducedMotion = false;
  /** The ambient life: tests use it to seek the drift to a chosen moment. */
  ambient!: LandedAmbient;
  /** The rings of the Comms ping while it plays, empty otherwise: tests read it. */
  commsPing: GameObjects.Graphics[] = [];
  /** The Radar sweep's ring while it plays, `undefined` otherwise: tests read it. */
  radarSweep: GameObjects.Graphics | undefined;
  /** The drawn Spacecraft, composed from its Chassis art and Component art. */
  spacecraft!: SpacecraftArt;
  private shadow!: GameObjects.Ellipse;
  /** The light of the local day: tests read it. */
  skyLight!: SkyLight;
  /** Real seconds spent standing here: the slow game time while Landed (view-only, never the Run's). */
  private landedSeconds = 0;
  private announceTime = localTimeAnnouncer();
  /** The Spacecraft's layer, where the gathering moment flows in. */
  private shipLayer!: GameObjects.Container;

  constructor() {
    super(SceneKey.Landed);
  }

  init(data: LandedData): void {
    this.run = data.run;
    this.report = data.report;
    this.afterJump = data.afterJump ?? false;
    this.gathering =
      data.gathering ??
      (data.report ? describeGathering(data.run, data.report.flight.collection) : undefined);
  }

  create(): void {
    const landscape = buildLandscape(this, standingOn(this.run));
    this.skyLight = addSkyLight(this, landscape.layers.sky, landscape.layers.ground);
    this.landedSeconds = 0;
    this.announceTime = localTimeAnnouncer();
    this.applyLocalTime();
    const ship = this.buildShip();
    this.shipLayer = ship.container;
    this.layers = { ...landscape.layers, ship: ship.container };
    this.commsPing = [];

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
      // A Radar sweeps as soon as it is installed: the ring shows it, React says what it found.
      if (installed.sweep) {
        this.playRadarSweep(ship.container);
        EventBus.emit('comms-revealed', installed.run, {
          surveyed: undefined,
          detected: [],
          radar: installed.sweep,
        });
      }
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
      nozzles: this.standingNozzles(),
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

    if (this.afterJump) {
      // Out of the same black the Jump ended on.
      const black = paletteNumber('void');
      this.cameras.main.fadeIn(
        AFTER_JUMP_FADE_MS,
        (black >> 16) & 255,
        (black >> 8) & 255,
        black & 255,
      );
    }
    onLeaveRun(this);
    if (this.run.status.kind === 'ended') {
      // Landed Stranded (the simulation ended the Run on arrival): straight to its end, with no
      // Hop report, since that Hop is not what ended it.
      EventBus.emit('run-stranded', this.run);
    } else {
      const { run, report } = this;
      EventBus.emit('run-started', run);
      if (report) EventBus.emit('hop-arrived', report.before, report.flight);
      // Comms Detected something on this landing: the ping shows it, React says it. It follows the
      // gathering moment, so the eye takes one thing at a time.
      const reveal = report?.flight.reveal;
      const ping =
        reveal && (reveal.detected.length > 0 || reveal.radar)
          ? () => {
              if (reveal.detected.length > 0) this.playCommsPing(ship.container);
              if (reveal.radar) this.playRadarSweep(ship.container);
              EventBus.emit('comms-revealed', run, reveal);
            }
          : undefined;
      // Under reduced motion the view already shows the end state: the Run's own values.
      if (this.gathering && !this.reducedMotion) this.playGathering(this.gathering, ping);
      else if (ping) this.time.delayedCall(COMMS_PING.delayMs, ping);
    }
    EventBus.emit('scene-ready', SceneKey.Landed);
  }

  /** The fraction of the local day now: the Run's clock plus the slow drift of the time spent standing here. */
  localDayFraction(): number {
    const run = standingOn(this.run);
    return landedDayFraction(run.starSystem, currentBody(run), run.gameHours, this.landedSeconds);
  }

  /** Lights the sky for the local time and tells React the dial. */
  private applyLocalTime(): void {
    const fraction = this.localDayFraction();
    this.skyLight.set(fraction);
    this.announceTime(fraction);
  }

  /** The sky is never still: game time drifts on while Landed, unless the player prefers reduced motion. */
  override update(_time: number, delta: number): void {
    if (this.reducedMotion) return;
    this.landedSeconds += delta / 1000;
    this.applyLocalTime();
  }

  /**
   * The Radar reaching out: one cyan ring growing from the middle of the Spacecraft, wide enough to
   * sweep the sky, and fading. Skipped under reduced motion.
   */
  private playRadarSweep(ship: GameObjects.Container): void {
    if (this.reducedMotion) return;
    this.radarSweep?.destroy();
    const middle = -standingExtent([this.run.spacecraft.chassisId]).height / 2;
    const ring = this.add.graphics({ x: 0, y: middle });
    ring.lineStyle(1, paletteNumber('cy2'), 1);
    ring.strokeCircle(0, 0, RADAR_SWEEP.startRadius);
    ship.add(ring);
    this.radarSweep = ring;
    this.tweens.add({
      targets: ring,
      scale: { from: 1, to: RADAR_SWEEP.endScale },
      alpha: { from: 0.9, to: 0 },
      duration: RADAR_SWEEP.durationMs,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.radarSweep === ring) this.radarSweep = undefined;
        ring.destroy();
      },
    });
  }

  /**
   * Comms reaching out: cyan rings growing from the top of the Spacecraft and fading, a shape that
   * reads without its colour. They ride the ship's container, so they drift with it.
   */
  private playCommsPing(ship: GameObjects.Container): void {
    const top = -standingExtent([this.run.spacecraft.chassisId]).height;
    const ring = (): GameObjects.Graphics => {
      const graphics = this.add.graphics({ x: 0, y: top });
      graphics.lineStyle(1, paletteNumber('cy3'), 1);
      graphics.strokeCircle(0, 0, COMMS_PING.startRadius);
      ship.add(graphics);
      this.commsPing.push(graphics);
      return graphics;
    };
    const done = (graphics: GameObjects.Graphics): void => {
      this.commsPing = this.commsPing.filter((g) => g !== graphics);
      graphics.destroy();
    };
    if (this.reducedMotion) {
      const still = ring().setScale(COMMS_PING.endScale / 2);
      this.time.delayedCall(COMMS_PING.stillMs, () => {
        done(still);
      });
      return;
    }
    for (let index = 0; index < COMMS_PING.rings; index++) {
      const graphics = ring().setAlpha(0);
      this.tweens.add({
        targets: graphics,
        delay: index * COMMS_PING.staggerMs,
        scale: { from: 1, to: COMMS_PING.endScale },
        alpha: { from: 1, to: 0 },
        duration: COMMS_PING.durationMs,
        ease: 'Sine.easeOut',
        onComplete: () => {
          done(graphics);
        },
      });
    }
  }

  /**
   * The resource flows from the ground into the Spacecraft and on into the top bar, which React counts
   * up from the events; any key or click (`gathering-skip-requested`) jumps to the end.
   */
  private playGathering(gathering: Gathering, then?: () => void): void {
    EventBus.emit('gathering-started', gathering);
    const moment = playGatheringMoment(
      this,
      gathering,
      { ship: this.shipLayer, shipExtent: standingExtent([this.run.spacecraft.chassisId]) },
      (readout) => {
        EventBus.emit('gathering-readout', readout);
      },
      () => {
        stop();
        EventBus.emit('gathering-ended');
        then?.();
      },
    );
    const offSkip = EventBus.on('gathering-skip-requested', () => {
      moment.skip();
    });
    // Leaving the view mid-moment drops the listener; the scene clears its own tweens and timers.
    const stop = (): void => {
      offSkip();
      this.events.off(Scenes.Events.SHUTDOWN, stop);
      this.events.off(Scenes.Events.DESTROY, stop);
    };
    this.events.once(Scenes.Events.SHUTDOWN, stop);
    this.events.once(Scenes.Events.DESTROY, stop);
  }

  /** An install or a removal changed the Run: it may have left the Spacecraft Stranded. */
  private changed(run: Run): void {
    this.run = run;
    this.redrawShip();
    if (run.status.kind === 'ended') EventBus.emit('run-stranded', run);
    else EventBus.emit('run-updated', run);
  }

  /** Where the standing Spacecraft's engines idle: every nozzle exit of its art. */
  private standingNozzles(): Point[] {
    const { chassisId, slots } = this.run.spacecraft;
    return spacecraftNozzles(chassisId, 'standing', slots).map((nozzle) => nozzle.exit);
  }

  /** The Components changed: the drawn Spacecraft, its shadow and its engine glow follow at once. */
  private redrawShip(): void {
    const { chassisId, slots } = this.run.spacecraft;
    this.spacecraft.setSlots(slots);
    this.shadow.setSize(shadowWidth(chassisId, slots), SHIP_SHADOW.height);
    this.ambient.setNozzles(this.standingNozzles());
    this.publishShip();
  }

  /** Lists the drawn Spacecraft on the game root, for tests to read what is drawn. */
  private publishShip(): void {
    const { pieces, components } = this.spacecraft.drawn();
    this.game.canvas.parentElement?.setAttribute(
      SPACECRAFT_ATTRIBUTE,
      JSON.stringify({ chassisId: this.run.spacecraft.chassisId, pieces, components }),
    );
  }

  /** The whole Spacecraft standing in the foreground, with its shadow. */
  private buildShip(): {
    container: GameObjects.Container;
    setLights: (on: boolean) => void;
  } {
    const container = this.add.container(SHIP_PLACEMENT.x, SHIP_PLACEMENT.baseY);
    const { chassisId, slots } = this.run.spacecraft;
    this.shadow = this.add.ellipse(
      0,
      SHIP_SHADOW.dy,
      shadowWidth(chassisId, slots),
      SHIP_SHADOW.height,
      paletteNumber('void'),
      0.45,
    );
    container.add(this.shadow);
    const art = addSpacecraftArt(this, chassisId, slots);
    this.spacecraft = art;
    container.add([...art.objects]);
    this.publishShip();
    const unpublish = (): void => {
      this.game.canvas.parentElement?.removeAttribute(SPACECRAFT_ATTRIBUTE);
    };
    this.events.once(Scenes.Events.SHUTDOWN, unpublish);
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
