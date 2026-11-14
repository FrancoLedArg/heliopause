// Pure view rules for the Landed scene: what the ground looks like and where the sky's Bodies sit.
// No Phaser here, so the scene stays a thin renderer and these rules are tested in Node.
import { stringSeed } from '../lib/stringSeed.ts';
import { createRng } from '../lib/rng.ts';
import { currentBody, kilometersToAu, listBodies } from '../sim/index.ts';
import type { AstronomicalUnits, Body, BodyId, LandableBody, Run } from '../sim/index.ts';

/** Which surface art a Body gets: keys `surface_<kind>` (near), `_mid`, `_far`. */
export type SurfaceKind = 'rocky' | 'moon' | 'icy';

/** Only the surfaces the sim can produce today. Icy arrives with icy Bodies. */
export function surfaceKind(body: LandableBody): SurfaceKind {
  return body.kind === 'moon' ? 'moon' : 'rocky';
}

/** Width of the sky layer: wider than the 640 px screen so it can drift with parallax later. */
export const SKY_WIDTH = 960;
/** The screen width: the sky layer is centred on it. */
const SCREEN_WIDTH = 640;
/** Gameplay tuning: keeps even the biggest sprite (the 2x star, 128 px) fully on the first screen. */
const SKY_MARGIN = 64;
/**
 * Where on the sky layer a Body can sit so it is in view before any drift: the part the 640 px
 * screen shows, less a margin for the sprite's half-width.
 */
export const SKY_VISIBLE = {
  left: (SKY_WIDTH - SCREEN_WIDTH) / 2 + SKY_MARGIN,
  right: (SKY_WIDTH + SCREEN_WIDTH) / 2 - SKY_MARGIN,
} as const;
/** Planets hang between these y values (layer pixels, above the horizon). */
const SKY_TOP = 84;
const SKY_BOTTOM = 140;
/** The star's height: low enough to clear the top bar even at 2x. */
const STAR_Y = 120;
/** A Moon hangs this many pixels either side of its planet's height. */
const MOON_SPREAD = 4;
/** Gameplay tuning: how many Bodies besides the star appear in the sky. */
const MAX_SKY_BODIES = 5;

/** How many art variants each kind of Body has (`body_*` in the manifest). */
const VARIANTS = { 'rocky-planet': 4, 'gas-giant': 3, moon: 4 } as const;
const SPRITE_PREFIX = {
  'rocky-planet': 'body_rocky_',
  'gas-giant': 'body_gas_',
  moon: 'body_moon_',
} as const;

/** One thing in the sky, placed on the sky layer. */
export interface SkyBody {
  /** Absent for the star. */
  readonly bodyId: BodyId | undefined;
  readonly kind: 'star' | Body['kind'];
  /** Texture key of the `body_*` sprite. */
  readonly sprite: string;
  /** Position on the sky layer, in pixels. */
  readonly x: number;
  readonly y: number;
  /** Whole-number nearest-neighbour scale: nearer Bodies are bigger. */
  readonly scale: number;
  /** Distance from the Spacecraft. */
  readonly distanceAu: AstronomicalUnits;
}

/** The `body_*` sprite for a Body: one look per Body, wherever it is seen from (the Nav Chart can reuse it). */
export function bodySprite(run: Run, body: Body): string {
  const variant = createRng(run.seed ^ stringSeed(`${body.id}:sprite`)).int(
    0,
    VARIANTS[body.kind] - 1,
  );
  return `${SPRITE_PREFIX[body.kind]}${variant}`;
}

/** A Body's height in the sky is its own, so a planet's Moons stay beside it. */
function skyHeight(run: Run, body: Body): number {
  const rng = createRng(run.seed ^ stringSeed(`${body.id}:height`));
  if (body.kind === 'moon') {
    const planet = run.starSystem.planets.find((p) => p.id === body.planetId);
    return (planet ? skyHeight(run, planet) : SKY_TOP) + rng.int(-MOON_SPREAD, MOON_SPREAD);
  }
  return rng.int(SKY_TOP, SKY_BOTTOM);
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Position in AU, in the Star System's plane, with the star at the origin. */
function position(run: Run, body: Body): Point {
  const planet =
    body.kind === 'moon' ? run.starSystem.planets.find((p) => p.id === body.planetId) : body;
  if (!planet) throw new Error(`Moon ${body.id} has no planet in its Star System`);
  const base = {
    x: planet.distanceFromStar * Math.cos(planet.orbitAngle),
    y: planet.distanceFromStar * Math.sin(planet.orbitAngle),
  };
  if (body.kind !== 'moon') return base;
  const offset = kilometersToAu(body.distanceFromPlanet);
  return {
    x: base.x + offset * Math.cos(body.orbitAngle),
    y: base.y + offset * Math.sin(body.orbitAngle),
  };
}

function wrapAngle(angle: number): number {
  const turn = 2 * Math.PI;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

/** Gameplay tuning: apparent size steps by distance from the Spacecraft. */
function scaleForDistance(distanceAu: number, isStar: boolean): number {
  if (isStar) return distanceAu < 0.6 ? 2 : 1;
  if (distanceAu < 0.02) return 4;
  if (distanceAu < 1) return 2;
  return 1;
}

/**
 * The star and the nearest Bodies as seen from where the Spacecraft stands, farthest first so
 * nearer ones are drawn in front. The star sits at the middle of the visible sky; every other Body
 * is placed by its bearing from the star's direction, squeezed into the visible band so none starts
 * off-screen. The same Star System always gives the same sky, and a Body looks the same from anywhere.
 */
export function skyBodies(run: Run): SkyBody[] {
  const here = currentBody(run);
  const from = position(run, here);
  const towardStar = Math.atan2(-from.y, -from.x);
  const middle = (SKY_VISIBLE.left + SKY_VISIBLE.right) / 2;
  const halfBand = (SKY_VISIBLE.right - SKY_VISIBLE.left) / 2;
  const place = (bearing: number): number =>
    Math.round(middle + (wrapAngle(bearing - towardStar) / Math.PI) * halfBand);

  const starDistance = Math.hypot(from.x, from.y) as AstronomicalUnits;
  const star: SkyBody = {
    bodyId: undefined,
    kind: 'star',
    sprite: 'body_star',
    x: place(towardStar),
    y: STAR_Y,
    scale: scaleForDistance(starDistance, true),
    distanceAu: starDistance,
  };

  const others = listBodies(run.starSystem)
    .filter((body) => body.id !== here.id)
    .map((body) => {
      const at = position(run, body);
      return { body, at, distance: Math.hypot(at.x - from.x, at.y - from.y) as AstronomicalUnits };
    })
    .sort((a, b) => a.distance - b.distance || a.body.id.localeCompare(b.body.id))
    .slice(0, MAX_SKY_BODIES)
    .map(({ body, at, distance }): SkyBody => ({
      bodyId: body.id,
      kind: body.kind,
      sprite: bodySprite(run, body),
      x: place(Math.atan2(at.y - from.y, at.x - from.x)),
      y: skyHeight(run, body),
      scale: scaleForDistance(distance, false),
      distanceAu: distance,
    }));

  return [star, ...others].sort((a, b) => b.distanceAu - a.distanceAu);
}
