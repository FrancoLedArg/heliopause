// What the player knows of the Star System they are in (#96): which Bodies are Detected or
// Surveyed, and whether the Heliopause is found. Generation still makes the whole Star System from
// the seed; this is what the Spacecraft has learned of it, and it only ever grows.
import { kilometersToAu } from './data.ts';
import { isFuelSource } from './gather.ts';
import type { Run } from './run.ts';
import {
  findBody,
  listBodies,
  type Body,
  type BodyId,
  type LandableBody,
  type StarSystem,
} from './starSystem.ts';

/** What the Spacecraft knows of the Star System it is in. Reset by the Jump, never reverted otherwise. */
export interface Knowledge {
  /** Every Body whose position the player knows, in the order they learned of it, Surveyed ones too. */
  readonly detected: readonly BodyId[];
  /** The Bodies whose type, gravity and resources the player knows; each is also in `detected`. */
  readonly surveyed: readonly BodyId[];
  /** Whether the Heliopause has been found: until then it is no Hop target. */
  readonly heliopauseFound: boolean;
}

/** How much the player knows of one Body: nothing, its position (Detected), or what it is (Surveyed). */
export type BodyKnowledge = 'unknown' | 'detected' | 'surveyed';

export function bodyKnowledge(run: Pick<Run, 'knowledge'>, id: BodyId): BodyKnowledge {
  if (run.knowledge.surveyed.includes(id)) return 'surveyed';
  return run.knowledge.detected.includes(id) ? 'detected' : 'unknown';
}

/** Every Body the player knows of, Detected or Surveyed: each planet followed by its known Moons. */
export function knownBodies(run: Pick<Run, 'knowledge' | 'starSystem'>): Body[] {
  return listBodies(run.starSystem).filter((body) => run.knowledge.detected.includes(body.id));
}

/** What a landing taught the player: the Body it Surveyed, if it was not already, and what Comms Detected. */
export interface Reveal {
  /** The Body landed on, when this landing Surveyed it; `undefined` when it already was. */
  readonly surveyed: BodyId | undefined;
  /** The Bodies Comms Detected after the landing, nearest first; empty when none was left to find. */
  readonly detected: readonly BodyId[];
}

/** Whether `body` is In reach of the landed Run (hop.ts's `isInReach`, passed in to keep the modules apart). */
export type InReach = (run: Run, body: LandableBody) => boolean;

/**
 * What landing on `bodyId` teaches: the Body is Surveyed (only that Body), then Comms Detects the
 * nearest landable Body not yet Detected, measured from the Spacecraft. The Fuel lifeline (#280)
 * comes first: when no Fuel source (an Icy Body with Fuel left) is Detected and In reach, Comms
 * Detects the nearest one that is In reach instead, if there is one. Gas Giants are never Comms'
 * pick. The Run's status is the caller's.
 */
export function revealOnLanding(
  run: Run,
  bodyId: BodyId,
  inReach: InReach,
): { readonly run: Run; readonly reveal: Reveal } {
  const body = findBody(run.starSystem, bodyId);
  if (!body?.landable) throw new Error(`${bodyId} is not a Body the Spacecraft can land on`);
  const known = run.knowledge;
  const wasSurveyed = known.surveyed.includes(body.id);
  const learned: Knowledge = {
    ...known,
    detected: known.detected.includes(body.id) ? known.detected : [...known.detected, body.id],
    surveyed: wasSurveyed ? known.surveyed : [...known.surveyed, body.id],
  };
  const lifeline = (candidate: LandableBody) =>
    candidate.id !== body.id && isFuelSource(run, candidate) && inReach(run, candidate);
  const knowsLifeline = knownBodies({ ...run, knowledge: learned }).some(
    (known) => known.landable && lifeline(known),
  );
  const next =
    (knowsLifeline ? undefined : nearestUndetected(run.starSystem, learned, body, lifeline)) ??
    nearestUndetected(run.starSystem, learned, body);
  const knowledge = next ? { ...learned, detected: [...learned.detected, next.id] } : learned;
  return {
    run: { ...run, knowledge },
    reveal: { surveyed: wasSurveyed ? undefined : body.id, detected: next ? [next.id] : [] },
  };
}

/**
 * The landable Body nearest to `from` that the player has not Detected, among those `accepts` takes;
 * ties go to the first listed.
 */
export function nearestUndetected(
  system: StarSystem,
  knowledge: Knowledge,
  from: Body,
  accepts: (body: LandableBody) => boolean = () => true,
): LandableBody | undefined {
  let nearest: { body: LandableBody; distance: number } | undefined;
  for (const body of listBodies(system)) {
    if (!body.landable || knowledge.detected.includes(body.id) || !accepts(body)) continue;
    const distance = distanceBetween(system, from, body);
    if (!nearest || distance < nearest.distance) nearest = { body, distance };
  }
  return nearest?.body;
}

/** How far apart two Bodies are, in AU, from their fixed places on their orbits. */
export function distanceBetween(system: StarSystem, a: Body, b: Body): number {
  const pa = position(system, a);
  const pb = position(system, b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/** Where a Body is, in AU from the star: a planet on its orbit, a Moon on its orbit round its planet. */
function position(system: StarSystem, body: Body): { readonly x: number; readonly y: number } {
  if (body.kind !== 'moon') {
    return {
      x: body.distanceFromStar * Math.cos(body.orbitAngle),
      y: body.distanceFromStar * Math.sin(body.orbitAngle),
    };
  }
  const planet = findBody(system, body.planetId);
  if (!planet)
    throw new Error(`Moon ${body.id} orbits ${body.planetId}, which is not in the system`);
  const centre = position(system, planet);
  const reach = kilometersToAu(body.distanceFromPlanet);
  return {
    x: centre.x + reach * Math.cos(body.orbitAngle),
    y: centre.y + reach * Math.sin(body.orbitAngle),
  };
}
