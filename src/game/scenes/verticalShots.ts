// The Takeoff and Landing shots of a Hop's playback, as numbers: how high the upright Spacecraft is,
// where the camera is, and how strongly each engine effect shows at a moment of the shot. Pure, so a
// seek shows the same frame every time and fast-forward (which only speeds the clock) shortens the
// flashes and rumble with it. The Flight scene draws them; nothing here knows about Phaser.
import { TOUCHDOWN } from './flightPlayback.ts';

/** What the Takeoff or Landing shows at one moment. Heights are px above the ground's top edge. */
export interface VerticalShot {
  /** How high the Spacecraft's base is. */
  readonly altitude: number;
  /** How high the camera has climbed: it follows a step behind, so the ground falls away below. */
  readonly camera: number;
  /** How long the plumes are, as a share of their full length (0 while the engine is off). */
  readonly plume: number;
  /** How bright the glow at the nozzle exits is, 0 to 1: brightest as the engine lights. */
  readonly nozzleGlow: number;
  /** How bright the glow on the ground under the engine is, 0 to 1. */
  readonly groundGlow: number;
  /** The warm flash over the screen, as an alpha. */
  readonly flash: number;
  /** How hard the camera rumbles: the most it is thrown off, in px. */
  readonly rumble: number;
  /** Whether the exhaust blasts dust and smoke sideways along the ground. */
  readonly blast: boolean;
  /** Whether the climb leaves a column of smoke behind it. */
  readonly column: boolean;
}

/** The share of the Takeoff the engine spends lighting and building up on the ground before liftoff. */
export const LIFTOFF = 0.18;
/** When the engine lights, as a share of the Takeoff. */
const IGNITION = 0.03;
/** How high the climb has carried the Spacecraft by the end of the Takeoff (px). */
const CLIMB_HEIGHT = 900;
/** The camera follows the Spacecraft at this share of its climb, so it visibly rises yet stays on screen. */
export const FOLLOW = 0.82;
/** The share of the climb after which the camera lets the Spacecraft go, out through the top edge. */
const LET_GO = 0.75;
/** The ground glow and the blast only reach this high (px). */
const GLOW_REACH = 170;
const BLAST_REACH = 120;
/** The rumble dies away once the Spacecraft is this high (px). */
const RUMBLE_REACH = 260;
/** The plumes grow this much longer by the top of the climb. */
const PLUME_STRETCH = 0.6;

/**
 * The flashes and kicks of the rumble: how strong at their start, and over what share of the shot
 * they die away (presentation tuning, all in shares of the 3.8 s shot, so they scale with the pace).
 */
const IGNITION_FLASH = { alpha: 0.22, over: 0.07 } as const;
const TOUCHDOWN_FLASH = { alpha: 0.12, over: 0.05 } as const;
const LIFTOFF_KICK = { px: 4, over: 0.09 } as const;
const TOUCHDOWN_KICK = { px: 3, over: 0.07 } as const;
/** The low rumble while the engine builds on the ground, and once airborne near it (px). */
const BUILD_RUMBLE = { from: 0.6, to: 1.6 } as const;

/** A Crash: how long the fall takes, then the hit (ms of the aftermath; real time, like the fall). */
export const CRASH_FALL_MS = 420;
const CRASH_FLASH = { alpha: 0.4, ms: 320 } as const;
const CRASH_KICK = { px: 7, ms: 520 } as const;
/** How far the wreck tips over after the hit (°), and how long that takes (ms). */
const CRASH_TIP = { degrees: 22, ms: 260 } as const;
/** How fast a dead engine's glow fades, and how far (px per ms, up to a limit) a Spacecraft that ran dry sags. */
const DEAD_GLOW_MS = 300;
const SAG = { perMs: 0.02, max: 24 } as const;

const NOTHING: Omit<VerticalShot, 'altitude' | 'camera'> = {
  plume: 0,
  nozzleGlow: 0,
  groundGlow: 0,
  flash: 0,
  rumble: 0,
  blast: false,
  column: false,
};

/** How high the Spacecraft is, `climb` (0 to 1) of the way up: it eases off the ground, then accelerates. */
function heightAt(climb: number): number {
  return CLIMB_HEIGHT * clamp01(climb) ** 2;
}

/**
 * How high the camera is, `climb` of the way up: a step behind the Spacecraft, then over the last
 * quarter it slows to a stop (no jolt), letting the Spacecraft leave through the top edge.
 */
function cameraAt(climb: number): number {
  const t = clamp01(climb);
  if (t <= LET_GO) return FOLLOW * heightAt(t);
  const v = (t - LET_GO) / (1 - LET_GO);
  return FOLLOW * heightAt(LET_GO + (1 - LET_GO) * (v - (v * v) / 2));
}

/** A kick that starts at `strength` and dies away (quadratically) over `over`, `since` after it started. */
function decay(strength: number, since: number, over: number): number {
  if (since < 0 || since >= over) return 0;
  return strength * (1 - since / over) ** 2;
}

/** The low rumble and the ground glow and blast of an engine firing `altitude` px above the ground. */
function nearGround(altitude: number): Pick<VerticalShot, 'groundGlow' | 'blast'> & {
  readonly rumble: number;
} {
  return {
    groundGlow: 1 - clamp01(altitude / GLOW_REACH),
    blast: altitude < BLAST_REACH,
    rumble: BUILD_RUMBLE.to * (1 - clamp01(altitude / RUMBLE_REACH)),
  };
}

/**
 * The Takeoff, `progress` (0 to 1) through its shot. The engine lights with a flash and builds on the
 * ground, the camera rumbling; at liftoff a kick, then the Spacecraft rises straight up, slowly at
 * first and faster and faster, its plumes lengthening, until it climbs out through the top edge.
 */
export function takeoffShot(progress: number): VerticalShot {
  const climb = (progress - LIFTOFF) / (1 - LIFTOFF);
  const altitude = heightAt(climb);
  const camera = cameraAt(climb);
  if (progress < IGNITION) return { ...NOTHING, altitude, camera };
  const spool = smooth((progress - IGNITION) / (LIFTOFF - IGNITION));
  const ground = nearGround(altitude);
  const building = progress < LIFTOFF;
  return {
    altitude,
    camera,
    plume: building ? 0.35 + 0.65 * spool : 1 + PLUME_STRETCH * clamp01(climb),
    nozzleGlow: 0.55 + decay(0.45, progress - IGNITION, IGNITION_FLASH.over * 2),
    groundGlow: ground.groundGlow * (building ? 0.4 + 0.6 * spool : 1),
    flash: decay(IGNITION_FLASH.alpha, progress - IGNITION, IGNITION_FLASH.over),
    rumble:
      (building
        ? BUILD_RUMBLE.from + (BUILD_RUMBLE.to - BUILD_RUMBLE.from) * spool
        : ground.rumble) + decay(LIFTOFF_KICK.px, progress - LIFTOFF, LIFTOFF_KICK.over),
    blast: ground.blast,
    column: !building,
  };
}

/**
 * The Landing, `progress` through its shot: the mirror of the Takeoff. The Spacecraft comes in
 * through the top edge and straight down on its engines, slowing as it nears the ground, the camera
 * catching it and following it down; the ground glows and the blast kicks up as it closes in, and at
 * touchdown (where the engine cuts) a rumble and a soft flash, then the smoke settles round it.
 */
export function landingShot(progress: number): VerticalShot {
  const descent = 1 - progress / TOUCHDOWN;
  const altitude = heightAt(descent);
  const camera = cameraAt(descent);
  const since = progress - TOUCHDOWN;
  if (since >= 0) {
    return {
      ...NOTHING,
      altitude,
      camera,
      flash: decay(TOUCHDOWN_FLASH.alpha, since, TOUCHDOWN_FLASH.over),
      rumble: decay(TOUCHDOWN_KICK.px, since, TOUCHDOWN_KICK.over),
    };
  }
  const ground = nearGround(altitude);
  return {
    altitude,
    camera,
    plume: 1 + PLUME_STRETCH * clamp01(descent),
    nozzleGlow: 0.55,
    groundGlow: ground.groundGlow,
    flash: 0,
    rumble: ground.rumble * 0.6,
    blast: ground.blast,
    column: false,
  };
}

/**
 * After the engine ran dry `aftermath` ms ago, at `shot` (where it cut out). Fell Short: the glow dies
 * and the Spacecraft sags, no lower than the ground. Crashed: it drops the rest of the way, hits
 * hard (a strong flash and kick) and tips over. The angle is how far it has tipped (°).
 */
export function deadEngine(
  shot: VerticalShot,
  aftermath: number,
  crashed: boolean,
): VerticalShot & { readonly angle: number; readonly hit: boolean } {
  const fading = 1 - clamp01(aftermath / DEAD_GLOW_MS);
  const dead = {
    ...shot,
    ...NOTHING,
    groundGlow: shot.groundGlow * fading,
    rumble: shot.rumble * fading,
  };
  if (!crashed) {
    const sag = Math.min(aftermath * SAG.perMs, SAG.max, shot.altitude);
    return { ...dead, altitude: shot.altitude - sag, angle: 0, hit: false };
  }
  const fall = clamp01(aftermath / CRASH_FALL_MS);
  const since = aftermath - CRASH_FALL_MS;
  // The camera follows it down, so the wreck rests on the Landed view's ground line.
  const drop = 1 - fall ** 2;
  return {
    ...dead,
    altitude: shot.altitude * drop,
    camera: shot.camera * drop,
    flash: decay(CRASH_FLASH.alpha, since, CRASH_FLASH.ms),
    rumble: dead.rumble + decay(CRASH_KICK.px, since, CRASH_KICK.ms),
    angle: CRASH_TIP.degrees * smooth(since / CRASH_TIP.ms),
    hit: since >= 0,
  };
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** Eases in and out: slow to start, slow to stop. */
function smooth(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
