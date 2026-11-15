// The Hop range (#283): how far one Hop can go. Exploration is point to point, planet by planet out
// from the star, so the Heliopause takes many Hops to reach.
import type { HopTarget } from './hop.ts';
import { currentBody, type Run } from './run.ts';
import { findBody, type Body, type StarSystem } from './starSystem.ts';
import { astronomicalUnits, type AstronomicalUnits } from './units.ts';

/**
 * The band of distances from the star one Hop can reach: from the orbit of the next planet in to the
 * orbit of the next planet out. From the innermost planet it reaches in to the star; from the
 * outermost, out to the Heliopause.
 */
export interface HopRange {
  readonly inner: AstronomicalUnits;
  readonly outer: AstronomicalUnits;
}

/**
 * The Hop range from the Body the Spacecraft is on: a Hop can go to the planet it is at or one of
 * the planets on either side, or to any of their Moons, and to the Heliopause only from the outermost
 * planet or its Moons. The Nav Chart draws it as a ring; every rule that weighs a Hop (planning,
 * Stranded, fairness) goes through `isInHopRange`. Throws for a Run that is not on a Body.
 */
export function hopRange(run: Run): HopRange {
  return rangeFrom(run.starSystem, currentBody(run));
}

/** Whether `target`, a Body or the Heliopause, is within the Hop range (see `hopRange`). */
export function isInHopRange(run: Run, target: HopTarget): boolean {
  if (target === 'heliopause') return hopRange(run).outer >= run.starSystem.heliopauseRadius;
  const body = findBody(run.starSystem, target);
  if (!body) throw new Error(`Star System ${run.starSystem.name} has no Body ${target}`);
  return withinHopRange(run.starSystem, currentBody(run), body);
}

/** Whether `to` is within the Hop range of a Spacecraft on `from`. */
export function withinHopRange(system: StarSystem, from: Body, to: Body): boolean {
  const { inner, outer } = rangeFrom(system, from);
  return to.distanceFromStar >= inner && to.distanceFromStar <= outer;
}

function rangeFrom(system: StarSystem, from: Body): HopRange {
  const { planets } = system;
  const band = bandOf(system, from);
  return {
    inner: planets[band - 1]?.distanceFromStar ?? astronomicalUnits(0),
    outer: planets[band + 1]?.distanceFromStar ?? system.heliopauseRadius,
  };
}

/** Which planet, counted out from the star from 0, a Body is or orbits. */
function bandOf(system: StarSystem, body: Body): number {
  const planetId = body.kind === 'moon' ? body.planetId : body.id;
  return system.planets.findIndex((planet) => planet.id === planetId);
}
