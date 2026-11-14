import { Scene, Scenes, type GameObjects, type Tweens } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';
import { EventBus } from '../EventBus.ts';
import { prefersReducedMotion } from '../lib/motion.ts';
import { createRng } from '../lib/rng.ts';
import {
  findBody,
  type BodyId,
  type Burn,
  type ChassisId,
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
import { createFlightEffects, type FlightEffects } from './flightEffects.ts';
import { SceneKey } from './keys.ts';
import type { LandedData } from './Landed.ts';
import { bodySprite, SHIP_PLACEMENT } from './landedView.ts';
import { buildLandscape, type LandscapeLayers } from './landscape.ts';
import { onLeaveRun } from './leaveRun.ts';
import { addSpacecraftArt, type ShipFrame } from './spacecraftArt.ts';
import { addStarfield } from './starfield.ts';

export interface FlightData {
  /** The Run at Launch: the Spacecraft on the departure Body with its Fuel. */
  readonly before: Run;
  /** The Hop as the simulation flew it: the outcome is already settled. */
  readonly flight: HopFlight;
  /** The Run after the Hop: landed on the target, or ended. */
  readonly after: Run;
}

/** Where the plumes leave the hull, from the centre of the Spacecraft's base (Chassis art, 96x64). */
interface Nozzles {
  /** Under the belly: the hover thrust of Takeoff and Landing, firing down. */
  readonly hover: { readonly x: number; readonly y: number };
  /** At the tail of the `flight` frame: the boost and the Transfer, firing back and down-left. */
  readonly rear: { readonly x: number; readonly y: number };
}
const NOZZLES: Readonly<Record<ChassisId, Nozzles>> = {
  scout: { hover: { x: -1, y: -14 }, rear: { x: -24, y: -19 } },
  hauler: { hover: { x: -9, y: -13 }, rear: { x: -38, y: -18 } },
  lancer: { hover: { x: -20, y: -16 }, rear: { x: -36, y: -16 } },
};
const STAND_IN_NOZZLES: Nozzles = { hover: { x: 0, y: -2 }, rear: { x: -18, y: -12 } };
/** The `flight` frame is pitched 24° nose-up, so its rearward plume points 24° below the horizontal, to the left. */
const REAR_PLUME_ANGLE = 66;

/** How the ground parts move as the camera climbs: the sky barely, the near ground fully. */
const SCROLL_FACTOR = { sky: 0.12, far: 0.35, mid: 0.65, near: 1 } as const;
/** The camera follows the Spacecraft at this share of its movement, so it visibly rises yet stays on screen. */
const FOLLOW = 0.82;

/** Takeoff: spool up, rise, tilt, then boost away up-right (shares of the Takeoff's playback). */
const LIFT = { at: 0.1, height: 220 } as const;
const TILT = { from: 0.58, to: 0.7 } as const;
/** How far (px) the boost carries the Spacecraft right and up by the end of the Takeoff. */
const BOOST = { x: 300, y: 210 } as const;
/** Where the boost leaves the Spacecraft on screen: the camera trails it by `1 - FOLLOW`. */
const BOOST_EXIT = {
  x: SHIP_PLACEMENT.x + BOOST.x * (1 - FOLLOW),
  y: SHIP_PLACEMENT.baseY - (LIFT.height + BOOST.y) * (1 - FOLLOW),
} as const;
/**
 * The share of the Transfer over which the camera catches up with the Spacecraft. Long, and onto a
 * line that starts near where the boost left it, so the catch-up reads as a calm drift, not a pan.
 */
const TRANSFER_SETTLE = 0.45;
/** Where the Transfer's line carries the Spacecraft on screen: from `x` at the start, `dx` further by the end. */
const TRANSFER_LINE = { x: 380, dx: 36 } as const;
/** Dust and smoke rise only while the Spacecraft is this close to the ground (px). */
const GROUND_FX_HEIGHT = 120;
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
/** Landing comes down from this high above the ground. */
const DESCENT_HEIGHT = 300;
/** How long a Spacecraft that ran dry while Landing takes to hit the ground (ms). */
const CRASH_FALL_MS = 420;

/** The pieces thrown up by a crash. */
const DEBRIS_COUNT = 14;
/** Where a Spacecraft that Fell Short in the Transfer drifts to, right of the report. */
const DRIFT_REST = { x: 470, y: 160 } as const;

const STREAK_COUNT = 34;
/** Speed streaks run against the direction of travel: down and to the left. */
const STREAK_ANGLE = Math.atan2(0.42, -1);
const SPACE_STARS = 160;

/**
 * Hop playback: the camera stays on the Spacecraft through all three Burns. Takeoff hovers up off the
 * departure Body on downward thrust, tilts and boosts away; the Transfer crosses space at a 3/4 view,
 * the departure Body shrinking and the target growing; Landing hovers down onto the target, flat on its
 * legs, ending on exactly the Landed view's composition. One clock drives everything from the
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
  private nozzles!: Nozzles;
  /** Where the playback is (ms from Launch). */
  playbackMs = 0;

  /** The dust colour of the departure and arrival grounds. */
  private dustColors!: Readonly<Record<'departure' | 'arrival', PaletteColor>>;
  private stages!: Readonly<
    Record<'departure' | 'arrival' | 'space', readonly GameObjects.Container[]>
  >;
  /** The Spacecraft with its plumes; tests read where it rests. */
  ship!: GameObjects.Container;
  private shipArt!: (frame: ShipFrame) => void;
  private hoverPlume!: GameObjects.Image;
  private rearPlume!: GameObjects.Image;
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
  private shaken = new Set<string>();
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
    this.shaken = new Set();
    this.lastMoment = undefined;
    this.stage = undefined;
    this.playbackMs = 0;
  }

  create(): void {
    this.pace = prefersReducedMotion() ? 'reduced' : 'full';
    this.playback = flightPlayback(this.before.spacecraft, this.flight, this.pace);

    const { layers: departure, dustColor: departureDust } = this.buildGround(this.before);
    // The target's sky as seen from its own surface: where the Spacecraft is about to stand.
    const atTarget: Run = {
      ...this.before,
      status: { kind: 'landed', bodyId: this.flight.plan.toId },
    };
    const { layers: arrival, dustColor: arrivalDust } = this.buildGround(atTarget);
    this.dustColors = { departure: departureDust, arrival: arrivalDust };
    const space = this.buildSpace();
    this.shadow = this.add.ellipse(
      SHIP_PLACEMENT.x,
      SHIP_PLACEMENT.baseY + 2,
      72,
      8,
      paletteNumber('void'),
      0.45,
    );
    this.stages = {
      departure: [...Object.values(departure)],
      arrival: [...Object.values(arrival)],
      space: [space],
    };
    this.fx = this.pace === 'full' ? createFlightEffects(this) : undefined;
    this.buildShip();

    this.clock = this.tweens.addCounter({
      from: 0,
      to: this.playback.duration,
      duration: this.playback.duration,
      ease: 'Linear',
      onUpdate: (tween) => {
        this.render(tween.getValue() ?? 0);
      },
      onComplete: () => {
        // The last update already finished the Hop; posing again would undo where a failure left the ship.
        if (!this.finished) this.render(this.playback.duration);
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
    const moment = this.playback.at(ms);
    // Poses freeze where the engine cut out; what follows is the aftermath of a failed Burn.
    const stopped = Math.min(ms, this.playback.stopsAt);
    const pose = this.playback.at(stopped);
    const aftermath = Math.max(0, ms - this.playback.stopsAt);
    this.flicker(ms);
    this.showStage(moment.burn);
    switch (moment.burn) {
      case 'takeoff':
        this.takeoff(pose.progress, moment.thrusting, aftermath);
        break;
      case 'transfer':
        this.transfer(pose.progress, moment.thrusting, stopped + aftermath * 0.15);
        break;
      case 'landing':
        this.landing(pose.progress, moment.thrusting, aftermath);
        break;
    }
    this.report(moment);
    if (moment.ended) this.finish();
  }

  private takeoff(progress: number, thrusting: boolean, aftermath: number): void {
    const base = SHIP_PLACEMENT.baseY;
    const rise = smooth((progress - LIFT.at) / (TILT.from - LIFT.at));
    const tilt = clamp01((progress - TILT.from) / (TILT.to - TILT.from));
    const boost = clamp01((progress - TILT.to) / (1 - TILT.to)) ** 2;
    let x = SHIP_PLACEMENT.x + BOOST.x * boost;
    let y = base - LIFT.height * rise - BOOST.y * boost;
    // Ran dry while climbing: the engine is out and the Spacecraft sags.
    if (aftermath > 0) y += Math.min(aftermath, 1200) * 0.02;
    x = Math.round(x);
    y = Math.round(y);
    const flying = tilt >= 0.5;
    this.shipArt(flying ? 'flight' : 'landed');
    // It tips nose-up on its legs, then swaps to the flight frame (pitched 24°) at the same pitch and
    // settles into it, so the tilt reads as one movement.
    this.ship.setPosition(x, y).setAngle(flying ? 32 * (1 - tilt) : -16 * tilt);
    this.thrust(thrusting && !flying, thrusting && flying, 1 + 0.4 * (rise > 0 ? 1 : 0));
    this.follow(x, y);
    this.shadow.setAlpha(0.45 * (1 - clamp01((base - y) / 80)));
    this.groundFx(thrusting && !flying, x, y);
    this.fx?.exhaust(thrusting && flying, this.rearNozzle(x, y));
    if (progress > LIFT.at && thrusting) this.shake('liftoff', 380, 0.004);
  }

  private transfer(progress: number, thrusting: boolean, streakMs: number): void {
    this.cameras.main.setScroll(0, 0);
    // The Spacecraft climbs diagonally to the upper right, bobbing a little as it goes. It starts
    // where the boost left it on screen and the camera catches up, so the cut reads as one movement.
    const settle = smooth(progress / TRANSFER_SETTLE);
    const lineX = TRANSFER_LINE.x + TRANSFER_LINE.dx * progress;
    const lineY = 214 - 40 * progress + Math.sin(progress * 9) * 2;
    const x = Math.round(BOOST_EXIT.x + (lineX - BOOST_EXIT.x) * settle);
    const y = Math.round(BOOST_EXIT.y + (lineY - BOOST_EXIT.y) * settle);
    this.shipArt('flight');
    this.ship.setPosition(x, y).setAngle(0);
    this.thrust(false, thrusting, 1);
    this.fx?.exhaust(thrusting, this.rearNozzle(x, y));
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

  private landing(progress: number, thrusting: boolean, aftermath: number): void {
    const base = SHIP_PLACEMENT.baseY;
    // Hovers down, slowing as it nears the ground, flat on its legs.
    const height = DESCENT_HEIGHT * (1 - progress) ** 1.7;
    let y = base - height;
    let angle = 0;
    if (aftermath > 0 && this.flight.outcome.kind === 'crashed') {
      // Out of Δv before touchdown: it drops the rest of the way and lands hard, tipped over.
      const fall = clamp01(aftermath / CRASH_FALL_MS);
      y += height * fall ** 2;
      angle = 14 * fall;
      if (fall >= 1) this.shake('impact', 260, 0.012);
    }
    const x = Math.round(SHIP_PLACEMENT.x + 40 * (1 - progress) ** 2);
    y = Math.round(y);
    this.shipArt('landed');
    this.ship.setPosition(x, y).setAngle(angle);
    this.thrust(thrusting, false, 1.4);
    this.groundFx(thrusting, x, y);
    this.follow(SHIP_PLACEMENT.x, y);
    this.shadow.setAlpha(0.45 * (1 - clamp01((base - y) / 80)));
  }

  /** Dust and smoke at the ground while the engine fires near it. */
  private groundFx(thrusting: boolean, x: number, y: number): void {
    this.fx?.ground(thrusting && SHIP_PLACEMENT.baseY - y < GROUND_FX_HEIGHT, {
      x,
      y: SHIP_PLACEMENT.baseY + 2,
    });
  }

  /** The rear nozzle in the world, for a Spacecraft level at (`x`, `y`). */
  private rearNozzle(x: number, y: number): { x: number; y: number } {
    return { x: x + this.nozzles.rear.x, y: y + this.nozzles.rear.y };
  }

  /** The camera rides with the Spacecraft, a step behind, so the ground falls away below it. */
  private follow(x: number, y: number): void {
    this.cameras.main.setScroll(
      Math.round((x - SHIP_PLACEMENT.x) * FOLLOW),
      Math.round((y - SHIP_PLACEMENT.baseY) * FOLLOW),
    );
  }

  private thrust(hover: boolean, rear: boolean, hoverScale: number): void {
    this.hoverPlume.setVisible(hover).setScale(hoverScale);
    this.rearPlume.setVisible(rear);
  }

  /** The plume flickers through its frames; stepped from the clock so a seek shows a fixed frame. */
  private flicker(ms: number): void {
    if (!hasAsset('fx_thruster')) return;
    const frame = `flicker_${String(Math.floor(ms / 70) % 3)}`;
    this.hoverPlume.setFrame(frame);
    this.rearPlume.setFrame(frame);
  }

  private shake(key: string, duration: number, intensity: number): void {
    if (this.pace === 'reduced' || this.shaken.has(key)) return;
    this.shaken.add(key);
    this.cameras.main.shake(duration, intensity);
  }

  private showStage(burn: Burn): void {
    const stage = burn === 'takeoff' ? 'departure' : burn === 'transfer' ? 'space' : 'arrival';
    // A brief fade softens each cut between the ground and space.
    // Reduced motion takes the cut as it is.
    if (this.pace === 'full' && this.stage !== undefined && this.stage !== stage) {
      this.cameras.main.fadeIn(STAGE_FADE_MS);
    }
    if (this.stage !== stage && stage !== 'space') this.fx?.setSurface(this.dustColors[stage]);
    this.stage = stage;
    for (const [name, objects] of Object.entries(this.stages)) {
      for (const object of objects) object.setVisible(name === stage);
    }
    this.shadow.setVisible(stage !== 'space');
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
   * Arrived goes on to the Landed view of the target, with the Fuel left and the report beside it. A
   * failure ends the Run: the scene stays on its aftermath (drifting or crashed) behind the report.
   */
  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.flight.outcome.kind === 'arrived') {
      const data: LandedData = {
        run: this.after,
        report: { before: this.before, flight: this.flight },
      };
      this.scene.start(SceneKey.Landed, data);
    } else {
      if (this.flight.outcome.kind === 'crashed') this.scatterDebris();
      else this.drift();
      EventBus.emit('hop-failed', this.flight);
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
      const piece = this.add.rectangle(
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

  private buildGround(run: Run): { layers: LandscapeLayers; dustColor: PaletteColor } {
    const { layers, dustColor } = buildLandscape(this, run);
    layers.sky.setScrollFactor(SCROLL_FACTOR.sky);
    layers.far.setScrollFactor(SCROLL_FACTOR.far);
    layers.mid.setScrollFactor(SCROLL_FACTOR.mid);
    layers.near.setScrollFactor(SCROLL_FACTOR.near);
    return { layers, dustColor };
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
    this.fromBody = sprite(this.before, this.flight.plan.fromId);
    this.toBody = sprite(this.before, this.flight.plan.toId);
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

  private buildShip(): void {
    const { chassisId } = this.before.spacecraft;
    const art = hasAsset(`chassis_${chassisId}`);
    const nozzles = art ? NOZZLES[chassisId] : STAND_IN_NOZZLES;
    this.nozzles = nozzles;
    const plume = (at: { x: number; y: number }, angle: number): GameObjects.Image =>
      hasAsset('fx_thruster')
        ? this.add.image(at.x, at.y, 'fx_thruster', 'flicker_0').setOrigin(0.5, 0).setAngle(angle)
        : this.add
            .image(at.x, at.y, 'spacecraft_flame')
            .setOrigin(1, 0.5)
            .setScale(2)
            // The stand-in flame points left, the plume art points down.
            .setAngle(angle - 90);
    this.hoverPlume = plume(nozzles.hover, 0);
    this.rearPlume = plume(nozzles.rear, REAR_PLUME_ANGLE);
    const ship = addSpacecraftArt(this, chassisId);
    this.shipArt = ship.show;
    this.ship = this.add.container(SHIP_PLACEMENT.x, SHIP_PLACEMENT.baseY, [
      this.hoverPlume,
      this.rearPlume,
      ...ship.objects,
    ]);
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** Eases in and out: slow to start, slow to stop. */
function smooth(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
