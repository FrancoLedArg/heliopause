/** Pure helpers for the living title backdrop: no Phaser, so they run in Node. */

export interface Orbit {
  cx: number;
  cy: number;
  /** Semi-major axis, pixels. */
  rx: number;
  /** Semi-minor axis, pixels: a small value flattens the orbit, seen nearly edge-on. */
  ry: number;
  /** Rotation of the major axis in radians (screen y points down). */
  tilt: number;
}

export interface OrbitPose {
  x: number;
  y: number;
  /** True on the far half of the orbit, where the moon passes behind the planet. */
  behind: boolean;
  /** Slightly larger on the near half, smaller on the far half. */
  scale: number;
}

const PERSPECTIVE = 0.1;

/** Where the moon is at `phase` (radians). The sin of the phase is the depth: negative is far. Pass `out` to reuse one pose every frame. */
export function orbitPose(
  orbit: Orbit,
  phase: number,
  out: OrbitPose = { x: 0, y: 0, behind: false, scale: 1 },
): OrbitPose {
  const lx = orbit.rx * Math.cos(phase);
  const depth = Math.sin(phase);
  const ly = orbit.ry * depth;
  const cos = Math.cos(orbit.tilt);
  const sin = Math.sin(orbit.tilt);
  out.x = orbit.cx + lx * cos - ly * sin;
  out.y = orbit.cy + lx * sin + ly * cos;
  out.behind = depth < 0;
  out.scale = 1 + PERSPECTIVE * depth;
  return out;
}

export const FLYBY_MIN_MS = 20_000;
export const FLYBY_MAX_MS = 40_000;

/** Wait before the next fly-by; `random` returns [0, 1). */
export function nextFlybyDelayMs(random: () => number): number {
  return Math.round(FLYBY_MIN_MS + random() * (FLYBY_MAX_MS - FLYBY_MIN_MS));
}

/** Sky bands clear of the logo, tagline and New Run panel (y 72-230 on the 640x360 screen). */
export const FLYBY_LANES: readonly number[] = [24, 44, 252, 300, 334];

/** The lane for a fly-by; `random` returns [0, 1). */
export function flybyLane(random: () => number): number {
  return FLYBY_LANES[Math.floor(random() * FLYBY_LANES.length)] ?? 24;
}
