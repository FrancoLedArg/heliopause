// Pure view rules for the Landed scene: what the ground looks like and where the sky's Bodies sit.
// No Phaser here, so the scene stays a thin renderer and these rules are tested in Node.
import { stringSeed } from '../lib/stringSeed.ts';
import { createRng } from '../lib/rng.ts';
import { astronomicalUnits, currentBody, kilometersToAu, listBodies } from '../sim/index.ts';
import type {
  AstronomicalUnits,
  Body,
  BodyId,
  LandableBody,
  Moon,
  Planet,
  Run,
} from '../sim/index.ts';

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

/** Native sprite sizes (px) of the `body_*` art, to keep sprites from overlapping. */
export const SPRITE_SIZE = { star: 64, 'rocky-planet': 24, 'gas-giant': 48, moon: 12 } as const;
/** Gap (px) left between a planet and the Moons drawn beside it. */
const MOON_GAP = 2;

/**
 * The far-layer horizon on screen, as the generated art draws it (about 16 px above the painted
 * stand-in's limb): planets are kept above it so they do not sink behind the ground.
 */
export function horizonY(skyX: number): number {
  const t = (skyX - (SKY_WIDTH - SCREEN_WIDTH) / 2 + 80) / 800;
  return 140 + 110 * (1 - Math.min(Math.max(t, 0), 1)) ** 2 - 16;
}
/** Planets stay below the top bar (which ends at y 46) by this much. */
const TOP_BAR_CLEARANCE = 50;

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
    return skyHeight(run, planetOf(run, body)) + rng.int(-MOON_SPREAD, MOON_SPREAD);
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

function halfWidth(kind: SkyBody['kind'], scale: number): number {
  return (SPRITE_SIZE[kind] * scale) / 2;
}

/** Moves a sprite's height to sit below the top bar and above the horizon (the bar wins if both cannot hold). */
function clampToSky(y: number, x: number, kind: SkyBody['kind'], scale: number): number {
  const half = halfWidth(kind, scale);
  return Math.round(Math.max(TOP_BAR_CLEARANCE + half, Math.min(y, horizonY(x) - half - 2)));
}

/** The planet a Moon orbits; a Moon always has one in its Star System. */
function planetOf(run: Run, moon: Moon): Planet {
  const planet = run.starSystem.planets.find((p) => p.id === moon.planetId);
  if (!planet) throw new Error(`Moon ${moon.id} has no planet in its Star System`);
  return planet;
}

/**
 * The star and the nearest Bodies as seen from where the Spacecraft stands, farthest first so
 * nearer ones are drawn in front. The star sits at the middle of the visible sky; every other Body
 * is placed by its bearing from the star's direction, squeezed into the visible band so none starts
 * off-screen. A Moon whose planet is also in the sky hangs beside it instead, clear of its disc.
 * The same Star System always gives the same sky, and a Body looks the same from anywhere.
 */
export function skyBodies(run: Run): SkyBody[] {
  const here = currentBody(run);
  const from = position(run, here);
  const towardStar = Math.atan2(-from.y, -from.x);
  const middle = (SKY_VISIBLE.left + SKY_VISIBLE.right) / 2;
  const halfBand = (SKY_VISIBLE.right - SKY_VISIBLE.left) / 2;
  const place = (bearing: number): number =>
    Math.round(middle + (wrapAngle(bearing - towardStar) / Math.PI) * halfBand);

  const starDistance = astronomicalUnits(Math.hypot(from.x, from.y));
  const star: SkyBody = {
    bodyId: undefined,
    kind: 'star',
    sprite: 'body_star',
    x: place(towardStar),
    y: STAR_Y,
    scale: scaleForDistance(starDistance, true),
    distanceAu: starDistance,
  };

  const nearest = listBodies(run.starSystem)
    .filter((body) => body.id !== here.id)
    .map((body) => {
      const at = position(run, body);
      const distance = astronomicalUnits(Math.hypot(at.x - from.x, at.y - from.y));
      return { body, at, distance };
    })
    .sort((a, b) => a.distance - b.distance || a.body.id.localeCompare(b.body.id))
    .slice(0, MAX_SKY_BODIES);

  const bearing = (at: Point): number => Math.atan2(at.y - from.y, at.x - from.x);
  const inSky = (id: BodyId): boolean => nearest.some((n) => n.body.id === id);

  // Planets, and Moons whose planet is not in the sky, hang where their bearing puts them.
  const placed = new Map<BodyId, SkyBody>();
  for (const { body, at, distance } of nearest) {
    if (body.kind === 'moon' && inSky(body.planetId)) continue;
    const scale = scaleForDistance(distance, false);
    const x = place(bearing(at));
    placed.set(body.id, {
      bodyId: body.id,
      kind: body.kind,
      sprite: bodySprite(run, body),
      x,
      y: clampToSky(skyHeight(run, body), x, body.kind, scale),
      scale,
      distanceAu: distance,
    });
  }

  // Moons whose planet is in the sky hang beside it, on the side of their true bearing.
  const taken = new Map<BodyId, Record<'-1' | '1', number>>();
  for (const { body, at, distance } of nearest) {
    if (body.kind !== 'moon' || !inSky(body.planetId)) continue;
    const planet = placed.get(body.planetId);
    const planetBody = planetOf(run, body);
    if (!planet) throw new Error(`Planet ${planetBody.id} is in the sky but was not placed`);
    const scale = scaleForDistance(distance, false);
    const half = halfWidth('moon', scale);
    const trueDx = place(bearing(at)) - place(bearing(position(run, planetBody)));
    const preferred = trueDx === 0 ? (stringSeed(body.id) % 2 === 0 ? 1 : -1) : Math.sign(trueDx);
    const used = taken.get(planetBody.id) ?? { '-1': 0, '1': 0 };
    const offsetOn = (side: -1 | 1): number =>
      side *
      (halfWidth(planet.kind, planet.scale) +
        half +
        MOON_GAP +
        used[`${side}`] * (2 * half + MOON_GAP));
    const fits = (side: -1 | 1): boolean => {
      const x = planet.x + offsetOn(side);
      return x >= SKY_VISIBLE.left && x <= SKY_VISIBLE.right;
    };
    const side: -1 | 1 = fits(preferred === 1 ? 1 : -1)
      ? preferred === 1
        ? 1
        : -1
      : preferred === 1
        ? -1
        : 1;
    const x = Math.min(Math.max(planet.x + offsetOn(side), SKY_VISIBLE.left), SKY_VISIBLE.right);
    used[`${side}`] += 1;
    taken.set(planetBody.id, used);
    placed.set(body.id, {
      bodyId: body.id,
      kind: 'moon',
      sprite: bodySprite(run, body),
      x,
      y:
        planet.y +
        createRng(run.seed ^ stringSeed(`${body.id}:height`)).int(-MOON_SPREAD, MOON_SPREAD),
      scale,
      distanceAu: distance,
    });
  }

  return [star, ...placed.values()].sort((a, b) => b.distanceAu - a.distanceAu);
}
