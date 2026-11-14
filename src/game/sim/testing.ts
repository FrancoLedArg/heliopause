// Test fixtures for the simulation's own tests. Not part of the module's public interface: the UI
// never imports this file.
import {
  availableDeltaV,
  homePlanet,
  kilograms,
  listBodies,
  planHop,
  type Body,
  type BodyId,
  type HopPlan,
  type Moon,
  type Run,
} from './index.ts';

/** The plan for a Hop that must be valid. */
export function plan(from: Run, targetId: BodyId): HopPlan {
  const result = planHop(from, targetId);
  if (result.kind !== 'planned') throw new Error(`Expected a plan, got ${result.reason}`);
  return result.plan;
}

/** The same Run with the Spacecraft landed on another Body. */
export function landedOn(from: Run, bodyId: BodyId): Run {
  return { ...from, status: { kind: 'landed', bodyId } };
}

/** Figures a fixture may change on a Body, e.g. to match a real planet or a generator extreme. */
export type BodyFigures = Partial<
  Pick<Moon, 'surfaceGravity' | 'escapeVelocity' | 'distanceFromStar' | 'distanceFromPlanet'>
>;

/** The same Run with some Bodies' figures changed, keyed by Body id. */
export function withBodies(from: Run, changes: Readonly<Record<string, BodyFigures>>): Run {
  const patch = <B extends Body>(body: B): B => ({ ...body, ...changes[body.id] });
  const planets = from.starSystem.planets.map((planet) => ({
    ...patch(planet),
    moons: planet.moons.map(patch),
  }));
  return { ...from, starSystem: { ...from.starSystem, planets } };
}

/** The same Run with just enough Fuel for `deltaV`, found by bisection on the Fuel mass. */
export function withDeltaV(from: Run, deltaV: number): Run {
  let low = 0;
  let high = 1e9;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (availableDeltaV({ ...from.spacecraft, fuelMass: kilograms(mid) }) < deltaV) low = mid;
    else high = mid;
  }
  return { ...from, spacecraft: { ...from.spacecraft, fuelMass: kilograms(high) } };
}

/** The Home Planet's nearest Moon. */
export function homeMoon(from: Run): Moon {
  const moon = homePlanet(from.starSystem).moons[0];
  if (!moon) throw new Error('The Home Planet has a Moon');
  return moon;
}

/** Landable Bodies of the Star System, other than the Home Planet and its Moons. */
export function farLandables(from: Run): Body[] {
  const home = homePlanet(from.starSystem);
  return listBodies(from.starSystem).filter(
    (body) => body.landable && body.id !== home.id && !home.moons.some((m) => m.id === body.id),
  );
}
