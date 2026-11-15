import { BlendModes, Scene, Scenes, type GameObjects, type Tweens } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';
import { EventBus } from '../EventBus.ts';
import { prefersReducedMotion } from '../lib/motion.ts';
import { createRng } from '../lib/rng.ts';
import {
  CHASSIS_IDS,
  findBody,
  type BodyId,
  type Burn,
  type HopFlight,
  type Run,
} from '../sim/index.ts';
import {
  FAST_FORWARD,
  flightPlayback,
  type FlightMoment,
  type FlightPlayback,
  type Pace,
} from './flightPlayback.ts';
import { anchorFx } from './groundAnchor.ts';
import { jumpPlayback, type JumpPlayback, type JumpStage } from './jumpPlayback.ts';
import {
  createFlightEffects,
  flashTexture,
  glowTexture,
  type FlightEffects,
} from './flightEffects.ts';
import { SceneKey } from './keys.ts';
import type { LandedData } from './Landed.ts';
import {
  bodySprite,
  HELIOPAUSE_SPRITE,
  SCREEN_WIDTH,
  SHIP_PLACEMENT,
  SHIP_SHADOW,
} from './landedView.ts';
import { buildLandscape, type LandscapeLayers } from './landscape.ts';
import { onLeaveRun } from './leaveRun.ts';
import {
  FLIGHT_ANGLE,
  frameGeometry,
  turn,
  type NozzleKind,
  type Point,
  type ShipPose,
} from './chassisArt.ts';
import {
  addSpacecraftArt,
  shadowWidth,
  spacecraftNozzles,
  type ShipFrame,
} from './spacecraftArt.ts';
import { addStarfield } from './starfield.ts';
import {
  CRASH_FALL_MS,
  deadEngine,
  landingShot,
  takeoffShot,
  type VerticalShot,
} from './verticalShots.ts';

export interface FlightData {
  /** The Run at Launch: the Spacecraft on the departure Body with its Fuel. */
  readonly before: Run;
  /** The Hop as the simulation flew it: the outcome is already settled. */
  readonly flight: HopFlight;
  /** The Run after the Hop: landed on the target, on the next Home Planet after the Jump, or ended. */
  readonly after: Run;
}

/**
 * Which way each pose's plumes point, clockwise from straight down: the standing ship fires down for
 * Takeoff and Landing; the `flight` frame is turned by the flight angle, so the boost and the
 * Transfer fire back along the heading.
 */
const PLUME_ANGLE: Readonly<Record<ShipPose, number>> = { standing: 0, flight: FLIGHT_ANGLE };
/**
 * How big each nozzle's plume is, as a share of the plume art (`fx_thruster`, 16x24): as wide as a
 * nozzle bell, so the main engine's cluster shows one flame per nozzle; the side propulsors' flames
 * are shorter (presentation tuning).
 */
const PLUME_SCALE: Readonly<
  Record<NozzleKind, { readonly width: number; readonly length: number }>
> = {
  main: { width: 0.5, length: 1 },
  side: { width: 0.5, length: 0.8 },
};
/** The stand-in flame (until `fx_thruster` is in the manifest) is drawn at this scale. */
const STAND_IN_FLAME_SCALE = 2;

/**
 * The plume art: the bigger, brighter takeoff exhaust (`fx_plume`, 24x64) fires down from the
 * standing Spacecraft once the manifest has it, `fx_thruster` (16x24) otherwise and in flight. Both
 * hang from the nozzle at their top centre, pointing down, and flicker through `flicker_<n>` frames.
 * `scale` sizes `fx_plume` to the nozzle like `fx_thruster` and a little longer.
 */
const PLUME_ART = {
  fx_thruster: { frames: 3, scale: { width: 1, length: 1 } },
  fx_plume: { frames: 4, scale: { width: 0.7, length: 0.55 } },
} as const;
type PlumeArt = keyof typeof PLUME_ART;

/** The plumes glow amber round their edges (a Glow filter), standing on the engines at Takeoff and Landing. */
const PLUME_GLOW = { color: 'am3', strength: 3, quality: 6, distance: 6 } as const;

/** One nozzle's flame, in the ship's container at its exit; `art` undefined for the stand-in flame. */
interface Plume {
  readonly image: GameObjects.Image;
  readonly kind: NozzleKind;
  readonly art: PlumeArt | undefined;
}

/** The art of a pose's plumes, or `undefined` for the stand-in flame. */
function plumeArt(pose: ShipPose): PlumeArt | undefined {
  if (pose === 'standing' && hasAsset('fx_plume')) return 'fx_plume';
  return hasAsset('fx_thruster') ? 'fx_thruster' : undefined;
}

/** How the landscape moves as the camera climbs: the sky barely, the ground fully. */
const SCROLL_FACTOR = { sky: 0.06, ground: 1 } as const;

/** Layout tuning: the open sky kept between the flying Spacecraft's nose and the right edge (px). */
const NOSE_MARGIN = 8;
/** How far the flight frame reaches right of the centre of the base: the longest Chassis' nose (px). */
const FLIGHT_REACH = Math.max(
  ...CHASSIS_IDS.map((id) => {
    const { width, pivot } = frameGeometry(id, 'flight');
    return width - pivot.x;
  }),
);
/** How far the flight frame reaches above the centre of the base: the tallest Chassis (px). */
const FLIGHT_TOP = Math.max(...CHASSIS_IDS.map((id) => frameGeometry(id, 'flight').pivot.y));
/**
 * Where the Transfer picks the Spacecraft up on screen: where the vertical climb left the frame,
 * above its Landed spot at the top edge, as far right as the whole flight frame still fits.
 */
const TRANSFER_ENTRY = {
  x: Math.min(SHIP_PLACEMENT.x, SCREEN_WIDTH - NOSE_MARGIN - FLIGHT_REACH),
  y: FLIGHT_TOP + NOSE_MARGIN,
} as const;
/**
 * The share of the Transfer over which the camera catches up with the Spacecraft. Long, and onto a
 * line that starts near where the climb left the frame, so the catch-up reads as a calm drift, not a pan.
 */
const TRANSFER_SETTLE = 0.45;
/** Where the Transfer's line carries the Spacecraft on screen: from `x` at the start, `dx` further by the end. */
const TRANSFER_LINE = { x: 380, dx: 36 } as const;
/**
 * How far the dust and smoke follow the camera. At Takeoff the camera climbs and the ground drops
 * away fast; at 0.4 the puffs fall away slower, so they stay on screen for the first 1.5 s or more
 * (the strip is gone from view after about 1 s) and hang in the air as the Spacecraft leaves. At
 * Landing the ground rises into view with them, so they move with it.
 */
const FX_SCROLL_FACTOR = { departure: 0.4, arrival: 1 } as const;
/**
 * The departure Body in the Transfer: large at the left, receding toward the left edge. It stays in
 * the open sky between the top bar and phase strip (above y 78 right of x 170) and the flight log
 * (below y 212), so the player sees it shrink the whole way.
 */
const DEPARTURE = {
  from: { x: 96, y: 132, size: 136 },
  to: { x: 34, y: 118, size: 26 },
} as const;
/** How long the fade at a cut between the ground and space lasts (ms). */
const STAGE_FADE_MS = 180;
/**
 * The engine's lights (presentation tuning): the ground glow's size on the strip (px), the glow at
 * each nozzle exit (px across), and the burst of light as it lights, touches down or crashes (px
 * across at its brightest).
 */
const GROUND_GLOW = { width: 170, height: 30 } as const;
const NOZZLE_GLOW = 22;
const BURST = { size: 120, crash: 200 } as const;
/** How long a failing engine sputters before it dies (ms), at full motion. */
const SPUTTER_MS = 450;
/** The crash's explosion art (`fx_explosion`), when the manifest has it: frames `explode_0`..`explode_7`, each shown this long (ms). */
const EXPLOSION = { frames: 8, frameMs: 70, scale: 2 } as const;

/** The pieces thrown up by a crash. */
const DEBRIS_COUNT = 14;
/** How many different chunks the debris art has. */
const DEBRIS_CHUNKS = 6;
/** Where a Spacecraft that Fell Short in the Transfer drifts to, right of the report. */
const DRIFT_REST = { x: 470, y: 160 } as const;

/**
 * The Jump moment (presentation tuning): the Jump Drive's glow round the Spacecraft at full charge
 * (px), how far the firing flings the Spacecraft along its heading (px), and how bright the flash is.
 */
const JUMP_GLOW_RADIUS = 40;
const JUMP_THROW = 760;
const JUMP_FLASH_ALPHA = 0.85;

const STREAK_COUNT = 34;
/** Speed streaks run against the direction of travel: down and to the left. */
const STREAK_ANGLE = Math.atan2(0.42, -1);
/** The direction of travel through space, a unit vector: up and to the right. */
const HEADING = { x: -Math.cos(STREAK_ANGLE), y: -Math.sin(STREAK_ANGLE) } as const;
const SPACE_STARS = 160;

/**
 * Hop playback: the camera stays on the Spacecraft through every Burn (a Hop to the Heliopause has
 * no Landing: it ends in space, the Heliopause ahead, and the Jump follows: the Jump Drive charges
 * and fires, the screen goes dark behind the flavour text, and the Landed view of the next Home
 * Planet comes up out of the black). Takeoff rises straight up off the departure Body, upright on
 * its engines, and climbs out through the top edge (see `verticalShots`); the Transfer crosses space
 * at a 3/4 view, the departure Body shrinking and the target growing; Landing comes straight down
 * onto the target, upright, ending on exactly the Landed view's composition. One clock drives everything from the
 * simulation's flight (see `flightPlayback`), so playback can only show the outcome, never change it.
 */
export class Flight extends Scene {
  private before!: Run;
  private flight!: HopFlight;
  private after!: Run;
  /** The pacing of this Hop's playback; tests find each Burn's span in it. */
  playback!: FlightPlayback;
  /** Shorter, with no streaks or shake, when the player prefers reduced motion. */
  private pace: Pace = 'full';
  private clock!: Tweens.Tween;
  private finished = false;
  /** The pooled particles; none under reduced motion. */
  private fx: FlightEffects | undefined;
  /** Where the playback is (ms from Launch). */
  playbackMs = 0;
  /** The Jump moment after a Hop that reached the Heliopause; `undefined` for any other Hop. */
  jump: JumpPlayback | undefined;
  /** ms from Launch to the hand-off: the Hop's playback, then the Jump's. */
  duration = 0;
  /** How dark the screen is during the Jump, 0 (clear) to 1 (black). */
  darkness = 0;
  /** How bright the engine's warm flash over the screen is (its alpha); 0 under reduced motion. */
  flash = 0;
  /** How hard the camera rumbles (the most it is thrown off, px); 0 under reduced motion. */
  rumble = 0;
  /** The glow on the ground under the engine at Takeoff and Landing; tests check where it lights. */
  groundGlow!: GameObjects.Image;
  /** The engine's light: the flash over the screen, the burst at the ground, and the glow at each downward nozzle. */
  private engineLight!: {
    readonly screen: GameObjects.Rectangle;
    readonly burst: GameObjects.Image;
    readonly nozzles: readonly GameObjects.Image[];
    readonly explosion: GameObjects.Image | undefined;
  };
  private jumpStage: JumpStage | undefined;
  /** The Jump Drive's glow, its trail, the flash as it fires, and the black the Jump ends on. */
  private jumpFx!: {
    readonly glow: GameObjects.Ellipse;
    readonly trail: GameObjects.Rectangle;
    readonly flash: GameObjects.Rectangle;
    readonly veil: GameObjects.Rectangle;
  };

  /** The colour of the dust and smoke puffs on the departure and arrival grounds (none at the Heliopause). */
  private puffColors!: {
    readonly departure: PaletteColor;
    readonly arrival: PaletteColor | undefined;
  };
  /**
   * The departure and arrival landscapes; tests read where the arrival ground sits. A Hop to the
   * Heliopause has no arrival ground: it ends in space.
   */
  layers!: { readonly departure: LandscapeLayers; readonly arrival: LandscapeLayers | undefined };
  private fxScroll: number = FX_SCROLL_FACTOR.departure;
  private stages!: Readonly<
    Record<'departure' | 'arrival' | 'space', readonly GameObjects.Container[]>
  >;
  /** The Spacecraft with its plumes; tests read where it rests. */
  ship!: GameObjects.Container;
  private shipArt!: (frame: ShipFrame) => void;
  /** The glow at each downward nozzle's exit, in the ship's container. */
  private nozzleGlows: readonly GameObjects.Image[] = [];
  /** One plume per nozzle in each pose: down from the standing ship, back along the heading in flight. */
  private plumes!: Readonly<Record<ShipPose, readonly Plume[]>>;
  private shadow!: GameObjects.Ellipse;
  /** The Transfer's departure and target Bodies; tests check the HUD never hides them. */
  fromBody!: GameObjects.Image;
  toBody!: GameObjects.Image;
  private stage: 'departure' | 'arrival' | 'space' | undefined;
  private streaks: {
    readonly line: GameObjects.Rectangle;
    readonly x0: number;
    readonly y0: number;
    readonly speed: number;
  }[] = [];
  /** One-off moments already played (a Crash's hit), so a seek past them plays them once. */
  private played = new Set<string>();
  private lastMoment: FlightMoment | undefined;

  constructor() {
    super(SceneKey.Flight);
  }

  init(data: FlightData): void {
    this.before = data.before;
    this.flight = data.flight;
    this.after = data.after;
    this.finished = false;
    this.streaks = [];
    this.played = new Set();
    this.flash = 0;
    this.rumble = 0;
    this.lastMoment = undefined;
    this.stage = undefined;
    this.playbackMs = 0;
    this.jumpStage = undefined;
    this.darkness = 0;
  }

  create(): void {
    this.pace = prefersReducedMotion() ? 'reduced' : 'full';
    this.playback = flightPlayback(this.before.spacecraft, this.flight, this.pace);
    // The simulation has already made the Jump (`after` is in the next Star System): this plays it.
    const reached = this.flight.outcome.kind === 'reached-heliopause';
    this.jump = reached ? jumpPlayback(this.pace) : undefined;
    this.duration = this.playback.duration + (this.jump?.duration ?? 0);

    const { layers: departure, puffColor: departurePuff } = this.buildGround(this.before);
    const { plan } = this.flight;
    // The target's sky as seen from its own surface: where the Spacecraft is about to stand.
    const atTarget =
      plan.destination === 'body'
        ? this.buildGround({ ...this.before, status: { kind: 'landed', bodyId: plan.toId } })
        : undefined;
    const arrival = atTarget?.layers;
    this.layers = { departure, arrival };
    this.puffColors = { departure: departurePuff, arrival: atTarget?.puffColor };
    const space = this.buildSpace();
    this.shadow = this.add.ellipse(
      SHIP_PLACEMENT.x,
      SHIP_PLACEMENT.baseY + SHIP_SHADOW.dy,
      shadowWidth(this.before.spacecraft.chassisId),
      SHIP_SHADOW.height,
      paletteNumber('void'),
      0.45,
    );
    this.groundGlow = this.add
      .image(SHIP_PLACEMENT.x, SHIP_PLACEMENT.baseY, glowTexture(this))
      .setDisplaySize(GROUND_GLOW.width, GROUND_GLOW.height)
      .setTint(paletteNumber('am3'))
      .setBlendMode(BlendModes.ADD)
      .setVisible(false);
    this.stages = {
      departure: [...Object.values(departure)],
      arrival: arrival ? [...Object.values(arrival)] : [],
      space: [space],
    };
    this.fx = this.pace === 'full' ? createFlightEffects(this) : undefined;
    this.jumpFx = this.buildJumpFx();
    this.buildShip();
    this.engineLight = this.buildEngineLight();
    // Over everything the scene draws: the engine's flash, the Jump's flash and the black it ends on.
    this.engineLight.screen.setDepth(1);
    this.jumpFx.flash.setDepth(1);
    this.jumpFx.veil.setDepth(2);

    this.clock = this.tweens.addCounter({
      from: 0,
      to: this.duration,
      duration: this.duration,
      ease: 'Linear',
      onUpdate: (tween) => {
        this.render(tween.getValue() ?? 0);
      },
      onComplete: () => {
        // The last update already finished the Hop; posing again would undo where a failure left the ship.
        if (!this.finished) this.render(this.duration);
      },
    });

    onLeaveRun(this);
    // Fast-forward only scales the clock (and the particles keep up): the outcome is settled already.
    const offSpeed = EventBus.on('hop-fast-forward-requested', (fast) => {
      this.setSpeed(fast ? FAST_FORWARD : 1);
    });
    const stop = (): void => {
      offSpeed();
      this.clock.remove();
      this.events.off(Scenes.Events.SHUTDOWN, stop);
      this.events.off(Scenes.Events.DESTROY, stop);
    };
    this.events.once(Scenes.Events.SHUTDOWN, stop);
    this.events.once(Scenes.Events.DESTROY, stop);

    EventBus.emit('hop-flight-started', this.before, this.flight, this.pace);
    this.render(0);
    EventBus.emit('scene-ready', SceneKey.Flight);
  }

  /** Test seam: holds the playback `ms` after Launch. Seeking to the end hands off as playback would. */
  seek(ms: number): void {
    this.clock.pause();
    this.render(ms);
  }

  private setSpeed(speed: number): void {
    this.clock.timeScale = speed;
    this.fx?.setSpeed(speed);
  }

  private render(ms: number): void {
    this.playbackMs = ms;
    if (this.jump && ms > this.playback.duration) {
      this.renderJump(this.jump, ms - this.playback.duration);
      return;
    }
    this.showJump(undefined, 0, 0);
    this.light(undefined);
    const moment = this.playback.at(ms);
    // Poses freeze where the engine cut out; what follows is the aftermath of a failed Burn.
    const stopped = Math.min(ms, this.playback.stopsAt);
    const pose = this.playback.at(stopped);
    const aftermath = Math.max(0, ms - this.playback.stopsAt);
    this.flicker(ms);
    this.showStage(moment.burn);
    switch (moment.burn) {
      case 'takeoff':
        this.takeoff(pose.progress, this.firing(ms, moment.thrusting), aftermath, ms);
        break;
      case 'transfer':
        this.transfer(pose.progress, moment.thrusting, stopped + aftermath * 0.15);
        break;
      case 'landing':
        this.landing(pose.progress, this.firing(ms, moment.thrusting), aftermath, ms);
        break;
    }
    this.report(moment);
    // A Hop that reached the Heliopause goes on into the Jump: that ends the playback instead.
    if (moment.ended && !this.jump) this.finish();
  }

  /**
   * The Jump, `ms` after the Hop's playback ended: the end of the Transfer holds, the Heliopause
   * ahead, while the Jump Drive charges round the Spacecraft and fires it away along its heading
   * with a flash; then the screen goes dark behind the flavour text. Under reduced motion it is only
   * the fade.
   */
  private renderJump(playback: JumpPlayback, ms: number): void {
    const moment = playback.at(ms);
    if (moment.stage !== this.jumpStage) {
      this.jumpStage = moment.stage;
      EventBus.emit('jump-stage', moment.stage);
    }
    this.showStage('transfer');
    this.transfer(1, false, this.playback.duration + ms * 0.15);
    const rest = { x: this.ship.x, y: this.ship.y };
    const hull = this.hullCentre(rest);
    switch (moment.stage) {
      case 'charge':
        this.showJump(hull, smooth(moment.progress), 0);
        break;
      case 'fire': {
        const flung = JUMP_THROW * moment.progress ** 2;
        const dx = Math.round(HEADING.x * flung);
        const dy = Math.round(HEADING.y * flung);
        this.ship.setPosition(rest.x + dx, rest.y + dy);
        this.thrust(0, true);
        this.fx?.exhaust(true, this.flightNozzles(rest.x + dx, rest.y + dy, 0));
        this.showJump(hull, 1 - moment.progress, 0, { x: hull.x + dx, y: hull.y + dy });
        this.jumpFx.flash.setAlpha(JUMP_FLASH_ALPHA * clamp01(1 - moment.progress / 0.5));
        break;
      }
      case 'dark':
        // Gone through the Heliopause; under reduced motion it never moved, and the black covers it.
        if (this.pace === 'full') this.ship.setPosition(rest.x + HEADING.x * JUMP_THROW, rest.y);
        this.showJump(undefined, 0, moment.darkness);
        break;
    }
    if (moment.ended) this.finish();
  }

  /**
   * The middle of the flying Spacecraft whose base is at `at`: halfway along its heading from the
   * engine's nozzles to the nose. Where the Jump Drive's glow builds and its trail starts.
   */
  private hullCentre(at: Point): Point {
    const { chassisId } = this.before.spacecraft;
    const exits = spacecraftNozzles(chassisId, 'flight').map(({ exit }) => exit);
    const rear = {
      x: exits.reduce((sum, exit) => sum + exit.x, 0) / exits.length,
      y: exits.reduce((sum, exit) => sum + exit.y, 0) / exits.length,
    };
    const { width, pivot } = frameGeometry(chassisId, 'flight');
    const along = (width - pivot.x - rear.x) / 2 / HEADING.x;
    return { x: at.x + rear.x + HEADING.x * along, y: at.y + rear.y + HEADING.y * along };
  }

  /**
   * Poses the Jump's effects: the glow round the Spacecraft's hull at `at`, built up to `charge`
   * (0 to 1), the trail from `at` to where the firing has `flung` it, and the black at `darkness`.
   */
  private showJump(at: Point | undefined, charge: number, darkness: number, flung?: Point): void {
    const { glow, trail, flash, veil } = this.jumpFx;
    this.darkness = darkness;
    veil.setAlpha(darkness).setVisible(darkness > 0);
    flash.setAlpha(0);
    glow.setVisible(at !== undefined && charge > 0);
    trail.setVisible(at !== undefined && flung !== undefined);
    if (!at) return;
    // The glow pulses as it builds.
    const pulse = 1 + 0.08 * Math.sin(this.playbackMs / 45);
    const radius = Math.max(1, JUMP_GLOW_RADIUS * charge * pulse);
    glow
      .setPosition(at.x, at.y)
      .setSize(radius * 2, radius * 2)
      .setAlpha(0.2 + 0.4 * charge);
    if (flung) {
      const length = Math.hypot(flung.x - at.x, flung.y - at.y);
      trail
        .setPosition(at.x, at.y)
        .setSize(Math.max(1, length), 3)
        .setRotation(Math.atan2(HEADING.y, HEADING.x));
    }
  }

  /**
   * The Takeoff, `progress` through its shot (see `takeoffShot`): straight up from the Landed spot,
   * upright and standing. A Spacecraft that ran dry `aftermath` ms ago sputtered out and sags.
   */
  private takeoff(progress: number, firing: boolean, aftermath: number, ms: number): void {
    const shot = takeoffShot(progress);
    this.vertical(aftermath > 0 ? deadEngine(shot, aftermath, false) : shot, firing, ms);
  }

  private transfer(progress: number, thrusting: boolean, streakMs: number): void {
    this.cameras.main.setScroll(0, 0);
    // The Spacecraft climbs diagonally to the upper right, bobbing a little as it goes. It starts
    // where the vertical climb left the frame and the camera catches up, so the cut reads as one movement.
    const settle = smooth(progress / TRANSFER_SETTLE);
    const lineX = TRANSFER_LINE.x + TRANSFER_LINE.dx * progress;
    const lineY = 214 - 40 * progress + Math.sin(progress * 9) * 2;
    const x = Math.round(TRANSFER_ENTRY.x + (lineX - TRANSFER_ENTRY.x) * settle);
    const y = Math.round(TRANSFER_ENTRY.y + (lineY - TRANSFER_ENTRY.y) * settle);
    this.shipArt('flight');
    this.ship.setPosition(x, y).setAngle(0);
    this.thrust(0, thrusting);
    this.fx?.exhaust(thrusting, this.flightNozzles(x, y, 0));
    // Behind, the departure Body shrinks away toward the left edge; ahead, the target grows. Both
    // stay in the open sky, clear of the HUD (phase strip above, flight log and Fuel below left).
    const recede = smooth(progress);
    const fromDiameter = DEPARTURE.from.size + (DEPARTURE.to.size - DEPARTURE.from.size) * recede;
    const to = { size: 14, to: 120 };
    const toDiameter = to.size + (to.to - to.size) * progress ** 1.6;
    this.fromBody
      .setScale(fromDiameter / this.fromBody.width)
      .setPosition(
        Math.round(DEPARTURE.from.x + (DEPARTURE.to.x - DEPARTURE.from.x) * recede),
        Math.round(DEPARTURE.from.y + (DEPARTURE.to.y - DEPARTURE.from.y) * recede),
      );
    this.toBody
      .setScale(toDiameter / this.toBody.width)
      .setPosition(Math.round(560 - 40 * progress), Math.round(96 + 24 * progress));
    for (const streak of this.streaks) {
      const travelled = (streak.speed * streakMs) / 1000;
      const span = 760;
      const along = (((streak.x0 - travelled) % span) + span) % span;
      streak.line.setPosition(
        Math.round(along - 60),
        Math.round(streak.y0 - (along - streak.x0) * Math.tan(STREAK_ANGLE)),
      );
    }
  }

  /**
   * The Landing, `progress` through its shot (see `landingShot`): straight down onto the Landed spot,
   * ending on exactly the Landed view's composition. Out of Δv before touchdown (`aftermath` ms ago),
   * it drops the rest of the way, hits hard and tips over.
   */
  private landing(progress: number, firing: boolean, aftermath: number, ms: number): void {
    const shot = landingShot(progress);
    if (aftermath <= 0) {
      this.vertical(shot, firing, ms);
      return;
    }
    const crash = deadEngine(shot, aftermath, this.flight.outcome.kind === 'crashed');
    this.vertical(crash, false, ms);
    this.ship.setAngle(crash.angle);
    if (crash.hit) this.hit(aftermath - CRASH_FALL_MS);
  }

  /**
   * Poses the upright Spacecraft over its Landed spot, `shot.altitude` above the ground, and the
   * engine's effects as `shot` has them: its plumes and glows while `firing`, the dust and smoke, the
   * flash and the rumble. Only the playback clock moves them, so a seek shows a fixed frame and
   * fast-forward shortens the flashes and the rumble with it.
   */
  private vertical(shot: VerticalShot, firing: boolean, ms: number): void {
    const x = SHIP_PLACEMENT.x;
    const y = Math.round(SHIP_PLACEMENT.baseY - shot.altitude);
    this.shipArt('landed');
    this.ship.setPosition(x, y).setAngle(0);
    this.thrust(firing ? shot.plume : 0, false);
    // The camera rides a step behind it, rumbling (never under reduced motion).
    const rumble = this.pace === 'full' ? shot.rumble : 0;
    this.rumble = rumble;
    this.cameras.main.setScroll(
      Math.round(rumble * wobble(ms, 23, 9.7)),
      Math.round(-shot.camera + rumble * wobble(ms + 400, 19, 7.9)),
    );
    this.light(shot, firing);
    this.shadow.setAlpha(0.45 * (1 - Math.min(shot.altitude / 80, 1)));
    // After the camera has moved: the puffs are anchored from its scroll.
    const { scrollX, scrollY } = this.cameras.main;
    this.fx?.ground(
      firing && shot.blast,
      anchorFx({ x, y: SHIP_PLACEMENT.baseY }, { x: scrollX, y: scrollY }, this.fxScroll),
    );
    this.fx?.downExhaust(firing, shot.column, this.standingNozzles(x, y));
  }

  /**
   * Whether the engine is firing `ms` after Launch: while the clock says it thrusts, except that a
   * failing engine sputters (flickers out more and more) before it dies, at full motion.
   */
  private firing(ms: number, thrusting: boolean): boolean {
    if (!thrusting) return false;
    const left = this.playback.stopsAt - ms;
    const { kind } = this.flight.outcome;
    const failing = kind === 'crashed' || kind === 'fell-short';
    if (this.pace === 'reduced' || !failing || left > SPUTTER_MS) return true;
    // A fixed pattern from the clock, so a seek always shows the same flicker.
    const tick = Math.floor(ms / 40);
    return ((tick * 37) % 10) / 10 >= 0.25 + 0.6 * (1 - left / SPUTTER_MS);
  }

  /**
   * The engine's light for `shot` (none for `undefined`): the glow on the ground and at the nozzle
   * exits while `firing`, the burst of light and the warm flash over the screen (no flash under
   * reduced motion).
   */
  private light(shot: VerticalShot | undefined, firing = false): void {
    const { screen, burst, nozzles, explosion } = this.engineLight;
    const flash = shot && this.pace === 'full' ? shot.flash : 0;
    this.flash = flash;
    screen.setAlpha(flash).setVisible(flash > 0);
    const size = BURST.size * (0.6 + 2 * flash);
    burst
      .setVisible(flash > 0)
      .setAlpha(Math.min(1, 4 * flash))
      .setDisplaySize(size, size);
    explosion?.setVisible(false);
    const ground = shot?.groundGlow ?? 0;
    this.groundGlow.setVisible(ground > 0).setAlpha(ground);
    const glow = firing && shot ? shot.nozzleGlow : 0;
    for (const image of nozzles) image.setVisible(glow > 0).setAlpha(glow);
  }

  /**
   * A Crash hit the ground `since` ms ago: a heavy burst of dust and smoke and the debris thrown up
   * (once, however the playback got here), a bigger burst of light, and the explosion art playing out
   * when the manifest has it.
   */
  private hit(since: number): void {
    const spot = { x: SHIP_PLACEMENT.x, y: SHIP_PLACEMENT.baseY };
    if (!this.played.has('hit')) {
      this.played.add('hit');
      this.fx?.impact(spot);
      this.scatterDebris();
    }
    const { explosion, burst } = this.engineLight;
    const size = BURST.crash * (0.6 + 2 * this.flash);
    burst.setDisplaySize(size, size);
    if (!explosion) return;
    const frame = Math.floor(since / EXPLOSION.frameMs);
    const playing = this.pace === 'full' && frame < EXPLOSION.frames;
    explosion.setVisible(playing);
    if (playing) explosion.setFrame(`explode_${String(frame)}`);
  }

  /** The standing frame's nozzle exits in the world, for a Spacecraft whose base is at (`x`, `y`). */
  private standingNozzles(x: number, y: number): Point[] {
    return this.plumes.standing.map(({ image }) => ({ x: x + image.x, y: y + image.y }));
  }

  /** The flight frame's nozzle exits in the world, for a Spacecraft whose base is at (`x`, `y`) and turned `angle` degrees. */
  private flightNozzles(x: number, y: number, angle: number): Point[] {
    return this.plumes.flight.map(({ image }) => {
      const at = turn({ x: image.x, y: image.y }, angle);
      return { x: x + at.x, y: y + at.y };
    });
  }

  /** Fires every downward nozzle of the standing pose `stretch` long (0 is off), and the rearward ones of the flight pose while `rear`. */
  private thrust(stretch: number, rear: boolean): void {
    for (const plume of this.plumes.standing) this.firePlume(plume, stretch > 0, stretch);
    for (const plume of this.plumes.flight) this.firePlume(plume, rear, 1);
  }

  private firePlume({ image, kind, art }: Plume, on: boolean, stretch: number): void {
    const { width, length } = PLUME_SCALE[kind];
    image.setVisible(on);
    if (art) {
      const scale = PLUME_ART[art].scale;
      image.setScale(width * scale.width, length * scale.length * stretch);
    }
    // The stand-in flame points left: its length runs along x.
    else image.setScale(STAND_IN_FLAME_SCALE * length * stretch, STAND_IN_FLAME_SCALE);
  }

  /** The plume flickers through its frames; stepped from the clock so a seek shows a fixed frame. */
  private flicker(ms: number): void {
    const tick = Math.floor(ms / 70);
    // Neighbouring nozzles flicker out of step, so the cluster does not pulse as one flame.
    for (const plumes of [this.plumes.standing, this.plumes.flight]) {
      plumes.forEach(({ image, art }, i) => {
        if (art) image.setFrame(`flicker_${String((tick + i) % PLUME_ART[art].frames)}`);
      });
    }
  }

  private showStage(burn: Burn): void {
    const stage = burn === 'takeoff' ? 'departure' : burn === 'transfer' ? 'space' : 'arrival';
    // A brief fade softens each cut between the ground and space.
    // Reduced motion takes the cut as it is.
    if (this.pace === 'full' && this.stage !== undefined && this.stage !== stage) {
      this.cameras.main.fadeIn(STAGE_FADE_MS);
    }
    if (this.stage !== stage && stage !== 'space') {
      const puff = this.puffColors[stage];
      if (puff !== undefined) this.fx?.setSurface(puff);
      this.fxScroll = FX_SCROLL_FACTOR[stage];
      this.fx?.setScrollFactor(this.fxScroll);
    }
    this.stage = stage;
    for (const [name, objects] of Object.entries(this.stages)) {
      for (const object of objects) object.setVisible(name === stage);
    }
    this.shadow.setVisible(stage !== 'space');
    this.groundGlow.setVisible(false);
    this.fx?.setStage(stage === 'space');
  }

  /** Tells the HUD when something it shows has changed: the Burn, the thrust, the log or a Fuel step. */
  private report(moment: FlightMoment): void {
    const last = this.lastMoment;
    const step = (m: FlightMoment): number =>
      Math.round((m.fuel / this.before.spacecraft.fuelCapacity) * 400);
    if (
      last?.burn === moment.burn &&
      last.thrusting === moment.thrusting &&
      last.logged === moment.logged &&
      last.ended === moment.ended &&
      step(last) === step(moment)
    ) {
      return;
    }
    this.lastMoment = moment;
    EventBus.emit('hop-flight-moment', moment);
  }

  /**
   * Arrived goes on to the Landed view of the target, with the Fuel left and the report beside it.
   * Reaching the Heliopause ends with the Jump, on the Landed view of the next Home Planet. A failure
   * ends the Run: the scene stays on its aftermath (drifting or crashed) behind the report.
   */
  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    // Exhaustive: a new outcome kind must be handled here before it type-checks.
    switch (this.flight.outcome.kind) {
      case 'arrived': {
        const data: LandedData = {
          run: this.after,
          report: { before: this.before, flight: this.flight },
        };
        this.scene.start(SceneKey.Landed, data);
        return;
      }
      case 'reached-heliopause': {
        // The Jump has played: on to the Landed view of the next Home Planet, up out of the black.
        const data: LandedData = { run: this.after, afterJump: true };
        this.scene.start(SceneKey.Landed, data);
        return;
      }
      case 'crashed':
        // The hit already threw up the debris (see `hit`).
        EventBus.emit('hop-failed', this.flight, this.after);
        return;
      case 'fell-short':
        this.drift();
        EventBus.emit('hop-failed', this.flight, this.after);
        return;
      default: {
        // A new outcome kind must be handled above: this stops type-checking until it is.
        const unhandled: never = this.flight.outcome;
        throw new Error(`Unhandled Hop outcome ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /** A crash: a handful of small pieces thrown up from the wreck, falling back around it. Still under reduced motion. */
  private scatterDebris(): void {
    const rng = createRng(this.before.seed ^ 0xdeb5);
    const originX = SHIP_PLACEMENT.x;
    const originY = SHIP_PLACEMENT.baseY - 10;
    const colours = ['wh1', 'gm4', 'am2', 'rd3'] as const;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const size = rng.int(2, 4);
      // The generated scrap chunks (`fx_debris`, frames `chunk_0`..`chunk_5`) once the manifest has them.
      const piece = hasAsset('fx_debris')
        ? this.add
            .image(originX, originY, 'fx_debris', `chunk_${String(i % DEBRIS_CHUNKS)}`)
            .setAngle(rng.int(0, 3) * 90)
        : this.add.rectangle(
            originX,
            originY,
            size,
            size,
            paletteNumber(colours[i % colours.length] ?? 'wh1'),
          );
      const landX = Math.round(originX + rng.int(-70, 70));
      const landY = SHIP_PLACEMENT.baseY + rng.int(-2, 3);
      if (this.pace === 'reduced') {
        piece.setPosition(landX, landY);
        continue;
      }
      const peak = originY - rng.int(24, 60);
      this.tweens.add({
        targets: piece,
        x: landX,
        duration: 620,
        ease: 'Linear',
      });
      this.tweens.add({
        targets: piece,
        y: peak,
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({ targets: piece, y: landY, duration: 360, ease: 'Quad.easeIn' });
        },
      });
    }
  }

  /** Fell Short: the engine is dead and the Spacecraft drifts, turning slowly. Still under reduced motion. */
  private drift(): void {
    if (this.flight.outcome.kind === 'fell-short' && this.flight.outcome.burn === 'transfer') {
      // In deep space, move clear of the report panel.
      if (this.pace === 'reduced') this.ship.setPosition(DRIFT_REST.x, DRIFT_REST.y);
      else
        this.tweens.add({
          targets: this.ship,
          x: DRIFT_REST.x,
          y: DRIFT_REST.y,
          duration: 1400,
          ease: 'Sine.easeOut',
        });
    }
    if (this.pace === 'reduced') return;
    this.tweens.add({
      targets: this.ship,
      angle: { from: -3, to: 5 },
      duration: 2600,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private buildGround(run: Run): { layers: LandscapeLayers; puffColor: PaletteColor } {
    const { layers, puffColor } = buildLandscape(this, run);
    layers.sky.setScrollFactor(SCROLL_FACTOR.sky);
    layers.ground.setScrollFactor(SCROLL_FACTOR.ground);
    return { layers, puffColor };
  }

  /** Deep space, held still on screen: stars, the two Bodies and the speed streaks. */
  private buildSpace(): GameObjects.Container {
    const space = this.add.container(0, 0).setScrollFactor(0);
    space.add(this.add.rectangle(0, 0, 640, 360, paletteNumber('void')).setOrigin(0));
    space.add(addStarfield(this, this.before.seed ^ 0x5fa7, SPACE_STARS));
    const sprite = (run: Run, id: BodyId): GameObjects.Image => {
      const body = findBody(run.starSystem, id);
      if (!body) throw new Error(`No Body ${id}`);
      return this.add.image(0, 0, bodySprite(run, body));
    };
    const { plan } = this.flight;
    this.fromBody = sprite(this.before, plan.fromId);
    this.toBody =
      plan.destination === 'body'
        ? sprite(this.before, plan.toId)
        : this.add.image(0, 0, heliopauseTexture(this));
    space.add([this.fromBody, this.toBody]);
    if (this.pace === 'full') {
      const rng = createRng(this.before.seed ^ 0x57ea);
      for (let i = 0; i < STREAK_COUNT; i++) {
        const length = rng.int(6, 26);
        const line = this.add
          .rectangle(
            0,
            0,
            length,
            1,
            paletteNumber(i % 3 === 0 ? 'cy3' : 'wh1'),
            0.35 + rng.next() * 0.4,
          )
          .setRotation(STREAK_ANGLE + Math.PI);
        this.streaks.push({
          line,
          x0: rng.int(0, 760),
          y0: rng.int(-40, 420),
          speed: 260 + rng.next() * 420,
        });
        space.add(line);
      }
    }
    return space;
  }

  /** The Jump's effects, hidden until it plays. */
  private buildJumpFx(): Flight['jumpFx'] {
    const glow = this.add
      .ellipse(0, 0, 2, 2, paletteNumber('vi3'))
      .setBlendMode(BlendModes.ADD)
      .setVisible(false);
    const trail = this.add
      .rectangle(0, 0, 1, 3, paletteNumber('vi4'), 0.8)
      .setOrigin(0, 0.5)
      .setBlendMode(BlendModes.ADD)
      .setVisible(false);
    const screen = (color: PaletteColor): GameObjects.Rectangle =>
      this.add
        .rectangle(0, 0, SCREEN_WIDTH, 360, paletteNumber(color))
        .setOrigin(0)
        .setScrollFactor(0)
        .setAlpha(0);
    return { glow, trail, flash: screen('vi4'), veil: screen('void').setVisible(false) };
  }

  private buildShip(): void {
    const { chassisId } = this.before.spacecraft;
    const plumes = (pose: ShipPose): Plume[] => {
      const art = plumeArt(pose);
      return spacecraftNozzles(chassisId, pose).map(({ kind, exit }) => ({
        kind,
        art,
        image: art
          ? this.add
              .image(exit.x, exit.y, art, 'flicker_0')
              .setOrigin(0.5, 0)
              .setAngle(PLUME_ANGLE[pose])
          : this.add
              .image(exit.x, exit.y, 'spacecraft_flame')
              .setOrigin(1, 0.5)
              // The stand-in flame points left, the plume art points down.
              .setAngle(PLUME_ANGLE[pose] - 90),
      }));
    };
    this.plumes = { standing: plumes('standing'), flight: plumes('flight') };
    // The downward plumes glow round their edges (WebGL only: without it they are drawn plain).
    for (const { image } of this.plumes.standing) {
      image.enableFilters();
      image.filters?.internal.addGlow(
        paletteNumber(PLUME_GLOW.color),
        PLUME_GLOW.strength,
        0,
        1,
        false,
        PLUME_GLOW.quality,
        PLUME_GLOW.distance,
      );
    }
    // A bright additive glow at each downward nozzle's exit, over the top of its plume.
    const nozzleGlows = this.plumes.standing.map(({ image }) =>
      this.add
        .image(image.x, image.y, glowTexture(this))
        .setDisplaySize(NOZZLE_GLOW, NOZZLE_GLOW)
        .setTint(paletteNumber('am4'))
        .setBlendMode(BlendModes.ADD)
        .setVisible(false),
    );
    this.nozzleGlows = nozzleGlows;
    const ship = addSpacecraftArt(this, chassisId);
    this.shipArt = ship.show;
    this.ship = this.add.container(SHIP_PLACEMENT.x, SHIP_PLACEMENT.baseY, [
      ...this.plumes.standing.map((plume) => plume.image),
      ...this.plumes.flight.map((plume) => plume.image),
      ...ship.objects,
      ...nozzleGlows,
    ]);
  }

  /**
   * The engine's light, hidden until it fires: a warm flash over the whole screen, a burst of light
   * on the ground under the engine (the generated flash art once the manifest has it), and the
   * crash's explosion art when the manifest has it.
   */
  private buildEngineLight(): Flight['engineLight'] {
    const { x, baseY } = SHIP_PLACEMENT;
    const screen = this.add
      .rectangle(0, 0, SCREEN_WIDTH, 360, paletteNumber('am3'))
      .setOrigin(0)
      .setScrollFactor(0)
      .setBlendMode(BlendModes.ADD)
      .setVisible(false);
    const burst = this.add
      .image(x, baseY, flashTexture(this))
      .setTint(paletteNumber('am4'))
      .setBlendMode(BlendModes.ADD)
      .setVisible(false);
    const explosion = hasAsset('fx_explosion')
      ? this.add
          .image(x, baseY - 12, 'fx_explosion', 'explode_0')
          .setScale(EXPLOSION.scale)
          .setVisible(false)
      : undefined;
    return { screen, burst, nozzles: this.nozzleGlows, explosion };
  }
}

/** Size (px) of the Heliopause's art; the stand-in is drawn at the same size. */
const HELIOPAUSE_SIZE = 64;

/**
 * The Heliopause seen ahead on the way out: its art once the manifest has it, until then a stand-in
 * drawn once (a dashed violet ring, as the Nav Chart draws it, round a faint glow).
 */
function heliopauseTexture(scene: Scene): string {
  if (hasAsset(HELIOPAUSE_SPRITE) || scene.textures.exists(HELIOPAUSE_SPRITE)) {
    return HELIOPAUSE_SPRITE;
  }
  const graphics = scene.make.graphics({}, false);
  const centre = HELIOPAUSE_SIZE / 2;
  graphics.fillStyle(paletteNumber('vi0'), 0.6);
  graphics.fillCircle(centre, centre, centre - 6);
  graphics.lineStyle(2, paletteNumber('vi3'));
  const dashes = 16;
  for (let i = 0; i < dashes; i++) {
    const from = (i / dashes) * 2 * Math.PI;
    graphics.beginPath();
    graphics.arc(centre, centre, centre - 2, from, from + Math.PI / dashes);
    graphics.strokePath();
  }
  graphics.generateTexture(HELIOPAUSE_SPRITE, HELIOPAUSE_SIZE, HELIOPAUSE_SIZE);
  graphics.destroy();
  return HELIOPAUSE_SPRITE;
}

/**
 * A steady, uneven shake from the playback clock (-1 to 1): two waves `a` and `b` ms long, so a seek
 * always shows the same offset and fast-forward shakes faster with the clock.
 */
function wobble(ms: number, a: number, b: number): number {
  return 0.6 * Math.sin(ms / a) + 0.4 * Math.sin(ms / b + 1.3);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** Eases in and out: slow to start, slow to stop. */
function smooth(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
