import { BlendModes, Scene, Scenes, type GameObjects } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';
import { music } from '../audio/music.ts';
import { EventBus } from '../EventBus.ts';
import { prefersReducedMotion } from '../lib/motion.ts';
import { chooseCruiseSpeed } from '../lib/cruiseSpeed.ts';
import { createRng } from '../lib/rng.ts';
import { findBody, listBodies, type BodyId, type HopFlight, type Run } from '../sim/index.ts';
import {
  advancePlayback,
  CRUISE_BOOST_MS,
  FAST_FORWARD,
  flightPlayback,
  systemsLit,
  type FlightMoment,
  type FlightPlayback,
  type Pace,
  type Shot,
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
  type SpacecraftArt,
} from './spacecraftArt.ts';
import type { Rect } from './spacecraftComposition.ts';
import { generateStars } from './starfield.ts';
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

/**
 * The Cruise (presentation tuning, px and ms of Cruise time). The Spacecraft flies big, at `scale`,
 * so each Component is large enough to click (#210), its base resting at `rest`: right of the flight
 * log and below the phase strip, its nose clear of the right edge. It glides in from `entry` over the
 * first moments, then bobs, sways and tilts gently so it is never still.
 */
const CRUISE = {
  scale: 2,
  rest: { x: 378, y: 200 },
  entry: { dx: -90, dy: 70, ms: 2400 },
  bob: { px: 3, ms: 1300 },
  sway: { px: 5, ms: 4100 },
  tilt: { degrees: 1.2, ms: 3700 },
} as const;
/**
 * The star layers of the Cruise, far to near: how many stars, how big, and how fast they drift
 * against the heading (px per s of coasting). The boost drifts them `BOOST_GAIN` times faster again.
 */
const STAR_LAYERS = [
  { count: 110, size: 1, speed: 3 },
  { count: 46, size: 1, speed: 9 },
  { count: 16, size: 2, speed: 24 },
] as const;
const BOOST_GAIN = 3;
/** The target, small and far ahead the whole Cruise: it barely grows (px across), up and right. */
const TARGET_AHEAD = {
  at: { x: 604, y: 70 },
  body: { from: 12, to: 22 },
  heliopause: { from: 18, to: 36 },
} as const;
/**
 * Distant Bodies of the Star System passing far behind the Spacecraft (presentation tuning): the
 * first after `first` ms of Cruise, then one every `every` ms, each taking `crossMs` to cross the
 * screen against the heading through the open sky above the Spacecraft (`y` px), `size` px across.
 */
const PASSING = {
  first: 6000,
  every: 15_000,
  crossMs: 12_000,
  y: { min: 60, max: 110 },
  size: { min: 8, max: 22 },
} as const;
/**
 * The star's light behind the Spacecraft, off the left edge: a soft warm glow that breathes slowly
 * (where, how big across, how bright). Drawn in code; `fx_flare` is the solar flare's art (#210).
 */
const GLINT = { x: -20, y: 150, size: 260, alpha: { min: 0.1, max: 0.2 }, ms: 5200 } as const;
/**
 * The attitude thrusters' puffs (`fx_vent`): one every `every` ms of Cruise, each `frameMs` per
 * frame of its four, from one of the spots (px from the base, standing, turned with the ship).
 */
const VENT = {
  every: 6500,
  frameMs: 80,
  frames: 4,
  spots: [
    { x: 7, y: -96, angle: 90 },
    { x: -7, y: -40, angle: -90 },
  ],
} as const;
/**
 * How far the dust and smoke follow the camera. At Takeoff the camera climbs and the ground drops
 * away fast; at 0.3 the puffs fall away slower, so they stay on screen for the first 1.5 s or more
 * (the strip is gone from view after about 1 s of the 2.8 s climb) and hang in the air as the Spacecraft leaves. At
 * Landing the ground rises into view with them, so they move with it.
 */
const FX_SCROLL_FACTOR = { departure: 0.3, arrival: 1 } as const;
/**
 * The departure Body in the Cruise: large at the left, receding toward the left edge over `ms` of
 * Cruise, then drifting off it. It stays in the open sky between the top bar and phase strip (above y
 * 78 right of x 170) and the flight log (below y 212), so the player sees it shrink the whole way.
 */
const DEPARTURE = {
  from: { x: 96, y: 132, size: 136 },
  to: { x: 34, y: 118, size: 26 },
  ms: 30_000,
  /** After receding, how fast it drifts off the left edge (px per ms). */
  drift: 0.0006,
} as const;
/**
 * The Approach (presentation tuning, px of the 640x360 frame): the target Body big at lower right,
 * its centre at `body.at`, growing from `body.from` to `body.to` px across. The small Spacecraft
 * coasts in from the left (`ship.from`) toward the Body's limb (`ship.to`), shrinking from
 * `scale.from` to `scale.to`, about a third, as it closes in. A faint far starfield drifts behind it
 * (`stars`: how bright, and how fast in px per s).
 */
const APPROACH = {
  body: { at: { x: 502, y: 246 }, from: 220, to: 300 },
  ship: { from: { x: 44, y: 86 }, to: { x: 340, y: 152 } },
  scale: { from: 1.1, to: 0.38 },
  stars: { alpha: 0.55, drift: { x: -7, y: -2 } },
  bob: { degrees: 0.8, px: 1.5, ms: 900 },
} as const;
/**
 * The Approach's Spacecraft points its nose where it is going. The flight frame's nose is turned
 * `FLIGHT_ANGLE` clockwise from straight up; this turns it on toward the Body.
 */
const APPROACH_ANGLE =
  (Math.atan2(
    APPROACH.ship.to.y - APPROACH.ship.from.y,
    APPROACH.ship.to.x - APPROACH.ship.from.x,
  ) *
    180) /
    Math.PI -
  (FLIGHT_ANGLE - 90);
/** How long the fade at a cut between shots lasts (ms). */
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
/** After the boost the streaks fade to this share of their brightness: the coast is calmer. */
const COAST_STREAKS = 0.5;
/** Speed streaks run against the direction of travel: down and to the left. */
const STREAK_ANGLE = Math.atan2(0.42, -1);
/** The direction of travel through space, a unit vector: up and to the right. */
const HEADING = { x: -Math.cos(STREAK_ANGLE), y: -Math.sin(STREAK_ANGLE) } as const;
/** The longest frame the clock steps (ms): a long stall (a hidden tab) never leaps the playback ahead. */
const MAX_FRAME_MS = 250;

/**
 * Hop playback: the camera stays on the Spacecraft through every Burn (a Hop to the Heliopause has
 * no Landing: it ends in space, the Heliopause ahead, and the Jump follows: the Jump Drive charges
 * and fires, the screen goes dark behind the flavour text, and the Landed view of the next Home
 * Planet comes up out of the black). Takeoff rises straight up off the departure Body, upright on
 * its engines, and climbs out through the top edge (see `verticalShots`); the Cruise (the
 * Transfer, see `SHOT_MS`) flies the Spacecraft big at a 3/4 view through drifting stars, the
 * departure Body falling behind and the target small far ahead; the Approach (the end of the
 * Transfer) cuts to the target Body big at lower right, the small Spacecraft coasting toward it and
 * shrinking; Landing comes straight down onto the target, upright, ending on exactly the Landed
 * view's composition. One clock drives everything from the
 * simulation's flight (see `flightPlayback`), so playback can only show the outcome, never change it.
 * The scene's `update` steps it with real frame time, at the fast-forward and test-only Cruise speeds.
 */
export class Flight extends Scene {
  private before!: Run;
  private flight!: HopFlight;
  private after!: Run;
  /** The pacing of this Hop's playback; tests find each Burn's span in it. */
  playback!: FlightPlayback;
  /** Shorter, with no streaks or shake, when the player prefers reduced motion. */
  private pace: Pace = 'full';
  /** Whether the fast-forward is on, and the test-only Cruise speed from the URL (`?cruiseSpeed=`). */
  private fast = false;
  private cruiseSpeed = 1;
  /** A test seek holds the playback where it put it: the clock no longer steps. */
  private held = false;
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
  private stages!: Readonly<Record<Stage, readonly Shown[]>>;
  /** The Spacecraft with its plumes; tests read where it rests. */
  ship!: GameObjects.Container;
  private shipArt!: (frame: ShipFrame) => void;
  /** The drawn Spacecraft's Components: where each sits on screen. */
  private shipParts!: Pick<SpacecraftArt, 'componentBounds' | 'anchor'>;
  /** The glow at each downward nozzle's exit, in the ship's container. */
  private nozzleGlows: readonly GameObjects.Image[] = [];
  /** One plume per nozzle in each pose: down from the standing ship, back along the heading in flight. */
  private plumes!: Readonly<Record<ShipPose, readonly Plume[]>>;
  private shadow!: GameObjects.Ellipse;
  /** The Cruise's departure and target Bodies; tests check the HUD never hides them. */
  fromBody!: GameObjects.Image;
  toBody!: GameObjects.Image;
  /**
   * The Cruise's event layer, drawn between the starfield and the Spacecraft: where timed Cruise
   * events (`playback.events`, in Cruise time) are drawn. Empty for now; Cruise events (#210) and
   * Debris fields (#197) add their pieces here and pose them from the Cruise clock in `cruise`.
   */
  eventLayer!: GameObjects.Container;
  /** The Cruise's star layers, far to near, each drifting at its own pace. */
  private starLayers: GameObjects.TileSprite[] = [];
  /** A distant Body passing far behind the Spacecraft, and the sprites it is drawn from. */
  private passing!: { readonly image: GameObjects.Image; readonly sprites: readonly string[] };
  private glint!: GameObjects.Image;
  /** The Body crossing now: which one in turn, and its size and height on screen. */
  private passer: { readonly index: number; readonly size: number; readonly y: number } | undefined;
  /** The attitude thruster's puff, on the Spacecraft; `undefined` under reduced motion. */
  private vent: GameObjects.Image | undefined;
  private stage: Stage | undefined;
  /** The Approach's target Body, big at lower right; tests check its size. */
  approachBody!: GameObjects.Image;
  /** The Approach's faint far starfield. */
  private approachStars!: GameObjects.TileSprite;
  /** Whether this scene holds the Approach music on (see `holdApproachMusic`). */
  private approachMusic = false;
  private streaks: {
    readonly line: GameObjects.Rectangle;
    readonly x0: number;
    readonly y0: number;
    readonly speed: number;
    readonly alpha: number;
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
    this.held = false;
    this.fast = false;
    this.streaks = [];
    this.starLayers = [];
    this.passer = undefined;
    this.played = new Set();
    this.flash = 0;
    this.rumble = 0;
    this.lastMoment = undefined;
    this.stage = undefined;
    this.playbackMs = 0;
    this.jumpStage = undefined;
    this.darkness = 0;
    this.approachMusic = false;
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
    this.eventLayer = this.add.container(0, 0).setScrollFactor(0);
    const approach = this.buildApproach();
    this.shadow = this.add.ellipse(
      SHIP_PLACEMENT.x,
      SHIP_PLACEMENT.baseY + SHIP_SHADOW.dy,
      shadowWidth(this.before.spacecraft.chassisId, this.before.spacecraft.slots),
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
      space: [space, this.eventLayer],
      approach,
    };
    this.fx = this.pace === 'full' ? createFlightEffects(this) : undefined;
    this.jumpFx = this.buildJumpFx();
    this.buildShip();
    this.engineLight = this.buildEngineLight();
    // Over everything the scene draws: the engine's flash, the Jump's flash and the black it ends on.
    this.engineLight.screen.setDepth(1);
    this.jumpFx.flash.setDepth(1);
    this.jumpFx.veil.setDepth(2);

    this.cruiseSpeed = chooseCruiseSpeed(window.location.search);

    onLeaveRun(this);
    // Fast-forward only scales the clock (and the particles keep up): the outcome is settled already.
    const offSpeed = EventBus.on('hop-fast-forward-requested', (fast) => {
      this.fast = fast;
      this.fx?.setSpeed(fast ? FAST_FORWARD : 1);
    });
    const stop = (): void => {
      offSpeed();
      this.holdApproachMusic(false);
      this.events.off(Scenes.Events.SHUTDOWN, stop);
      this.events.off(Scenes.Events.DESTROY, stop);
    };
    this.events.once(Scenes.Events.SHUTDOWN, stop);
    this.events.once(Scenes.Events.DESTROY, stop);

    EventBus.emit('hop-flight-started', this.before, this.flight, this.pace);
    this.render(0);
    EventBus.emit('scene-ready', SceneKey.Flight);
  }

  /**
   * Steps the playback by the frame's real time: at the fast-forward's speed, and the Cruise at the
   * test-only Cruise speed too, changing speed exactly where the shot changes (`advancePlayback`).
   */
  override update(_time: number, delta: number): void {
    if (this.held || this.finished) return;
    const real = Math.min(delta, MAX_FRAME_MS);
    const speed = this.fast ? FAST_FORWARD : 1;
    const { duration } = this.playback;
    const ms =
      this.playbackMs < duration
        ? advancePlayback(
            this.playback,
            this.playbackMs,
            real,
            (shot) => speed * (shot === 'cruise' ? this.cruiseSpeed : 1),
          )
        : Math.min(this.playbackMs + real * speed, this.duration);
    this.render(ms);
  }

  /** Test seam: holds the playback `ms` after Launch. Seeking to the end hands off as playback would. */
  seek(ms: number): void {
    this.held = true;
    this.render(ms);
  }

  /**
   * Each installed Component's rectangle on the screen, keyed by its Slot: what Cruise events (#210)
   * hit-test a click against. In the Cruise the Spacecraft flies big, so each is large enough to click.
   */
  componentBounds(): ReadonlyMap<number, Rect> {
    const { scrollX, scrollY } = this.cameras.main;
    const out = new Map<number, Rect>();
    for (const [slot, rect] of this.shipParts.componentBounds()) {
      out.set(slot, { ...rect, x: rect.x - scrollX, y: rect.y - scrollY });
    }
    return out;
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
    this.showStage(moment.shot);
    this.holdApproachMusic(moment.shot === 'approach');
    switch (moment.shot) {
      case 'takeoff':
        this.takeoff(pose.shotProgress, this.firing(ms, moment.thrusting), aftermath, ms);
        break;
      case 'cruise':
        this.cruise(ms, this.firing(ms, moment.thrusting));
        break;
      case 'approach':
        this.approach(moment.shotProgress, ms);
        break;
      case 'landing':
        this.landing(pose.shotProgress, this.firing(ms, moment.thrusting), aftermath, ms);
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
    this.showStage('cruise');
    // The end of the Cruise holds, drifting slowly on, while the Jump Drive charges.
    this.cruise(this.playback.duration + ms * 0.15, false);
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
    const { chassisId, slots } = this.before.spacecraft;
    const exits = spacecraftNozzles(chassisId, 'flight', slots).map(({ exit }) => exit);
    const rear = {
      x: exits.reduce((sum, exit) => sum + exit.x, 0) / exits.length,
      y: exits.reduce((sum, exit) => sum + exit.y, 0) / exits.length,
    };
    const { width, pivot } = frameGeometry(chassisId, 'flight');
    const along = (width - pivot.x - rear.x) / 2 / HEADING.x;
    const k = this.ship.scaleX;
    return {
      x: at.x + k * (rear.x + HEADING.x * along),
      y: at.y + k * (rear.y + HEADING.y * along),
    };
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

  /**
   * The Cruise, `ms` after Launch: the Spacecraft flies big in its flight frame, gliding in, then
   * bobbing and swaying; its rearward plumes and sparks fire through the boost (`firing`). Behind it
   * the stars drift at three depths (faster through the boost), streaks fly past, a distant Body
   * passes now and then, the departure Body falls behind and the target waits small far ahead, so
   * the Cruise is never a still image. A Spacecraft whose engine died drifts and slows.
   */
  private cruise(ms: number, firing: boolean): void {
    const window = this.playback.cruise;
    if (!window) throw new Error('The Cruise is drawn only in a Hop that reaches it');
    this.cameras.main.setScroll(0, 0);
    this.rumble = 0;
    // Where the engine left it: a dead engine freezes the headway, though the bob goes on.
    const { stopsAt } = this.playback;
    const flown = Math.min(ms, stopsAt) - window.start;
    const since = Math.max(0, ms - stopsAt);
    const live = ms - window.start;
    const drifting = this.flight.outcome.kind === 'fell-short' ? since : 0;
    const calm = this.pace === 'reduced';
    const entry = calm ? 1 : smooth(flown / CRUISE.entry.ms);
    const wave = (spec: { readonly ms: number }, phase = 0): number =>
      Math.sin((live / spec.ms) * 2 * Math.PI + phase);
    const x =
      CRUISE.rest.x +
      CRUISE.entry.dx * (1 - entry) +
      CRUISE.sway.px * wave(CRUISE.sway) -
      drifting * 0.012;
    const y =
      CRUISE.rest.y +
      CRUISE.entry.dy * (1 - entry) +
      CRUISE.bob.px * wave(CRUISE.bob, 1) +
      drifting * 0.008;
    const angle = CRUISE.tilt.degrees * wave(CRUISE.tilt, 2) + Math.min(drifting * 0.002, 4);
    this.shipArt('flight');
    this.ship.setScale(CRUISE.scale).setPosition(Math.round(x), Math.round(y)).setAngle(angle);
    this.thrust(0, firing);
    this.fx?.exhaust(firing, this.flightNozzles(this.ship.x, this.ship.y, angle));
    this.puff(live);

    // How far the stars have drifted: faster through the boost, slowing to a crawl once the engine died.
    const travel = flown + BOOST_GAIN * Math.min(flown, CRUISE_BOOST_MS) + since * 0.15;
    this.starLayers.forEach((layer, i) => {
      const speed = ((STAR_LAYERS[i]?.speed ?? 0) * travel) / 1000;
      layer.setTilePosition(HEADING.x * speed, HEADING.y * speed);
    });
    const boosting = flown < CRUISE_BOOST_MS;
    for (const streak of this.streaks) {
      const travelled = (streak.speed * travel) / 4000;
      const span = 760;
      const along = (((streak.x0 - travelled) % span) + span) % span;
      streak.line
        .setPosition(
          Math.round(along - 60),
          Math.round(streak.y0 - (along - streak.x0) * Math.tan(STREAK_ANGLE)),
        )
        .setAlpha(streak.alpha * (boosting ? 1 : COAST_STREAKS));
    }
    this.pass(live);
    this.glint.setAlpha(
      GLINT.alpha.min + (GLINT.alpha.max - GLINT.alpha.min) * (calm ? 0.5 : (1 + wave(GLINT)) / 2),
    );

    // Behind, the departure Body shrinks away toward the left edge, then drifts off it; ahead, the
    // target stays small and far. Both stay in the open sky, clear of the HUD.
    const recede = smooth(live / DEPARTURE.ms);
    const fromDiameter = DEPARTURE.from.size + (DEPARTURE.to.size - DEPARTURE.from.size) * recede;
    const offEdge = Math.max(0, live - DEPARTURE.ms) * DEPARTURE.drift;
    this.fromBody
      .setScale(fromDiameter / this.fromBody.width)
      .setPosition(
        Math.round(DEPARTURE.from.x + (DEPARTURE.to.x - DEPARTURE.from.x) * recede - offEdge),
        Math.round(DEPARTURE.from.y + (DEPARTURE.to.y - DEPARTURE.from.y) * recede),
      );
    const ahead =
      this.flight.plan.destination === 'body' ? TARGET_AHEAD.body : TARGET_AHEAD.heliopause;
    const closing = Math.min(flown / window.length, 1);
    this.toBody
      .setScale((ahead.from + (ahead.to - ahead.from) * closing) / this.toBody.width)
      .setPosition(TARGET_AHEAD.at.x, TARGET_AHEAD.at.y);
  }

  /**
   * The Approach, `progress` through its shot: the target Body big at lower right, slowly growing,
   * while the small Spacecraft coasts in from the left with its engine off, heading for the Body's limb
   * and shrinking to about a third as it closes in. A faint far starfield drifts behind. It plays the
   * same whatever comes next: the Landing (or the Crash) is the playback clock's to tell.
   */
  private approach(progress: number, ms: number): void {
    this.cameras.main.setScroll(0, 0);
    this.rumble = 0;
    const { body, ship, scale, stars, bob } = APPROACH;
    const size = Math.round(body.from + (body.to - body.from) * progress);
    this.approachBody.setDisplaySize(size, size);
    // It slows as it goes: farther away, the same speed crosses fewer pixels.
    const along = 1 - (1 - progress) ** 2;
    const wave = Math.sin((ms / bob.ms) * 2 * Math.PI);
    this.shipArt('flight');
    this.ship
      .setScale(scale.from * (scale.to / scale.from) ** along)
      .setPosition(
        Math.round(ship.from.x + (ship.to.x - ship.from.x) * along),
        Math.round(ship.from.y + (ship.to.y - ship.from.y) * along + bob.px * wave),
      )
      .setAngle(APPROACH_ANGLE + bob.degrees * wave);
    // Coasting: no plume, no puffs.
    this.thrust(0, false);
    this.fx?.exhaust(false, this.flightNozzles(this.ship.x, this.ship.y, this.ship.angle));
    this.vent?.setVisible(false);
    const seconds = ms / 1000;
    this.approachStars.setTilePosition(stars.drift.x * seconds, stars.drift.y * seconds);
  }

  /**
   * Holds the Approach music on while the Approach plays, and lets it go at the Landing or when the
   * scene shuts down (the hand-off, or leaving the Run).
   */
  private holdApproachMusic(on: boolean): void {
    if (on === this.approachMusic) return;
    this.approachMusic = on;
    music.setApproach(on);
  }

  /** The attitude thrusters puff now and then (`live` ms into the Cruise), from alternating spots on the hull. */
  private puff(live: number): void {
    const vent = this.vent;
    if (!vent) return;
    const index = Math.floor(live / VENT.every);
    const frame = Math.floor((live - index * VENT.every) / VENT.frameMs);
    const spot = VENT.spots[index % VENT.spots.length];
    const on = index > 0 && frame < VENT.frames && spot !== undefined;
    vent.setVisible(on);
    if (!on) return;
    const at = turn(spot, FLIGHT_ANGLE);
    vent.setPosition(at.x, at.y).setAngle(FLIGHT_ANGLE + spot.angle);
    if (vent.texture.key === 'fx_vent') vent.setFrame(`spray_${String(frame)}`);
    else vent.setAlpha(1 - frame / VENT.frames);
  }

  /** Now and then a distant Body of the Star System crosses far behind the Spacecraft, against the heading. */
  private pass(live: number): void {
    const { image, sprites } = this.passing;
    const since = live - PASSING.first;
    const index = Math.floor(since / PASSING.every);
    const t = (since - index * PASSING.every) / PASSING.crossMs;
    const sprite = sprites[index % Math.max(1, sprites.length)];
    const on = since >= 0 && t < 1 && sprite !== undefined;
    image.setVisible(on);
    if (!on) return;
    // Each passing Body's size and height are drawn once, when it starts to cross.
    if (this.passer?.index !== index) {
      const rng = createRng(this.before.seed ^ (0xb0d1 + index));
      this.passer = {
        index,
        size: rng.int(PASSING.size.min, PASSING.size.max),
        y: rng.int(PASSING.y.min, PASSING.y.max),
      };
      image.setTexture(sprite);
    }
    const x = 660 - 700 * t;
    image
      .setScale(this.passer.size / image.width)
      .setPosition(Math.round(x), Math.round(this.passer.y + (660 - x) * 0.04))
      .setAlpha(0.75);
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
    this.ship.setScale(1).setPosition(x, y).setAngle(0);
    this.thrust(firing ? shot.plume : 0, false);
    // The camera rides a step behind it, rumbling (never under reduced motion).
    const rumble = this.pace === 'full' ? shot.rumble : 0;
    this.rumble = rumble;
    // Adding 0 turns a -0 (no rumble, camera on the ground) into 0, the Landed view's own scroll.
    this.cameras.main.setScroll(
      Math.round(rumble * wobble(ms, 23, 9.7)) + 0,
      Math.round(rumble * wobble(ms + 400, 19, 7.9) - shot.camera) + 0,
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

  /**
   * The flight frame's nozzle exits in the world, for a Spacecraft whose base is at (`x`, `y`), turned
   * `angle` degrees and drawn at its current scale.
   */
  private flightNozzles(x: number, y: number, angle: number): Point[] {
    const k = this.ship.scaleX;
    return this.plumes.flight.map(({ image }) => {
      const at = turn({ x: image.x, y: image.y }, angle);
      return { x: x + k * at.x, y: y + k * at.y };
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

  private showStage(shot: Shot): void {
    const stage = STAGE_OF[shot];
    const ground = stage === 'departure' || stage === 'arrival';
    // A brief fade softens each cut between shots. Reduced motion takes the cut as it is.
    if (this.pace === 'full' && this.stage !== undefined && this.stage !== stage) {
      this.cameras.main.fadeIn(STAGE_FADE_MS);
    }
    if (this.stage !== stage && ground) {
      const puff = this.puffColors[stage];
      if (puff !== undefined) this.fx?.setSurface(puff);
      this.fxScroll = FX_SCROLL_FACTOR[stage];
      this.fx?.setScrollFactor(this.fxScroll);
    }
    this.stage = stage;
    for (const [name, objects] of Object.entries(this.stages)) {
      for (const object of objects) object.setVisible(name === stage);
    }
    this.shadow.setVisible(ground);
    this.groundGlow.setVisible(false);
    this.fx?.setStage(!ground);
  }

  /**
   * Tells the HUD when something it shows has changed: the Burn or shot, the thrust, the log, a Fuel
   * step, a step along the route, or a systems light coming on.
   */
  private report(moment: FlightMoment): void {
    const last = this.lastMoment;
    const step = (m: FlightMoment): number =>
      Math.round((m.fuel / this.before.spacecraft.fuelCapacity) * 400);
    const installed = this.before.spacecraft.slots.filter((slot) => slot !== null).length;
    const lit = (m: FlightMoment): number => systemsLit(m.cruise, installed);
    if (
      last?.burn === moment.burn &&
      last.shot === moment.shot &&
      last.thrusting === moment.thrusting &&
      last.logged === moment.logged &&
      last.ended === moment.ended &&
      step(last) === step(moment) &&
      Math.round(last.route * 100) === Math.round(moment.route * 100) &&
      lit(last) === lit(moment)
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
      // In deep space it drifts away, smaller and smaller, clear of the report panel.
      if (this.pace === 'reduced') this.ship.setPosition(DRIFT_REST.x, DRIFT_REST.y).setScale(1);
      else
        this.tweens.add({
          targets: this.ship,
          x: DRIFT_REST.x,
          y: DRIFT_REST.y,
          scale: 1,
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

  /**
   * Deep space, fixed on screen: the star layers, the sun's glint, a passing Body, the two Bodies of
   * the Hop and the speed streaks. Everything is built once; the Cruise only moves it.
   */
  private buildSpace(): GameObjects.Container {
    const space = this.add.container(0, 0).setScrollFactor(0);
    space.add(this.add.rectangle(0, 0, SCREEN_WIDTH, 360, paletteNumber('void')).setOrigin(0));
    this.starLayers = STAR_LAYERS.map((layer, i) =>
      this.add
        .tileSprite(
          0,
          0,
          SCREEN_WIDTH,
          360,
          starLayerTexture(
            this,
            `cruise_stars_${String(i)}`,
            this.before.seed ^ (0x5fa7 + i),
            layer,
          ),
        )
        .setOrigin(0),
    );
    space.add(this.starLayers);
    this.glint = this.add
      .image(GLINT.x, GLINT.y, glowTexture(this))
      .setDisplaySize(GLINT.size, GLINT.size)
      .setTint(paletteNumber('am3'))
      .setBlendMode(BlendModes.ADD);
    // Any Body of the Star System but the two of this Hop.
    const { plan } = this.flight;
    const sprites = listBodies(this.before.starSystem)
      .filter(
        (body) => body.id !== plan.fromId && (plan.destination !== 'body' || body.id !== plan.toId),
      )
      .map((body) => bodySprite(this.before, body));
    this.passing = {
      image: this.add.image(0, 0, sprites[0] ?? glowTexture(this)).setVisible(false),
      sprites,
    };
    space.add([this.glint, this.passing.image]);
    const sprite = (run: Run, id: BodyId): GameObjects.Image => {
      const body = findBody(run.starSystem, id);
      if (!body) throw new Error(`No Body ${id}`);
      return this.add.image(0, 0, bodySprite(run, body));
    };
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
        const alpha = 0.35 + rng.next() * 0.4;
        const line = this.add
          .rectangle(0, 0, length, 1, paletteNumber(i % 3 === 0 ? 'cy3' : 'wh1'), alpha)
          .setRotation(STREAK_ANGLE + Math.PI);
        this.streaks.push({
          line,
          x0: rng.int(0, 760),
          y0: rng.int(-40, 420),
          speed: 260 + rng.next() * 420,
          alpha,
        });
        space.add(line);
      }
    }
    return space;
  }

  /**
   * The Approach's backdrop, fixed on screen: deep space, a faint far starfield and the target Body,
   * drawn from its own large Approach art (`<sprite>_approach`) when the manifest has it, else its small
   * sprite scaled up (the game draws pixel art nearest-neighbour). A Hop to the Heliopause never shows it.
   */
  private buildApproach(): Shown[] {
    const backdrop = this.add
      .rectangle(0, 0, SCREEN_WIDTH, 360, paletteNumber('void'))
      .setOrigin(0)
      .setScrollFactor(0);
    this.approachStars = this.add
      .tileSprite(
        0,
        0,
        SCREEN_WIDTH,
        360,
        starLayerTexture(this, 'approach_stars', this.before.seed ^ 0xa995, {
          count: 70,
          size: 1,
        }),
      )
      .setOrigin(0)
      .setScrollFactor(0)
      .setAlpha(APPROACH.stars.alpha);
    const { plan } = this.flight;
    const target =
      plan.destination === 'body' ? findBody(this.before.starSystem, plan.toId) : undefined;
    const sprite = target ? bodySprite(this.before, target) : this.toBody.texture.key;
    const large = `${sprite}_approach`;
    this.approachBody = this.add
      .image(APPROACH.body.at.x, APPROACH.body.at.y, hasAsset(large) ? large : sprite)
      .setScrollFactor(0)
      .setDisplaySize(APPROACH.body.from, APPROACH.body.from);
    return [backdrop, this.approachStars, this.approachBody];
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
    const { chassisId, slots } = this.before.spacecraft;
    const plumes = (pose: ShipPose): Plume[] => {
      const art = plumeArt(pose);
      return spacecraftNozzles(chassisId, pose, slots).map(({ kind, exit }) => ({
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
    const ship = addSpacecraftArt(this, chassisId, slots);
    this.shipArt = ship.show;
    this.shipParts = ship;
    // The attitude thrusters' puff (the generated vent spray once the manifest has it). Not under reduced motion.
    this.vent =
      this.pace === 'full'
        ? (hasAsset('fx_vent')
            ? this.add.image(0, 0, 'fx_vent', 'spray_0').setOrigin(0.5, 1)
            : this.add.image(0, 0, glowTexture(this)).setDisplaySize(6, 10).setOrigin(0.5, 1)
          ).setVisible(false)
        : undefined;
    this.ship = this.add.container(SHIP_PLACEMENT.x, SHIP_PLACEMENT.baseY, [
      ...this.plumes.standing.map((plume) => plume.image),
      ...this.plumes.flight.map((plume) => plume.image),
      ...ship.objects,
      ...nozzleGlows,
      ...(this.vent ? [this.vent] : []),
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

/** What a stage of the playback can be: its objects are shown only while it is on screen. */
interface Shown {
  setVisible(visible: boolean): unknown;
}

/** The scenery each shot is played on: the two grounds, the Cruise's space, and the Approach's. */
type Stage = 'departure' | 'arrival' | 'space' | 'approach';
const STAGE_OF: Readonly<Record<Shot, Stage>> = {
  takeoff: 'departure',
  cruise: 'space',
  approach: 'approach',
  landing: 'arrival',
};

/**
 * One star layer (of the Cruise, or the Approach's far starfield) drawn once, as `key`, into a
 * screen-sized texture that tiles seamlessly, so the layer drifts forever by moving its tile position.
 */
function starLayerTexture(
  scene: Scene,
  key: string,
  seed: number,
  layer: { readonly count: number; readonly size: number },
): string {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const graphics = scene.make.graphics({}, false);
  for (const star of generateStars(seed, layer.count, {
    width: SCREEN_WIDTH,
    height: 360,
  })) {
    graphics.fillStyle(paletteNumber(star.color), star.alpha);
    graphics.fillRect(star.x, star.y, layer.size, layer.size);
  }
  graphics.generateTexture(key, SCREEN_WIDTH, 360);
  graphics.destroy();
  return key;
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
