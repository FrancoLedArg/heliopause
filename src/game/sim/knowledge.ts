// What the player knows of the Star System they are in (#96): which Bodies are Detected or
// Surveyed, and whether the Heliopause is found. Generation still makes the whole Star System from
// the seed; this is what the Spacecraft has learned of it, and it only ever grows.
import { kilometersToAu } from './data.ts';
import type { Run } from './run.ts';
import { withinHopRange } from './hopRange.ts';
import { radarReach } from './spacecraft.ts';
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
  /** What the Radar's sweep on landing taught; `undefined` with no Radar aboard. */
  readonly radar: RadarSweep | undefined;
}

/** What one Radar sweep taught the player: only what it did not know before. */
export interface RadarSweep {
  /** The Bodies it Detected that were unknown. */
  readonly detected: readonly BodyId[];
  /** The Bodies a level-2 Radar Surveyed that were not Surveyed. */
  readonly surveyed: readonly BodyId[];
  /** Whether this sweep found the Heliopause. */
  readonly heliopauseFound: boolean;
}

/**
 * The Radar's sweep from the Body the Spacecraft is on, at each landing and when a Radar is installed:
 * every Body within its range of the Spacecraft is Detected, and with a level-2 Radar Surveyed too.
 * The Heliopause is found when the Spacecraft's distance from the star plus the range reaches it:
 * the only way to find it. Nothing is forgotten. `sweep` is `undefined` with no Radar aboard or off
 * a Body, and `run` is then `run` itself.
 */
export function radarSweep(run: Run): {
  readonly run: Run;
  readonly sweep: RadarSweep | undefined;
} {
  const reach = radarReach(run.spacecraft);
  if (!reach || run.status.kind !== 'landed') return { run, sweep: undefined };
  const system = run.starSystem;
  const here = findBody(system, run.status.bodyId);
  if (!here) throw new Error(`Run is landed on ${run.status.bodyId}, which is not in the system`);
  const known = run.knowledge;
  const inRange = listBodies(system).filter(
    (body) => distanceBetween(system, here, body) <= reach.range,
  );
  const detected = inRange.filter((body) => !known.detected.includes(body.id)).map((b) => b.id);
  const surveyed = reach.surveys
    ? inRange.filter((body) => !known.surveyed.includes(body.id)).map((b) => b.id)
    : [];
  const heliopauseFound =
    !known.heliopauseFound && here.distanceFromStar + reach.range >= system.heliopauseRadius;
  const knowledge: Knowledge = {
    detected: [...known.detected, ...detected],
    surveyed: [...known.surveyed, ...surveyed],
    heliopauseFound: known.heliopauseFound || heliopauseFound,
  };
  return { run: { ...run, knowledge }, sweep: { detected, surveyed, heliopauseFound } };
}

/**
 * What landing on `bodyId` teaches: the Body is Surveyed (only that Body), a Radar aboard sweeps
 * (see `radarSweep`), then Comms Detects the nearest landable Body not yet Detected, measured from the
 * Spacecraft. Gas Giants are never Comms' pick. The Run must be landed on `bodyId`.
 */
export function revealOnLanding(
  run: Run,
  bodyId: BodyId,
): { readonly run: Run; readonly reveal: Reveal } {
  const body = findBody(run.starSystem, bodyId);
  if (!body?.landable) throw new Error(`${bodyId} is not a Body the Spacecraft can land on`);
  const known = run.knowledge;
  const wasSurveyed = known.surveyed.includes(body.id);
  const swept = radarSweep({
    ...run,
    knowledge: {
      ...known,
      detected: known.detected.includes(body.id) ? known.detected : [...known.detected, body.id],
      surveyed: wasSurveyed ? known.surveyed : [...known.surveyed, body.id],
    },
  });
  const learned = swept.run.knowledge;
  const next = nearestUndetected(run.starSystem, learned, body);
  const knowledge = next ? { ...learned, detected: [...learned.detected, next.id] } : learned;
  return {
    run: { ...swept.run, knowledge },
    reveal: {
      surveyed: wasSurveyed ? undefined : body.id,
      detected: next ? [next.id] : [],
      radar: swept.sweep,
    },
  };
}

/**
 * The landable Body nearest to `from` that the player has not Detected, within the Hop range when
 * any is left there (#283), so Comms always points at a Hop the Spacecraft can make; ties go to the
 * first listed.
 */
export function nearestUndetected(
  system: StarSystem,
  knowledge: Knowledge,
  from: Body,
): LandableBody | undefined {
  const undetected = listBodies(system).filter(
    (body): body is LandableBody => body.landable && !knowledge.detected.includes(body.id),
  );
  const inRange = undetected.filter((body) => withinHopRange(system, from, body));
  let nearest: { body: LandableBody; distance: number } | undefined;
  for (const body of inRange.length > 0 ? inRange : undetected) {
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
