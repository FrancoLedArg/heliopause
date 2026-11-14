// Pure view rules for the Landed scene: what the ground looks like and where the sky's Bodies sit.
// No Phaser here, so the scene stays a thin renderer and these rules are tested in Node.
import { createRng } from '../lib/rng.ts';
import { currentBody, listBodies } from '../sim/index.ts';
import type { Body, BodyId, LandableBody, Run } from '../sim/index.ts';

/** Which surface art a Body gets: keys `surface_<kind>` (near), `_mid`, `_far`. */
export type SurfaceKind = 'rocky' | 'moon' | 'icy';

/** Gameplay tuning: only the surfaces the sim can produce today. Icy arrives with icy Bodies. */
export function surfaceKind(body: LandableBody): SurfaceKind {
  return body.kind === 'moon' ? 'moon' : 'rocky';
}

/** Width of the sky layer: wider than the 640 px screen so it can drift with parallax later. */
export const SKY_WIDTH = 960;
/** The sky Bodies sit between these y values (layer pixels, above the horizon). */
const SKY_TOP = 84;
const SKY_BOTTOM = 140;
/** Gameplay tuning: how many Bodies besides the star appear in the sky. */
const MAX_SKY_BODIES = 5;

const KM_PER_AU = 149_597_870.7;
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
  readonly distanceAu: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function position(run: Run, body: Body): Point {
  const planet =
    body.kind === 'moon' ? run.starSystem.planets.find((p) => p.id === body.planetId) : body;
  if (!planet) throw new Error(`Moon ${body.id} has no planet in its Star System`);
  const base = {
    x: planet.distanceFromStar * Math.cos(planet.orbitAngle),
    y: planet.distanceFromStar * Math.sin(planet.orbitAngle),
  };
  if (body.kind !== 'moon') return base;
  const offset = body.distanceFromPlanet / KM_PER_AU;
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
 * The star and the nearest Bodies as seen from where the Spacecraft stands. The star always sits at
 * the middle of the sky layer; every other Body is placed by its bearing from the star's direction,
 * so the same Star System always gives the same sky. Heights are seeded for variety.
 */
export function skyBodies(run: Run): SkyBody[] {
  const here = currentBody(run);
  const from = position(run, here);
  const towardStar = Math.atan2(-from.y, -from.x);
  const rng = createRng(run.seed ^ 0x51ca7);

  const place = (bearing: number): number =>
    Math.round(SKY_WIDTH / 2 + (wrapAngle(bearing - towardStar) / Math.PI) * (SKY_WIDTH / 2));
  const height = (): number => rng.int(SKY_TOP, SKY_BOTTOM);

  const starDistance = Math.hypot(from.x, from.y);
  const star: SkyBody = {
    bodyId: undefined,
    kind: 'star',
    sprite: 'body_star',
    x: place(towardStar),
    y: height(),
    scale: scaleForDistance(starDistance, true),
    distanceAu: starDistance,
  };

  const nearest = listBodies(run.starSystem)
    .filter((body) => body.id !== here.id)
    .map((body) => {
      const at = position(run, body);
      return { body, at, distance: Math.hypot(at.x - from.x, at.y - from.y) };
    })
    .sort((a, b) => a.distance - b.distance || a.body.id.localeCompare(b.body.id))
    .slice(0, MAX_SKY_BODIES);

  const others = nearest.map(({ body, at, distance }): SkyBody => {
    const variant = rng.int(0, VARIANTS[body.kind] - 1);
    return {
      bodyId: body.id,
      kind: body.kind,
      sprite: `${SPRITE_PREFIX[body.kind]}${variant}`,
      x: place(Math.atan2(at.y - from.y, at.x - from.x)),
      y: height(),
      scale: scaleForDistance(distance, false),
      distanceAu: distance,
    };
  });

  return [star, ...others];
}
